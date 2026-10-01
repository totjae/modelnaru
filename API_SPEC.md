# ModelNaru API 상세 명세

## N09 탐색·설정 계약 (2026-10-01 구현·격리 검증 완료)

- 대화 목록은 `{conversations,nextCursor}`다. query는 trim/NFC 정규화·최대 200자 제목 literal 부분 검색, pinned는 true/false 또는 생략, limit 기본 50·최대 100이다. 정렬은 pinned→updatedAt→UUID 내림차순 keyset이다. cursor는 version·owner/query/filter fingerprint·정렬 tuple을 base64url로 담고 형식/조건을 검증한다. cursor는 인증 자격증명이나 서명된 snapshot이 아니다. 소유권을 매 조회 다시 적용하며 변경된 행/새 행의 완전한 snapshot 일관성은 보장하지 않는다. 조건 변경·잘못된 cursor는 `400 CHAT_INPUT_INVALID`다.
- 대화 PATCH는 십진 문자열 settingsRevision(1~bigint 최대)을 필수로 받는다. 누락/추가 필드/변경 없음은 400이다. 소유권 행 잠금 후 CAS하며 stale은 `409 CHAT_SETTINGS_CONFLICT`의 error에 최신 conversation/settingsRevision을 포함한다. title·isPinned만 변경하는 경우 활성 생성 중에도 허용하고 나머지는 `409 CHAT_CONVERSATION_BUSY`다. branch 변경에도 같은 revision을 요구한다.
- 모델 선택은 create/PATCH에서 현재 권한·활성/가용 모델을 검사한다. 모델 변경 시 저장된 파라미터를 새 모델 policy와 대조하여 지원하지 않는 필드를 제거하고 `removedParameters` 배열을 반환한다. 같은 PATCH의 명시 파라미터는 새 policy를 엄격히 검증하며 오류는 `400 CHAT_PARAMETER_INVALID`다. 모델을 null로 지우면 이전 파라미터를 모두 지우고 명시 비어 있지 않은 파라미터는 거부한다. 권한 없는 모델은 `404 ACCESS_MODEL_FORBIDDEN`이며 자동 대체하지 않는다.
- `GET /api/access/models`는 query(최대 200자), provider(연결 표시 이름, 최대 100자), image/webSearch/favoriteOnly(true/false) 필터를 지원한다. 현재 허용 모델만 검색하고 각 항목에 isFavorite를 포함한다. `GET /api/model-favorites`는 `{favorites:[{providerModelId,selectable}]}`이며 권한 회수/비활성 모델도 소유자의 저장 ID만 반환하고 selectable=false다. PUT/DELETE `.../:modelId`는 204, PUT은 현재 허용 모델만 저장하고 중복은 멱등이다. DELETE는 권한 회수 뒤에도 자신의 항목을 지울 수 있다. 즐겨찾기는 권한을 부여하지 않는다.
- 모든 조회는 인증·no-store, mutation은 인증·CSRF를 요구한다. 첨부 조회/재처리는 FILE_PROCESSING_SPEC.md N09를 따른다. 원문·내부 경로·비밀값은 탐색/오류 응답에 추가하지 않는다.
- N09-R2 보완(2026-10-01 구현·실DB/HTTP 검증): PATCH 성공 응답과 CHAT_SETTINGS_CONFLICT의 최신 conversation은 같은 transaction에서 조회한 activeJob을 포함한다. pending/streaming 작업의 id/status/revision 등은 기존 activeJob 계약을 따르며 terminal이면 null이다. 이후 job 상태 변화는 GET/SSE로 갱신한다.

## N08 자동 제목 API 구현 (2026-10-01)

| 요청 | 성공 응답 | 조건 |
| --- | --- | --- |
| `GET /api/admin/title-generation` | `200 {providerModelId: UUID 또는 null, version: string}` | 관리자 session |
| `PUT /api/admin/title-generation` | 동일 형태의 `200`, version 증가 | 관리자 session + CSRF, body는 `{providerModelId: UUID 또는 null}`만 허용 |

`null`은 이후 첫 정상 답변의 자동 제목을 끈다. 모델 지정은 활성·가용 model/connection을 요구하며 원문을 전송하지 않고 설정만 저장한다. 모든 응답은 `Cache-Control: no-store`다. 오류는 입력 형식/추가 필드 `400 TITLE_INPUT_INVALID`, 비가용 모델 `409 TITLE_MODEL_UNAVAILABLE`, 일반 사용자/게스트 `403 AUTH_ADMIN_REQUIRED`, 기존 인증·CSRF 오류다. 감사 기록에는 모델 ID·version만 저장하고 제목·대화·credential은 넣지 않는다.

대화 생성/목록/상세/수정/branch 응답은 `titleSource: default|auto|manual`, `titleStatus: none|pending|completed|failed`를 반환한다. 생성 시 title 생략은 default이고 명시적 title은 manual이다. 수동 title PATCH는 pending 제목 task를 취소한다. 클라이언트는 titleSource/titleStatus를 쓰기 입력으로 지정할 수 없다. 자동 제목 정책은 `CHAT_STATE_SPEC.md` N01/N08을 따른다. 관리자 화면은 N11에서 연결한다.

## N02 관리자 커스텀 Provider 계약 (2026-09-30 확정, N07 API 구현)

모든 경로는 관리자 session을 요구하고 mutation은 CSRF를 요구한다. 일반 사용자·게스트는 URL·key·목적지 승인에 접근할 수 없다. `Cache-Control: no-store`이며 응답/감사 기록에 API key, 내부 주소의 전체 값, upstream 오류 본문을 포함하지 않는다. 입력과 검증의 원장은 PROVIDER_REGISTRATION_SPEC.md·SECURITY_SPEC.md N02 절이다.

| 요청 | 성공 | body·규칙 |
| --- | --- | --- |
| `POST /api/admin/provider-connections/custom` | `201 Created` | `{name, baseUrl, authMode, apiKey?, destinationKind, approvedLocalIp?, approvedLocalPort?}`. key 없는 `none`과 bearer key 필수 조건을 검사한다. 저장만으로 remote 호출하지 않는다 |
| `PATCH /api/admin/provider-connections/:id` | `200 OK` | 기존 이름/활성 변경에 custom의 `baseUrl/authMode/apiKey/destinationKind/approvedLocalIp/approvedLocalPort` 변경을 허용. 활성 chat job이 해당 연결을 사용 중이면 주소·인증 변경은 `409 PROVIDER_IN_USE`로 거부한다. 성공한 목적지 변경은 진단 상태를 지우고 새 요청 전 다시 검증한다 |
| `POST /api/admin/provider-connections/:id/models/sync` | `200 OK` | 기존 경로를 사용. custom은 `{data:[{id,...}]}` 또는 문서화된 호환 모델 응답만 정규화. 실패해도 기존 수동/저장 모델을 삭제하지 않는다 |
| `POST /api/admin/provider-connections/:id/models/manual` | `201 Created` | `{modelId, displayName?, contextWindow?, maxOutputTokens?}`. 연결 내 modelId unique, 기본 비활성·text-only |
| `POST /api/admin/provider-connections/:id/test` | `200 OK` | `{stage:"network"|"models"|"chat", providerModelId?}`. chat은 명시적 선택 모델과 고정된 짧은 시험 입력을 1회 전송하며 비용 가능성 안내 후 호출 |
| `PATCH /api/admin/provider-models/:id` | `200 OK` | 기존 capability에 `imageTokenEstimate` nullable positive integer 추가. image true인데 estimate 없으면 이미지 실행은 거부 |

연결 목록에는 `kind`, `protocol`, `name`, host를 마스킹한 `baseUrlDisplay`, `authMode`, `destinationKind`, `approvedLocalIpDisplay`, `diagnostics` 단계별 결과·시각·안전 code를 반환한다. key 원문/ciphertext/nonce/tag, 내부 IP 전체, URL query는 반환하지 않는다. 수동 모델은 `source:"manual"`로 표시하고 자동 조회 실패와 구분한다. `test`의 network 성공은 models/chat 성공을 의미하지 않으며 `chat`은 완전한 정상 종료를 확인해야 성공이다.

