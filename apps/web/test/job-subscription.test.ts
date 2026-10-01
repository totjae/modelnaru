import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyJobEvent,
  followJob,
  type JobSnapshot,
} from '../app/job-subscription';

const base: JobSnapshot = {
  id: 'job',
  conversationId: 'chat',
  kind: 'turn',
  assistantMessageId: 'answer',
  userMessageId: 'question',
  branchId: 'branch',
  revision: '1',
  status: 'streaming',
  content: '앞',
  errorCode: null,
};
const frame = (name: string, data: Record<string, unknown>) =>
  `id: ${typeof data.revision === 'string' ? data.revision : '1'}\nevent: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
function stream(text: string) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 73)
          controller.enqueue(bytes.slice(i, i + 73));
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('job recovery', () => {
  it('combines GET with buffered duplicate/Unicode append and atomic terminal exactly once', async () => {
    const snapshots: JobSnapshot[] = [];
    const fetcher = vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith('/events')
          ? stream(
              frame('snapshot', { revision: '1' }) +
                frame('append', { revision: '2', text: '중복' }) +
                frame('append', { revision: '3', text: '🙂한글' }) +
                frame('terminal', {
                  revision: '4',
                  text: '끝',
                  status: 'completed',
                  errorCode: null,
                }),
            )
          : Response.json({
              job: { ...base, revision: '2', content: '앞중복' },
            }),
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    await followJob(
      'chat',
      'job',
      new AbortController().signal,
      (job) => snapshots.push(job),
      () => undefined,
    );
    expect(snapshots.at(-1)).toMatchObject({
      content: '앞중복🙂한글끝',
      status: 'completed',
      revision: '4',
    });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/conversations/chat/jobs/job/events',
      '/api/conversations/chat/jobs/job',
    ]);
  });

  it('resubscribes after a revision gap, restoring terminal GET without a new generation POST', async () => {
    vi.useFakeTimers();
    let connections = 0;
    const snapshots: JobSnapshot[] = [];
    const fetcher = vi.fn((url: string) => {
      if (url.endsWith('/events')) {
        connections++;
        return Promise.resolve(
          stream(
            frame('snapshot', { revision: '1' }) +
              (connections === 1
                ? frame('append', { revision: '3', text: 'gap' })
                : ''),
          ),
        );
      }
      return Promise.resolve(
        Response.json({
          job:
            connections === 1
              ? base
              : {
                  ...base,
                  revision: '4',
                  content: '복원된 전체 본문',
                  status: 'completed',
                },
        }),
      );
    });
    vi.stubGlobal('fetch', fetcher);
    const done = followJob(
      'chat',
      'job',
      new AbortController().signal,
      (job) => snapshots.push(job),
      () => undefined,
    );
    await vi.advanceTimersByTimeAsync(1100);
    await done;
    expect(connections).toBe(2);
    expect(snapshots.at(-1)?.content).toBe('복원된 전체 본문');
    expect(fetcher.mock.calls.every(([url]) => url.includes('/jobs/job'))).toBe(
      true,
    );
  });

  it('bounds serialized frames including JSON escaping and recovers via terminal GET', async () => {
    vi.useFakeTimers();
    let connections = 0;
    let latest: JobSnapshot | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.endsWith('/events')) {
          connections++;
          return Promise.resolve(
            stream(
              frame('snapshot', { revision: '1' }) +
                (connections === 1
                  ? frame('append', {
                      revision: '2',
                      text: '\u0001'.repeat(65536),
                    })
                  : ''),
            ),
          );
        }
        return Promise.resolve(
          Response.json({
            job:
              connections === 1
                ? base
                : {
                    ...base,
                    status: 'completed',
                    revision: '2',
                    content: 'large restored',
                  },
          }),
        );
      }),
    );
    const done = followJob(
      'chat',
      'job',
      new AbortController().signal,
      (job) => {
        latest = job;
      },
      () => undefined,
    );
    await vi.advanceTimersByTimeAsync(1100);
    await done;
    expect(connections).toBe(2);
    expect(latest?.content).toBe('large restored');
  });

  it('stops recovery on session expiry', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json({ error: { code: 'AUTH_REQUIRED' } }, { status: 401 }),
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(
      followJob(
        'chat',
        'job',
        new AbortController().signal,
        () => undefined,
        () => undefined,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not request or cancel anything when navigation already aborted', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    controller.abort();
    await followJob(
      'chat',
      'job',
      controller.signal,
      () => undefined,
      () => undefined,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps decimal revisions precise above Number.MAX_SAFE_INTEGER', () => {
    const job = { ...base, revision: '9007199254740992' };
    expect(
      applyJobEvent(job, 'append', { revision: '9007199254740993', text: '답' })
        .content,
    ).toBe('앞답');
    expect(() =>
      applyJobEvent(job, 'append', {
        revision: '9007199254740994',
        text: '누락',
      }),
    ).toThrow('Revision gap');
  });
});
