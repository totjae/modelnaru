# ModelNaru 새 버전 실행 계획

## GIT-RESET — Git 기반 재설치 (2026-10-02)

사용자는 새 리팩토링 브랜치 생성, 기존 ModelNaru 운영 데이터/이전 백업 삭제와 새 설치를 명시 요청했고 관리자 ID/비밀번호/TOTP도 재생성을 선택했다. 메인 담당. 범위: 전체 N00~N14/UI-F 작업을 codex/refactor-v2로 커밋/원격 push, Git clone 배포 /home/totquf4171/modelnaru-git, project modelnaru-git, 새 DB·업로드·암호화 키·관리자. 선행: 소스 비밀값 검사·회귀·새 build/빈 DB 인수. 순서: 새 checkout 준비→32433 staging 검증→기존 v2 중지→32432 전환·외부 HTTPS 검증→정확한 기존 ModelNaru 경로/컨테이너/network/image와 N04 DB 제거. 새 배포 실패 시 삭제를 실행하지 않는다.

수정/생성 허용: .gitignore/.dockerignore/.gitattributes/eslint.config.mjs, bin 두 파일의 실행 mode 및 bin/modelnaru의 .env/.runtime.env 동시 로드, deploy/compose.production.yaml, scripts/cleanup-legacy-modelnaru.py와 README/DEPLOYMENT_RUNBOOK/DEPLOYMENT_PROFILE/DEVELOPMENT_WORKFLOW/TEST_PLAN/IMPLEMENTATION_STATUS/HANDOFF/본 계획. 로컬 tmp/git-deploy 아래 준비/안전 결과 허용. 제품/API/DB 명세·의존성/lockfile 변경 없음. tmp lint 제외는 생성 진단 artifact에 한정하며 제품/시험 lint를 유지한다. 이전 UI-F 배포/초기화 금지는 이번 명시 사용자 요청 범위에서 대체된다.

보존: host Nginx·현재 공인 인증서·SSH·다른 서비스/volume·공유 base image. docker system prune/전역 디렉터리 삭제 금지. scripts/cleanup-legacy-modelnaru.py는 dry-run 기본이며 새 서비스 healthy/cutoverVerified 검증 후 명시 old allowlist만 삭제한다. root 파일 삭제에 사용자 sudo 실행이 필요하면 새 배포를 먼저 검증하고 검토 가능한 최종 명령을 인계한다. 완료: 원격 branch/서버 HEAD 일치·Git clean·새4서비스 healthy·로그인/빈 DB/migration·외부 HTTPS·old 자원0과 사용법 문서 일치. 실제 삭제 전 완료로 기록하지 않는다.


## UI-F 작업 순서 (2026-10-02, N14 이후)

사용자 주석 이미지 기반 후속 UI 개선이다. N00~N14 완료 이력과 구분한다. 정확한 읽기/수정/생성 허용 파일·금지 범위·단계별 완료/중단 조건은 [UI_FEEDBACK_HANDOFF.md](./UI_FEEDBACK_HANDOFF.md) 4절, 동작 계약은 WEB_UI_SPEC.md UI-F, 상태는 IMPLEMENTATION_STATUS.md가 원장이다.

| 순서 | 작업 | 선행 | 담당 |
| --- | --- | --- | --- |
| UI-F0 | 수정 전 상태·화면 재현 | 인계 확인 | 메인 |
| UI-F1 | 본문 폭·설정 오른쪽 위치/폭·하단 정렬 | UI-F0 | 메인 |
| UI-F2 | 대화 목록·작성창·토스트 | UI-F1 | 메인 |
| UI-F3 | 관리자 공통·Provider 등록 배치 | UI-F2 | 메인 |
| UI-F4 | 모델 정렬·이미지 설정 접기 | UI-F3 | 메인 |
| UI-F5 | 로그인 모드 높이 안정화 | UI-F4 | 메인 |
| UI-F6 | 전체 시각/기능 회귀·사용자 확인 인계 | UI-F1~5 | 메인 |

공유 CSS/컴포넌트 충돌을 피하려 순차 구현한다. API/DB/인증·의존성·유료 호출·운영 변경은 범위 밖이다. 2026-10-02 후속 사용자 요청으로 메인이 UI-F0~F6 구현·로컬 검증을 순차 수행했다. 실행 결과는 IMPLEMENTATION_STATUS.md·TEST_PLAN.md 최신 UI-F 절을 따른다. F6 캡처 검토에서 발견한 picker 잘림/테마 겹침은 UI-F2 범위에서 보완 후 재검증했다. 운영 배포는 별도다.

## 1. 목적과 적용 범위

- 작성일: 2026-09-30
- 상태: 작업 순서·인계 형식 확정. 기능 구현·배포 작업은 아직 시작하지 않았다.
- 목적: 메인과 하위 에이전트가 대화 이력을 추측하지 않고 다음 작업, 선행 조건, 변경 범위와 인수 조건을 확인할 수 있게 한다.
- 범위: [SPEC_AUDIT.md](./SPEC_AUDIT.md)의 AUD-01~15와 확정된 새 버전 기능·디자인·설치 개선.
- 제외: 기존 운영 데이터 이전 보장, 다중 API worker, 로컬 추론 엔진 설치·GPU 관리, 본문 검색·폴더·태그, 외부 backup 도입. 이번 전환의 데이터 초기화 허용은 이후 업데이트의 데이터 삭제 허용이 아니다.
- 이 문서는 순서와 작업 계약의 원장이다. API 필드·DB schema·색상값 등을 여기서 중복 정의하지 않는다. 상세 계약은 관련 기준 문서에서 확정한다.

## 2. 참여자와 문서 읽기 순서

### 역할

- 메인: 저장소 파악, 정책·API·DB·보안·배포 설계, 복잡한 구현, 원인 분석, 의존성 변경, 통합 검증과 완료 판정.
- code_light: 메인이 구체화한 작은 변경만 수행한다. 이 계획의 단계 전체를 통째로 위임하지 않는다.
- 기본은 순차 작업이다. 독립적인 작업이라는 이유만으로 동시 실행하지 않는다. 공용 문서·같은 파일은 한 작성자만 편집한다.
- 이 문서의 역할은 작업 분담이며 도구·파일 접근 권한을 부여하지 않는다. 실제 도구 schema와 권한을 확인한다. code_light 도구가 없으면 메인이 처리하며 다른 워커를 같은 도구라고 가정하지 않는다.

### 시작할 때 읽을 문서

메인 역할을 처음 이어받으면 [HANDOFF.md](./HANDOFF.md)에서 전체 문서 지도·기존 검증 증거·미커밋 변경과 첫 작업 계약을 먼저 확인한다. 현재 착수 단계는 IMPLEMENTATION_STATUS.md에서 확인한다. 하위 워커는 아래 순서에 따라 배정 범위의 자료만 전달받는다.

1. [AGENTS.md](./AGENTS.md): 문서 색인과 에이전트 작업 제한.
2. [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md): 문서·구현·검증 절차.
3. [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md): 작업 원장의 현재 상태·차단 사유.
4. 이 문서의 배정 단계와 직전 인계 기록.
5. 해당 단계에 명시된 기준 문서의 적용 절 및 허용 파일만 읽고 작업한다. 추가 탐색이 필요하면 메인에게 범위 확정을 요청한다.

사용자 최신 결정이 우선한다. 그 다음 해당 기능의 확정된 새 버전 절·ADR을 적용한다. 현행 구현 기록과 초기 계획은 참고 자료다. 새 버전 절끼리 충돌하거나 제안밖에 없으면 워커가 임의로 선택하지 않고 메인에게 보고한다. 기술 결정 위임 범위 안의 사항은 메인이 판단하며 사용자 확인을 반복하지 않는다.

## 3. 작업 상태와 착수 조건

상태 기록은 IMPLEMENTATION_STATUS.md 한 곳에서 관리한다. 본문 작업표를 실행 상태표로 복제하지 않는다.

- 계획: 목적·의존관계만 정리됨.
- 착수 가능: 선행 완료, 적용 계약 확정, 파일 범위·검사와 기존 변경을 메인이 확인함.
- 진행 중: 담당자와 실제 수정 파일 기록.
- 검토 대기: 산출물과 명령·결과·잔여 위험을 제출함.
- 완료: 메인이 diff·실행 증거·문서 정합성을 확인함.
- 차단: 필수 환경·정보·계약 부족을 구체적으로 기록함. 재개 조건을 함께 적음.

다음 단계 착수 조건은 선행 작업의 이름이 언급된 것이 아니라 완료 산출물이 존재하는 것이다. 설계 완료는 구현 완료가 아니다. fixture 통과는 실제 DB/Provider 시험을 대체하지 않는다.

워커 배정 전에 반드시 다음을 확정한다.

- 기준 commit과 미커밋 변경을 포함한 현재 파일 상태. 이전 응답의 코드 위치를 그대로 신뢰하지 않는다.
- 기준 문서 경로·절·결정 ID·확정 상태. 필요한 문단을 인계에 포함한다.
- 읽기 대상, 수정 허용 파일, 생성 허용 파일을 각각 정확한 경로로 열거한다.
- 입력·출력·공개 인터페이스·기존 동작의 보존 조건과 금지 대상.
- 작동하는 검증 명령, 실행 위치, 예상 결과. 없는 검사 도구는 설치 대신 보고한다.
- 기준 문서 변경이 필요한 경우 작업을 멈추고 메인이 계약을 먼저 수정한다.

## 4. 실행 순서와 의존관계

기본 실행 순서는 아래 위에서 아래다. 날짜 추정 대신 각 단계의 완료 조건으로 다음 단계 진입을 결정한다. 세부 계약 확정 전에는 뒤 단계의 파일을 미리 구현하지 않는다.

