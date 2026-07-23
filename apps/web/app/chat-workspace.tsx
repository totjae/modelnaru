'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { csrfToken } from './client-auth';
import { selectConversationModel } from './chat-model-selection';
import { responseAlternatives } from './chat-response-navigation';
import { isNearScrollEnd } from './chat-scroll';
import {
  defaultChatParameterValues,
  parameterValuesFromRequest,
  ProviderParameterFields,
  providerParameterRequest,
  type ParameterPolicy,
  type ParameterValues,
} from './provider-parameter-fields';

interface AllowedModel {
  connectionName: string;
  displayName: string | null;
  id: string;
  modelId: string;
  templateId: string;
  supportsImageInput: boolean;
  parameterPolicy?: ParameterPolicy;
}

interface ConversationSummary {
  activeBranchId: string;
  contextTokenLimit: number;
  createdAt: string;
  defaultProviderModelId: string | null;
  generationParameters: Record<string, unknown>;
  historyMessageLimit: number;
  id: string;
  messageCount: number;
  requestTraceLimit: number;
  systemPrompt: string;
  title: string;
  updatedAt: string;
}

interface ChatMessage {
  attachments: MessageAttachment[];
  branchId: string | null;
  content: string;
  errorCode: string | null;
  id: string;
  modelIdSnapshot: string | null;
  parentMessageId: string | null;
  providerModelId: string | null;
  role: 'assistant' | 'summary' | 'user';
  sequenceNumber: number;
  status: 'cancelled' | 'completed' | 'failed' | 'pending' | 'streaming';
}

interface MessageAttachment {
  byteSize: number;
  expiresAt: string;
  fileKind: 'image' | 'pdf' | 'text';
  imageHeight: number | null;
  imageWidth: number | null;
  id: string;
  includeInFutureMessages: boolean;
  mediaType: string;
  originalName: string;
  pageCount: number | null;
  status: 'expired' | 'ready';
}

interface PendingAttachment extends MessageAttachment {
  conversationId: string;
}

interface ConversationDetail extends ConversationSummary {
  branches: Array<{
    id: string;
    isSelectable: boolean;
    messages: ChatMessage[];
    parentBranchId: string | null;
  }>;
}

interface RequestTrace {
  completedAt: string | null;
  conversationId: string;
  durationMs: number | null;
  errorCode: string | null;
  id: string;
  inputTokens: number | null;
  modelId: string;
  outputTokens: number | null;
  providerTemplateId: string;
  request: unknown;
  response: {
    content: string;
    rawEvents: unknown[];
    stopReason: string | null;
  };
  startedAt: string;
  status: 'cancelled' | 'completed' | 'failed' | 'streaming';
  truncated: boolean;
}

type StreamEvent =
  | { branchId: string; messageId: string; modelId: string; type: 'start' }
  | { text: string; type: 'text_delta' }
  | { inputTokens?: number; outputTokens?: number; type: 'usage' }
  | { durationMs: number; stopReason?: string; type: 'done' }
  | {
      code: string;
      message: string;
      retryable: boolean;
      type: 'error';
    };

const attachmentAccept = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.jsonl',
  '.csv',
  '.tsv',
  '.log',
  '.xml',
  '.yaml',
  '.yml',
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.go',
  '.rs',
  '.php',
  '.rb',
  '.sh',
  '.ps1',
  '.sql',
  '.html',
  '.css',
].join(',');

