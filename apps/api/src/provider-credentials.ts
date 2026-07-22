import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { Inject, Injectable } from '@nestjs/common';

import type { LoadedConfig } from '@modelnaru/config';

import { MODELNARU_CONFIG } from './tokens.js';

export interface EncryptedProviderSecret {
  authTag: Buffer;
  ciphertext: Buffer;
  nonce: Buffer;
}

function validateMasterKey(masterKey: Uint8Array): void {
  if (masterKey.byteLength !== 32) {
    throw new Error('Provider credential master key is invalid');
  }
}

export function encryptProviderSecret(
  masterKey: Uint8Array,
  plaintext: string,
): EncryptedProviderSecret {
  validateMasterKey(masterKey);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey, nonce);
  cipher.setAAD(Buffer.from('modelnaru:provider-credential:v1'));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return { authTag: cipher.getAuthTag(), ciphertext, nonce };
}

export function decryptProviderSecret(
  masterKey: Uint8Array,
  encrypted: EncryptedProviderSecret,
): string {
  validateMasterKey(masterKey);
  const decipher = createDecipheriv('aes-256-gcm', masterKey, encrypted.nonce);
  decipher.setAAD(Buffer.from('modelnaru:provider-credential:v1'));
  decipher.setAuthTag(encrypted.authTag);
  return Buffer.concat([
    decipher.update(encrypted.ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

@Injectable()
export class ProviderCredentialService {
  private masterKey: Promise<Buffer> | undefined;

  constructor(
    @Inject(MODELNARU_CONFIG) private readonly loadedConfig: LoadedConfig,
  ) {}

  async encrypt(plaintext: string): Promise<EncryptedProviderSecret> {
    return encryptProviderSecret(await this.getMasterKey(), plaintext);
  }

  async decrypt(encrypted: EncryptedProviderSecret): Promise<string> {
    try {
      return decryptProviderSecret(await this.getMasterKey(), encrypted);
    } catch {
      throw new Error('Stored provider credential cannot be decrypted');
    }
  }

  private getMasterKey(): Promise<Buffer> {
    this.masterKey ??= readFile(
      this.loadedConfig.paths.providerMasterEncryptionKeyFile,
      'utf8',
    ).then((value) => {
      const key = Buffer.from(value.trim(), 'base64url');
      validateMasterKey(key);
      return key;
    });
    return this.masterKey;
  }
}
