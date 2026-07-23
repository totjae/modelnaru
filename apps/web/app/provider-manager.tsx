'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { csrfToken } from './client-auth';

interface ProviderTemplate {
  authType?:
    'bearer' | 'bearer-optional' | 'google-api-key' | 'none' | 'x-api-key';
  canRegister: boolean;
  category: 'advanced' | 'featured' | 'template';
  configurationFields?: Array<{
    key: string;
    label: string;
    maximumLength: number;
    minimumLength: number;
    placeholder?: string;
  }>;
  id: string;
  name: string;
  supportLevel: 'coming_soon' | 'compatible' | 'experimental' | 'verified';
}

interface ProviderModel {
  contextWindow: number | null;
  displayName: string | null;
  id: string;
  isAvailable: boolean;
  isEnabled: boolean;
  maxOutputTokens: number | null;
  modelId: string;
}

interface ProviderConnection {
  credentialHint: string | null;
  id: string;
  isEnabled: boolean;
  lastModelSyncAt: string | null;
  models: ProviderModel[];
  name: string;
  status: 'error' | 'ready';
  templateId: string;
}

function providerError(status: number, code?: string): string {
  if (code === 'PROVIDER_AUTH_FAILED') return 'API 키 인증에 실패했습니다.';
  if (code === 'PROVIDER_RATE_LIMITED')
    return 'Provider 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.';
  if (code === 'PROVIDER_NETWORK_ERROR')
    return 'Provider 서버에 연결할 수 없습니다.';
  if (code === 'PROVIDER_RESPONSE_INVALID')
    return 'Provider 모델 목록 응답을 해석할 수 없습니다.';
  if (code === 'PROVIDER_TEMPLATE_UNAVAILABLE')
    return '아직 등록을 지원하지 않는 Provider입니다.';
  if (status === 409) return '같은 이름의 Provider 연결이 이미 있습니다.';
  if (status === 403) return '관리자 보안 검증에 실패했습니다.';
  return 'Provider 요청을 처리하지 못했습니다.';
}

async function responseError(response: Response): Promise<string> {
  let code: string | undefined;
  try {
    const body = (await response.json()) as { error?: { code?: string } };
    code = body.error?.code;
  } catch {
    // A generic message is used when the server did not return JSON.
  }
  return providerError(response.status, code);
}

