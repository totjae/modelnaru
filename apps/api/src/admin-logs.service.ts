import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import {
  type AdminLogFilter,
  type LogRetentionSettings,
  AdminLogsRepository,
  type OperationalLogInput,
} from './admin-logs.repository.js';
import { DatabaseService } from './database.service.js';

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const INITIAL_CLEANUP_DELAY_MS = 2 * 60 * 1_000;

function csvCell(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

@Injectable()
export class AdminLogsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminLogsService.name);
  private initialTimer: ReturnType<typeof setTimeout> | undefined;
  private intervalTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly repository: AdminLogsRepository,
    private readonly database: DatabaseService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.database.ready();
    this.initialTimer = setTimeout(() => {
      void this.runCleanup();
    }, INITIAL_CLEANUP_DELAY_MS);
    this.initialTimer.unref();
    this.intervalTimer = setInterval(() => {
      void this.runCleanup();
    }, CLEANUP_INTERVAL_MS);
    this.intervalTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
  }

  list(filter: AdminLogFilter) {
    return this.repository.list(filter);
  }

  detail(id: string) {
    return this.repository.detail(id);
  }

  settings() {
    return this.repository.settings();
  }

  updateSettings(
    input: Omit<
      LogRetentionSettings,
      'lastCleanupAt' | 'lastCleanupDeletedCount' | 'updatedAt'
    >,
    audit: { actorId: string; ipHash: Buffer | null },
  ) {
    return this.repository.updateSettings(input, audit);
  }

  async export(filter: Omit<AdminLogFilter, 'limit' | 'offset'>) {
    const page = await this.repository.export(filter);
    const header = [
      'occurredAt',
      'category',
      'level',
      'status',
      'action',
      'actorType',
      'actorLabel',
      'targetType',
      'provider',
      'model',
      'errorCode',
      'durationMs',
      'metadata',
    ];
    const rows = page.items.map((item) =>
      [
        item.occurredAt,
        item.category,
        item.level,
        item.status,
        item.action,
        item.actorType,
        item.actorLabel,
        item.targetType,
        item.providerTemplateId,
        item.modelId,
        item.errorCode,
        item.durationMs,
        item.metadata,
      ]
        .map(csvCell)
        .join(','),
    );
    return ['\uFEFF' + header.join(','), ...rows].join('\r\n');
  }

  async record(input: OperationalLogInput): Promise<void> {
    try {
      await this.repository.record(input);
    } catch (error) {
      this.logger.warn(
        `Operational log write failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  auditAccess(
    action: 'logs.exported' | 'logs.viewed',
    audit: { actorId: string; ipHash: Buffer | null },
    metadata: Record<string, unknown>,
  ) {
    return this.repository.auditAccess(action, audit, metadata);
  }

  async runCleanup(): Promise<number> {
    try {
      const deleted = await this.repository.cleanup();
      await this.record({
        action: 'logs.cleanup_completed',
        actorType: 'system',
        category: 'system',
        metadata: { deletedCount: deleted },
      });
      return deleted;
    } catch (error) {
      this.logger.error(
        'Log cleanup failed',
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    }
  }
}
