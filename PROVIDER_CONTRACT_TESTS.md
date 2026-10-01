# ModelNaru Provider 계약 시험

## 2026-10-02 Gemini Pro 이미지 재시험 통과 (최신)

사용자가 추가1회/출력1024/새 예산 $0.02를 승인한 실제 이미지 입력이 completed·색/도형/위치 검사 true로 통과했다. known usage1159/631·7185ms·단일 chat usage1개/보조0개, 비용 추정 $0.00989. HTTP200 SSE·event8·terminal 확인, 별도 테스트 계정 quota1. 기존 max256 실패를 보존하고 자동 재시도하지 않았다. 승인 소진, 유료 모델 disabled/자동 제목 null, 첨부0·PC 계정 복사본 삭제. TEST_PLAN.md 최상단 및 tmp/n13/image-retest-result.json/image-retest-safe-audit.json 참조. 청구서 실비/다른 Provider나 모든 이미지 유형 지원으로 확대하지 않는다.


## 2026-10-02 LLM Gateway Gemini Pro 실제 인수

- gemini-pro-latest, https://api.llmgateway.io/v1: 실제 제목은 고정64/15초 내 completed(2629ms·usage84/59·auto)로 통과했다. 이미지 요청 max256은 HTTP200 SSE 후 length/OUTPUT_TOKEN_LIMIT/CHAT_OUTPUT_LIMIT로 실패했다(usage1221/252·4775ms). 이미지 의미 지원 인수는 미통과다.
- 승인 이미지1+제목1만 호출했다. 합산 known usage1305/311로 조회 가격 기준 $0.006342 추정이며 청구서 확정 금액은 아니다. 추가 호출 없음. 이후 제목 null·유료 모델 disabled. 실패 단계/event count/수신 시간을 포함한 안전 진단과 DB 원장은 TEST_PLAN.md 최신 절 및 tmp/n13/server-safe-audit.json 참조.
- 한국어 스캔 PDF 전체 Linux 앱 경로는 무료 mock의 실제 요청 문구 검증으로 통과했다. 실제 이미지 모델 의미 검증과 구분한다. 공인 Web CA HTTPS는 통과, 물리적 휴대폰/스크린리더 결과는 대기다. 아래 이전 기록의 미검증 상태는 당시 snapshot이다.


## 2026-10-02 실제 LAN 보조 호출 지원 범위

- gemma4-12b: 실제 요약 max512에서 completed·usage1383/195·요약1개 저장·main 완료를 확인했다. max128은 length 실패였다. 자동 제목의 고정 max64는 3.565초 후 length→OUTPUT_TOKEN_LIMIT/CHAT_OUTPUT_LIMIT로 실패해 성공 지원을 확정하지 않는다. 기본 제목/main 완료와 task/usage 각1개 격리를 확인했다.
- 상용 호출은 없었다. 기본 생성의 재실행 중 max64 length 실패도 별도 보존했다. 기존 정상 생성 인수와 구분하며 임의 자동 재시도/예산 완화는 하지 않는다. 프롬프트·본문·키 없는 safe diagnostic 및 원장은 TEST_PLAN.md 최신 결과와 tmp/n13/local-remaining/에서 확인한다.
- 실제 이미지 입력, 전체 Linux API의 스캔 첨부 HTTP→OCR, 다른 상용 Provider·공인HTTPS/실기기는 여전히 별도 인수다. 한국어·영문 OCR engine 및 텍스트/PDF/PNG 첨부 HTTP는 각각 통과했다. N13 전체 완료와 구분한다.


## N13 실행 구분 (2026-10-01)

- 복구 모델의 PC 앱 인수 후속: 승인된 사설192.168.0.12:8080의 gemma4-12b를 실제 custom 관리자 API로 등록하고 max64 생성1회·pending SSE 연결 끊기·streaming GET/SSE 재접속 정확 복원·terminal·usage72/39·charged를 확인했다. chat usage/quota 원장은 각1개, 안전 진단 HTTP200/text/event-stream·17.463초·38 data event였다. 통합6개·HTTP63건·오류0, tmp/n13/local-restored/에 본문 없는 증거를 보존하고 전용 자원을 정리했다. 이는 PC 사설 연결이며 아래 서버 공인HTTP 직접 진단과 다르다. 서버 앱 등록 정책과 공인 Web HTTPS/실기기 차단은 남는다. 상용 키/호출은 사용하지 않았다. TEST_PLAN.md 최상단 참조.

