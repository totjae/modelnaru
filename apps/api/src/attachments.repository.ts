import { Injectable } from '@nestjs/common';

import type { ChatPrincipal } from './chats.repository.js';
import { ConversationNotFoundError } from './chats.repository.js';
import { DatabaseService } from './database.service.js';

export interface AttachmentRecord {
  byteSize: number;
  createdAt: Date;
  expiresAt: Date;
  id: string;
  fileKind: 'image' | 'pdf' | 'text';
  imageHeight: number | null;
  imageWidth: number | null;
  includeInFutureMessages: boolean;
  mediaType: string;
  originalName: string;
  pageCount: number | null;
  status: 'expired' | 'failed' | 'processing' | 'ready';
}

interface RawAttachmentRow {
  byte_size: string | number;
  created_at: Date;
  expires_at: Date;
  id: string;
  file_kind: 'image' | 'pdf' | 'text';
  image_height: number | null;
  image_width: number | null;
  include_in_future_messages: boolean;
  media_type: string;
  original_name: string;
  page_count: number | null;
  status: 'expired' | 'failed' | 'processing' | 'ready';
  storage_key: string;
}

function mapAttachment(row: RawAttachmentRow): AttachmentRecord {
  return {
    byteSize: Number(row.byte_size),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    id: row.id,
    fileKind: row.file_kind,
    imageHeight: row.image_height,
    imageWidth: row.image_width,
    includeInFutureMessages: row.include_in_future_messages,
    mediaType: row.media_type,
    originalName: row.original_name,
    pageCount: row.page_count,
    status: row.status,
  };
}

export class AttachmentLimitError extends Error {}
export class AttachmentNotFoundError extends Error {}

@Injectable()
export class AttachmentsRepository {
  constructor(private readonly database: DatabaseService) {}

  async assertConversation(
    principal: ChatPrincipal,
    conversationId: string,
  ): Promise<void> {
    const sql = this.database.getClient();
    const rows =
      principal.type === 'user'
        ? await sql<{ id: string }[]>`
            SELECT id FROM conversations
            WHERE id = ${conversationId} AND user_id = ${principal.id}
            LIMIT 1
          `
        : await sql<{ id: string }[]>`
            SELECT id FROM conversations
            WHERE id = ${conversationId} AND guest_id = ${principal.id}
            LIMIT 1
          `;
    if (!rows[0]) throw new ConversationNotFoundError();
  }

