import type { LoadedConfig } from '@modelnaru/config';
import { describe, expect, it, vi } from 'vitest';

import {
  UserNotFoundError,
  type CreateUserRecordInput,
  type UserAuditContext,
  type UserRecord,
  type UsersRepository,
} from '../src/users.repository.js';
import { UsersService } from '../src/users.service.js';

const config = {
  config: { admin: { username: 'admin' } },
} as LoadedConfig;

const audit: UserAuditContext = {
  actorId: 'admin:admin',
  ipHash: Buffer.alloc(32),
  reason: null,
};

const user: UserRecord = {
  createdAt: new Date('2026-07-22T00:00:00Z'),
  credentialVersion: 1,
  displayName: 'User One',
  id: '00000000-0000-4000-8000-000000000001',
  isEnabled: true,
  updatedAt: new Date('2026-07-22T00:00:00Z'),
  username: 'user1',
};

function repository() {
  return {
    create: vi.fn(
      (input: CreateUserRecordInput, auditContext: UserAuditContext) => {
        void input;
        void auditContext;
        return Promise.resolve(user);
      },
    ),
    delete: vi.fn(() => Promise.resolve()),
    list: vi.fn(() => Promise.resolve([user])),
    setPassword: vi.fn(() => Promise.resolve(user)),
    update: vi.fn(() => Promise.resolve(user)),
  };
}

describe('UsersService', () => {
  it('hashes a new password before handing it to the repository', async () => {
    const target = repository();
    const service = new UsersService(
      config,
      target as unknown as UsersRepository,
    );

    await expect(
      service.create(
        {
          displayName: user.displayName,
          isEnabled: true,
          password: 'long-enough-password',
          username: user.username,
        },
        audit,
      ),
    ).resolves.toEqual(user);
    const input = target.create.mock.calls[0]?.[0];
    expect(input?.passwordHash).toMatch(/^\$argon2id\$/u);
    expect(input?.passwordHash).not.toContain('long-enough-password');
  });

  it('rejects a username that collides with the fixed administrator', async () => {
    const target = repository();
    const service = new UsersService(
      config,
      target as unknown as UsersRepository,
    );

    await expect(
      service.create(
        {
          displayName: null,
          isEnabled: true,
          password: 'long-enough-password',
          username: 'ADMIN',
        },
        audit,
      ),
    ).rejects.toMatchObject({ code: 'USERNAME_CONFLICT', status: 409 });
    expect(target.create).not.toHaveBeenCalled();
  });

  it('maps unique and missing-user database errors without leaking details', async () => {
    const target = repository();
    target.update.mockRejectedValueOnce(
      Object.assign(new Error('database detail'), { code: '23505' }),
    );
    target.delete.mockRejectedValueOnce(new UserNotFoundError());
    const service = new UsersService(
      config,
      target as unknown as UsersRepository,
    );

    await expect(
      service.update(user.id, { username: 'user2' }, audit),
    ).rejects.toMatchObject({ code: 'USERNAME_CONFLICT', status: 409 });
    await expect(service.delete(user.id, audit)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      status: 404,
    });
  });
});
