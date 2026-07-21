# 전체 명세 점검 결과

## 1. 결론

현재 문서는 **기능 범위 확정과 prototype·provider engine 개발을 시작하기에는 충분**하다. 그러나 운영 가능한 MVP 전체를 곧바로 구현하는 기준으로는 아직 부족하다.

남은 내용은 새로운 기능 아이디어보다 다음 두 종류가 대부분이다.

1. 서비스 운영자가 제공해야 하는 실제 환경 정보: 사용자 수, 동시 요청 수, 서버, 공개 범위, 도메인, backup 목표
2. 개발 상세 설계에서 정해야 하는 정확한 동작: API 계약, DB 관계, 요청 중복 방지, 삭제 순서, 시간 제한, 오류 상태

따라서 “무엇을 만들 것인가”는 대부분 정해졌지만 “어느 규모와 환경에서, 실패했을 때 정확히 어떻게 동작할 것인가”가 일부 남아 있다.

## 2. 점검 범위

- [REQUIREMENTS.md](./REQUIREMENTS.md): 전체 제품 요구사항
- [AI_INTEGRATION_SPEC.md](./AI_INTEGRATION_SPEC.md): AI 요청·응답 변환과 컨텍스트
- [PROVIDER_REGISTRATION_SPEC.md](./PROVIDER_REGISTRATION_SPEC.md): 제공자 template와 자격증명
- [ADMIN_LOGGING_SPEC.md](./ADMIN_LOGGING_SPEC.md): 운영·보안·감사 로그
- [TECH_STACK_OPTIONS.md](./TECH_STACK_OPTIONS.md): 구현 기술과 대체안
- `provider-manager-v1.10.0.js`: 제공자와 설정 참고 원본

## 3. 영역별 완성도

| 영역 | 상태 | 점검 결과 |
|---|---|---|
| 사용자 역할·회원가입 정책 | 확정 | 고정 관리자, 관리자 생성 사용자, 회원가입 없음 |
| 사용자 데이터 격리 | 확정 | 서버 소유권 검사와 사용자별 대화·파일 분리 원칙 존재 |
| 로그인·세션 | 부분 확정 | 3세션·24시간 idle·7일 absolute는 확정, MFA·비밀번호 정책·복구 절차는 미정 |
| 대화·분기 | 부분 확정 | 모델 변경·재생성 분기는 확정, 동시 요청·중복 전송 상태 머신은 상세 설계 필요 |
| 컨텍스트·요약 | 부분 확정 | 사용자 설정과 요약 원칙은 확정, tokenizer·요약 결과 규격·동시 갱신 규칙은 미정 |
| AI 제공자 | 부분 확정 | 참고 파일의 전체 catalog 보존 원칙은 확정, 제공자별 검증 등급과 복잡한 인증 제공자의 MVP 범위는 미정 |
| AI 요청 규격 | 부분 확정 | OpenAI·Anthropic·Gemini 엔진 방향은 확정, fixture와 정확한 오류·timeout 기본값 필요 |
| 사용자 파라미터 | 확정 | 모델 정책과 관리자 허용 범위 내에서만 수정 |
| 첨부파일 | 부분 확정 | 형식·10MB·10개·PDF 100페이지·30일 보관은 확정, 이미지 해상도와 악성 파일 검사 정책은 미정 |
| 로그 | 대부분 확정 | 종류·필드·마스킹·보관·내보내기 존재, 감사 로그 위변조 방지 방식은 미정 |
| 관리자 화면 | 부분 확정 | 필요한 메뉴는 정의, 실제 화면 흐름·wireframe 미정 |
| 기술 스택 | 권장안 확정 | 대체 기술도 정리됨, 서버 환경에 따라 최종 선택 필요 |
| 배포·HTTPS | 대부분 확정 | Ubuntu 24.04.4 LTS·Compose·기존 Nginx 80·443과 앱 32432, 실제 배포 root만 필요 |
| backup·복구 | 정책 확정 | 초기 외부 backup 미구성, 장애 시 데이터 유실 위험 수용 |
| 성능·가용성 | 미확정 | 동시 요청 수, latency 목표, 자원 한도와 허용 중단 시간이 필요 |
| 법적·개인정보 안내 | 미확정 | 파일·대화가 외부 AI 제공자에 전달된다는 안내와 운영 지역별 검토 필요 |

## 4. 이번 점검에서 확인한 명세 불일치와 조치

### 4.1 전체 제공자 요구와 1차 구현 범위

요구사항은 `provider-manager-v1.10.0.js`의 서비스 제공자 catalog를 동일하게 가져오는 방향인데 기존 1차 구현 목록은 네 제공자만 적혀 있었다.

다음처럼 통일한다.

