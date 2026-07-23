import { Injectable } from '@nestjs/common';

import { DatabaseService } from './database.service.js';

export type PrincipalType = 'admin' | 'guest' | 'user';

export interface SessionRow {
  absoluteExpiresAt: Date;
  accountKey: string;
  credentialFingerprint: Buffer;
  csrfTokenHash: Buffer;
  guestId: string | null;
  id: string;
  idleExpiresAt: Date;
  lastSeenAt: Date;
  principalType: PrincipalType;
  revokedAt: Date | null;
  tokenHash: Buffer;
  userId: string | null;
}

export interface GuestSettingsRow {
  absoluteTimeoutHours: number;
  accessCodeHash: string | null;
  fileUploadEnabled: boolean;
  globalDailyRequestLimit: number;
  idleTimeoutMinutes: number;
  isEnabled: boolean;
  maximumActiveSessions: number;
  resetTimezone: string;
  requestTraceEnabled: boolean;
  sessionDailyRequestLimit: number;
  updatedAt: Date;
}

export interface GuestCredentialRow {
  absoluteExpiresAt: Date;
  credentialFingerprint: Buffer;
  deletedAt: Date | null;
  id: string;
  idleExpiresAt: Date;
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
  guestId?: string | null;
  idleExpiresAt: Date;
  ipHash: Buffer | null;
  maximumActiveSessions: number;
  principalType: PrincipalType;
  tokenHash: Buffer;
  userAgentHash: Buffer | null;
  userId: string | null;
}

export interface CreateGuestSessionInput {
  absoluteExpiresAt: Date;
  credentialFingerprint: Buffer;
  csrfTokenHash: Buffer;
  expectedSettingsUpdatedAt: Date;
  idleExpiresAt: Date;
  ipHash: Buffer | null;
  tokenHash: Buffer;
  userAgentHash: Buffer | null;
}

interface RawSessionRow {
  absolute_expires_at: Date;
  account_key: string;
  credential_fingerprint: Buffer;
  csrf_token_hash: Buffer;
  guest_id: string | null;
  id: string;
  idle_expires_at: Date;
  last_seen_at: Date;
  principal_type: PrincipalType;
  revoked_at: Date | null;
  token_hash: Buffer;
  user_id: string | null;
}

interface RawGuestSettingsRow {
  absolute_timeout_hours: number;
  access_code_hash: string | null;
  file_upload_enabled: boolean;
  global_daily_request_limit: number;
  idle_timeout_minutes: number;
  is_enabled: boolean;
  maximum_active_sessions: number;
  reset_timezone: string;
  request_trace_enabled: boolean;
  session_daily_request_limit: number;
  updated_at: Date;
}

interface RawGuestCredentialRow {
  absolute_expires_at: Date;
  credential_fingerprint: Buffer;
  deleted_at: Date | null;
  id: string;
  idle_expires_at: Date;
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
    guestId: row.guest_id,
    id: row.id,
    idleExpiresAt: row.idle_expires_at,
    lastSeenAt: row.last_seen_at,
    principalType: row.principal_type,
    revokedAt: row.revoked_at,
    tokenHash: row.token_hash,
    userId: row.user_id,
  };
}

function mapGuestSettings(row: RawGuestSettingsRow): GuestSettingsRow {
  return {
    absoluteTimeoutHours: row.absolute_timeout_hours,
    accessCodeHash: row.access_code_hash,
    fileUploadEnabled: row.file_upload_enabled,
    globalDailyRequestLimit: row.global_daily_request_limit,
    idleTimeoutMinutes: row.idle_timeout_minutes,
    isEnabled: row.is_enabled,
    maximumActiveSessions: row.maximum_active_sessions,
    resetTimezone: row.reset_timezone,
    requestTraceEnabled: row.request_trace_enabled,
    sessionDailyRequestLimit: row.session_daily_request_limit,
    updatedAt: row.updated_at,
  };
}

function mapGuest(row: RawGuestCredentialRow): GuestCredentialRow {
  return {
    absoluteExpiresAt: row.absolute_expires_at,
    credentialFingerprint: row.credential_fingerprint,
    deletedAt: row.deleted_at,
    id: row.id,
    idleExpiresAt: row.idle_expires_at,
  };
}

