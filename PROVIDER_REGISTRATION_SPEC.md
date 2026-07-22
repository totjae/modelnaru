# AI 서비스 제공자 등록 명세

## 1. 목적

관리자가 AI 서비스 제공자를 선택하고 API 키를 입력하는 것만으로 모델 목록을 불러와 기본 설정으로 사용할 수 있게 한다. 필요한 경우 제공자·모델별 엔드포인트, 요청 형식, 추론, 캐시, 재시도와 커스텀 필드를 고급 설정에서 조정할 수 있어야 한다.

이 명세는 `provider-manager-v1.10.0.js`의 제공자 등록, provider registry, 키 그룹, 모델 조회와 모델 설정 구조를 서버형 웹 서비스에 맞게 재구성한 것이다.

## 2. 구현 원칙

- 간편 등록과 고급 설정을 분리한다.
- API 키 방식 제공자는 `제공자 선택 → API 키 입력 → 연결 테스트 → 모델 선택`만으로 등록할 수 있어야 한다.
- 제공자 템플릿이 기본 URL, 인증, 모델 목록, 지원 형식과 기본값을 결정한다.
- 사용자는 API 키, 엔드포인트와 인증 헤더를 볼 수 없다.
- 관리자가 고급 설정을 변경하지 않으면 검수된 템플릿 기본값을 사용한다.
- 모델별 기능을 감지해 지원되는 설정만 표시한다.
- 템플릿과 실행 엔진을 분리하여 코드를 배포하지 않고도 새 OpenAI 호환 제공자를 추가할 수 있게 한다.
- 원격 템플릿은 자동 실행하지 않고 검수·버전 고정 후 서버에 반영한다.

## 3. 등록 화면 흐름

### 3.1 API 키 제공자

1. 관리자가 “AI 제공자 추가”를 선택한다.
2. 제공자 카탈로그에서 서비스를 선택한다.
3. 연결 이름과 API 키를 입력한다.
4. 서버가 자격증명을 암호화해 임시 저장하고 연결 테스트를 실행한다.
5. 모델 목록 API가 있으면 모델을 자동 조회한다.
6. 관리자가 사용할 모델을 선택한다.
7. 서버가 템플릿 기본값과 모델 추론 결과로 모델 설정을 생성한다.
8. 테스트 메시지를 보내 성공하면 제공자를 활성화한다.

모델 목록 API가 없거나 실패하면 모델 ID를 수동 입력할 수 있다. 이때 고급 기능은 안전한 최소값으로 시작하고 테스트 후 활성화한다.

### 3.2 추가 자격증명이 필요한 제공자

일부 제공자는 API 키 하나로 등록할 수 없으므로 제공자 선택 후 전용 자격증명 폼을 표시한다.

| 제공자         | 필요한 자격증명                                                                     |
| -------------- | ----------------------------------------------------------------------------------- |
| Vertex AI      | Access Token 또는 Project ID, Client Email, Private Key, Region                     |
| AWS Bedrock    | Bedrock API Key 또는 Access Key ID, Secret Access Key, 선택적 Session Token, Region |
| GitHub Copilot | GitHub OAuth 로그인, 클라이언트 계열 선택, 필요시 Machine ID·Device ID              |

이 세 제공자는 간편 등록 UX를 유지하되 버튼 이름을 “API 키 입력”이 아니라 “자격증명 연결”로 표시한다.

## 4. 제공자 카탈로그

### 4.1 내장 제공자

참고 파일의 내장 제공자는 다음과 같다.

| ID               | 표시 이름           | 인증 유형                         | 기본 연결 엔진               |
| ---------------- | ------------------- | --------------------------------- | ---------------------------- |
| `openai`         | OpenAI              | API Key                           | OpenAI Chat·Responses        |
| `anthropic`      | Anthropic           | API Key                           | Anthropic Messages           |
| `google`         | Google AI Studio    | API Key                           | Gemini GenerateContent       |
| `gemini-express` | Gemini Express Mode | API 유형, 템플릿 정책 확인 필요   | Gemini GenerateContent       |
| `novelai`        | NovelAI             | API Key                           | NovelAI OpenAI 호환          |
| `vertex`         | Vertex AI           | Access Token 또는 Service Account | Gemini·Anthropic on Vertex   |
| `bedrock`        | AWS Bedrock         | Bedrock API Key 또는 AWS IAM      | Anthropic Invoke·OpenAI 호환 |
| `copilot`        | GitHub Copilot      | OAuth                             | Copilot 전용 연결            |

