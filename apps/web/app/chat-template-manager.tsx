'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { chatApi } from './chat-api';
import {
  ProviderParameterFields,
  parameterValuesFromRequest,
  providerParameterRequest,
  parameterLabels,
  type ParameterField,
  type ParameterValues,
} from './provider-parameter-fields';
import type { ChatTemplate, TemplateSettings } from './chat-template-types';
const defaults: TemplateSettings = {
  systemPrompt: '',
  historyMessageLimit: 0,
  contextTokenLimit: 100000,
  requestTraceLimit: 3,
  responseTimeoutSeconds: 120,
  webSearchEnabled: false,
  generationParameters: {},
};
export function ChatTemplateManager() {
  const [templates, setTemplates] = useState<ChatTemplate[]>([]);
  const [fields, setFields] = useState<ParameterField[]>([]);
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [editing, setEditing] = useState<ChatTemplate | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [published, setPublished] = useState(true);
  const [values, setValues] = useState<ParameterValues>({});
  const [resetKeys, setResetKeys] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoaded(false);
    Promise.all([
      chatApi<{ templates: ChatTemplate[]; parameterFields: ParameterField[] }>(
        '/api/admin/chat-templates',
        { signal: abort.signal },
      ),
      chatApi<{
        connections: {
          name: string;
          isEnabled: boolean;
          status: string;
          models: {
            id: string;
            modelId: string;
            isEnabled: boolean;
            isAvailable: boolean;
          }[];
        }[];
      }>('/api/admin/provider-connections', { signal: abort.signal }),
    ])
      .then(([data, providers]) => {
        if (abort.signal.aborted) return;
        setTemplates(data.templates);
        setFields(data.parameterFields);
        setModels(
          providers.connections
            .filter((c) => c.isEnabled && c.status === 'ready')
            .flatMap((c) =>
              c.models
                .filter((m) => m.isEnabled && m.isAvailable)
                .map((m) => ({ id: m.id, label: `${c.name} · ${m.modelId}` })),
            ),
        );
        setLoaded(true);
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setMessage(e instanceof Error ? e.message : '불러오지 못했습니다.');
      });
    return () => abort.abort();
  }, [reload]);
  function edit(template: ChatTemplate | null) {
    setEditing(template);
    setEditorKey((key) => key + 1);
    setPublished(template?.isEnabled ?? true);
    setResetKeys(template?.settings.resetParameters ?? []);
    setValues(
      parameterValuesFromRequest(template?.settings.generationParameters ?? {}),
    );
    setMessage('');
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setMessage('');
    const settings: TemplateSettings = {
      systemPrompt: data.get('systemPrompt') as string,
      generationParameters: providerParameterRequest(values),
      resetParameters: data.getAll('resetParameter').map(String),
    };
    for (const key of [
      'historyMessageLimit',
      'contextTokenLimit',
      'requestTraceLimit',
      'responseTimeoutSeconds',
    ] as const) {
      const value = data.get(key);
      if (value !== '') settings[key] = Number(value);
    }
    const search = data.get('webSearchEnabled');
    if (search !== 'keep') settings.webSearchEnabled = search === 'true';
    try {
      const saved = await chatApi<ChatTemplate>(
        `/api/admin/chat-templates${editing?.id ? `/${editing.id}` : ''}`,
        {
          method: editing?.id ? 'PUT' : 'POST',
          body: {
            name: data.get('name'),
            description: data.get('description'),
            isEnabled: data.get('isEnabled') === 'on',
            providerModelId: data.get('providerModelId') || null,
            settings,
            ...(editing?.id ? { version: editing.version } : {}),
          },
        },
      );
      setTemplates((current) => [
        ...current.filter((t) => t.id !== saved.id),
        saved,
      ]);
      edit(saved);
      setMessage('템플릿을 저장했습니다. 기존 대화의 적용값은 유지됩니다.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }
  async function toggle(t: ChatTemplate) {
    setBusy(true);
    setMessage('');
    try {
      const { id, ...body } = t;
      const saved = await chatApi<ChatTemplate>(
        `/api/admin/chat-templates/${id}`,
        {
          method: 'PUT',
          body: { ...body, isEnabled: !t.isEnabled },
        },
      );
      setTemplates((list) =>
        list.map((item) => (item.id === id ? saved : item)),
      );
      if (editing?.id === id) {
        setEditing((current) =>
          current
            ? { ...current, version: saved.version, isEnabled: saved.isEnabled }
            : current,
        );
        setPublished(saved.isEnabled);
      }
      setMessage(
        `템플릿을 ${saved.isEnabled ? '활성화' : '비활성화'}했습니다. 기존 대화의 적용값은 유지됩니다.`,
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : '상태를 변경하지 못했습니다.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(t: ChatTemplate) {
    if (
      !window.confirm(
        `“${t.name}” 템플릿을 삭제할까요? 기존 대화는 유지됩니다.`,
      )
    )
      return;
    setBusy(true);
    try {
      await chatApi(`/api/admin/chat-templates/${t.id}`, {
        method: 'DELETE',
        body: { version: t.version },
      });
      setTemplates((list) => list.filter((x) => x.id !== t.id));
      if (editing?.id === t.id) edit(null);
      setMessage('템플릿을 삭제했습니다.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '삭제하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }
  const settings = editing?.settings ?? defaults;
  return (
    <section className="template-manager" aria-labelledby="templates-heading">
      <div className="section-heading">
        <div>
          <p className="card-label">CHAT PRESETS</p>
          <h2 id="templates-heading">시스템 프롬프트 템플릿</h2>
        </div>
        <div className="row-actions">
          <button
            className="quiet-button"
            type="button"
            disabled={busy || !loaded}
            onClick={() => edit(null)}
          >
            새 템플릿
          </button>
          <button
            className="quiet-button"
            type="button"
            disabled={busy}
            onClick={() => setReload((v) => v + 1)}
          >
            새로고침
          </button>
        </div>
      </div>
      <p>
        사용자와 게스트가 현재 대화에 적용한 뒤 자유롭게 수정할 수 있습니다.
      </p>
      <p role="status">{message}</p>
      <div className="template-list user-list">
        {templates.map((t) => (
          <article className="user-row" key={t.id}>
            <div className="user-identity">
              <span
                className={
                  t.isEnabled ? 'account-status active' : 'account-status'
                }
              >
                {t.isEnabled ? '활성' : '비활성'}
              </span>
              <div>
                <h3>{t.name}</h3>
                {t.description && <p>{t.description}</p>}
              </div>
            </div>
            <div className="row-actions">
              <button type="button" disabled={busy} onClick={() => edit(t)}>
                수정
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  edit({ ...t, id: '', name: `${t.name} 복사`.slice(0, 100) })
                }
              >
                복제
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggle(t)}
              >
                {t.isEnabled ? '비활성화' : '활성화'}
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={busy}
                onClick={() => void remove(t)}
              >
                삭제
              </button>
            </div>
          </article>
        ))}
      </div>
      <form key={editorKey} onSubmit={save}>
        <fieldset disabled={busy || !loaded}>
          <legend>{editing?.id ? '템플릿 수정' : '템플릿 등록'}</legend>
          <label>
            이름
            <input
              name="name"
              required
              maxLength={100}
              defaultValue={editing?.name ?? ''}
            />
          </label>
          <label>
            설명
            <textarea
              name="description"
              maxLength={1000}
              defaultValue={editing?.description ?? ''}
            />
          </label>
          <label>
            <input
              name="isEnabled"
              type="checkbox"
              checked={published}
              onChange={(event) => setPublished(event.target.checked)}
            />
            사용자에게 공개
          </label>
          <label>
            권장 모델
            <select
              name="providerModelId"
              defaultValue={editing?.providerModelId ?? ''}
            >
              <option value="">현재 대화 모델 유지</option>
              {editing?.providerModelId &&
                !models.some((m) => m.id === editing.providerModelId) && (
                  <option value={editing.providerModelId}>
                    기존 권장 모델 · 사용 불가
                  </option>
                )}
              {models.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            시스템 프롬프트
            <textarea
              name="systemPrompt"
              maxLength={100000}
              rows={7}
              defaultValue={settings.systemPrompt ?? ''}
            />
          </label>
          <p>
            기존 값 유지: 비워 두거나 직접 설정을 켜지 않은 항목은 현재 대화의
            값을 바꾸지 않습니다. 값을 지정하면 그 값으로 교체합니다. 시스템
            프롬프트는 입력한 내용으로 교체하며, 빈 칸이면 지웁니다.
          </p>
          {(
            [
              ['historyMessageLimit', '이력 메시지 수', 0, 10000],
              ['contextTokenLimit', '문맥 토큰 한도', 1000, 2000000],
              ['requestTraceLimit', '전송 기록 수', 0, 3],
              ['responseTimeoutSeconds', '응답 대기 시간(초)', 1, 1800],
            ] as const
          ).map(([key, label, min, max]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                name={key}
                min={min}
                max={max}
                step={1}
                placeholder="기존 값 유지"
                defaultValue={settings[key] ?? ''}
              />
            </label>
          ))}
          <label>
            웹 검색
            <select
              name="webSearchEnabled"
              defaultValue={
                settings.webSearchEnabled === undefined
                  ? 'keep'
                  : String(settings.webSearchEnabled)
              }
            >
              <option value="keep">기존 값 유지</option>
              <option value="true">사용</option>
              <option value="false">사용 안 함</option>
            </select>
          </label>
          <ProviderParameterFields
            policy={{ profile: '템플릿 · 적용 시 모델 호환성 검사', fields }}
            values={values}
            unsetLabel="기존 값 유지"
            resetKeys={resetKeys}
            onChange={(next) => {
              setValues(next);
              setResetKeys((keys) =>
                keys.filter((key) => next[key] === undefined),
              );
            }}
          />
          <details>
            <summary>기본값으로 되돌릴 항목</summary>
            <p>
              체크한 항목은 현재 대화의 직접 지정값을 지우고 앱 또는 모델의 기본
              동작으로 되돌립니다. 기존 값 유지와는 다릅니다. 예를 들어 최대
              출력이 16,384인 대화에서 기존 값 유지는 16,384를 유지하고, 기본값
              복원은 8,192를 적용합니다(모델 한도가 더 작으면 해당 한도). 위에서
              값을 직접 지정한 항목은 동시에 선택할 수 없습니다.
            </p>
            {fields.map((f) => (
              <label key={f.key}>
                <input
                  type="checkbox"
                  name="resetParameter"
                  value={f.key}
                  checked={resetKeys.includes(f.key)}
                  onChange={(e) =>
                    setResetKeys((keys) =>
                      e.target.checked
                        ? [...keys, f.key]
                        : keys.filter((key) => key !== f.key),
                    )
                  }
                  disabled={values[f.key] !== undefined}
                />
                {parameterLabels[f.key] ?? f.key}
              </label>
            ))}
          </details>
          <button type="submit">{busy ? '저장 중…' : '템플릿 저장'}</button>
        </fieldset>
      </form>
    </section>
  );
}
