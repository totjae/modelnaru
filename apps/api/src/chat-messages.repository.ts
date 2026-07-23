import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { DatabaseTransaction, JSONValue } from '@modelnaru/database';

import {
  composeBranchMessages,
  isLatestRegenerationTarget,
} from './chat-branches.js';
import type { ChatParameters } from './chat-streaming.js';
import type { ChatPrincipal } from './chats.repository.js';
import { ConversationNotFoundError } from './chats.repository.js';
import { DatabaseService } from './database.service.js';
import { attachmentContext } from './text-attachments.js';

export interface ChatTurnRecord {
  activateBranchOnComplete: boolean;
  assistantMessageId: string;
  branchId: string;
  context: Array<{ content: string; id: string; role: 'assistant' | 'user' }>;
  contextTokenLimit: number;
  imageAttachments: Array<{
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
    storageKey: string;
  }>;
  previousActiveBranchId: string;
  systemPrompt: string;
  userMessageId: string | null;
}

interface RawConversationState {
  active_branch_id: string;
  context_token_limit: number;
  history_message_limit: number;
  system_prompt: string;
}

interface RawContextMessage {
  branch_id: string;
  content: string;
  id: string;
  role: 'assistant' | 'user';
  sequence_number: number;
  status: 'cancelled' | 'completed' | 'failed' | 'pending' | 'streaming';
}

interface RawAttachment {
  extracted_text: string | null;
  file_kind: 'image' | 'pdf' | 'text';
  id: string;
  include_in_future_messages: boolean;
  message_id: string | null;
  original_name: string;
  media_type: string;
  storage_key: string;
}

interface RawBranchState {
  forked_from_message_id: string | null;
  id: string;
  parent_branch_id: string | null;
}

export class ChatMessageStateError extends Error {}
export class ChatRegenerationTargetError extends Error {}
export class ChatAttachmentError extends Error {}

function requestParameters(parameters: ChatParameters): JSONValue {
  return { ...parameters };
}

function composeContext(
  branchId: string,
  branches: RawBranchState[],
  messages: RawContextMessage[],
): RawContextMessage[] {
  type ComposableContextMessage = RawContextMessage & {
    sequenceNumber: number;
  };
  const messagesByBranch = new Map<string, ComposableContextMessage[]>();
  for (const message of messages) {
    const branchMessages = messagesByBranch.get(message.branch_id) ?? [];
    branchMessages.push({
      ...message,
      sequenceNumber: message.sequence_number,
    });
    messagesByBranch.set(message.branch_id, branchMessages);
  }
  return composeBranchMessages(
    branchId,
    branches.map((branch) => ({
      forkedFromMessageId: branch.forked_from_message_id,
      id: branch.id,
      parentBranchId: branch.parent_branch_id,
    })),
    messagesByBranch,
  );
}

function contentWithAttachments(
  message: RawContextMessage,
  attachments: RawAttachment[],
  includeAll = false,
): string {
  if (message.role !== 'user') return message.content;
  return attachmentContext(
    message.content,
    attachments
      .filter(
        (attachment) =>
          attachment.file_kind !== 'image' &&
          attachment.extracted_text !== null &&
          attachment.message_id === message.id &&
          (includeAll || attachment.include_in_future_messages),
      )
      .map((attachment) => ({
        originalName: attachment.original_name,
        text: attachment.extracted_text!,
      })),
  );
}

@Injectable()
export class ChatMessagesRepository {
  constructor(private readonly database: DatabaseService) {}

  private async beginUsageEvent(
    transaction: DatabaseTransaction,
    principal: ChatPrincipal,
    input: {
      assistantMessageId: string;
      modelId: string;
      providerModelId: string;
      templateId: string;
    },
  ): Promise<void> {
    const principalLabel =
      principal.type === 'user'
        ? (
            await transaction<{ username: string }[]>`
              SELECT username FROM users WHERE id = ${principal.id}
            `
          )[0]?.username
        : `게스트 ${principal.id.slice(0, 8)}`;
    if (!principalLabel) throw new ConversationNotFoundError();
    await transaction`
      INSERT INTO usage_events (
        assistant_message_id, principal_type, principal_id, principal_label,
        provider_model_id, provider_template_id_snapshot, model_id_snapshot
      ) VALUES (
        ${input.assistantMessageId}, ${principal.type}, ${principal.id},
        ${principalLabel}, ${input.providerModelId}, ${input.templateId},
        ${input.modelId}
      )
    `;
  }

