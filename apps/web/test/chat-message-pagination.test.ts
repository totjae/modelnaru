import { describe, expect, it } from 'vitest';

import { mergeOlderMessagePage } from '../app/chat-message-pagination';

describe('mergeOlderMessagePage', () => {
  it('deduplicates overlapping pages and keeps chronological order', () => {
    expect(
      mergeOlderMessagePage(
        [
          { id: 'message-1', sequenceNumber: 1 },
          { id: 'message-2', sequenceNumber: 2 },
        ],
        [
          { id: 'message-2', sequenceNumber: 2 },
          { id: 'message-3', sequenceNumber: 3 },
        ],
      ),
    ).toEqual([
      { id: 'message-1', sequenceNumber: 1 },
      { id: 'message-2', sequenceNumber: 2 },
      { id: 'message-3', sequenceNumber: 3 },
    ]);
  });
});
