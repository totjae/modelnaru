import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { LoadedConfig } from '@modelnaru/config';
import {
  createDatabaseClient,
  loadMigrationPlan,
  type DatabaseClient,
} from '@modelnaru/database';
import { describe, expect, it, vi } from 'vitest';

import {
  AccessDailyLimitError,
  AccessRepository,
} from '../src/access.repository.js';
import { ChatJobsRepository } from '../src/chat-jobs.repository.js';
import { ChatJobsService } from '../src/chat-jobs.service.js';
import { ChatMessagesRepository } from '../src/chat-messages.repository.js';
import { ChatSettingsConflictError } from '../src/chat-messages.repository.js';
import { ChatsRepository } from '../src/chats.repository.js';
import { providerTemplateById } from '../src/provider-catalog.js';
import type { AccessService } from '../src/access.service.js';
import type { AttachmentsService } from '../src/attachments.service.js';
import type { ChatProviderService } from '../src/chat-provider.service.js';
import type { SummarizationService } from '../src/summarization.service.js';
import type { RequestTraceService } from '../src/request-trace.service.js';
import type { DatabaseService } from '../src/database.service.js';

const databaseUrl = process.env.MODELNARU_TEST_DATABASE_URL;
const runWithDatabase = databaseUrl ? it : it.skip;