| ID | 작업 | 선행 | 주 담당 | 완료 산출물 |
| --- | --- | --- | --- | --- |
| N00 | 작업 기준선·문서 적용 범위 정리 | 없음 | 메인 | 변경 보존 목록, 검증 기준선, 기준 문서 지도 |
| N01 | 작업·데이터·보조 호출 상세 계약 | N00 | 메인 | 실행 가능한 API/DB/상태·권한 계약 |
| N02 | Provider·보안·자원·운영 계약 | N01 | 메인 | protocol/SSRF/예산/복구·배포 계약 |
| N03 | UI 시안·컴포넌트 계약 | N01, N02 | 메인 | 테마·화면·상태·접근성 시안과 컴포넌트 입력/출력 |
| N04 | DB·config·계약 시험 기반 | N01, N02 | 메인 | 신규 설치 schema, 설정, 실제 DB 시험 기반 |
| N05 | Provider parser·공통 호출 개선 | N04 | 메인 | 정상/실패·취소·usage 계약 시험 통과 |
| N06 | 지속 생성·재접속·admission/quota | N04, N05 | 메인 | 독립 생성 job와 실제 DB 경합 시험 |
| N07 | 커스텀·로컬 Provider | N02, N05, N06 | 메인 | 등록·시험·수동 모델·목적지 검증 |
| N08 | 컨텍스트·요약·자동 제목 | N06, N07 | 메인 | 입력 budget·보조 호출·제목 경합 검증 |
| N09 | 탐색·설정 충돌·첨부 상태 API | N06, N08 | 메인 | 즐겨찾기·검색·고정·첨부·revision 계약 구현 |
| N10 | 공통 UI와 채팅 화면 | N03, N07, N08, N09 | 메인 | 새 테마·지속 생성 채팅·모델/첨부 UI |
| N11 | 관리자·로그인·게스트 UI | N03, N07, N08, N09, N10 | 메인 | 전면 개편된 관리·진입 화면 |
| N12 | 복구·패키징·설치·업데이트 | N02, N11 | 메인 | 신규 설치·복구 수단, README·runbook |
| N13 | 통합 인수·부하·릴리스 판정 | N05~N12 | 메인 | 시험 결과와 배포 후보 판정 |
| N14 | 실제 서버 전환·사후 확인 | N13 | 메인 | 배포 식별, 새 설치와 실제 동작 확인 |

N03 시안 작업은 백엔드 구현 전에 완료해 화면 구조 재작업을 줄인다. 실제 데이터 연결은 N10에서 한다. 아래 구현 후보 경로는 메인의 조사 범위이며 워커에게 디렉터리 전체 쓰기 권한을 부여하는 목록이 아니다. 신규 파일명은 메인이 해당 단계에서 결정하고 등록한다.

### 기존 코드 리팩토링 경로

이 표는 새 기능을 붙이기 전에 현행 책임을 어디서 정리할지 지정한다. 정확한 수정 파일은 N00에서 현재 코드를 다시 확인하고 각 단계 착수 시 메인이 확정한다. 새 추상화·패키지 분리는 실제 중복이나 검증할 경계가 드러날 때만 선택한다.

| 순서 | 현행 코드와 문제 | 리팩토링 결과 | 보존·검증 경계 |
| --- | --- | --- | --- |
| N00~N02 | `chat-execution.service.ts`의 요청 처리, `chat-streaming.ts`의 완료 판정, `chat-workspace.tsx`의 연결 상태가 현재 요청 수명에 묶여 있음 | 실행 job·구독·화면 상태의 소유권을 계약으로 분리하고 API/DB/상태 문서에 단일 기준을 정한다. 이 단계에서는 코드 이동을 하지 않는다 | 현재 호출·취소·권한·quota 경로와 기존 검사의 기준선을 기록한다 |
| N04~N05 | Provider stream parser가 비정상 EOF와 stream 내 오류를 성공으로 처리할 수 있음 | parser에서 protocol별 정상 종료 조건을 판정하고 공통 실행 경로가 실패·부분 출력·usage를 한 번만 기록하게 한다 | 기존 3종 protocol의 정상 출력·취소 동작, 오류/EOF fixture, byte·시간 상한 |
| N06 | HTTP 연결 종료가 생성 실행과 결합되어 있고 동시성 config가 실행 경로에서 소비되지 않음 | DB에 작업 수명·checkpoint를 두고 실행, 구독, admission/quota를 각각 명확한 경계에서 처리한다. 브라우저는 snapshot+revision으로 복원한다 | 같은 idempotency key의 upstream·quota 1회, session·소유권 검사, 중지·재시작 시 무자동재호출 |
| N07~N09 | Provider 등록/호출, 요약, 제목, 첨부와 대화 설정이 새 작업 수명에 맞춰지지 않음 | 공통 목적지 검증과 호출 제한을 재사용하고 보조 호출·첨부·설정의 경합을 서버 조건부 갱신으로 처리한다 | 내장 Provider 회귀, 비허용 주소 차단, quota 선예약, 수동 제목 우선, stale 설정 거부, 첨부 사용 중 보호 |
| N10~N11 | 채팅/관리 화면의 상태와 스타일이 기존 요청·설정 모달 구조에 맞춰져 있음 | N03 시안 기준으로 화면을 구성하고 API 응답·job 구독·설정 초안 상태를 표시 컴포넌트에서 분리한다 | 인증·역할 분리, 초안 보존, 키보드/모바일 조작, Markdown 렌더링 보안, 비밀값 비노출 |
| N12~N14 | 현재 설치·복구 절차는 새 schema/job/stream 동작을 검증하지 않음 | 새 release의 설정·종료·복구 절차를 구현과 README/runbook에 맞추고 격리 환경에서 먼저 검증한다 | 기존 운영 서버는 N13 인수 전 변경하지 않으며 N14에서 대상과 데이터 범위를 재확인한다 |

각 행은 앞 단계 산출물과 관련 시험을 확인한 뒤 진행한다. 책임 분리가 필요해도 기존 공개 API·DB 계약·인증 정책을 암묵적으로 바꾸지 않는다. 변경이 불가피하면 N01/N02의 기준 문서와 ADR을 먼저 정렬하고 해당 단계의 허용 파일·시험을 다시 확정한다. 단순 파일 분할이나 이름 변경만으로 완료 처리하지 않는다.

## 5. 단계별 작업 계약

### N00 — 작업 기준선과 적용 범위

- 읽기: AGENTS.md, SPEC_STATUS.md, SPEC_AUDIT.md, DECISIONS.md, IMPLEMENTATION_STATUS.md, package.json.
- 수행: git 상태·현재 변경 소유권 확인, 기존 검사 가능 환경 확인. 각 기준 문서에 새 버전/현행/초기 구분과 원장 절을 표시한다.
- 산출물: TEST_PLAN.md에 환경·명령·결과, SPEC_STATUS.md에 기준 문서 지도, IMPLEMENTATION_STATUS.md에 다음 작업 상태.
- 금지: 사용자 변경 정리·초기화, 패키지 설치, 기능 수정, 운영 서버 재시작·삭제.
- 완료: 다음 담당자가 기존 실패와 신규 실패를 구분할 수 있다. 환경상 미실행은 통과로 쓰지 않는다.

### N01 — 실행·데이터·보조 호출 계약 확정

- 읽기: CHAT_STATE_SPEC.md, API_SPEC.md, DATABASE_SCHEMA.md, GUEST_ACCESS_SPEC.md, ADMIN_LOGGING_SPEC.md와 현 chat/auth/access/repository 코드.
- 작성: 위 문서와 필요 시 DECISIONS.md. 아직 schema나 런타임 코드는 변경하지 않는다.
- 필수 결정: 시작/조회/구독/중지 요청·응답·오류·인증, idempotency key 유일 범위·보존·충돌, revision/cursor와 snapshot 경계, job 상태 전이·checkpoint·재시작 복구, DB 관계·제약·index.
- 필수 결정: 동시성 admission과 quota 예약/해제/전송 시점, 실패·취소 usage, 로그아웃/만료/권한 회수, 다른 탭 설정 충돌, 첨부 사용 중 보호.
- 필수 결정: 제목 모델 권한·입력·출력·시간 예산과 1회 실행, 요약 모델 budget·재사용·실패 처리, 즐겨찾기·검색·고정의 소유권과 pagination.
- 완료: 샘플 JSON·상태 전이표·DB 갱신 경계·실패 예시가 맞물린다. 구현 담당자가 key 의미·반환 상태·예산을 추측할 항목이 없다. 허용되는 기술 선택은 ADR로 고정한다.
- 감사 연결: AUD-01~03, 06, 08~11.

### N02 — Provider·보안·자원·운영 계약 확정

- 읽기: PROVIDER_REGISTRATION_SPEC.md, AI_INTEGRATION_SPEC.md, SECURITY_SPEC.md, SERVER_CONFIG_SPEC.md, DEPLOYMENT_PROFILE.md, DEPLOYMENT_RUNBOOK.md, PROVIDER_CONTRACT_TESTS.md.
- 작성 허용: 위 일곱 문서와 API_SPEC.md, DATABASE_SCHEMA.md, REQUIREMENTS.md, README.md, DECISIONS.md, TEST_PLAN.md, SPEC_STATUS.md, SPEC_AUDIT.md, IMPLEMENTATION_STATUS.md, HANDOFF.md, 이 계획 문서. 다른 파일 생성·수정 및 의존성·Compose·런타임 변경은 이 단계 범위 밖이다.
- 필수 결정: 커스텀 1차 protocol, 기본 URL·상대 경로, 키/무인증, DNS/실접속 검증·승인 로컬 목적지, redirect/IPv6, capability와 진단 상태.
- 필수 결정: protocol별 정상 종료·오류·거부·빈 답변·부분 usage, 입력/출력 byte/token 예산, 총시간·idle·구독 수·버퍼·보조 호출 상한.
- 필수 결정: Markdown/링크/외부 이미지 신뢰 경계, 관리자 복구 방식, release/config/schema 호환·신규 설치·rollback·종료 처리. 기술·라이브러리 변경이 필요하면 이유와 검증 방법을 메인이 정한다.
- 완료: 정상/실패 fixture 목록과 검증 기준이 있고 로컬 HTTP 허용이 전체 사설망 허용으로 바뀌지 않는다. README에 안내할 구현 대상 명령이 정해져 있다.
- 감사 연결: AUD-04~07, 12~14.

### N03 — 디자인 시안과 컴포넌트 입력/출력

- 읽기: WEB_UI_SPEC.md의 새 기준, N01 API/상태, N02 렌더링 보안, 현 apps/web/app 구조.
- 작성 허용: WEB_UI_SPEC.md, design/n03-preview.html, DECISIONS.md, TEST_PLAN.md, IMPLEMENTATION_STATUS.md, SPEC_STATUS.md, HANDOFF.md, 이 계획 문서. 앱 코드·의존성·API·DB·배포 파일은 이 단계에서 수정하지 않는다.
- 산출물: 다크/라이트 데스크톱 채팅, 모바일 채팅, 관리자 Provider·사용량·진입 화면. 색상·간격·글꼴·아이콘·반응형 값 및 컴포넌트별 props/event를 확정한다.
- 필수 상태: 빈 화면·로딩·진행 중·연결 복구·오류·권한 없음·긴 모델명·첨부 준비 중·미적용 설정·계정 동시성 제한.
- 완료: 기본 6종과 필수 상태 시안에서 실제 기능이 빠지지 않고 구현할 API와 상태를 연결할 수 있다. 실제 렌더링의 색상·계층·overflow·비활성 표현을 시각 검토해 TEST_PLAN.md에 기록한다. 소스 구조 검사만으로 완료 처리하지 않으며 정적 시안을 앱 브라우저 인수 완료로 표시하지 않는다.