1차 UI에서는 전체 내장 제공자 catalog를 보존하되 OpenAI, Anthropic, Google AI Studio와 LLM Gateway를 우선 노출한다. Vertex AI, Bedrock, NovelAI, Gemini Express, GitHub Copilot은 “고급 제공자” 그룹으로 분리한다. 전용 adapter가 아직 완료되지 않은 제공자는 숨기지 않고 `준비 중`으로 표시한다.

### 4.2 템플릿 제공자

참고 파일은 원격 `providers.json`으로 OpenAI 호환 제공자를 확장한다. 확인된 템플릿에는 다음 서비스가 포함된다.

- LLM Gateway
- OpenRouter
- NanoGPT 및 NanoGPT Subscription
- Vercel AI Gateway
- Cloudflare AI Gateway
- Z.ai 및 Z.ai Coding
- Fireworks AI
- ArliAI
- OpenCode Go
- Ollama Cloud
- CrofAI
- Synthetic
- Featherless
- Neuralwatt Cloud
- Novita AI 및 Novita Coding
- SiliconFlow
- Together AI
- DeepSeek
- DigitalOcean
- Heroku US·EU
- Xiaomi MiMo 및 지역별 Token Plan
- Lightning AI
- Venice AI
- Cerebras
- AI Novelist
- Wellspring

카탈로그 목록 전체는 버전이 있는 서버 내장 snapshot으로 1차 배포에 포함한다. 원격 레지스트리 갱신은 관리자가 변경 내용을 확인한 뒤 승인하는 방식으로 제공한다.

각 제공자는 `verified`, `compatible`, `experimental`, `coming_soon` 중 하나의 지원 등급을 가진다. catalog에 포함되었다는 이유만으로 실제 API 호환성을 보장하지 않으며, 활성화 전에 template validator와 공통 provider contract test를 통과해야 한다.

## 5. Provider Template 규격

다음 JSON 규격을 서비스 제공자 템플릿의 기준으로 사용한다.

```ts
type ProviderTemplate = {
  id: string;
  name: string;
  baseUrl: string;
  auth: 'bearer' | 'bearer-optional' | 'none';
  modelListing?: string;
  defaultFormat: 'openai' | 'responses' | 'anthropic';
  formats: Partial<Record<'openai' | 'responses' | 'anthropic', string>>;
  modelFilter?: Record<string, unknown>;
  modelIdSuffix?: string;
  staticModels?: Array<{
    id: string;
    name?: string;
    contextWindow?: number;
    maxOutputTokens?: number;
    vision?: boolean;
    tools?: boolean;
    ownedBy?: string;
    createdAt?: number;
  }>;
  customFields?: ProviderCustomField[];
  defaultHeaders?: Record<string, string>;
  defaultBody?: Record<string, unknown>;
  caching?: ProviderCachingPolicy;
  providerTools?: {
    web_search?: Array<'openai' | 'responses' | 'anthropic'>;
  };
  usage?: ProviderUsageDefinition;
  sessionAffinity?: {
    field: string;
    target: 'header' | 'body';
  };
};
```

템플릿 ID는 영문 소문자, 숫자, 하이픈으로 제한한다. 내장 제공자 ID와 중복되는 수동 템플릿은 허용하지 않는다.

### 5.1 커스텀 필드

제공자별 고급 설정을 코드 수정 없이 추가할 수 있도록 다음 필드 유형을 지원한다.

- text
- number
- checkbox
- select
- string-list
- textarea 또는 JSON object

각 필드는 다음 정보를 가진다.

- key 또는 중첩 path
- header 또는 body 대상
- 표시 이름과 설명
- 기본값
- 체크 시 값과 체크 해제 동작
- 허용값
- 민감정보 여부

서버는 템플릿에 선언된 필드만 요청에 반영한다. 관리자가 입력한 임의 JSON을 그대로 병합하는 기능은 별도의 위험 경고와 권한을 요구한다.

## 6. LLM Gateway 기본 템플릿

LLM Gateway는 다음 검수된 템플릿을 서버에 내장한다.

등록 시 인증이 필요한 `GET /v1/key`를 먼저 호출해 API 키를 검증한다. 모델 목록 endpoint는 키 없이도 공개될 수 있으므로 모델 목록 조회 성공만으로 키가 유효하다고 판단하지 않는다.

