import { Injectable } from '@nestjs/common';

import type { DatabaseTransaction, JSONValue } from '@modelnaru/database';
import type { ProviderGenerationParameters } from './provider-parameter-policy.js';

import { DatabaseService } from './database.service.js';
import type { ChatProviderRuntime } from './chat-provider.service.js';

export interface SummaryModelOption {
  connectionName: string;
  displayName: string | null;
  id: string;
  modelId: string;
  templateId: string;
}

export interface SummarizationSettings {
  maxOutputTokens: number;
  prompt: string;
  promptVersion: number;
  providerModelId: string | null;
  providerParameters: ProviderGenerationParameters;
  temperature: number | null;
  topP: number | null;
  updatedAt: Date;
}

export interface StoredContextSummary {
  coveredMessageCount: number;
  firstMessageId: string;
  id: string;
  lastMessageId: string;
  promptVersion: number;
  providerModelId: string | null;
  summary: string;
}

interface RawSettings {
  max_output_tokens: number;
  prompt: string;
  prompt_version: number;
  provider_model_id: string | null;
  provider_parameters: ProviderGenerationParameters;
  temperature: number | null;
  top_p: number | null;
  updated_at: Date;
}

interface RawSummary {
  covered_message_count: number;
  first_message_id: string;
  id: string;
  last_message_id: string;
  prompt_version: number;
  provider_model_id: string | null;
  summary: string;
}

function mapSettings(row: RawSettings): SummarizationSettings {
  return {
    maxOutputTokens: row.max_output_tokens,
    prompt: row.prompt,
    promptVersion: row.prompt_version,
    providerModelId: row.provider_model_id,
    providerParameters: row.provider_parameters,
    temperature: row.temperature,
    topP: row.top_p,
    updatedAt: row.updated_at,
  };
}

export class SummarizationModelUnavailableError extends Error {}

@Injectable()
export class SummarizationRepository {
  constructor(private readonly database: DatabaseService) {}

  async getSettings(): Promise<SummarizationSettings> {
    const rows = await this.database.getClient()<RawSettings[]>`
      SELECT provider_model_id, prompt, prompt_version, max_output_tokens,
        temperature, top_p, provider_parameters, updated_at
      FROM summarization_settings WHERE singleton = true
    `;
    if (!rows[0]) throw new Error('Summarization settings are missing');
    return mapSettings(rows[0]);
  }

  async listModels(): Promise<SummaryModelOption[]> {
    return this.database.getClient()<SummaryModelOption[]>`
      SELECT m.id, m.model_id AS "modelId", m.display_name AS "displayName",
        c.name AS "connectionName", c.template_id AS "templateId"
      FROM provider_models m
      JOIN provider_connections c ON c.id = m.provider_connection_id
      WHERE m.is_enabled = true AND m.is_available = true
        AND c.is_enabled = true AND c.status = 'ready'
      ORDER BY lower(c.name), lower(COALESCE(m.display_name, m.model_id))
    `;
  }

  async updateSettings(input: {
    actorId: string;
    ipHash: Buffer | null;
    maxOutputTokens: number;
    prompt: string;
    providerModelId: string | null;
    providerParameters: ProviderGenerationParameters;
    temperature: number | null;
    topP: number | null;
  }): Promise<SummarizationSettings> {
    return this.database.getClient().begin(async (transaction) => {
      if (input.providerModelId) {
        const usable = await transaction<{ id: string }[]>`
          SELECT m.id FROM provider_models m
          JOIN provider_connections c ON c.id = m.provider_connection_id
          WHERE m.id = ${input.providerModelId} AND m.is_enabled = true
            AND m.is_available = true AND c.is_enabled = true
            AND c.status = 'ready' LIMIT 1
        `;
        if (!usable[0]) throw new SummarizationModelUnavailableError();
      }
      const rows = await transaction<RawSettings[]>`
        UPDATE summarization_settings SET
          provider_model_id = ${input.providerModelId}, prompt = ${input.prompt},
          temperature = ${input.temperature}, top_p = ${input.topP},
          provider_parameters = ${transaction.json(input.providerParameters as unknown as JSONValue)},
          max_output_tokens = ${input.maxOutputTokens},
          prompt_version = prompt_version + 1
        WHERE singleton = true
        RETURNING provider_model_id, prompt, prompt_version,
          max_output_tokens, temperature, top_p, provider_parameters, updated_at
      `;
      await this.audit(transaction, input, rows[0]!.prompt_version);
      return mapSettings(rows[0]!);
    });
  }

  async findReusable(
    conversationId: string,
    messageIds: string[],
    providerModelId: string,
    promptVersion: number,
  ): Promise<StoredContextSummary | undefined> {
    if (messageIds.length === 0) return undefined;
    const rows = await this.database.getClient()<RawSummary[]>`
      SELECT id, first_message_id, last_message_id, provider_model_id,
        prompt_version, covered_message_count, summary
      FROM context_summaries
      WHERE conversation_id = ${conversationId}
        AND last_message_id = ANY(${messageIds}::uuid[])
        AND provider_model_id = ${providerModelId}
        AND prompt_version = ${promptVersion}
      ORDER BY covered_message_count DESC, created_at DESC LIMIT 1
    `;
    const row = rows[0];
    return row
      ? {
          coveredMessageCount: row.covered_message_count,
          firstMessageId: row.first_message_id,
          id: row.id,
          lastMessageId: row.last_message_id,
          promptVersion: row.prompt_version,
          providerModelId: row.provider_model_id,
          summary: row.summary,
        }
      : undefined;
  }