### N01~N03 검토 보완 (2026-09-30)

- 담당: 메인. 선행: N01/N02 문서 계약과 N03 기본 시안. 기준: CHAT_STATE_SPEC.md·API_SPEC.md·DATABASE_SCHEMA.md N01, AI_INTEGRATION_SPEC.md N02, WEB_UI_SPEC.md N03.
- 수정 허용: 위 다섯 기준 문서, SERVER_CONFIG_SPEC.md, DEPLOYMENT_PROFILE.md, design/n03-preview.html, DECISIONS.md, TEST_PLAN.md, IMPLEMENTATION_PLAN.md, IMPLEMENTATION_STATUS.md, SPEC_STATUS.md, HANDOFF.md. 앱 코드·migration·의존성·배포 파일과 운영 서버는 변경하지 않는다.
- 완료: `activeJob`/message `jobId`, terminal 단일 transaction/SSE 표현, 설정 출력 상한의 생성·DB·GET 일치와 직렬화된 SSE frame/buffer 범위를 맞춘다. 필수 상태 시안의 소스·실제 렌더링을 검토하고 결과를 기록한다. 실제 렌더링을 확인할 수 없으면 N03을 부분 완료, N04를 대기로 남긴다.

### N04 — schema·config와 시험 기반

- 실행 파일 확정(2026-09-30): 새 SQL은 `packages/database/migrations/0020_n04_foundation.sql`, 실DB 시험은 `packages/database/test/n04-postgres.test.ts`만 생성한다. 기존 `0001`~`0019`는 수정하지 않는다. v2 `init` 실패 방지를 위해 `tools/admin-cli/src/cli.ts`의 버전·주체 상한 값만 메인이 갱신한다.
- 후보 범위: packages/database/src 및 migrations, packages/config/src/schema.ts, config.example.yaml, 관련 test. v2 schema로 기존 `init`이 즉시 실패하는 것을 막는 최소 변경은 `tools/admin-cli/src/cli.ts`에 한해 메인이 직접 수행한다. 공개 타입의 공유 위치는 N01 결정에 따른다.
- 수행: 새 버전 job·revision·idempotency·설정·제목·즐겨찾기·고정·첨부에 필요한 schema와 실제 설정 기본값을 구현한다. 일회성 신규 설치와 기존 migration 보존/새 기준선 선택은 N02 결정을 따른다.
- 완료: 격리 PostgreSQL에서 신규 설치·중복 key·FK·cascade·조건부 갱신·migration 재실행 검증, config 경계값 검증. 데이터 초기화 허용만으로 운영 DB에서 시험하지 않는다.
- 환경: Docker/시험 DB가 없으면 메인이 시험 환경을 확보하거나 DB 검증을 차단 상태로 남긴다. SQL 문자열 검사만으로 완료하지 않는다.

### N05 — parser와 공통 Provider 실행

- 후보 범위: apps/api/src/chat-streaming.ts, provider-parameter-policy.ts와 메인이 확정한 분리 파일, 해당 test.
- 이번 구현 허용 파일: `apps/api/src/chat-streaming.ts`, `apps/api/test/chat-streaming.test.ts`; 문서 `AI_INTEGRATION_SPEC.md`, `API_SPEC.md`, `PROVIDER_CONTRACT_TESTS.md`, `TEST_PLAN.md`, `IMPLEMENTATION_STATUS.md`, `HANDOFF.md`, 이 계획. protocol fixture는 기존 test 파일의 mock SSE로 작성하며 별도 파일을 만들지 않는다. `provider-parameter-policy.ts` 및 N06 job/API/DB/Web/배포 파일은 수정하지 않는다. 단위 fixture와 API typecheck/lint로 검증한다.
- 수행: 공통 stream/usage/error 계약 구현, EOF/error 결함 수정, 출력 byte·idle·전체 시간·취소 정리. 실제 필요한 protocol별 경계만 분리한다.
- 완료: 3종 protocol의 정상·분할 chunk·오류·비정상 EOF·거부·길이 제한·사용량 누락 fixture와 parser 회귀 통과. Provider 실제 통신 완료라고 표시하지 않는다.
- 결과: `TEST_PLAN.md` N05 절의 mock fixture·API 회귀·typecheck/lint로 완료. N06에서 job config snapshot과 실패/취소 usage DB 보존을 연결한다.

### N06 — 독립 작업 실행·저장·재구독

- 후보 범위: chat-execution.service.ts, chats.controller.ts, chat-messages.repository.ts, access/auth 관련 서비스·저장소와 job 파일, 관련 test.
- 착수 범위 1: `apps/api/src/chat-execution.service.ts`, `apps/api/src/chat-messages.repository.ts`, `apps/api/test/chat-execution.service.test.ts`; 문서는 `AI_INTEGRATION_SPEC.md`, `CHAT_STATE_SPEC.md`, `API_SPEC.md`, `DATABASE_SCHEMA.md`, `TEST_PLAN.md`, `IMPLEMENTATION_STATUS.md`, `HANDOFF.md`, 이 계획. parser의 job 본문 상한 전달과 실패·취소 usage 보존을 먼저 고친다. job/API/DB transaction 및 새 파일은 호출 경로를 확정한 후 정확한 목록을 여기에 추가한다. 기존 사용자 변경과 N04 migration을 보존한다.
- 착수 범위 2: 시작 transaction을 위해 `apps/api/src/access.repository.ts`의 quota 예약과 `apps/api/src/chat-messages.repository.ts`의 메시지 시작을 동일 transaction에서 호출 가능하게 한다. 신규 `apps/api/src/chat-jobs.repository.ts`, `apps/api/src/chat-jobs.service.ts`와 그 시험을 허용한다. controller/대화 조회/모듈 연결 파일은 경로 확정 뒤 별도로 추가한다. N04 migration 내용은 수정하지 않는다.
- 확정한 N06 연결 파일: `apps/api/src/app.module.ts`, `apps/api/src/chats.controller.ts`, `apps/api/src/chats.repository.ts`, `apps/api/src/chats.service.ts`, `apps/api/src/summarization.service.ts`, `apps/api/src/chat-jobs.repository.ts`, `apps/api/src/chat-jobs.service.ts`, `apps/api/src/chat-job-events.ts`, `apps/api/test/chat-jobs.test.ts`, `apps/api/test/chat-jobs-postgres.test.ts`를 추가 허용한다. 새 endpoint·대화 `activeJob`/message `jobId`·job runner/구독·실DB 경합 시험과 요약 Provider 전송 직전 quota 확정 callback만 다룬다. `packages/database/migrations/0020_n04_foundation.sql`, Web·배포·의존성은 수정하지 않는다.
- N06 통합 검증 보완 허용 파일(2026-10-01): `apps/api/test/chat-jobs-http-postgres.test.ts`를 생성하고, 실제 HTTP/SSE 시험에서 확인된 N06 결함에 한해 위 N06 연결 소스 파일을 수정한다. 격리 API 프로세스·테스트 PostgreSQL schema·로컬 mock Provider를 사용한다. 시험 결과는 `TEST_PLAN.md`, `IMPLEMENTATION_STATUS.md`, `HANDOFF.md`와 이 계획에 반영한다. 운영 DB·서비스·실제 자격증명은 사용하지 않는다.
- 수행: DB 작업 수명과 메모리 실행의 연결, checkpoint·snapshot/revision, 구독 종료 분리, idempotency, quota와 공통 슬롯, 종료·권한 회수·재시작 정리.
- 완료: A에서 생성 후 B로 이동·재접속해 동일 job 복원, 중복 시작에도 upstream/차감 1회, 느린 구독자 격리, terminal 경합, session 종료, restart 복원과 무자동재호출을 실제 DB+mock Provider로 확인.
- 보존: 주체·대화 소유권, session 한정 trace, 명시적 중지. 브라우저 연결 해제만 upstream 취소에서 제외한다.
- 결과(2026-10-01): 독립 job API·단일 시작/terminal transaction·SSE revision/버퍼·quota/slot·시작 session 폐기·재시작 복구를 구현했다. 격리 PostgreSQL+mock Provider의 저장소·서비스 경합 시험에 더해 별도 API 프로세스의 실제 HTTP/SSE·재연결·강제 종료/재시작·세션 폐기·주체/전역 동시성 시험을 통과했다(`TEST_PLAN.md` 최신 N06 절). 실제 외부 Provider·Web UI·운영 배포는 각각 N07/N13·N10·N12/N14 범위다.

### N07 — 커스텀·로컬 Provider

- 후보 범위: providers 서비스·저장소·controller, provider-discovery/credentials/catalog, chat-provider.service.ts, 목적지 검증 파일과 test.
- 착수 범위(2026-10-01, 메인 직접 수행): `apps/api/src/providers.controller.ts`, `apps/api/src/providers.service.ts`, `apps/api/src/providers.repository.ts`, `apps/api/src/provider-discovery.ts`, `apps/api/src/provider-catalog.ts`, `apps/api/src/chat-provider.service.ts`, `apps/api/src/chat-streaming.ts`, `apps/api/src/chat-execution.service.ts`, `apps/api/src/chat-jobs.service.ts`, `apps/api/src/summarization.service.ts`, `apps/api/src/app.module.ts`, 신규 `apps/api/src/provider-destination.ts`, 관련 `apps/api/test/provider-*.test.ts`, `apps/api/test/chat-streaming.test.ts`, 신규 `apps/api/test/provider-destination.test.ts`를 허용한다. 문서는 `PROVIDER_REGISTRATION_SPEC.md`, `SECURITY_SPEC.md`, `API_SPEC.md`, `DATABASE_SCHEMA.md`, `AI_INTEGRATION_SPEC.md`, `PROVIDER_CONTRACT_TESTS.md`, `TEST_PLAN.md`, `IMPLEMENTATION_STATUS.md`, `HANDOFF.md`, 이 계획과 설치·운영법이 바뀌는 경우에 한해 `README.md`, `DEPLOYMENT_RUNBOOK.md`를 갱신한다. `0020` migration·Web·의존성·배포 설정·운영 데이터는 수정하지 않는다.
- 수행: 관리자 입력·암호화·연결 시험·수동 모델·capability, 공통 outbound 검증. 채팅·요약·제목이 같은 검증 경로를 사용한다.
- 완료: 내장 Provider 회귀, 키/무인증·목록 미지원·수동 모델 시험, 비허용 목적지·DNS/IPv6/redirect 차단. 실제 로컬 서버가 없으면 fixture 완료/실연동 대기를 구분하고 N13에서 해소한다.
- 결과(2026-10-01): N07 구현과 격리 PostgreSQL·별도 API 프로세스→사설 IP mock Provider의 실제 HTTP/SSE 시험, 내장/N06 회귀를 통과했다(`TEST_PLAN.md` N07). 이 단계는 fixture 인수로 완료한다. 공인 HTTPS·실제 자격증명·Docker→실제 로컬 모델 엔진 시험은 N13 인수에 남긴다. N08은 제목·이미지 입력 budget을 구현한다.

