import { HttpException } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { AttachmentsController } from '../src/attachments.controller.js';
import {
  type AttachmentsService,
  FileProcessingBusyError,
  FileProcessingCancelledError,
} from '../src/attachments.service.js';

const principal = {
  displayName: null,
  id: '10000000-0000-4000-8000-000000000001',
  type: 'user' as const,
  username: 'user1',
};

function uploadRequest(headers: Record<string, string>) {
  return Object.assign(Readable.from([new TextEncoder().encode('hello')]), {
    authenticatedSession: { principal },
    headers,
  });
}

describe('AttachmentsController', () => {
  it('passes a raw octet stream and decoded metadata to the service', async () => {
    const upload = vi.fn(() => Promise.resolve({ id: 'attachment' }));
    const controller = new AttachmentsController({
      upload,
    } as unknown as AttachmentsService);
    const request = uploadRequest({
      'content-type': 'application/octet-stream',
      'x-file-media-type': 'text/plain',
      'x-file-name': encodeURIComponent('메모.txt'),
      'x-include-in-future': 'true',
    });

    await expect(
      controller.upload(
        '20000000-0000-4000-8000-000000000001',
        request as never,
        { setHeader: vi.fn() },
      ),
    ).resolves.toEqual({ id: 'attachment' });
    expect(upload).toHaveBeenCalledWith(
      principal,
      expect.objectContaining({
        fileName: encodeURIComponent('메모.txt'),
        includeInFutureMessages: true,
        mediaType: 'text/plain',
        stream: request,
      }),
    );
  });

  it('rejects JSON content type before body parsing can alter the file', async () => {
    const controller = new AttachmentsController({} as AttachmentsService);
    await expect(
      controller.upload(
        '20000000-0000-4000-8000-000000000001',
        uploadRequest({
          'content-type': 'application/json',
          'x-file-media-type': 'application/json',
          'x-file-name': 'data.json',
          'x-include-in-future': 'false',
        }) as never,
        { setHeader: vi.fn() },
      ),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('propagates response close as an upload cancellation signal', async () => {
    const responseEvents = new EventEmitter();
    let receivedSignal: AbortSignal | undefined;
    const upload = vi.fn(
      (_principal: unknown, input: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          receivedSignal = input.signal;
          input.signal?.addEventListener(
            'abort',
            () => reject(new FileProcessingCancelledError()),
            { once: true },
          );
        }),
    );
    const controller = new AttachmentsController({
      upload,
    } as unknown as AttachmentsService);
    const response = {
      off: responseEvents.off.bind(responseEvents),
      once: responseEvents.once.bind(responseEvents),
      setHeader: vi.fn(),
    };
    const pending = controller.upload(
      '20000000-0000-4000-8000-000000000001',
      uploadRequest({
        'content-type': 'application/octet-stream',
        'x-file-media-type': 'text/plain',
        'x-file-name': 'notes.txt',
        'x-include-in-future': 'false',
      }) as never,
      response,
    );
    const rejection = expect(pending).rejects.toMatchObject({
      status: 408,
    });

    responseEvents.emit('close');
    await rejection;

    expect(receivedSignal?.aborted).toBe(true);
  });

  it('maps a saturated processing queue to service unavailable', async () => {
    const controller = new AttachmentsController({
      upload: vi.fn(() => Promise.reject(new FileProcessingBusyError())),
    } as unknown as AttachmentsService);

    await expect(
      controller.upload(
        '20000000-0000-4000-8000-000000000001',
        uploadRequest({
          'content-type': 'application/octet-stream',
          'x-file-media-type': 'application/pdf',
          'x-file-name': 'queued.pdf',
          'x-include-in-future': 'false',
        }) as never,
        { setHeader: vi.fn() },
      ),
    ).rejects.toMatchObject({
      response: {
        error: { code: 'FILE_PROCESSING_BUSY' },
      },
      status: 503,
    });
  });
});