오류: `400 PROVIDER_INPUT_INVALID`(URL/필드/모델 형식), `403 AUTH_ADMIN_REQUIRED` 또는 CSRF 오류, `404 PROVIDER_NOT_FOUND`, `409 PROVIDER_CONNECTION_CONFLICT`/`PROVIDER_IN_USE`, `422 PROVIDER_DESTINATION_DENIED`(차단 주소/승인 불일치/redirect), `422 PROVIDER_AUTH_FAILED`, `422 PROVIDER_RESPONSE_INVALID`, `429 PROVIDER_RATE_LIMITED`, `502 PROVIDER_NETWORK_ERROR`/`PROVIDER_UPSTREAM_ERROR`. DNS/실접속 불일치는 `PROVIDER_DESTINATION_DENIED`이며 외부 사용자에게 주소 세부를 노출하지 않는다. 이 경로들은 N07에서 구현했으며 실제 배포 경로는 N13에서 확인한다.

## N01 새 버전 채팅 계약 (2026-09-30 확정, N06 job 경로 구현)

이 절의 job 시작·GET·SSE·중지 경로와 `activeJob`/`jobId`는 N06에서 구현했다. 아래 현행 `POST /api/conversations/:id/messages` 및 `.../regenerate` 동기 SSE와 기존 quota/모델 자동 대체 설명은 N10 UI 전환 전 기존 화면 호환 기록으로 적용한다. N09 설정 PATCH·탐색 계약은 구현·검증했고 새 UI는 N10에서 연결한다. 공통 인증: 모든 경로는 유효한 user/guest session과 대화 소유권을 요구하고, POST/PATCH/DELETE에는 기존 CSRF guard를 적용한다. 모든 응답은 `Cache-Control: no-store`; 타인 소유·없는 대화/job은 모두 `404 CHAT_NOT_FOUND`다. `Idempotency-Key`는 UUID v4 문자열이며 새 시작에 필수다. 주체·상태 정책은 CHAT_STATE_SPEC.md N01 절이 원장이다.

| 요청 | 성공 | 의미 |
| --- | --- | --- |
| `POST /api/conversations/:id/jobs` | `202 Accepted` 또는 동일 key 재조회 `200 OK` | 새 질문 시작. body는 `{content, attachmentIds, providerModelId, parameters, settingsRevision}`. 기존 message 입력 범위와 모델 policy를 적용한다 |
| `POST /api/conversations/:id/messages/:messageId/regeneration-jobs` | `202` 또는 동일 key `200` | 활성 경로의 마지막 assistant 답변 재생성. body는 `{providerModelId, parameters, settingsRevision}`. 성공할 때만 새 branch 활성화 |
| `GET /api/conversations/:id/jobs/:jobId` | `200 OK` | 저장된 작업 snapshot. 생성 실행이나 quota에 영향 없음. terminal 7일 보존 뒤에는 `404` |
| `GET /api/conversations/:id/jobs/:jobId/events` | `200 text/event-stream` | listener 등록 후 본문 없는 snapshot 메타데이터, 이후 commit된 revision 변경과 heartbeat 전송. `Last-Event-ID`는 무시하고 항상 snapshot부터 시작 |
| `POST /api/conversations/:id/jobs/:jobId/cancel` | `204 No Content` | 명시적 중지. terminal이면 `409 CHAT_NOT_CANCELLABLE` |

시작은 응답 수신 전에 commit된 job만 반환한다. 같은 주체+key+정규화 입력은 이미 존재하는 job을 반환하며, 다른 입력은 `409 CHAT_IDEMPOTENCY_CONFLICT`다. 응답을 받지 못한 클라이언트는 같은 key와 body를 재전송하거나 이미 확인한 job ID로 `GET`한다. `settingsRevision`은 숫자가 아닌 십진 문자열이다. 생성 중 설정·분기 변경이나 같은 대화 시작은 `409 CHAT_CONVERSATION_BUSY`; 다른 대화의 주체 활성 작업은 `409 CHAT_PRINCIPAL_BUSY`; 전역 슬롯 부족은 `503 CHAT_SERVER_BUSY`와 `Retry-After: 1`이다. 슬롯 부족·입력 거부는 job·메시지·quota를 생성하지 않는다. quota 초과는 기존 `429 ACCESS_DAILY_LIMIT_REACHED`에 `scope`, `resetAt`을 포함한다.

시작 응답 예시 (`turn`; 재생성은 `kind: "regenerate"`, `userMessageId: null`):

```json
{
  "job": {
    "id": "10000000-0000-4000-8000-000000000001",
    "kind": "turn",
    "status": "pending",
    "revision": "1",
    "conversationId": "20000000-0000-4000-8000-000000000001",
    "branchId": "30000000-0000-4000-8000-000000000001",
    "userMessageId": "40000000-0000-4000-8000-000000000001",
    "assistantMessageId": "50000000-0000-4000-8000-000000000001",
    "content": "",
    "errorCode": null,
    "inputTokens": null,
    "outputTokens": null,
    "startedAt": "2026-09-30T00:00:00.000Z",
    "finishedAt": null
  }
}
```

`GET .../jobs/:jobId`의 `job.content`는 마지막 DB checkpoint만 포함하고 미저장 token은 포함하지 않는다. 최종 조회에는 terminal transaction에서 기록된 마지막 본문도 포함한다. `revision`은 단조 증가 십진 문자열이다. 대화 상세의 `activeJob`은 `pending|streaming` 작업이 있으면 `{id,kind,status,revision,branchId,userMessageId,assistantMessageId}`이고 없으면 `null`이다. 목록 각 대화에도 같은 `activeJob` 요약을 반환한다. 조회 시 대화 소유권을 확인한 뒤 DB의 활성 job을 join하므로 새로고침·다른 기기의 유효 session에서도 job ID를 찾을 수 있다. 대화 상세·메시지 페이지·branch 직접 답변의 assistant message에는 nullable `jobId`를 포함한다. `chat_jobs.assistant_message_id`의 unique 관계에서 계산하며 N01 이전 메시지 또는 terminal job 7일 정리 뒤에는 `null`이다. user message의 `jobId`는 `null`이다. 활성 작업은 `activeJob.assistantMessageId`와 message `jobId`로 연결되며 해당 message가 최근 50개 밖에 있더라도 `activeJob`은 유지한다. GET/구독은 현재 session·대화 소유권을 재검증하며 시작 session이 무효화되면 CHAT_STATE_SPEC.md N01에 따라 작업을 종료한다.

SSE의 첫 `event: snapshot`은 `{ "jobId": "...", "revision": "1", "status": "streaming", "contentBytes": 0 }`처럼 메타데이터만 보내고 본문을 중복 전송하지 않는다. SSE `id`는 revision이다. 클라이언트는 구독을 열어 첫 snapshot을 받은 뒤 `GET .../jobs/:jobId`로 해당 작업의 설정된 `maximumGeneratedTextBytes`까지 본문을 가져온다. 서버는 listener를 먼저 등록하고 DB revision `r`을 읽어 snapshot을 전송한다. 등록 뒤 대기한 commit 중 `revision <= r`은 중복이므로 버리고 `> r`만 순서대로 전달한다. 클라이언트는 GET이 끝날 때까지 직렬화된 SSE frame byte 합계 256 KiB 이하로 변경을 보관하고, GET revision 이하를 버린 뒤 정확히 1 증가하는 event만 적용한다. 틈·서버 또는 클라이언트 buffer 초과 시 연결을 닫고 같은 job을 GET/재구독한다. GET이 이미 terminal이면 SSE 재연결 없이 완료한다. `Last-Event-ID`로 history를 재생하지 않는다.

