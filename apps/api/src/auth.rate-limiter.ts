import { Injectable } from '@nestjs/common';

interface FailureState {
  blockedUntil: number;
  failures: number;
}

@Injectable()
export class AuthRateLimiter {
  private readonly states = new Map<string, FailureState>();

  retryAfterSeconds(key: string, now = Date.now()): number {
    const state = this.states.get(key);
    if (!state || state.blockedUntil <= now) {
      return 0;
    }
    return Math.max(1, Math.ceil((state.blockedUntil - now) / 1_000));
  }

  recordFailure(key: string, now = Date.now()): number {
    const previous = this.states.get(key);
    const failures = (previous?.failures ?? 0) + 1;
    const blockSeconds =
      failures < 5 ? 0 : Math.min(900, 30 * 2 ** Math.min(failures - 5, 5));
    const blockedUntil = now + blockSeconds * 1_000;
    this.states.delete(key);
    this.states.set(key, { blockedUntil, failures });
    this.prune();
    return blockSeconds;
  }

  reset(key: string): void {
    this.states.delete(key);
  }

  private prune(): void {
    while (this.states.size > 1_000) {
      const oldest = this.states.keys().next().value;
      if (!oldest) {
        return;
      }
      this.states.delete(oldest);
    }
  }
}
