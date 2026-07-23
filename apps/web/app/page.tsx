'use client';

import { useEffect, useState, type FormEvent } from 'react';

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

export default function HomePage() {
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

  async function joinGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setGuestError('');
    const data = new FormData(event.currentTarget);
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
        <AdminWorkspace />
      </main>
    );
  }

  return (
    <main className="landing-page">
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
            <a href="#how-it-works">구성 살펴보기</a>
            {guestEnabled && <a href="#guest-experience">게스트 체험</a>}
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
            <form className={`auth-card auth-${loginMode}`} onSubmit={login}>
              <div
                className="login-mode"
                role="tablist"
                aria-label="로그인 유형"
              >
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
      </section>

      <section
        id="how-it-works"
        className="portfolio-section architecture-section"
        aria-labelledby="architecture-title"
      >
        <div className="section-heading">
          <p className="eyebrow">HOW IT WORKS · INFRASTRUCTURE</p>
          <h2 id="architecture-title">한 대의 서버 안에서, 경계는 분명하게</h2>
          <p>
            ModelNaru는 Ubuntu 미니 PC에 Docker Compose로 배포됩니다. 외부에는
            HTTPS만 열고 데이터베이스와 캐시는 내부 네트워크에 격리합니다.
          </p>
        </div>
        <ol className="architecture-flow">
          <li className="architecture-node node-blue">
            <span>01 · PUBLIC</span>
            <strong>HTTPS · Nginx</strong>
            <p>80·443 요청과 인증서를 처리하고 내부 서비스로 전달합니다.</p>
          </li>
          <li className="architecture-node node-violet">
            <span>02 · DOCKER EDGE</span>
            <strong>Gateway · 32432</strong>
            <p>호스트의 loopback에만 연결된 단일 진입점입니다.</p>
          </li>
          <li className="architecture-node node-cyan">
            <span>03 · APPLICATION</span>
            <strong>Next.js · NestJS</strong>
            <p>화면, 인증, 대화, 파일 처리와 AI 스트리밍을 담당합니다.</p>
          </li>
          <li className="architecture-node node-green">
            <span>04 · PRIVATE DATA</span>
            <strong>PostgreSQL · Valkey</strong>
            <p>대화·권한·로그와 세션 보조 상태를 외부 비공개로 보관합니다.</p>
          </li>
        </ol>
        <div className="infrastructure-detail-grid">
          <article>
            <span className="feature-index">A</span>
            <h3>AI 제공자 연결</h3>
            <p>
              서버가 암호화된 자격증명으로 외부 AI API를 호출하고 답변을
              스트리밍합니다. 브라우저에는 API 키를 전달하지 않습니다.
            </p>
          </article>
          <article>
            <span className="feature-index">B</span>
            <h3>로컬 파일 저장소</h3>
            <p>
              원본 첨부는 공개 경로 밖에 보관합니다. TXT·PDF·이미지를 처리하고
              스캔 PDF는 한국어·영어 OCR을 수행합니다.
            </p>
          </article>
          <article>
            <span className="feature-index">C</span>
            <h3>작은 서버에 맞춘 제한</h3>
            <p>
              AI 생성과 PDF·OCR 작업의 동시 실행 수를 제한해 Intel N100과 16GB
              RAM 환경에서 안정적으로 운영합니다.
            </p>
          </article>
        </div>
      </section>

      <section
        className="portfolio-section role-section"
        aria-labelledby="roles-title"
      >
        <div className="section-heading">
          <p className="eyebrow">PRODUCT SURFACES · ROLES</p>
          <h2 id="roles-title">관리하는 화면과 대화하는 화면</h2>
          <p>
            관리자는 서비스의 연결과 권한을 통제하고, 사용자는 자신에게 허용된
            모델로 독립된 대화를 이어갑니다.
          </p>
        </div>
        <div className="role-grid">
          <article className="role-card admin-role">
            <header>
              <span>ADMIN</span>
              <h3>관리자 공간</h3>
            </header>
            <ul>
              <li>사용자 생성·비밀번호 변경·비활성화와 세션 종료</li>
              <li>Provider API 키 등록·모델 동기화·활성 모델 관리</li>
              <li>사용자·게스트별 모델 권한과 일일 호출 제한</li>
              <li>자동 요약 모델·프롬프트·생성 파라미터 설정</li>
              <li>사용량, 감사·보안·AI·파일·시스템 통합 로그</li>
              <li>첨부파일 보관 기간과 만료 파일 정리</li>
            </ul>
          </article>
          <article className="role-card user-role">
            <header>
              <span>USER</span>
              <h3>사용자 공간</h3>
            </header>
            <ul>
              <li>계정별로 분리된 대화방과 대화별 독립 설정</li>
              <li>대화 중 모델 변경과 Provider별 생성 파라미터</li>
              <li>스트리밍 답변·생성 중단·답변 재생성과 분기</li>
              <li>시스템 프롬프트·이전 문맥 범위·자동 요약</li>
              <li>TXT·Markdown·JSON·PDF·OCR·이미지 첨부</li>
              <li>현재 세션의 실제 Provider 요청·응답 확인</li>
            </ul>
          </article>
        </div>
      </section>

      <section
        id="guest-experience"
        className="portfolio-section guest-portfolio"
        aria-labelledby="guest-title"
      >
        <div className="guest-story">
          <p className="eyebrow">LIVE DEMO · ISOLATED GUEST SESSION</p>
          <h2 id="guest-title">설명을 읽었다면, 이제 직접 건너가 보세요</h2>
          <p>
            게스트 체험은 ModelNaru의 포트폴리오 데모입니다. 코드를 입력하면
            다른 방문자와 분리된 임시 대화 공간이 만들어지고, 관리자가 허용한
            모델과 횟수 안에서 실제 채팅 기능을 체험할 수 있습니다.
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
          {guestError && <p className="form-error">{guestError}</p>}
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
    </main>
  );
}
