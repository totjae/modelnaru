import { Injectable } from '@nestjs/common';
import type { DatabaseClient, DatabaseTransaction } from '@modelnaru/database';
import { DatabaseService } from './database.service.js';
import type { ChatProviderRuntime } from './chat-provider.service.js';

export interface TitleTask {
  id: string;
  conversationId: string;
  sessionId: string;
  providerModelId: string | null;
  userText: string;
  assistantText: string;
}

@Injectable()
export class TitleGenerationRepository {
  constructor(private readonly database: DatabaseService) {}

  async settings() {
    const rows = await this.database.getClient()<
      Array<{ providerModelId: string | null; version: string }>
    >`
      SELECT provider_model_id AS "providerModelId", version::text FROM title_generation_settings WHERE id = 1`;
    return rows[0]!;
  }

  async updateSettings(
    providerModelId: string | null,
    actorId: string,
    ipHash: Buffer | null,
  ) {
    return this.database.getClient().begin(async (tx) => {
      if (providerModelId) {
        const usable = await tx<
          { id: string }[]
        >`SELECT m.id FROM provider_models m JOIN provider_connections c ON c.id = m.provider_connection_id
          WHERE m.id = ${providerModelId} AND m.is_enabled AND m.is_available AND c.is_enabled AND c.status = 'ready'`;
        if (!usable[0]) throw new Error('TITLE_MODEL_UNAVAILABLE');
      }
      const rows = await tx<
        Array<{ providerModelId: string | null; version: string }>
      >`
        UPDATE title_generation_settings SET provider_model_id = ${providerModelId}, version = version + 1 WHERE id = 1
        RETURNING provider_model_id AS "providerModelId", version::text`;
      await tx`INSERT INTO audit_logs (actor_type, actor_id, action, target_type, after_data, ip_hash)
        VALUES ('admin', ${actorId}, 'title.settings_updated', 'title_generation_settings',
          ${tx.json({ providerModelId, version: rows[0]!.version })}, ${ipHash})`;
      return rows[0]!;
    });
  }

  async forJob(jobId: string): Promise<TitleTask | undefined> {
    const rows = await this.database.getClient()<
      TitleTask[]
    >`SELECT t.id, t.conversation_id AS "conversationId",
      t.started_session_id AS "sessionId", t.provider_model_id AS "providerModelId",
      COALESCE((SELECT content FROM messages WHERE conversation_id = t.conversation_id AND role = 'user' ORDER BY sequence_number LIMIT 1), '') AS "userText",
      COALESCE((SELECT content FROM messages WHERE conversation_id = t.conversation_id AND role = 'assistant' AND status = 'completed' ORDER BY sequence_number LIMIT 1), '') AS "assistantText"
      FROM conversation_title_tasks t JOIN chat_jobs j ON j.conversation_id = t.conversation_id
      WHERE j.id = ${jobId} AND j.status = 'completed' AND t.status = 'pending'`;
    return rows[0];
  }

  async valid(
    id: string,
    sql: DatabaseClient | DatabaseTransaction = this.database.getClient(),
  ): Promise<boolean> {
    const rows = await sql<
      { id: string }[]
    >`SELECT t.id FROM conversation_title_tasks t
      JOIN conversations c ON c.id = t.conversation_id
      JOIN sessions s ON s.id = t.started_session_id
      JOIN provider_models m ON m.id = t.provider_model_id
      JOIN provider_connections p ON p.id = m.provider_connection_id
      LEFT JOIN users u ON u.id = c.user_id LEFT JOIN guest_principals g ON g.id = c.guest_id
      WHERE t.id = ${id} AND t.status = 'pending' AND c.title_source = 'default'
        AND s.revoked_at IS NULL AND s.idle_expires_at > now() AND s.absolute_expires_at > now()
        AND (s.user_id = c.user_id OR s.guest_id = c.guest_id)
        AND (u.is_enabled OR (g.deleted_at IS NULL AND g.idle_expires_at > now() AND g.absolute_expires_at > now()))
        AND m.is_enabled AND m.is_available AND p.is_enabled AND p.status = 'ready'`;
    return Boolean(rows[0]);
  }

  async begin(
    task: TitleTask,
    runtime: ChatProviderRuntime,
  ): Promise<string | undefined> {
    if (!(await this.valid(task.id))) return undefined;
    const rows = await this.database.getClient()<
      { id: string }[]
    >`INSERT INTO usage_events (
      principal_type, principal_id, principal_label, provider_model_id, provider_template_id_snapshot,
      model_id_snapshot, operation_type, status, conversation_id, title_task_id, sent_at)
      SELECT CASE WHEN c.user_id IS NOT NULL THEN 'user' ELSE 'guest' END, COALESCE(c.user_id,c.guest_id),
        COALESCE(u.username,'Guest'), ${runtime.providerModelId}, ${runtime.template.id}, ${runtime.modelId},
        'title', 'pending', c.id, t.id, now()
      FROM conversation_title_tasks t JOIN conversations c ON c.id = t.conversation_id LEFT JOIN users u ON u.id = c.user_id
      WHERE t.id = ${task.id} AND t.status = 'pending' AND c.title_source = 'default'
      ON CONFLICT DO NOTHING RETURNING id`;
    return rows[0]?.id;
  }

  async tokens(
    id: string,
    input: number | null,
    output: number | null,
  ): Promise<void> {
    await this.database.getClient()`UPDATE usage_events SET input_tokens = ${input}, output_tokens = ${output},
      usage_known = ${input !== null || output !== null} WHERE id = ${id} AND status = 'pending'`;
  }

  async finish(
    task: TitleTask,
    status: 'completed' | 'failed' | 'cancelled',
    title: string | null,
    usageId: string | undefined,
    input: number | null,
    output: number | null,
  ): Promise<void> {
    await this.database.getClient().begin(async (tx) => {
      await tx`SELECT id FROM conversations WHERE id = ${task.conversationId} FOR UPDATE`;
      const valid = await this.valid(task.id, tx);
      const finalStatus = valid ? status : 'cancelled';
      const rows = await tx<
        { id: string }[]
      >`UPDATE conversation_title_tasks SET status = ${finalStatus}, finished_at = now()
        WHERE id = ${task.id} AND status = 'pending' RETURNING id`;
      if (rows[0]) {
        await tx`UPDATE conversations SET title = CASE WHEN ${finalStatus === 'completed' && title !== null} THEN ${title ?? ''} ELSE title END,
          title_source = CASE WHEN ${finalStatus === 'completed'} THEN 'auto' ELSE title_source END,
          title_status = ${finalStatus === 'completed' ? 'completed' : 'failed'}
          WHERE id = ${task.conversationId} AND title_source = 'default'`;
      }
      if (usageId)
        await tx`UPDATE usage_events SET status = ${finalStatus}, input_tokens = ${input}, output_tokens = ${output},
        usage_known = ${input !== null || output !== null}, completed_at = now(),
        duration_ms = GREATEST(0,floor(extract(epoch FROM (now()-started_at))*1000)::integer)
        WHERE id = ${usageId} AND status = 'pending'`;
    });
  }

  async recover(): Promise<void> {
    await this.database.getClient().begin(async (tx) => {
      await tx`UPDATE conversations SET title_status = 'failed' WHERE title_source = 'default' AND title_status = 'pending'`;
      await tx`UPDATE conversation_title_tasks SET status = 'failed', finished_at = now() WHERE status = 'pending'`;
      await tx`UPDATE usage_events SET status = 'failed', completed_at = now()
        WHERE operation_type IN ('summary','title') AND status = 'pending'`;
    });
  }
}
