import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { DatabaseClient, JSONValue } from '@modelnaru/database';

import type { AuthenticatedPrincipal } from './auth.service.js';
import type { ChatParameters } from './chat-streaming.js';
import { DatabaseService } from './database.service.js';
import { AccessRepository } from './access.repository.js';
import { providerTemplateById } from './provider-catalog.js';
import { normalizeProviderParameters } from './provider-parameter-policy.js';
import type { DatabaseTransaction } from '@modelnaru/database';
import {
  conversationFingerprint,
  decodeConversationCursor,
  encodeConversationCursor,
  type ConversationFilter,
} from './conversation-cursor.js';

export type ChatPrincipal = Extract<
  AuthenticatedPrincipal,
  { type: 'guest' | 'user' }
>;

export interface ConversationRecord {
  activeJob: {
    id: string;
    kind: 'turn' | 'regenerate';
    status: 'pending' | 'streaming';
    revision: string;
    branchId: string;
    userMessageId: string | null;
    assistantMessageId: string;
  } | null;
  activeBranchId: string;
  contextTokenLimit: number;
  createdAt: Date;
  defaultProviderModelId: string | null;
  generationParameters: ChatParameters;
  historyMessageLimit: number;
  id: string;
  messageCount: number;
  isPinned: boolean;
  requestTraceLimit: number;
  settingsRevision: string;
  responseTimeoutSeconds: number;
  systemPrompt: string;
  title: string;
  titleSource: 'default' | 'auto' | 'manual';
  titleStatus: 'none' | 'pending' | 'completed' | 'failed';
  updatedAt: Date;
  webSearchEnabled: boolean;
}

export interface ConversationBranchRecord {
  createdAt: Date;
  forkedFromMessageId: string | null;
  id: string;
  isSelectable: boolean;
  messages: MessageRecord[];
  parentBranchId: string | null;
}

export interface MessageRecord {
  attachments: MessageAttachmentRecord[];
  branchId: string;
  completedAt: Date | null;
  content: string;
  createdAt: Date;
  errorCode: string | null;
  id: string;
  jobId: string | null;
  inputTokens: number | null;
  modelIdSnapshot: string | null;
  outputTokens: number | null;
  parentMessageId: string | null;
  providerModelId: string | null;
  providerTemplateIdSnapshot: string | null;
  requestParameters: Record<string, unknown>;
  role: 'assistant' | 'summary' | 'user';
  sequenceNumber: number;
  status: 'cancelled' | 'completed' | 'failed' | 'pending' | 'streaming';
  updatedAt: Date;
}

export interface MessageAttachmentRecord {
  byteSize: number;
  expiresAt: Date;
  fileKind: 'image' | 'pdf' | 'text';
  imageHeight: number | null;
  imageWidth: number | null;
  id: string;
  includeInFutureMessages: boolean;
  mediaType: string;
  ocrPageCount: number;
  originalName: string;
  pageCount: number | null;
  status: 'expired' | 'ready';
}

export interface ConversationDetail extends ConversationRecord {
  branches: ConversationBranchRecord[];
  messagePage: MessagePageMetadata;
  messages: MessageRecord[];
}

export interface MessagePageMetadata {
  hasMore: boolean;
  nextBeforeSequence: number | null;
}

export interface MessagePageResult {
  messagePage: MessagePageMetadata;
  messages: MessageRecord[];
}

export interface MessagePageInput {
  beforeSequence?: number;
  limit: number;
}

export interface CreateConversationInput {
  titleSource?: 'default' | 'manual';
  contextTokenLimit: number;
  defaultProviderModelId: string | null;
  generationParameters: ChatParameters;
  historyMessageLimit: number;
  requestTraceLimit: number;
  responseTimeoutSeconds: number;
  systemPrompt: string;
  title: string;
  webSearchEnabled: boolean;
}

export interface UpdateConversationInput {
  settingsRevision?: string;
  isPinned?: boolean;
  contextTokenLimit?: number;
  defaultProviderModelId?: string | null;
  generationParameters?: ChatParameters;
  historyMessageLimit?: number;
  requestTraceLimit?: number;
  responseTimeoutSeconds?: number;
  systemPrompt?: string;
  title?: string;
  webSearchEnabled?: boolean;
}

interface RawConversationRow {
  is_pinned?: boolean;
  cursor_updated_at?: string;
  title_source?: ConversationRecord['titleSource'];
  title_status?: ConversationRecord['titleStatus'];
  active_branch_id: string;
  context_token_limit: number;
  created_at: Date;
  default_provider_model_id: string | null;
  generation_parameters: ChatParameters;
  history_message_limit: number;
  id: string;
  message_count: number;
  request_trace_limit: number;
  settings_revision?: string;
  response_timeout_seconds: number;
  system_prompt: string;
  title: string;
  updated_at: Date;
  web_search_enabled: boolean;
}

