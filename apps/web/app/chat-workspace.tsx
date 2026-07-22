'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import { csrfToken } from './client-auth';
import { selectConversationModel } from './chat-model-selection';

interface AllowedModel {
  connectionName: string;
  displayName: string | null;
  id: string;
  modelId: string;
  templateId: string;
}

interface ConversationSummary {
  activeBranchId: string;
  contextTokenLimit: number;
  createdAt: string;
  historyMessageLimit: number;
  id: string;
  messageCount: number;
  systemPrompt: string;
  title: string;
  updatedAt: string;
}

interface ChatMessage {
  content: string;
  errorCode: string | null;
  id: string;
  modelIdSnapshot: string | null;
  providerModelId: string | null;
  role: 'assistant' | 'summary' | 'user';
  sequenceNumber: number;
  status: 'cancelled' | 'completed' | 'failed' | 'pending' | 'streaming';
}

interface ConversationDetail extends ConversationSummary {
  branches: Array<{
    id: string;
    messages: ChatMessage[];
  }>;
}

type StreamEvent =
  | { messageId: string; modelId: string; type: 'start' }
  | { text: string; type: 'text_delta' }
  | { inputTokens?: number; outputTokens?: number; type: 'usage' }
  | { durationMs: number; stopReason?: string; type: 'done' }
  | {
      code: string;
      message: string;
      retryable: boolean;
      type: 'error';
    };

function mutation(
  path: string,
  method: 'DELETE' | 'PATCH' | 'POST',
  body?: Record<string, unknown>,
  signal?: AbortSignal,
) {
  return fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  });
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    if (body.error?.code === 'ACCESS_DAILY_LIMIT_REACHED') {
      return '오늘 사용할 수 있는 호출 횟수를 모두 사용했습니다.';
    }
    if (body.error?.code === 'ACCESS_MODEL_FORBIDDEN') {
      return '이 계정에는 선택한 모델 권한이 없습니다.';
    }
    return body.error?.message || '요청을 처리하지 못했습니다.';
  } catch {
    return '요청을 처리하지 못했습니다.';
  }
}

function streamError(code: string): string {
  if (code === 'ACCESS_DAILY_LIMIT_REACHED') {
    return '오늘 사용할 수 있는 호출 횟수를 모두 사용했습니다.';
  }
  if (code === 'CHAT_CANCELLED') return '답변 생성을 중지했습니다.';
  if (code === 'CHAT_MODEL_UNAVAILABLE')
    return '현재 사용할 수 없는 모델입니다.';
  if (code === 'CHAT_CONTEXT_LIMIT_EXCEEDED') {
    return '대화가 컨텍스트 한도를 넘었습니다. 이전 메시지 수를 줄여주세요.';
  }
  if (code === 'CHAT_PARAMETER_INVALID') {
    return '생성 파라미터가 선택한 모델의 허용 범위를 넘었습니다.';
  }
  if (code === 'CHAT_PROVIDER_AUTH_FAILED') {
    return 'Provider 인증에 실패했습니다. 관리자에게 알려주세요.';
  }
  if (code === 'CHAT_PROVIDER_RATE_LIMITED') {
    return 'Provider 요청이 많습니다. 잠시 후 다시 시도하세요.';
  }
  return 'AI 답변을 완료하지 못했습니다.';
}

async function consumeSse(
  response: Response,
  onEvent: (event: StreamEvent) => void,
) {
  if (!response.body) throw new Error('stream body missing');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/gu, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) onEvent(JSON.parse(data) as StreamEvent);
      boundary = buffer.indexOf('\n\n');
    }
    if (done) break;
  }
}

function temporaryMessage(
  id: string,
  role: 'assistant' | 'user',
  content: string,
): ChatMessage {
  return {
    content,
    errorCode: null,
    id,
    modelIdSnapshot: null,
    providerModelId: null,
    role,
    sequenceNumber: Number.MAX_SAFE_INTEGER,
    status: role === 'user' ? 'completed' : 'pending',
  };
}

