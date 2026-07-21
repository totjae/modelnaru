# ModelNaru API 상세 명세

## 1. 목적

현재 구현된 HTTP API 계약과 이후 API가 따라야 할 공통 규칙을 기록한다.

## 2. 적용 범위

현재 기반 단계에서는 health endpoint만 포함한다. 인증·사용자·provider·대화 API는 각 구현 단계에서 이 문서에 추가한다.

## 3. 공통 규칙

- 외부 기준 prefix는 `/api`이다.
- response의 `Content-Type`은 JSON endpoint에서 `application/json`이다.
- 내부 예외의 stack, 경로, secret과 환경 변수 값은 response에 포함하지 않는다.
- 날짜가 추가될 때는 UTC ISO 8601 문자열을 사용한다.

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

## 5. 오류·경계 조건

- 존재하지 않는 endpoint는 `404`를 반환한다.
- readiness에는 DB URL, query, 오류 message와 stack을 포함하지 않는다.
- Valkey 검사는 queue 또는 인증 rate limit 도입 시 추가한다.

## 6. 검증·인수 조건

- 두 health endpoint의 controller test가 통과한다.
- gateway를 통과한 `/api/health/live` 요청이 API response를 반환한다.
- health response에 설정값이나 secret이 노출되지 않는다.

## 7. 미결정·보류 항목

- 공통 오류 envelope와 request ID 형식은 인증 API 도입 전에 확정한다.
- OpenAPI 문서 공개 범위는 관리자 인증 구현 전에 확정한다.