  async assertConversation(
    principal: ChatPrincipal,
    conversationId: string,
  ): Promise<void> {
    const sql = this.database.getClient();
    const rows =
      principal.type === 'user'
        ? await sql<{ id: string }[]>`
            SELECT id FROM conversations
            WHERE id = ${conversationId} AND user_id = ${principal.id}
            LIMIT 1
          `
        : await sql<{ id: string }[]>`
            SELECT id FROM conversations
            WHERE id = ${conversationId} AND guest_id = ${principal.id}
            LIMIT 1
          `;
    if (!rows[0]) throw new ConversationNotFoundError();
  }

  async beginTurn(
    principal: ChatPrincipal,
    input: {
      attachmentIds: string[];
      content: string;
      conversationId: string;
      modelId: string;
      parameters: ChatParameters;
      providerModelId: string;
      templateId: string;
    },
  ): Promise<ChatTurnRecord> {
    const storedParameters = requestParameters(input.parameters);
    return this.database.getClient().begin(async (transaction) => {
      const conversationRows =
        principal.type === 'user'
          ? await transaction<RawConversationState[]>`
              SELECT active_branch_id, history_message_limit,
                context_token_limit, system_prompt
              FROM conversations
              WHERE id = ${input.conversationId} AND user_id = ${principal.id}
              FOR UPDATE
            `
          : await transaction<RawConversationState[]>`
              SELECT active_branch_id, history_message_limit,
                context_token_limit, system_prompt
              FROM conversations
              WHERE id = ${input.conversationId} AND guest_id = ${principal.id}
              FOR UPDATE
            `;
      const conversation = conversationRows[0];
      if (!conversation) throw new ConversationNotFoundError();
      const branches = await transaction<RawBranchState[]>`
        SELECT id, parent_branch_id, forked_from_message_id
        FROM conversation_branches
        WHERE conversation_id = ${input.conversationId}
      `;
      const storedMessages = await transaction<RawContextMessage[]>`
        SELECT id, branch_id, sequence_number, role, status, content
        FROM messages
        WHERE conversation_id = ${input.conversationId}
          AND role IN ('user', 'assistant')
        ORDER BY branch_id, sequence_number
      `;
      const previous = composeContext(
        conversation.active_branch_id,
        branches,
        storedMessages,
      );
      const attachmentIds = [...new Set(input.attachmentIds)];
      if (
        attachmentIds.length !== input.attachmentIds.length ||
        attachmentIds.length > 10
      ) {
        throw new ChatAttachmentError();
      }
      const selectedAttachments: RawAttachment[] = [];
      for (const attachmentId of attachmentIds) {
        const rows = await transaction<RawAttachment[]>`
          SELECT id, message_id, original_name, extracted_text,
            include_in_future_messages, file_kind, media_type, storage_key
          FROM attachments
          WHERE id = ${attachmentId}
            AND conversation_id = ${input.conversationId}
            AND message_id IS NULL
            AND status = 'ready'
            AND expires_at > now()
          FOR UPDATE
        `;
        if (!rows[0]) throw new ChatAttachmentError();
        selectedAttachments.push(rows[0]);
      }
      const priorAttachments = await transaction<RawAttachment[]>`
        SELECT id, message_id, original_name, extracted_text,
          include_in_future_messages, file_kind, media_type, storage_key
        FROM attachments
        WHERE conversation_id = ${input.conversationId}
          AND message_id IS NOT NULL
          AND status = 'ready'
          AND expires_at > now()
      `;
      const last = previous.at(-1);
      const userMessageId = randomUUID();
      const assistantMessageId = randomUUID();
      const userSequence = (last?.sequence_number ?? 0) + 1;
      await transaction`
        INSERT INTO messages (
          id, conversation_id, branch_id, parent_message_id, sequence_number,
          role, status, content, completed_at
        ) VALUES (
          ${userMessageId}, ${input.conversationId},
          ${conversation.active_branch_id}, ${last?.id ?? null},
          ${userSequence}, 'user', 'completed', ${input.content}, now()
        )
      `;
      for (const attachment of selectedAttachments) {
        await transaction`
          UPDATE attachments
          SET message_id = ${userMessageId}
          WHERE id = ${attachment.id} AND message_id IS NULL
        `;
        attachment.message_id = userMessageId;
      }
      await transaction`
        INSERT INTO messages (
          id, conversation_id, branch_id, parent_message_id, sequence_number,
          role, status, content, provider_model_id,
          provider_template_id_snapshot, model_id_snapshot,
          request_parameters
        ) VALUES (
          ${assistantMessageId}, ${input.conversationId},
          ${conversation.active_branch_id}, ${userMessageId},
          ${userSequence + 1}, 'assistant', 'pending', '',
          ${input.providerModelId}, ${input.templateId}, ${input.modelId},
          ${transaction.json(storedParameters)}
        )
      `;
      await this.beginUsageEvent(transaction, principal, {
        assistantMessageId,
        modelId: input.modelId,
        providerModelId: input.providerModelId,
        templateId: input.templateId,
      });
      await transaction`
        UPDATE conversations SET updated_at = now()
        WHERE id = ${input.conversationId}
      `;
      const priorContext = previous
        .filter((message) => message.status === 'completed')
        .map((message) => ({
          content: contentWithAttachments(message, priorAttachments),
          id: message.id,
          role: message.role,
        }));
      const limited =
        conversation.history_message_limit === 0
          ? priorContext
          : priorContext.slice(-conversation.history_message_limit);
      return {
        activateBranchOnComplete: false,
        assistantMessageId,
        branchId: conversation.active_branch_id,
        context: [
          ...limited,
          {
            content: attachmentContext(
              input.content,
              selectedAttachments
                .filter(
                  (attachment) =>
                    attachment.file_kind !== 'image' &&
                    attachment.extracted_text !== null,
                )
                .map((attachment) => ({
                  originalName: attachment.original_name,
                  text: attachment.extracted_text!,
                })),
            ),
            id: userMessageId,
            role: 'user',
          },
        ],
        contextTokenLimit: conversation.context_token_limit,
        imageAttachments: [...selectedAttachments, ...priorAttachments]
          .filter(
            (attachment) =>
              attachment.file_kind === 'image' &&
              (selectedAttachments.includes(attachment) ||
                (attachment.include_in_future_messages &&
                  previous.some(
                    (message) => message.id === attachment.message_id,
                  ))),
          )
          .map((attachment) => ({
            mediaType: attachment.media_type as
              'image/jpeg' | 'image/png' | 'image/webp',
            storageKey: attachment.storage_key,
          })),
        previousActiveBranchId: conversation.active_branch_id,
        systemPrompt: conversation.system_prompt,
        userMessageId,
      };
    });
  }

