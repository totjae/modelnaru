import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AdminRequest } from '../src/auth.guard.js';
import type { AuthService } from '../src/auth.service.js';
import { ProvidersController } from '../src/providers.controller.js';
import type { ProvidersService } from '../src/providers.service.js';

function request(): AdminRequest {
  return {
    adminSession: {
      row: { accountKey: 'admin:admin' },
    } as NonNullable<AdminRequest['adminSession']>,
    headers: {},
    ip: '203.0.113.10',
  };
}

function response() {
  return { setHeader: vi.fn() };
}

describe('ProvidersController', () => {
  it('rejects malformed registration before testing the credential', async () => {
    const providers = { create: vi.fn() };
    const controller = new ProvidersController(
      providers as unknown as ProvidersService,
      { hashIpAddress: vi.fn() } as unknown as AuthService,
    );

    await expect(
      controller.create(
        { apiKey: 'short', name: '', templateId: 'LLM Gateway' },
        request(),
        response(),
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(providers.create).not.toHaveBeenCalled();
  });

  it('passes a valid credential directly to the service and never returns it itself', async () => {
    const connection = {
      credentialHint: '1234',
      id: '10000000-0000-4000-8000-000000000001',
      models: [],
      name: 'Gateway',
      templateId: 'llm-gateway',
    };
    const providers = {
      create: vi.fn(() => Promise.resolve(connection)),
    };
    const controller = new ProvidersController(
      providers as unknown as ProvidersService,
      {
        hashIpAddress: vi.fn(() => Buffer.alloc(32)),
      } as unknown as AuthService,
    );

    const result = await controller.create(
      {
        apiKey: 'provider-key-1234',
        name: ' Gateway ',
        templateId: 'llm-gateway',
      },
      request(),
      response(),
    );

    expect(result).toBe(connection);
    expect(JSON.stringify(result)).not.toContain('provider-key-1234');
    expect(providers.create).toHaveBeenCalledWith(
      {
        apiKey: 'provider-key-1234',
        configuration: {},
        name: 'Gateway',
        templateId: 'llm-gateway',
      },
      {
        actorId: 'admin:admin',
        ipHash: expect.any(Buffer),
      },
    );
  });

  it('allows an administrator to mark a model as image-capable', async () => {
    const updateModel = vi.fn(() =>
      Promise.resolve({ id: '20000000-0000-4000-8000-000000000001' }),
    );
    const controller = new ProvidersController(
      { updateModel } as unknown as ProvidersService,
      { hashIpAddress: vi.fn() } as unknown as AuthService,
    );

    await controller.updateModel(
      '20000000-0000-4000-8000-000000000001',
      { supportsImageInput: true },
      request(),
      response(),
    );

    expect(updateModel).toHaveBeenCalledWith(
      '20000000-0000-4000-8000-000000000001',
      { supportsImageInput: true },
      expect.objectContaining({ actorId: 'admin:admin' }),
    );
  });
});
