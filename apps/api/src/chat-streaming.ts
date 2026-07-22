import type { ProviderTemplate } from './provider-catalog.js';
import { providerDiscoveryHeaders } from './provider-discovery.js';

export interface ChatContextMessage {
  content: string;
  role: 'assistant' | 'user';
}

export interface ChatParameters {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
}

export type ChatEvent =
  | { messageId: string; modelId: string; type: 'start' }
  | { text: string; type: 'text_delta' }
  | { inputTokens?: number; outputTokens?: number; type: 'usage' }
  | { durationMs: number; stopReason?: string; type: 'done' }
  | {
      code: string;
      message: string;
      retryable: boolean;
      type: 'error';
    };

export interface ProviderStreamInput {
  apiKey: string;
  baseUrl: string;
  messages: ChatContextMessage[];
  modelId: string;
  parameters: ChatParameters;
  signal: AbortSignal;
  systemPrompt: string;
  template: ProviderTemplate;
}

export type ProviderProtocol = 'anthropic' | 'gemini' | 'openai';

export class ChatUpstreamError extends Error {
  constructor(
    readonly code:
      | 'CHAT_PROVIDER_AUTH_FAILED'
      | 'CHAT_PROVIDER_NETWORK_ERROR'
      | 'CHAT_PROVIDER_RATE_LIMITED'
      | 'CHAT_PROVIDER_RESPONSE_INVALID'
      | 'CHAT_PROVIDER_UPSTREAM_ERROR',
    readonly retryable: boolean,
  ) {
    super('The AI provider could not complete the request.');
  }
}

interface UpstreamRequest {
  init: RequestInit;
  protocol: ProviderProtocol;
  url: string;
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/u, '')}/${path.replace(/^\//u, '')}`;
}

function generationParameters(parameters: ChatParameters) {
  return {
    ...(parameters.maxOutputTokens !== undefined
      ? { maxOutputTokens: parameters.maxOutputTokens }
      : {}),
    ...(parameters.temperature !== undefined
      ? { temperature: parameters.temperature }
      : {}),
    ...(parameters.topP !== undefined ? { topP: parameters.topP } : {}),
  };
}

function usesCompletionTokenParameter(modelId: string): boolean {
  return /^(?:gpt-5|o[134](?:-|$))/iu.test(modelId);
}

export function buildProviderStreamRequest(
  input: Omit<ProviderStreamInput, 'signal'>,
): UpstreamRequest {
  const headers = {
    ...providerDiscoveryHeaders(input.template, input.apiKey),
    'Content-Type': 'application/json',
  };
  const parameters = generationParameters(input.parameters);
  if (input.template.defaultFormat === 'anthropic') {
    return {
      init: {
        body: JSON.stringify({
          max_tokens: parameters.maxOutputTokens ?? 4_096,
          messages: input.messages.map((message) => ({
            content: message.content,
            role: message.role,
          })),
          model: input.modelId,
          stream: true,
          ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
          ...(parameters.temperature !== undefined
            ? { temperature: parameters.temperature }
            : {}),
          ...(parameters.topP !== undefined ? { top_p: parameters.topP } : {}),
        }),
        headers,
        method: 'POST',
        redirect: 'error',
      },
      protocol: 'anthropic',
      url: endpoint(
        input.baseUrl,
        input.template.formats?.anthropic ?? '/messages',
      ),
    };
  }
  if (input.template.defaultFormat === 'gemini') {
    const configuredPath =
      input.template.formats?.gemini ??
      '/v1beta/models/{model}:generateContent';
    const streamPath = configuredPath
      .replace('{model}', encodeURIComponent(input.modelId))
      .replace(':generateContent', ':streamGenerateContent');
    return {
      init: {
        body: JSON.stringify({
          contents: input.messages.map((message) => ({
            parts: [{ text: message.content }],
            role: message.role === 'assistant' ? 'model' : 'user',
          })),
          generationConfig: parameters,
          ...(input.systemPrompt
            ? { systemInstruction: { parts: [{ text: input.systemPrompt }] } }
            : {}),
        }),
        headers,
        method: 'POST',
        redirect: 'error',
      },
      protocol: 'gemini',
      url: `${endpoint(input.baseUrl, streamPath)}?alt=sse`,
    };
  }
  return {
    init: {
      body: JSON.stringify({
        messages: [
          ...(input.systemPrompt
            ? [{ content: input.systemPrompt, role: 'system' }]
            : []),
          ...input.messages.map((message) => ({
            content: message.content,
            role: message.role,
          })),
        ],
        model: input.modelId,
        stream: true,
        stream_options: { include_usage: true },
        ...(parameters.maxOutputTokens !== undefined
          ? usesCompletionTokenParameter(input.modelId)
            ? { max_completion_tokens: parameters.maxOutputTokens }
            : { max_tokens: parameters.maxOutputTokens }
          : {}),
        ...(parameters.temperature !== undefined
          ? { temperature: parameters.temperature }
          : {}),
        ...(parameters.topP !== undefined ? { top_p: parameters.topP } : {}),
      }),
      headers,
      method: 'POST',
      redirect: 'error',
    },
    protocol: 'openai',
    url: endpoint(
      input.baseUrl,
      input.template.formats?.openai ?? '/chat/completions',
    ),
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function textParts(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((part) => record(part)?.text)
    .filter((text): text is string => typeof text === 'string')
    .join('');
}

function usageEvent(
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): ChatEvent {
  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    type: 'usage',
  };
}

export function normalizeProviderStreamEvent(
  protocol: ProviderProtocol,
  document: unknown,
): ChatEvent[] {
  const root = record(document);
  if (!root)
    throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
  if (protocol === 'anthropic') {
    const delta = record(root.delta);
    const usage = record(root.usage) ?? record(record(root.message)?.usage);
    const events: ChatEvent[] = [];
    if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
      events.push({ text: delta.text, type: 'text_delta' });
    }
    const inputTokens = integer(usage?.input_tokens);
    const outputTokens = integer(usage?.output_tokens);
    if (inputTokens !== undefined || outputTokens !== undefined) {
      events.push(usageEvent(inputTokens, outputTokens));
    }
    if (root.type === 'message_stop') {
      events.push({ durationMs: 0, type: 'done' });
    }
    return events;
  }
  if (protocol === 'gemini') {
    const candidates = Array.isArray(root.candidates) ? root.candidates : [];
    const candidate = record(candidates[0]);
    const content = record(candidate?.content);
    const usage = record(root.usageMetadata);
    const events: ChatEvent[] = [];
    const text = textParts(content?.parts);
    if (text) events.push({ text, type: 'text_delta' });
    const inputTokens = integer(usage?.promptTokenCount);
    const outputTokens = integer(usage?.candidatesTokenCount);
    if (inputTokens !== undefined || outputTokens !== undefined) {
      events.push(usageEvent(inputTokens, outputTokens));
    }
    if (typeof candidate?.finishReason === 'string') {
      events.push({
        durationMs: 0,
        stopReason: candidate.finishReason,
        type: 'done',
      });
    }
    return events;
  }
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const choice = record(choices[0]);
  const delta = record(choice?.delta);
  const usage = record(root.usage);
  const events: ChatEvent[] = [];
  if (typeof delta?.content === 'string' && delta.content) {
    events.push({ text: delta.content, type: 'text_delta' });
  }
  const inputTokens = integer(usage?.prompt_tokens);
  const outputTokens = integer(usage?.completion_tokens);
  if (inputTokens !== undefined || outputTokens !== undefined) {
    events.push(usageEvent(inputTokens, outputTokens));
  }
  if (typeof choice?.finish_reason === 'string') {
    events.push({
      durationMs: 0,
      stopReason: choice.finish_reason,
      type: 'done',
    });
  }
  return events;
}

async function* sseData(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/gu, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) yield data;
      boundary = buffer.indexOf('\n\n');
    }
  }
  buffer += decoder.decode();
  const data = buffer
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (data) yield data;
}