일반 본문 checkpoint는 `event: append`와 `{ "revision": "2", "text": "추가 본문" }`, 본문 없는 비종료 상태 변경은 `event: state`와 `{ "revision": "3", "status": "streaming" }`다. terminal commit은 남은 본문·상태·errorCode·usage·finishedAt을 **하나의 DB transaction**에서 revision 1회 증가와 함께 저장한다. 이를 `event: terminal` 한 건의 `{ "revision": "4", "text": "마지막 본문", "status": "completed", "errorCode": null, "inputTokens": 10, "outputTokens": 20, "finishedAt": "..." }`로 보낸다. terminal event의 `text`는 빈 문자열일 수 있다. 앞서 commit된 checkpoint는 독립적이지만 terminal을 위해 마지막 본문만 별도 선행 commit하지 않는다. 취소와 완료는 terminal UPDATE 선착순 한 건만 성공하고 패자는 추가 event를 내지 않는다. `event: heartbeat`는 data 없이 15초마다 보내며 revision을 올리지 않는다. terminal event 또는 terminal GET을 처리하면 구독을 닫는다. 구독은 재호출·재차감하지 않는다.

`GET` job 응답의 `job.content`는 생성 때 적용한 `limits.maximumGeneratedTextBytes`와 같은 UTF-8 byte 상한(기본 2 MiB, 최대 8 MiB)을 따른다. JSON escaping의 최악 사례를 포함하도록 HTTP 응답 body 상한은 `6 × 해당 작업의 maximumGeneratedTextBytes + 1 MiB`다. GET은 SSE 구독 pending buffer에 넣지 않고 HTTP backpressure로 직접 전송한다. SSE 초기 snapshot은 본문 없는 작은 frame이다. `append`와 `terminal`은 **UTF-8 직렬화된 완성 frame**(`id`·`event`·`data`·JSON escape·줄바꿈 포함)이 AI_INTEGRATION_SPEC.md N02의 frame 상한 이내가 되도록 Unicode scalar 경계에서 본문을 나눈다. 설정 최솟값 64 KiB에서도 frame 상한 32 KiB를 지킨다. 각 일반 checkpoint는 revision 하나와 frame 하나로 대응하고 terminal은 남은 작은 본문과 상태를 한 transaction/revision/frame으로 보낸다. 생성·checkpoint·message·GET 복원의 본문 byte 상한은 동일하며, 서버 256 KiB 기본 pending/클라이언트 256 KiB buffer는 실제 frame byte를 합산한다.

추가 오류: `400 CHAT_INPUT_INVALID`(key/body/revision 형식), `401 AUTH_SESSION_REQUIRED`, `403 AUTH_CSRF_INVALID`, `404 CHAT_NOT_FOUND`, `409 CHAT_SETTINGS_CONFLICT`(현재 `conversation`과 `settingsRevision` 포함), `409 CHAT_REGENERATION_INVALID`, `409 CHAT_NOT_CANCELLABLE`, `429 ACCESS_DAILY_LIMIT_REACHED`, `503 CHAT_SERVER_BUSY`. 실행 중 Provider/요약/권한/재시작 오류는 job `failed`와 안전한 `errorCode`로 저장하며, 이미 성공한 시작 HTTP 상태를 바꾸지 않는다. upstream 본문·내부 URL·자격증명은 JSON/SSE에 포함하지 않는다.

`PATCH /api/conversations/:id`는 새 버전에서 `{settingsRevision, ...changes}`를 필수로 받는다. 모델 즉시 저장과 고급 설정 적용 모두 조건부 갱신 후 새 `settingsRevision`을 반환한다. `title`은 수동 변경으로 기록한다. 활성 job 중 모델·파라미터·system prompt·context·branch 변경은 서버에서 거부한다. 제목 검색·고정 목록은 `GET /api/conversations?query=...&pinned=...&cursor=...&limit=...`이며 기본 50·최대 100, 정렬은 고정 내림차순→`updatedAt` 내림차순→UUID 내림차순이다. cursor는 서버가 owner/query/filter/정렬 tuple을 검증하는 불투명 문자열이며 조건이 바뀌면 재사용할 수 없다. 모델 즐겨찾기는 `GET /api/model-favorites`, `PUT /api/model-favorites/:modelId`, `DELETE /api/model-favorites/:modelId`; 유효 모델·주체 소유권을 검사하며 즐겨찾기 자체는 모델 권한을 부여하지 않는다. 세부 탐색 구현은 N09다.

자동 제목 설정은 관리자만 `GET/PUT /api/admin/title-generation`으로 조회·저장한다. PUT body는 `{ "providerModelId": "uuid-or-null" }`이며 null은 비활성화다. CSRF가 필요하고 모델은 활성·가용 상태여야 한다. 사용자/게스트는 이 경로에서 `403`이다. 대화 응답에는 `title`, `titleSource: "default" | "auto" | "manual"`, `titleStatus: "none" | "pending" | "completed" | "failed"`가 포함된다. 제목 입력/실패·수동 우선 조건은 CHAT_STATE_SPEC.md N01 절을 따른다.

검증: N06에서 동일 key 동시 시작 1회·상이 입력 충돌, 새 session의 `activeJob` 발견과 message `jobId`, terminal/취소 경합, snapshot revision, 설정 최대 8 MiB의 checkpoint→message→GET 본문 일치, JSON escape frame 32 KiB 상한·느린 구독자, 소유권·session 폐기·stale 설정·quota/slot 거부를 격리 PostgreSQL+mock Provider 및 단위 시험으로 확인했다(`TEST_PLAN.md` 최신 N06 절). 기본 2 MiB와 설정 8 MiB의 실제 Provider 대용 전체 출력 스트림을 HTTP부터 GET까지 통과시키는 대용량 통합 시험, 브라우저 CSRF·재접속 사용성은 N10/N13 인수에서 추가한다.

## 새 버전 예정 계약: 생성 작업·즐겨찾기 (2026-09-30, 미구현)

- 생성 시작과 이벤트 구독을 분리하고 작업 ID·현재 상태·부분 본문 snapshot·revision으로 재접속을 지원한다. 주체별 idempotency key로 시작 중복을 차단한다.
- 작업 조회·구독·중지는 session·소유권·현재 권한을 검증하고 mutation에 CSRF를 적용한다. 구독 해제는 취소 요청이 아니다.
- 모델 즐겨찾기와 대화 제목 검색·고정 계약을 추가한다. 즐겨찾기는 주체별이며 모델 권한을 부여하지 않는다.
- 상세 정책은 CHAT_STATE_SPEC.md의 새 버전 절을 따른다. URL·필드·오류 코드·cursor 형식은 구현 전 확정하며 기존 endpoint를 이미 변경한 것으로 보지 않는다.

## 새 버전 예정 변경: 커스텀 Provider (2026-09-30)

- 관리자 등록·수정·연결 시험에 커스텀 기본 URL, 프로토콜, 키/무인증, 모델 수동 등록과 로컬 목적지 승인 계약이 필요하다.
- 동작 기준은 PROVIDER_REGISTRATION_SPEC.md의 새 버전 절을 따른다. endpoint·필드·오류 코드는 미확정·미구현이며 사용자·게스트에게 주소·자격증명 변경 권한을 제공하지 않는다.

## 새 버전 예정 변경: 설정 저장·자동 제목 (2026-09-30)

- 현재 endpoint 계약과 별개인 계획이다. 동작 기준은 [채팅 상태 명세](./CHAT_STATE_SPEC.md)의 새 버전 절을 따른다.
- 모델 즉시 저장과 고급 설정 적용을 분리하고, 자동 제목 설정·제목 상태 노출·목록 갱신 방식의 계약을 구현 전에 확정한다.
- 자동 결과 저장 시 수동 제목 변경과 삭제를 원자적으로 확인해야 한다. 새 endpoint·필드·오류 코드는 아직 확정하거나 구현하지 않았다.
- 제목 생성 모델 설정 변경은 관리자 인증·CSRF 검증을 요구하고 사용자·게스트의 변경을 거부한다. 전역 설정 계약은 구현 전에 확정한다.

