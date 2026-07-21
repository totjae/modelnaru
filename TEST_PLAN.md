# ModelNaru 시험 계획·결과

## 1. 목적

구현 단계별 검증 범위와 실제 실행 결과를 기록한다.

## 2. 기반 단계 시험 항목

| ID              | 종류  | 대상               | 인수 조건                                   | 상태 |
| --------------- | ----- | ------------------ | ------------------------------------------- | ---- |
| FND-UNIT-001    | 단위  | config 기본값·경로 | schema parse와 상대 경로 해석이 예상과 일치 | 통과 |
| FND-UNIT-002    | 단위  | config 거부 조건   | 잘못된 port·HTTP URL·TOTP·hash를 거부       | 통과 |
| FND-UNIT-003    | 단위  | 민감값 마스킹      | CLI 표시 결과에 hash·TOTP가 없음            | 통과 |
| FND-UNIT-004    | 단위  | API health         | live와 ready response 계약 일치             | 통과 |
| FND-STATIC-001  | 정적  | 전체 workspace     | format check, lint, typecheck 통과          | 통과 |
| FND-BUILD-001   | build | Web·API·CLI        | production build 통과                       | 통과 |
| FND-COMPOSE-001 | 통합  | Compose            | Ubuntu에서 모든 container가 healthy         | 통과 |
| FND-GATEWAY-001 | 통합  | gateway routing    | `/`은 Web, `/api/health/live`는 API 응답    | 통과 |
| FND-SEC-001     | 보안  | port 공개          | gateway 외 host publish 없음                | 통과 |

## 3. Database 단계 시험 항목

| ID                 | 종류 | 대상                 | 인수 조건                                          | 상태      |
| ------------------ | ---- | -------------------- | -------------------------------------------------- | --------- |
| DB-UNIT-001        | 단위 | migration plan       | 파일 정렬·checksum·중복·빈 파일 검증               | 통과      |
| DB-STATIC-001      | 정적 | 최초 SQL schema      | users·sessions 제약, FK cascade와 index 존재       | 통과      |
| DB-API-001         | 단위 | readiness            | DB 정상 응답과 비민감 503 응답 검증                | 통과      |
| DB-INTEGRATION-001 | 통합 | PostgreSQL migration | 최초 적용·재실행·schema_migrations 기록 확인       | 부분 통과 |
| DB-INTEGRATION-002 | 통합 | Compose 시작 순서    | migrate 성공 후 API healthy, DB 중단 시 ready 실패 | 부분 통과 |
| DB-STATIC-002      | 정적 | Runtime command      | API·Web·migration이 package manager 없이 실행      | 통과      |

## 4. 실행 환경

- 개발 검증: Windows, Codex bundled Node.js 24.14.0, pnpm 11.9.0
- 목표 배포: Ubuntu 24.04.4 LTS, Docker Compose
- Ubuntu 통합 검증: Ubuntu 24.04.4 LTS, Intel N100, RAM 16GB, Docker Compose, 외부 Nginx HTTPS
- 개발 host에는 Docker CLI가 없어 DB 중단과 migration 재실행 검증은 Ubuntu server에서 수행한다.

## 5. 실행 명령

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 6. 실제 결과

2026-07-21 개발 환경에서 다음 결과를 확인했다.

- `pnpm format:check`: 통과
- `pnpm lint`: 통과, warning 0개
- `pnpm typecheck`: 5개 workspace package 통과
- `pnpm test`: 20개 통과, Windows에서 symbolic-link 시험 1개 제외
- `pnpm build`: config·database·CLI·API TypeScript build와 Next.js production build 통과
- `pnpm audit --prod`: 알려진 production dependency 취약점 0건
- `apichat-admin show`: 예제 설정을 읽고 password hash·TOTP secret 마스킹 확인
- Compose YAML에서 host port를 가진 service가 gateway 하나뿐임을 단위시험으로 확인
- Ubuntu에서 gateway·Web·API·PostgreSQL·Valkey healthy, `127.0.0.1:32432` 단일 publish, 외부 HTTPS Web과 health API 통신 확인

2026-07-22 Ubuntu 최초 migration 실행은 internal backend network에서 Corepack이 `pnpm`을 내려받으려다 DNS `EAI_AGAIN`으로 실패했다. PostgreSQL은 healthy였고 migration 적용 전 실패하여 schema 손상은 없었다. Runtime command를 build된 JavaScript의 직접 `node` 실행으로 변경한 뒤 재배포하여 `0001_auth_foundation.sql` 적용, migrate exit code 0, API·Web·PostgreSQL·Valkey healthy와 readiness `database: ok`를 확인했다. Migration 재실행과 `schema_migrations` 직접 조회, DB 중단 시 readiness 503 확인은 남아 있다.

## 7. 오류·경계 조건

- 외부 provider가 필요한 시험은 fixture 기반 contract test와 실제 credential smoke test를 구분한다.
- Docker를 실행하지 않은 정적 Compose 검토는 통합 시험 통과로 기록하지 않는다.
- Windows에서 통과한 파일 권한 시험은 Linux `0600` 검증을 대체하지 않는다.

## 8. 미결정·보류 항목

- 인증 단계에서 Playwright E2E와 session security test를 추가한다.
- provider 단계에서 실제 gateway별 contract test를 별도 문서에 기록한다.
