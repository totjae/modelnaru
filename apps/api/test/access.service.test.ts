import { verify } from '@node-rs/argon2';
import { describe, expect, it, vi } from 'vitest';

import {
  AccessDailyLimitError,
  type AccessRepository,
  type GuestAccessUpdateInput,
} from '../src/access.repository.js';
import { AccessService } from '../src/access.service.js';
import type { ProviderAuditContext } from '../src/providers.repository.js';

const audit = { actorId: 'admin:admin', ipHash: null };

function repository() {
  return {
    adminState: vi.fn(() =>
      Promise.resolve({ guest: {}, models: [], users: [] }),
    ),
    allowedModels: vi.fn(() => Promise.resolve([])),
    reserveDailyRequest: vi.fn(() => Promise.resolve()),
    updateGuestAccess: vi.fn(
      (input: GuestAccessUpdateInput, auditContext: ProviderAuditContext) => {
        void input;
        void auditContext;
        return Promise.resolve();
      },
    ),
    updateUserAccess: vi.fn(() => Promise.resolve()),
  };
}

describe('AccessService', () => {
  it('hashes a guest access code before it reaches persistence', async () => {
    const repo = repository();
    const service = new AccessService(repo as unknown as AccessRepository);

    await service.updateGuest(
      {
        absoluteTimeoutHours: 24,
        accessCode: 'guest-access-code',
        dailyRequestLimit: 20,
        fileUploadEnabled: false,
        globalDailyRequestLimit: 100,
        idleTimeoutMinutes: 60,
        isEnabled: true,
        maximumActiveSessions: 10,
        permissions: [],
        resetTimezone: 'Asia/Seoul',
      },
      audit,
    );

    const stored = repo.updateGuestAccess.mock.calls[0]?.[0];
    expect(stored?.accessCodeHash).not.toBe('guest-access-code');
    await expect(
      verify(stored?.accessCodeHash ?? '', 'guest-access-code'),
    ).resolves.toBe(true);
  });

  it('rejects an invalid reset timezone before persistence', async () => {
    const repo = repository();
    const service = new AccessService(repo as unknown as AccessRepository);

    await expect(
      service.updateGuest(
        {
          absoluteTimeoutHours: 24,
          dailyRequestLimit: 20,
          fileUploadEnabled: false,
          globalDailyRequestLimit: 100,
          idleTimeoutMinutes: 60,
          isEnabled: false,
          maximumActiveSessions: 10,
          permissions: [],
          resetTimezone: 'invalid/timezone',
        },
        audit,
      ),
    ).rejects.toMatchObject({ code: 'ACCESS_INPUT_INVALID', status: 400 });
    expect(repo.updateGuestAccess).not.toHaveBeenCalled();
  });

  it('maps an atomic quota rejection to a public rate-limit error', async () => {
    const repo = repository();
    repo.reserveDailyRequest.mockRejectedValue(
      new AccessDailyLimitError('user_model'),
    );
    const service = new AccessService(repo as unknown as AccessRepository);

    await expect(
      service.reserveDailyRequest(
        {
          displayName: 'User One',
          id: '10000000-0000-4000-8000-000000000001',
          type: 'user',
          username: 'user1',
        },
        '30000000-0000-4000-8000-000000000001',
      ),
    ).rejects.toMatchObject({
      code: 'ACCESS_DAILY_LIMIT_REACHED',
      scope: 'user_model',
      status: 429,
    });
  });
});
