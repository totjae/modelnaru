import { describe, expect, it } from 'vitest';

import { AuthRateLimiter } from '../src/auth.rate-limiter.js';

describe('AuthRateLimiter', () => {
  it('temporarily blocks the fifth failed login and resets on success', () => {
    const limiter = new AuthRateLimiter();
    for (let attempt = 1; attempt < 5; attempt += 1) {
      expect(limiter.recordFailure('key', 1_000)).toBe(0);
    }
    expect(limiter.recordFailure('key', 1_000)).toBe(30);
    expect(limiter.retryAfterSeconds('key', 1_000)).toBe(30);
    expect(limiter.retryAfterSeconds('key', 31_001)).toBe(0);

    limiter.reset('key');
    expect(limiter.retryAfterSeconds('key', 1_000)).toBe(0);
  });

  it('limits successful guest session creations within a fixed window', () => {
    const limiter = new AuthRateLimiter();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(limiter.consumeWindow('guest', 5, 3_600_000, 1_000)).toBe(0);
    }
    expect(limiter.consumeWindow('guest', 5, 3_600_000, 1_000)).toBe(3_600);
    expect(limiter.consumeWindow('guest', 5, 3_600_000, 3_601_000)).toBe(0);
  });
});
