import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../src/database.service.js';
import { RequestTraceService } from '../src/request-trace.service.js';

const principal = {
  displayName: 'User One',
  id: '10000000-0000-4000-8000-000000000001',
  type: 'user' as const,
  username: 'user1',
};

function service() {
  const sql = vi.fn(() => Promise.resolve([{ request_trace_enabled: true }]));
  return new RequestTraceService({
    getClient: () => sql,
  } as unknown as DatabaseService);
}

function beginInput(index: number, limit = 3) {
  return {
    absoluteExpiresAt: new Date(Date.now() + 60_000),
    conversationId: '20000000-0000-4000-8000-000000000001',
    limit,
    modelId: `model-${index}`,
    principal,
    providerTemplateId: 'openai',
    request: {
      init: {
        body: '{the trace must not parse this request body again',
        headers: {
          Authorization: 'Bearer secret',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
      protocol: 'openai' as const,
      traceBody: {
        image: { data: 'a'.repeat(300) },
        messages: [{ content: `message-${index}`, role: 'user' }],
      },
      url: 'https://provider.example/chat?api_key=secret',
    },
    sessionId: '30000000-0000-4000-8000-000000000001',
  };
}

function sessionInput(index: number, sessionId: string, limit = 3) {
  return {
    ...beginInput(index, limit),
    conversationId: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    sessionId,
  };
}

describe('RequestTraceService', () => {
  it('keeps only the configured conversation count and sanitizes secrets', async () => {
    const traces = service();
    for (let index = 1; index <= 4; index += 1) {
      const id = await traces.begin(beginInput(index));
      traces.complete(id, {
        content: `response-${index}`,
        durationMs: index,
        inputTokens: index,
        outputTokens: index,
        stopReason: 'stop',
      });
    }

    const stored = traces.list(
      '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
    );
    expect(stored).toHaveLength(3);
    expect(stored.map((trace) => trace.modelId)).toEqual([
      'model-4',
      'model-3',
      'model-2',
    ]);
    expect(JSON.stringify(stored)).not.toContain('Bearer secret');
    expect(JSON.stringify(stored)).not.toContain('a'.repeat(300));
    expect(JSON.stringify(stored)).toContain('[redacted]');
  });

  it('removes every trace when the session ends', async () => {
    const traces = service();
    await traces.begin(beginInput(1));
    traces.clearSession('30000000-0000-4000-8000-000000000001');

    expect(
      traces.list(
        '30000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
      ),
    ).toEqual([]);
  });

  it('does not record when the conversation setting is disabled', async () => {
    const traces = service();
    await expect(traces.begin(beginInput(1, 0))).resolves.toBeNull();
  });

  it('evicts the oldest trace when the process byte budget is exhausted', async () => {
    const traces = service();
    Reflect.set(traces, 'maximumGlobalBytes', 1_000);
    const first = sessionInput(1, '30000000-0000-4000-8000-000000000001');
    const second = sessionInput(2, '30000000-0000-4000-8000-000000000002');

    const firstId = await traces.begin(first);
    traces.complete(firstId, {
      content: 'a'.repeat(700),
      durationMs: 1,
      inputTokens: 1,
      outputTokens: 1,
      stopReason: 'stop',
    });
    const secondId = await traces.begin(second);
    traces.complete(secondId, {
      content: 'b'.repeat(700),
      durationMs: 1,
      inputTokens: 1,
      outputTokens: 1,
      stopReason: 'stop',
    });

    expect(traces.list(first.sessionId, first.conversationId)).toEqual([]);
    expect(traces.list(second.sessionId, second.conversationId)).toHaveLength(
      1,
    );
  });

  it('removes trimmed and cleared traces from the id index and byte total', async () => {
    const traces = service();
    for (let index = 1; index <= 4; index += 1) {
      await traces.begin(beginInput(index));
    }
    expect(
      (Reflect.get(traces, 'traceIndex') as Map<string, unknown>).size,
    ).toBe(3);

    traces.clearSession('30000000-0000-4000-8000-000000000001');

    expect(
      (Reflect.get(traces, 'traceIndex') as Map<string, unknown>).size,
    ).toBe(0);
    expect(Reflect.get(traces, 'totalApproximateBytes')).toBe(0);
  });
});