## 1. 목적

현재 구현된 HTTP API 계약과 이후 API가 따라야 할 공통 규칙을 기록한다.

## 2. 적용 범위

현재 health endpoint, 고정 관리자·일반 사용자·게스트 인증, 관리자 전용 사용자·Provider·모델 접근 관리 API와 기본 대화 CRUD API를 포함한다.

## 3. 공통 규칙

- 외부 기준 prefix는 `/api`이다.
- response의 `Content-Type`은 JSON endpoint에서 `application/json`이다.
- 내부 예외의 stack, 경로, secret과 환경 변수 값은 response에 포함하지 않는다.
- 날짜가 추가될 때는 UTC ISO 8601 문자열을 사용한다.
- 인증 성공 시 `modelnaru_session` HttpOnly cookie와 `modelnaru_csrf` cookie를 설정한다.
- 상태 변경 인증 API는 `X-CSRF-Token` header가 CSRF cookie 및 server-side hash와 모두 일치해야 한다.
- 로그인 실패는 계정 존재 여부, 비밀번호와 TOTP 중 어느 값이 틀렸는지 구분하지 않는다.
- 인증 endpoint response에는 `Cache-Control: no-store`를 설정한다.

## 4. Health API

### `GET /api/health/live`

프로세스가 HTTP 요청을 처리할 수 있는지 확인한다.

정상 response: `200 OK`

```json
{
  "status": "ok",
  "service": "modelnaru-api"
}
```

### `GET /api/health/ready`

시작 설정을 정상적으로 읽고 PostgreSQL에 query할 수 있는지 확인한다.

정상 response: `200 OK`

```json
{
  "status": "ready",
  "checks": {
    "config": "ok",
    "database": "ok"
  }
}
```

설정이 유효하지 않거나 최초 DB 연결에 실패하면 API process가 시작되지 않는다. 실행 중 DB 검사가 실패하면 `503 Service Unavailable`과 다음 비민감 response를 반환한다.

```json
{
  "status": "unavailable",
  "checks": {
    "config": "ok",
    "database": "error"
  }
}
```

## 5. 공통 인증 API

### `POST /api/auth/login`

고정 관리자는 ID·비밀번호·6자리 TOTP code를, 일반 사용자는 관리자가 등록한 ID·비밀번호를 검증한다. 관리자 ID는 일반 사용자 ID와 충돌할 수 없으므로 정규화한 username으로 역할을 결정한다. 이미 로그인한 상태에서도 새 session을 만들 수 있으며, 활성 session이 설정된 최대 개수를 넘으면 `last_seen_at`이 가장 오래된 session부터 폐기한다.

Request:

```json
{
  "username": "admin",
  "password": "user-entered-password",
  "totp": "123456"
}
```

일반 사용자는 `totp` 필드를 보내지 않는다.

```json
{
  "username": "user1",
  "password": "user-entered-password"
}
```

성공: `200 OK`

```json
{
  "principal": {
    "type": "admin",
    "username": "admin"
  },
  "session": {
    "idleExpiresAt": "2026-07-23T00:00:00.000Z",
    "absoluteExpiresAt": "2026-07-29T00:00:00.000Z"
  }
}
```

일반 사용자 principal은 다음 형식이다. `displayName`은 설정되지 않았으면 `null`이다.

```json
{
  "principal": {
    "type": "user",
    "id": "10000000-0000-4000-8000-000000000001",
    "username": "user1",
    "displayName": "사용자 1"
  },
  "session": {
    "idleExpiresAt": "2026-07-23T00:00:00.000Z",
    "absoluteExpiresAt": "2026-07-29T00:00:00.000Z"
  }
}
```

오류:

- `400 AUTH_INPUT_INVALID`: body 형식 오류
- `401 AUTH_INVALID_CREDENTIALS`: ID·비밀번호 또는 관리자 TOTP 검증 실패, 비활성 사용자도 같은 오류
- `429 AUTH_RATE_LIMITED`: 반복 실패 제한, `Retry-After` header 포함

### `GET /api/auth/session`

session cookie를 검증하고 현재 principal과 만료 시각을 반환한다. 일반 사용자는 현재 DB의 활성 상태와 credential version도 검증한다. 유효한 요청은 idle 만료 시각을 갱신한다.

- 성공: `200 OK`, login과 같은 principal·session 구조
- `401 AUTH_SESSION_REQUIRED`: cookie 없음, 만료, 폐기 또는 관리자 설정 변경

### `POST /api/auth/logout`

현재 session을 폐기하고 두 인증 cookie를 제거한다.

- 성공: `204 No Content`
- `401 AUTH_SESSION_REQUIRED`: 유효한 session 없음
- `403 AUTH_CSRF_INVALID`: CSRF header·cookie·server hash 불일치

## 6. 관리자 사용자 관리 API

모든 endpoint는 유효한 고정 관리자 session을 요구한다. `POST`·`PATCH`·`PUT`·`DELETE`는 CSRF 검증도 요구한다. 사용자 객체는 `id`, `username`, `displayName`, `isEnabled`, `credentialVersion`, `createdAt`, `updatedAt`을 반환하며 password hash는 반환하지 않는다.

### `GET /api/admin/users`

일반 사용자 목록을 username 오름차순으로 반환한다. 예상 규모가 1~3명이므로 첫 구현은 pagination 없이 반환하며 대규모 운영 전 cursor pagination을 추가한다.

### `POST /api/admin/users`

Request:

```json
{
  "username": "user1",
  "displayName": "사용자 1",
  "password": "administrator-entered-password",
  "isEnabled": true
}
```

- 성공: `201 Created`
- 사용자명은 3~64자 영문·숫자·점·밑줄·하이픈이며 대소문자를 무시해 unique다.
- 비밀번호는 8~1,024자이며 Argon2id hash만 저장한다.
- 고정 관리자 ID와 대소문자만 다른 사용자 ID도 거부한다.

### `PATCH /api/admin/users/:id`

`username`, `displayName`, `isEnabled` 중 하나 이상을 수정한다. 사용자명 변경 또는 비활성화 시 기존 사용자 session을 모두 폐기한다.

### `PUT /api/admin/users/:id/password`

`{ "password": string }`으로 새 비밀번호를 설정한다. `credential_version`을 증가시키고 기존 session을 모두 폐기한다.

### `DELETE /api/admin/users/:id`

사용자와 FK로 연결된 session을 hard delete한다. 성공은 `204 No Content`다. 대화·첨부가 도입되면 같은 삭제 workflow에서 원본 파일까지 제거한다.

공통 오류:

- `400 USER_INPUT_INVALID`: body 또는 UUID 형식 오류
- `401 AUTH_SESSION_REQUIRED`: 관리자 session 없음
- `403 AUTH_CSRF_INVALID`: CSRF 검증 실패
- `403 AUTH_ADMIN_REQUIRED`: 일반 사용자 session으로 관리자 API 요청
- `404 USER_NOT_FOUND`: 대상 사용자 없음
- `409 USERNAME_CONFLICT`: 관리자 또는 기존 사용자와 ID 충돌

## 7. 관리자 Provider 관리 API

모든 endpoint는 관리자 session을 요구하고 상태 변경 요청은 CSRF를 검증한다. Provider 목록 response에는 API 키, ciphertext, nonce, 인증 tag가 포함되지 않는다.

### `GET /api/admin/provider-templates`

`provider-manager-v1.10.0.js`를 기준으로 보존한 전체 카탈로그를 반환한다. 각 항목의 `canRegister`로 현재 등록 지원 여부를 표시한다. OpenAI, Anthropic, Google AI Studio, Vertex AI를 상단에 고정하고 나머지는 표시 이름 알파벳순이다. 첫 구현에서 `llm-gateway`, `openai`, `anthropic`, `google`만 true다.

