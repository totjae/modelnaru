'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { GuestShowcase } from './guest-showcase';
import { AdminWorkspace } from './admin-workspace';
import { ChatWorkspace } from './chat-workspace';
import { csrfToken } from './client-auth';

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

export function EntryWorkspace({
  guestEntry = false,
}: {
  guestEntry?: boolean;
}) {
  const router = useRouter();
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [checking, setChecking] = useState(true);
  const [guestEnabled, setGuestEnabled] = useState(false);
  const [loginMode, setLoginMode] = useState<'admin' | 'user'>('user');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [guestError, setGuestError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch('/api/auth/session', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      }).then(async (response) =>
        response.ok ? ((await response.json()) as SessionResponse) : null,
      ),
      fetch('/api/auth/guest/status', {
        credentials: 'same-origin',
        signal: controller.signal,
      })
        .then(async (response) =>
          response.ok
            ? ((await response.json()) as { enabled: boolean })
            : { enabled: false },
        )
        .catch(() => ({ enabled: false })),
    ])
      .then(([session, guest]) => {
        if (controller.signal.aborted) return;
        setPrincipal(session?.principal ?? null);
        setGuestEnabled(guest.enabled);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (guestEntry && principal) router.replace('/');
  }, [guestEntry, principal, router]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
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
      form.reset();
      setPrincipal(session.principal);
    } catch {
      setError('서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.');
    } finally {
      setSubmitting(false);
    }
  }

  async function joinGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setGuestError('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch('/api/auth/guest/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: data.get('accessCode') }),
      });
      if (!response.ok) {
        setGuestError(
          response.status === 429
            ? '현재 게스트 참가가 많거나 시도 횟수를 초과했습니다.'
            : '게스트 코드를 확인하세요.',
        );
        return;
      }
      const session = (await response.json()) as SessionResponse;
      form.reset();
      setPrincipal(session.principal);
    } catch {
      setGuestError('서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.');
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
      setLoginMode('user');
      setGuestError('');
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

  if (!checking && principal && !guestEntry) {
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
        <AdminWorkspace />
      </main>
    );
  }

  if (checking || (guestEntry && principal))
    return (
      <main className="entry-loading" role="status">
        세션 확인 중…
      </main>
    );

  if (guestEntry)
    return (
      <main className="landing-page n11-entry guest-entry">
        <nav className="guest-entry-navigation" aria-label="진입 화면">
          <Link href="/">← 사용자·관리자 로그인으로 돌아가기</Link>
        </nav>
        {guestEnabled ? (
          <section
            id="guest-experience"
            className="portfolio-section guest-portfolio"
            aria-labelledby="guest-title"
          >
            <div className="guest-story">
              <p className="eyebrow">LIVE DEMO · ISOLATED GUEST SESSION</p>
              <h1 id="guest-title" className="guest-title">
                <span>모델을 만나보세요</span>
                <span>나만의 임시 대화 공간</span>
              </h1>
              <p>
                코드를 입력하면 다른 방문자와 분리된 임시 대화 공간이
                만들어지고, 관리자가 허용한 모델과 횟수 안에서 실제 채팅 기능을
                체험할 수 있습니다.
              </p>
              <div className="guest-principles">
                <div>
                  <strong>독립 세션</strong>
                  <span>다른 게스트의 대화와 파일에 접근할 수 없습니다.</span>
                </div>
                <div>
                  <strong>제한된 권한</strong>
                  <span>허용 모델·일일 요청·동시 세션 제한을 적용합니다.</span>
                </div>
                <div>
                  <strong>자동 정리</strong>
                  <span>
                    로그아웃하거나 만료되면 임시 대화와 파일을 삭제합니다.
                  </span>
                </div>
              </div>
            </div>
            <form className="guest-demo-card" onSubmit={joinGuest}>
              <p className="card-label">GUEST ACCESS</p>
              <h3>{guestEnabled ? '게스트 채팅 시작' : '현재 체험 준비 중'}</h3>
              <p>
                {guestEnabled
                  ? '공유받은 게스트 코드를 입력하면 바로 임시 작업공간으로 이동합니다.'
                  : '관리자가 게스트 체험을 활성화하면 이곳에서 코드를 입력할 수 있습니다.'}
              </p>
              <label htmlFor="guest-code">게스트 코드</label>
              <input
                id="guest-code"
                name="accessCode"
                type="password"
                autoComplete="off"
                minLength={6}
                maxLength={128}
                disabled={!guestEnabled || checking}
                required
              />
              {guestError && (
                <p className="form-error" role="alert">
                  {guestError}
                </p>
              )}
              <button
                type="submit"
                disabled={!guestEnabled || checking || submitting}
              >
                {submitting ? '공간 만드는 중…' : '게스트로 체험하기'}
              </button>
              <small>
                대화 내용은 외부 AI 제공자에게 전송될 수 있으며 민감한 정보는
                입력하지 마세요.
              </small>
            </form>
          </section>
        ) : (
          <section
            className="guest-unavailable"
            aria-labelledby="guest-disabled-title"
          >
            <h1 id="guest-disabled-title">
              현재 게스트 체험을 이용할 수 없습니다
            </h1>
            <p>관리자가 체험을 활성화한 뒤 다시 방문해 주세요.</p>
          </section>
        )}
        <GuestShowcase />
      </main>
    );

  return (
    <main className="landing-page n11-entry">
      <section className="shell landing-hero">
        <div className="brand-panel" aria-labelledby="page-title">
          <div className="mark" aria-hidden="true" />
          <p className="eyebrow">MODELNARU · SELF-HOSTED AI WORKSPACE</p>
          <h1 id="page-title" className="landing-title">
            <span>여러 모델로 건너가는</span>
            <span>하나의 대화 공간</span>
          </h1>
          <p className="lead">
            등록된 AI 제공자와 모델을 한곳에서 관리하고,
            <br />
            계정별로 분리된 대화를 이어갑니다.
          </p>
          <div className="landing-actions">
            {guestEnabled && <Link href="/guest">게스트 체험</Link>}
          </div>
          <div className="security-note">
            <span className="status-dot" /> 공개 회원가입 없이 관리자가 계정과
            모델 권한을 관리합니다.
          </div>
        </div>

        <section className="auth-panel" aria-live="polite">
          {checking ? (
            <div className="auth-card loading-card" role="status">
              <span className="spinner" /> 세션 확인 중
            </div>
          ) : (
            <form
              key={loginMode}
              className={`auth-card auth-${loginMode}`}
              onSubmit={login}
            >
              <div className="login-mode" role="group" aria-label="로그인 유형">
                <button
                  disabled={submitting}
                  type="button"

                  aria-pressed={loginMode === 'user'}
                  className={loginMode === 'user' ? 'active' : ''}
                  onClick={() => {
                    setLoginMode('user');
                    setError('');
                  }}
                >
                  사용자
                </button>
                <button
                  disabled={submitting}
                  type="button"

                  aria-pressed={loginMode === 'admin'}
                  className={loginMode === 'admin' ? 'active' : ''}
                  onClick={() => {
                    setLoginMode('admin');
                    setError('');
                  }}
                >
                  관리자
                </button>
              </div>
              <p className="card-label">
                {loginMode === 'admin' ? 'ADMIN SIGN IN' : 'USER SIGN IN'}
              </p>
              <h2>
                {loginMode === 'admin' ? '관리자 로그인' : '사용자 로그인'}
              </h2>
              <p className="card-copy">
                {loginMode === 'admin'
                  ? '서버 설정에 등록한 관리자 계정으로 로그인하세요.'
                  : '관리자가 등록한 사용자 계정으로 로그인하세요.'}
              </p>

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

              {loginMode === 'admin' && (
                <div className="auth-totp-slot">
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
                </div>
              )}
              <div className="auth-error-slot">
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
              </div>
              <button type="submit" disabled={submitting}>
                {submitting ? '확인 중…' : '로그인'}
              </button>
            </form>
          )}
        </section>
      </section>
    </main>
  );
}
