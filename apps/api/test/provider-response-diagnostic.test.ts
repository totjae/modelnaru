import { createServer } from 'node:http';
import { once } from 'node:events';

import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  streamProviderRequest,
  type ProviderResponseDiagnostic,
} from '../src/chat-streaming.js';

const secret = 'private-key-prompt-answer-do-not-log';
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const success =
  frame({ choices: [{ delta: { content: secret }, finish_reason: 'stop' }] }) +
  'data: [DONE]\n\n';
const request = {
  init: { method: 'POST', headers: { Authorization: secret }, body: secret },
  protocol: 'openai' as const,
  traceBody: secret,
  url: `https://provider.invalid/${secret}`,
};

afterEach(() => vi.restoreAllMocks());

async function diagnose(
  body: string | Uint8Array | null,
  options: {
    status?: number;
    contentType?: string;
    maximumGeneratedTextBytes?: number;
    fetch?: typeof fetch;
    headerTimeoutMs?: number;
    idleTimeoutMs?: number;
    totalTimeoutMs?: number;
    signal?: AbortSignal;
    callbackThrows?: boolean;
  } = {},
) {
  const logs = vi
    .spyOn(Logger.prototype, 'log')
    .mockImplementation(() => undefined);
  const diagnostics: ProviderResponseDiagnostic[] = [];
  const raw = vi.fn();
  const events = [];
  let error: unknown;
  try {
    for await (const event of streamProviderRequest(
      {
        request,
        signal: options.signal ?? new AbortController().signal,
        ...(options.headerTimeoutMs !== undefined
          ? { headerTimeoutMs: options.headerTimeoutMs }
          : {}),
        ...(options.idleTimeoutMs !== undefined
          ? { idleTimeoutMs: options.idleTimeoutMs }
          : {}),
        ...(options.totalTimeoutMs !== undefined
          ? { totalTimeoutMs: options.totalTimeoutMs }
          : {}),
        ...(options.maximumGeneratedTextBytes !== undefined
          ? { maximumGeneratedTextBytes: options.maximumGeneratedTextBytes }
          : {}),
        onRawEvent: raw,
        onDiagnostic: (value) => {
          diagnostics.push(value);
          if (options.callbackThrows) throw new Error(secret);
        },
      },
      options.fetch ??
        (() =>
          Promise.resolve(
            new Response(body, {
              status: options.status ?? 200,
              headers: {
                'content-type':
                  options.contentType ?? 'text/event-stream; charset=utf-8',
                'x-secret': secret,
              },
            }),
          )),
    ))
      events.push(event);
  } catch (caught) {
    error = caught;
  }
  expect(diagnostics).toHaveLength(1);
  const diagnostic = diagnostics[0]!;
  expect(logs).toHaveBeenCalledTimes(1);
  expect(logs.mock.calls[0]?.[0]).toBe(
    `provider_response_diagnostic ${JSON.stringify(diagnostic)}`,
  );
  expect(JSON.stringify(diagnostic)).not.toContain(secret);
  expect(Object.keys(diagnostic).sort()).toEqual(
    [
      'id',
      'protocol',
      'httpStatus',
      'contentType',
      'startedAt',
      'headersReceivedAt',
      'firstByteReceivedAt',
      'lastByteReceivedAt',
      'endedAt',
      'durationMs',
      'headersElapsedMs',
      'firstByteElapsedMs',
      'lastByteElapsedMs',
      'receivedBytes',
      'chunkCount',
      'frameCount',
      'eventCount',
      'outcome',
      'stage',
      'internalCause',
      'errorCode',
    ].sort(),
  );
  expect(Date.parse(diagnostic.endedAt)).toBeGreaterThanOrEqual(
    Date.parse(diagnostic.startedAt),
  );
  return { diagnostic, error, raw, events };
}

