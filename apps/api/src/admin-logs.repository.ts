import { Injectable } from '@nestjs/common';

import type { DatabaseTransaction, JSONValue } from '@modelnaru/database';

import { DatabaseService } from './database.service.js';

export type AdminLogCategory =
  'all' | 'ai' | 'security' | 'audit' | 'file' | 'system';

export interface AdminLogFilter {
  category: AdminLogCategory;
  level: string;
  limit: number;
  offset: number;
  search: string;
  since: Date;
  status: string;
}

export interface AdminLogItem {
  action: string;
  actorId: string | null;
  actorLabel: string | null;
  actorType: string | null;
  category: Exclude<AdminLogCategory, 'all'>;
  durationMs: number | null;
  errorCode: string | null;
  id: string;
  level: string;
  metadata: Record<string, unknown>;
  modelId: string | null;
  occurredAt: string;
  providerTemplateId: string | null;
  source: 'audit' | 'operational' | 'usage';
  status: string;
  targetId: string | null;
  targetType: string | null;
}

export interface AdminLogPage {
  items: AdminLogItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface LogRetentionSettings {
  aiRetentionDays: number;
  auditRetentionDays: number;
  fileRetentionDays: number;
  lastCleanupAt: string | null;
  lastCleanupDeletedCount: number;
  securityRetentionDays: number;
  systemRetentionDays: number;
  updatedAt: string;
}

export interface OperationalLogInput {
  action: string;
  actorId?: string | null;
  actorLabel?: string | null;
  actorType?: 'admin' | 'guest' | 'system' | 'user' | null;
  category: 'file' | 'security' | 'system';
  durationMs?: number | null;
  errorCode?: string | null;
  level?: 'debug' | 'error' | 'info' | 'warn';
  metadata?: Record<string, unknown>;
  modelId?: string | null;
  providerTemplateId?: string | null;
  status?: 'cancelled' | 'denied' | 'failed' | 'success';
  targetId?: string | null;
  targetType?: string | null;
}

interface RawLogRow {
  action: string;
  actor_id: string | null;
  actor_label: string | null;
  actor_type: string | null;
  category: Exclude<AdminLogCategory, 'all'>;
  duration_ms: number | null;
  error_code: string | null;
  id: string;
  level: string;
  metadata: Record<string, unknown>;
  model_id: string | null;
  occurred_at: Date;
  provider_template_id: string | null;
  source: 'audit' | 'operational' | 'usage';
  status: string;
  target_id: string | null;
  target_type: string | null;
  total_count: number;
}

interface RawSettings {
  ai_retention_days: number;
  audit_retention_days: number;
  file_retention_days: number;
  last_cleanup_at: Date | null;
  last_cleanup_deleted_count: number;
  security_retention_days: number;
  system_retention_days: number;
  updated_at: Date;
}

function mapLog(row: RawLogRow): AdminLogItem {
  return {
    action: row.action,
    actorId: row.actor_id,
    actorLabel: row.actor_label,
    actorType: row.actor_type,
    category: row.category,
    durationMs: row.duration_ms,
    errorCode: row.error_code,
    id: row.id,
    level: row.level,
    metadata: row.metadata,
    modelId: row.model_id,
    occurredAt: row.occurred_at.toISOString(),
    providerTemplateId: row.provider_template_id,
    source: row.source,
    status: row.status,
    targetId: row.target_id,
    targetType: row.target_type,
  };
}

function mapSettings(row: RawSettings): LogRetentionSettings {
  return {
    aiRetentionDays: row.ai_retention_days,
    auditRetentionDays: row.audit_retention_days,
    fileRetentionDays: row.file_retention_days,
    lastCleanupAt: row.last_cleanup_at?.toISOString() ?? null,
    lastCleanupDeletedCount: row.last_cleanup_deleted_count,
    securityRetentionDays: row.security_retention_days,
    systemRetentionDays: row.system_retention_days,
    updatedAt: row.updated_at.toISOString(),
  };
}

@Injectable()
export class AdminLogsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(filter: AdminLogFilter): Promise<AdminLogPage> {
    const pattern = `%${filter.search}%`;
    const rows = await this.database.getClient()<RawLogRow[]>`
      WITH unified AS (
        SELECT
          u.id, 'usage'::text AS source, 'ai'::text AS category,
          CASE WHEN u.status = 'failed' THEN 'error' ELSE 'info' END AS level,
          ('ai.' || u.operation_type)::text AS action, u.status::text,
          u.principal_type::text AS actor_type,
          u.principal_id::text AS actor_id,
          u.principal_label::text AS actor_label,
          'assistant_message'::text AS target_type,
          u.assistant_message_id AS target_id,
          u.provider_template_id_snapshot::text AS provider_template_id,
          u.model_id_snapshot::text AS model_id,
          CASE WHEN u.status = 'failed' THEN 'AI_REQUEST_FAILED' ELSE NULL END
            AS error_code,
          u.duration_ms,
          jsonb_build_object(
            'operationType', u.operation_type,
            'inputTokens', u.input_tokens,
            'outputTokens', u.output_tokens,
            'completedAt', u.completed_at
          ) AS metadata,
          u.started_at AS occurred_at
        FROM usage_events u
        UNION ALL
        SELECT
          a.id, 'audit'::text, 'audit'::text, 'info'::text,
          a.action::text, 'success'::text, a.actor_type::text,
          a.actor_id::text, a.actor_id::text, a.target_type::text,
          a.target_id, NULL::text, NULL::text, NULL::text, NULL::integer,
          jsonb_build_object(
            'before', a.before_data,
            'after', a.after_data,
            'reason', a.reason
          ),
          a.occurred_at
        FROM audit_logs a
        UNION ALL
        SELECT
          o.id, 'operational'::text, o.category::text, o.level::text,
          o.action::text, o.status::text, o.actor_type::text,
          o.actor_id::text, o.actor_label::text, o.target_type::text,
          o.target_id, o.provider_template_id_snapshot::text,
          o.model_id_snapshot::text, o.error_code::text, o.duration_ms,
          o.metadata, o.occurred_at
        FROM operational_logs o
      ),
      filtered AS (
        SELECT *
        FROM unified
        WHERE occurred_at >= ${filter.since}
          AND (${filter.category} = 'all' OR category = ${filter.category})
          AND (${filter.level} = 'all' OR level = ${filter.level})
          AND (${filter.status} = 'all' OR status = ${filter.status})
          AND (
            ${filter.search} = ''
            OR concat_ws(
              ' ', action, actor_type, actor_label, target_type,
              provider_template_id, model_id, error_code
            ) ILIKE ${pattern}
          )
      )
      SELECT *, count(*) OVER()::int AS total_count
      FROM filtered
      ORDER BY occurred_at DESC, id DESC
      LIMIT ${filter.limit}
      OFFSET ${filter.offset}
    `;
    return {
      items: rows.map(mapLog),
      page: Math.floor(filter.offset / filter.limit) + 1,
      pageSize: filter.limit,
      total: rows[0]?.total_count ?? 0,
    };
  }

