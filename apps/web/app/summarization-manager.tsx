'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { csrfToken } from './client-auth';

interface SummaryModel {
  connectionName: string;
  displayName: string | null;
  id: string;
  modelId: string;
  templateId: string;
}

interface SummarySettings {
  maxOutputTokens: number;
  prompt: string;
  promptVersion: number;
  providerModelId: string | null;
  updatedAt: string;
}

interface SummaryState {
  models: SummaryModel[];
  settings: SummarySettings;
}

export function SummarizationManager() {
  const [state, setState] = useState<SummaryState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/summarization', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('load failed');
      setState((await response.json()) as SummaryState);
    } catch {
      setError('요약 설정을 불러오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/summarization', {
        body: JSON.stringify({
          prompt: data.get('prompt'),
          providerModelId: data.get('providerModelId') || null,
        }),
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken(),
        },
        method: 'PUT',
      });
      if (!response.ok) throw new Error('save failed');
      const result = (await response.json()) as { settings: SummarySettings };
      setState((current) =>
        current ? { ...current, settings: result.settings } : current,
      );
      setNotice('자동 요약 설정을 저장했습니다.');
    } catch {
      setError(
        '요약 설정을 저장하지 못했습니다. 선택한 모델 상태를 확인하세요.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="summarization-management"
      aria-labelledby="summary-heading"
    >
      <div className="section-heading">
        <div>
          <p className="card-label">CONTEXT SUMMARY</p>
          <h2 id="summary-heading">컨텍스트 자동 요약</h2>
        </div>
        <button
          className="quiet-button"
          type="button"
          onClick={load}
          disabled={busy}
        >
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
      {!state ? (
        <p className="empty-state">요약 설정을 불러오는 중입니다.</p>
      ) : (
        <div className="summary-panel">
          <p>
            대화가 사용자의 컨텍스트 한도를 넘을 때만 선택한 모델로 이전 내용을
            요약합니다. 원본 메시지는 그대로 보존됩니다.
          </p>
          <form
            key={`${state.settings.promptVersion}:${state.settings.providerModelId}`}
            onSubmit={save}
          >
            <label htmlFor="summary-model">요약 모델</label>
            <select
              id="summary-model"
              name="providerModelId"
              defaultValue={state.settings.providerModelId ?? ''}
            >
              <option value="">사용 안 함</option>
              {state.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName || model.modelId} · {model.connectionName}
                </option>
              ))}
            </select>
            <label htmlFor="summary-prompt">요약 시스템 프롬프트</label>
            <textarea
              id="summary-prompt"
              name="prompt"
              minLength={20}
              maxLength={20000}
              rows={7}
              defaultValue={state.settings.prompt}
              required
            />
            <small>
              설정 버전 {state.settings.promptVersion} · 모델 또는 프롬프트를
              바꾸면 이후 요약부터 새 버전을 사용합니다.
            </small>
            <button type="submit" disabled={busy}>
              {busy ? '저장 중' : '요약 설정 저장'}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