```json
{
  "id": "llm-gateway",
  "name": "LLM Gateway",
  "baseUrl": "https://api.llmgateway.io/v1",
  "auth": "bearer",
  "modelListing": "/models?exclude_deprecated=true",
  "defaultFormat": "openai",
  "formats": {
    "openai": "/chat/completions",
    "anthropic": "/messages",
    "responses": "/responses"
  },
  "sessionAffinity": {
    "field": "x-session-id",
    "target": "header"
  }
}
```

고급 설정은 다음을 제공한다.

- `X-No-Fallback`: 지정하지 않은 provider 또는 모델로 대체 라우팅되는 것을 막는다.
- `web_search`: 지원 모델에서 provider-hosted 웹 검색을 사용한다.
- `x-session-id`: 동일 대화 요청을 같은 라우터로 연결한다.
- OpenAI 계열 implicit cache 설정
- Claude 계열 `cache_control` passthrough와 5분·1시간 TTL

`x-session-id`에는 데이터베이스 대화방 ID를 직접 넣지 않는다. 대화방마다 별도 무작위 gateway session ID를 생성해 사용한다.

## 7. 내장 제공자별 기본 동작

### 7.1 OpenAI

- 기본 URL: `https://api.openai.com/v1`
- 인증: `Authorization: Bearer {API_KEY}`
- 모델 조회: `GET /models`
- 기본 요청: `/chat/completions`
- 지원 시 Responses: `/responses`
- GPT-5 계열은 모델 정책에 따라 Responses 또는 `max_completion_tokens`를 사용한다.
- 모델별 reasoning effort, verbosity, prompt cache retention과 이미지 입력을 기능 감지 후 노출한다.

### 7.2 Anthropic

- 기본 요청: `https://api.anthropic.com/v1/messages`
- 인증: `x-api-key`
- 필수 버전 헤더: `anthropic-version`
- 모델 조회: `GET https://api.anthropic.com/v1/models`
- 지원 기능: streaming, thinking budget, adaptive thinking, thinking 표시 방식, cache control, provider-hosted web search
- Anthropic Message Batches는 2차 기능으로 둔다.

### 7.3 Google AI Studio

- 기본 URL: `https://generativelanguage.googleapis.com`
- 인증: Google API Key
- 모델 조회: `/v1beta/models`
- 요청: `/v1beta/models/{model}:generateContent`
- 스트리밍: `streamGenerateContent?alt=sse`
- 지원 기능: system instruction, 이미지 입력, thinking, function call metadata, countTokens, explicit cachedContents

### 7.4 Gemini Express Mode

- Gemini GenerateContent 엔진을 사용한다.
- 참고 파일은 빠른 모델 조회에서 무키 접근을 허용하지만 실제 요청의 인증·사용 조건은 배포 전에 공식 규격으로 검증한다.
- 검증 전에는 고급 제공자로 표시하고 일반 사용자에게 기본 노출하지 않는다.

### 7.5 NovelAI

- 기본 요청: `https://text.novelai.net/oa/v1/chat/completions`
- OpenAI 호환 메시지와 NovelAI 전용 형식 보정을 사용한다.
- API 키와 모델 조회가 성공해야 활성화한다.

### 7.6 Vertex AI

- 인증: Access Token 또는 GCP Service Account JWT 교환
- 필수 설정: Project ID와 Region
- Gemini: `publishers/google/models/{model}:generateContent`
- Claude: `publishers/anthropic/models/{model}:rawPredict`
- 서비스 계정 JSON 업로드 시 Project ID, Client Email, Private Key를 추출한다.
- Private Key는 암호화 저장하고 브라우저에 다시 표시하지 않는다.

### 7.7 AWS Bedrock

- 인증 방식 1: Bedrock API Key
- 인증 방식 2: Access Key ID, Secret Access Key, 선택적 Session Token을 이용한 SigV4
- 필수 설정: AWS Region
- Claude 계열은 Bedrock Runtime invoke·invoke-with-response-stream을 사용한다.
- 지원되는 OpenAI 계열은 Bedrock Mantle의 chat/completions 또는 responses를 사용할 수 있다.

### 7.8 GitHub Copilot

- GitHub OAuth Device Flow를 사용한다.
- VSCode 또는 OpenCode 클라이언트 계열을 선택한다.
- Copilot 단기 토큰 교환과 모델 목록 조회가 필요하다.
- 서비스 약관과 다중 사용자 운영 적합성을 확인하기 전에는 기본 비활성화한다.

## 8. 자동 모델 설정

