import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import {
  createDatabaseClient,
  loadMigrationPlan,
  type DatabaseClient,
} from '@modelnaru/database';
import type { LoadedConfig } from '@modelnaru/config';
import { describe, expect, it } from 'vitest';

import { encryptProviderSecret } from '../src/provider-credentials.js';

const databaseUrl = process.env.MODELNARU_TEST_DATABASE_URL;
const databaseIt = databaseUrl ? it : it.skip;

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) =>
    server.listen(0, '127.0.0.1', resolve).once('error', reject),
  );
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No TCP port');
  return address.port;
}

async function until<T>(
  read: () => Promise<T> | T,
  accepts: (value: T) => boolean,
  timeout = 15_000,
): Promise<T> {
  const end = Date.now() + timeout;
  let value: T;
  do {
    value = await read();
    if (accepts(value)) return value;
    await delay(50);
  } while (Date.now() < end);
  throw new Error(
    `Timed out waiting for condition; last value: ${JSON.stringify(value)}`,
  );
}

type Job = {
  id: string;
  status: string;
  revision: string;
  content: string;
  errorCode: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  assistantMessageId: string;
};
type Frame = { event: string; id: string; data: Record<string, unknown> };

async function nextFrame(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  buffer: { text: string },
): Promise<Frame> {
  while (true) {
    const split = buffer.text.indexOf('\n\n');
    if (split >= 0) {
      const raw = buffer.text.slice(0, split);
      buffer.text = buffer.text.slice(split + 2);
      const lines = raw.split('\n');
      const event =
        lines.find((line) => line.startsWith('event: '))?.slice(7) ?? '';
      if (event === 'heartbeat') continue;
      return {
        event,
        id: lines.find((line) => line.startsWith('id: '))?.slice(4) ?? '',
        data: JSON.parse(
          lines.find((line) => line.startsWith('data: '))?.slice(6) ?? '{}',
        ) as Record<string, unknown>,
      };
    }
    const chunk = await reader.read();
    if (chunk.done) throw new Error('SSE closed before expected frame');
    buffer.text += new TextDecoder().decode(chunk.value);
  }
}