### `GET /api/admin/provider-connections`

등록된 연결과 모델 목록을 반환한다. 자격증명은 마지막 네 글자 hint만 조건부로 반환한다.

### `POST /api/admin/provider-connections`

```json
{
  "templateId": "llm-gateway",
  "name": "Main Gateway",
  "apiKey": "administrator-entered-api-key"
}
```

서버는 고정 HTTPS endpoint에서 자격증명을 시험하고 모델 목록을 조회한 뒤 AES-256-GCM으로 암호화해 연결과 모델을 같은 transaction에 저장한다. LLM Gateway는 인증이 필요한 `GET /v1/key`로 키를 먼저 검증하고 공개 모델 목록은 별도로 조회한다. 신규 모델은 관리자가 선택할 때까지 기본 비활성화한다.

### `PATCH /api/admin/provider-connections/:id`

`name`, `isEnabled` 중 하나 이상을 변경한다. 이름은 대소문자를 무시해 unique다.

### `DELETE /api/admin/provider-connections/:id`

기존 메시지 snapshot과 향후 log 참조를 보존하기 위해 물리 삭제하지 않고 연결을 비활성화한다. 성공은 `204 No Content`다.

### `POST /api/admin/provider-connections/:id/models/sync`

암호화 자격증명을 서버에서 복호화해 모델 목록을 다시 조회한다. 기존 모델의 활성 설정은 유지하고 더 이상 조회되지 않는 모델은 `isAvailable: false`로 보존한다.

### `PATCH /api/admin/provider-models/:id`

`{ "isEnabled": boolean }`로 사용 가능한 모델의 전체 활성 상태를 변경한다.

공통 오류:

- `400 PROVIDER_INPUT_INVALID`: body 또는 UUID 형식 오류
- `404 PROVIDER_NOT_FOUND`: 연결 또는 모델 없음
- `409 PROVIDER_CONNECTION_CONFLICT`: 연결 이름 충돌
- `422 PROVIDER_TEMPLATE_UNAVAILABLE`: 아직 등록 불가능한 카탈로그 항목
- `422 PROVIDER_AUTH_FAILED`: upstream 자격증명 거부
- `422 PROVIDER_RESPONSE_INVALID`: 모델 목록 형식 오류 또는 빈 목록
- `429 PROVIDER_RATE_LIMITED`: upstream 모델 조회 제한
- `502 PROVIDER_NETWORK_ERROR`: DNS·TLS·timeout·연결 실패
- `502 PROVIDER_UPSTREAM_ERROR`: 그 밖의 upstream HTTP 오류

## 8. 게스트·모델 권한 API

상세 정책은 [GUEST_ACCESS_SPEC.md](./GUEST_ACCESS_SPEC.md)에서 관리한다. 현재 구현 endpoint는 다음과 같다.

- `GET /api/auth/guest/status`: 인증 없이 게스트 활성 여부만 반환
- `POST /api/auth/guest/session`: `{ "accessCode": string }`을 검증하고 독립 게스트 session cookie와 CSRF cookie 발급
- `GET /api/admin/access`: 사용자·게스트 모델 권한, 제한, 게스트 설정과 활성 session 수 조회
- `PUT /api/admin/access/users/:id`: 사용자 계정 전체 제한과 모델 allowlist·모델별 제한 교체
- `PUT /api/admin/access/guest`: 게스트 코드·수명·용량·전체/세션 제한·모델 allowlist를 교체하고 기존 게스트 session 전체 종료
- `GET /api/access/models`: 현재 일반 사용자 또는 게스트에게 허용된 활성 모델과 모델별 `parameterPolicy` 조회

관리자 변경 API는 관리자 session과 CSRF를 요구한다. 제한 예약 로직은 `ACCESS_DAILY_LIMIT_REACHED`(`429`)와 적용 범위 `scope`를 반환하며 실제 AI 요청 endpoint가 추가될 때 upstream 호출 직전에 연결한다.

게스트 status API는 활성 여부 외 내부 제한과 코드 정보를 노출하지 않는다. 게스트 참가 오류는 `GUEST_DISABLED`(`403`), `GUEST_AUTH_FAILED`(`401`), `GUEST_RATE_LIMITED`(`429`), `GUEST_CAPACITY_REACHED`(`429`)를 사용한다.

## 9. 대화 API

모든 endpoint는 유효한 일반 사용자 또는 게스트 session을 요구하며 mutation은 CSRF 검증도 요구한다. 고정 관리자는 채팅 workspace를 갖지 않는다. 다른 주체 소유 대화와 존재하지 않는 대화는 동일한 `CHAT_NOT_FOUND` 오류를 사용한다.

### `GET /api/conversations`

현재 주체의 대화를 `updatedAt` 내림차순으로 반환한다.

```json
{
  "conversations": [
    {
      "id": "10000000-0000-4000-8000-000000000001",
      "title": "새 대화",
      "systemPrompt": "",
      "historyMessageLimit": 0,
      "contextTokenLimit": 100000,
      "requestTraceLimit": 3,
      "responseTimeoutSeconds": 120,
      "defaultProviderModelId": "30000000-0000-4000-8000-000000000001",
      "generationParameters": {
        "temperature": 1,
        "topP": 0.9
      },
      "activeBranchId": "20000000-0000-4000-8000-000000000001",
      "messageCount": 0,
      "createdAt": "2026-07-22T00:00:00.000Z",
      "updatedAt": "2026-07-22T00:00:00.000Z"
    }
  ]
}
```

### `POST /api/conversations`

대화와 root 분기를 한 transaction에서 생성한다. 모든 필드는 선택 사항이다.

```json
{
  "title": "새 대화",
  "systemPrompt": "",
  "historyMessageLimit": 0,
  "contextTokenLimit": 100000,
  "requestTraceLimit": 3,
  "responseTimeoutSeconds": 120,
  "defaultProviderModelId": "30000000-0000-4000-8000-000000000001",
  "generationParameters": {
    "temperature": 1
  }
}
```

- `title`: 공백 제거 후 1~200자, 기본 `새 대화`
- `systemPrompt`: 최대 100,000자, 기본 빈 문자열
- `historyMessageLimit`: 0~10,000, `0`은 무제한
- `contextTokenLimit`: 1,000~2,000,000, 기본 100,000
- `requestTraceLimit`: 0~3, 현재 session의 최근 Provider 전송 기록 수, 기본 3
- `responseTimeoutSeconds`: 1~1,800초, Provider의 첫 응답 또는 다음 streaming chunk를 기다리는 최대 유휴 시간, 기본 120초
- `defaultProviderModelId`: nullable Provider 모델 UUID, 기본 `null`
- `generationParameters`: Provider parameter policy로 검증할 JSON object, 기본 `{ "temperature": 1 }`
- 성공: `201 Created`, 생성한 대화 객체

### `GET /api/conversations/:id`

대화 객체에 `branches`를 추가해 반환한다. 각 branch는 `id`, `parentBranchId`, `forkedFromMessageId`, `createdAt`, `isSelectable`, `messages`를 포함한다. 자식 branch의 `messages`는 부모 경로에서 분기 대상 assistant 직전까지의 메시지와 자식 branch에 저장된 메시지를 합성한 결과다.

각 message는 저장된 분기를 식별하는 `branchId`, 표시·감사용 `providerTemplateIdSnapshot`, `modelIdSnapshot`과 함께 실제 호출 모델인 `providerModelId`를 포함한다. user message의 `attachments`에는 `id`, `originalName`, `mediaType`, `fileKind`, `pageCount`, `imageWidth`, `imageHeight`, `byteSize`, `includeInFutureMessages`, `expiresAt` metadata가 포함되며 추출 본문·원본 base64와 storage key는 반환하지 않는다. `pageCount`는 PDF에서만 숫자이고 이미지 크기는 이미지에서만 숫자다. 대화 객체의 `defaultProviderModelId`, `generationParameters`, `responseTimeoutSeconds`는 설정 모달의 대화방별 기본값이다. 상세 조회의 `messages`는 활성 분기 경로의 최근 50개이며 `messagePage.hasMore`와 `messagePage.nextBeforeSequence`로 이전 page 존재 여부를 알린다. `branches[].messages`에는 가장 최근 질문에 대한 해당 분기의 직접 답변만 포함한다.

