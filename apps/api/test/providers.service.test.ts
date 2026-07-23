import { describe, expect, it, vi } from 'vitest';

import type { ProviderCredentialService } from '../src/provider-credentials.js';
import type { ProviderDiscoveryService } from '../src/provider-discovery.js';
import type { ProvidersRepository } from '../src/providers.repository.js';
import {
  type ProviderError,
  ProvidersService,
} from '../src/providers.service.js';

const audit = { actorId: 'admin:admin', ipHash: null };

describe('ProvidersService', () => {
  it('tests discovery and only passes encrypted credentials to persistence', async () => {
    const repository = {
      create: vi.fn((input: unknown) => {
        void input;
        return Promise.resolve({ id: 'connection' });
      }),
    };
    const credentials = {
      encrypt: vi.fn(() =>
        Promise.resolve({
          authTag: Buffer.alloc(16),
          ciphertext: Buffer.from('ciphertext'),
          nonce: Buffer.alloc(12),
        }),
      ),
    };
    const discovery = {
      discover: vi.fn(() =>
        Promise.resolve([
          {
            contextWindow: null,
            displayName: null,
            id: 'model-1',
            maxOutputTokens: null,
            metadata: {},
          },
        ]),
      ),
    };
    const service = new ProvidersService(
      repository as unknown as ProvidersRepository,
      credentials as unknown as ProviderCredentialService,
      discovery,
    );

    await service.create(
      {
        apiKey: 'plaintext-provider-key',
        configuration: {},
        name: 'Gateway',
        templateId: 'llm-gateway',
      },
      audit,
    );

    expect(discovery.discover).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'llm-gateway' }),
      'plaintext-provider-key',
      'https://api.llmgateway.io/v1',
    );
    const persisted = repository.create.mock.calls[0]?.[0];
    expect(JSON.stringify(persisted)).not.toContain('plaintext-provider-key');
    expect(persisted).toMatchObject({
      credentialHint: '-key',
      templateId: 'llm-gateway',
    });
  });

  it('rejects a catalog entry that is not available for registration', async () => {
    const service = new ProvidersService(
      {} as ProvidersRepository,
      {} as ProviderCredentialService,
      {} as ProviderDiscoveryService,
    );
    await expect(
      service.create(
        {
          apiKey: 'provider-key',
          configuration: {},
          name: 'Bedrock',
          templateId: 'bedrock',
        },
        audit,
      ),
    ).rejects.toMatchObject({
      code: 'PROVIDER_TEMPLATE_UNAVAILABLE',
      status: 422,
    } satisfies Partial<ProviderError>);
  });
});
