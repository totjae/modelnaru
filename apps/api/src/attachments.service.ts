import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, statfs } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import type { LoadedConfig } from '@modelnaru/config';

import {
  type AttachmentRecord,
  AttachmentsRepository,
} from './attachments.repository.js';
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

export class FileInputError extends Error {}
export class FileStorageLowError extends Error {}
export class FileTooLargeError extends Error {}
export class FileTypeUnsupportedError extends Error {}
export class FileTextTooLargeError extends Error {}

export type UploadByteStream = AsyncIterable<Uint8Array>;

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly repository: AttachmentsRepository,
    @Inject(MODELNARU_CONFIG) private readonly loaded: LoadedConfig,
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
    const originalName = this.parseFileName(input.fileName);
    const mediaType = this.parseMediaType(input.mediaType);
    await this.assertStorageCapacity();

    const id = randomUUID();
    const storageKey = `${id.slice(0, 2)}/${id}`;
    const temporaryPath = join(
      this.loaded.paths.storageTemp,
      `${id}.${randomUUID()}.upload`,
    );
    const finalPath = this.storagePath(storageKey);
    let finalCreated = false;
    try {
      await mkdir(dirname(temporaryPath), { recursive: true });
      const byteSize = await this.writeLimited(
        temporaryPath,
        input.stream,
        this.loaded.config.limits.maximumFileBytes,
      );
      const bytes = await readFile(temporaryPath);
      const extracted = extractTextAttachment(bytes);
      await mkdir(dirname(finalPath), { recursive: true });
      await rename(temporaryPath, finalPath);
      finalCreated = true;
      return await this.repository.createReady(principal, {
        byteSize,
        conversationId: input.conversationId,
        encoding: extracted.encoding,
        extractedText: extracted.text,
        id,
        includeInFutureMessages: input.includeInFutureMessages,
        maximumPending: this.loaded.config.limits.maximumAttachmentsPerMessage,
        mediaType,
        originalName,
        retentionDays: this.loaded.config.storage.attachmentRetentionDays,
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
      throw error;
    }
  }

  async deletePending(
    principalValue: AuthenticatedPrincipal,
    conversationId: string,
    attachmentId: string,
  ): Promise<void> {
    const storageKey = await this.repository.deletePending(
      this.chatPrincipal(principalValue),
      conversationId,
      attachmentId,
    );
    await rm(this.storagePath(storageKey), { force: true });
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

  private parseFileName(header: string): string {
    try {
      const decoded = decodeURIComponent(header);
      textFileExtension(decoded);
      return safeOriginalName(decoded);
    } catch {
      throw new FileTypeUnsupportedError();
    }
  }

  private parseMediaType(value: string): string {
    try {
      return validateTextMediaType(value);
    } catch {
      throw new FileTypeUnsupportedError();
    }
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
}