### `GET /api/conversations/:id/messages`

현재 주체가 소유한 대화의 활성 분기 경로에서 이전 메시지를 조회한다.
`beforeSequence`는 이전 응답의 `nextBeforeSequence`이며 1 이상의 정수다.
`limit`은 1~100, 기본값은 50이다. 응답은 `messages`와
`messagePage.hasMore`, `messagePage.nextBeforeSequence`를 반환한다. 활성
분기가 바뀌면 기존 cursor를 재사용하지 않고 상세 조회부터 다시 시작한다.

### `PATCH /api/conversations/:id`

생성 API의 설정 중 하나 이상을 같은 범위로 수정한다. `defaultProviderModelId`는 `null`로 초기화할 수 있다. `generationParameters`는 빈 object도 허용하며 선언된 key·자료형·공통 범위를 검증한다. `responseTimeoutSeconds`는 Provider 요청 body에 포함하지 않고 서버의 응답 유휴 타이머에 적용한다. 성공은 수정된 대화 객체다.

저장된 모델이 삭제·비활성화되거나 현재 주체의 권한에서 제외되면 Web은 활성 분기의 마지막 허용 모델, 그 다음 첫 허용 모델 순서로 대체한다. 저장된 설정 자체가 호출 권한을 부여하지 않으며 메시지 전송 시 서버가 모델 권한과 Provider별 parameter policy를 다시 검증한다.

### `DELETE /api/conversations/:id`

대화·분기·메시지를 hard delete한다. 성공은 `204 No Content`다. 사용자 또는 게스트 주체 삭제 시에도 FK cascade로 같은 데이터가 삭제된다.

### `POST /api/conversations/:id/messages`

CSRF 검증 후 사용자 메시지와 pending assistant 메시지를 저장하고 `text/event-stream`으로 응답한다.

```json
{
  "content": "안녕하세요",
  "attachmentIds": ["40000000-0000-4000-8000-000000000001"],
  "providerModelId": "30000000-0000-4000-8000-000000000001",
  "parameters": {
    "temperature": 0.7,
    "topP": 0.9,
    "maxOutputTokens": 4096
  }
}
```

- `content`: 공백 제거 후 0~200,000자. 빈 문자열은 attachment가 하나 이상일 때만 허용
- `attachmentIds`: 선택, 중복 없는 pending attachment UUID 최대 10개
- `providerModelId`: 현재 주체에게 허용된 활성 모델 UUID
- `temperature`: 선택, 0~2
- `topP`: 선택, 0~1
- `maxOutputTokens`: 선택, 1~131,072
- 선언되지 않은 parameter key는 거부한다.
- 모델 권한과 대화 소유권을 확인하고 컨텍스트 한도를 검사한 뒤 upstream 직전에 일일 호출량을 예약한다.
- 저장된 모델의 context window와 최대 출력 token 정보가 있으면 사용자 설정값보다 우선하는 상한으로 적용한다.
- 컨텍스트 계산은 tokenizer 연결 전까지 Unicode 문자당 최대 1 token으로 보수적으로 추정한다. 한도 초과 시 관리자가 지정한 모델로 오래된 구간을 요약한 뒤 다시 검사한다.
- 요약 요청은 내부 유지 작업이므로 사용자·게스트의 일일 호출량에 포함하지 않는다. 요약 성공과 최종 한도 검사가 끝난 뒤 본 답변의 호출량 1회를 예약한다.
- 요약 모델 미설정·비활성화·upstream 실패·빈 결과 또는 요약 후에도 한도 초과이면 원문을 절단하지 않고 `CHAT_CONTEXT_LIMIT_EXCEEDED`로 실패 메시지를 저장한다.
- attachment는 같은 대화·주체의 미연결 ready 상태인지 검사하고 user 메시지 생성 transaction에서 연결한다. 현재 attachment와 이전의 `includeInFutureMessages = true` 추출문은 Provider context에만 합성하며 저장된 사용자 본문은 바꾸지 않는다.

SSE의 각 `data`는 다음 공통 이벤트 중 하나다.

```text
{ "type": "start", "branchId": "...", "messageId": "...", "modelId": "..." }
{ "type": "text_delta", "text": "응답 조각" }
{ "type": "usage", "inputTokens": 10, "outputTokens": 20 }
{ "type": "done", "durationMs": 1234, "stopReason": "stop" }
{ "type": "error", "code": "...", "message": "...", "retryable": false }
```

Provider API 키, endpoint 내부 정보와 upstream 오류 본문은 이벤트에 포함하지 않는다.

### 파일 attachment API

`POST /api/files/conversations/:conversationId`는 파일 한 개를 업로드한다. `Content-Type: application/octet-stream`, `X-File-Name: encodeURIComponent(originalName)`, `X-File-Media-Type`, `X-Include-In-Future: true|false`와 원시 byte body를 사용한다. 성공은 `201 Created`와 본문 없는 attachment metadata다.

`GET /api/files/conversations/:conversationId/pending`은 새로고침 뒤 복원할 현재 대화의 미연결 ready attachment metadata를 반환하며 session과 소유권을 검사한다.

`PATCH /api/files/conversations/:conversationId/:attachmentId`는 아직 메시지에 연결되지 않은 attachment의 `{ "includeInFutureMessages": boolean }`을 수정한다.

`DELETE /api/files/conversations/:conversationId/:attachmentId`는 아직 메시지에 연결되지 않은 attachment metadata와 원본을 삭제하며 성공은 `204 No Content`다.

세 endpoint 모두 일반 사용자·게스트 session과 CSRF를 요구한다. 파일명·MIME·확장자·본문·크기·저장 공간·대화 소유권을 서버에서 검사하며 자세한 형식과 오류는 [FILE_PROCESSING_SPEC.md](./FILE_PROCESSING_SPEC.md)를 따른다.

텍스트 계열 파일, 텍스트 PDF, 스캔 PDF OCR과 JPEG·PNG·WebP를 지원한다. PDF는 기본 100페이지 제한을 적용한다. 텍스트 레이어가 전혀 없으면 로컬 한국어·영어 OCR을 실행하고 응답 attachment metadata에 `ocrPageCount`를 포함한다. 암호·손상·OCR 무결과·OCR 처리 실패·OCR 실행 환경 누락은 각각 `FILE_PDF_PASSWORD_PROTECTED`, `FILE_PDF_INVALID`, `FILE_PDF_OCR_NO_TEXT`, `FILE_PDF_OCR_FAILED`, `FILE_PDF_OCR_UNAVAILABLE`로 구분한다. 페이지 초과는 `FILE_PDF_PAGE_LIMIT`이다. 이미지 decoded pixel 제한 초과는 `FILE_IMAGE_DIMENSIONS_EXCEEDED`다.

PDF·OCR 처리는 설정된 worker 수와 bounded queue를 사용한다. queue 대기 중에는 전체 원본을 Node heap에 읽지 않는다. queue 포화는 `FILE_PROCESSING_BUSY`(`503`), 대기 중 연결·서버 종료는 `FILE_PROCESSING_CANCELLED`로 처리하며 실패한 임시 파일은 삭제한다.

이미지가 연결된 메시지는 선택 모델의 관리자 설정 `supportsImageInput`을 검사한다. 꺼져 있으면 SSE `CHAT_IMAGE_MODEL_UNSUPPORTED` 오류를 반환하고 Provider 호출과 일일 호출량 예약을 수행하지 않는다. 현재 메시지와 후속 포함 이미지의 원본 합계가 `limits.maximumImageBytesPerRequest`를 넘으면 storage 원본을 읽거나 호출량을 예약하기 전에 `CHAT_IMAGE_PAYLOAD_TOO_LARGE`로 실패한다.

