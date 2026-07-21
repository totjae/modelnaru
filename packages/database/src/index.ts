import { readFile } from 'node:fs/promises';

import postgres, { type Sql } from 'postgres';

import type { LoadedConfig } from '@modelnaru/config';

export type DatabaseClient = Sql<Record<string, never>>;

export async function readDatabaseUrl(loaded: LoadedConfig): Promise<string> {
  const databaseUrl = (
    await readFile(loaded.paths.databaseUrlFile, 'utf8')
  ).trim();
  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Database URL must use the PostgreSQL protocol');
  }
  return databaseUrl;
}

export async function createDatabaseClient(
  loaded: LoadedConfig,
): Promise<DatabaseClient> {
  const databaseUrl = await readDatabaseUrl(loaded);
  return postgres(databaseUrl, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 5,
    onnotice: () => undefined,
  });
}

export async function checkDatabase(client: DatabaseClient): Promise<void> {
  await client`SELECT 1 AS healthy`;
}

export { loadMigrationPlan, type Migration } from './migration-plan.js';
