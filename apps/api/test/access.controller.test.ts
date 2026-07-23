import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AdminAccessController } from '../src/access.controller.js';
import type { AccessService } from '../src/access.service.js';
import type { AdminRequest } from '../src/auth.guard.js';
import type { AuthService } from '../src/auth.service.js';

const body = {
  absoluteTimeoutHours: 24,
  accessCode: 'abc123',
  fileUploadEnabled: false,
  globalDailyRequestLimit: 100,
  idleTimeoutMinutes: 60,
  isEnabled: true,
  maximumActiveSessions: 10,
  permissions: [],
  requestTraceEnabled: true,
  resetTimezone: 'Asia/Seoul',
  sessionDailyRequestLimit: 20,
};

function request(): AdminRequest {
  return {
    adminSession: { row: { accountKey: 'admin:admin' } } as never,
    headers: {},
    ip: '203.0.113.10',
  };
}

describe('AdminAccessController', () => {
  it('accepts a six-character guest access code', async () => {
    const access = { updateGuest: vi.fn(() => Promise.resolve({})) };
    const controller = new AdminAccessController(
      access as unknown as AccessService,
      {
        hashIpAddress: vi.fn(() => Buffer.alloc(32)),
      } as unknown as AuthService,
    );

    await expect(
      controller.updateGuest(body, request(), { setHeader: vi.fn() }),
    ).resolves.toEqual({});
    expect(access.updateGuest).toHaveBeenCalledWith(
      expect.objectContaining({ accessCode: 'abc123' }),
      expect.any(Object),
    );
  });

  it('rejects a guest access code shorter than six characters', async () => {
    const access = { updateGuest: vi.fn() };
    const controller = new AdminAccessController(
      access as unknown as AccessService,
      { hashIpAddress: vi.fn() } as unknown as AuthService,
    );

    await expect(
      controller.updateGuest({ ...body, accessCode: '12345' }, request(), {
        setHeader: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(access.updateGuest).not.toHaveBeenCalled();
  });
});