만료된 메시지 attachment는 상세 응답에 `status: "expired"`와 안전한 metadata를 유지하되 Provider context에는 포함하지 않는다.

### 관리자 첨부파일 보관 설정

- `GET /api/admin/file-settings`: 보관 일수, 보관 중 파일 수·byte, 삭제 queue와 최근 정리 결과를 조회한다.
- `PUT /api/admin/file-settings`: `{ "retentionDays": 30 }` 형식으로 1~3,650일의 전체 보관 기간을 저장한다. 관리자 session·CSRF가 필요하며 기존 파일 만료 시각도 갱신한다.
- `POST /api/admin/file-settings/cleanup`: 만료·삭제 queue·24시간 이상 고아 원본을 즉시 정리하고 결과와 최신 설정을 반환한다.
- 잘못된 보관 일수는 `FILE_SETTINGS_INPUT_INVALID`(`400`)로 거부한다.

### `POST /api/conversations/:id/messages/:messageId/cancel`

현재 주체가 생성 중인 assistant 메시지의 in-memory `AbortController`를 중단한다. 성공은 `204 No Content`다. 단일 서버 재시작 등으로 활성 요청이 메모리에 없더라도 DB가 pending·streaming이면 `cancelled`로 전환한다.

### `POST /api/conversations/:id/messages/:messageId/regenerate`

활성 분기의 가장 마지막 완료·실패·취소 assistant 메시지만 대상으로 새 자식 분기를 만들고 SSE로 새 답변을 전송한다. 과거 assistant 메시지는 UUID를 직접 전달해도 `CHAT_REGENERATION_INVALID`로 거부한다. body는 새 답변에 사용할 `providerModelId`와 선택적 `parameters`를 받는다. 기존 메시지는 수정하거나 복사하지 않으며 성공 시에만 새 분기를 활성화한다. 실패·취소 시 기존 활성 분기를 유지한다.

### `PATCH /api/conversations/:id/branches/:branchId/active`

현재 주체가 소유한 대화의 root 분기 또는 정상 완료된 재생성 분기를 활성화한다. 다른 대화의 분기, 실패·취소되어 선택할 수 없는 분기와 존재하지 않는 분기는 모두 `404 CHAT_NOT_FOUND`로 처리한다.

### `GET /api/conversations/:id/traces`

현재 인증 session과 대상 대화에 한정된 최근 Provider 전송 기록을 최신순으로 반환한다. 대화의 `requestTraceLimit`이 0이면 빈 배열이다. 기록은 API process 메모리에만 존재하며 요청 body의 인증 header·URL query secret·이미지 base64는 마스킹된다. 다른 session이나 다른 주체는 같은 대화 제목을 사용해도 기록을 조회할 수 없다. 단일 기록은 2MB, session은 30개, API process 전체는 64MiB로 제한되므로 전체 예산 압박 시 오래된 기록은 session 만료 전에도 제거될 수 있다.

### `DELETE /api/conversations/:id/traces`

현재 session에서 대상 대화에 속한 전송 기록만 즉시 제거한다. CSRF 검증이 필요하며 성공은 `204 No Content`다.

공통 오류:

- `400 CHAT_INPUT_INVALID`: UUID, body 또는 설정 범위 오류
- `401 AUTH_SESSION_REQUIRED`: 유효한 session 없음
- `403 AUTH_CSRF_INVALID`: mutation의 CSRF 검증 실패
- `404 CHAT_NOT_FOUND`: 대상 없음, 다른 주체 소유 또는 관리자 workspace 요청
- `409 CHAT_NOT_CANCELLABLE`: 완료됐거나 진행 중이 아닌 메시지

스트림 내부 오류 code에는 `CHAT_CONTEXT_LIMIT_EXCEEDED`, `CHAT_MODEL_UNAVAILABLE`, `CHAT_REGENERATION_INVALID`, `CHAT_IMAGE_MODEL_UNSUPPORTED`, `CHAT_IMAGE_PAYLOAD_TOO_LARGE`, `CHAT_PROVIDER_AUTH_FAILED`, `CHAT_PROVIDER_RATE_LIMITED`, `CHAT_PROVIDER_NETWORK_ERROR`, `CHAT_PROVIDER_RESPONSE_INVALID`, `CHAT_PROVIDER_UPSTREAM_ERROR`, `CHAT_PROVIDER_TIMEOUT`, `CHAT_PROVIDER_INCOMPLETE`, `CHAT_PROVIDER_REFUSED`, `CHAT_OUTPUT_LIMIT`, `CHAT_EMPTY_RESPONSE`, `CHAT_CANCELLED`이 있다. N05부터 Provider parser가 정상 terminal을 확인하지 못한 EOF, 거부·길이 초과·빈 답변을 위 code로 분류한다. 부분 text/usage가 먼저 전송될 수 있고 오류 뒤 `done`은 전송하지 않는다. N06 job API 전환 전에는 기존 SSE 실행 수명이 적용된다.

### `GET /api/admin/summarization`

관리자 session으로 자동 요약 설정과 현재 사용 가능한 Provider 모델 목록을 조회한다. 응답은 `settings.providerModelId`, `prompt`, `promptVersion`, `maxOutputTokens`, `temperature`, `topP`, `providerParameters`, `updatedAt`을 포함한다. 각 model은 Provider·모델에 맞게 계산된 `parameterPolicy`를 포함하며 `Cache-Control: no-store`를 사용한다.

### `PUT /api/admin/summarization`

관리자 mutation guard와 CSRF 검증 후 `{ "providerModelId": string | null, "prompt": string, "temperature": number | null, "topP": number | null, "maxOutputTokens": number, "providerParameters": object }`를 저장한다. 모델 `null`은 자동 요약을 사용하지 않는다는 뜻이며 prompt는 20~~20,000자다. `providerParameters`에는 선택 모델의 policy가 허용하는 고급 항목만 전달할 수 있다. 최대 출력은 128~~32,768이며 실제 요청에서는 모델 자체 상한과 비교해 더 작은 값을 사용한다. 저장할 때 prompt version을 증가시켜 이전 파라미터로 만든 요약과 구분하고 `summarization.settings_updated` 감사 이벤트를 기록한다. 사용할 수 없는 모델은 `409 SUMMARIZATION_MODEL_UNAVAILABLE`, 일반 입력 오류는 `400 SUMMARIZATION_INPUT_INVALID`, Provider 정책 위반은 `400 SUMMARIZATION_PARAMETER_INVALID`다.

### `GET /api/admin/usage?period=:period`

관리자 session으로 비민감 AI 사용량 원장을 상대 기간 기준으로 조회한다. `Cache-Control: no-store`를 사용한다.

- 지원 기간: `10m`, `1h`, `6h`, `12h`, `1d`, `1w`, `30d`
- 생략 시 기본 기간: `1d`
- 집계 시작은 요청 시각에서 해당 기간을 뺀 시각이며 달력 날짜로 반올림하지 않는다.
- 응답은 `totals`, `byUser`, `byModel`, 최근 50건인 `recent`, `since`, `generatedAt`을 포함한다.
- 요청 수는 생성·재생성 및 성공해 새 원장으로 저장된 자동 요약 호출별 사용량 이벤트 수이며 `operationType`으로 `chat`과 `summary`를 구분한다. 일반 대화는 완료·실패·취소·진행 중 상태도 구분한다.
- token 합계는 Provider가 보고한 입력·출력 token만 더한다. 보고되지 않은 token은 `0`으로 집계하되 개별 최근 기록에서는 `null`을 유지한다.
- 사용자·모델 행은 실제 ID와 삭제 후에도 남는 표시 snapshot을 사용한다. 대화 본문·system prompt·API key·요청 parameter는 반환하지 않는다.
- 지원하지 않는 기간은 `400 USAGE_PERIOD_INVALID`다.

