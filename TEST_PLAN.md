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

## 4. 관리자 인증 단계 시험 항목

| ID            | 종류 | 대상                | 인수 조건                                                | 상태      |
| ------------- | ---- | ------------------- | -------------------------------------------------------- | --------- |
| AUTH-UNIT-001 | 단위 | TOTP                | RFC 6238 code와 ±1 time step 검증                        | 통과      |
| AUTH-UNIT-002 | 단위 | token·fingerprint   | 32-byte token과 credential 변경 감지                     | 통과      |
| AUTH-UNIT-003 | 단위 | 로그인 제한         | 5회 실패부터 Retry-After 차단                            | 통과      |
| AUTH-UNIT-004 | 단위 | 관리자 login        | Argon2id·TOTP 성공만 session 생성, 실패 원인 비공개      | 통과      |
| AUTH-UNIT-005 | 단위 | session·CSRF        | credential 변경 폐기와 header·cookie·DB hash 일치 검증   | 통과      |
| AUTH-UNIT-006 | 단위 | cookie              | Secure·HttpOnly·SameSite·Path와 CSRF cookie 분리         | 통과      |
| AUTH-INT-001  | 통합 | PostgreSQL session  | login row 생성·최대 3개·idle/absolute 만료·logout 폐기   | 미검증    |
| AUTH-E2E-001  | E2E  | HTTPS 관리자 로그인 | 실제 TOTP login·새로고침 session 유지·logout·cookie 확인 | 부분 통과 |

## 5. 사용자 관리 단계 시험 항목

| ID            | 종류 | 대상                   | 인수 조건                                                      | 상태   |
| ------------- | ---- | ---------------------- | -------------------------------------------------------------- | ------ |
| USER-UNIT-001 | 단위 | 입력·비밀번호          | username/display name/password 경계와 관리자 ID 충돌 거부      | 통과   |
| USER-UNIT-002 | 단위 | 사용자 mutation        | 생성·수정·비활성·비밀번호 변경·삭제 결과와 오류 mapping        | 통과   |
| USER-UNIT-003 | 단위 | session 폐기           | username·password·disabled 변경 시 활성 session 즉시 폐기      | 통과   |
| USER-UNIT-004 | 단위 | 감사 snapshot          | mutation별 before/after 기록과 password·hash·token 제외        | 통과   |
| USER-SEC-001  | 보안 | 관리자 권한·CSRF       | 비로그인·CSRF 누락·일반 사용자 접근 거부                       | 통과   |
| USER-INT-001  | 통합 | PostgreSQL transaction | 사용자 mutation·session 폐기·audit가 함께 commit 또는 rollback | 미검증 |
| USER-E2E-001  | E2E  | 사용자 관리 화면       | HTTPS에서 생성·편집·비활성·비밀번호 변경·삭제                  | 미검증 |

## 6. 실행 환경

- 개발 검증: Windows, Codex bundled Node.js 24.14.0, pnpm 11.9.0
- 목표 배포: Ubuntu 24.04.4 LTS, Docker Compose
- Ubuntu 통합 검증: Ubuntu 24.04.4 LTS, Intel N100, RAM 16GB, Docker Compose, 외부 Nginx HTTPS
- 개발 host에는 Docker CLI가 없어 DB 중단과 migration 재실행 검증은 Ubuntu server에서 수행한다.

## 7. 실행 명령

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 8. 실제 결과

2026-07-22 개발 환경에서 다음 결과를 확인했다.

- `pnpm format:check`: 통과
- `pnpm lint`: 통과, warning 0개
- `pnpm typecheck`: 5개 workspace package 통과
- `pnpm test`: 42개 통과, Windows에서 symbolic-link 시험 1개 제외
- `pnpm build`: config·database·CLI·API TypeScript build와 Next.js production build 통과
- `pnpm audit --prod`: 알려진 production dependency 취약점 0건
- `apichat-admin show`: 예제 설정을 읽고 password hash·TOTP secret 마스킹 확인
- Compose YAML에서 host port를 가진 service가 gateway 하나뿐임을 단위시험으로 확인
- Ubuntu에서 gateway·Web·API·PostgreSQL·Valkey healthy, `127.0.0.1:32432` 단일 publish, 외부 HTTPS Web과 health API 통신 확인
- 관리자 인증에서 RFC 6238 TOTP, Argon2id login, token hash, credential 변경 폐기, CSRF, cookie 속성과 login rate limit 단위시험 통과
- Ubuntu 공개 HTTPS 화면에서 실제 관리자 ID·비밀번호·TOTP login 성공 확인
- 사용자 관리 guard·입력·Argon2id·오류 mapping·session 폐기·감사 snapshot과 삭제 익명화 단위시험 통과

2026-07-22 Ubuntu 최초 migration 실행은 internal backend network에서 Corepack이 `pnpm`을 내려받으려다 DNS `EAI_AGAIN`으로 실패했다. PostgreSQL은 healthy였고 migration 적용 전 실패하여 schema 손상은 없었다. Runtime command를 build된 JavaScript의 직접 `node` 실행으로 변경한 뒤 재배포하여 `0001_auth_foundation.sql` 적용, migrate exit code 0, API·Web·PostgreSQL·Valkey healthy와 readiness `database: ok`를 확인했다. Migration 재실행과 `schema_migrations` 직접 조회, DB 중단 시 readiness 503 확인은 남아 있다.

## 9. 오류·경계 조건

- 외부 provider가 필요한 시험은 fixture 기반 contract test와 실제 credential smoke test를 구분한다.
- Docker를 실행하지 않은 정적 Compose 검토는 통합 시험 통과로 기록하지 않는다.
- Windows에서 통과한 파일 권한 시험은 Linux `0600` 검증을 대체하지 않는다.

## 10. 미결정·보류 항목

- 실제 Ubuntu HTTPS 관리자 login 검증 후 Playwright E2E 자동화 범위를 확정한다.
- provider 단계에서 실제 gateway별 contract test를 별도 문서에 기록한다.
