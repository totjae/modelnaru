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

| ID            | 종류 | 대상                   | 인수 조건                                                      | 상태      |
| ------------- | ---- | ---------------------- | -------------------------------------------------------------- | --------- |
| USER-UNIT-001 | 단위 | 입력·비밀번호          | username/display name/password 경계와 관리자 ID 충돌 거부      | 통과      |
| USER-UNIT-002 | 단위 | 사용자 mutation        | 생성·수정·비활성·비밀번호 변경·삭제 결과와 오류 mapping        | 통과      |
| USER-UNIT-003 | 단위 | session 폐기           | username·password·disabled 변경 시 활성 session 즉시 폐기      | 통과      |
| USER-UNIT-004 | 단위 | 감사 snapshot          | mutation별 before/after 기록과 password·hash·token 제외        | 통과      |
| USER-SEC-001  | 보안 | 관리자 권한·CSRF       | 비로그인·CSRF 누락·일반 사용자 접근 거부                       | 통과      |
| USER-INT-001  | 통합 | PostgreSQL transaction | 사용자 mutation·session 폐기·audit가 함께 commit 또는 rollback | 부분 통과 |
| USER-E2E-001  | E2E  | 사용자 관리 화면       | HTTPS에서 생성·편집·비활성·비밀번호 변경·삭제                  | 통과      |

## 6. 일반 사용자 인증 단계 시험 항목

| ID                 | 종류 | 대상                | 인수 조건                                                     | 상태      |
| ------------------ | ---- | ------------------- | ------------------------------------------------------------- | --------- |
| USER-AUTH-UNIT-001 | 단위 | 사용자 login        | TOTP 없이 Argon2id 비밀번호로 user session 생성               | 통과      |
| USER-AUTH-UNIT-002 | 단위 | 계정 상태           | 미존재·오류 비밀번호·비활성 계정을 같은 인증 오류로 거부      | 통과      |
| USER-AUTH-UNIT-003 | 단위 | session credential  | UUID·credential version 검증과 변경 session 폐기              | 통과      |
| USER-AUTH-SEC-001  | 보안 | 관리자 endpoint     | user session의 관리자 API 접근을 `AUTH_ADMIN_REQUIRED`로 거부 | 통과      |
| USER-AUTH-INT-001  | 통합 | PostgreSQL session  | user_id 연결·최대 3개·idle/absolute 만료·logout 폐기          | 부분 통과 |
| USER-AUTH-E2E-001  | E2E  | HTTPS 사용자 로그인 | 실제 login·새로고침 유지·관리자 화면 차단·logout              | 통과      |

## 7. Provider 등록 기반 시험 항목

| ID                  | 종류 | 대상                    | 인수 조건                                         | 상태 |
| ------------------- | ---- | ----------------------- | ------------------------------------------------- | ---- |
| PROVIDER-UNIT-001   | 단위 | 전체 카탈로그           | ID 중복·잘못된 URL 없음, 참고 서비스 이름 보존    | 통과 |
| PROVIDER-UNIT-002   | 단위 | 자격증명 암호화         | AES-256-GCM round-trip·변조·잘못된 key 거부       | 통과 |
| PROVIDER-UNIT-003   | 단위 | 모델 조회 fixture       | 네 Provider header·URL·OpenAI·Google 응답 정규화  | 통과 |
| PROVIDER-UNIT-004   | 단위 | 등록 service·controller | 평문 비저장·입력·준비 중 template 거부            | 통과 |
| PROVIDER-STATIC-001 | 정적 | 3차 migration           | ciphertext·nonce·tag·모델·사용자 권한 제약        | 통과 |
| PROVIDER-INT-001    | 통합 | PostgreSQL transaction  | 연결·모델·감사 기록 commit과 재동기화 보존        | 통과 |
| PROVIDER-E2E-001    | E2E  | LLM Gateway 실제 키     | 등록·모델 조회·암호화 재사용·모델 활성화·비활성화 | 통과 |
| PROVIDER-E2E-002    | E2E  | OpenAI 실제 키          | 등록·모델 조회·동기화·모델 활성 상태 변경         | 통과 |