function upstreamError(status: number): ChatUpstreamError {
  if (status === 401 || status === 403) {
    return new ChatUpstreamError('CHAT_PROVIDER_AUTH_FAILED', false);
  }
  if (status === 429) {
    return new ChatUpstreamError('CHAT_PROVIDER_RATE_LIMITED', true);
  }
  return new ChatUpstreamError(
    status >= 500
      ? 'CHAT_PROVIDER_UPSTREAM_ERROR'
      : 'CHAT_PROVIDER_RESPONSE_INVALID',
    status >= 500,
  );
}

export async function* streamProvider(
  input: ProviderStreamInput,
  fetchImplementation: typeof fetch = fetch,
): AsyncGenerator<ChatEvent> {
  const request = buildProviderStreamRequest(input);
  let response: Response;
  try {
    response = await fetchImplementation(request.url, {
      ...request.init,
      signal: input.signal,
    });
  } catch (error) {
    if (input.signal.aborted) throw error;
    throw new ChatUpstreamError('CHAT_PROVIDER_NETWORK_ERROR', true);
  }
  if (!response.ok) throw upstreamError(response.status);
  if (!response.body) {
    throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
  }
  let done = false;
  try {
    for await (const data of sseData(response.body)) {
      if (data === '[DONE]') {
        done = true;
        break;
      }
      let document: unknown;
      try {
        document = JSON.parse(data) as unknown;
      } catch {
        throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
      }
      for (const event of normalizeProviderStreamEvent(
        request.protocol,
        document,
      )) {
        if (event.type === 'done') done = true;
        yield event;
      }
    }
  } catch (error) {
    if (error instanceof ChatUpstreamError || input.signal.aborted) throw error;
    throw new ChatUpstreamError('CHAT_PROVIDER_NETWORK_ERROR', true);
  }
  if (!done) yield { durationMs: 0, type: 'done' };
}
