import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { LoadedConfig } from '@modelnaru/config';
import {
  createDatabaseClient,
  loadMigrationPlan,
  type DatabaseClient,
} from '@modelnaru/database';
import { describe, expect, it } from 'vitest';

import { encryptProviderSecret } from '../src/provider-credentials.js';
import {
  ProviderDiagnosticStaleError,
  ProviderInUseError,
  ProvidersRepository,
} from '../src/providers.repository.js';
import type { DatabaseService } from '../src/database.service.js';

const databaseUrl = process.env.MODELNARU_TEST_DATABASE_URL;
const runWithDatabase = databaseUrl ? it : it.skip;
const audit = { actorId: 'admin:fixture', ipHash: null };

describe('N07 custom Provider isolated PostgreSQL', () => {
  runWithDatabase(
    'persists custom/none, manual models, sync and diagnostic reset',
    async () => {
      const url = new URL(databaseUrl!);
      if (
        !['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ||
        !url.pathname.endsWith('_test')
      )
        throw new Error(
          'MODELNARU_TEST_DATABASE_URL must target loopback *_test database',
        );
      const folder = await mkdtemp(join(tmpdir(), 'modelnaru-n07-'));
      const schema = `n07_${randomUUID().replaceAll('-', '')}`;
      const file = join(folder, 'database-url');
      let bootstrap: DatabaseClient | undefined;
      let sql: DatabaseClient | undefined;
      try {
        await writeFile(file, databaseUrl!, { mode: 0o600 });
        bootstrap = await createDatabaseClient({
          paths: { databaseUrlFile: file },
        } as LoadedConfig);
        await bootstrap.unsafe(`CREATE SCHEMA "${schema}"`);
        url.searchParams.set('options', `-csearch_path=${schema},public`);
        await writeFile(file, url.toString(), { mode: 0o600 });
        sql = await createDatabaseClient({
          paths: { databaseUrlFile: file },
        } as LoadedConfig);
        for (const migration of await loadMigrationPlan(
          resolve(process.cwd(), '../../packages/database/migrations'),
        ))
          await sql.begin(async (tx) => {
            await tx.unsafe(migration.sql);
          });
        const repository = new ProvidersRepository({
          getClient: () => sql!,
        } as DatabaseService);
        const destination = {
          baseUrl: 'http://192.168.1.10:11434/v1',
          destinationKind: 'local' as const,
          approvedLocalIp: '192.168.1.10',
          approvedLocalPort: 11434,
        };
        const created = await repository.createCustom(
          {
            name: 'N07 local fixture',
            destination,
            authMode: 'none',
            credential: null,
            credentialHint: null,
          },
          audit,
        );
        expect(created).toMatchObject({ kind: 'custom', authMode: 'none' });
        const stored = await repository.findCustom(created.id);
        expect(stored).toMatchObject({ destination, credential: null });
        const manual = await repository.addManualModel(
          created.id,
          {
            modelId: 'manual-1',
            displayName: null,
            contextWindow: null,
            maxOutputTokens: null,
          },
          audit,
        );
        expect(manual).toMatchObject({
          source: 'manual',
          isEnabled: false,
          supportsImageInput: false,
          supportsWebSearch: false,
        });
        await expect(
          repository.addManualModel(
            created.id,
            {
              modelId: 'manual-1',
              displayName: null,
              contextWindow: null,
              maxOutputTokens: null,
            },
            audit,
          ),
        ).rejects.toMatchObject({ code: '23505' });
        await repository.syncModels(
          created.id,
          [
            {
              id: 'discovered-1',
              displayName: null,
              contextWindow: null,
              maxOutputTokens: null,
              metadata: {},
            },
          ],
          audit,
        );
        const afterSync = await repository.syncModels(
          created.id,
          [
            {
              id: 'manual-1',
              displayName: null,
              contextWindow: null,
              maxOutputTokens: null,
              metadata: {},
            },
          ],
          audit,
        );
        expect(
          afterSync.models.find((model) => model.id === manual.id),
        ).toMatchObject({
          source: 'manual',
          isAvailable: true,
        });
        expect(
          afterSync.models.find((model) => model.modelId === 'discovered-1')
            ?.isAvailable,
        ).toBe(false);
        const updatedModel = await repository.updateModel(
          manual.id,
          {
            isEnabled: true,
            supportsImageInput: true,
            imageTokenEstimate: 1024,
          },
          audit,
        );
        expect(updatedModel).toMatchObject({
          imageTokenEstimate: 1024,
          supportsImageInput: true,
        });
        const version = (await repository.findCustom(created.id))!.version;
        await repository.recordDiagnostic(
          created.id,
          version,
          'models',
          'failed',
          'PROVIDER_RESPONSE_INVALID',
          audit,
        );
        await expect(
          repository.recordDiagnostic(
            created.id,
            version,
            'chat',
            'chat_verified',
            null,
            audit,
          ),
        ).rejects.toBeInstanceOf(ProviderDiagnosticStaleError);
        const before = (await repository.list()).find(
          (item) => item.id === created.id,
        );
        expect(before?.diagnostics?.models.errorCode).toBe(
          'PROVIDER_RESPONSE_INVALID',
        );
        const key = encryptProviderSecret(randomBytes(32), 'fixture-api-key');
        const userId = randomUUID();
        const conversationId = randomUUID();
        const branchId = randomUUID();
        const userMessageId = randomUUID();
        const assistantMessageId = randomUUID();
        const jobId = randomUUID();
        await sql`INSERT INTO users (id, username, username_normalized, password_hash)
        VALUES (${userId}, 'n07fixture', 'n07fixture', '$argon2id$fixture')`;
        await sql.begin(async (tx) => {
          await tx`INSERT INTO conversations (id, user_id, active_branch_id)
          VALUES (${conversationId}, ${userId}, ${branchId})`;
          await tx`INSERT INTO conversation_branches (id, conversation_id)
          VALUES (${branchId}, ${conversationId})`;
        });
        await sql`INSERT INTO messages (id, conversation_id, branch_id, sequence_number,
        role, status, content, completed_at)
        VALUES (${userMessageId}, ${conversationId}, ${branchId}, 1,
          'user', 'completed', 'question', now())`;
        await sql`INSERT INTO messages (id, conversation_id, branch_id, sequence_number,
        role, status, content, provider_model_id)
        VALUES (${assistantMessageId}, ${conversationId}, ${branchId}, 2,
          'assistant', 'pending', '', ${manual.id})`;
        await sql`INSERT INTO chat_jobs (id, conversation_id, user_id,
        started_session_id, kind, idempotency_key, request_fingerprint,
        settings_revision, maximum_generated_text_bytes, branch_id,
        user_message_id, assistant_message_id, provider_model_id)
        VALUES (${jobId}, ${conversationId}, ${userId}, ${randomUUID()},
          'turn', ${randomUUID()}, ${randomBytes(32)}, 1, 2097152,
          ${branchId}, ${userMessageId}, ${assistantMessageId}, ${manual.id})`;
        await expect(
          repository.updateCustom(
            created.id,
            {
              destination,
              authMode: 'bearer',
              credential: key,
              credentialHint: '-key',
              connectionChanged: true,
            },
            audit,
          ),
        ).rejects.toBeInstanceOf(ProviderInUseError);
        await sql`UPDATE chat_jobs SET status = 'failed', finished_at = now()
        WHERE id = ${jobId}`;
        const changed = await repository.updateCustom(
          created.id,
          {
            destination,
            authMode: 'bearer',
            credential: key,
            credentialHint: '-key',
            connectionChanged: true,
          },
          audit,
        );
        expect(changed.authMode).toBe('bearer');
        const after = (await repository.list()).find(
          (item) => item.id === created.id,
        );
        expect(after?.diagnostics?.models.errorCode).toBeNull();
        expect(
          (await repository.findCustom(created.id))?.credential?.ciphertext,
        ).toBeTruthy();
      } finally {
        if (sql) await sql.end({ timeout: 5 });
        if (bootstrap) {
          await bootstrap.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
          await bootstrap.end({ timeout: 5 });
        }
        await rm(folder, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
