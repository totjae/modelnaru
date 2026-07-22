'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { csrfToken } from './client-auth';

interface UserRecord {
  createdAt: string;
  credentialVersion: number;
  displayName: string | null;
  id: string;
  isEnabled: boolean;
  updatedAt: string;
  username: string;
}

interface UsersResponse {
  users: UserRecord[];
}

function errorMessage(status: number): string {
  if (status === 409) return '이미 사용 중이거나 관리자와 충돌하는 ID입니다.';
  if (status === 404)
    return '사용자를 찾을 수 없습니다. 목록을 새로고침하세요.';
  if (status === 403)
    return '보안 검증에 실패했습니다. 새로고침 후 다시 시도하세요.';
  return '요청을 처리하지 못했습니다.';
}

async function mutation(
  path: string,
  method: 'DELETE' | 'PATCH' | 'POST' | 'PUT',
  body?: Record<string, unknown>,
): Promise<Response> {
  return fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export function UserManager() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserRecord | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/users', {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('list failed');
      const data = (await response.json()) as UsersResponse;
      setUsers(data.users);
    } catch {
      setError('사용자 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyId('create');
    setError('');
    setNotice('');
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get('password') !== data.get('passwordConfirm')) {
      setError('초기 비밀번호와 확인 입력이 일치하지 않습니다.');
      setBusyId(null);
      return;
    }
    try {
      const response = await mutation('/api/admin/users', 'POST', {
        displayName: data.get('displayName'),
        isEnabled: data.get('isEnabled') === 'on',
        password: data.get('password'),
        username: data.get('username'),
      });
      if (!response.ok) {
        setError(errorMessage(response.status));
        return;
      }
      const created = (await response.json()) as UserRecord;
      setUsers((current) =>
        [...current, created].sort((a, b) =>
          a.username.localeCompare(b.username),
        ),
      );
      form.reset();
      setNotice(`${created.username} 계정을 생성했습니다.`);
    } catch {
      setError('사용자 생성 요청에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  async function updateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setBusyId(editing.id);
    setError('');
    setNotice('');
    const data = new FormData(event.currentTarget);
    if (data.get('password') !== data.get('passwordConfirm')) {
      setError('새 비밀번호와 확인 입력이 일치하지 않습니다.');
      setBusyId(null);
      return;
    }
    try {
      const response = await mutation(
        `/api/admin/users/${editing.id}`,
        'PATCH',
        {
          displayName: data.get('displayName'),
          isEnabled: data.get('isEnabled') === 'on',
          username: data.get('username'),
        },
      );
      if (!response.ok) {
        setError(errorMessage(response.status));
        return;
      }
      const updated = (await response.json()) as UserRecord;
      setUsers((current) =>
        current
          .map((user) => (user.id === updated.id ? updated : user))
          .sort((a, b) => a.username.localeCompare(b.username)),
      );
      setEditing(null);
      setNotice(`${updated.username} 계정 정보를 변경했습니다.`);
    } catch {
      setError('사용자 변경 요청에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordTarget) return;
    setBusyId(passwordTarget.id);
    setError('');
    setNotice('');
    const data = new FormData(event.currentTarget);
    try {
      const response = await mutation(
        `/api/admin/users/${passwordTarget.id}/password`,
        'PUT',
        { password: data.get('password') },
      );
      if (!response.ok) {
        setError(errorMessage(response.status));
        return;
      }
      const updated = (await response.json()) as UserRecord;
      setUsers((current) =>
        current.map((user) => (user.id === updated.id ? updated : user)),
      );
      setPasswordTarget(null);
      setNotice(`${updated.username} 계정의 비밀번호를 변경했습니다.`);
    } catch {
      setError('비밀번호 변경 요청에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleUser(user: UserRecord) {
    setBusyId(user.id);
    setError('');
    setNotice('');
    try {
      const response = await mutation(`/api/admin/users/${user.id}`, 'PATCH', {
        isEnabled: !user.isEnabled,
      });
      if (!response.ok) {
        setError(errorMessage(response.status));
        return;
      }
      const updated = (await response.json()) as UserRecord;
      setUsers((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(
        `${updated.username} 계정을 ${updated.isEnabled ? '활성화' : '비활성화'}했습니다.`,
      );
    } catch {
      setError('계정 상태 변경 요청에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteUser(user: UserRecord) {
    if (!window.confirm(`${user.username} 계정과 관련 데이터를 삭제할까요?`)) {
      return;
    }
    setBusyId(user.id);
    setError('');
    setNotice('');
    try {
      const response = await mutation(`/api/admin/users/${user.id}`, 'DELETE');
      if (!response.ok) {
        setError(errorMessage(response.status));
        return;
      }
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setNotice(`${user.username} 계정을 삭제했습니다.`);
    } catch {
      setError('사용자 삭제 요청에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="user-management" aria-labelledby="users-heading">
      <div className="section-heading">
        <div>
          <p className="card-label">ACCOUNT CONTROL</p>
          <h2 id="users-heading">사용자 관리</h2>
        </div>
        <button className="quiet-button" type="button" onClick={loadUsers}>
          새로고침
        </button>
      </div>

      <form className="create-user-form" onSubmit={createUser}>
        <div>
          <label htmlFor="new-username">사용자 ID</label>
          <input
            id="new-username"
            name="username"
            minLength={3}
            maxLength={64}
            required
          />
        </div>
        <div>
          <label htmlFor="new-display-name">표시 이름</label>
          <input id="new-display-name" name="displayName" maxLength={100} />
        </div>
        <div>
          <label htmlFor="new-password">초기 비밀번호</label>
          <input
            id="new-password"
            name="password"
            type="password"
            minLength={8}
            maxLength={1024}
            required
          />
        </div>
        <div>
          <label htmlFor="new-password-confirm">초기 비밀번호 확인</label>
          <input
            id="new-password-confirm"
            name="passwordConfirm"
            type="password"
            minLength={8}
            maxLength={1024}
            required
          />
        </div>
        <label className="check-field">
          <input name="isEnabled" type="checkbox" defaultChecked /> 즉시 활성화
        </label>
        <button type="submit" disabled={busyId === 'create'}>
          {busyId === 'create' ? '생성 중…' : '사용자 생성'}
        </button>
      </form>

      {(error || notice) && (
        <div
          className={error ? 'banner error-banner' : 'banner success-banner'}
          role="status"
        >
          {error || notice}
        </div>
      )}

      {loading ? (
        <p className="empty-state">사용자 목록을 불러오는 중…</p>
      ) : users.length === 0 ? (
        <p className="empty-state">등록된 사용자가 없습니다.</p>
      ) : (
        <div className="user-list">
          {users.map((user) => (
            <article className="user-row" key={user.id}>
              <div className="user-identity">
                <span
                  className={
                    user.isEnabled ? 'account-status active' : 'account-status'
                  }
                >
                  {user.isEnabled ? '활성' : '비활성'}
                </span>
                <div>
                  <h3>{user.displayName || user.username}</h3>
                  <p>
                    @{user.username} · 인증 버전 {user.credentialVersion}
                  </p>
                </div>
              </div>
              <div className="row-actions">
                <button type="button" onClick={() => setEditing(user)}>
                  편집
                </button>
                <button type="button" onClick={() => setPasswordTarget(user)}>
                  비밀번호
                </button>
                <button
                  type="button"
                  onClick={() => toggleUser(user)}
                  disabled={busyId === user.id}
                >
                  {user.isEnabled ? '비활성화' : '활성화'}
                </button>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => deleteUser(user)}
                  disabled={busyId === user.id}
                >
                  삭제
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card" onSubmit={updateUser}>
            <p className="card-label">EDIT ACCOUNT</p>
            <h3>사용자 정보 변경</h3>
            <label htmlFor="edit-username">사용자 ID</label>
            <input
              id="edit-username"
              name="username"
              defaultValue={editing.username}
              minLength={3}
              maxLength={64}
              required
            />
            <label htmlFor="edit-display-name">표시 이름</label>
            <input
              id="edit-display-name"
              name="displayName"
              defaultValue={editing.displayName ?? ''}
              maxLength={100}
            />
            <label className="check-field">
              <input
                name="isEnabled"
                type="checkbox"
                defaultChecked={editing.isEnabled}
              />{' '}
              계정 활성화
            </label>
            <div className="modal-actions">
              <button
                className="quiet-button"
                type="button"
                onClick={() => setEditing(null)}
              >
                취소
              </button>
              <button type="submit" disabled={busyId === editing.id}>
                저장
              </button>
            </div>
          </form>
        </div>
      )}

      {passwordTarget && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card" onSubmit={changePassword}>
            <p className="card-label">RESET PASSWORD</p>
            <h3>{passwordTarget.username} 비밀번호 변경</h3>
            <p>변경 즉시 이 사용자의 기존 세션이 모두 종료됩니다.</p>
            <label htmlFor="reset-password">새 비밀번호</label>
            <input
              id="reset-password"
              name="password"
              type="password"
              minLength={8}
              maxLength={1024}
              autoComplete="new-password"
              required
            />
            <label htmlFor="reset-password-confirm">새 비밀번호 확인</label>
            <input
              id="reset-password-confirm"
              name="passwordConfirm"
              type="password"
              minLength={8}
              maxLength={1024}
              autoComplete="new-password"
              required
            />
            <div className="modal-actions">
              <button
                className="quiet-button"
                type="button"
                onClick={() => setPasswordTarget(null)}
              >
                취소
              </button>
              <button type="submit" disabled={busyId === passwordTarget.id}>
                변경
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