  async beginRegeneration(
    principal: ChatPrincipal,
    input: {
      assistantMessageId: string;
      conversationId: string;
      modelId: string;
      parameters: ChatParameters;
      providerModelId: string;
      templateId: string;
    },
  ): Promise<ChatTurnRecord> {
    const storedParameters = requestParameters(input.parameters);
    return this.database.getClient().begin(async (transaction) => {
      const conversationRows =
        principal.type === 'user'
          ? await transaction<RawConversationState[]>`
              SELECT active_branch_id, history_message_limit,
                context_token_limit, system_prompt
              FROM conversations
              WHERE id = ${input.conversationId} AND user_id = ${principal.id}
              FOR UPDATE
            `
          : await transaction<RawConversationState[]>`
              SELECT active_branch_id, history_message_limit,
                context_token_limit, system_prompt
              FROM conversations
              WHERE id = ${input.conversationId} AND guest_id = ${principal.id}
              FOR UPDATE
            `;
      const conversation = conversationRows[0];
      if (!conversation) throw new ConversationNotFoundError();

      const branches = await transaction<RawBranchState[]>`
        SELECT id, parent_branch_id, forked_from_message_id
        FROM conversation_branches
        WHERE conversation_id = ${input.conversationId}
      `;
      const storedMessages = await transaction<RawContextMessage[]>`
        SELECT id, branch_id, sequence_number, role, status, content
        FROM messages
        WHERE conversation_id = ${input.conversationId}
          AND role IN ('user', 'assistant')
        ORDER BY branch_id, sequence_number
      `;
      const activeMessages = composeContext(
        conversation.active_branch_id,
        branches,
        storedMessages,
      );
      const attachments = await transaction<RawAttachment[]>`
        SELECT id, message_id, original_name, extracted_text,
          include_in_future_messages, file_kind, media_type, storage_key
        FROM attachments
        WHERE conversation_id = ${input.conversationId}
          AND message_id IS NOT NULL
          AND status = 'ready'
          AND expires_at > now()
      `;
      const targetIndex = activeMessages.findIndex(
        (message) => message.id === input.assistantMessageId,
      );
      const target = activeMessages[targetIndex];
      const targetUser = activeMessages[targetIndex - 1];
      if (
        !target ||
        !isLatestRegenerationTarget(activeMessages, input.assistantMessageId) ||
        !targetUser ||
        targetUser.role !== 'user' ||
        targetUser.status !== 'completed'
      ) {
        throw new ChatRegenerationTargetError();
      }

      const branchId = randomUUID();
      const assistantMessageId = randomUUID();
      await transaction`
        INSERT INTO conversation_branches (
          id, conversation_id, parent_branch_id, forked_from_message_id
        ) VALUES (
          ${branchId}, ${input.conversationId},
          ${conversation.active_branch_id}, ${target.id}
        )
      `;
      await transaction`
        INSERT INTO messages (
          id, conversation_id, branch_id, parent_message_id, sequence_number,
          role, status, content, provider_model_id,
          provider_template_id_snapshot, model_id_snapshot,
          request_parameters
        ) VALUES (
          ${assistantMessageId}, ${input.conversationId}, ${branchId},
          ${targetUser.id}, ${target.sequence_number}, 'assistant', 'pending', '',
          ${input.providerModelId}, ${input.templateId}, ${input.modelId},
          ${transaction.json(storedParameters)}
        )
      `;
      await this.beginUsageEvent(transaction, principal, {
        assistantMessageId,
        modelId: input.modelId,
        providerModelId: input.providerModelId,
        templateId: input.templateId,
      });
      await transaction`
        UPDATE conversations SET updated_at = now()
        WHERE id = ${input.conversationId}
      `;

      const priorContext = activeMessages
        .slice(0, targetIndex)
        .filter((message) => message.status === 'completed')
        .map((message) => ({
          content: contentWithAttachments(
            message,
            attachments,
            message.id === targetUser.id,
          ),
          id: message.id,
          role: message.role,
        }));
      const limited =
        conversation.history_message_limit === 0
          ? priorContext
          : priorContext.slice(-conversation.history_message_limit);
      return {
        activateBranchOnComplete: true,
        assistantMessageId,
        branchId,
        context: limited,
        contextTokenLimit: conversation.context_token_limit,
        imageAttachments: attachments
          .filter(
            (attachment) =>
              attachment.file_kind === 'image' &&
              (attachment.message_id === targetUser.id ||
                (attachment.include_in_future_messages &&
                  activeMessages
                    .slice(0, targetIndex)
                    .some((message) => message.id === attachment.message_id))),
          )
          .map((attachment) => ({
            mediaType: attachment.media_type as
              'image/jpeg' | 'image/png' | 'image/webp',
            storageKey: attachment.storage_key,
          })),
        previousActiveBranchId: conversation.active_branch_id,
        systemPrompt: conversation.system_prompt,
        userMessageId: null,
      };
    });
  }

