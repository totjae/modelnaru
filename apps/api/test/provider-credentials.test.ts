import { describe, expect, it } from 'vitest';

import {
  decryptProviderSecret,
  encryptProviderSecret,
} from '../src/provider-credentials.js';

describe('provider credential encryption', () => {
  it('round-trips with AES-256-GCM without storing plaintext', () => {
    const key = Buffer.alloc(32, 7);
    const encrypted = encryptProviderSecret(key, 'test-provider-key');

    expect(encrypted.nonce).toHaveLength(12);
    expect(encrypted.authTag).toHaveLength(16);
    expect(encrypted.ciphertext.toString('utf8')).not.toContain(
      'test-provider-key',
    );
    expect(decryptProviderSecret(key, encrypted)).toBe('test-provider-key');
  });

  it('rejects a changed tag or the wrong master key', () => {
    const encrypted = encryptProviderSecret(
      Buffer.alloc(32, 1),
      'test-provider-key',
    );
    expect(() =>
      decryptProviderSecret(Buffer.alloc(32, 2), encrypted),
    ).toThrow();
    expect(() =>
      decryptProviderSecret(Buffer.alloc(32, 1), {
        ...encrypted,
        authTag: Buffer.alloc(16),
      }),
    ).toThrow();
  });
});
