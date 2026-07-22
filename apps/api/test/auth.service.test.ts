import { hash, type Algorithm } from '@node-rs/argon2';
import type { LoadedConfig } from '@modelnaru/config';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAdminCredentialFingerprint,
  sha256,
} from '../src/auth.crypto.js';
import { AuthRateLimiter } from '../src/auth.rate-limiter.js';
import type {
  AuthRepository,
  CreateGuestSessionInput,
  CreateSessionInput,
  GuestSettingsRow,
  SessionRow,
  UserCredentialRow,
} from '../src/auth.repository.js';
import { AuthService, type AuthError } from '../src/auth.service.js';

const totpSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
let passwordHash = '';
let guestCodeHash = '';

beforeAll(async () => {
  passwordHash = await hash('correct-password', {
    algorithm: 2 as Algorithm,
    memoryCost: 19_456,
    outputLen: 32,
    parallelism: 1,
    timeCost: 2,
  });
  guestCodeHash = await hash('guest-access-code', {
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

function rowFrom(input: CreateSessionInput): SessionRow {
  return {
    absoluteExpiresAt: input.absoluteExpiresAt,
    accountKey: input.accountKey,
    credentialFingerprint: input.credentialFingerprint,
    csrfTokenHash: input.csrfTokenHash,
    guestId: input.guestId ?? null,
    id: '00000000-0000-4000-8000-000000000001',
    idleExpiresAt: input.idleExpiresAt,
    lastSeenAt: new Date(),
    principalType: input.principalType,
    revokedAt: null,
    tokenHash: input.tokenHash,
    userId: input.userId,
  };
}

function user(overrides: Partial<UserCredentialRow> = {}): UserCredentialRow {
  return {
    credentialVersion: 1,
    displayName: 'User One',
    id: '10000000-0000-4000-8000-000000000001',
    isEnabled: true,
    passwordHash,
    username: 'user1',
    ...overrides,
  };
}

function createRepository() {
  return {
    createGuestSession: vi.fn((input: CreateGuestSessionInput) =>
      Promise.resolve({
        guest: {
          absoluteExpiresAt: input.absoluteExpiresAt,
          credentialFingerprint: input.credentialFingerprint,
          deletedAt: null,
          id: '20000000-0000-4000-8000-000000000001',
          idleExpiresAt: input.idleExpiresAt,
        },
        session: rowFrom({
          absoluteExpiresAt: input.absoluteExpiresAt,
          accountKey: 'guest:20000000-0000-4000-8000-000000000001',
          credentialFingerprint: input.credentialFingerprint,
          csrfTokenHash: input.csrfTokenHash,
          guestId: '20000000-0000-4000-8000-000000000001',
          idleExpiresAt: input.idleExpiresAt,
          ipHash: input.ipHash,
          maximumActiveSessions: 1,
          principalType: 'guest',
          tokenHash: input.tokenHash,
          userAgentHash: input.userAgentHash,
          userId: null,
        }),
      }),
    ),
    getGuestSettings: vi.fn((): Promise<GuestSettingsRow> =>
      Promise.resolve({
        absoluteTimeoutHours: 24,
        accessCodeHash: guestCodeHash,
        fileUploadEnabled: false,
        globalDailyRequestLimit: 100,
        idleTimeoutMinutes: 60,
        isEnabled: true,
        maximumActiveSessions: 10,
        resetTimezone: 'Asia/Seoul',
        sessionDailyRequestLimit: 20,
        updatedAt: new Date(1_000),
      }),
    ),
    createSession: vi.fn((input: CreateSessionInput) =>
      Promise.resolve(rowFrom(input)),
    ),
    findSessionByTokenHash: vi.fn(),
    findUserById: vi.fn(),
    findUserByUsername: vi.fn(),
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

    expect(session.principal).toEqual({ type: 'admin', username: 'admin' });
    expect(session.sessionToken).toBeTruthy();
    expect(session.csrfToken).toBeTruthy();
    const input = repository.createSession.mock.calls[0]?.[0];
    expect(input?.principalType).toBe('admin');
    expect(input?.userId).toBeNull();
    expect(input?.maximumActiveSessions).toBe(3);
  });

  it('creates a user session without requiring TOTP', async () => {
    const repository = createRepository();
    repository.findUserByUsername.mockResolvedValue(user());
    const service = new AuthService(
      loadedConfig(),
      repository as unknown as AuthRepository,
      new AuthRateLimiter(),
    );

    const session = await service.login({
      ipAddress: '203.0.113.10',
      password: 'correct-password',
      userAgent: 'test-agent',
      username: 'USER1',
    });

    expect(session.principal).toMatchObject({
      displayName: 'User One',
      id: user().id,
      type: 'user',
      username: 'user1',
    });
    expect(repository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accountKey: `user:${user().id}`,
        principalType: 'user',
        userId: user().id,
      }),
    );
  });

  it('creates an isolated guest principal for a valid access code', async () => {
    const repository = createRepository();
    const service = new AuthService(
      loadedConfig(),
      repository as unknown as AuthRepository,
      new AuthRateLimiter(),
    );

    const session = await service.joinGuest({
      accessCode: 'guest-access-code',
      ipAddress: '203.0.113.20',
      userAgent: 'guest-agent',
    });

    expect(session.principal).toEqual({
      id: '20000000-0000-4000-8000-000000000001',
      type: 'guest',
    });
    expect(repository.createGuestSession).toHaveBeenCalledOnce();
    expect(session.idleExpiresAt.getTime()).toBe(3_659_000);
    expect(session.absoluteExpiresAt.getTime()).toBe(86_459_000);
  });

  it('rejects guest access when the feature is disabled', async () => {
    const repository = createRepository();
    repository.getGuestSettings.mockResolvedValue({
      absoluteTimeoutHours: 24,
      accessCodeHash: null,
      fileUploadEnabled: false,
      globalDailyRequestLimit: 100,
      idleTimeoutMinutes: 60,
      isEnabled: false,
      maximumActiveSessions: 10,
      resetTimezone: 'Asia/Seoul',
      sessionDailyRequestLimit: 20,
      updatedAt: new Date(1_000),
    });
    const service = new AuthService(
      loadedConfig(),
      repository as unknown as AuthRepository,
      new AuthRateLimiter(),
    );

    await expect(
      service.joinGuest({
        accessCode: 'guest-access-code',
        ipAddress: '203.0.113.20',
        userAgent: 'guest-agent',
      }),
    ).rejects.toMatchObject({ code: 'GUEST_DISABLED', status: 403 });
    expect(repository.createGuestSession).not.toHaveBeenCalled();
  });

  it('rejects disabled users without revealing the reason', async () => {
    const repository = createRepository();
    repository.findUserByUsername.mockResolvedValue(user({ isEnabled: false }));
    const service = new AuthService(
      loadedConfig(),
      repository as unknown as AuthRepository,
      new AuthRateLimiter(),
    );

    await expect(
      service.login({
        ipAddress: '203.0.113.10',
        password: 'correct-password',
        userAgent: 'test-agent',
        username: 'user1',
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      status: 401,
    } satisfies Partial<AuthError>);
    expect(repository.createSession).not.toHaveBeenCalled();
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
        username: 'admin',
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      status: 401,
    } satisfies Partial<AuthError>);
  });

  it('revokes a session when the admin credential fingerprint changed', async () => {
    const repository = createRepository();
    repository.findSessionByTokenHash.mockResolvedValue(
      rowFrom({
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
        principalType: 'admin',
        tokenHash: Buffer.alloc(32),
        userAgentHash: null,
        userId: null,
      }),
    );
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

  it('rejects a user session on administrator-only authentication', async () => {
    const repository = createRepository();
    const currentUser = user();
    repository.findUserById.mockResolvedValue(currentUser);
    repository.findSessionByTokenHash.mockResolvedValue(
      rowFrom({
        absoluteExpiresAt: new Date(900_000_000),
        accountKey: `user:${currentUser.id}`,
        credentialFingerprint: sha256(
          `modelnaru:user-credential:v1\0${currentUser.id}\0${currentUser.credentialVersion}`,
        ),
        csrfTokenHash: sha256('csrf-token'),
        idleExpiresAt: new Date(800_000_000),
        ipHash: null,
        maximumActiveSessions: 3,
        principalType: 'user',
        tokenHash: Buffer.alloc(32),
        userAgentHash: null,
        userId: currentUser.id,
      }),
    );
    const service = new AuthService(
      loadedConfig(),
      repository as unknown as AuthRepository,
      new AuthRateLimiter(),
    );

    await expect(
      service.authenticateAdmin('session-token'),
    ).rejects.toMatchObject({ code: 'AUTH_ADMIN_REQUIRED', status: 403 });
  });

  it('revokes a user session when the credential version changed', async () => {
    const repository = createRepository();
    const currentUser = user({ credentialVersion: 2 });
    repository.findUserById.mockResolvedValue(currentUser);
    repository.findSessionByTokenHash.mockResolvedValue(
      rowFrom({
        absoluteExpiresAt: new Date(900_000_000),
        accountKey: `user:${currentUser.id}`,
        credentialFingerprint: sha256(
          ['modelnaru:user-credential:v1', currentUser.id, '1'].join('\0'),
        ),
        csrfTokenHash: sha256('csrf-token'),
        idleExpiresAt: new Date(800_000_000),
        ipHash: null,
        maximumActiveSessions: 3,
        principalType: 'user',
        tokenHash: Buffer.alloc(32),
        userAgentHash: null,
        userId: currentUser.id,
      }),
    );
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
      principalType: 'admin',
      tokenHash: Buffer.alloc(32),
      userAgentHash: null,
      userId: null,
    });
    repository.findSessionByTokenHash.mockResolvedValue(validRow);
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
