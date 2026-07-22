import { Injectable } from '@nestjs/common';

import type { DatabaseTransaction } from '@modelnaru/database';

import { DatabaseService } from './database.service.js';

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
        temperature, top_p, updated_at
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
          max_output_tokens = ${input.maxOutputTokens},
          prompt_version = prompt_version + 1
        WHERE singleton = true
        RETURNING provider_model_id, prompt, prompt_version,
          max_output_tokens, temperature, top_p, updated_at
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
    branchId: string;
    conversationId: string;
    coveredMessageCount: number;
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
    await this.database.getClient()`
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
    `;
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
        })},
        ${input.ipHash}
      )
    `;
  }
}
