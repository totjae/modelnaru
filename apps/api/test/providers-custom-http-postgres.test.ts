import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { loadConfig, type LoadedConfig } from '@modelnaru/config';
import {
  createDatabaseClient,
  loadMigrationPlan,
  type DatabaseClient,
} from '@modelnaru/database';
import { describe, expect, it } from 'vitest';

import { createAdminCredentialFingerprint } from '../src/auth.crypto.js';

const databaseUrl = process.env.MODELNARU_TEST_DATABASE_URL;
const runWithDatabase = databaseUrl ? it : it.skip;
const sha = (value: string) => createHash('sha256').update(value).digest();

async function until<T>(
  read: () => T | Promise<T>,
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

async function listen(server: Server, host: string): Promise<number> {
  await new Promise<void>((resolve, reject) =>
    server.listen(0, host, resolve).once('error', reject),
  );
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No TCP address');
  return address.port;
}

describe('N07 real admin HTTP with isolated PostgreSQL and local mock Provider', () => {
  runWithDatabase(
    'registers, diagnoses and executes keyless/keyed custom models',
    async () => {
      const parsed = new URL(databaseUrl!);
      if (
        !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) ||
        !parsed.pathname.endsWith('_test')
      )
        throw new Error(
          'MODELNARU_TEST_DATABASE_URL must target loopback *_test database',
        );
      const localIp = Object.values(networkInterfaces())
        .flat()
        .find(
          (address) =>
            address?.family === 'IPv4' &&
            !address.internal &&
            /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/u.test(
              address.address,
            ),
        )?.address;
      if (!localIp)
        throw new Error(
          'No RFC1918 local interface is available for N07 HTTP test',
        );

      const folder = await mkdtemp(join(tmpdir(), 'modelnaru-n07-http-'));
      const schema = `n07_http_${randomUUID().replaceAll('-', '')}`;
      const dbFile = join(folder, 'database-url');
      const keyFile = join(folder, 'provider-key');
      const configFile = join(folder, 'config.yaml');
      const adminToken = randomBytes(32).toString('base64url');
      const adminCsrf = randomBytes(32).toString('base64url');
      const adminCookie = `modelnaru_session=${adminToken}; modelnaru_csrf=${adminCsrf}`;
      let bootstrap: DatabaseClient | undefined;
      let sql: DatabaseClient | undefined;
      let api: ChildProcess | undefined;
      let mock: Server | undefined;
      const held: ServerResponse[] = [];
      const providerHeaders: Array<string | undefined> = [];
      const providerRequests: string[] = [];
      let holdNextChat = false;
      let redirectNextHead = false;
      let failNextModels = false;
      let apiOutput = '';
      const reserved = createServer();
      const apiPort = await listen(reserved, '127.0.0.1');
      await new Promise<void>((resolve) => reserved.close(() => resolve()));
      const base = `http://127.0.0.1:${apiPort}/api`;
      const adminRequest = (path: string, init: RequestInit = {}) =>
        fetch(`${base}${path}`, {
          ...init,
          headers: {
            Cookie: adminCookie,
            'x-csrf-token': adminCsrf,
            'content-type': 'application/json',
            ...init.headers,
          },
        });
      const stopApi = async () => {
        if (!api?.pid) return;
        const child = api;
        api = undefined;
        if (child.exitCode === null) {
          child.kill('SIGKILL');
          await Promise.race([
            new Promise<void>((done) => child.once('exit', () => done())),
            delay(5_000),
          ]);
        }
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
        await writeFile(keyFile, randomBytes(32).toString('base64url'), {
          mode: 0o600,
        });
        const example = await readFile(
          resolve(process.cwd(), '../../config.example.yaml'),
          'utf8',
        );
        await writeFile(
          configFile,
          example
            .replaceAll('chat.example.com', '127.0.0.1')
            .replace(
              'urlFile: ./secrets/database_url',
              'urlFile: ./database-url',
            )
            .replace(
              'masterEncryptionKeyFile: ./secrets/provider_master_key',
              'masterEncryptionKeyFile: ./provider-key',
            ),
        );
        const loaded = await loadConfig(configFile);
        await sql`INSERT INTO sessions (principal_type, account_key, token_hash,
        csrf_token_hash, credential_fingerprint, idle_expires_at, absolute_expires_at)
        VALUES ('admin', 'admin:admin', ${sha(adminToken)}, ${sha(adminCsrf)},
          ${createAdminCredentialFingerprint(loaded.config.admin)}, now() + interval '1 hour', now() + interval '1 day')`;

        mock = createServer((req, res) => {
          providerRequests.push(`${req.method} ${req.url}`);
          if (req.method === 'HEAD' && req.url === '/v1') {
            if (redirectNextHead) {
              redirectNextHead = false;
              res
                .writeHead(302, {
                  location: 'http://169.254.169.254/latest/meta-data',
                })
                .end();
              return;
            }
            res.writeHead(404).end();
            return;
          }
          if (req.method === 'GET' && req.url === '/v1/models') {
            providerHeaders.push(req.headers.authorization);
            if (failNextModels) {
              failNextModels = false;
              res.writeHead(503).end();
              return;
            }
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ data: [{ id: 'discovered-one' }] }));
            return;
          }
          if (req.method === 'POST' && req.url === '/v1/chat/completions') {
            providerHeaders.push(req.headers.authorization);
            res.writeHead(200, { 'content-type': 'text/event-stream' });
            res.flushHeaders();
            if (holdNextChat) {
              holdNextChat = false;
              held.push(res);
            } else
              res.end(
                'data: {"choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
              );
            return;
          }
          res.writeHead(404).end();
        });
        const mockPort = await listen(mock, localIp);
        api = spawn(process.execPath, ['dist/main.js'], {
          cwd: resolve(process.cwd()),
          windowsHide: true,
          env: {
            ...process.env,
            APICHAT_CONFIG_FILE: configFile,
            API_PORT: String(apiPort),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
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

        const providerBaseUrl = `http://${localIp}:${mockPort}/v1`;
        const create = await adminRequest(
          '/admin/provider-connections/custom',
          {
            method: 'POST',
            body: JSON.stringify({
              name: 'N07 HTTP fixture',
              baseUrl: providerBaseUrl,
              authMode: 'none',
              destinationKind: 'local',
              approvedLocalIp: localIp,
              approvedLocalPort: mockPort,
            }),
          },
        );
        expect(create.status).toBe(201);
        const connection = (await create.json()) as {
          id: string;
          baseUrl: string;
        };
        expect(connection.baseUrl).toBe('[REDACTED]');
        expect(providerHeaders).toHaveLength(0);
        const list = await adminRequest('/admin/provider-connections');
        const listed = (
          (await list.json()) as {
            connections: Array<{
              id: string;
              baseUrl: string;
              approvedLocalIpDisplay: string;
            }>;
          }
        ).connections.find((item) => item.id === connection.id);
        expect(listed).toMatchObject({
          baseUrl: '[REDACTED]',
          approvedLocalIpDisplay: '[masked]',
        });
        const manualResponse = await adminRequest(
          `/admin/provider-connections/${connection.id}/models/manual`,
          {
            method: 'POST',
            body: JSON.stringify({ modelId: 'manual-one' }),
          },
        );
        expect(manualResponse.status).toBe(201);
        const manual = (await manualResponse.json()) as {
          id: string;
          isEnabled: boolean;
          source: string;
        };
        expect(manual).toMatchObject({ isEnabled: false, source: 'manual' });
        expect(
          (
            await adminRequest(`/admin/provider-models/${manual.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ isEnabled: true }),
            })
          ).status,
        ).toBe(200);
        for (const stage of ['network', 'models', 'chat'] as const) {
          const response = await adminRequest(
            `/admin/provider-connections/${connection.id}/test`,
            {
              method: 'POST',
              body: JSON.stringify({ stage, providerModelId: manual.id }),
            },
          );
          const result: unknown = await response.json();
          expect(
            response.status,
            `${stage}: ${JSON.stringify(result)}; requests=${providerRequests.join(',')}`,
          ).toBe(200);
        }
        expect(providerHeaders).toEqual([undefined, undefined]);
        redirectNextHead = true;
        const beforeRedirect = providerRequests.length;
        const redirected = await adminRequest(
          `/admin/provider-connections/${connection.id}/test`,
          {
            method: 'POST',
            body: JSON.stringify({ stage: 'network' }),
          },
        );
        expect(redirected.status).toBe(422);
        expect(providerRequests.slice(beforeRedirect)).toEqual(['HEAD /v1']);
        const sync = await adminRequest(
          `/admin/provider-connections/${connection.id}/models/sync`,
          { method: 'POST' },
        );
        expect(sync.status).toBe(200);
        expect(((await sync.json()) as { baseUrl: string }).baseUrl).toBe(
          '[REDACTED]',
        );
        expect(providerHeaders.at(-1)).toBeUndefined();
        const afterSync = await adminRequest('/admin/provider-connections');
        const found = (
          (await afterSync.json()) as {
            connections: Array<{ id: string; models: Array<{ id: string }> }>;
          }
        ).connections.find((item) => item.id === connection.id);
        expect(found?.models.some((model) => model.id === manual.id)).toBe(
          true,
        );
        failNextModels = true;
        const failedSync = await adminRequest(
          `/admin/provider-connections/${connection.id}/models/sync`,
          { method: 'POST' },
        );
        expect(failedSync.status).toBe(502);
        const afterFailedSync = await adminRequest(
          '/admin/provider-connections',
        );
        const preserved = (
          (await afterFailedSync.json()) as {
            connections: Array<{ id: string; models: Array<{ id: string }> }>;
          }
        ).connections.find((item) => item.id === connection.id);
        expect(preserved?.models.some((model) => model.id === manual.id)).toBe(
          true,
        );
        const denied = await adminRequest(
          '/admin/provider-connections/custom',
          {
            method: 'POST',
            body: JSON.stringify({
              name: 'denied',
              baseUrl: 'http://169.254.169.254:80/v1',
              authMode: 'none',
              destinationKind: 'local',
              approvedLocalIp: '169.254.169.254',
              approvedLocalPort: 80,
            }),
          },
        );
        expect(denied.status).toBe(422);

        const userId = randomUUID();
        const userToken = randomBytes(32).toString('base64url');
        const userCsrf = randomBytes(32).toString('base64url');
        const userCookie = `modelnaru_session=${userToken}; modelnaru_csrf=${userCsrf}`;
        await sql`INSERT INTO users (id, username, username_normalized, password_hash)
        VALUES (${userId}, 'n07http', 'n07http', '$argon2id$fixture')`;
        await sql`INSERT INTO sessions (principal_type, user_id, account_key, token_hash,
        csrf_token_hash, credential_fingerprint, idle_expires_at, absolute_expires_at)
        VALUES ('user', ${userId}, ${`user:${userId}`}, ${sha(userToken)}, ${sha(userCsrf)},
          ${sha(`modelnaru:user-credential:v1\0${userId}\0${1}`)}, now() + interval '1 hour', now() + interval '1 day')`;
        await sql`INSERT INTO user_model_permissions (user_id, provider_model_id) VALUES (${userId}, ${manual.id})`;
        const userRequest = (path: string, init: RequestInit = {}) =>
          fetch(`${base}${path}`, {
            ...init,
            headers: {
              Cookie: userCookie,
              'x-csrf-token': userCsrf,
              'content-type': 'application/json',
              ...init.headers,
            },
          });
        expect((await userRequest('/admin/provider-connections')).status).toBe(
          403,
        );
        expect((await userRequest('/admin/title-generation')).status).toBe(403);
        expect((await adminRequest('/admin/title-generation')).status).toBe(
          200,
        );
        expect(
          (
            await adminRequest('/admin/title-generation', {
              method: 'PUT',
              body: JSON.stringify({ providerModelId: manual.id }),
            })
          ).status,
        ).toBe(200);
        const conversationResponse = await userRequest('/conversations', {
          method: 'POST',
          body: JSON.stringify({
            defaultProviderModelId: manual.id,
            requestTraceLimit: 0,
          }),
        });
        expect(conversationResponse.status).toBe(201);
        const conversation = (await conversationResponse.json()) as {
          id: string;
        };
        // N09 uses the same isolated HTTP API and PostgreSQL fixture.
        const navigationResponse = await userRequest('/conversations', {
          method: 'POST',
          body: JSON.stringify({
            title: 'N09 navigation',
            defaultProviderModelId: manual.id,
            requestTraceLimit: 0,
          }),
        });
        expect(navigationResponse.status).toBe(201);
        const navigation = (await navigationResponse.json()) as {
          id: string;
          settingsRevision: string;
        };
        expect(
          (
            await userRequest(`/conversations/${navigation.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ isPinned: true }),
            })
          ).status,
        ).toBe(400);
        const patches = await Promise.all(
          [true, false].map((isPinned) =>
            userRequest(`/conversations/${navigation.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                settingsRevision: navigation.settingsRevision,
                isPinned,
              }),
            }),
          ),
        );
        expect(patches.map((x) => x.status).sort()).toEqual([200, 409]);
        const conflict = (await patches
          .find((x) => x.status === 409)!
          .json()) as {
          error: {
            code: string;
            settingsRevision: string;
            conversation: { id: string };
          };
        };
        expect(conflict.error).toMatchObject({
          code: 'CHAT_SETTINGS_CONFLICT',
          settingsRevision: '2',
          conversation: { id: navigation.id },
        });
        const searched = (await (
          await userRequest('/conversations?query=N09&limit=1')
        ).json()) as {
          conversations: { id: string }[];
          nextCursor: string | null;
        };
        expect(searched.conversations.map((x) => x.id)).toEqual([
          navigation.id,
        ]);
        expect(searched.nextCursor).toBeNull();
        const secondNavigation = (await (
          await userRequest('/conversations', {
            method: 'POST',
            body: JSON.stringify({ title: 'N09 second' }),
          })
        ).json()) as { id: string };
        const firstPage = (await (
          await userRequest('/conversations?query=N09&limit=1')
        ).json()) as { conversations: { id: string }[]; nextCursor: string };
        const secondPage = (await (
          await userRequest(
            `/conversations?query=N09&limit=1&cursor=${firstPage.nextCursor}`,
          )
        ).json()) as { conversations: { id: string }[]; nextCursor: null };
        expect(
          new Set(
            [...firstPage.conversations, ...secondPage.conversations].map(
              (x) => x.id,
            ),
          ),
        ).toEqual(new Set([navigation.id, secondNavigation.id]));
        expect(secondPage.nextCursor).toBeNull();
        const invalidPosition = JSON.parse(
          Buffer.from(firstPage.nextCursor, 'base64url').toString('utf8'),
        ) as Record<string, unknown>;
        invalidPosition.time = '2026-02-31T12:00:00.000000Z';
        const invalidCursor = Buffer.from(
          JSON.stringify(invalidPosition),
        ).toString('base64url');
        expect(
          (
            await userRequest(
              `/conversations?query=N09&cursor=${invalidCursor}`,
            )
          ).status,
        ).toBe(400);
        expect(
          (
            await userRequest(
              `/conversations?query=other&cursor=${firstPage.nextCursor}`,
            )
          ).status,
        ).toBe(400);
        expect(
          (await userRequest('/conversations?query=a&query=b')).status,
        ).toBe(400);
        expect(
          (
            await userRequest(`/model-favorites/${manual.id}`, {
              method: 'PUT',
              headers: { 'x-csrf-token': '' },
            })
          ).status,
        ).toBe(403);
        expect(
          (
            await userRequest(`/model-favorites/${manual.id}`, {
              method: 'PUT',
            })
          ).status,
        ).toBe(204);
        expect(
          (
            await userRequest(`/model-favorites/${manual.id}`, {
              method: 'PUT',
            })
          ).status,
        ).toBe(204);
        expect(await (await userRequest('/model-favorites')).json()).toEqual({
          favorites: [{ providerModelId: manual.id, selectable: true }],
        });
        const modelSearch = (await (
          await userRequest('/access/models?favoriteOnly=true')
        ).json()) as { models: { id: string; isFavorite: boolean }[] };
        expect(
          modelSearch.models.map((x) => ({
            id: x.id,
            isFavorite: x.isFavorite,
          })),
        ).toEqual([{ id: manual.id, isFavorite: true }]);
        const uploaded = await userRequest(
          `/files/conversations/${navigation.id}`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/octet-stream',
              'x-file-name': 'notes.txt',
              'x-file-media-type': 'text/plain',
              'x-include-in-future': 'true',
            },
            body: 'N09 text attachment',
          },
        );
        expect(uploaded.status).toBe(201);
        const attachment = (await uploaded.json()) as {
          id: string;
          status: string;
        };
        expect(attachment.status).toBe('ready');
        const pending = (await (
          await userRequest(`/files/conversations/${navigation.id}/pending`)
        ).json()) as { attachments: { id: string }[] };
        expect(pending.attachments.some((x) => x.id === attachment.id)).toBe(
          true,
        );
        const metadata = (await (
          await userRequest(
            `/files/conversations/${navigation.id}/${attachment.id}`,
          )
        ).json()) as Record<string, unknown>;
        expect(metadata.status).toBe('ready');
        expect(metadata).not.toHaveProperty('storageKey');
        expect(metadata).not.toHaveProperty('extractedText');
        expect(
          (
            await userRequest(
              `/files/conversations/${navigation.id}/${attachment.id}/retry`,
              { method: 'POST' },
            )
          ).status,
        ).toBe(409);
        await sql`UPDATE attachments SET status='failed',extracted_text=NULL,text_encoding=NULL WHERE id=${attachment.id}`;
        expect(
          (
            await userRequest(
              `/files/conversations/${navigation.id}/${attachment.id}/retry`,
              { method: 'POST' },
            )
          ).status,
        ).toBe(200);
        expect(
          (
            await userRequest(`/model-favorites/${manual.id}`, {
              method: 'DELETE',
            })
          ).status,
        ).toBe(204);
        holdNextChat = true;
        const started = await userRequest(
          `/conversations/${conversation.id}/jobs`,
          {
            method: 'POST',
            headers: { 'idempotency-key': randomUUID() },
            body: JSON.stringify({
              settingsRevision: '1',
              content: 'Question',
              providerModelId: manual.id,
              parameters: {},
            }),
          },
        );
        expect(started.status).toBe(202);
        const job = ((await started.json()) as { job: { id: string } }).job;
        await until(
          () => held.length,
          (length) => length === 1,
        );
        const blockedUpdate = await adminRequest(
          `/admin/provider-connections/${connection.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              apiKey: 'new-fixture-key',
              authMode: 'bearer',
            }),
          },
        );
        expect(blockedUpdate.status).toBe(409);
        const pin = await userRequest(`/conversations/${conversation.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ settingsRevision: '1', isPinned: true }),
        });
        expect(pin.status).toBe(200);
        const pinned = (await pin.json()) as {
          settingsRevision: string;
          activeJob: unknown;
        };
        expect(pinned.activeJob).toMatchObject({
          id: job.id,
          status: 'streaming',
        });
        const stale = await userRequest(`/conversations/${conversation.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ settingsRevision: '1', isPinned: false }),
        });
        expect(stale.status).toBe(409);
        expect(await stale.json()).toMatchObject({
          error: {
            code: 'CHAT_SETTINGS_CONFLICT',
            settingsRevision: pinned.settingsRevision,
            conversation: { activeJob: pinned.activeJob, isPinned: true },
          },
        });
        held[0]!.end(
          'data: {"choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        );
        await until(
          async () => {
            const response = await userRequest(
              `/conversations/${conversation.id}/jobs/${job.id}`,
            );
            return ((await response.json()) as { job: { status: string } }).job
              .status;
          },
          (status) => status === 'completed',
        );
        await until(
          async () => {
            const response = await userRequest(
              `/conversations/${conversation.id}`,
            );
            return (await response.json()) as {
              title: string;
              titleSource: string;
              titleStatus: string;
            };
          },
          (value) => value.titleStatus === 'completed',
        );
        expect(
          await (await userRequest(`/conversations/${conversation.id}`)).json(),
        ).toMatchObject({
          title: 'OK',
          titleSource: 'auto',
          titleStatus: 'completed',
          activeJob: null,
        });
        const unpin = await userRequest(`/conversations/${conversation.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            settingsRevision: pinned.settingsRevision,
            isPinned: false,
          }),
        });
        expect(unpin.status).toBe(200);
        expect(await unpin.json()).toMatchObject({ activeJob: null });
        const titleUsage =
          await sql`SELECT status, usage_known FROM usage_events
          WHERE conversation_id = ${conversation.id} AND operation_type = 'title'`;
        expect(titleUsage).toHaveLength(1);
        expect(titleUsage[0]).toMatchObject({
          status: 'completed',
          usage_known: false,
        });
        const changed = await adminRequest(
          `/admin/provider-connections/${connection.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              apiKey: 'new-fixture-key',
              authMode: 'bearer',
            }),
          },
        );
        expect(changed.status).toBe(200);
        const keyedTest = await adminRequest(
          `/admin/provider-connections/${connection.id}/test`,
          {
            method: 'POST',
            body: JSON.stringify({ stage: 'chat', providerModelId: manual.id }),
          },
        );
        expect(keyedTest.status).toBe(200);
        expect(providerHeaders.at(-1)).toBe('Bearer new-fixture-key');
      } finally {
        await stopApi();
        for (const response of held) response.destroy();
        if (mock) await new Promise<void>((done) => mock!.close(() => done()));
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
