#!/usr/bin/env node

import { randomBytes, randomUUID } from 'node:crypto';
import { constants, lstat, mkdir, open, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { input, password } from '@inquirer/prompts';
import { Algorithm, hash } from '@node-rs/argon2';
import QRCode from 'qrcode';
import { stringify } from 'yaml';

import {
  defaultConfigPath,
  loadConfig,
  modelNaruConfigSchema,
  redactConfig,
  validateRuntimeConfig,
  writeConfigAtomic,
  type ModelNaruConfig,
} from '@modelnaru/config';

import {
  createRuntimeEnvironment,
  createTotpSecret,
  createTotpUri,
} from './helpers.js';

const command = process.argv[2] ?? 'help';
const configPath = defaultConfigPath();

function assertInteractive(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('This command requires an interactive terminal');
  }
}

async function hashPassword(value: string): Promise<string> {
  return hash(value, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19_456,
    outputLen: 32,
    parallelism: 1,
    timeCost: 2,
  });
}

async function promptPassword(): Promise<string> {
  const first = await password({
    message: '관리자 비밀번호 (12자 이상)',
    mask: '*',
    validate: (value) => value.length >= 12 || '12자 이상 입력하세요.',
  });
  const second = await password({
    message: '관리자 비밀번호 확인',
    mask: '*',
  });
  if (first !== second) {
    throw new Error('Password confirmation does not match');
  }
  return first;
}

