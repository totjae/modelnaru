import { csrfToken } from './client-auth';

const messages: Record<string, string> = {
  CHAT_PRINCIPAL_BUSY:
    '다른 대화에서 생성 중입니다. 해당 대화를 열어 확인하거나 완료 후 보내세요.',
  CHAT_CONVERSATION_BUSY:
    '이 대화에서 생성 중입니다. 완료하거나 중지한 뒤 변경하세요.',
  CHAT_SERVER_BUSY: '서버가 처리 중입니다. 잠시 후 다시 시도하세요.',
  CHAT_SETTINGS_CONFLICT:
    '다른 화면에서 설정이 바뀌었습니다. 현재 서버 값과 초안을 확인한 뒤 다시 적용하세요.',
  CHAT_IDEMPOTENCY_CONFLICT:
    '시작 요청이 충돌했습니다. 대화를 새로고침해 작업 상태를 확인하세요.',
  ACCESS_DAILY_LIMIT_REACHED:
    '오늘 사용할 수 있는 호출 횟수를 모두 사용했습니다.',
  ACCESS_MODEL_FORBIDDEN:
    '선택한 모델 권한이 없습니다. 관리자에게 권한을 요청하세요.',
  FILE_PROCESSING_BUSY: '파일을 처리 중입니다. 준비가 끝난 뒤 다시 시도하세요.',
  FILE_PDF_OCR_UNAVAILABLE:
    '서버에서 OCR을 사용할 수 없습니다. 텍스트 PDF를 사용하거나 관리자에게 문의하세요.',
  FILE_PDF_PAGE_LIMIT:
    'PDF 페이지 수가 서버 제한을 넘었습니다. 파일을 나누어 올리세요.',
  FILE_EXPIRED: '첨부가 만료되었습니다. 원본을 다시 올리세요.',
};

export class ChatApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly conversation?: unknown,
  ) {
    super(
      messages[code] ??
        (status === 401
          ? '세션이 만료되었습니다. 다시 로그인하세요.'
          : status === 403
            ? '이 작업에 대한 권한이 없습니다.'
            : status === 404
              ? '대상에 접근할 수 없습니다. 목록을 새로고침하세요.'
              : '요청을 처리하지 못했습니다. 상태를 확인한 뒤 다시 시도하세요.'),
    );
  }
}

export async function checkedJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; conversation?: unknown };
    };
    throw new ChatApiError(
      response.status,
      body.error?.code ?? 'REQUEST_FAILED',
      body.error?.conversation,
    );
  }
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}

export async function chatApi<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    key?: string;
  } = {},
): Promise<T> {
  return checkedJson<T>(
    await fetch(path, {
      method: options.method ?? 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: options.signal ?? null,
      headers: {
        ...(options.method
          ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() }
          : {}),
        ...(options.key ? { 'Idempotency-Key': options.key } : {}),
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    }),
  );
}
