import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import {
  fittingPrefix,
  jobFrameBytes,
  maximumJobFrameBytes,
  serializeJobFrame,
} from '../src/chat-job-events.js';
import { ChatJobsController } from '../src/chats.controller.js';
import type { ChatJobsService } from '../src/chat-jobs.service.js';
import type { ChatsService } from '../src/chats.service.js';
import type { AuthenticatedRequest } from '../src/auth.guard.js';
import type { ChatJobRecord } from '../src/chat-jobs.repository.js';
import { AccessDailyLimitError } from '../src/access.repository.js';
import type { JobCommitEvent } from '../src/chat-job-events.js';

describe('N06 serialized SSE frames', () => {
  it('fits JSON escaped control text within the 64 KiB buffer minimum', () => {
    const maximum = maximumJobFrameBytes(65_536);
    expect(maximum).toBe(32_768);
    const text = '\u0001'.repeat(65_536) + '🙂';
    const template: JobCommitEvent = {
      jobId: 'fixture',
      name: 'append',
      revision: '99999999999999999999',
      data: { revision: '99999999999999999999', text: '' },
    };
    let remaining = text;
    let frames = 0;
    while (remaining) {
      const prefix = fittingPrefix(remaining, maximum, template);
      const frame = { ...template, data: { ...template.data, text: prefix } };
      expect(jobFrameBytes(frame)).toBeLessThanOrEqual(maximum);
      expect(serializeJobFrame(frame)).toContain('event: append');
      remaining = remaining.slice(prefix.length);
      frames++;
    }
    expect(frames).toBeGreaterThan(8);
  });
});

class FakeResponse extends EventEmitter {
  frames: string[] = [];
  headers = new Map<string, string>();
  ended = false;
  writableLength = 0;
  blocked = false;
  setHeader(name: string, value: string) {
    this.headers.set(name, value);
  }
  flushHeaders() {}
  write(frame: string) {
    this.frames.push(frame);
    this.writableLength += Buffer.byteLength(frame, 'utf8');
    return !this.blocked;
  }
  end() {
    this.ended = true;
  }
}

const principal = {
  id: 'e79b33e1-1e32-4f67-835c-4c6049e85300',
  type: 'user' as const,
  username: 'fixture',
  displayName: null,
};
const conversationId = '64cb510d-9001-481a-b9f4-8c91936d6d84';
const jobId = '017bb6e9-86f0-4104-8815-7e85836570b9';
const request = {
  authenticatedSession: {
    principal,
    row: { id: '8eef8629-73b2-4eeb-b054-9e8059a2d309' },
  },
} as AuthenticatedRequest;

function job(status: ChatJobRecord['status'], revision: string): ChatJobRecord {
  return {
    id: jobId,
    kind: 'turn',
    status,
    revision,
    conversationId,
    branchId: '75021b2e-c534-4d43-86b8-f0e41636984f',
    userMessageId: null,
    assistantMessageId: '05d8cdbe-22d8-4e2f-a1cd-97c33305530b',
    providerModelId: null,
    startedSessionId: request.authenticatedSession!.row.id,
    maximumGeneratedTextBytes: 2_097_152,
    content: 'saved',
    errorCode: null,
    inputTokens: null,
    outputTokens: null,
    startedAt: new Date(),
    finishedAt: null,
  };
}

describe('N06 job subscription', () => {
  it('maps quota rejection to 429 with scope and reset time', async () => {
    const resetAt = new Date('2026-10-02T15:00:00.000Z');
    const service = {
      start: () => Promise.reject(new AccessDailyLimitError('user', resetAt)),
    } as unknown as ChatJobsService;
    const controller = new ChatJobsController(service, {} as ChatsService);
    await expect(
      controller.startTurn(
        conversationId,
        jobId,
        {
          content: 'hello',
          providerModelId: jobId,
          parameters: {},
          settingsRevision: '1',
        },
        request,
        new FakeResponse(),
      ),
    ).rejects.toMatchObject({
      status: 429,
      response: {
        error: {
          code: 'ACCESS_DAILY_LIMIT_REACHED',
          scope: 'user',
          resetAt: resetAt.toISOString(),
        },
      },
    });
  });

  it('returns the public job shape without the starting session ID', async () => {
    const service = {
      get: () => Promise.resolve(job('streaming', '2')),
    } as unknown as ChatJobsService;
    const response = new FakeResponse();
    const result = await new ChatJobsController(
      service,
      {} as ChatsService,
    ).get(conversationId, jobId, request, response);
    expect(result?.job.id).toBe(jobId);
    expect(result?.job).not.toHaveProperty('startedSessionId');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('registers before snapshot, drops old revisions and emits ordered committed frames', async () => {
    let listener: ((event: JobCommitEvent) => void) | undefined;
    const close = vi.fn();
    const service = {
      maximumPendingBytes: 65_536,
      subscribe: (
        _principal: unknown,
        _conversationId: string,
        _jobId: string,
        callback: (event: JobCommitEvent) => void,
      ) => {
        listener = callback;
        callback({
          jobId,
          name: 'state',
          revision: '2',
          data: { revision: '2', status: 'streaming' },
        });
        return Promise.resolve({ job: job('streaming', '2'), close });
      },
      subscriptionValid: () => Promise.resolve(true),
    } as unknown as ChatJobsService;
    const response = new FakeResponse();
    const controller = new ChatJobsController(service, {} as ChatsService);
    const connected = controller.events(
      conversationId,
      jobId,
      request,
      response,
    );
    await vi.waitFor(() => expect(response.frames.length).toBeGreaterThan(0));
    expect(response.frames[0]).toContain('event: snapshot');
    expect(response.frames.join('')).not.toContain('event: state');
    listener?.({
      jobId,
      name: 'append',
      revision: '3',
      data: { revision: '3', text: 'new' },
    });
    listener?.({
      jobId,
      name: 'terminal',
      revision: '4',
      data: { revision: '4', text: '', status: 'completed' },
    });
    await connected;
    expect(
      response.frames.map((frame) => frame.match(/event: (\w+)/u)?.[1]),
    ).toEqual(['snapshot', 'append', 'terminal']);
    expect(response.ended).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes only the slow subscriber when serialized pending frames exceed its limit', async () => {
    let listener: ((event: JobCommitEvent) => void) | undefined;
    const service = {
      maximumPendingBytes: 65_536,
      subscribe: (
        _principal: unknown,
        _conversationId: string,
        _jobId: string,
        callback: (event: JobCommitEvent) => void,
      ) => {
        listener = callback;
        return Promise.resolve({ job: job('streaming', '1'), close: vi.fn() });
      },
      subscriptionValid: () => Promise.resolve(true),
    } as unknown as ChatJobsService;
    const response = new FakeResponse();
    const controller = new ChatJobsController(service, {} as ChatsService);
    const connected = controller.events(
      conversationId,
      jobId,
      request,
      response,
    );
    await vi.waitFor(() => expect(response.frames.length).toBeGreaterThan(0));
    response.blocked = true;
    for (let revision = 2; revision < 20; revision++) {
      listener?.({
        jobId,
        name: 'append',
        revision: String(revision),
        data: { revision: String(revision), text: 'x'.repeat(8_000) },
      });
      if (response.ended) break;
    }
    await connected;
    expect(response.ended).toBe(true);
    expect(response.frames.length).toBeLessThan(20);
  });
});