모델 조회 후 서버는 다음 순서로 설정을 생성한다.

1. provider template의 `defaultFormat`을 적용한다.
2. 모델 메타데이터의 vendor, ID, ownedBy와 기능 정보를 읽는다.
3. 제공자가 지원하는 요청 형식 중 모델에 적합한 형식을 선택한다.
4. endpoint를 `baseUrl + formats[format]`으로 생성한다.
5. 모델 컨텍스트, 최대 출력, vision, tools와 지원 파라미터를 저장한다.
6. 알려진 모델 규칙으로 reasoning, tokenizer와 캐시를 보정한다.
7. 최소 테스트 요청을 보내 실제 호환성을 확인한다.

자동 추론값은 관리자 화면에서 확인·수정할 수 있다. 템플릿 기본값과 관리자가 변경한 값을 분리 저장해 템플릿이 업데이트돼도 사용자 설정을 덮어쓰지 않는다.

## 9. 간편 등록 기본값

관리자가 고급 설정을 열지 않았을 때 다음 값을 사용한다.

- 제공자 템플릿의 기본 URL
- 제공자 템플릿의 기본 요청 형식
- 스트리밍 사용
- 최대 출력 토큰: 모델 메타데이터 값과 서버 안전 한도 중 작은 값
- temperature·top_p: 제공자 기본값 사용, 요청 body에서 생략
- reasoning effort: 모델 기본값 사용
- thinking 표시: 꺼짐
- provider-hosted web search: 꺼짐
- 커스텀 헤더·body: 템플릿 기본값만 적용
- 재시도: 429와 5xx에 제한적으로 적용
- 캐시: 제공자 템플릿의 안전한 기본 정책
- session affinity: 지원 제공자에서 자동 생성 ID 사용

등록 완료 후 “기본 설정으로 사용 가능” 상태와 “세부 설정 확인 필요” 상태를 구분해 표시한다.

## 10. 제공자별 고급 설정

### 10.1 공통 설정

- 연결 이름과 표시 이름
- 활성화 상태
- 기본 URL과 모델별 endpoint
- 모델 ID와 요청 형식
- API 키 또는 키 그룹
- 연결·첫 응답·전체 응답 제한시간
- 스트리밍
- 최대 출력 토큰
- temperature, top_p, top_k
- frequency penalty, presence penalty
- 커스텀 헤더와 body
- 요청 로그 수준

### 10.2 추론과 출력 설정

- OpenAI reasoning effort
- OpenAI verbosity
- Anthropic thinking budget
- Anthropic adaptive thinking
- thinking 표시: summarized 또는 omitted
- Gemini thinking 설정
- 순수 thinking만 반환된 경우 본문 승격 여부
- thinking 구분자

설정은 선택 모델이 지원하는 경우에만 표시하고 서버에서도 기능을 확인한다.

### 10.3 캐시 설정

- `none`: 캐시 없음
- `implicit`: 제공자가 자동 캐싱
- `passthrough`: `cache_control`을 제공자에 전달
- `explicit`: Gemini cachedContents 등 명시적 캐시 리소스 사용
- TTL: 제공자에 따라 5분, 30분, 1시간, 24시간
- 캐시 지점 수와 최소 토큰 수
- system 메시지 캐시 여부와 마지막 메시지 제외 범위

### 10.4 웹 검색과 제공자 도구

- 제공자가 공식적으로 지원할 때만 provider-hosted web search를 표시한다.
- 기본값은 꺼짐이다.
- 웹 검색 사용 여부와 결과 출처 정보는 메시지에 기록한다.
- 일반 MCP·클라이언트 도구 실행은 별도 기능이며 2차 범위로 둔다.

### 10.5 네트워크

- Linux 서버가 제공자 API에 직접 연결하는 것이 기본이다.
- 사용자에게 프록시 설정을 노출하지 않는다.
- 관리자는 필요한 경우 검증된 사내 프록시만 설정할 수 있다.
- 공개 Yumi·RisuAI 프록시는 사용하지 않는다.
- endpoint와 리디렉션 목적지에 SSRF 방어를 적용한다.

## 11. API 키와 키 그룹

자격증명 유형은 다음과 같다.

- `api`: 일반 API 키와 선택적 사용량 조회 키
- `vertex`: Access Token 또는 GCP Service Account
- `bedrock`: Bedrock API Key 또는 AWS IAM 자격증명
- `copilot_oauth`: GitHub OAuth 토큰과 클라이언트 정보

키 그룹은 다음 전략을 지원한다.