interface RawBranchRow {
  created_at: Date;
  forked_from_message_id: string | null;
  id: string;
  is_selectable: boolean;
  parent_branch_id: string | null;
}

interface RawMessageRow {
  branch_id: string;
  completed_at: Date | null;
  content: string;
  created_at: Date;
  error_code: string | null;
  id: string;
  job_id?: string | null;
  input_tokens: number | null;
  model_id_snapshot: string | null;
  output_tokens: number | null;
  parent_message_id: string | null;
  provider_model_id: string | null;
  provider_template_id_snapshot: string | null;
  request_parameters: Record<string, unknown>;
  role: MessageRecord['role'];
  sequence_number: number;
  status: MessageRecord['status'];
  updated_at: Date;
}

interface RawMessageAttachmentRow {
  byte_size: string | number;
  expires_at: Date;
  file_kind: 'image' | 'pdf' | 'text';
  image_height: number | null;
  image_width: number | null;
  id: string;
  include_in_future_messages: boolean;
  media_type: string;
  message_id: string;
  ocr_page_count: number;
  original_name: string;
  page_count: number | null;
  status: 'expired' | 'ready';
}

export class ConversationNotFoundError extends Error {}
export class ConversationBusyError extends Error {}
export class ConversationSettingsConflictError extends Error {
  constructor(readonly conversation: ConversationRecord) {
    super('CHAT_SETTINGS_CONFLICT');
  }
}

function mapConversation(row: RawConversationRow): ConversationRecord {
  return {
    activeJob: null,
    activeBranchId: row.active_branch_id,
    contextTokenLimit: row.context_token_limit,
    createdAt: row.created_at,
    defaultProviderModelId: row.default_provider_model_id,
    generationParameters: row.generation_parameters,
    historyMessageLimit: row.history_message_limit,
    id: row.id,
    messageCount: row.message_count,
    isPinned: row.is_pinned ?? false,
    requestTraceLimit: row.request_trace_limit,
    settingsRevision: String(row.settings_revision ?? '1'),
    responseTimeoutSeconds: row.response_timeout_seconds,
    systemPrompt: row.system_prompt,
    title: row.title,
    titleSource: row.title_source ?? 'default',
    titleStatus: row.title_status ?? 'none',
    updatedAt: row.updated_at,
    webSearchEnabled: row.web_search_enabled,
  };
}

