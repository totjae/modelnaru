export interface SequencedMessage {
  id: string;
  sequenceNumber: number;
}

export function mergeOlderMessagePage<TMessage extends SequencedMessage>(
  older: TMessage[],
  current: TMessage[],
): TMessage[] {
  const messages = new Map(
    [...older, ...current].map((message) => [message.id, message]),
  );
  return [...messages.values()].sort(
    (left, right) => left.sequenceNumber - right.sequenceNumber,
  );
}
