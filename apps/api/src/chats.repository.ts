import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { DatabaseClient, JSONValue } from '@modelnaru/database';

import type { AuthenticatedPrincipal } from './auth.service.js';
import type { ChatParameters } from './chat-streaming.js';
import { DatabaseService } from './database.service.js';

export type ChatPrincipal = Extract<
  AuthenticatedPrincipal,
  { type: 'guest' | 'user' }
>;

export interface ConversationRecord {
  activeBranchId: string;
  contextTokenLimit: number;
  createdAt: Date;
  defaultProviderModelId: string | null;
  generationParameters: ChatParameters;
  historyMessageLimit: number;
  id: string;
  messageCount: number;
  requestTraceLimit: number;
  responseTimeoutSeconds: number;
  systemPrompt: string;
  title: string;
  updatedAt: Date;
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
  contextTokenLimit: number;
  defaultProviderModelId: string | null;
  generationParameters: ChatParameters;
  historyMessageLimit: number;
  requestTraceLimit: number;
  responseTimeoutSeconds: number;
  systemPrompt: string;
  title: string;
}

export interface UpdateConversationInput {
  contextTokenLimit?: number;
  defaultProviderModelId?: string | null;
  generationParameters?: ChatParameters;
  historyMessageLimit?: number;
  requestTraceLimit?: number;
  responseTimeoutSeconds?: number;
  systemPrompt?: string;
  title?: string;
}

