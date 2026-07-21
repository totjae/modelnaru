import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '@modelnaru/config';

import { createDatabaseClient } from './index.js';
import { loadMigrationPlan } from './migration-plan.js';

interface AppliedMigration {
  checksum: string;
  version: string;
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDirectory = resolve(packageRoot, 'migrations');

async function migrate(): Promise<void> {
  const loaded = await loadConfig();
  const client = await createDatabaseClient(loaded);

  try {
    await client`SELECT pg_advisory_lock(hashtext('modelnaru:schema-migrations'))`;
    await client`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version varchar(255) PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    const plan = await loadMigrationPlan(migrationsDirectory);
    const applied = await client<AppliedMigration[]>`
      SELECT version, checksum
      FROM schema_migrations
      ORDER BY version ASC
    `;
    const plannedByVersion = new Map(
      plan.map((migration) => [migration.version, migration]),
    );

    for (const existing of applied) {
      const planned = plannedByVersion.get(existing.version);
      if (!planned) {
        throw new Error(
          `Applied migration is missing from this release: ${existing.version}`,
        );
      }
      if (planned.checksum !== existing.checksum.trim()) {
        throw new Error(`Migration checksum mismatch: ${existing.version}`);
      }
    }

    const appliedVersions = new Set(applied.map((row) => row.version));
    for (const migration of plan) {
      if (appliedVersions.has(migration.version)) {
        continue;
      }

      await client.begin(async (transaction) => {
        await transaction.unsafe(migration.sql);
        await transaction`
          INSERT INTO schema_migrations (version, checksum)
          VALUES (${migration.version}, ${migration.checksum})
        `;
      });
      process.stdout.write(`Applied migration ${migration.version}\n`);
    }

    process.stdout.write('Database migrations are up to date.\n');
  } finally {
    try {
      await client`SELECT pg_advisory_unlock(hashtext('modelnaru:schema-migrations'))`;
    } finally {
      await client.end({ timeout: 5 });
    }
  }
}

migrate().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Database migration failed: ${message}\n`);
  process.exitCode = 1;
});