## 8. 게스트·모델 권한 시험 항목

| ID                  | 종류 | 대상              | 인수 조건                                                        | 상태 |
| ------------------- | ---- | ----------------- | ---------------------------------------------------------------- | ---- |
| ACCESS-UNIT-001     | 단위 | 사용자 모델 권한  | 코드 hash·timezone·quota 오류 변환과 migration 계약              | 통과 |
| ACCESS-CONCUR-001   | 통합 | 일일 호출 counter | 동시 요청에서 사용자·모델·게스트 한도를 원자적으로 초과하지 않음 | 계획 |
| GUEST-AUTH-001      | 단위 | 공유 코드·session | hash 검증·생성 속도 제한·idle·absolute 만료 계산                 | 통과 |
| GUEST-POLICY-001    | 통합 | 게스트 설정 저장  | 설정 저장 시 기존 게스트 session을 항상 모두 종료                | 계획 |
| UI-STATIC-001       | 정적 | 공통 UI theme     | 라이트·다크 token·역할별 7색 단색 포인트·focus·checkbox 정렬     | 통과 |
| UI-THEME-001        | E2E  | 테마 전환         | 시스템 추종·수동 전환·새로고침 후 선택 복원                      | 계획 |
| GUEST-ISOLATION-001 | 보안 | 게스트 소유권     | 같은 코드를 쓴 두 guest가 상대 대화·첨부를 조회하지 못함         | 계획 |
| GUEST-CLEANUP-001   | 통합 | 임시 데이터 삭제  | logout·만료·관리자 종료 후 기한 내 연쇄 삭제                     | 계획 |
| GUEST-E2E-001       | E2E  | HTTPS 게스트 체험 | 코드 참가·독립 대화·호출 제한·logout                             | 계획 |

## 9. 채팅 기반 시험 항목

| ID                  | 종류 | 대상                | 인수 조건                                                      | 상태 |
| ------------------- | ---- | ------------------- | -------------------------------------------------------------- | ---- |
| CHAT-STATIC-001     | 정적 | 5차 migration       | 소유권·cascade·root branch·상태·순서·모델 snapshot 제약        | 통과 |
| CHAT-UNIT-001       | 단위 | service·controller  | 기본값·입력 범위·관리자 거부·소유권 not-found mapping          | 통과 |
| CHAT-INT-001        | 통합 | PostgreSQL CRUD     | 사용자·게스트 격리와 생성 transaction·수정·삭제                | 계획 |
| CHAT-SECURITY-001   | 보안 | session·CSRF·소유권 | 다른 주체 ID 비노출, 모든 mutation CSRF 적용                   | 계획 |
| PROVIDER-ORDER-001  | 단위 | Provider catalog    | 핵심 4개 고정 상단, LLM Gateway 포함 나머지 표시 이름 알파벳순 | 통과 |
| CHAT-STREAM-001     | 단위 | Provider adapter    | OpenAI·Anthropic·Gemini URL·header·body와 SSE chunk 정규화     | 통과 |
| CHAT-CONTEXT-001    | 단위 | 컨텍스트 한도       | 초과 시 quota 예약 전 실패 상태와 표준 오류 저장               | 통과 |
| CHAT-CANCEL-001     | 통합 | 중지·연결 종료      | upstream abort와 assistant `cancelled`·부분 본문 보존          | 계획 |
| CHAT-E2E-001        | E2E  | HTTPS 텍스트 채팅   | 실제 허용 모델로 생성·stream·저장·새로고침·모델 변경           | 계획 |
| CHAT-MODEL-001      | 단위 | 모델 선택 복원      | 마지막 허용 모델 복원·권한 제외 시 현재/첫 모델 fallback       | 통과 |
| CHAT-BRANCH-001     | 단위 | 분기 경로 합성      | 부모 prefix 공유·반복 재생성·잘못된 fork 거부                  | 통과 |
| CHAT-REGEN-001      | 단위 | 재생성 service·API  | 전용 저장 경로·입력 검증·분기 전환 소유권 전달                 | 통과 |
| CHAT-REGEN-E2E-001  | E2E  | HTTPS 답변 재생성   | 원본 보존·성공 시 활성화·실패 시 유지·분기 왕복·후속 문맥      | 계획 |
| CHAT-REGEN-LAST-001 | 단위 | 재생성 대상 제한    | 마지막 assistant만 허용하고 과거·생성 중 답변 거부             | 통과 |
| CHAT-NAV-001        | 단위 | 인라인 답변 탐색    | 동일 질문의 branch 자체 답변만 후보로 구성                     | 통과 |
| CHAT-SCROLL-001     | 단위 | 최신 답변 자동 추적 | 하단 임계값 안에서는 추적하고 과거 내용 열람 시 추적 중단      | 통과 |
| CHAT-REFRESH-001    | 정적 | 응답 완료 상태 갱신 | 전체 loading 전환 없이 상세·목록 데이터만 갱신                 | 통과 |
| CHAT-LAYOUT-001     | 정적 | 채팅 패널 재구성    | 좌우 패널 접기·설정 순서·내부 스크롤·역할별 테두리 버튼 적용   | 통과 |
| CHAT-HEADER-001     | 정적 | 채팅 상단 헤더      | 브랜드·공간·ID·로그아웃 한 줄 배치와 좁은 화면 말줄임          | 통과 |
| UI-ICON-001         | 정적 | 브랜드 아이콘       | 보라 MN SVG·favicon·Apple·PWA 자산과 metadata 연결             | 통과 |
| UI-MARK-001         | 정적 | 페이지 브랜드 마크  | 보라 테두리·반투명 표면·MN mask의 다크·라이트 공용 적용        | 통과 |

