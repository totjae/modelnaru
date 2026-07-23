import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoadedConfig } from '@modelnaru/config';

import type { AttachmentsRepository } from '../src/attachments.repository.js';
import {
  AttachmentsService,
  FileTooLargeError,
} from '../src/attachments.service.js';

const principal = {
  displayName: null,
  id: '10000000-0000-4000-8000-000000000001',
  type: 'user' as const,
  username: 'user1',
};

const createdRoots: string[] = [];

async function fixture(maximumFileBytes = 1024) {
  const root = await mkdtemp(join(tmpdir(), 'modelnaru-attachments-'));
  createdRoots.push(root);
  const storageRoot = join(root, 'uploads');
  const storageTemp = join(root, 'temp');
  await mkdir(storageRoot);
  await mkdir(storageTemp);
  const repository = {
    assertConversation: vi.fn(() => Promise.resolve()),
    createReady: vi.fn((_, input) =>
      Promise.resolve({
        byteSize: input.byteSize,
        createdAt: new Date(),
        expiresAt: new Date(),
        id: input.id,
        includeInFutureMessages: input.includeInFutureMessages,
        mediaType: input.mediaType,
        originalName: input.originalName,
        status: 'ready' as const,
      }),
    ),
  };
  const loaded = {
    config: {
      limits: { maximumAttachmentsPerMessage: 10, maximumFileBytes },
      storage: {
        attachmentRetentionDays: 30,
        minimumFreeBytesForUpload: 0,
      },
    },
    paths: { storageRoot, storageTemp },
  } as unknown as LoadedConfig;
  return {
    repository,
    root,
    service: new AttachmentsService(
      repository as unknown as AttachmentsRepository,
      loaded,
    ),
    storageRoot,
    storageTemp,
  };
}

afterEach(async () => {
  await Promise.all(
    createdRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('AttachmentsService', () => {
  it('stores a text file under a UUID key and persists extracted metadata', async () => {
    const { repository, service, storageRoot } = await fixture();

    const result = await service.upload(principal, {
      conversationId: '20000000-0000-4000-8000-000000000001',
      fileName: encodeURIComponent('../../notes.md'),
      includeInFutureMessages: true,
      mediaType: 'text/markdown',
      stream: Readable.from([new TextEncoder().encode('첨부 내용')]),
    });

    expect(result.originalName).toBe('notes.md');
    expect(repository.createReady).toHaveBeenCalledWith(
      principal,
      expect.objectContaining({
        encoding: 'utf-8',
        extractedText: '첨부 내용',
        includeInFutureMessages: true,
        originalName: 'notes.md',
      }),
    );
    const prefixes = await readdir(storageRoot);
    expect(prefixes).toHaveLength(1);
    expect(await readdir(join(storageRoot, prefixes[0]!))).toHaveLength(1);
  });

  it('stops an oversized stream and removes the partial file', async () => {
    const { repository, service, storageRoot, storageTemp } = await fixture(3);

    await expect(
      service.upload(principal, {
        conversationId: '20000000-0000-4000-8000-000000000001',
        fileName: 'notes.txt',
        includeInFutureMessages: false,
        mediaType: 'text/plain',
        stream: Readable.from([new TextEncoder().encode('four')]),
      }),
    ).rejects.toBeInstanceOf(FileTooLargeError);

    expect(repository.createReady).not.toHaveBeenCalled();
    expect(await readdir(storageRoot)).toHaveLength(0);
    expect(await readdir(storageTemp)).toHaveLength(0);
  });
});