- 후속 점검·해결(2026-10-01): fixture 인수 뒤 재현된 transport 결함 N07-R1/R2를 고쳤다. Node 기본 주소군 선택의 도메인 소켓, HEAD/204/205와 변환 오류 rejection, 전체 API 190개 및 수정 빌드의 격리 DB·HTTP 시험 2개가 통과했다(`TEST_PLAN.md` 최신 보완 절). N07은 다시 fixture 인수 완료이며 N08 착수 가능하다. 실제 공인 HTTPS·자격증명·Docker 로컬 모델 시험은 N13에 남긴다.

### N08 — 컨텍스트·요약·자동 제목

- 후보 범위: summarization 서비스·저장소·controller, context budget/제목 파일, usage 기록과 test.
- 추가 허용(2026-10-01): `apps/api/src/chats.controller.ts`의 생성 입력에서 명시적 수동 제목 여부를 repository에 전달한다. 이 필드의 사용자 override는 허용하지 않는다.
- 운영 사용법 문서 추가 허용: `README.md`, `DEPLOYMENT_RUNBOOK.md`에 구현된 관리자 제목 설정 API 사용과 아직 미배포인 범위를 함께 기록한다. 설치·환경·배포 명령은 변경하지 않는다.
- 착수 계약(2026-10-01, 메인): 선행 N06·N07 완료. 기준은 CHAT_STATE_SPEC.md N01 및 AI_INTEGRATION_SPEC.md N02, API_SPEC.md 제목 API와 DATABASE_SCHEMA.md N01이다. 수정 허용: `apps/api/src/summarization.service.ts`, `summarization.repository.ts`, `chat-jobs.service.ts`, `chat-jobs.repository.ts`, `chats.repository.ts`, `chat-execution.service.ts`, `app.module.ts`와 관련 기존 시험. 생성 허용: `apps/api/src/context-budget.ts`, `title-generation.repository.ts`, `title-generation.service.ts`, `title-generation.controller.ts`, `apps/api/test/context-budget.test.ts`, `title-generation.test.ts`, `n08-postgres.test.ts`. 문서는 AI_INTEGRATION_SPEC·CHAT_STATE_SPEC·API_SPEC·DATABASE_SCHEMA·TEST_PLAN·IMPLEMENTATION_STATUS·HANDOFF·이 계획을 갱신한다. schema/migration·의존성·lockfile·Web UI·운영 데이터/서비스 변경과 실제 유료 호출은 금지한다. 격리 DB·mock Provider로 예산·요약 횟수/usage·제목 경합을 확인하고 완료 조건을 충족하지 못하면 원장에 구체적인 차단 원인을 남긴다.
- 수행: 본/요약 모델 각각의 입력 budget, 출력 예약·이미지·overhead, 보조 호출 quota/admission·권한, 제목 1회와 수동 변경 경합·실패 격리.
- 완료: 한도 소진 요청에서 유료 요약이 시작되지 않음, 큰 transcript의 정해진 분할/거부, 제목 실패 시 본 응답 정상, 삭제/수동 변경 뒤 늦은 결과 미저장, 실패·취소 usage 및 본문 로그 비노출.
- 결과(2026-10-01): N08 완료. `TEST_PLAN.md` N08에 전체 API 203개(격리 PostgreSQL 5개 포함), 실제 HTTP 제목 API/저장·N06/N07 회귀 및 typecheck/build/lint 증거를 기록했다. 운영·실 Provider·Web UI는 변경하지 않았고 다음 단계는 N09다.

### N09 — 탐색·설정·첨부 API

- 착수 계약(2026-10-01): 메인이 N06·N08 결과를 보존하며 직접 구현한다. 수정 허용 파일은 `apps/api/src/chats.controller.ts`, `chats.service.ts`, `chats.repository.ts`, `access.controller.ts`, `access.service.ts`, `access.repository.ts`, `attachments.controller.ts`, `attachments.service.ts`, `attachments.repository.ts`, `attachment-lifecycle.repository.ts`, `app.module.ts` 및 해당 기존 시험이다. 생성 허용은 `apps/api/src/conversation-cursor.ts`, `apps/api/test/n09-postgres.test.ts`다. 기존 HTTP 격리 시험에 N09 endpoint 검증을 추가할 수 있다. 문서는 API_SPEC·CHAT_STATE_SPEC·DATABASE_SCHEMA·FILE_PROCESSING_SPEC·TEST_PLAN·IMPLEMENTATION_STATUS·HANDOFF·README와 이 계획을 갱신한다. migration·의존성·lockfile·Web UI·운영 DB/서비스는 변경하지 않는다.
- 세부 계약은 API_SPEC.md N09 및 FILE_PROCESSING_SPEC.md N09에서 확정한다. 소유권 적용 뒤 keyset pagination, revision CAS/활성 job 제한, 권한 재검사·모델 변경 파라미터 제거, 첨부 준비 상태/명시 재처리·TTL 보호를 격리 PostgreSQL 및 실제 HTTP로 확인한다. 환경 차단 시 해당 인수를 미완료로 기록하며 임시 프로세스·터널·컨테이너를 정리한다.
- 첨부 참조 보호를 위한 추가 허용: `apps/api/src/chat-messages.repository.ts`와 `chat-jobs.repository.ts`에서 선택 파일 외 이전 메시지의 실제 이미지 컨텍스트도 시작 transaction에서 잠금·in_use 참조로 보호한다. 생성/Provider 계약·migration은 바꾸지 않는다.

- 후보 범위: chats 서비스·저장소·controller, access/model 조회, attachments와 lifecycle 서비스·저장소, 관련 test.
- 수행: 검색·고정·pagination·즐겨찾기·설정 조건부 저장, 첨부 처리 상태 조회/재시도와 실행 중 TTL 보호.
- 완료: 주체별 격리, 권한 회수 모델 선택 차단, 안정 cursor, 다른 탭의 stale 설정 충돌, 첨부 처리/삭제/만료 경합을 실제 DB에서 확인.
- 결과(2026-10-01): N09 서버 API 완료. TEST_PLAN.md 최신 절의 전체 API 206개·격리 PostgreSQL 6개·실제 HTTP/SSE 및 typecheck/build/lint가 통과했다. cursor 마이크로초 누락과 파라미터 제거 표시를 실DB 실패에서 고쳐 재검증했다. 새 UI/실 OCR/운영 인수는 N10~N14에 남긴다.

- 독립 점검 후속(2026-10-01): N09-R1 재처리 오류 분류, N09-R2 PATCH/충돌 snapshot의 activeJob 누락을 보완한다. 정확한 수정 범위·완료 조건은 HANDOFF.md의 N09 재점검 후속 계약, 증거는 TEST_PLAN.md 최신 독립 점검 절을 따른다. attachments.controller.ts는 retry의 disconnect signal 전달 제거만 추가 허용한다. N10은 보완 재검증 뒤 착수한다.
- 후속 판정(2026-10-01): 위 R1/R2 보완 완료. 전체 API 214개(실DB 6개 포함)·실제 HTTP 회귀 및 typecheck/build/lint 통과. TEST_PLAN.md 최신 보완 절을 근거로 N10 착수 가능하다.

### N10 — 공통 UI와 채팅

- 결과(2026-10-01): 공통·채팅 UI 구현과 production Web+loopback HTTP fixture의 실제 Edge 인수 완료. Web 8개 파일·31개, typecheck/build/lint, 22개 화면 캡처·반응형/포커스/대비 검증 통과. 상세 증거와 실제 서버/실기기 후속 범위는 TEST_PLAN.md N10을 따른다. N11 착수 가능하다.

- 착수 계약(2026-10-01): 선행 N09 보완 완료, 메인이 구현·검증한다. 수정 허용 파일은 apps/web/app/chat-workspace.tsx, styles.css, client-auth.ts, provider-parameter-fields.tsx, layout.tsx, apps/web/next.config.ts 및 기존 Web test다. 생성 허용 파일은 apps/web/app/chat-api.ts, job-subscription.ts, safe-markdown.tsx, chat-model-picker.tsx, chat-dialog.tsx, chat-icons.tsx, apps/web/proxy.ts, apps/web/test/job-subscription.test.ts, safe-markdown.test.tsx, chat-ui.test.tsx, apps/web/test/n10-browser.mjs다. 문서는 WEB_UI_SPEC.md, SECURITY_SPEC.md, TEST_PLAN.md, IMPLEMENTATION_STATUS.md, HANDOFF.md와 이 계획을 갱신한다. DB/API 계약·의존성·lockfile·운영 배포는 변경하지 않는다. 기존 사용자 변경과 인증/CSRF/소유권·분기·첨부·페이지 기능을 보존한다. 아래 완료 조건과 Web typecheck/test/build/lint·브라우저 검증을 충족해야 완료한다. 환경 차단은 구체적으로 기록한다.
- 검증 도구 보완 허용: eslint.config.mjs에 신규 n10-browser.mjs만 JavaScript lint로 검사하도록 등록한다. 이 파일은 외부의 기존 Playwright runtime 경로를 받아 실행하는 격리 시험 runner이며 저장소 패키지/lockfile을 바꾸지 않는다. 기존 TypeScript lint 규칙은 유지한다.

