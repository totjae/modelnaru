import { Injectable } from '@nestjs/common';

import { DatabaseService } from './database.service.js';

export type PrincipalType = 'admin' | 'user';

export interface SessionRow {
  absoluteExpiresAt: Date;
  accountKey: string;
  credentialFingerprint: Buffer;
  csrfTokenHash: Buffer;
  id: string;
  idleExpiresAt: Date;
  lastSeenAt: Date;
  principalType: PrincipalType;
  revokedAt: Date | null;
  tokenHash: Buffer;
  userId: string | null;
}

export interface UserCredentialRow {
  credentialVersion: number;
  displayName: string | null;
  id: string;
  isEnabled: boolean;
  passwordHash: string;
  username: string;
}

export interface CreateSessionInput {
  absoluteExpiresAt: Date;
  accountKey: string;
  credentialFingerprint: Buffer;
  csrfTokenHash: Buffer;
  idleExpiresAt: Date;
  ipHash: Buffer | null;
  maximumActiveSessions: number;
  principalType: PrincipalType;
  tokenHash: Buffer;
  userAgentHash: Buffer | null;
  userId: string | null;
}

interface RawSessionRow {
  absolute_expires_at: Date;
  account_key: string;
  credential_fingerprint: Buffer;
  csrf_token_hash: Buffer;
  id: string;
  idle_expires_at: Date;
  last_seen_at: Date;
  principal_type: PrincipalType;
  revoked_at: Date | null;
  token_hash: Buffer;
  user_id: string | null;
}

interface RawUserCredentialRow {
  credential_version: number;
  display_name: string | null;
  id: string;
  is_enabled: boolean;
  password_hash: string;
  username: string;
}

function mapSession(row: RawSessionRow): SessionRow {
  return {
    absoluteExpiresAt: row.absolute_expires_at,
    accountKey: row.account_key,
    credentialFingerprint: row.credential_fingerprint,
    csrfTokenHash: row.csrf_token_hash,
    id: row.id,
    idleExpiresAt: row.idle_expires_at,
    lastSeenAt: row.last_seen_at,
    principalType: row.principal_type,
    revokedAt: row.revoked_at,
    tokenHash: row.token_hash,
    userId: row.user_id,
  };
}

function mapUser(row: RawUserCredentialRow): UserCredentialRow {
  return {
    credentialVersion: row.credential_version,
    displayName: row.display_name,
    id: row.id,
    isEnabled: row.is_enabled,
    passwordHash: row.password_hash,
    username: row.username,
  };
}

@Injectable()
export class AuthRepository {
  constructor(private readonly database: DatabaseService) {}

  async findUserByUsername(
    username: string,
  ): Promise<UserCredentialRow | undefined> {
    const rows = await this.database.getClient()<RawUserCredentialRow[]>`
      SELECT id, username, password_hash, display_name, is_enabled,
        credential_version::int AS credential_version
      FROM users
      WHERE username_normalized = ${username.toLowerCase()}
      LIMIT 1
    `;
    return rows[0] ? mapUser(rows[0]) : undefined;
  }

  async findUserById(id: string): Promise<UserCredentialRow | undefined> {
    const rows = await this.database.getClient()<RawUserCredentialRow[]>`
      SELECT id, username, password_hash, display_name, is_enabled,
        credential_version::int AS credential_version
      FROM users
      WHERE id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapUser(rows[0]) : undefined;
  }

  async createSession(input: CreateSessionInput): Promise<SessionRow> {
    const sql = this.database.getClient();
    return sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtext(${input.accountKey}))`;
      await transaction`
        UPDATE sessions
        SET revoked_at = now(), revoked_reason = 'expired'
        WHERE account_key = ${input.accountKey}
          AND revoked_at IS NULL
          AND (idle_expires_at <= now() OR absolute_expires_at <= now())
      `;
      const active = await transaction<{ id: string }[]>`
        SELECT id
        FROM sessions
        WHERE account_key = ${input.accountKey}
          AND revoked_at IS NULL
        ORDER BY last_seen_at ASC, created_at ASC
        FOR UPDATE
      `;
      const numberToRevoke = Math.max(
        0,
        active.length - input.maximumActiveSessions + 1,
      );
      for (const session of active.slice(0, numberToRevoke)) {
        await transaction`
          UPDATE sessions
          SET revoked_at = now(), revoked_reason = 'session_limit'
          WHERE id = ${session.id}
        `;
      }

      const rows = await transaction<RawSessionRow[]>`
        INSERT INTO sessions (
          principal_type,
          user_id,
          account_key,
          token_hash,
          csrf_token_hash,
          credential_fingerprint,
          idle_expires_at,
          absolute_expires_at,
          ip_hash,
          user_agent_hash
        ) VALUES (
          ${input.principalType},
          ${input.userId},
          ${input.accountKey},
          ${input.tokenHash},
          ${input.csrfTokenHash},
          ${input.credentialFingerprint},
          ${input.idleExpiresAt},
          ${input.absoluteExpiresAt},
          ${input.ipHash},
          ${input.userAgentHash}
        )
        RETURNING id, principal_type, user_id, account_key, token_hash,
          csrf_token_hash, credential_fingerprint, last_seen_at,
          idle_expires_at, absolute_expires_at, revoked_at
      `;
      const created = rows[0];
      if (!created) throw new Error('Session insert returned no row');
      return mapSession(created);
    });
  }

  async findSessionByTokenHash(
    tokenHash: Buffer,
  ): Promise<SessionRow | undefined> {
    const rows = await this.database.getClient()<RawSessionRow[]>`
      SELECT id, principal_type, user_id, account_key, token_hash,
        csrf_token_hash, credential_fingerprint, last_seen_at,
        idle_expires_at, absolute_expires_at, revoked_at
      FROM sessions
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `;
    return rows[0] ? mapSession(rows[0]) : undefined;
  }

  async touchSession(id: string, idleExpiresAt: Date): Promise<boolean> {
    const rows = await this.database.getClient()<[{ id: string }]>`
      UPDATE sessions
      SET last_seen_at = now(), idle_expires_at = ${idleExpiresAt}
      WHERE id = ${id}
        AND revoked_at IS NULL
        AND idle_expires_at > now()
        AND absolute_expires_at > now()
      RETURNING id
    `;
    return rows.length === 1;
  }

  async revokeSession(id: string, reason: string): Promise<void> {
    await this.database.getClient()`
      UPDATE sessions
      SET revoked_at = COALESCE(revoked_at, now()),
        revoked_reason = COALESCE(revoked_reason, ${reason})
      WHERE id = ${id}
    `;
  }
}
