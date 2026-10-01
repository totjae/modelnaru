'use client';
import { useState, type FormEvent } from 'react';
import { chatApi, ChatApiError } from './chat-api';
import { ChatDialog } from './chat-dialog';
import type { ProviderConnection } from './provider-manager';
type Stage = 'network' | 'models' | 'chat';
const stages: { id: Stage; label: string }[] = [
  { id: 'network', label: '네트워크' },
  { id: 'models', label: '인증·모델 조회' },
  { id: 'chat', label: '채팅' },
];
const labels: Record<string, string> = {
  reachable: '접속 가능',
  models_available: '모델 조회 성공',
  chat_verified: '채팅 확인',
  failed: '실패',
  unsupported: '조회 미지원',
};
export function ProviderDiagnostics({
  connection,
  onChanged,
}: {
  connection: ProviderConnection;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [model, setModel] = useState('');
  const [results, setResults] = useState(connection.diagnostics);
  async function test(stage: Stage) {
    setConfirm(false);
    setBusy(true);
    setMessage('');
    try {
      const result = await chatApi<{
        status: string;
        errorCode: string | null;
        checkedAt: string;
      }>('/api/admin/provider-connections/' + connection.id + '/test', {
        method: 'POST',
        body: {
          stage,
          ...(stage === 'chat' ? { providerModelId: model } : {}),
        },
      });
      setResults((current) => ({ ...current, [stage]: result }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [stage]: {
          status: 'failed',
          checkedAt: null,
          errorCode:
            error instanceof ChatApiError ? error.code : 'REQUEST_FAILED',
        },
      }));
      setMessage('진단 요청에 실패했습니다. 연결 상태·권한을 확인하세요.');
    } finally {
      setBusy(false);
    }
  }
  async function manual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage('');
    const body: Record<string, unknown> = { modelId: data.get('modelId') };
    for (const key of ['contextWindow', 'maxOutputTokens'])
      if (data.get(key)) body[key] = Number(data.get(key));
    try {
      await chatApi(
        '/api/admin/provider-connections/' + connection.id + '/models/manual',
        { method: 'POST', body },
      );
      form.reset();
      await onChanged();
      setMessage('수동 모델을 등록했습니다. 필요한 모델을 활성화하세요.');
    } catch {
      setMessage('수동 모델 등록에 실패했습니다. 모델 ID와 한도를 확인하세요.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="provider-diagnostics">
      <h4>연결 진단</h4>
      <p>
        네트워크 도달은 인증 성공을 뜻하지 않습니다. 모델 조회 미지원 연결은
        수동 ID로 채팅 시험을 할 수 있습니다.
      </p>
      <label>
        시험 모델
        <select
          aria-label="시험 모델"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={busy}
        >
          <option value="">선택하세요</option>
          {connection.models
            .filter((m) => m.isAvailable)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.modelId}
              </option>
            ))}
        </select>
      </label>
      <ul>
        {stages.map((stage) => (
          <li key={stage.id}>
            <span>
              {stage.label}:{' '}
              {results?.[stage.id]?.status
                ? (labels[results[stage.id]!.status!] ??
                  '실패 · 상태 확인 필요')
                : '미확인'}
            </span>
            {results?.[stage.id]?.errorCode && (
              <small>
                {results[stage.id]?.errorCode === 'PROVIDER_AUTH_FAILED'
                  ? '인증 실패 · API 키를 확인하세요.'
                  : results[stage.id]?.errorCode === 'PROVIDER_RESPONSE_INVALID'
                    ? '모델 응답 확인 실패 · 목록 미지원 서비스라면 수동 모델을 사용하세요.'
                    : '요청 실패 · 주소, 권한과 Provider 상태를 확인하세요.'}
              </small>
            )}
            <button
              type="button"
              disabled={
                busy || !connection.isEnabled || (stage.id === 'chat' && !model)
              }
              onClick={() =>
                stage.id === 'chat' ? setConfirm(true) : void test(stage.id)
              }
            >
              {stage.label} 시험
            </button>
          </li>
        ))}
      </ul>
      <details>
        <summary>수동 모델 추가</summary>
        <form className="n11-form" onSubmit={manual}>
          <fieldset disabled={busy}>
            <label>
              모델 ID
              <input name="modelId" maxLength={255} required />
            </label>
            <label>
              컨텍스트 한도
              <input
                name="contextWindow"
                type="number"
                min={1}
                max={2147483647}
              />
            </label>
            <label>
              출력 토큰 한도
              <input
                name="maxOutputTokens"
                type="number"
                min={1}
                max={2147483647}
              />
            </label>
            <button>모델 추가</button>
          </fieldset>
        </form>
      </details>
      <p role="status">{busy ? '요청 중…' : message}</p>
      {confirm && (
        <ChatDialog
          label="채팅 시험 비용 확인"
          onClose={() => setConfirm(false)}
        >
          <h3>채팅 시험</h3>
          <p>
            선택한 모델에 짧은 요청을 전송합니다. Provider 비용이 발생할 수
            있습니다.
          </p>
          <button onClick={() => setConfirm(false)}>돌아가기</button>
          <button onClick={() => void test('chat')}>비용 확인 후 실행</button>
        </ChatDialog>
      )}
    </div>
  );
}
