'use client';

import { useEffect, useState, type FormEvent } from 'react';

interface Principal {
  type: 'admin';
  username: string;
}

interface SessionResponse {
  principal: Principal;
}

function csrfToken(): string {
  const prefix = 'modelnaru_csrf=';
  const item = document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return item?.slice(prefix.length) ?? '';
}

export default function HomePage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/session', {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as SessionResponse;
      })
      .then((session) => setPrincipal(session?.principal ?? null))
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
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: data.get('username'),
          password: data.get('password'),
          totp: data.get('totp'),
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? '로그인 시도가 많습니다. 잠시 후 다시 시도하세요.'
            : '관리자 ID, 비밀번호 또는 인증 코드를 확인하세요.',
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
    } catch {
      setError('로그아웃하지 못했습니다. 새로고침 후 다시 시도하세요.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <section className="brand-panel" aria-labelledby="page-title">
        <div className="mark" aria-hidden="true">
          나루
        </div>
        <p className="eyebrow">MODELNARU · PRIVATE AI WORKSPACE</p>
        <h1 id="page-title">여러 모델로 건너가는 하나의 대화 공간</h1>
        <p className="lead">
          등록된 AI 제공자와 모델을 한곳에서 관리하고, 계정별로 분리된 대화를
          이어갑니다.
        </p>
        <div className="security-note">
          <span className="status-dot" /> 관리자 로그인은 비밀번호와 TOTP 인증을
          함께 사용합니다.
        </div>
      </section>

      <section className="auth-panel" aria-live="polite">
        {checking ? (
          <div className="auth-card loading-card" role="status">
            <span className="spinner" /> 세션 확인 중
          </div>
        ) : principal ? (
          <div className="auth-card signed-in">
            <p className="card-label">ADMIN SESSION</p>
            <h2>{principal.username}</h2>
            <p>
              관리자 인증이 완료되었습니다. 다음 단계에서 사용자 관리가 이
              공간에 연결됩니다.
            </p>
            <button type="button" onClick={logout} disabled={submitting}>
              {submitting ? '처리 중…' : '로그아웃'}
            </button>
            {error && <p className="form-error">{error}</p>}
          </div>
        ) : (
          <form className="auth-card" onSubmit={login}>
            <p className="card-label">ADMIN SIGN IN</p>
            <h2>관리자 로그인</h2>
            <p className="card-copy">
              서버 설정에 등록한 관리자 계정으로 로그인하세요.
            </p>

            <label htmlFor="username">관리자 ID</label>
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
