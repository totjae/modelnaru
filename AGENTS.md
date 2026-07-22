# ModelNaru 문서 관리 지침

이 파일은 프로젝트 명세 내용을 직접 담지 않는다. 개발 에이전트가 어떤 문서를 확인·작성·갱신해야 하는지 안내하는 **문서 색인과 문서화 규칙**만 관리한다.

## 1. 기본 규칙

1. 개발을 시작하기 전에 아래 문서 목록에서 관련 기준 문서를 확인한다.
2. 기능을 개발할 때 API, DB, 상태, 보안, 설정, 운영 방법 등 명세가 필요한 내용을 관련 문서에 먼저 작성하거나 함께 갱신한다.
3. 구현 결과가 기존 계획과 달라지면 해당 문서를 실제 구현에 맞게 수정한다.
4. 관련 상세 문서가 없으면 새 문서를 만들고, 같은 변경에서 이 파일의 문서 목록에 등록한다.
5. 신규 문서는 아래의 문서 등록 형식을 따른다.
6. 문서 갱신이 빠진 기능은 완료된 것으로 처리하지 않는다.
7. 실제 비밀번호, API key, token, TOTP secret, DB URL과 private key를 문서에 기록하지 않는다.

## 2. 현재 문서 목록

| 문서               | 위치                                                             | 작성·관리할 내용                                                  |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| 프로젝트 소개      | [README.md](./README.md)                                         | 프로젝트 개요, 주요 기능, 기술 구성, 운영 환경, 주요 문서 링크    |
| 전체 요구사항      | [REQUIREMENTS.md](./REQUIREMENTS.md)                             | 사용자 역할, 핵심 기능, 제한, 비기능 요구사항과 인수 조건         |
| AI 연동 명세       | [AI_INTEGRATION_SPEC.md](./AI_INTEGRATION_SPEC.md)               | 공통 AI 요청·응답, provider별 protocol, streaming, context와 요약 |
| Provider 등록 명세 | [PROVIDER_REGISTRATION_SPEC.md](./PROVIDER_REGISTRATION_SPEC.md) | provider template, 자격증명, model 조회, 고급 설정과 등록 흐름    |
| 관리자 로그 명세   | [ADMIN_LOGGING_SPEC.md](./ADMIN_LOGGING_SPEC.md)                 | 감사·보안·AI·파일·시스템 log, 마스킹, 보존과 관리자 조회          |
| 기술 선택          | [TECH_STACK_OPTIONS.md](./TECH_STACK_OPTIONS.md)                 | 기술 권장안, 대체안, 선택 근거와 호환 시 주의사항                 |
| 운영 환경          | [DEPLOYMENT_PROFILE.md](./DEPLOYMENT_PROFILE.md)                 | 서버 사양, Ubuntu, Nginx, port, 자원 한도와 backup 정책           |
| 서버 시작 설정     | [SERVER_CONFIG_SPEC.md](./SERVER_CONFIG_SPEC.md)                 | `config.yaml`, 관리자 설정 도구, 시작 검증과 Nginx 연결 기준      |
| 명세 점검          | [SPEC_AUDIT.md](./SPEC_AUDIT.md)                                 | 누락, 불일치, 구현 준비도와 추가 결정 사항                        |
| 명세 현황          | [SPEC_STATUS.md](./SPEC_STATUS.md)                               | 확정된 항목, 미확정 항목과 구현 착수 조건                         |
| 개발·문서 절차     | [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)             | 개발 전·중·후 문서 갱신 절차와 완료 조건                          |
| 구현 진행 현황     | [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)           | 기능별 계획·구현 중·완료·검증·보류 상태와 제한 사항               |
| API 상세 명세      | [API_SPEC.md](./API_SPEC.md)                                     | 구현된 endpoint, 인증, request·response, 오류와 상태 코드         |
| 보안 상세 명세     | [SECURITY_SPEC.md](./SECURITY_SPEC.md)                           | 인증 기반, 시작 설정, secret, proxy와 파일 권한 기준              |
| 배포 실행서        | [DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md)                 | Ubuntu 설치, 설정 초기화, 실행, Nginx, 점검과 복구 절차           |
| 시험 계획·결과     | [TEST_PLAN.md](./TEST_PLAN.md)                                   | 단위·통합·빌드·배포 시험 항목과 실제 실행 결과                    |
| 설계 결정 기록     | [DECISIONS.md](./DECISIONS.md)                                   | 확정된 구조, 선택한 대안, 이유, 영향과 변경 이력                  |
| Database 상세 명세 | [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)                       | table, column, 관계, index, migration과 삭제 정책                 |
| Provider 계약 시험 | [PROVIDER_CONTRACT_TESTS.md](./PROVIDER_CONTRACT_TESTS.md)       | provider별 fixture·모델 조회·연결 시험과 실제 자격증명 검증 결과  |
| 게스트 체험 명세   | [GUEST_ACCESS_SPEC.md](./GUEST_ACCESS_SPEC.md)                   | 공유 코드, 임시 session·격리·수명·모델 권한과 일일 호출 제한      |

## 3. 개발하면서 작성할 상세 문서

아래 문서는 해당 기능을 처음 구현하기 전에 생성한다. 생성한 즉시 이 파일의 **현재 문서 목록**에도 등록한다.

