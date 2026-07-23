import { Injectable } from '@nestjs/common';

import { AttachmentLifecycleService } from './attachment-lifecycle.service.js';
import type { AuthenticatedPrincipal } from './auth.service.js';
import {
  ChatsRepository,
  ConversationNotFoundError,
  type CreateConversationInput,
  type UpdateConversationInput,
} from './chats.repository.js';

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
  ) {}

  list(principal: AuthenticatedPrincipal) {
    return this.repository.list(this.chatPrincipal(principal));
  }

  create(principal: AuthenticatedPrincipal, input: CreateConversationInput) {
    return this.repository.create(this.chatPrincipal(principal), input);
  }

  async activateBranch(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    branchId: string,
  ) {
    try {
      return await this.repository.activateBranch(
        this.chatPrincipal(principal),
        conversationId,
        branchId,
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  async detail(principal: AuthenticatedPrincipal, id: string) {
    try {
      return await this.repository.detail(this.chatPrincipal(principal), id);
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
    if (error instanceof ConversationNotFoundError) {
      throw new ChatError('CHAT_NOT_FOUND', 404, 'Conversation not found.');
    }
    throw error;
  }
}
