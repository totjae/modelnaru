import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeTitle,
  TitleGenerationService,
} from '../src/title-generation.service.js';
import type { TitleGenerationRepository } from '../src/title-generation.repository.js';
import type { ChatProviderService } from '../src/chat-provider.service.js';
import { providerTemplateById } from '../src/provider-catalog.js';

afterEach(() => vi.unstubAllGlobals());
const task = {
  id: 'task',
  conversationId: 'chat',
  sessionId: 'session',
  providerModelId: 'model',
  userText: 'x'.repeat(2_000),
  assistantText: 'y'.repeat(2_000),
};
function fixture() {
  const repository = {
    forJob: vi.fn(() => Promise.resolve(task)),
    valid: vi.fn(() => Promise.resolve(true)),
    begin: vi.fn(() => Promise.resolve('usage')),
    tokens: vi.fn(async () => {}),
    finish: vi.fn(async () => {}),
  };
  const providers = {
    resolve: vi.fn(() =>
      Promise.resolve({
        template: providerTemplateById('openai')!,
        providerModelId: 'model',
        modelId: 'gpt-fixture',
        apiKey: 'fixture',
        baseUrl: 'https://api.openai.com/v1',
        contextWindow: 16_384,
        maxOutputTokens: 4_096,
      }),
    ),
  };
  return {
    repository,
    providers,
    service: new TitleGenerationService(
      repository as unknown as TitleGenerationRepository,
      providers as unknown as ChatProviderService,
    ),
  };
}
describe('N08 automatic title failure isolation', () => {
  it('does not start a late title call after shutdown begins', async () => {
    const { repository, service } = fixture();
    const acquire = vi.fn();
    service.onApplicationShutdown();
    await service.forJob('job', acquire);
    expect(repository.forJob).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
  });
  it('normalizes controls and Unicode length to a single title line', () => {
    expect(normalizeTitle('  제목\n\u0000 테스트  ')).toBe('제목 테스트');
    expect(Array.from(normalizeTitle('😀'.repeat(201)))).toHaveLength(200);
  });
  it('caps inputs and output, records usage and releases the shared slot', async () => {
    const { repository, service } = fixture();
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        body = JSON.parse(init.body as string) as Record<string, unknown>;
        return Promise.resolve(
          new Response(
            'data: {"choices":[{"delta":{"content":" 제목\\n테스트 "},"finish_reason":"stop"}],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n\ndata: [DONE]\n\n',
          ),
        );
      }),
    );
    const release = vi.fn();
    await service.forJob('job', () => release);
    expect(body.max_completion_tokens ?? body.max_tokens).toBe(64);
    expect(JSON.stringify(body)).not.toContain('x'.repeat(1_001));
    expect(repository.finish).toHaveBeenCalledWith(
      task,
      'completed',
      '제목 테스트',
      'usage',
      7,
      3,
    );
    expect(release).toHaveBeenCalledOnce();
  });
  it('does not call Provider without a slot and isolates upstream failure', async () => {
    const { repository, service } = fixture();
    const fetch = vi.fn(() => Promise.reject(new Error('upstream')));
    vi.stubGlobal('fetch', fetch);
    await service.forJob('job', () => null);
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      service.forJob('job', () => () => {}),
    ).resolves.toBeUndefined();
    expect(repository.finish).toHaveBeenLastCalledWith(
      task,
      'failed',
      null,
      'usage',
      null,
      null,
    );
  });
});