- `manual`: 관리자가 선택한 키만 사용
- `sequential`: 요청마다 순차 회전
- `on_error`: 재시도 가능한 오류에서 다음 키 사용

키 그룹은 동일 인증 유형과 동일 제공자 범위의 키만 포함한다. 401·403에서는 무제한 회전하지 않고 잘못된 키를 비정상 상태로 표시한다.

## 12. 재시도 정책

Provider Manager의 설정을 서버용으로 다음과 같이 적용한다.

- 기본 대상: HTTP 429
- 선택 대상: 429와 5xx
- `Retry-After` 등 표준 헤더 준수
- 기본 최대 재시도: 5회보다 보수적인 서버 기본값 2회를 권장
- 기본 최소 지연: 5초
- 전체 최대 대기시간: 관리자 설정값 내에서 제한
- 스트리밍이 사용자에게 전달된 뒤에는 자동으로 처음부터 재시도하지 않는다.

모델 또는 키 그룹 fallback은 중복 과금 가능성이 있으므로 요청이 외부에서 처리되지 않았다고 판단되는 경우에만 수행한다.

## 13. 모델 그룹과 라우팅

Provider Manager에는 모델 그룹, manual·sequential·on-error 전략과 조건부 라우터가 있다. 본 서비스에서는 다음과 같이 단계화한다.

- 1차: 사용자가 명시적으로 모델 선택
- 2차: 관리자가 모델 그룹과 오류 fallback 구성
- 2차: 입력 길이 또는 문자열 조건 기반 라우터
- 2차: 스트림 오류 시 다른 모델 cascade

자동 라우팅을 사용해도 사용자별 모델 권한을 넘어서는 모델은 선택할 수 없다.

## 14. 모델 목록과 템플릿 갱신

- 제공자 등록 시 모델 목록을 즉시 조회한다.
- 관리자가 수동 새로고침할 수 있다.
- 정기 동기화 주기는 관리자 설정으로 둔다.
- 제거된 모델은 삭제하지 않고 `unavailable`로 표시한다.
- 새 모델은 기본 비활성화 후 관리자 승인 방식을 권장한다.
- 마지막 정상 모델 목록과 조회 시각을 보관한다.
- 템플릿 업데이트 시 URL, 인증, 기본 header·body와 custom field 차이를 관리자에게 보여준다.
- 관리자가 승인하기 전에는 새 템플릿으로 실제 요청을 보내지 않는다.

## 15. 데이터 구조

### `provider_templates`

- `id`, `name`, `version`
- `source`: `builtin`, `bundled_registry`, `manual`
- `definition` JSON
- `enabled`
- `checksum`
- `reviewed_at`, `created_at`, `updated_at`

### `provider_connections`

- `id`, `template_id`, `display_name`
- `base_url_override`
- `default_format_override`
- `advanced_settings` JSON
- `status`: `draft`, `testing`, `active`, `invalid`, `disabled`
- `last_tested_at`, `last_error_code`

### `provider_credentials`

- `id`, `provider_connection_id`
- `credential_type`
- `alias`
- 암호화된 자격증명 필드
- `status`, `rotation_order`
- `last_validated_at`

### `provider_models`

- `id`, `provider_connection_id`
- `upstream_model_id`, `display_name`
- `format`, `endpoint_override`
- `capabilities` JSON
- `parameter_policy` JSON
- `template_defaults` JSON
- `admin_overrides` JSON
- `enabled`, `availability_status`

## 16. 서버 API 초안

- `GET /admin/provider-templates`: 선택 가능한 제공자 목록
- `POST /admin/provider-connections/test`: 저장 전 연결 테스트
- `POST /admin/provider-connections`: 제공자 등록
- `PATCH /admin/provider-connections/{id}`: 설정 수정
- `DELETE /admin/provider-connections/{id}`: 제공자 비활성화 또는 삭제
- `POST /admin/provider-connections/{id}/models/sync`: 모델 조회
- `POST /admin/provider-connections/{id}/test-chat`: 테스트 메시지
- `GET /admin/provider-connections/{id}/models`: 모델 목록
- `PATCH /admin/provider-models/{id}`: 모델별 고급 설정
- `POST /admin/provider-templates/import`: 수동 템플릿 검증·등록
- `POST /admin/provider-templates/check-updates`: registry 변경 확인

모든 API는 고정 관리자만 호출할 수 있고 감사 로그를 남긴다.

## 17. 보안 요구사항

