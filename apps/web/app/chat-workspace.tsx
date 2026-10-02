'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import { csrfToken } from './client-auth';
import { chatApi, ChatApiError } from './chat-api';
import {
  followJob,
  isRunning,
  type ActiveJob,
  type JobSnapshot,
} from './job-subscription';
import { SafeMarkdown } from './safe-markdown';
import { ModelPicker, type PickerModel } from './chat-model-picker';
import { ThemeToggle } from './theme-toggle';
import { ChatDialog } from './chat-dialog';
import { ChatIcon } from './chat-icons';
import { mergeOlderMessagePage } from './chat-message-pagination';
import { responseAlternatives } from './chat-response-navigation';
import { isNearScrollEnd } from './chat-scroll';
import { LatestRequest } from './latest-request';
import {
  defaultChatParameterValues,
  parameterValuesFromRequest,
  ProviderParameterFields,
  providerParameterRequest,
  type ParameterPolicy,
  type ParameterValues,
} from './provider-parameter-fields';

interface AllowedModel {
  isFavorite?: boolean;
  connectionName: string;
  displayName: string | null;
  id: string;
  modelId: string;
  templateId: string;
  supportsImageInput: boolean;
  supportsWebSearch: boolean;
  parameterPolicy?: ParameterPolicy;
}

interface ConversationSummary {
  settingsRevision: string;
  isPinned: boolean;
  titleSource: 'default' | 'auto' | 'manual';
  titleStatus: string;
  activeJob: ActiveJob | null;
  activeBranchId: string;
  contextTokenLimit: number;
  createdAt: string;
  defaultProviderModelId: string | null;
  generationParameters: Record<string, unknown>;
  historyMessageLimit: number;
  id: string;
  messageCount: number;
  requestTraceLimit: number;
  responseTimeoutSeconds: number;
  systemPrompt: string;
  title: string;
  updatedAt: string;
  webSearchEnabled: boolean;
}

interface ChatMessage {
  jobId?: string | null;
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
  ocrPageCount: number;
  originalName: string;
  pageCount: number | null;
  status: 'expired' | 'ready' | 'processing' | 'failed';
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
  messagePage: MessagePageMetadata;
  messages: ChatMessage[];
}

interface MessagePageMetadata {
  hasMore: boolean;
  nextBeforeSequence: number | null;
}

