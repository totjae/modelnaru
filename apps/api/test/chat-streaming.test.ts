import { describe, expect, it } from 'vitest';

import {
  buildProviderStreamRequest,
  normalizeProviderStreamEvent,
  streamProvider,
  streamProviderRequest,
} from '../src/chat-streaming.js';
import { providerTemplateById } from '../src/provider-catalog.js';

const messages = [{ content: '안녕', role: 'user' as const }];

type Protocol = 'openai' | 'anthropic' | 'gemini';
const frame = (document: unknown) => `data: ${JSON.stringify(document)}\n\n`;
const openaiText = (text: string, reason: string | null = null) => ({
  choices: [{ delta: { content: text }, finish_reason: reason }],
});
const anthropicText = (text: string) => ({
  type: 'content_block_delta',
  delta: { type: 'text_delta', text },
});
const geminiText = (text: string, reason?: string) => ({
  candidates: [
    {
      content: { parts: [{ text }] },
      ...(reason ? { finishReason: reason } : {}),
    },
  ],
});

async function collect(
  protocol: Protocol,
  chunks: string[],
  options: {
    maximumGeneratedTextBytes?: number;
    splitBytes?: boolean;
    status?: number;
  } = {},
) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (options.splitBytes) {
        const bytes = encoder.encode(chunks.join(''));
        for (let index = 0; index < bytes.length; index++)
          controller.enqueue(bytes.subarray(index, index + 1));
      } else {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  const events = [];
  const request = {
    init: { method: 'POST' },
    protocol,
    traceBody: null,
    url: 'https://provider.example/chat',
  };
  for await (const event of streamProviderRequest(
    {
      request,
      signal: new AbortController().signal,
      ...(options.maximumGeneratedTextBytes !== undefined
        ? { maximumGeneratedTextBytes: options.maximumGeneratedTextBytes }
        : {}),
    },
    () =>
      Promise.resolve(new Response(body, { status: options.status ?? 200 })),
  ))
    events.push(event);
  return events;
}

