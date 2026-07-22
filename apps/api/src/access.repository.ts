import { Injectable } from '@nestjs/common';

import type { DatabaseTransaction, JSONValue } from '@modelnaru/database';

import type { AuthenticatedPrincipal } from './auth.service.js';
import { DatabaseService } from './database.service.js';
import type { ProviderAuditContext } from './providers.repository.js';

export interface AccessModelRecord {
  connectionEnabled: boolean;
  connectionName: string;
  displayName: string | null;
  id: string;
  isAvailable: boolean;
  isEnabled: boolean;
  modelId: string;
  templateId: string;
}

export interface ModelPermissionRecord {
  dailyRequestLimit: number | null;
  parameterPolicy: Record<string, unknown>;
  providerModelId: string;
}

export interface UserAccessRecord {
  dailyRequestLimit: number | null;
  displayName: string | null;
  id: string;
  isEnabled: boolean;
  permissions: ModelPermissionRecord[];
  username: string;
}

export interface GuestAccessRecord {
  absoluteTimeoutHours: number;
  accessCodeConfigured: boolean;
  activeSessionCount: number;
  fileUploadEnabled: boolean;
  globalDailyRequestLimit: number;
  idleTimeoutMinutes: number;
  isEnabled: boolean;
  maximumActiveSessions: number;
  permissions: ModelPermissionRecord[];
  resetTimezone: string;
  sessionDailyRequestLimit: number;
}

export interface AdminAccessState {
  guest: GuestAccessRecord;
  models: AccessModelRecord[];
  users: UserAccessRecord[];
}

export interface AccessUpdateInput {
  dailyRequestLimit: number | null;
  permissions: Array<{
    dailyRequestLimit: number | null;
    providerModelId: string;
  }>;
}

export interface GuestAccessUpdateInput extends AccessUpdateInput {
  absoluteTimeoutHours: number;
  accessCodeHash?: string;
  fileUploadEnabled: boolean;
  globalDailyRequestLimit: number;
  idleTimeoutMinutes: number;
  isEnabled: boolean;
  maximumActiveSessions: number;
  resetTimezone: string;
  terminateExistingSessions: boolean;
}

interface RawAccessModelRow {
  connection_enabled: boolean;
  connection_name: string;
  display_name: string | null;
  id: string;
  is_available: boolean;
  is_enabled: boolean;
  model_id: string;
  template_id: string;
}

interface RawPermissionRow {
  daily_request_limit: number | null;
  parameter_policy: Record<string, unknown>;
  provider_model_id: string;
  user_id?: string;
}

interface RawUserAccessRow {
  daily_request_limit: number | null;
  display_name: string | null;
  id: string;
  is_enabled: boolean;
  username: string;
}

interface RawGuestAccessRow {
  absolute_timeout_hours: number;
  access_code_configured: boolean;
  active_session_count: number;
  file_upload_enabled: boolean;
  global_daily_request_limit: number;
  idle_timeout_minutes: number;
  is_enabled: boolean;
  maximum_active_sessions: number;
  reset_timezone: string;
  session_daily_request_limit: number;
}

interface RawQuotaRow {
  account_limit: number | null;
  model_limit: number | null;
}

export class AccessSubjectNotFoundError extends Error {}
export class AccessModelNotAllowedError extends Error {}
export class AccessGuestCodeRequiredError extends Error {}
export class AccessDailyLimitError extends Error {
  constructor(readonly scope: string) {
    super('Daily request limit reached');
  }
}

function mapPermission(row: RawPermissionRow): ModelPermissionRecord {
  return {
    dailyRequestLimit: row.daily_request_limit,
    parameterPolicy: row.parameter_policy,
    providerModelId: row.provider_model_id,
  };
}

async function writeAudit(
  transaction: DatabaseTransaction,
  input: {
    action: string;
    after: JSONValue;
    audit: ProviderAuditContext;
    targetId: string | null;
    targetType: string;
  },
): Promise<void> {
  await transaction`
    INSERT INTO audit_logs (
      actor_type, actor_id, action, target_type, target_id, after_data, ip_hash
    ) VALUES (
      'admin', ${input.audit.actorId}, ${input.action}, ${input.targetType},
      ${input.targetId}, ${transaction.json(input.after)}, ${input.audit.ipHash}
    )
  `;
}

@Injectable()
export class AccessRepository {
  constructor(private readonly database: DatabaseService) {}

