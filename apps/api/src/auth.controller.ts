import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';

import type { LoadedConfig } from '@modelnaru/config';

import { AuthError, AuthService } from './auth.service.js';
import { MODELNARU_CONFIG } from './tokens.js';

const SESSION_COOKIE = 'modelnaru_session';
const CSRF_COOKIE = 'modelnaru_csrf';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

interface ResponseLike {
  clearCookie(name: string, options: CookieOptions): void;
  cookie(name: string, value: string, options: CookieOptions): void;
  setHeader(name: string, value: string): void;
}

interface CookieOptions {
  httpOnly?: boolean;
  maxAge?: number;
  path: string;
  sameSite: 'lax' | 'strict';
  secure: boolean;
}

interface LoginBody {
  password: string;
  totp: string;
  username: string;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const item of header?.split(';') ?? []) {
    const separator = item.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    cookies.set(
      item.slice(0, separator).trim(),
      item.slice(separator + 1).trim(),
    );
  }
  return cookies;
}

function parseLoginBody(body: unknown): LoginBody | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  if (
    typeof record.username !== 'string' ||
    !/^[a-zA-Z0-9_.-]{3,64}$/u.test(record.username) ||
    typeof record.password !== 'string' ||
    record.password.length < 1 ||
    record.password.length > 1_024 ||
    typeof record.totp !== 'string' ||
    !/^\d{6}$/u.test(record.totp)
  ) {
    return undefined;
  }
  return {
    password: record.password,
    totp: record.totp,
    username: record.username,
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(MODELNARU_CONFIG) private readonly loadedConfig: LoadedConfig,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<Record<string, unknown>> {
    response.setHeader('Cache-Control', 'no-store');
    const input = parseLoginBody(body);
    if (!input) {
      throw new HttpException(
        {
          error: {
            code: 'AUTH_INPUT_INVALID',
            message: 'Login input is invalid.',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const session = await this.auth.login({
        ...input,
        ipAddress: request.ip ?? request.socket?.remoteAddress ?? '',
        userAgent: firstHeader(request.headers['user-agent']) ?? '',
      });
      this.setCookies(
        response,
        session.sessionToken!,
        session.csrfToken!,
        session.absoluteExpiresAt,
      );
      return this.responseBody(session);
    } catch (error) {
      this.throwHttpError(error, response);
    }
  }

  @Get('session')
  async session(
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<Record<string, unknown>> {
    response.setHeader('Cache-Control', 'no-store');
    const cookies = parseCookies(firstHeader(request.headers.cookie));
    try {
      return this.responseBody(
        await this.auth.authenticate(cookies.get(SESSION_COOKIE)),
      );
    } catch (error) {
      this.clearCookies(response);
      this.throwHttpError(error, response);
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    const cookies = parseCookies(firstHeader(request.headers.cookie));
    try {
      await this.auth.logout({
        csrfCookie: cookies.get(CSRF_COOKIE),
        csrfHeader: firstHeader(request.headers['x-csrf-token']),
        sessionToken: cookies.get(SESSION_COOKIE),
      });
      this.clearCookies(response);
    } catch (error) {
      if (error instanceof AuthError && error.status === 401) {
        this.clearCookies(response);
      }
      this.throwHttpError(error, response);
    }
  }

  private responseBody(session: {
    absoluteExpiresAt: Date;
    idleExpiresAt: Date;
    username: string;
  }): Record<string, unknown> {
    return {
      principal: { type: 'admin', username: session.username },
      session: {
        idleExpiresAt: session.idleExpiresAt.toISOString(),
        absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
      },
    };
  }

  private cookieOptions(httpOnly: boolean): CookieOptions {
    return {
      httpOnly,
      path: '/',
      sameSite: this.loadedConfig.config.security.cookieSameSite,
      secure: this.loadedConfig.config.security.cookieSecure,
    };
  }

  private setCookies(
    response: ResponseLike,
    sessionToken: string,
    csrfToken: string,
    absoluteExpiresAt: Date,
  ): void {
    const maxAge = Math.max(0, absoluteExpiresAt.getTime() - Date.now());
    response.cookie(SESSION_COOKIE, sessionToken, {
      ...this.cookieOptions(true),
      maxAge,
    });
    response.cookie(CSRF_COOKIE, csrfToken, {
      ...this.cookieOptions(false),
      maxAge,
    });
  }

  private clearCookies(response: ResponseLike): void {
    response.clearCookie(SESSION_COOKIE, this.cookieOptions(true));
    response.clearCookie(CSRF_COOKIE, this.cookieOptions(false));
  }

  private throwHttpError(error: unknown, response: ResponseLike): never {
    if (error instanceof AuthError) {
      if (error.retryAfterSeconds) {
        response.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw new HttpException(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    }
    throw error;
  }
}
