import { describe, expect, it } from 'vitest';

import {
  constantTimeStringEqual,
  createAdminCredentialFingerprint,
  createOpaqueToken,
  verifyTotp,
} from '../src/auth.crypto.js';

describe('auth crypto', () => {
  it('verifies RFC 6238 SHA-1 codes in a one-step window', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

    expect(verifyTotp(secret, '287082', 59_000)).toBe(true);
    expect(verifyTotp(secret, '287082', 89_000)).toBe(true);
    expect(verifyTotp(secret, '287082', 119_000)).toBe(false);
    expect(verifyTotp(secret, 'not-six-digits', 59_000)).toBe(false);
  });

  it('creates opaque 256-bit tokens', () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();

    expect(Buffer.from(first, 'base64url')).toHaveLength(32);
    expect(first).not.toBe(second);
  });

  it('changes the credential fingerprint when admin security changes', () => {
    const base = {
      passwordHash: '$argon2id$example',
      requireTotp: true,
      totpSecret: 'ABCDEFGHIJKLMNOP',
      username: 'admin',
    };

    expect(
      createAdminCredentialFingerprint(base).equals(
        createAdminCredentialFingerprint({
          ...base,
          totpSecret: 'ABCDEFGHIJKLMNOPQ',
        }),
      ),
    ).toBe(false);
    expect(constantTimeStringEqual('same', 'same')).toBe(true);
    expect(constantTimeStringEqual('same', 'different')).toBe(false);
  });
});
