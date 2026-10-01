import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';

import type { ProviderTemplate } from './provider-catalog.js';
import { providerDiscoveryHeaders } from './provider-discovery.js';
import { ProviderDestinationError } from './provider-destination.js';
import {
  normalizeProviderParameters,
  type ProviderGenerationParameters,
} from './provider-parameter-policy.js';

const MAXIMUM_SSE_BUFFER_BYTES = 1024 * 1024;
const MAXIMUM_REQUEST_BYTES = 32 * 1024 * 1024;
const MAXIMUM_RESPONSE_BYTES = 64 * 1024 * 1024;
const DEFAULT_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAXIMUM_TOTAL_MS = 30 * 60 * 1000;
export const DEFAULT_PROVIDER_IDLE_TIMEOUT_MS = 120_000;

export interface ChatContextMessage {
  content: string;
  images?: Array<{
    data: string;
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  }>;
  role: 'assistant' | 'user';
}

export type ChatParameters = ProviderGenerationParameters;

export type ChatEvent =
  | { branchId: string; messageId: string; modelId: string; type: 'start' }
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
  onRawEvent?: (document: unknown) => void;
  onDiagnostic?: (diagnostic: ProviderResponseDiagnostic) => void;
  maximumGeneratedTextBytes?: number;
  parameters: ChatParameters;
  signal: AbortSignal;
  systemPrompt: string;
  template: ProviderTemplate;
  webSearchEnabled?: boolean;
}

export type ProviderProtocol = 'anthropic' | 'gemini' | 'openai';

export interface ProviderResponseDiagnostic {
  id: string;
  protocol: ProviderProtocol;
  httpStatus: number | null;
  contentType:
    | 'text/event-stream'
    | 'application/json'
    | 'text/html'
    | 'text/plain'
    | 'other'
    | 'missing';
  startedAt: string;
  headersReceivedAt: string | null;
  firstByteReceivedAt: string | null;
  lastByteReceivedAt: string | null;
  endedAt: string;
  durationMs: number;
  headersElapsedMs: number | null;
  firstByteElapsedMs: number | null;
  lastByteElapsedMs: number | null;
  receivedBytes: number;
  chunkCount: number;
  frameCount: number;
  eventCount: number;
  outcome: 'completed' | 'failed' | 'cancelled';
  stage:
    | 'request_headers'
    | 'http_status'
    | 'response_body'
    | 'sse_framing'
    | 'sse_decode'
    | 'json_parse'
    | 'event_validation'
    | 'termination'
    | 'output_limit'
    | 'completed';
  internalCause: string | null;
  errorCode: string | null;
}

const diagnosticLogger = new Logger('ProviderResponseDiagnostic');

export class ChatUpstreamError extends Error {
  constructor(
    readonly code:
      | 'CHAT_PROVIDER_AUTH_FAILED'
      | 'CHAT_PROVIDER_NETWORK_ERROR'
      | 'CHAT_PROVIDER_DESTINATION_DENIED'
      | 'CHAT_PROVIDER_RATE_LIMITED'
      | 'CHAT_PROVIDER_RESPONSE_INVALID'
      | 'CHAT_PROVIDER_TIMEOUT'
      | 'CHAT_PROVIDER_UPSTREAM_ERROR'
      | 'CHAT_PROVIDER_INCOMPLETE'
      | 'CHAT_PROVIDER_REFUSED'
      | 'CHAT_OUTPUT_LIMIT'
      | 'CHAT_EMPTY_RESPONSE',
    readonly retryable: boolean,
  ) {
    super('The AI provider could not complete the request.');
  }
}

