import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerTemplateById } from '../src/provider-catalog.js';

import type { ChatProviderService } from '../src/chat-provider.service.js';
import type { SummarizationRepository } from '../src/summarization.repository.js';
import {
  estimateContextSize,
  SummarizationService,
} from '../src/summarization.service.js';

afterEach(() => vi.unstubAllGlobals());

function generatedFixture() {
  const repository = {
    getSettings: () =>
      Promise.resolve({
        providerModelId: 'summary-model',
        prompt: 'Summarize faithfully.',
        promptVersion: 1,
        maxOutputTokens: 4_096,
        providerParameters: {},
        temperature: null,
        topP: null,
      }),
    findReusable: () => Promise.resolve(undefined),
    beginAttempt: vi.fn(() => Promise.resolve('usage')),
    markAttemptSent: vi.fn(async () => {}),
    recordAttemptTokens: vi.fn(async () => {}),
    finishAttempt: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
  };
  const providers = {
    resolve: vi.fn(() =>
      Promise.resolve({
        providerModelId: 'summary-model',
        modelId: 'fixture',
        apiKey: 'fixture',
        baseUrl: 'https://api.openai.com/v1',
        template: providerTemplateById('openai')!,
        contextWindow: 16_384,
        maxOutputTokens: 4_096,
      }),
    ),
  };
  return {
    repository,
    service: new SummarizationService(
      repository as unknown as SummarizationRepository,
      providers as unknown as ChatProviderService,
    ),
  };
}

describe('SummarizationService', () => {
  it('includes UTF-8 serialization and request/message overhead', () => {
    expect(
      estimateContextSize('지침', [{ content: 'hello' }, { content: '안녕' }]),
    ).toBeGreaterThan(1_024 + 128 + Buffer.byteLength('지침hello안녕'));
  });

  it('reuses a compatible stored summary and keeps later messages', async () => {
    const repository = {
      findReusable: vi.fn(() =>
        Promise.resolve({
          coveredMessageCount: 2,
          firstMessageId: 'm1',
          id: 'summary-1',
          lastMessageId: 'm2',
          promptVersion: 3,
          providerModelId: 'model-1',
          summary: '앞선 대화의 핵심',
        }),
      ),
      getSettings: vi.fn(() =>
        Promise.resolve({
          maxOutputTokens: 2048,
          prompt: '요약 프롬프트',
          promptVersion: 3,
          providerModelId: 'model-1',
          temperature: 0.2,
          topP: 0.9,
          updatedAt: new Date(),
        }),
      ),
    };
    const providers = {
      resolve: vi.fn(() => Promise.resolve({})),
    };
    const service = new SummarizationService(
      repository as unknown as SummarizationRepository,
      providers as unknown as ChatProviderService,
    );

    const result = await service.fitContext({
      branchId: 'branch-1',
      context: [
        { content: '오래된 질문', id: 'm1', role: 'user' },
        { content: '오래된 답변', id: 'm2', role: 'assistant' },
        { content: '새 질문', id: 'm3', role: 'user' },
      ],
      contextLimit: 3_000,
      conversationId: 'conversation-1',
      systemPrompt: '',
    });

    expect(result).toEqual([
      {
        content: '[이전 대화 요약]\n앞선 대화의 핵심',
        id: 'summary-1',
        role: 'user',
      },
      { content: '새 질문', id: 'm3', role: 'user' },
    ]);
  });

  it('splits on message boundaries, carries the previous summary and limits paid calls', async () => {
    const { repository, service } = generatedFixture();
    const bodies: Array<{
      messages: Array<{ content: string }>;
      max_tokens?: number;
      max_completion_tokens?: number;
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string) as (typeof bodies)[number]);
        return Promise.resolve(
          new Response(
            'data: {"choices":[{"delta":{"content":"compact summary"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          ),
        );
      }),
    );
    const beforeProviderSend = vi.fn(async () => {});
    const input = {
      jobId: 'job',
      branchId: 'branch',
      conversationId: 'chat',
      systemPrompt: '',
      contextLimit: 2_000,
      beforeProviderSend,
      context: [
        { id: 'm1', role: 'user' as const, content: 'a'.repeat(9_000) },
        { id: 'm2', role: 'assistant' as const, content: 'b'.repeat(9_000) },
        { id: 'm3', role: 'user' as const, content: 'last' },
      ],
    };
    const result = await service.fitContext(input);
    expect(bodies).toHaveLength(2);
    expect(JSON.stringify(bodies[1])).toContain('compact summary');
    expect(
      bodies.every(
        (body) => (body.max_tokens ?? body.max_completion_tokens) === 1_024,
      ),
    ).toBe(true);
    expect(beforeProviderSend).toHaveBeenCalledTimes(2);
    expect(result.at(-1)?.content).toBe('last');
    await expect(
      service.fitContext({
        ...input,
        context: [
          ...Array.from({ length: 5 }, (_, i) => ({
            id: `large${i}`,
            role: 'user' as const,
            content: 'c'.repeat(9_000),
          })),
          { id: 'last', role: 'user', content: 'last' },
        ],
      }),
    ).rejects.toThrow();
    expect(bodies).toHaveLength(6);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('refuses one oversized message before sending and retains partial usage on failure', async () => {
    const { repository, service } = generatedFixture();
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          'data: {"choices":[],"usage":{"prompt_tokens":11,"completion_tokens":2}}\n\ndata: {"error":{"message":"fixture failure"}}\n\n',
        ),
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const input = {
      jobId: 'job',
      branchId: 'branch',
      conversationId: 'chat',
      systemPrompt: '',
      contextLimit: 2_000,
      context: [
        { id: 'big', role: 'user' as const, content: 'a'.repeat(20_000) },
        { id: 'last', role: 'user' as const, content: 'last' },
      ],
    };
    await expect(service.fitContext(input)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      service.fitContext({
        ...input,
        context: [
          { id: 'big', role: 'user', content: 'a'.repeat(5_000) },
          { id: 'last', role: 'user', content: 'last' },
        ],
      }),
    ).rejects.toThrow();
    expect(repository.finishAttempt).toHaveBeenCalledWith(
      'usage',
      'failed',
      11,
      2,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });
});
