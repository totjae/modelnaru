'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { AccessManager } from './access-manager';
import { ChatWorkspace } from './chat-workspace';
import { csrfToken } from './client-auth';
import { ProviderManager } from './provider-manager';
import { UserManager } from './user-manager';
import { SummarizationManager } from './summarization-manager';

type Principal =
  | { type: 'admin'; username: string }
  | { id: string; type: 'guest' }
  | {
      displayName: string | null;
      id: string;
      type: 'user';
      username: string;
    };

interface SessionResponse {
  principal: Principal;
}

export default function HomePage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [checking, setChecking] = useState(true);
  const [guestEnabled, setGuestEnabled] = useState(false);
  const [loginMode, setLoginMode] = useState<'admin' | 'guest' | 'user'>(
    'user',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/auth/session', {
        credentials: 'same-origin',
        signal: controller.signal,
      }).then(async (response) =>
        response.ok ? ((await response.json()) as SessionResponse) : null,
      ),
      fetch('/api/auth/guest/status', {
        credentials: 'same-origin',
        signal: controller.signal,
      }).then(async (response) =>
        response.ok
          ? ((await response.json()) as { enabled: boolean })
          : { enabled: false },
      ),
    ])
      .then(([session, guest]) => {
        setPrincipal(session?.principal ?? null);
        setGuestEnabled(guest.enabled);
      })
      .catch(() => undefined)
      .finally(() => setChecking(false));
    return () => controller.abort();
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      if (loginMode === 'guest') {
        const response = await fetch('/api/auth/guest/session', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessCode: data.get('accessCode') }),
        });
        if (!response.ok) {
          setError(
            response.status === 429
              ? '현재 게스트 참가가 많거나 시도 횟수를 초과했습니다.'
              : '게스트 코드를 확인하세요.',
          );
          return;
        }
        const session = (await response.json()) as SessionResponse;
        setPrincipal(session.principal);
        return;
      }
      const payload: Record<string, FormDataEntryValue | null> = {
        username: data.get('username'),
        password: data.get('password'),
      };
      if (loginMode === 'admin') payload.totp = data.get('totp');
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? '로그인 시도가 많습니다. 잠시 후 다시 시도하세요.'
            : loginMode === 'admin'
              ? '관리자 ID, 비밀번호 또는 인증 코드를 확인하세요.'
              : '사용자 ID 또는 비밀번호를 확인하세요.',
        );
        return;
      }
      const session = (await response.json()) as SessionResponse;
      setPrincipal(session.principal);
    } catch {
      setError('서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.');
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken() },
      });
      if (!response.ok) throw new Error('logout failed');
      setPrincipal(null);
      const guestResponse = await fetch('/api/auth/guest/status', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (guestResponse.ok) {
        const guest = (await guestResponse.json()) as { enabled: boolean };
        setGuestEnabled(guest.enabled);
      }
    } catch {
      setError('로그아웃하지 못했습니다. 새로고침 후 다시 시도하세요.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!checking && principal) {
    if (principal.type === 'user' || principal.type === 'guest') {
      const isGuest = principal.type === 'guest';
      return (
        <main className="user-shell">
          <header className="admin-header user-header">
            <div className="admin-brand">
              <div className="mark compact-mark" aria-hidden="true" />
              <div>
                <p className="eyebrow">MODELNARU · WORKSPACE</p>
                <h1>
                  {isGuest
                    ? '게스트 체험 공간'
                    : `${principal.displayName || principal.username}님의 공간`}
                </h1>
              </div>
            </div>
            <div className="admin-session">
              <span>{isGuest ? '임시 게스트' : principal.username}</span>
              <button type="button" onClick={logout} disabled={submitting}>
                {submitting ? '처리 중…' : '로그아웃'}
              </button>
            </div>
          </header>
          {error && <div className="banner error-banner">{error}</div>}
          <ChatWorkspace isGuest={isGuest} />
        </main>
      );
    }
    return (
      <main className="admin-shell">
        <header className="admin-header">
          <div className="admin-brand">
            <div className="mark compact-mark" aria-hidden="true" />
            <div>
              <p className="eyebrow">MODELNARU · ADMIN</p>
              <h1>관리자 공간</h1>
            </div>
          </div>
          <div className="admin-session">
            <span>{principal.username}</span>
            <button type="button" onClick={logout} disabled={submitting}>
              {submitting ? '처리 중…' : '로그아웃'}
            </button>
          </div>
        </header>
        {error && <div className="banner error-banner">{error}</div>}
        <UserManager />
        <ProviderManager />
        <AccessManager />
        <SummarizationManager />
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="brand-panel" aria-labelledby="page-title">
        <div className="mark" aria-hidden="true" />
        <p className="eyebrow">MODELNARU · PRIVATE AI WORKSPACE</p>
        <h1 id="page-title">여러 모델로 건너가는 하나의 대화 공간</h1>
        <p className="lead">
          등록된 AI 제공자와 모델을 한곳에서 관리하고, 계정별로 분리된 대화를
          이어갑니다.
        </p>
        <div className="security-note">
          <span className="status-dot" /> 사용자 계정은 관리자가 생성하며
          회원가입은 제공하지 않습니다.
        </div>
      </section>

      <section className="auth-panel" aria-live="polite">
        {checking ? (
          <div className="auth-card loading-card" role="status">
            <span className="spinner" /> 세션 확인 중
          </div>
        ) : (
          <form className={`auth-card auth-${loginMode}`} onSubmit={login}>
            <div className="login-mode" role="tablist" aria-label="로그인 유형">
              <button
                type="button"
                role="tab"
                aria-selected={loginMode === 'user'}
                className={loginMode === 'user' ? 'active' : ''}
                onClick={() => {
                  setLoginMode('user');
                  setError('');
                }}
              >
                사용자
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={loginMode === 'admin'}
                className={loginMode === 'admin' ? 'active' : ''}
                onClick={() => {
                  setLoginMode('admin');
                  setError('');
                }}
              >
                관리자
              </button>
              {guestEnabled && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={loginMode === 'guest'}
                  className={loginMode === 'guest' ? 'active' : ''}
                  onClick={() => {
                    setLoginMode('guest');
                    setError('');
                  }}
                >
                  게스트
                </button>
              )}
            </div>
            <p className="card-label">
              {loginMode === 'admin'
                ? 'ADMIN SIGN IN'
                : loginMode === 'guest'
                  ? 'GUEST ACCESS'
                  : 'USER SIGN IN'}
            </p>
            <h2>
              {loginMode === 'admin'
                ? '관리자 로그인'
                : loginMode === 'guest'
                  ? '게스트로 체험하기'
                  : '사용자 로그인'}
            </h2>
            <p className="card-copy">
              {loginMode === 'admin'
                ? '서버 설정에 등록한 관리자 계정으로 로그인하세요.'
                : loginMode === 'guest'
                  ? '공유받은 코드를 입력하면 다른 사람과 분리된 임시 공간이 만들어집니다.'
                  : '관리자가 등록한 사용자 계정으로 로그인하세요.'}
            </p>

            {loginMode === 'guest' ? (
              <>
                <label htmlFor="guest-code">게스트 코드</label>
                <input
                  id="guest-code"
                  name="accessCode"
                  type="password"
                  autoComplete="off"
                  minLength={6}
                  maxLength={128}
                  required
                />
              </>
            ) : (
              <>
                <label htmlFor="username">
                  {loginMode === 'admin' ? '관리자 ID' : '사용자 ID'}
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  minLength={3}
                  maxLength={64}
                  required
                />

                <label htmlFor="password">비밀번호</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={1024}
                  required
                />
              </>
            )}

            {loginMode === 'admin' && (
              <>
                <label htmlFor="totp">인증 앱 코드</label>
                <input
                  id="totp"
                  name="totp"
                  className="totp-input"
                  type="text"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  required
                />
              </>
            )}

            {error && <p className="form-error">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? '확인 중…' : '로그인'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
