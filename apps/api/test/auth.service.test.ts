import { hash, type Algorithm } from '@node-rs/argon2';
import type { LoadedConfig } from '@modelnaru/config';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAdminCredentialFingerprint,
  sha256,
} from '../src/auth.crypto.js';
import { AuthRateLimiter } from '../src/auth.rate-limiter.js';
import type {
  AdminSessionRow,
  AuthRepository,
  CreateAdminSessionInput,
} from '../src/auth.repository.js';
import { AuthService, type AuthError } from '../src/auth.service.js';

const totpSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
let passwordHash = '';

beforeAll(async () => {
  passwordHash = await hash('correct-password', {
    algorithm: 2 as Algorithm,
    memoryCost: 19_456,
    outputLen: 32,
    parallelism: 1,
    timeCost: 2,
  });
});

function loadedConfig(): LoadedConfig {
  return {
    config: {
      admin: {
        passwordHash,
        requireTotp: true,
        totpSecret,
        username: 'admin',
      },
      sessions: {
        absoluteTimeoutDays: 7,
        idleTimeoutHours: 24,
        maximumActivePerAccount: 3,
      },
    },
  } as LoadedConfig;
}

function rowFrom(input: CreateAdminSessionInput): AdminSessionRow {
  return {
    absoluteExpiresAt: input.absoluteExpiresAt,
    accountKey: input.accountKey,
    credentialFingerprint: input.credentialFingerprint,
    csrfTokenHash: input.csrfTokenHash,
    id: '00000000-0000-4000-8000-000000000001',
    idleExpiresAt: input.idleExpiresAt,
    lastSeenAt: new Date(),
    principalType: 'admin',
    revokedAt: null,
    tokenHash: input.tokenHash,
  };
}

function createRepository() {
  return {
    createAdminSession: vi.fn((input: CreateAdminSessionInput) =>
      Promise.resolve(rowFrom(input)),
    ),
    findAdminSessionByTokenHash: vi.fn(),
    revokeSession: vi.fn(() => Promise.resolve()),
    touchSession: vi.fn(() => Promise.resolve(true)),
  };
}

describe('AuthService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(59_000);
  });

  it('creates a hashed server session for valid admin credentials', async () => {
    const repository = createRepository();
    const service = new AuthService(
      loadedConfig(),
      repository as unknown as AuthRepository,
      new AuthRateLimiter(),
    );

    const session = await service.login({
      ipAddress: '203.0.113.10',
      password: 'correct-password',
      totp: '287082',
      userAgent: 'test-agent',
      username: 'ADMIN',
    });

    expect(session.sessionToken).toBeTruthy();
    expect(session.csrfToken).toBeTruthy();
    expect(repository.createAdminSession).toHaveBeenCalledOnce();
    const input = repository.createAdminSession.mock.calls[0]?.[0];
    expect(input?.tokenHash).toHaveLength(32);
    expect(input?.csrfTokenHash).toHaveLength(32);
    expect(input?.maximumActiveSessions).toBe(3);
  });

  it('does not reveal which administrator credential failed', async () => {
    const repository = createRepository();
    const service = new AuthService(
      loadedConfig(),
      repository as unknown as AuthRepository,
      new AuthRateLimiter(),
    );

    await expect(
      service.login({
        ipAddress: '203.0.113.10',
        password: 'wrong-password',
        totp: '000000',
        userAgent: 'test-agent',
        username: 'unknown',
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      status: 401,
    } satisfies Partial<AuthError>);
    expect(repository.createAdminSession).not.toHaveBeenCalled();
  });

  it('revokes a session when the admin credential fingerprint changed', async () => {
    const repository = createRepository();
    repository.findAdminSessionByTokenHash.mockResolvedValue({
      ...rowFrom({
        absoluteExpiresAt: new Date(900_000_000),
        accountKey: 'admin:admin',
        credentialFingerprint: createAdminCredentialFingerprint({
          passwordHash: 'different',
          requireTotp: true,
          totpSecret,
          username: 'admin',
        }),
        csrfTokenHash: Buffer.alloc(32),
        idleExpiresAt: new Date(800_000_000),
        ipHash: null,
        maximumActiveSessions: 3,
        tokenHash: Buffer.alloc(32),
        userAgentHash: null,
      }),
    });
    const service = new AuthService(
      loadedConfig(),
      repository as unknown as AuthRepository,
      new AuthRateLimiter(),
    );

    await expect(service.authenticate('session-token')).rejects.toMatchObject({
      code: 'AUTH_SESSION_REQUIRED',
    });
    expect(repository.revokeSession).toHaveBeenCalledWith(
      expect.any(String),
      'credential_changed',
    );
  });

  it('requires the CSRF header, cookie and stored hash to match on logout', async () => {
    const repository = createRepository();
    const config = loadedConfig();
    const validRow = rowFrom({
      absoluteExpiresAt: new Date(900_000_000),
      accountKey: 'admin:admin',
      credentialFingerprint: createAdminCredentialFingerprint(
        config.config.admin,
      ),
      csrfTokenHash: sha256('csrf-token'),
      idleExpiresAt: new Date(800_000_000),
      ipHash: null,
      maximumActiveSessions: 3,
      tokenHash: Buffer.alloc(32),
      userAgentHash: null,
    });
    repository.findAdminSessionByTokenHash.mockResolvedValue(validRow);
    const service = new AuthService(
      config,
      repository as unknown as AuthRepository,
      new AuthRateLimiter(),
    );

    await expect(
      service.logout({
        csrfCookie: 'csrf-token',
        csrfHeader: 'wrong-token',
        sessionToken: 'session-token',
      }),
    ).rejects.toMatchObject({ code: 'AUTH_CSRF_INVALID', status: 403 });
    await expect(
      service.logout({
        csrfCookie: 'csrf-token',
        csrfHeader: 'csrf-token',
        sessionToken: 'session-token',
      }),
    ).resolves.toBeUndefined();
    expect(repository.revokeSession).toHaveBeenCalledWith(
      validRow.id,
      'logout',
    );
  });
});