  async createReady(
    principal: ChatPrincipal,
    input: {
      byteSize: number;
      conversationId: string;
      encoding: string | null;
      extractedText: string | null;
      fileKind: 'image' | 'pdf' | 'text';
      imageHeight: number | null;
      imageWidth: number | null;
      id: string;
      includeInFutureMessages: boolean;
      maximumPending: number;
      mediaType: string;
      originalName: string;
      pageCount: number | null;
      retentionDays: number;
      storageKey: string;
    },
  ): Promise<AttachmentRecord> {
    return this.database.getClient().begin(async (transaction) => {
      const conversations =
        principal.type === 'user'
          ? await transaction<{ id: string }[]>`
              SELECT id FROM conversations
              WHERE id = ${input.conversationId} AND user_id = ${principal.id}
              FOR UPDATE
            `
          : await transaction<{ id: string }[]>`
              SELECT id FROM conversations
              WHERE id = ${input.conversationId} AND guest_id = ${principal.id}
              FOR UPDATE
            `;
      if (!conversations[0]) throw new ConversationNotFoundError();
      const counts = await transaction<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM attachments
        WHERE conversation_id = ${input.conversationId}
          AND message_id IS NULL
          AND expires_at > now()
      `;
      if ((counts[0]?.count ?? 0) >= input.maximumPending) {
        throw new AttachmentLimitError();
      }
      const rows = await transaction<RawAttachmentRow[]>`
        INSERT INTO attachments (
          id, conversation_id, original_name, media_type, file_kind,
          byte_size, storage_key, extracted_text, text_encoding, page_count,
          image_width, image_height,
          include_in_future_messages, status, expires_at
        ) VALUES (
          ${input.id}, ${input.conversationId}, ${input.originalName},
          ${input.mediaType}, ${input.fileKind}, ${input.byteSize}, ${input.storageKey},
          ${input.extractedText}, ${input.encoding},
          ${input.pageCount},
          ${input.imageWidth}, ${input.imageHeight},
          ${input.includeInFutureMessages}, 'ready',
          now() + (${input.retentionDays} * interval '1 day')
        )
        RETURNING id, original_name, media_type, file_kind, byte_size,
          page_count, image_width, image_height,
          include_in_future_messages, status, storage_key, created_at,
          expires_at
      `;
      return mapAttachment(rows[0]!);
    });
  }

  async deletePending(
    principal: ChatPrincipal,
    conversationId: string,
    attachmentId: string,
  ): Promise<string> {
    const sql = this.database.getClient();
    const rows =
      principal.type === 'user'
        ? await sql<RawAttachmentRow[]>`
            DELETE FROM attachments a
            USING conversations c
            WHERE a.id = ${attachmentId}
              AND a.conversation_id = ${conversationId}
              AND a.message_id IS NULL
              AND a.conversation_id = c.id
              AND c.user_id = ${principal.id}
            RETURNING a.id, a.original_name, a.media_type, a.file_kind,
              a.byte_size, a.page_count, a.image_width, a.image_height,
              a.include_in_future_messages, a.status, a.storage_key,
              a.created_at, a.expires_at
          `
        : await sql<RawAttachmentRow[]>`
            DELETE FROM attachments a
            USING conversations c
            WHERE a.id = ${attachmentId}
              AND a.conversation_id = ${conversationId}
              AND a.message_id IS NULL
              AND a.conversation_id = c.id
              AND c.guest_id = ${principal.id}
            RETURNING a.id, a.original_name, a.media_type, a.file_kind,
              a.byte_size, a.page_count, a.image_width, a.image_height,
              a.include_in_future_messages, a.status, a.storage_key,
              a.created_at, a.expires_at
          `;
    if (!rows[0]) throw new AttachmentNotFoundError();
    return rows[0].storage_key;
  }

  async listPending(
    principal: ChatPrincipal,
    conversationId: string,
  ): Promise<AttachmentRecord[]> {
    const sql = this.database.getClient();
    const rows =
      principal.type === 'user'
        ? await sql<RawAttachmentRow[]>`
            SELECT a.id, a.original_name, a.media_type, a.file_kind,
              a.byte_size, a.page_count, a.image_width, a.image_height,
              a.include_in_future_messages, a.status, a.storage_key,
              a.created_at, a.expires_at
            FROM attachments a
            JOIN conversations c ON c.id = a.conversation_id
            WHERE a.conversation_id = ${conversationId}
              AND c.user_id = ${principal.id}
              AND a.message_id IS NULL
              AND a.status = 'ready'
              AND a.expires_at > now()
            ORDER BY a.created_at, a.id
          `
        : await sql<RawAttachmentRow[]>`
            SELECT a.id, a.original_name, a.media_type, a.file_kind,
              a.byte_size, a.page_count, a.image_width, a.image_height,
              a.include_in_future_messages, a.status, a.storage_key,
              a.created_at, a.expires_at
            FROM attachments a
            JOIN conversations c ON c.id = a.conversation_id
            WHERE a.conversation_id = ${conversationId}
              AND c.guest_id = ${principal.id}
              AND a.message_id IS NULL
              AND a.status = 'ready'
              AND a.expires_at > now()
            ORDER BY a.created_at, a.id
          `;
    if (rows.length === 0) {
      await this.assertConversation(principal, conversationId);
    }
    return rows.map(mapAttachment);
  }

  async updatePending(
    principal: ChatPrincipal,
    conversationId: string,
    attachmentId: string,
    includeInFutureMessages: boolean,
  ): Promise<AttachmentRecord> {
    const sql = this.database.getClient();
    const rows =
      principal.type === 'user'
        ? await sql<RawAttachmentRow[]>`
            UPDATE attachments a
            SET include_in_future_messages = ${includeInFutureMessages}
            FROM conversations c
            WHERE a.id = ${attachmentId}
              AND a.conversation_id = ${conversationId}
              AND a.message_id IS NULL
              AND a.conversation_id = c.id
              AND c.user_id = ${principal.id}
            RETURNING a.id, a.original_name, a.media_type, a.file_kind,
              a.byte_size, a.page_count, a.image_width, a.image_height,
              a.include_in_future_messages, a.status, a.storage_key,
              a.created_at, a.expires_at
          `
        : await sql<RawAttachmentRow[]>`
            UPDATE attachments a
            SET include_in_future_messages = ${includeInFutureMessages}
            FROM conversations c
            WHERE a.id = ${attachmentId}
              AND a.conversation_id = ${conversationId}
              AND a.message_id IS NULL
              AND a.conversation_id = c.id
              AND c.guest_id = ${principal.id}
            RETURNING a.id, a.original_name, a.media_type, a.file_kind,
              a.byte_size, a.page_count, a.image_width, a.image_height,
              a.include_in_future_messages, a.status, a.storage_key,
              a.created_at, a.expires_at
          `;
    if (!rows[0]) throw new AttachmentNotFoundError();
    return mapAttachment(rows[0]);
  }
}
