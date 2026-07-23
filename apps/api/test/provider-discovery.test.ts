import { describe, expect, it, vi } from 'vitest';

import { providerTemplateById } from '../src/provider-catalog.js';
import {
  discoverProviderModels,
  normalizeProviderModels,
  providerDiscoveryHeaders,
  staticProviderModels,
} from '../src/provider-discovery.js';

describe('provider model discovery', () => {
  it('builds provider-specific authentication headers', () => {
    expect(
      providerDiscoveryHeaders(providerTemplateById('llm-gateway')!, 'key'),
    ).toMatchObject({ Authorization: 'Bearer key' });
    expect(
      providerDiscoveryHeaders(providerTemplateById('anthropic')!, 'key'),
    ).toMatchObject({
      'anthropic-version': '2023-06-01',
      'x-api-key': 'key',
    });
    expect(
      providerDiscoveryHeaders(providerTemplateById('google')!, 'key'),
    ).toMatchObject({ 'x-goog-api-key': 'key' });
  });

  it('supports optional bearer credentials and static registry models', () => {
    expect(
      providerDiscoveryHeaders(providerTemplateById('cerebras')!, ''),
    ).not.toHaveProperty('Authorization');
    expect(
      staticProviderModels(providerTemplateById('deepseek')!),
    ).toMatchObject([{ id: 'deepseek-v4-flash' }, { id: 'deepseek-v4-pro' }]);
  });

  it('normalizes OpenAI-compatible and Google model fixtures', () => {
    expect(
      normalizeProviderModels(providerTemplateById('llm-gateway')!, {
        data: [
          { context_length: 400000, id: 'openai/gpt-5', owned_by: 'openai' },
          { id: 'anthropic/claude-sonnet-4' },
        ],
      }),
    ).toMatchObject([
      { id: 'anthropic/claude-sonnet-4' },
      {
        contextWindow: 400000,
        id: 'openai/gpt-5',
        metadata: { ownedBy: 'openai' },
      },
    ]);
    expect(
      normalizeProviderModels(providerTemplateById('google')!, {
        models: [
          {
            displayName: 'Gemini',
            inputTokenLimit: 100000,
            name: 'models/gemini-test',
            outputTokenLimit: 8192,
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      }),
    ).toMatchObject([
      {
        contextWindow: 100000,
        id: 'gemini-test',
        maxOutputTokens: 8192,
      },
    ]);
  });

  it('uses the fixed URL, rejects redirects and does not expose the key', async () => {
    const fetchImplementation = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"data":[{"id":"model-1"}]}'),
      }),
    );
    await expect(
      discoverProviderModels(
        providerTemplateById('llm-gateway')!,
        'secret-test-key',
        fetchImplementation,
      ),
    ).resolves.toMatchObject([{ id: 'model-1' }]);
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.llmgateway.io/v1/key',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-test-key',
        }),
        redirect: 'error',
      }),
    );
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.llmgateway.io/v1/models?exclude_deprecated=true',
      expect.objectContaining({ redirect: 'error' }),
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('stops before public model discovery when LLM Gateway rejects the key', async () => {
    const fetchImplementation = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve('{"error":"unauthorized"}'),
      }),
    );
    await expect(
      discoverProviderModels(
        providerTemplateById('llm-gateway')!,
        'invalid-key',
        fetchImplementation,
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED' });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});