- 복구된 keyless 모델: domain:8080 및 공인 IP:8080의 모델 목록은 서버/PC 모두 HTTP 200이다. 요청된 공인 IP:808은 timeout이다. 서버의 일회용 제한 Docker에서 gemma4-12b 실제 생성 1회(max64)가 22.230초·본문2 byte·usage21/49·stop/[DONE]으로 완료했다. 이는 공인 HTTP 직접 진단이고 앱의 custom 등록/job/quota 인수는 아니다. 사용자가 192.168.0.12는 작업 PC 망 주소라고 정정했다. 공인 HTTP를 허용하려고 기존 정책을 변경하지 않았다. 서버 앱 연동에는 지원되는 HTTPS endpoint 또는 별도 정책 선택이 필요하다. 임시 컨테이너 정리·운영 미변경. TEST_PLAN.md 최상단 참조.

- 최신 LLM Gateway 정상 생성 인수 통과: 사용자 "다음작업시작해"로 승인한 진단 적용 gemini-3.8-flash/256토큰 1회가 completed·본문 2 byte·usage 56/100·quota charged였다. 실제 HTTPS SSE terminal·GET/DB 일치 및 HTTP 200/text/event-stream·약 249초·data event 5개를 진단으로 확인했다. 통합 7개·브라우저 HTTP 60건·오류 0, 전용 자원 정리 완료. 키/생성 본문을 증거에서 제외했다. 이전 두 실패의 원인까지 소급 확정하는 것은 아니다. 전체 실제 생성 시도 3회이며 추가 호출은 새 승인 필요다. N13의 다른 환경 차단은 유지한다. TEST_PLAN.md 최상단 참조.

- 응답 진단 보완 완료: 안전 메타데이터와 실패 단계/내부 원인 코드의 원장은 ADMIN_LOGGING_SPEC.md N13 절이다. JSON/구조/종료 검사 실패 등 raw event 누락 경로와 실제 loopback HTTP/SSE를 새 fixture 21개로 검증했다. 전체 로컬 API 229개 통과·실DB 6개 제외, 추가 실제 Provider 호출 없음. 다음 유료 재시험 조건/승인·격리·1회 상한은 TEST_PLAN.md 최상단을 따른다. 기존 Gateway 실패 원인은 이 보완만으로 확정되지 않는다.

- 이전 LLM Gateway 실패 기록: 사용자 지정 gemini-3.8-flash의 키 확인·모델 조회·암호화 API 등록은 통과했다. 64토큰 1회는 failed/CHAT_OUTPUT_LIMIT, 부분 본문 OK, usage 56/60·quota charged였다. 별도 승인된 256토큰 추가 1회는 약 572초 후 failed/CHAT_PROVIDER_RESPONSE_INVALID, 본문 없음·usage unknown·quota charged였다. 실제 HTTPS SSE terminal은 확인했지만 당시 정상 생성 인수는 실패했다. 원본 응답이 보존되지 않아 구체적 원인은 미확정이다. 이 두 실행 다음에 위 정상 생성 인수를 별도 승인으로 수행했다. TEST_PLAN.md 최상단 참조.

