import { describe, expect, it } from 'vitest';

import {
  providerCatalog,
  providerTemplateById,
} from '../src/provider-catalog.js';
import {
  normalizeProviderParameters,
  providerParameterPolicy,
  type ProviderGenerationParameters,
} from '../src/provider-parameter-policy.js';
import { buildProviderStreamRequest } from '../src/chat-streaming.js';

const messages = [{ content: 'test', role: 'user' as const }];

function body(
  templateId: string,
  modelId: string,
  parameters: ProviderGenerationParameters,
) {
  const template = providerTemplateById(templateId)!;
  const request = buildProviderStreamRequest({
    apiKey: 'key',
    baseUrl: template.baseUrl!,
    messages,
    modelId,
    parameters,
    systemPrompt: '',
    template,
  });
  if (typeof request.init.body !== 'string') {
    throw new Error('Expected a JSON request body');
  }
  return JSON.parse(request.init.body) as Record<string, unknown>;
}

describe('provider parameter policy', () => {
  it('assigns a parameter profile to every Provider Manager catalog entry', () => {
    expect(providerCatalog.length).toBeGreaterThan(30);
    expect(
      providerCatalog.every((template) => Boolean(template.parameterProfile)),
    ).toBe(true);
  });

  it('keeps sampling controls and removes conflicting values when reasoning is enabled', () => {
    const template = providerTemplateById('openai')!;
    expect(providerParameterPolicy(template, 'gpt-5-mini').profile).toBe(
      'openai-reasoning',
    );
    expect(
      normalizeProviderParameters(template, 'gpt-5-mini', {
        temperature: 0.5,
      }),
    ).toMatchObject({ temperature: 0.5 });
    expect(
      normalizeProviderParameters(template, 'gpt-5-mini', {
        reasoningEffort: 'low',
        temperature: 0.5,
        topP: 0.9,
      }),
    ).toEqual({ reasoningEffort: 'low' });
    expect(
      body('openai', 'gpt-5-mini', {
        reasoningEffort: 'low',
        verbosity: 'low',
      }),
    ).toMatchObject({
      reasoning_effort: 'low',
      verbosity: 'low',
    });
  });

  it('maps Anthropic thinking and removes mutually exclusive sampling values', () => {
    expect(
      body('anthropic', 'claude-sonnet-4-6', {
        maxOutputTokens: 2048,
        temperature: 0.4,
        thinkingBudget: 1024,
        thinkingDisplay: 'summarized',
        topK: 40,
      }),
    ).toMatchObject({
      max_tokens: 2048,
      thinking: {
        budget_tokens: 1024,
        display: 'summarized',
        type: 'enabled',
      },
    });
    const request = body('anthropic', 'claude-sonnet-4-6', {
      temperature: 0.4,
      thinkingBudget: 1024,
      topK: 40,
    });
    expect(request).not.toHaveProperty('temperature');
    expect(request).not.toHaveProperty('top_k');
    const adaptive = providerParameterPolicy(
      providerTemplateById('anthropic')!,
      'claude-opus-4-8',
    );
    expect(adaptive.fields.map((field) => field.key)).toContain('temperature');
    expect(adaptive.disabledFields).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'temperature' })]),
    );
    expect(
      normalizeProviderParameters(
        providerTemplateById('anthropic')!,
        'claude-opus-4-8',
        { temperature: 0.3 },
      ),
    ).not.toHaveProperty('temperature');
  });

  it('maps Gemini sampling, penalties, seed, stops and thinking configuration', () => {
    expect(
      body('google', 'gemini-test', {
        frequencyPenalty: 0.2,
        maxOutputTokens: 2048,
        presencePenalty: 0.1,
        seed: 7,
        stopSequences: ['END'],
        temperature: 0.6,
        thinkingLevel: 'low',
        topK: 32,
        topP: 0.9,
      }),
    ).toMatchObject({
      generationConfig: {
        frequencyPenalty: 0.2,
        maxOutputTokens: 2048,
        presencePenalty: 0.1,
        seed: 7,
        stopSequences: ['END'],
        temperature: 0.6,
        thinkingConfig: { thinkingLevel: 'low' },
        topK: 32,
        topP: 0.9,
      },
    });
  });

  it('routes advanced Provider Manager engines by model family', () => {
    expect(
      providerParameterPolicy(
        providerTemplateById('vertex')!,
        'claude-opus-4-6',
      ).profile,
    ).toBe('anthropic');
    expect(
      providerParameterPolicy(providerTemplateById('vertex')!, 'gemini-3-pro')
        .profile,
    ).toBe('gemini');
    expect(
      providerParameterPolicy(providerTemplateById('bedrock')!, 'gpt-oss-120b')
        .profile,
    ).toBe('openai');
    expect(
      providerParameterPolicy(providerTemplateById('novelai')!, 'kayra')
        .profile,
    ).toBe('novelai');
    expect(
      providerParameterPolicy(
        providerTemplateById('copilot')!,
        'claude-fable-5',
      ).profile,
    ).toBe('anthropic');
  });
});
