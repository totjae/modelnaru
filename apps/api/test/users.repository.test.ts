import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../src/database.service.js';
import {
  UsersRepository,
  type UserAuditContext,
} from '../src/users.repository.js';

interface CapturedQuery {
  text: string;
  values: unknown[];
}

const baseRow = {
  created_at: new Date('2026-07-22T00:00:00Z'),
  credential_version: 1,
  display_name: 'User One',
  id: '00000000-0000-4000-8000-000000000001',
  is_enabled: true,
  updated_at: new Date('2026-07-22T00:00:00Z'),
  username: 'user1',
};

const audit: UserAuditContext = {
  actorId: 'admin:admin',
  ipHash: Buffer.alloc(32),
  reason: 'security review',
};

function databaseFor(updatedRow: typeof baseRow) {
  const queries: CapturedQuery[] = [];
  const transaction = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?');
      queries.push({ text, values });
      if (text.includes('SELECT id, username')) {
        return Promise.resolve([baseRow]);
      }
      if (text.includes('UPDATE users')) {
        return Promise.resolve([updatedRow]);
      }
      return Promise.resolve([]);
    },
    { json: (value: unknown) => value },
  );
  const client = {
    begin: vi.fn((callback: (sql: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
    ),
  };
  return {
    database: { getClient: () => client } as unknown as DatabaseService,
    queries,
  };
}

describe('UsersRepository mutation transaction', () => {
  it('revokes sessions and writes a credential-free audit on disable', async () => {
    const target = databaseFor({ ...baseRow, is_enabled: false });
    const repository = new UsersRepository(target.database);

    await repository.update(baseRow.id, { isEnabled: false }, audit);

    const sessionQuery = target.queries.find((query) =>
      query.text.includes('UPDATE sessions'),
    );
    const auditQuery = target.queries.find((query) =>
      query.text.includes('INSERT INTO audit_logs'),
    );
    expect(sessionQuery?.values).toContain('account_disabled');
    expect(auditQuery?.values).toContain('user.disabled');
    expect(JSON.stringify(auditQuery?.values)).not.toMatch(
      /password|token|hash/iu,
    );
  });

  it('increments the credential version and revokes sessions on password reset', async () => {
    const target = databaseFor({ ...baseRow, credential_version: 2 });
    const repository = new UsersRepository(target.database);

    await repository.setPassword(baseRow.id, '$argon2id$test', audit);

    const sessionQuery = target.queries.find((query) =>
      query.text.includes('UPDATE sessions'),
    );
    const auditQuery = target.queries.find((query) =>
      query.text.includes('INSERT INTO audit_logs'),
    );
    expect(sessionQuery?.text).toContain("revoked_reason = 'password_changed'");
    expect(auditQuery?.values).toContain('user.password_changed');
    expect(auditQuery?.values).not.toContain('$argon2id$test');
  });

  it('removes username and display name from the deletion audit snapshot', async () => {
    const target = databaseFor(baseRow);
    const repository = new UsersRepository(target.database);

    await repository.delete(baseRow.id, audit);

    const auditQuery = target.queries.find((query) =>
      query.text.includes('INSERT INTO audit_logs'),
    );
    expect(auditQuery?.values).toContain('user.deleted');
    expect(JSON.stringify(auditQuery?.values)).not.toContain(baseRow.username);
    expect(JSON.stringify(auditQuery?.values)).not.toContain(
      baseRow.display_name,
    );
  });
});
