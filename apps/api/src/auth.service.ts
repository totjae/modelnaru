import { Inject, Injectable } from '@nestjs/common';
import { verify } from '@node-rs/argon2';

import type { LoadedConfig } from '@modelnaru/config';

import { AttachmentLifecycleService } from './attachment-lifecycle.service.js';
import {
  constantTimeBufferEqual,
  constantTimeStringEqual,
  createAdminCredentialFingerprint,
  createKeyedMetadataHash,
  createOpaqueToken,
  sha256,
  verifyTotp,
} from './auth.crypto.js';
import { AuthRateLimiter } from './auth.rate-limiter.js';
import {
  AuthRepository,
  GuestCapacityError,
  GuestSettingsChangedError,
  type SessionRow,
  type UserCredentialRow,
} from './auth.repository.js';
import { MODELNARU_CONFIG } from './tokens.js';

export type AuthErrorCode =
  | 'AUTH_ADMIN_REQUIRED'
  | 'AUTH_CSRF_INVALID'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_RATE_LIMITED'
  | 'AUTH_SESSION_REQUIRED'
  | 'GUEST_AUTH_FAILED'
  | 'GUEST_CAPACITY_REACHED'
  | 'GUEST_DISABLED'
  | 'GUEST_RATE_LIMITED';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    readonly status: 401 | 403 | 429,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export interface LoginInput {
  ipAddress: string;
  password: string;
  totp?: string;
  userAgent: string;
  username: string;
}

export type AuthenticatedPrincipal =
  | { type: 'admin'; username: string }
  | { id: string; type: 'guest' }
  | {
      displayName: string | null;
      id: string;
      type: 'user';
      username: string;
    };

export interface AuthenticatedSession {
  absoluteExpiresAt: Date;
  csrfToken?: string;
  idleExpiresAt: Date;
  principal: AuthenticatedPrincipal;
  row: SessionRow;
  sessionToken?: string;
}

export type AuthenticatedAdminSession = AuthenticatedSession & {
  principal: Extract<AuthenticatedPrincipal, { type: 'admin' }>;
};

function userCredentialFingerprint(user: UserCredentialRow): Buffer {
  return sha256(
    `modelnaru:user-credential:v1\0${user.id}\0${user.credentialVersion}`,
  );
}

@Injectable()
export class AuthService {
  private readonly adminAccountKey: string;
  private readonly adminCredentialFingerprint: Buffer;

  constructor(
    @Inject(MODELNARU_CONFIG) private readonly loadedConfig: LoadedConfig,
    private readonly repository: AuthRepository,
    private readonly rateLimiter: AuthRateLimiter,
    private readonly attachmentLifecycle: AttachmentLifecycleService = {
      flushQueuedFiles: () => Promise.resolve(),
    } as AttachmentLifecycleService,
  ) {
    const admin = loadedConfig.config.admin;
    this.adminAccountKey = `admin:${admin.username.toLowerCase()}`;
    this.adminCredentialFingerprint = createAdminCredentialFingerprint(admin);
  }

