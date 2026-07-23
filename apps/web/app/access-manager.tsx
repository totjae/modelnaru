'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { csrfToken } from './client-auth';

interface AccessModel {
  connectionEnabled: boolean;
  connectionName: string;
  displayName: string | null;
  id: string;
  isAvailable: boolean;
  isEnabled: boolean;
  modelId: string;
  templateId: string;
}

interface Permission {
  dailyRequestLimit: number | null;
  providerModelId: string;
}

interface UserAccess {
  dailyRequestLimit: number | null;
  displayName: string | null;
  id: string;
  isEnabled: boolean;
  permissions: Permission[];
  username: string;
}

interface GuestAccess {
  absoluteTimeoutHours: number;
  accessCodeConfigured: boolean;
  activeSessionCount: number;
  fileUploadEnabled: boolean;
  globalDailyRequestLimit: number;
  idleTimeoutMinutes: number;
  isEnabled: boolean;
  maximumActiveSessions: number;
  permissions: Permission[];
  resetTimezone: string;
  requestTraceEnabled: boolean;
  sessionDailyRequestLimit: number;
}

interface AccessState {
  guest: GuestAccess;
  models: AccessModel[];
  users: UserAccess[];
}

function optionalLimit(value: FormDataEntryValue | null): number | null {
  return typeof value === 'string' && value.trim() ? Number(value) : null;
}

function formText(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

function selectedPermissions(
  data: FormData,
  models: AccessModel[],
): Permission[] {
  return models
    .filter((model) => data.get(`model:${model.id}`) === 'on')
    .map((model) => ({
      dailyRequestLimit: optionalLimit(data.get(`limit:${model.id}`)),
      providerModelId: model.id,
    }));
}

async function put(path: string, body: Record<string, unknown>) {
  return fetch(path, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken(),
    },
    body: JSON.stringify(body),
  });
}

function ModelPermissionList({
  models,
  permissions,
}: {
  models: AccessModel[];
  permissions: Permission[];
}) {
  const byId = new Map(
    permissions.map((permission) => [permission.providerModelId, permission]),
  );
  return (
    <div className="access-models">
      {models.length === 0 ? (
        <p className="empty-state">
          먼저 Provider 관리에서 모델을 활성화하세요.
        </p>
      ) : (
        models.map((model) => {
          const permission = byId.get(model.id);
          const usable =
            model.connectionEnabled && model.isEnabled && model.isAvailable;
          return (
            <div
              className={
                usable ? 'access-model-row' : 'access-model-row unavailable'
              }
              key={model.id}
            >
              <label>
                <input
                  name={`model:${model.id}`}
                  type="checkbox"
                  defaultChecked={Boolean(permission)}
                  disabled={!usable && !permission}
                />
                <span>
                  <strong>{model.displayName || model.modelId}</strong>
                  <small>
                    {model.connectionName} · {model.modelId}
                    {!usable ? ' · 현재 사용 불가' : ''}
                  </small>
                </span>
              </label>
              <input
                aria-label={`${model.modelId} 일일 제한`}
                name={`limit:${model.id}`}
                type="number"
                min={1}
                max={100000}
                defaultValue={permission?.dailyRequestLimit ?? ''}
                placeholder="무제한"
              />
            </div>
          );
        })
      )}
    </div>
  );
}