describe('N06 isolated PostgreSQL job races', () => {
  runWithDatabase(
    'serializes same-key start, terminal race, quota and restart recovery',
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
      const folder = await mkdtemp(join(tmpdir(), 'modelnaru-n06-'));
      const schema = `n06_${randomUUID().replaceAll('-', '')}`;
      const file = join(folder, 'database-url');
      await writeFile(file, databaseUrl!, { mode: 0o600 });
      const config = { paths: { databaseUrlFile: file } } as LoadedConfig;
      let bootstrap: DatabaseClient | undefined;
      let sql: DatabaseClient | undefined;
      try {
        bootstrap = await createDatabaseClient(config);
        await bootstrap.unsafe(`CREATE SCHEMA "${schema}"`);
        url.searchParams.set('options', `-csearch_path=${schema},public`);
        await writeFile(file, url.toString(), { mode: 0o600 });
        sql = await createDatabaseClient(config);
        const migrations = await loadMigrationPlan(
          resolve(process.cwd(), '../../packages/database/migrations'),
        );
        for (const migration of migrations)
          await sql.begin(async (tx) => {
            await tx.unsafe(migration.sql);
          });
        const userId = randomUUID();
        const sessionId = randomUUID();
        const conversationId = randomUUID();
        const branchId = randomUUID();
        const connectionId = randomUUID();
        const modelId = randomUUID();
        await sql`INSERT INTO users (id, username, username_normalized, password_hash)
        VALUES (${userId}, 'n06fixture', 'n06fixture', '$argon2id$fixture')`;
        await sql`INSERT INTO sessions (id, principal_type, user_id, account_key, token_hash,
        csrf_token_hash, credential_fingerprint, idle_expires_at, absolute_expires_at)
        VALUES (${sessionId}, 'user', ${userId}, ${`user:${userId}`},
          decode(repeat('aa', 32), 'hex'), decode(repeat('bb', 32), 'hex'),
          decode(repeat('cc', 32), 'hex'), now() + interval '1 hour', now() + interval '1 day')`;
        await sql`INSERT INTO provider_connections (id, template_id, name, base_url,
        credential_ciphertext, credential_nonce, credential_auth_tag)
        VALUES (${connectionId}, 'openai', 'N06 fixture', 'https://api.example.test',
          decode('aa', 'hex'), decode(repeat('00', 12), 'hex'), decode(repeat('00', 16), 'hex'))`;
        await sql`INSERT INTO provider_models (id, provider_connection_id, model_id, is_enabled)
        VALUES (${modelId}, ${connectionId}, 'fixture', true)`;
        await sql`INSERT INTO user_model_permissions (user_id, provider_model_id) VALUES (${userId}, ${modelId})`;
        await sql.begin(async (tx) => {
          await tx`INSERT INTO conversations (id, user_id, active_branch_id, request_trace_limit) VALUES (${conversationId}, ${userId}, ${branchId}, 0)`;
          await tx`INSERT INTO conversation_branches (id, conversation_id) VALUES (${branchId}, ${conversationId})`;
        });
        const database = { getClient: () => sql! } as DatabaseService;
        const repository = new ChatJobsRepository(
          database,
          new ChatMessagesRepository(database),
          new AccessRepository(database),
        );
        const key = randomUUID();
        const input = {
          principal: {
            type: 'user' as const,
            id: userId,
            username: 'n06fixture',
            displayName: null,
          },
          conversationId,
          kind: 'turn' as const,
          idempotencyKey: key,
          fingerprint: Buffer.alloc(32, 7),
          settingsRevision: '1',
          maximumGeneratedTextBytes: 2_097_152,
          startedSessionId: sessionId,
          attachmentIds: [],
          content: 'hello',
          providerModelId: modelId,
          modelId: 'fixture',
          templateId: 'openai',
          parameters: {},
        };
        let admitted = 0;
        const [first, replay] = await Promise.all([
          repository.start(input, () => {
            admitted++;
            return true;
          }),
          repository.start(input, () => {
            admitted++;
            return true;
          }),
        ]);
        expect(first.job.id).toBe(replay.job.id);
        const otherUserId = randomUUID();
        await sql`INSERT INTO users (id, username, username_normalized, password_hash)
        VALUES (${otherUserId}, 'n06other', 'n06other', '$argon2id$fixture')`;
        await expect(
          repository.get(
            {
              type: 'user',
              id: otherUserId,
              username: 'n06other',
              displayName: null,
            },
            conversationId,
            first.job.id,
          ),
        ).rejects.toThrow();
        await expect(
          repository.start(
            { ...input, fingerprint: Buffer.alloc(32, 8) },
            () => true,
          ),
        ).rejects.toMatchObject({ code: 'CHAT_IDEMPOTENCY_CONFLICT' });
        expect([first.turn, replay.turn].filter(Boolean)).toHaveLength(1);
        expect(admitted).toBe(1);
        const before =
          await sql`SELECT count(*)::int AS count FROM messages WHERE conversation_id = ${conversationId}`;
        expect(before[0]?.count).toBe(2);
        const counters =
          await sql`SELECT request_count FROM daily_usage_counters WHERE subject_id = ${userId}`;
        expect(counters).toHaveLength(2);
        expect(counters.every((row) => row.request_count === 1)).toBe(true);
        await expect(
          repository.start(
            { ...input, idempotencyKey: randomUUID() },
            () => true,
          ),
        ).rejects.toMatchObject({ code: 'CHAT_CONVERSATION_BUSY' });
        const streaming = await repository.markStreaming(first.job.id);
        expect(streaming?.revision).toBe('2');
        const checkpoint = await repository.checkpoint(first.job.id, 'partial');
        expect(checkpoint?.revision).toBe('3');
        await repository.markSent(first.job.id);
        const [complete, cancel] = await Promise.all([
          repository.terminal(first.job.id, {
            status: 'completed',
            content: 'partial final',
            errorCode: null,
            inputTokens: 3,
            outputTokens: 4,
          }),
          repository.terminal(first.job.id, {
            status: 'cancelled',
            content: 'partial',
            errorCode: 'CHAT_CANCELLED',
            inputTokens: null,
            outputTokens: null,
          }),
        ]);
        expect([complete, cancel].filter(Boolean)).toHaveLength(1);
        const terminal = await repository.get(
          input.principal,
          conversationId,
          first.job.id,
        );
        const related =
          await sql`SELECT m.status, m.content, u.status AS usage_status, u.input_tokens,
        r.state AS quota_state FROM messages m JOIN usage_events u ON u.assistant_message_id = m.id
        JOIN chat_quota_reservations r ON r.job_id = u.job_id WHERE m.id = ${terminal.assistantMessageId}`;
        expect(related[0]).toMatchObject({
          status: terminal.status,
          content: terminal.content,
          usage_status: terminal.status,
          quota_state: 'charged',
        });
        const stableCount =
          await sql`SELECT count(*)::int AS count FROM messages WHERE conversation_id = ${conversationId}`;
        await expect(
          repository.start(
            { ...input, idempotencyKey: randomUUID() },
            () => false,
          ),
        ).rejects.toMatchObject({ code: 'CHAT_SERVER_BUSY' });
        await expect(
          repository.start(
            { ...input, idempotencyKey: randomUUID(), settingsRevision: '999' },
            () => true,
          ),
        ).rejects.toBeInstanceOf(ChatSettingsConflictError);
        await sql`UPDATE users SET daily_request_limit = 1 WHERE id = ${userId}`;
        const quotaError = await repository
          .start({ ...input, idempotencyKey: randomUUID() }, () => true)
          .catch((error: unknown) => error);
        expect(quotaError).toBeInstanceOf(AccessDailyLimitError);
        expect(
          (quotaError as AccessDailyLimitError).resetAt?.getTime(),
        ).toBeGreaterThan(Date.now());
        await sql`UPDATE users SET daily_request_limit = NULL WHERE id = ${userId}`;
        const unchangedCount =
          await sql`SELECT count(*)::int AS count FROM messages WHERE conversation_id = ${conversationId}`;
        expect(unchangedCount[0]?.count).toBe(stableCount[0]?.count);
        const second = await repository.start(
          { ...input, idempotencyKey: randomUUID() },
          () => true,
        );
        expect(second.job.status).toBe('pending');
        expect(await repository.recover()).toBe(1);
        const recovered = await repository.get(
          input.principal,
          conversationId,
          second.job.id,
        );
        expect(recovered).toMatchObject({
          status: 'failed',
          errorCode: 'CHAT_SERVER_RESTARTED',
        });
        const quota =
          await sql`SELECT state FROM chat_quota_reservations WHERE job_id = ${second.job.id}`;
        expect(quota[0]?.state).toBe('released');
        const after =
          await sql`SELECT request_count FROM daily_usage_counters WHERE subject_id = ${userId}`;
        expect(after.every((row) => row.request_count === 1)).toBe(true);

        const template = providerTemplateById('openai');
        if (!template) throw new Error('OpenAI fixture template missing');
        const service = new ChatJobsService(
          {
            config: {
              limits: {
                maximumGlobalAiGenerations: 3,
                maximumGeneratedTextBytes: 2_097_152,
                maximumSsePendingBytes: 65_536,
                maximumSseSubscribersPerJob: 5,
                maximumGlobalSseSubscribers: 20,
              },
            },
          } as LoadedConfig,
          repository,
          {
            assertModelAllowed: () => Promise.resolve(),
          } as unknown as AccessService,
          {
            resolve: () =>
              Promise.resolve({
                apiKey: 'fixture',
                baseUrl: 'https://api.openai.com/v1',
                contextWindow: null,
                maxOutputTokens: null,
                modelId: 'fixture',
                providerModelId: modelId,
                supportsImageInput: false,
                supportsWebSearch: false,
                template,
              }),
          } as unknown as ChatProviderService,
          {
            readImages: () => Promise.resolve([]),
          } as unknown as AttachmentsService,
          {
            fitContext: (value: { context: unknown }) =>
              Promise.resolve(value.context),
          } as unknown as SummarizationService,
          {
            appendRaw: () => undefined,
            complete: () => undefined,
            fail: () => undefined,
          } as unknown as RequestTraceService,
          database,
        );
        const secondSessionId = randomUUID();
        await sql`INSERT INTO sessions (id, principal_type, user_id, account_key, token_hash,
        csrf_token_hash, credential_fingerprint, idle_expires_at, absolute_expires_at)
        VALUES (${secondSessionId}, 'user', ${userId}, ${`user:${userId}`},
          decode(repeat('dd', 32), 'hex'), decode(repeat('ee', 32), 'hex'),
          decode(repeat('ff', 32), 'hex'), now() + interval '1 hour', now() + interval '1 day')`;
        let releaseProvider: ((value: Response) => void) | undefined;
        const called = vi.fn(
          () =>
            new Promise<Response>((resolve) => {
              releaseProvider = resolve;
            }),
        );
        vi.stubGlobal('fetch', called);
        const serviceKey = randomUUID();
        const running = await service.start({
          principal: input.principal,
          conversationId,
          kind: 'turn',
          idempotencyKey: serviceKey,
          settingsRevision: '1',
          sessionId,
          absoluteExpiresAt: new Date(Date.now() + 86_400_000),
          content: 'next question',
          attachmentIds: [],
          providerModelId: modelId,
          parameters: {},
        });
        expect(running.reused).toBe(false);
        const replayed = await service.start({
          principal: input.principal,
          conversationId,
          kind: 'turn',
          idempotencyKey: serviceKey,
          settingsRevision: '1',
          sessionId,
          absoluteExpiresAt: new Date(Date.now() + 86_400_000),
          content: 'next question',
          attachmentIds: [],
          providerModelId: modelId,
          parameters: {},
        });
        expect(replayed).toMatchObject({
          reused: true,
          job: { id: running.job.id },
        });
        await expect(
          service.start({
            principal: input.principal,
            conversationId,
            kind: 'turn',
            idempotencyKey: randomUUID(),
            settingsRevision: '1',
            sessionId,
            absoluteExpiresAt: new Date(Date.now() + 86_400_000),
            content: 'next question',
            attachmentIds: [],
            providerModelId: modelId,
            parameters: {},
          }),
        ).rejects.toMatchObject({ code: 'CHAT_CONVERSATION_BUSY' });
        const detail = await new ChatsRepository(database).detail(
          input.principal,
          conversationId,
          { limit: 50 },
        );
        expect(detail.activeJob?.id).toBe(running.job.id);
        expect(detail.messages.at(-1)?.jobId).toBe(running.job.id);
        expect(
          await service.sessionValid(secondSessionId, input.principal),
        ).toBe(true);
        const changes: string[] = [];
        const subscription = await service.subscribe(
          input.principal,
          conversationId,
          running.job.id,
          (event) => changes.push(event.name),
        );
        expect(subscription.job.id).toBe(running.job.id);
        for (let i = 0; !releaseProvider && i < 100; i++)
          await new Promise((resolve) => setTimeout(resolve, 10));
        if (!releaseProvider)
          throw new Error('Mock Provider request did not start');
        releaseProvider(
          new Response(
            'data: {"choices":[{"delta":{"content":"answer"},"finish_reason":"stop"}]}\n\n' +
              'data: [DONE]\n\n',
            { headers: { 'content-type': 'text/event-stream' } },
          ),
        );
        let finished = await service.get(
          input.principal,
          conversationId,
          running.job.id,
        );
        for (let i = 0; finished.status !== 'completed' && i < 100; i++) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          finished = await service.get(
            input.principal,
            conversationId,
            running.job.id,
          );
        }
        expect(finished.errorCode).toBeNull();
        expect(finished).toMatchObject({
          status: 'completed',
          content: 'answer',
        });
        // A separate DB reader may observe the commit before its publisher resumes.
        await expect
          .poll(() => changes, { timeout: 5000 })
          .toContain('terminal');
        expect(called).toHaveBeenCalledTimes(1);
        subscription.close();
        const regeneration = await repository.start(
          {
            ...input,
            kind: 'regenerate',
            regenerateAssistantMessageId: running.job.assistantMessageId,
            idempotencyKey: randomUUID(),
            content: '',
          },
          () => true,
        );
        expect(regeneration.job.userMessageId).toBeNull();
        expect(regeneration.turn?.activateBranchOnComplete).toBe(true);
        await repository.terminal(regeneration.job.id, {
          status: 'completed',
          content: 'another answer',
          errorCode: null,
          inputTokens: null,
          outputTokens: null,
          activateBranch: {
            branchId: regeneration.turn!.branchId,
            previousActiveBranchId: regeneration.turn!.previousActiveBranchId,
          },
        });
        const activeBranch =
          await sql`SELECT active_branch_id FROM conversations WHERE id = ${conversationId}`;
        expect(activeBranch[0]?.active_branch_id).toBe(
          regeneration.job.branchId,
        );
        const large = await repository.start(
          {
            ...input,
            idempotencyKey: randomUUID(),
            maximumGeneratedTextBytes: 8_388_608,
          },
          () => true,
        );
        const largeText = '\u0001'.repeat(8_388_608);
        expect(
          (await repository.checkpoint(large.job.id, largeText))?.content,
        ).toBe(largeText);
        await repository.terminal(large.job.id, {
          status: 'completed',
          content: largeText,
          errorCode: null,
          inputTokens: null,
          outputTokens: null,
        });
        expect(
          (await repository.get(input.principal, conversationId, large.job.id))
            .content,
        ).toBe(largeText);
        const largeMessage =
          await sql`SELECT octet_length(content) AS bytes FROM messages WHERE id = ${large.job.assistantMessageId}`;
        expect(largeMessage[0]?.bytes).toBe(8_388_608);
        await sql`UPDATE chat_jobs SET finished_at = now() - interval '8 days' WHERE id = ${large.job.id}`;
        expect(await repository.purgeExpired()).toBe(1);
        await expect(
          repository.get(input.principal, conversationId, large.job.id),
        ).rejects.toThrow();
        const retainedMessage = await new ChatsRepository(database).detail(
          input.principal,
          conversationId,
          { limit: 50 },
        );
        expect(
          retainedMessage.messages.find(
            (message) => message.id === large.job.assistantMessageId,
          )?.jobId,
        ).toBeNull();

        vi.stubGlobal(
          'fetch',
          vi.fn(
            (_url: unknown, options: { signal: AbortSignal }) =>
              new Promise<Response>((_resolve, reject) => {
                options.signal.addEventListener(
                  'abort',
                  () => reject(new DOMException('Aborted', 'AbortError')),
                  { once: true },
                );
              }),
          ),
        );
        const revokeConversationId = randomUUID();
        const revokeBranchId = randomUUID();
        await sql.begin(async (tx) => {
          await tx`INSERT INTO conversations (id, user_id, active_branch_id, request_trace_limit)
          VALUES (${revokeConversationId}, ${userId}, ${revokeBranchId}, 0)`;
          await tx`INSERT INTO conversation_branches (id, conversation_id)
          VALUES (${revokeBranchId}, ${revokeConversationId})`;
        });
        const revoked = await service.start({
          principal: input.principal,
          conversationId: revokeConversationId,
          kind: 'turn',
          idempotencyKey: randomUUID(),
          settingsRevision: '1',
          sessionId,
          absoluteExpiresAt: new Date(Date.now() + 86_400_000),
          content: 'revoke me',
          attachmentIds: [],
          providerModelId: modelId,
          parameters: {},
        });
        await sql`UPDATE sessions SET revoked_at = now(), revoked_reason = 'test' WHERE id = ${sessionId}`;
        let cancelled = await service.get(
          input.principal,
          revokeConversationId,
          revoked.job.id,
        );
        for (let i = 0; cancelled.status !== 'cancelled' && i < 340; i++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          cancelled = await service.get(
            input.principal,
            revokeConversationId,
            revoked.job.id,
          );
        }
        expect(cancelled).toMatchObject({
          status: 'cancelled',
          errorCode: 'CHAT_CANCELLED',
        });
        expect(
          await service.sessionValid(secondSessionId, input.principal),
        ).toBe(true);
        vi.unstubAllGlobals();
      } finally {
        vi.unstubAllGlobals();
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
