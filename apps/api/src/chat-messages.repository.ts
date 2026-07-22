import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { ChatParameters } from './chat-streaming.js';
import type { ChatPrincipal } from './chats.repository.js';
import { ConversationNotFoundError } from './chats.repository.js';
import { DatabaseService } from './database.service.js';

export interface ChatTurnRecord {
  assistantMessageId: string;
  context: Array<{ content: string; role: 'assistant' | 'user' }>;
  contextTokenLimit: number;
  systemPrompt: string;
  userMessageId: string;
}

interface RawConversationState {
  active_branch_id: string;
  context_token_limit: number;
  history_message_limit: number;
  system_prompt: string;
}

interface RawContextMessage {
  content: string;
  id: string;
  role: 'assistant' | 'user';
  sequence_number: number;
}

export class ChatMessageStateError extends Error {}

@Injectable()
export class ChatMessagesRepository {
  constructor(private readonly database: DatabaseService) {}

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
      content: string;
      conversationId: string;
      modelId: string;
      parameters: ChatParameters;
      providerModelId: string;
      templateId: string;
    },
  ): Promise<ChatTurnRecord> {
    const requestParameters: Record<string, number> = {};
    if (input.parameters.maxOutputTokens !== undefined) {
      requestParameters.maxOutputTokens = input.parameters.maxOutputTokens;
    }
    if (input.parameters.temperature !== undefined) {
      requestParameters.temperature = input.parameters.temperature;
    }
    if (input.parameters.topP !== undefined) {
      requestParameters.topP = input.parameters.topP;
    }
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
      const previous = await transaction<RawContextMessage[]>`
        SELECT id, sequence_number, role, content
        FROM messages
        WHERE conversation_id = ${input.conversationId}
          AND branch_id = ${conversation.active_branch_id}
          AND role IN ('user', 'assistant')
          AND status = 'completed'
        ORDER BY sequence_number
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
          ${transaction.json(requestParameters)}
        )
      `;
      await transaction`
        UPDATE conversations SET updated_at = now()
        WHERE id = ${input.conversationId}
      `;
      const priorContext = previous.map((message) => ({
        content: message.content,
        role: message.role,
      }));
      const limited =
        conversation.history_message_limit === 0
          ? priorContext
          : priorContext.slice(-conversation.history_message_limit);
      return {
        assistantMessageId,
        context: [...limited, { content: input.content, role: 'user' }],
        contextTokenLimit: conversation.context_token_limit,
        systemPrompt: conversation.system_prompt,
        userMessageId,
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
      content: string;
      inputTokens: number | null;
      outputTokens: number | null;
    },
  ): Promise<void> {
    const rows = await this.database.getClient()<{ id: string }[]>`
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
  }

  async finishIncomplete(
    assistantMessageId: string,
    input: {
      content: string;
      errorCode: string;
      status: 'cancelled' | 'failed';
    },
  ): Promise<void> {
    await this.database.getClient()`
      UPDATE messages
      SET status = ${input.status}, content = ${input.content},
        error_code = ${input.errorCode}, completed_at = NULL
      WHERE id = ${assistantMessageId}
        AND role = 'assistant'
        AND status IN ('pending', 'streaming')
    `;
  }

  async cancelPending(
    principal: ChatPrincipal,
    conversationId: string,
    assistantMessageId: string,
  ): Promise<void> {
    const sql = this.database.getClient();
    const rows =
      principal.type === 'user'
        ? await sql<{ id: string }[]>`
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
        : await sql<{ id: string }[]>`
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
  }
}
