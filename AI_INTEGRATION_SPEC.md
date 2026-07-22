# AI 연동 및 모델 설정 명세

## 1. 목적과 참고 범위

이 문서는 `provider-manager-v1.10.0.js`의 구조를 참고하여 본 서비스의 AI 공급자 연동, 모델 동기화, 요청 형식 변환, 스트리밍 응답 처리 및 사용자별 설정 방식을 정의한다. 제공자 등록 UI와 template 규격은 [PROVIDER_REGISTRATION_SPEC.md](./PROVIDER_REGISTRATION_SPEC.md)를 따른다.

참고 파일은 RisuAI 플러그인용으로 압축된 배포 코드이며 내장 제공자 엔진과 JSON 기반 provider registry를 함께 제공한다. 본 서비스는 이 구조를 서버용으로 재구성하여 관리자가 서비스 제공자를 선택하고 API 키만 입력해 기본 사용이 가능하게 한다. LLM Gateway는 기본 제공자 중 하나이며 이를 통해 GPT, Gemini, Claude를 사용할 수 있다.

- 공급자와 모델 정보를 분리한다.
- 모델의 기능과 지원 엔드포인트를 메타데이터로 관리한다.
- 내부 공통 요청을 공급자별 요청 형식으로 변환한다.
- 공급자별 스트리밍 이벤트를 하나의 공통 응답 형식으로 정규화한다.
- 모델이 지원하는 파라미터만 화면에 표시하고 서버에서 다시 검증한다.
- 토큰 사용량, 중단 사유 및 오류를 공통 형식으로 기록한다.

## 2. 참고 파일 분석 결과

### 2.1 공급자 프로필

참고 파일은 공급자를 다음 두 종류로 구분한다.

- 내장 엔진: OpenAI, Anthropic, Google AI Studio, Gemini Express, NovelAI, Vertex AI, AWS Bedrock, GitHub Copilot
- registry template: LLM Gateway, OpenRouter, DeepSeek 등 URL·인증·지원 형식으로 정의할 수 있는 제공자

본 서비스에서는 이를 `provider template + connection + credential + model + protocol engine` 구조로 일반화한다. GitHub Copilot은 선택형 고급 제공자로만 둔다.

### 2.2 인증과 모델 조회

참고 파일은 API key, Vertex service account·access token, Bedrock API key·IAM, Copilot OAuth 자격증명을 구분한다. API 키 제공자는 provider template의 `modelListing`을 호출하고, 내장 제공자는 전용 모델 조회 함수를 사용한다.

첫 버전의 기본 흐름은 다음과 같다.

1. 관리자가 제공자를 선택하고 API 키를 입력한다.
2. 템플릿에 정의된 인증 헤더로 연결을 검증한다.
3. 모델 목록을 자동 조회한다.
4. 관리자가 사용할 모델을 선택한다.
5. 템플릿 기본 형식과 모델 기능으로 endpoint와 파라미터를 구성한다.
6. 테스트 요청에 성공한 모델만 활성화한다.

모델 응답에서는 다음 정보를 활용한다.

- 모델 ID, 이름, 버전, 공급사
- `/chat/completions`, `/responses`, `/v1/messages`, Gemini GenerateContent·Interactions 지원 여부
- 최대 입력·출력 토큰
- vision, reasoning, tool calls, structured output 지원 여부
- 허용 reasoning effort 값
- 활성화 정책 상태, preview 상태
- 과금 배수 및 premium 여부

### 2.3 요청 형식 선택

참고 파일은 모델과 설정을 기준으로 요청 형식을 다음과 같이 결정한다.

1. Anthropic 계열 모델이고 `/v1/messages`를 지원하며 Anthropic 형식 사용이 설정되어 있으면 Anthropic Messages 형식을 사용한다.
2. 그 외 모델이 `/responses`를 지원하고 Responses 형식 사용이 설정되어 있으면 OpenAI Responses 형식을 사용한다.
3. 위 조건에 해당하지 않으면 `/chat/completions` 형식을 사용한다.

본 서비스도 같은 방식의 명시적 라우팅을 사용하되 모델 이름을 정규식으로 추측하지 않는다. 관리자가 등록하거나 모델 조회 API에서 얻은 `vendor`, `supportedEndpoints`, `capabilities`를 기준으로 판단한다.

### 2.4 요청과 응답 변환

참고 파일은 세 형식 각각에 대해 독립적인 builder, parser, stream parser를 둔다.

