import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, statfs } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import type { LoadedConfig } from '@modelnaru/config';

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
  PdfOcrRequiredError,
  PdfPageLimitError,
  PdfPasswordProtectedError,
  PdfTextTooLargeError,
} from './pdf-attachments.js';
import {
  extractImageAttachment,
  ImageDimensionsError,
  imageMediaType,
  ImageTypeError,
} from './image-attachments.js';

export class FileInputError extends Error {}
export class FileStorageLowError extends Error {}
export class FileTooLargeError extends Error {}
export class FileTypeUnsupportedError extends Error {}
export class FileTextTooLargeError extends Error {}
export class FilePdfInvalidError extends Error {}
export class FilePdfOcrRequiredError extends Error {}
export class FilePdfPageLimitError extends Error {}
export class FilePdfPasswordProtectedError extends Error {}
export class FileImageDimensionsError extends Error {}

export type UploadByteStream = AsyncIterable<Uint8Array>;

@Injectable()
export class AttachmentsService {
  private activePdfWorkers = 0;
  private readonly pdfWaiters: Array<() => void> = [];

  constructor(
    private readonly repository: AttachmentsRepository,
    @Inject(MODELNARU_CONFIG) private readonly loaded: LoadedConfig,
    private readonly lifecycle: AttachmentLifecycleService = {
      flushQueuedFiles: () => Promise.resolve(),
      retentionDays: () =>
        Promise.resolve(loaded.config.storage.attachmentRetentionDays),
    } as AttachmentLifecycleService,
  ) {}

  async upload(
    principalValue: AuthenticatedPrincipal,
    input: {
      conversationId: string;
      fileName: string;
      includeInFutureMessages: boolean;
      mediaType: string;
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
      );
      const bytes = await readFile(temporaryPath);
      const extracted =
        parsedName.fileKind === 'pdf'
          ? await this.withPdfWorker(() =>
              extractPdfAttachment(
                bytes,
                this.loaded.config.limits.maximumPdfPages,
              ),
            )
          : parsedName.fileKind === 'image'
            ? extractImageAttachment(
                bytes,
                mediaType as 'image/jpeg' | 'image/png' | 'image/webp',
                this.loaded.config.limits.maximumImagePixels,
              )
            : extractTextAttachment(bytes);
      await mkdir(dirname(finalPath), { recursive: true });
      await rename(temporaryPath, finalPath);
      finalCreated = true;
      return await this.repository.createReady(principal, {
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
        pageCount: 'pageCount' in extracted ? extracted.pageCount : null,
        retentionDays,
        storageKey,
      });
    } catch (error) {
      await rm(finalCreated ? finalPath : temporaryPath, {
        force: true,
      }).catch(() => undefined);
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

  async readImage(storageKey: string): Promise<string> {
    return (await readFile(this.storagePath(storageKey))).toString('base64');
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
  ): Promise<number> {
    const handle = await open(path, 'wx', 0o600);
    let total = 0;
    try {
      for await (const value of stream) {
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

  private async withPdfWorker<T>(task: () => Promise<T>): Promise<T> {
    const maximum = this.loaded.config.limits.maximumPdfWorkers;
    if (this.activePdfWorkers >= maximum) {
      await new Promise<void>((resolve) => this.pdfWaiters.push(resolve));
    }
    this.activePdfWorkers += 1;
    try {
      return await task();
    } finally {
      this.activePdfWorkers -= 1;
      this.pdfWaiters.shift()?.();
    }
  }
}
