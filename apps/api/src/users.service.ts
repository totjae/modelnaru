import { Inject, Injectable } from '@nestjs/common';
import { hash, type Algorithm } from '@node-rs/argon2';

import type { LoadedConfig } from '@modelnaru/config';

import { AttachmentLifecycleService } from './attachment-lifecycle.service.js';
import { MODELNARU_CONFIG } from './tokens.js';
import {
  UserNotFoundError,
  UsersRepository,
  type CreateUserRecordInput,
  type UpdateUserRecordInput,
  type UserAuditContext,
  type UserRecord,
} from './users.repository.js';

export type UserErrorCode = 'USERNAME_CONFLICT' | 'USER_NOT_FOUND';

export class UserError extends Error {
  constructor(
    readonly code: UserErrorCode,
    readonly status: 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    algorithm: 2 as Algorithm,
    memoryCost: 19_456,
    outputLen: 32,
    parallelism: 1,
    timeCost: 2,
  });
}

@Injectable()
export class UsersService {
  private readonly adminUsername: string;

  constructor(
    @Inject(MODELNARU_CONFIG) loadedConfig: LoadedConfig,
    private readonly repository: UsersRepository,
    private readonly attachmentLifecycle: AttachmentLifecycleService = {
      flushQueuedFiles: () => Promise.resolve(),
    } as AttachmentLifecycleService,
  ) {
    this.adminUsername = loadedConfig.config.admin.username.toLowerCase();
  }

  list(): Promise<UserRecord[]> {
    return this.repository.list();
  }

  async create(
    input: Omit<CreateUserRecordInput, 'passwordHash'> & { password: string },
    audit: UserAuditContext,
  ): Promise<UserRecord> {
    this.assertUsernameAvailableForUser(input.username);
    try {
      return await this.repository.create(
        {
          displayName: input.displayName,
          isEnabled: input.isEnabled,
          passwordHash: await hashPassword(input.password),
          username: input.username,
        },
        audit,
      );
    } catch (error) {
      this.mapRepositoryError(error);
    }
  }

  async update(
    id: string,
    patch: UpdateUserRecordInput,
    audit: UserAuditContext,
  ): Promise<UserRecord> {
    if (patch.username) this.assertUsernameAvailableForUser(patch.username);
    try {
      return await this.repository.update(id, patch, audit);
    } catch (error) {
      this.mapRepositoryError(error);
    }
  }

  async setPassword(
    id: string,
    password: string,
    audit: UserAuditContext,
  ): Promise<UserRecord> {
    try {
      return await this.repository.setPassword(
        id,
        await hashPassword(password),
        audit,
      );
    } catch (error) {
      this.mapRepositoryError(error);
    }
  }

  async delete(id: string, audit: UserAuditContext): Promise<void> {
    try {
      await this.repository.delete(id, audit);
      await this.attachmentLifecycle.flushQueuedFiles();
    } catch (error) {
      this.mapRepositoryError(error);
    }
  }

  private assertUsernameAvailableForUser(username: string): void {
    if (username.toLowerCase() === this.adminUsername) {
      throw new UserError('USERNAME_CONFLICT', 409, 'Username is unavailable.');
    }
  }

  private mapRepositoryError(error: unknown): never {
    if (error instanceof UserNotFoundError) {
      throw new UserError('USER_NOT_FOUND', 404, 'User was not found.');
    }
    if (isUniqueViolation(error)) {
      throw new UserError('USERNAME_CONFLICT', 409, 'Username is unavailable.');
    }
    throw error;
  }
}