  async adminState(): Promise<AdminAccessState> {
    const sql = this.database.getClient();
    const models = await sql<RawAccessModelRow[]>`
      SELECT m.id, m.model_id, m.display_name, m.is_enabled, m.is_available,
        c.name AS connection_name, c.template_id,
        c.is_enabled AS connection_enabled
      FROM provider_models m
      JOIN provider_connections c ON c.id = m.provider_connection_id
      ORDER BY lower(c.name), m.model_id
    `;
    const users = await sql<RawUserAccessRow[]>`
      SELECT id, username, display_name, is_enabled, daily_request_limit
      FROM users
      ORDER BY username_normalized
    `;
    const userPermissions = await sql<RawPermissionRow[]>`
      SELECT user_id, provider_model_id, daily_request_limit, parameter_policy
      FROM user_model_permissions
      WHERE is_allowed = true
      ORDER BY provider_model_id
    `;
    const permissionsByUser = new Map<string, ModelPermissionRecord[]>();
    for (const row of userPermissions) {
      if (!row.user_id) continue;
      const group = permissionsByUser.get(row.user_id) ?? [];
      group.push(mapPermission(row));
      permissionsByUser.set(row.user_id, group);
    }
    const guestRows = await sql<RawGuestAccessRow[]>`
      SELECT g.is_enabled, (g.access_code_hash IS NOT NULL) AS access_code_configured,
        g.maximum_active_sessions, g.session_daily_request_limit,
        g.global_daily_request_limit, g.idle_timeout_minutes,
        g.absolute_timeout_hours, g.reset_timezone, g.file_upload_enabled,
        (
          SELECT count(*)::int FROM guest_principals p
          WHERE p.deleted_at IS NULL
            AND p.idle_expires_at > now()
            AND p.absolute_expires_at > now()
        ) AS active_session_count
      FROM guest_settings g
      WHERE g.singleton = true
    `;
    const guestPermissionRows = await sql<RawPermissionRow[]>`
      SELECT provider_model_id, daily_request_limit, parameter_policy
      FROM guest_model_permissions
      WHERE is_allowed = true
      ORDER BY provider_model_id
    `;
    const guest = guestRows[0];
    if (!guest) throw new Error('Guest settings row is missing');
    return {
      guest: {
        absoluteTimeoutHours: guest.absolute_timeout_hours,
        accessCodeConfigured: guest.access_code_configured,
        activeSessionCount: guest.active_session_count,
        fileUploadEnabled: guest.file_upload_enabled,
        globalDailyRequestLimit: guest.global_daily_request_limit,
        idleTimeoutMinutes: guest.idle_timeout_minutes,
        isEnabled: guest.is_enabled,
        maximumActiveSessions: guest.maximum_active_sessions,
        permissions: guestPermissionRows.map(mapPermission),
        resetTimezone: guest.reset_timezone,
        sessionDailyRequestLimit: guest.session_daily_request_limit,
      },
      models: models.map((row) => ({
        connectionEnabled: row.connection_enabled,
        connectionName: row.connection_name,
        displayName: row.display_name,
        id: row.id,
        isAvailable: row.is_available,
        isEnabled: row.is_enabled,
        modelId: row.model_id,
        templateId: row.template_id,
      })),
      users: users.map((row) => ({
        dailyRequestLimit: row.daily_request_limit,
        displayName: row.display_name,
        id: row.id,
        isEnabled: row.is_enabled,
        permissions: permissionsByUser.get(row.id) ?? [],
        username: row.username,
      })),
    };
  }

  async updateUserAccess(
    userId: string,
    input: AccessUpdateInput,
    audit: ProviderAuditContext,
  ): Promise<void> {
    await this.database.getClient().begin(async (transaction) => {
      const users = await transaction<[{ id: string }]>`
        SELECT id FROM users WHERE id = ${userId} FOR UPDATE
      `;
      if (!users[0]) throw new AccessSubjectNotFoundError();
      await this.assertModelsExist(
        transaction,
        input.permissions.map((permission) => permission.providerModelId),
      );
      await transaction`
        UPDATE users SET daily_request_limit = ${input.dailyRequestLimit}
        WHERE id = ${userId}
      `;
      await transaction`
        DELETE FROM user_model_permissions WHERE user_id = ${userId}
      `;
      for (const permission of input.permissions) {
        await transaction`
          INSERT INTO user_model_permissions (
            user_id, provider_model_id, is_allowed, daily_request_limit
          ) VALUES (
            ${userId}, ${permission.providerModelId}, true,
            ${permission.dailyRequestLimit}
          )
        `;
      }
      await writeAudit(transaction, {
        action: 'user.model_access_updated',
        after: {
          dailyRequestLimit: input.dailyRequestLimit,
          modelCount: input.permissions.length,
        },
        audit,
        targetId: userId,
        targetType: 'user',
      });
    });
  }

