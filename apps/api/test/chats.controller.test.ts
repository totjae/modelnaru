import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedRequest } from '../src/auth.guard.js';
import { ChatsController } from '../src/chats.controller.js';
import type { ChatsService } from '../src/chats.service.js';

const principal = {
  displayName: null,
  id: '10000000-0000-4000-8000-000000000001',
  type: 'user' as const,
  username: 'user1',
};

function request(): AuthenticatedRequest {
  return {
    authenticatedSession: { principal } as never,
    headers: {},
  };
}

const response = () => ({ setHeader: vi.fn() });

describe('ChatsController', () => {
  it('creates a conversation with the documented defaults', async () => {
    const chats = { create: vi.fn(() => Promise.resolve({ id: 'created' })) };
    const controller = new ChatsController(chats as unknown as ChatsService);

    await expect(controller.create({}, request(), response())).resolves.toEqual(
      { id: 'created' },
    );
    expect(chats.create).toHaveBeenCalledWith(principal, {
      contextTokenLimit: 100_000,
      historyMessageLimit: 0,
      systemPrompt: '',
      title: '새 대화',
    });
  });

  it('accepts zero as unlimited history and rejects an undersized context', async () => {
    const chats = { create: vi.fn() };
    const controller = new ChatsController(chats as unknown as ChatsService);

    await expect(
      controller.create(
        { contextTokenLimit: 999, historyMessageLimit: 0 },
        request(),
        response(),
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(chats.create).not.toHaveBeenCalled();
  });

  it('requires a non-empty update and a valid conversation id', async () => {
    const chats = { update: vi.fn() };
    const controller = new ChatsController(chats as unknown as ChatsService);

    await expect(
      controller.update('not-a-uuid', {}, request(), response()),
    ).rejects.toBeInstanceOf(HttpException);
    expect(chats.update).not.toHaveBeenCalled();
  });
});
