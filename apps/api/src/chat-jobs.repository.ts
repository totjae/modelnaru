import { Injectable } from '@nestjs/common';
import type { DatabaseTransaction } from '@modelnaru/database';

import { AccessRepository } from './access.repository.js';
import type { ChatPrincipal } from './chats.repository.js';
import { ConversationNotFoundError } from './chats.repository.js';
import type { ChatParameters } from './chat-streaming.js';
import {
  ChatMessagesRepository,
  type ChatTurnRecord,
} from './chat-messages.repository.js';
import { DatabaseService } from './database.service.js';

export type ChatJobStatus =
  'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled';
export type ChatJobKind = 'turn' | 'regenerate';

interface JobRow {
  id: string;
  kind: ChatJobKind;
  status: ChatJobStatus;
  revision: string;
  conversation_id: string;
  branch_id: string;
  user_message_id: string | null;
  assistant_message_id: string;
  provider_model_id: string | null;
  started_session_id: string;
  maximum_generated_text_bytes: number;
  checkpoint_content: string;
  error_code: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: Date;
  finished_at: Date | null;
  request_fingerprint: Buffer;
}

export interface ChatJobRecord {
  id: string;
  kind: ChatJobKind;
  status: ChatJobStatus;
  revision: string;
  conversationId: string;
  branchId: string;
  userMessageId: string | null;
  assistantMessageId: string;
  providerModelId: string | null;
  startedSessionId: string;
  maximumGeneratedTextBytes: number;
  content: string;
  errorCode: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  startedAt: Date;
  finishedAt: Date | null;
}

