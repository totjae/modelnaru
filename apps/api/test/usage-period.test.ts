import { describe, expect, it } from 'vitest';

import {
  isUsagePeriod,
  usagePeriodStart,
  usagePeriods,
} from '../src/usage-period.js';

describe('usage periods', () => {
  it('accepts every supported dashboard period', () => {
    expect(Object.keys(usagePeriods)).toEqual([
      '10m',
      '1h',
      '6h',
      '12h',
      '1d',
      '1w',
      '30d',
    ]);
    for (const period of Object.keys(usagePeriods)) {
      expect(isUsagePeriod(period)).toBe(true);
    }
    expect(isUsagePeriod('24h')).toBe(false);
  });

  it('calculates a relative start without calendar rounding', () => {
    const now = Date.UTC(2026, 6, 23, 10, 0, 0);
    expect(usagePeriodStart('10m', now).toISOString()).toBe(
      '2026-07-23T09:50:00.000Z',
    );
    expect(usagePeriodStart('30d', now).toISOString()).toBe(
      '2026-06-23T10:00:00.000Z',
    );
  });
});
