import type { LoadedConfig } from '@modelnaru/config';
import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AuthController } from '../src/auth.controller.js';
import type { AuthService } from '../src/auth.service.js';

const loadedConfig = {
  config: {
    security: { cookieSameSite: 'lax', cookieSecure: true },
  },
} as LoadedConfig;

function response() {
  return {
    clearCookie: vi.fn(),
    cookie: vi.fn(),
    setHeader: vi.fn(),
  };
}

describe('AuthController', () => {
  it('sets secure host-only session and CSRF cookies after login', async () => {
    const absoluteExpiresAt = new Date(Date.now() + 86_400_000);
    const auth = {
      login: vi.fn((input: unknown) => {
        void input;
        return Promise.resolve({
          absoluteExpiresAt,
          csrfToken: 'csrf-token',
          idleExpiresAt: new Date(Date.now() + 3_600_000),
          principal: { type: 'admin', username: 'admin' },
          row: {},
          sessionToken: 'session-token',
        });
      }),
    };
    const controller = new AuthController(
      auth as unknown as AuthService,
      loadedConfig,
    );
    const target = response();

    await expect(
      controller.login(
        {
          password: 'correct-password',
          totp: '123456',
          username: 'admin',
        },
        { headers: { 'user-agent': 'test' }, ip: '203.0.113.10' },
        target,
      ),
    ).resolves.toMatchObject({
      principal: { type: 'admin', username: 'admin' },
    });
    expect(target.cookie).toHaveBeenNthCalledWith(
      1,
      'modelnaru_session',
      'session-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: true,
      }),
    );
    expect(target.cookie.mock.calls[0]?.[2]).not.toHaveProperty('domain');
    expect(target.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(target.cookie).toHaveBeenNthCalledWith(
      2,
      'modelnaru_csrf',
      'csrf-token',
      expect.objectContaining({
        httpOnly: false,
        path: '/',
        sameSite: 'lax',
        secure: true,
      }),
    );
  });

  it('accepts a user login without a TOTP field', async () => {
    const auth = {
      login: vi.fn((input: unknown) => {
        void input;
        return Promise.resolve({
          absoluteExpiresAt: new Date(Date.now() + 86_400_000),
          csrfToken: 'csrf-token',
          idleExpiresAt: new Date(Date.now() + 3_600_000),
          principal: {
            displayName: 'User One',
            id: '10000000-0000-4000-8000-000000000001',
            type: 'user',
            username: 'user1',
          },
          row: {},
          sessionToken: 'session-token',
        });
      }),
    };
    const controller = new AuthController(
      auth as unknown as AuthService,
      loadedConfig,
    );

    await expect(
      controller.login(
        { password: 'correct-password', username: 'user1' },
        { headers: {}, ip: '203.0.113.10' },
        response(),
      ),
    ).resolves.toMatchObject({
      principal: { type: 'user', username: 'user1' },
    });
    expect(auth.login).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'user1' }),
    );
    expect(auth.login.mock.calls[0]?.[0]).not.toHaveProperty('totp');
  });

  it('rejects malformed login input before password verification', async () => {
    const auth = { login: vi.fn() };
    const controller = new AuthController(
      auth as unknown as AuthService,
      loadedConfig,
    );

    await expect(
      controller.login(
        { password: '', totp: 'x', username: 'a' },
        { headers: {} },
        response(),
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(auth.login).not.toHaveBeenCalled();
  });
});