  async save(input: {
    jobId?: string;
    branchId: string;
    conversationId: string;
    coveredMessageCount: number;
    durationMs: number;
    firstMessageId: string;
    inputTokens: number | null;
    lastMessageId: string;
    modelId: string;
    outputTokens: number | null;
    promptVersion: number;
    providerModelId: string;
    summary: string;
    templateId: string;
  }): Promise<void> {
    await this.database.getClient().begin(async (transaction) => {
      if (input.jobId) {
        const active = await transaction<
          { id: string }[]
        >`SELECT id FROM chat_jobs
          WHERE id = ${input.jobId} AND status IN ('pending', 'streaming')
            AND EXISTS (SELECT 1 FROM sessions s WHERE s.id = started_session_id AND s.revoked_at IS NULL
              AND s.idle_expires_at > now() AND s.absolute_expires_at > now()) FOR UPDATE`;
        if (!active[0]) throw new Error('Summary job is no longer active');
      }
      const inserted = await transaction<{ id: string }[]>`
        INSERT INTO context_summaries (
          conversation_id, branch_id, first_message_id, last_message_id,
          provider_model_id, provider_template_id_snapshot, model_id_snapshot,
          prompt_version, covered_message_count, summary, input_tokens, output_tokens
        ) VALUES (
          ${input.conversationId}, ${input.branchId}, ${input.firstMessageId},
          ${input.lastMessageId}, ${input.providerModelId}, ${input.templateId},
          ${input.modelId}, ${input.promptVersion}, ${input.coveredMessageCount},
          ${input.summary}, ${input.inputTokens}, ${input.outputTokens}
        ) ON CONFLICT DO NOTHING
        RETURNING id
      `;
      if (!inserted[0]) return;
    });
  }

  async beginAttempt(input: {
    conversationId: string;
    jobId: string | undefined;
    attempt: number;
    runtime: ChatProviderRuntime;
  }): Promise<string> {
    return this.database.getClient().begin(async (tx) => {
      if (input.jobId) {
        const active = await tx<{ id: string }[]>`SELECT id FROM chat_jobs
          WHERE id = ${input.jobId} AND conversation_id = ${input.conversationId}
            AND status IN ('pending', 'streaming') FOR UPDATE`;
        if (!active[0]) throw new Error('Summary job is no longer active');
      }
      const rows = await tx<{ id: string }[]>`INSERT INTO usage_events (
        principal_type, principal_id, principal_label, provider_model_id,
        provider_template_id_snapshot, model_id_snapshot, operation_type,
        status, conversation_id, job_id, attempt_number)
        SELECT CASE WHEN c.user_id IS NOT NULL THEN 'user' ELSE 'guest' END,
          COALESCE(c.user_id,c.guest_id), COALESCE(u.username, 'Guest'),
          ${input.runtime.providerModelId}, ${input.runtime.template.id}, ${input.runtime.modelId},
          'summary', 'pending', c.id, ${input.jobId ?? null}, ${input.attempt}
        FROM conversations c LEFT JOIN users u ON u.id = c.user_id
        WHERE c.id = ${input.conversationId} RETURNING id`;
      if (!rows[0]) throw new Error('Summary owner is missing');
      return rows[0].id;
    });
  }

  async markAttemptSent(id: string): Promise<void> {
    await this.database.getClient()`UPDATE usage_events SET sent_at = now() WHERE id = ${id} AND status = 'pending'`;
  }

  async recordAttemptTokens(
    id: string,
    inputTokens: number | null,
    outputTokens: number | null,
  ): Promise<void> {
    await this.database.getClient()`UPDATE usage_events SET input_tokens = ${inputTokens}, output_tokens = ${outputTokens},
      usage_known = ${inputTokens !== null || outputTokens !== null} WHERE id = ${id} AND status = 'pending'`;
  }

  async finishAttempt(
    id: string,
    status: 'completed' | 'failed' | 'cancelled',
    inputTokens: number | null,
    outputTokens: number | null,
  ): Promise<void> {
    await this.database.getClient()`UPDATE usage_events SET status = ${status},
      input_tokens = ${inputTokens}, output_tokens = ${outputTokens}, usage_known = ${inputTokens !== null || outputTokens !== null},
      duration_ms = GREATEST(0, floor(extract(epoch FROM (now()-started_at))*1000)::integer), completed_at = now()
      WHERE id = ${id} AND status = 'pending'`;
  }

  private async audit(
    transaction: DatabaseTransaction,
    input: {
      actorId: string;
      ipHash: Buffer | null;
      maxOutputTokens: number;
      providerModelId: string | null;
      temperature: number | null;
      topP: number | null;
      providerParameters: ProviderGenerationParameters;
    },
    promptVersion: number,
  ): Promise<void> {
    await transaction`
      INSERT INTO audit_logs (
        actor_type, actor_id, action, target_type, after_data, ip_hash
      ) VALUES (
        'admin', ${input.actorId}, 'summarization.settings_updated',
        'summarization_settings',
        ${transaction.json({
          maxOutputTokens: input.maxOutputTokens,
          promptVersion,
          providerModelId: input.providerModelId,
          temperature: input.temperature,
          topP: input.topP,
          providerParameters: input.providerParameters,
        } as unknown as JSONValue)},
        ${input.ipHash}
      )
    `;
  }
}