async function writePrivateFile(
  filePath: string,
  content: string,
): Promise<void> {
  const absolutePath = resolve(filePath);
  await mkdir(dirname(absolutePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${absolutePath}.${randomUUID()}.tmp`;
  const handle = await open(
    temporaryPath,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, absolutePath);
}

async function assertConfigDoesNotExist(): Promise<void> {
  try {
    await lstat(configPath);
    throw new Error(`Config already exists: ${configPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

function hostnameFromUrl(value: string): string {
  return new URL(value).hostname;
}

async function printTotp(username: string, secret: string): Promise<void> {
  const uri = createTotpUri(username, secret);
  const qr = await QRCode.toString(uri, { type: 'terminal', small: true });
  process.stdout.write('\nTOTP를 인증 앱에 등록하세요.\n');
  process.stdout.write(qr);
  process.stdout.write(`Secret: ${secret}\n`);
  process.stdout.write(
    '이 화면을 닫기 전에 secret을 안전한 오프라인 장소에 보관하세요.\n\n',
  );
}

async function init(): Promise<void> {
  assertInteractive();
  await assertConfigDoesNotExist();

  const username = await input({
    message: '고정 관리자 ID',
    default: 'admin',
    validate: (value) =>
      /^[a-zA-Z0-9_.-]{3,64}$/.test(value) ||
      '영문, 숫자, 점, 밑줄, 하이픈 3~64자를 사용하세요.',
  });
  const publicBaseUrl = await input({
    message: '공개 HTTPS 주소',
    default: 'https://chat.example.com',
    validate: (value) => {
      try {
        return (
          new URL(value).protocol === 'https:' || 'HTTPS 주소가 필요합니다.'
        );
      } catch {
        return '올바른 URL을 입력하세요.';
      }
    },
  });
  const plainPassword = await promptPassword();
  const passwordHash = await hashPassword(plainPassword);
  const totpSecret = createTotpSecret();
  const deploymentRoot = dirname(configPath);
  const databasePassword = randomBytes(32).toString('base64url');
  const providerMasterKey = randomBytes(32).toString('base64url');
  const encodedDatabasePassword = encodeURIComponent(databasePassword);

  const config = modelNaruConfigSchema.parse({
    version: 1,
    server: {
      host: '127.0.0.1',
      port: 32432,
      publicBaseUrl,
      trustProxy: { enabled: true, addresses: ['127.0.0.1/32'] },
      shutdownGraceSeconds: 30,
    },
    admin: { username, passwordHash, totpSecret, requireTotp: true },
    database: { urlFile: './secrets/database_url' },
    storage: {
      root: './data/uploads',
      temp: './data/temp',
      attachmentRetentionDays: 30,
      minimumFreeBytesForUpload: 21_474_836_480,
      warningFreeBytes: 42_949_672_960,
    },
    security: {
      cookieSecure: true,
      cookieSameSite: 'lax',
      allowedHosts: [hostnameFromUrl(publicBaseUrl)],
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
  });

  await mkdir(resolve(deploymentRoot, 'secrets'), {
    recursive: true,
    mode: 0o700,
  });
  for (const directory of [
    'data/uploads',
    'data/temp',
    'data/logs',
    'data/postgres',
    'data/valkey',
  ]) {
    await mkdir(resolve(deploymentRoot, directory), { recursive: true });
  }
  await writePrivateFile(
    resolve(deploymentRoot, 'secrets/postgres_password'),
    `${databasePassword}\n`,
  );
  await writePrivateFile(
    resolve(deploymentRoot, 'secrets/database_url'),
    `postgresql://modelnaru:${encodedDatabasePassword}@postgres:5432/modelnaru\n`,
  );
  await writePrivateFile(
    resolve(deploymentRoot, 'secrets/provider_master_key'),
    `${providerMasterKey}\n`,
  );
  await writeConfigAtomic(configPath, config);
  await printTotp(username, totpSecret);
  process.stdout.write(`설정을 생성했습니다: ${configPath}\n`);
}

async function updateConfig(
  updater: (
    config: ModelNaruConfig,
  ) => ModelNaruConfig | Promise<ModelNaruConfig>,
): Promise<void> {
  const loaded = await loadConfig(configPath);
  const updated = await updater(loaded.config);
  await writeConfigAtomic(configPath, updated);
  process.stdout.write('설정을 변경했습니다. 서버를 다시 시작하세요.\n');
}

async function setUsername(): Promise<void> {
  assertInteractive();
  await updateConfig(async (config) => {
    const username = await input({
      message: '새 관리자 ID',
      default: config.admin.username,
      validate: (value) =>
        /^[a-zA-Z0-9_.-]{3,64}$/.test(value) ||
        '영문, 숫자, 점, 밑줄, 하이픈 3~64자를 사용하세요.',
    });
    return { ...config, admin: { ...config.admin, username } };
  });
}

async function setPassword(): Promise<void> {
  assertInteractive();
  await updateConfig(async (config) => ({
    ...config,
    admin: {
      ...config.admin,
      passwordHash: await hashPassword(await promptPassword()),
    },
  }));
}

async function resetTotp(): Promise<void> {
  assertInteractive();
  let nextSecret = '';
  let username = '';
  await updateConfig((config) => {
    nextSecret = createTotpSecret();
    username = config.admin.username;
    return {
      ...config,
      admin: { ...config.admin, totpSecret: nextSecret, requireTotp: true },
    };
  });
  await printTotp(username, nextSecret);
}

async function validate(): Promise<void> {
  const loaded = await loadConfig(configPath);
  const issues = await validateRuntimeConfig(loaded);
  if (issues.length > 0) {
    throw new Error(`Config validation failed:\n- ${issues.join('\n- ')}`);
  }
  process.stdout.write(`유효한 설정입니다: ${loaded.sourcePath}\n`);
}

async function show(): Promise<void> {
  const loaded = await loadConfig(configPath);
  process.stdout.write(
    stringify(redactConfig(loaded.config), { lineWidth: 0 }),
  );
}

async function renderEnv(): Promise<void> {
  const loaded = await loadConfig(configPath);
  const issues = await validateRuntimeConfig(loaded);
  if (issues.length > 0) {
    throw new Error(`Config validation failed:\n- ${issues.join('\n- ')}`);
  }
  const targetPath = resolve(loaded.deploymentRoot, '.runtime.env');
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  await writePrivateFile(
    temporaryPath,
    createRuntimeEnvironment(
      loaded.config.server.host,
      loaded.config.server.port,
      process.env.APICHAT_UID,
      process.env.APICHAT_GID,
    ),
  );
  await rename(temporaryPath, targetPath);
  process.stdout.write(`Compose 환경 파일을 생성했습니다: ${targetPath}\n`);
}

function printHelp(): void {
  process.stdout.write(`ModelNaru 관리자 설정 도구

Usage: apichat-admin <command>

Commands:
  init           최초 config와 secret 생성
  set-username   고정 관리자 ID 변경
  set-password   관리자 Argon2id 비밀번호 hash 변경
  reset-totp     관리자 TOTP secret 재발급
  validate       config schema와 runtime 경로 검증
  show           민감값을 가린 설정 표시
  render-env     Compose port용 .runtime.env 생성
  help           이 도움말 표시
`);
}

async function main(): Promise<void> {
  switch (command) {
    case 'init':
      return init();
    case 'set-username':
      return setUsername();
    case 'set-password':
      return setPassword();
    case 'reset-totp':
      return resetTotp();
    case 'validate':
      return validate();
    case 'show':
      return show();
    case 'render-env':
      return renderEnv();
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`오류: ${message}\n`);
  process.exitCode = 1;
});
