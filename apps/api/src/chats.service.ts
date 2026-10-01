import { HttpException, Injectable } from '@nestjs/common';

import { AttachmentLifecycleService } from './attachment-lifecycle.service.js';
import type { AuthenticatedPrincipal } from './auth.service.js';
import {
  ChatsRepository,
  ConversationBusyError,
  ConversationNotFoundError,
  ConversationSettingsConflictError,
  type CreateConversationInput,
  type MessagePageInput,
  type UpdateConversationInput,
} from './chats.repository.js';
import type { ConversationFilter } from './conversation-cursor.js';
import { RequestTraceService } from './request-trace.service.js';

export type ChatErrorCode = 'CHAT_INPUT_INVALID' | 'CHAT_NOT_FOUND';

export class ChatError extends Error {
  constructor(
    readonly code: ChatErrorCode,
    readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class ChatsService {
  constructor(
    private readonly repository: ChatsRepository,
    private readonly attachmentLifecycle: AttachmentLifecycleService = {
      flushQueuedFiles: () => Promise.resolve(),
    } as AttachmentLifecycleService,
    private readonly traces: RequestTraceService = {
      clearConversation: () => undefined,
    } as unknown as RequestTraceService,
  ) {}

  list(principal: AuthenticatedPrincipal) {
    return this.repository.list(this.chatPrincipal(principal));
  }
  listPage(principal: AuthenticatedPrincipal, filter: ConversationFilter) {
    return this.repository.listPage(this.chatPrincipal(principal), filter);
  }

  create(principal: AuthenticatedPrincipal, input: CreateConversationInput) {
    return this.repository.create(this.chatPrincipal(principal), input);
  }

  async activateBranch(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    branchId: string,
    settingsRevision?: string,
  ) {
    try {
      return await this.repository.activateBranch(
        this.chatPrincipal(principal),
        conversationId,
        branchId,
        settingsRevision,
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  async detail(
    principal: AuthenticatedPrincipal,
    id: string,
    page: MessagePageInput,
  ) {
    try {
      return await this.repository.detail(
        this.chatPrincipal(principal),
        id,
        page,
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  async messagePage(
    principal: AuthenticatedPrincipal,
    id: string,
    page: MessagePageInput,
  ) {
    try {
      return await this.repository.messagePage(
        this.chatPrincipal(principal),
        id,
        page,
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  async update(
    principal: AuthenticatedPrincipal,
    id: string,
    input: UpdateConversationInput,
  ) {
    try {
      return await this.repository.update(
        this.chatPrincipal(principal),
        id,
        input,
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  async delete(principal: AuthenticatedPrincipal, id: string): Promise<void> {
    try {
      await this.repository.delete(this.chatPrincipal(principal), id);
      this.traces.clearConversation(id);
      await this.attachmentLifecycle.flushQueuedFiles();
    } catch (error) {
      this.mapError(error);
    }
  }

  private chatPrincipal(principal: AuthenticatedPrincipal) {
    if (principal.type === 'admin') {
      throw new ChatError(
        'CHAT_NOT_FOUND',
        404,
        'A chat workspace is not available.',
      );
    }
    return principal;
  }

  private mapError(error: unknown): never {
    if (error instanceof ConversationSettingsConflictError) {
      throw new HttpException(
        {
          error: {
            code: 'CHAT_SETTINGS_CONFLICT',
            message: 'Conversation settings changed.',
            conversation: error.conversation,
            settingsRevision: error.conversation.settingsRevision,
          },
        },
        409,
      );
    }
    if (error instanceof ConversationBusyError) {
      throw new HttpException(
        {
          error: {
            code: 'CHAT_CONVERSATION_BUSY',
            message: 'Conversation has an active job.',
          },
        },
        409,
      );
    }
    if (error instanceof ConversationNotFoundError) {
      throw new ChatError('CHAT_NOT_FOUND', 404, 'Conversation not found.');
    }
    throw error;
  }
}