export interface UpstreamRequest {
  init: RequestInit;
  protocol: ProviderProtocol;
  traceBody: unknown;
  url: string;
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/u, '')}/${path.replace(/^\//u, '')}`;
}

export function providerSupportsNativeWebSearch(
  template: ProviderTemplate,
): boolean {
  return (
    template.defaultFormat === 'anthropic' ||
    template.defaultFormat === 'gemini' ||
    template.id === 'llm-gateway'
  );
}

export function runtimeSystemPrompt(
  systemPrompt: string,
  now = new Date(),
): string {
  const runtimeContext = [
    '[ModelNaru runtime context]',
    `Current time: ${now.toISOString()} (UTC).`,
    'Use this timestamp as the current time for this request.',
  ].join('\n');
  return systemPrompt ? `${systemPrompt}\n\n${runtimeContext}` : runtimeContext;
}

function usesCompletionTokenParameter(modelId: string): boolean {
  return /^(?:gpt-5|o[134](?:-|$))/iu.test(modelId);
}

function traceSafeProviderBody(value: unknown, key = ''): unknown {
  if (typeof value === 'string') {
    if (key === 'data' || (key === 'url' && value.startsWith('data:image/'))) {
      return `[binary image omitted: ${value.length} characters]`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => traceSafeProviderBody(item));
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(
      ([childKey, child]) => [childKey, traceSafeProviderBody(child, childKey)],
    ),
  );
}

function providerRequest(
  body: unknown,
  headers: NonNullable<RequestInit['headers']>,
  includeTraceBody: boolean,
  protocol: ProviderProtocol,
  url: string,
): UpstreamRequest {
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized, 'utf8') > MAXIMUM_REQUEST_BYTES) {
    throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
  }
  return {
    init: {
      body: serialized,
      headers,
      method: 'POST',
      redirect: 'error',
    },
    protocol,
    traceBody: includeTraceBody ? traceSafeProviderBody(body) : null,
    url,
  };
}

function anthropicContent(message: ChatContextMessage) {
  if (!message.images?.length || message.role === 'assistant') {
    return message.content;
  }
  return [
    ...message.images.map((image) => ({
      source: {
        data: image.data,
        media_type: image.mediaType,
        type: 'base64',
      },
      type: 'image',
    })),
    ...(message.content ? [{ text: message.content, type: 'text' }] : []),
  ];
}

function geminiParts(message: ChatContextMessage) {
  return [
    ...(message.images ?? []).map((image) => ({
      inline_data: { data: image.data, mime_type: image.mediaType },
    })),
    ...(message.content ? [{ text: message.content }] : []),
  ];
}

function openAiContent(message: ChatContextMessage) {
  if (!message.images?.length || message.role === 'assistant') {
    return message.content;
  }
  return [
    ...message.images.map((image) => ({
      image_url: {
        url: `data:${image.mediaType};base64,${image.data}`,
      },
      type: 'image_url',
    })),
    ...(message.content ? [{ text: message.content, type: 'text' }] : []),
  ];
}

