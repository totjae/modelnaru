import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { LoadedConfig } from '@modelnaru/config';
import { readdir, rm, rmdir, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

import {
  AttachmentLifecycleRepository,
  type AttachmentLifecycleSettings,
} from './attachment-lifecycle.repository.js';
import { MODELNARU_CONFIG } from './tokens.js';

export interface AttachmentCleanupResult {
  deletedCount: number;
  expiredCount: number;
  failedCount: number;
  guestCount: number;
  orphanCount: number;
}

const CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;
const INITIAL_CLEANUP_DELAY_MS = 60_000;
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1_000;
const STORAGE_KEY = /^[0-9a-f]{2}\/[0-9a-f-]{36}$/u;

@Injectable()
export class AttachmentLifecycleService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AttachmentLifecycleService.name);
  private initialTimer: ReturnType<typeof setTimeout> | undefined;
  private intervalTimer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<AttachmentCleanupResult> | undefined;

  constructor(
    private readonly repository: AttachmentLifecycleRepository,
    @Inject(MODELNARU_CONFIG) private readonly loaded: LoadedConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repository.initializeRetention(
      this.loaded.config.storage.attachmentRetentionDays,
    );
    this.initialTimer = setTimeout(() => {
      void this.runCleanup().catch((error: unknown) => {
        this.logger.error(
          'Initial attachment cleanup failed',
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, INITIAL_CLEANUP_DELAY_MS);
    this.initialTimer.unref();
    this.intervalTimer = setInterval(() => {
      void this.runCleanup().catch((error: unknown) => {
        this.logger.error(
          'Scheduled attachment cleanup failed',
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, CLEANUP_INTERVAL_MS);
    this.intervalTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
  }

  settings(): Promise<AttachmentLifecycleSettings> {
    return this.repository.settings();
  }

  retentionDays(): Promise<number> {
    return this.repository.retentionDays();
  }

  updateRetention(
    retentionDays: number,
    audit: { actorId: string; ipHash: Buffer | null },
  ): Promise<AttachmentLifecycleSettings> {
    return this.repository.updateRetention(retentionDays, audit);
  }

  async runNow(audit: { actorId: string; ipHash: Buffer | null }): Promise<{
    result: AttachmentCleanupResult;
    settings: AttachmentLifecycleSettings;
  }> {
    const result = await this.runCleanup();
    await this.repository.auditManualCleanup(audit, result);
    return { result, settings: await this.repository.settings() };
  }

  async flushQueuedFiles(): Promise<void> {
    try {
      const result = await this.deleteQueuedFiles(2_000);
      if (result.failedCount === 0) return;
      this.logger.warn(
        `Immediate attachment cleanup retained ${result.failedCount} file(s) for retry`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown cleanup error';
      this.logger.warn(`Immediate attachment cleanup deferred: ${message}`);
    }
  }

  runCleanup(): Promise<AttachmentCleanupResult> {
    if (this.running) return this.running;
    this.running = this.performCleanup().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async performCleanup(): Promise<AttachmentCleanupResult> {
    const guestCount = await this.repository.purgeExpiredGuests();
    let expiredCount = 0;
    for (let batch = 0; batch < 20; batch += 1) {
      const queued = await this.repository.queueExpired(500);
      expiredCount += queued;
      if (queued < 500) break;
    }
    const deleted = await this.deleteQueuedFiles(10_000);
    const orphans = await this.deleteOrphans();
    const result = {
      deletedCount: deleted.deletedCount + orphans.deletedCount,
      expiredCount,
      failedCount: deleted.failedCount + orphans.failedCount,
      guestCount,
      orphanCount: orphans.deletedCount,
    };
    await this.repository.recordCleanup(result);
    this.logger.log(
      `Attachment cleanup completed: expired=${expiredCount}, deleted=${result.deletedCount}, failed=${result.failedCount}, guests=${guestCount}, orphans=${orphans.deletedCount}`,
    );
    return result;
  }

  private async deleteQueuedFiles(limit: number): Promise<{
    deletedCount: number;
    failedCount: number;
  }> {
    let deletedCount = 0;
    let failedCount = 0;
    let processed = 0;
    while (processed < limit) {
      const entries = await this.repository.queued(
        Math.min(500, limit - processed),
      );
      if (entries.length === 0) break;
      for (const entry of entries) {
        processed += 1;
        try {
          await rm(this.storagePath(entry.storageKey), { force: true });
          await this.repository.complete(entry.storageKey);
          deletedCount += 1;
        } catch (error) {
          failedCount += 1;
          await this.repository.fail(
            entry.storageKey,
            error instanceof Error ? error.message : 'Unknown filesystem error',
          );
        }
      }
      if (entries.length < 500) break;
    }
    return { deletedCount, failedCount };
  }

  private async deleteOrphans(): Promise<{
    deletedCount: number;
    failedCount: number;
  }> {
    const root = resolve(this.loaded.paths.storageRoot);
    const known = await this.repository.knownStorageKeys();
    const cutoff = Date.now() - ORPHAN_GRACE_MS;
    let deleted = 0;
    let failed = 0;
    const prefixes = await readdir(root, { withFileTypes: true });
    for (const prefix of prefixes) {
      if (!prefix.isDirectory() || !/^[0-9a-f]{2}$/u.test(prefix.name)) {
        continue;
      }
      const directory = join(root, prefix.name);
      const files = await readdir(directory, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile()) continue;
        const key = `${prefix.name}/${file.name}`;
        if (!STORAGE_KEY.test(key) || known.has(key)) continue;
        const path = this.storagePath(key);
        try {
          const details = await stat(path);
          if (details.mtimeMs > cutoff) continue;
          await rm(path, { force: true });
          deleted += 1;
        } catch {
          failed += 1;
        }
      }
      await rmdir(directory).catch(() => undefined);
    }
    return { deletedCount: deleted, failedCount: failed };
  }

  private storagePath(storageKey: string): string {
    if (!STORAGE_KEY.test(storageKey)) {
      throw new Error('Invalid attachment storage key');
    }
    const root = resolve(this.loaded.paths.storageRoot);
    const target = resolve(root, storageKey);
    if (!target.startsWith(`${root}${sep}`)) {
      throw new Error('Attachment path escaped storage root');
    }
    return target;
  }
}