| 예정 문서                    | 기본 위치                      | 생성 시점              | 작성할 내용                                                     |
| ---------------------------- | ------------------------------ | ---------------------- | --------------------------------------------------------------- |
| `API_SPEC.md`                | `./API_SPEC.md`                | 첫 API 구현 전         | endpoint, 인증, request·response, 오류, pagination, idempotency |
| `DATABASE_SCHEMA.md`         | `./DATABASE_SCHEMA.md`         | 첫 migration 전        | table, column, 관계, index, unique, cascade와 삭제 정책         |
| `CHAT_STATE_SPEC.md`         | `./CHAT_STATE_SPEC.md`         | 채팅 저장 구현 전      | 생성, streaming, 취소, 실패, 재생성, branch 상태 전이           |
| `FILE_PROCESSING_SPEC.md`    | `./FILE_PROCESSING_SPEC.md`    | 파일 upload 구현 전    | 허용 형식, 크기, MIME, 추출, 저장, 만료와 삭제                  |
| `SECURITY_SPEC.md`           | `./SECURITY_SPEC.md`           | 인증·암호화 구현 전    | 인증, session, TOTP, CSRF, SSRF, 암호화와 secret 처리           |
| `PROVIDER_CONTRACT_TESTS.md` | `./PROVIDER_CONTRACT_TESTS.md` | Provider 구현 시       | provider별 fixture, model 조회, stream, usage와 오류 검증 결과  |
| `DEPLOYMENT_RUNBOOK.md`      | `./DEPLOYMENT_RUNBOOK.md`      | 첫 배포 전             | 설치, 실행, Nginx, update, rollback, healthcheck와 장애 대응    |
| `TEST_PLAN.md`               | `./TEST_PLAN.md`               | 첫 기능 구현 시        | 단위·통합·E2E·보안 시험 항목과 실행 결과                        |
| `DECISIONS.md`               | `./DECISIONS.md`               | 중요 설계 결정 발생 시 | 결정 내용, 대안, 선택 이유, 영향과 결정 날짜                    |

## 4. 개발 시 문서 갱신 기준

| 변경 내용                | 확인·갱신할 문서                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------- |
| 사용자·로그인·session    | `API_SPEC.md`, `DATABASE_SCHEMA.md`, `SECURITY_SPEC.md`, `TEST_PLAN.md`                 |
| 게스트 체험·호출 제한    | `GUEST_ACCESS_SPEC.md`, `API_SPEC.md`, `DATABASE_SCHEMA.md`, `SECURITY_SPEC.md`         |
| 대화·message·branch·요약 | `API_SPEC.md`, `DATABASE_SCHEMA.md`, `CHAT_STATE_SPEC.md`, `TEST_PLAN.md`               |
| provider·model·parameter | `AI_INTEGRATION_SPEC.md`, `PROVIDER_REGISTRATION_SPEC.md`, `PROVIDER_CONTRACT_TESTS.md` |
| 파일·PDF·이미지·OCR      | `FILE_PROCESSING_SPEC.md`, `DATABASE_SCHEMA.md`, `SECURITY_SPEC.md`, `TEST_PLAN.md`     |
| 관리자 log               | `ADMIN_LOGGING_SPEC.md`, `API_SPEC.md`, `DATABASE_SCHEMA.md`, `TEST_PLAN.md`            |
| config·관리자 설정 도구  | `SERVER_CONFIG_SPEC.md`, `SECURITY_SPEC.md`, `DEPLOYMENT_RUNBOOK.md`                    |
| Docker·Nginx·Ubuntu      | `DEPLOYMENT_PROFILE.md`, `DEPLOYMENT_RUNBOOK.md`, `TEST_PLAN.md`                        |
| 기능 진행 상태           | `IMPLEMENTATION_STATUS.md`                                                              |
| 중요한 설계 변경         | `DECISIONS.md`와 영향받는 기준 문서                                                     |

## 5. 신규 문서 등록 형식

새 문서를 만들면 **현재 문서 목록**에 다음 형식의 행을 추가한다.

```markdown
| 문서 표시 이름 | [FILE_NAME.md](FILE_NAME.md) | 이 문서에서 작성·관리하는 내용 |
```

하위 폴더에 만들 경우 실제 상대 경로를 사용한다.

```markdown
| Web UI 명세 | [docs/WEB_UI_SPEC.md](docs/WEB_UI_SPEC.md) | 화면 구조, 상태, 사용자 동작과 접근성 기준 |
```

신규 문서는 최소한 다음 내용을 포함한다.

```markdown
# 문서 제목

## 1. 목적

## 2. 적용 범위

## 3. 상세 명세

## 4. 오류·예외 또는 경계 조건

## 5. 검증·인수 조건

## 6. 미결정·보류 항목
```

문서 성격상 필요 없는 절은 생략할 수 있지만, 목적·상세 명세·검증 기준·미결정 항목은 구분해서 작성한다.

## 6. 작업 완료 전 확인

- 구현 내용과 관련 문서가 일치하는가?
- 신규 문서를 이 파일의 문서 목록에 등록했는가?
- 구현·시험 결과를 `IMPLEMENTATION_STATUS.md`와 `TEST_PLAN.md`에 반영했는가?
- 계획, 구현 완료와 미검증 상태를 구분했는가?
- 문서 링크가 실제 파일을 가리키는가?
- 문서와 예시에 비밀값이 없는가?
