import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { AuthenticatedPrincipal } from './auth.service.js';
import { composeBranchMessages } from './chat-branches.js';
import { DatabaseService } from './database.service.js';

export type ChatPrincipal = Extract<
  AuthenticatedPrincipal,
  { type: 'guest' | 'user' }
>;

export interface ConversationRecord {
  activeBranchId: string;
  contextTokenLimit: number;
  createdAt: Date;
  historyMessageLimit: number;
  id: string;
  messageCount: number;
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

export interface ConversationDetail extends ConversationRecord {
  branches: ConversationBranchRecord[];
}

export interface CreateConversationInput {
  contextTokenLimit: number;
  historyMessageLimit: number;
  systemPrompt: string;
  title: string;
}

export interface UpdateConversationInput {
  contextTokenLimit?: number;
  historyMessageLimit?: number;
  systemPrompt?: string;
  title?: string;
}

interface RawConversationRow {
  active_branch_id: string;
  context_token_limit: number;
  created_at: Date;
  history_message_limit: number;
  id: string;
  message_count: number;
  system_prompt: string;
  title: string;
  updated_at: Date;
}

interface RawBranchRow {
  created_at: Date;
  forked_from_message_id: string | null;
  id: string;
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

export class ConversationNotFoundError extends Error {}

function mapConversation(row: RawConversationRow): ConversationRecord {
  return {
    activeBranchId: row.active_branch_id,
    contextTokenLimit: row.context_token_limit,
    createdAt: row.created_at,
    historyMessageLimit: row.history_message_limit,
    id: row.id,
    messageCount: row.message_count,
    systemPrompt: row.system_prompt,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: RawMessageRow): MessageRecord {
  return {
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
  c.context_token_limit, c.active_branch_id, c.created_at, c.updated_at,
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
          history_message_limit, context_token_limit, active_branch_id
        ) VALUES (
          ${conversationId},
          ${principal.type === 'user' ? principal.id : null},
          ${principal.type === 'guest' ? principal.id : null},
          ${input.title}, ${input.systemPrompt}, ${input.historyMessageLimit},
          ${input.contextTokenLimit}, ${branchId}
        )
        RETURNING id, title, system_prompt, history_message_limit,
          context_token_limit, active_branch_id, created_at, updated_at,
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
      SELECT id, parent_branch_id, forked_from_message_id, created_at
      FROM conversation_branches
      WHERE conversation_id = ${id}
      ORDER BY created_at, id
    `;
    const messageRows = await sql<RawMessageRow[]>`
      SELECT id, branch_id, parent_message_id, sequence_number, role, status,
        content, provider_model_id, provider_template_id_snapshot,
        model_id_snapshot,
        request_parameters, input_tokens, output_tokens, error_code,
        created_at, updated_at, completed_at
      FROM messages
      WHERE conversation_id = ${id}
      ORDER BY branch_id, sequence_number
    `;
    const messagesByBranch = new Map<string, MessageRecord[]>();
    for (const messageRow of messageRows) {
      const messages = messagesByBranch.get(messageRow.branch_id) ?? [];
      messages.push(mapMessage(messageRow));
      messagesByBranch.set(messageRow.branch_id, messages);
    }
    const branches = branchRows.map((branch) => ({
      forkedFromMessageId: branch.forked_from_message_id,
      id: branch.id,
      parentBranchId: branch.parent_branch_id,
    }));
    return {
      ...mapConversation(row),
      branches: branchRows.map((branch) => ({
        createdAt: branch.created_at,
        forkedFromMessageId: branch.forked_from_message_id,
        id: branch.id,
        isSelectable:
          branch.parent_branch_id === null ||
          (messagesByBranch.get(branch.id) ?? []).some(
            (message) =>
              message.role === 'assistant' && message.status === 'completed',
          ),
        messages: composeBranchMessages(branch.id, branches, messagesByBranch),
        parentBranchId: branch.parent_branch_id,
      })),
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
              c.active_branch_id, c.created_at, c.updated_at,
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
              c.active_branch_id, c.created_at, c.updated_at,
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
              context_token_limit = CASE WHEN ${input.contextTokenLimit !== undefined} THEN ${input.contextTokenLimit ?? 100000} ELSE c.context_token_limit END
            WHERE c.id = ${id} AND c.user_id = ${principal.id}
            RETURNING c.id, c.title, c.system_prompt, c.history_message_limit,
              c.context_token_limit, c.active_branch_id, c.created_at,
              c.updated_at, (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id) AS message_count
          `
        : await sql<RawConversationRow[]>`
            UPDATE conversations c
            SET title = CASE WHEN ${input.title !== undefined} THEN ${input.title ?? ''} ELSE c.title END,
              system_prompt = CASE WHEN ${input.systemPrompt !== undefined} THEN ${input.systemPrompt ?? ''} ELSE c.system_prompt END,
              history_message_limit = CASE WHEN ${input.historyMessageLimit !== undefined} THEN ${input.historyMessageLimit ?? 0} ELSE c.history_message_limit END,
              context_token_limit = CASE WHEN ${input.contextTokenLimit !== undefined} THEN ${input.contextTokenLimit ?? 100000} ELSE c.context_token_limit END
            WHERE c.id = ${id} AND c.guest_id = ${principal.id}
            RETURNING c.id, c.title, c.system_prompt, c.history_message_limit,
              c.context_token_limit, c.active_branch_id, c.created_at,
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