- 참고 파일에서 확인한 **전체 template catalog는 서버 내장 snapshot으로 1차 배포에 포함**한다.
- OpenAI, Anthropic, Google AI Studio, LLM Gateway는 `verified` 등급으로 출시 전 실제 연동 시험을 필수 수행한다.
- OpenAI 호환 template 제공자는 `compatible` 또는 `experimental` 등급으로 표시하고 공통 contract test를 통과한 항목부터 활성화한다.
- Vertex AI, Bedrock, Copilot처럼 별도 서명·OAuth가 필요한 내장 제공자는 catalog에는 보이되 전용 adapter가 완료되지 않으면 `준비 중`으로 표시한다.
- 따라서 “목록을 모두 가져온다”와 “모두 같은 수준으로 검증한다”를 구분한다.

### 4.2 Gemini GenerateContent 상세 규격

기존 AI 명세에는 Gemini 엔진이 1차 범위에 포함됐지만 OpenAI·Anthropic과 같은 수준의 변환 규칙이 없었다. `AI_INTEGRATION_SPEC.md`에 Gemini 요청·이미지·system instruction·stream parsing·usage 변환 기준을 추가했다.

### 4.3 AI 데이터베이스 명칭 중복

`AI_INTEGRATION_SPEC.md`의 `ai_providers`·`ai_credentials`와 `PROVIDER_REGISTRATION_SPEC.md`의 `provider_connections`·`provider_credentials`가 같은 개념을 다른 이름으로 표현하고 있었다.

`PROVIDER_REGISTRATION_SPEC.md`의 `provider_templates`, `provider_connections`, `provider_credentials`, `provider_models`를 물리 테이블 기준으로 사용한다. AI 명세의 `ai_*` 이름은 논리 개념 설명으로만 취급하고 상세 DB 설계에서 별도 중복 테이블을 만들지 않는다.

### 4.4 Gemini API 세대 차이

참고 JS는 Gemini GenerateContent 계열을 사용하지만 2026-07-21 현재 Google은 최신 기능에 Interactions API를 권장한다. 기존 제공자 호환성을 위해 GenerateContent engine은 유지하고, Interactions API는 별도 protocol engine으로 추가한다. 기존 connection을 자동 migration하지 않고 관리자가 연결 시험 후 명시적으로 전환하게 한다.

## 5. 구현 전에 사용자가 결정해야 하는 정보

다음 항목은 코드만으로 적절한 값을 추측하기 어렵다.

### P0: 운영 구조를 바꾸는 결정

| 항목 | 상태 | 현재 값 또는 필요한 정보 |
|---|---|---|
| 공개 범위 | 확정 | 인터넷 공개 |
| 예상 규모 | 일부 확정 | 사용자 1~3명, 하루 메시지 수는 운영 중 계측 가능 |
| 서버 CPU | 확정 | Intel N100 미니 PC |
| RAM·disk·OS | 확정 | RAM 16GB, SSD 여유 약 220GB, Ubuntu 24.04.4 LTS |
| domain·network | 확정 | 기존 domain·port forwarding과 Nginx 80·443 proxy 사용 |
| 저장 위치 | 권장안 | 단일 서버 PostgreSQL·로컬 volume, 실제 경로 필요 |
| backup 목표 | 확정 | 초기 외부 backup 미구성, 장애 시 데이터 유실 위험 수용 |
| 관리자 보안 | 기본안 확정 | TOTP MFA 필수, offline 일회용 복구 code |
| MVP 전용 adapter | 미확정 | Vertex AI, Bedrock, Copilot 실제 활성화 여부 |
| 외부 전송 안내 | 미확정 | 대화·첨부파일의 AI 제공자 전송 고지 방식 |

전체 AI 생성은 3개, 사용자별 2개, PDF·OCR worker는 1개를 초기 기본값으로 적용하고 실제 사용량을 보고 조정한다.

### P1: 기본값을 승인하면 개발팀이 확정 가능한 항목

- 최소 비밀번호 길이·복잡도, 초기 비밀번호 전달 방식, 첫 로그인 변경 여부
- 로그인 실패 제한값, 잠금 시간, 사용자·관리자 session 목록과 강제 종료 UI
- API pagination·정렬·오류 envelope·idempotency key·optimistic locking 규칙
- conversation·message·branch·summary·attachment 전체 DB 관계와 cascade 규칙
- 메시지 전송을 두 번 누르거나 네트워크 재시도했을 때 중복 과금을 막는 요청 idempotency
- 한 대화방에서 동시에 두 응답을 생성할 수 있는지와 활성 branch 변경 충돌 처리
- provider·model·credential 삭제 시 기존 메시지·로그·권한을 어떻게 보존할지
- AI 연결·첫 토큰·전체 생성 timeout과 사용자별·전체 concurrency 기본값
- 이미지 최대 가로·세로·총 pixel과 압축 폭탄 방어값
- 악성 파일 검사 도입 여부와 실패 시 격리·삭제 방식
- Markdown·HTML 응답 sanitization, CSP, HSTS 등 브라우저 보안 header
- 모든 시각을 DB에 UTC로 저장하고 화면에 Asia/Seoul로 표시할지 여부
- 감사 로그의 hash chain 또는 외부 append-only backup 적용 여부
- 관리자 설정 변경의 version 관리와 rollback 방식