  async detail(id: string): Promise<AdminLogItem | undefined> {
    const rows = await this.database.getClient()<RawLogRow[]>`
      WITH unified AS (
        SELECT
          u.id, 'usage'::text AS source, 'ai'::text AS category,
          CASE WHEN u.status = 'failed' THEN 'error' ELSE 'info' END AS level,
          ('ai.' || u.operation_type)::text AS action, u.status::text,
          u.principal_type::text AS actor_type,
          u.principal_id::text AS actor_id,
          u.principal_label::text AS actor_label,
          'assistant_message'::text AS target_type,
          u.assistant_message_id AS target_id,
          u.provider_template_id_snapshot::text AS provider_template_id,
          u.model_id_snapshot::text AS model_id,
          CASE WHEN u.status = 'failed' THEN 'AI_REQUEST_FAILED' ELSE NULL END
            AS error_code,
          u.duration_ms,
          jsonb_build_object(
            'operationType', u.operation_type,
            'inputTokens', u.input_tokens,
            'outputTokens', u.output_tokens,
            'completedAt', u.completed_at
          ) AS metadata,
          u.started_at AS occurred_at,
          1::int AS total_count
        FROM usage_events u
        WHERE u.id = ${id}
        UNION ALL
        SELECT
          a.id, 'audit'::text, 'audit'::text, 'info'::text,
          a.action::text, 'success'::text, a.actor_type::text,
          a.actor_id::text, a.actor_id::text, a.target_type::text,
          a.target_id, NULL::text, NULL::text, NULL::text, NULL::integer,
          jsonb_build_object(
            'before', a.before_data,
            'after', a.after_data,
            'reason', a.reason
          ),
          a.occurred_at, 1::int
        FROM audit_logs a
        WHERE a.id = ${id}
        UNION ALL
        SELECT
          o.id, 'operational'::text, o.category::text, o.level::text,
          o.action::text, o.status::text, o.actor_type::text,
          o.actor_id::text, o.actor_label::text, o.target_type::text,
          o.target_id, o.provider_template_id_snapshot::text,
          o.model_id_snapshot::text, o.error_code::text, o.duration_ms,
          o.metadata, o.occurred_at, 1::int
        FROM operational_logs o
        WHERE o.id = ${id}
      )
      SELECT * FROM unified LIMIT 1
    `;
    return rows[0] ? mapLog(rows[0]) : undefined;
  }

  async export(filter: Omit<AdminLogFilter, 'limit' | 'offset'>) {
    return this.list({ ...filter, limit: 10_000, offset: 0 });
  }