- 후보 범위: apps/web/app/chat-workspace.tsx, styles.css, client-auth.ts, provider-parameter-fields.tsx와 N03에서 정한 컴포넌트·hook·API 계층, Web test.
- 수행: 디자인 token·공통 요소, API 오류 처리, job 구독·재접속 상태를 분리하고 대화 목록·모델 검색/즐겨찾기·입력·답변·첨부·설정 패널을 연결한다.
- 완료: 기능별 UI 상태·keyboard/IME·모바일 입력·길고 미완성인 Markdown·XSS fixture·대화 전환 초안 보존을 확인한다. CSS 분리만으로 완료하지 않는다.
- 워커 후보: 메인이 props/event·시안·정확한 파일을 정한 단일 표시 컴포넌트, 확정 token 치환, 원인이 확정된 짧은 회귀 수정. job hook·상태 경합·렌더링 보안은 메인이 맡는다.

### N11 — 관리자·로그인·게스트 화면

- 결과(2026-10-01): 구현 및 production Web+loopback HTTP fixture의 실제 Edge 인수 완료. Web 31개, typecheck/build/lint, HTTP 160건·캡처 61개. 실제 API/DB/HTTPS·실기기는 N13이며 TEST_PLAN.md N11에 구분했다. N12 착수 가능.

- 착수 계약(2026-10-01): 메인 직접 구현. 수정 허용은 apps/web/app/page.tsx, admin-workspace.tsx, provider-manager.tsx, usage-dashboard.tsx, admin-log-viewer.tsx, styles.css 및 eslint.config.mjs의 N11 browser mjs override이다. 생성 허용은 apps/web/app/custom-provider-form.tsx, provider-diagnostics.tsx, title-settings.tsx, apps/web/test/n11-browser.mjs이다. 추가 수정 파일은 apps/web/app/access-manager.tsx(게스트 첨부 허용 및 중복 label ID), user-manager.tsx(native dialog), server-settings.tsx(미조회 상태)이다. summarization-manager.tsx는 재사용하며 수정하지 않는다.
- 문서 갱신: WEB_UI_SPEC.md, TEST_PLAN.md, IMPLEMENTATION_STATUS.md, HANDOFF.md. API/DB/패키지·lockfile/운영 환경 변경 금지. 실제 production Web+loopback fixture HTTP로 역할별 진입·관리자 설정/진단·오류·비밀값·모바일을 검증한다. 실제 API+DB/HTTPS 전체 인수는 N13이다.
- 사용량 표시: 기존 API 전체 합계는 보고된 토큰 합계라고 명시하고, 최근 요청의 nullable input/output을 사용해 미보고를 구분한다. 최근 요청의 대화/요약/제목 구분을 전체 기간 집계로 오인하게 표시하지 않는다.

- 후보 범위: apps/web/app/page.tsx, admin-workspace.tsx, *-manager.tsx, usage-dashboard.tsx, admin-log-viewer.tsx, server-settings.tsx, 관련 test.
- 수행: 공통 디자인 적용, 고정 관리자 메뉴, Provider 진단·제목/요약 설정·사용량 구분, 간결한 로그인·게스트 진입과 전송 안내.
- 완료: 일반/게스트의 관리자 접근 차단, 관리자 API와 표시 상태 일치, 비밀값 비노출, 좁은 화면 표·폼·오류 상태를 검증한다.
- 워커 후보: 승인된 문구·단순 화면 표현만 정확한 파일로 분리한다. 권한·설정 저장·진단 호출은 메인이 담당한다.

- 독립 점검 후속(2026-10-01): N10-R1의 title 무조건 PATCH와 N11-R1의 imageTokenEstimate UI 누락을 보완한다. 증거는 TEST_PLAN.md 최신 독립 점검, 파일 범위·인수 계약은 HANDOFF.md 상단 UI/API 연결 보완 계약을 따른다. N12는 보완 재검증 뒤 착수한다.

### N12 — 관리자 복구·운영 구성·README

- 결과(2026-10-01): 완료. TEST_PLAN.md N12의 격리 Docker 배포 11개 인수, API 208개/CLI 5개·typecheck/lint 통과. TOTP 복구, 실제 job SSE, SIGTERM 원자 저장·SIGKILL 복구, checksum 거부·같은 release update·stop/start 보존을 검증했다. 시험 자원/비밀값 정리, 운영 미변경. 다음 N13은 실제 HTTPS/Provider·전체 UI/API 인수다.

- 착수 계약(2026-10-01): 메인 직접 수행, N11-R1 완료 선행. 수정 허용: Dockerfile, .dockerignore, compose.yaml, deploy/gateway.conf, bin/modelnaru, bin/apichat-admin, tools/admin-cli/src/cli.ts, tools/admin-cli/src/helpers.ts, tools/admin-cli/test/helpers.test.ts, apps/api/src/chat-jobs.service.ts, apps/api/test/chat-jobs-http-postgres.test.ts. 생성 허용: scripts/test-n12-deployment.py. 문서: README.md, DEPLOYMENT_RUNBOOK.md, DEPLOYMENT_PROFILE.md, SERVER_CONFIG_SPEC.md, SECURITY_SPEC.md, TEST_PLAN.md, IMPLEMENTATION_STATUS.md, HANDOFF.md 및 이 계획. 기존 사용자 변경·API/DB 계약·의존성/lockfile 보존. 운영 서비스·DB·실 Provider 사용 금지. mihoservice_server의 고유 임시 폴더·Compose project·loopback port만 사용하고 시험 후 정리한다. 종료 hook을 DB close 이전 단계로 옮겨 접수 차단·최종 저장을 제한 시간 내 기다린다. 격리 이미지 설치/복구/업데이트 검증이 막히면 원인·미검증을 남기며 완료 처리하지 않는다.

- 후보 범위: tools/admin-cli, config, Dockerfile, compose.yaml, deploy/gateway.conf, bin/modelnaru, bin/apichat-admin, README.md, DEPLOYMENT_RUNBOOK.md와 관련 test.
- 수행: N02의 복구 정책 구현·session 폐기, runtime 버전 일치, 새 stream endpoint proxy/heartbeat·종료 처리, 출력/로그 자원 설정, 미사용 서비스 유지/제거 판단.
- 완료: 격리 환경에서 README 순서만으로 설치·설정·시작·로그·health·중지·업데이트·복구를 실행한다. 명령의 작업 위치·사전 조건·데이터 영향·지원 환경을 명시한다.
- 금지: 기존 서비스 healthy만으로 새 이미지 검증 완료 표시, migration 호환 확인 없는 rollback, 워커의 의존성·운영 설정 변경.

### N13 — 최종 인수

- 복구 모델 앱 경로 후속 계약: 사용자 "일단 테스트 계속해"에 따라 메인이 기존 n13-integration.mjs의 LOCAL 모드를 재사용해 PC→192.168.0.12:8080의 승인 사설 custom API 등록·실제 생성 1회 max64·HTTPS SSE·usage/quota·안전 진단을 검증한다. 수정 허용은 apps/web/test/n13-integration.mjs 및 TEST_PLAN.md, IMPLEMENTATION_STATUS.md, IMPLEMENTATION_PLAN.md, PROVIDER_CONTRACT_TESTS.md, HANDOFF.md, SPEC_AUDIT.md다. LOCAL 시험 결과는 tmp/n13/local-restored/에 저장해 기존 Gateway/부하 증거를 보존하고 본문은 byte 수만 기록한다. 이미 통과한 큰 본문 부하는 LOCAL 전용 시험에서 중복 실행하지 않는다. 새 전용 PostgreSQL/network/tunnel을 사용하며 상용 키 파일/Provider·운영·보안 계약·제품 코드·의존성은 변경하지 않는다. 실제 서버의 공인 HTTP 등록 지원이나 공인 HTTPS/실기기 완료로 이 결과를 확대하지 않는다. 실패는 안전한 진단과 DB 상태를 남기고 임시 자원을 정리한다.
- 복구 모델 앱 경로 결과: 완료. 실제 PC custom 등록·생성1회 max64·pending SSE 끊기 뒤 계속 생성·streaming GET+SSE 재접속 정확 복원·terminal·usage72/39·charged/각 원장1개·안전 진단 통과. 통합6개·HTTP63건·브라우저 오류0, 전용 자원 정리. PC 사설 연결의 결과이며 서버 공인 HTTP 등록 지원/공인 Web HTTPS/실기기 인수는 대기다. TEST_PLAN.md 최상단 참조.

- 로컬 모델 복구 재확인 계약: 사용자가 복구한 mihoservice.iptime.org:8080/v1/models의 사용을 허용했다. 메인이 PC/서버/일회용 격리 컨테이너의 models GET과 서버 컨테이너에서 gemma4-12b 짧은 생성 1회(출력 64토큰)를 검증한다. keyless endpoint이며 상용 Gateway 키/호출을 사용하지 않는다. 운영 설정·라우팅·방화벽·SSRF 계약은 변경하지 않는다. HTTP 공인 도메인의 직접 전송 결과를 앱의 승인 사설 IP 경로 통과로 대체하지 않는다. 문서 수정 허용: TEST_PLAN.md, IMPLEMENTATION_STATUS.md, IMPLEMENTATION_PLAN.md, HANDOFF.md, PROVIDER_CONTRACT_TESTS.md, SPEC_AUDIT.md. 임시 컨테이너는 운영 image를 runtime으로만 재사용하며 운영 env/mount/network를 복사하지 않고 제한 자원을 사용한다. 원본 모델 목록의 args/preset·prompt·생성 본문은 증거에서 제외한다. 동일 모델의 서버에서 접근 가능한 사설 주소/공인 HTTPS가 없으면 앱 연결 인수는 차단으로 남긴다.
- 로컬 모델 재확인 결과: 사용자 설명으로 192.168.0.12는 작업 PC 망 주소임을 정정했다. 사용자 요청 210.223.161.68:808은 서버/PC에서 timeout, :8080 및 기존 도메인은 HTTP 200이었다. 서버 격리 컨테이너의 gemma4-12b 64토큰 생성 1회는 22.230초·usage21/49·stop/DONE으로 완료했고 컨테이너를 정리했다. 공인 HTTP의 직접 연결 시험이므로 기존 앱 HTTPS/사설 IP 등록 정책을 통과한 결과가 아니다. 앱 지원 endpoint/정책 선택은 미결정이며 제품/보안 정책은 변경하지 않았다. TEST_PLAN.md 최상단 참조.
- 사용자 포트 확정: 808은 오타이며 210.223.161.68:8080이 정확하다. 이후 연결 시험 대상은 :8080으로 고정한다.