  async updateGuestAccess(
    input: GuestAccessUpdateInput,
    audit: ProviderAuditContext,
  ): Promise<void> {
    await this.database.getClient().begin(async (transaction) => {
      await this.assertModelsExist(
        transaction,
        input.permissions.map((permission) => permission.providerModelId),
      );
      const currentRows = await transaction<
        [{ access_code_hash: string | null }]
      >`
        SELECT access_code_hash FROM guest_settings
        WHERE singleton = true FOR UPDATE
      `;
      const accessCodeHash =
        input.accessCodeHash ?? currentRows[0]?.access_code_hash ?? null;
      if (input.isEnabled && !accessCodeHash) {
        throw new AccessGuestCodeRequiredError();
      }
      await transaction`
        UPDATE guest_settings
        SET is_enabled = ${input.isEnabled},
          access_code_hash = ${accessCodeHash},
          maximum_active_sessions = ${input.maximumActiveSessions},
          session_daily_request_limit = ${input.dailyRequestLimit},
          global_daily_request_limit = ${input.globalDailyRequestLimit},
          idle_timeout_minutes = ${input.idleTimeoutMinutes},
          absolute_timeout_hours = ${input.absoluteTimeoutHours},
          reset_timezone = ${input.resetTimezone},
          file_upload_enabled = ${input.fileUploadEnabled}
        WHERE singleton = true
      `;
      await transaction`DELETE FROM guest_model_permissions`;
      for (const permission of input.permissions) {
        await transaction`
          INSERT INTO guest_model_permissions (
            provider_model_id, is_allowed, daily_request_limit
          ) VALUES (
            ${permission.providerModelId}, true, ${permission.dailyRequestLimit}
          )
        `;
      }
      if (input.terminateExistingSessions) {
        await transaction`DELETE FROM guest_principals`;
      }
      await writeAudit(transaction, {
        action: 'guest.settings_updated',
        after: {
          absoluteTimeoutHours: input.absoluteTimeoutHours,
          accessCodeChanged: input.accessCodeHash !== undefined,
          globalDailyRequestLimit: input.globalDailyRequestLimit,
          idleTimeoutMinutes: input.idleTimeoutMinutes,
          isEnabled: input.isEnabled,
          maximumActiveSessions: input.maximumActiveSessions,
          modelCount: input.permissions.length,
          sessionDailyRequestLimit: input.dailyRequestLimit,
          terminatedExistingSessions: input.terminateExistingSessions,
        },
        audit,
        targetId: null,
        targetType: 'guest_settings',
      });
    });
  }

  async allowedModels(
    principal: Extract<AuthenticatedPrincipal, { type: 'guest' | 'user' }>,
  ): Promise<AccessModelRecord[]> {
    const sql = this.database.getClient();
    const rows =
      principal.type === 'user'
        ? await sql<RawAccessModelRow[]>`
            SELECT m.id, m.model_id, m.display_name, m.is_enabled,
              m.is_available, c.name AS connection_name, c.template_id,
              c.is_enabled AS connection_enabled
            FROM user_model_permissions p
            JOIN provider_models m ON m.id = p.provider_model_id
            JOIN provider_connections c ON c.id = m.provider_connection_id
            WHERE p.user_id = ${principal.id} AND p.is_allowed = true
              AND m.is_enabled = true AND m.is_available = true
              AND c.is_enabled = true
            ORDER BY lower(c.name), m.model_id
          `
        : await sql<RawAccessModelRow[]>`
            SELECT m.id, m.model_id, m.display_name, m.is_enabled,
              m.is_available, c.name AS connection_name, c.template_id,
              c.is_enabled AS connection_enabled
            FROM guest_model_permissions p
            JOIN provider_models m ON m.id = p.provider_model_id
            JOIN provider_connections c ON c.id = m.provider_connection_id
            WHERE p.is_allowed = true AND m.is_enabled = true
              AND m.is_available = true AND c.is_enabled = true
            ORDER BY lower(c.name), m.model_id
          `;
    return rows.map((row) => ({
      connectionEnabled: row.connection_enabled,
      connectionName: row.connection_name,
      displayName: row.display_name,
      id: row.id,
      isAvailable: row.is_available,
      isEnabled: row.is_enabled,
      modelId: row.model_id,
      templateId: row.template_id,
    }));
  }

