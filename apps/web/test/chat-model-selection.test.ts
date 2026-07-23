import { describe, expect, it } from 'vitest';

import { selectConversationModel } from '../app/chat-model-selection';

const models = [{ id: 'first' }, { id: 'last-used' }];

describe('selectConversationModel', () => {
  it('uses the conversation-specific preferred model first', () => {
    expect(
      selectConversationModel(
        [{ providerModelId: 'last-used', role: 'assistant' }],
        models,
        'first',
      ),
    ).toBe('first');
  });

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
        null,
      ),
    ).toBe('last-used');
  });

  it('falls back when the stored model and message snapshot are unavailable', () => {
    expect(
      selectConversationModel(
        [{ providerModelId: 'no-longer-allowed', role: 'assistant' }],
        models,
        'no-longer-allowed',
      ),
    ).toBe('first');
  });

  it('falls back to the first allowed model when restoration is impossible', () => {
    expect(selectConversationModel([], models, null)).toBe('first');
    expect(selectConversationModel([], [], null)).toBe('');
  });
});
