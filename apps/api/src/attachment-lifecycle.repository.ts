import { Injectable } from '@nestjs/common';

import type { DatabaseTransaction, JSONValue } from '@modelnaru/database';

import { DatabaseService } from './database.service.js';

export interface AttachmentLifecycleSettings {
  lastCleanupAt: Date | null;
  lastCleanupDeletedCount: number;
  lastCleanupExpiredCount: number;
  lastCleanupFailedCount: number;
  lastCleanupGuestCount: number;
  queuedFileCount: number;
  retentionDays: number;
  storedBytes: number;
  storedFileCount: number;
  updatedAt: Date;
}

export interface AttachmentCleanupEntry {
  storageKey: string;
}

interface RawSettingsRow {
  last_cleanup_at: Date | null;
  last_cleanup_deleted_count: number;
  last_cleanup_expired_count: number;
  last_cleanup_failed_count: number;
  last_cleanup_guest_count: number;
  queued_file_count: number;
  retention_days: number;
  stored_bytes: string | number;
  stored_file_count: number;
  updated_at: Date;
}

interface RawQueueRow {
  storage_key: string;
}

function mapSettings(row: RawSettingsRow): AttachmentLifecycleSettings {
  return {
    lastCleanupAt: row.last_cleanup_at,
    lastCleanupDeletedCount: row.last_cleanup_deleted_count,
    lastCleanupExpiredCount: row.last_cleanup_expired_count,
    lastCleanupFailedCount: row.last_cleanup_failed_count,
    lastCleanupGuestCount: row.last_cleanup_guest_count,
    queuedFileCount: row.queued_file_count,
    retentionDays: row.retention_days,
    storedBytes: Number(row.stored_bytes),
    storedFileCount: row.stored_file_count,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class AttachmentLifecycleRepository {
  constructor(private readonly database: DatabaseService) {}

  async settings(): Promise<AttachmentLifecycleSettings> {
    const rows = await this.database.getClient()<RawSettingsRow[]>`
      SELECT s.retention_days, s.last_cleanup_at,
        s.last_cleanup_expired_count, s.last_cleanup_deleted_count,
        s.last_cleanup_failed_count, s.last_cleanup_guest_count, s.updated_at,
        (SELECT count(*)::int FROM attachments
          WHERE status IN ('ready', 'failed')) AS stored_file_count,
        (SELECT COALESCE(sum(byte_size), 0) FROM attachments
          WHERE status IN ('ready', 'failed')) AS stored_bytes,
        (SELECT count(*)::int FROM attachment_cleanup_queue) AS queued_file_count
      FROM attachment_settings s
      WHERE s.singleton = true
    `;
    if (!rows[0]) throw new Error('Attachment settings are missing');
    return mapSettings(rows[0]);
  }

  async retentionDays(): Promise<number> {
    const rows = await this.database.getClient()<
      Array<{ retention_days: number }>
    >`
      SELECT retention_days FROM attachment_settings
      WHERE singleton = true
    `;
    if (!rows[0]) throw new Error('Attachment settings are missing');
    return rows[0].retention_days;
  }

  async initializeRetention(retentionDays: number): Promise<void> {
    await this.database.getClient()`
      UPDATE attachment_settings
      SET retention_days = ${retentionDays}
      WHERE singleton = true AND is_configured = false
    `;
  }

  async updateRetention(
    retentionDays: number,
    audit: { actorId: string; ipHash: Buffer | null },
  ): Promise<AttachmentLifecycleSettings> {
    await this.database.getClient().begin(async (transaction) => {
      const beforeRows = await transaction<Array<{ retention_days: number }>>`
        SELECT retention_days FROM attachment_settings
        WHERE singleton = true FOR UPDATE
      `;
      const before = beforeRows[0];
      if (!before) throw new Error('Attachment settings are missing');
      await transaction`
        UPDATE attachment_settings
        SET retention_days = ${retentionDays},
          is_configured = true
        WHERE singleton = true
      `;
      await transaction`
        UPDATE attachments
        SET expires_at = created_at + (${retentionDays} * interval '1 day')
        WHERE status IN ('ready', 'failed')
      `;
      await this.audit(transaction, {
        action: 'file.retention_updated',
        actorId: audit.actorId,
        after: { retentionDays },
        before: { retentionDays: before.retention_days },
        ipHash: audit.ipHash,
      });
    });
    return this.settings();
  }

  async queueExpired(limit: number): Promise<number> {
    return this.database.getClient().begin(async (transaction) => {
      const rows = await transaction<RawQueueRow[]>`
        SELECT storage_key
        FROM attachments
        WHERE expires_at <= now()
          AND status IN ('ready', 'failed')
        ORDER BY expires_at, id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length === 0) return 0;
      const keys = rows.map((row) => row.storage_key);
      await transaction`
        INSERT INTO attachment_cleanup_queue (
          storage_key,
          attachment_id,
          reason
        )
        SELECT storage_key, id, 'expired'
        FROM attachments
        WHERE storage_key::text = ANY(${keys}::text[])
        ON CONFLICT (storage_key) DO NOTHING
      `;
      await transaction`
        UPDATE attachments
        SET status = 'expired',
          extracted_text = NULL,
          text_encoding = NULL,
          include_in_future_messages = false
        WHERE storage_key::text = ANY(${keys}::text[])
      `;
      return rows.length;
    });
  }

  async purgeExpiredGuests(): Promise<number> {
    const rows = await this.database.getClient()<Array<{ id: string }>>`
      DELETE FROM guest_principals
      WHERE deleted_at IS NOT NULL
        OR idle_expires_at <= now()
        OR absolute_expires_at <= now()
      RETURNING id
    `;
    return rows.length;
  }

  async queued(limit: number): Promise<AttachmentCleanupEntry[]> {
    const rows = await this.database.getClient()<RawQueueRow[]>`
      SELECT storage_key
      FROM attachment_cleanup_queue
      WHERE last_attempt_at IS NULL
        OR last_attempt_at < now() - interval '5 minutes'
      ORDER BY queued_at, storage_key
      LIMIT ${limit}
    `;
    return rows.map((row) => ({ storageKey: row.storage_key }));
  }

  async complete(storageKey: string): Promise<void> {
    await this.database.getClient()`
      DELETE FROM attachment_cleanup_queue
      WHERE storage_key = ${storageKey}
    `;
  }

  async fail(storageKey: string, error: string): Promise<void> {
    await this.database.getClient()`
      UPDATE attachment_cleanup_queue
      SET attempt_count = attempt_count + 1,
        last_attempt_at = now(),
        last_error = ${error.slice(0, 255)}
      WHERE storage_key = ${storageKey}
    `;
  }

  async knownStorageKeys(): Promise<Set<string>> {
    const rows = await this.database.getClient()<RawQueueRow[]>`
      SELECT storage_key FROM attachments
      UNION
      SELECT storage_key FROM attachment_cleanup_queue
    `;
    return new Set(rows.map((row) => row.storage_key));
  }

  async recordCleanup(input: {
    deletedCount: number;
    expiredCount: number;
    failedCount: number;
    guestCount: number;
  }): Promise<void> {
    await this.database.getClient()`
      UPDATE attachment_settings
      SET last_cleanup_at = now(),
        last_cleanup_expired_count = ${input.expiredCount},
        last_cleanup_deleted_count = ${input.deletedCount},
        last_cleanup_failed_count = ${input.failedCount},
        last_cleanup_guest_count = ${input.guestCount}
      WHERE singleton = true
    `;
  }

  async auditManualCleanup(
    audit: { actorId: string; ipHash: Buffer | null },
    result: {
      deletedCount: number;
      expiredCount: number;
      failedCount: number;
      guestCount: number;
      orphanCount: number;
    },
  ): Promise<void> {
    await this.database.getClient().begin(async (transaction) => {
      await this.audit(transaction, {
        action: 'file.cleanup_requested',
        actorId: audit.actorId,
        after: result,
        before: null,
        ipHash: audit.ipHash,
      });
    });
  }

  private async audit(
    transaction: DatabaseTransaction,
    input: {
      action: string;
      actorId: string;
      after: Record<string, unknown>;
      before: Record<string, unknown> | null;
      ipHash: Buffer | null;
    },
  ): Promise<void> {
    await transaction`
      INSERT INTO audit_logs (
        actor_type, actor_id, action, target_type, target_id,
        before_data, after_data, ip_hash
      ) VALUES (
        'admin', ${input.actorId}, ${input.action}, 'file_settings', NULL,
        ${input.before ? transaction.json(input.before as JSONValue) : null},
        ${transaction.json(input.after as JSONValue)}, ${input.ipHash}
      )
    `;
  }
}
