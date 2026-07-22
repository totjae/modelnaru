# ModelNaru Provider 계약 시험

## 1. 목적

Provider 템플릿, 인증 헤더, 모델 목록 정규화와 실제 자격증명 연결 결과를 제공자별로 기록한다. 테스트용 fixture와 실제 운영 API 키를 사용하는 smoke test를 구분하며 자격증명 원문은 이 문서와 로그에 기록하지 않는다.

## 2. 적용 범위

첫 구현은 `provider-manager-v1.10.0.js`의 전체 서비스 카탈로그를 보존하고 LLM Gateway, OpenAI, Anthropic, Google AI Studio의 API 키 등록과 모델 목록 조회 계약을 다룬다. Vertex AI, AWS Bedrock, GitHub Copilot과 나머지 템플릿 제공자는 카탈로그에 표시하되 전용 adapter 또는 실제 계약 시험 전까지 등록을 비활성화한다.

## 3. 공통 계약

- 템플릿 ID, 표시 이름, 고정 HTTPS base URL, 인증 방식, 모델 목록 경로와 응답 형식을 검증한다.
- endpoint는 서버 내장 템플릿에서만 가져오며 관리자가 첫 구현에서 임의 URL이나 인증 header를 입력할 수 없다.
- redirect는 따르지 않고 전체 요청 제한시간을 적용한다.
- 모델 ID가 없거나 비정상 형식인 항목은 버리고 같은 ID는 하나로 합친다.
- 모델 동기화 실패 시 기존 모델은 삭제하지 않는다.
- API 키는 response, 오류, fixture와 log에 포함하지 않는다.
- 실제 credential smoke test는 운영 서버에서 관리자가 수행하고 성공 여부와 표준화된 오류 code만 기록한다.

## 4. 제공자별 모델 조회 계약

| Template ID   | 인증 방식                                    | 모델 조회                         | Fixture 상태 | 실제 credential |
| ------------- | -------------------------------------------- | --------------------------------- | ------------ | --------------- |
| `llm-gateway` | `Authorization: Bearer`                      | `/models?exclude_deprecated=true` | 통과         | 통과            |
| `openai`      | `Authorization: Bearer`                      | `/models`                         | 통과         | 통과            |
| `anthropic`   | `x-api-key`, `anthropic-version: 2023-06-01` | `/models`                         | 통과         | 미검증          |
| `google`      | `x-goog-api-key`                             | `/v1beta/models`                  | 통과         | 미검증          |

LLM Gateway는 인증이 필요한 `GET /v1/key`로 API 키를 먼저 검증한 뒤 공개 `GET /v1/models?exclude_deprecated=true` 응답을 조회한다. 모델 목록은 OpenAI 형식의 `{ data: [{ id }] }`로 정규화하며 `context_length`가 있으면 context window로 저장한다. OpenAI와 Anthropic은 각 공식 모델 목록의 `data`, Google은 `models[].name`을 공통 모델 레코드로 정규화한다. Google의 `models/` prefix는 저장 모델 ID에서 제거한다.

## 5. 오류·경계 조건

- DNS·TLS·연결·timeout은 `PROVIDER_NETWORK_ERROR`로 일반화한다.
- 401·403은 `PROVIDER_AUTH_FAILED`, 429는 `PROVIDER_RATE_LIMITED`, 그 밖의 비정상 HTTP 상태는 `PROVIDER_UPSTREAM_ERROR`로 정규화한다.
- 응답이 JSON이 아니거나 예상 배열이 없으면 `PROVIDER_RESPONSE_INVALID`로 처리한다.
- 모델이 하나도 남지 않으면 연결 등록 또는 동기화를 성공 처리하지 않는다.
- upstream response 본문은 사용자 response와 일반 log에 포함하지 않는다.

## 6. 검증·인수 조건

- 전체 카탈로그 ID 중복과 잘못된 URL·지원 등급을 정적 시험에서 거부한다.
- 네 제공자의 인증 header와 모델 응답 fixture가 단위시험을 통과한다.
- API 키 암호화 round-trip과 잘못된 master key·변조 ciphertext 거부 시험이 통과한다.
- LLM Gateway의 인증 확인이 실패하면 공개 모델 목록을 조회하지 않고 등록을 중단한다.
- 관리자 session과 CSRF 없이는 Provider 등록·동기화·변경이 거부된다.
- 목록 API에는 ciphertext, nonce, tag, API 키 원문이 포함되지 않는다.
- Ubuntu HTTPS 관리자 화면에서 LLM Gateway·OpenAI 실제 키 등록, 모델 조회·동기화·활성 상태 변경과 비밀값 없는 감사 기록을 확인했다.

## 7. 미결정·보류 항목

- 원격 `providers.json` 자동 확인과 관리자 승인 workflow
- Vertex AI service account, AWS SigV4와 GitHub Copilot OAuth fixture
- 모델 목록이 없는 제공자의 수동 모델 ID 등록 범위
- 정기 모델 동기화 주기와 제거 모델 unavailable 전환 유예기간
