import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, statfs } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { LoadedConfig } from '@modelnaru/config';

import {
  BoundedTaskPool,
  TaskPoolClosedError,
  TaskQueueCancelledError,
  TaskQueueFullError,
} from './bounded-task-pool.js';
import {
  type AttachmentRecord,
  AttachmentsRepository,
} from './attachments.repository.js';
import { AttachmentLifecycleService } from './attachment-lifecycle.service.js';
import type { AuthenticatedPrincipal } from './auth.service.js';
import type { ChatPrincipal } from './chats.repository.js';
import { ConversationNotFoundError } from './chats.repository.js';
import { MODELNARU_CONFIG } from './tokens.js';
import {
  extractTextAttachment,
  safeOriginalName,
  TextAttachmentTooLargeError,
  TextAttachmentTypeError,
  textFileExtension,
  validateTextMediaType,
} from './text-attachments.js';
import {
  extractPdfAttachment,
  PdfInvalidError,
  PdfOcrFailedError,
  PdfOcrNoTextError,
  PdfOcrRequiredError,
  PdfOcrUnavailableError,
  PdfPageLimitError,
  PdfPasswordProtectedError,
  PdfTextTooLargeError,
} from './pdf-attachments.js';
import { LocalPdfOcrEngine } from './pdf-ocr.js';
import {
  extractImageAttachment,
  ImageDimensionsError,
  imageMediaType,
  ImageTypeError,
} from './image-attachments.js';
import { AdminLogsService } from './admin-logs.service.js';

export class FileInputError extends Error {}
export class FileStorageLowError extends Error {}
export class FileTooLargeError extends Error {}
export class FileTypeUnsupportedError extends Error {}
export class FileTextTooLargeError extends Error {}
export class FilePdfInvalidError extends Error {}
export class FilePdfOcrFailedError extends Error {}
export class FilePdfOcrNoTextError extends Error {}
export class FilePdfOcrRequiredError extends Error {}
export class FilePdfOcrUnavailableError extends Error {}
export class FilePdfPageLimitError extends Error {}
export class FilePdfPasswordProtectedError extends Error {}
export class FileImageDimensionsError extends Error {}
export class ImageRequestTooLargeError extends Error {}
export class FileProcessingBusyError extends Error {}
export class FileProcessingCancelledError extends Error {}

export type UploadByteStream = AsyncIterable<Uint8Array>;

@Injectable()
export class AttachmentsService implements OnModuleDestroy {
  private readonly ocrPool: BoundedTaskPool;
  private readonly pdfPool: BoundedTaskPool;

  constructor(
    private readonly repository: AttachmentsRepository,
    @Inject(MODELNARU_CONFIG) private readonly loaded: LoadedConfig,
    private readonly lifecycle: AttachmentLifecycleService = {
      flushQueuedFiles: () => Promise.resolve(),
      retentionDays: () =>
        Promise.resolve(loaded.config.storage.attachmentRetentionDays),
    } as AttachmentLifecycleService,
    private readonly logs: AdminLogsService = {
      record: () => Promise.resolve(),
    } as unknown as AdminLogsService,
  ) {
    this.pdfPool = new BoundedTaskPool(
      loaded.config.limits.maximumPdfWorkers,
      loaded.config.limits.maximumPdfQueueSize,
    );
    this.ocrPool = new BoundedTaskPool(
      loaded.config.limits.maximumOcrWorkers,
      loaded.config.limits.maximumOcrQueueSize,
    );
  }

  onModuleDestroy(): void {
    this.pdfPool.close();
    this.ocrPool.close();
  }

