import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { LoadedConfig } from '@modelnaru/config';
import {
  createDatabaseClient,
  loadMigrationPlan,
  type DatabaseClient,
} from '@modelnaru/database';
import { describe, expect, it } from 'vitest';
import type { DatabaseService } from '../src/database.service.js';
import {
  ChatsRepository,
  ConversationSettingsConflictError,
  ConversationBusyError,
} from '../src/chats.repository.js';
import { AccessRepository } from '../src/access.repository.js';
import {
  AttachmentsRepository,
  AttachmentBusyError,
} from '../src/attachments.repository.js';
import { AttachmentLifecycleRepository } from '../src/attachment-lifecycle.repository.js';
import { ChatMessagesRepository } from '../src/chat-messages.repository.js';
import { ChatJobsRepository } from '../src/chat-jobs.repository.js';

const databaseUrl = process.env.MODELNARU_TEST_DATABASE_URL;
describe('N09 isolated PostgreSQL navigation/settings/attachment races', () => {
  (databaseUrl ? it : it.skip)(
    'isolates owners, keeps keyset order and serializes settings and file lifecycle',
    async () => {
      const url = new URL(databaseUrl!);
      if (
        !['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ||
        !url.pathname.endsWith('_test')
      )
        throw new Error('Only loopback *_test DB is allowed');
      const folder = await mkdtemp(join(tmpdir(), 'modelnaru-n09-'));
      const schema = `n09_${randomUUID().replaceAll('-', '')}`;
      const file = join(folder, 'database-url');
      let bootstrap: DatabaseClient | undefined,
        sql: DatabaseClient | undefined;
      try {
        await writeFile(file, databaseUrl!, { mode: 0o600 });
        const loaded = { paths: { databaseUrlFile: file } } as LoadedConfig;
        bootstrap = await createDatabaseClient(loaded);
        await bootstrap.unsafe(`CREATE SCHEMA "${schema}"`);
        url.searchParams.set('options', `-csearch_path=${schema},public`);
        await writeFile(file, url.toString(), { mode: 0o600 });
        sql = await createDatabaseClient(loaded);
        for (const migration of await loadMigrationPlan(
          resolve(process.cwd(), '../../packages/database/migrations'),
        ))
          await sql.begin((tx) => tx.unsafe(migration.sql));
        const database = {
          getClient: () => sql!,
          ready: () => Promise.resolve(),
        } as DatabaseService;
        const chats = new ChatsRepository(database),
          access = new AccessRepository(database),
          files = new AttachmentsRepository(database),
          lifecycle = new AttachmentLifecycleRepository(database);
        const user = randomUUID(),
          other = randomUUID(),
          guest = randomUUID(),
          connection = randomUUID(),
          model = randomUUID(),
          restricted = randomUUID();
        await sql`INSERT INTO users(id,username,username_normalized,password_hash) VALUES (${user},'n09','n09','$argon2id$fixture'),(${other},'other','other','$argon2id$fixture')`;
        await sql`INSERT INTO guest_principals(id,credential_fingerprint,idle_expires_at,absolute_expires_at) VALUES (${guest},decode(repeat('aa',32),'hex'),now()+interval '1 hour',now()+interval '1 day')`;
        await sql`UPDATE guest_settings SET is_enabled=true,access_code_hash='$argon2id$fixture' WHERE singleton`;
        await sql`INSERT INTO provider_connections(id,template_id,name,base_url,credential_ciphertext,credential_nonce,credential_auth_tag) VALUES
        (${connection},'openai','N09 fixture','https://api.openai.com/v1',decode('aa','hex'),decode(repeat('00',12),'hex'),decode(repeat('00',16),'hex'))`;
        await sql`INSERT INTO provider_models(id,provider_connection_id,model_id,is_enabled) VALUES (${model},${connection},'gpt-fixture',true),(${restricted},${connection},'o3',true)`;
        await sql`INSERT INTO user_model_permissions(user_id,provider_model_id) VALUES (${user},${model}),(${user},${restricted})`;
        await sql`INSERT INTO guest_model_permissions(provider_model_id) VALUES (${model})`;
        const principal = {
          type: 'user' as const,
          id: user,
          username: 'n09',
          displayName: null,
        };
        const otherPrincipal = { ...principal, id: other };
        const guestPrincipal = {
          type: 'guest' as const,
          id: guest,
          displayName: null,
        };
        const create = (
          title: string,
          owner: typeof principal | typeof guestPrincipal = principal,
        ) =>
          chats.create(owner, {
            title,
            titleSource: 'manual',
            systemPrompt: '',
            contextTokenLimit: 100_000,
            historyMessageLimit: 0,
            requestTraceLimit: 0,
            responseTimeoutSeconds: 120,
            defaultProviderModelId: model,
            generationParameters: {},
            webSearchEnabled: false,
          });
        const a = await create('match %'),
          b = await create('match b'),
          c = await create('match c');
        await chats.create(otherPrincipal, {
          title: 'Other',
          systemPrompt: '',
          contextTokenLimit: 100_000,
          historyMessageLimit: 0,
          requestTraceLimit: 0,
          responseTimeoutSeconds: 120,
          defaultProviderModelId: null,
          generationParameters: {},
          webSearchEnabled: false,
        });
        const guestChat = await create('match guest', guestPrincipal);
        await chats.update(principal, a.id, {
          settingsRevision: '1',
          isPinned: true,
        });
        await sql`UPDATE conversations SET updated_at=now() WHERE id=ANY(${[b.id, c.id]}::uuid[])`;
        const first = await chats.listPage(principal, {
          query: 'match',
          limit: 1,
        });
        expect(first.conversations.map((x) => x.id)).toEqual([a.id]);
        const second = await chats.listPage(principal, {
          query: 'match',
          limit: 1,
          cursor: first.nextCursor!,
        });
        const third = await chats.listPage(principal, {
          query: 'match',
          limit: 1,
          cursor: second.nextCursor!,
        });
        expect(
          new Set(
            [
              ...first.conversations,
              ...second.conversations,
              ...third.conversations,
            ].map((x) => x.id),
          ).size,
        ).toBe(3);
        expect(third.nextCursor).toBeNull();
        expect(
          (
            await chats.listPage(principal, { query: '%', limit: 50 })
          ).conversations.map((x) => x.id),
        ).toEqual([a.id]);
        await expect(
          chats.listPage(otherPrincipal, {
            query: 'match',
            limit: 1,
            cursor: first.nextCursor!,
          }),
        ).rejects.toThrow('CHAT_INPUT_INVALID');
        await expect(
          chats.listPage(principal, {
            query: 'changed',
            limit: 1,
            cursor: first.nextCursor!,
          }),
        ).rejects.toThrow();
        expect(
          (
            await chats.listPage(guestPrincipal, { limit: 50 })
          ).conversations.map((x) => x.id),
        ).toEqual([guestChat.id]);
        const races = await Promise.allSettled([
          chats.update(principal, b.id, {
            settingsRevision: '1',
            systemPrompt: 'A',
          }),
          chats.update(principal, b.id, {
            settingsRevision: '1',
            systemPrompt: 'B',
          }),
        ]);
        expect(races.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
        expect(races.find((x) => x.status === 'rejected')).toMatchObject({
          reason: expect.any(ConversationSettingsConflictError),
        });
        await expect(
          chats.update(otherPrincipal, b.id, {
            settingsRevision: '1',
            title: 'Leak',
          }),
        ).rejects.toThrow();
        const old = await chats.update(principal, c.id, {
          settingsRevision: '1',
          generationParameters: { temperature: 0.5, topP: 0.8 },
        });
        const switched = await chats.update(principal, c.id, {
          settingsRevision: old.settingsRevision,
          defaultProviderModelId: restricted,
        });
        expect(switched.removedParameters).toContain('temperature');
        expect(switched.generationParameters.temperature).toBeUndefined();
        await access.setFavorite(principal, model, true);
        await access.setFavorite(principal, model, true);
        await access.setFavorite(guestPrincipal, model, true);
        expect(await access.favorites(otherPrincipal)).toEqual([]);
        expect(await access.favorites(principal)).toEqual([
          { providerModelId: model, selectable: true },
        ]);
        await sql`UPDATE user_model_permissions SET is_allowed=false WHERE user_id=${user} AND provider_model_id=${restricted}`;
        await expect(
          chats.update(principal, c.id, {
            settingsRevision: switched.settingsRevision,
            defaultProviderModelId: restricted,
          }),
        ).rejects.toThrow();
        const att = await files.createReady(principal, {
          id: randomUUID(),
          conversationId: b.id,
          byteSize: 3,
          encoding: 'utf-8',
          extractedText: 'abc',
          fileKind: 'text',
          imageHeight: null,
          imageWidth: null,
          includeInFutureMessages: true,
          maximumPending: 10,
          mediaType: 'text/plain',
          originalName: 'notes.txt',
          ocrPageCount: 0,
          pageCount: null,
          retentionDays: 1,
          storageKey: `aa/${randomUUID()}`,
        });
        const jobs = new ChatJobsRepository(
          database,
          new ChatMessagesRepository(database),
          access,
        );
        const current = await chats.detail(principal, b.id, { limit: 1 });
        const started = await jobs.start(
          {
            principal,
            conversationId: b.id,
            kind: 'turn',
            idempotencyKey: randomUUID(),
            fingerprint: Buffer.alloc(32, 1),
            settingsRevision: current.settingsRevision,
            maximumGeneratedTextBytes: 2_097_152,
            startedSessionId: randomUUID(),
            attachmentIds: [att.id],
            content: 'question',
            providerModelId: model,
            modelId: 'gpt-fixture',
            templateId: 'openai',
            parameters: {},
          },
          () => true,
        );
        await expect(
          chats.update(principal, b.id, {
            settingsRevision: current.settingsRevision,
            systemPrompt: 'busy',
          }),
        ).rejects.toBeInstanceOf(ConversationBusyError);
        const renamed = await chats.update(principal, b.id, {
          settingsRevision: current.settingsRevision,
          title: 'Manual during generation',
        });
        expect(renamed.titleSource).toBe('manual');
        expect(renamed.activeJob).toMatchObject({
          id: started.job.id,
          status: 'pending',
          revision: String(started.job.revision),
        });
        const pinned = await chats.update(principal, b.id, {
          settingsRevision: renamed.settingsRevision,
          isPinned: true,
        });
        expect(pinned.activeJob).toEqual(renamed.activeJob);
        await expect(
          chats.update(principal, b.id, {
            settingsRevision: current.settingsRevision,
            title: 'Stale',
          }),
        ).rejects.toMatchObject({
          conversation: {
            title: renamed.title,
            isPinned: true,
            settingsRevision: pinned.settingsRevision,
            activeJob: pinned.activeJob,
          },
        });
        await sql`UPDATE attachments SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=${att.id}`;
        expect(await lifecycle.queueExpired(100)).toBe(0);
        await expect(
          files.deletePending(principal, b.id, att.id),
        ).rejects.toBeInstanceOf(AttachmentBusyError);
        await expect(
          chats.activateBranch(
            principal,
            b.id,
            current.activeBranchId,
            pinned.settingsRevision,
          ),
        ).rejects.toBeInstanceOf(ConversationBusyError);
        await jobs.terminal(started.job.id, {
          status: 'cancelled',
          content: '',
          errorCode: 'CHAT_CANCELLED',
          inputTokens: null,
          outputTokens: null,
        });
        expect(await lifecycle.queueExpired(100)).toBe(1);
        const settled = await chats.update(principal, b.id, {
          settingsRevision: pinned.settingsRevision,
          isPinned: false,
        });
        expect(settled.activeJob).toBeNull();
        await expect(
          chats.update(principal, b.id, {
            settingsRevision: pinned.settingsRevision,
            title: 'Stale after terminal',
          }),
        ).rejects.toMatchObject({
          conversation: {
            activeJob: null,
            settingsRevision: settled.settingsRevision,
          },
        });
        expect((await files.metadata(principal, b.id, att.id)).status).toBe(
          'expired',
        );
        await sql`UPDATE user_model_permissions SET is_allowed=false WHERE user_id=${user} AND provider_model_id=${model}`;
        expect(await access.favorites(principal)).toEqual([
          { providerModelId: model, selectable: false },
        ]);
        await expect(
          access.setFavorite(principal, model, true),
        ).rejects.toThrow();
        await access.setFavorite(principal, model, false);
        expect(await access.favorites(principal)).toEqual([]);
        expect(await access.favorites(guestPrincipal)).toHaveLength(1);
        const failed = await files.createReady(principal, {
          id: randomUUID(),
          conversationId: b.id,
          byteSize: 3,
          encoding: null,
          extractedText: null,
          fileKind: 'text',
          imageHeight: null,
          imageWidth: null,
          includeInFutureMessages: false,
          maximumPending: 10,
          mediaType: 'text/plain',
          originalName: 'failed.txt',
          ocrPageCount: 0,
          pageCount: null,
          retentionDays: 1,
          storageKey: `aa/${randomUUID()}`,
          status: 'processing',
        });
        await files.finishProcessing(failed.id, { status: 'failed' });
        const retries = await Promise.allSettled([
          files.claimRetry(principal, b.id, failed.id),
          files.claimRetry(principal, b.id, failed.id),
        ]);
        expect(retries.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
        expect(retries.find((x) => x.status === 'rejected')).toMatchObject({
          reason: expect.any(AttachmentBusyError),
        });
        expect(
          (await files.listPending(principal, b.id)).some(
            (x) => x.id === failed.id && x.status === 'processing',
          ),
        ).toBe(true);
        await files.recoverProcessing();
        expect((await files.metadata(principal, b.id, failed.id)).status).toBe(
          'failed',
        );
        await files.claimRetry(principal, b.id, failed.id);
        await expect(
          files.metadata(otherPrincipal, b.id, failed.id),
        ).rejects.toThrow();
        await files.deletePending(principal, b.id, failed.id);
        await expect(
          files.finishProcessing(failed.id, {
            status: 'ready',
            extractedText: 'late',
          }),
        ).rejects.toThrow();
        await sql`DELETE FROM guest_principals WHERE id=${guest}`;
        expect(
          await sql`SELECT provider_model_id FROM model_favorites WHERE guest_id=${guest}`,
        ).toHaveLength(0);
      } finally {
        if (sql) await sql.end({ timeout: 5 });
        if (bootstrap) {
          await bootstrap.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
          await bootstrap.end({ timeout: 5 });
        }
        await rm(folder, { recursive: true, force: true });
      }
    },
    90_000,
  );
});
