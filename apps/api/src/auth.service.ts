import { Inject, Injectable } from '@nestjs/common';
import { verify } from '@node-rs/argon2';

import type { LoadedConfig } from '@modelnaru/config';

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
import { AuthRepository, type AdminSessionRow } from './auth.repository.js';
import { MODELNARU_CONFIG } from './tokens.js';

export type AuthErrorCode =
  | 'AUTH_CSRF_INVALID'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_RATE_LIMITED'
  | 'AUTH_SESSION_REQUIRED';

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
  totp: string;
  userAgent: string;
  username: string;
}

export interface AuthenticatedAdminSession {
  absoluteExpiresAt: Date;
  csrfToken?: string;
  idleExpiresAt: Date;
  row: AdminSessionRow;
  sessionToken?: string;
  username: string;
}

@Injectable()
export class AuthService {
  private readonly accountKey: string;
  private readonly credentialFingerprint: Buffer;

  constructor(
    @Inject(MODELNARU_CONFIG) private readonly loadedConfig: LoadedConfig,
    private readonly repository: AuthRepository,
    private readonly rateLimiter: AuthRateLimiter,
  ) {
    const admin = loadedConfig.config.admin;
    this.accountKey = `admin:${admin.username.toLowerCase()}`;
    this.credentialFingerprint = createAdminCredentialFingerprint(admin);
  }

  async login(input: LoginInput): Promise<AuthenticatedAdminSession> {
    const rateKey = createKeyedMetadataHash(
      this.credentialFingerprint,
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

    const admin = this.loadedConfig.config.admin;
    const usernameMatches =
      input.username.toLowerCase() === admin.username.toLowerCase();
    const passwordMatches = await verify(admin.passwordHash, input.password)
      .then(Boolean)
      .catch(() => false);
    const totpMatches = verifyTotp(admin.totpSecret, input.totp);

    if (!usernameMatches || !passwordMatches || !totpMatches) {
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
    const row = await this.repository.createAdminSession({
      absoluteExpiresAt,
      accountKey: this.accountKey,
      credentialFingerprint: this.credentialFingerprint,
      csrfTokenHash: sha256(csrfToken),
      idleExpiresAt,
      ipHash: input.ipAddress
        ? createKeyedMetadataHash(
            this.credentialFingerprint,
            'ip',
            input.ipAddress,
          )
        : null,
      maximumActiveSessions:
        this.loadedConfig.config.sessions.maximumActivePerAccount,
      tokenHash: sha256(sessionToken),
      userAgentHash: input.userAgent ? sha256(input.userAgent) : null,
    });

    return {
      absoluteExpiresAt,
      csrfToken,
      idleExpiresAt,
      row,
      sessionToken,
      username: admin.username,
    };
  }

  hashIpAddress(ipAddress: string | undefined): Buffer | null {
    return ipAddress
      ? createKeyedMetadataHash(this.credentialFingerprint, 'ip', ipAddress)
      : null;
  }

  async authenticate(
    sessionToken: string | undefined,
  ): Promise<AuthenticatedAdminSession> {
    if (!sessionToken) {
      throw this.sessionRequired();
    }
    const row = await this.repository.findAdminSessionByTokenHash(
      sha256(sessionToken),
    );
    if (!row || row.revokedAt) {
      throw this.sessionRequired();
    }

    const now = new Date();
    const credentialIsCurrent = constantTimeBufferEqual(
      row.credentialFingerprint,
      this.credentialFingerprint,
    );
    if (
      row.accountKey !== this.accountKey ||
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
        now.getTime() +
          this.loadedConfig.config.sessions.idleTimeoutHours * 3_600_000,
        row.absoluteExpiresAt.getTime(),
      ),
    );
    if (!(await this.repository.touchSession(row.id, idleExpiresAt))) {
      throw this.sessionRequired();
    }
    return {
      absoluteExpiresAt: row.absoluteExpiresAt,
      idleExpiresAt,
      row: { ...row, idleExpiresAt, lastSeenAt: now },
      username: this.loadedConfig.config.admin.username,
    };
  }

  async logout(input: {
    csrfCookie: string | undefined;
    csrfHeader: string | undefined;
    sessionToken: string | undefined;
  }): Promise<void> {
    const session = await this.authenticateWithCsrf(input);
    await this.repository.revokeSession(session.row.id, 'logout');
  }

  async authenticateWithCsrf(input: {
    csrfCookie: string | undefined;
    csrfHeader: string | undefined;
    sessionToken: string | undefined;
  }): Promise<AuthenticatedAdminSession> {
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

  private sessionRequired(): AuthError {
    return new AuthError(
      'AUTH_SESSION_REQUIRED',
      401,
      'A valid session is required.',
    );
  }
}
