interface TaskWaiter {
  reject(error: Error): void;
  resolve(release: () => void): void;
  signal?: AbortSignal;
  stopListening?: () => void;
}

export class TaskPoolClosedError extends Error {}
export class TaskQueueCancelledError extends Error {}
export class TaskQueueFullError extends Error {}

export class BoundedTaskPool {
  private active = 0;
  private closed = false;
  private readonly waiters: TaskWaiter[] = [];

  constructor(
    private readonly maximumActive: number,
    private readonly maximumQueued: number,
  ) {}

  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire(signal);
    try {
      if (signal?.aborted) throw new TaskQueueCancelledError();
      return await task();
    } finally {
      release();
    }
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.stopListening?.();
      waiter.reject(new TaskPoolClosedError());
    }
  }

  private acquire(signal?: AbortSignal): Promise<() => void> {
    if (this.closed) return Promise.reject(new TaskPoolClosedError());
    if (signal?.aborted) {
      return Promise.reject(new TaskQueueCancelledError());
    }
    if (this.active < this.maximumActive) {
      this.active += 1;
      return Promise.resolve(this.releaseOnce());
    }
    if (this.waiters.length >= this.maximumQueued) {
      return Promise.reject(new TaskQueueFullError());
    }
    return new Promise<() => void>((resolve, reject) => {
      const waiter: TaskWaiter = {
        reject,
        resolve,
        ...(signal ? { signal } : {}),
      };
      const handleAbort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        waiter.stopListening?.();
        reject(new TaskQueueCancelledError());
      };
      if (signal) {
        signal.addEventListener('abort', handleAbort, { once: true });
        waiter.stopListening = () =>
          signal.removeEventListener('abort', handleAbort);
      }
      this.waiters.push(waiter);
    });
  }

  private dispatch(): void {
    while (
      !this.closed &&
      this.active < this.maximumActive &&
      this.waiters.length > 0
    ) {
      const waiter = this.waiters.shift()!;
      waiter.stopListening?.();
      if (waiter.signal?.aborted) {
        waiter.reject(new TaskQueueCancelledError());
        continue;
      }
      this.active += 1;
      waiter.resolve(this.releaseOnce());
    }
  }

  private releaseOnce(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.dispatch();
    };
  }
}