## 6. 개발 상세 명세에서 추가해야 하는 문서

P0가 결정되면 다음 문서를 작성해야 구현자가 서로 다른 해석을 하지 않는다.

1. `API_SPEC.md`: 전체 endpoint, request·response, pagination, 오류 코드, idempotency
2. `DATABASE_SCHEMA.md`: table, type, FK, index, unique, cascade, migration
3. `CHAT_STATE_SPEC.md`: 생성·취소·실패·부분실패·재생성·분기 상태 전이
4. `FILE_PROCESSING_SPEC.md`: MIME 판정, encoding, PDF parser, 이미지 제한, 삭제 queue
5. `SECURITY_SPEC.md`: 인증, CSRF, CSP, SSRF, encryption, secret rotation, 관리자 보호
6. `DEPLOYMENT_RUNBOOK.md`: 설치, update, rollback, healthcheck, 장애 대응
7. `BACKUP_RESTORE_RUNBOOK.md`: backup, 검증, 실제 복원 절차
8. `TEST_PLAN.md`: 권한 격리, provider contract, stream parsing, 복구 인수 시험

## 7. 권장 기본 동작

별도 요구가 없으면 다음을 기본안으로 삼을 수 있다.

- 대화와 메시지는 사용자가 삭제할 때까지 보존하고 첨부 원본·추출본만 기본 30일 후 삭제한다.
- 메시지 전송마다 client request ID를 발급해 동일 ID는 한 번만 외부 API를 호출한다.
- 한 대화 branch에서는 동시에 하나의 생성만 허용하고 다른 branch는 별도 생성할 수 있게 한다.
- 시간은 DB와 log에 UTC로 저장하고 관리자·사용자 화면에서 Asia/Seoul로 표시한다.
- provider 삭제는 즉시 물리 삭제하지 않고 비활성화하며 기존 메시지의 provider·model 표시 정보는 snapshot으로 보존한다.
- 사용자 삭제는 로그 익명화를 제외한 대화·메시지·요약·첨부·session을 삭제하고 진행 중 요청과 background job을 먼저 취소한다.
- 이미지 최대 해상도는 서버 사양 확정 후 정하되 byte 크기뿐 아니라 decoded pixel 수도 검사한다.
- 관리자 설정은 변경 전후 값, revision, 변경자를 감사 로그에 기록한다.
- AI 응답 Markdown은 raw HTML을 기본 금지하고 sanitization 후 렌더링한다.

## 8. 최종 판단

추가로 필요한 제품 기능 질문은 많지 않다. 공개 범위, 사용자 수와 CPU가 확정되어 백엔드 API·DB·상태 전이 명세와 로컬 MVP 구현을 시작할 수 있다.

실제 인터넷 배포 전에 가장 먼저 확인할 정보는 다음과 같다.

1. 실제 domain 값
2. 서버 구동 파일을 둘 배포 root 경로

이 정보가 없어도 애플리케이션 개발은 가능하지만 container volume과 Nginx upstream의 실제 host 배포 경로는 최종 확정할 수 없다.

## 9. 운영 정보 반영

2026-07-21에 다음 조건이 확정되었다.

- 인터넷에서 접근 가능한 공개 회선
- 개인용 서비스
- 예상 사용자 1~3명
- Intel N100 미니 PC 단일 서버
- RAM 16GB, SSD 여유 약 220GB, Ubuntu 24.04.4 LTS
- 기존 Nginx가 80·443을 처리하고 앱은 기본 127.0.0.1:32432 사용
- domain과 port forwarding 구성 완료
- 초기 외부 backup 미구성
- config는 서버 구동 파일 폴더에 두고 동봉된 계정 설정 CLI가 password hash를 생성
- 서버는 AI를 로컬 추론하지 않고 외부 API를 호출

이 조건에 맞춘 자원·보안·동시성 정책은 [DEPLOYMENT_PROFILE.md](./DEPLOYMENT_PROFILE.md)에 정리했다. 시작 config와 Nginx 연결 기준은 [SERVER_CONFIG_SPEC.md](./SERVER_CONFIG_SPEC.md)에 정리했다. 운영 환경 관련 P0는 실제 배포 root 입력만 남았다.
