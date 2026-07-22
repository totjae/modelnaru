import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadMigrationPlan } from '../src/migration-plan.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('migration plan', () => {
  it('loads migrations in version order with stable checksums', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'modelnaru-migrations-'));
    await writeFile(join(directory, '0002_second.sql'), 'SELECT 2;\n');
    await writeFile(join(directory, '0001_first.sql'), 'SELECT 1;\n');
    await writeFile(join(directory, 'README.md'), 'ignored');

    const plan = await loadMigrationPlan(directory);

    expect(plan.map((migration) => migration.version)).toEqual([
      '0001_first.sql',
      '0002_second.sql',
    ]);
    expect(plan[0]?.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(plan[0]?.checksum).not.toBe(plan[1]?.checksum);
  });

  it('rejects duplicate sequence numbers', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'modelnaru-duplicates-'));
    await writeFile(join(directory, '0001_first.sql'), 'SELECT 1;\n');
    await writeFile(join(directory, '0001_other.sql'), 'SELECT 2;\n');

    await expect(loadMigrationPlan(directory)).rejects.toThrow(
      'Duplicate migration sequence',
    );
  });

  it('rejects empty migrations', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'modelnaru-empty-'));
    await writeFile(join(directory, '0001_empty.sql'), '  \n');

    await expect(loadMigrationPlan(directory)).rejects.toThrow(
      'Migration is empty',
    );
  });

  it('contains the required authentication constraints and indexes', async () => {
    const sql = await readFile(
      join(packageRoot, 'migrations', '0001_auth_foundation.sql'),
      'utf8',
    );

    expect(sql).toContain('CREATE TABLE users');
    expect(sql).toContain('CREATE TABLE sessions');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).toContain('sessions_token_hash_unique');
    expect(sql).toContain('sessions_active_account_created_idx');
    expect(sql).toContain('octet_length(token_hash) = 32');
  });

  it('contains the user-management audit table without credential fields', async () => {
    const sql = await readFile(
      join(packageRoot, 'migrations', '0002_user_management_audit.sql'),
      'utf8',
    );

    expect(sql).toContain('CREATE TABLE audit_logs');
    expect(sql).toContain('before_data jsonb');
    expect(sql).toContain('after_data jsonb');
    expect(sql).toContain('audit_logs_target_idx');
    expect(sql).not.toContain('password_hash');
    expect(sql).not.toContain('token_hash');
  });

  it('defines encrypted provider credentials, models and user permissions', async () => {
    const sql = await readFile(
      join(packageRoot, 'migrations', '0003_provider_registry.sql'),
      'utf8',
    );

    expect(sql).toContain('CREATE TABLE provider_connections');
    expect(sql).toContain('credential_ciphertext bytea NOT NULL');
    expect(sql).toContain('octet_length(credential_nonce) = 12');
    expect(sql).toContain('CREATE TABLE provider_models');
    expect(sql).toContain('CREATE TABLE user_model_permissions');
    expect(sql).not.toMatch(/api_key|password_hash|secret_access_key/iu);
  });

  it('defines guest principals, access policy and atomic daily counters', async () => {
    const sql = await readFile(
      join(packageRoot, 'migrations', '0004_access_and_guest.sql'),
      'utf8',
    );

    expect(sql).toContain("principal_type IN ('admin', 'user', 'guest')");
    expect(sql).toContain('CREATE TABLE guest_settings');
    expect(sql).toContain('CREATE TABLE guest_principals');
    expect(sql).toContain('CREATE TABLE guest_model_permissions');
    expect(sql).toContain('CREATE TABLE daily_usage_counters');
    expect(sql).toContain('PRIMARY KEY (usage_date, counter_key)');
    expect(sql).not.toContain('access_code text');
  });

  it('defines isolated conversations, branches and message state', async () => {
    const sql = await readFile(
      join(packageRoot, 'migrations', '0005_chat_foundation.sql'),
      'utf8',
    );

    expect(sql).toContain('CREATE TABLE conversations');
    expect(sql).toContain('CONSTRAINT conversations_owner_check');
    expect(sql).toContain('CREATE TABLE conversation_branches');
    expect(sql).toContain('conversation_branches_root_unique');
    expect(sql).toContain('CREATE TABLE messages');
    expect(sql).toContain("role IN ('user', 'assistant', 'summary')");
    expect(sql).toContain(
      "status IN ('pending', 'streaming', 'completed', 'failed', 'cancelled')",
    );
    expect(sql).toContain('DEFAULT 100000');
    expect(sql).toContain('ON DELETE CASCADE');
  });

  it('defines versioned context summaries without replacing messages', async () => {
    const sql = await readFile(
      join(packageRoot, 'migrations', '0006_context_summarization.sql'),
      'utf8',
    );

    expect(sql).toContain('CREATE TABLE summarization_settings');
    expect(sql).toContain('CREATE TABLE context_summaries');
    expect(sql).toContain('prompt_version integer NOT NULL');
    expect(sql).toContain('first_message_id uuid NOT NULL');
    expect(sql).toContain('last_message_id uuid NOT NULL');
    expect(sql).toContain('context_summaries_generation_unique');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).not.toContain('UPDATE messages');
  });
});
