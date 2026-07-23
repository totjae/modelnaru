import { HttpException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { AttachmentsController } from '../src/attachments.controller.js';
import type { AttachmentsService } from '../src/attachments.service.js';

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
});