function mapMessage(
  row: RawMessageRow,
  attachments: MessageAttachmentRecord[],
): MessageRecord {
  return {
    attachments,
    branchId: row.branch_id,
    completedAt: row.completed_at,
    content: row.content,
    createdAt: row.created_at,
    errorCode: row.error_code,
    id: row.id,
    jobId: row.job_id ?? null,
    inputTokens: row.input_tokens,
    modelIdSnapshot: row.model_id_snapshot,
    outputTokens: row.output_tokens,
    parentMessageId: row.parent_message_id,
    providerModelId: row.provider_model_id,
    providerTemplateIdSnapshot: row.provider_template_id_snapshot,
    requestParameters: row.request_parameters,
    role: row.role,
    sequenceNumber: row.sequence_number,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

const conversationColumns = `
  c.id, c.title, c.is_pinned, c.title_source, c.title_status, c.system_prompt, c.history_message_limit,
  c.context_token_limit, c.default_provider_model_id,
  c.generation_parameters, c.request_trace_limit, c.response_timeout_seconds,
  c.settings_revision,
  c.web_search_enabled,
  c.active_branch_id,
  c.created_at, c.updated_at,
  (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id)
    AS message_count
`;

@Injectable()
export class ChatsRepository {
  constructor(private readonly database: DatabaseService) {}

  private async locked(
    sql: DatabaseTransaction,
    principal: ChatPrincipal,
    id: string,
    revision?: string,
  ) {
    const rows = await sql<
      RawConversationRow[]
    >`SELECT ${sql.unsafe(conversationColumns)} FROM conversations c
      WHERE c.id=${id} AND c.user_id IS NOT DISTINCT FROM ${principal.type === 'user' ? principal.id : null}::uuid
        AND c.guest_id IS NOT DISTINCT FROM ${principal.type === 'guest' ? principal.id : null}::uuid FOR UPDATE`;
    if (!rows[0]) throw new ConversationNotFoundError();
    const current = mapConversation(rows[0]);
    if (revision !== undefined && revision !== current.settingsRevision) {
      await this.attachActiveJobs([current], sql);
      throw new ConversationSettingsConflictError(current);
    }
    return current;
  }

  private async parameters(
    sql: DatabaseTransaction,
    principal: ChatPrincipal,
    modelId: string | null,
    previous: ChatParameters,
    explicit?: ChatParameters,
  ) {
    if (!modelId) {
      if (explicit && Object.keys(explicit).length)
        throw new Error('CHAT_PARAMETER_INVALID');
      return { parameters: {}, removed: Object.keys(previous) };
    }
    await new AccessRepository(this.database).assertModelAllowed(
      principal,
      modelId,
      sql,
    );
    const [model] = await sql<
      { template_id: string; model_id: string }[]
    >`SELECT c.template_id,m.model_id FROM provider_models m
      JOIN provider_connections c ON c.id=m.provider_connection_id WHERE m.id=${modelId}`;
    const template = model && providerTemplateById(model.template_id);
    if (!template) throw new Error('CHAT_PARAMETER_INVALID');
    const parameters: ChatParameters = {};
    const removed: string[] = [];
    for (const [key, value] of Object.entries(
      previous as Record<string, unknown>,
    )) {
      try {
        const normalized = normalizeProviderParameters(
          template,
          model.model_id,
          { [key]: value },
        );
        Object.assign(parameters, normalized);
        if (!Object.hasOwn(normalized, key)) removed.push(key);
      } catch {
        removed.push(key);
      }
    }
    if (explicit) {
      try {
        const normalized = normalizeProviderParameters(
          template,
          model.model_id,
          explicit,
        );
        if (
          Object.keys(explicit).some((key) => !Object.hasOwn(normalized, key))
        )
          throw new Error('CHAT_PARAMETER_INVALID');
        return {
          parameters: normalized,
          removed,
        };
      } catch {
        throw new Error('CHAT_PARAMETER_INVALID');
      }
    }
    const normalized = normalizeProviderParameters(
      template,
      model.model_id,
      parameters,
    );
    for (const key of Object.keys(parameters))
      if (!Object.hasOwn(normalized, key)) removed.push(key);
    return { parameters: normalized, removed };
  }

  async listPage(principal: ChatPrincipal, filter: ConversationFilter) {
    const sql = this.database.getClient();
    const fingerprint = conversationFingerprint(
      `${principal.type}:${principal.id}`,
      filter,
    );
    let position;
    try {
      position = filter.cursor
        ? decodeConversationCursor(filter.cursor, fingerprint)
        : null;
    } catch {
      throw new Error('CHAT_INPUT_INVALID');
    }
    const pattern = `%${(filter.query ?? '').replace(/[\\%_]/g, '\\$&')}%`;
    // Bind cursor time as text so the driver preserves PostgreSQL microseconds.
    const rows = await sql<
      RawConversationRow[]
    >`SELECT ${sql.unsafe(conversationColumns)},
      to_char(c.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_updated_at
      FROM conversations c WHERE c.user_id IS NOT DISTINCT FROM ${principal.type === 'user' ? principal.id : null}::uuid
        AND c.guest_id IS NOT DISTINCT FROM ${principal.type === 'guest' ? principal.id : null}::uuid
        AND c.title ILIKE ${pattern} AND (${filter.pinned === undefined} OR c.is_pinned=${filter.pinned ?? false})
        AND (${!position} OR (c.is_pinned,c.updated_at,c.id)<(${position?.pinned ?? false},${position?.time ?? '1970-01-01T00:00:00.000000Z'}::text::timestamptz,${position?.id ?? principal.id}::uuid))
      ORDER BY c.is_pinned DESC,c.updated_at DESC,c.id DESC LIMIT ${filter.limit + 1}`;
    const page = rows.slice(0, filter.limit);
    const records = page.map(mapConversation);
    await this.attachActiveJobs(records);
    const last = page.at(-1);
    return {
      conversations: records,
      nextCursor:
        rows.length > filter.limit && last
          ? encodeConversationCursor(fingerprint, {
              pinned: last.is_pinned!,
              time: last.cursor_updated_at!,
              id: last.id,
            })
          : null,
    };
  }

  private async attachActiveJobs(
    records: ConversationRecord[],
    sql: DatabaseClient | DatabaseTransaction = this.database.getClient(),
  ): Promise<void> {
    if (!records.length) return;
    const ids = records.map((record) => record.id);
    const jobs = await sql<
      Array<{
        id: string;
        conversation_id: string;
        kind: 'turn' | 'regenerate';
        status: 'pending' | 'streaming';
        revision: string;
        branch_id: string;
        user_message_id: string | null;
        assistant_message_id: string;
      }>
    >`
      SELECT id, conversation_id, kind, status, revision, branch_id, user_message_id, assistant_message_id
      FROM chat_jobs WHERE conversation_id = ANY(${ids}::uuid[]) AND status IN ('pending', 'streaming')
    `;
    const byConversation = new Map(
      records.map((record) => [record.id, record]),
    );
    for (const job of jobs) {
      const record = byConversation.get(job.conversation_id);
      if (record)
        record.activeJob = {
          id: job.id,
          kind: job.kind,
          status: job.status,
          revision: String(job.revision),
          branchId: job.branch_id,
          userMessageId: job.user_message_id,
          assistantMessageId: job.assistant_message_id,
        };
    }
  }

  async list(principal: ChatPrincipal): Promise<ConversationRecord[]> {
    const sql = this.database.getClient();
    const rows =
      principal.type === 'user'
        ? await sql<RawConversationRow[]>`
            SELECT ${sql.unsafe(conversationColumns)}
            FROM conversations c
            WHERE c.user_id = ${principal.id}
            ORDER BY c.updated_at DESC, c.id
          `
        : await sql<RawConversationRow[]>`
            SELECT ${sql.unsafe(conversationColumns)}
            FROM conversations c
            WHERE c.guest_id = ${principal.id}
            ORDER BY c.updated_at DESC, c.id
          `;
    const records = rows.map(mapConversation);
    await this.attachActiveJobs(records);
    return records;
  }

  async create(
    principal: ChatPrincipal,
    input: CreateConversationInput,
  ): Promise<ConversationRecord> {
    const conversationId = randomUUID();
    const branchId = randomUUID();
    return this.database.getClient().begin(async (transaction) => {
      const prepared = await this.parameters(
        transaction,
        principal,
        input.defaultProviderModelId,
        {},
        input.generationParameters,
      );
      input = { ...input, generationParameters: prepared.parameters };
      const rows = await transaction<RawConversationRow[]>`
        INSERT INTO conversations (
          id, user_id, guest_id, title, title_source, system_prompt,
          history_message_limit, context_token_limit, default_provider_model_id,
          generation_parameters, request_trace_limit, response_timeout_seconds,
          active_branch_id, web_search_enabled
        ) VALUES (
          ${conversationId},
          ${principal.type === 'user' ? principal.id : null},
          ${principal.type === 'guest' ? principal.id : null},
          ${input.title}, ${input.titleSource ?? (input.title === '새 대화' ? 'default' : 'manual')}, ${input.systemPrompt}, ${input.historyMessageLimit},
          ${input.contextTokenLimit}, ${input.defaultProviderModelId},
          ${transaction.json(input.generationParameters as unknown as JSONValue)},
          ${input.requestTraceLimit}, ${input.responseTimeoutSeconds},
          ${branchId}, ${input.webSearchEnabled}
        )
        RETURNING id, title, is_pinned, title_source, title_status, system_prompt, history_message_limit,
          context_token_limit, default_provider_model_id,
          generation_parameters, request_trace_limit, response_timeout_seconds,
          active_branch_id, web_search_enabled, settings_revision,
          created_at, updated_at,
          0::int AS message_count
      `;
      await transaction`
        INSERT INTO conversation_branches (id, conversation_id)
        VALUES (${branchId}, ${conversationId})
      `;
      const row = rows[0];
      if (!row) throw new Error('Conversation insert returned no row');
      return mapConversation(row);
    });
  }

  async detail(
    principal: ChatPrincipal,
    id: string,
    page: MessagePageInput,
  ): Promise<ConversationDetail> {
    const sql = this.database.getClient();
    const rows =
      principal.type === 'user'
        ? await sql<RawConversationRow[]>`
            SELECT ${sql.unsafe(conversationColumns)}
            FROM conversations c
            WHERE c.id = ${id} AND c.user_id = ${principal.id}
            LIMIT 1
          `
        : await sql<RawConversationRow[]>`
            SELECT ${sql.unsafe(conversationColumns)}
            FROM conversations c
            WHERE c.id = ${id} AND c.guest_id = ${principal.id}
            LIMIT 1
          `;
    const row = rows[0];
    if (!row) throw new ConversationNotFoundError();
    const branchRows = await sql<RawBranchRow[]>`
      SELECT b.id, b.parent_branch_id, b.forked_from_message_id, b.created_at,
        (
          b.parent_branch_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM messages selectable
            WHERE selectable.branch_id = b.id
              AND selectable.role = 'assistant'
              AND selectable.status = 'completed'
          )
        ) AS is_selectable
      FROM conversation_branches b
      WHERE b.conversation_id = ${id}
      ORDER BY b.created_at, b.id
    `;
    const activePage = await this.activeMessagePage(
      sql,
      id,
      row.active_branch_id,
      page,
    );
    const latest = activePage.messages.at(-1);
    const alternativeRows =
      latest?.role === 'assistant' && latest.parentMessageId
        ? await sql<RawMessageRow[]>`
            SELECT id, branch_id, parent_message_id, sequence_number, role,
              status, content, provider_model_id,
              provider_template_id_snapshot, model_id_snapshot,
              request_parameters, input_tokens, output_tokens, error_code,
              created_at, updated_at, completed_at,
              (SELECT j.id FROM chat_jobs j WHERE j.assistant_message_id = messages.id) AS job_id
            FROM messages
            WHERE conversation_id = ${id}
              AND role = 'assistant'
              AND parent_message_id = ${latest.parentMessageId}
            ORDER BY created_at, id
          `
        : [];
    const alternativesByBranch = new Map<string, MessageRecord[]>();
    for (const alternative of alternativeRows) {
      const messages = alternativesByBranch.get(alternative.branch_id) ?? [];
      messages.push(mapMessage(alternative, []));
      alternativesByBranch.set(alternative.branch_id, messages);
    }
    const conversation = mapConversation(row);
    await this.attachActiveJobs([conversation]);
    return {
      ...conversation,
      branches: branchRows.map((branch) => ({
        createdAt: branch.created_at,
        forkedFromMessageId: branch.forked_from_message_id,
        id: branch.id,
        isSelectable: branch.is_selectable,
        messages: alternativesByBranch.get(branch.id) ?? [],
        parentBranchId: branch.parent_branch_id,
      })),
      ...activePage,
    };
  }

  async messagePage(
    principal: ChatPrincipal,
    id: string,
    page: MessagePageInput,
  ): Promise<MessagePageResult> {
    const sql = this.database.getClient();
    const rows =
      principal.type === 'user'
        ? await sql<Array<{ active_branch_id: string }>>`
            SELECT active_branch_id
            FROM conversations
            WHERE id = ${id} AND user_id = ${principal.id}
            LIMIT 1
          `
        : await sql<Array<{ active_branch_id: string }>>`
            SELECT active_branch_id
            FROM conversations
            WHERE id = ${id} AND guest_id = ${principal.id}
            LIMIT 1
          `;
    const row = rows[0];
    if (!row) throw new ConversationNotFoundError();
    return this.activeMessagePage(sql, id, row.active_branch_id, page);
  }

  private async activeMessagePage(
    sql: DatabaseClient,
    conversationId: string,
    activeBranchId: string,
    page: MessagePageInput,
  ): Promise<MessagePageResult> {
    const messageRows = await sql<RawMessageRow[]>`
      WITH RECURSIVE active_path AS (
        SELECT b.id, b.parent_branch_id, b.forked_from_message_id,
          NULL::integer AS before_sequence
        FROM conversation_branches b
        WHERE b.id = ${activeBranchId}
          AND b.conversation_id = ${conversationId}

        UNION ALL

        SELECT parent.id, parent.parent_branch_id,
          parent.forked_from_message_id, fork.sequence_number
        FROM active_path child
        JOIN conversation_branches parent
          ON parent.id = child.parent_branch_id
          AND parent.conversation_id = ${conversationId}
        JOIN messages fork
          ON fork.id = child.forked_from_message_id
          AND fork.conversation_id = ${conversationId}
      )
      SELECT m.id, m.branch_id, m.parent_message_id, m.sequence_number,
        m.role, m.status, m.content, m.provider_model_id,
        m.provider_template_id_snapshot, m.model_id_snapshot,
        m.request_parameters, m.input_tokens, m.output_tokens, m.error_code,
        m.created_at, m.updated_at, m.completed_at,
        (SELECT j.id FROM chat_jobs j WHERE j.assistant_message_id = m.id) AS job_id
      FROM active_path path
      JOIN messages m ON m.branch_id = path.id
      WHERE m.conversation_id = ${conversationId}
        AND (
          path.before_sequence IS NULL
          OR m.sequence_number < path.before_sequence
        )
        AND (
          ${page.beforeSequence ?? null}::integer IS NULL
          OR m.sequence_number < ${page.beforeSequence ?? null}
        )
      ORDER BY m.sequence_number DESC, m.id DESC
      LIMIT ${page.limit + 1}
    `;
    const hasMore = messageRows.length > page.limit;
    const selectedRows = messageRows.slice(0, page.limit).reverse();
    const messageIds = selectedRows.map((message) => message.id);
    const attachmentRows =
      messageIds.length === 0
        ? []
        : await sql<RawMessageAttachmentRow[]>`
            SELECT id, message_id, original_name, media_type, file_kind,
              byte_size, page_count, ocr_page_count, image_width, image_height,
              include_in_future_messages, expires_at, status
            FROM attachments
            WHERE conversation_id = ${conversationId}
              AND message_id = ANY(${messageIds}::uuid[])
              AND status IN ('ready', 'expired')
            ORDER BY created_at, id
          `;
    const attachmentsByMessage = new Map<string, MessageAttachmentRecord[]>();
    for (const attachment of attachmentRows) {
      const records = attachmentsByMessage.get(attachment.message_id) ?? [];
      records.push({
        byteSize: Number(attachment.byte_size),
        expiresAt: attachment.expires_at,
        fileKind: attachment.file_kind,
        imageHeight: attachment.image_height,
        imageWidth: attachment.image_width,
        id: attachment.id,
        includeInFutureMessages: attachment.include_in_future_messages,
        mediaType: attachment.media_type,
        ocrPageCount: attachment.ocr_page_count,
        originalName: attachment.original_name,
        pageCount: attachment.page_count,
        status: attachment.status,
      });
      attachmentsByMessage.set(attachment.message_id, records);
    }
    const messages = selectedRows.map((message) =>
      mapMessage(message, attachmentsByMessage.get(message.id) ?? []),
    );
    return {
      messagePage: {
        hasMore,
        nextBeforeSequence:
          hasMore && messages.length > 0
            ? Math.min(...messages.map((message) => message.sequenceNumber))
            : null,
      },
      messages,
    };
  }

  async activateBranch(
    principal: ChatPrincipal,
    conversationId: string,
    branchId: string,
    settingsRevision?: string,
  ): Promise<ConversationRecord> {
    return this.database.getClient().begin(async (sql) => {
      await this.locked(sql, principal, conversationId, settingsRevision);
      const active =
        await sql`SELECT id FROM chat_jobs WHERE conversation_id=${conversationId} AND status IN ('pending','streaming')`;
      if (active.length) throw new ConversationBusyError();
      const rows =
        principal.type === 'user'
          ? await sql<RawConversationRow[]>`
            UPDATE conversations c
            SET active_branch_id = b.id, settings_revision = c.settings_revision + 1
            FROM conversation_branches b
            WHERE c.id = ${conversationId}
              AND c.user_id = ${principal.id}
              AND b.id = ${branchId}
              AND b.conversation_id = c.id
              AND NOT EXISTS (SELECT 1 FROM chat_jobs j WHERE j.conversation_id = c.id AND j.status IN ('pending', 'streaming'))
              AND (
                b.parent_branch_id IS NULL
                OR EXISTS (
                  SELECT 1 FROM messages m
                  WHERE m.branch_id = b.id
                    AND m.role = 'assistant'
                    AND m.status = 'completed'
                )
              )
            RETURNING c.id, c.title, c.is_pinned, c.title_source, c.title_status, c.system_prompt,
              c.history_message_limit, c.context_token_limit,
              c.default_provider_model_id, c.generation_parameters,
              c.request_trace_limit, c.response_timeout_seconds,
              c.web_search_enabled,
              c.active_branch_id, c.settings_revision, c.created_at,
              c.updated_at,
              (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id) AS message_count
          `
          : await sql<RawConversationRow[]>`
            UPDATE conversations c
            SET active_branch_id = b.id, settings_revision = c.settings_revision + 1
            FROM conversation_branches b
            WHERE c.id = ${conversationId}
              AND c.guest_id = ${principal.id}
              AND b.id = ${branchId}
              AND b.conversation_id = c.id
              AND NOT EXISTS (SELECT 1 FROM chat_jobs j WHERE j.conversation_id = c.id AND j.status IN ('pending', 'streaming'))
              AND (
                b.parent_branch_id IS NULL
                OR EXISTS (
                  SELECT 1 FROM messages m
                  WHERE m.branch_id = b.id
                    AND m.role = 'assistant'
                    AND m.status = 'completed'
                )
              )
            RETURNING c.id, c.title, c.is_pinned, c.title_source, c.title_status, c.system_prompt,
              c.history_message_limit, c.context_token_limit,
              c.default_provider_model_id, c.generation_parameters,
              c.request_trace_limit, c.response_timeout_seconds,
              c.active_branch_id, c.settings_revision, c.created_at,
              c.web_search_enabled,
              c.updated_at,
              (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id) AS message_count
          `;
      const row = rows[0];
      if (!row) {
        const busy = await sql<{ id: string }[]>`
        SELECT c.id FROM conversations c JOIN chat_jobs j ON j.conversation_id = c.id
        WHERE c.id = ${conversationId}
          AND c.user_id IS NOT DISTINCT FROM ${principal.type === 'user' ? principal.id : null}::uuid
          AND c.guest_id IS NOT DISTINCT FROM ${principal.type === 'guest' ? principal.id : null}::uuid
          AND j.status IN ('pending', 'streaming') LIMIT 1
      `;
        if (busy[0]) throw new ConversationBusyError();
        throw new ConversationNotFoundError();
      }
      return mapConversation(row);
    });
  }

  async update(
    principal: ChatPrincipal,
    id: string,
    input: UpdateConversationInput,
  ): Promise<ConversationRecord & { removedParameters: string[] }> {
    return this.database.getClient().begin(async (sql) => {
      const current = await this.locked(
        sql,
        principal,
        id,
        input.settingsRevision,
      );
      const titleOnly = Object.keys(input).every((key) =>
        ['title', 'isPinned', 'settingsRevision'].includes(key),
      );
      if (!titleOnly) {
        const busy =
          await sql`SELECT id FROM chat_jobs WHERE conversation_id=${id} AND status IN ('pending','streaming')`;
        if (busy.length) throw new ConversationBusyError();
      }
      let removedParameters: string[] = [];
      if (
        input.defaultProviderModelId !== undefined ||
        input.generationParameters !== undefined
      ) {
        const prepared = await this.parameters(
          sql,
          principal,
          input.defaultProviderModelId === undefined
            ? current.defaultProviderModelId
            : input.defaultProviderModelId,
          input.defaultProviderModelId === undefined
            ? {}
            : current.generationParameters,
          input.generationParameters,
        );
        removedParameters = prepared.removed;
        input = { ...input, generationParameters: prepared.parameters };
      }
      const rows =
        principal.type === 'user'
          ? await sql<RawConversationRow[]>`
            UPDATE conversations c
            SET settings_revision = c.settings_revision + 1,
              is_pinned = CASE WHEN ${input.isPinned !== undefined} THEN ${input.isPinned ?? false} ELSE c.is_pinned END,
              title = CASE WHEN ${input.title !== undefined} THEN ${input.title ?? ''} ELSE c.title END,
              title_source = CASE WHEN ${input.title !== undefined} THEN 'manual' ELSE c.title_source END,
              title_status = CASE WHEN ${input.title !== undefined} THEN 'none' ELSE c.title_status END,
              system_prompt = CASE WHEN ${input.systemPrompt !== undefined} THEN ${input.systemPrompt ?? ''} ELSE c.system_prompt END,
              history_message_limit = CASE WHEN ${input.historyMessageLimit !== undefined} THEN ${input.historyMessageLimit ?? 0} ELSE c.history_message_limit END,
              context_token_limit = CASE WHEN ${input.contextTokenLimit !== undefined} THEN ${input.contextTokenLimit ?? 100000} ELSE c.context_token_limit END,
              default_provider_model_id = CASE WHEN ${input.defaultProviderModelId !== undefined} THEN ${input.defaultProviderModelId ?? null} ELSE c.default_provider_model_id END,
              generation_parameters = CASE WHEN ${input.generationParameters !== undefined} THEN ${sql.json((input.generationParameters ?? {}) as unknown as JSONValue)} ELSE c.generation_parameters END,
              request_trace_limit = CASE WHEN ${input.requestTraceLimit !== undefined} THEN ${input.requestTraceLimit ?? 3} ELSE c.request_trace_limit END,
              response_timeout_seconds = CASE WHEN ${input.responseTimeoutSeconds !== undefined} THEN ${input.responseTimeoutSeconds ?? 120} ELSE c.response_timeout_seconds END,
              web_search_enabled = CASE WHEN ${input.webSearchEnabled !== undefined} THEN ${input.webSearchEnabled ?? false} ELSE c.web_search_enabled END
            WHERE c.id = ${id} AND c.user_id = ${principal.id}
              AND (${titleOnly} OR NOT EXISTS (SELECT 1 FROM chat_jobs j WHERE j.conversation_id = c.id AND j.status IN ('pending', 'streaming')))
            RETURNING c.id, c.title, c.is_pinned, c.title_source, c.title_status, c.system_prompt, c.history_message_limit,
              c.context_token_limit, c.default_provider_model_id,
              c.generation_parameters, c.request_trace_limit,
              c.response_timeout_seconds, c.web_search_enabled,
              c.active_branch_id, c.settings_revision, c.created_at,
              c.updated_at, (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id) AS message_count
          `
          : await sql<RawConversationRow[]>`
            UPDATE conversations c
            SET settings_revision = c.settings_revision + 1,
              is_pinned = CASE WHEN ${input.isPinned !== undefined} THEN ${input.isPinned ?? false} ELSE c.is_pinned END,
              title = CASE WHEN ${input.title !== undefined} THEN ${input.title ?? ''} ELSE c.title END,
              title_source = CASE WHEN ${input.title !== undefined} THEN 'manual' ELSE c.title_source END,
              title_status = CASE WHEN ${input.title !== undefined} THEN 'none' ELSE c.title_status END,
              system_prompt = CASE WHEN ${input.systemPrompt !== undefined} THEN ${input.systemPrompt ?? ''} ELSE c.system_prompt END,
              history_message_limit = CASE WHEN ${input.historyMessageLimit !== undefined} THEN ${input.historyMessageLimit ?? 0} ELSE c.history_message_limit END,
              context_token_limit = CASE WHEN ${input.contextTokenLimit !== undefined} THEN ${input.contextTokenLimit ?? 100000} ELSE c.context_token_limit END,
              default_provider_model_id = CASE WHEN ${input.defaultProviderModelId !== undefined} THEN ${input.defaultProviderModelId ?? null} ELSE c.default_provider_model_id END,
              generation_parameters = CASE WHEN ${input.generationParameters !== undefined} THEN ${sql.json((input.generationParameters ?? {}) as unknown as JSONValue)} ELSE c.generation_parameters END,
              request_trace_limit = CASE WHEN ${input.requestTraceLimit !== undefined} THEN ${input.requestTraceLimit ?? 3} ELSE c.request_trace_limit END,
              response_timeout_seconds = CASE WHEN ${input.responseTimeoutSeconds !== undefined} THEN ${input.responseTimeoutSeconds ?? 120} ELSE c.response_timeout_seconds END,
              web_search_enabled = CASE WHEN ${input.webSearchEnabled !== undefined} THEN ${input.webSearchEnabled ?? false} ELSE c.web_search_enabled END
            WHERE c.id = ${id} AND c.guest_id = ${principal.id}
              AND (${titleOnly} OR NOT EXISTS (SELECT 1 FROM chat_jobs j WHERE j.conversation_id = c.id AND j.status IN ('pending', 'streaming')))
            RETURNING c.id, c.title, c.is_pinned, c.title_source, c.title_status, c.system_prompt, c.history_message_limit,
              c.context_token_limit, c.default_provider_model_id,
              c.generation_parameters, c.request_trace_limit,
              c.response_timeout_seconds, c.web_search_enabled,
              c.active_branch_id, c.settings_revision, c.created_at,
              c.updated_at, (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id) AS message_count
          `;
      const row = rows[0];
      if (!row) {
        const busy = await sql<
          { id: string }[]
        >`SELECT c.id FROM conversations c JOIN chat_jobs j ON j.conversation_id = c.id
        WHERE c.id = ${id} AND c.user_id IS NOT DISTINCT FROM ${principal.type === 'user' ? principal.id : null}::uuid
          AND c.guest_id IS NOT DISTINCT FROM ${principal.type === 'guest' ? principal.id : null}::uuid
          AND j.status IN ('pending', 'streaming') LIMIT 1`;
        if (busy[0]) throw new ConversationBusyError();
        throw new ConversationNotFoundError();
      }
      if (input.title !== undefined) {
        await sql`UPDATE conversation_title_tasks SET status = 'cancelled', finished_at = now()
        WHERE conversation_id = ${id} AND status = 'pending'`;
        await sql`UPDATE usage_events SET status = 'cancelled', completed_at = now()
        WHERE conversation_id = ${id} AND operation_type = 'title' AND status = 'pending'`;
      }
      const conversation = mapConversation(row);
      await this.attachActiveJobs([conversation], sql);
      return { ...conversation, removedParameters };
    });
  }

  async delete(principal: ChatPrincipal, id: string): Promise<void> {
    const sql = this.database.getClient();
    const rows =
      principal.type === 'user'
        ? await sql<{ id: string }[]>`
            DELETE FROM conversations
            WHERE id = ${id} AND user_id = ${principal.id}
            RETURNING id
          `
        : await sql<{ id: string }[]>`
            DELETE FROM conversations
            WHERE id = ${id} AND guest_id = ${principal.id}
            RETURNING id
          `;
    if (!rows[0]) throw new ConversationNotFoundError();
  }
}