### 관리자 통합 로그 API

모든 endpoint는 고정 관리자 session을 요구하며 변경 요청은 CSRF를 검증한다.

- `GET /api/admin/logs`: `period`, `category`, `level`, `status`, `search`, `page`, `pageSize`로 AI·보안·감사·파일·시스템 로그를 조회한다. 기간은 Usage와 같은 7개 값, page size는 10~100이다.
- `GET /api/admin/logs/export`: 같은 필터의 최신 최대 10,000건을 UTF-8 CSV로 내려받는다.
- `GET /api/admin/logs/:id`: 통합 원장의 단일 상세와 안전한 metadata를 반환한다.
- `GET /api/admin/logs/settings`: 범주별 보관 일수와 최근 정리 결과를 반환한다.
- `PUT /api/admin/logs/settings`: AI 7~~365일, 보안 30~~730일, 감사 90~~1,825일, 파일 7~~365일, 시스템 7~180일 범위로 저장한다.
- `POST /api/admin/logs/cleanup`: 설정 기간이 지난 원장을 즉시 삭제하고 건수를 반환한다.

목록·상세 조회와 CSV 내보내기도 감사 기록에 남는다. 통합 로그는 대화 본문, system prompt, 첨부 추출문, API key와 session token을 반환하지 않는다.

## 10. 오류·경계 조건

- 존재하지 않는 endpoint는 `404`를 반환한다.
- readiness에는 DB URL, query, 오류 message와 stack을 포함하지 않는다.
- Valkey 검사는 queue 또는 인증 rate limit 도입 시 추가한다.
- 인증 오류 body는 `{ "error": { "code": string, "message": string } }` 형식을 사용한다.
- 인증 cookie의 Domain은 지정하지 않아 현재 host 전용으로 제한한다.
- 사용자 관리 response와 감사 기록에는 password 또는 password hash를 포함하지 않는다.
- Provider 오류 response에는 upstream 본문, endpoint 내부 정보와 API 키를 포함하지 않는다.

## 11. 검증·인수 조건

- 두 health endpoint의 controller test가 통과한다.
- gateway를 통과한 `/api/health/live` 요청이 API response를 반환한다.
- health response에 설정값이나 secret이 노출되지 않는다.
- 올바른 관리자 비밀번호와 현재 TOTP code로만 session이 생성된다.
- DB에는 session token과 CSRF token의 SHA-256 hash만 저장된다.
- 네 번째 login 성공 시 가장 오래 사용하지 않은 관리자 session이 폐기된다.
- 일반 사용자 login은 TOTP 없이 Argon2id 비밀번호로 성공하고 비활성 계정은 동일한 인증 오류로 거부된다.
- 일반 사용자 session은 계정 UUID별 최대 3개이며 DB의 활성 상태와 credential version 변경을 매 요청에서 검증한다.
- idle·absolute 만료, config credential 변경, CSRF 불일치가 거부된다.
- 인증되지 않은 요청과 CSRF가 없는 사용자 변경 요청이 거부된다.
- 사용자 생성·수정·비활성화·비밀번호 변경·삭제가 감사 기록에 남는다.
- 비밀번호 변경·비활성화·사용자명 변경 시 기존 사용자 session이 폐기된다.
- 관리자만 Provider 카탈로그·연결을 조회하고 CSRF 검증 후 등록·동기화·상태 변경할 수 있다.
- API 키는 모델 조회 request에만 사용하고 DB에는 AES-256-GCM ciphertext만 저장한다.
- 모델 동기화 실패 시 기존 모델과 활성 설정을 보존한다.
- 대화 생성 시 root 분기와 활성 분기가 같은 transaction에서 생성된다.
- 일반 사용자와 게스트는 자신의 대화만 조회·수정·삭제할 수 있고 mutation은 CSRF를 요구한다.
- OpenAI 호환·Anthropic·Gemini 스트림을 공통 SSE 이벤트로 전달하고 최종 본문·사용량·상태를 저장한다.
- 취소와 브라우저 연결 종료가 upstream 요청까지 전파되고 부분 본문은 `cancelled`로 보존된다.
- 컨텍스트 초과 시 호환되는 기존 요약을 재사용하거나 오래된 구간을 별도 레코드로 요약하며 원본 메시지를 유지한다.
- 자동 요약 설정 변경은 관리자·CSRF 검증을 요구하고 API key나 요약 원문을 감사 snapshot에 남기지 않는다.
- 사용량 API는 관리자에게만 열리고 사용자·게스트·모델별 요청·token 합계가 선택한 상대 기간과 일치한다.
- 관리자 통합 로그는 다섯 범주를 필터·검색·상세 조회·CSV 내보내기할 수 있고 보관 정책 정리를 수행한다.
- session 전송 기록은 현재 session에서만 조회되며 로그아웃·만료·대화 삭제 시 제거되고 인증 정보와 이미지 base64가 노출되지 않는다.

## 12. 미결정·보류 항목

- 공통 request ID 형식은 관리자 log 단계에서 확정한다.
- OpenAPI 문서는 현재 공개하지 않으며, 도입 시 관리자 session을 요구한다.
- TOTP 복구 code는 CLI·DB 저장 구조와 함께 후속 보안 단계에서 구현한다.
- API 키 교체와 Provider별 고급 설정은 채팅·파일 처리 이후 Provider 하위 단계에서 추가한다.

## 14. Provider registry 등록 확장

`GET /api/admin/provider-templates`는 등록 UI가 인증과 추가 필드를 구성할 수 있도록 `authType`, `configurationFields`, 모델 조회·고정 모델 metadata를 포함한다.

`POST /api/admin/provider-connections`는 `templateId`, `name`, `apiKey`, `configuration`을 받는다. `configuration`은 template에 선언된 필드만 사용하며, Cloudflare AI Gateway는 `accountId`를 요구한다. 필수 API 키는 8자 이상이고 선택형 API 키는 빈 문자열 또는 8자 이상이다. static model template은 등록 직후 snapshot 모델을 생성한다.

## 15. 채팅 SSE 런타임 경계

- `POST /api/conversations/:id/messages`와 재생성 endpoint는 Provider가 120초 동안 chunk를 보내지 않으면 응답을 중단한다.
- Provider의 미완성 SSE 이벤트가 1MiB를 넘으면 `CHAT_PROVIDER_RESPONSE_INVALID` 오류 이벤트를 반환한다.
- 실행 도중 내부 상태 저장이 실패하더라도 HTTP SSE 응답은 `finally`에서 종료한다.
- 사용자가 연결을 닫거나 취소 endpoint를 호출하면 기존과 같이 upstream AbortSignal을 즉시 중단한다.
- SSE `response.write()`가 backpressure를 알리면 다음 Provider event를 읽기 전에 `drain`을 기다린다.
- `drain` 전에 연결이 종료되면 해당 대기를 해제하고 생성 요청을 취소 상태로 마무리한다.
# 웹 검색·호출 시각 API 추가 (2026-08-10)

- `PATCH /api/admin/provider-models/:id`는 선택적으로 `supportsWebSearch: boolean`을 받는다.
- 모델 응답에는 `supportsWebSearch`가 포함된다.
- 대화 생성·수정은 선택적으로 `webSearchEnabled: boolean`을 받고, 대화 목록·상세 응답에도 같은 값을 반환한다. 생성 기본값은 `false`이다.
- 웹 검색이 켜진 대화를 검색 미지원 모델로 호출하면 SSE 오류 `CHAT_WEB_SEARCH_MODEL_UNSUPPORTED`를 반환한다.
- 현재 시각은 클라이언트 입력 필드가 아니다. 서버가 Provider 요청 생성 시 UTC ISO 8601 값으로 주입한다.
