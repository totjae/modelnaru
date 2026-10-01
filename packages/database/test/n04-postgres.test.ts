import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';
import { describe, expect, it } from 'vitest';

import { loadMigrationPlan } from '../src/migration-plan.js';

const databaseUrl = process.env.MODELNARU_TEST_DATABASE_URL;
const runWithDatabase = databaseUrl ? it : it.skip;
const migrationsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../migrations',
);

describe('N04 isolated PostgreSQL migration', () => {
  runWithDatabase(
    'installs, replays, and enforces job and provider constraints',
    async () => {
      const url = new URL(databaseUrl!);
      if (
        !['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ||
        !url.pathname.endsWith('_test')
      ) {
        throw new Error(
          'MODELNARU_TEST_DATABASE_URL must target a local *_test database',
        );
      }

      const client = postgres(databaseUrl!, { max: 1 });
      const concurrentClient = postgres(databaseUrl!, { max: 1 });
      const schema = `n04_${randomUUID().replaceAll('-', '')}`;
      const plan = await loadMigrationPlan(migrationsDirectory);
      try {
        await client.unsafe(`CREATE SCHEMA "${schema}"`);
        await client.unsafe(`SET search_path TO "${schema}", public`);
        await client`CREATE TABLE schema_migrations (
        version varchar(255) PRIMARY KEY, checksum char(64) NOT NULL
      )`;

        const apply = async (through: number) => {
          for (const migration of plan.slice(0, through)) {
            const existing = await client`
            SELECT checksum FROM schema_migrations WHERE version = ${migration.version}
          `;
            if (existing.length > 0) {
              expect(String(existing[0]?.checksum).trim()).toBe(
                migration.checksum,
              );
              continue;
            }
            await client.begin(async (transaction) => {
              await transaction.unsafe(migration.sql);
              await transaction`
              INSERT INTO schema_migrations (version, checksum)
              VALUES (${migration.version}, ${migration.checksum})
            `;
            });
          }
        };

        await apply(19);
        const connectionId = randomUUID();
        await client`
        INSERT INTO provider_connections (
          id, template_id, name, base_url,
          credential_ciphertext, credential_nonce, credential_auth_tag
        ) VALUES (
          ${connectionId}, 'openai', 'Builtin migration fixture',
          'https://api.example.test', decode('aa', 'hex'),
          decode('000000000000000000000000', 'hex'),
          decode('00000000000000000000000000000000', 'hex')
        )
      `;
        await apply(plan.length);
        await apply(plan.length);
        const migrations =
          await client`SELECT count(*)::integer AS count FROM schema_migrations`;
        expect(migrations[0]?.count).toBe(plan.length);
        const builtin = await client`
        SELECT kind, auth_mode, destination_kind FROM provider_connections
        WHERE id = ${connectionId}
      `;
        expect(builtin[0]).toMatchObject({
          kind: 'builtin',
          auth_mode: 'bearer',
          destination_kind: 'public',
        });

        const local = await client`
        INSERT INTO provider_connections (
          template_id, name, base_url, kind, protocol, auth_mode,
          destination_kind, approved_local_ip, approved_local_port
        ) VALUES (
          'custom-openai', 'Local fixture', 'http://127.0.0.1:11434',
          'custom', 'openai-chat-completions', 'none', 'local',
          '127.0.0.1', 11434
        )
        RETURNING id
      `;
        const localId = String(local[0]?.id);
        await client`
          INSERT INTO provider_models (provider_connection_id, model_id, source)
          VALUES (${localId}, 'manual-model', 'manual')
        `;
        await expect(client`
          INSERT INTO provider_models (provider_connection_id, model_id, source)
          VALUES (${localId}, 'manual-model', 'manual')
        `).rejects.toThrow();
        await expect(client`
          INSERT INTO provider_models (
            provider_connection_id, model_id, source, image_token_estimate
          ) VALUES (${localId}, 'small-estimate', 'manual', 1023)
        `).rejects.toThrow();
        await expect(client`
        INSERT INTO provider_connections (
          template_id, name, base_url, kind, protocol, auth_mode,
          destination_kind, approved_local_ip, approved_local_port
        ) VALUES (
          'custom-openai', 'Wrong port fixture', 'http://127.0.0.1:9999',
          'custom', 'openai-chat-completions', 'none', 'local',
          '127.0.0.1', 11434
        )
      `).rejects.toThrow();

        const userId = randomUUID();
        const conversationId = randomUUID();
        const branchId = randomUUID();
        const userMessageId = randomUUID();
        const assistantMessageId = randomUUID();
        const nextAssistantMessageId = randomUUID();
        const concurrentAssistantA = randomUUID();
        const concurrentAssistantB = randomUUID();
        await client`
        INSERT INTO users (id, username, username_normalized, password_hash)
        VALUES (${userId}, 'n04fixture', 'n04fixture', '$argon2id$fixture')
      `;
        await client.begin(async (transaction) => {
          await transaction`
          INSERT INTO conversations (id, user_id, active_branch_id)
          VALUES (${conversationId}, ${userId}, ${branchId})
        `;
          await transaction`
          INSERT INTO conversation_branches (id, conversation_id)
          VALUES (${branchId}, ${conversationId})
        `;
        });
        await client`
        INSERT INTO messages (
          id, conversation_id, branch_id, sequence_number,
          role, status, content, completed_at
        ) VALUES (
          ${userMessageId}, ${conversationId}, ${branchId}, 1,
          'user', 'completed', 'request', now()
        ), (
          ${assistantMessageId}, ${conversationId}, ${branchId}, 2,
          'assistant', 'pending', '' , NULL
        ), (
          ${nextAssistantMessageId}, ${conversationId}, ${branchId}, 3,
          'assistant', 'pending', '', NULL
        ), (
          ${concurrentAssistantA}, ${conversationId}, ${branchId}, 4,
          'assistant', 'pending', '', NULL
        ), (
          ${concurrentAssistantB}, ${conversationId}, ${branchId}, 5,
          'assistant', 'pending', '', NULL
        )
      `;
        const jobId = randomUUID();
        const key = randomUUID();
        await client`
        INSERT INTO chat_jobs (
          id, conversation_id, user_id, started_session_id, kind,
          idempotency_key, request_fingerprint, settings_revision,
          maximum_generated_text_bytes, branch_id, user_message_id,
          assistant_message_id
        ) VALUES (
          ${jobId}, ${conversationId}, ${userId}, ${randomUUID()}, 'turn',
          ${key}, decode(repeat('aa', 32), 'hex'), 1, 2097152,
          ${branchId}, ${userMessageId}, ${assistantMessageId}
        )
      `;
        await expect(client`
        INSERT INTO chat_jobs (
          conversation_id, user_id, started_session_id, kind,
          idempotency_key, request_fingerprint, settings_revision,
          maximum_generated_text_bytes, branch_id, user_message_id,
          assistant_message_id
        ) VALUES (
          ${conversationId}, ${userId}, ${randomUUID()}, 'turn',
          ${randomUUID()}, decode(repeat('aa', 32), 'hex'), 1, 2097152,
          ${branchId}, ${userMessageId}, ${nextAssistantMessageId}
        )
      `).rejects.toThrow();
        await client`
        INSERT INTO chat_quota_reservations (job_id, usage_date, counter_keys)
        VALUES (${jobId}, current_date, ARRAY['user', 'model'])
      `;
        await client`
          UPDATE messages SET content = repeat('a', 8388608)
          WHERE id = ${assistantMessageId}
        `;
        await expect(client`
          UPDATE messages SET content = repeat('a', 8388609)
          WHERE id = ${assistantMessageId}
        `).rejects.toThrow();
        await client`UPDATE messages SET content = '' WHERE id = ${assistantMessageId}`;
        await expect(client`
          UPDATE chat_jobs SET checkpoint_content = repeat('a', 8388609)
          WHERE id = ${jobId}
        `).rejects.toThrow();
        const released = await client`
          UPDATE chat_quota_reservations SET state = 'released', released_at = now()
          WHERE job_id = ${jobId} AND state = 'reserved' RETURNING job_id
        `;
        const duplicateRelease = await client`
          UPDATE chat_quota_reservations SET state = 'released', released_at = now()
          WHERE job_id = ${jobId} AND state = 'reserved' RETURNING job_id
        `;
        expect(released).toHaveLength(1);
        expect(duplicateRelease).toHaveLength(0);
        const won = await client`
        UPDATE chat_jobs SET status = 'completed', finished_at = now(), revision = revision + 1
        WHERE id = ${jobId} AND status IN ('pending', 'streaming') RETURNING id
      `;
        const lost = await client`
        UPDATE chat_jobs SET status = 'failed', finished_at = now(), revision = revision + 1
        WHERE id = ${jobId} AND status IN ('pending', 'streaming') RETURNING id
      `;
        expect(won).toHaveLength(1);
        expect(lost).toHaveLength(0);
        await client`
          UPDATE conversations SET title = 'Manual title', title_source = 'manual',
            title_status = 'none', settings_revision = settings_revision + 1
          WHERE id = ${conversationId}
        `;
        const lateTitle = await client`
          UPDATE conversations SET title = 'Late automatic title', title_source = 'auto'
          WHERE id = ${conversationId} AND title_source = 'default' RETURNING id
        `;
        expect(lateTitle).toHaveLength(0);
        await concurrentClient.unsafe(`SET search_path TO "${schema}", public`);
        const concurrentKey = randomUUID();
        const concurrent = await Promise.allSettled([
          client`
            INSERT INTO chat_jobs (
              conversation_id, user_id, started_session_id, kind,
              idempotency_key, request_fingerprint, settings_revision,
              maximum_generated_text_bytes, branch_id, assistant_message_id,
              status, finished_at
            ) VALUES (
              ${conversationId}, ${userId}, ${randomUUID()}, 'regenerate',
              ${concurrentKey}, decode(repeat('aa', 32), 'hex'), 2, 2097152,
              ${branchId}, ${concurrentAssistantA}, 'completed', now()
            )
          `,
          concurrentClient`
            INSERT INTO chat_jobs (
              conversation_id, user_id, started_session_id, kind,
              idempotency_key, request_fingerprint, settings_revision,
              maximum_generated_text_bytes, branch_id, assistant_message_id,
              status, finished_at
            ) VALUES (
              ${conversationId}, ${userId}, ${randomUUID()}, 'regenerate',
              ${concurrentKey}, decode(repeat('aa', 32), 'hex'), 2, 2097152,
              ${branchId}, ${concurrentAssistantB}, 'completed', now()
            )
          `,
        ]);
        expect(concurrent.map((result) => result.status).sort()).toEqual([
          'fulfilled',
          'rejected',
        ]);
        await expect(client`
          INSERT INTO chat_jobs (
            conversation_id, user_id, started_session_id, kind,
            idempotency_key, request_fingerprint, settings_revision,
            maximum_generated_text_bytes, branch_id, assistant_message_id
          ) VALUES (
            ${conversationId}, ${userId}, ${randomUUID()}, 'regenerate',
            ${randomUUID()}, decode(repeat('aa', 32), 'hex'), 2, 2097152,
            ${randomUUID()}, ${nextAssistantMessageId}
          )
        `).rejects.toThrow();
        await expect(client`
          INSERT INTO chat_jobs (
            conversation_id, user_id, started_session_id, kind,
            idempotency_key, request_fingerprint, settings_revision,
            maximum_generated_text_bytes, branch_id, assistant_message_id
          ) VALUES (
            ${conversationId}, ${userId}, ${randomUUID()}, 'regenerate',
            ${key}, decode(repeat('aa', 32), 'hex'), 1, 2097152,
            ${branchId}, ${nextAssistantMessageId}
          )
        `).rejects.toThrow();
        const nextJobId = randomUUID();
        await client`
          INSERT INTO chat_jobs (
            id, conversation_id, user_id, started_session_id, kind,
            idempotency_key, request_fingerprint, settings_revision,
            maximum_generated_text_bytes, branch_id, assistant_message_id
          ) VALUES (
            ${nextJobId}, ${conversationId}, ${userId}, ${randomUUID()}, 'regenerate',
            ${randomUUID()}, decode(repeat('aa', 32), 'hex'), 1, 2097152,
            ${branchId}, ${nextAssistantMessageId}
          )
        `;
        await expect(client`
          INSERT INTO chat_quota_reservations (job_id, usage_date, counter_keys)
          VALUES (${nextJobId}, current_date, ARRAY['same', 'same'])
        `).rejects.toThrow();
        await client`DELETE FROM conversations WHERE id = ${conversationId}`;
        const remaining =
          await client`SELECT id FROM chat_jobs WHERE id = ${jobId}`;
        expect(remaining).toHaveLength(0);
      } finally {
        await concurrentClient.end({ timeout: 5 });
        await client.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await client.end({ timeout: 5 });
      }
    },
    120_000,
  );
});