function mapJob(row: JobRow): ChatJobRecord {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    revision: String(row.revision),
    conversationId: row.conversation_id,
    branchId: row.branch_id,
    userMessageId: row.user_message_id,
    assistantMessageId: row.assistant_message_id,
    providerModelId: row.provider_model_id,
    startedSessionId: row.started_session_id,
    maximumGeneratedTextBytes: row.maximum_generated_text_bytes,
    content: row.checkpoint_content,
    errorCode: row.error_code,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    startedAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

export class ChatJobConflictError extends Error {
  constructor(
    readonly code:
      | 'CHAT_IDEMPOTENCY_CONFLICT'
      | 'CHAT_PRINCIPAL_BUSY'
      | 'CHAT_CONVERSATION_BUSY'
      | 'CHAT_NOT_CANCELLABLE'
      | 'CHAT_SERVER_BUSY',
  ) {
    super(code);
  }
}

export interface StartChatJobInput {
  principal: ChatPrincipal;
  conversationId: string;
  kind: ChatJobKind;
  idempotencyKey: string;
  fingerprint: Buffer;
  settingsRevision: string;
  maximumGeneratedTextBytes: number;
  startedSessionId: string;
  attachmentIds: string[];
  content: string;
  regenerateAssistantMessageId?: string;
  providerModelId: string;
  modelId: string;
  templateId: string;
  parameters: ChatParameters;
}

@Injectable()
export class ChatJobsRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly messages: ChatMessagesRepository,
    private readonly access: AccessRepository,
  ) {}

  async existing(
    principal: ChatPrincipal,
    key: string,
    fingerprint: Buffer,
  ): Promise<ChatJobRecord | null> {
    const rows = await this.database.getClient()<JobRow[]>`
      SELECT j.* FROM chat_jobs j
      WHERE j.idempotency_key = ${key}
        AND j.user_id IS NOT DISTINCT FROM ${principal.type === 'user' ? principal.id : null}::uuid
        AND j.guest_id IS NOT DISTINCT FROM ${principal.type === 'guest' ? principal.id : null}::uuid
        AND (j.finished_at IS NULL OR j.finished_at > now() - interval '7 days')
      LIMIT 1
    `;
    if (!rows[0]) return null;
    if (!rows[0].request_fingerprint.equals(fingerprint))
      throw new ChatJobConflictError('CHAT_IDEMPOTENCY_CONFLICT');
    return mapJob(rows[0]);
  }

  async start(
    input: StartChatJobInput,
    reserveSlot: () => boolean,
  ): Promise<{ job: ChatJobRecord; turn?: ChatTurnRecord }> {
    const { principal } = input;
    return this.database.getClient().begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`chat-start:${principal.type}:${principal.id}`}))`;
      await tx`DELETE FROM chat_jobs WHERE idempotency_key = ${input.idempotencyKey}
        AND user_id IS NOT DISTINCT FROM ${principal.type === 'user' ? principal.id : null}::uuid
        AND guest_id IS NOT DISTINCT FROM ${principal.type === 'guest' ? principal.id : null}::uuid
        AND finished_at <= now() - interval '7 days'`;
      const existing = await tx<JobRow[]>`
        SELECT * FROM chat_jobs WHERE idempotency_key = ${input.idempotencyKey}
          AND user_id IS NOT DISTINCT FROM ${principal.type === 'user' ? principal.id : null}::uuid
          AND guest_id IS NOT DISTINCT FROM ${principal.type === 'guest' ? principal.id : null}::uuid
        LIMIT 1
      `;
      if (existing[0]) {
        if (!existing[0].request_fingerprint.equals(input.fingerprint)) {
          throw new ChatJobConflictError('CHAT_IDEMPOTENCY_CONFLICT');
        }
        return { job: mapJob(existing[0]) };
      }
      const active = await tx<Array<{ conversation_id: string }>>`
        SELECT conversation_id FROM chat_jobs
        WHERE status IN ('pending', 'streaming')
          AND (user_id = ${principal.type === 'user' ? principal.id : null}::uuid
            OR guest_id = ${principal.type === 'guest' ? principal.id : null}::uuid)
        LIMIT 1
      `;
      if (active[0]) {
        throw new ChatJobConflictError(
          active[0].conversation_id === input.conversationId
            ? 'CHAT_CONVERSATION_BUSY'
            : 'CHAT_PRINCIPAL_BUSY',
        );
      }
      if (!reserveSlot()) throw new ChatJobConflictError('CHAT_SERVER_BUSY');
      const turn =
        input.kind === 'regenerate'
          ? await this.messages.beginRegeneration(
              principal,
              {
                assistantMessageId: input.regenerateAssistantMessageId!,
                conversationId: input.conversationId,
                modelId: input.modelId,
                parameters: input.parameters,
                providerModelId: input.providerModelId,
                settingsRevision: input.settingsRevision,
                templateId: input.templateId,
              },
              tx,
            )
          : await this.messages.beginTurn(
              principal,
              {
                attachmentIds: input.attachmentIds,
                content: input.content,
                conversationId: input.conversationId,
                modelId: input.modelId,
                parameters: input.parameters,
                providerModelId: input.providerModelId,
                settingsRevision: input.settingsRevision,
                templateId: input.templateId,
              },
              tx,
            );
      const quota = await this.access.reserveDailyRequest(
        principal,
        input.providerModelId,
        tx,
      );
      const inserted = await tx<JobRow[]>`
        INSERT INTO chat_jobs (
          conversation_id, user_id, guest_id, started_session_id, kind,
          idempotency_key, request_fingerprint, settings_revision,
          maximum_generated_text_bytes, branch_id, user_message_id,
          assistant_message_id, provider_model_id
        ) VALUES (
          ${input.conversationId}, ${principal.type === 'user' ? principal.id : null},
          ${principal.type === 'guest' ? principal.id : null}, ${input.startedSessionId},
          ${input.kind}, ${input.idempotencyKey}, ${input.fingerprint},
          ${input.settingsRevision}::bigint, ${input.maximumGeneratedTextBytes},
          ${turn.branchId}, ${turn.userMessageId}, ${turn.assistantMessageId},
          ${input.providerModelId}
        ) RETURNING *
      `;
      const row = inserted[0]!;
      await tx`
        INSERT INTO chat_quota_reservations (job_id, usage_date, counter_keys)
        VALUES (${row.id}, ${quota.usageDate}::date, ${quota.counterKeys}::text[])
      `;
      await tx`
        UPDATE usage_events SET job_id = ${row.id}, conversation_id = ${input.conversationId}
        WHERE assistant_message_id = ${turn.assistantMessageId}
      `;
      if (input.attachmentIds.length) {
        await tx`UPDATE attachments SET in_use_job_id = ${row.id}
          WHERE id = ANY(${input.attachmentIds}::uuid[]) AND message_id = ${turn.userMessageId}`;
      }
      if (turn.imageAttachments.length) {
        const keys = turn.imageAttachments.map((image) => image.storageKey);
        await tx`UPDATE attachments SET in_use_job_id=${row.id} WHERE conversation_id=${input.conversationId} AND storage_key=ANY(${keys}::text[])`;
      }
      return { job: mapJob(row), turn };
    });
  }

  async get(
    principal: ChatPrincipal,
    conversationId: string,
    jobId: string,
  ): Promise<ChatJobRecord> {
    const rows = await this.database.getClient()<JobRow[]>`
      SELECT j.* FROM chat_jobs j JOIN conversations c ON c.id = j.conversation_id
      WHERE j.id = ${jobId} AND j.conversation_id = ${conversationId}
        AND c.user_id IS NOT DISTINCT FROM ${principal.type === 'user' ? principal.id : null}::uuid
        AND c.guest_id IS NOT DISTINCT FROM ${principal.type === 'guest' ? principal.id : null}::uuid
        AND (j.finished_at IS NULL OR j.finished_at > now() - interval '7 days')
      LIMIT 1
    `;
    if (!rows[0]) throw new ConversationNotFoundError();
    return mapJob(rows[0]);
  }

  async markStreaming(jobId: string): Promise<ChatJobRecord | null> {
    return this.database.getClient().begin(async (tx) => {
      const rows = await tx<JobRow[]>`
        UPDATE chat_jobs SET status = 'streaming', revision = revision + 1
        WHERE id = ${jobId} AND status = 'pending' RETURNING *
      `;
      if (!rows[0]) return null;
      await tx`UPDATE messages SET status = 'streaming' WHERE id = ${rows[0].assistant_message_id} AND status = 'pending'`;
      return mapJob(rows[0]);
    });
  }

  async markSent(jobId: string): Promise<void> {
    await this.database.getClient().begin(async (tx) => {
      const sent = await tx<{ job_id: string }[]>`
        UPDATE chat_quota_reservations SET state = 'charged', first_sent_at = now()
        WHERE job_id = ${jobId} AND state = 'reserved' RETURNING job_id
      `;
      if (sent[0]) {
        await tx`UPDATE chat_jobs SET quota_state = 'charged' WHERE id = ${jobId}`;
        await tx`UPDATE usage_events SET sent_at = now() WHERE job_id = ${jobId} AND operation_type = 'chat'`;
      }
    });
  }

  async recordUsage(
    jobId: string,
    inputTokens: number | null,
    outputTokens: number | null,
  ): Promise<void> {
    await this.database.getClient()`
      UPDATE usage_events SET input_tokens = ${inputTokens}, output_tokens = ${outputTokens},
        usage_known = ${inputTokens !== null || outputTokens !== null}
      WHERE job_id = ${jobId} AND operation_type = 'chat' AND status = 'pending'
    `;
  }

  async checkpoint(
    jobId: string,
    content: string,
  ): Promise<ChatJobRecord | null> {
    const rows = await this.database.getClient()<JobRow[]>`
      UPDATE chat_jobs SET checkpoint_content = ${content}, revision = revision + 1
      WHERE id = ${jobId} AND status IN ('pending', 'streaming')
        AND octet_length(${content}) <= maximum_generated_text_bytes
      RETURNING *
    `;
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async terminal(
    jobId: string,
    input: {
      status: 'completed' | 'failed' | 'cancelled';
      content: string;
      errorCode: string | null;
      inputTokens: number | null;
      outputTokens: number | null;
      activateBranch?: { branchId: string; previousActiveBranchId: string };
    },
  ): Promise<ChatJobRecord | null> {
    return this.database.getClient().begin(async (tx) => {
      const rows = await tx<JobRow[]>`
        UPDATE chat_jobs SET status = ${input.status}, checkpoint_content = ${input.content},
          error_code = ${input.errorCode}, input_tokens = ${input.inputTokens},
          output_tokens = ${input.outputTokens}, finished_at = now(), revision = revision + 1
        WHERE id = ${jobId} AND status IN ('pending', 'streaming')
          AND octet_length(${input.content}) <= maximum_generated_text_bytes
        RETURNING *
      `;
      const row = rows[0];
      if (!row) return null;
      await tx`
        UPDATE messages SET status = ${input.status}, content = ${input.content},
          input_tokens = ${input.inputTokens}, output_tokens = ${input.outputTokens},
          error_code = ${input.errorCode},
          completed_at = ${input.status === 'completed' ? new Date() : null}
        WHERE id = ${row.assistant_message_id} AND status IN ('pending', 'streaming')
      `;
      await tx`
        UPDATE usage_events SET status = ${input.status},
          input_tokens = ${input.inputTokens}, output_tokens = ${input.outputTokens},
          usage_known = ${input.inputTokens !== null || input.outputTokens !== null},
          duration_ms = GREATEST(0, floor(extract(epoch FROM (now() - started_at)) * 1000)::integer),
          completed_at = now()
        WHERE job_id = ${jobId} AND operation_type = 'chat' AND status = 'pending'
      `;
      await this.releaseUnsentQuota(tx, row.id);
      await tx`UPDATE attachments SET in_use_job_id = NULL WHERE in_use_job_id = ${jobId}`;
      if (input.status === 'completed' && input.activateBranch) {
        await tx`UPDATE conversations SET active_branch_id = ${input.activateBranch.branchId}
          WHERE id = ${row.conversation_id} AND active_branch_id = ${input.activateBranch.previousActiveBranchId}`;
      }
      if (input.status === 'completed') {
        await tx`SELECT id FROM conversations WHERE id = ${row.conversation_id} FOR UPDATE`;
        const tasks = await tx<
          { conversation_id: string }[]
        >`INSERT INTO conversation_title_tasks
          (conversation_id, started_session_id, provider_model_id, settings_version)
          SELECT c.id, ${row.started_session_id}, s.provider_model_id, s.version
          FROM conversations c CROSS JOIN title_generation_settings s
          WHERE c.id = ${row.conversation_id} AND c.title_source = 'default' AND s.provider_model_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id
              AND m.role = 'assistant' AND m.status = 'completed' AND m.id <> ${row.assistant_message_id})
          ON CONFLICT DO NOTHING RETURNING conversation_id`;
        if (tasks[0])
          await tx`UPDATE conversations SET title_status = 'pending' WHERE id = ${row.conversation_id}`;
      }
      return mapJob(row);
    });
  }

  async startedSessionValid(job: ChatJobRecord): Promise<boolean> {
    const rows = await this.database.getClient()<{ id: string }[]>`
      SELECT s.id FROM sessions s
      WHERE s.id = ${job.startedSessionId} AND s.revoked_at IS NULL
        AND s.idle_expires_at > now() AND s.absolute_expires_at > now()
        AND (s.user_id = (SELECT user_id FROM chat_jobs WHERE id = ${job.id})
          OR s.guest_id = (SELECT guest_id FROM chat_jobs WHERE id = ${job.id}))
      LIMIT 1
    `;
    return Boolean(rows[0]);
  }

  async sessionValid(
    sessionId: string,
    principal: ChatPrincipal,
  ): Promise<boolean> {
    const rows = await this.database.getClient()<{ id: string }[]>`
      SELECT id FROM sessions WHERE id = ${sessionId} AND revoked_at IS NULL
        AND idle_expires_at > now() AND absolute_expires_at > now()
        AND user_id IS NOT DISTINCT FROM ${principal.type === 'user' ? principal.id : null}::uuid
        AND guest_id IS NOT DISTINCT FROM ${principal.type === 'guest' ? principal.id : null}::uuid
      LIMIT 1
    `;
    return Boolean(rows[0]);
  }

  async recover(): Promise<number> {
    const rows = await this.database.getClient()<JobRow[]>`
      SELECT * FROM chat_jobs WHERE status IN ('pending', 'streaming') ORDER BY created_at
    `;
    let recovered = 0;
    for (const row of rows) {
      const usage = await this.database.getClient()<
        Array<{ input_tokens: number | null; output_tokens: number | null }>
      >`
        SELECT input_tokens, output_tokens FROM usage_events
        WHERE job_id = ${row.id} AND operation_type = 'chat' LIMIT 1
      `;
      const result = await this.terminal(row.id, {
        status: 'failed',
        content: row.checkpoint_content,
        errorCode: 'CHAT_SERVER_RESTARTED',
        inputTokens: usage[0]?.input_tokens ?? row.input_tokens,
        outputTokens: usage[0]?.output_tokens ?? row.output_tokens,
      });
      if (result) recovered++;
    }
    return recovered;
  }

  async purgeExpired(): Promise<number> {
    const rows = await this.database.getClient()<{ id: string }[]>`
      DELETE FROM chat_jobs WHERE finished_at <= now() - interval '7 days' RETURNING id
    `;
    return rows.length;
  }

  private async releaseUnsentQuota(
    tx: DatabaseTransaction,
    jobId: string,
  ): Promise<void> {
    const released = await tx<
      Array<{ counter_keys: string[]; usage_date: string }>
    >`
      UPDATE chat_quota_reservations SET state = 'released', released_at = now()
      WHERE job_id = ${jobId} AND state = 'reserved'
      RETURNING counter_keys, usage_date::text AS usage_date
    `;
    if (!released[0]) return;
    await tx`UPDATE chat_jobs SET quota_state = 'released' WHERE id = ${jobId}`;
    const keys = released[0].counter_keys;
    const decremented = await tx<{ counter_key: string }[]>`
      UPDATE daily_usage_counters SET request_count = request_count - 1
      WHERE usage_date = ${released[0].usage_date}::date
        AND counter_key = ANY(${keys}::text[]) AND request_count > 0
      RETURNING counter_key
    `;
    if (decremented.length !== keys.length)
      throw new Error('Quota reservation counters are inconsistent');
  }
}