function fileSizeLabel(byteSize: number): string {
  if (byteSize < 1024) return `${byteSize} B`;
  return `${Math.ceil(byteSize / 1024)} KB`;
}

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
    if (body.error?.code === 'FILE_TOO_LARGE') {
      return '파일 하나의 크기는 최대 10MB입니다.';
    }
    if (body.error?.code === 'FILE_TYPE_UNSUPPORTED') {
      return '현재 지원하지 않는 파일 형식이거나 텍스트 파일이 아닙니다.';
    }
    if (body.error?.code === 'FILE_PDF_PAGE_LIMIT') {
      return 'PDF는 최대 100페이지까지 첨부할 수 있습니다.';
    }
    if (body.error?.code === 'FILE_PDF_PASSWORD_PROTECTED') {
      return '암호로 보호된 PDF는 첨부할 수 없습니다.';
    }
    if (body.error?.code === 'FILE_PDF_OCR_REQUIRED') {
      return '텍스트가 없는 스캔 PDF입니다. 현재 OCR은 지원하지 않습니다.';
    }
    if (body.error?.code === 'FILE_PDF_INVALID') {
      return 'PDF가 손상되었거나 올바른 PDF 형식이 아닙니다.';
    }
    if (body.error?.code === 'FILE_IMAGE_DIMENSIONS_EXCEEDED') {
      return '이미지 해상도가 서버의 최대 픽셀 제한을 초과했습니다.';
    }
    if (body.error?.code === 'FILE_ATTACHMENT_LIMIT') {
      return '메시지 하나에는 파일을 최대 10개까지 첨부할 수 있습니다.';
    }
    if (body.error?.code === 'FILE_STORAGE_LOW') {
      return '서버 저장 공간이 부족해 파일을 올릴 수 없습니다.';
    }
    if (body.error?.code === 'CHAT_ATTACHMENT_INVALID') {
      return '첨부파일이 만료되었거나 현재 대화에서 사용할 수 없습니다.';
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
  if (code === 'CHAT_REGENERATION_INVALID') {
    return '현재 대화의 가장 최근 AI 답변만 재생성할 수 있습니다.';
  }
  if (code === 'CHAT_IMAGE_MODEL_UNSUPPORTED') {
    return '선택한 모델은 이미지 입력이 허용되지 않았습니다. 이미지 지원 모델을 선택하세요.';
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
  attachments: MessageAttachment[] = [],
): ChatMessage {
  return {
    attachments,
    branchId: null,
    content,
    errorCode: null,
    id,
    modelIdSnapshot: null,
    parentMessageId: null,
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
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [parameterValues, setParameterValues] = useState<ParameterValues>({
    ...defaultChatParameterValues,
  });
  const [conversationListOpen, setConversationListOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traces, setTraces] = useState<RequestTrace[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const followLatestRef = useRef(true);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const modelsRef = useRef<AllowedModel[]>([]);
  const settingsSnapshotRef = useRef<{
    parameterValues: ParameterValues;
    selectedModel: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const closeSettings = useCallback(
    (force = false) => {
      if (busy && !force) return;
      if (
        !force &&
        settingsDirty &&
        !window.confirm('저장하지 않은 설정 변경을 취소할까요?')
      ) {
        return;
      }
      const snapshot = settingsSnapshotRef.current;
      if (!force && snapshot) {
        setSelectedModel(snapshot.selectedModel);
        setParameterValues({ ...snapshot.parameterValues });
      }
      settingsSnapshotRef.current = null;
      setSettingsDirty(false);
      setSettingsOpen(false);
    },
    [busy, settingsDirty],
  );

  function openSettings() {
    if (!detail) return;
    settingsSnapshotRef.current = {
      parameterValues: { ...parameterValues },
      selectedModel,
    };
    setSettingsDirty(false);
    setSettingsOpen(true);
  }

  async function openTraces() {
    if (!selectedId) return;
    setTraceOpen(true);
    setTraceLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/conversations/${selectedId}/traces`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const value = (await response.json()) as { traces: RequestTrace[] };
      setTraces(value.traces);
      setSelectedTraceId(value.traces[0]?.id ?? null);
    } catch (caught) {
      setTraceOpen(false);
      setError(
        caught instanceof Error
          ? caught.message
          : '전송 기록을 불러오지 못했습니다.',
      );
    } finally {
      setTraceLoading(false);
    }
  }

  async function clearTraces() {
    if (!selectedId || !window.confirm('현재 세션의 전송 기록을 지울까요?')) {
      return;
    }
    const response = await mutation(
      `/api/conversations/${selectedId}/traces`,
      'DELETE',
    );
    if (!response.ok) {
      setError(await responseMessage(response));
      return;
    }
    setTraces([]);
    setSelectedTraceId(null);
  }

  const loadDetail = useCallback(async (id: string) => {
    const [response, pendingResponse] = await Promise.all([
      fetch(`/api/conversations/${id}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      }),
      fetch(`/api/files/conversations/${id}/pending`, {
        cache: 'no-store',
        credentials: 'same-origin',
      }),
    ]);
    if (!response.ok || !pendingResponse.ok) throw new Error('detail failed');
    const value = (await response.json()) as ConversationDetail;
    const pending = (await pendingResponse.json()) as {
      attachments: MessageAttachment[];
    };
    const active = value.branches.find(
      (branch) => branch.id === value.activeBranchId,
    );
    const activeMessages = (active?.messages ?? []).filter(
      (message) => message.role === 'user' || message.role === 'assistant',
    );
    setDetail(value);
    setMessages(activeMessages);
    setSelectedModel(
      selectConversationModel(
        activeMessages,
        modelsRef.current,
        value.defaultProviderModelId,
      ),
    );
    setParameterValues(parameterValuesFromRequest(value.generationParameters));
    setPendingAttachments((current) => [
      ...current.filter((attachment) => attachment.conversationId !== id),
      ...pending.attachments.map((attachment) => ({
        ...attachment,
        conversationId: id,
      })),
    ]);
  }, []);

  const refreshConversations = useCallback(async () => {
    const response = await fetch('/api/conversations', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('conversation list failed');
    const value = (await response.json()) as {
      conversations: ConversationSummary[];
    };
    setConversations(value.conversations);
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

  useEffect(() => {
    if (!settingsOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (traceOpen) setTraceOpen(false);
        else closeSettings();
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeSettings, settingsOpen, traceOpen]);

  async function createConversation() {
    followLatestRef.current = true;
    setBusy(true);
    setError('');
    try {
      const defaultModel = modelsRef.current[0];
      const response = await mutation('/api/conversations', 'POST', {
        defaultProviderModelId: defaultModel?.id ?? null,
        generationParameters: providerParameterRequest(
          { ...defaultChatParameterValues },
          defaultModel?.parameterPolicy,
        ),
      });
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
    followLatestRef.current = true;
    setSelectedId(id);
    setError('');
    try {
      await loadDetail(id);
    } catch {
      setError('대화를 불러오지 못했습니다.');
    }
  }

  async function activateBranch(branchId: string) {
    if (!selectedId || busy || branchId === detail?.activeBranchId) return;
    followLatestRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await mutation(
        `/api/conversations/${selectedId}/branches/${branchId}/active`,
        'PATCH',
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      await loadDetail(selectedId);
      setNotice('선택한 답변 분기로 전환했습니다.');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : '답변 분기를 전환하지 못했습니다.',
      );
    } finally {
      setBusy(false);
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
          defaultProviderModelId: selectedModel || null,
          generationParameters: parameters,
          historyMessageLimit: Number(data.get('historyMessageLimit')),
          requestTraceLimit: Number(data.get('requestTraceLimit')),
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
      settingsSnapshotRef.current = null;
      setSettingsDirty(false);
      setSettingsOpen(false);
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

  async function deleteConversation(
    conversationId: string | null = selectedId,
  ) {
    if (!conversationId || !window.confirm('이 대화와 메시지를 삭제할까요?'))
      return;
    setBusy(true);
    setError('');
    try {
      const response = await mutation(
        `/api/conversations/${conversationId}`,
        'DELETE',
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      const remaining = conversations.filter(
        (conversation) => conversation.id !== conversationId,
      );
      setConversations(remaining);
      setPendingAttachments((current) =>
        current.filter(
          (attachment) => attachment.conversationId !== conversationId,
        ),
      );
      if (conversationId === selectedId) {
        const next = remaining[0]?.id ?? null;
        followLatestRef.current = true;
        setSelectedId(next);
        setDetail(null);
        setMessages([]);
        settingsSnapshotRef.current = null;
        setSettingsDirty(false);
        setSettingsOpen(false);
        if (next) await loadDetail(next);
      }
      setNotice('대화를 삭제했습니다.');
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
    return providerParameterRequest(
      parameterValues,
      models.find((model) => model.id === selectedModel)?.parameterPolicy,
    );
  }, [models, parameterValues, selectedModel]);

  const currentPendingAttachments = useMemo(
    () =>
      pendingAttachments.filter(
        (attachment) => attachment.conversationId === selectedId,
      ),
    [pendingAttachments, selectedId],
  );
  const selectedTrace =
    traces.find((trace) => trace.id === selectedTraceId) ?? null;

  const latestMessage = messages.at(-1);
  const alternatives = useMemo(
    () =>
      detail && latestMessage?.branchId
        ? responseAlternatives(detail.branches, latestMessage)
        : [],
    [detail, latestMessage],
  );
  const activeAlternativeIndex = alternatives.findIndex(
    (alternative) => alternative.branchId === detail?.activeBranchId,
  );

  useEffect(() => {
    if (!followLatestRef.current) return;
    const animationFrame = window.requestAnimationFrame(() => {
      const list = messageListRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [messages]);

  useEffect(() => {
    if (!error && !notice) return;
    const timeout = window.setTimeout(() => {
      setError('');
      setNotice('');
    }, 5_000);
    return () => window.clearTimeout(timeout);
  }, [error, notice]);

  async function streamAssistant(
    response: Response,
    temporaryAssistantId: string,
  ) {
    let currentAssistantId = temporaryAssistantId;
    let completed = false;
    await consumeSse(response, (streamEvent) => {
      if (streamEvent.type === 'start') {
        currentAssistantId = streamEvent.messageId;
        setAssistantId(streamEvent.messageId);
        setMessages((current) =>
          current.map((message) =>
            message.id === temporaryAssistantId
              ? {
                  ...message,
                  branchId: streamEvent.branchId,
                  id: streamEvent.messageId,
                  modelIdSnapshot: streamEvent.modelId,
                  providerModelId: selectedModel,
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
        completed = true;
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
    return completed;
  }

  async function uploadAttachments(files: FileList | null) {
    if (!files || !selectedId || busy || uploading) return;
    const available = 10 - currentPendingAttachments.length;
    if (available <= 0) {
      setError('메시지 하나에는 파일을 최대 10개까지 첨부할 수 있습니다.');
      return;
    }
    const selectedFiles = [...files].slice(0, available);
    if (files.length > available) {
      setNotice(`최대 10개까지만 선택되어 ${available}개를 추가합니다.`);
    }
    setUploading(true);
    setError('');
    try {
      for (const file of selectedFiles) {
        if (file.size > 10 * 1024 * 1024) {
          throw new Error(`${file.name}: 파일 크기는 최대 10MB입니다.`);
        }
        const response = await fetch(`/api/files/conversations/${selectedId}`, {
          method: 'POST',
          body: file,
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-CSRF-Token': csrfToken(),
            'X-File-Name': encodeURIComponent(file.name),
            'X-File-Media-Type': file.type || 'application/octet-stream',
            'X-Include-In-Future': 'false',
          },
        });
        if (!response.ok) throw new Error(await responseMessage(response));
        const attachment = (await response.json()) as MessageAttachment;
        setPendingAttachments((current) => [
          ...current,
          { ...attachment, conversationId: selectedId },
        ]);
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '파일을 올리지 못했습니다.',
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploading(false);
    }
  }

  async function updatePendingAttachment(
    attachment: PendingAttachment,
    includeInFutureMessages: boolean,
  ) {
    try {
      const response = await mutation(
        `/api/files/conversations/${attachment.conversationId}/${attachment.id}`,
        'PATCH',
        { includeInFutureMessages },
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      setPendingAttachments((current) =>
        current.map((item) =>
          item.id === attachment.id
            ? { ...item, includeInFutureMessages }
            : item,
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : '첨부 설정을 바꾸지 못했습니다.',
      );
    }
  }

  async function removePendingAttachment(attachment: PendingAttachment) {
    try {
      const response = await mutation(
        `/api/files/conversations/${attachment.conversationId}/${attachment.id}`,
        'DELETE',
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      setPendingAttachments((current) =>
        current.filter((item) => item.id !== attachment.id),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : '첨부를 삭제하지 못했습니다.',
      );
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !selectedModel || busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const rawContent = data.get('message');
    const content = typeof rawContent === 'string' ? rawContent.trim() : '';
    if (!content && currentPendingAttachments.length === 0) return;
    if (
      currentPendingAttachments.some(
        (attachment) => attachment.fileKind === 'image',
      ) &&
      !models.find((model) => model.id === selectedModel)?.supportsImageInput
    ) {
      setError(
        '선택한 모델은 이미지 입력이 허용되지 않았습니다. 설정에서 이미지 지원 모델을 선택하세요.',
      );
      return;
    }
    followLatestRef.current = true;
    const temporaryUserId = `user-${Date.now()}`;
    const temporaryAssistantId = `assistant-${Date.now()}`;
    setMessages((current) => [
      ...current,
      temporaryMessage(
        temporaryUserId,
        'user',
        content,
        currentPendingAttachments,
      ),
      temporaryMessage(temporaryAssistantId, 'assistant', ''),
    ]);
    setBusy(true);
    setError('');
    setNotice('');
    form.reset();
    const controller = new AbortController();
    abortRef.current = controller;
    let attachmentsSubmitted = false;
    try {
      const response = await mutation(
        `/api/conversations/${selectedId}/messages`,
        'POST',
        {
          attachmentIds: currentPendingAttachments.map(
            (attachment) => attachment.id,
          ),
          content,
          parameters,
          providerModelId: selectedModel,
        },
        controller.signal,
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      attachmentsSubmitted = true;
      await streamAssistant(response, temporaryAssistantId);
      await loadDetail(selectedId);
      await refreshConversations().catch(() => undefined);
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
      if (attachmentsSubmitted) {
        const submittedIds = new Set(
          currentPendingAttachments.map((attachment) => attachment.id),
        );
        setPendingAttachments((current) =>
          current.filter((attachment) => !submittedIds.has(attachment.id)),
        );
      }
      abortRef.current = null;
      setAssistantId(null);
      setBusy(false);
    }
  }

  async function regenerateMessage(message: ChatMessage) {
    if (
      !selectedId ||
      !selectedModel ||
      busy ||
      message.role !== 'assistant' ||
      message.status === 'pending' ||
      message.status === 'streaming'
    ) {
      return;
    }
    followLatestRef.current = true;
    const temporaryAssistantId = `regenerated-${Date.now()}`;
    setMessages((current) =>
      current.map((currentMessage) =>
        currentMessage.id === message.id
          ? {
              ...temporaryMessage(temporaryAssistantId, 'assistant', ''),
              branchId: message.branchId,
              parentMessageId: message.parentMessageId,
              providerModelId: selectedModel,
              sequenceNumber: message.sequenceNumber,
            }
          : currentMessage,
      ),
    );
    setBusy(true);
    setError('');
    setNotice('새 답변 분기를 생성하고 있습니다.');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await mutation(
        `/api/conversations/${selectedId}/messages/${message.id}/regenerate`,
        'POST',
        { parameters, providerModelId: selectedModel },
        controller.signal,
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      const completed = await streamAssistant(response, temporaryAssistantId);
      await loadDetail(selectedId);
      await refreshConversations().catch(() => undefined);
      if (completed) setNotice('새 답변을 별도 분기로 보존했습니다.');
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(
          caught instanceof Error
            ? caught.message
            : '답변을 재생성하지 못했습니다.',
        );
      }
      try {
        await loadDetail(selectedId);
      } catch {
        // Keep the preview when the active branch cannot be reloaded.
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
    <section
      className={`chat-workspace${conversationListOpen ? '' : ' sidebar-collapsed'}`}
      aria-label="AI 대화 공간"
    >
      <aside className="chat-sidebar" hidden={!conversationListOpen}>
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
              <div
                className={`conversation-list-item${conversation.id === selectedId ? ' active' : ''}`}
                key={conversation.id}
              >
                <button
                  className="conversation-select"
                  type="button"
                  onClick={() => selectConversation(conversation.id)}
                >
                  <strong>{conversation.title}</strong>
                  <small>{conversation.messageCount}개 메시지</small>
                </button>
                <button
                  className="conversation-list-delete"
                  type="button"
                  aria-label={`${conversation.title} 대화 삭제`}
                  title="대화 삭제"
                  onClick={() => void deleteConversation(conversation.id)}
                  disabled={busy}
                >
                  삭제
                </button>
              </div>
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
            className={`banner chat-toast ${error ? 'error-banner' : 'success-banner'}`}
            role={error ? 'alert' : 'status'}
            aria-live={error ? 'assertive' : 'polite'}
          >
            {error || notice}
          </div>
        )}
        <div className="chat-toolbar">
          <button
            className="panel-toggle conversation-panel-toggle"
            type="button"
            aria-expanded={conversationListOpen}
            onClick={() => setConversationListOpen((current) => !current)}
          >
            <span aria-hidden="true">{conversationListOpen ? '←' : '→'}</span>
            대화 목록
          </button>
          <div className="chat-toolbar-context">
            <strong title={detail?.title ?? '대화 공간'}>
              {detail?.title ?? '대화 공간'}
            </strong>
            <span>
              {models.find((model) => model.id === selectedModel)
                ?.displayName ||
                models.find((model) => model.id === selectedModel)?.modelId ||
                '모델 미선택'}
            </span>
          </div>
          <button
            className="panel-toggle settings-panel-toggle"
            type="button"
            aria-expanded={settingsOpen}
            aria-haspopup="dialog"
            onClick={openSettings}
            disabled={!detail}
          >
            설정
          </button>
        </div>
        {!detail ? (
          <div className="chat-welcome">
            <p className="card-label">READY TO CROSS MODELS</p>
            <h2>새 대화를 만들어 시작하세요</h2>
            <p>허용된 모델을 대화마다 자유롭게 바꿔 사용할 수 있습니다.</p>
          </div>
        ) : (
          <>
            <div
              className="message-list"
              aria-live="polite"
              ref={messageListRef}
              onScroll={(event) => {
                followLatestRef.current = isNearScrollEnd(event.currentTarget);
              }}
            >
              {messages.length === 0 ? (
                <div className="chat-welcome compact">
                  <h2>{detail.title}</h2>
                  <p>첫 메시지를 입력해 대화를 시작하세요.</p>
                </div>
              ) : (
                messages.map((message, messageIndex) => (
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
                        (message.status === 'pending'
                          ? '생각하는 중…'
                          : message.attachments.length > 0
                            ? '첨부파일을 전송했습니다.'
                            : '')}
                    </p>
                    {message.attachments.length > 0 && (
                      <ul className="message-attachments" aria-label="첨부파일">
                        {message.attachments.map((attachment) => (
                          <li key={attachment.id}>
                            <span>{attachment.originalName}</span>
                            <small>
                              {fileSizeLabel(attachment.byteSize)}
                              {attachment.pageCount !== null
                                ? ` · ${attachment.pageCount}페이지`
                                : ''}
                              {attachment.imageWidth !== null &&
                              attachment.imageHeight !== null
                                ? ` · ${attachment.imageWidth}×${attachment.imageHeight}`
                                : ''}
                              {attachment.includeInFutureMessages
                                ? ' · 후속 포함'
                                : ''}
                              {attachment.status === 'expired'
                                ? ' · 원본 만료'
                                : ''}
                            </small>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(message.status === 'failed' ||
                      message.status === 'cancelled') && (
                      <small className="message-state">
                        {message.status === 'cancelled'
                          ? '중지됨'
                          : '응답 실패'}
                      </small>
                    )}
                    {messageIndex === messages.length - 1 &&
                      message.role === 'assistant' && (
                        <div className="message-actions">
                          <div
                            className="response-navigation"
                            aria-label="답변 분기 탐색"
                          >
                            <button
                              type="button"
                              aria-label="이전 답변"
                              title="이전 답변"
                              onClick={() =>
                                activateBranch(
                                  alternatives[activeAlternativeIndex - 1]!
                                    .branchId,
                                )
                              }
                              disabled={busy || activeAlternativeIndex <= 0}
                            >
                              ←
                            </button>
                            <span>
                              {activeAlternativeIndex >= 0
                                ? activeAlternativeIndex + 1
                                : 1}
                              /{Math.max(alternatives.length, 1)}
                            </span>
                            <button
                              type="button"
                              aria-label="다음 답변"
                              title="다음 답변"
                              onClick={() =>
                                activateBranch(
                                  alternatives[activeAlternativeIndex + 1]!
                                    .branchId,
                                )
                              }
                              disabled={
                                busy ||
                                activeAlternativeIndex < 0 ||
                                activeAlternativeIndex >=
                                  alternatives.length - 1
                              }
                            >
                              →
                            </button>
                          </div>
                          {message.status !== 'pending' &&
                            message.status !== 'streaming' && (
                              <button
                                className="regenerate-button"
                                type="button"
                                onClick={() => regenerateMessage(message)}
                                disabled={busy || !selectedModel}
                                aria-label="답변 재생성"
                                title="답변 재생성"
                              >
                                ↻
                              </button>
                            )}
                        </div>
                      )}
                  </article>
                ))
              )}
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <div className="attachment-composer">
                <input
                  ref={fileInputRef}
                  id="chat-file-input"
                  className="visually-hidden"
                  type="file"
                  accept={attachmentAccept}
                  multiple
                  disabled={
                    busy || uploading || currentPendingAttachments.length >= 10
                  }
                  onChange={(event) =>
                    void uploadAttachments(event.target.files)
                  }
                />
                <label
                  className="attachment-add-button"
                  htmlFor="chat-file-input"
                  aria-disabled={
                    busy || uploading || currentPendingAttachments.length >= 10
                  }
                >
                  {uploading
                    ? '파일 처리 중…'
                    : `파일 추가 ${currentPendingAttachments.length}/10`}
                </label>
                {currentPendingAttachments.length > 0 && (
                  <ul className="pending-attachments">
                    {currentPendingAttachments.map((attachment) => (
                      <li key={attachment.id}>
                        <span>
                          <strong>{attachment.originalName}</strong>
                          <small>{fileSizeLabel(attachment.byteSize)}</small>
                          {attachment.pageCount !== null && (
                            <small>{attachment.pageCount}페이지</small>
                          )}
                          {attachment.imageWidth !== null &&
                            attachment.imageHeight !== null && (
                              <small>
                                {attachment.imageWidth}×{attachment.imageHeight}
                              </small>
                            )}
                        </span>
                        <label>
                          <input
                            type="checkbox"
                            checked={attachment.includeInFutureMessages}
                            disabled={busy || uploading}
                            onChange={(event) =>
                              void updatePendingAttachment(
                                attachment,
                                event.target.checked,
                              )
                            }
                          />
                          후속 메시지에도 포함
                        </label>
                        <button
                          type="button"
                          disabled={busy || uploading}
                          onClick={() =>
                            void removePendingAttachment(attachment)
                          }
                        >
                          삭제
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <textarea
                name="message"
                rows={3}
                maxLength={200000}
                placeholder={
                  models.length === 0
                    ? '관리자가 모델 권한을 부여해야 합니다.'
                    : '메시지를 입력하세요'
                }
                disabled={busy || uploading || models.length === 0}
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
                <button type="submit" disabled={!selectedModel || uploading}>
                  보내기
                </button>
              )}
            </form>
          </>
        )}
      </div>

      {settingsOpen &&
        detail &&
        createPortal(
          <div
            className="settings-modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeSettings();
            }}
          >
            <section
              className="chat-settings"
              role="dialog"
              aria-modal="true"
              aria-labelledby="conversation-settings-title"
            >
              <header className="settings-modal-header">
                <div>
                  <p className="card-label">CONVERSATION SETTINGS</p>
                  <h2 id="conversation-settings-title">대화 설정</h2>
                </div>
                <button
                  type="button"
                  className="settings-modal-close"
                  aria-label="설정 닫기"
                  onClick={() => closeSettings()}
                  disabled={busy}
                >
                  ×
                </button>
              </header>
              <form
                key={detail.id}
                onSubmit={saveSettings}
                onChange={() => setSettingsDirty(true)}
              >
                <div className="settings-modal-body">
                  <label>
                    대화 제목
                    <input
                      name="title"
                      defaultValue={detail.title}
                      maxLength={200}
                      autoFocus
                      required
                    />
                  </label>
                  <label>
                    모델
                    <select
                      value={selectedModel}
                      onChange={(event) => {
                        setSelectedModel(event.target.value);
                        setParameterValues({ ...defaultChatParameterValues });
                      }}
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
                  <fieldset className="parameter-box">
                    <legend>생성 파라미터</legend>
                    <ProviderParameterFields
                      policy={
                        models.find((model) => model.id === selectedModel)
                          ?.parameterPolicy
                      }
                      values={parameterValues}
                      onChange={setParameterValues}
                    />
                  </fieldset>
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
                    <small>
                      0은 전체 대화입니다.
                      <br />
                      값이 크면 더 많은 이전 문맥을 모델에 전달합니다.
                    </small>
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
                  <label>
                    전송 기록 보관
                    <select
                      name="requestTraceLimit"
                      defaultValue={detail.requestTraceLimit}
                    >
                      <option value="0">사용하지 않음</option>
                      <option value="1">최근 요청 1개</option>
                      <option value="2">최근 요청 2개</option>
                      <option value="3">최근 요청 3개</option>
                    </select>
                    <small>
                      현재 로그인 세션에만 보관하며 로그아웃하면 즉시
                      삭제됩니다. API 키와 이미지 원문은 기록하지 않습니다.
                    </small>
                  </label>
                  <label>
                    시스템 프롬프트
                    <textarea
                      name="systemPrompt"
                      defaultValue={detail.systemPrompt}
                      rows={10}
                      maxLength={100000}
                    />
                  </label>
                </div>
                <footer className="settings-modal-actions">
                  <div className="settings-actions-left">
                    <button
                      type="button"
                      className="trace-button"
                      onClick={() => void openTraces()}
                      disabled={busy}
                    >
                      전송 기록
                    </button>
                  </div>
                  <div className="settings-actions-right">
                    <button
                      type="button"
                      className="quiet-button"
                      onClick={() => closeSettings()}
                      disabled={busy}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => void deleteConversation()}
                      disabled={busy}
                    >
                      대화 삭제
                    </button>
                    <button
                      className="settings-save-button"
                      type="submit"
                      disabled={busy}
                    >
                      설정 저장
                    </button>
                  </div>
                </footer>
              </form>
            </section>
          </div>,
          document.body,
        )}
      {traceOpen &&
        createPortal(
          <div
            className="settings-modal-backdrop trace-modal-layer"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setTraceOpen(false);
            }}
          >
            <section
              className="request-trace-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="request-trace-title"
            >
              <header className="settings-modal-header">
                <div>
                  <p className="card-label">SESSION REQUEST TRACE</p>
                  <h2 id="request-trace-title">요청·응답 전송 기록</h2>
                </div>
                <button
                  type="button"
                  className="settings-modal-close"
                  aria-label="전송 기록 닫기"
                  onClick={() => setTraceOpen(false)}
                >
                  ×
                </button>
              </header>
              <div className="trace-privacy-note">
                현재 로그인 세션에서 이 대화의 최근{' '}
                {detail?.requestTraceLimit ?? 0}
                개만 메모리에 보관합니다. 로그아웃 시 삭제되며 인증 정보와
                이미지 원문은 표시하지 않습니다.
              </div>
              <div className="request-trace-layout">
                <aside className="request-trace-list">
                  {traceLoading ? (
                    <p className="muted">불러오는 중…</p>
                  ) : traces.length === 0 ? (
                    <p className="muted">
                      보관된 전송 기록이 없습니다. 기록 수를 1~3으로 저장한 뒤
                      새 메시지를 보내세요.
                    </p>
                  ) : (
                    traces.map((trace) => (
                      <button
                        type="button"
                        key={trace.id}
                        className={
                          trace.id === selectedTraceId ? 'is-active' : ''
                        }
                        onClick={() => setSelectedTraceId(trace.id)}
                      >
                        <strong>{trace.modelId}</strong>
                        <span>
                          {new Date(trace.startedAt).toLocaleString('ko-KR')}
                        </span>
                        <span className={`trace-status ${trace.status}`}>
                          {trace.status}
                        </span>
                      </button>
                    ))
                  )}
                </aside>
                <div className="request-trace-detail">
                  {selectedTrace ? (
                    <>
                      <dl className="trace-summary">
                        <div>
                          <dt>Provider</dt>
                          <dd>{selectedTrace.providerTemplateId}</dd>
                        </div>
                        <div>
                          <dt>소요 시간</dt>
                          <dd>
                            {selectedTrace.durationMs === null
                              ? '-'
                              : `${selectedTrace.durationMs}ms`}
                          </dd>
                        </div>
                        <div>
                          <dt>토큰</dt>
                          <dd>
                            입력 {selectedTrace.inputTokens ?? '-'} · 출력{' '}
                            {selectedTrace.outputTokens ?? '-'}
                          </dd>
                        </div>
                        <div>
                          <dt>종료 사유</dt>
                          <dd>
                            {selectedTrace.errorCode ??
                              selectedTrace.response.stopReason ??
                              '-'}
                          </dd>
                        </div>
                      </dl>
                      {selectedTrace.truncated && (
                        <p className="trace-warning">
                          2MB 제한을 넘어 일부 내용이 생략되었습니다.
                        </p>
                      )}
                      <section>
                        <h3>Provider 요청</h3>
                        <pre>
                          {JSON.stringify(selectedTrace.request, null, 2)}
                        </pre>
                      </section>
                      <section>
                        <h3>최종 응답 본문</h3>
                        <pre>
                          {selectedTrace.response.content || '(본문 없음)'}
                        </pre>
                      </section>
                      <section>
                        <h3>Provider 원시 응답 이벤트</h3>
                        <pre>
                          {JSON.stringify(
                            selectedTrace.response.rawEvents,
                            null,
                            2,
                          )}
                        </pre>
                      </section>
                    </>
                  ) : (
                    <p className="muted">왼쪽에서 전송 기록을 선택하세요.</p>
                  )}
                </div>
              </div>
              <footer className="trace-modal-actions">
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => void clearTraces()}
                  disabled={traces.length === 0}
                >
                  현재 기록 삭제
                </button>
                <button type="button" onClick={() => setTraceOpen(false)}>
                  닫기
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </section>
  );
}
