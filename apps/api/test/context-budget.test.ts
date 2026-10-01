import { describe, expect, it } from 'vitest';
import { contextBudget, estimateInput } from '../src/context-budget.js';

describe('N08 model context budget', () => {
  it('uses fallback window, output reservation and safety margin together', () => {
    expect(
      contextBudget({ contextWindow: null, maxOutputTokens: null }, 100_000),
    ).toEqual({
      window: 16_384,
      output: 4_096,
      input: 10_649,
    });
    expect(
      contextBudget(
        { contextWindow: 8_000, maxOutputTokens: 2_000 },
        6_000,
        3_000,
      ),
    ).toEqual({
      window: 6_000,
      output: 2_000,
      input: 2_976,
    });
  });
  it('requires verified image costs and reserves every image', () => {
    expect(() =>
      contextBudget(
        { contextWindow: 16_000, maxOutputTokens: null },
        16_000,
        64,
        1,
      ),
    ).toThrow('CHAT_IMAGE_BUDGET_UNKNOWN');
    expect(
      contextBudget(
        {
          contextWindow: 16_000,
          maxOutputTokens: null,
          imageTokenEstimate: 2_048,
        },
        16_000,
        64,
        2,
      ).input,
    ).toBe(10_240);
  });
  it('counts role/system framing, UTF-8 and JSON escapes before sending', () => {
    const plain = estimateInput('', [{ role: 'user', content: 'a' }]);
    expect(estimateInput('', [{ role: 'user', content: '한' }])).toBe(
      plain + 2,
    );
    expect(estimateInput('', [{ role: 'user', content: '\u0001' }])).toBe(
      plain + 5,
    );
    expect(estimateInput('x', [{ role: 'user', content: 'a' }])).toBe(
      plain + 1,
    );
  });
});
