import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AttachmentLifecycleController } from '../src/attachment-lifecycle.controller.js';
import type { AttachmentLifecycleService } from '../src/attachment-lifecycle.service.js';
import type { AdminRequest } from '../src/auth.guard.js';
import type { AuthService } from '../src/auth.service.js';

const request = {
  adminSession: { row: { accountKey: 'admin:admin' } },
  headers: {},
} as unknown as AdminRequest;

const response = { setHeader: vi.fn() };

function controller() {
  const lifecycle = {
    settings: vi.fn(() => Promise.resolve({ retentionDays: 30 })),
    updateRetention: vi.fn(() => Promise.resolve({ retentionDays: 45 })),
  };
  return {
    lifecycle,
    target: new AttachmentLifecycleController(
      lifecycle as unknown as AttachmentLifecycleService,
      {
        hashIpAddress: vi.fn(() => null),
      } as unknown as AuthService,
    ),
  };
}

describe('AttachmentLifecycleController', () => {
  it('updates a valid administrator retention period', async () => {
    const { lifecycle, target } = controller();

    await expect(
      target.update({ retentionDays: 45 }, request, response),
    ).resolves.toEqual({ retentionDays: 45 });
    expect(lifecycle.updateRetention).toHaveBeenCalledWith(45, {
      actorId: 'admin:admin',
      ipHash: null,
    });
  });

  it('rejects invalid retention periods', () => {
    const { target } = controller();

    expect(() =>
      target.update({ retentionDays: 0 }, request, response),
    ).toThrowError(HttpException);
  });
});