  async login(input: LoginInput): Promise<AuthenticatedSession> {
    const rateKey = createKeyedMetadataHash(
      this.adminCredentialFingerprint,
      'login-rate',
      `${input.ipAddress}\0${input.username.toLowerCase()}`,
    ).toString('hex');
    const retryAfter = this.rateLimiter.retryAfterSeconds(rateKey);
    if (retryAfter > 0) {
      throw new AuthError(
        'AUTH_RATE_LIMITED',
        429,
        'Too many login attempts. Try again later.',
        retryAfter,
      );
    }

    const session = await (this.isAdminUsername(input.username)
      ? this.authenticateAdminCredentials(input)
      : this.authenticateUserCredentials(input));
    if (!session) {
      const nextRetryAfter = this.rateLimiter.recordFailure(rateKey);
      throw new AuthError(
        nextRetryAfter > 0 ? 'AUTH_RATE_LIMITED' : 'AUTH_INVALID_CREDENTIALS',
        nextRetryAfter > 0 ? 429 : 401,
        nextRetryAfter > 0
          ? 'Too many login attempts. Try again later.'
          : 'Invalid login credentials.',
        nextRetryAfter || undefined,
      );
    }
    this.rateLimiter.reset(rateKey);

    const now = Date.now();
    const sessionToken = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    const absoluteExpiresAt = new Date(
      now + this.loadedConfig.config.sessions.absoluteTimeoutDays * 86_400_000,
    );
    const idleExpiresAt = new Date(
      Math.min(
        now + this.loadedConfig.config.sessions.idleTimeoutHours * 3_600_000,
        absoluteExpiresAt.getTime(),
      ),
    );
    const row = await this.repository.createSession({
      absoluteExpiresAt,
      accountKey: session.accountKey,
      credentialFingerprint: session.credentialFingerprint,
      csrfTokenHash: sha256(csrfToken),
      idleExpiresAt,
      ipHash: input.ipAddress ? this.hashIpAddress(input.ipAddress) : null,
      maximumActiveSessions:
        this.loadedConfig.config.sessions.maximumActivePerAccount,
      principalType: session.principal.type,
      tokenHash: sha256(sessionToken),
      userAgentHash: input.userAgent ? sha256(input.userAgent) : null,
      userId: session.principal.type === 'user' ? session.principal.id : null,
      guestId: null,
    });

    return {
      absoluteExpiresAt,
      csrfToken,
      idleExpiresAt,
      principal: session.principal,
      row,
      sessionToken,
    };
  }

  async guestStatus(): Promise<{ enabled: boolean }> {
    const settings = await this.repository.getGuestSettings();
    return { enabled: settings.isEnabled && Boolean(settings.accessCodeHash) };
  }