## 10. 실행 환경

- 개발 검증: Windows, Codex bundled Node.js 24.14.0, pnpm 11.9.0
- 목표 배포: Ubuntu 24.04.4 LTS, Docker Compose
- Ubuntu 통합 검증: Ubuntu 24.04.4 LTS, Intel N100, RAM 16GB, Docker Compose, 외부 Nginx HTTPS
- 개발 host에는 Docker CLI가 없어 DB 중단과 migration 재실행 검증은 Ubuntu server에서 수행한다.

## 11. 실행 명령

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 12. 실제 결과

2026-07-22 개발 환경에서 다음 결과를 확인했다.

- `pnpm format:check`: 통과
- `pnpm lint`: 통과, warning 0개
- `pnpm typecheck`: 5개 workspace package 통과
- `pnpm test`: 102개 통과, Windows에서 symbolic-link 시험 1개 제외
- `pnpm build`: config·database·CLI·API TypeScript build와 Next.js production build 통과
- `pnpm audit --prod`: 알려진 production dependency 취약점 0건
- `apichat-admin show`: 예제 설정을 읽고 password hash·TOTP secret 마스킹 확인
- Compose YAML에서 host port를 가진 service가 gateway 하나뿐임을 단위시험으로 확인
- Ubuntu에서 gateway·Web·API·PostgreSQL·Valkey healthy, `127.0.0.1:32432` 단일 publish, 외부 HTTPS Web과 health API 통신 확인
- 관리자 인증에서 RFC 6238 TOTP, Argon2id login, token hash, credential 변경 폐기, CSRF, cookie 속성과 login rate limit 단위시험 통과
- Ubuntu 공개 HTTPS 화면에서 실제 관리자 ID·비밀번호·TOTP login 성공 확인
- 사용자 관리 guard·입력·Argon2id·오류 mapping·session 폐기·감사 snapshot과 삭제 익명화 단위시험 통과
- 일반 사용자 Argon2id login, 비활성 계정 거부, UUID 기반 session과 관리자 권한 차단 단위시험 통과
- Ubuntu HTTPS 사용자 관리에서 생성·수정·비활성·활성·비밀번호 변경·삭제와 `0002_user_management_audit.sql` 이벤트 및 삭제 identity 제거 확인
- Ubuntu HTTPS에서 일반 사용자 login·새로고침·logout을 확인하고, 동일 계정 네 번째 login 시 가장 오래된 session이 `session_limit`으로 폐기되며 활성 session 3개만 유지되는 것을 PostgreSQL에서 확인
- Provider 전체 카탈로그, AES-256-GCM, 네 API 키 인증 header·모델 fixture, 입력·평문 비노출과 3차 migration 정적 시험 통과
- LLM Gateway 인증 endpoint 실패 시 공개 모델 목록 조회와 저장을 중단하는 시험 통과
- 게스트 코드 Argon2id 검증, 독립 주체·session 생성, 비활성 거부와 고정 시간창 생성 제한 단위시험 통과
- 관리자 10자·일반 사용자 8자·게스트 코드 6자 최소 길이 정책과 API 경계값 시험 통과
- 게스트 코드 hash 전달, IANA timezone 검증과 일일 quota 오류 변환 단위시험 통과
- 4차 migration의 게스트 소유권·일일 counter 제약 정적 시험 통과
- Provider 핵심 4개 우선·나머지 알파벳순 정렬과 5차 migration의 대화 소유권·branch·message 상태 제약 정적 시험 통과
- 대화 CRUD 기본값·입력 범위, 관리자 workspace 차단과 소유권 not-found 변환 단위시험 통과
- OpenAI 호환·Anthropic·Gemini 요청 builder, 분할 SSE parser와 컨텍스트 초과 시 quota 예약 방지 단위시험 통과
- 활성 분기의 마지막 허용 모델 복원, 권한 제외 모델 무시와 fallback을 Web 단위시험으로 확인
- 부모 경로 공유형 분기 합성, 반복 재생성, 잘못된 fork 거부와 재생성 전용 실행·API 입력·분기 활성화 service 단위시험 통과
- 마지막 assistant 답변만 재생성 대상으로 허용하고 동일 질문의 실제 branch 답변만 인라인 탐색 후보로 구성하는 단위시험 통과
- 메시지 목록 하단 96px 자동 추적 경계와 사용자가 위로 스크롤한 경우의 추적 중단 단위시험 통과
- Ubuntu HTTPS에서 Gemini·OpenAI 호환 모델 응답, 모델별 snapshot·token usage 저장, 새로고침 후 대화 복원과 assistant 취소 상태 저장을 확인했으며 대화별 모델 선택 복원은 수정 후 재배포 검증 대기
- Ubuntu에서 `0003_provider_registry.sql` 적용과 LLM Gateway·OpenAI 실제 키 등록·모델 조회·동기화·활성 변경·감사 기록을 확인