function requestBody(request: { init: RequestInit }): Record<string, unknown> {
  if (typeof request.init.body !== 'string') {
    throw new Error('Expected a JSON request body');
  }
  return JSON.parse(request.init.body) as Record<string, unknown>;
}

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

  it('adds the current UTC timestamp without changing the stored prompt', () => {
    const template = providerTemplateById('openai')!;
    const request = buildProviderStreamRequest({
      apiKey: 'test-key',
      baseUrl: template.baseUrl!,
      messages,
      modelId: 'gpt-test',
      parameters: {},
      systemPrompt: '기존 지침',
      template,
    });
    const body = requestBody(request) as unknown as {
      messages: Array<{ content: string; role: string }>;
    };

    expect(body.messages[0]?.content).toContain('기존 지침');
    expect(body.messages[0]?.content).toMatch(
      /Current time: \d{4}-\d{2}-\d{2}T.+Z \(UTC\)\./u,
    );
  });

  it('maps conversation web search to native Anthropic and Gemini tools', () => {
    const bodyFor = (templateId: 'anthropic' | 'google') => {
      const template = providerTemplateById(templateId)!;
      const request = buildProviderStreamRequest({
        apiKey: 'test-key',
        baseUrl: template.baseUrl!,
        messages,
        modelId: 'search-model',
        parameters: {},
        systemPrompt: '',
        template,
        webSearchEnabled: true,
      });
      return requestBody(request);
    };

    expect(bodyFor('anthropic')).toMatchObject({
      tools: [{ name: 'web_search', type: 'web_search_20250305' }],
    });
    expect(bodyFor('google')).toMatchObject({
      tools: [{ google_search: {} }],
    });
  });

  it('maps image input to each provider protocol', () => {
    const imageMessages = [
      {
        content: '이 이미지를 설명해줘',
        images: [{ data: 'aGVsbG8=', mediaType: 'image/png' as const }],
        role: 'user' as const,
      },
    ];
    const requestBody = (templateId: 'anthropic' | 'google' | 'openai') => {
      const template = providerTemplateById(templateId)!;
      const request = buildProviderStreamRequest({
        apiKey: 'key',
        baseUrl: template.baseUrl!,
        messages: imageMessages,
        modelId: 'vision-model',
        parameters: {},
        systemPrompt: '',
        template,
      });
      if (typeof request.init.body !== 'string') {
        throw new Error('Expected a JSON string request body');
      }
      return JSON.parse(request.init.body) as Record<string, unknown>;
    };

    expect(JSON.stringify(requestBody('openai'))).toContain(
      'data:image/png;base64,aGVsbG8=',
    );
    expect(JSON.stringify(requestBody('anthropic'))).toContain(
      '"media_type":"image/png"',
    );
    expect(JSON.stringify(requestBody('google'))).toContain(
      '"mime_type":"image/png"',
    );
    const openAiTemplate = providerTemplateById('openai')!;
    const tracedRequest = buildProviderStreamRequest(
      {
        apiKey: 'key',
        baseUrl: openAiTemplate.baseUrl!,
        messages: imageMessages,
        modelId: 'vision-model',
        parameters: {},
        systemPrompt: '',
        template: openAiTemplate,
      },
      true,
    );
    expect(JSON.stringify(tracedRequest.traceBody)).not.toContain('aGVsbG8=');
    expect(JSON.stringify(tracedRequest.traceBody)).toContain(
      'binary image omitted',
    );
  });

  it('streams an already serialized provider request without rebuilding it', async () => {
    const request = {
      init: {
        body: '{"model":"prepared-request"}',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
      protocol: 'openai' as const,
      traceBody: { model: 'prepared-request' },
      url: 'https://provider.example/prepared',
    };
    const fetchImplementation = (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      expect(url).toBe(request.url);
      expect(init?.body).toBe(request.init.body);
      return Promise.resolve(
        new Response(
          'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          {
            headers: { 'Content-Type': 'text/event-stream' },
            status: 200,
          },
        ),
      );
    };
    const events = [];

    for await (const event of streamProviderRequest(
      { request, signal: new AbortController().signal },
      fetchImplementation,
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      { text: 'ok', type: 'text_delta' },
      { durationMs: 0, stopReason: 'stop', type: 'done' },
    ]);
  });

  it('normalizes text and usage without declaring completion', () => {
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
          encoder.encode(
            '루"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          ),
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

    expect(events).toEqual([
      { text: '나루', type: 'text_delta' },
      { durationMs: 0, stopReason: 'stop', type: 'done' },
    ]);
  });

  it.each([
    [
      'openai',
      [
        frame(openaiText('답')),
        frame(openaiText('', 'stop')),
        'data: [DONE]\n\n',
      ],
      'stop',
    ],
    [
      'anthropic',
      [
        frame(anthropicText('답')),
        frame({
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 3 },
        }),
        frame({ type: 'message_stop' }),
      ],
      'end_turn',
    ],
    [
      'gemini',
      [frame(geminiText('답')), frame(geminiText('', 'STOP'))],
      'STOP',
    ],
  ] as const)(
    'accepts %s terminal and optional usage',
    async (protocol, chunks, reason) => {
      const events = await collect(protocol, [...chunks]);
      expect(events).toContainEqual({ text: '답', type: 'text_delta' });
      expect(events.at(-1)).toEqual({
        durationMs: 0,
        stopReason: reason,
        type: 'done',
      });
      if (protocol === 'anthropic')
        expect(events).toContainEqual({ outputTokens: 3, type: 'usage' });
    },
  );

  it.each([
    [
      'openai',
      [
        frame(openaiText('가')),
        frame(openaiText('', 'stop')),
        'data: [DONE]\n\n',
      ],
    ],
    [
      'anthropic',
      [
        frame(anthropicText('가')),
        frame({
          type: 'message_delta',
          delta: { stop_reason: 'stop_sequence' },
        }),
        frame({ type: 'message_stop' }),
      ],
    ],
    ['gemini', [frame(geminiText('가', 'STOP'))]],
  ] as const)(
    'parses %s with every UTF-8 byte in a separate transport chunk',
    async (protocol, chunks) => {
      const events = await collect(protocol, [...chunks], { splitBytes: true });
      expect(events).toContainEqual({ text: '가', type: 'text_delta' });
      expect(events.at(-1)?.type).toBe('done');
    },
  );

  it.each([
    ['openai', [frame(openaiText('partial'))]],
    ['openai', ['data: [DONE]\n\n']],
    [
      'anthropic',
      [
        frame(anthropicText('partial')),
        frame({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }),
      ],
    ],
    ['gemini', [frame(geminiText('partial'))]],
  ] as const)('rejects incomplete %s streams', async (protocol, chunks) => {
    await expect(collect(protocol, [...chunks])).rejects.toMatchObject({
      code: 'CHAT_PROVIDER_INCOMPLETE',
    });
  });

  it.each([
    [
      'openai',
      [frame(openaiText('partial')), frame(openaiText('', 'length'))],
      'CHAT_OUTPUT_LIMIT',
    ],
    [
      'openai',
      [frame(openaiText('partial')), frame(openaiText('', 'content_filter'))],
      'CHAT_PROVIDER_REFUSED',
    ],
    [
      'openai',
      [
        frame({
          choices: [{ delta: { tool_calls: [{}] }, finish_reason: null }],
        }),
      ],
      'CHAT_PROVIDER_RESPONSE_INVALID',
    ],
    [
      'anthropic',
      [
        frame(anthropicText('partial')),
        frame({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } }),
      ],
      'CHAT_OUTPUT_LIMIT',
    ],
    [
      'anthropic',
      [frame({ type: 'message_delta', delta: { stop_reason: 'refusal' } })],
      'CHAT_PROVIDER_REFUSED',
    ],
    [
      'gemini',
      [frame(geminiText('partial', 'MAX_TOKENS'))],
      'CHAT_OUTPUT_LIMIT',
    ],
    [
      'gemini',
      [frame(geminiText('partial', 'SAFETY'))],
      'CHAT_PROVIDER_REFUSED',
    ],
    [
      'gemini',
      [frame(geminiText('partial', 'OTHER'))],
      'CHAT_PROVIDER_RESPONSE_INVALID',
    ],
  ] as const)('maps %s terminal failure', async (protocol, chunks, code) => {
    await expect(collect(protocol, [...chunks])).rejects.toMatchObject({
      code,
    });
  });

  it.each(['openai', 'anthropic', 'gemini'] as const)(
    'rejects in-stream %s error without leaking its body',
    async (protocol) => {
      await expect(
        collect(protocol, [
          frame({ type: 'error', error: { message: 'secret' } }),
        ]),
      ).rejects.toMatchObject({
        code: 'CHAT_PROVIDER_UPSTREAM_ERROR',
        message: 'The AI provider could not complete the request.',
      });
    },
  );

  it.each([
    [401, 'CHAT_PROVIDER_AUTH_FAILED'],
    [429, 'CHAT_PROVIDER_RATE_LIMITED'],
    [503, 'CHAT_PROVIDER_UPSTREAM_ERROR'],
  ] as const)(
    'classifies HTTP %i without returning its body',
    async (status, code) => {
      await expect(
        collect('openai', ['private provider body'], { status }),
      ).rejects.toMatchObject({
        code,
        message: 'The AI provider could not complete the request.',
      });
    },
  );

  it('rejects malformed UTF-8, unterminated SSE, empty text and output byte overflow', async () => {
    await expect(collect('openai', [])).rejects.toMatchObject({
      code: 'CHAT_PROVIDER_RESPONSE_INVALID',
    });
    await expect(
      collect('openai', ['data: {invalid}\n\n']),
    ).rejects.toMatchObject({ code: 'CHAT_PROVIDER_RESPONSE_INVALID' });
    await expect(
      collect('openai', [frame(openaiText('답')), 'data: [DONE]']),
    ).rejects.toMatchObject({ code: 'CHAT_PROVIDER_RESPONSE_INVALID' });
    await expect(
      collect('openai', [frame(openaiText('', 'stop')), 'data: [DONE]\n\n']),
    ).rejects.toMatchObject({ code: 'CHAT_EMPTY_RESPONSE' });
    await expect(
      collect(
        'openai',
        [
          frame(openaiText('가')),
          frame(openaiText('', 'stop')),
          'data: [DONE]\n\n',
        ],
        { maximumGeneratedTextBytes: 2 },
      ),
    ).rejects.toMatchObject({ code: 'CHAT_OUTPUT_LIMIT' });
    const malformed = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xff]));
        controller.close();
      },
    });
    const request = {
      init: { method: 'POST' },
      protocol: 'openai' as const,
      traceBody: null,
      url: 'https://provider.example/chat',
    };
    await expect(
      (async () => {
        for await (const event of streamProviderRequest(
          { request, signal: new AbortController().signal },
          () => Promise.resolve(new Response(malformed)),
        )) {
          void event;
        }
      })(),
    ).rejects.toMatchObject({ code: 'CHAT_PROVIDER_RESPONSE_INVALID' });
  });

  it('decodes a UTF-8 scalar and CRLF delimiter split across byte chunks', async () => {
    const payload = new TextEncoder().encode(
      `${frame(openaiText('나루'))}${frame(openaiText('', 'stop'))}data: [DONE]\r\n\r\n`,
    );
    const syllable = payload.indexOf(0xeb);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < payload.length; index++) {
          controller.enqueue(payload.subarray(index, index + 1));
        }
        controller.close();
      },
    });
    expect(syllable).toBeGreaterThan(0);
    const request = {
      init: { method: 'POST' },
      protocol: 'openai' as const,
      traceBody: null,
      url: 'https://provider.example/chat',
    };
    const events = [];
    for await (const event of streamProviderRequest(
      { request, signal: new AbortController().signal },
      () => Promise.resolve(new Response(body)),
    ))
      events.push(event);
    expect(events).toEqual([
      { text: '나루', type: 'text_delta' },
      { durationMs: 0, stopReason: 'stop', type: 'done' },
    ]);
  });

  it('preserves usage before a later provider error and rejects an oversized SSE event', async () => {
    const events = [];
    try {
      const request = {
        init: { method: 'POST' },
        protocol: 'openai' as const,
        traceBody: null,
        url: 'https://provider.example/chat',
      };
      for await (const event of streamProviderRequest(
        { request, signal: new AbortController().signal },
        () =>
          Promise.resolve(
            new Response(
              `${frame({ choices: [], usage: { prompt_tokens: 4, completion_tokens: 2 } })}${frame({ error: { message: 'private' } })}`,
            ),
          ),
      ))
        events.push(event);
      throw new Error('Expected a provider error');
    } catch (error) {
      expect(error).toMatchObject({ code: 'CHAT_PROVIDER_UPSTREAM_ERROR' });
    }
    expect(events).toEqual([
      { inputTokens: 4, outputTokens: 2, type: 'usage' },
    ]);
    const terminalUsage = [];
    try {
      const request = {
        init: { method: 'POST' },
        protocol: 'openai' as const,
        traceBody: null,
        url: 'https://provider.example/chat',
      };
      for await (const event of streamProviderRequest(
        { request, signal: new AbortController().signal },
        () =>
          Promise.resolve(
            new Response(
              frame({
                choices: [{ delta: {}, finish_reason: 'length' }],
                usage: { completion_tokens: 7 },
              }),
            ),
          ),
      ))
        terminalUsage.push(event);
    } catch (error) {
      expect(error).toMatchObject({ code: 'CHAT_OUTPUT_LIMIT' });
    }
    expect(terminalUsage).toEqual([{ outputTokens: 7, type: 'usage' }]);
    await expect(
      collect('gemini', [`data: ${'x'.repeat(1024 * 1024)}\n\n`]),
    ).rejects.toMatchObject({ code: 'CHAT_PROVIDER_RESPONSE_INVALID' });
  });

  it('maps caller cancellation and idle timeout separately', async () => {
    const request = {
      init: { method: 'POST' },
      protocol: 'openai' as const,
      traceBody: null,
      url: 'https://provider.example/chat',
    };
    const pendingFetch: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      });
    const cancellation = new AbortController();
    const cancelled = (async () => {
      for await (const event of streamProviderRequest(
        { request, signal: cancellation.signal },
        pendingFetch,
      )) {
        void event;
      }
    })();
    cancellation.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    const timedOut = (async () => {
      for await (const event of streamProviderRequest(
        { idleTimeoutMs: 5, request, signal: new AbortController().signal },
        pendingFetch,
      )) {
        void event;
      }
    })();
    await expect(timedOut).rejects.toMatchObject({
      code: 'CHAT_PROVIDER_TIMEOUT',
    });
    const totalTimedOut = (async () => {
      for await (const event of streamProviderRequest(
        {
          idleTimeoutMs: 1000,
          request,
          signal: new AbortController().signal,
          totalTimeoutMs: 5,
        },
        pendingFetch,
      )) {
        void event;
      }
    })();
    await expect(totalTimedOut).rejects.toMatchObject({
      code: 'CHAT_PROVIDER_TIMEOUT',
    });
    const headerTimedOut = (async () => {
      for await (const event of streamProviderRequest(
        {
          headerTimeoutMs: 5,
          idleTimeoutMs: 1000,
          request,
          signal: new AbortController().signal,
        },
        pendingFetch,
      )) {
        void event;
      }
    })();
    await expect(headerTimedOut).rejects.toMatchObject({
      code: 'CHAT_PROVIDER_TIMEOUT',
    });
  });
});