- LLM Gateway 준비 이력: 사용자 요청으로 root .env.n13-test를 생성하고 Git ignore를 확인했다. 당시 키 입력/실제 시험은 대기였으며 이후 위 결과를 별도 승인으로 실행했다. 공식 quickstart(https://docs.llmgateway.io/quick-start)의 https://api.llmgateway.io/v1을 기존 llm-gateway template과 대조했다. 키 원문은 기록·전송하지 않는다.

### 후속 실제 연결 결과

- 사용자 제공 http://192.168.0.12:8080/v1의 keyless gemma4-12b를 현재 관리자 custom 등록/수동 모델/권한 API로 설정했다. 실제 사용자 job 호출이 completed, 2 byte 본문, usage 72/26, quota charged로 끝났다. custom pinned socket 전송은 mock shim을 거치지 않는다. 작업 PC의 현재 API에서 검증한 모델 1개이며 나머지 목록 모델의 인수를 뜻하지 않는다.
- 현재 secureProviderFetch의 공개 DNS/pinned lookup/TLS는 https://api.openai.com/v1/models에 키 없는 GET 1회의 예상 401로 검증했다. 인증 또는 생성 시험은 아니다.
- 이전 mihoservice_server→192.168.0.12:8080 timeout은 작업 PC 망 주소에 대한 결과다. 사용자가 서버의 대상과 다름을 정정했으므로 그 주소의 서버 접근을 필수 해결책으로 삼지 않는다. 복구한 공인 domain:8080은 위 직접 생성으로 확인했다. 운영 서비스·라우팅·방화벽은 변경하지 않았다.

아래는 첫 N13 실행 시점의 mock 증거 구분이다. 후속 실제 모델 1개 이외 Provider는 fixture 지원 수준을 유지한다.

현재 실제 Provider 인수는 미완료다. apps/web/test/n13-integration.mjs는 실제 Web/API/PostgreSQL/TLS 경로를 사용하지만 API 프로세스의 fetch에서 OpenAI 목적지만 로컬 mock으로 치환한다. 따라서 실제 Provider 인증·DNS/TLS·모델 호환·사용량 정확성의 증거가 아니다. 실제 키나 운영 자격증명은 읽지 않았다. 나머지 외부 목적지는 시험 shim이 거부한다.

기존 N05/N07 protocol/transport 및 N06/N08 job 회귀는 TEST_PLAN.md N13의 전체 API 214개에 포함해 재실행했다. 실제 Provider별 대상·허용 호출 수/비용·시험 키 파일과 LAN 추론 서버 주소는 사용자에게 요청한 상태다. 준비되지 않은 항목은 기존 fixture 지원 수준으로 남기고 N14 인수로 넘기지 않는다.

## N02 fixture·실연동 인수표 (2026-09-30, N05 parser fixture 실행)

N05는 세 내장 protocol의 종료/오류 fixture, N07은 커스텀 OpenAI 호환 목적지·인증/수동 모델 fixture, N13은 허용된 실제 원격·로컬 연결 결과를 기록한다. fixture 성공과 실제 credential/로컬 서버 성공은 별도 칸에 남기며 미실행을 통과로 적지 않는다. 정확한 종료 신호는 AI_INTEGRATION_SPEC.md N02, 목적지는 SECURITY_SPEC.md N02를 따른다.

### N07 독립 점검 보완 (2026-10-01)

기존 fixture 통과 후 공인 도메인 lookup callback 오류와 HTTP 204의 uncaughtException을 재현했다. 두 결함은 `TEST_PLAN.md` 최신 N07-R1/R2 보완에서 수정·재검증했다. Node 기본 주소군 선택의 도메인 소켓과 사설 IP 서버의 HEAD/204/205 및 응답 변환 rejection을 확인했고 전체 API 190개·격리 DB N07 시험 2개가 통과했다. 실제 공인 HTTPS Provider 연결은 N13에 남는다. 아래 결과는 보완 전 실행 기록이다.

### N07 실행 결과 (2026-10-01)

- `provider-destination.test.ts`에서 공개 HTTPS 주소·DNS 혼합/변경·IPv4-mapped/IPv6·사설 IP 승인 규칙을 검증했다. `providers-custom-postgres.test.ts`는 격리 PostgreSQL에서 keyless 등록, 수동 모델 중복·동기화 보존, 이미지 estimate, 진단 초기화/늦은 결과 거부, 활성 job 중 목적지 변경 거부를 검증했다.
- `providers-custom-http-postgres.test.ts`는 별도 컴파일 API 프로세스와 사설 IP에 바인딩한 mock OpenAI 호환 HTTP 서버로 실제 관리자 HTTP 경로·모델 목록·수동 ID·단계별 진단·정상 SSE chat job을 실행했다. keyless/가짜 Bearer 전환, redirect/metadata 거부, 실패한 모델 목록 동기화의 기존 모델 보존, 일반 사용자 관리자 경로 거부를 확인했다. 격리 DB와 mock 서버를 사용하는 4개 파일·4개 시험(N06 회귀 2개 포함)이 최종 통과했다. 전체 API 단위 시험은 40개 파일·188개 통과, 조건부 DB 시험 4개는 환경 변수 없는 실행에서 제외하고 별도로 실행했다.
- 실제 외부 Provider 자격증명, 공인 HTTPS endpoint, Docker API 컨테이너에서의 로컬 추론 서버 실통신은 실행하지 않았다. 이들은 N13 인수 범위다. 제목·이미지 budget의 실제 보조 호출은 N08에 남는다. 마지막 오류 분류 보완 뒤 전체 API 단위 시험 40개 파일·188개와 N07/N06 격리 DB 시험 4개 파일·4개가 모두 다시 통과했다.

### N05 실행 결과

- 환경: 로컬 Windows 작업 폴더, mock `fetch`/`ReadableStream`; `apps/api/test/chat-streaming.test.ts`에서 세 protocol의 정상 terminal, UTF-8 1 byte 분할, 비정상 EOF, 200 내부 오류, 거부·길이 제한·usage 누락을 실행했다. OpenAI의 선행 `[DONE]`, Anthropic의 `message_stop` 누락, Gemini의 finish 누락도 실패로 판정했다.
- 공통 경계: HTTP 401/429/503, 불완전 SSE·잘못된 UTF-8/JSON·빈 body/빈 정상 답변·1 MiB 초과 event·UTF-8 생성 byte 초과, 취소·idle/total/header timeout fixture를 확인했다. 부분 usage가 이후 오류 및 terminal length 오류보다 먼저 전달되는 것도 확인했다. API 전체 38 file·178 test, typecheck·lint 통과; 최종 검사 수는 TEST_PLAN.md N05 결과를 따른다.
- 실제 자격증명 Provider, 커스텀 endpoint, Docker→로컬 모델 실통신은 수행하지 않았다. N07/N13의 실제 환경 칸은 계속 미검증이다. N06의 job 영속 usage·config snapshot 연결은 parser fixture와 별도다.

| Protocol·영역 | 필수 fixture | 실제 환경 확인 |
| --- | --- | --- |
| OpenAI Chat Completions(내장·custom) | 분할 UTF-8/SSE, `finish_reason=stop`+[DONE], 선행 `[DONE]`/EOF, 200 내부 error, length/refusal/tool_calls, 정상 종료 후 빈 text, 부분 usage·취소 | 기존 내장 자격증명과 승인된 custom endpoint를 각각 기록 |
| Anthropic Messages | `message_delta.stop_reason=end_turn|stop_sequence`→`message_stop`, stop 누락/EOF, max_tokens/refusal/error, usage 누락·취소 | 실제 credential 가능 여부·지원 등급 기록 |
| Gemini GenerateContent | STOP+EOF, finishReason 누락, MAX_TOKENS/SAFETY/SPII/기타 reason, 빈 text, usage 누락·취소 | 실제 credential 가능 여부·지원 등급 기록 |
| 커스텀 모델 목록·수동 ID | `{data:[{id}]}` 정규화, 목록 없음/오류 후 수동 ID, 중복·비활성·capability default, bearer/none | API container에서 remote/local 모델 조회·chat 시험 |
| 목적지 | public A/AAAA 혼합·DNS 재결과·dial IP 불일치, local 정확한 승인·비승인, loopback/link-local/metadata/IPv4-mapped/redirect/proxy 우회 | Docker→호스트/LAN 실제 경로와 비밀값 비노출 확인 |
| 자원·진단 | 32 MiB request, 8 MiB response, 1 MiB event, 2 MiB output, idle/전체 timeout, 연결 단계별 상태 | 3 concurrent Provider call 상한과 느린 구독자 분리 |

실제 시험에는 사용한 연결 종류·protocol·model ID의 안전한 표기, 날짜·환경·성공/오류 code만 남긴다. API key, 주소 전체, prompt/응답 본문, TOTP·DB URL은 기록하지 않는다. 커스텀 연결을 `chat_verified`로 표시하려면 마지막 정상 종료 신호와 텍스트를 확인해야 한다.

## 2026-09-30 감사 재현과 보완 항목

- 현 parser mock 재현: OpenAI 호환 delta 뒤 완료 신호 없는 EOF와 HTTP 200 error 이벤트가 모두 done으로 끝나고 예외가 없었다. 결함 확인이며 외부 Provider 실통신 결과가 아니다.
- 새 버전 계약에 비정상 EOF, stream 내 오류, 정상 빈 출력과 거부·길이 제한, 취소·부분 usage 보존을 구분하는 fixture를 추가해야 한다(AUD-04).
- 현행 시험 통과만으로 위 실패 경로가 검증됐다고 간주하지 않는다.

## 새 버전 커스텀·로컬 계약 시험 계획 (2026-09-30 작성, N07 결과는 위 절)

- 이 절의 최초 계획 중 수동 ID·키/무인증·주소 거부·DNS/IPv6·redirect·mock SSE는 N07 실행 결과로 확인했다. 실제 원격/로컬 모델 엔진, 실제 키, Docker 네트워크, 제목·이미지 budget은 위에 적은 후속 인수 범위로 남는다.

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

## 5. 채팅 스트리밍 계약

| Template ID   | 채팅 endpoint                                          | Stream fixture   | 실제 credential |
| ------------- | ------------------------------------------------------ | ---------------- | --------------- |
| `llm-gateway` | `/chat/completions`                                    | OpenAI 호환 통과 | 미검증          |
| `openai`      | `/chat/completions`                                    | 통과             | 미검증          |
| `anthropic`   | `/messages`                                            | 통과             | 미검증          |
| `google`      | `/v1beta/models/{model}:streamGenerateContent?alt=sse` | 통과             | 미검증          |

fixture는 고정 URL·인증 header·요청 body, 전송 chunk 경계와 무관한 SSE JSON 조립, text·usage·완료 event 정규화를 검증한다. 실제 credential 시험에서는 응답 본문이나 키를 기록하지 않고 스트리밍 성공·저장 상태만 기록한다.

## 6. 오류·경계 조건

- DNS·TLS·연결·timeout은 `PROVIDER_NETWORK_ERROR`로 일반화한다.
- 401·403은 `PROVIDER_AUTH_FAILED`, 429는 `PROVIDER_RATE_LIMITED`, 그 밖의 비정상 HTTP 상태는 `PROVIDER_UPSTREAM_ERROR`로 정규화한다.
- 응답이 JSON이 아니거나 예상 배열이 없으면 `PROVIDER_RESPONSE_INVALID`로 처리한다.
- 모델이 하나도 남지 않으면 연결 등록 또는 동기화를 성공 처리하지 않는다.
- upstream response 본문은 사용자 response와 일반 log에 포함하지 않는다.

## 7. 검증·인수 조건

- 전체 카탈로그 ID 중복과 잘못된 URL·지원 등급을 정적 시험에서 거부한다.
- 네 제공자의 인증 header와 모델 응답 fixture가 단위시험을 통과한다.
- API 키 암호화 round-trip과 잘못된 master key·변조 ciphertext 거부 시험이 통과한다.
- LLM Gateway의 인증 확인이 실패하면 공개 모델 목록을 조회하지 않고 등록을 중단한다.
- 관리자 session과 CSRF 없이는 Provider 등록·동기화·변경이 거부된다.
- 목록 API에는 ciphertext, nonce, tag, API 키 원문이 포함되지 않는다.
- Ubuntu HTTPS 관리자 화면에서 LLM Gateway·OpenAI 실제 키 등록, 모델 조회·동기화·활성 상태 변경과 비밀값 없는 감사 기록을 확인했다.
- 세 protocol fixture가 불완전 UTF-8·분할 SSE를 조립하고 공통 event로 정규화한다.

## 8. 미결정·보류 항목

- 원격 `providers.json` 자동 확인과 관리자 승인 workflow
- Vertex AI service account, AWS SigV4와 GitHub Copilot OAuth fixture
- 모델 목록이 없는 제공자의 수동 모델 ID 등록 범위
- 정기 모델 동기화 주기와 제거 모델 unavailable 전환 유예기간

## 9. 2026-07-23 Registry 계약 시험

- 전체 registry template이 중복 ID 없이 고정 HTTPS base URL, 인증 방식, OpenAI 호환 채팅 endpoint와 모델 조회 또는 고정 모델 목록을 가진다는 정적 시험을 추가했다.
- `bearer-optional`은 빈 키에서 Authorization header를 생략하는지 시험한다.
- 동적 모델 응답은 `data`, `models`, `result`와 최상위 배열을 허용하고 여러 공통 모델 ID 필드를 정규화한다.
- 고정 모델과 동적 모델이 함께 존재하면 ID 기준으로 합치며 중복을 제거한다.
- Cloudflare Account ID 치환 결과가 고정 Cloudflare origin을 벗어나지 않는지 시험한다.