- Anthropic Messages: `system`과 `messages`를 분리하고 이미지, thinking, cache control을 Anthropic content block으로 변환한다.
- OpenAI Chat Completions: `messages`, `image_url`, `max_tokens` 또는 `max_completion_tokens`와 모델 파라미터를 구성한다.
- OpenAI Responses: 대화 내용을 `input` item으로 변환하고 `instructions`, `reasoning`, `text.verbosity`, `max_output_tokens`를 구성한다.
- 스트리밍: SSE의 `data:` 행과 `[DONE]`을 읽고 text, thinking, usage, tool call 및 완료 사유를 누적한다.
- 비스트리밍: JSON 응답을 동일한 내부 결과 형식으로 변환한다.

본 서비스에는 이미지 생성과 도구 실행이 필요하지 않다. 이미지 입력 변환은 구현하지만 이미지 생성 요청과 tool 실행기는 구현하지 않는다. 향후 확장성을 위해 tool call 응답은 오류로 깨뜨리지 않고 메타데이터로 보존할 수 있다.

### 2.5 목표 기능 대응 원칙

`provider-manager-v1.10.0.js`의 기능은 다음 세 종류로 구분한다.

- **동일 구현:** 서버형 서비스에서도 같은 동작을 만들 수 있는 기능
- **조건부 구현:** 선택한 제공자와 모델이 지원할 때만 활성화되는 기능
- **대체 또는 비적용:** RisuAI 플러그인 런타임에만 필요한 기능

“동일하게 가져온다”는 것은 제공자 등록과 모델 설정 결과의 동등성을 뜻한다. 플러그인 저장소나 RisuAI IPC를 그대로 복제한다는 뜻은 아니다.

### 2.6 참고 파일 전체 설정 대응표

| 참고 파일 설정                            | 본 서비스 적용                                      | 권한                             |
| ----------------------------------------- | --------------------------------------------------- | -------------------------------- |
| API 키와 별칭                             | 동일 구현                                           | 관리자                           |
| 복수 키·순차 회전                         | 조건부 구현, 동일 제공자 복수 키 등록 시            | 관리자                           |
| HTTP 429 시 키 회전                       | 조건부 구현                                         | 관리자                           |
| 스트리밍                                  | 동일 구현                                           | 사용자 또는 관리자 기본값        |
| thinking 표시                             | 조건부 구현                                         | 사용자                           |
| 모든 응답을 받은 뒤 한 번에 표시          | 동일 구현                                           | 사용자                           |
| 스트리밍 수신 글자·속도 표시              | 동일 구현                                           | 사용자                           |
| 플로팅 상태 창                            | 채팅 화면의 선택형 상태 패널로 동일 구현            | 사용자                           |
| Anthropic/OpenAI/Responses 형식 선택      | 조건부 구현                                         | 관리자 기본값과 사용자 고급 설정 |
| Claude adaptive thinking                  | 조건부 구현                                         | 사용자                           |
| Claude thinking 숨김                      | 조건부 구현                                         | 사용자                           |
| thinking budget                           | 조건부 구현                                         | 사용자                           |
| OpenAI instructions 사용                  | 조건부 구현                                         | 사용자                           |
| detailed reasoning summary                | 조건부 구현                                         | 사용자                           |
| OpenAI reasoning effort                   | 조건부 구현                                         | 사용자                           |
| Gemini thinking 단계                      | reasoning effort에 대응하여 조건부 구현             | 사용자                           |
| verbosity                                 | 조건부 구현                                         | 사용자                           |
| temperature, top_p                        | 조건부 구현                                         | 사용자                           |
| frequency/presence penalty                | 조건부 구현                                         | 사용자                           |
| system·assistant·all 캐시 범위            | 제공자 캐시 지원 시 조건부 구현                     | 관리자 또는 사용자 고급 설정     |
| thinking signature·encrypted content 복원 | 응답이 해당 값을 제공할 때 조건부 구현              | 서버 내부 기능                   |
| thinking 저장 위치·복원 개수·최대 기록 수 | 조건부 구현                                         | 관리자                           |
| 모델별 effort 제한 보정                   | 동일 구현하되 우회 옵션은 관리자만 사용             | 관리자                           |
| API 오류에서 부분 응답 복구               | `partial_failed` 상태로 안전하게 대체 구현          | 관리자 정책                      |
| AbortSignal 무시                          | 비적용, 사용자 취소는 항상 upstream에 전달          | 해당 없음                        |
| OpenCode·VSCode·CLI 시뮬레이션            | Copilot 제공자를 활성화할 때만 내부 사용            | 서버 내부 기능                   |
| Copilot internal 요청                     | Copilot 제공자 활성화 시에만 조건부 구현            | 서버 내부 기능                   |
| 세션 ID 자동 재생성                       | 제공자가 요구하는 경우 내부 구현                    | 서버 내부 기능                   |
| Assignment Context                        | 비적용                                              | 해당 없음                        |
| custom·RisuAI·Yumi 프록시                 | 공개 프록시는 제외하고 검증된 서버 프록시로 대체    | 관리자                           |
| 자동 제목 요청 모사                       | 모사는 비적용, 일반 제목 생성은 향후 선택 기능      | 해당 없음                        |
| Machine ID·Device ID                      | 비적용                                              | 해당 없음                        |
| 요청 로그 저장·최대 개수                  | 동일 구현하되 민감정보 마스킹                       | 관리자                           |
| 모델 목록 조회·캐시·숨김                  | 동일 구현                                           | 관리자                           |
| 모델 정책·preview·과금 배수 표시          | 제공자가 제공할 때 조건부 구현                      | 관리자                           |
| 사용량·잔액 표시                          | provider template의 usage API가 있을 때 조건부 구현 | 관리자                           |
| IPC                                       | 비적용, 서버 내부 서비스 인터페이스로 대체          | 해당 없음                        |

