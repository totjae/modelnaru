'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { chatApi } from './chat-api';
type Settings = { providerModelId: string | null; version: string };
type Connection = {
  id: string;
  name: string;
  isEnabled: boolean;
  status: string;
  models: {
    id: string;
    modelId: string;
    isEnabled: boolean;
    isAvailable: boolean;
  }[];
};
export function TitleSettings() {
  const [value, setValue] = useState('');
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false);
    Promise.all([
      chatApi<Settings>('/api/admin/title-generation', {
        signal: controller.signal,
      }),
      chatApi<{ connections: Connection[] }>(
        '/api/admin/provider-connections',
        { signal: controller.signal },
      ),
    ])
      .then(([settings, data]) => {
        if (controller.signal.aborted) return;
        setValue(settings.providerModelId ?? '');
        setModels(
          data.connections
            .filter((c) => c.isEnabled && c.status === 'ready')
            .flatMap((c) =>
              c.models
                .filter((m) => m.isEnabled && m.isAvailable)
                .map((m) => ({ id: m.id, label: c.name + ' · ' + m.modelId })),
            ),
        );
        setLoaded(true);
        setMessage('');
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage('제목 설정을 불러오지 못했습니다.');
      });
    return () => controller.abort();
  }, [retry]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await chatApi<Settings>('/api/admin/title-generation', {
        method: 'PUT',
        body: { providerModelId: value || null },
      });
      setValue(result.providerModelId ?? '');
      setMessage('자동 제목 설정을 저장했습니다.');
    } catch {
      setMessage(
        '저장하지 못했습니다. 모델 권한·연결과 세션을 확인하세요. 초안은 유지됩니다.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="title-settings">
      <h2>자동 제목</h2>
      <p>
        첫 정상 답변 후 지정 모델로 제목을 만듭니다. 보조 호출 비용이 발생할 수
        있으며, 수동 제목은 보존됩니다.
      </p>
      <form onSubmit={save}>
        <label htmlFor="title-model">제목 생성 모델</label>
        <select
          id="title-model"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!loaded || busy}
        >
          <option value="">사용하지 않음</option>
          {value && !models.some((m) => m.id === value) && (
            <option value={value}>현재 모델 · 사용 불가</option>
          )}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          disabled={
            !loaded || busy || (!!value && !models.some((m) => m.id === value))
          }
        >
          제목 설정 저장
        </button>
      </form>
      {!loaded && (
        <button type="button" onClick={() => setRetry((v) => v + 1)}>
          다시 불러오기
        </button>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
