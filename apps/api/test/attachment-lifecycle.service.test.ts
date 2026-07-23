import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LoadedConfig } from '@modelnaru/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AttachmentLifecycleRepository } from '../src/attachment-lifecycle.repository.js';
import { AttachmentLifecycleService } from '../src/attachment-lifecycle.service.js';

const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'modelnaru-lifecycle-'));
  roots.push(root);
  const storageRoot = join(root, 'uploads');
  await mkdir(storageRoot);
  const storageKey = 'ab/10000000-0000-4000-8000-000000000001';
  await mkdir(join(storageRoot, 'ab'));
  await writeFile(join(storageRoot, storageKey), 'attachment');
  const repository = {
    complete: vi.fn(() => Promise.resolve()),
    fail: vi.fn(() => Promise.resolve()),
    knownStorageKeys: vi.fn(() => Promise.resolve(new Set<string>())),
    purgeExpiredGuests: vi.fn(() => Promise.resolve(0)),
    queueExpired: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
    queued: vi
      .fn()
      .mockResolvedValueOnce([{ storageKey }])
      .mockResolvedValueOnce([]),
    recordCleanup: vi.fn(() => Promise.resolve()),
  };
  const loaded = {
    paths: { storageRoot },
  } as LoadedConfig;
  return {
    path: join(storageRoot, storageKey),
    repository,
    service: new AttachmentLifecycleService(
      repository as unknown as AttachmentLifecycleRepository,
      loaded,
    ),
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('AttachmentLifecycleService', () => {
  it('expires metadata, deletes queued originals and records the result', async () => {
    const { path, repository, service } = await fixture();

    await expect(service.runCleanup()).resolves.toEqual({
      deletedCount: 1,
      expiredCount: 1,
      failedCount: 0,
      guestCount: 0,
      orphanCount: 0,
    });
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(repository.complete).toHaveBeenCalledOnce();
    expect(repository.recordCleanup).toHaveBeenCalledWith({
      deletedCount: 1,
      expiredCount: 1,
      failedCount: 0,
      guestCount: 0,
      orphanCount: 0,
    });
  });

  it('keeps failed queue entries for a later retry', async () => {
    const { repository, service } = await fixture();
    repository.knownStorageKeys.mockResolvedValue(
      new Set(['ab/10000000-0000-4000-8000-000000000001']),
    );
    vi.spyOn(
      service as unknown as { storagePath(value: string): string },
      'storagePath',
    ).mockImplementation(() => {
      throw new Error('filesystem unavailable');
    });

    await expect(service.runCleanup()).resolves.toMatchObject({
      deletedCount: 0,
      failedCount: 1,
    });
    expect(repository.complete).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(
      expect.any(String),
      'filesystem unavailable',
    );
  });
});
