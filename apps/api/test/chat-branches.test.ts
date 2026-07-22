import { describe, expect, it } from 'vitest';

import {
  ChatBranchStateError,
  composeBranchMessages,
  isLatestRegenerationTarget,
} from '../src/chat-branches.js';

describe('composeBranchMessages', () => {
  it('shares the parent prefix and replaces the forked response', () => {
    const messages = new Map([
      [
        'root',
        [
          { id: 'user-1', sequenceNumber: 1 },
          { id: 'answer-1', sequenceNumber: 2 },
          { id: 'user-2', sequenceNumber: 3 },
          { id: 'answer-2', sequenceNumber: 4 },
        ],
      ],
      ['branch', [{ id: 'answer-2b', sequenceNumber: 4 }]],
    ]);

    expect(
      composeBranchMessages(
        'branch',
        [
          {
            forkedFromMessageId: null,
            id: 'root',
            parentBranchId: null,
          },
          {
            forkedFromMessageId: 'answer-2',
            id: 'branch',
            parentBranchId: 'root',
          },
        ],
        messages,
      ).map((message) => message.id),
    ).toEqual(['user-1', 'answer-1', 'user-2', 'answer-2b']);
  });

  it('supports regenerating an inherited response again', () => {
    const messages = new Map([
      [
        'root',
        [
          { id: 'user', sequenceNumber: 1 },
          { id: 'answer-a', sequenceNumber: 2 },
        ],
      ],
      ['branch-b', [{ id: 'answer-b', sequenceNumber: 2 }]],
      ['branch-c', [{ id: 'answer-c', sequenceNumber: 2 }]],
    ]);
    const branches = [
      { forkedFromMessageId: null, id: 'root', parentBranchId: null },
      {
        forkedFromMessageId: 'answer-a',
        id: 'branch-b',
        parentBranchId: 'root',
      },
      {
        forkedFromMessageId: 'answer-b',
        id: 'branch-c',
        parentBranchId: 'branch-b',
      },
    ];

    expect(
      composeBranchMessages('branch-c', branches, messages).map(
        (message) => message.id,
      ),
    ).toEqual(['user', 'answer-c']);
  });

  it('rejects a missing fork target', () => {
    expect(() =>
      composeBranchMessages(
        'branch',
        [
          { forkedFromMessageId: null, id: 'root', parentBranchId: null },
          {
            forkedFromMessageId: 'missing',
            id: 'branch',
            parentBranchId: 'root',
          },
        ],
        new Map(),
      ),
    ).toThrow(ChatBranchStateError);
  });
});

describe('isLatestRegenerationTarget', () => {
  const messages = [
    { id: 'answer-1', role: 'assistant', status: 'completed' },
    { id: 'user-2', role: 'user', status: 'completed' },
    { id: 'answer-2', role: 'assistant', status: 'completed' },
  ];

  it('accepts only the last completed assistant response', () => {
    expect(isLatestRegenerationTarget(messages, 'answer-2')).toBe(true);
    expect(isLatestRegenerationTarget(messages, 'answer-1')).toBe(false);
  });

  it('rejects a response that is still being generated', () => {
    expect(
      isLatestRegenerationTarget(
        [{ id: 'answer', role: 'assistant', status: 'streaming' }],
        'answer',
      ),
    ).toBe(false);
  });
});
