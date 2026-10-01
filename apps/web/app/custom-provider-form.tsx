'use client';
import { useState, type FormEvent } from 'react';
import { chatApi } from './chat-api';
import type { ProviderConnection } from './provider-manager';
export function CustomProviderForm({
  connection,
  onSaved,
}: {
  connection?: ProviderConnection;
  onSaved: (value: ProviderConnection) => void;
}) {
  const [auth, setAuth] = useState(connection?.authMode ?? 'bearer');
  const [destination, setDestination] = useState(
    connection?.destinationKind ?? 'public',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (key: string) => {
      const value = data.get(key);
      return typeof value === 'string' ? value : '';
    };
    const body: Record<string, unknown> = {
      name: data.get('name'),
      authMode: auth,
      destinationKind: destination,
    };
    const baseUrl = text('baseUrl').trim();
    if (baseUrl) body.baseUrl = baseUrl;
    const key = text('apiKey');
    if (auth === 'bearer' && key) body.apiKey = key;
    if (destination === 'local') {
      const ip = text('approvedLocalIp').trim();
      const port = text('approvedLocalPort').trim();
      if (ip) body.approvedLocalIp = ip;
      if (port) body.approvedLocalPort = Number(port);
    }
    setBusy(true);
    setError('');
    try {
      const result = await chatApi<ProviderConnection>(
        connection
          ? '/api/admin/provider-connections/' + connection.id
          : '/api/admin/provider-connections/custom',
        { method: connection ? 'PATCH' : 'POST', body },
      );
      form.reset();
      onSaved(result);
    } catch {
      setError(
        '저장하지 못했습니다. 주소·승인 IP/포트·인증 정보와 활성 작업을 확인하세요.',
      );
    } finally {
      const input = form.elements.namedItem('apiKey');
      if (input instanceof HTMLInputElement) input.value = '';
      setBusy(false);
    }
  }
  return (
    <details className="custom-provider">
      <summary>
        {connection ? '연결 상세 수정' : '커스텀·로컬 Provider 등록'}
      </summary>
      <p>
        OpenAI 호환 주소를 사용합니다. 저장만으로 연결 성공을 보장하지 않습니다.
        저장 후 각 단계를 시험하세요.
      </p>
      <form className="n11-form" onSubmit={save}>
        <fieldset disabled={busy}>
          <label>
            연결 이름
            <input
              name="name"
              defaultValue={connection?.name}
              maxLength={100}
              required
            />
          </label>
          <label>
            기본 주소
            <input
              name="baseUrl"
              type="url"
              placeholder={
                connection ? '변경할 때만 입력' : 'https://example.com/v1'
              }
              required={!connection}
              autoComplete="off"
            />
          </label>
          <label>
            목적지
            <select
              value={destination}
              onChange={(e) =>
                setDestination(e.target.value as 'local' | 'public')
              }
            >
              <option value="public">공인 HTTPS</option>
              <option value="local">승인된 로컬 주소</option>
            </select>
          </label>
          {destination === 'local' && (
            <>
              <label>
                승인할 IP
                <input
                  name="approvedLocalIp"
                  autoComplete="off"
                  required={
                    !connection || connection.destinationKind !== 'local'
                  }
                  placeholder={connection ? '유지하려면 비워두세요' : 'IP 주소'}
                />
              </label>
              <label>
                승인할 포트
                <input
                  name="approvedLocalPort"
                  type="number"
                  min={1}
                  max={65535}
                  required={
                    !connection || connection.destinationKind !== 'local'
                  }
                />
              </label>
              <p>
                서버에서 접근 가능한 정확한 IP와 포트만 승인합니다. 저장된
                주소는 다시 표시하지 않습니다.
              </p>
            </>
          )}
          <label>
            인증
            <select
              value={auth}
              onChange={(e) => setAuth(e.target.value as 'bearer' | 'none')}
            >
              <option value="bearer">API 키</option>
              <option value="none">인증 없음</option>
            </select>
          </label>
          {auth === 'bearer' && (
            <label>
              새 API 키
              <input
                name="apiKey"
                type="password"
                maxLength={4096}
                autoComplete="new-password"
                required={!connection || connection.authMode !== 'bearer'}
                placeholder={connection ? '유지하려면 비워두세요' : ''}
              />
            </label>
          )}
          <button type="submit">{busy ? '저장 중…' : '연결 저장'}</button>
        </fieldset>
      </form>
      <p role="alert">{error}</p>
    </details>
  );
}
