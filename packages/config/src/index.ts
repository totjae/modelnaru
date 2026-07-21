import {
  constants,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse, stringify } from 'yaml';

import { modelNaruConfigSchema, type ModelNaruConfig } from './schema.js';

export { modelNaruConfigSchema, type ModelNaruConfig } from './schema.js';

export interface ResolvedConfigPaths {
  databaseUrlFile: string;
  logDirectory: string;
  providerMasterEncryptionKeyFile: string;
  storageRoot: string;
  storageTemp: string;
}

export interface LoadedConfig {
  config: ModelNaruConfig;
  deploymentRoot: string;
  paths: ResolvedConfigPaths;
  sourcePath: string;
}

export interface RuntimeValidationOptions {
  requireSecretFiles?: boolean;
}

function resolveFromRoot(deploymentRoot: string, value: string): string {
  return isAbsolute(value) ? resolve(value) : resolve(deploymentRoot, value);
}

export function defaultConfigPath(): string {
  const configuredPath = process.env.APICHAT_CONFIG_FILE;
  return resolve(configuredPath ?? 'config.yaml');
}

export async function loadConfig(
  sourcePath = defaultConfigPath(),
): Promise<LoadedConfig> {
  const absoluteSourcePath = resolve(sourcePath);
  const raw = await readFile(absoluteSourcePath, 'utf8');
  const document: unknown = parse(raw);
  const config = modelNaruConfigSchema.parse(document);
  const deploymentRoot = dirname(absoluteSourcePath);

  return {
    config,
    deploymentRoot,
    sourcePath: absoluteSourcePath,
    paths: {
      databaseUrlFile: resolveFromRoot(deploymentRoot, config.database.urlFile),
      logDirectory: resolveFromRoot(deploymentRoot, config.logging.directory),
      providerMasterEncryptionKeyFile: resolveFromRoot(
        deploymentRoot,
        config.providerSecrets.masterEncryptionKeyFile,
      ),
      storageRoot: resolveFromRoot(deploymentRoot, config.storage.root),
      storageTemp: resolveFromRoot(deploymentRoot, config.storage.temp),
    },
  };
}

export async function validateRuntimeConfig(
  loaded: LoadedConfig,
  options: RuntimeValidationOptions = {},
): Promise<string[]> {
  const issues: string[] = [];
  const paths = loaded.paths;

  if (process.platform !== 'win32') {
    try {
      const configStats = await lstat(loaded.sourcePath);
      if (configStats.isSymbolicLink()) {
        issues.push('config file must not be a symbolic link');
      }
      if ((configStats.mode & 0o077) !== 0) {
        issues.push('config file permissions must be 0600 or stricter');
      }
    } catch {
      issues.push(`config file is unavailable: ${loaded.sourcePath}`);
    }
  }

  if (options.requireSecretFiles ?? true) {
    for (const [label, filePath] of [
      ['database URL', paths.databaseUrlFile],
      ['provider master encryption key', paths.providerMasterEncryptionKeyFile],
    ] as const) {
      try {
        const value = (await readFile(filePath, 'utf8')).trim();
        if (label === 'database URL') {
          const databaseUrl = new URL(value);
          if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
            issues.push('database URL must use the PostgreSQL protocol');
          }
        } else {
          const decodedKey = Buffer.from(value, 'base64url');
          if (decodedKey.byteLength !== 32) {
            issues.push('provider master encryption key must be 32 bytes');
          }
        }

        if (process.platform !== 'win32') {
          const secretStats = await lstat(filePath);
          if (!secretStats.isFile() || (secretStats.mode & 0o077) !== 0) {
            issues.push(`${label} file permissions must be 0600 or stricter`);
          }
        }
      } catch {
        issues.push(`${label} file is missing or unreadable: ${filePath}`);
      }
    }
  }

  for (const [label, directoryPath] of [
    ['storage root', paths.storageRoot],
    ['storage temp', paths.storageTemp],
    ['log directory', paths.logDirectory],
  ] as const) {
    try {
      await mkdir(directoryPath, { recursive: true });
      await lstat(directoryPath);
    } catch {
      issues.push(`${label} is unavailable: ${directoryPath}`);
    }
  }

  return issues;
}

export function redactConfig(config: ModelNaruConfig): Record<string, unknown> {
  return {
    ...config,
    admin: {
      ...config.admin,
      passwordHash: '[REDACTED]',
      totpSecret: '[REDACTED]',
    },
  };
}

export async function writeConfigAtomic(
  targetPath: string,
  input: ModelNaruConfig,
): Promise<void> {
  const config = modelNaruConfigSchema.parse(input);
  const absoluteTargetPath = resolve(targetPath);
  const targetDirectory = dirname(absoluteTargetPath);
  const lockPath = `${absoluteTargetPath}.lock`;
  const temporaryPath = `${absoluteTargetPath}.${randomUUID()}.tmp`;

  await mkdir(targetDirectory, { recursive: true });

  try {
    const targetStats = await lstat(absoluteTargetPath);
    if (targetStats.isSymbolicLink()) {
      throw new Error('Refusing to replace a symbolic-link config file');
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      throw error;
    }
  }

  const lock = await open(
    lockPath,
    constants.O_CREAT | constants.O_EXCL,
    0o600,
  );
  try {
    const temporary = await open(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    try {
      await temporary.writeFile(stringify(config, { lineWidth: 0 }), 'utf8');
      await temporary.sync();
    } finally {
      await temporary.close();
    }
    await rename(temporaryPath, absoluteTargetPath);
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
    await rm(temporaryPath, { force: true });
  }
}
