import { Injectable } from '@nestjs/common';

import type { DatabaseTransaction } from '@modelnaru/database';

import { DatabaseService } from './database.service.js';

export interface UserRecord {
  createdAt: Date;
  credentialVersion: number;
  displayName: string | null;
  id: string;
  isEnabled: boolean;
  updatedAt: Date;
  username: string;
}

export interface UserAuditContext {
  actorId: string;
  ipHash: Buffer | null;
  reason?: string | null;
}

export interface CreateUserRecordInput {
  displayName: string | null;
  isEnabled: boolean;
  passwordHash: string;
  username: string;
}

export interface UpdateUserRecordInput {
  displayName?: string | null;
  isEnabled?: boolean;
  username?: string;
}

interface RawUserRow {
  created_at: Date;
  credential_version: number;
  display_name: string | null;
  id: string;
  is_enabled: boolean;
  updated_at: Date;
  username: string;
}

export class UserNotFoundError extends Error {}

function mapUser(row: RawUserRow): UserRecord {
  return {
    createdAt: row.created_at,
    credentialVersion: row.credential_version,
    displayName: row.display_name,
    id: row.id,
    isEnabled: row.is_enabled,
    updatedAt: row.updated_at,
    username: row.username,
  };
}

function snapshot(
  user: UserRecord,
  redactIdentity = false,
): Record<string, string | number | boolean | null> {
  const value: Record<string, string | number | boolean | null> = {
    credentialVersion: user.credentialVersion,
    isEnabled: user.isEnabled,
  };
  if (!redactIdentity) {
    value.displayName = user.displayName;
    value.username = user.username;
  }
  return value;
}

