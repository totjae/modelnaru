import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, stringify } from 'yaml';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  loadConfig,
  modelNaruConfigSchema,
  redactConfig,
  validateRuntimeConfig,
  writeConfigAtomic,
} from '../src/index.js';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

const validConfig = {
  version: 1,
  server: {
    host: '127.0.0.1',
    port: 32432,
    publicBaseUrl: 'https://chat.example.com',
    trustProxy: { enabled: true, addresses: ['127.0.0.1/32'] },
    shutdownGraceSeconds: 30,
  },
  admin: {
    username: 'admin',
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$fake$fake',
    totpSecret: 'ABCDEFGHIJKLMNOP',
    requireTotp: true,
  },
  database: { urlFile: './secrets/database_url' },
  storage: {
    root: './data/uploads',
    temp: './data/temp',
    attachmentRetentionDays: 30,
    minimumFreeBytesForUpload: 20_000,
    warningFreeBytes: 40_000,
  },
  security: {
    cookieSecure: true,
    cookieSameSite: 'lax',
    allowedHosts: ['chat.example.com'],
    csrfEnabled: true,
  },
  sessions: {
    maximumActivePerAccount: 3,
    idleTimeoutHours: 24,
    absoluteTimeoutDays: 7,
  },
  limits: {
    maximumGlobalAiGenerations: 3,
    maximumAiGenerationsPerUser: 2,
    maximumPdfWorkers: 1,
    maximumOcrWorkers: 1,
    maximumFileBytes: 10_485_760,
    maximumAttachmentsPerMessage: 10,
    maximumPdfPages: 100,
  },
  logging: { level: 'info', directory: './data/logs' },
  providerSecrets: {
    masterEncryptionKeyFile: './secrets/provider_master_key',
  },
} as const;

describe('ModelNaru config', () => {
  it('loads YAML and resolves paths from the config directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'modelnaru-config-'));
    const configPath = join(root, 'config.yaml');
    await writeFile(configPath, stringify(validConfig), 'utf8');

    const loaded = await loadConfig(configPath);

    expect(loaded.config.server.port).toBe(32432);
    expect(loaded.paths.storageRoot).toBe(join(root, 'data', 'uploads'));
    expect(loaded.paths.databaseUrlFile).toBe(
      join(root, 'secrets', 'database_url'),
    );
  });

  it.each([
    ['invalid port', { server: { ...validConfig.server, port: 70_000 } }],
    [
      'insecure public URL',
      {
        server: { ...validConfig.server, publicBaseUrl: 'http://example.com' },
      },
    ],
    ['disabled TOTP', { admin: { ...validConfig.admin, requireTotp: false } }],
    [
      'non-Argon2id hash',
      { admin: { ...validConfig.admin, passwordHash: 'x' } },
    ],
  ])('rejects %s', (_label, override) => {
    expect(() =>
      modelNaruConfigSchema.parse({ ...validConfig, ...override }),
    ).toThrow();
  });

  it('redacts administrator secrets', () => {
    const parsed = modelNaruConfigSchema.parse(validConfig);
    const redacted = redactConfig(parsed) as {
      admin: { passwordHash: string; totpSecret: string };
    };

    expect(redacted.admin.passwordHash).toBe('[REDACTED]');
    expect(redacted.admin.totpSecret).toBe('[REDACTED]');
    expect(JSON.stringify(redacted)).not.toContain(parsed.admin.totpSecret);
  });

  it('accepts the tracked example config', async () => {
    const loaded = await loadConfig(
      join(repositoryRoot, 'config.example.yaml'),
    );
    expect(loaded.config.version).toBe(1);
  });

  it('validates runtime secret contents', async () => {
    const root = await mkdtemp(join(tmpdir(), 'modelnaru-runtime-'));
    const configPath = join(root, 'config.yaml');
    await mkdir(join(root, 'secrets'), { recursive: true });
    await writeFile(configPath, stringify(validConfig), { mode: 0o600 });
    await writeFile(
      join(root, 'secrets', 'database_url'),
      'postgresql://modelnaru:test@postgres:5432/modelnaru\n',
      { mode: 0o600 },
    );
    await writeFile(
      join(root, 'secrets', 'provider_master_key'),
      `${Buffer.alloc(32, 7).toString('base64url')}\n`,
      { mode: 0o600 },
    );

    const issues = await validateRuntimeConfig(await loadConfig(configPath));
    expect(issues).toEqual([]);
  });

  it('publishes only the gateway port in Compose', async () => {
    const composeSchema = z.object({
      services: z.record(
        z.string(),
        z
          .object({
            network_mode: z.string().optional(),
            ports: z.array(z.string()).optional(),
          })
          .loose(),
      ),
    });
    const document: unknown = parseYaml(
      await readFile(join(repositoryRoot, 'compose.yaml'), 'utf8'),
    );
    const compose = composeSchema.parse(document);
    const publishedServices = Object.entries(compose.services)
      .filter(([, service]) => service.ports !== undefined)
      .map(([name]) => name);

    expect(publishedServices).toEqual(['gateway']);
    expect(compose.services['admin-tool']?.network_mode).toBe('none');
  });

  it('does not invoke a package manager in production containers', async () => {
    const compose = await readFile(
      join(repositoryRoot, 'compose.yaml'),
      'utf8',
    );
    const dockerfile = await readFile(
      join(repositoryRoot, 'Dockerfile'),
      'utf8',
    );

    expect(compose).not.toMatch(/command:\s*\[[^\]]*['"]pnpm['"]/s);
    expect(dockerfile).not.toMatch(/CMD\s*\[[^\]]*['"]pnpm['"]/g);
    expect(compose).toContain("'/workspace/packages/database/dist/migrate.js'");
    expect(dockerfile).toContain(
      'CMD ["node", "--enable-source-maps", "dist/main.js"]',
    );
  });

  it.runIf(process.platform !== 'win32')(
    'refuses to replace a symbolic-link config',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'modelnaru-symlink-'));
      const actualPath = join(root, 'actual.yaml');
      const linkedPath = join(root, 'linked.yaml');
      await mkdir(root, { recursive: true });
      await writeFile(actualPath, stringify(validConfig), 'utf8');
      await symlink(actualPath, linkedPath);

      await expect(
        writeConfigAtomic(linkedPath, modelNaruConfigSchema.parse(validConfig)),
      ).rejects.toThrow('symbolic-link');
    },
  );
});
