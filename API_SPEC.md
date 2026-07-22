# ModelNaru API 상세 명세

## 1. 목적

현재 구현된 HTTP API 계약과 이후 API가 따라야 할 공통 규칙을 기록한다.

## 2. 적용 범위

현재 health endpoint, 고정 관리자·일반 사용자·게스트 인증, 관리자 전용 사용자·Provider·모델 접근 관리 API를 포함한다. 대화 API는 구현 단계에서 이 문서에 추가한다.

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
- 비밀번호는 12~1,024자이며 Argon2id hash만 저장한다.
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

`provider-manager-v1.10.0.js`를 기준으로 보존한 전체 카탈로그를 반환한다. 각 항목의 `canRegister`로 현재 등록 지원 여부를 표시한다. 첫 구현에서 `llm-gateway`, `openai`, `anthropic`, `google`만 true다.

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
- `GET /api/access/models`: 현재 일반 사용자 또는 게스트에게 허용된 활성 모델 조회

관리자 변경 API는 관리자 session과 CSRF를 요구한다. 제한 예약 로직은 `ACCESS_DAILY_LIMIT_REACHED`(`429`)와 적용 범위 `scope`를 반환하며 실제 AI 요청 endpoint가 추가될 때 upstream 호출 직전에 연결한다.

게스트 status API는 활성 여부 외 내부 제한과 코드 정보를 노출하지 않는다. 게스트 참가 오류는 `GUEST_DISABLED`(`403`), `GUEST_AUTH_FAILED`(`401`), `GUEST_RATE_LIMITED`(`429`), `GUEST_CAPACITY_REACHED`(`429`)를 사용한다.

## 9. 오류·경계 조건

- 존재하지 않는 endpoint는 `404`를 반환한다.
- readiness에는 DB URL, query, 오류 message와 stack을 포함하지 않는다.
- Valkey 검사는 queue 또는 인증 rate limit 도입 시 추가한다.
- 인증 오류 body는 `{ "error": { "code": string, "message": string } }` 형식을 사용한다.
- 인증 cookie의 Domain은 지정하지 않아 현재 host 전용으로 제한한다.
- 사용자 관리 response와 감사 기록에는 password 또는 password hash를 포함하지 않는다.
- Provider 오류 response에는 upstream 본문, endpoint 내부 정보와 API 키를 포함하지 않는다.

## 10. 검증·인수 조건

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

## 11. 미결정·보류 항목

- 공통 request ID 형식은 관리자 log 단계에서 확정한다.
- OpenAPI 문서는 현재 공개하지 않으며, 도입 시 관리자 session을 요구한다.
- TOTP 복구 code는 CLI·DB 저장 구조와 함께 후속 보안 단계에서 구현한다.
- API 키 교체, 사용자별 모델 권한 API와 Provider별 고급 설정은 다음 Provider 하위 단계에서 추가한다.
