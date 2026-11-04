'use client';
import { useEffect, useState } from 'react';
import { ChatDialog } from './chat-dialog';
import { parameterLabels } from './provider-parameter-fields';
import { chatApi } from './chat-api';
import type { ChatTemplate, TemplateSettings } from './chat-template-types';
const labels: Record<string, string> = {
  ...parameterLabels,
  historyMessageLimit: '이력 메시지 수',
  contextTokenLimit: '문맥 토큰 한도',
  requestTraceLimit: '전송 기록 수',
  responseTimeoutSeconds: '응답 대기 시간(초)',
  webSearchEnabled: '웹 검색',
};
interface Preview {
  settings: TemplateSettings & { defaultProviderModelId: string };
  excluded: string[];
  previewToken: string;
}
export function ChatTemplatePicker({
  conversationId,
  revision,
  currentModel,
  models,
  onClose,
  onApplied,
}: {
  conversationId: string;
  revision: string;
  currentModel: string;
  models: { id: string; modelId: string; connectionName: string }[];
  onClose: () => void;
  onApplied: () => Promise<void>;
}) {
  const [templates, setTemplates] = useState<ChatTemplate[]>([]),
    [selected, setSelected] = useState(''),
    [model, setModel] = useState(currentModel);
  const [preview, setPreview] = useState<Preview | null>(null),
    [previewOpen, setPreviewOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    chatApi<{ templates: ChatTemplate[] }>('/api/chat-templates', {
      signal: abort.signal,
    })
      .then((d) => {
        if (!abort.signal.aborted) setTemplates(d.templates);
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setMessage(
            e instanceof Error ? e.message : '목록을 불러오지 못했습니다.',
          );
      });
    return () => abort.abort();
  }, [retry]);
  const template = templates.find((t) => t.id === selected);
  function choose(id: string) {
    const t = templates.find((t) => t.id === id);
    setSelected(id);
    setModel(t?.providerModelId ?? currentModel);
    setPreview(null);
    setPreviewOpen(false);
    setConfirmed(false);
    setMessage('');
  }
  async function submit(apply: boolean) {
    if (!template) return;
    setBusy(true);
    setMessage('');
    try {
      const body = {
        templateId: template.id,
        templateVersion: template.version,
        settingsRevision: revision,
        providerModelId: model,
      };
      const prepared =
        preview ??
        (await chatApi<Preview>(
          `/api/conversations/${conversationId}/template-preview`,
          { method: 'POST', body },
        ));
      setPreview(prepared);
      if (apply) {
        if (prepared.excluded.length && !confirmed) {
          setMessage(
            '이 모델에서 지원하지 않는 설정을 제외할지 확인해 주세요.',
          );
          return;
        }
        await chatApi(`/api/conversations/${conversationId}/template-apply`, {
          method: 'POST',
          body: { ...body, previewToken: prepared.previewToken },
        });
        await onApplied();
        onClose();
      } else {
        setPreviewOpen(true);
      }
    } catch (e) {
      setPreview(null);
      setPreviewOpen(false);
      setConfirmed(false);
      setMessage(e instanceof Error ? e.message : '적용하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <ChatDialog
      label="템플릿 선택"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <h2>템플릿 선택</h2>
      <p>현재 대화에 적용합니다. 적용 후 설정을 자유롭게 수정할 수 있습니다.</p>
      <label>
        템플릿
        <select
          aria-label="템플릿"
          value={selected}
          disabled={busy}
          onChange={(e) => choose(e.target.value)}
        >
          <option value="">템플릿을 선택하세요</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {template && (
        <>
          <p>{template.description}</p>
          {template.modelUnavailable && (
            <p role="status">
              지정 모델을 사용할 수 없습니다. 현재 모델 또는 허용된 모델을
              선택해 적용하세요.
            </p>
          )}
          <label>
            적용할 모델
            <select
              aria-label="적용할 모델"
              value={model}
              disabled={busy}
              onChange={(e) => {
                setModel(e.target.value);
                setPreview(null);
                setPreviewOpen(false);
                setConfirmed(false);
              }}
            >
              <option value="">모델 선택</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.connectionName} · {m.modelId}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !models.some((m) => m.id === model)}
            aria-expanded={previewOpen}
            aria-controls="template-preview-content"
            onClick={() =>
              previewOpen ? setPreviewOpen(false) : void submit(false)
            }
          >
            {previewOpen ? '미리보기 닫기' : '적용 내용 미리보기'}
          </button>
        </>
      )}
      {preview && previewOpen && (
        <div className="template-preview" id="template-preview-content">
          <h3>적용될 설정</h3>
          <p>
            모델:{' '}
            {
              models.find(
                (m) => m.id === preview.settings.defaultProviderModelId,
              )?.modelId
            }
          </p>
          <pre>{preview.settings.systemPrompt || '(시스템 프롬프트 없음)'}</pre>
          <dl>
            {Object.entries({
              ...preview.settings,
              ...preview.settings.generationParameters,
            })
              .filter(
                ([key]) =>
                  ![
                    'systemPrompt',
                    'defaultProviderModelId',
                    'settingsRevision',
                    'generationParameters',
                  ].includes(key),
              )
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{labels[key] ?? key}</dt>
                  <dd>
                    {typeof value === 'boolean'
                      ? value
                        ? '사용'
                        : '사용 안 함'
                      : Array.isArray(value)
                        ? value.join(', ')
                        : typeof value === 'string' || typeof value === 'number'
                          ? String(value)
                          : ''}
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      )}
      {!!preview?.excluded.length && (
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          이 모델에서 지원하지 않는 설정을 제외합니다:{' '}
          {preview.excluded.map((key) => labels[key] ?? key).join(', ')}
        </label>
      )}
      <p role="status">{message}</p>
      {message && (
        <button
          disabled={busy}
          onClick={() => {
            setPreview(null);
            setPreviewOpen(false);
            setConfirmed(false);
            setRetry((v) => v + 1);
          }}
        >
          템플릿 목록 새로고침
        </button>
      )}
      <div className="template-dialog-actions">
        <button type="button" disabled={busy} onClick={onClose}>
          닫기
        </button>
        <button
          type="button"
          disabled={
            busy ||
            !template ||
            !models.some((m) => m.id === model) ||
            (!!preview?.excluded.length && !confirmed)
          }
          onClick={() => void submit(true)}
        >
          적용
        </button>
      </div>
    </ChatDialog>
  );
}