2026-07-22 Ubuntu 최초 migration 실행은 internal backend network에서 Corepack이 `pnpm`을 내려받으려다 DNS `EAI_AGAIN`으로 실패했다. PostgreSQL은 healthy였고 migration 적용 전 실패하여 schema 손상은 없었다. Runtime command를 build된 JavaScript의 직접 `node` 실행으로 변경한 뒤 재배포하여 `0001_auth_foundation.sql` 적용, migrate exit code 0, API·Web·PostgreSQL·Valkey healthy와 readiness `database: ok`를 확인했다. Migration 재실행과 `schema_migrations` 직접 조회, DB 중단 시 readiness 503 확인은 남아 있다.

## 13. 오류·경계 조건

- 외부 provider가 필요한 시험은 fixture 기반 contract test와 실제 credential smoke test를 구분한다.
- Docker를 실행하지 않은 정적 Compose 검토는 통합 시험 통과로 기록하지 않는다.
- Windows에서 통과한 파일 권한 시험은 Linux `0600` 검증을 대체하지 않는다.

## 14. 미결정·보류 항목

- 실제 Ubuntu HTTPS 관리자 login 검증 후 Playwright E2E 자동화 범위를 확정한다.
- Anthropic·Google 실제 credential smoke test 결과를 `PROVIDER_CONTRACT_TESTS.md`에 기록한다.
