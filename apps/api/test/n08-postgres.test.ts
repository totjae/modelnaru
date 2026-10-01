import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { LoadedConfig } from '@modelnaru/config';
import {
  createDatabaseClient,
  loadMigrationPlan,
  type DatabaseClient,
} from '@modelnaru/database';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../src/database.service.js';
import { AccessRepository } from '../src/access.repository.js';
import type { AccessService } from '../src/access.service.js';
import { ChatMessagesRepository } from '../src/chat-messages.repository.js';
import { ChatJobsRepository } from '../src/chat-jobs.repository.js';
import { ChatJobsService } from '../src/chat-jobs.service.js';
import { ChatsRepository } from '../src/chats.repository.js';
import { SummarizationRepository } from '../src/summarization.repository.js';
import { SummarizationService } from '../src/summarization.service.js';
import { TitleGenerationRepository } from '../src/title-generation.repository.js';
import { TitleGenerationService } from '../src/title-generation.service.js';
import type { ChatProviderService } from '../src/chat-provider.service.js';
import type { AttachmentsService } from '../src/attachments.service.js';
import type { RequestTraceService } from '../src/request-trace.service.js';
import { providerTemplateById } from '../src/provider-catalog.js';

const databaseUrl = process.env.MODELNARU_TEST_DATABASE_URL;
async function until(read: () => Promise<boolean>) {
  const end = Date.now() + 10_000;
  while (!(await read())) {
    if (Date.now() > end) throw new Error('N08 condition timed out');
    await delay(20);
  }
}
const stream = (text: string) =>
  new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 9, completion_tokens: 4 } })}\n\ndata: [DONE]\n\n`,
  );

describe('N08 isolated PostgreSQL auxiliary calls and title races', () => {
  (databaseUrl ? it : it.skip)(
    'preserves quota/usage and prevents late summary/title writes',
    async () => {
      const url = new URL(databaseUrl!);
      if (
        !['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ||
        !url.pathname.endsWith('_test')
      )
        throw new Error('Only loopback *_test DB is allowed');
      const folder = await mkdtemp(join(tmpdir(), 'modelnaru-n08-'));
      const schema = `n08_${randomUUID().replaceAll('-', '')}`;
      const file = join(folder, 'database-url');
      let bootstrap: DatabaseClient | undefined;
      let sql: DatabaseClient | undefined;
      let jobsService: ChatJobsService | undefined;
      let titleService: TitleGenerationService | undefined;
      try {
        await writeFile(file, databaseUrl!, { mode: 0o600 });
        const loaded = {
          paths: { databaseUrlFile: file },
          config: {
            limits: {
              maximumGlobalAiGenerations: 1,
              maximumGeneratedTextBytes: 2_097_152,
              maximumSsePendingBytes: 65_536,
            },
          },
        } as LoadedConfig;
        bootstrap = await createDatabaseClient(loaded);
        await bootstrap.unsafe(`CREATE SCHEMA "${schema}"`);
        url.searchParams.set('options', `-csearch_path=${schema},public`);
        await writeFile(file, url.toString(), { mode: 0o600 });
        sql = await createDatabaseClient(loaded);
        for (const migration of await loadMigrationPlan(
          resolve(process.cwd(), '../../packages/database/migrations'),
        ))
          await sql.begin(async (tx) => {
            await tx.unsafe(migration.sql);
          });
        const database = { getClient: () => sql! } as DatabaseService;
        const user = randomUUID(),
          session = randomUUID(),
          connection = randomUUID(),
          mainModel = randomUUID(),
          helperModel = randomUUID();
        await sql`INSERT INTO users(id,username,username_normalized,password_hash) VALUES (${user},'n08','n08','$argon2id$fixture')`;
        await sql`INSERT INTO sessions(id,principal_type,user_id,account_key,token_hash,csrf_token_hash,credential_fingerprint,idle_expires_at,absolute_expires_at)
        VALUES (${session},'user',${user},${`user:${user}`},decode(repeat('aa',32),'hex'),decode(repeat('bb',32),'hex'),decode(repeat('cc',32),'hex'),now()+interval '1 hour',now()+interval '1 day')`;
        await sql`INSERT INTO provider_connections(id,template_id,name,base_url,credential_ciphertext,credential_nonce,credential_auth_tag)
        VALUES (${connection},'openai','N08 fixture','https://api.openai.com/v1',decode('aa','hex'),decode(repeat('00',12),'hex'),decode(repeat('00',16),'hex'))`;
        await sql`INSERT INTO provider_models(id,provider_connection_id,model_id,is_enabled) VALUES (${mainModel},${connection},'main',true),(${helperModel},${connection},'helper',true)`;
        await sql`INSERT INTO user_model_permissions(user_id,provider_model_id) VALUES (${user},${mainModel})`;
        const providers = {
          resolve: (id: string) =>
            Promise.resolve({
              providerModelId: id,
              modelId: id === mainModel ? 'main' : 'helper',
              apiKey: 'fixture',
              baseUrl: 'https://api.openai.com/v1',
              contextWindow: id === mainModel ? 6_000 : 16_384,
              maxOutputTokens: 4_096,
              supportsImageInput: false,
              supportsWebSearch: false,
              template: providerTemplateById('openai')!,
            }),
        } as ChatProviderService;
        const summaries = new SummarizationRepository(database);
        const summaryService = new SummarizationService(summaries, providers);
        const titles = new TitleGenerationRepository(database);
        titleService = new TitleGenerationService(titles, providers);
        const jobs = new ChatJobsRepository(
          database,
          new ChatMessagesRepository(database),
          new AccessRepository(database),
        );
        jobsService = new ChatJobsService(
          loaded,
          jobs,
          { assertModelAllowed: async () => {} } as unknown as AccessService,
          providers,
          {
            readImages: () => Promise.resolve([]),
          } as unknown as AttachmentsService,
          summaryService,
          {
            appendRaw: () => {},
            complete: () => {},
            fail: () => {},
          } as unknown as RequestTraceService,
          database,
          titleService,
        );
        const principal = {
          type: 'user' as const,
          id: user,
          username: 'n08',
          displayName: null,
        };
        const createConversation = async () => {
          const id = randomUUID(),
            branch = randomUUID();
          await sql!.begin(async (tx) => {
            await tx`INSERT INTO conversations(id,user_id,active_branch_id,request_trace_limit) VALUES (${id},${user},${branch},0)`;
            await tx`INSERT INTO conversation_branches(id,conversation_id) VALUES (${branch},${id})`;
          });
          return { id, branch };
        };
        const start = async (id: string) => {
          const revision = (
            await sql!`SELECT settings_revision::text AS revision FROM conversations WHERE id=${id}`
          )[0]!.revision as string;
          return jobsService!.start({
            principal,
            conversationId: id,
            kind: 'turn',
            idempotencyKey: randomUUID(),
            settingsRevision: revision,
            sessionId: session,
            absoluteExpiresAt: new Date(Date.now() + 86_400_000),
            content: 'next',
            attachmentIds: [],
            providerModelId: mainModel,
            parameters: { maxOutputTokens: 64 },
          });
        };
        const summaryChat = await createConversation();
        await sql`INSERT INTO messages(id,conversation_id,branch_id,role,status,content,sequence_number,completed_at)
        VALUES (${randomUUID()},${summaryChat.id},${summaryChat.branch},'user','completed',${'old '.repeat(1_300)},1,now()),
        (${randomUUID()},${summaryChat.id},${summaryChat.branch},'assistant','completed','previous',2,now())`;
        await sql`UPDATE summarization_settings SET provider_model_id=${helperModel},prompt='Summarize faithfully.',max_output_tokens=1024 WHERE singleton`;
        const calls: string[] = [];
        let holdTitle: ((response: Response) => void) | undefined;
        const regularFetch = vi.fn(async (_url: string, init: RequestInit) => {
          const body = JSON.parse(init.body as string) as {
            model: string;
            max_tokens?: number;
            max_completion_tokens?: number;
          };
          const title =
            (body.max_tokens ?? body.max_completion_tokens) === 64 &&
            body.model === 'helper';
          calls.push(title ? 'title' : body.model);
          if (title)
            return await new Promise<Response>((resolve) => {
              holdTitle = resolve;
            });
          return stream(body.model === 'main' ? 'answer' : 'short summary');
        });
        vi.stubGlobal('fetch', regularFetch);
        const first = await start(summaryChat.id);
        await until(
          async () =>
            (await jobs.get(principal, summaryChat.id, first.job.id)).status ===
            'completed',
        );
        expect(calls).toEqual(['helper', 'main']);
        const usage =
          await sql`SELECT operation_type,status,input_tokens,output_tokens,usage_known FROM usage_events WHERE job_id=${first.job.id} ORDER BY operation_type`;
        expect(usage).toHaveLength(2);
        expect(
          usage.every(
            (row) =>
              row.status === 'completed' &&
              row.usage_known &&
              row.input_tokens === 9,
          ),
        ).toBe(true);
        await sql`UPDATE users SET daily_request_limit=1 WHERE id=${user}`;
        await expect(start(summaryChat.id)).rejects.toThrow();
        expect(calls).toHaveLength(2);
        await sql`UPDATE users SET daily_request_limit=NULL WHERE id=${user}`;

        const failedSummary = await createConversation();
        await sql`INSERT INTO messages(id,conversation_id,branch_id,role,status,content,sequence_number,completed_at)
        VALUES (${randomUUID()},${failedSummary.id},${failedSummary.branch},'user','completed',${'old '.repeat(1_300)},1,now())`;
        vi.stubGlobal(
          'fetch',
          vi.fn(() =>
            Promise.resolve(
              new Response(
                'data: {"choices":[],"usage":{"prompt_tokens":11,"completion_tokens":2}}\n\ndata: {"error":{"message":"fixture"}}\n\n',
              ),
            ),
          ),
        );
        const failed = await start(failedSummary.id);
        await until(
          async () =>
            (await jobs.get(principal, failedSummary.id, failed.job.id))
              .status === 'failed',
        );
        expect(
          (
            await sql`SELECT status,input_tokens,output_tokens,usage_known FROM usage_events WHERE job_id=${failed.job.id} AND operation_type='summary'`
          )[0],
        ).toMatchObject({
          status: 'failed',
          input_tokens: 11,
          output_tokens: 2,
          usage_known: true,
        });
        expect(
          (
            await sql`SELECT state FROM chat_quota_reservations WHERE job_id=${failed.job.id}`
          )[0]?.state,
        ).toBe('charged');
        expect(
          await sql`SELECT id FROM context_summaries WHERE conversation_id=${failedSummary.id}`,
        ).toHaveLength(0);
        const cancelledSummary = await createConversation();
        await sql`INSERT INTO messages(id,conversation_id,branch_id,role,status,content,sequence_number,completed_at)
        VALUES (${randomUUID()},${cancelledSummary.id},${cancelledSummary.branch},'user','completed',${'old '.repeat(1_300)},1,now())`;
        vi.stubGlobal(
          'fetch',
          vi.fn((_url: string, init: RequestInit) =>
            Promise.resolve(
              new Response(
                new ReadableStream({
                  start(controller) {
                    controller.enqueue(
                      new TextEncoder().encode(
                        'data: {"choices":[],"usage":{"prompt_tokens":13,"completion_tokens":2}}\n\n',
                      ),
                    );
                    init.signal?.addEventListener(
                      'abort',
                      () =>
                        controller.error(
                          new DOMException('Aborted', 'AbortError'),
                        ),
                      { once: true },
                    );
                  },
                }),
              ),
            ),
          ),
        );
        const cancelled = await start(cancelledSummary.id);
        await until(
          async () =>
            (
              await sql!`SELECT input_tokens FROM usage_events WHERE job_id=${cancelled.job.id} AND operation_type='summary'`
            )[0]?.input_tokens === 13,
        );
        await jobsService.cancel(
          principal,
          cancelledSummary.id,
          cancelled.job.id,
        );
        await until(
          async () =>
            (
              await sql!`SELECT status FROM usage_events WHERE job_id=${cancelled.job.id} AND operation_type='summary'`
            )[0]?.status === 'cancelled',
        );
        expect(
          (
            await sql`SELECT input_tokens,output_tokens,usage_known FROM usage_events WHERE job_id=${cancelled.job.id} AND operation_type='summary'`
          )[0],
        ).toMatchObject({
          input_tokens: 13,
          output_tokens: 2,
          usage_known: true,
        });
        expect(
          (
            await sql`SELECT state FROM chat_quota_reservations WHERE job_id=${cancelled.job.id}`
          )[0]?.state,
        ).toBe('charged');
        vi.stubGlobal('fetch', regularFetch);

        // First successful answer reserves title exactly once; manual title wins while Provider is held.
        await titles.updateSettings(helperModel, 'admin:fixture', null);
        const titleChat = await createConversation();
        const answer = await start(titleChat.id);
        await until(() => Promise.resolve(Boolean(holdTitle)));
        const task = await titles.forJob(answer.job.id);
        expect(task).toBeDefined();
        const chats = new ChatsRepository(database);
        await chats.update(principal, titleChat.id, { title: 'Manual title' });
        holdTitle!(stream('Late automatic title'));
        await until(async () => !(await titles.valid(task!.id)));
        await delay(100);
        const manual =
          await sql`SELECT title,title_source,title_status FROM conversations WHERE id=${titleChat.id}`;
        expect(manual[0]).toMatchObject({
          title: 'Manual title',
          title_source: 'manual',
          title_status: 'none',
        });
        expect(
          (
            await sql`SELECT status FROM conversation_title_tasks WHERE id=${task!.id}`
          )[0]?.status,
        ).toBe('cancelled');
        expect(
          (
            await sql`SELECT status FROM usage_events WHERE title_task_id=${task!.id}`
          )[0]?.status,
        ).toBe('cancelled');
        await start(titleChat.id);
        await until(
          async () =>
            (
              await sql!`SELECT count(*)::int AS n FROM chat_jobs WHERE conversation_id=${titleChat.id} AND status='completed'`
            )[0]?.n === 2,
        );
        expect(calls.filter((call) => call === 'title')).toHaveLength(1);

        // Deletion and session revocation prevent late title storage; restart does not send again.
        holdTitle = undefined;
        const deleted = await createConversation();
        await start(deleted.id);
        await until(() => Promise.resolve(Boolean(holdTitle)));
        await chats.delete(principal, deleted.id);
        holdTitle!(stream('Deleted title'));
        await delay(100);
        expect(
          await sql`SELECT id FROM conversations WHERE id=${deleted.id}`,
        ).toHaveLength(0);
        const interrupted = await createConversation();
        holdTitle = undefined;
        await start(interrupted.id);
        await until(() => Promise.resolve(Boolean(holdTitle)));
        await sql`UPDATE sessions SET revoked_at=now() WHERE id=${session}`;
        holdTitle!(stream('Revoked title'));
        await until(
          async () =>
            (
              await sql!`SELECT title_status FROM conversations WHERE id=${interrupted.id}`
            )[0]?.title_status === 'failed',
        );
        expect(
          (
            await sql`SELECT title_source FROM conversations WHERE id=${interrupted.id}`
          )[0]?.title_source,
        ).toBe('default');
        const beforeRecovery = calls.length;
        const orphan = await createConversation();
        const orphanTask = randomUUID();
        await sql`INSERT INTO conversation_title_tasks(id,conversation_id,started_session_id,provider_model_id,settings_version)
        VALUES (${orphanTask},${orphan.id},${session},${helperModel},1)`;
        await sql`UPDATE conversations SET title_status='pending' WHERE id=${orphan.id}`;
        await sql`INSERT INTO usage_events(principal_type,principal_id,principal_label,provider_model_id,provider_template_id_snapshot,model_id_snapshot,operation_type,status,title_task_id,input_tokens,usage_known)
        VALUES ('user',${user},'n08',${helperModel},'openai','helper','title','pending',${orphanTask},9,true)`;
        await titles.recover();
        expect(calls).toHaveLength(beforeRecovery);
        expect(
          (
            await sql`SELECT status,input_tokens FROM usage_events WHERE title_task_id=${orphanTask}`
          )[0],
        ).toMatchObject({ status: 'failed', input_tokens: 9 });
        expect(
          (
            await sql`SELECT title_status FROM conversations WHERE id=${orphan.id}`
          )[0]?.title_status,
        ).toBe('failed');

        const summaryArgs = {
          jobId: first.job.id,
          branchId: summaryChat.branch,
          conversationId: summaryChat.id,
          coveredMessageCount: 1,
          durationMs: 1,
          firstMessageId: first.job.userMessageId!,
          lastMessageId: first.job.userMessageId!,
          providerModelId: helperModel,
          modelId: 'helper',
          templateId: 'openai',
          promptVersion: 1,
          inputTokens: 1,
          outputTokens: 1,
          summary: 'late',
        };
        await expect(summaries.save(summaryArgs)).rejects.toThrow(
          'no longer active',
        );
      } finally {
        await jobsService?.beforeApplicationShutdown();
        titleService?.onApplicationShutdown();
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
