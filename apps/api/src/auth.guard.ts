import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';

import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  firstHeader,
  parseCookies,
  type RequestLike,
} from './auth.controller.js';
import {
  AuthError,
  AuthService,
  type AuthenticatedAdminSession,
} from './auth.service.js';

export interface AdminRequest extends RequestLike {
  adminSession?: AuthenticatedAdminSession;
}

function asHttpException(error: unknown): never {
  if (error instanceof AuthError) {
    throw new HttpException(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  }
  throw error;
}

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const cookies = parseCookies(firstHeader(request.headers.cookie));
    try {
      request.adminSession = await this.auth.authenticateAdmin(
        cookies.get(SESSION_COOKIE),
      );
      return true;
    } catch (error) {
      return asHttpException(error);
    }
  }
}

@Injectable()
export class AdminMutationGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const cookies = parseCookies(firstHeader(request.headers.cookie));
    try {
      request.adminSession = await this.auth.authenticateAdminWithCsrf({
        csrfCookie: cookies.get(CSRF_COOKIE),
        csrfHeader: firstHeader(request.headers['x-csrf-token']),
        sessionToken: cookies.get(SESSION_COOKIE),
      });
      return true;
    } catch (error) {
      return asHttpException(error);
    }
  }
}