interface MessagePageResult {
  messagePage: MessagePageMetadata;
  messages: ChatMessage[];
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
      return '텍스트가 없는 스캔 PDF이며 OCR 처리가 필요합니다.';
    }
    if (body.error?.code === 'FILE_PDF_OCR_NO_TEXT') {
      return 'OCR을 실행했지만 인식할 수 있는 글자가 없습니다.';
    }
    if (body.error?.code === 'FILE_PDF_OCR_FAILED') {
      return 'PDF OCR 처리에 실패했습니다. 해상도나 문서 상태를 확인하세요.';
    }
    if (body.error?.code === 'FILE_PDF_OCR_UNAVAILABLE') {
      return '서버에서 PDF OCR을 사용할 수 없습니다. 관리자에게 문의하세요.';
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
    return new ChatApiError(
      response.status,
      body.error?.code ?? 'REQUEST_FAILED',
    ).message;
  } catch {
    return '요청을 처리하지 못했습니다.';
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
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
  if (code === 'CHAT_PROVIDER_TIMEOUT') {
    return '설정한 응답 대기 시간을 초과해 답변 생성을 중단했습니다.';
  }
  return 'AI 답변을 완료하지 못했습니다.';
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

function rememberConversation(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('conversation', id);
  else url.searchParams.delete('conversation');
  window.history.replaceState(null, '', url);
}

export function ChatWorkspace({ isGuest }: { isGuest: boolean }) {
  const [models, setModels] = useState<AllowedModel[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [jobStates, setJobStates] = useState<Record<string, string>>({});
  const [messagePage, setMessagePage] = useState<MessagePageMetadata>({
    hasMore: false,
    nextBeforeSequence: null,
  });
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [mutating, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [unknownStarts, setUnknownStarts] = useState<
    Record<string, { path: string; body: Record<string, unknown>; key: string }>
  >({});
  const startsRef = useRef(new Set<string>());
  const [connection, setConnection] = useState('ended');
  const [query, setQuery] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const listRequests = useRef(new LatestRequest());
  const knownJobs = useRef(new Map<string, ActiveJob>());
  const attachmentRequests = useRef(new Map<string, number>());
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const [settingsConflict, setSettingsConflict] =
    useState<ConversationSummary | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const settingsForm = useRef<HTMLFormElement>(null);
  const busy =
    mutating ||
    !!detail?.activeJob ||
    !!(selectedId && unknownStarts[selectedId]) ||
    detail?.id !== selectedId;
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

  const detailRequestsRef = useRef(new LatestRequest());
  const messagePageRequestsRef = useRef(new LatestRequest());
  const workspaceRequestsRef = useRef(new LatestRequest());
  const followLatestRef = useRef(true);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const prependScrollRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const modelsRef = useRef<AllowedModel[]>([]);
  const settingsSnapshotRef = useRef<{
    parameterValues: ParameterValues;
    selectedModel: string;
    title: string;
    titleChanged: boolean;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const draft = selectedId ? (drafts[selectedId] ?? '') : '';
  useLayoutEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    const resize = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(160, textarea.scrollHeight)}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [draft, loading, selectedId, conversationListOpen, settingsOpen]);
  useEffect(() => {
    if (!notice || error) return;
    const timeout = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice, error]);

  const closeSettings = useCallback(
    (force = false) => {
      if (!force && settingsDirty) {
        setPendingAction(() => () => {
          setSettingsOpen(false);
          setSettingsDirty(false);
          setSettingsConflict(null);
          if (settingsSnapshotRef.current)
            setParameterValues(settingsSnapshotRef.current.parameterValues);
        });
        return;
      }
      if (settingsSnapshotRef.current)
        setParameterValues(settingsSnapshotRef.current.parameterValues);
      setSettingsDirty(false);
      setSettingsConflict(null);
      setSettingsOpen(false);
    },
    [settingsDirty],
  );

  function openSettings() {
    if (!detail) return;
    settingsSnapshotRef.current = {
      parameterValues: { ...parameterValues },
      selectedModel,
      title: detail.title,
      titleChanged: false,
    };
    setSettingsDirty(false);
    setSettingsConflict(null);
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
    messagePageRequestsRef.current.cancel();
    prependScrollRef.current = null;
    setLoadingOlderMessages(false);
    const request = detailRequestsRef.current.start();
    try {
      const [response, pendingResponse] = await Promise.all([
        fetch(`/api/conversations/${id}`, {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: request.signal,
        }),
        fetch(`/api/files/conversations/${id}/pending`, {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: request.signal,
        }),
      ]);
      if (!response.ok) throw new Error(await responseMessage(response));
      if (!pendingResponse.ok)
        throw new Error(await responseMessage(pendingResponse));
      const value = (await response.json()) as ConversationDetail;
      const pending = (await pendingResponse.json()) as {
        attachments: MessageAttachment[];
      };
      if (!request.isCurrent() || selectedRef.current !== id) return false;
      const activeMessages = value.messages.filter(
        (message) => message.role === 'user' || message.role === 'assistant',
      );
      setDetail(value);
      const lastAnswer = activeMessages
        .filter((message) => message.role === 'assistant')
        .at(-1);
      if (lastAnswer)
        setJobStates((current) => ({ ...current, [id]: lastAnswer.status }));
      setMessages(activeMessages);
      setMessagePage(value.messagePage);
      setSelectedModel(
        modelsRef.current.some(
          (model) => model.id === value.defaultProviderModelId,
        )
          ? value.defaultProviderModelId!
          : '',
      );
      setParameterValues(
        parameterValuesFromRequest(value.generationParameters),
      );
      setPendingAttachments((current) => [
        ...current.filter((attachment) => attachment.conversationId !== id),
        ...pending.attachments.map((attachment) => ({
          ...attachment,
          conversationId: id,
        })),
      ]);
      return true;
    } catch (error) {
      if (isAbortError(error) || !request.isCurrent()) return false;
      throw error;
    }
  }, []);

  async function loadOlderMessages() {
    if (
      !selectedId ||
      !messagePage.hasMore ||
      messagePage.nextBeforeSequence === null ||
      loadingOlderMessages
    ) {
      return;
    }
    const selectedConversationId = selectedId;
    const request = messagePageRequestsRef.current.start();
    const list = messageListRef.current;
    if (list) {
      prependScrollRef.current = {
        scrollHeight: list.scrollHeight,
        scrollTop: list.scrollTop,
      };
    }
    followLatestRef.current = false;
    setLoadingOlderMessages(true);
    setError('');
    try {
      const response = await fetch(
        `/api/conversations/${selectedConversationId}/messages?beforeSequence=${messagePage.nextBeforeSequence}&limit=50`,
        {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: request.signal,
        },
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      const value = (await response.json()) as MessagePageResult;
      if (!request.isCurrent()) return;
      setMessages((current) => {
        const older = value.messages.filter(
          (message) => message.role === 'user' || message.role === 'assistant',
        );
        return mergeOlderMessagePage(older, current);
      });
      setMessagePage(value.messagePage);
    } catch (caught) {
      prependScrollRef.current = null;
      if (isAbortError(caught) || !request.isCurrent()) return;
      setError(
        caught instanceof Error
          ? caught.message
          : '이전 메시지를 불러오지 못했습니다.',
      );
    } finally {
      if (request.isCurrent()) setLoadingOlderMessages(false);
    }
  }

  const refreshConversations = useCallback(
    async (cursor?: string) => {
      const request = listRequests.current.start();
      setListLoading(true);
      try {
        const search = new URLSearchParams({ query, limit: '30' });
        if (cursor) search.set('cursor', cursor);
        const value = await chatApi<{
          conversations: ConversationSummary[];
          nextCursor: string | null;
        }>(`/api/conversations?${search}`, { signal: request.signal });
        if (!request.isCurrent()) return;
        setDetail((current) => {
          const title = value.conversations.find(
            (item) => item.id === current?.id,
          );
          return current && title
            ? {
                ...current,
                title: title.title,
                titleSource: title.titleSource,
                titleStatus: title.titleStatus,
              }
            : current;
        });
        for (const item of value.conversations) {
          if (item.activeJob) knownJobs.current.set(item.id, item.activeJob);
          else {
            const previous = knownJobs.current.get(item.id);
            if (previous) {
              knownJobs.current.delete(item.id);
              setJobStates((current) => ({ ...current, [item.id]: 'unknown' }));
              void chatApi<{ job: JobSnapshot }>(
                `/api/conversations/${item.id}/jobs/${previous.id}`,
                { signal: request.signal },
              )
                .then(({ job }) => {
                  if (request.isCurrent())
                    setJobStates((current) => ({
                      ...current,
                      [item.id]: job.status,
                    }));
                })
                .catch(() => undefined);
            }
          }
        }
        setConversations((current) =>
          cursor
            ? [
                ...current,
                ...value.conversations.filter(
                  (item) => !current.some((old) => old.id === item.id),
                ),
              ]
            : value.conversations,
        );
        setNextCursor(value.nextCursor);
      } catch (caught) {
        if (request.isCurrent() && !isAbortError(caught))
          setError(
            caught instanceof Error
              ? caught.message
              : '목록을 불러오지 못했습니다.',
          );
      } finally {
        if (request.isCurrent()) setListLoading(false);
      }
    },
    [query],
  );
  useEffect(() => {
    const timer = setTimeout(() => void refreshConversations(), 250);
    return () => {
      clearTimeout(timer);
      listRequests.current.cancel();
    };
  }, [refreshConversations]);
  const hasListedJob = conversations.some(
    (item) => item.activeJob || item.titleStatus === 'pending',
  );
  useEffect(() => {
    if (!hasListedJob) return;
    const timer = setInterval(() => void refreshConversations(), 5000);
    return () => clearInterval(timer);
  }, [hasListedJob, refreshConversations]);

  const load = useCallback(
    async (preferredId?: string) => {
      const request = workspaceRequestsRef.current.start();
      setLoading(true);
      setError('');
      try {
        const [modelResponse, conversationResponse] = await Promise.all([
          fetch('/api/access/models', {
            cache: 'no-store',
            credentials: 'same-origin',
            signal: request.signal,
          }),
          fetch('/api/conversations', {
            cache: 'no-store',
            credentials: 'same-origin',
            signal: request.signal,
          }),
        ]);
        if (!modelResponse.ok || !conversationResponse.ok) {
          throw new Error(
            await responseMessage(
              !modelResponse.ok ? modelResponse : conversationResponse,
            ),
          );
        }
        const modelBody = (await modelResponse.json()) as {
          models: AllowedModel[];
        };
        const conversationBody = (await conversationResponse.json()) as {
          conversations: ConversationSummary[];
          nextCursor: string | null;
        };
        if (!request.isCurrent()) return;
        modelsRef.current = modelBody.models;
        setModels(modelBody.models);
        setConversations(conversationBody.conversations);
        setNextCursor(conversationBody.nextCursor);
        const nextId =
          preferredId ||
          new URLSearchParams(window.location.search).get('conversation') ||
          conversationBody.conversations[0]?.id;
        if (nextId) {
          selectedRef.current = nextId;
          setSelectedId(nextId);
          rememberConversation(nextId);
          await loadDetail(nextId);
        }
      } catch (caught) {
        if (isAbortError(caught) || !request.isCurrent()) return;
        setError(
          caught instanceof Error
            ? caught.message
            : '대화 공간을 불러오지 못했습니다.',
        );
      } finally {
        if (request.isCurrent()) setLoading(false);
      }
    },
    [loadDetail],
  );

  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 767px)');
    const closeList = () => {
      if (narrow.matches) setConversationListOpen(false);
    };
    closeList();
    narrow.addEventListener('change', closeList);
    void load();
    return () => {
      narrow.removeEventListener('change', closeList);
      workspaceRequestsRef.current.cancel();
      detailRequestsRef.current.cancel();
      messagePageRequestsRef.current.cancel();
    };
  }, [load]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () =>
      document.documentElement.style.setProperty(
        '--chat-viewport',
        `${viewport?.height ?? window.innerHeight}px`,
      );
    resize();
    viewport?.addEventListener('resize', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      document.documentElement.style.removeProperty('--chat-viewport');
    };
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        window.innerWidth >= 1024 &&
        !pendingAction
      ) {
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
  }, [closeSettings, settingsOpen, traceOpen, pendingAction]);

  async function createConversation(discard = false) {
    if (settingsDirty && !discard) {
      setPendingAction(() => () => {
        setSettingsDirty(false);
        setSettingsOpen(false);
        void createConversation(true);
      });
      return;
    }
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
      selectedRef.current = created.id;
      setSelectedId(created.id);
      rememberConversation(created.id);
      setDetail(null);
      if (window.innerWidth < 768) setConversationListOpen(false);
      await loadDetail(created.id);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '대화를 만들지 못했습니다.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function selectConversation(id: string, discard = false) {
    if (mutating) return;
    if (settingsDirty && !discard) {
      setPendingAction(() => () => {
        setSettingsDirty(false);
        setSettingsOpen(false);
        void selectConversation(id, true);
      });
      return;
    }
    setSettingsOpen(false);
    setSettingsConflict(null);
    selectedRef.current = id;
    setDetail(null);
    setMessages([]);
    if (window.innerWidth < 768) setConversationListOpen(false);
    followLatestRef.current = true;
    setSelectedId(id);
    rememberConversation(id);
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
        { settingsRevision: detail.settingsRevision },
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
    if (!selectedId || !detail || busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await mutation(
        `/api/conversations/${selectedId}`,
        'PATCH',
        {
          settingsRevision: detail.settingsRevision,
          contextTokenLimit: Number(data.get('contextTokenLimit')),
          generationParameters: parameters,
          historyMessageLimit: Number(data.get('historyMessageLimit')),
          requestTraceLimit: Number(data.get('requestTraceLimit')),
          responseTimeoutSeconds: Number(data.get('responseTimeoutSeconds')),
          systemPrompt: data.get('systemPrompt'),
          ...(settingsSnapshotRef.current?.titleChanged &&
          typeof data.get('title') === 'string'
            ? { title: (data.get('title') as string).trim() }
            : {}),
          webSearchEnabled: data.get('webSearchEnabled') === 'on',
        },
      );
      if (!response.ok) {
        const value = (await response
          .clone()
          .json()
          .catch(() => ({}))) as {
          error?: { code?: string; conversation?: ConversationSummary };
        };
        if (
          value.error?.code === 'CHAT_SETTINGS_CONFLICT' &&
          value.error.conversation
        ) {
          setSettingsConflict(value.error.conversation);
          setSelectedModel(
            value.error.conversation.defaultProviderModelId ?? '',
          );
          setDetail((current) =>
            current ? { ...current, ...value.error!.conversation! } : current,
          );
        }
        throw new Error(await responseMessage(response));
      }
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
      setSettingsConflict(null);
      setNotice('대화 설정을 저장했습니다.');
      const action = pendingAction;
      setPendingAction(null);
      action?.();
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
        selectedRef.current = next;
        setSelectedId(next);
        rememberConversation(next);
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
    const animationFrame = window.requestAnimationFrame(() => {
      const list = messageListRef.current;
      const prepend = prependScrollRef.current;
      if (list && prepend) {
        list.scrollTop =
          prepend.scrollTop + (list.scrollHeight - prepend.scrollHeight);
        prependScrollRef.current = null;
      } else if (list && followLatestRef.current) {
        list.scrollTop = list.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [messages]);

  useEffect(() => {
    const jobId = detail?.activeJob?.id;
    if (!selectedId || !jobId) return;
    const controller = new AbortController();
    const id = selectedId;
    void followJob(
      id,
      jobId,
      controller.signal,
      (job) => {
        if (controller.signal.aborted || selectedRef.current !== id) return;
        setJobStates((current) => ({ ...current, [id]: job.status }));
        setMessages((current) => {
          const exists = current.some(
            (message) => message.id === job.assistantMessageId,
          );
          const list = exists
            ? current
            : [
                ...current,
                temporaryMessage(job.assistantMessageId, 'assistant', ''),
              ];
          return list.map((message) =>
            message.id === job.assistantMessageId
              ? {
                  ...message,
                  content: job.content,
                  status: job.status,
                  errorCode: job.errorCode,
                  branchId: job.branchId,
                  jobId: job.id,
                }
              : message,
          );
        });
        if (!isRunning(job)) {
          setDetail((current) =>
            current?.id === id ? { ...current, activeJob: null } : current,
          );
          setNotice(
            job.status === 'completed'
              ? '답변이 완료되었습니다.'
              : streamError(job.errorCode ?? ''),
          );
          void loadDetail(id).catch(() => undefined);
          void refreshConversations();
        }
      },
      (state) => {
        if (!controller.signal.aborted) setConnection(state);
      },
    ).catch((caught: unknown) => {
      if (!controller.signal.aborted)
        setError(
          caught instanceof Error
            ? caught.message
            : '작업 상태를 확인하지 못했습니다.',
        );
    });
    return () => controller.abort();
  }, [selectedId, detail?.activeJob?.id, loadDetail, refreshConversations]);

  async function patchConversation(
    id: string,
    changes: Record<string, unknown>,
  ) {
    const current =
      detail?.id === id ? detail : conversations.find((item) => item.id === id);
    if (!current) return;
    try {
      const updated = await chatApi<ConversationSummary>(
        `/api/conversations/${id}`,
        {
          method: 'PATCH',
          body: { ...changes, settingsRevision: current.settingsRevision },
        },
      );
      setDetail((value) =>
        value?.id === id ? { ...value, ...updated } : value,
      );
      if ('defaultProviderModelId' in changes && selectedRef.current === id) {
        setSelectedModel(updated.defaultProviderModelId ?? '');
        setParameterValues(
          parameterValuesFromRequest(updated.generationParameters),
        );
      }
      await refreshConversations();
    } catch (caught) {
      if (caught instanceof ChatApiError && caught.conversation) {
        const latest = caught.conversation as ConversationSummary;
        setDetail((value) =>
          value?.id === id ? { ...value, ...latest } : value,
        );
        if (selectedRef.current === id)
          setSelectedModel(latest.defaultProviderModelId ?? '');
      }
      setError(
        caught instanceof Error ? caught.message : '변경하지 못했습니다.',
      );
    }
  }
  async function selectModel(id: string) {
    if (!selectedId || busy) return;
    if (settingsDirty) {
      setNotice('미적용 설정을 적용하거나 버린 뒤 모델을 변경하세요.');
      return;
    }
    setBusy(true);
    try {
      await patchConversation(selectedId, { defaultProviderModelId: id });
    } finally {
      setBusy(false);
    }
  }
  async function favoriteModel(model: PickerModel) {
    try {
      await chatApi(`/api/model-favorites/${model.id}`, {
        method: model.isFavorite ? 'DELETE' : 'PUT',
      });
      setModels((current) =>
        current.map((item) =>
          item.id === model.id
            ? { ...item, isFavorite: !model.isFavorite }
            : item,
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : '즐겨찾기를 변경하지 못했습니다.',
      );
    }
  }
  const refreshAttachments = useCallback(async (id: string) => {
    const revision = (attachmentRequests.current.get(id) ?? 0) + 1;
    attachmentRequests.current.set(id, revision);
    const result = await chatApi<{ attachments: MessageAttachment[] }>(
      `/api/files/conversations/${id}/pending`,
    );
    if (attachmentRequests.current.get(id) !== revision) return;
    setPendingAttachments((current) => [
      ...current.filter((item) => item.conversationId !== id),
      ...result.attachments.map((item) => ({ ...item, conversationId: id })),
    ]);
  }, []);
  useEffect(() => {
    if (
      !selectedId ||
      !(
        uploading ||
        currentPendingAttachments.some((item) => item.status === 'processing')
      )
    )
      return;
    const timer = setInterval(
      () => void refreshAttachments(selectedId).catch(() => undefined),
      1500,
    );
    return () => clearInterval(timer);
  }, [selectedId, uploading, currentPendingAttachments, refreshAttachments]);
  async function retryAttachment(attachment: PendingAttachment) {
    setPendingAttachments((items) =>
      items.map((item) =>
        item.id === attachment.id ? { ...item, status: 'processing' } : item,
      ),
    );
    try {
      await chatApi(
        `/api/files/conversations/${attachment.conversationId}/${attachment.id}/retry`,
        { method: 'POST' },
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '재처리에 실패했습니다.',
      );
    } finally {
      await refreshAttachments(attachment.conversationId).catch(
        () => undefined,
      );
    }
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
          ...current.filter((item) => item.id !== attachment.id),
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
      await refreshAttachments(selectedId).catch(() => undefined);
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

  async function startJob(
    request: { path: string; body: Record<string, unknown>; key: string },
    id: string,
  ) {
    if (startsRef.current.has(id)) return;
    startsRef.current.add(id);
    setBusy(true);
    setError('');
    setUnknownStarts((current) => ({ ...current, [id]: request }));
    try {
      const result = await chatApi<{ job: JobSnapshot }>(request.path, {
        method: 'POST',
        body: request.body,
        key: request.key,
      });
      setUnknownStarts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setDrafts((current) => ({ ...current, [id]: '' }));
      if (selectedRef.current === id) {
        setDetail((current) =>
          current?.id === id
            ? {
                ...current,
                activeJob: isRunning(result.job) ? result.job : null,
              }
            : current,
        );
        await loadDetail(id);
      }
      await refreshConversations();
    } catch (caught) {
      if (caught instanceof ChatApiError && caught.status < 500) {
        setUnknownStarts((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        if (caught.conversation && selectedRef.current === id)
          setDetail((current) =>
            current
              ? { ...current, ...(caught.conversation as ConversationSummary) }
              : current,
          );
      }
      setError(
        caught instanceof ChatApiError
          ? caught.message
          : '시작 응답을 확인하지 못했습니다. 같은 요청 확인 버튼으로 중복 없이 확인하세요.',
      );
    } finally {
      startsRef.current.delete(id);
      setBusy(false);
    }
  }
  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !selectedId ||
      !selectedModel ||
      busy ||
      uploading ||
      currentPendingAttachments.some((item) => item.status !== 'ready')
    )
      return;
    const content = (drafts[selectedId] ?? '').trim();
    if (!content && !currentPendingAttachments.length) return;
    if (
      currentPendingAttachments.some((item) => item.fileKind === 'image') &&
      !models.find((item) => item.id === selectedModel)?.supportsImageInput
    ) {
      setError('이미지 입력을 지원하는 모델을 선택하세요.');
      return;
    }
    followLatestRef.current = true;
    await startJob(
      {
        path: `/api/conversations/${selectedId}/jobs`,
        key: crypto.randomUUID(),
        body: {
          content,
          attachmentIds: currentPendingAttachments.map((item) => item.id),
          parameters: detail.generationParameters,
          providerModelId: selectedModel,
          settingsRevision: detail.settingsRevision,
        },
      },
      selectedId,
    );
  }
  async function regenerateMessage(message: ChatMessage) {
    if (
      !selectedId ||
      !selectedModel ||
      busy ||
      !window.confirm(
        '새 답변을 생성하면 호출 횟수와 사용량이 추가될 수 있습니다. 계속할까요?',
      )
    )
      return;
    await startJob(
      {
        path: `/api/conversations/${selectedId}/messages/${message.id}/regeneration-jobs`,
        key: crypto.randomUUID(),
        body: {
          providerModelId: selectedModel,
          parameters: detail.generationParameters,
          settingsRevision: detail.settingsRevision,
        },
      },
      selectedId,
    );
  }
  async function stopResponse() {
    if (!selectedId || !detail?.activeJob) return;
    try {
      await chatApi(
        `/api/conversations/${selectedId}/jobs/${detail.activeJob.id}/cancel`,
        { method: 'POST' },
      );
      setNotice('답변 중지를 요청했습니다.');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : '중지 요청을 확인하지 못했습니다.',
      );
      await loadDetail(selectedId).catch(() => undefined);
    }
  }

  if (loading) {
    return (
      <section className="workspace-empty">대화 공간을 준비하는 중…</section>
    );
  }

  return (
    <section
      className={`chat-workspace${conversationListOpen ? '' : ' sidebar-collapsed'}${settingsOpen ? ' settings-open' : ''}`}
      aria-label="AI 대화 공간"
    >
      <aside className="chat-sidebar" hidden={!conversationListOpen}>
        <button
          className="new-chat-button"
          type="button"
          onClick={() => void createConversation()}
          disabled={mutating}
        >
          <ChatIcon name="plus" /> 새 대화
        </button>
        <button
          type="button"
          className="mobile-list-close"
          onClick={() => setConversationListOpen(false)}
        >
          대화로 돌아가기
        </button>
        <input
          aria-label="대화 제목 검색"
          placeholder="제목 검색"
          maxLength={200}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {listLoading && <p role="status">대화 목록을 불러오는 중…</p>}
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
                  aria-describedby={`conversation-meta-${conversation.id}`}
                  onClick={() => selectConversation(conversation.id)}
                >
                  <strong title={conversation.title}>
                    {conversation.title}
                  </strong>
                </button>
                <small
                  className="conversation-meta"
                  id={`conversation-meta-${conversation.id}`}
                >
                  {conversation.isPinned ? '고정 · ' : ''}
                  {conversation.activeJob
                    ? '생성 중'
                    : `${conversation.messageCount}개 메시지`}
                  {!conversation.activeJob &&
                    jobStates[conversation.id] &&
                    ` · ${{ completed: '완료', failed: '실패', cancelled: '중지', pending: '대기', streaming: '생성 중', unknown: '상태 확인 필요' }[jobStates[conversation.id]!] ?? ''}`}
                </small>
                <button
                  type="button"
                  title="대화 고정"
                  aria-label={`${conversation.title} 고정`}
                  aria-pressed={conversation.isPinned}
                  onClick={() =>
                    void patchConversation(conversation.id, {
                      isPinned: !conversation.isPinned,
                    })
                  }
                >
                  <ChatIcon name="pin" />
                </button>
                <button
                  className="conversation-list-delete"
                  type="button"
                  aria-label={`${conversation.title} 대화 삭제`}
                  title="대화 삭제"
                  onClick={() => void deleteConversation(conversation.id)}
                  disabled={busy}
                >
                  <ChatIcon name="trash" />
                </button>
              </div>
            ))
          )}
        </nav>
        {nextCursor && (
          <button
            type="button"
            disabled={listLoading}
            onClick={() => void refreshConversations(nextCursor)}
          >
            대화 더 보기
          </button>
        )}
        {isGuest && (
          <p className="chat-isolation-note">
            이 대화는 현재 게스트 세션에만 보입니다.
          </p>
        )}
        <ThemeToggle inline />
      </aside>

      <div className="chat-main">
        {(error || notice) && (
          <div
            className={`banner chat-toast ${error ? 'error-banner' : 'success-banner'}`}
            role={error ? 'alert' : 'status'}
            aria-live={error ? 'assertive' : 'polite'}
          >
            {error || notice}
            {!error && (
              <button
                type="button"
                aria-label="알림 닫기"
                onClick={() => setNotice('')}
              >
                <ChatIcon name="close" />
              </button>
            )}
            {error && (
              <div>
                <button
                  type="button"
                  onClick={() => void load(selectedId ?? undefined)}
                >
                  상태 새로고침
                </button>
                <a href="/">다시 로그인</a>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setNotice('');
                  }}
                >
                  닫기
                </button>
              </div>
            )}
          </div>
        )}
        <div className="chat-toolbar">
          <button
            className="panel-toggle conversation-panel-toggle"
            type="button"
            aria-expanded={conversationListOpen}
            onClick={() => setConversationListOpen((current) => !current)}
          >
            <ChatIcon name="menu" />
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
            <ChatIcon name="settings" /> 설정
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
              aria-label="대화 메시지"
              ref={messageListRef}
              onScroll={(event) => {
                followLatestRef.current = isNearScrollEnd(event.currentTarget);
              }}
            >
              {messagePage.hasMore && (
                <div className="message-page-control">
                  <button
                    className="panel-toggle"
                    type="button"
                    disabled={busy || loadingOlderMessages}
                    onClick={() => void loadOlderMessages()}
                  >
                    {loadingOlderMessages
                      ? '이전 메시지 불러오는 중…'
                      : '이전 메시지 불러오기'}
                  </button>
                </div>
              )}
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
                    <SafeMarkdown
                      text={
                        message.content ||
                        (message.status === 'pending'
                          ? '생각하는 중…'
                          : message.attachments.length
                            ? '첨부파일을 전송했습니다.'
                            : '')
                      }
                    />
                    {message.content && (
                      <button
                        type="button"
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(message.content)
                            .then(
                              () => setNotice('답변을 복사했습니다.'),
                              () =>
                                setError(
                                  '복사할 수 없습니다. 텍스트를 선택해 복사하세요.',
                                ),
                            )
                        }
                      >
                        복사
                      </button>
                    )}
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
                              {attachment.ocrPageCount > 0
                                ? ` · OCR ${attachment.ocrPageCount}페이지`
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
                          : streamError(message.errorCode ?? '')}
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
                              <ChatIcon name="previous" />
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
                              <ChatIcon name="next" />
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
                                <ChatIcon name="retry" />
                              </button>
                            )}
                        </div>
                      )}
                  </article>
                ))
              )}
            </div>

            <div className="job-status" role="status">
              {detail.activeJob
                ? connection === 'live'
                  ? '생성 중 · 대화를 이동해도 계속됩니다.'
                  : '재연결 중 · 저장된 답변을 복원하고 있습니다.'
                : detail.titleStatus === 'pending'
                  ? '대화 제목을 만드는 중…'
                  : ''}
            </div>
            {selectedId && unknownStarts[selectedId] && (
              <div className="unknown-start">
                <p>
                  시작 응답 확인이 필요합니다. 같은 요청을 확인하면 중복
                  생성하지 않습니다.
                </p>
                <button
                  type="button"
                  disabled={mutating}
                  onClick={() =>
                    void startJob(unknownStarts[selectedId]!, selectedId)
                  }
                >
                  같은 요청 확인
                </button>
              </div>
            )}
            <form className="composer" onSubmit={sendMessage}>
              <input
                ref={fileInputRef}
                id="chat-file-input"
                className="visually-hidden"
                type="file"
                tabIndex={-1}
                aria-label="첨부할 파일"
                accept={attachmentAccept}
                multiple
                disabled={
                  busy || uploading || currentPendingAttachments.length >= 10
                }
                onChange={(event) => void uploadAttachments(event.target.files)}
              />
              <textarea
                ref={composerRef}
                name="message"
                aria-label="메시지"
                value={draft}
                onChange={(event) => {
                  if (selectedId)
                    setDrafts((current) => ({
                      ...current,
                      [selectedId]: event.target.value,
                    }));
                }}
                rows={2}
                maxLength={200000}
                placeholder={
                  models.length === 0
                    ? '관리자가 모델 권한을 부여해야 합니다.'
                    : '메시지를 입력하세요'
                }
                disabled={busy || uploading || models.length === 0}
                onKeyDown={(event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
                  if (
                    event.key !== 'Enter' ||
                    event.shiftKey ||
                    event.nativeEvent.isComposing ||
                    event.keyCode === 229
                  ) {
                    return;
                  }
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }}
              />
              {currentPendingAttachments.length > 0 && (
                <ul className="pending-attachments">
                  {currentPendingAttachments.map((attachment) => (
                    <li key={attachment.id}>
                      <span>
                        <strong>{attachment.originalName}</strong>
                        <small>
                          {fileSizeLabel(attachment.byteSize)} ·{' '}
                          {
                            {
                              ready: '준비',
                              processing: '추출 / OCR 처리 중',
                              failed: '처리 실패',
                              expired: '만료',
                            }[attachment.status]
                          }
                        </small>
                        {attachment.status === 'failed' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void retryAttachment(attachment)}
                          >
                            재처리
                          </button>
                        )}
                        {attachment.pageCount !== null && (
                          <small>{attachment.pageCount}페이지</small>
                        )}
                        {attachment.ocrPageCount > 0 && (
                          <small>OCR {attachment.ocrPageCount}페이지</small>
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
                        onClick={() => void removePendingAttachment(attachment)}
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="composer-actions">
                <button
                  className="attachment-add-button"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={
                    busy || uploading || currentPendingAttachments.length >= 10
                  }
                >
                  {uploading
                    ? '파일 처리 중…'
                    : `파일 추가 ${currentPendingAttachments.length}/10`}
                </button>
                <ModelPicker
                  models={models}
                  selected={selectedModel}
                  disabled={busy}
                  onSelect={(id) => void selectModel(id)}
                  onFavorite={(model) => void favoriteModel(model)}
                />
                {detail.activeJob ? (
                  <button
                    type="button"
                    className="stop-button composer-send"
                    aria-label="답변 중지"
                    title="답변 중지"
                    onClick={stopResponse}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect
                        x="6"
                        y="6"
                        width="12"
                        height="12"
                        rx="2"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="composer-send"
                    aria-label="보내기"
                    title="보내기"
                    disabled={
                      busy ||
                      !selectedModel ||
                      (!draft.trim() &&
                        currentPendingAttachments.length === 0) ||
                      uploading ||
                      currentPendingAttachments.some(
                        (item) => item.status !== 'ready',
                      )
                    }
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 19V5m-6 6 6-6 6 6" />
                    </svg>
                  </button>
                )}
              </div>
            </form>
          </>
        )}
      </div>

      {settingsOpen && detail && (
        <ChatDialog sheet label="대화 설정" onClose={() => closeSettings()}>
          <section
            className="chat-settings"

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
              >
                <ChatIcon name="close" />
              </button>
            </header>
            <form
              ref={settingsForm}
              key={detail.id}
              onSubmit={saveSettings}
              onChange={() => setSettingsDirty(true)}
            >
              {detail.activeJob && (
                <p role="status">생성 중에는 설정을 변경할 수 없습니다.</p>
              )}
              {settingsConflict && (
                <div className="settings-conflict" role="alert">
                  <p>
                    서버 설정이 변경되었습니다. 아래 초안과 비교한 뒤
                    적용하세요.
                  </p>
                  <details open>
                    <summary>현재 서버 값</summary>
                    <pre>
                      {JSON.stringify(
                        {
                          parameters: settingsConflict.generationParameters,
                          systemPrompt: settingsConflict.systemPrompt,
                          contextTokenLimit: settingsConflict.contextTokenLimit,
                          historyMessageLimit:
                            settingsConflict.historyMessageLimit,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </div>
              )}
              <fieldset disabled={busy} className="settings-modal-body">
                <label>
                  대화 제목
                  <input
                    name="title"
                    onChange={(event) => {
                      if (settingsSnapshotRef.current)
                        settingsSnapshotRef.current.titleChanged =
                          event.currentTarget.value.trim() !==
                          settingsSnapshotRef.current.title.trim();
                    }}
                    defaultValue={detail.title}
                    maxLength={200}
                    autoFocus
                    required
                  />
                </label>
                <label className="settings-checkbox-row">
                  <input
                    name="webSearchEnabled"
                    type="checkbox"
                    defaultChecked={detail.webSearchEnabled}
                    disabled={
                      busy ||
                      !models.find((model) => model.id === selectedModel)
                        ?.supportsWebSearch
                    }
                  />
                  <span>
                    웹 검색 사용
                    <small>
                      관리자가 웹 검색을 허용한 모델에서만 사용할 수 있습니다.
                    </small>
                  </span>
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
                  응답 타임아웃
                  <input
                    name="responseTimeoutSeconds"
                    type="number"
                    min="1"
                    max="1800"
                    step="1"
                    defaultValue={detail.responseTimeoutSeconds}
                    required
                  />
                  <small>
                    첫 응답 또는 다음 스트리밍 데이터를 기다릴 최대 시간입니다.
                    기본값은 120초입니다.
                  </small>
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
                    현재 로그인 세션에만 보관하며 로그아웃하면 즉시 삭제됩니다.
                    API 키와 이미지 원문은 기록하지 않습니다.
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
              </fieldset>
              <footer className="settings-modal-actions">
                <button
                  type="button"
                  className="trace-button"
                  onClick={() => void openTraces()}
                  disabled={busy}
                >
                  전송 기록
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
                  type="button"
                  className="quiet-button"
                  onClick={() => closeSettings()}
                  disabled={busy}
                >
                  취소
                </button>
                <button
                  className="settings-save-button"
                  type="submit"
                  disabled={busy}
                >
                  설정 저장
                </button>
              </footer>
            </form>
          </section>
        </ChatDialog>
      )}
      {pendingAction && (
        <ChatDialog label="미적용 설정" onClose={() => setPendingAction(null)}>
          <h2>적용하지 않은 설정이 있습니다</h2>
          <p>변경한 설정을 어떻게 할까요?</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => settingsForm.current?.requestSubmit()}
          >
            적용하고 이동
          </button>
          <button
            type="button"
            onClick={() => {
              const action = pendingAction;
              setPendingAction(null);
              action();
            }}
          >
            버리고 이동
          </button>
          <button type="button" onClick={() => setPendingAction(null)}>
            계속 편집
          </button>
        </ChatDialog>
      )}
      {traceOpen && (
        <ChatDialog label="전송 기록" onClose={() => setTraceOpen(false)}>
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
                <ChatIcon name="close" />
              </button>
            </header>
            <div className="trace-privacy-note">
              현재 로그인 세션에서 이 대화의 최근{' '}
              {detail?.requestTraceLimit ?? 0}
              개만 메모리에 보관합니다. 로그아웃 시 삭제되며 인증 정보와 이미지
              원문은 표시하지 않습니다.
            </div>
            <div className="request-trace-layout">
              <aside className="request-trace-list">
                {traceLoading ? (
                  <p className="muted">불러오는 중…</p>
                ) : traces.length === 0 ? (
                  <p className="muted">
                    보관된 전송 기록이 없습니다. 기록 수를 1~3으로 저장한 뒤 새
                    메시지를 보내세요.
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
        </ChatDialog>
      )}
    </section>
  );
}
