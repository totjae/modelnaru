import { Injectable } from '@nestjs/common';

import { AccessError, AccessService } from './access.service.js';
import type { AuthenticatedPrincipal } from './auth.service.js';
import {
  ChatMessagesRepository,
  ChatRegenerationTargetError,
} from './chat-messages.repository.js';
import {
  ChatProviderService,
  ChatProviderUnavailableError,
} from './chat-provider.service.js';
import {
  type ChatEvent,
  type ChatParameters,
  ChatUpstreamError,
  streamProvider,
} from './chat-streaming.js';
import {
  type ChatPrincipal,
  ConversationNotFoundError,
} from './chats.repository.js';
import {
  ContextSummarizationUnavailableError,
  estimateContextSize,
  SummarizationService,
} from './summarization.service.js';

interface ActiveRequest {
  controller: AbortController;
  conversationId: string;
  principalKey: string;
}

export class ChatParameterPolicyError extends Error {}

export interface ExecuteChatInput {
  content: string;
  conversationId: string;
  parameters: ChatParameters;
  principal: AuthenticatedPrincipal;
  providerModelId: string;
  regenerateAssistantMessageId?: string;
}

export type RegenerateChatInput = Omit<
  ExecuteChatInput,
  'content' | 'regenerateAssistantMessageId'
> & { assistantMessageId: string };

@Injectable()
export class ChatExecutionService {
  private readonly active = new Map<string, ActiveRequest>();

  constructor(
    private readonly access: AccessService,
    private readonly providers: ChatProviderService,
    private readonly messages: ChatMessagesRepository,
    private readonly summarization: SummarizationService,
  ) {}

  async execute(
    input: ExecuteChatInput,
    emit: (event: ChatEvent) => void,
    externalSignal?: AbortSignal,
  ): Promise<void> {
    const principal = this.chatPrincipal(input.principal);
    let assistantMessageId: string | undefined;
    let content = '';
    try {
      await this.messages.assertConversation(principal, input.conversationId);
      await this.access.assertModelAllowed(principal, input.providerModelId);
      const runtime = await this.providers.resolve(input.providerModelId);
      if (
        input.parameters.maxOutputTokens !== undefined &&
        runtime.maxOutputTokens !== null &&
        input.parameters.maxOutputTokens > runtime.maxOutputTokens
      ) {
        throw new ChatParameterPolicyError();
      }
      const turn = input.regenerateAssistantMessageId
        ? await this.messages.beginRegeneration(principal, {
            assistantMessageId: input.regenerateAssistantMessageId,
            conversationId: input.conversationId,
            modelId: runtime.modelId,
            parameters: input.parameters,
            providerModelId: input.providerModelId,
            templateId: runtime.template.id,
          })
        : await this.messages.beginTurn(principal, {
            content: input.content,
            conversationId: input.conversationId,
            modelId: runtime.modelId,
            parameters: input.parameters,
            providerModelId: input.providerModelId,
            templateId: runtime.template.id,
          });
      assistantMessageId = turn.assistantMessageId;
      const effectiveContextLimit = Math.min(
        turn.contextTokenLimit,
        runtime.contextWindow ?? turn.contextTokenLimit,
      );
      let context = turn.context;
      if (
        estimateContextSize(turn.systemPrompt, context) > effectiveContextLimit
      ) {
        context = await this.summarization.fitContext({
          branchId: turn.branchId,
          context,
          contextLimit: effectiveContextLimit,
          conversationId: input.conversationId,
          ...(externalSignal ? { signal: externalSignal } : {}),
          systemPrompt: turn.systemPrompt,
        });
      }
      await this.access.reserveDailyRequest(principal, input.providerModelId);
      emit({
        branchId: turn.branchId,
        messageId: turn.assistantMessageId,
        modelId: runtime.modelId,
        type: 'start',
      });
      const controller = new AbortController();
      const abortFromExternal = () => controller.abort();
      if (externalSignal?.aborted) {
        abortFromExternal();
      } else {
        externalSignal?.addEventListener('abort', abortFromExternal, {
          once: true,
        });
      }
      this.active.set(turn.assistantMessageId, {
        controller,
        conversationId: input.conversationId,
        principalKey: this.principalKey(principal),
      });
      const startedAt = Date.now();
      let inputTokens: number | null = null;
      let outputTokens: number | null = null;
      let stopReason: string | undefined;
      try {
        await this.messages.markStreaming(turn.assistantMessageId);
        for await (const event of streamProvider({
          apiKey: runtime.apiKey,
          baseUrl: runtime.baseUrl,
          messages: context,
          modelId: runtime.modelId,
          parameters: input.parameters,
          signal: controller.signal,
          systemPrompt: turn.systemPrompt,
          template: runtime.template,
        })) {
          if (event.type === 'text_delta') {
            content += event.text;
            emit(event);
          } else if (event.type === 'usage') {
            inputTokens = event.inputTokens ?? inputTokens;
            outputTokens = event.outputTokens ?? outputTokens;
            emit(event);
          } else if (event.type === 'done') {
            stopReason = event.stopReason ?? stopReason;
          }
        }
        if (controller.signal.aborted)
          throw new DOMException('Aborted', 'AbortError');
        await this.messages.complete(turn.assistantMessageId, {
          ...(turn.activateBranchOnComplete
            ? {
                activateBranch: {
                  branchId: turn.branchId,
                  conversationId: input.conversationId,
                  previousActiveBranchId: turn.previousActiveBranchId,
                },
              }
            : {}),
          content,
          inputTokens,
          outputTokens,
        });
        emit({
          durationMs: Date.now() - startedAt,
          ...(stopReason ? { stopReason } : {}),
          type: 'done',
        });
      } finally {
        externalSignal?.removeEventListener('abort', abortFromExternal);
        this.active.delete(turn.assistantMessageId);
      }
    } catch (error) {
      const cancelled = this.isAbort(error, externalSignal);
      const normalized = cancelled
        ? {
            code: 'CHAT_CANCELLED',
            message: 'The response was cancelled.',
            retryable: false,
          }
        : this.normalizeError(error);
      if (assistantMessageId) {
        await this.messages.finishIncomplete(assistantMessageId, {
          content,
          errorCode: normalized.code,
          status: cancelled ? 'cancelled' : 'failed',
        });
      }
      try {
        emit({ ...normalized, type: 'error' });
      } catch {
        // The browser may already have closed the stream.
      }
    }
  }