describe('safe Provider response diagnostics', () => {
  it.each([
    ['invalid JSON', `data: {${secret}\n\n`, 'json_parse', 'JSON_INVALID', 1],
    [
      'invalid schema',
      frame({ prompt: secret }),
      'event_validation',
      'EVENT_SCHEMA_INVALID',
      1,
    ],
    [
      'error event',
      frame({ error: { message: secret, code: secret } }),
      'event_validation',
      'UPSTREAM_ERROR_EVENT',
      1,
    ],
    [
      'invalid finish reason',
      frame({ choices: [{ delta: {}, finish_reason: secret }] }),
      'termination',
      'INVALID_TERMINATION',
      1,
    ],
    [
      'premature DONE',
      'data: [DONE]\n\n',
      'termination',
      'DONE_BEFORE_FINISH',
      1,
    ],
    [
      'missing terminal',
      frame({ choices: [{ delta: { content: secret } }] }),
      'termination',
      'MISSING_TERMINAL',
      1,
    ],
    ['truncated frame', `data: ${secret}`, 'sse_framing', 'TRUNCATED_FRAME', 0],
    ['empty body', '', 'sse_framing', 'EMPTY_BODY', 0],
    [
      'frame overflow',
      `data: ${secret}${'x'.repeat(1024 * 1024)}\n\n`,
      'sse_framing',
      'SSE_FRAME_BYTE_LIMIT',
      0,
    ],
    ['invalid UTF-8', new Uint8Array([0xff]), 'sse_decode', 'UTF8_INVALID', 0],
  ])(
    'records %s before raw-event validation can omit it',
    async (_label, body, stage, cause, count) => {
      const result = await diagnose(body);
      expect(result.error).toBeDefined();
      expect(result.diagnostic).toMatchObject({
        outcome: 'failed',
        httpStatus: 200,
        contentType: 'text/event-stream',
        stage,
        internalCause: cause,
        eventCount: count,
      });
      if (cause !== 'MISSING_TERMINAL')
        expect(result.raw).not.toHaveBeenCalled();
    },
  );

  it('counts comments/data/DONE and receive times while excluding generated content', async () => {
    const result = await diagnose(': heartbeat\n\n' + success, {
      callbackThrows: true,
    });
    expect(result.error).toBeUndefined();
    expect(result.diagnostic).toMatchObject({
      outcome: 'completed',
      stage: 'completed',
      internalCause: null,
      errorCode: null,
      frameCount: 3,
      eventCount: 2,
      chunkCount: 1,
    });
    expect(result.diagnostic.receivedBytes).toBe(
      Buffer.byteLength(': heartbeat\n\n' + success),
    );
    expect(result.diagnostic.firstByteReceivedAt).not.toBeNull();
    expect(result.diagnostic.headersElapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.diagnostic.lastByteElapsedMs).toBeGreaterThanOrEqual(
      result.diagnostic.firstByteElapsedMs!,
    );
    expect(result.events).toContainEqual({ type: 'text_delta', text: secret });
  });

  it.each([
    ['length', 'OUTPUT_TOKEN_LIMIT'],
    ['content_filter', 'PROVIDER_REFUSAL'],
  ])(
    'keeps terminal %s causes without upstream strings',
    async (reason, cause) => {
      const result = await diagnose(
        frame({
          choices: [{ delta: { content: secret }, finish_reason: reason }],
        }),
      );
      expect(result.diagnostic.internalCause).toBe(cause);
    },
  );

  it('distinguishes generated byte limit and HTTP/no-body errors', async () => {
    expect(
      (await diagnose(success, { maximumGeneratedTextBytes: 1 })).diagnostic
        .internalCause,
    ).toBe('OUTPUT_BYTE_LIMIT');
    vi.restoreAllMocks();
    expect(
      (
        await diagnose(secret, {
          status: 502,
          contentType: `text/html; private=${secret}`,
        })
      ).diagnostic,
    ).toMatchObject({
      httpStatus: 502,
      contentType: 'text/html',
      stage: 'http_status',
      internalCause: 'HTTP_STATUS',
      receivedBytes: 0,
    });
    vi.restoreAllMocks();
    expect((await diagnose(null, { status: 204 })).diagnostic).toMatchObject({
      stage: 'response_body',
      internalCause: 'BODY_MISSING',
    });
    vi.restoreAllMocks();
    expect(
      (await diagnose('data: bad\n\n', { contentType: secret })).diagnostic
        .contentType,
    ).toBe('other');
  });

  it.each([
    ['headerTimeoutMs', 'HEADER_TIMEOUT'],
    ['idleTimeoutMs', 'IDLE_TIMEOUT'],
    ['totalTimeoutMs', 'TOTAL_TIMEOUT'],
  ])('records %s without serializing exceptions', async (timeout, cause) => {
    const pending: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener(
          'abort',
          () => reject(new Error(secret)),
          { once: true },
        ),
      );
    const result = await diagnose(null, {
      fetch: pending,
      headerTimeoutMs: 1000,
      idleTimeoutMs: 1000,
      totalTimeoutMs: 1000,
      [timeout]: 5,
    });
    expect(result.diagnostic).toMatchObject({
      httpStatus: null,
      internalCause: cause,
      errorCode: 'CHAT_PROVIDER_TIMEOUT',
    });
  });

  it('records cancellation and network errors safely', async () => {
    const signal = AbortSignal.abort(secret);
    expect(
      (
        await diagnose(null, {
          signal,
          fetch: () => Promise.reject(new Error(secret)),
        })
      ).diagnostic,
    ).toMatchObject({ outcome: 'cancelled', internalCause: 'CALLER_ABORT' });
    vi.restoreAllMocks();
    expect(
      (
        await diagnose(null, {
          fetch: () => Promise.reject(new Error(secret)),
        })
      ).diagnostic.internalCause,
    ).toBe('NETWORK_ERROR');
  });

  it('distinguishes an interrupted body from malformed UTF-8', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new TypeError(secret));
      },
    });
    const result = await diagnose(null, {
      fetch: () => Promise.resolve(new Response(body)),
    });
    expect(result.diagnostic).toMatchObject({
      httpStatus: 200,
      stage: 'sse_framing',
      internalCause: 'STREAM_READ_ERROR',
      errorCode: 'CHAT_PROVIDER_RESPONSE_INVALID',
    });
  });

  it('keeps first-byte time null for zero-length chunks', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array());
        controller.close();
      },
    });
    const result = await diagnose(null, {
      fetch: () => Promise.resolve(new Response(body)),
    });
    expect(result.diagnostic).toMatchObject({
      receivedBytes: 0,
      firstByteReceivedAt: null,
      lastByteReceivedAt: null,
      internalCause: 'EMPTY_BODY',
    });
  });

  it('records actual loopback HTTP headers and split SSE reception with trace disabled', async () => {
    const logs = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const server = createServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'x-private': secret,
      });
      res.write(': heartbeat\n\n');
      setTimeout(() => res.end(`data: {${secret}\n\n`), 10);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing loopback address');
    try {
      await expect(
        (async () => {
          for await (const event of streamProviderRequest({
            request: {
              ...request,
              url: `http://127.0.0.1:${address.port}/`,
              init: { method: 'GET' },
            },
            signal: new AbortController().signal,
          }))
            void event;
        })(),
      ).rejects.toMatchObject({ code: 'CHAT_PROVIDER_RESPONSE_INVALID' });
      expect(logs).toHaveBeenCalledTimes(1);
      const value = JSON.parse(
        String(logs.mock.calls[0]?.[0]).split(
          'provider_response_diagnostic ',
        )[1]!,
      );
      expect(value).toMatchObject({
        httpStatus: 200,
        contentType: 'text/event-stream',
        frameCount: 2,
        eventCount: 1,
        stage: 'json_parse',
        internalCause: 'JSON_INVALID',
      });
      expect(value.chunkCount).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(value)).not.toContain(secret);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
