import { describe, expect, it, vi } from 'vitest';

import {
  BoundedTaskPool,
  TaskPoolClosedError,
  TaskQueueCancelledError,
  TaskQueueFullError,
} from '../src/bounded-task-pool.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('BoundedTaskPool', () => {
  it('limits active work and rejects requests beyond the queue bound', async () => {
    const pool = new BoundedTaskPool(1, 1);
    const firstGate = deferred();
    const first = pool.run(() => firstGate.promise);
    const secondTask = vi.fn(() => Promise.resolve('second'));
    const second = pool.run(secondTask);

    await expect(
      pool.run(() => Promise.resolve('third')),
    ).rejects.toBeInstanceOf(TaskQueueFullError);
    expect(secondTask).not.toHaveBeenCalled();

    firstGate.resolve();
    await first;
    await expect(second).resolves.toBe('second');
  });

  it('removes an aborted waiter and frees its queue slot', async () => {
    const pool = new BoundedTaskPool(1, 1);
    const firstGate = deferred();
    const first = pool.run(() => firstGate.promise);
    const controller = new AbortController();
    const cancelled = pool.run(() => Promise.resolve(), controller.signal);
    const cancellation = expect(cancelled).rejects.toBeInstanceOf(
      TaskQueueCancelledError,
    );

    controller.abort();
    await cancellation;

    const replacement = pool.run(() => Promise.resolve('replacement'));
    firstGate.resolve();
    await first;
    await expect(replacement).resolves.toBe('replacement');
  });

  it('rejects queued work when the pool closes', async () => {
    const pool = new BoundedTaskPool(1, 1);
    const firstGate = deferred();
    const first = pool.run(() => firstGate.promise);
    const queued = pool.run(() => Promise.resolve());
    const closed = expect(queued).rejects.toBeInstanceOf(TaskPoolClosedError);

    pool.close();
    await closed;
    firstGate.resolve();
    await first;
  });
});