- Gateway 재시험 승인: 사용자가 256토큰·추가 1회·예상 $0.01 이내 재시험 제안에 대해 "시작해"로 승인했다. 로컬 process 환경에서 출력 예산만 256으로 덮어쓰고 사용자 .env는 보존한다. 새로운 격리 DB/network/tunnel에서 기존 Gateway 모드를 1회 실행하며 성공/실패 결과를 보존하고 자원을 정리한다.
- Gateway 재시험 결과: 승인된 256토큰 1회는 약 572초 후 CHAT_PROVIDER_RESPONSE_INVALID·본문 없음·usage unknown·quota charged로 실패했다. HTTPS SSE terminal과 암호화 등록은 확인했다. 원본 응답은 보존하지 않아 구체적 원인은 미확정이다. 결과 파일과 TEST_PLAN.md에 기록했고 모든 전용 자원을 정리했다. 이 승인 범위는 소진됐으며 추가 유료 호출은 새 승인이 필요하다.
- N13 응답 진단 보완 계약: 사용자 요청에 따라 메인이 공통 streamProviderRequest의 HTTP 상태·정규화 Content-Type·수신 시각/시간·chunk/frame/data event 수·실패 단계·고정 내부 원인 코드를 기록한다. 수정 허용: apps/api/src/chat-streaming.ts, apps/api/test/chat-streaming.test.ts, apps/web/test/n13-integration.mjs 및 ADMIN_LOGGING_SPEC.md, AI_INTEGRATION_SPEC.md, TEST_PLAN.md, IMPLEMENTATION_STATUS.md, PROVIDER_CONTRACT_TESTS.md, HANDOFF.md. 필요 시 로컬 fixture 시험 apps/api/test/provider-response-diagnostic.test.ts를 생성한다. 기존 공개 오류·terminal/usage/quota·SSRF·원본 trace opt-in 정책을 보존한다. DB/schema·의존성·키 파일·운영 환경 변경과 실제 Provider 호출은 금지한다. 진단은 trace가 꺼져 있어도 실패 지점에서 작동하며 키·URL·prompt·본문·임의 upstream 오류 문구/필드값을 제외한다. 로컬 실패/성공 fixture·기밀값 비노출·API 회귀/typecheck/lint를 검증하고 재시험 조건을 문서화하면 완료한다.
- 응답 진단 보완 결과: 완료. 새 fixture 21개·공통 parser 포함 57개, 전체 로컬 API 229개(실DB 6개 제외), API typecheck/build·변경 코드 lint·harness 구문·diff 검사 통과. 추가 실제 Provider 호출은 없다. TEST_PLAN.md 최상단에 실제 재시험 조건을 정리했으며 Gateway 정상 생성 인수와 기존 실패 원인 확정은 남아 있다.
- 진단 적용 실제 재시험: 사용자 "다음작업시작해"로 직전에 정리한 gemini-3.8-flash/256토큰/추가 1회/예상 $0.01 이내 조건의 실행을 승인했다. 새 전용 DB/network/tunnel에서 현재 진단 빌드와 기존 Gateway harness를 실행한다. 자동 유료 재시도 없이 HTTP/SSE·안전 진단·usage/quota를 보존하고 모든 시험 자원을 정리한다. 이전 256토큰 결과는 gateway-256-no-diagnostic-result.json으로 보존해 이번 결과와 구분한다. 운영/키 파일/의존성/DB schema는 변경하지 않는다.
- 진단 적용 실제 재시험 결과: 완료·정상 생성 인수 통과. HTTP 200/text/event-stream·약 249초·5개 data event, completed·usage 56/100·quota charged, 통합 7개·HTTP 60건·브라우저 오류 0. 생성 본문 없이 진단/byte 수를 보존하고 키 비포함을 확인했다. 모든 시험 자원을 정리했으며 이전 실패 원인은 소급 확정하지 않는다. 이번 승인 범위는 소진됐다. N13 환경 차단과 N14 대기는 유지한다. TEST_PLAN.md 최상단 참조.
- 재시험 결과 문서 범위: TEST_PLAN.md, IMPLEMENTATION_STATUS.md, IMPLEMENTATION_PLAN.md, PROVIDER_CONTRACT_TESTS.md, HANDOFF.md, AI_INTEGRATION_SPEC.md, SPEC_AUDIT.md의 인수 결과/참조만 갱신한다. 기존 정책·공개 인터페이스는 변경하지 않는다.

- Gateway 실행 범위: 기존 apps/web/test/n13-integration.mjs에 명시적 MODELNARU_N13_GATEWAY_TEST=1 모드를 추가한다. 로컬 .env.n13-test를 읽고 선택 모델 가격·streaming을 확인하며, 내장 등록/암호화·사용자 job·실제 HTTPS SSE·usage/quota를 검증한다. 유료 POST는 fetch 경계에서 1회로 제한한다. 기존 부하 시험은 Gateway 모드에서 중복 실행하지 않는다. 키는 자식 process 환경에서 제외하고 원격 DB에는 임시 master key로 암호화된 fixture만 저장한다. 시험 후 DB·private fixture를 삭제하며 .env 사용자 파일은 보존한다.

- LLM Gateway 시험 준비: 사용자 요청에 따라 root .env.n13-test를 생성한다. 실제 키는 사용자가 작성하며 파일은 기존 .env.* ignore를 따른다. 공식 https://api.llmgateway.io/v1의 내장 llm-gateway 등록/키 확인/모델 조회와 실제 job 생성을 후속 검증한다. 모델·가격을 확인한 뒤 생성 1회/출력 64토큰/예상 비용 0.01 USD 이내로 제한한다. 키를 로그/문서/원격 서버에 복사하지 않는다. 키가 없으면 네트워크 시험을 실행하지 않는다.

- 최신 재개 결과: 통합 8개(실제 LAN 모델·5분 느린 SSE/RSS 포함), 제목/요약 실제 HTTP 강제 종료, 실제 OCR 인수 완료. 독립 잔여 시험은 수행했고 서버→LAN 모델 연결 timeout 및 웹 앱 공인 HTTPS/실기기 환경이 남아 부분 완료·N14 대기다. TEST_PLAN.md 최상단의 실행/정리·제한이 아래 초기 결과보다 우선한다.

- 잔여 인수 재개(2026-10-01): apps/api/test/chat-jobs-http-postgres.test.ts에 현재 HTTP harness를 재사용한 summary/title 실제 프로세스 강제 종료 복구 인수를 추가한다. apps/web/test/n13-integration.mjs의 격리 프로세스에 느린 SSE 수신자/반복 부하·메모리 관측을 추가할 수 있다. 제품 수정이 필요하면 원인과 정확한 파일을 먼저 등록한다. 이전 3개 OCR 파일 전송은 자동 승인에서 재차 거절됐으며 명시적 사용자 동의 전 재시도/우회하지 않는다. 실제 Provider/공인 HTTPS/실기기는 환경 정보 요청 중이다.
- 재개 승인/범위: 사용자가 OCR 3개 파일 전송과 mihoservice.iptime.org:8080 및 192.168.0.12:8080 로컬 모델 시험을 명시적으로 허용했다. 기존 n13-integration.mjs에 환경 변수로 승인 endpoint/model을 지정해 실제 custom API 등록/권한/job 검증을 추가한다. OCR은 일회용 격리 runtime에서 통과·정리했다. 서버의 LAN 접속 timeout은 보안 규칙 변경으로 우회하지 않는다. 최신 결과는 TEST_PLAN.md 최상단 참조.

- 결과(2026-10-01): 부분 완료. 전체 287개 회귀 통과·OS 조건 1개 제외, typecheck/lint/build 및 실제 Web/API/테스트 HTTPS/격리 DB 인수 6개 통과. 3 MiB+제어문자 GET/SSE 정확 복원과 64 KiB serialized frame 경계를 확인했다. 임시 자원 정리, 운영 미변경. 실제 Provider/LAN 연결 정보, OCR 전송 승인, 공인 HTTPS/실기기와 잔여 부하·보조 호출 강제 종료 인수가 남아 N14는 대기한다. TEST_PLAN.md N13과 SPEC_AUDIT.md N13 참조.

- 범위 추가: apps/api/test/chat-jobs-postgres.test.ts의 terminal 알림 검사는 DB commit 관측과 이벤트 발행 사이의 비동기 경계를 기다린다. 기대 이벤트/본문/상태는 유지하며 제품 코드나 timeout 정책은 변경하지 않는다.
- OCR 인수 추가 생성 허용: apps/api/test/n13-ocr.mjs. 기존 이미지의 도구·의존성만 재사용하는 network=none, read-only 일회용 컨테이너에 현재 pdf-ocr.js/pdf-attachments.js와 시험 script만 읽기 전용으로 연결한다. 생성 fixture·tmpfs만 사용하고 운영 mount/env/계정은 전달하지 않는다. 현재 전체 API 이미지 인수로 확대 해석하지 않는다.

- 착수 계약(2026-10-01): 메인 직접 담당. 수정 허용: apps/web/test/n11-browser.mjs(비동기 checkbox 검증), eslint.config.mjs(신규 mjs 시험 범위). 생성 허용: apps/web/test/n13-integration.mjs. 문서: TEST_PLAN.md, IMPLEMENTATION_STATUS.md, HANDOFF.md, SPEC_AUDIT.md, PROVIDER_CONTRACT_TESTS.md 및 이 계획. 기존 N12 배포 증거를 재사용하고 별도 PostgreSQL·API·Web·테스트 인증서 HTTPS proxy·mock으로 실제 브라우저 통합을 검증한다. mock 없는 실제 Provider/로컬 모델은 사용자 제공 대상·시험키·호출 한도가 확보된 경우에만 실행한다. 운영 DB·자격증명·서비스 변경, 의존성/lockfile·schema 변경 금지. 발견된 제품 결함은 원인 조사 후 정확한 파일 범위를 추가한다. 실제 연동/공인 HTTPS/실기기·OCR 등 필수 미검증을 기록하며 완료를 추정하지 않는다.

- 읽기: TEST_PLAN.md, PROVIDER_CONTRACT_TESTS.md, SPEC_AUDIT.md와 각 단계 인계 결과.
- 수행: 실제 PostgreSQL·브라우저·HTTPS proxy·허용된 실제 Provider/로컬 모델, 신규 설치·재시작·자원 한도 시험. 필요한 자격증명·환경은 메인이 확보하며 워커에 비밀값을 전달하지 않는다.
- 완료: AUD-01~15마다 해결 근거 또는 명시적 후속 범위가 있고, 필수 항목의 미검증이 없다. 실연동 불가 항목은 지원 등급과 릴리스 범위를 줄이거나 해당 항목을 차단으로 남긴다. 조용히 통과로 변경하지 않는다.
- 결과: 변경 release·환경·명령·성공/실패·잔여 제한을 기록하고 메인이 배포 후보를 판정한다.