export class GuestCapacityError extends Error {}
export class GuestSettingsChangedError extends Error {}

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
          guest_id,
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
          ${input.guestId ?? null},
          ${input.accountKey},
          ${input.tokenHash},
          ${input.csrfTokenHash},
          ${input.credentialFingerprint},
          ${input.idleExpiresAt},
          ${input.absoluteExpiresAt},
          ${input.ipHash},
          ${input.userAgentHash}
        )
        RETURNING id, principal_type, user_id, guest_id, account_key, token_hash,
          csrf_token_hash, credential_fingerprint, last_seen_at,
          idle_expires_at, absolute_expires_at, revoked_at
      `;
      const created = rows[0];
      if (!created) throw new Error('Session insert returned no row');
      return mapSession(created);
    });
  }

  async activeSessionIds(accountKey: string): Promise<string[]> {
    const rows = await this.database.getClient()<Array<{ id: string }>>`
      SELECT id
      FROM sessions
      WHERE account_key = ${accountKey}
        AND revoked_at IS NULL
        AND idle_expires_at > now()
        AND absolute_expires_at > now()
    `;
    return rows.map((row) => row.id);
  }

  async getGuestSettings(): Promise<GuestSettingsRow> {
    const rows = await this.database.getClient()<RawGuestSettingsRow[]>`
      SELECT is_enabled, access_code_hash, maximum_active_sessions,
        session_daily_request_limit, global_daily_request_limit,
        idle_timeout_minutes, absolute_timeout_hours, reset_timezone,
        file_upload_enabled, request_trace_enabled, updated_at
      FROM guest_settings
      WHERE singleton = true
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) throw new Error('Guest settings row is missing');
    return mapGuestSettings(row);
  }

  async createGuestSession(
    input: CreateGuestSessionInput,
  ): Promise<{ guest: GuestCredentialRow; session: SessionRow }> {
    return this.database.getClient().begin(async (transaction) => {
      const settingsRows = await transaction<RawGuestSettingsRow[]>`
        SELECT is_enabled, access_code_hash, maximum_active_sessions,
          session_daily_request_limit, global_daily_request_limit,
          idle_timeout_minutes, absolute_timeout_hours, reset_timezone,
          file_upload_enabled, request_trace_enabled, updated_at
        FROM guest_settings
        WHERE singleton = true
        FOR UPDATE
      `;
      const settings = settingsRows[0];
      if (
        !settings?.is_enabled ||
        settings.updated_at.getTime() !==
          input.expectedSettingsUpdatedAt.getTime()
      ) {
        throw new GuestSettingsChangedError();
      }
      await transaction`
        UPDATE guest_principals
        SET deleted_at = COALESCE(deleted_at, now())
        WHERE deleted_at IS NULL
          AND (idle_expires_at <= now() OR absolute_expires_at <= now())
      `;
      const activeRows = await transaction<[{ count: number }]>`
        SELECT count(*)::int AS count
        FROM guest_principals
        WHERE deleted_at IS NULL
          AND idle_expires_at > now()
          AND absolute_expires_at > now()
      `;
      if ((activeRows[0]?.count ?? 0) >= settings.maximum_active_sessions) {
        throw new GuestCapacityError();
      }
      const guestRows = await transaction<RawGuestCredentialRow[]>`
        INSERT INTO guest_principals (
          credential_fingerprint, idle_expires_at, absolute_expires_at
        ) VALUES (
          ${input.credentialFingerprint}, ${input.idleExpiresAt},
          ${input.absoluteExpiresAt}
        )
        RETURNING id, credential_fingerprint, idle_expires_at,
          absolute_expires_at, deleted_at
      `;
      const guest = guestRows[0];
      if (!guest) throw new Error('Guest principal insert returned no row');
      const sessionRows = await transaction<RawSessionRow[]>`
        INSERT INTO sessions (
          principal_type, user_id, guest_id, account_key, token_hash,
          csrf_token_hash, credential_fingerprint, idle_expires_at,
          absolute_expires_at, ip_hash, user_agent_hash
        ) VALUES (
          'guest', null, ${guest.id}, ${`guest:${guest.id}`},
          ${input.tokenHash}, ${input.csrfTokenHash},
          ${input.credentialFingerprint}, ${input.idleExpiresAt},
          ${input.absoluteExpiresAt}, ${input.ipHash}, ${input.userAgentHash}
        )
        RETURNING id, principal_type, user_id, guest_id, account_key,
          token_hash, csrf_token_hash, credential_fingerprint, last_seen_at,
          idle_expires_at, absolute_expires_at, revoked_at
      `;
      const session = sessionRows[0];
      if (!session) throw new Error('Guest session insert returned no row');
      return { guest: mapGuest(guest), session: mapSession(session) };
    });
  }

  async findGuestById(id: string): Promise<GuestCredentialRow | undefined> {
    const rows = await this.database.getClient()<RawGuestCredentialRow[]>`
      SELECT id, credential_fingerprint, idle_expires_at,
        absolute_expires_at, deleted_at
      FROM guest_principals
      WHERE id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapGuest(rows[0]) : undefined;
  }

  async touchGuest(
    id: string,
    idleExpiresAt: Date,
    sessionId: string,
  ): Promise<boolean> {
    return this.database.getClient().begin(async (transaction) => {
      const guestRows = await transaction<[{ id: string }]>`
        UPDATE guest_principals
        SET last_seen_at = now(), idle_expires_at = ${idleExpiresAt}
        WHERE id = ${id}
          AND deleted_at IS NULL
          AND idle_expires_at > now()
          AND absolute_expires_at > now()
        RETURNING id
      `;
      if (guestRows.length !== 1) return false;
      const sessionRows = await transaction<[{ id: string }]>`
        UPDATE sessions
        SET last_seen_at = now(), idle_expires_at = ${idleExpiresAt}
        WHERE id = ${sessionId}
          AND guest_id = ${id}
          AND revoked_at IS NULL
          AND idle_expires_at > now()
          AND absolute_expires_at > now()
        RETURNING id
      `;
      return sessionRows.length === 1;
    });
  }

  async deleteGuest(id: string): Promise<void> {
    await this.database.getClient()`DELETE FROM guest_principals WHERE id = ${id}`;
  }

  async findSessionByTokenHash(
    tokenHash: Buffer,
  ): Promise<SessionRow | undefined> {
    const rows = await this.database.getClient()<RawSessionRow[]>`
      SELECT id, principal_type, user_id, guest_id, account_key, token_hash,
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
