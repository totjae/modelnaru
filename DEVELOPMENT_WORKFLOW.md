# 개발 및 상세 문서 관리 원칙

## 1. 목적

다음 단계부터 실제 개발을 진행하면서 구현 상세 문서를 코드와 함께 지속적으로 작성하고 갱신한다. 문서는 사전 계획용 초안으로 끝내지 않고 실제 동작을 설명하는 최신 기준 자료로 유지한다.

코드 변경으로 API, DB, 설정, 보안, 운영 방법 또는 사용자 동작이 달라지면 관련 문서 갱신도 같은 작업 범위에 포함한다. 문서가 갱신되지 않은 기능은 완료된 것으로 처리하지 않는다.

## 2. 기본 원칙

1. **코드와 문서를 함께 변경한다.** 관련 문서 수정은 선택 작업이 아니다.
2. **구현 전에는 설계 상태, 구현 후에는 실제 상태를 기록한다.** 계획과 실제 구현이 다르면 문서를 코드에 맞게 즉시 수정하고 변경 이유를 남긴다.
3. **한 곳을 기준 원장으로 정한다.** 같은 개념을 여러 문서에 중복 정의하지 않고 다른 문서는 기준 문서로 연결한다.
4. **검증 가능한 내용을 쓴다.** endpoint, field, 상태, 오류 코드, 명령, 경로와 기본값을 구체적으로 기록한다.
5. **비밀값은 기록하지 않는다.** 실제 비밀번호, TOTP secret, API key, DB URL과 암호화 key는 문서·예시·시험 결과에 넣지 않는다.
6. **미완성 상태를 숨기지 않는다.** `계획`, `구현 중`, `구현 완료`, `검증 완료`, `보류` 상태를 구분한다.
7. **문서만 바뀐 추측을 구현 사실처럼 적지 않는다.** 실제 시험하지 않은 provider와 배포 절차는 `미검증`으로 표시한다.

## 3. 상세 문서 목록

개발하면서 다음 문서를 생성하고 유지한다.

| 문서 | 작성 시점 | 주요 내용 |
|---|---|---|
| `API_SPEC.md` | 첫 API 구현 전 | endpoint, 인증, request·response, pagination, 오류, idempotency |
| `DATABASE_SCHEMA.md` | 첫 migration 전 | table, column, FK, index, unique, cascade, 보존·삭제 |
| `CHAT_STATE_SPEC.md` | 채팅 저장 구현 전 | 생성·streaming·완료·취소·부분실패·재생성·branch 상태 전이 |
| `FILE_PROCESSING_SPEC.md` | upload 구현 전 | MIME, 크기, encoding, PDF, 이미지, 저장·만료·삭제 queue |
| `SECURITY_SPEC.md` | 인증 구현 전 | 관리자 bootstrap, Argon2id, TOTP, session, CSRF, CSP, SSRF, encryption |
| `PROVIDER_CONTRACT_TESTS.md` | 첫 provider adapter 구현 시 | provider별 model 조회, request fixture, stream, usage, 오류 검증 결과 |
| `DEPLOYMENT_RUNBOOK.md` | 첫 서버 배포 전 | Ubuntu 설치, Compose, Nginx, port, update, rollback, healthcheck |
| `TEST_PLAN.md` | 첫 기능 구현과 동시에 | 단위·통합·E2E·보안·복구 시험과 인수 결과 |
| `IMPLEMENTATION_STATUS.md` | 개발 시작 시 | 기능별 진행 상태, 검증 결과, 알려진 제한 |
| `DECISIONS.md` | 설계 선택 발생 시 | 결정, 대안, 선택 이유, 영향과 변경 날짜 |

외부 backup을 사용하지 않는 현재 정책에서는 `DEPLOYMENT_RUNBOOK.md`에 데이터 유실 위험과 선택적 local dump까지만 기록한다. 추후 외부 backup을 도입하면 별도 `BACKUP_RESTORE_RUNBOOK.md`를 만든다.

## 4. 기존 상위 명세와의 관계

- 제품 요구사항: [REQUIREMENTS.md](./REQUIREMENTS.md)
- AI protocol과 컨텍스트: [AI_INTEGRATION_SPEC.md](./AI_INTEGRATION_SPEC.md)
- provider 등록: [PROVIDER_REGISTRATION_SPEC.md](./PROVIDER_REGISTRATION_SPEC.md)
- 관리자 로그: [ADMIN_LOGGING_SPEC.md](./ADMIN_LOGGING_SPEC.md)
- 기술 선택: [TECH_STACK_OPTIONS.md](./TECH_STACK_OPTIONS.md)
- 배포 환경: [DEPLOYMENT_PROFILE.md](./DEPLOYMENT_PROFILE.md)
- 시작 config와 계정 도구: [SERVER_CONFIG_SPEC.md](./SERVER_CONFIG_SPEC.md)

상위 명세는 의도와 정책을 설명하고, 새 상세 문서는 실제 구현 계약을 설명한다. 충돌이 발견되면 임의로 한쪽만 따르지 않고 다음 순서로 처리한다.

1. 충돌 항목을 `DECISIONS.md`에 기록한다.
2. 사용자가 확정한 최신 요구를 우선한다.
3. 코드와 관련된 모든 문서를 같은 변경에서 정렬한다.
4. 회귀 시험과 인수 조건을 갱신한다.

