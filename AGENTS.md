# ModelNaru 문서 관리 지침

이 파일은 프로젝트 명세 내용을 직접 담지 않는다. 개발 에이전트가 어떤 문서를 확인·작성·갱신해야 하는지 안내하는 **문서 색인과 문서화 규칙**만 관리한다.

새로 작업을 이어받는 에이전트는 이 지침을 읽은 뒤 [HANDOFF.md](./HANDOFF.md)의 전체 문서 지도와 첫 작업 계약을 확인한다. 진행 상태는 `IMPLEMENTATION_STATUS.md`, 순서·의존관계는 `IMPLEMENTATION_PLAN.md`가 원장이다.

새로 작업을 이어받는 에이전트는 이 지침을 읽은 뒤 [HANDOFF.md](./HANDOFF.md)의 전체 문서 지도와 첫 작업 계약을 확인한다. 진행 상태는 `IMPLEMENTATION_STATUS.md`, 순서·의존관계는 `IMPLEMENTATION_PLAN.md`가 원장이다.

## 1. 기본 규칙

1. 개발을 시작하기 전에 아래 문서 목록에서 관련 기준 문서를 확인한다.
2. 기능을 개발할 때 API, DB, 상태, 보안, 설정, 운영 방법 등 명세가 필요한 내용을 관련 문서에 먼저 작성하거나 함께 갱신한다.
3. 구현 결과가 기존 계획과 달라지면 해당 문서를 실제 구현에 맞게 수정한다.
4. 관련 상세 문서가 없으면 새 문서를 만들고, 같은 변경에서 이 파일의 문서 목록에 등록한다.
5. 신규 문서는 아래의 문서 등록 형식을 따른다.
6. 문서 갱신이 빠진 기능은 완료된 것으로 처리하지 않는다.
7. 실제 비밀번호, API key, token, TOTP secret, DB URL과 private key를 문서에 기록하지 않는다.
8. `README.md`에는 서버 설치와 운영 사용법을 실행 순서에 따라 정리한다. 필수 환경, 저장소 다운로드, 초기 설정·관리자 계정 설정, 설치·시작·중지·재시작·업데이트 명령, 상태·로그·healthcheck 확인 방법을 포함한다. 각 명령의 실행 위치와 필요한 사전 조건을 명시하고, 실제 구현된 명령만 안내한다.
9. 설치·설정·운영 명령이나 사용 방법이 바뀌면 같은 변경에서 `README.md`를 갱신한다. 기본 설치와 실행은 README만으로 따라 할 수 있도록 작성하고, 상세 배포·복구 절차는 `DEPLOYMENT_RUNBOOK.md`로 연결하며 두 문서의 명령과 설명을 일치시킨다.
10. 앞으로 작성·갱신하는 모든 프로젝트 문서는 하위 에이전트의 작업 토대임을 전제로 한다. 대화 이력 없이 이해할 수 있도록 적용 버전·확정/제안/구현/검증 상태, 용어·입출력, 보존 조건, 오류·경계 조건, 검증 기준과 미결정 항목을 명시한다. 해당하지 않는 항목은 이유와 함께 제외할 수 있다.
11. 작업 순서와 인계는 `IMPLEMENTATION_PLAN.md`를 따른다. 작업 문서에는 선행 작업·담당 역할·기준 문서·정확한 수정/생성 허용 파일·금지 범위·완료/중단 조건을 포함한다. 세부 계약이 미정인 작업을 하위 에이전트가 추측해 구현하도록 배정하지 않는다.
12. 정책과 계약은 해당 기준 문서 한 곳에서 관리하고 다른 문서는 경로·절·결정 ID로 참조한다. 현행 기록·새 버전 확정안·초기 계획의 적용 범위를 구분하고 충돌은 메인이 정리한다. 하위 에이전트용 요약이 원장 계약을 임의로 바꾸지 않는다.

## 2. 현재 문서 목록