### N14 — 실제 서버 전환

- 대상: mihoservice_server의 ModelNaru 배포. 실제 경로·컨테이너·volume·인접 서비스는 작업 직전 다시 확인한다.
- 선행: N13 완료 및 구체적인 전환·데이터 초기화 대상/복구 범위 기록. 기존 데이터 초기화 허용은 ModelNaru 데이터에 한정하며 host 전체·다른 서비스·SSH/인증서 삭제로 확대하지 않는다.
- 수행: N12 runbook을 적용하고 release·migration·설정 검증·외부 HTTPS·로그인·생성·재접속·중지·로컬 연결을 확인한다.
- 완료: 실제 실행 image/commit/config 식별과 기능 결과가 문서에 일치한다. 실패하면 기록된 복구 계획을 적용하고 미완료 상태를 유지한다.

## 6. 감사 항목과 실행 단계 추적

| 감사 | 계약 확정 | 구현 | 최종 검증 |
| --- | --- | --- | --- |
| AUD-01 지속 생성 계약 | N01 | N04, N06 | N13 |
| AUD-02 동시성 | N01, N02 | N04, N06 | N13 |
| AUD-03 quota 순서 | N01 | N06, N08 | N13 |
| AUD-04 stream 오류 | N02 | N05 | N13 |
| AUD-05 커스텀 목적지 | N02 | N07, N12 | N13 |
| AUD-06 context budget | N01, N02 | N08 | N13 |
| AUD-07 렌더링 보안 | N02, N03 | N10 | N13 |
| AUD-08 보조 호출 | N01, N02 | N08, N11 | N13 |
| AUD-09 설정 충돌 | N01 | N06, N09, N10 | N13 |
| AUD-10 첨부 경합 | N01 | N09, N10 | N13 |
| AUD-11 목록 조회 | N01 | N09, N10 | N13 |
| AUD-12 관리자 복구 | N02 | N12 | N13 |
| AUD-13 배포/복구 | N02 | N12 | N13, N14 |
| AUD-14 자원 상한 | N02 | N04~N08, N12 | N13 |
| AUD-15 문서 불일치 | N00 | 모든 단계 | 각 단계와 N13 |

## 7. 하위 작업 인계 형식

별도 task 파일이 반드시 필요한 것은 아니다. 아래 형식을 실제 호출의 지원 필드에 맞춰 채운다. task/scope/requirements 필드가 제공되지 않는 도구에는 임의 필드를 추가하지 않고 지원되는 본문 필드에 계약을 담는다. 미정·자리표시자·디렉터리 wildcard가 남은 상태로 배정하지 않는다.

```text
작업 ID / 상위 단계:
역할 / 담당:
목표 (하나의 검증 가능한 결과):
현재 상태 / 기준 commit / 보존할 미커밋 변경:
선행 작업과 인계 결과:
기준 문서 경로 / 절 / 결정 ID / 확정일:
읽기 대상 파일:
수정 허용 파일 (정확한 경로):
생성 허용 파일 (없으면 없음):
변경 금지 파일·영역:
입력 / 기대 출력 / 예시:
유지할 동작·인터페이스:
오류·경계 조건:
의존성·환경·API·DB·보안 변경 금지:
검증 명령 / 작업 디렉터리 / 기대 결과:
완료 조건:
중단 조건 (범위 확대·계약 충돌·환경 부재 등):
반환할 내용 (변경 파일, diff 요약, 명령·결과, 미검증·잔여 문제):
```

워커는 TEST_PLAN.md·IMPLEMENTATION_STATUS.md·DECISIONS.md 같은 공용 원장을 자동 편집하지 않는다. 별도 허용하지 않은 경우 결과를 메인에게 반환하고 메인이 검증 후 기록한다. 기준 문서 변경 필요를 발견하면 완료로 선언하지 않는다.

## 8. 검증과 인수 조건

### 현재 존재하는 검사 명령

작업 디렉터리는 저장소 root다. 아래 명령은 package.json에 존재하는 기준선이며 이번 계획 작성에서 실행했다는 뜻이 아니다.

| 검사 | 명령 |
| --- | --- |
| 문서·공백 | git diff --check |
| API 단위 | pnpm --filter @modelnaru/api test |
| Web 단위 | pnpm --filter @modelnaru/web test |
| config 단위 | pnpm --filter @modelnaru/config test |
| DB 정적/단위 | pnpm --filter @modelnaru/database test |
| CLI 단위 | pnpm --filter @modelnaru/admin-cli test |
| 전체 타입 | pnpm typecheck |
| lint | pnpm lint |
| 전체 단위 | pnpm test |
| production build | pnpm build |

대상 파일만 실행하는 명령은 메인이 실제 test runner 동작을 확인한 후 인계한다. 기존 DB 단위 시험은 실제 PostgreSQL 통합 시험이 아니다. 새 DB/E2E/부하 시험 명령은 N04/N13에서 실제로 만들어 TEST_PLAN.md에 등록하고, 그 전에는 존재하는 명령처럼 기재하지 않는다.

문서·표시 문구만 바꾸면 관련 문서 링크·diff·표시 검사로 충분하다. 코드 변경은 영향받는 단위·타입·lint, runtime·의존성 변경은 build·배포 검증까지 메인이 수행한다. 최종 릴리스는 전체 검사와 실제 환경 시험을 요구한다.

### 단계 종료 인계

- 변경된 정확한 파일과 기준 문서 절, 적용 결정, 다음 작업이 읽을 산출물.
- 검사별 명령·디렉터리·환경·종료 코드·검증한 의미와 미검증 범위.
- 기존 실패/신규 실패 구분, 허용 범위 밖 수정 여부, 미커밋 변경 보존 확인.
- 메인의 검토 결과와 다음 단계의 착수 가능 여부. 워커의 완료 선언은 최종 근거가 아니다.

## 9. 오류·예외와 미결정 항목

- 계약 충돌: 해당 작업만 멈추고 메인이 기준 문서·ADR을 정렬한다. 독립 작업은 진행 가능하지만 순서를 바꾼 이유와 파일 소유권을 기록한다.
- worker 실패/시간 초과: 실제 파일과 프로세스 상태를 확인하고 중복 재실행하지 않는다. 계약 오류만 한 번 보정할 수 있으며 원인 분석·품질 문제는 메인이 처리한다.
- 환경 부재: 도구를 임의 설치하거나 시험을 skip해 통과시키지 않는다. 필요한 환경·재개 조건을 명시한다.
- 서버 실통신: 테스트 대상·예상 비용·데이터 범위를 메인이 제한한다. 이미 부여된 사용자 권한 안에서 진행하고 요구 범위를 넓히지 않는다.
- 후속 확정: N01 값은 해당 기준 문서와 ADR-032에서 확정했다. N02의 Provider·자원·운영 값, N03의 시안/컴포넌트 파일, N04의 실제 migration과 시험 harness, N12의 release/config 버전은 각각 선행 단계의 필수 산출물이다. 워커가 추측하지 않는다.
- N00~N02 문서 계약과 N03의 정적 시안·상태 보완은 TEST_PLAN.md와 해당 기준 문서의 N01~N03 절에 기록했다. N03 시각 검토와 최종 매트 디자인 확정을 완료했다(ADR-037). N04의 `0020_n04_foundation.sql`·config v2·시험 파일은 분리된 PostgreSQL 17에서 실제 runner·제약/경합·재실행까지 검증해 완료했다. 다음은 N05이며 운영 데이터 초기화는 수행하지 않았다.

### N10-R1/N11-R1 보완 범위 추가 (2026-10-01)

- HANDOFF.md UI/API 연결 보완 계약을 따른다. provider-manager.tsx, chat-workspace.tsx 및 기존 n10/n11-browser.mjs를 수정한다. 추가로 apps/web/app/styles.css의 관리자 모델 행에 한해 이미지 예산 form의 grid 배치·모바일 줄바꿈을 보완한다. API/DB/의존성/운영 환경은 변경하지 않는다.

- N10-R1/N11-R1 결과: Web 31개·typecheck/build/lint, N10 HTTP/SSE 전체 브라우저 회귀 및 N11 HTTP 167건·63개 캡처 통과. 일반 설정의 자동 제목 보존과 이미지 estimate 저장/로드/경계/실패 초안을 검증했다. N12 착수 가능. 실제 DB/Provider 인수는 N13이다.

- N12 범위 보완: apps/api/test/n08-postgres.test.ts의 직접 lifecycle 호출을 새 beforeApplicationShutdown으로 정렬한다.

### N13 잔여 시험 실행 계약 (2026-10-02)

메인이 기존 통합 harness를 확장해 승인된 keyless LAN 모델의 제목·요약 호출 및 첨부 HTTP 처리, 한국어 OCR을 확인한다. 수정 허용: apps/web/test/n13-integration.mjs, apps/api/test/n13-ocr.mjs와 시험/상태/인계/Provider 계약 문서. fixture 생성은 tmp/n13 안에서 수행한다. 실제 로컬 호출은 정상 생성 1회·제목 1회·요약 최대 4회로 제한하고 유료 호출은 하지 않는다. 운영·보안 정책·schema·의존성 변경 금지. 기존 격리 DB와 Linux OCR runtime을 사용하고 모든 소유 임시 자원을 정리한다. 완료는 실제 HTTP 및 원장·usage 확인과 OCR 결과/정리 확인이며, 실패·환경 부재를 완료로 대체하지 않는다.

- 2026-10-02 실행 결과: 첨부HTTP2개·실제 요약1개와 기존공통5개 PASS, 한국어/영문 OCR exit0. 제목 고정64는 length 실패·harness exit1이며 실패 격리를 실제 DB로 확인했다. 현재 잔여 LOCAL_REMAINING 모드는 기존 기본 생성을 반복하지 않고 요약 max512 및 제목 고정64를 실행하며 finally에 진단/실행 상태를 저장한다. TEST_PLAN.md 최신 절이 실행/실패/정리 및 다음 환경 계약의 근거다. N13 부분 완료·N14 대기.

### N13 서버 시험 환경 후속 (2026-10-02, 실행 중)

