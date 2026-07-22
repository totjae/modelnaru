import { describe, expect, it } from 'vitest';

import { isNearScrollEnd } from '../app/chat-scroll';

describe('isNearScrollEnd', () => {
  it('follows new content while the reader remains near the bottom', () => {
    expect(
      isNearScrollEnd({
        clientHeight: 500,
        scrollHeight: 1000,
        scrollTop: 420,
      }),
    ).toBe(true);
  });

  it('does not pull the reader down after they scroll away', () => {
    expect(
      isNearScrollEnd({
        clientHeight: 500,
        scrollHeight: 1200,
        scrollTop: 300,
      }),
    ).toBe(false);
  });
});