interface RawConversationRow {
  active_branch_id: string;
  context_token_limit: number;
  created_at: Date;
  default_provider_model_id: string | null;
  generation_parameters: ChatParameters;
  history_message_limit: number;
  id: string;
  message_count: number;
  request_trace_limit: number;
  response_timeout_seconds: number;
  system_prompt: string;
  title: string;
  updated_at: Date;
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

function mapConversation(row: RawConversationRow): ConversationRecord {
  return {
    activeBranchId: row.active_branch_id,
    contextTokenLimit: row.context_token_limit,
    createdAt: row.created_at,
    defaultProviderModelId: row.default_provider_model_id,
    generationParameters: row.generation_parameters,
    historyMessageLimit: row.history_message_limit,
    id: row.id,
    messageCount: row.message_count,
    requestTraceLimit: row.request_trace_limit,
    responseTimeoutSeconds: row.response_timeout_seconds,
    systemPrompt: row.system_prompt,
    title: row.title,
    updatedAt: row.updated_at,
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
  c.id, c.title, c.system_prompt, c.history_message_limit,
  c.context_token_limit, c.default_provider_model_id,
  c.generation_parameters, c.request_trace_limit, c.response_timeout_seconds,
  c.active_branch_id,
  c.created_at, c.updated_at,
  (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id)
    AS message_count
`;

@Injectable()
export class ChatsRepository {
  constructor(private readonly database: DatabaseService) {}

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
    return rows.map(mapConversation);
  }

  async create(
    principal: ChatPrincipal,
    input: CreateConversationInput,
  ): Promise<ConversationRecord> {
    const conversationId = randomUUID();
    const branchId = randomUUID();
    return this.database.getClient().begin(async (transaction) => {
      const rows = await transaction<RawConversationRow[]>`
        INSERT INTO conversations (
          id, user_id, guest_id, title, system_prompt,
          history_message_limit, context_token_limit, default_provider_model_id,
          generation_parameters, request_trace_limit, response_timeout_seconds,
          active_branch_id
        ) VALUES (
          ${conversationId},
          ${principal.type === 'user' ? principal.id : null},
          ${principal.type === 'guest' ? principal.id : null},
          ${input.title}, ${input.systemPrompt}, ${input.historyMessageLimit},
          ${input.contextTokenLimit}, ${input.defaultProviderModelId},
          ${transaction.json(input.generationParameters as unknown as JSONValue)},
          ${input.requestTraceLimit}, ${input.responseTimeoutSeconds},
          ${branchId}
        )
        RETURNING id, title, system_prompt, history_message_limit,
          context_token_limit, default_provider_model_id,
          generation_parameters, request_trace_limit, response_timeout_seconds,
          active_branch_id,
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
              created_at, updated_at, completed_at
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
    return {
      ...mapConversation(row),
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
        m.created_at, m.updated_at, m.completed_at
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
  ): Promise<ConversationRecord> {
    const sql = this.database.getClient();
    const rows =
      principal.type === 'user'
        ? await sql<RawConversationRow[]>`
            UPDATE conversations c
            SET active_branch_id = b.id
            FROM conversation_branches b
            WHERE c.id = ${conversationId}
              AND c.user_id = ${principal.id}
              AND b.id = ${branchId}
              AND b.conversation_id = c.id
              AND (
                b.parent_branch_id IS NULL
                OR EXISTS (
                  SELECT 1 FROM messages m
                  WHERE m.branch_id = b.id
                    AND m.role = 'assistant'
                    AND m.status = 'completed'
                )
              )
            RETURNING c.id, c.title, c.system_prompt,
              c.history_message_limit, c.context_token_limit,
              c.default_provider_model_id, c.generation_parameters,
              c.request_trace_limit, c.response_timeout_seconds,
              c.active_branch_id, c.created_at,
              c.updated_at,
              (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id) AS message_count
          `
        : await sql<RawConversationRow[]>`
            UPDATE conversations c
            SET active_branch_id = b.id
            FROM conversation_branches b
            WHERE c.id = ${conversationId}
              AND c.guest_id = ${principal.id}
              AND b.id = ${branchId}
              AND b.conversation_id = c.id
              AND (
                b.parent_branch_id IS NULL
                OR EXISTS (
                  SELECT 1 FROM messages m
                  WHERE m.branch_id = b.id
                    AND m.role = 'assistant'
                    AND m.status = 'completed'
                )
              )
            RETURNING c.id, c.title, c.system_prompt,
              c.history_message_limit, c.context_token_limit,
              c.default_provider_model_id, c.generation_parameters,
              c.request_trace_limit, c.response_timeout_seconds,
              c.active_branch_id, c.created_at,
              c.updated_at,
              (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id) AS message_count
          `;
    const row = rows[0];
    if (!row) throw new ConversationNotFoundError();
    return mapConversation(row);
  }

  async update(
    principal: ChatPrincipal,
    id: string,
    input: UpdateConversationInput,
  ): Promise<ConversationRecord> {
    const sql = this.database.getClient();
    const rows =
      principal.type === 'user'
        ? await sql<RawConversationRow[]>`
            UPDATE conversations c
            SET title = CASE WHEN ${input.title !== undefined} THEN ${input.title ?? ''} ELSE c.title END,
              system_prompt = CASE WHEN ${input.systemPrompt !== undefined} THEN ${input.systemPrompt ?? ''} ELSE c.system_prompt END,
              history_message_limit = CASE WHEN ${input.historyMessageLimit !== undefined} THEN ${input.historyMessageLimit ?? 0} ELSE c.history_message_limit END,
              context_token_limit = CASE WHEN ${input.contextTokenLimit !== undefined} THEN ${input.contextTokenLimit ?? 100000} ELSE c.context_token_limit END,
              default_provider_model_id = CASE WHEN ${input.defaultProviderModelId !== undefined} THEN ${input.defaultProviderModelId ?? null} ELSE c.default_provider_model_id END,
              generation_parameters = CASE WHEN ${input.generationParameters !== undefined} THEN ${sql.json((input.generationParameters ?? {}) as unknown as JSONValue)} ELSE c.generation_parameters END,
              request_trace_limit = CASE WHEN ${input.requestTraceLimit !== undefined} THEN ${input.requestTraceLimit ?? 3} ELSE c.request_trace_limit END,
              response_timeout_seconds = CASE WHEN ${input.responseTimeoutSeconds !== undefined} THEN ${input.responseTimeoutSeconds ?? 120} ELSE c.response_timeout_seconds END
            WHERE c.id = ${id} AND c.user_id = ${principal.id}
            RETURNING c.id, c.title, c.system_prompt, c.history_message_limit,
              c.context_token_limit, c.default_provider_model_id,
              c.generation_parameters, c.request_trace_limit,
              c.response_timeout_seconds,
              c.active_branch_id, c.created_at,
              c.updated_at, (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id) AS message_count
          `
        : await sql<RawConversationRow[]>`
            UPDATE conversations c
            SET title = CASE WHEN ${input.title !== undefined} THEN ${input.title ?? ''} ELSE c.title END,
              system_prompt = CASE WHEN ${input.systemPrompt !== undefined} THEN ${input.systemPrompt ?? ''} ELSE c.system_prompt END,
              history_message_limit = CASE WHEN ${input.historyMessageLimit !== undefined} THEN ${input.historyMessageLimit ?? 0} ELSE c.history_message_limit END,
              context_token_limit = CASE WHEN ${input.contextTokenLimit !== undefined} THEN ${input.contextTokenLimit ?? 100000} ELSE c.context_token_limit END,
              default_provider_model_id = CASE WHEN ${input.defaultProviderModelId !== undefined} THEN ${input.defaultProviderModelId ?? null} ELSE c.default_provider_model_id END,
              generation_parameters = CASE WHEN ${input.generationParameters !== undefined} THEN ${sql.json((input.generationParameters ?? {}) as unknown as JSONValue)} ELSE c.generation_parameters END,
              request_trace_limit = CASE WHEN ${input.requestTraceLimit !== undefined} THEN ${input.requestTraceLimit ?? 3} ELSE c.request_trace_limit END,
              response_timeout_seconds = CASE WHEN ${input.responseTimeoutSeconds !== undefined} THEN ${input.responseTimeoutSeconds ?? 120} ELSE c.response_timeout_seconds END
            WHERE c.id = ${id} AND c.guest_id = ${principal.id}
            RETURNING c.id, c.title, c.system_prompt, c.history_message_limit,
              c.context_token_limit, c.default_provider_model_id,
              c.generation_parameters, c.request_trace_limit,
              c.response_timeout_seconds,
              c.active_branch_id, c.created_at,
              c.updated_at, (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id) AS message_count
          `;
    const row = rows[0];
    if (!row) throw new ConversationNotFoundError();
    return mapConversation(row);
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
