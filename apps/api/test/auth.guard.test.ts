import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  AdminMutationGuard,
  AdminSessionGuard,
  type AdminRequest,
} from '../src/auth.guard.js';
import { AuthError, type AuthService } from '../src/auth.service.js';

function contextFor(request: AdminRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('administrator guards', () => {
  it('attaches the authenticated session for read requests', async () => {
    const session = { principal: { type: 'admin', username: 'admin' } };
    const auth = {
      authenticateAdmin: vi.fn(() => Promise.resolve(session)),
    };
    const request: AdminRequest = {
      headers: { cookie: 'modelnaru_session=session-token' },
    };
    const guard = new AdminSessionGuard(auth as unknown as AuthService);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(auth.authenticateAdmin).toHaveBeenCalledWith('session-token');
    expect(request.adminSession).toBe(session);
  });

  it('requires the CSRF cookie and header for mutation requests', async () => {
    const session = { principal: { type: 'admin', username: 'admin' } };
    const auth = {
      authenticateAdminWithCsrf: vi.fn(() => Promise.resolve(session)),
    };
    const request: AdminRequest = {
      headers: {
        cookie: 'modelnaru_session=session-token; modelnaru_csrf=csrf-token',
        'x-csrf-token': 'csrf-token',
      },
    };
    const guard = new AdminMutationGuard(auth as unknown as AuthService);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(auth.authenticateAdminWithCsrf).toHaveBeenCalledWith({
      csrfCookie: 'csrf-token',
      csrfHeader: 'csrf-token',
      sessionToken: 'session-token',
    });
  });

  it('maps domain authorization failures to an HTTP error envelope', async () => {
    const auth = {
      authenticateAdmin: vi.fn(() =>
        Promise.reject(
          new AuthError(
            'AUTH_SESSION_REQUIRED',
            401,
            'A valid session is required.',
          ),
        ),
      ),
    };
    const guard = new AdminSessionGuard(auth as unknown as AuthService);

    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