  regenerate(
    input: RegenerateChatInput,
    emit: (event: ChatEvent) => void,
    externalSignal?: AbortSignal,
  ): Promise<void> {
    return this.execute(
      {
        content: '',
        conversationId: input.conversationId,
        parameters: input.parameters,
        principal: input.principal,
        providerModelId: input.providerModelId,
        regenerateAssistantMessageId: input.assistantMessageId,
      },
      emit,
      externalSignal,
    );
  }

  async cancel(
    principalValue: AuthenticatedPrincipal,
    conversationId: string,
    assistantMessageId: string,
  ): Promise<void> {
    const principal = this.chatPrincipal(principalValue);
    const active = this.active.get(assistantMessageId);
    if (
      active &&
      active.conversationId === conversationId &&
      active.principalKey === this.principalKey(principal)
    ) {
      active.controller.abort();
      return;
    }
    await this.messages.cancelPending(
      principal,
      conversationId,
      assistantMessageId,
    );
  }

  private chatPrincipal(principal: AuthenticatedPrincipal): ChatPrincipal {
    if (principal.type === 'admin') {
      throw new ConversationNotFoundError();
    }
    return principal;
  }

  private principalKey(principal: ChatPrincipal): string {
    return `${principal.type}:${principal.id}`;
  }

  private isAbort(error: unknown, externalSignal?: AbortSignal): boolean {
    return (
      externalSignal?.aborted === true ||
      (error instanceof Error && error.name === 'AbortError')
    );
  }

  private normalizeError(error: unknown): {
    code: string;
    message: string;
    retryable: boolean;
  } {
    if (error instanceof AccessError) {
      return { code: error.code, message: error.message, retryable: false };
    }
    if (error instanceof ConversationNotFoundError) {
      return {
        code: 'CHAT_NOT_FOUND',
        message: 'Conversation not found.',
        retryable: false,
      };
    }
    if (error instanceof ChatProviderUnavailableError) {
      return {
        code: 'CHAT_MODEL_UNAVAILABLE',
        message: 'The selected model is not available.',
        retryable: false,
      };
    }
    if (error instanceof ContextSummarizationUnavailableError) {
      return {
        code: 'CHAT_CONTEXT_LIMIT_EXCEEDED',
        message:
          'The conversation exceeds its context limit and could not be summarized.',
        retryable: false,
      };
    }
    if (error instanceof ChatParameterPolicyError) {
      return {
        code: 'CHAT_PARAMETER_INVALID',
        message: 'A parameter exceeds the selected model limit.',
        retryable: false,
      };
    }
    if (error instanceof ChatRegenerationTargetError) {
      return {
        code: 'CHAT_REGENERATION_INVALID',
        message: 'The selected response cannot be regenerated.',
        retryable: false,
      };
    }
    if (error instanceof ChatUpstreamError) {
      return {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      };
    }
    return {
      code: 'CHAT_INTERNAL_ERROR',
      message: 'The chat request could not be completed.',
      retryable: true,
    };
  }
}