  async upload(
    principalValue: AuthenticatedPrincipal,
    input: {
      conversationId: string;
      fileName: string;
      includeInFutureMessages: boolean;
      mediaType: string;
      signal?: AbortSignal;
      stream: UploadByteStream;
    },
  ): Promise<AttachmentRecord> {
    const principal = this.chatPrincipal(principalValue);
    await this.repository.assertConversation(principal, input.conversationId);
    const parsedName = this.parseFileName(input.fileName);
    const originalName = parsedName.originalName;
    const mediaType = this.parseMediaType(
      input.mediaType,
      parsedName.fileKind,
      originalName,
    );
    await this.assertStorageCapacity();

    const id = randomUUID();
    const storageKey = `${id.slice(0, 2)}/${id}`;
    const temporaryPath = join(
      this.loaded.paths.storageTemp,
      `${id}.${randomUUID()}.upload`,
    );
    const finalPath = this.storagePath(storageKey);
    const retentionDays = await this.lifecycle.retentionDays();
    let finalCreated = false;
    try {
      await mkdir(dirname(temporaryPath), { recursive: true });
      const byteSize = await this.writeLimited(
        temporaryPath,
        input.stream,
        this.loaded.config.limits.maximumFileBytes,
        input.signal,
      );
      const extracted =
        parsedName.fileKind === 'pdf'
          ? await this.pdfPool.run(async () => {
              const bytes = await readFile(temporaryPath);
              if (input.signal?.aborted) {
                throw new TaskQueueCancelledError();
              }
              return extractPdfAttachment(
                bytes,
                this.loaded.config.limits.maximumPdfPages,
                {
                  recognize: (pdfBytes, pageCount) =>
                    this.ocrPool.run(
                      () =>
                        new LocalPdfOcrEngine(
                          this.loaded.paths.storageTemp,
                        ).recognize(pdfBytes, pageCount),
                      input.signal,
                    ),
                },
              );
            }, input.signal)
          : await this.extractNonPdf(
              temporaryPath,
              parsedName.fileKind,
              mediaType,
              input.signal,
            );
      await mkdir(dirname(finalPath), { recursive: true });
      await rename(temporaryPath, finalPath);
      finalCreated = true;
      const created = await this.repository.createReady(principal, {
        byteSize,
        conversationId: input.conversationId,
        encoding: 'encoding' in extracted ? extracted.encoding : null,
        extractedText: 'text' in extracted ? extracted.text : null,
        fileKind: parsedName.fileKind,
        imageHeight: 'height' in extracted ? extracted.height : null,
        imageWidth: 'width' in extracted ? extracted.width : null,
        id,
        includeInFutureMessages: input.includeInFutureMessages,
        maximumPending: this.loaded.config.limits.maximumAttachmentsPerMessage,
        mediaType,
        originalName,
        ocrPageCount: 'ocrPageCount' in extracted ? extracted.ocrPageCount : 0,
        pageCount: 'pageCount' in extracted ? extracted.pageCount : null,
        retentionDays,
        storageKey,
      });
      await this.logs.record({
        action: 'file.upload_completed',
        actorId: principal.id,
        actorLabel:
          principal.type === 'user'
            ? principal.username
            : `guest-${principal.id.slice(0, 8)}`,
        actorType: principal.type,
        category: 'file',
        metadata: {
          byteSize,
          fileKind: parsedName.fileKind,
          mediaType,
          ocrPageCount:
            'ocrPageCount' in extracted ? extracted.ocrPageCount : 0,
          pageCount: 'pageCount' in extracted ? extracted.pageCount : null,
        },
        targetId: created.id,
        targetType: 'attachment',
      });
      return created;
    } catch (error) {
      await rm(finalCreated ? finalPath : temporaryPath, {
        force: true,
      }).catch(() => undefined);
      await this.logs.record({
        action: 'file.upload_failed',
        actorId: principal.id,
        actorType: principal.type,
        category: 'file',
        errorCode:
          error instanceof Error ? error.constructor.name.slice(0, 64) : null,
        level: 'warn',
        metadata: { fileKind: parsedName.fileKind, mediaType },
        status: 'failed',
        targetType: 'attachment',
      });
      if (error instanceof TextAttachmentTooLargeError) {
        throw new FileTextTooLargeError();
      }
      if (error instanceof TextAttachmentTypeError) {
        throw new FileTypeUnsupportedError();
      }
      if (error instanceof PdfTextTooLargeError) {
        throw new FileTextTooLargeError();
      }
      if (error instanceof PdfPageLimitError) {
        throw new FilePdfPageLimitError();
      }
      if (error instanceof PdfPasswordProtectedError) {
        throw new FilePdfPasswordProtectedError();
      }
      if (error instanceof PdfOcrUnavailableError) {
        throw new FilePdfOcrUnavailableError();
      }
      if (error instanceof PdfOcrFailedError) {
        throw new FilePdfOcrFailedError();
      }
      if (error instanceof PdfOcrNoTextError) {
        throw new FilePdfOcrNoTextError();
      }
      if (error instanceof PdfOcrRequiredError) {
        throw new FilePdfOcrRequiredError();
      }
      if (error instanceof PdfInvalidError) {
        throw new FilePdfInvalidError();
      }
      if (error instanceof ImageDimensionsError) {
        throw new FileImageDimensionsError();
      }
      if (error instanceof ImageTypeError) {
        throw new FileTypeUnsupportedError();
      }
      if (error instanceof TaskQueueFullError) {
        throw new FileProcessingBusyError();
      }
      if (
        error instanceof TaskQueueCancelledError ||
        error instanceof TaskPoolClosedError
      ) {
        throw new FileProcessingCancelledError();
      }
      throw error;
    }
  }

  async deletePending(
    principalValue: AuthenticatedPrincipal,
    conversationId: string,
    attachmentId: string,
  ): Promise<void> {
    await this.repository.deletePending(
      this.chatPrincipal(principalValue),
      conversationId,
      attachmentId,
    );
    await this.lifecycle.flushQueuedFiles();
    await this.logs.record({
      action: 'file.pending_deleted',
      actorId: principalValue.type === 'admin' ? null : principalValue.id,
      actorType: principalValue.type,
      category: 'file',
      targetId: attachmentId,
      targetType: 'attachment',
    });
  }

  listPending(
    principalValue: AuthenticatedPrincipal,
    conversationId: string,
  ): Promise<AttachmentRecord[]> {
    return this.repository.listPending(
      this.chatPrincipal(principalValue),
      conversationId,
    );
  }

