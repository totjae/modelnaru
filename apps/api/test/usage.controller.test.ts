import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { UsageController } from '../src/usage.controller.js';

describe('usage controller', () => {
  const dashboard = vi.fn((period: string) =>
    Promise.resolve({ period, totals: {} }),
  );
  const controller = new UsageController({ dashboard } as never);
  const response = { setHeader: vi.fn() };

  it('uses one day when the period is omitted', async () => {
    await expect(controller.get(undefined, response)).resolves.toMatchObject({
      period: '1d',
    });
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
  });

  it('rejects unsupported periods', () => {
    expect(() => controller.get('24h', response)).toThrow(HttpException);
  });
});
