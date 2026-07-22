import { describe, expect, it } from 'vitest';

import { selectConversationModel } from '../app/chat-model-selection';

const models = [{ id: 'first' }, { id: 'last-used' }];

describe('selectConversationModel', () => {
  it('restores the last allowed assistant model in the active branch', () => {
    expect(
      selectConversationModel(
        [
          { providerModelId: null, role: 'user' },
          { providerModelId: 'first', role: 'assistant' },
          { providerModelId: null, role: 'user' },
          { providerModelId: 'last-used', role: 'assistant' },
        ],
        models,
        'first',
      ),
    ).toBe('last-used');
  });

  it('keeps the current model for a conversation without a usable snapshot', () => {
    expect(
      selectConversationModel(
        [{ providerModelId: 'no-longer-allowed', role: 'assistant' }],
        models,
        'last-used',
      ),
    ).toBe('last-used');
  });

  it('falls back to the first allowed model when restoration is impossible', () => {
    expect(selectConversationModel([], models, 'missing')).toBe('first');
    expect(selectConversationModel([], [], 'missing')).toBe('');
  });
});
