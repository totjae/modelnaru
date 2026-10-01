import { ChatApiError, chatApi, checkedJson } from './chat-api';

export interface JobSnapshot {
  id: string;
  kind: 'turn' | 'regenerate';
  conversationId: string;
  assistantMessageId: string;
  userMessageId: string | null;
  branchId: string;
  revision: string;
  status: 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled';
  content: string;
  errorCode: string | null;
}
export type ActiveJob = Pick<
  JobSnapshot,
  | 'id'
  | 'kind'
  | 'assistantMessageId'
  | 'userMessageId'
  | 'branchId'
  | 'revision'
  | 'status'
>;
export const isRunning = (job: Pick<JobSnapshot, 'status'>) =>
  job.status === 'pending' || job.status === 'streaming';

export function applyJobEvent(
  job: JobSnapshot,
  name: string,
  data: Record<string, unknown>,
): JobSnapshot {
  if (typeof data.revision !== 'string' || !/^\d+$/.test(data.revision))
    throw new Error('Invalid revision');
  const revision = BigInt(data.revision);
  if (revision <= BigInt(job.revision)) return job;
  if (revision !== BigInt(job.revision) + 1n) throw new Error('Revision gap');
  if (!['append', 'state', 'terminal'].includes(name))
    throw new Error('Invalid event');
  if (name !== 'state' && typeof data.text !== 'string')
    throw new Error('Invalid text');
  if (
    name === 'terminal' &&
    !['completed', 'failed', 'cancelled'].includes(String(data.status))
  )
    throw new Error('Invalid terminal');
  return {
    ...job,
    revision: data.revision,
    content: job.content + (typeof data.text === 'string' ? data.text : ''),
    status:
      name === 'terminal'
        ? (data.status as JobSnapshot['status'])
        : 'streaming',
    errorCode:
      name === 'terminal' && typeof data.errorCode === 'string'
        ? data.errorCode
        : job.errorCode,
  };
}

// One connection owns both GET and SSE. Closing it never cancels the server job.
export async function followJob(
  conversationId: string,
  jobId: string,
  signal: AbortSignal,
  onSnapshot: (job: JobSnapshot) => void,
  onConnection: (
    state: 'connecting' | 'live' | 'reconnecting' | 'ended',
  ) => void,
) {
  const path = `/api/conversations/${conversationId}/jobs/${jobId}`;
  let attempt = 0;
  while (!signal.aborted) {
    onConnection(attempt ? 'reconnecting' : 'connecting');
    const connection = new AbortController();
    const abort = () => connection.abort();
    signal.addEventListener('abort', abort, { once: true });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let get: Promise<void> | undefined;
    let getError: unknown;
    let job: JobSnapshot | undefined;
    let buffered: Array<{ name: string; data: Record<string, unknown> }> = [];
    let bufferedBytes = 0;
    let heartbeat = setTimeout(abort, 45_000);
    try {
      const response = await fetch(`${path}/events`, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: connection.signal,
      });
      if (!response.ok) await checkedJson(response);
      if (!response.body) throw new Error('Missing stream');
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      const apply = (name: string, data: Record<string, unknown>) => {
        job = applyJobEvent(job!, name, data);
        onSnapshot(job);
        if (!isRunning(job)) connection.abort();
      };
      while (!connection.signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        clearTimeout(heartbeat);
        heartbeat = setTimeout(abort, 45_000);
        pending += decoder.decode(chunk.value, { stream: true });
        let boundary: number;
        while ((boundary = pending.indexOf('\n\n')) >= 0) {
          const frame = pending.slice(0, boundary + 2);
          pending = pending.slice(boundary + 2);
          const bytes = new TextEncoder().encode(frame).byteLength;
          if (bytes > 262_144) throw new Error('Frame overflow');
          const lines = frame.split('\n');
          const name = lines
            .find((line) => line.startsWith('event:'))
            ?.slice(6)
            .trim();
          if (!name || name === 'heartbeat') continue;
          const data = JSON.parse(
            lines
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trimStart())
              .join('\n'),
          ) as Record<string, unknown>;
          if (name === 'snapshot') {
            if (get) throw new Error('Repeated snapshot');
            get = chatApi<{ job: JobSnapshot }>(path, {
              signal: connection.signal,
            })
              .then((result) => {
                if (connection.signal.aborted) return;
                job = result.job;
                onSnapshot(job);
                for (const event of buffered) apply(event.name, event.data);
                buffered = [];
                bufferedBytes = 0;
                onConnection(isRunning(job) ? 'live' : 'ended');
                if (!isRunning(job)) connection.abort();
              })
              .catch((error: unknown) => {
                getError = error;
                connection.abort();
              });
          } else if (!get) throw new Error('Missing snapshot');
          else if (job) apply(name, data);
          else {
            bufferedBytes += bytes;
            if (bufferedBytes > 262_144) throw new Error('Buffer overflow');
            buffered.push({ name, data });
          }
        }
        if (new TextEncoder().encode(pending).byteLength > 262_144)
          throw new Error('Frame overflow');
      }
      await get;
      if (getError) throw getError instanceof Error ? getError : new Error('Snapshot failed');
      if (job && !isRunning(job)) {
        onConnection('ended');
        return;
      }
    } catch (error) {
      if (job && !isRunning(job)) {
        onConnection('ended');
        return;
      }
      const cause = getError ?? error;
      if (
        cause instanceof ChatApiError &&
        [401, 403, 404].includes(cause.status)
      )
        throw cause;
    } finally {
      connection.abort();
      clearTimeout(heartbeat);
      signal.removeEventListener('abort', abort);
      await reader?.cancel().catch(() => undefined);
      await get;
    }
    if (signal.aborted) return;
    onConnection('reconnecting');
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, Math.min(1000 * 2 ** attempt++, 8000));
      signal.addEventListener('abort', done, { once: true });
    });
  }
}
