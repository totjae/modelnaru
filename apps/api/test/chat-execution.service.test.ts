import { describe, expect, it, vi } from 'vitest';

import type { AccessService } from '../src/access.service.js';
import type { AttachmentsService } from '../src/attachments.service.js';
import type { AuthenticatedPrincipal } from '../src/auth.service.js';
import { ChatExecutionService } from '../src/chat-execution.service.js';
import type { ChatMessagesRepository } from '../src/chat-messages.repository.js';
import type { ChatProviderService } from '../src/chat-provider.service.js';
import { providerTemplateById } from '../src/provider-catalog.js';
import type { SummarizationService } from '../src/summarization.service.js';
import { ContextSummarizationUnavailableError } from '../src/summarization.service.js';

const principal: AuthenticatedPrincipal = {
  displayName: null,
  id: '10000000-0000-4000-8000-000000000001',
  type: 'user',
  username: 'user1',
};

describe('ChatExecutionService', () => {
  it('rejects image attachments before quota use when the model capability is disabled', async () => {
    const access = {
      assertModelAllowed: vi.fn(() => Promise.resolve()),
      reserveDailyRequest: vi.fn(),
    };
    const messages = {
      assertConversation: vi.fn(() => Promise.resolve()),
      beginTurn: vi.fn(() =>
        Promise.resolve({
          activateBranchOnComplete: false,
          assistantMessageId: '30000000-0000-4000-8000-000000000001',
          branchId: '60000000-0000-4000-8000-000000000001',
          context: [
            {
              content: '이미지를 설명해줘',
              id: '40000000-0000-4000-8000-000000000001',
              role: 'user',
            },
          ],
          contextTokenLimit: 100_000,
          imageAttachments: [
            { mediaType: 'image/png', storageKey: 'aa/image-id' },
          ],
          previousActiveBranchId: '60000000-0000-4000-8000-000000000001',
          systemPrompt: '',
          userMessageId: '40000000-0000-4000-8000-000000000001',
        }),
      ),
      finishIncomplete: vi.fn(() => Promise.resolve()),
    };
    const service = new ChatExecutionService(
      access as unknown as AccessService,
      { readImage: vi.fn() } as unknown as AttachmentsService,
      {
        resolve: vi.fn(() =>
          Promise.resolve({
            apiKey: 'secret',
            baseUrl: 'https://api.openai.com/v1',
            contextWindow: null,
            maxOutputTokens: null,
            modelId: 'gpt-test',
            providerModelId: '20000000-0000-4000-8000-000000000001',
            supportsImageInput: false,
            template: providerTemplateById('openai')!,
          }),
        ),
      } as unknown as ChatProviderService,
      messages as unknown as ChatMessagesRepository,
      { fitContext: vi.fn() } as unknown as SummarizationService,
    );
    const events: Array<{ code?: string; type: string }> = [];

    await service.execute(
      {
        attachmentIds: ['70000000-0000-4000-8000-000000000001'],
        content: '이미지를 설명해줘',
        conversationId: '50000000-0000-4000-8000-000000000001',
        parameters: {},
        principal,
        providerModelId: '20000000-0000-4000-8000-000000000001',
      },
      (event) => events.push(event),
    );

    expect(access.reserveDailyRequest).not.toHaveBeenCalled();
    expect(messages.finishIncomplete).toHaveBeenCalledWith(
      '30000000-0000-4000-8000-000000000001',
      expect.objectContaining({
        errorCode: 'CHAT_IMAGE_MODEL_UNSUPPORTED',
        status: 'failed',
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        code: 'CHAT_IMAGE_MODEL_UNSUPPORTED',
        type: 'error',
      }),
    );
  });

  it('stops before quota reservation when context exceeds the configured limit', async () => {
    const access = {
      assertModelAllowed: vi.fn(() => Promise.resolve()),
      reserveDailyRequest: vi.fn(),
    };
    const providers = {
      resolve: vi.fn(() =>
        Promise.resolve({
          apiKey: 'secret',
          baseUrl: 'https://api.openai.com/v1',
          modelId: 'gpt-test',
          providerModelId: '20000000-0000-4000-8000-000000000001',
          supportsImageInput: false,
          template: providerTemplateById('openai')!,
        }),
      ),
    };
    const messages = {
      assertConversation: vi.fn(() => Promise.resolve()),
      beginTurn: vi.fn(() =>
        Promise.resolve({
          assistantMessageId: '30000000-0000-4000-8000-000000000001',
          activateBranchOnComplete: false,
          branchId: '60000000-0000-4000-8000-000000000001',
          context: [
            {
              content: 'too long',
              id: '40000000-0000-4000-8000-000000000001',
              role: 'user',
            },
          ],
          contextTokenLimit: 2,
          imageAttachments: [],
          previousActiveBranchId: '60000000-0000-4000-8000-000000000001',
          systemPrompt: '',
          userMessageId: '40000000-0000-4000-8000-000000000001',
        }),
      ),
      finishIncomplete: vi.fn(() => Promise.resolve()),
    };
    const summarization = {
      fitContext: vi.fn(() =>
        Promise.reject(new ContextSummarizationUnavailableError()),
      ),
    };
    const service = new ChatExecutionService(
      access as unknown as AccessService,
      { readImage: vi.fn() } as unknown as AttachmentsService,
      providers as unknown as ChatProviderService,
      messages as unknown as ChatMessagesRepository,
      summarization as unknown as SummarizationService,
    );
    const events: unknown[] = [];

    await service.execute(
      {
        attachmentIds: [],
        content: 'too long',
        conversationId: '50000000-0000-4000-8000-000000000001',
        parameters: {},
        principal,
        providerModelId: '20000000-0000-4000-8000-000000000001',
      },
      (event) => events.push(event),
    );

    expect(access.reserveDailyRequest).not.toHaveBeenCalled();
    expect(messages.finishIncomplete).toHaveBeenCalledWith(
      '30000000-0000-4000-8000-000000000001',
      expect.objectContaining({
        errorCode: 'CHAT_CONTEXT_LIMIT_EXCEEDED',
        status: 'failed',
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        code: 'CHAT_CONTEXT_LIMIT_EXCEEDED',
        type: 'error',
      }),
    );
  });

  it('creates regeneration through the branch-specific repository path', async () => {
    const access = {
      assertModelAllowed: vi.fn(() => Promise.resolve()),
      reserveDailyRequest: vi.fn(),
    };
    const providers = {
      resolve: vi.fn(() =>
        Promise.resolve({
          apiKey: 'secret',
          baseUrl: 'https://api.openai.com/v1',
          contextWindow: 1,
          modelId: 'gpt-test',
          providerModelId: '20000000-0000-4000-8000-000000000001',
          supportsImageInput: false,
          template: providerTemplateById('openai')!,
        }),
      ),
    };
    const messages = {
      assertConversation: vi.fn(() => Promise.resolve()),
      beginRegeneration: vi.fn(() =>
        Promise.resolve({
          activateBranchOnComplete: true,
          assistantMessageId: '30000000-0000-4000-8000-000000000001',
          branchId: '60000000-0000-4000-8000-000000000001',
          context: [
            {
              content: 'context',
              id: '40000000-0000-4000-8000-000000000001',
              role: 'user',
            },
          ],
          contextTokenLimit: 100_000,
          imageAttachments: [],
          previousActiveBranchId: '70000000-0000-4000-8000-000000000001',
          systemPrompt: '',
          userMessageId: null,
        }),
      ),
      finishIncomplete: vi.fn(() => Promise.resolve()),
    };
    const summarization = {
      fitContext: vi.fn(() =>
        Promise.reject(new ContextSummarizationUnavailableError()),
      ),
    };
    const service = new ChatExecutionService(
      access as unknown as AccessService,
      { readImage: vi.fn() } as unknown as AttachmentsService,
      providers as unknown as ChatProviderService,
      messages as unknown as ChatMessagesRepository,
      summarization as unknown as SummarizationService,
    );

    await service.regenerate(
      {
        assistantMessageId: '80000000-0000-4000-8000-000000000001',
        conversationId: '50000000-0000-4000-8000-000000000001',
        parameters: {},
        principal,
        providerModelId: '20000000-0000-4000-8000-000000000001',
      },
      vi.fn(),
    );

    expect(messages.beginRegeneration).toHaveBeenCalledWith(
      principal,
      expect.objectContaining({
        assistantMessageId: '80000000-0000-4000-8000-000000000001',
      }),
    );
    expect(access.reserveDailyRequest).not.toHaveBeenCalled();
    expect(messages.finishIncomplete).toHaveBeenCalledWith(
      '30000000-0000-4000-8000-000000000001',
      expect.objectContaining({ errorCode: 'CHAT_CONTEXT_LIMIT_EXCEEDED' }),
    );
  });
});
