import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from '../src/auth.guard.js';
import type { ChatExecutionService } from '../src/chat-execution.service.js';
import { ChatsController } from '../src/chats.controller.js';
import type { ChatsService } from '../src/chats.service.js';
import { providerTemplateById } from '../src/provider-catalog.js';
import {
  buildProviderStreamRequest,
  streamProvider,
  streamProviderRequest,
} from '../src/chat-streaming.js';

const principal = {
  displayName: null,
  id: '10000000-0000-4000-8000-000000000001',
  type: 'user' as const,
  username: 'user1',
};

function request(): AuthenticatedRequest {
  return {
    authenticatedSession: {
      principal,
      row: {
        absoluteExpiresAt: new Date(Date.now() + 60_000),
        id: '40000000-0000-4000-8000-000000000001',
      },
    } as never,
    headers: {},
  };
}

describe('chat runtime safety', () => {
  it('rejects an upstream SSE event that exceeds the buffer limit', async () => {
    const template = providerTemplateById('openai')!;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024 + 1));
        controller.close();
      },
    });
    const consume = async () => {
      for await (const event of streamProvider(
        {
          apiKey: 'test-key',
          baseUrl: template.baseUrl!,
          messages: [{ content: 'hello', role: 'user' }],
          modelId: 'gpt-test',
          parameters: {},
          signal: new AbortController().signal,
          systemPrompt: '',
          template,
        },
        () => Promise.resolve(new Response(body, { status: 200 })),
      )) {
        void event;
      }
    };

    await expect(consume()).rejects.toMatchObject({
      code: 'CHAT_PROVIDER_RESPONSE_INVALID',
    });
  });

  it('aborts a provider request after the idle timeout', async () => {
    vi.useFakeTimers();
    try {
      const template = providerTemplateById('openai')!;
      let upstreamSignal: AbortSignal | undefined;
      const fetchImplementation = vi.fn(
        (_input: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            upstreamSignal = init?.signal as AbortSignal;
            upstreamSignal.addEventListener(
              'abort',
              () =>
                reject(
                  upstreamSignal?.reason instanceof Error
                    ? upstreamSignal.reason
                    : new Error('Provider request aborted'),
                ),
              { once: true },
            );
          }),
      );
      const stream = streamProvider(
        {
          apiKey: 'test-key',
          baseUrl: template.baseUrl!,
          messages: [{ content: 'hello', role: 'user' }],
          modelId: 'gpt-test',
          parameters: {},
          signal: new AbortController().signal,
          systemPrompt: '',
          template,
        },
        fetchImplementation,
      );
      const pending = stream.next();
      const rejection = expect(pending).rejects.toMatchObject({
        code: 'CHAT_PROVIDER_TIMEOUT',
      });

      await vi.advanceTimersByTimeAsync(120_000);

      await rejection;
      expect(upstreamSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses a conversation-specific provider idle timeout', async () => {
    vi.useFakeTimers();
    try {
      const template = providerTemplateById('openai')!;
      let upstreamSignal: AbortSignal | undefined;
      const fetchImplementation = vi.fn(
        (_input: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            upstreamSignal = init?.signal as AbortSignal;
            upstreamSignal.addEventListener(
              'abort',
              () => reject(new Error('Provider request aborted')),
              { once: true },
            );
          }),
      );
      const request = buildProviderStreamRequest({
        apiKey: 'test-key',
        baseUrl: template.baseUrl!,
        messages: [{ content: 'hello', role: 'user' }],
        modelId: 'gpt-test',
        parameters: {},
        systemPrompt: '',
        template,
      });
      const stream = streamProviderRequest(
        {
          idleTimeoutMs: 1_000,
          request,
          signal: new AbortController().signal,
        },
        fetchImplementation,
      );
      const pending = stream.next();
      const rejection = expect(pending).rejects.toMatchObject({
        code: 'CHAT_PROVIDER_TIMEOUT',
      });

      await vi.advanceTimersByTimeAsync(999);
      expect(upstreamSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('ends the SSE response when chat execution throws', async () => {
    const controller = new ChatsController(
      {} as ChatsService,
      {
        execute: vi.fn(() => Promise.reject(new Error('database unavailable'))),
      } as unknown as ChatExecutionService,
    );
    const response = {
      end: vi.fn(),
      flushHeaders: vi.fn(),
      on: vi.fn(),
      setHeader: vi.fn(),
      write: vi.fn(),
    };

    await expect(
      controller.message(
        '10000000-0000-4000-8000-000000000001',
        {
          attachmentIds: [],
          content: 'hello',
          parameters: {},
          providerModelId: '20000000-0000-4000-8000-000000000001',
        },
        request(),
        response,
      ),
    ).rejects.toThrow('database unavailable');
    expect(response.end).toHaveBeenCalledOnce();
  });

  it('waits for drain when the SSE response applies backpressure', async () => {
    const responseEvents = new EventEmitter();
    let continuedAfterWrite = false;
    const execute = vi.fn(
      async (
        _input: unknown,
        emit: (event: {
          messageId: string;
          modelId: string;
          type: 'start';
        }) => void | Promise<void>,
      ) => {
        await emit({
          messageId: '30000000-0000-4000-8000-000000000001',
          modelId: 'gpt-test',
          type: 'start',
        });
        continuedAfterWrite = true;
      },
    );
    const controller = new ChatsController(
      {} as ChatsService,
      { execute } as unknown as ChatExecutionService,
    );
    const response = {
      end: vi.fn(),
      flushHeaders: vi.fn(),
      off: responseEvents.off.bind(responseEvents),
      on: responseEvents.on.bind(responseEvents),
      once: responseEvents.once.bind(responseEvents),
      setHeader: vi.fn(),
      write: vi.fn(() => false),
    };

    const pending = controller.message(
      '10000000-0000-4000-8000-000000000001',
      {
        attachmentIds: [],
        content: 'hello',
        parameters: {},
        providerModelId: '20000000-0000-4000-8000-000000000001',
      },
      request(),
      response,
    );

    expect(response.write).toHaveBeenCalledOnce();
    expect(continuedAfterWrite).toBe(false);

    responseEvents.emit('drain');
    await pending;

    expect(continuedAfterWrite).toBe(true);
    expect(response.end).toHaveBeenCalledOnce();
    expect(responseEvents.listenerCount('drain')).toBe(0);
  });

  it('releases a backpressure waiter when the client closes', async () => {
    const responseEvents = new EventEmitter();
    const execute = vi.fn(
      async (
        _input: unknown,
        emit: (event: {
          messageId: string;
          modelId: string;
          type: 'start';
        }) => void | Promise<void>,
      ) =>
        emit({
          messageId: '30000000-0000-4000-8000-000000000001',
          modelId: 'gpt-test',
          type: 'start',
        }),
    );
    const controller = new ChatsController(
      {} as ChatsService,
      { execute } as unknown as ChatExecutionService,
    );
    const response = {
      end: vi.fn(),
      flushHeaders: vi.fn(),
      off: responseEvents.off.bind(responseEvents),
      on: responseEvents.on.bind(responseEvents),
      once: responseEvents.once.bind(responseEvents),
      setHeader: vi.fn(),
      write: vi.fn(() => false),
    };
    const pending = controller.message(
      '10000000-0000-4000-8000-000000000001',
      {
        attachmentIds: [],
        content: 'hello',
        parameters: {},
        providerModelId: '20000000-0000-4000-8000-000000000001',
      },
      request(),
      response,
    );
    const rejection = expect(pending).rejects.toThrow(
      'SSE response closed before the buffer drained.',
    );

    responseEvents.emit('close');
    await rejection;

    expect(response.end).toHaveBeenCalledOnce();
    expect(responseEvents.listenerCount('drain')).toBe(0);
  });
});
