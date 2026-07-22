import { describe, expect, it } from 'vitest';

import {
  buildProviderStreamRequest,
  normalizeProviderStreamEvent,
  streamProvider,
} from '../src/chat-streaming.js';
import { providerTemplateById } from '../src/provider-catalog.js';

const messages = [{ content: '안녕', role: 'user' as const }];

describe('chat provider streaming', () => {
  it('builds fixed OpenAI-compatible streaming requests', () => {
    const template = providerTemplateById('openai')!;
    const request = buildProviderStreamRequest({
      apiKey: 'test-key',
      baseUrl: template.baseUrl!,
      messages,
      modelId: 'gpt-test',
      parameters: { maxOutputTokens: 512, temperature: 0.3, topP: 0.9 },
      systemPrompt: '간결하게 답변',
      template,
    });
    if (typeof request.init.body !== 'string') {
      throw new Error('Expected a JSON request body');
    }
    const body = JSON.parse(request.init.body) as Record<string, unknown>;

    expect(request.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(request.init.headers).toMatchObject({
      Authorization: 'Bearer test-key',
    });
    expect(body).toMatchObject({
      max_tokens: 512,
      model: 'gpt-test',
      stream: true,
      temperature: 0.3,
      top_p: 0.9,
    });
  });

  it('builds Anthropic and Gemini requests without a user-supplied URL', () => {
    const anthropic = providerTemplateById('anthropic')!;
    const anthropicRequest = buildProviderStreamRequest({
      apiKey: 'anthropic-key',
      baseUrl: anthropic.baseUrl!,
      messages,
      modelId: 'claude-test',
      parameters: {},
      systemPrompt: '',
      template: anthropic,
    });
    const google = providerTemplateById('google')!;
    const geminiRequest = buildProviderStreamRequest({
      apiKey: 'google-key',
      baseUrl: google.baseUrl!,
      messages,
      modelId: 'gemini-test',
      parameters: {},
      systemPrompt: '',
      template: google,
    });

    expect(anthropicRequest.url).toBe('https://api.anthropic.com/v1/messages');
    expect(anthropicRequest.init.headers).toMatchObject({
      'x-api-key': 'anthropic-key',
    });
    expect(geminiRequest.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent?alt=sse',
    );
    expect(geminiRequest.init.headers).toMatchObject({
      'x-goog-api-key': 'google-key',
    });
  });

  it('normalizes text, usage and completion events', () => {
    expect(
      normalizeProviderStreamEvent('openai', {
        choices: [{ delta: { content: 'hello' }, finish_reason: null }],
      }),
    ).toEqual([{ text: 'hello', type: 'text_delta' }]);
    expect(
      normalizeProviderStreamEvent('anthropic', {
        delta: { text: 'hi', type: 'text_delta' },
        type: 'content_block_delta',
      }),
    ).toEqual([{ text: 'hi', type: 'text_delta' }]);
    expect(
      normalizeProviderStreamEvent('gemini', {
        candidates: [
          {
            content: { parts: [{ text: 'gemini' }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { candidatesTokenCount: 2, promptTokenCount: 3 },
      }),
    ).toEqual([
      { text: 'gemini', type: 'text_delta' },
      { inputTokens: 3, outputTokens: 2, type: 'usage' },
      { durationMs: 0, stopReason: 'STOP', type: 'done' },
    ]);
  });

  it('parses SSE split across transport chunks', async () => {
    const template = providerTemplateById('openai')!;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"나'),
        );
        controller.enqueue(
          encoder.encode('루"},"finish_reason":null}]}\n\ndata: [DONE]\n\n'),
        );
        controller.close();
      },
    });
    const events = [];
    for await (const event of streamProvider(
      {
        apiKey: 'test-key',
        baseUrl: template.baseUrl!,
        messages,
        modelId: 'gpt-test',
        parameters: {},
        signal: new AbortController().signal,
        systemPrompt: '',
        template,
      },
      () => Promise.resolve(new Response(body, { status: 200 })),
    )) {
      events.push(event);
    }

    expect(events).toEqual([{ text: '나루', type: 'text_delta' }]);
  });
});
