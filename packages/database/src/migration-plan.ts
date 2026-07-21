import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const MIGRATION_FILE_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

export interface Migration {
  checksum: string;
  sql: string;
  version: string;
}

export async function loadMigrationPlan(
  migrationsDirectory: string,
): Promise<Migration[]> {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const fileNames = entries
    .filter(
      (entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));

  const duplicates = fileNames.filter(
    (fileName, index) =>
      index > 0 && fileName.slice(0, 4) === fileNames[index - 1]?.slice(0, 4),
  );
  if (duplicates.length > 0) {
    throw new Error(`Duplicate migration sequence: ${duplicates.join(', ')}`);
  }

  return Promise.all(
    fileNames.map(async (version) => {
      const sql = await readFile(resolve(migrationsDirectory, version), 'utf8');
      if (sql.trim().length === 0) {
        throw new Error(`Migration is empty: ${version}`);
      }
      return {
        version,
        sql,
        checksum: createHash('sha256').update(sql, 'utf8').digest('hex'),
      };
    }),
  );
}