## 5. 기능 개발 작업 순서

### 작업 시작 전

- 관련 상위 명세와 기존 상세 문서를 확인한다.
- `IMPLEMENTATION_STATUS.md`에서 기능을 `구현 중`으로 표시한다.
- API·DB·상태 전이에 영향을 주면 해당 상세 문서 초안을 먼저 작성하거나 갱신한다.
- 불명확한 값은 임의의 확정값으로 숨기지 않고 `검토 필요`와 권장 기본값을 기록한다.

### 구현 중

- 실제 type, schema, migration, endpoint와 문서의 명칭을 맞춘다.
- 설계가 달라지면 구현을 마친 뒤 한꺼번에 정리하지 않고 즉시 문서를 수정한다.
- provider별 예외, 오류 응답과 stream fixture를 발견하면 contract test 문서에 추가한다.
- 운영 명령이나 config 항목이 바뀌면 예제 config와 runbook을 같이 수정한다.

### 작업 완료 시

- 구현과 문서가 일치하는지 대조한다.
- 실행한 시험과 결과를 `TEST_PLAN.md` 또는 관련 검증 문서에 기록한다.
- 알려진 제한과 미검증 항목을 `IMPLEMENTATION_STATUS.md`에 기록한다.
- 관련 인수 조건을 통과한 경우에만 `구현 완료` 또는 `검증 완료`로 변경한다.
- 문서의 local link와 예제 명령이 유효한지 확인한다.

## 6. 변경 유형별 필수 갱신 문서

| 변경 유형 | 반드시 확인·갱신할 문서 |
|---|---|
| 로그인·사용자·session | `API_SPEC.md`, `DATABASE_SCHEMA.md`, `SECURITY_SPEC.md`, `TEST_PLAN.md` |
| 대화·message·branch | `API_SPEC.md`, `DATABASE_SCHEMA.md`, `CHAT_STATE_SPEC.md`, `TEST_PLAN.md` |
| provider·model·parameter | `AI_INTEGRATION_SPEC.md`, `PROVIDER_REGISTRATION_SPEC.md`, `PROVIDER_CONTRACT_TESTS.md` |
| 파일·PDF·이미지·OCR | `FILE_PROCESSING_SPEC.md`, `DATABASE_SCHEMA.md`, `SECURITY_SPEC.md`, `TEST_PLAN.md` |
| 관리자 log | `ADMIN_LOGGING_SPEC.md`, `DATABASE_SCHEMA.md`, `API_SPEC.md`, `TEST_PLAN.md` |
| config·port·계정 CLI | `SERVER_CONFIG_SPEC.md`, `DEPLOYMENT_RUNBOOK.md`, `SECURITY_SPEC.md` |
| Compose·Nginx·Ubuntu | `DEPLOYMENT_PROFILE.md`, `DEPLOYMENT_RUNBOOK.md`, `TEST_PLAN.md` |
| retention·삭제 | `DATABASE_SCHEMA.md`, `FILE_PROCESSING_SPEC.md`, `ADMIN_LOGGING_SPEC.md` |

## 7. API와 DB의 자동 생성 자료

- REST API는 구현과 함께 OpenAPI schema를 생성하되 `API_SPEC.md`에는 인증, 오류, idempotency와 업무 규칙을 별도로 설명한다.
- DB schema와 migration 파일이 최종 실행 기준이지만 `DATABASE_SCHEMA.md`에는 관계, cascade와 삭제 의미를 사람이 읽을 수 있게 설명한다.
- TypeScript type만으로 provider별 실제 wire format을 대신하지 않고 request·response fixture를 보관한다.
- 생성된 문서를 수동으로 복사해 방치하지 않고 build 또는 test 과정에서 최신 여부를 검사한다.

## 8. 완료 정의(Definition of Done)

기능 하나가 완료되려면 다음 조건을 모두 만족해야 한다.

- 요구사항과 인수 조건을 충족
- 관련 코드와 migration 작성
- 관련 상세 문서 작성·갱신
- 단위 또는 통합 시험 추가
- 권한·오류·경계값 시험 수행
- 비밀값이 log, fixture와 문서에 없는지 확인
- 운영 또는 config 변경이 있으면 runbook 갱신
- 알려진 제한과 미검증 항목 기록

문서 갱신이 빠진 경우 기능 상태는 `구현 완료`가 아니라 `문서화 필요`로 유지한다.

## 9. 개발 시작 순서

권장 첫 개발 순서는 다음과 같다.

1. monorepo와 Docker Compose 골격
2. `config.yaml` loader·validator와 `apichat-admin` 도구
3. PostgreSQL 초기 schema와 migration
4. 고정 관리자 로그인·TOTP·session
5. 관리자 사용자 관리
6. provider registry·자격증명 암호화
7. 기본 채팅·streaming·대화 저장
8. 파일 upload·텍스트·PDF·이미지 처리
9. branch·컨텍스트 요약
10. 관리자 log·운영 화면

각 단계가 시작될 때 관련 상세 문서를 함께 만들고, 구현이 끝날 때 실제 결과로 갱신한다.