export function AccessManager({
  scope = 'all',
}: {
  scope?: 'all' | 'guest' | 'users';
}) {
  const [state, setState] = useState<AccessState | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const selectedUser = useMemo(
    () => state?.users.find((user) => user.id === selectedUserId),
    [selectedUserId, state],
  );

  async function load() {
    setBusy('load');
    setError('');
    try {
      const response = await fetch('/api/admin/access', {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('load failed');
      const next = (await response.json()) as AccessState;
      setState(next);
      setSelectedUserId((current) => current || next.users[0]?.id || '');
    } catch {
      setError('모델 권한 정보를 불러오지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state || !selectedUser) return;
    setBusy(`user:${selectedUser.id}`);
    setError('');
    setNotice('');
    const data = new FormData(event.currentTarget);
    try {
      const response = await put(`/api/admin/access/users/${selectedUser.id}`, {
        dailyRequestLimit: optionalLimit(data.get('dailyRequestLimit')),
        permissions: selectedPermissions(data, state.models),
      });
      if (!response.ok) throw new Error('save failed');
      setState((await response.json()) as AccessState);
      setNotice(`${selectedUser.username}의 모델 권한을 저장했습니다.`);
    } catch {
      setError('사용자 모델 권한을 저장하지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  async function saveGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state) return;
    const form = event.currentTarget;
    setBusy('guest');
    setError('');
    setNotice('');
    const data = new FormData(form);
    const accessCode = formText(data.get('accessCode'));
    try {
      const response = await put('/api/admin/access/guest', {
        absoluteTimeoutHours: Number(data.get('absoluteTimeoutHours')),
        ...(accessCode ? { accessCode } : {}),
        fileUploadEnabled: data.get('fileUploadEnabled') === 'on',
        globalDailyRequestLimit: Number(data.get('globalDailyRequestLimit')),
        idleTimeoutMinutes: Number(data.get('idleTimeoutMinutes')),
        isEnabled: data.get('isEnabled') === 'on',
        maximumActiveSessions: Number(data.get('maximumActiveSessions')),
        permissions: selectedPermissions(data, state.models),
        resetTimezone: formText(data.get('resetTimezone')),
        requestTraceEnabled: data.get('requestTraceEnabled') === 'on',
        sessionDailyRequestLimit: Number(data.get('sessionDailyRequestLimit')),
      });
      if (!response.ok) throw new Error('save failed');
      setState((await response.json()) as AccessState);
      form.reset();
      setNotice('게스트 체험 설정을 저장했습니다.');
    } catch {
      setError(
        '게스트 설정을 저장하지 못했습니다. 처음 활성화할 때는 6자 이상의 코드를 입력하세요.',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="access-management" aria-labelledby="access-heading">
      <div className="section-heading">
        <div>
          <p className="card-label">ACCESS & DAILY LIMITS</p>
          <h2 id="access-heading">
            {scope === 'users'
              ? '사용자 모델 권한'
              : scope === 'guest'
                ? '게스트 체험'
                : '모델 권한과 게스트 체험'}
          </h2>
        </div>
        <button className="quiet-button" type="button" onClick={load}>
          새로고침
        </button>
      </div>

      {(error || notice) && (
        <div
          className={error ? 'banner error-banner' : 'banner success-banner'}
        >
          {error || notice}
        </div>
      )}

      {!state || busy === 'load' ? (
        <p className="empty-state">권한 정보를 불러오는 중…</p>
      ) : (
        <div className={`access-grid${scope !== 'all' ? ' single' : ''}`}>
          {scope !== 'guest' && (
            <div className="access-panel">
              <h3>사용자별 모델 권한</h3>
              {state.users.length === 0 ? (
                <p className="empty-state">등록된 사용자가 없습니다.</p>
              ) : (
                <>
                  <label htmlFor="access-user">사용자</label>
                  <select
                    id="access-user"
                    value={selectedUserId}
                    onChange={(event) => setSelectedUserId(event.target.value)}
                  >
                    {state.users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.displayName || user.username} (@{user.username})
                      </option>
                    ))}
                  </select>
                  {selectedUser && (
                    <form
                      key={`${selectedUser.id}:${JSON.stringify(selectedUser.permissions)}`}
                      onSubmit={saveUser}
                    >
                      <label htmlFor="user-daily-limit">
                        계정 전체 일일 호출 제한
                      </label>
                      <input
                        id="user-daily-limit"
                        name="dailyRequestLimit"
                        type="number"
                        min={1}
                        max={100000}
                        defaultValue={selectedUser.dailyRequestLimit ?? ''}
                        placeholder="비워두면 무제한"
                      />
                      <ModelPermissionList
                        models={state.models}
                        permissions={selectedUser.permissions}
                      />
                      <button
                        type="submit"
                        disabled={busy === `user:${selectedUser.id}`}
                      >
                        사용자 권한 저장
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
          )}

          {scope !== 'users' && (
            <div className="access-panel guest-panel">
              <h3>게스트 체험</h3>
              <p>
                활성 세션 {state.guest.activeSessionCount}/
                {state.guest.maximumActiveSessions} · 코드{' '}
                {state.guest.accessCodeConfigured ? '설정됨' : '미설정'}
              </p>
              <form
                key={`guest:${JSON.stringify(state.guest.permissions)}:${state.guest.isEnabled}`}
                onSubmit={saveGuest}
              >
                <label className="check-field">
                  <input
                    name="isEnabled"
                    type="checkbox"
                    defaultChecked={state.guest.isEnabled}
                  />{' '}
                  게스트 체험 활성화
                </label>
                <label className="check-field">
                  <input
                    name="requestTraceEnabled"
                    type="checkbox"
                    defaultChecked={state.guest.requestTraceEnabled}
                  />{' '}
                  게스트 전송 기록 허용
                </label>
                <label htmlFor="guest-access-code">새 공유 코드</label>
                <input
                  id="guest-access-code"
                  name="accessCode"
                  type="password"
                  minLength={6}
                  maxLength={128}
                  placeholder={
                    state.guest.accessCodeConfigured
                      ? '변경할 때만 입력'
                      : '6자 이상 필수'
                  }
                  autoComplete="new-password"
                />
                <div className="access-number-grid">
                  <label>
                    최대 활성 세션
                    <input
                      name="maximumActiveSessions"
                      type="number"
                      min={1}
                      max={100}
                      defaultValue={state.guest.maximumActiveSessions}
                      required
                    />
                  </label>
                  <label>
                    세션당 일일 호출
                    <input
                      name="sessionDailyRequestLimit"
                      type="number"
                      min={1}
                      max={1000}
                      defaultValue={state.guest.sessionDailyRequestLimit}
                      required
                    />
                  </label>
                  <label>
                    게스트 전체 일일 호출
                    <input
                      name="globalDailyRequestLimit"
                      type="number"
                      min={1}
                      max={100000}
                      defaultValue={state.guest.globalDailyRequestLimit}
                      required
                    />
                  </label>
                  <label>
                    미사용 만료(분)
                    <input
                      name="idleTimeoutMinutes"
                      type="number"
                      min={15}
                      max={360}
                      defaultValue={state.guest.idleTimeoutMinutes}
                      required
                    />
                  </label>
                  <label>
                    최대 유지(시간)
                    <input
                      name="absoluteTimeoutHours"
                      type="number"
                      min={1}
                      max={72}
                      defaultValue={state.guest.absoluteTimeoutHours}
                      required
                    />
                  </label>
                  <label>
                    초기화 timezone
                    <input
                      name="resetTimezone"
                      defaultValue={state.guest.resetTimezone}
                      maxLength={64}
                      required
                    />
                  </label>
                </div>
                <label className="check-field">
                  <input
                    name="fileUploadEnabled"
                    type="checkbox"
                    defaultChecked={state.guest.fileUploadEnabled}
                    disabled
                  />{' '}
                  게스트 파일 첨부(파일 기능 구현 후 활성화)
                </label>
                <p className="guest-session-notice">
                  설정을 저장하면 현재 게스트 세션이 모두 종료됩니다.
                </p>
                <ModelPermissionList
                  models={state.models}
                  permissions={state.guest.permissions}
                />
                <button type="submit" disabled={busy === 'guest'}>
                  게스트 설정 저장
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