  async markStreaming(assistantMessageId: string): Promise<void> {
    const rows = await this.database.getClient()<{ id: string }[]>`
      UPDATE messages
      SET status = 'streaming'
      WHERE id = ${assistantMessageId}
        AND role = 'assistant'
        AND status = 'pending'
      RETURNING id
    `;
    if (!rows[0]) throw new ChatMessageStateError();
  }

  async complete(
    assistantMessageId: string,
    input: {
      activateBranch?: {
        branchId: string;
        conversationId: string;
        previousActiveBranchId: string;
      };
      content: string;
      inputTokens: number | null;
      outputTokens: number | null;
    },
  ): Promise<void> {
    await this.database.getClient().begin(async (transaction) => {
      const rows = await transaction<{ id: string }[]>`
        UPDATE messages
        SET status = 'completed', content = ${input.content},
          input_tokens = ${input.inputTokens}, output_tokens = ${input.outputTokens},
          error_code = NULL, completed_at = now()
        WHERE id = ${assistantMessageId}
          AND role = 'assistant'
          AND status IN ('pending', 'streaming')
        RETURNING id
      `;
      if (!rows[0]) throw new ChatMessageStateError();
      await transaction`
        UPDATE usage_events
        SET status = 'completed',
          input_tokens = ${input.inputTokens},
          output_tokens = ${input.outputTokens},
          duration_ms = GREATEST(
            0,
            floor(extract(epoch FROM (now() - started_at)) * 1000)::integer
          ),
          completed_at = now()
        WHERE assistant_message_id = ${assistantMessageId}
          AND status = 'pending'
      `;
      if (input.activateBranch) {
        await transaction`
          UPDATE conversations
          SET active_branch_id = ${input.activateBranch.branchId}
          WHERE id = ${input.activateBranch.conversationId}
            AND active_branch_id = ${input.activateBranch.previousActiveBranchId}
        `;
      }
    });
  }

