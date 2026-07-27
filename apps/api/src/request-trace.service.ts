import { randomUUID } from 'node:crypto';

import { Injectable, type OnModuleDestroy } from '@nestjs/common';

import type { AuthenticatedPrincipal } from './auth.service.js';
import type { UpstreamRequest } from './chat-streaming.js';
import { DatabaseService } from './database.service.js';

const MAX_TRACE_BYTES = 2 * 1024 * 1024;
const MAX_SESSION_TRACES = 30;
const MAX_GLOBAL_TRACE_BYTES = 64 * 1024 * 1024;
const PRUNE_INTERVAL_MS = 60_000;

export interface RequestTrace {
  completedAt: string | null;
  conversationId: string;
  durationMs: number | null;
  errorCode: string | null;
  id: string;
  inputTokens: number | null;
  modelId: string;
  outputTokens: number | null;
  providerTemplateId: string;
  request: unknown;
  response: {
    content: string;
    rawEvents: unknown[];
    stopReason: string | null;
  };
  startedAt: string;
  status: 'cancelled' | 'completed' | 'failed' | 'streaming';
  truncated: boolean;
}

interface StoredTrace extends RequestTrace {
  approximateBytes: number;
  principalId: string;
  principalType: 'guest' | 'user';
  sessionId: string;
}

interface BeginTraceInput {
  absoluteExpiresAt: Date;
  conversationId: string;
  limit: number;
  modelId: string;
  principal: Exclude<AuthenticatedPrincipal, { type: 'admin' }>;
  providerTemplateId: string;
  request: UpstreamRequest;
  sessionId: string;
}

function sanitize(value: unknown, key = ''): unknown {
  if (typeof value === 'string') {
    if (
      /^(?:authorization|api[_-]?key|access[_-]?token|secret|password|credential)$/iu.test(
        key,
      )
    ) {
      return '[redacted]';
    }
    if (
      (key === 'data' && value.length > 256) ||
      (key === 'url' && value.startsWith('data:image/'))
    ) {
      return `[binary image omitted: ${value.length} characters]`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(
      ([childKey, child]) => [childKey, sanitize(child, childKey)],
    ),
  );
}

function sanitizedHeaders(headers: RequestInit['headers']) {
  const output: Record<string, string> = {};
  const entries = new Headers(headers).entries();
  for (const [name, value] of entries) {
    output[name] = /authorization|api-key|x-api-key|x-goog-api-key/iu.test(name)
      ? '[redacted]'
      : value;
  }
  return output;
}

function sanitizedUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const name of [...url.searchParams.keys()]) {
      if (/key|token|secret|auth/iu.test(name)) {
        url.searchParams.set(name, '[redacted]');
      }
    }
    return url.toString();
  } catch {
    return '[invalid provider URL]';
  }
}

function limited(value: unknown): { truncated: boolean; value: unknown } {
  const text = JSON.stringify(value) ?? 'null';
  if (Buffer.byteLength(text, 'utf8') <= MAX_TRACE_BYTES) {
    return { truncated: false, value };
  }
  const preview = fitText(text, MAX_TRACE_BYTES - 256);
  return {
    truncated: true,
    value: {
      preview: preview.text,
      warning: 'Trace exceeded 2MB and was truncated.',
    },
  };
}

function fitText(value: string, maximumBytes: number) {
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.byteLength <= maximumBytes) {
    return { text: value, truncated: false };
  }
  return {
    text: buffer.subarray(0, Math.max(0, maximumBytes)).toString('utf8'),
    truncated: true,
  };
}

@Injectable()
export class RequestTraceService implements OnModuleDestroy {
  private readonly traces = new Map<string, StoredTrace[]>();
  private readonly traceIndex = new Map<string, StoredTrace>();
  private readonly sessionExpiry = new Map<
    string,
    { absolute: number; idle: number }
  >();
  private maximumGlobalBytes = MAX_GLOBAL_TRACE_BYTES;
  private totalApproximateBytes = 0;
  private readonly pruneTimer = setInterval(
    () => this.pruneExpired(),
    PRUNE_INTERVAL_MS,
  );