## 3. 목표 아키텍처

```text
사용자 웹 화면
    -> 채팅 API 및 권한 검사
    -> 공통 ChatRequest 생성
    -> 모델 라우터
    -> Provider Connection
    -> Protocol Engine
       ├─ OpenAI Chat Completions
       ├─ OpenAI Responses
       ├─ Anthropic Messages
       └─ Gemini GenerateContent
    -> 선택한 외부 AI 서비스
    -> 공급자별 Parser / Stream Parser
    -> 공통 ChatEvent
    -> 브라우저 SSE 스트림
```

프론트엔드는 공급자별 API 형식을 알지 못한다. 서버의 공통 채팅 API만 호출하고, 인증키 선택·요청 변환·응답 해석은 모두 서버에서 처리한다.

## 4. 공급자 어댑터 계약

각 공급자 어댑터는 다음 인터페이스를 구현한다.

```ts
interface ProviderAdapter {
  validateCredential(credentialId: string): Promise<CredentialStatus>;
  discoverModels(credentialId: string): Promise<DiscoveredModel[]>;
  buildRequest(input: NormalizedChatRequest): Promise<UpstreamRequest>;
  parseResponse(response: unknown): NormalizedChatResult;
  parseStream(stream: ReadableStream<Uint8Array>): AsyncIterable<ChatEvent>;
  normalizeError(status: number, body: unknown): ProviderError;
}
```

어댑터는 상태를 가능한 한 갖지 않도록 하고 모델 캐시와 요청 상태는 별도 서버 서비스에 보관한다. 웹 서버를 여러 대 실행해도 일관되게 동작해야 하므로 장기 상태를 프로세스 메모리에만 의존하지 않는다.

## 5. 공통 데이터 형식

### 5.1 내부 채팅 요청

```ts
type NormalizedChatRequest = {
  requestId: string;
  userId: string;
  conversationId: string;
  providerId: string;
  credentialId: string;
  modelId: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    text: string;
    images?: Array<{
      mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
      data: Uint8Array;
    }>;
  }>;
  parameters: {
    stream: boolean;
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    reasoningEffort?:
      'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
    thinkingBudget?: number;
    verbosity?: 'low' | 'medium' | 'high';
  };
  abortSignal?: AbortSignal;
};
```

### 5.2 브라우저 스트림 이벤트

서버와 브라우저 사이에는 SSE를 사용한다.

```ts
type ChatEvent =
  | { type: 'start'; messageId: string; modelId: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'text_delta'; text: string }
  | {
      type: 'usage';
      inputTokens?: number;
      outputTokens?: number;
      cachedInputTokens?: number;
      reasoningTokens?: number;
    }
  | { type: 'done'; stopReason?: string; durationMs: number }
  | { type: 'error'; code: string; message: string; retryable: boolean };
```

thinking 원문은 모델과 공급자가 제공하는 경우에만 전달한다. 관리자가 thinking 표시를 금지한 모델에서는 저장하거나 브라우저에 전송하지 않는다.

## 6. 데이터베이스 명세