  async finishIncomplete(
    assistantMessageId: string,
    input: {
      content: string;
      errorCode: string;
      status: 'cancelled' | 'failed';
    },
  ): Promise<void> {
    await this.database.getClient().begin(async (transaction) => {
      await transaction`
        UPDATE messages
        SET status = ${input.status}, content = ${input.content},
          error_code = ${input.errorCode}, completed_at = NULL
        WHERE id = ${assistantMessageId}
          AND role = 'assistant'
          AND status IN ('pending', 'streaming')
      `;
      await transaction`
        UPDATE usage_events
        SET status = ${input.status},
          duration_ms = GREATEST(
            0,
            floor(extract(epoch FROM (now() - started_at)) * 1000)::integer
          ),
          completed_at = now()
        WHERE assistant_message_id = ${assistantMessageId}
          AND status = 'pending'
      `;
    });
  }

  async cancelPending(
    principal: ChatPrincipal,
    conversationId: string,
    assistantMessageId: string,
  ): Promise<void> {
    await this.database.getClient().begin(async (transaction) => {
      const rows =
        principal.type === 'user'
          ? await transaction<{ id: string }[]>`
              UPDATE messages m
              SET status = 'cancelled', error_code = 'CHAT_CANCELLED'
              FROM conversations c
              WHERE m.id = ${assistantMessageId}
                AND m.conversation_id = ${conversationId}
                AND m.conversation_id = c.id
                AND c.user_id = ${principal.id}
                AND m.role = 'assistant'
                AND m.status IN ('pending', 'streaming')
              RETURNING m.id
            `
          : await transaction<{ id: string }[]>`
              UPDATE messages m
              SET status = 'cancelled', error_code = 'CHAT_CANCELLED'
              FROM conversations c
              WHERE m.id = ${assistantMessageId}
                AND m.conversation_id = ${conversationId}
                AND m.conversation_id = c.id
                AND c.guest_id = ${principal.id}
                AND m.role = 'assistant'
                AND m.status IN ('pending', 'streaming')
              RETURNING m.id
            `;
      if (!rows[0]) throw new ChatMessageStateError();
      await transaction`
        UPDATE usage_events
        SET status = 'cancelled',
          duration_ms = GREATEST(
            0,
            floor(extract(epoch FROM (now() - started_at)) * 1000)::integer
          ),
          completed_at = now()
        WHERE assistant_message_id = ${assistantMessageId}
          AND status = 'pending'
      `;
    });
  }
}