  constructor(private readonly database: DatabaseService) {
    this.pruneTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.pruneTimer);
    this.traces.clear();
    this.traceIndex.clear();
    this.sessionExpiry.clear();
    this.totalApproximateBytes = 0;
  }

  async begin(input: BeginTraceInput): Promise<string | null> {
    if (input.limit === 0) return null;
    if (
      input.principal.type === 'guest' &&
      !(await this.guestTracingEnabled())
    ) {
      return null;
    }
    this.pruneExpired();
    const requestValue = limited({
      body: sanitize(input.request.traceBody),
      headers: sanitizedHeaders(input.request.init.headers),
      method: input.request.init.method ?? 'POST',
      protocol: input.request.protocol,
      url: sanitizedUrl(input.request.url),
    });
    const id = randomUUID();
    const trace: StoredTrace = {
      approximateBytes: Buffer.byteLength(
        JSON.stringify(requestValue.value),
        'utf8',
      ),
      completedAt: null,
      conversationId: input.conversationId,
      durationMs: null,
      errorCode: null,
      id,
      inputTokens: null,
      modelId: input.modelId,
      outputTokens: null,
      principalId: input.principal.id,
      principalType: input.principal.type,
      providerTemplateId: input.providerTemplateId,
      request: requestValue.value,
      response: { content: '', rawEvents: [], stopReason: null },
      sessionId: input.sessionId,
      startedAt: new Date().toISOString(),
      status: 'streaming',
      truncated: requestValue.truncated,
    };
    const current = this.traces.get(input.sessionId) ?? [];
    current.push(trace);
    this.traces.set(input.sessionId, current);
    this.traceIndex.set(trace.id, trace);
    this.totalApproximateBytes += trace.approximateBytes;
    if (!this.sessionExpiry.has(input.sessionId)) {
      const expiresAt = input.absoluteExpiresAt.getTime();
      this.sessionExpiry.set(input.sessionId, {
        absolute: expiresAt,
        idle: expiresAt,
      });
    }
    this.trim(input.sessionId, input.conversationId, input.limit);
    this.enforceGlobalBudget();
    return id;
  }

  appendRaw(traceId: string | null, document: unknown): void {
    const trace = this.find(traceId);
    if (!trace || trace.truncated) return;
    const value = sanitize(document);
    const bytes = Buffer.byteLength(JSON.stringify(value) ?? 'null', 'utf8');
    if (trace.approximateBytes + bytes > MAX_TRACE_BYTES) {
      trace.truncated = true;
      const warning = {
        warning: 'Remaining provider events exceeded 2MB and were omitted.',
      };
      const warningBytes = Buffer.byteLength(JSON.stringify(warning), 'utf8');
      if (trace.approximateBytes + warningBytes <= MAX_TRACE_BYTES) {
        trace.response.rawEvents.push(warning);
        this.addBytes(trace, warningBytes);
      }
      return;
    }
    trace.response.rawEvents.push(value);
    this.addBytes(trace, bytes);
  }

  complete(
    traceId: string | null,
    input: {
      content: string;
      durationMs: number;
      inputTokens: number | null;
      outputTokens: number | null;
      stopReason: string | null;
    },
  ): void {
    const trace = this.find(traceId);
    if (!trace) return;
    trace.completedAt = new Date().toISOString();
    trace.durationMs = input.durationMs;
    trace.inputTokens = input.inputTokens;
    trace.outputTokens = input.outputTokens;
    const content = fitText(
      input.content,
      MAX_TRACE_BYTES - trace.approximateBytes,
    );
    trace.response.content = content.text;
    trace.response.stopReason = input.stopReason;
    trace.status = 'completed';
    trace.truncated ||= content.truncated;
    this.addBytes(trace, Buffer.byteLength(content.text, 'utf8'));
  }

  fail(
    traceId: string | null,
    input: {
      cancelled: boolean;
      content: string;
      errorCode: string;
    },
  ): void {
    const trace = this.find(traceId);
    if (!trace) return;
    trace.completedAt = new Date().toISOString();
    trace.errorCode = input.errorCode;
    const content = fitText(
      input.content,
      MAX_TRACE_BYTES - trace.approximateBytes,
    );
    trace.response.content = content.text;
    trace.status = input.cancelled ? 'cancelled' : 'failed';
    trace.truncated ||= content.truncated;
    this.addBytes(trace, Buffer.byteLength(content.text, 'utf8'));
  }

  list(sessionId: string, conversationId: string): RequestTrace[] {
    this.pruneExpired();
    return (this.traces.get(sessionId) ?? [])
      .filter((trace) => trace.conversationId === conversationId)
      .toReversed()
      .map((trace) => ({
        completedAt: trace.completedAt,
        conversationId: trace.conversationId,
        durationMs: trace.durationMs,
        errorCode: trace.errorCode,
        id: trace.id,
        inputTokens: trace.inputTokens,
        modelId: trace.modelId,
        outputTokens: trace.outputTokens,
        providerTemplateId: trace.providerTemplateId,
        request: trace.request,
        response: trace.response,
        startedAt: trace.startedAt,
        status: trace.status,
        truncated: trace.truncated,
      }));
  }

  clearSession(sessionId: string): void {
    for (const trace of this.traces.get(sessionId) ?? []) {
      this.traceIndex.delete(trace.id);
      this.totalApproximateBytes = Math.max(
        0,
        this.totalApproximateBytes - trace.approximateBytes,
      );
    }
    this.traces.delete(sessionId);
    this.sessionExpiry.delete(sessionId);
  }

  touchSession(
    sessionId: string,
    idleExpiresAt: Date,
    absoluteExpiresAt: Date,
  ): void {
    this.sessionExpiry.set(sessionId, {
      absolute: absoluteExpiresAt.getTime(),
      idle: idleExpiresAt.getTime(),
    });
  }

  clearSessionConversation(sessionId: string, conversationId: string): void {
    for (const trace of [...(this.traces.get(sessionId) ?? [])]) {
      if (trace.conversationId === conversationId) {
        this.remove(trace);
      }
    }
  }

  applyConversationLimit(
    sessionId: string,
    conversationId: string,
    limit: number,
  ): void {
    this.trim(sessionId, conversationId, limit);
  }

  clearConversation(conversationId: string): void {
    for (const traces of [...this.traces.values()]) {
      for (const trace of [...traces]) {
        if (trace.conversationId === conversationId) {
          this.remove(trace);
        }
      }
    }
  }

  clearPrincipal(type: 'guest' | 'user', id: string): void {
    for (const [sessionId, traces] of this.traces) {
      if (
        traces.some(
          (trace) => trace.principalType === type && trace.principalId === id,
        )
      ) {
        this.clearSession(sessionId);
      }
    }
  }

  retainPrincipalSessions(
    type: 'guest' | 'user',
    id: string,
    activeSessionIds: ReadonlySet<string>,
  ): void {
    for (const [sessionId, traces] of this.traces) {
      if (
        !activeSessionIds.has(sessionId) &&
        traces.some(
          (trace) => trace.principalType === type && trace.principalId === id,
        )
      ) {
        this.clearSession(sessionId);
      }
    }
  }

  clearGuests(): void {
    for (const [sessionId, traces] of this.traces) {
      if (traces.some((trace) => trace.principalType === 'guest')) {
        this.clearSession(sessionId);
      }
    }
  }

  private async guestTracingEnabled(): Promise<boolean> {
    const rows = await this.database.getClient()<
      Array<{ request_trace_enabled: boolean }>
    >`
      SELECT request_trace_enabled
      FROM guest_settings
      WHERE singleton = true
    `;
    return rows[0]?.request_trace_enabled ?? false;
  }

  private find(traceId: string | null): StoredTrace | undefined {
    if (!traceId) return undefined;
    return this.traceIndex.get(traceId);
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [sessionId, expiresAt] of this.sessionExpiry) {
      if (Math.min(expiresAt.idle, expiresAt.absolute) <= now) {
        this.clearSession(sessionId);
      }
    }
  }

  private trim(
    sessionId: string,
    conversationId: string,
    conversationLimit: number,
  ): void {
    let traces = this.traces.get(sessionId) ?? [];
    const conversation = traces.filter(
      (trace) => trace.conversationId === conversationId,
    );
    const remove = new Set(
      conversation
        .slice(0, Math.max(0, conversation.length - conversationLimit))
        .map((trace) => trace.id),
    );
    for (const trace of traces) {
      if (remove.has(trace.id)) this.remove(trace);
    }
    traces = this.traces.get(sessionId) ?? [];
    const sessionOverflow = Math.max(0, traces.length - MAX_SESSION_TRACES);
    for (const trace of traces.slice(0, sessionOverflow)) {
      this.remove(trace);
    }
  }

  private addBytes(trace: StoredTrace, bytes: number): void {
    if (!this.traceIndex.has(trace.id) || bytes <= 0) return;
    trace.approximateBytes += bytes;
    this.totalApproximateBytes += bytes;
    this.enforceGlobalBudget();
  }

  private enforceGlobalBudget(): void {
    while (
      this.totalApproximateBytes > this.maximumGlobalBytes &&
      this.traceIndex.size > 0
    ) {
      const oldest = this.traceIndex.values().next().value;
      if (!oldest) break;
      this.remove(oldest);
    }
  }

  private remove(trace: StoredTrace): void {
    if (!this.traceIndex.delete(trace.id)) return;
    this.totalApproximateBytes = Math.max(
      0,
      this.totalApproximateBytes - trace.approximateBytes,
    );
    const remaining = (this.traces.get(trace.sessionId) ?? []).filter(
      (candidate) => candidate.id !== trace.id,
    );
    if (remaining.length === 0) {
      this.traces.delete(trace.sessionId);
      this.sessionExpiry.delete(trace.sessionId);
    } else {
      this.traces.set(trace.sessionId, remaining);
    }
  }
}
