import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AdminRequest } from '../src/auth.guard.js';
import type {
  AuthenticatedAdminSession,
  AuthService,
} from '../src/auth.service.js';
import { UsersController } from '../src/users.controller.js';
import type { UserRecord } from '../src/users.repository.js';
import type { UsersService } from '../src/users.service.js';

const user: UserRecord = {
  createdAt: new Date('2026-07-22T00:00:00Z'),
  credentialVersion: 1,
  displayName: null,
  id: '00000000-0000-4000-8000-000000000001',
  isEnabled: true,
  updatedAt: new Date('2026-07-22T00:00:00Z'),
  username: 'user1',
};

function request(): AdminRequest {
  const adminSession = {
    absoluteExpiresAt: new Date(),
    idleExpiresAt: new Date(),
    row: { accountKey: 'admin:admin' },
    username: 'admin',
  } as unknown as AuthenticatedAdminSession;
  return {
    adminSession,
    headers: {},
    ip: '203.0.113.10',
  };
}

function response() {
  return { setHeader: vi.fn() };
}

describe('UsersController', () => {
  it('rejects short passwords before calling the service', async () => {
    const users = { create: vi.fn() };
    const controller = new UsersController(
      users as unknown as UsersService,
      { hashIpAddress: vi.fn() } as unknown as AuthService,
    );

    await expect(
      controller.create(
        { password: 'short', username: 'user1' },
        request(),
        response(),
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('passes normalized input and audit metadata to the service', async () => {
    const users = { create: vi.fn(() => Promise.resolve(user)) };
    const auth = { hashIpAddress: vi.fn(() => Buffer.alloc(32)) };
    const controller = new UsersController(
      users as unknown as UsersService,
      auth as unknown as AuthService,
    );
    const target = response();

    await expect(
      controller.create(
        {
          displayName: '  User One  ',
          isEnabled: true,
          password: 'long-enough-password',
          username: 'user1',
        },
        request(),
        target,
      ),
    ).resolves.toBe(user);
    expect(users.create).toHaveBeenCalledWith(
      {
        displayName: 'User One',
        isEnabled: true,
        password: 'long-enough-password',
        username: 'user1',
      },
      {
        actorId: 'admin:admin',
        ipHash: expect.any(Buffer),
        reason: null,
      },
    );
    expect(target.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
});
