import { describe, expect, it, vi } from 'vitest';

import type { ChatProviderService } from '../src/chat-provider.service.js';
import type { SummarizationRepository } from '../src/summarization.repository.js';
import {
  estimateContextSize,
  SummarizationService,
} from '../src/summarization.service.js';

describe('SummarizationService', () => {
  it('estimates context conservatively by Unicode characters', () => {
    expect(
      estimateContextSize('지침', [{ content: 'hello' }, { content: '안녕' }]),
    ).toBe(11);
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
      contextLimit: 100,
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
});
