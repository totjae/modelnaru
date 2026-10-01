export type JobEventName = 'append' | 'state' | 'terminal';

export interface JobCommitEvent {
  jobId: string;
  name: JobEventName;
  revision: string;
  data: Record<string, unknown>;
}

export function serializeJobFrame(event: JobCommitEvent): string {
  return `id: ${event.revision}\nevent: ${event.name}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export function jobFrameBytes(event: JobCommitEvent): number {
  return Buffer.byteLength(serializeJobFrame(event), 'utf8');
}

export function maximumJobFrameBytes(pendingBytes: number): number {
  return Math.min(1024 * 1024, Math.floor(Math.min(pendingBytes, 262_144) / 2));
}

export function fittingPrefix(
  text: string,
  maximumBytes: number,
  event: Omit<JobCommitEvent, 'data'> & { data: Record<string, unknown> },
): string {
  const scalars = Array.from(text);
  let low = 0;
  let high = scalars.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = scalars.slice(0, middle).join('');
    const bytes = jobFrameBytes({
      ...event,
      data: { ...event.data, text: candidate },
    });
    if (bytes <= maximumBytes) low = middle;
    else high = middle - 1;
  }
  if (low === 0 && text)
    throw new Error('SSE frame cannot hold one Unicode scalar');
  return scalars.slice(0, low).join('');
}