async function mutation(
  path: string,
  method: 'DELETE' | 'PATCH' | 'POST',
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

function supportLabel(template: ProviderTemplate): string {
  if (template.canRegister) return '등록 가능';
  if (template.supportLevel === 'experimental') return '시험 예정';
  return '준비 중';
}

export function ProviderManager() {
  const [templates, setTemplates] = useState<ProviderTemplate[]>([]);
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const registrable = useMemo(
    () => templates.filter((template) => template.canRegister),
    [templates],
  );
  const selectedTemplate = useMemo(
    () => registrable.find((template) => template.id === selectedTemplateId),
    [registrable, selectedTemplateId],
  );

  async function load() {
    setBusy('load');
    setError('');
    try {
      const [templateResponse, connectionResponse] = await Promise.all([
        fetch('/api/admin/provider-templates', {
          credentials: 'same-origin',
        }),
        fetch('/api/admin/provider-connections', {
          credentials: 'same-origin',
        }),
      ]);
      if (!templateResponse.ok || !connectionResponse.ok) {
        throw new Error('provider list failed');
      }
      const templateBody = (await templateResponse.json()) as {
        templates: ProviderTemplate[];
      };
      const connectionBody = (await connectionResponse.json()) as {
        connections: ProviderConnection[];
      };
      setTemplates(templateBody.templates);
      setConnections(connectionBody.connections);
    } catch {
      setError('Provider 정보를 불러오지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy('create');
    setError('');
    setNotice('');
    try {
      const response = await mutation(
        '/api/admin/provider-connections',
        'POST',
        {
          apiKey: data.get('apiKey'),
          configuration: Object.fromEntries(
            (selectedTemplate?.configurationFields ?? []).map((field) => [
              field.key,
              data.get(`configuration.${field.key}`),
            ]),
          ),
          name: data.get('name'),
          templateId: data.get('templateId'),
        },
      );
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      const connection = (await response.json()) as ProviderConnection;
      setConnections((current) => [...current, connection]);
      setExpanded(connection.id);
      form.reset();
      setSelectedTemplateId('');
      setNotice(
        `${connection.name} 연결과 모델 ${connection.models.length}개를 등록했습니다. 사용할 모델을 활성화하세요.`,
      );
    } catch {
      setError('Provider 등록 요청에 실패했습니다.');
    } finally {
      setBusy(null);
    }
  }

  async function syncModels(connection: ProviderConnection) {
    setBusy(connection.id);
    setError('');
    setNotice('');
    try {
      const response = await mutation(
        `/api/admin/provider-connections/${connection.id}/models/sync`,
        'POST',
      );
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      const updated = (await response.json()) as ProviderConnection;
      setConnections((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(`${updated.name}의 모델 목록을 동기화했습니다.`);
    } catch {
      setError('모델 동기화 요청에 실패했습니다.');
    } finally {
      setBusy(null);
    }
  }

  async function toggleConnection(connection: ProviderConnection) {
    setBusy(connection.id);
    setError('');
    setNotice('');
    try {
      const response = await mutation(
        `/api/admin/provider-connections/${connection.id}`,
        'PATCH',
        { isEnabled: !connection.isEnabled },
      );
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      const updated = (await response.json()) as ProviderConnection;
      setConnections((current) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        ),
      );
      setNotice(
        `${updated.name} 연결을 ${updated.isEnabled ? '활성화' : '비활성화'}했습니다.`,
      );
    } catch {
      setError('Provider 상태를 변경하지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  async function toggleModel(connectionId: string, model: ProviderModel) {
    setBusy(model.id);
    setError('');
    setNotice('');
    try {
      const response = await mutation(
        `/api/admin/provider-models/${model.id}`,
        'PATCH',
        { isEnabled: !model.isEnabled },
      );
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }
      const updated = (await response.json()) as ProviderModel;
      setConnections((current) =>
        current.map((connection) =>
          connection.id === connectionId
            ? {
                ...connection,
                models: connection.models.map((item) =>
                  item.id === updated.id ? updated : item,
                ),
              }
            : connection,
        ),
      );
    } catch {
      setError('모델 상태를 변경하지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className="provider-management"
      aria-labelledby="providers-heading"
    >
      <div className="section-heading">
        <div>
          <p className="card-label">AI CONNECTIONS</p>
          <h2 id="providers-heading">Provider 관리</h2>
        </div>
        <button className="quiet-button" type="button" onClick={load}>
          새로고침
        </button>
      </div>

      <details className="provider-catalog">
        <summary>지원 카탈로그 {templates.length}개 보기</summary>
        <div className="provider-catalog-grid">
          {templates.map((template) => (
            <div className="provider-catalog-item" key={template.id}>
              <span>{template.name}</span>
              <small className={template.canRegister ? 'ready' : ''}>
                {supportLabel(template)}
              </small>
            </div>
          ))}
        </div>
      </details>

      <form className="provider-create-form" onSubmit={createConnection}>
        <div>
          <label htmlFor="provider-template">서비스 제공자</label>
          <select
            id="provider-template"
            name="templateId"
            value={selectedTemplateId}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            required
          >
            <option value="">선택하세요</option>
            {registrable.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
        {(selectedTemplate?.configurationFields ?? []).map((field) => (
          <div key={field.key}>
            <label htmlFor={`provider-configuration-${field.key}`}>
              {field.label}
            </label>
            <input
              id={`provider-configuration-${field.key}`}
              name={`configuration.${field.key}`}
              minLength={field.minimumLength}
              maxLength={field.maximumLength}
              placeholder={field.placeholder}
              required
            />
          </div>
        ))}
        <div>
          <label htmlFor="provider-name">연결 이름</label>
          <input id="provider-name" name="name" maxLength={100} required />
        </div>
        <div>
          <label htmlFor="provider-key">API 키</label>
          <input
            id="provider-key"
            name="apiKey"
            type="password"
            minLength={8}
            maxLength={4096}
            autoComplete="new-password"
            required={
              selectedTemplate?.authType !== 'bearer-optional' &&
              selectedTemplate?.authType !== 'none'
            }
          />
          {(selectedTemplate?.authType === 'bearer-optional' ||
            selectedTemplate?.authType === 'none') && (
            <small>이 Provider는 API 키 없이도 등록할 수 있습니다.</small>
          )}
        </div>
        <button type="submit" disabled={busy === 'create'}>
          {busy === 'create' ? '연결 확인 중…' : '연결 시험 및 등록'}
        </button>
        <p>
          API 키는 서버에서 암호화되며 등록 전에 인증 API 또는 인증된 모델 목록
          조회로 유효성을 확인합니다.
        </p>
      </form>

      {(error || notice) && (
        <div
          className={error ? 'banner error-banner' : 'banner success-banner'}
          role="status"
        >
          {error || notice}
        </div>
      )}

      {busy === 'load' ? (
        <p className="empty-state">Provider 정보를 불러오는 중…</p>
      ) : connections.length === 0 ? (
        <p className="empty-state">등록된 Provider 연결이 없습니다.</p>
      ) : (
        <div className="provider-list">
          {connections.map((connection) => {
            const enabledModels = connection.models.filter(
              (model) => model.isEnabled,
            ).length;
            return (
              <article className="provider-card" key={connection.id}>
                <div className="provider-card-header">
                  <div>
                    <div className="provider-title-row">
                      <span
                        className={
                          connection.isEnabled
                            ? 'account-status active'
                            : 'account-status'
                        }
                      >
                        {connection.isEnabled ? '활성' : '비활성'}
                      </span>
                      <h3>{connection.name}</h3>
                    </div>
                    <p>
                      {connection.templateId} · 키 ••••
                      {connection.credentialHint || '비공개'} · 모델{' '}
                      {enabledModels}/{connection.models.length} 활성
                    </p>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded(
                          expanded === connection.id ? null : connection.id,
                        )
                      }
                    >
                      {expanded === connection.id ? '모델 접기' : '모델 관리'}
                    </button>
                    <button
                      type="button"
                      onClick={() => syncModels(connection)}
                      disabled={busy === connection.id}
                    >
                      동기화
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleConnection(connection)}
                      disabled={busy === connection.id}
                    >
                      {connection.isEnabled ? '비활성화' : '활성화'}
                    </button>
                  </div>
                </div>
                {expanded === connection.id && (
                  <div className="provider-model-list">
                    {connection.models.map((model) => (
                      <div
                        className={
                          model.isAvailable
                            ? 'provider-model'
                            : 'provider-model unavailable'
                        }
                        key={model.id}
                      >
                        <div>
                          <strong>{model.displayName || model.modelId}</strong>
                          <small>{model.modelId}</small>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleModel(connection.id, model)}
                          disabled={!model.isAvailable || busy === model.id}
                        >
                          {model.isEnabled ? '사용 중' : '사용 안 함'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
