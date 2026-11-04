import { ChatTemplatesController } from '../src/chat-templates.controller.js';
import type { AuthenticatedRequest } from '../src/auth.guard.js';
import type { RequestTraceService } from '../src/request-trace.service.js';
import { ChatTemplatesRepository } from '../src/chat-templates.js';
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
import { ChatsRepository } from '../src/chats.repository.js';
import { AccessRepository } from '../src/access.repository.js';

const databaseUrl = process.env.MODELNARU_TEST_DATABASE_URL;
describe('R3 isolated PostgreSQL templates', () => {
  (databaseUrl ? it : it.skip)(
    'preserves settings and enforces template versions, permissions and atomic application',
    async () => {
      const url = new URL(databaseUrl!);
      if (
        !['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ||
        !url.pathname.endsWith('_test')
      )
        throw new Error('Only loopback *_test DB is allowed');
      const folder = await mkdtemp(join(tmpdir(), 'modelnaru-r3-'));
      const schema = `r3_${randomUUID().replaceAll('-', '')}`;
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
          access = new AccessRepository(database);
        const templates = new ChatTemplatesRepository(database, chats, access);
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
        await sql`UPDATE provider_models SET context_window=100000,max_output_tokens=32768`;
        const a = await create('R3 user'),
          guestChat = await create('R3 guest', guestPrincipal);
        const template = await templates.save(
          undefined,
          {
            name: 'Preset',
            description: 'Test',
            isEnabled: true,
            providerModelId: restricted,
            settings: {
              systemPrompt: 'template prompt',
              generationParameters: { temperature: 0, maxOutputTokens: 16384 },
              webSearchEnabled: false,
              responseTimeoutSeconds: 77,
            },
          },
          undefined,
          'fixture-admin',
        );
        const controller = new ChatTemplatesController(
          templates,
          access,
          {} as RequestTraceService,
        );
        const guestList = await controller.list(
          {
            authenticatedSession: { principal: guestPrincipal },
          } as unknown as AuthenticatedRequest,
          { setHeader: () => undefined },
        );
        expect(guestList.templates[0]).toMatchObject({
          providerModelId: null,
          modelUnavailable: true,
        });
        const input = {
          templateId: template.id,
          templateVersion: template.version,
          settingsRevision: a.settingsRevision,
          providerModelId: model,
        };
        const first = await templates.preview(principal, a.id, input);
        if (!('previewToken' in first)) throw new Error('Expected preview');
        expect(first.settings.generationParameters).toMatchObject({
          temperature: 0,
          maxOutputTokens: 16384,
        });
        const applied = await templates.preview(
          principal,
          a.id,
          { ...input, previewToken: first.previewToken },
          true,
        );
        expect(applied).toMatchObject({
          systemPrompt: 'template prompt',
          responseTimeoutSeconds: 77,
          settingsRevision: '2',
          generationParameters: { temperature: 0, maxOutputTokens: 16384 },
        });
        await expect(
          templates.preview(
            principal,
            a.id,
            { ...input, previewToken: first.previewToken },
            true,
          ),
        ).rejects.toThrow();
        const restored = await chats.detail(principal, a.id, { limit: 50 });
        expect(restored.generationParameters.maxOutputTokens).toBe(16384);
        await expect(
          templates.preview(otherPrincipal, a.id, {
            ...input,
            settingsRevision: '2',
          }),
        ).rejects.toThrow();
        const guestInput = {
          ...input,
          settingsRevision: guestChat.settingsRevision,
        };
        const guestPreview = await templates.preview(
          guestPrincipal,
          guestChat.id,
          guestInput,
        );
        if (!('previewToken' in guestPreview))
          throw new Error('Expected preview');
        await expect(
          templates.preview(guestPrincipal, guestChat.id, {
            ...guestInput,
            providerModelId: restricted,
          }),
        ).rejects.toThrow();
        await templates.preview(
          guestPrincipal,
          guestChat.id,
          { ...guestInput, previewToken: guestPreview.previewToken },
          true,
        );
        const reasoning = await templates.preview(principal, a.id, {
          ...input,
          settingsRevision: '2',
          providerModelId: restricted,
        });
        if (!('previewToken' in reasoning)) throw new Error('Expected preview');
        expect(reasoning.excluded).toContain('temperature');
        await expect(
          templates.preview(
            principal,
            a.id,
            { ...input, settingsRevision: '2', previewToken: '0'.repeat(64) },
            true,
          ),
        ).rejects.toThrow();
        const newer = await templates.save(
          template.id,
          { ...template, name: 'Updated' },
          template.version,
          'fixture-admin',
        );
        await expect(
          templates.preview(principal, a.id, {
            ...input,
            settingsRevision: '2',
          }),
        ).rejects.toThrow();
        await expect(
          templates.delete(template.id, template.version, 'fixture-admin'),
        ).rejects.toThrow();
        const freshInput = {
          ...input,
          settingsRevision: '2',
          templateVersion: newer.version,
        };
        const fresh = await templates.preview(principal, a.id, freshInput);
        if (!('previewToken' in fresh)) throw new Error('Expected preview');
        await sql`UPDATE user_model_permissions SET is_allowed=false WHERE user_id=${user} AND provider_model_id=${model}`;
        await expect(
          templates.preview(
            principal,
            a.id,
            { ...freshInput, previewToken: fresh.previewToken },
            true,
          ),
        ).rejects.toThrow();
        expect(
          (await chats.detail(principal, a.id, { limit: 50 })).settingsRevision,
        ).toBe('2');
        await templates.delete(template.id, newer.version, 'fixture-admin');
        expect(
          (await chats.detail(principal, a.id, { limit: 50 })).systemPrompt,
        ).toBe('template prompt');
        expect(await templates.list()).toHaveLength(0);
        const audit =
          await sql`SELECT after_data FROM audit_logs WHERE target_type='chat_template'`;
        expect(JSON.stringify(audit)).not.toContain('template prompt');
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