이 절의 `ai_*` 이름은 AI 계층에서 사용하는 논리 개념명이다. 실제 물리 테이블은 [PROVIDER_REGISTRATION_SPEC.md](./PROVIDER_REGISTRATION_SPEC.md)의 `provider_templates`, `provider_connections`, `provider_credentials`, `provider_models`를 기준으로 하며 같은 데이터를 담는 `ai_*` 테이블을 중복 생성하지 않는다. `model_parameter_policies`와 `provider_model_cache`는 상세 DB 설계에서 해당 물리 테이블을 참조한다.

### 6.1 `ai_providers`

- `id`
- `name`
- `template_id`: `llm-gateway`, `openai`, `anthropic`, `google` 등
- `base_url`
- `auth_type`: `api_key`, `bearer_token`, `vertex`, `bedrock`, `copilot_oauth`
- `default_request_format`: `auto`, `openai_chat`, `openai_responses`, `anthropic_messages`, `gemini_generate_content`, `gemini_interactions`
- `enabled`
- `connect_timeout_ms`
- `response_timeout_ms`
- `created_at`, `updated_at`

### 6.2 `ai_credentials`

- `id`, `provider_id`
- `alias`
- `encrypted_secret`
- `secret_key_version`
- `status`: `active`, `invalid`, `disabled`
- `last_validated_at`
- `last_error_code`
- `rotation_order`

인증값은 애플리케이션 암호화 키로 암호화한다. 복호화된 값은 요청 직전에만 메모리에 두고 로그, 오류 응답 및 브라우저에 포함하지 않는다.

### 6.3 `ai_models`

- `id`, `provider_id`
- `upstream_model_id`
- `display_name`, `vendor`, `version`
- `supported_endpoints` JSON
- `capabilities` JSON
- `max_input_tokens`, `max_output_tokens`
- `allowed_reasoning_efforts` JSON
- `billing_multiplier`, `is_premium`, `is_preview`
- `upstream_policy_state`
- `enabled`
- `discovered_at`, `updated_at`

`capabilities`에는 최소한 `text`, `vision`, `reasoning`, `streaming`, `toolCalls`, `structuredOutputs`를 저장한다.

### 6.4 `model_parameter_policies`

- `model_id`
- `parameter_name`
- `supported`
- `user_editable`
- `default_value` JSON
- `minimum_value`, `maximum_value`
- `allowed_values` JSON

### 6.5 `provider_model_cache`

- `provider_id`
- `payload` JSON
- `fetched_at`
- `expires_at`
- `last_sync_status`

모델 동기화 실패 시 마지막 정상 캐시는 보존하되 새 사용자 권한 부여에는 관리자 확인을 요구한다.

## 7. 관리자 설정 화면

### 7.1 공급자 등록

관리자는 다음 순서로 공급자를 등록한다.

1. 공급자 유형을 선택한다.
2. 표시 이름과 API 기본 URL을 입력한다.
3. 인증 방식과 인증값을 등록한다.
4. 연결 테스트를 수행한다.
5. 모델 목록을 동기화하거나 모델을 수동 등록한다.
6. 모델별 기능과 제한을 확인·수정한다.
7. 사용자별 모델 권한을 부여한다.

API 기본 URL은 `https`만 허용하고 허용 도메인 또는 관리자의 명시적 승인 정책을 적용한다. 리디렉션 후 목적지에도 SSRF 검사를 반복한다.

### 7.2 제공자 간편 등록

관리자 화면은 제공자 카탈로그, 연결 이름과 API 키를 우선 표시한다. 등록 시 연결 테스트와 모델 조회를 실행하고 모델별 기본 endpoint와 기능을 자동 구성한다. API 키는 등록 후 마스킹하며 다시 전체 값을 보여주지 않는다.

고급 설정에서는 기본 URL, 모델 조회 경로, 요청 형식, 커스텀 필드, 캐시, 재시도와 사용량 API를 제공자 template 범위에서 조정한다. Vertex AI, Bedrock과 Copilot은 전용 자격증명 폼을 사용한다.

### 7.3 모델 동기화

- 관리자가 수동으로 “모델 새로고침”을 실행할 수 있다.
- 선택적으로 정기 동기화 작업을 실행한다.
- 새 모델은 기본 비활성화하거나 관리자 승인 후 공개한다.
- 사라진 모델은 즉시 삭제하지 않고 `unavailable` 상태로 변경한다.
- 모델 메타데이터 변경 내역을 감사 로그로 남긴다.
- 동일 표시 이름의 모델이 여러 개면 vendor와 version을 함께 표시한다.

