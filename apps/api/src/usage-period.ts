export const usagePeriods = {
  '10m': 10 * 60 * 1_000,
  '1h': 60 * 60 * 1_000,
  '6h': 6 * 60 * 60 * 1_000,
  '12h': 12 * 60 * 60 * 1_000,
  '1d': 24 * 60 * 60 * 1_000,
  '1w': 7 * 24 * 60 * 60 * 1_000,
  '30d': 30 * 24 * 60 * 60 * 1_000,
} as const;

export type UsagePeriod = keyof typeof usagePeriods;

export function isUsagePeriod(value: unknown): value is UsagePeriod {
  return typeof value === 'string' && value in usagePeriods;
}

export function usagePeriodStart(period: UsagePeriod, now = Date.now()): Date {
  return new Date(now - usagePeriods[period]);
}
