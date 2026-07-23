import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedPrincipal } from '../src/auth.service.js';
import {
  type ChatsRepository,
  ConversationNotFoundError,
} from '../src/chats.repository.js';
import { ChatError, ChatsService } from '../src/chats.service.js';

const user: AuthenticatedPrincipal = {
  displayName: null,
  id: '10000000-0000-4000-8000-000000000001',
  type: 'user',
  username: 'user1',
};

describe('ChatsService', () => {
  it('passes the authenticated owner to conversation creation', async () => {
    const created = { id: 'conversation-id' };
    const repository = {
      create: vi.fn(() => Promise.resolve(created)),
    };
    const service = new ChatsService(repository as unknown as ChatsRepository);
    const input = {
      contextTokenLimit: 100_000,
      defaultProviderModelId: null,
      generationParameters: { temperature: 1 },
      historyMessageLimit: 0,
      systemPrompt: '',
      title: '새 대화',
    };

    await expect(service.create(user, input)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(user, input);
  });

  it('does not expose whether another owner conversation exists', async () => {
    const repository = {
      detail: vi.fn(() => Promise.reject(new ConversationNotFoundError())),
    };
    const service = new ChatsService(repository as unknown as ChatsRepository);

    await expect(service.detail(user, 'conversation-id')).rejects.toMatchObject(
      {
        code: 'CHAT_NOT_FOUND',
        status: 404,
      },
    );
  });

  it('activates a selectable branch for the authenticated owner', async () => {
    const updated = { activeBranchId: 'branch-id' };
    const repository = {
      activateBranch: vi.fn(() => Promise.resolve(updated)),
    };
    const service = new ChatsService(repository as unknown as ChatsRepository);

    await expect(
      service.activateBranch(user, 'conversation-id', 'branch-id'),
    ).resolves.toBe(updated);
    expect(repository.activateBranch).toHaveBeenCalledWith(
      user,
      'conversation-id',
      'branch-id',
    );
  });

  it('rejects the administrator workspace with the same not-found error', () => {
    const service = new ChatsService({} as ChatsRepository);

    expect(() =>
      service.list({ type: 'admin', username: 'admin' }),
    ).toThrowError(ChatError);
  });
});
