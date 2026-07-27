export interface LatestRequestLease {
  isCurrent(): boolean;
  signal: AbortSignal;
}

export class LatestRequest {
  private controller: AbortController | null = null;
  private generation = 0;

  cancel(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  }

  start(): LatestRequestLease {
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    return {
      isCurrent: () =>
        this.generation === generation &&
        this.controller === controller &&
        !controller.signal.aborted,
      signal: controller.signal,
    };
  }
}