describe('N06 real HTTP/SSE with isolated PostgreSQL and mock Provider', () => {
  databaseIt(
    'reconnects, deduplicates, settles races, restarts and enforces session/concurrency',
    async () => {
      const parsed = new URL(databaseUrl!);
      if (
        !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) ||
        !parsed.pathname.endsWith('_test')
      )
        throw new Error(
          'MODELNARU_TEST_DATABASE_URL must point to a loopback *_test database',
        );

      const folder = await mkdtemp(join(tmpdir(), 'modelnaru-n06-http-'));
      const schema = `n06_http_${randomUUID().replaceAll('-', '')}`;
      const dbFile = join(folder, 'database-url');
      const keyFile = join(folder, 'provider-key');
      const configFile = join(folder, 'config.yaml');
      const shimFile = join(folder, 'mock-fetch.mjs');
      const masterKey = randomBytes(32);
      const sessionToken = randomBytes(32).toString('base64url');
      const csrfToken = randomBytes(32).toString('base64url');
      const cookie = `modelnaru_session=${sessionToken}; modelnaru_csrf=${csrfToken}`;
      const sha = (value: string) =>
        createHash('sha256').update(value).digest();
      let bootstrap: DatabaseClient | undefined;
      let sql: DatabaseClient | undefined;
      let api: ChildProcess | undefined;
      let mock: Server | undefined;
      const pending: ServerResponse[] = [];
      let calls = 0;
      let apiOutput = '';
      const apiPortServer = createServer();
      const apiPort = await listen(apiPortServer);
      await new Promise<void>((resolve) =>
        apiPortServer.close(() => resolve()),
      );
      const base = `http://127.0.0.1:${apiPort}/api`;
      const requestAs = (
        path: string,
        identityCookie: string,
        identityCsrf: string,
        init: RequestInit = {},
      ) =>
        fetch(`${base}${path}`, {
          ...init,
          headers: {
            Cookie: identityCookie,
            'x-csrf-token': identityCsrf,
            'content-type': 'application/json',
            ...init.headers,
          },
        });
      const request = (path: string, init: RequestInit = {}) =>
        requestAs(path, cookie, csrfToken, init);
      const jobGet = async (
        conversationId: string,
        jobId: string,
      ): Promise<Job> => {
        const response = await request(
          `/conversations/${conversationId}/jobs/${jobId}`,
        );
        expect(response.status).toBe(200);
        return ((await response.json()) as { job: Job }).job;
      };
      const start = async (
        conversationId: string,
        modelId: string,
        key = randomUUID(),
      ) => {
        const response = await request(
          `/conversations/${conversationId}/jobs`,
          {
            method: 'POST',
            headers: { 'idempotency-key': key },
            body: JSON.stringify({
              settingsRevision: '1',
              content: 'question',
              providerModelId: modelId,
              parameters: { maxOutputTokens: 64 },
            }),
          },
        );
        return {
          status: response.status,
          body: (await response.json()) as {
            job?: Job;
            error?: { code: string };
          },
        };
      };
      const cancel = (conversationId: string, jobId: string) =>
        request(`/conversations/${conversationId}/jobs/${jobId}/cancel`, {
          method: 'POST',
        });
      const createConversation = async (modelId: string) => {
        const response = await request('/conversations', {
          method: 'POST',
          body: JSON.stringify({
            defaultProviderModelId: modelId,
            requestTraceLimit: 0,
          }),
        });
        expect(response.status).toBe(201);
        return ((await response.json()) as { id: string }).id;
      };
      const stopApi = async () => {
        if (!api?.pid) return;
        const child = api;
        api = undefined;
        if (child.exitCode === null) {
          child.kill('SIGKILL');
          await Promise.race([
            new Promise<void>((resolve) => child.once('exit', () => resolve())),
            delay(5_000),
          ]);
        }
      };
      const launchApi = async (mockPort: number) => {
        apiOutput = '';
        api = spawn(
          process.execPath,
          ['--import', pathToFileURL(shimFile).href, 'dist/main.js'],
          {
            cwd: resolve(process.cwd()),
            windowsHide: true,
            env: {
              ...process.env,
              API_PORT: String(apiPort),
              APICHAT_CONFIG_FILE: configFile,
              MODELNARU_MOCK_PROVIDER_URL: `http://127.0.0.1:${mockPort}`,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
        api.stdout?.on('data', (chunk: Buffer) => {
          apiOutput += chunk.toString();
        });
        api.stderr?.on('data', (chunk: Buffer) => {
          apiOutput += chunk.toString();
        });
        await until(
          async () => {
            if (api?.exitCode !== null)
              throw new Error(`API exited: ${apiOutput.slice(-3000)}`);
            return fetch(`${base}/health/ready`)
              .then((response) => response.status)
              .catch(() => 0);
          },
          (status) => status === 200,
          20_000,
        );
      };
      try {
        await writeFile(dbFile, databaseUrl!, { mode: 0o600 });
        bootstrap = await createDatabaseClient({
          paths: { databaseUrlFile: dbFile },
        } as LoadedConfig);
        await bootstrap.unsafe(`CREATE SCHEMA "${schema}"`);
        parsed.searchParams.set('options', `-csearch_path=${schema},public`);
        await writeFile(dbFile, parsed.toString(), { mode: 0o600 });
        sql = await createDatabaseClient({
          paths: { databaseUrlFile: dbFile },
        } as LoadedConfig);
        for (const migration of await loadMigrationPlan(
          resolve(process.cwd(), '../../packages/database/migrations'),
        ))
          await sql.begin(async (tx) => {
            await tx.unsafe(migration.sql);
          });
        await writeFile(keyFile, masterKey.toString('base64url'), {
          mode: 0o600,
        });
        const example = await readFile(
          resolve(process.cwd(), '../../config.example.yaml'),
          'utf8',
        );
        await writeFile(
          configFile,
          example
            .replace('chat.example.com', '127.0.0.1')
            .replace('chat.example.com', '127.0.0.1')
            .replace(
              'maximumGlobalAiGenerations: 3',
              'maximumGlobalAiGenerations: 1',
            )
            .replace(
              'urlFile: ./secrets/database_url',
              'urlFile: ./database-url',
            )
            .replace(
              'masterEncryptionKeyFile: ./secrets/provider_master_key',
              'masterEncryptionKeyFile: ./provider-key',
            ),
        );
        await writeFile(
          shimFile,
          `const original = globalThis.fetch; globalThis.fetch = (input, init) => { const url = String(input); if (url.startsWith('https://api.openai.com/')) return original(process.env.MODELNARU_MOCK_PROVIDER_URL, init); throw new Error('Unexpected outbound fetch: ' + url); };`,
        );
        mock = createServer((_req, res) => {
          calls++;
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          res.flushHeaders();
          pending.push(res);
        });
        const mockPort = await listen(mock);
        const userId = randomUUID();
        const sessionId = randomUUID();
        const otherUserId = randomUUID();
        const otherSessionToken = randomBytes(32).toString('base64url');
        const otherCsrfToken = randomBytes(32).toString('base64url');
        const otherCookie = `modelnaru_session=${otherSessionToken}; modelnaru_csrf=${otherCsrfToken}`;
        const connectionId = randomUUID();
        const modelId = randomUUID();
        const encrypted = encryptProviderSecret(masterKey, 'fixture-only');
        await sql`INSERT INTO users (id, username, username_normalized, password_hash) VALUES (${userId}, 'n06http', 'n06http', '$argon2id$fixture')`;
        await sql`INSERT INTO sessions (id, principal_type, user_id, account_key, token_hash, csrf_token_hash, credential_fingerprint, idle_expires_at, absolute_expires_at)
        VALUES (${sessionId}, 'user', ${userId}, ${`user:${userId}`}, ${sha(sessionToken)}, ${sha(csrfToken)}, ${sha(`modelnaru:user-credential:v1\0${userId}\0${1}`)}, now() + interval '1 hour', now() + interval '1 day')`;
        await sql`INSERT INTO users (id, username, username_normalized, password_hash) VALUES (${otherUserId}, 'n06httpother', 'n06httpother', '$argon2id$fixture')`;
        await sql`INSERT INTO sessions (principal_type, user_id, account_key, token_hash, csrf_token_hash, credential_fingerprint, idle_expires_at, absolute_expires_at)
        VALUES ('user', ${otherUserId}, ${`user:${otherUserId}`}, ${sha(otherSessionToken)}, ${sha(otherCsrfToken)}, ${sha(`modelnaru:user-credential:v1\0${otherUserId}\0${1}`)}, now() + interval '1 hour', now() + interval '1 day')`;
        await sql`INSERT INTO provider_connections (id, template_id, name, base_url, credential_ciphertext, credential_nonce, credential_auth_tag)
        VALUES (${connectionId}, 'openai', 'N06 HTTP fixture', 'https://api.openai.com/v1', ${encrypted.ciphertext}, ${encrypted.nonce}, ${encrypted.authTag})`;
        await sql`INSERT INTO provider_models (id, provider_connection_id, model_id, is_enabled) VALUES (${modelId}, ${connectionId}, 'fixture', true)`;
        await sql`INSERT INTO user_model_permissions (user_id, provider_model_id) VALUES (${userId}, ${modelId})`;
        await sql`INSERT INTO user_model_permissions (user_id, provider_model_id) VALUES (${otherUserId}, ${modelId})`;
        await launchApi(mockPort);

        // One physical provider call and quota reservation for concurrent retries.
        const conversation = await createConversation(modelId);
        const idem = randomUUID();
        const [first, replay] = await Promise.all([
          start(conversation, modelId, idem),
          start(conversation, modelId, idem),
        ]);
        expect([first.status, replay.status].sort()).toEqual([200, 202]);
        const jobId = first.body.job!.id;
        expect(replay.body.job!.id).toBe(jobId);
        await until(
          () => calls,
          (count) => count === 1,
        );
        expect(
          (
            await sql`SELECT count(*)::int AS count FROM chat_jobs WHERE conversation_id = ${conversation}`
          )[0]?.count,
        ).toBe(1);
        expect(
          (
            await sql`SELECT count(*)::int AS count FROM chat_quota_reservations WHERE job_id = ${jobId}`
          )[0]?.count,
        ).toBe(1);
        const busyConversation = await createConversation(modelId);
        const busy = await start(busyConversation, modelId);
        expect(busy.status).toBe(409);
        expect(busy.body.error?.code).toBe('CHAT_PRINCIPAL_BUSY');
        const otherConversationResponse = await requestAs(
          '/conversations',
          otherCookie,
          otherCsrfToken,
          {
            method: 'POST',
            body: JSON.stringify({
              defaultProviderModelId: modelId,
              requestTraceLimit: 0,
            }),
          },
        );
        expect(otherConversationResponse.status).toBe(201);
        const otherConversationId = (
          (await otherConversationResponse.json()) as { id: string }
        ).id;
        const globalBusyResponse = await requestAs(
          `/conversations/${otherConversationId}/jobs`,
          otherCookie,
          otherCsrfToken,
          {
            method: 'POST',
            headers: { 'idempotency-key': randomUUID() },
            body: JSON.stringify({
              settingsRevision: '1',
              content: 'question',
              providerModelId: modelId,
              parameters: {},
            }),
          },
        );
        expect(globalBusyResponse.status).toBe(503);
        expect(
          ((await globalBusyResponse.json()) as { error: { code: string } })
            .error.code,
        ).toBe('CHAT_SERVER_BUSY');
        expect(calls).toBe(1);

        // Opening and dropping a real SSE socket must not abort the provider stream.
        const eventsUrl = `/conversations/${conversation}/jobs/${jobId}/events`;
        const stream = await request(eventsUrl);
        expect(stream.status).toBe(200);
        const reader = stream.body!.getReader();
        const buffer = { text: '' };
        expect((await nextFrame(reader, buffer)).event).toBe('snapshot');
        await reader.cancel();
        pending[0]!.write(
          'data: {"choices":[{"delta":{"content":"first "},"finish_reason":null}]}\n\n',
        );
        await delay(1_200);
        const snapshot = await jobGet(conversation, jobId);
        expect(snapshot.status).toBe('streaming');
        expect(snapshot.content).toBe('first ');
        const resumed = await request(eventsUrl);
        expect(resumed.status).toBe(200);
        const resumedReader = resumed.body!.getReader();
        const resumedBuffer = { text: '' };
        const snapshotFrame = await nextFrame(resumedReader, resumedBuffer);
        expect(snapshotFrame.event).toBe('snapshot');
        expect(snapshotFrame.id).toBe(snapshot.revision);
        pending[0]!.write(
          'data: {"choices":[{"delta":{"content":"second"},"finish_reason":null}]}\n\n',
        );
        pending[0]!.write(
          'data: {"usage":{"prompt_tokens":3,"completion_tokens":4},"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        );
        pending[0]!.end('data: [DONE]\n\n');
        const frames: Frame[] = [];
        for (let i = 0; i < 5; i++) {
          const frame = await nextFrame(resumedReader, resumedBuffer);
          frames.push(frame);
          if (frame.event === 'terminal') break;
        }
        expect(frames.at(-1)?.event).toBe('terminal');
        expect(frames.map((frame) => BigInt(frame.id))).toEqual(
          frames.map(
            (frame, index) => BigInt(snapshot.revision) + BigInt(index + 1),
          ),
        );
        const restored =
          snapshot.content +
          frames
            .filter(
              (frame) => frame.event === 'append' || frame.event === 'terminal',
            )
            .map((frame) =>
              typeof frame.data.text === 'string' ? frame.data.text : '',
            )
            .join('');
        const completed = await until(
          () => jobGet(conversation, jobId),
          (job) => job.status === 'completed',
        );
        expect(restored).toBe(completed.content);
        expect(completed.content).toBe('first second');
        expect(completed.inputTokens).toBe(3);
        expect(completed.outputTokens).toBe(4);
        expect(calls).toBe(1);

        // A completion/cancel race must settle once with matching message, usage and quota.
        const raceConversation = await createConversation(modelId);
        const raced = await start(raceConversation, modelId);
        expect(raced.status).toBe(202);
        await until(
          () => calls,
          (count) => count === 2,
        );
        const raceJobId = raced.body.job!.id;
        const raceProvider = pending[1]!;
        const [cancelResponse] = await Promise.all([
          cancel(raceConversation, raceJobId),
          Promise.resolve().then(() =>
            raceProvider.end(
              'data: {"choices":[{"delta":{"content":"race"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
            ),
          ),
        ]);
        expect([204, 409]).toContain(cancelResponse.status);
        const terminal = await until(
          () => jobGet(raceConversation, raceJobId),
          (job) => ['completed', 'cancelled'].includes(job.status),
        );
        const state =
          await sql`SELECT j.status, m.status AS message_status, m.content, u.status AS usage_status, u.input_tokens, u.output_tokens, r.state AS quota_state
        FROM chat_jobs j JOIN messages m ON m.id = j.assistant_message_id JOIN usage_events u ON u.job_id = j.id JOIN chat_quota_reservations r ON r.job_id = j.id WHERE j.id = ${raceJobId}`;
        expect(state[0]?.status).toBe(terminal.status);
        expect(state[0]?.message_status).toBe(terminal.status);
        expect(state[0]?.usage_status).toBe(terminal.status);
        expect(state[0]?.content).toBe(terminal.content);
        expect(state[0]?.input_tokens).toBe(terminal.inputTokens);
        expect(state[0]?.output_tokens).toBe(terminal.outputTokens);
        expect(state[0]?.quota_state).toBe('charged');

        // A killed API process leaves no live runner. Startup recovery must fail the job without another provider call.
        const restartConversation = await createConversation(modelId);
        const restarting = await start(restartConversation, modelId);
        expect(restarting.status).toBe(202);
        await until(
          () => calls,
          (count) => count === 3,
        );
        const beforeRestart = calls;
        await stopApi();
        pending[2]?.destroy();
        await launchApi(mockPort);
        const recovered = await jobGet(
          restartConversation,
          restarting.body.job!.id,
        );
        expect(recovered).toMatchObject({
          status: 'failed',
          errorCode: 'CHAT_SERVER_RESTARTED',
        });
        expect(calls).toBe(beforeRestart);
        const recoveryRows =
          await sql`SELECT m.status AS message_status, u.status AS usage_status, r.state AS quota_state FROM chat_jobs j
        JOIN messages m ON m.id = j.assistant_message_id JOIN usage_events u ON u.job_id = j.id JOIN chat_quota_reservations r ON r.job_id = j.id WHERE j.id = ${restarting.body.job!.id}`;
        expect(recoveryRows[0]).toMatchObject({
          message_status: 'failed',
          usage_status: 'failed',
          quota_state: 'charged',
        });

        // N13: kill a real API during each auxiliary operation, then inspect recovery.
        const helperModel = randomUUID();
        await sql`INSERT INTO provider_models (id, provider_connection_id, model_id, is_enabled,context_window,max_output_tokens)
          VALUES (${helperModel},${connectionId},'helper',true,16384,4096)`;
        await sql`UPDATE title_generation_settings SET provider_model_id=${helperModel},version=version+1 WHERE id=1`;
        const titleConversation = await createConversation(modelId);
        const titleStartCalls = calls;
        const titleJob = await start(titleConversation, modelId);
        expect(titleJob.status).toBe(202);
        await until(
          () => calls,
          (n) => n === titleStartCalls + 1,
        );
        pending
          .at(-1)!
          .end(
            'data: {"choices":[{"delta":{"content":"answer"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":4}}\n\ndata: [DONE]\n\n',
          );
        await until(
          () => calls,
          (n) => n === titleStartCalls + 2,
        );
        pending
          .at(-1)!
          .write(
            'data: {"choices":[{"delta":{"content":"partial title"},"finish_reason":null}],"usage":{"prompt_tokens":7,"completion_tokens":2}}\n\n',
          );
        await until(
          async () =>
            (
              await sql!`SELECT input_tokens FROM usage_events WHERE conversation_id=${titleConversation} AND operation_type='title'`
            )[0]?.input_tokens as number | undefined,
          (n) => n === 7,
        );
        const titleCalls = calls;
        await stopApi();
        pending.at(-1)!.destroy();
        await launchApi(mockPort);
        expect(
          await jobGet(titleConversation, titleJob.body.job!.id),
        ).toMatchObject({
          status: 'completed',
          content: 'answer',
          inputTokens: 3,
          outputTokens: 4,
        });
        expect(
          (
            await sql`SELECT title_source,title_status FROM conversations WHERE id=${titleConversation}`
          )[0],
        ).toMatchObject({ title_source: 'default', title_status: 'failed' });
        expect(
          (
            await sql`SELECT status,input_tokens,output_tokens FROM usage_events WHERE conversation_id=${titleConversation} AND operation_type='title'`
          )[0],
        ).toMatchObject({
          status: 'failed',
          input_tokens: 7,
          output_tokens: 2,
        });
        expect(
          (
            await sql`SELECT status FROM conversation_title_tasks WHERE conversation_id=${titleConversation}`
          )[0]?.status,
        ).toBe('failed');
        await delay(500);
        expect(calls).toBe(titleCalls);
        await sql`UPDATE title_generation_settings SET provider_model_id=NULL,version=version+1 WHERE id=1`;

        await sql`UPDATE provider_models SET context_window=6000,max_output_tokens=4096 WHERE id=${modelId}`;
        await sql`UPDATE summarization_settings SET provider_model_id=${helperModel},prompt='Summarize faithfully.',max_output_tokens=1024 WHERE singleton`;
        const summaryConversation = await createConversation(modelId);
        const summaryBranch = (
          await sql`SELECT active_branch_id FROM conversations WHERE id=${summaryConversation}`
        )[0]!.active_branch_id as string;
        await sql`INSERT INTO messages(id,conversation_id,branch_id,role,status,content,sequence_number,completed_at)
          VALUES (${randomUUID()},${summaryConversation},${summaryBranch},'user','completed',${'old '.repeat(1300)},1,now()),
          (${randomUUID()},${summaryConversation},${summaryBranch},'assistant','completed','previous',2,now())`;
        const summaryStartCalls = calls;
        const summaryJob = await start(summaryConversation, modelId);
        expect(summaryJob.status).toBe(202);
        await until(
          () => calls,
          (n) => n === summaryStartCalls + 1,
        );
        pending
          .at(-1)!
          .write(
            'data: {"choices":[{"delta":{"content":"partial summary"},"finish_reason":null}],"usage":{"prompt_tokens":11,"completion_tokens":5}}\n\n',
          );
        await until(
          async () =>
            (
              await sql!`SELECT input_tokens FROM usage_events WHERE job_id=${summaryJob.body.job!.id} AND operation_type='summary'`
            )[0]?.input_tokens as number | undefined,
          (n) => n === 11,
        );
        const summaryCalls = calls;
        await stopApi();
        pending.at(-1)!.destroy();
        await launchApi(mockPort);
        expect(
          await jobGet(summaryConversation, summaryJob.body.job!.id),
        ).toMatchObject({
          status: 'failed',
          errorCode: 'CHAT_SERVER_RESTARTED',
          content: '',
        });
        expect(
          (
            await sql`SELECT status,input_tokens,output_tokens FROM usage_events WHERE job_id=${summaryJob.body.job!.id} AND operation_type='summary'`
          )[0],
        ).toMatchObject({
          status: 'failed',
          input_tokens: 11,
          output_tokens: 5,
        });
        expect(
          (
            await sql`SELECT state FROM chat_quota_reservations WHERE job_id=${summaryJob.body.job!.id}`
          )[0]?.state,
        ).toBe('charged');
        expect(
          (
            await sql`SELECT count(*)::int AS n FROM context_summaries WHERE conversation_id=${summaryConversation}`
          )[0]?.n,
        ).toBe(0);
        await delay(500);
        expect(calls).toBe(summaryCalls);
        await sql`UPDATE summarization_settings SET provider_model_id=NULL WHERE singleton`;

        // Session revocation is enforced by the real guard and cancels its running job.
        const beforeRevocation = calls;
        const revokedConversation = await createConversation(modelId);
        const revoked = await start(revokedConversation, modelId);
        expect(revoked.status).toBe(202);
        await until(
          () => calls,
          (count) => count === beforeRevocation + 1,
        );
        await sql`UPDATE sessions SET revoked_at = now(), revoked_reason = 'test' WHERE id = ${sessionId}`;
        expect(
          (
            await request(
              `/conversations/${revokedConversation}/jobs/${revoked.body.job!.id}`,
            )
          ).status,
        ).toBe(401);
        const revokedStatus = await until(
          async () =>
            (
              await sql!`SELECT status FROM chat_jobs WHERE id = ${revoked.body.job!.id}`
            )[0]?.status as string,
          (status) => status === 'cancelled',
          20_000,
        );
        expect(revokedStatus).toBe('cancelled');
      } finally {
        await stopApi();
        for (const response of pending) response.destroy();
        if (mock)
          await new Promise<void>((resolve) => mock!.close(() => resolve()));
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