  async record(input: OperationalLogInput): Promise<void> {
    await this.database.getClient()`
      INSERT INTO operational_logs (
        category, level, action, status, actor_type, actor_id, actor_label,
        target_type, target_id, provider_template_id_snapshot,
        model_id_snapshot, error_code, duration_ms, metadata
      ) VALUES (
        ${input.category}, ${input.level ?? 'info'}, ${input.action},
        ${input.status ?? 'success'}, ${input.actorType ?? null},
        ${input.actorId ?? null}, ${input.actorLabel ?? null},
        ${input.targetType ?? null}, ${input.targetId ?? null},
        ${input.providerTemplateId ?? null}, ${input.modelId ?? null},
        ${input.errorCode ?? null}, ${input.durationMs ?? null},
        ${this.database.getClient().json((input.metadata ?? {}) as JSONValue)}
      )
    `;
  }

  async settings(): Promise<LogRetentionSettings> {
    const rows = await this.database.getClient()<RawSettings[]>`
      SELECT ai_retention_days, security_retention_days,
        audit_retention_days, file_retention_days, system_retention_days,
        last_cleanup_at, last_cleanup_deleted_count, updated_at
      FROM log_settings
      WHERE singleton = true
    `;
    if (!rows[0]) throw new Error('Log settings are missing');
    return mapSettings(rows[0]);
  }

  async updateSettings(
    input: Omit<
      LogRetentionSettings,
      'lastCleanupAt' | 'lastCleanupDeletedCount' | 'updatedAt'
    >,
    audit: { actorId: string; ipHash: Buffer | null },
  ): Promise<LogRetentionSettings> {
    await this.database.getClient().begin(async (transaction) => {
      const beforeRows = await transaction<RawSettings[]>`
        SELECT ai_retention_days, security_retention_days,
          audit_retention_days, file_retention_days, system_retention_days,
          last_cleanup_at, last_cleanup_deleted_count, updated_at
        FROM log_settings WHERE singleton = true FOR UPDATE
      `;
      const before = beforeRows[0];
      if (!before) throw new Error('Log settings are missing');
      await transaction`
        UPDATE log_settings
        SET ai_retention_days = ${input.aiRetentionDays},
          security_retention_days = ${input.securityRetentionDays},
          audit_retention_days = ${input.auditRetentionDays},
          file_retention_days = ${input.fileRetentionDays},
          system_retention_days = ${input.systemRetentionDays}
        WHERE singleton = true
      `;
      await this.audit(transaction, 'logs.settings_updated', audit, {
        after: input,
        before: mapSettings(before),
      });
    });
    return this.settings();
  }

  async cleanup(): Promise<number> {
    const rows = await this.database.getClient()<
      Array<{ deleted_count: number }>
    >`
      WITH settings AS (
        SELECT * FROM log_settings WHERE singleton = true
      ),
      ai AS (
        DELETE FROM usage_events
        WHERE started_at < now() - (
          (SELECT ai_retention_days FROM settings) * interval '1 day'
        )
        RETURNING 1
      ),
      audit AS (
        DELETE FROM audit_logs
        WHERE occurred_at < now() - (
          (SELECT audit_retention_days FROM settings) * interval '1 day'
        )
        RETURNING 1
      ),
      operational AS (
        DELETE FROM operational_logs
        WHERE occurred_at < now() - (
          CASE category
            WHEN 'security' THEN
              (SELECT security_retention_days FROM settings)
            WHEN 'file' THEN
              (SELECT file_retention_days FROM settings)
            ELSE (SELECT system_retention_days FROM settings)
          END * interval '1 day'
        )
        RETURNING 1
      )
      SELECT (
        (SELECT count(*) FROM ai)
        + (SELECT count(*) FROM audit)
        + (SELECT count(*) FROM operational)
      )::int AS deleted_count
    `;
    const deleted = rows[0]?.deleted_count ?? 0;
    await this.database.getClient()`
      UPDATE log_settings
      SET last_cleanup_at = now(),
        last_cleanup_deleted_count = ${deleted}
      WHERE singleton = true
    `;
    return deleted;
  }

  async auditAccess(
    action: 'logs.exported' | 'logs.viewed',
    audit: { actorId: string; ipHash: Buffer | null },
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.database.getClient().begin((transaction) =>
      this.audit(transaction, action, audit, {
        after: metadata,
        before: null,
      }),
    );
  }

  private async audit(
    transaction: DatabaseTransaction,
    action: string,
    audit: { actorId: string; ipHash: Buffer | null },
    metadata: { after: unknown; before: unknown },
  ): Promise<void> {
    await transaction`
      INSERT INTO audit_logs (
        actor_type, actor_id, action, target_type,
        before_data, after_data, ip_hash
      ) VALUES (
        'admin', ${audit.actorId}, ${action}, 'logs',
        ${
          metadata.before
            ? transaction.json(metadata.before as JSONValue)
            : null
        },
        ${
          metadata.after ? transaction.json(metadata.after as JSONValue) : null
        },
        ${audit.ipHash}
      )
    `;
  }
}