  updatePending(
    principalValue: AuthenticatedPrincipal,
    conversationId: string,
    attachmentId: string,
    includeInFutureMessages: boolean,
  ): Promise<AttachmentRecord> {
    return this.repository.updatePending(
      this.chatPrincipal(principalValue),
      conversationId,
      attachmentId,
      includeInFutureMessages,
    );
  }

  private chatPrincipal(principal: AuthenticatedPrincipal): ChatPrincipal {
    if (principal.type === 'admin') throw new ConversationNotFoundError();
    return principal;
  }

  private parseFileName(header: string): {
    fileKind: 'image' | 'pdf' | 'text';
    originalName: string;
  } {
    try {
      const decoded = decodeURIComponent(header);
      if (decoded.toLocaleLowerCase('en-US').endsWith('.pdf')) {
        return { fileKind: 'pdf', originalName: safeOriginalName(decoded) };
      }
      if (/\.(?:jpe?g|png|webp)$/iu.test(decoded)) {
        return { fileKind: 'image', originalName: safeOriginalName(decoded) };
      }
      textFileExtension(decoded);
      return { fileKind: 'text', originalName: safeOriginalName(decoded) };
    } catch {
      throw new FileTypeUnsupportedError();
    }
  }

  private parseMediaType(
    value: string,
    fileKind: 'image' | 'pdf' | 'text',
    fileName: string,
  ): string {
    try {
      if (fileKind === 'image') return imageMediaType(fileName, value);
      if (fileKind === 'pdf') {
        if (
          value.split(';', 1)[0]!.trim().toLowerCase() !== 'application/pdf'
        ) {
          throw new FileTypeUnsupportedError();
        }
        return 'application/pdf';
      }
      return validateTextMediaType(value);
    } catch {
      throw new FileTypeUnsupportedError();
    }
  }

  async readImages(
    images: Array<{
      byteSize: number;
      mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
      storageKey: string;
    }>,
    signal?: AbortSignal,
  ): Promise<
    Array<{
      data: string;
      mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
    }>
  > {
    const maximumBytes = this.loaded.config.limits.maximumImageBytesPerRequest;
    let declaredBytes = 0;
    for (const image of images) {
      if (!Number.isSafeInteger(image.byteSize) || image.byteSize < 0) {
        throw new ImageRequestTooLargeError();
      }
      declaredBytes += image.byteSize;
      if (
        !Number.isSafeInteger(declaredBytes) ||
        declaredBytes > maximumBytes
      ) {
        throw new ImageRequestTooLargeError();
      }
    }

    const encoded: Array<{
      data: string;
      mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
    }> = [];
    let actualBytes = 0;
    for (const image of images) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const bytes = await readFile(this.storagePath(image.storageKey));
      actualBytes += bytes.byteLength;
      if (actualBytes > maximumBytes) {
        throw new ImageRequestTooLargeError();
      }
      encoded.push({
        data: bytes.toString('base64'),
        mediaType: image.mediaType,
      });
    }
    return encoded;
  }

  private async assertStorageCapacity(): Promise<void> {
    const stats = await statfs(this.loaded.paths.storageRoot, {
      bigint: true,
    });
    const available = stats.bavail * stats.bsize;
    if (
      available < BigInt(this.loaded.config.storage.minimumFreeBytesForUpload)
    ) {
      throw new FileStorageLowError();
    }
  }

  private storagePath(storageKey: string): string {
    const root = resolve(this.loaded.paths.storageRoot);
    const target = resolve(root, storageKey);
    if (!target.startsWith(`${root}${sep}`)) throw new FileInputError();
    return target;
  }

  private async writeLimited(
    path: string,
    stream: UploadByteStream,
    maximumBytes: number,
    signal?: AbortSignal,
  ): Promise<number> {
    if (signal?.aborted) throw new FileProcessingCancelledError();
    const handle = await open(path, 'wx', 0o600);
    let total = 0;
    try {
      for await (const value of stream) {
        if (signal?.aborted) throw new FileProcessingCancelledError();
        const chunk = Buffer.from(value);
        total += chunk.byteLength;
        if (total > maximumBytes) throw new FileTooLargeError();
        await handle.write(chunk);
      }
    } finally {
      await handle.close();
    }
    if (total === 0) throw new FileInputError();
    return total;
  }

  private async extractNonPdf(
    temporaryPath: string,
    fileKind: 'image' | 'text',
    mediaType: string,
    signal?: AbortSignal,
  ) {
    if (signal?.aborted) throw new FileProcessingCancelledError();
    const bytes = await readFile(temporaryPath);
    if (signal?.aborted) throw new FileProcessingCancelledError();
    return fileKind === 'image'
      ? extractImageAttachment(
          bytes,
          mediaType as 'image/jpeg' | 'image/png' | 'image/webp',
          this.loaded.config.limits.maximumImagePixels,
        )
      : extractTextAttachment(bytes);
  }
}