원격 provider registry를 실행 중에 그대로 신뢰하지 않는다. 검수된 template snapshot과 각 제공자의 모델 조회 결과를 사용하고, template 변경은 관리자 승인 후 반영한다.

### 7.4 인증키 회전

공급자에 여러 인증키가 있을 때 다음 정책 중 하나를 선택한다.

- `disabled`: 지정한 기본 키만 사용
- `round_robin`: 요청마다 다음 활성 키 사용
- `on_rate_limit`: HTTP 429일 때만 다음 활성 키로 한 번씩 재시도

회전은 동일 공급자 내에서만 수행한다. 인증 실패인 401·403에서는 자동으로 다른 키를 무한 시도하지 않고 해당 키 상태를 점검 대상으로 표시한다. 키마다 사용량 제한이 다를 수 있으므로 어떤 키를 사용했는지 내부 ID만 기록한다.

## 8. 사용자 모델 설정

### 8.1 공통 설정

| 설정              | 기본 정책                                              |
| ----------------- | ------------------------------------------------------ |
| 스트리밍          | 켜짐                                                   |
| 최대 출력 토큰    | 모델 최대값 이하에서 관리자 설정값 사용                |
| temperature       | 모델 지원 시 0~2, 공급자 제한이 더 작으면 그 제한 적용 |
| top_p             | 모델 지원 시 0~1                                       |
| frequency penalty | 모델 지원 범위 적용                                    |
| presence penalty  | 모델 지원 범위 적용                                    |

### 8.2 추론 모델 설정

- `reasoningEffort`: 모델 메타데이터의 허용값만 선택한다.
- `thinkingBudget`: Anthropic 형식과 지원 모델에서만 표시한다.
- `verbosity`: 지원되는 OpenAI 계열 모델에서만 표시한다.
- reasoning 또는 thinking을 활성화하면 공급자 제약에 따라 temperature와 top_p를 숨기거나 제거한다.
- 관리자가 모델별 기본값, 최댓값과 사용자 변경 가능 여부를 정한다.

참고 파일은 일부 지원 여부를 모델 ID 패턴으로 보정하지만, 본 서비스는 모델 메타데이터와 관리자 정책을 우선한다. 메타데이터가 없는 경우 안전한 최소 기능만 활성화한다.

### 8.3 설정 저장 단위

설정 우선순위는 다음과 같다.

1. 서버의 절대 안전 제한
2. 공급자 제한
3. 모델 제한
4. 관리자가 정한 사용자별 제한
5. 대화방별 사용자 설정
6. 모델 기본값

사용자 설정은 대화방에 저장하여 같은 대화를 다시 열었을 때 복원한다. 모델을 변경하면 지원되지 않는 기존 파라미터는 제거하고 변경 사실을 화면에 알린다.

### 8.4 system prompt와 컨텍스트 설정

- system prompt는 사용자가 대화방별로 작성·수정한다.
- 이전 대화 범위는 완료된 user-assistant 턴 수로 지정하며 `0`은 현재 활성 분기 전체를 뜻한다.
- 컨텍스트 토큰 목표값은 기본 100,000이며 사용자가 대화방별로 변경할 수 있다.
- 적용 한도는 `min(사용자 설정값, 모델 최대 입력 토큰, 서버 안전 한도)`이다.
- 답변 재생성은 부모 메시지를 공유하는 별도 분기로 저장하고 선택된 활성 분기만 컨텍스트로 전송한다.
- 모델을 변경해도 system prompt, 활성 분기와 첨부 설정을 유지한다.

컨텍스트가 적용 한도를 넘으면 관리자가 지정한 요약 모델과 프롬프트로 가장 오래된 구간부터 요약한다. 요약은 별도 `context_summaries` 레코드로 저장하고 원본 메시지는 유지한다. 요약 결과에는 포함한 최초·최종 메시지 ID와 사용한 모델·프롬프트 버전을 기록하여 중복 요약을 방지한다.

요약 모델이 비활성화되었거나 요청에 실패하면 원본을 무단 절단하지 않고 본 요청을 중단한다. 사용자에게 컨텍스트 범위를 줄이거나 다시 시도하도록 안내한다.

## 9. 요청 처리 흐름