제공자 연결 및 요청 로그는 [ADMIN_LOGGING_SPEC.md](./ADMIN_LOGGING_SPEC.md)의 마스킹·보관 정책을 따른다.

- API 키와 클라우드 private key는 애플리케이션 키로 암호화한다.
- 자격증명은 등록 후 전체 값을 다시 표시하지 않는다.
- 테스트 오류에서도 Authorization, x-api-key와 AWS 서명 정보를 마스킹한다.
- 수동 템플릿의 base URL과 model listing URL을 SSRF 검사한다.
- URL은 기본적으로 HTTPS만 허용한다.
- default header에서 Host, Cookie, Content-Length 등 위험한 헤더를 제한한다.
- custom body가 model, messages, system 권한 검사를 우회하지 못하도록 보호 필드를 둔다.
- 원격 registry에는 코드, 스크립트 또는 표현식 실행을 허용하지 않는다.
- 템플릿 checksum과 변경 이력을 보관한다.

## 18. 인수 조건

- 관리자가 LLM Gateway를 선택하고 API 키만 입력해 모델 목록을 조회할 수 있다.
- 모델을 하나 이상 선택하면 기본 설정으로 테스트 채팅에 성공한다.
- OpenAI, Anthropic, Google AI Studio도 동일한 간편 등록 흐름을 제공한다.
- Vertex AI와 Bedrock은 제공자에 맞는 전용 자격증명 폼을 제공한다.
- 등록한 비밀값이 브라우저 응답과 일반 로그에 노출되지 않는다.
- 템플릿이 선언하지 않은 커스텀 필드는 요청에 반영되지 않는다.
- 모델별 지원 기능에 따라 세부 설정이 동적으로 표시된다.
- 고급 설정을 변경하지 않은 모델은 템플릿 업데이트 시 안전하게 기본값을 갱신할 수 있다.
- 관리자가 수정한 값은 템플릿 업데이트로 덮어쓰지 않는다.
- 모델 목록 조회 실패 시 마지막 정상 목록을 보존한다.
- 비활성 제공자와 모델은 일반 사용자에게 표시되지 않는다.
- 사용자별 모델 권한이 모든 직접 호출과 라우터 경로에서 강제된다.

## 19. 1차 구현 범위

- Provider template validator와 참고 파일의 전체 template catalog를 담은 서버 내장 registry snapshot
- LLM Gateway, OpenAI, Anthropic, Google AI Studio 간편 등록
- OpenAI 호환 template 제공자의 공통 등록·모델 조회·채팅 경로와 지원 등급 표시
- API 키 암호화 저장과 연결 테스트
- 모델 자동 조회와 수동 모델 ID 입력
- OpenAI Chat, Responses, Anthropic Messages, Gemini GenerateContent 엔진
- 모델별 기본 파라미터와 고급 설정
- 스트리밍, 이미지 입력, thinking·reasoning, 캐시 기본 정책
- 수동 템플릿 import
- 요청 로그와 429·5xx 제한 재시도

## 20. 2차 구현 범위

- Vertex AI, AWS Bedrock, NovelAI, Gemini Express, GitHub Copilot의 전용 adapter 완성과 `verified` 승격
- 모델·키 그룹과 fallback
- 조건부 모델 라우터
- Anthropic Batch
- Gemini explicit cachedContents 자동 관리
- 사용량 API와 잔액 표시
- provider-hosted web search 고도화
- MCP, hook과 외부 도구 플러그인

## 21. 현재 구현 상태

- `provider-manager-v1.10.0.js`와 이 문서의 전체 서비스 이름을 서버 내장 카탈로그로 보존했다.
- LLM Gateway, OpenAI, Anthropic, Google AI Studio는 고정 HTTPS 템플릿, API 키 연결 시험과 모델 목록 동기화를 지원한다.
- 나머지 제공자는 카탈로그에 `준비 중` 또는 `시험 예정`으로 표시하며 아직 자격증명을 받지 않는다.
- API 키는 AES-256-GCM으로 암호화하고 연결 목록에는 선택적 마지막 네 글자 hint만 반환한다.
- 신규 모델은 기본 비활성화하며 관리자가 모델별로 활성화할 수 있다.
- 연결 물리 삭제 대신 비활성화하고 동기화에서 사라진 모델도 unavailable 상태로 보존한다.
- 사용자별 모델 권한 table은 준비됐지만 API·UI 연결, API 키 교체와 고급 parameter 설정은 다음 하위 단계다.