  async reserveDailyRequest(
    principal: Extract<AuthenticatedPrincipal, { type: 'guest' | 'user' }>,
    providerModelId: string,
  ): Promise<void> {
    await this.database.getClient().begin(async (transaction) => {
      const dateRows = await transaction<[{ usage_date: string }]>`
        SELECT (now() AT TIME ZONE reset_timezone)::date::text AS usage_date
        FROM guest_settings WHERE singleton = true
      `;
      const usageDate = dateRows[0]?.usage_date;
      if (!usageDate) throw new Error('Usage timezone is unavailable');
      await transaction`
        SELECT pg_advisory_xact_lock(
          hashtext(${`quota:${principal.type}:${principal.id}:${usageDate}`})
        )
      `;
      if (principal.type === 'user') {
        const rows = await transaction<RawQuotaRow[]>`
          SELECT u.daily_request_limit AS account_limit,
            p.daily_request_limit AS model_limit
          FROM users u
          JOIN user_model_permissions p ON p.user_id = u.id
          JOIN provider_models m ON m.id = p.provider_model_id
          JOIN provider_connections c ON c.id = m.provider_connection_id
          WHERE u.id = ${principal.id} AND u.is_enabled = true
            AND p.provider_model_id = ${providerModelId}
            AND p.is_allowed = true AND m.is_enabled = true
            AND m.is_available = true AND c.is_enabled = true
        `;
        const quota = rows[0];
        if (!quota) throw new AccessModelNotAllowedError();
        await this.incrementCounter(transaction, {
          counterKey: `user:${principal.id}`,
          limit: quota.account_limit,
          modelId: null,
          scope: 'user',
          subjectId: principal.id,
          usageDate,
        });
        await this.incrementCounter(transaction, {
          counterKey: `user-model:${principal.id}:${providerModelId}`,
          limit: quota.model_limit,
          modelId: providerModelId,
          scope: 'user_model',
          subjectId: principal.id,
          usageDate,
        });
        return;
      }
      const rows = await transaction<RawQuotaRow[]>`
        SELECT g.session_daily_request_limit AS account_limit,
          p.daily_request_limit AS model_limit
        FROM guest_settings g
        JOIN guest_model_permissions p ON p.is_allowed = true
        JOIN provider_models m ON m.id = p.provider_model_id
        JOIN provider_connections c ON c.id = m.provider_connection_id
        JOIN guest_principals gp ON gp.id = ${principal.id}
        WHERE g.singleton = true AND g.is_enabled = true
          AND gp.deleted_at IS NULL AND gp.idle_expires_at > now()
          AND gp.absolute_expires_at > now()
          AND p.provider_model_id = ${providerModelId}
          AND m.is_enabled = true AND m.is_available = true
          AND c.is_enabled = true
      `;
      const quota = rows[0];
      if (!quota) throw new AccessModelNotAllowedError();
      const settings = await transaction<
        [{ global_daily_request_limit: number }]
      >`
        SELECT global_daily_request_limit FROM guest_settings
        WHERE singleton = true FOR UPDATE
      `;
      await this.incrementCounter(transaction, {
        counterKey: 'guest-global',
        limit: settings[0]?.global_daily_request_limit ?? 0,
        modelId: null,
        scope: 'guest_global',
        subjectId: null,
        usageDate,
      });
      await this.incrementCounter(transaction, {
        counterKey: `guest-session:${principal.id}`,
        limit: quota.account_limit,
        modelId: null,
        scope: 'guest_session',
        subjectId: principal.id,
        usageDate,
      });
      await this.incrementCounter(transaction, {
        counterKey: `guest-model:${principal.id}:${providerModelId}`,
        limit: quota.model_limit,
        modelId: providerModelId,
        scope: 'guest_model',
        subjectId: principal.id,
        usageDate,
      });
    });
  }

  private async assertModelsExist(
    transaction: DatabaseTransaction,
    ids: string[],
  ): Promise<void> {
    if (ids.length === 0) return;
    const rows = await transaction<[{ id: string }]>`
      SELECT id FROM provider_models WHERE id IN ${transaction(ids)}
    `;
    if (rows.length !== new Set(ids).size) {
      throw new AccessSubjectNotFoundError();
    }
  }

  private async incrementCounter(
    transaction: DatabaseTransaction,
    input: {
      counterKey: string;
      limit: number | null;
      modelId: string | null;
      scope: string;
      subjectId: string | null;
      usageDate: string;
    },
  ): Promise<void> {
    const rows = await transaction<[{ request_count: number }]>`
      INSERT INTO daily_usage_counters (
        usage_date, counter_key, scope, subject_id, provider_model_id,
        request_count
      ) VALUES (
        ${input.usageDate}, ${input.counterKey}, ${input.scope},
        ${input.subjectId}, ${input.modelId}, 1
      )
      ON CONFLICT (usage_date, counter_key) DO UPDATE
      SET request_count = daily_usage_counters.request_count + 1
      WHERE ${input.limit}::integer IS NULL
        OR daily_usage_counters.request_count < ${input.limit}
      RETURNING request_count
    `;
    if (!rows[0]) throw new AccessDailyLimitError(input.scope);
  }
}