1. 관리자 생성 사용자 또는 유효한 격리 게스트 session과 CSRF 보호를 확인한다.
2. 대화방의 `user_id` 또는 `guest_id` 소유권을 확인한다.
3. 해당 주체가 모델을 사용할 권한이 있는지 확인한다.
4. 첨부파일 소유권, 형식, 크기와 모델의 vision 지원 여부를 확인한다.
5. 파라미터를 모델 정책과 사용자 정책에 맞춰 검증·정규화한다.
6. 선택된 메시지 분기와 사용자가 지정한 이전 턴 범위를 불러온다.
7. 예상 토큰이 적용 한도를 넘으면 지정된 모델과 프롬프트로 오래된 구간을 요약한다.
8. 사용자·모델 또는 게스트 session·모델·전체 게스트의 일일 호출 제한을 DB transaction으로 확인하고 1회를 예약한다.
9. 선택한 제공자의 활성 자격증명 또는 키 그룹을 선택한다.
10. 모델 메타데이터에 따라 요청 형식을 선택한다.
11. provider connection과 protocol engine이 외부 요청을 만든다.
12. 외부 응답을 공통 이벤트로 변환하여 브라우저에 스트리밍한다.
13. 사용자가 중단하면 서버의 upstream 요청도 `AbortController`로 취소한다.
14. 최종 텍스트, 사용량, 처리 시간, 중단 사유와 오류 코드를 저장한다.

게스트 주체와 일일 호출 집계의 상세 규칙은 [GUEST_ACCESS_SPEC.md](./GUEST_ACCESS_SPEC.md)를 따른다. 한도는 upstream 전송 직전에 원자적으로 예약하고 이미 전송한 요청이 실패·취소돼도 반환하지 않는다.

## 10. 형식별 변환 규칙

### 10.1 OpenAI Chat Completions

- 엔드포인트: `/chat/completions`
- 대화는 `messages` 배열로 변환한다.
- 이미지는 user 메시지의 `image_url` content로 변환한다.
- GPT-5·o 계열처럼 필요한 모델에는 `max_completion_tokens`, 그 외에는 `max_tokens`를 사용하되 모델 설정에서 명시적으로 선택할 수 있게 한다.
- 스트리밍 시 사용량을 받을 수 있으면 `stream_options.include_usage`를 활성화한다.

### 10.2 OpenAI Responses

- 엔드포인트: `/responses`
- 대화는 `input` item 배열로 변환한다.
- 선두 system 메시지는 공급자가 지원하면 `instructions`로 분리한다.
- 최대 출력은 `max_output_tokens`로 전달한다.
- 추론은 `reasoning.effort`, 출력 길이 성향은 `text.verbosity`로 전달한다.
- 서버 저장을 강제하지 않도록 기본적으로 `store: false`를 사용한다.

### 10.3 Anthropic Messages

- 엔드포인트: `/v1/messages`
- 선두 system 메시지를 `system`으로 분리한다.
- user와 assistant 역할이 번갈아야 하는 공급자 제약을 정규화한다.
- 이미지는 base64 source block으로 변환한다.
- `thinkingBudget > 0`이면 지원 모델에서 thinking 설정을 구성한다.
- thinking 사용 시 공급자 제약에 따라 temperature와 top_k를 제거한다.

### 10.4 Gemini GenerateContent

- 이 형식은 `provider-manager-v1.10.0.js` 호환과 기존 Gemini endpoint 지원을 위해 유지한다. Google이 최신 기능에 권장하는 Interactions API와 형식이 다르므로 template version을 바꾸면서 기존 connection을 자동 전환하지 않는다.
- 엔드포인트는 제공자 template과 API 버전에 따라 `models/{model}:generateContent` 또는 `models/{model}:streamGenerateContent`를 사용한다.
- system 메시지는 지원 API에서 `systemInstruction`으로 분리하고, 나머지 대화는 `contents`의 `user`·`model` role로 변환한다.
- 텍스트는 `parts[].text`, 이미지는 MIME type과 base64 data를 가진 `inlineData` part로 변환한다.
- `temperature`, `topP`, 최대 출력 토큰 등은 지원되는 항목만 `generationConfig`로 전달한다.
- Gemini의 safety setting과 thinking 설정은 model capability와 관리자 정책에 선언된 경우에만 전달하며 사용자 임의 필드는 허용하지 않는다.
- 스트리밍 응답의 candidate별 text part를 `text_delta`로 변환하고 finish reason, prompt feedback와 block 사유를 표준 오류·완료 상태로 정규화한다.
- `usageMetadata`가 제공되면 prompt, candidate, cached content 및 전체 token을 공통 usage 필드로 변환한다.
- candidate가 safety 정책으로 차단되거나 text가 없으면 빈 성공 응답으로 저장하지 않고 명시적인 차단 또는 오류 상태로 기록한다.

## 11. 텍스트 파일, PDF 및 이미지 연결