사용자 요청으로 mihoservice_server에 API/Web/PostgreSQL/파일 저장소를 분리하고 Web HTTPS와 모델 HTTPS를 별개로 검증한다. 메인이 scripts/prepare-n13-server.py를 생성하고 기존 config.example.yaml·deploy/gateway.conf·Linux 의존성 image를 재사용한다. tmp/n13/server-*의 allowlist 코드 archive/build 파일만 전송한다(.env·실제 config·secret·사용자 파일·.git·node_modules 제외). 현재 lockfile hash가 기존 Linux image와 같음을 확인했다. 시험 전용 image/tag/container/network·새 계정/키와 전용 저장소만 사용한다. 운영 재시작·DB/기존 인증서 수정 및 public HTTP 허용 정책 변경 금지. Web DNS/주소·모델 역할/비용은 사용자 입력 전까지 미확정이다. 모델 목록 조회는 키가 있는 PC에서 실행하고 키를 출력/문서/코드 archive에 포함하지 않는다. 완료/중단은 실제 health·경로·OCR·호출별 증거와 환경 미확보를 구분하며 N13 필수 항목 전체 통과 전 N14로 넘어가지 않는다.

- 서버 후속 구현 허용 추가: scripts/enable-n13-test-https.sh, apps/web/test/n13-server-acceptance.mjs. 전자는 사용자 sudo로 새 test-chat site/cert만 추가하며 운영 site 수정 금지, 후자는 공인HTTPS에서 브라우저 PDF·PNG 업로드 및 Gemini Pro main256/제목64를 각1회만 실행한다. main에 OCR PDF와 고정 이미지를 함께 넣어 별도 OCR 유료 호출을 하지 않는다. 가격 조회 후 입력 main2048/title512·출력320의 예상 합계가 $0.01 이내일 때만 진행하고 재시도/다른 모델 전환 금지. 제목/본문/키를 결과 파일에 저장하지 않고 고정 기대값의 참/거짓과 token/status만 저장한다. 서버 시험 관리자 secret의 PC 전송은 자동 검토가 별도 동의를 요구해 사용자 응답 전까지 차단되어 있다. 사용자 sudo 실행으로 test-chat 인증서 생성은 완료했으며 기본 TLS readiness200을 확인했다.
- 추가 변경 허용: eslint.config.mjs의 기존 브라우저 mjs 시험 파일 목록에 n13-server-acceptance.mjs 한 항목만 등록한다. 의존성/전역 규칙 변경은 하지 않는다.

- 허용 추가: scripts/n13-mobile-provider.cjs. 시험 frontend의 전용 private IP:9090에서 무료 SSE fixture를 제공한다. 첫 요청은 짧은 제목 시험용 즉시 완료, 후속 요청은 실기기 재접속 확인용 지연 SSE이며 입력을 기록하지 않는다. Gemini 이미지 1회는 length로 실패·known1221/252, 제목 호출0으로 확인했다. 이미지 추가 호출 없이 새 mock main에 자동 제목1회만 연결한다. 실제 제목 검사 후 관리자 제목 설정은 반드시 해제해 모바일 mock 시험이 유료 호출을 만들지 않도록 한다.

### N13 서버 인수 실행 결과·후속 계약 (2026-10-02)

메인이 전용 Linux 환경·공인 Web HTTPS·Gateway HTTPS, 실제 제목64/15초 및 무료 mock를 사용한 전체 스캔 PDF 흐름을 검증했다. 정확한 결과/fixture 보완은 TEST_PLAN.md 최상단, 자원은 HANDOFF와 DEPLOYMENT_RUNBOOK의 최신 절을 따른다. scripts/n13-mobile-provider.cjs의 UTF-8/공백 정규화와 정확한 ESLint fixture 설정만 보완했으며 제품/정책 변경 없음.

후속 담당 메인, 수정 허용은 사용자 실기기 결과에 따른 기존 Web UI와 관련 회귀/문서이며 원인 분석 후 정확한 파일을 이 절에 먼저 추가한다. 이미지 실패 재시험은 모델·출력 예산·예상 비용·호출 수를 구체화하고 새 사용자 승인을 받아야 한다(현재 승인2회 소진). 제목64/15초 계약·HTTPS 목적지·운영 분리·민감 본문 없는 진단을 보존한다. 실기기/실제 이미지 인수가 남으면 N13 완료/N14 착수 금지. 무료 fixture/전용 환경은 실기기 결과까지 유지하고 종료 후 정리 증거를 기록한다.

### N13 잔여 두 항목 마무리 계약 (2026-10-02)

사용자가 N14 요청을 중단하고 N13 이미지/모바일 두 항목만 마무리하도록 범위를 제한했다. 메인 직접 담당, 이미지는 현재 가격/vision 조회만 완료하고 새 추가1회 승인 전 미실행이다. 확정된 제안·금액의 추정 성격·성공/중단 조건 및 짧은 모바일 체크리스트는 TEST_PLAN.md 최상단을 참조한다. 문서 수정 허용 TEST_PLAN/IMPLEMENTATION_STATUS/HANDOFF/이 계획/SPEC_AUDIT/PROVIDER_CONTRACT_TESTS. 승인 후 fixture를 수정해야 하면 실제 코드 변경 전에 정확한 파일을 여기 추가한다. 운영·DB schema·키 파일·의존성/정책 변경 금지. 두 필수 인수 결과 또는 명시 출시 범위 조정 전 N14 실제 전환 착수 불가이며 이미 실행한 조회를 전환 완료로 해석하지 않는다.

### N13 모바일 수동 인수 결과 (2026-10-02)

사용자가 체크리스트/스크린리더 설명 후 네 항목 전부 문제없음과 캡처5개를 제공했다. TEST_PLAN.md의 사용자 보고/직접 시각 확인 구분으로 모바일 수동 인수 통과를 반영했다. 모바일 추가 질문은 필요하지 않다. 실제 이미지 성공 인수만 남아 N13 부분 완료·N14 대기를 유지한다. 이 응답은 이미지 추가1회 비용 승인으로 해석하지 않으며 생성/설정/운영 변경 없이 문서만 갱신했다.

### N13 이미지 추가1회 실행 승인 (2026-10-02)

사용자가 제안 gemini-pro-latest/출력1024/예상 $0.01536·새 예산 $0.02/추가1회를 승인했다. 메인은 기존 apps/web/test/n13-server-acceptance.mjs에 IMAGE_ONLY 모드만 추가해 전용 새 시험 사용자 quota1·자동 제목 null·고정 PNG만 사용한다. 별도 image-retest-result.json에 이전 실패와 분리 기록하고 입력/가격 사전 확인, 실제 HTTP/SSE·색/도형/위치·usage·안전 진단·파일 삭제·모델 비활성화를 검증한다. 추가 자동 재시도/Provider 전환/운영 변경/의존성 변경 금지. 문서는 TEST_PLAN/STATUS/HANDOFF/PROVIDER_CONTRACT_TESTS/SPEC_AUDIT/이 계획. 실패하면 승인 소진과 차단 근거를 기록하고 추가 호출 없이 중단한다.


- N13 인수 종료 정리 생성 허용: scripts/cleanup-n13-server.sh. 현재 단일 시험 root/state의 정확한 Docker/site/cert 이름만 검증·제거하며 운영 자원 금지. 사용자 sudo로 실행하고 안전 결과는 PC에 먼저 보존한다. 최종 인수 완료와 실제 시험 환경 정리 상태를 구분한다.


### N13 승인 이미지 실행 결과 (2026-10-02)

승인 추가1회·출력1024 실제 이미지 인수 통과, usage1159/631·chat1개/보조0개·색/도형/위치·SSE completed·파일0·모델 비활성화 확인. N13 필수 기능 인수 완료·시험 환경 사용자 sudo 정리 대기이며 N14 준비 착수 가능. 실제 운영 전환은 이번에 미실행. 정확한 증거·지원 제한·정리 명령은 TEST_PLAN/HANDOFF/README/DEPLOYMENT_RUNBOOK 최신 절을 따른다.

### N13 종료·N14 선행 충족 (2026-10-02)

사용자 sudo 정리와 메인 SSH 읽기 전용 재확인으로 시험 containers/networks/images0·root/site/cert/renewal/ACME 제거, 운영5개 healthy를 검증했다. N13 필수 인수·정리 완료로 N14 착수 가능. 이전 N13 대기/정리 대기 문구는 당시 기록이다. N14 실제 전환은 아직 실행하지 않았다. 첫 작업은 운영 대상과 구체적인 새 release·별도 데이터 초기화·기존 보존/복구 범위 재확인이다.

### N14 실행 승인·작업 계약 (2026-10-02)

사용자 N14 승인에 따라 메인이 운영 전환을 수행한다. 기존 /home/totquf4171/modelnaru·project modelnaru·DB/uploads/config/secrets·실행 image를 보존하고 새 /home/totquf4171/modelnaru-v2-20261002·project modelnaru-v2·빈 v2 DB/새키를 준비한다. 사전 port32433에서 validate/migration/HTTP를 검증하고 기존 loopback32432를 새 gateway로 전환한다. 운영 domain/cert/host Nginx는 기존 구성을 유지한다. 기존 관리자 ID/hash/TOTP만 서버 내부에서 보존해 새 config에 적용하며 사용자/대화/Provider DB를 이식하지 않는다. 코드 archive는 명시한 소스만 포함하고 비밀파일/.git/의존성/기존데이터를 제외한다. 생성 허용 scripts/deploy-n14.py 및 필요한 smoke 전용 scripts/n14-smoke.mjs, 문서 README/DEPLOYMENT_RUNBOOK/PROFILE/TEST_PLAN/STATUS/HANDOFF/이 계획. 임시 관리자·무료 mock으로 실행 경로 검증 후 제거하고 보존 관리자 config로 재검증한다. 새 유료 호출 승인 없음. 검증 실패 시 기존 컨테이너와 port로 복구하고 중단 원인을 기록한다. 새 설치 init CLI와 기존 config의 관리자 섹션 보존 절차를 사용한다.


### N14 실행 결과 (2026-10-02 완료)

새 code-only archive 공식 Linux build/별도 v2 DB/CLI init·validate·20개 migration/checksum·staging smoke 후 32432 운영 전환 완료. 서버 자체 WAN timeout으로 실제 rollback 후 CA/SNI 유지 host HTTPS 및 PC 외부 경로 검증으로 재전환 성공. 운영 관리자만 보존·일반 사용자/Provider/대화 빈 상태, 이전 설치/DB/image 보존. 임시 mock/계정/password/builder 제거. 정확한 release/image/한계·운영/복구 명령은 TEST_PLAN/README/DEPLOYMENT_RUNBOOK/HANDOFF 최신 N14 절 참조. 제품/의존성/schema 변경과 유료 호출 없음.
