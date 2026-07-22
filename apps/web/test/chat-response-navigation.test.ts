import { describe, expect, it } from 'vitest';

import { responseAlternatives } from '../app/chat-response-navigation';

const original = {
  branchId: 'root',
  id: 'answer-a',
  parentMessageId: 'question',
  role: 'assistant',
};
const regenerated = {
  branchId: 'branch-b',
  id: 'answer-b',
  parentMessageId: 'question',
  role: 'assistant',
};

describe('responseAlternatives', () => {
  it('returns only own responses for the same latest question', () => {
    expect(
      responseAlternatives(
        [
          { id: 'root', isSelectable: true, messages: [original] },
          {
            id: 'branch-b',
            isSelectable: true,
            messages: [original, regenerated],
          },
          {
            id: 'other',
            isSelectable: true,
            messages: [
              {
                branchId: 'other',
                id: 'other-answer',
                parentMessageId: 'other-question',
                role: 'assistant',
              },
            ],
          },
        ],
        regenerated,
      ),
    ).toEqual([
      { branchId: 'root', messageId: 'answer-a' },
      { branchId: 'branch-b', messageId: 'answer-b' },
    ]);
  });

  it('excludes failed branches and non-assistant latest messages', () => {
    expect(
      responseAlternatives(
        [{ id: 'branch-b', isSelectable: false, messages: [regenerated] }],
        regenerated,
      ),
    ).toEqual([]);
    expect(responseAlternatives([], { ...regenerated, role: 'user' })).toEqual(
      [],
    );
  });
});