async function writeAudit(
  transaction: DatabaseTransaction,
  input: {
    action: string;
    after: UserRecord | null;
    audit: UserAuditContext;
    before: UserRecord | null;
    redactIdentity?: boolean;
    targetId: string;
  },
): Promise<void> {
  const beforeData = input.before
    ? snapshot(input.before, input.redactIdentity)
    : null;
  const afterData = input.after
    ? snapshot(input.after, input.redactIdentity)
    : null;
  await transaction`
    INSERT INTO audit_logs (
      actor_type,
      actor_id,
      action,
      target_type,
      target_id,
      before_data,
      after_data,
      reason,
      ip_hash
    ) VALUES (
      'admin',
      ${input.audit.actorId},
      ${input.action},
      'user',
      ${input.targetId},
      ${beforeData ? transaction.json(beforeData) : null},
      ${afterData ? transaction.json(afterData) : null},
      ${input.audit.reason ?? null},
      ${input.audit.ipHash}
    )
  `;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<UserRecord[]> {
    const rows = await this.database.getClient()<RawUserRow[]>`
      SELECT id, username, display_name, is_enabled,
        credential_version::int AS credential_version, created_at, updated_at
      FROM users
      ORDER BY username_normalized ASC
    `;
    return rows.map(mapUser);
  }

  async create(
    input: CreateUserRecordInput,
    audit: UserAuditContext,
  ): Promise<UserRecord> {
    return this.database.getClient().begin(async (transaction) => {
      const rows = await transaction<RawUserRow[]>`
        INSERT INTO users (
          username,
          username_normalized,
          password_hash,
          display_name,
          is_enabled
        ) VALUES (
          ${input.username},
          ${input.username.toLowerCase()},
          ${input.passwordHash},
          ${input.displayName},
          ${input.isEnabled}
        )
        RETURNING id, username, display_name, is_enabled,
          credential_version::int AS credential_version, created_at, updated_at
      `;
      const created = rows[0];
      if (!created) throw new Error('User insert returned no row');
      const user = mapUser(created);
      await writeAudit(transaction, {
        action: 'user.created',
        after: user,
        audit,
        before: null,
        targetId: user.id,
      });
      return user;
    });
  }

  async update(
    id: string,
    patch: UpdateUserRecordInput,
    audit: UserAuditContext,
  ): Promise<UserRecord> {
    return this.database.getClient().begin(async (transaction) => {
      const currentRows = await transaction<RawUserRow[]>`
        SELECT id, username, display_name, is_enabled,
          credential_version::int AS credential_version, created_at, updated_at
        FROM users
        WHERE id = ${id}
        FOR UPDATE
      `;
      const currentRaw = currentRows[0];
      if (!currentRaw) throw new UserNotFoundError();
      const before = mapUser(currentRaw);
      const username = patch.username ?? before.username;
      const displayName =
        patch.displayName === undefined
          ? before.displayName
          : patch.displayName;
      const isEnabled = patch.isEnabled ?? before.isEnabled;
      const usernameChanged = username !== before.username;
      const rows = await transaction<RawUserRow[]>`
        UPDATE users
        SET username = ${username},
          username_normalized = ${username.toLowerCase()},
          display_name = ${displayName},
          is_enabled = ${isEnabled},
          credential_version = credential_version + ${usernameChanged ? 1 : 0}
        WHERE id = ${id}
        RETURNING id, username, display_name, is_enabled,
          credential_version::int AS credential_version, created_at, updated_at
      `;
      const updatedRaw = rows[0];
      if (!updatedRaw) throw new UserNotFoundError();
      const updated = mapUser(updatedRaw);

      const disabled = before.isEnabled && !updated.isEnabled;
      const enabled = !before.isEnabled && updated.isEnabled;
      if (usernameChanged || disabled) {
        await transaction`
          UPDATE sessions
          SET revoked_at = now(),
            revoked_reason = ${disabled ? 'account_disabled' : 'account_changed'}
          WHERE user_id = ${id} AND revoked_at IS NULL
        `;
      }
      await writeAudit(transaction, {
        action: disabled
          ? 'user.disabled'
          : enabled
            ? 'user.enabled'
            : 'user.updated',
        after: updated,
        audit,
        before,
        targetId: id,
      });
      return updated;
    });
  }

  async setPassword(
    id: string,
    passwordHash: string,
    audit: UserAuditContext,
  ): Promise<UserRecord> {
    return this.database.getClient().begin(async (transaction) => {
      const currentRows = await transaction<RawUserRow[]>`
        SELECT id, username, display_name, is_enabled,
          credential_version::int AS credential_version, created_at, updated_at
        FROM users
        WHERE id = ${id}
        FOR UPDATE
      `;
      const currentRaw = currentRows[0];
      if (!currentRaw) throw new UserNotFoundError();
      const before = mapUser(currentRaw);
      const rows = await transaction<RawUserRow[]>`
        UPDATE users
        SET password_hash = ${passwordHash},
          credential_version = credential_version + 1
        WHERE id = ${id}
        RETURNING id, username, display_name, is_enabled,
          credential_version::int AS credential_version, created_at, updated_at
      `;
      const updatedRaw = rows[0];
      if (!updatedRaw) throw new UserNotFoundError();
      const updated = mapUser(updatedRaw);
      await transaction`
        UPDATE sessions
        SET revoked_at = now(), revoked_reason = 'password_changed'
        WHERE user_id = ${id} AND revoked_at IS NULL
      `;
      await writeAudit(transaction, {
        action: 'user.password_changed',
        after: updated,
        audit,
        before,
        targetId: id,
      });
      return updated;
    });
  }

  async delete(id: string, audit: UserAuditContext): Promise<void> {
    await this.database.getClient().begin(async (transaction) => {
      const rows = await transaction<RawUserRow[]>`
        SELECT id, username, display_name, is_enabled,
          credential_version::int AS credential_version, created_at, updated_at
        FROM users
        WHERE id = ${id}
        FOR UPDATE
      `;
      const currentRaw = rows[0];
      if (!currentRaw) throw new UserNotFoundError();
      const before = mapUser(currentRaw);
      await writeAudit(transaction, {
        action: 'user.deleted',
        after: null,
        audit,
        before,
        redactIdentity: true,
        targetId: id,
      });
      await transaction`DELETE FROM users WHERE id = ${id}`;
    });
  }
}