- 지원 텍스트 확장자는 `.txt`, `.md`, `.markdown`, `.json`, `.jsonl`, `.csv`, `.tsv`, `.log`, `.xml`, `.yaml`, `.yml` 및 요구사항에 정의된 일반 소스 코드 확장자이다.
- UTF-8·UTF-16·CP949를 감지하며 바이너리 데이터가 포함된 파일은 거부한다.
- 텍스트 파일과 PDF 본문은 서버에서 추출한 뒤 사용자 메시지에 문서명, 페이지 또는 구간 표시와 함께 삽입한다.
- 파일당 최대 10MB, 메시지당 최대 10개, PDF당 최대 100페이지를 적용한다.
- 원본 파일과 추출 데이터를 모두 저장하며 기본 30일 후 삭제한다. 관리자는 기본 보관 기간을 변경할 수 있다.
- 첨부별 `includeInFutureTurns` 값을 저장하여 후속 메시지 포함 여부를 사용자가 선택할 수 있게 한다.
- 이미지 이해는 모델의 `capabilities.vision`이 참일 때만 허용한다.
- 공급자별 이미지 표현은 어댑터가 OpenAI `image_url`, Responses `input_image`, Anthropic image block 또는 Gemini inline data part로 변환한다.
- 추출 텍스트와 이미지를 포함한 전체 예상 입력량이 모델의 최대 입력 토큰을 넘으면 요청 전에 사용자에게 알린다.
- 이미지 생성 엔드포인트와 관련 파라미터는 등록하거나 호출하지 않는다.

## 12. 스트리밍 및 취소

- upstream이 SSE를 지원하면 서버가 이벤트를 한 줄씩 증분 해석한다.
- 불완전한 UTF-8 문자와 여러 청크에 걸친 JSON을 버퍼링한다.
- `[DONE]`, 공급자별 완료 이벤트 또는 연결 종료를 완료 조건으로 처리한다.
- text와 thinking을 별도 채널로 정규화한다.
- usage가 마지막 이벤트에서만 오는 경우 완료 직전에 별도 usage 이벤트를 보낸다.
- 사용자가 중단하면 upstream 연결도 취소하고 메시지를 `cancelled` 상태로 저장한다.
- 연결 오류가 발생했을 때 받은 일부 문장은 자동으로 성공 처리하지 않는다. `partial_failed` 상태로 저장하고 사용자에게 재시도 여부를 보여준다.

## 13. 오류와 재시도 정책

| 상황                  | 처리                                                 |
| --------------------- | ---------------------------------------------------- |
| 400                   | 파라미터 또는 요청 형식 오류로 기록, 재시도 안 함    |
| 401·403               | 인증키 상태 점검 표시, 사용자에게 일반화된 오류 제공 |
| 404                   | 모델·엔드포인트 동기화 필요 표시                     |
| 408·네트워크 시간초과 | 멱등성이 보장되는 조건에서 제한 재시도               |
| 429                   | `on_rate_limit` 정책이면 다음 키로 제한 재시도       |
| 5xx                   | 짧은 지수 백오프로 제한 재시도                       |
| 사용자 취소           | 재시도하지 않고 `cancelled` 저장                     |

최대 시도 횟수와 총 시간 제한을 둔다. 오류 응답의 API 키, 토큰, 내부 헤더 및 외부 응답 전문은 사용자에게 노출하지 않는다.

## 14. 로그 및 사용량

로그 저장, 관리자 조회 화면, 보관 기간과 민감정보 마스킹의 상세 기준은 [ADMIN_LOGGING_SPEC.md](./ADMIN_LOGGING_SPEC.md)를 따른다.

다음 항목을 저장한다.

- 요청 ID, 사용자 ID, 대화방 ID
- 공급자, 모델, 인증키 내부 ID
- 요청 형식과 스트리밍 여부
- 입력·출력·캐시·추론 토큰
- 처리 시간, HTTP 상태, 완료 사유
- 재시도 횟수와 표준화된 오류 코드

기본 로그에는 system prompt, 전체 대화, 첨부파일 본문, Authorization 헤더와 원본 응답을 기록하지 않는다. 문제 분석용 원본 로그가 필요하면 관리자만 제한된 기간 동안 별도로 활성화하며 민감정보를 마스킹한다.

## 15. 구현 모듈 제안

