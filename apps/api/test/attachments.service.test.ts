import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoadedConfig } from '@modelnaru/config';
import { HttpException } from '@nestjs/common';
import { AttachmentsController } from '../src/attachments.controller.js';
import { AttachmentNotFoundError } from '../src/attachments.repository.js';
import {
  PdfOcrUnavailableError,
  PdfPageLimitError,
  PdfPasswordProtectedError,
  PdfOcrFailedError,
  PdfTextTooLargeError,
} from '../src/pdf-attachments.js';

import type { AttachmentsRepository } from '../src/attachments.repository.js';
import {
  AttachmentsService,
  FileTooLargeError,
  ImageRequestTooLargeError,
} from '../src/attachments.service.js';

const principal = {
  displayName: null,
  id: '10000000-0000-4000-8000-000000000001',
  type: 'user' as const,
  username: 'user1',
};

const createdRoots: string[] = [];

async function fixture(
  maximumFileBytes = 1024,
  maximumImageBytesPerRequest = 20_971_520,
) {
  const root = await mkdtemp(join(tmpdir(), 'modelnaru-attachments-'));
  createdRoots.push(root);
  const storageRoot = join(root, 'uploads');
  const storageTemp = join(root, 'temp');
  await mkdir(storageRoot);
  await mkdir(storageTemp);
  const repository = {
    claimRetry: vi.fn(() =>
      Promise.resolve({
        storageKey: 'fixture/pdf',
        fileKind: 'pdf' as const,
        mediaType: 'application/pdf',
      }),
    ),
    assertConversation: vi.fn(() => Promise.resolve()),
    finishProcessing: vi.fn((id, input) =>
      Promise.resolve({ id, originalName: 'notes.md', ...input }),
    ),
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
      limits: {
        maximumAttachmentsPerMessage: 10,
        maximumFileBytes,
        maximumImageBytesPerRequest,
        maximumImagePixels: 40_000_000,
        maximumOcrQueueSize: 4,
        maximumOcrWorkers: 1,
        maximumPdfPages: 100,
        maximumPdfQueueSize: 4,
        maximumPdfWorkers: 1,
      },
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
  it.each([
    [new PdfOcrUnavailableError(), 503, 'FILE_PDF_OCR_UNAVAILABLE'],
    [new PdfPageLimitError(), 413, 'FILE_PDF_PAGE_LIMIT'],
    [new PdfPasswordProtectedError(), 422, 'FILE_PDF_PASSWORD_PROTECTED'],
    [new PdfOcrFailedError(), 422, 'FILE_PDF_OCR_FAILED'],
    [new PdfTextTooLargeError(), 413, 'FILE_TEXT_TOO_LARGE'],
    [new AttachmentNotFoundError(), 404, 'FILE_NOT_FOUND'],
  ])(
    'preserves retry HTTP errors for %s after disconnect',
    async (cause, status, code) => {
      const { repository, service } = await fixture();
      const response = Object.assign(new EventEmitter(), {
        setHeader: vi.fn(),
      });
      vi.spyOn(
        service as unknown as { extractStored: () => Promise<never> },
        'extractStored',
      ).mockImplementationOnce(() => {
        response.emit('close');
        return Promise.reject(cause);
      });
      const controller = new AttachmentsController(service);
      const result = controller.retry(
        '20000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        { authenticatedSession: { principal } } as never,
        response,
      );
      await expect(result).rejects.toBeInstanceOf(HttpException);
      await expect(result).rejects.toMatchObject({
        status,
        response: { error: { code } },
      });
      expect(repository.finishProcessing).toHaveBeenCalledWith(
        '30000000-0000-4000-8000-000000000001',
        { status: 'failed' },
      );
    },
  );

  it('preserves a late deletion error instead of reporting unsupported content', async () => {
    const { repository, service } = await fixture();
    vi.spyOn(
      service as unknown as { extractStored: () => Promise<unknown> },
      'extractStored',
    ).mockResolvedValueOnce({ text: 'ready', encoding: 'utf-8' });
    repository.finishProcessing.mockRejectedValue(
      new AttachmentNotFoundError(),
    );
    await expect(
      service.retry(principal, 'conversation', 'deleted'),
    ).rejects.toBeInstanceOf(AttachmentNotFoundError);
  });

  it('preserves unexpected storage failures', async () => {
    const { service } = await fixture();
    const cause = new Error('storage failure');
    vi.spyOn(
      service as unknown as { extractStored: () => Promise<never> },
      'extractStored',
    ).mockRejectedValueOnce(cause);
    await expect(
      service.retry(principal, 'conversation', 'attachment'),
    ).rejects.toBe(cause);
  });
  it('keeps extracting after upload reception completes even if the client leaves', async () => {
    const { repository, service } = await fixture();
    const controller = new AbortController();
    const save = repository.createReady.getMockImplementation()!;
    repository.createReady.mockImplementationOnce((owner, input) => {
      const result = save(owner, input);
      controller.abort();
      return result;
    });
    await service.upload(principal, {
      conversationId: '20000000-0000-4000-8000-000000000001',
      fileName: 'notes.md',
      includeInFutureMessages: true,
      mediaType: 'text/markdown',
      signal: controller.signal,
      stream: Readable.from([new TextEncoder().encode('received')]),
    });
    expect(repository.finishProcessing).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'ready', extractedText: 'received' }),
    );
  });
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
        status: 'processing',
        fileKind: 'text',
        imageHeight: null,
        imageWidth: null,
        includeInFutureMessages: true,
        originalName: 'notes.md',
        pageCount: null,
      }),
    );
    expect(repository.finishProcessing).toHaveBeenCalledWith(
      result.id,
      expect.objectContaining({
        status: 'ready',
        encoding: 'utf-8',
        extractedText: '첨부 내용',
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

  it('rejects an oversized image set before reading storage files', async () => {
    const { service } = await fixture(1024, 10);

    await expect(
      service.readImages([
        {
          byteSize: 6,
          mediaType: 'image/png',
          storageKey: 'missing/first',
        },
        {
          byteSize: 5,
          mediaType: 'image/png',
          storageKey: 'missing/second',
        },
      ]),
    ).rejects.toBeInstanceOf(ImageRequestTooLargeError);
  });
});
