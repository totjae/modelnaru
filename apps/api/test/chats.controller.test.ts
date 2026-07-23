import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from '../src/auth.guard.js';
import type { ChatExecutionService } from '../src/chat-execution.service.js';
import { ChatsController } from '../src/chats.controller.js';
import type { ChatsService } from '../src/chats.service.js';

const principal = {
  displayName: null,
  id: '10000000-0000-4000-8000-000000000001',
  type: 'user' as const,
  username: 'user1',
};

function request(): AuthenticatedRequest {
  return {
    authenticatedSession: { principal } as never,
    headers: {},
  };
}

const response = () => ({ setHeader: vi.fn() });
const execution = {} as ChatExecutionService;

describe('ChatsController', () => {
  it('creates a conversation with the documented defaults', async () => {
    const chats = { create: vi.fn(() => Promise.resolve({ id: 'created' })) };
    const controller = new ChatsController(
      chats as unknown as ChatsService,
      execution,
    );

    await expect(controller.create({}, request(), response())).resolves.toEqual(
      { id: 'created' },
    );
    expect(chats.create).toHaveBeenCalledWith(principal, {
      contextTokenLimit: 100_000,
      defaultProviderModelId: null,
      generationParameters: { temperature: 1 },
      historyMessageLimit: 0,
      systemPrompt: '',
      title: '새 대화',
    });
  });

  it('accepts conversation-specific model and generation parameters', async () => {
    const chats = { update: vi.fn(() => Promise.resolve({ id: 'updated' })) };
    const controller = new ChatsController(
      chats as unknown as ChatsService,
      execution,
    );
    const id = '10000000-0000-4000-8000-000000000001';
    const modelId = '20000000-0000-4000-8000-000000000001';

    await expect(
      controller.update(
        id,
        {
          defaultProviderModelId: modelId,
          generationParameters: {
            temperature: 0.4,
            topP: 0.8,
          },
        },
        request(),
        response(),
      ),
    ).resolves.toEqual({ id: 'updated' });
    expect(chats.update).toHaveBeenCalledWith(principal, id, {
      defaultProviderModelId: modelId,
      generationParameters: {
        temperature: 0.4,
        topP: 0.8,
      },
    });
  });

  it('accepts zero as unlimited history and rejects an undersized context', async () => {
    const chats = { create: vi.fn() };
    const controller = new ChatsController(
      chats as unknown as ChatsService,
      execution,
    );

    await expect(
      controller.create(
        { contextTokenLimit: 999, historyMessageLimit: 0 },
        request(),
        response(),
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(chats.create).not.toHaveBeenCalled();
  });

  it('requires a non-empty update and a valid conversation id', async () => {
    const chats = { update: vi.fn() };
    const controller = new ChatsController(
      chats as unknown as ChatsService,
      execution,
    );

    await expect(
      controller.update('not-a-uuid', {}, request(), response()),
    ).rejects.toBeInstanceOf(HttpException);
    expect(chats.update).not.toHaveBeenCalled();
  });

  it('passes validated attachment ids to chat execution', async () => {
    const execute = vi.fn(() => Promise.resolve());
    const controller = new ChatsController(
      {} as ChatsService,
      {
        execute,
      } as unknown as ChatExecutionService,
    );
    const conversationId = '10000000-0000-4000-8000-000000000001';
    const attachmentId = '30000000-0000-4000-8000-000000000001';
    const streamResponse = {
      end: vi.fn(),
      flushHeaders: vi.fn(),
      on: vi.fn(),
      setHeader: vi.fn(),
      write: vi.fn(),
    };

    await controller.message(
      conversationId,
      {
        attachmentIds: [attachmentId],
        content: '',
        parameters: {},
        providerModelId: '20000000-0000-4000-8000-000000000001',
      },
      request(),
      streamResponse,
    );

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentIds: [attachmentId],
        content: '',
        conversationId,
      }),
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });

  it('rejects an invalid branch activation identifier', async () => {
    const chats = { activateBranch: vi.fn() };
    const controller = new ChatsController(
      chats as unknown as ChatsService,
      execution,
    );

    await expect(
      controller.activateBranch(
        '10000000-0000-4000-8000-000000000001',
        'not-a-uuid',
        request(),
        response(),
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(chats.activateBranch).not.toHaveBeenCalled();
  });

  it('requires a valid model identifier for regeneration', async () => {
    const controller = new ChatsController({} as ChatsService, execution);

    await expect(
      controller.regenerate(
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        { providerModelId: 'invalid' },
        request(),
        response(),
      ),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