export function buildProviderStreamRequest(
  input: Omit<ProviderStreamInput, 'signal'>,
  includeTraceBody = false,
): UpstreamRequest {
  const headers = {
    ...providerDiscoveryHeaders(input.template, input.apiKey),
    'Content-Type': 'application/json',
  };
  const parameters = normalizeProviderParameters(
    input.template,
    input.modelId,
    input.parameters,
  );
  const systemPrompt = runtimeSystemPrompt(input.systemPrompt);
  if (
    input.webSearchEnabled &&
    !providerSupportsNativeWebSearch(input.template)
  ) {
    throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
  }
  if (input.template.defaultFormat === 'anthropic') {
    return providerRequest(
      {
        max_tokens: parameters.maxOutputTokens ?? 4_096,
        messages: input.messages.map((message) => ({
          content: anthropicContent(message),
          role: message.role,
        })),
        model: input.modelId,
        stream: true,
        system: systemPrompt,
        ...(input.webSearchEnabled
          ? {
              tools: [
                {
                  max_uses: 5,
                  name: 'web_search',
                  type: 'web_search_20250305',
                },
              ],
            }
          : {}),
        ...(parameters.temperature !== undefined
          ? { temperature: parameters.temperature }
          : {}),
        ...(parameters.topP !== undefined ? { top_p: parameters.topP } : {}),
        ...(parameters.topK !== undefined ? { top_k: parameters.topK } : {}),
        ...(parameters.stopSequences?.length
          ? { stop_sequences: parameters.stopSequences }
          : {}),
        ...((parameters.thinkingBudget ?? 0) > 0
          ? {
              thinking: {
                budget_tokens: parameters.thinkingBudget,
                ...(parameters.thinkingDisplay
                  ? { display: parameters.thinkingDisplay }
                  : {}),
                type: 'enabled',
              },
            }
          : {}),
        ...(parameters.outputEffort
          ? { output_config: { effort: parameters.outputEffort } }
          : {}),
      },
      headers,
      includeTraceBody,
      'anthropic',
      endpoint(input.baseUrl, input.template.formats?.anthropic ?? '/messages'),
    );
  }
  if (input.template.defaultFormat === 'gemini') {
    const configuredPath =
      input.template.formats?.gemini ??
      '/v1beta/models/{model}:generateContent';
    const streamPath = configuredPath
      .replace('{model}', encodeURIComponent(input.modelId))
      .replace(':generateContent', ':streamGenerateContent');
    return providerRequest(
      {
        contents: input.messages.map((message) => ({
          parts: geminiParts(message),
          role: message.role === 'assistant' ? 'model' : 'user',
        })),
        generationConfig: {
          ...(parameters.maxOutputTokens !== undefined
            ? { maxOutputTokens: parameters.maxOutputTokens }
            : {}),
          ...(parameters.temperature !== undefined
            ? { temperature: parameters.temperature }
            : {}),
          ...(parameters.topP !== undefined ? { topP: parameters.topP } : {}),
          ...(parameters.topK !== undefined ? { topK: parameters.topK } : {}),
          ...(parameters.frequencyPenalty !== undefined
            ? { frequencyPenalty: parameters.frequencyPenalty }
            : {}),
          ...(parameters.presencePenalty !== undefined
            ? { presencePenalty: parameters.presencePenalty }
            : {}),
          ...(parameters.seed !== undefined ? { seed: parameters.seed } : {}),
          ...(parameters.stopSequences?.length
            ? { stopSequences: parameters.stopSequences }
            : {}),
          ...(parameters.thinkingBudget !== undefined ||
          parameters.thinkingLevel
            ? {
                thinkingConfig: {
                  ...(parameters.thinkingBudget !== undefined
                    ? { thinkingBudget: parameters.thinkingBudget }
                    : {}),
                  ...(parameters.thinkingLevel
                    ? { thinkingLevel: parameters.thinkingLevel }
                    : {}),
                },
              }
            : {}),
        },
        systemInstruction: { parts: [{ text: systemPrompt }] },
        ...(input.webSearchEnabled ? { tools: [{ google_search: {} }] } : {}),
      },
      headers,
      includeTraceBody,
      'gemini',
      `${endpoint(input.baseUrl, streamPath)}?alt=sse`,
    );
  }
  return providerRequest(
    {
      messages: [
        { content: systemPrompt, role: 'system' },
        ...input.messages.map((message) => ({
          content: openAiContent(message),
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
      ...(input.template.parameterProfile === 'novelai' &&
      parameters.topK !== undefined
        ? { top_k: parameters.topK }
        : {}),
      ...(parameters.frequencyPenalty !== undefined
        ? { frequency_penalty: parameters.frequencyPenalty }
        : {}),
      ...(parameters.presencePenalty !== undefined
        ? { presence_penalty: parameters.presencePenalty }
        : {}),
      ...(parameters.seed !== undefined ? { seed: parameters.seed } : {}),
      ...(parameters.stopSequences?.length
        ? { stop: parameters.stopSequences }
        : {}),
      ...(parameters.reasoningEffort
        ? { reasoning_effort: parameters.reasoningEffort }
        : {}),
      ...(parameters.verbosity ? { verbosity: parameters.verbosity } : {}),
      ...(input.template.parameterProfile === 'novelai'
        ? { enable_thinking: (parameters.thinkingBudget ?? 0) > 0 }
        : {}),
      ...(input.webSearchEnabled && input.template.id === 'llm-gateway'
        ? { web_search: true }
        : {}),
    },
    headers,
    includeTraceBody,
    'openai',
    endpoint(
      input.baseUrl,
      input.template.formats?.openai ?? '/chat/completions',
    ),
  );
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
  if (root.error || root.type === 'error') {
    throw new ChatUpstreamError('CHAT_PROVIDER_UPSTREAM_ERROR', true);
  }
  if (protocol === 'anthropic') {
    if (
      typeof root.type !== 'string' ||
      ![
        'message_start',
        'content_block_start',
        'content_block_delta',
        'content_block_stop',
        'message_delta',
        'message_stop',
        'ping',
      ].includes(root.type)
    ) {
      throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
    }
    const delta = record(root.delta);
    if (root.type === 'content_block_delta' && !delta) {
      throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
    }
    const usage = record(root.usage) ?? record(record(root.message)?.usage);
    const events: ChatEvent[] = [];
    if (
      root.type === 'content_block_delta' &&
      delta?.type === 'text_delta' &&
      typeof delta.text === 'string'
    ) {
      events.push({ text: delta.text, type: 'text_delta' });
    }
    if (
      root.type === 'content_block_start' &&
      record(root.content_block)?.type === 'tool_use'
    ) {
      throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
    }
    const inputTokens = integer(usage?.input_tokens);
    const outputTokens = integer(usage?.output_tokens);
    if (inputTokens !== undefined || outputTokens !== undefined) {
      events.push(usageEvent(inputTokens, outputTokens));
    }
    return events;
  }
  if (protocol === 'gemini') {
    if (!Array.isArray(root.candidates) && !record(root.promptFeedback)) {
      throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
    }
    const candidates = Array.isArray(root.candidates) ? root.candidates : [];
    if (candidates.length > 1) {
      throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
    }
    const candidate = record(candidates[0]);
    if (candidates.length === 1 && !candidate) {
      throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
    }
    const content = record(candidate?.content);
    if (root.promptFeedback && record(root.promptFeedback)?.blockReason) {
      throw new ChatUpstreamError('CHAT_PROVIDER_REFUSED', false);
    }
    const usage = record(root.usageMetadata);
    const events: ChatEvent[] = [];
    const text = textParts(content?.parts);
    if (text) events.push({ text, type: 'text_delta' });
    const inputTokens = integer(usage?.promptTokenCount);
    const outputTokens = integer(usage?.candidatesTokenCount);
    if (inputTokens !== undefined || outputTokens !== undefined) {
      events.push(usageEvent(inputTokens, outputTokens));
    }
    return events;
  }
  const choices = Array.isArray(root.choices) ? root.choices : [];
  if (!Array.isArray(root.choices)) {
    throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
  }
  const choice = record(choices[0]);
  if (choices.length === 1 && !choice) {
    throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
  }
  if (choices.length > 1) {
    throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
  }
  const delta = record(choice?.delta);
  if (choice && !delta && choice.finish_reason == null && !choice.message) {
    throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
  }
  if (delta?.refusal || record(choice?.message)?.refusal) {
    throw new ChatUpstreamError('CHAT_PROVIDER_REFUSED', false);
  }
  if (delta?.tool_calls || delta?.function_call || choice?.message) {
    throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
  }
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
  return events;
}

async function* sseData(
  stream: ReadableStream<Uint8Array>,
  diagnostic: ProviderResponseDiagnostic,
  onChunk?: () => void,
): AsyncGenerator<string> {
  const invalid = (cause: string) => {
    diagnostic.internalCause = cause;
    return new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
  };
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let pendingCarriageReturn = false;
  let responseBytes = 0;
  for await (const chunk of stream) {
    const now = new Date().toISOString();
    if (chunk.byteLength > 0) {
      diagnostic.firstByteReceivedAt ??= now;
      diagnostic.lastByteReceivedAt = now;
      diagnostic.firstByteElapsedMs ??=
        Date.now() - Date.parse(diagnostic.startedAt);
      diagnostic.lastByteElapsedMs =
        Date.now() - Date.parse(diagnostic.startedAt);
    }
    diagnostic.chunkCount++;
    diagnostic.receivedBytes += chunk.byteLength;
    diagnostic.stage = 'sse_framing';
    onChunk?.();
    responseBytes += chunk.byteLength;
    if (responseBytes > MAXIMUM_RESPONSE_BYTES) {
      throw invalid('RESPONSE_BYTE_LIMIT');
    }
    diagnostic.stage = 'sse_decode';
    let fragment = decoder.decode(chunk, { stream: true });
    diagnostic.stage = 'sse_framing';
    if (pendingCarriageReturn) fragment = `\r${fragment}`;
    pendingCarriageReturn = fragment.endsWith('\r');
    if (pendingCarriageReturn) fragment = fragment.slice(0, -1);
    buffer += fragment.replace(/\r\n|\r/gu, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      diagnostic.frameCount++;
      const block = buffer.slice(0, boundary);
      if (Buffer.byteLength(block, 'utf8') > MAXIMUM_SSE_BUFFER_BYTES) {
        throw invalid('SSE_FRAME_BYTE_LIMIT');
      }
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /u, ''))
        .join('\n');
      if (data) {
        diagnostic.eventCount++;
        yield data;
        diagnostic.stage = 'sse_framing';
      }
      boundary = buffer.indexOf('\n\n');
    }
    if (Buffer.byteLength(buffer, 'utf8') > MAXIMUM_SSE_BUFFER_BYTES) {
      throw invalid('SSE_FRAME_BYTE_LIMIT');
    }
  }
  diagnostic.stage = 'sse_decode';
  buffer += decoder.decode();
  diagnostic.stage = 'sse_framing';
  if (pendingCarriageReturn) buffer += '\n';
  if (responseBytes === 0) {
    throw invalid('EMPTY_BODY');
  }
  if (buffer.trim()) {
    throw invalid('TRUNCATED_FRAME');
  }
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

interface StreamRequestInput {
  headerTimeoutMs?: number;
  idleTimeoutMs?: number;
  maximumGeneratedTextBytes?: number;
  onRawEvent?: (document: unknown) => void;
  onDiagnostic?: (diagnostic: ProviderResponseDiagnostic) => void;
  request: UpstreamRequest;
  signal: AbortSignal;
  totalTimeoutMs?: number;
}

export async function* streamProviderRequest(
  input: StreamRequestInput,
  fetchImplementation: typeof fetch = fetch,
): AsyncGenerator<ChatEvent> {
  const started = Date.now();
  const diagnostic: ProviderResponseDiagnostic = {
    id: randomUUID(),
    protocol: input.request.protocol,
    httpStatus: null,
    contentType: 'missing',
    startedAt: new Date(started).toISOString(),
    headersReceivedAt: null,
    firstByteReceivedAt: null,
    lastByteReceivedAt: null,
    endedAt: '',
    durationMs: 0,
    headersElapsedMs: null,
    firstByteElapsedMs: null,
    lastByteElapsedMs: null,
    receivedBytes: 0,
    chunkCount: 0,
    frameCount: 0,
    eventCount: 0,
    outcome: 'cancelled',
    stage: 'request_headers',
    internalCause: null,
    errorCode: null,
  };
  try {
    yield* streamProviderResponse(input, diagnostic, fetchImplementation);
    diagnostic.outcome = 'completed';
    diagnostic.stage = 'completed';
  } catch (error) {
    diagnostic.outcome = input.signal.aborted ? 'cancelled' : 'failed';
    diagnostic.errorCode =
      error instanceof ChatUpstreamError
        ? error.code
        : input.signal.aborted
          ? 'CHAT_CANCELLED'
          : 'CHAT_INTERNAL_ERROR';
    diagnostic.internalCause ??= input.signal.aborted
      ? 'CALLER_ABORT'
      : diagnostic.stage === 'sse_decode'
        ? 'UTF8_INVALID'
        : diagnostic.stage === 'json_parse'
          ? 'JSON_INVALID'
          : diagnostic.stage === 'event_validation'
            ? 'EVENT_SCHEMA_INVALID'
            : diagnostic.stage === 'sse_framing'
              ? 'STREAM_READ_ERROR'
              : 'INTERNAL_ERROR';
    throw error;
  } finally {
    diagnostic.endedAt = new Date().toISOString();
    diagnostic.durationMs = Date.now() - started;
    if (diagnostic.outcome === 'cancelled' && !diagnostic.internalCause)
      diagnostic.internalCause = 'CONSUMER_CLOSED';
    // Only locally constructed metadata is logged; never serialize the thrown error.
    diagnosticLogger.log(
      `provider_response_diagnostic ${JSON.stringify(diagnostic)}`,
    );
    try {
      input.onDiagnostic?.({ ...diagnostic });
    } catch {
      /* Diagnostics must not change the Provider result. */
    }
  }
}

async function* streamProviderResponse(
  input: StreamRequestInput,
  diagnostic: ProviderResponseDiagnostic,
  fetchImplementation: typeof fetch = fetch,
): AsyncGenerator<ChatEvent> {
  const request = input.request;
  const idleTimeoutMs = Math.min(
    input.idleTimeoutMs ?? DEFAULT_PROVIDER_IDLE_TIMEOUT_MS,
    MAXIMUM_TOTAL_MS,
  );
  const maximumGeneratedTextBytes = Math.min(
    input.maximumGeneratedTextBytes ?? DEFAULT_OUTPUT_BYTES,
    8 * 1024 * 1024,
  );
  const upstreamController = new AbortController();
  const abortFromCaller = () => upstreamController.abort(input.signal.reason);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimedOut = false;
  let headerTimedOut = false;
  let totalTimedOut = false;
  const resetIdleTimeout = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimedOut = true;
      upstreamController.abort(new Error('Provider response timed out.'));
    }, idleTimeoutMs);
    idleTimer.unref();
  };
  if (input.signal.aborted) abortFromCaller();
  else input.signal.addEventListener('abort', abortFromCaller, { once: true });
  resetIdleTimeout();
  const totalTimer = setTimeout(
    () => {
      totalTimedOut = true;
      upstreamController.abort(new Error('Provider total time exceeded.'));
    },
    Math.min(input.totalTimeoutMs ?? MAXIMUM_TOTAL_MS, MAXIMUM_TOTAL_MS),
  );
  totalTimer.unref();
  const headerTimer = setTimeout(
    () => {
      headerTimedOut = true;
      upstreamController.abort(new Error('Provider headers timed out.'));
    },
    Math.min(input.headerTimeoutMs ?? 30_000, 30_000),
  );
  headerTimer.unref();
  const cleanup = () => {
    if (idleTimer) clearTimeout(idleTimer);
    clearTimeout(totalTimer);
    clearTimeout(headerTimer);
    input.signal.removeEventListener('abort', abortFromCaller);
  };
  let response: Response;
  try {
    response = await fetchImplementation(request.url, {
      ...request.init,
      signal: upstreamController.signal,
    });
  } catch (error) {
    cleanup();
    diagnostic.internalCause = input.signal.aborted
      ? 'CALLER_ABORT'
      : headerTimedOut
        ? 'HEADER_TIMEOUT'
        : totalTimedOut
          ? 'TOTAL_TIMEOUT'
          : idleTimedOut
            ? 'IDLE_TIMEOUT'
            : error instanceof ProviderDestinationError
              ? 'DESTINATION_DENIED'
              : 'NETWORK_ERROR';
    if (input.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (error instanceof ProviderDestinationError)
      throw new ChatUpstreamError('CHAT_PROVIDER_DESTINATION_DENIED', false);
    if (idleTimedOut || totalTimedOut || headerTimedOut) {
      throw new ChatUpstreamError('CHAT_PROVIDER_TIMEOUT', true);
    }
    throw new ChatUpstreamError('CHAT_PROVIDER_NETWORK_ERROR', true);
  }
  clearTimeout(headerTimer);
  diagnostic.httpStatus = response.status;
  diagnostic.headersReceivedAt = new Date().toISOString();
  diagnostic.headersElapsedMs = Date.now() - Date.parse(diagnostic.startedAt);
  const mediaType = response.headers
    .get('content-type')
    ?.split(';')[0]
    ?.trim()
    .toLowerCase();
  diagnostic.contentType =
    mediaType === undefined
      ? 'missing'
      : [
            'text/event-stream',
            'application/json',
            'text/html',
            'text/plain',
          ].includes(mediaType)
        ? (mediaType as ProviderResponseDiagnostic['contentType'])
        : 'other';
  diagnostic.stage = 'http_status';
  if (!response.ok) {
    diagnostic.internalCause = 'HTTP_STATUS';
    cleanup();
    upstreamController.abort();
    throw upstreamError(response.status);
  }
  if (!response.body) {
    diagnostic.stage = 'response_body';
    diagnostic.internalCause = 'BODY_MISSING';
    cleanup();
    upstreamController.abort();
    throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
  }
  let terminal = false;
  let finished = false;
  let stopReason: string | undefined;
  let textBytes = 0;
  try {
    diagnostic.stage = 'sse_framing';
    for await (const data of sseData(
      response.body,
      diagnostic,
      resetIdleTimeout,
    )) {
      diagnostic.stage = 'termination';
      if (data === '[DONE]') {
        if (request.protocol !== 'openai' || !finished) {
          diagnostic.internalCause = 'DONE_BEFORE_FINISH';
          throw new ChatUpstreamError('CHAT_PROVIDER_INCOMPLETE', false);
        }
        terminal = true;
        break;
      }
      let document: unknown;
      diagnostic.stage = 'json_parse';
      try {
        document = JSON.parse(data) as unknown;
      } catch {
        throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
      }
      diagnostic.stage = 'event_validation';
      const root = record(document);
      if (!root) {
        throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
      }
      if (root.error || root.type === 'error') {
        diagnostic.internalCause = 'UPSTREAM_ERROR_EVENT';
        throw new ChatUpstreamError('CHAT_PROVIDER_UPSTREAM_ERROR', true);
      }
      if (terminal) {
        diagnostic.internalCause = 'EVENT_AFTER_TERMINAL';
        throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
      }
      const normalized = normalizeProviderStreamEvent(
        request.protocol,
        document,
      );
      for (const event of normalized) {
        if (event.type === 'usage') yield event;
      }
      diagnostic.stage = 'termination';
      if (request.protocol === 'openai') {
        const choices = Array.isArray(root.choices) ? root.choices : [];
        const reason = record(choices[0])?.finish_reason;
        if (typeof reason === 'string') {
          if (reason === 'length')
            throw new ChatUpstreamError('CHAT_OUTPUT_LIMIT', false);
          if (reason === 'content_filter')
            throw new ChatUpstreamError('CHAT_PROVIDER_REFUSED', false);
          if (reason !== 'stop')
            throw new ChatUpstreamError(
              'CHAT_PROVIDER_RESPONSE_INVALID',
              false,
            );
          finished = true;
          stopReason = reason;
        }
      } else if (request.protocol === 'anthropic') {
        if (root.type === 'message_delta') {
          const reason = record(root.delta)?.stop_reason;
          if (
            reason === 'max_tokens' ||
            reason === 'model_context_window_exceeded'
          ) {
            throw new ChatUpstreamError('CHAT_OUTPUT_LIMIT', false);
          }
          if (reason === 'refusal')
            throw new ChatUpstreamError('CHAT_PROVIDER_REFUSED', false);
          if (reason !== 'end_turn' && reason !== 'stop_sequence') {
            throw new ChatUpstreamError(
              'CHAT_PROVIDER_RESPONSE_INVALID',
              false,
            );
          }
          finished = true;
          stopReason = reason;
        } else if (root.type === 'message_stop') {
          if (!finished)
            throw new ChatUpstreamError('CHAT_PROVIDER_INCOMPLETE', false);
          terminal = true;
        }
      } else {
        const candidates = Array.isArray(root.candidates)
          ? root.candidates
          : [];
        const reason = record(candidates[0])?.finishReason;
        if (typeof reason === 'string') {
          if (reason === 'MAX_TOKENS')
            throw new ChatUpstreamError('CHAT_OUTPUT_LIMIT', false);
          if (
            [
              'SAFETY',
              'RECITATION',
              'BLOCKLIST',
              'PROHIBITED_CONTENT',
              'SPII',
              'IMAGE_SAFETY',
            ].includes(reason)
          ) {
            throw new ChatUpstreamError('CHAT_PROVIDER_REFUSED', false);
          }
          if (reason !== 'STOP')
            throw new ChatUpstreamError(
              'CHAT_PROVIDER_RESPONSE_INVALID',
              false,
            );
          terminal = true;
          stopReason = reason;
        }
      }
      input.onRawEvent?.(document);
      diagnostic.stage = 'output_limit';
      for (const event of normalized) {
        if (event.type !== 'text_delta') continue;
        textBytes += Buffer.byteLength(event.text, 'utf8');
        if (textBytes > maximumGeneratedTextBytes) {
          upstreamController.abort();
          throw new ChatUpstreamError('CHAT_OUTPUT_LIMIT', false);
        }
        yield event;
      }
    }
    diagnostic.stage = 'termination';
    if (!terminal) {
      diagnostic.stage = 'termination';
      diagnostic.internalCause = 'MISSING_TERMINAL';
      throw new ChatUpstreamError('CHAT_PROVIDER_INCOMPLETE', false);
    }
    if (textBytes === 0) {
      diagnostic.internalCause = 'EMPTY_TEXT';
      throw new ChatUpstreamError('CHAT_EMPTY_RESPONSE', false);
    }
    yield {
      durationMs: 0,
      ...(stopReason ? { stopReason } : {}),
      type: 'done',
    };
  } catch (error) {
    if (input.signal.aborted) diagnostic.internalCause = 'CALLER_ABORT';
    else if (totalTimedOut) diagnostic.internalCause = 'TOTAL_TIMEOUT';
    else if (idleTimedOut) diagnostic.internalCause = 'IDLE_TIMEOUT';
    else if (error instanceof ChatUpstreamError && !diagnostic.internalCause) {
      diagnostic.internalCause =
        error.code === 'CHAT_OUTPUT_LIMIT'
          ? diagnostic.stage === 'output_limit'
            ? 'OUTPUT_BYTE_LIMIT'
            : 'OUTPUT_TOKEN_LIMIT'
          : error.code === 'CHAT_PROVIDER_REFUSED'
            ? 'PROVIDER_REFUSAL'
            : diagnostic.stage === 'termination'
              ? 'INVALID_TERMINATION'
              : null;
    }
    if (input.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (error instanceof ChatUpstreamError) throw error;
    if (error instanceof ProviderDestinationError)
      throw new ChatUpstreamError('CHAT_PROVIDER_DESTINATION_DENIED', false);
    if (idleTimedOut || totalTimedOut) {
      throw new ChatUpstreamError('CHAT_PROVIDER_TIMEOUT', true);
    }
    if (error instanceof TypeError) {
      throw new ChatUpstreamError('CHAT_PROVIDER_RESPONSE_INVALID', false);
    }
    throw new ChatUpstreamError('CHAT_PROVIDER_NETWORK_ERROR', true);
  } finally {
    cleanup();
    upstreamController.abort();
  }
}

export async function* streamProvider(
  input: ProviderStreamInput,
  fetchImplementation: typeof fetch = fetch,
): AsyncGenerator<ChatEvent> {
  yield* streamProviderRequest(
    {
      ...(input.onRawEvent ? { onRawEvent: input.onRawEvent } : {}),
      ...(input.onDiagnostic ? { onDiagnostic: input.onDiagnostic } : {}),
      ...(input.maximumGeneratedTextBytes !== undefined
        ? { maximumGeneratedTextBytes: input.maximumGeneratedTextBytes }
        : {}),
      request: buildProviderStreamRequest(input),
      signal: input.signal,
    },
    fetchImplementation,
  );
}
