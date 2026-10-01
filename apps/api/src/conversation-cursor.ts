import { createHash } from 'node:crypto';

export interface ConversationFilter {
  query?: string;
  pinned?: boolean;
  limit: number;
  cursor?: string;
}
interface Position {
  pinned: boolean;
  time: string;
  id: string;
}
export function conversationFingerprint(
  owner: string,
  filter: ConversationFilter,
) {
  return createHash('sha256')
    .update(JSON.stringify([owner, filter.query ?? '', filter.pinned ?? null]))
    .digest('hex');
}
export function encodeConversationCursor(
  fingerprint: string,
  position: Position,
) {
  return Buffer.from(
    JSON.stringify({ version: 1, fingerprint, ...position }),
  ).toString('base64url');
}
export function decodeConversationCursor(
  cursor: string,
  fingerprint: string,
): Position {
  if (cursor.length > 1_024 || !/^[\w-]+$/.test(cursor))
    throw new Error('CHAT_INPUT_INVALID');
  const value = JSON.parse(
    Buffer.from(cursor, 'base64url').toString('utf8'),
  ) as Partial<Position> & { version?: number; fingerprint?: string };
  if (
    !value ||
    value.version !== 1 ||
    value.fingerprint !== fingerprint ||
    typeof value.pinned !== 'boolean' ||
    typeof value.time !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value.time) ||
    !Number.isFinite(Date.parse(value.time)) ||
    new Date(value.time).toISOString().slice(0, 23) !==
      value.time.slice(0, 23) ||
    typeof value.id !== 'string' ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value.id)
  )
    throw new Error('CHAT_INPUT_INVALID');
  return value as Position;
}