export function ChatWorkspace({ isGuest }: { isGuest: boolean }) {
  const [models, setModels] = useState<AllowedModel[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [temperature, setTemperature] = useState('');
  const [topP, setTopP] = useState('');
  const [maxOutputTokens, setMaxOutputTokens] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const modelsRef = useRef<AllowedModel[]>([]);

  const loadDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/conversations/${id}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('detail failed');
    const value = (await response.json()) as ConversationDetail;
    const active = value.branches.find(
      (branch) => branch.id === value.activeBranchId,
    );
    const activeMessages = (active?.messages ?? []).filter(
      (message) => message.role === 'user' || message.role === 'assistant',
    );
    setDetail(value);
    setMessages(activeMessages);
    setSelectedModel((current) =>
      selectConversationModel(activeMessages, modelsRef.current, current),
    );
  }, []);

  const load = useCallback(
    async (preferredId?: string) => {
      setLoading(true);
      setError('');
      try {
        const [modelResponse, conversationResponse] = await Promise.all([
          fetch('/api/access/models', {
            cache: 'no-store',
            credentials: 'same-origin',
          }),
          fetch('/api/conversations', {
            cache: 'no-store',
            credentials: 'same-origin',
          }),
        ]);
        if (!modelResponse.ok || !conversationResponse.ok) {
          throw new Error('workspace failed');
        }
        const modelBody = (await modelResponse.json()) as {
          models: AllowedModel[];
        };
        const conversationBody = (await conversationResponse.json()) as {
          conversations: ConversationSummary[];
        };
        modelsRef.current = modelBody.models;
        setModels(modelBody.models);
        setConversations(conversationBody.conversations);
        const nextId = preferredId || conversationBody.conversations[0]?.id;
        if (nextId) {
          setSelectedId(nextId);
          await loadDetail(nextId);
        }
      } catch {
        setError('대화 공간을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    },
    [loadDetail],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function createConversation() {
    setBusy(true);
    setError('');
    try {
      const response = await mutation('/api/conversations', 'POST', {});
      if (!response.ok) throw new Error(await responseMessage(response));
      const created = (await response.json()) as ConversationSummary;
      setConversations((current) => [created, ...current]);
      setSelectedId(created.id);
      await loadDetail(created.id);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '대화를 만들지 못했습니다.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function selectConversation(id: string) {
    if (busy) return;
    setSelectedId(id);
    setError('');
    try {
      await loadDetail(id);
    } catch {
      setError('대화를 불러오지 못했습니다.');
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await mutation(
        `/api/conversations/${selectedId}`,
        'PATCH',
        {
          contextTokenLimit: Number(data.get('contextTokenLimit')),
          historyMessageLimit: Number(data.get('historyMessageLimit')),
          systemPrompt: data.get('systemPrompt'),
          title: data.get('title'),
        },
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      const updated = (await response.json()) as ConversationSummary;
      setDetail((current) => (current ? { ...current, ...updated } : current));
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === updated.id ? updated : conversation,
        ),
      );
      setNotice('대화 설정을 저장했습니다.');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : '설정을 저장하지 못했습니다.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteConversation() {
    if (!selectedId || !window.confirm('이 대화와 메시지를 삭제할까요?'))
      return;
    setBusy(true);
    try {
      const response = await mutation(
        `/api/conversations/${selectedId}`,
        'DELETE',
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      const remaining = conversations.filter(
        (conversation) => conversation.id !== selectedId,
      );
      setConversations(remaining);
      const next = remaining[0]?.id ?? null;
      setSelectedId(next);
      setDetail(null);
      setMessages([]);
      if (next) await loadDetail(next);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : '대화를 삭제하지 못했습니다.',
      );
    } finally {
      setBusy(false);
    }
  }

  const parameters = useMemo(() => {
    const value: Record<string, number> = {};
    if (temperature !== '') value.temperature = Number(temperature);
    if (topP !== '') value.topP = Number(topP);
    if (maxOutputTokens !== '') {
      value.maxOutputTokens = Number(maxOutputTokens);
    }
    return value;
  }, [maxOutputTokens, temperature, topP]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !selectedModel || busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const rawContent = data.get('message');
    const content = typeof rawContent === 'string' ? rawContent.trim() : '';
    if (!content) return;
    const temporaryUserId = `user-${Date.now()}`;
    const temporaryAssistantId = `assistant-${Date.now()}`;
    setMessages((current) => [
      ...current,
      temporaryMessage(temporaryUserId, 'user', content),
      temporaryMessage(temporaryAssistantId, 'assistant', ''),
    ]);
    setBusy(true);
    setError('');
    setNotice('');
    form.reset();
    const controller = new AbortController();
    abortRef.current = controller;
    let currentAssistantId = temporaryAssistantId;
    try {
      const response = await mutation(
        `/api/conversations/${selectedId}/messages`,
        'POST',
        { content, parameters, providerModelId: selectedModel },
        controller.signal,
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      await consumeSse(response, (streamEvent) => {
        if (streamEvent.type === 'start') {
          currentAssistantId = streamEvent.messageId;
          setAssistantId(streamEvent.messageId);
          setMessages((current) =>
            current.map((message) =>
              message.id === temporaryAssistantId
                ? {
                    ...message,
                    id: streamEvent.messageId,
                    modelIdSnapshot: streamEvent.modelId,
                    status: 'streaming',
                  }
                : message,
            ),
          );
        } else if (streamEvent.type === 'text_delta') {
          setMessages((current) =>
            current.map((message) =>
              message.id === currentAssistantId
                ? { ...message, content: message.content + streamEvent.text }
                : message,
            ),
          );
        } else if (streamEvent.type === 'done') {
          setMessages((current) =>
            current.map((message) =>
              message.id === currentAssistantId
                ? { ...message, status: 'completed' }
                : message,
            ),
          );
        } else if (streamEvent.type === 'error') {
          setError(streamError(streamEvent.code));
          setMessages((current) =>
            current.map((message) =>
              message.id === currentAssistantId
                ? {
                    ...message,
                    errorCode: streamEvent.code,
                    status:
                      streamEvent.code === 'CHAT_CANCELLED'
                        ? 'cancelled'
                        : 'failed',
                  }
                : message,
            ),
          );
        }
      });
      await loadDetail(selectedId);
      await load(selectedId);
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(
          caught instanceof Error
            ? caught.message
            : '메시지를 보내지 못했습니다.',
        );
      }
      try {
        await loadDetail(selectedId);
      } catch {
        // Keep the optimistic messages when refresh is unavailable.
      }
    } finally {
      abortRef.current = null;
      setAssistantId(null);
      setBusy(false);
    }
  }

  async function stopResponse() {
    if (!selectedId) return;
    if (assistantId) {
      await mutation(
        `/api/conversations/${selectedId}/messages/${assistantId}/cancel`,
        'POST',
      ).catch(() => undefined);
    }
    abortRef.current?.abort();
    setNotice('답변 중지를 요청했습니다.');
  }

  if (loading) {
    return (
      <section className="workspace-empty">대화 공간을 준비하는 중…</section>
    );
  }

  return (
    <section className="chat-workspace" aria-label="AI 대화 공간">
      <aside className="chat-sidebar">
        <button
          className="new-chat-button"
          type="button"
          onClick={createConversation}
          disabled={busy}
        >
          + 새 대화
        </button>
        <nav aria-label="대화 목록">
          {conversations.length === 0 ? (
            <p>아직 대화가 없습니다.</p>
          ) : (
            conversations.map((conversation) => (
              <button
                className={conversation.id === selectedId ? 'active' : ''}
                key={conversation.id}
                type="button"
                onClick={() => selectConversation(conversation.id)}
              >
                <strong>{conversation.title}</strong>
                <small>{conversation.messageCount}개 메시지</small>
              </button>
            ))
          )}
        </nav>
        <p className="chat-isolation-note">
          {isGuest
            ? '이 대화는 현재 게스트 세션에만 보입니다.'
            : '이 계정의 대화는 다른 사용자와 분리됩니다.'}
        </p>
      </aside>

      <div className="chat-main">
        {(error || notice) && (
          <div
            className={error ? 'banner error-banner' : 'banner success-banner'}
            role="status"
          >
            {error || notice}
          </div>
        )}
        {!detail ? (
          <div className="chat-welcome">
            <p className="card-label">READY TO CROSS MODELS</p>
            <h2>새 대화를 만들어 시작하세요</h2>
            <p>허용된 모델을 대화마다 자유롭게 바꿔 사용할 수 있습니다.</p>
          </div>
        ) : (
          <>
            <div className="chat-toolbar">
              <label>
                모델
                <select
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                  disabled={busy}
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.displayName || model.modelId} ·{' '}
                      {model.connectionName}
                    </option>
                  ))}
                </select>
              </label>
              <details>
                <summary>생성 파라미터</summary>
                <div className="parameter-grid">
                  <label>
                    Temperature
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={temperature}
                      onChange={(event) => setTemperature(event.target.value)}
                    />
                  </label>
                  <label>
                    Top P
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      value={topP}
                      onChange={(event) => setTopP(event.target.value)}
                    />
                  </label>
                  <label>
                    최대 출력 토큰
                    <input
                      type="number"
                      min="1"
                      max="131072"
                      value={maxOutputTokens}
                      onChange={(event) =>
                        setMaxOutputTokens(event.target.value)
                      }
                    />
                  </label>
                </div>
              </details>
            </div>

            <div className="message-list" aria-live="polite">
              {messages.length === 0 ? (
                <div className="chat-welcome compact">
                  <h2>{detail.title}</h2>
                  <p>첫 메시지를 입력해 대화를 시작하세요.</p>
                </div>
              ) : (
                messages.map((message) => (
                  <article
                    className={`chat-message ${message.role} ${message.status}`}
                    key={message.id}
                  >
                    <div>
                      <strong>{message.role === 'user' ? '나' : 'AI'}</strong>
                      {message.modelIdSnapshot && (
                        <small>{message.modelIdSnapshot}</small>
                      )}
                    </div>
                    <p>
                      {message.content ||
                        (message.status === 'pending' ? '생각하는 중…' : '')}
                    </p>
                    {(message.status === 'failed' ||
                      message.status === 'cancelled') && (
                      <small className="message-state">
                        {message.status === 'cancelled'
                          ? '중지됨'
                          : '응답 실패'}
                      </small>
                    )}
                  </article>
                ))
              )}
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <textarea
                name="message"
                rows={3}
                maxLength={200000}
                placeholder={
                  models.length === 0
                    ? '관리자가 모델 권한을 부여해야 합니다.'
                    : '메시지를 입력하세요'
                }
                disabled={busy || models.length === 0}
                required
              />
              {busy ? (
                <button
                  type="button"
                  className="stop-button"
                  onClick={stopResponse}
                >
                  답변 중지
                </button>
              ) : (
                <button type="submit" disabled={!selectedModel}>
                  보내기
                </button>
              )}
            </form>
          </>
        )}
      </div>

      <aside className="chat-settings">
        {detail ? (
          <form key={detail.id} onSubmit={saveSettings}>
            <p className="card-label">CONVERSATION SETTINGS</p>
            <label>
              대화 제목
              <input
                name="title"
                defaultValue={detail.title}
                maxLength={200}
                required
              />
            </label>
            <label>
              시스템 프롬프트
              <textarea
                name="systemPrompt"
                defaultValue={detail.systemPrompt}
                rows={8}
                maxLength={100000}
              />
            </label>
            <label>
              이전 메시지 수
              <input
                name="historyMessageLimit"
                type="number"
                min="0"
                max="10000"
                defaultValue={detail.historyMessageLimit}
                required
              />
              <small>0은 전체 대화입니다.</small>
            </label>
            <label>
              컨텍스트 토큰 한도
              <input
                name="contextTokenLimit"
                type="number"
                min="1000"
                max="2000000"
                defaultValue={detail.contextTokenLimit}
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              설정 저장
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={deleteConversation}
              disabled={busy}
            >
              대화 삭제
            </button>
          </form>
        ) : (
          <p>대화를 선택하면 설정이 표시됩니다.</p>
        )}
      </aside>
    </section>
  );
}
