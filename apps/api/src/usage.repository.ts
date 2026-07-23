import { Injectable } from '@nestjs/common';

import { DatabaseService } from './database.service.js';

interface RawTotals {
  active_models: number;
  active_users: number;
  cancelled_requests: number;
  completed_requests: number;
  failed_requests: number;
  input_tokens: number;
  output_tokens: number;
  pending_requests: number;
  request_count: number;
}

interface RawUserUsage {
  cancelled_requests: number;
  completed_requests: number;
  failed_requests: number;
  input_tokens: number;
  output_tokens: number;
  principal_id: string;
  principal_label: string;
  principal_type: 'guest' | 'user';
  request_count: number;
}

interface RawModelUsage {
  cancelled_requests: number;
  completed_requests: number;
  failed_requests: number;
  input_tokens: number;
  model_id: string;
  output_tokens: number;
  provider_template_id: string;
  request_count: number;
}

interface RawUsageEvent {
  completed_at: Date | null;
  duration_ms: number | null;
  id: string;
  input_tokens: number | null;
  model_id: string;
  operation_type: 'chat' | 'summary';
  output_tokens: number | null;
  principal_label: string;
  principal_type: 'guest' | 'user';
  provider_template_id: string;
  started_at: Date;
  status: 'cancelled' | 'completed' | 'failed' | 'pending';
}

export interface UsageMetric {
  cancelledRequests: number;
  completedRequests: number;
  failedRequests: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  totalTokens: number;
}

export interface UsageDashboard {
  byModel: Array<
    UsageMetric & {
      modelId: string;
      providerTemplateId: string;
    }
  >;
  byUser: Array<
    UsageMetric & {
      principalId: string;
      principalLabel: string;
      principalType: 'guest' | 'user';
    }
  >;
  recent: Array<{
    completedAt: string | null;
    durationMs: number | null;
    id: string;
    inputTokens: number | null;
    modelId: string;
    operationType: 'chat' | 'summary';
    outputTokens: number | null;
    principalLabel: string;
    principalType: 'guest' | 'user';
    providerTemplateId: string;
    startedAt: string;
    status: 'cancelled' | 'completed' | 'failed' | 'pending';
    totalTokens: number;
  }>;
  totals: UsageMetric & {
    activeModels: number;
    activeUsers: number;
    pendingRequests: number;
  };
}

function metric(row: {
  cancelled_requests: number;
  completed_requests: number;
  failed_requests: number;
  input_tokens: number;
  output_tokens: number;
  request_count: number;
}): UsageMetric {
  return {
    cancelledRequests: row.cancelled_requests,
    completedRequests: row.completed_requests,
    failedRequests: row.failed_requests,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    requestCount: row.request_count,
    totalTokens: row.input_tokens + row.output_tokens,
  };
}

@Injectable()
export class UsageRepository {
  constructor(private readonly database: DatabaseService) {}

  async dashboard(since: Date): Promise<UsageDashboard> {
    const sql = this.database.getClient();
    const [totalRows, userRows, modelRows, eventRows] = await Promise.all([
      sql<RawTotals[]>`
        SELECT
          count(*)::integer AS request_count,
          count(*) FILTER (WHERE status = 'completed')::integer
            AS completed_requests,
          count(*) FILTER (WHERE status = 'failed')::integer
            AS failed_requests,
          count(*) FILTER (WHERE status = 'cancelled')::integer
            AS cancelled_requests,
          count(*) FILTER (WHERE status = 'pending')::integer
            AS pending_requests,
          count(DISTINCT (principal_type, principal_id))::integer
            AS active_users,
          count(DISTINCT (provider_template_id_snapshot, model_id_snapshot))::integer
            AS active_models,
          coalesce(sum(input_tokens), 0)::float8 AS input_tokens,
          coalesce(sum(output_tokens), 0)::float8 AS output_tokens
        FROM usage_events
        WHERE started_at >= ${since}
      `,
      sql<RawUserUsage[]>`
        SELECT
          principal_type,
          principal_id,
          (array_agg(principal_label ORDER BY started_at DESC))[1]
            AS principal_label,
          count(*)::integer AS request_count,
          count(*) FILTER (WHERE status = 'completed')::integer
            AS completed_requests,
          count(*) FILTER (WHERE status = 'failed')::integer
            AS failed_requests,
          count(*) FILTER (WHERE status = 'cancelled')::integer
            AS cancelled_requests,
          coalesce(sum(input_tokens), 0)::float8 AS input_tokens,
          coalesce(sum(output_tokens), 0)::float8 AS output_tokens
        FROM usage_events
        WHERE started_at >= ${since}
        GROUP BY principal_type, principal_id
        ORDER BY
          coalesce(sum(input_tokens), 0) + coalesce(sum(output_tokens), 0) DESC,
          request_count DESC,
          principal_label
      `,
      sql<RawModelUsage[]>`
        SELECT
          provider_template_id_snapshot AS provider_template_id,
          model_id_snapshot AS model_id,
          count(*)::integer AS request_count,
          count(*) FILTER (WHERE status = 'completed')::integer
            AS completed_requests,
          count(*) FILTER (WHERE status = 'failed')::integer
            AS failed_requests,
          count(*) FILTER (WHERE status = 'cancelled')::integer
            AS cancelled_requests,
          coalesce(sum(input_tokens), 0)::float8 AS input_tokens,
          coalesce(sum(output_tokens), 0)::float8 AS output_tokens
        FROM usage_events
        WHERE started_at >= ${since}
        GROUP BY provider_template_id_snapshot, model_id_snapshot
        ORDER BY
          coalesce(sum(input_tokens), 0) + coalesce(sum(output_tokens), 0) DESC,
          request_count DESC,
          provider_template_id_snapshot,
          model_id_snapshot
      `,
      sql<RawUsageEvent[]>`
        SELECT
          id,
          principal_type,
          principal_label,
          provider_template_id_snapshot AS provider_template_id,
          model_id_snapshot AS model_id,
          operation_type,
          status,
          input_tokens,
          output_tokens,
          duration_ms,
          started_at,
          completed_at
        FROM usage_events
        WHERE started_at >= ${since}
        ORDER BY started_at DESC
        LIMIT 50
      `,
    ]);
    const totals = totalRows[0] ?? {
      active_models: 0,
      active_users: 0,
      cancelled_requests: 0,
      completed_requests: 0,
      failed_requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      pending_requests: 0,
      request_count: 0,
    };
    return {
      byModel: modelRows.map((row) => ({
        ...metric(row),
        modelId: row.model_id,
        providerTemplateId: row.provider_template_id,
      })),
      byUser: userRows.map((row) => ({
        ...metric(row),
        principalId: row.principal_id,
        principalLabel: row.principal_label,
        principalType: row.principal_type,
      })),
      recent: eventRows.map((row) => ({
        completedAt: row.completed_at?.toISOString() ?? null,
        durationMs: row.duration_ms,
        id: row.id,
        inputTokens: row.input_tokens,
        modelId: row.model_id,
        operationType: row.operation_type,
        outputTokens: row.output_tokens,
        principalLabel: row.principal_label,
        principalType: row.principal_type,
        providerTemplateId: row.provider_template_id,
        startedAt: row.started_at.toISOString(),
        status: row.status,
        totalTokens: (row.input_tokens ?? 0) + (row.output_tokens ?? 0),
      })),
      totals: {
        ...metric(totals),
        activeModels: totals.active_models,
        activeUsers: totals.active_users,
        pendingRequests: totals.pending_requests,
      },
    };
  }
}