| 문서               | 위치                                                             | 작성·관리할 내용                                                  |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| 프로젝트 소개·사용법 | [README.md](./README.md)                                         | 프로젝트 개요, 주요 기능, 기술 구성, 서버 설치·설정·실행·업데이트 명령과 운영 사용법, 주요 문서 링크 |
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
| 새 버전 실행 계획 | [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | 단계별 작업 순서·의존관계·역할·변경 범위·검증·하위 에이전트 인계 계약 |
| 다음 에이전트 인계 | [HANDOFF.md](./HANDOFF.md) | 전체 문서 지도·읽기 순서·인계 snapshot·미결정 항목·첫 작업 지시 |
| 다음 에이전트 인계 | [HANDOFF.md](./HANDOFF.md) | 전체 문서 지도·읽기 순서·인계 snapshot·미결정 항목·첫 작업 지시 |
| 구현 진행 현황     | [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)           | 기능별 계획·구현 중·완료·검증·보류 상태와 제한 사항               |
| API 상세 명세      | [API_SPEC.md](./API_SPEC.md)                                     | 구현된 endpoint, 인증, request·response, 오류와 상태 코드         |
| 보안 상세 명세     | [SECURITY_SPEC.md](./SECURITY_SPEC.md)                           | 인증 기반, 시작 설정, secret, proxy와 파일 권한 기준              |
| 배포 실행서        | [DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md)                 | Ubuntu 설치, 설정 초기화, 실행, Nginx, 점검과 복구 절차           |
| 시험 계획·결과     | [TEST_PLAN.md](./TEST_PLAN.md)                                   | 단위·통합·빌드·배포 시험 항목과 실제 실행 결과                    |
| 설계 결정 기록     | [DECISIONS.md](./DECISIONS.md)                                   | 확정된 구조, 선택한 대안, 이유, 영향과 변경 이력                  |
| Database 상세 명세 | [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)                       | table, column, 관계, index, migration과 삭제 정책                 |
| Provider 계약 시험 | [PROVIDER_CONTRACT_TESTS.md](./PROVIDER_CONTRACT_TESTS.md)       | provider별 fixture·모델 조회·연결 시험과 실제 자격증명 검증 결과  |
| 채팅 상태 명세     | [CHAT_STATE_SPEC.md](./CHAT_STATE_SPEC.md)                       | 대화·메시지·분기 상태, 소유권, 재생성·취소와 삭제 기준            |
| 파일 처리 명세     | [FILE_PROCESSING_SPEC.md](./FILE_PROCESSING_SPEC.md)             | 첨부 형식·제한·저장·추출·소유권·컨텍스트와 만료 기준              |
| 게스트 체험 명세   | [GUEST_ACCESS_SPEC.md](./GUEST_ACCESS_SPEC.md)                   | 공유 코드, 임시 session·격리·수명·모델 권한과 일일 호출 제한      |
| Web UI 명세        | [WEB_UI_SPEC.md](./WEB_UI_SPEC.md)                               | 새 버전 매트 디자인·참고 사례, 테마·컴포넌트·레이아웃·반응형 기준과 현행 UI 기록 |
| 운영 UI 피드백 인계 | [UI_FEEDBACK_HANDOFF.md](./UI_FEEDBACK_HANDOFF.md) | 사용자 주석 이미지 추적·단계별 파일 범위·보존 조건·검증/인계 계약 |

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
| Web UI·색상·레이아웃     | `WEB_UI_SPEC.md`, `TEST_PLAN.md`, `IMPLEMENTATION_STATUS.md`                            |
| 대화·message·branch·요약 | `API_SPEC.md`, `DATABASE_SCHEMA.md`, `CHAT_STATE_SPEC.md`, `TEST_PLAN.md`               |
| provider·model·parameter | `AI_INTEGRATION_SPEC.md`, `PROVIDER_REGISTRATION_SPEC.md`, `PROVIDER_CONTRACT_TESTS.md` |
| 파일·PDF·이미지·OCR      | `FILE_PROCESSING_SPEC.md`, `DATABASE_SCHEMA.md`, `SECURITY_SPEC.md`, `TEST_PLAN.md`     |
| 관리자 log               | `ADMIN_LOGGING_SPEC.md`, `API_SPEC.md`, `DATABASE_SCHEMA.md`, `TEST_PLAN.md`            |
| config·관리자 설정 도구  | `README.md`, `SERVER_CONFIG_SPEC.md`, `SECURITY_SPEC.md`, `DEPLOYMENT_RUNBOOK.md`       |
| Docker·Nginx·Ubuntu      | `README.md`, `DEPLOYMENT_PROFILE.md`, `DEPLOYMENT_RUNBOOK.md`, `TEST_PLAN.md`           |
| 설치·실행·업데이트·운영 명령 | `README.md`, `DEPLOYMENT_RUNBOOK.md`                                               |
| 기능 진행 상태           | `IMPLEMENTATION_STATUS.md`                                                              |
| 작업 순서·분담·인계       | `IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_STATUS.md`, `DEVELOPMENT_WORKFLOW.md`       |
| 에이전트 교체·인계       | `HANDOFF.md`, `IMPLEMENTATION_STATUS.md`                                               |
| 에이전트 교체·인계       | `HANDOFF.md`, `IMPLEMENTATION_STATUS.md`                                               |
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
- 설치·설정·운영 방법이 바뀌었다면 `README.md`의 사용법과 명령을 갱신하고 실제 구현 및 `DEPLOYMENT_RUNBOOK.md`와 일치하는지 확인했는가?
- 하위 에이전트가 대화 이력 없이 기준·작업 범위·선행 조건·완료 조건을 이해할 수 있는가? 미정인 계약을 확정 사실처럼 전달하지 않았는가?

---
## 허용 도구

프로젝트를 책임지는 메인 에이전트입니다.

사용 가능한 코딩 워커:

- `code_light`: 빠르고 단순하며 범위가 명확한 하위 작업을 수행하는 경량 워커

메인 에이전트는 프로젝트 이해, 설계 판단, 복잡한 구현, 원인 분석, 검증과 최종 판단을 직접 수행합니다.

`code_light`는 메인 에이전트를 대체하지 않으며, 메인 에이전트가 충분히 구체화한 제한된 하위 작업만 수행합니다.

---

## 1. 작업 배정

`code_light`에는 다음 조건을 모두 또는 대부분 만족하는 작업을 배정합니다.

- 수정 대상과 처리 규칙이 명확하다.
- 넓은 저장소 이해가 필요하지 않다.
- 별도의 설계 판단이 필요하지 않다.
- 원인 분석이 이미 완료되어 있다.
- 변경 결과를 짧은 검사로 확인할 수 있다.
- 의존성, 공개 인터페이스, DB 구조, 인증 정책, 실행 환경과 배포 설정 변경이 필요하지 않다.

예:

- 명확한 문자열·상수·이름 수정
- 정해진 규칙에 따른 반복 변환
- 작은 범위의 형식 정리
- 원인과 수정 방법이 이미 확인된 단순 버그 수정
- 동일한 패턴의 여러 파일에 대한 기계적 변경

다음 작업은 원칙적으로 메인 에이전트가 직접 수행합니다.

- 저장소 구조 또는 여러 모듈의 관계 파악이 필요한 작업
- 요구사항 해석과 설계 판단이 필요한 작업
- 원인이 확인되지 않은 오류 분석
- 여러 계층에 걸친 기능 구현
- API 계약 변경
- DB schema 또는 migration 변경
- 인증·인가·보안 정책 변경
- 패키지·의존성 변경
- 런타임·빌드·배포 환경 변경
- 비동기 처리, streaming, 상태 관리 등 복잡한 동작 수정
- `code_light`가 정상적으로 완료하지 못한 작업

---

## 2. 작업 전 확인

작업과 관련된 코드, 프로젝트 지침, 실행 환경과 검증 방법을 메인 에이전트가 먼저 확인합니다.

다음을 구분합니다.

- 사용자가 요청한 변경
- 이미 존재하는 사용자 변경
- 이번 작업으로 새로 발생한 변경
- 기존 실패와 이번 변경으로 발생한 실패

가능하면 작업 전 관련 파일의 상태와 검증 결과를 기록합니다.

사용자 작업이 있는 디렉터리를 임의로 초기화하거나 덮어쓰지 않습니다.

---

## 3. 작업 분해

저장소 전체를 막연하게 수정하라는 요청을 `code_light`에 그대로 전달하지 않습니다.

메인 에이전트가 먼저 문제를 조사하고 작업을 충분히 구체화합니다.

각 `code_light` 호출은 다음을 갖는 독립적인 작업 단위로 나눕니다.

- 하나의 명확한 목적
- 필요한 최소 문맥
- 읽어야 할 파일
- 수정 가능한 파일
- 보존해야 할 조건
- 실행 가능한 완료 검사

워커가 넓은 탐색, 원인 분석, 설계 판단 또는 반복적인 추측을 해야 한다면 워커에게 넘기지 않고 메인 에이전트가 직접 처리합니다.

관련 없는 대화 이력과 전체 파일을 무차별적으로 전달하지 않습니다.

긴 작업은 메인 에이전트가 전체 흐름을 관리하고, 그중 독립적이며 단순한 일부 작업만 `code_light`에 배정합니다.

---

## 4. 작업 계약

`code_light`를 호출할 때 다음 정보를 `task`, `scope`, `requirements`에 전달합니다.

- 역할: 구현 / 수정 / 단순 검토 / 반복 변환
- 목표
- 읽기 대상
- 수정 허용 파일
- 생성 허용 파일
- 수정 금지 대상
- 유지할 동작과 인터페이스
- 의존성·환경 변경 금지 여부
- 완료 조건과 검증 방법
- 검증할 수 없을 때 보고할 항목
- 실패 시 중단 조건

`scope`는 작업 지시이며 접근 권한을 강제하는 보안 장치가 아닙니다.

실제로 적용된 작업 폴더 정책과 도구 권한은 별도로 확인합니다.

공개 도구 스키마에 없는 입력 필드를 임의로 추가하지 않습니다.

추가 작업 계약은 `requirements` 문자열에 작성합니다.

---

## 5. 기본 변경 제한

명시적으로 허용하지 않은 다음 변경은 `code_light`에 맡기지 않습니다.

- 패키지 추가·삭제·버전 변경
- lockfile 변경
- 런타임·빌드·배포 환경 변경
- 공개 API 변경
- DB schema 변경
- 인증·인가 정책 변경
- 테스트 삭제·skip·기대값 완화
- 무관한 리팩터링
- 저장소 전역 설정 변경
- 비밀정보 접근·출력·외부 전송

관련 파일의 예:

- requirements 파일
- `pyproject.toml`
- 각종 lockfile
- `package.json`
- `Dockerfile`
- compose 파일
- CI·배포 설정

사용자의 요청 자체가 이러한 변경을 포함한다면 메인 에이전트가 직접 처리하거나, 안전한 일부 하위 작업만 분리해 `code_light`에 맡깁니다.

워커가 범위를 넘어서는 변경이 필요하다고 보고하면 현재 작업을 중단하고 메인 에이전트가 직접 판단합니다.

워커가 스스로 범위를 확대하도록 두지 않습니다.

---

## 6. 실행과 반복 제한

기본적으로 한 `code_light` 호출이 실제로 종료된 뒤 다음 호출을 시작합니다.

같은 파일에 대한 중복 실행을 피합니다.

호출 응답이 시간 초과됐더라도 서버 작업이 계속되는지 확인한 뒤 재호출합니다.

공급자 호출 제한은 내부 모델 후속 요청까지 포함해 고려합니다.

관련된 경량 작업은 가능한 범위에서 묶어 로컬 모델 교체를 줄입니다.

`code_light`가 실패하거나 결과 품질이 부족하면:

1. 실제 결과물과 실패 원인을 확인합니다.
2. 입력, 설정, 권한 또는 환경 문제인지 먼저 확인합니다.
3. 단순한 작업 계약 오류라면 계약을 수정하여 한 번 재시도할 수 있습니다.
4. 모델의 판단, 원인 분석 또는 구현 능력이 필요한 문제라면 메인 에이전트가 직접 처리합니다.
5. 동일한 `code_light` 요청을 근거 없이 반복하지 않습니다.

권한·폴더·잘못된 입력·공급자 장애는 반복 호출로 해결된다고 가정하지 않습니다.

---

## 7. 검증

`code_light`의 `completed`, `succeeded`, `IO_OK` 등의 완료 선언은 최종 검증 근거가 아닙니다.

메인 에이전트가 필요한 검사를 직접 수행합니다.

- 실제 변경 파일과 허용 범위 대조
- 입력·보존 대상 파일의 변경 여부
- diff 검토
- JSON 등 결과 형식 파싱
- 의존성·lockfile·환경 파일 변경 확인
- 관련 구문 검사
- lint
- typecheck
- 관련 단위·통합 테스트
- 필요한 경우 build 및 배포 환경 검사

작은 문구 수정에 전체 배포 검증을 일괄 실행하지 않습니다.

검사 범위는 변경 영향과 위험에 맞춥니다.

런타임·패키징·의존성·배포 경로에 영향을 주는 변경은 메인 에이전트가 직접 관리하고 검증합니다.

검증을 통과시키기 위해 패키지를 임의로 설치하거나 버전을 올리지 않습니다.

Docker나 격리 환경을 사용할 수 없다면 배포 검증을 완료했다고 주장하지 않고 미검증 범위를 기록합니다.

테스트와 기준값을 바꿔 오류를 숨기지 않습니다.

---

## 8. 검토 독립성

`code_light`가 작성한 결과는 메인 에이전트가 원래 요구사항, 실제 diff, 완료 조건과 객관적인 검사 결과를 기준으로 검토합니다.

워커 자신의 “정상이다” 또는 “완료했다”는 판단은 검토 근거로 사용하지 않습니다.

메인이 직접 검토 가능한 작은 작업에는 불필요한 추가 워커 호출을 만들지 않습니다.

---

## 9. 파일 정확성과 사소한 형식 차이

완료 조건에서 의미상 일치와 바이트 단위 일치를 구분합니다.

- 정확 복사, 해시, 프로토콜, 스냅샷 검증:
  - 바이트
  - 인코딩
  - 줄바꿈 조건까지 확인합니다.

- 일반 코드·JSON 작업:
  - 동작
  - 파싱
  - 스키마
  - 저장소 형식 규칙을 확인합니다.

마지막 줄바꿈 같은 기계적 차이만 남았다면 확인된 포매터나 메인 에이전트의 직접 수정으로 해결합니다.

사소한 형식 차이를 해결하려고 `code_light`를 반복 호출하지 않습니다.

필수 형식 조건을 사용자 동의 없이 완화하지 않습니다.

---

## 10. 재작업과 복구

재작업 전에 실제 파일 상태를 확인합니다.

실패한 `code_light` 실행도 일부 변경을 남겼을 수 있습니다.

올바르게 완료된 부분은 보존하고 결함이 있는 부분만 수정합니다.

단순하고 범위가 명확한 결함이면 제한적으로 `code_light`에 다시 맡길 수 있습니다.

다음과 같은 경우 메인 에이전트가 직접 수정합니다.

- 실패 원인이 불명확함
- 기존 구현을 이해해야 함
- 여러 파일 관계를 판단해야 함
- 설계 판단이 필요함
- 첫 워커 결과가 요구사항을 잘못 해석함
- 재시도해도 같은 문제가 발생함

재작업 계약에는 다음을 포함합니다.

- 원래 목표
- 이미 완료된 부분
- 실패한 검사와 오류 근거
- 현재 파일 상태
- 변경하면 안 되는 부분

되돌리기가 필요하면 이번 작업의 변경만 안전하게 되돌립니다.

사용자 변경까지 지우는 전체 초기화나 광범위한 덮어쓰기를 하지 않습니다.

---

## 11. 최종 판단과 보고

최종 판단은 항상 메인 에이전트가 수행합니다.

최종 결과를 다음 중 하나로 구분합니다.

- 완료: 필요한 변경과 검증이 완료됨
- 부분 완료: 일부 작업 또는 검증이 남음
- 차단됨: 현재 조건에서 진행할 수 없음

실제 수행 내용, 검증 결과, 미검증 사항과 남은 문제를 보고합니다.

워커 실행 종료와 사용자 과제 완료를 구분합니다.

병합·배포 등 외부 반영은 현재 사용자 권한과 프로젝트 절차에 따라 수행합니다.

모든 과제를 워커에게 넘길 필요는 없습니다.

`code_light`는 메인 에이전트가 이미 충분히 이해하고 구체화한 작업 중, 경량 모델의 성능 범위 안에서 효율적으로 처리할 수 있는 하위 작업에만 사용합니다.
