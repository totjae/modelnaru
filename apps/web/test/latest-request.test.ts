import { describe, expect, it } from 'vitest';

import { LatestRequest } from '../app/latest-request';

describe('LatestRequest', () => {
  it('aborts the previous request and only accepts the latest lease', () => {
    const requests = new LatestRequest();
    const first = requests.start();
    const second = requests.start();

    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.signal.aborted).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it('invalidates an active request when the owner is disposed', () => {
    const requests = new LatestRequest();
    const active = requests.start();

    requests.cancel();

    expect(active.signal.aborted).toBe(true);
    expect(active.isCurrent()).toBe(false);
  });
});