  async joinGuest(input: {
    accessCode: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<AuthenticatedSession> {
    const rateKey = createKeyedMetadataHash(
      this.adminCredentialFingerprint,
      'guest-join-rate',
      input.ipAddress,
    ).toString('hex');
    const retryAfter = this.rateLimiter.consumeWindow(
      `guest-attempt:${rateKey}`,
      5,
      15 * 60 * 1_000,
    );
    if (retryAfter > 0) {
      throw new AuthError(
        'GUEST_RATE_LIMITED',
        429,
        'Too many guest access attempts. Try again later.',
        retryAfter,
      );
    }
    const settings = await this.repository.getGuestSettings();
    if (!settings.isEnabled || !settings.accessCodeHash) {
      throw new AuthError('GUEST_DISABLED', 403, 'Guest access is disabled.');
    }
    const codeMatches = await verify(settings.accessCodeHash, input.accessCode)
      .then(Boolean)
      .catch(() => false);
    if (!codeMatches) {
      throw new AuthError(
        'GUEST_AUTH_FAILED',
        401,
        'Guest access code is invalid.',
      );
    }

    const creationRetryAfter = this.rateLimiter.consumeWindow(
      `guest-creation:${rateKey}`,
      5,
      60 * 60 * 1_000,
    );
    if (creationRetryAfter > 0) {
      throw new AuthError(
        'GUEST_RATE_LIMITED',
        429,
        'Too many guest sessions were created. Try again later.',
        creationRetryAfter,
      );
    }

    const now = Date.now();
    const absoluteExpiresAt = new Date(
      now + settings.absoluteTimeoutHours * 3_600_000,
    );
    const idleExpiresAt = new Date(
      Math.min(
        now + settings.idleTimeoutMinutes * 60_000,
        absoluteExpiresAt.getTime(),
      ),
    );
    const sessionToken = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    try {
      const created = await this.repository.createGuestSession({
        absoluteExpiresAt,
        credentialFingerprint: sha256(createOpaqueToken()),
        csrfTokenHash: sha256(csrfToken),
        expectedSettingsUpdatedAt: settings.updatedAt,
        idleExpiresAt,
        ipHash: input.ipAddress ? this.hashIpAddress(input.ipAddress) : null,
        tokenHash: sha256(sessionToken),
        userAgentHash: input.userAgent ? sha256(input.userAgent) : null,
      });
      return {
        absoluteExpiresAt,
        csrfToken,
        idleExpiresAt,
        principal: { id: created.guest.id, type: 'guest' },
        row: created.session,
        sessionToken,
      };
    } catch (error) {
      if (error instanceof GuestCapacityError) {
        throw new AuthError(
          'GUEST_CAPACITY_REACHED',
          429,
          'Guest capacity has been reached.',
        );
      }
      if (error instanceof GuestSettingsChangedError) {
        throw new AuthError(
          'GUEST_AUTH_FAILED',
          401,
          'Guest access settings changed. Try again.',
        );
      }
      throw error;
    }
  }

  hashIpAddress(ipAddress: string | undefined): Buffer | null {
    return ipAddress
      ? createKeyedMetadataHash(
          this.adminCredentialFingerprint,
          'ip',
          ipAddress,
        )
      : null;
  }

  async authenticate(
    sessionToken: string | undefined,
  ): Promise<AuthenticatedSession> {
    if (!sessionToken) throw this.sessionRequired();
    const row = await this.repository.findSessionByTokenHash(
      sha256(sessionToken),
    );
    if (!row || row.revokedAt) throw this.sessionRequired();

    const current = await this.resolveCurrentPrincipal(row);
    if (!current) throw this.sessionRequired();

    const now = new Date();
    const credentialIsCurrent = constantTimeBufferEqual(
      row.credentialFingerprint,
      current.credentialFingerprint,
    );
    if (
      row.accountKey !== current.accountKey ||
      !credentialIsCurrent ||
      row.idleExpiresAt <= now ||
      row.absoluteExpiresAt <= now
    ) {
      await this.repository.revokeSession(
        row.id,
        credentialIsCurrent ? 'expired' : 'credential_changed',
      );
      throw this.sessionRequired();
    }

    const idleExpiresAt = new Date(
      Math.min(
        now.getTime() + current.idleTimeoutMilliseconds,
        row.absoluteExpiresAt.getTime(),
      ),
    );
    const touched =
      row.principalType === 'guest' && row.guestId
        ? await this.repository.touchGuest(row.guestId, idleExpiresAt, row.id)
        : await this.repository.touchSession(row.id, idleExpiresAt);
    if (!touched) {
      throw this.sessionRequired();
    }
    return {
      absoluteExpiresAt: row.absoluteExpiresAt,
      idleExpiresAt,
      principal: current.principal,
      row: { ...row, idleExpiresAt, lastSeenAt: now },
    };
  }

  async authenticateAdmin(
    sessionToken: string | undefined,
  ): Promise<AuthenticatedAdminSession> {
    const session = await this.authenticate(sessionToken);
    if (session.principal.type !== 'admin') {
      throw new AuthError(
        'AUTH_ADMIN_REQUIRED',
        403,
        'Administrator access is required.',
      );
    }
    return session as AuthenticatedAdminSession;
  }

  async logout(input: {
    csrfCookie: string | undefined;
    csrfHeader: string | undefined;
    sessionToken: string | undefined;
  }): Promise<void> {
    const session = await this.authenticateWithCsrf(input);
    if (session.row.principalType === 'guest' && session.row.guestId) {
      await this.repository.deleteGuest(session.row.guestId);
      await this.attachmentLifecycle.flushQueuedFiles();
    } else {
      await this.repository.revokeSession(session.row.id, 'logout');
    }
  }

  async authenticateWithCsrf(input: {
    csrfCookie: string | undefined;
    csrfHeader: string | undefined;
    sessionToken: string | undefined;
  }): Promise<AuthenticatedSession> {
    const session = await this.authenticate(input.sessionToken);
    const csrfHeader = input.csrfHeader ?? '';
    const csrfCookie = input.csrfCookie ?? '';
    const cookieMatchesHeader = constantTimeStringEqual(csrfCookie, csrfHeader);
    const hashMatches = constantTimeBufferEqual(
      sha256(csrfHeader),
      session.row.csrfTokenHash,
    );
    if (!csrfHeader || !cookieMatchesHeader || !hashMatches) {
      throw new AuthError('AUTH_CSRF_INVALID', 403, 'CSRF validation failed.');
    }
    return session;
  }

  async authenticateAdminWithCsrf(input: {
    csrfCookie: string | undefined;
    csrfHeader: string | undefined;
    sessionToken: string | undefined;
  }): Promise<AuthenticatedAdminSession> {
    const session = await this.authenticateWithCsrf(input);
    if (session.principal.type !== 'admin') {
      throw new AuthError(
        'AUTH_ADMIN_REQUIRED',
        403,
        'Administrator access is required.',
      );
    }
    return session as AuthenticatedAdminSession;
  }

  private isAdminUsername(username: string): boolean {
    return (
      username.toLowerCase() ===
      this.loadedConfig.config.admin.username.toLowerCase()
    );
  }

  private async authenticateAdminCredentials(input: LoginInput): Promise<{
    accountKey: string;
    credentialFingerprint: Buffer;
    principal: Extract<AuthenticatedPrincipal, { type: 'admin' }>;
  } | null> {
    const admin = this.loadedConfig.config.admin;
    const passwordMatches = await verify(admin.passwordHash, input.password)
      .then(Boolean)
      .catch(() => false);
    const totpMatches = verifyTotp(admin.totpSecret, input.totp ?? '');
    if (!passwordMatches || !totpMatches) return null;
    return {
      accountKey: this.adminAccountKey,
      credentialFingerprint: this.adminCredentialFingerprint,
      principal: { type: 'admin', username: admin.username },
    };
  }

  private async authenticateUserCredentials(input: LoginInput): Promise<{
    accountKey: string;
    credentialFingerprint: Buffer;
    principal: Extract<AuthenticatedPrincipal, { type: 'user' }>;
  } | null> {
    const user = await this.repository.findUserByUsername(input.username);
    const passwordHash =
      user?.passwordHash ?? this.loadedConfig.config.admin.passwordHash;
    const passwordMatches = await verify(passwordHash, input.password)
      .then(Boolean)
      .catch(() => false);
    if (!user || !user.isEnabled || !passwordMatches) return null;
    return {
      accountKey: `user:${user.id}`,
      credentialFingerprint: userCredentialFingerprint(user),
      principal: {
        displayName: user.displayName,
        id: user.id,
        type: 'user',
        username: user.username,
      },
    };
  }

  private async resolveCurrentPrincipal(row: SessionRow): Promise<{
    accountKey: string;
    credentialFingerprint: Buffer;
    idleTimeoutMilliseconds: number;
    principal: AuthenticatedPrincipal;
  } | null> {
    if (row.principalType === 'admin') {
      return {
        accountKey: this.adminAccountKey,
        credentialFingerprint: this.adminCredentialFingerprint,
        idleTimeoutMilliseconds:
          this.loadedConfig.config.sessions.idleTimeoutHours * 3_600_000,
        principal: {
          type: 'admin',
          username: this.loadedConfig.config.admin.username,
        },
      };
    }
    if (row.principalType === 'guest') {
      if (!row.guestId) return null;
      const guest = await this.repository.findGuestById(row.guestId);
      if (!guest || guest.deletedAt) return null;
      const settings = await this.repository.getGuestSettings();
      return {
        accountKey: `guest:${guest.id}`,
        credentialFingerprint: guest.credentialFingerprint,
        idleTimeoutMilliseconds: settings.idleTimeoutMinutes * 60_000,
        principal: { id: guest.id, type: 'guest' },
      };
    }
    if (!row.userId) return null;
    const user = await this.repository.findUserById(row.userId);
    if (!user || !user.isEnabled) {
      await this.repository.revokeSession(row.id, 'account_disabled');
      return null;
    }
    return {
      accountKey: `user:${user.id}`,
      credentialFingerprint: userCredentialFingerprint(user),
      idleTimeoutMilliseconds:
        this.loadedConfig.config.sessions.idleTimeoutHours * 3_600_000,
      principal: {
        displayName: user.displayName,
        id: user.id,
        type: 'user',
        username: user.username,
      },
    };
  }

  private sessionRequired(): AuthError {
    return new AuthError(
      'AUTH_SESSION_REQUIRED',
      401,
      'A valid session is required.',
    );
  }
}