```text
src/server/ai/
  adapters/
    provider-registry.ts
    vertex-ai.ts
    aws-bedrock.ts
    github-copilot.ts
  builders/
    openai-chat.ts
    openai-responses.ts
    anthropic-messages.ts
    gemini-generate-content.ts
  parsers/
    openai-chat.ts
    openai-responses.ts
    anthropic-messages.ts
    gemini-generate-content.ts
    sse.ts
  model-router.ts
  context-builder.ts
  summarization-service.ts
  parameter-policy.ts
  credential-service.ts
  model-cache.ts
  usage-service.ts
  types.ts
```

builder와 parser는 공급자 인증이나 데이터베이스에 직접 접근하지 않는 순수 함수 중심으로 작성한다. 형식별 fixture를 사용해 스트림 청크 분할, usage 집계 및 오류 응답을 단위 테스트한다.

## 16. 제외하거나 수정할 참고 파일 동작

다음 동작은 참고 파일에 존재하더라도 본 서비스에 그대로 적용하지 않는다.

- 외부 공개 프록시 및 제3자 업데이트 서버 의존
- 브라우저 또는 플러그인 저장소에 인증 토큰 보관
- 사용자가 API 키와 원본 요청 로그를 볼 수 있는 UI
- AbortSignal을 무시하는 호환성 옵션
- 오류 상태인데 일부 텍스트가 있다는 이유로 성공 처리
- 모델 ID 정규식만으로 기능을 확정하는 방식
- 임의 엔드포인트와 임의 헤더를 일반 사용자에게 입력받는 기능
- 사용자 동의 없이 내부 thinking 내용을 장기 저장하는 기능
- 불필요한 자동 제목 생성 요청과 클라이언트 행동 모사

## 17. 단계별 구현 범위

### 1단계

- 공통 요청·응답 타입
- OpenAI Chat Completions builder/parser
- OpenAI Responses builder/parser
- Anthropic Messages builder/parser
- SSE 스트리밍과 취소
- 제공자 카탈로그와 API 키 기반 간편 등록
- LLM Gateway, OpenAI, Anthropic, Google AI Studio template
- Provider 카탈로그는 OpenAI, Anthropic, Google AI Studio, Vertex AI를 상단에 고정하고 나머지를 표시 이름 알파벳순으로 정렬
- 채팅·파일 처리 구현과 검증이 끝날 때까지 신규 Provider adapter 추가 보류
- 사용자별 모델 권한과 파라미터 정책
- 지정된 텍스트 파일, 텍스트 PDF, 이미지 입력과 보관 정책
- system prompt, 이전 턴 범위, 100,000토큰 기본 한도
- 컨텍스트 요약과 답변 분기

### 2단계

- `/models` 동기화 및 모델 기능 표시
- 제한된 키 회전
- thinking 및 usage 정규화
- 캐시와 thinking signature 복원
- 관리자 대화 본문 열람

### 3단계

- 사용자별 비용·사용량 한도
- 스캔 PDF OCR
- 대용량 문서 처리와 RAG
- Gemini Interactions API protocol engine과 기존 GenerateContent connection의 수동 migration

## 18. 인수 조건

- 프론트엔드 코드를 변경하지 않고 새 공급자 어댑터를 추가할 수 있다.
- 모델이 지원하는 엔드포인트에 따라 올바른 요청 형식이 선택된다.
- 지원하지 않는 파라미터는 UI에서 숨겨지고 직접 API 호출로 보내도 서버가 거부한다.
- 이미지 입력은 vision 모델에서만 가능하며 이미지 생성 요청은 존재하지 않는다.
- 세 가지 응답 형식이 동일한 `ChatEvent`로 브라우저에 전달된다.
- 스트리밍 중단 시 upstream 요청도 취소된다.
- 429 키 회전은 설정된 최대 횟수를 넘지 않는다.
- 제공자 API 키와 클라우드 자격증명이 브라우저, 일반 로그 및 오류 메시지에 노출되지 않는다.
- 모델 동기화 실패 시 기존 승인 모델은 보존되고 관리자에게 오류가 표시된다.
- 사용자별 모델 권한과 파라미터 제한이 서버에서 강제된다.

## 19. 구현 전 확정 사항

1. 1차 기본 노출 제공자 목록
2. 원격 provider registry 업데이트 승인 절차
3. Vertex AI, Bedrock, Copilot의 1차 포함 여부
4. 모델 자동 동기화 주기
5. thinking, 캐시 및 reasoning signature 저장 정책
6. 복수 API 키와 키 회전 기본 활성화 여부
7. 수동 provider template 허용 범위
8. 관리자가 등록할 수 있는 제공자 도메인 정책
