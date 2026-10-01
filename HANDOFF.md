# ModelNaru 새 버전 구현 인계

## UI-G 로컬 완료·운영 미반영 (2026-10-02 최신)

최신 로컬 변경은 WEB_UI_SPEC UI-G, 작업 범위는 IMPLEMENTATION_PLAN UI-G, 검증은 TEST_PLAN 최신 절이다. 재생성은 아이콘만 유지하며44px 버튼/20px SVG, 버튼 역할별 색상, 독립 /guest, 현재 모노그램 탭/홈 화면 아이콘을 적용했다. 이전 관리자 사용법 README/실행서 수정도 미커밋 상태로 보존했다. 새 의존성/API/DB 변경 없음. 코드·문서 로컬 완료, commit/push/운영 반영은 이번 작업에서 수행하지 않았다.

다음 작업은 사용자 시각 인수 또는 요청된 업데이트다. 배포 시 기존 운영 데이터·관리자 설정을 보존하고 과거 초기화 승인을 재사용하지 않는다. 관리자 ID는 사용자가 이후 변경했으므로 아래 초기 admin 안내를 현재 ID로 단정하지 않는다. 이전 설치 삭제 여부는 이번에 재확인하지 않았다.


## Git 운영 전환 완료·최종 old 삭제 대기 (2026-10-02 최신)

현재 운영 root /home/totquf4171/modelnaru-git, project modelnaru-git, branch codex/refactor-v2. GitHub push/서버 clone·Linux build·새 DB와 관리자 비밀번호/TOTP·공인 HTTPS/login/무료 생성·SSE·취소 인수 완료. 제품 build commit5bfe5db, 결과 문서 후속 commit은 별도다. 실제 상태/증거는 TEST_PLAN 최신 절과 서버 deployment-state.json을 따른다. 이전 archive 설치는 현재 운영이 아니다.

관리자 ID admin이며 새 password/TOTP는 서버 secrets/bootstrap-admin.json0600에서 사용자 본인이 확인한다. 기존 관리자 정보는 더 이상 새 설치에 적용되지 않는다. 기존 사용자/Provider/대화/첨부는 이전하지 않았고 새 설치의 시험 데이터도 제거했다. 승인된 외부 유료 호출은0이며 이후에도 과거 승인 재사용 금지.

마지막 작업은 서버 터미널의 sudo python3 /home/totquf4171/modelnaru-git/scripts/cleanup-legacy-modelnaru.py --execute. dry-run/구문/새 healthy/경로 검사는 완료했지만 사용자 sudo 비밀번호가 필요해 old 실제 삭제는 대기다. 이 명령은 old2개 설치·N04 데이터/자원만 지우며 새 root와 host HTTPS/SSH/다른 서비스는 보존한다. 사용자 실행 결과 뒤 읽기 전용으로 old0/new healthy를 재확인하고 GIT-RESET을 완료로 기록한다. 이미 삭제했다고 주장하지 않는다. 최신 사용자 요청이 과거 N14/UI-F의 보존-only 조건을 이번 한정 범위에서 대체한다.


## Git 재설치 진행 중 (2026-10-02 최신)

사용자가 기존 운영 데이터·이전 ModelNaru 백업·관리자 자격증명까지 모두 초기화하고 Git 브랜치로 새 설치를 요청했다. IMPLEMENTATION_PLAN.md GIT-RESET이 이번 계약이며 과거 보존-only 제약을 해당 ModelNaru 범위에서 대체한다. 브랜치 codex/refactor-v2, 새 root /home/totquf4171/modelnaru-git, project modelnaru-git. 아직 완료 아님. 기존 root2곳과 N04 전용 DB는 새 배포 검증 후 제거 대상, host HTTPS/SSH/다른 서비스는 보존한다.


## UI-F 로컬 개선 완료·다음 작업 (2026-10-02 최신)

UI-F0~F6를 메인이 순차 구현·검증했다. F01~F11 동작 원장은 WEB_UI_SPEC.md UI-F, 실행 증거는 TEST_PLAN.md의 최신 UI-F 완료 절이다. 기존 사용자 변경 위에 Web7개 제품 파일·기존 browser2개만 수정했으며 API/DB/인증 정책·의존성·배포 파일은 변경하지 않았다. Web31개·typecheck/build·tmp 제외 소스 lint와 Edge 채팅56/관리자124개 캡처 검증 통과. 전체 pnpm lint는 기존 tmp/n13/gateway-pro-discovery.mjs의 typed-lint 파서 오류로 실패했으며 설정을 완화하지 않았다.

사용자 검토용 `tmp/ui-feedback/review.html`, 대표 `n10/dark-1440-settings.png`, `n11/dark-1440-Provider.png`를 준비했다. F11 원본 왼쪽 이동은 수정 전 로컬 Edge에서 미재현; 명시 modal 위치와 경계 회귀를 보완했으며 제보 환경의 해결을 단정하지 않는다. 실제 모바일 가상 키보드/음성·Safari/Firefox 재검증과 사용자 최종 디자인 인수는 별도다.

다음 메인은 사용자 시각 피드백을 받고 필요한 UI만 기존 UI-F 파일 계약 안에서 수정한다. 운영 반영 요청을 받으면 최신 운영 데이터·Provider·관리자 설정을 보존하는 별도 업데이트 계약을 먼저 수립한다. N14 빈 DB 전환 스크립트 재실행·데이터 초기화·소진된 유료 호출 승인 재사용 금지. 이번에는 운영 접속/변경/유료 호출0회다.

## UI-F 착수 전 인계 (2026-10-02 당시 기록)

사용자 이미지6장을 모두 읽고 작업 계약을 작성했다. 다음 메인은 [UI_FEEDBACK_HANDOFF.md](./UI_FEEDBACK_HANDOFF.md) 전체와 WEB_UI_SPEC.md UI-F를 읽고 IMPLEMENTATION_PLAN.md UI-F0부터 순차 진행한다. 요구 원본은 design/ui-feedback/1.jpg~6.jpg. UI-F 문서화만 완료, 코드 구현/브라우저 검증/운영 반영은 미실행이다. 실행 상태는 IMPLEMENTATION_STATUS.md를 따른다.

N14는 아래 기록대로 이미 완료됐다. 이번은 새 운영 UI 보완이며 서버 전환을 다시 하는 작업이 아니다. 제품/운영 데이터·인증/TOTP·API/DB·Provider 예산을 보존한다. 특히 설정1024px 경계 전환, 자동 제목 PATCH 보존, 이미지 예산 null 처리의 기존 검증을 유지한다. 첫 실행은 UI-F0의 로컬 기준선/화면 재현이며 운영 배포·유료 호출·데이터 초기화는 포함하지 않는다.

## N14 운영 전환 완료·현재 운영 계약 (2026-10-02 최신)

N00~N14 완료. 실제 운영은 https://chat.mihoservice.xyz, root /home/totquf4171/modelnaru-v2-20261002, Compose project modelnaru-v2, loopback32432, config2·migration20·API/Web/Gateway/PostgreSQL4개 healthy다. 기존 /home/totquf4171/modelnaru와5개 컨테이너/DB/uploads/config/secrets/image는 rollback용으로 중지·보존했다. 전환 중 자체 WAN 재접속 timeout으로 실제 rollback을 검증한 후 재전환 성공했다. 상세 증거는 TEST_PLAN 최상단, 운영/복구 명령은 README/DEPLOYMENT_RUNBOOK 최신 N14 절을 따른다. 아래 N14 미실행/대기 기록은 당시 snapshot이다.

관리자 ID/hash/TOTP는 서버 내부에서 그대로 보존했으며 노출하지 않았다. 새 일반 사용자/Provider/대화/첨부는0개인 빈 설치이고 기존 사용자/키/대화를 이전하지 않았다. 관리자가 새 Provider/사용자를 등록한다. N14 smoke는 생성한 임시 계정/정확한 private IP의 무료 mock7개만 사용했고 모두 제거했다. 새 유료 호출0, 기존 N13 승인 모두 소진. 실제 Provider 추가 호출은 별도 승인 없이 하지 않는다.

다음 작업은 사용자 운영 피드백 또는 요청된 후속 변경이다. 운영 명령은 반드시 새 root에서 실행한다. 현재 서버 소스는162개 파일 archive이며 Git checkout이 아니다. 기준 HEAD9926625 + 미커밋 작업을 archive SHA256 0064c7d0092d97cc6c7b435986b8dc5dcd703bc88544cf1217ee41ed70864312로 식별하며 PC tmp/n14에 파일별hash/전환원장/이미지 식별·외부검증 증거가 있다. Compose override의 name:modelnaru-v2와 외부 frontend network·자원 제한을 보존한다. scripts/deploy-n14.py는 이미 실행된 일회성 전환 기록으로 재실행하지 않는다. 사용자 데이터가 생긴 이후 이번 빈 DB 전환 승인을 데이터 초기화 승인으로 재사용하지 않는다.


## N13 최종 종료·N14 첫 작업 (2026-10-02 최신)

N13 인수 및 자원 정리 완료. 사용자 sudo 실행 로그를 받고 SSH 읽기 전용으로 소유 containers/networks/images0·시험 root/site/cert/renewal/ACME 제거 및 운영5개 healthy를 재확인했다. 안전 결과 tmp/n13/server-cleanup-result.json을 보존했다. 아래 유지/정리 대기 문구는 당시 snapshot이며 시험 URL/계정/root는 종료됐다. 삭제된 root의 스크립트 실행/계정 재복사/모델 추가 호출을 시도하지 않는다. 두 차례 승인 유료 범위 모두 소진, 추가 호출 새 승인 필요.

다음 메인은 N14를 착수할 수 있다. IMPLEMENTATION_PLAN N14 및 DEPLOYMENT_RUNBOOK을 읽고 실제 운영 /home/totquf4171/modelnaru·project modelnaru·loopback32432, 새 release/image·별도 v2 데이터 경로·기존 config/data/secrets 보존·실패 시 rollback 범위를 먼저 재확인한다. 기존 DB 직접 v2 연결이나 시험 계정/Provider 키의 운영 승격 금지. 실제 운영 전환은 현재까지 수행하지 않았다. 기능/지원 제한은 TEST_PLAN/PROVIDER_CONTRACT_TESTS의 기존 검증 등급을 유지한다.


## N13 종료 인계·N14 준비 조건 (2026-10-02 최신)

N13 필수 기능 인수 통과. 승인된 이미지 추가1회가 색/도형/위치·completed/SSE terminal·known usage1159/631·DB 원장 chat1개/보조0개로 통과했다. 이번 비용 추정 $0.00989, 승인 소진. 기존 모바일/스크린리더 사용자 전 항목 수동 인수와 HTTPS/OCR/제목·회귀 증거를 함께 판정했다. 상세 원장은 TEST_PLAN.md 최상단이다. 이전 미승인/미검증은 당시 기록이다. 추가 실제 호출 금지, 전역 제목 null·유료 모델 disabled 유지.

PC 승인 password/TOTP 복사본·Edge는 정리 완료. 서버 전용 root /tmp/modelnaru-n13-server-naRXQ0 및 소유5 containers/2 networks/2 images·test-chat site/cert는 사용자 sudo 정리 대기다. 검토/구문/state 대조를 마친 scripts/cleanup-n13-server.sh의 서버 복사본에 대해 sudo bash /tmp/modelnaru-n13-server-naRXQ0/cleanup-n13-server.sh /tmp/modelnaru-n13-server-naRXQ0 실행을 요청했다. 안전 증거는 PC tmp/n13/image-retest-result.json/image-retest-safe-audit.json에 보존했으므로 사용자 실행 뒤 정확한 자원0·운영 healthy를 확인하고 문서에 실제 정리 결과를 기록한다. 이미 삭제했다고 주장하지 않는다.

N14 준비 착수 가능, 실제 전환 미실행. 다음 메인은 사용자 정리 결과 반영 후 실제 release 식별과 운영 /home/totquf4171/modelnaru·project modelnaru·loopback32432 및 기존 config/data/secrets 보존 범위를 재확인한다. /srv/modelnaru는 확인 당시 없었다. 운영 전환 명령/초기화·rollback 계획을 구체화한 뒤 N14를 실행한다. N13 시험 계정/DB/키를 운영에 승격하거나 운영 DB를 v2에 직접 붙이지 않는다. 운영 인접서비스/SSH/인증서 보존. 현재 사용자 범위는 N13 두 잔여 항목 마무리이며 N14 실행을 새로 요청한 것은 아니다.


## N13 잔여 두 항목 첫 작업 계약 (2026-10-02 최신)

담당 메인. TEST_PLAN.md 최상단이 이미지 조건·사용자 체크리스트·N14 판정의 최신 근거다. 모델 가격 GET만 재확인했고 추가 생성0회. 이미지 추가1회는 gemini-pro-latest/출력1024/입력 추정1536/예상 $0.01536·새 승인 예산 $0.02로 제안했으며 명시적 새 승인 전 실행/설정 변경 금지다. 승인 후 실제 경로 회귀 범위를 IMPLEMENTATION_PLAN에 먼저 기록하고 정확히1회만 수행·자동 제목 null/자동 재시도 없음·usage/안전 진단·시험 파일 삭제를 검증한다. 모바일·스크린리더 네 항목은 사용자가 설명 후 전부 문제없음 보고와 캡처5개를 제출해 수동 인수 통과했다. 직접 보이는 UI와 음성/첨부/재접속 사용자 보고를 구분한 증거는 TEST_PLAN.md 최신 절을 따른다. 정확한 기기/버전과 양쪽 OS 검증은 주장하지 않는다. 모바일 추가 확인을 반복 요청하지 않는다.

이미지 성공 인수 전 N13 부분 완료·N14 운영 전환 착수 불가. 사용자 모바일 확인은 이미지 유료 재시험 승인이 아니므로 추가 호출0회 유지. N14 요청은 중단됐고 운영 경로/포트/image/자원만 조회해 서비스/DB/설정 변경 없음. 읽기 전용 준비 가능. 결과 반영 허용 문서는 TEST_PLAN.md, IMPLEMENTATION_STATUS.md, HANDOFF.md, IMPLEMENTATION_PLAN.md 및 SPEC_AUDIT.md/PROVIDER_CONTRACT_TESTS.md다. 비밀값/본문 저장·운영 변경·명세 예산 완화 금지. 실제 이미지 실패 또는 사용자 미실행은 미통과/미검증으로 기록하고 추가 호출 금지다. 기존 전용 환경은 이미지 승인/재시험 또는 사용자 종료 지시까지 유지한다.


## 최신 N13 인계 (2026-10-02 서버 HTTPS 후속)

TEST_PLAN.md 최상단이 최신 근거다. 서버 공인 CA HTTPS·실제 로그인, 스캔 PDF 브라우저→Linux OCR→추출문 저장→무료 mock 요청 문맥→SSE 완료→파일 삭제, 실제 gemini-pro-latest 자동 제목64토큰/15초 인수가 통과했다. 이미지1회는 max256 length/CHAT_OUTPUT_LIMIT로 실패했다. 승인된 이미지1+제목1 유료 호출은 소진됐으며 usage 기반 비용 추정 $0.006342≤$0.01(청구서 아님). 추가 유료 호출은 새 모델/예산·횟수 승인 전 금지다. 제품 코드/정책/운영 DB는 미변경이다.

유지 자원: /tmp/modelnaru-n13-server-naRXQ0, Docker 접두사 modelnaru-n13-server-narxq0의 postgres/api/web/gateway/mobile 5개, frontend/backend 2개 network, api/web 2개 image. https://test-chat.mihoservice.xyz는 동일 반응형 Web이며 전용 Nginx site modelnaru-n13-test와 공인 인증서가 연결됐다. 사용자 n13acceptance와 무료 n13-mobile-fixture로 시험 중이며 사용자가 모바일 전반 정상 의견을 보고했다. 기기/브라우저·개별 항목·스크린리더 실행 범위는 추가 확인 대기다. 시험 비밀번호는 서버 private/mobile-credentials.json만 본인이 읽는다. PC 승인 계정 복사본 삭제 완료. 전역 제목 null·유료 모델 disabled를 보존한다. 운영 container/site/volume/키를 사용하지 않는다.

다음 메인: 사용자 실기기 결과 반영·필요 UI 수정, 이미지 실패의 출력/모델 적합성 검토 후 구체적인 추가 호출 조건 승인을 받는다. 기존 gemma 제목 실패·일반 생성/요약/경합/재시작/5분 부하 증거는 재사용한다. 전체 서버 harness 기본 모드나 title-only 재실행 금지(유료 예산 소진); 무료 OCR_ONLY만 추가 검증 가능하다. 자원 정리는 DEPLOYMENT_RUNBOOK.md 최신 N13 절이며 host Nginx/cert 제거는 사용자 sudo가 필요하다. N13 부분 완료·N14 대기다.

## 1. 목적·적용 범위·현재 위치

- 작성일: 2026-09-30. 다음 메인 에이전트와 제한된 하위 작업 담당자가 대화 이력 없이 이어받기 위한 문서다.
- 현재 상태: N00~N12 완료. N12는 격리 Docker/API/PostgreSQL/mock에서 11개 설치·복구·SSE·종료·업데이트 인수를 통과했고 임시 자원을 정리했다. 운영은 미변경이다. 독립 점검 N10-R1/N11-R1은 보완·재검증 완료했다. N09 서버 보완은 API 214개(실DB 6개 포함), N10 공통·채팅 UI는 Web 31개·typecheck/build/lint와 실제 Edge+loopback HTTP fixture·22개 화면 캡처로 검증했다. N11 관리자·진입 UI도 Web 31개·typecheck/build/lint, 실제 Edge HTTP 160건·캡처 61개로 검증했다. 최신 증거는 TEST_PLAN.md N10-R1/N11-R1 보완 완료 절이다. N11 최신 재실행은 HTTP 167건·63개 캡처다. 실제 API+DB+HTTPS 전체 인수, 실제 Provider/OCR·실기기는 N13이며 운영 전환은 수행하지 않았다.
- 다음 작업: N13 부분 완료에서 이어간다. TEST_PLAN.md N13의 실제 Web/API/DB/테스트 HTTPS 결과와 차단·미실행 구분, SPEC_AUDIT.md N13 표, 아래 7H를 읽는다. N14는 대기다.
- 역할: 다음 에이전트는 메인 역할을 이어받는다. code_light는 메인이 구체화한 작은 작업만 수행하며 전체 리팩토링이나 단계 전체를 맡기지 않는다.
- 이 문서는 읽기 경로와 인계 시점의 요약이다. 정책·실행 상태의 별도 원장이 아니다. 최신 상태는 [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md), 작업 계약은 IMPLEMENTATION_PLAN.md, 기능 정책은 아래 원장 문서에서 확인한다.

### N09 재점검 후속 계약

상태: 완료(2026-10-01). 아래는 보완 작업의 범위/보존 조건 기록이다. 오류별 service/controller fixture, 실DB PATCH/충돌·terminal 및 실제 HTTP streaming PATCH/409를 검증했다. 최신 실행 증거·미검증 범위는 TEST_PLAN.md를 따른다.

- 담당: 메인. 기준은 TEST_PLAN.md N09-R1/R2, FILE_PROCESSING_SPEC.md N09, API_SPEC.md N09 및 activeJob 계약이다.
- 수정 허용: apps/api/src/attachments.service.ts, apps/api/src/attachments.controller.ts, apps/api/src/chats.repository.ts, apps/api/test/attachments.service.test.ts, apps/api/test/n09-postgres.test.ts, apps/api/test/providers-custom-http-postgres.test.ts. controller 변경은 연결 독립적인 retry의 불필요한 disconnect signal 전달 제거에 한정한다. 오류 HTTP 매핑 검증에 추가 test 파일이 필요하면 정확한 경로를 계획에 먼저 등록한다.
- 문서: TEST_PLAN.md, IMPLEMENTATION_STATUS.md, IMPLEMENTATION_PLAN.md, HANDOFF.md의 결과·상태·후속 계약을 갱신한다.
- 보존/금지: 원본 처리의 연결 독립성, 소유권/CAS/활성 job 제한을 보존한다. DB schema·의존성·lockfile·Web UI·운영 서버는 변경하지 않는다.
- 완료: 재처리 오류의 안전 code/status 보존, 활성 job 중 title/pin PATCH 성공 및 409 snapshot에 실제 activeJob 포함, terminal 뒤 null을 검증한다. 전체 API 회귀와 영향받는 typecheck/lint를 통과하고 실DB 미실행을 완료로 대체하지 않는다.
- 중단: 환경/계약 충돌은 구체적인 차단 사유로 기록하고 기존 통과 시험을 완화하지 않는다.

### 완료된 UI/API 연결 보완 계약 (2026-10-01 독립 점검 후속)

- 결과: 두 결함 수정 및 Web 31개/typecheck/build/lint, N10/N11 실제 브라우저 fixture 재검증 통과. 이미지 예산은 실제 서버 순수 함수를 UI 저장값으로 검증했다. TEST_PLAN.md 최신 보완 완료 절 참조.

- 담당: 메인. 선행: 현재 N10/N11 구현. 읽기: TEST_PLAN.md 최신 독립 점검, PROVIDER_REGISTRATION_SPEC.md estimate 계약, API_SPEC.md 제목/모델 PATCH, WEB_UI_SPEC.md.
- 코드 수정 허용: apps/web/app/provider-manager.tsx, apps/web/app/chat-workspace.tsx, apps/web/test/n10-browser.mjs, apps/web/test/n11-browser.mjs. 분리된 순수 함수/시험을 생성하려면 정확한 경로를 IMPLEMENTATION_PLAN.md에 먼저 기록한다.
- 목표: 관리자 이미지 토큰 예약값 입력·저장·로드와 실제 서버 한도 일치, 명시 제목 변경에만 title PATCH. 제목을 바꾸지 않은 일반 설정 저장은 자동 제목 상태를 보존한다.
- 보존/금지: 확정 매트 시안·접근성·초안/충돌·Provider 보안 경계 보존. API/DB schema·의존성·lockfile·운영 서버 변경 및 실제 유료 호출 금지.
- 완료: Web 회귀/typecheck/lint와 두 흐름의 payload 검증을 통과한다. fixture는 실제 API의 이미지 null-estimate 실패와 title 필드의 수동 전환 규칙을 반영해야 한다. 실패 저장 시 초안 및 자동 제목 진행 중 일반 설정 저장도 확인한다.
- 문서: TEST_PLAN.md, IMPLEMENTATION_STATUS.md, IMPLEMENTATION_PLAN.md, HANDOFF.md 및 변경에 필요한 WEB_UI_SPEC.md를 함께 갱신한다. 환경/계약 충돌은 차단 근거로 기록하고 기존 시험을 완화하지 않는다.

## 2. 가장 먼저 읽을 순서

1. [AGENTS.md](./AGENTS.md) 전체: 문서 규칙·메인/워커 제한·기존 변경 보존.
2. [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)의 새 버전 문서·작업 인계 기준 및 완료 정의.
3. [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)의 새 버전 작업 원장: 이 인계 시점에는 N00~N12 완료·N13 부분 완료다. 이어받는 시점에 다시 확인한다.
4. [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) 전체: N00~N14 순서, 단계별 계약, 하위 작업 인계 형식.
5. [SPEC_STATUS.md](./SPEC_STATUS.md)의 2026-09-30 새 버전 현재 판단과 [SPEC_AUDIT.md](./SPEC_AUDIT.md)의 같은 날짜 종합 재점검.
6. [DECISIONS.md](./DECISIONS.md)의 ADR-025~037 및 각 ADR이 대체한 이전 결정을 읽는다.
7. 배정 단계에 해당하는 아래 상세 문서와 실제 코드를 읽는다. 하위 워커에게는 전체 문서 묶음 대신 해당 절·정확한 파일·완료 조건을 전달한다.

### 적용 우선순위와 오래된 내용 주의

- 사용자의 최신 명시적 지시 → 해당 기능의 확정된 새 버전 기준·ADR → 현행 구현 기록 → 초기 계획 순으로 해석한다.
- 같은 날짜의 새 문서라도 확정/제안/미구현/미검증을 구분한다. 문서 상단의 새 버전 계획을 현재 구현 기능으로 오해하지 않는다.
- SPEC_AUDIT.md와 SPEC_STATUS.md의 이전 번호 절에는 초기 MVP 전제가 남아 있다. 현재 판단은 날짜가 표시된 새 버전 절이다.
- WEB_UI_SPEC.md의 기존 7색·검정/흰색 토큰·중앙 설정 모달은 현행 기록이다. 새 버전은 매트 테마·아이리스 보라색·기본 닫힘 오른쪽 설정 패널이다.
- 현행 브라우저 disconnect 취소·Temperature 1.0 기본값은 새 버전의 계속 생성·Provider 기본 파라미터로 바뀐다. 정확한 대체 범위는 CHAT_STATE_SPEC.md와 ADR을 따른다.
- AI 동시성은 현행 config의 사용자당 2개와 새 계약의 주체당 1개가 다르다. 새 job API는 N06에서 주체당 1개·서버 전역 슬롯을 적용했고 N08에서 요약·제목을 연결했다. 배포된 v1/기존 동기 SSE와 구분한다.
- 제목과 지속 생성은 ADR-032/036·CHAT_STATE_SPEC.md N01, Provider 자원·종료·보안·운영은 ADR-033/036과 해당 기준 문서 N02 절, UI 구조·상태는 ADR-034, 최종 시각 기준은 ADR-037·WEB_UI_SPEC.md 상단과 N03을 따른다. ADR-035는 ADR-036으로 대체됐다. 서버 API는 N06~N08 구현·검증했고 새 앱 UI/운영 전환은 후속 단계다.
- 문서 충돌을 발견하면 메인이 원장·ADR을 정렬한다. 워커가 오래된 조항을 골라 계약을 새로 만들지 않는다.

## 3. 전체 문서 지도

이 표는 저장소 root의 구현 참고 Markdown 전체를 다룬다. 실제 정책을 반복 복사하지 않고 문서의 역할·읽을 시점·주의점을 안내한다.

| 문서 | 기준으로 삼을 내용 | 주로 읽는 단계·주의 |
| --- | --- | --- |
| [AGENTS.md](./AGENTS.md) | 문서 색인·갱신 의무·워커 계약·권한 범위 | 모든 작업 시작 전. 기존 사용자 변경 보존 |
| [HANDOFF.md](./HANDOFF.md) | 문서 읽기 순서·인계 snapshot·첫 작업 | 처음 인계받을 때. 실행 상태 원장 아님 |
| [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) | 작성·검증·문서/코드 정렬 절차 | 모든 단계. 최초 MVP 개발 순서와 새 계획 구분 |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | N00~N14 의존관계·범위·산출물·인계 양식 | 작업 순서의 원장 |
| [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) | 현재 단계·담당·차단·검증 상태 | 실행 상태의 유일 원장. 날짜별 과거 기록과 구분 |
| [SPEC_STATUS.md](./SPEC_STATUS.md) | 확정/미결정과 착수 조건 | N00~N03. 최신 날짜 절 우선 |
| [SPEC_AUDIT.md](./SPEC_AUDIT.md) | AUD-01~15 근거·우선순위·인수 기준 | N00~N02, N13. 결함 발견은 수정 완료가 아님 |
| [DECISIONS.md](./DECISIONS.md) | 결정 이유·대안·대체 관계 | 설계·계약 변경 때. ADR-025~037부터 확인 |
| [README.md](./README.md) | 현행 제품 소개·설치·사용법·문서 진입 | N00, N12~N14. 새 버전 설치 명령은 구현·검증 후 갱신 |
| [REQUIREMENTS.md](./REQUIREMENTS.md) | 역할·제품 범위·새 기능 요구 | N01~N03, N13. 계획을 구현 사실로 읽지 않음 |
| [TECH_STACK_OPTIONS.md](./TECH_STACK_OPTIONS.md) | 기술 선택 근거·대체안 | N02, N04, N12. 대체안 목록이 교체 지시는 아님 |
| [CHAT_STATE_SPEC.md](./CHAT_STATE_SPEC.md) | 작업 수명·소유권·취소·분기·제목·설정 | N01, N06, N08~N10. 새 버전 절이 핵심 동작 원장 |
| [API_SPEC.md](./API_SPEC.md) | 인증·요청/응답·오류·SSE·pagination | N01~N02, N04~N11. N01/N02 job/Provider/제목 API 구현, N09 탐색/설정·첨부 구현/검증 |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | table·제약·transaction·삭제·migration | N01, N04, N06~N09. 현재 schema와 예정 구조 구분 |
| [AI_INTEGRATION_SPEC.md](./AI_INTEGRATION_SPEC.md) | protocol·event·usage·context·보조 호출 | N01~N02, N05~N08. N05 종료·오류 및 N08 예산/보조 호출 구현 |
| [PROVIDER_REGISTRATION_SPEC.md](./PROVIDER_REGISTRATION_SPEC.md) | 내장·커스텀/로컬 등록·모델·자격증명 | N02, N07, N11. 새 커스텀 범위가 현 고정 URL 정책의 예외 |
| [PROVIDER_CONTRACT_TESTS.md](./PROVIDER_CONTRACT_TESTS.md) | protocol fixture·실통신 증거·지원 수준 | N02, N05, N07, N13. fixture/실제 키·로컬 시험 구분 |
| [SECURITY_SPEC.md](./SECURITY_SPEC.md) | session·CSRF·secret·SSRF·렌더링·복구 | N01~N02 및 영향받는 모든 구현. TOTP 복구 등 미구현 주의 |
| [GUEST_ACCESS_SPEC.md](./GUEST_ACCESS_SPEC.md) | 임시 주체·모델 권한·quota·만료 | N01, N06, N09, N11. 계속 생성도 session 만료 정책 적용 |
| [FILE_PROCESSING_SPEC.md](./FILE_PROCESSING_SPEC.md) | 파일 제한·추출·OCR·상태·TTL·삭제 | N01, N04, N09~N10. 실행 중 첨부와 cleanup 경합 보완 |
| [ADMIN_LOGGING_SPEC.md](./ADMIN_LOGGING_SPEC.md) | 감사·사용량·마스킹·보관·내보내기 | N01, N08, N11~N13. 보조 호출 실패·취소 usage 계약 보완 |
| [WEB_UI_SPEC.md](./WEB_UI_SPEC.md) | 시각 기준·화면 구성·조작·반응형 | N03 시안, N10 공통·채팅 구현/브라우저 검증 완료, N11 관리자·진입 UI 구현/브라우저 fixture 검증 완료 |
| [design/n03-preview.html](./design/n03-preview.html) | N03 기본 6종+필수 상태 2종 정적 화면 시안 | 최종 매트 기준의 8종 시각 검토 완료. 실제 동작·접근성 인수 자료는 아님 |
| [SERVER_CONFIG_SPEC.md](./SERVER_CONFIG_SPEC.md) | config schema·시작 검증·관리자 CLI | N02, N04, N12. 예제/실제 적용/복구 약속 정렬 필요 |
| [DEPLOYMENT_PROFILE.md](./DEPLOYMENT_PROFILE.md) | 운영 자원·네트워크·단일 서버 전제 | N00, N02, N12~N14. 용량 등 수치는 시점별 관측값 |
| [DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md) | 설치·실행·Nginx·update·복구 | N02, N12~N14. 현행 명령이 새 release에 유효한지 재검증 |
| [TEST_PLAN.md](./TEST_PLAN.md) | 실행 명령·환경·결과·미검증·인수 | 모든 단계. 과거 통과 수를 새 작업 결과로 쓰지 않음 |

### 작업별 최소 참고 묶음

공통 필수 문서(위 2절)를 읽은 뒤 해당 묶음을 사용한다.

- 지속 생성·중복 방지: CHAT_STATE_SPEC → API_SPEC → DATABASE_SCHEMA → GUEST_ACCESS_SPEC·SECURITY_SPEC → TEST_PLAN.
- Provider·로컬 모델: PROVIDER_REGISTRATION_SPEC → AI_INTEGRATION_SPEC → SECURITY_SPEC → API_SPEC·DATABASE_SCHEMA → PROVIDER_CONTRACT_TESTS.
- 제목·요약·컨텍스트: CHAT_STATE_SPEC → AI_INTEGRATION_SPEC → ADMIN_LOGGING_SPEC → API_SPEC·DATABASE_SCHEMA → TEST_PLAN.
- 즐겨찾기·대화 탐색·설정: WEB_UI_SPEC·CHAT_STATE_SPEC → API_SPEC·DATABASE_SCHEMA → GUEST_ACCESS_SPEC → TEST_PLAN.
- 첨부: FILE_PROCESSING_SPEC → CHAT_STATE_SPEC·SECURITY_SPEC → API_SPEC·DATABASE_SCHEMA → TEST_PLAN.
- UI: WEB_UI_SPEC → 해당 기능의 API/상태 명세 → SECURITY_SPEC → TEST_PLAN. UI에서 미정인 서버 규칙을 만들지 않는다.
- 설치·복구: SERVER_CONFIG_SPEC → SECURITY_SPEC·DEPLOYMENT_PROFILE → DEPLOYMENT_RUNBOOK → README → TEST_PLAN.

## 4. 사용자 결정 요약과 위임 범위

아래는 인계용 요약이며 수치와 상세 동작은 원장 문서에서 확인한다.

- 현재 기능 기반으로 내부 구조와 사용자·관리자 UI를 전면 개편한다.
- 디자인: 매트·깔끔하지만 밋밋하지 않게. Linear의 계층, Raycast의 도구 구성, Craft의 본문 가독성 참고. 다크/라이트의 불투명 무채색 매트 표면과 단일 보라색 강조, 상태 의미색을 사용한다. 글로우·리퀴드·반투명 탐색안은 폐기했다(ADR-037).
- 채팅: 왼쪽 대화 목록·중앙 본문/입력창·기본 닫힘 오른쪽 설정. 모델은 즉시 저장/다음 요청 적용, 고급 설정은 적용 버튼.
- 대화 전환·새로고침·탭 닫기 후에도 생성 지속, 재접속 상태 복원. 명시적 중지·권한/session 종료는 별개다. 서버 재시작 후 자동 유료 재호출은 하지 않는 설계다.
- 모델 즐겨찾기 포함. 검색·필터·제목 검색·고정·오류·첨부·운영 개선 세부 판단은 메인에게 위임됐다.
- 자동 제목 생성용 모델은 관리자 공통 지정. 사용자·게스트별 제목 모델 선택은 제공하지 않는다.
- 관리자가 직접 주소·API 키를 넣는 커스텀 Provider 및 무인증 로컬 모델 연결 포함. 화면 표시 이름은 Provider 이름으로 이해한다.
- 기존 운영 데이터는 새 버전 전환 시 초기화해도 된다. 지금 삭제하라는 지시가 아니며 다른 서비스 데이터와 향후 모든 업데이트에 대한 삭제 허용이 아니다.
- 서버 설치·설정·실행·업데이트·상태/로그 확인 사용법을 README에 정리하고 실제 구현과 함께 갱신한다.
- 이후 문서는 하위 에이전트 작업 기반으로 작성한다. 구체적인 경로·계약·오류·검증·미결정을 남기고 사용자에게 이미 맡겨진 기술 판단을 반복해서 질문하지 않는다.

## 5. 인계 시점의 저장소·환경

### 로컬 snapshot

- 작업 폴더: C:\Users\Jae\Documents\APIchat
- OS/shell: Windows / PowerShell.
- 확인한 HEAD: 992662520773a5e74262b2b9b6808e02a1578e4e (feat: add per-model web search controls).
- 이 인계까지 앱 코드·package·lockfile·migration·운영 설정은 변경하지 않았다. 여러 root Markdown에 합의·계획·감사를 반영한 미커밋 변경이 있다.
- AGENTS.md에는 이번 대화 이전 사용자 변경이 포함돼 있었다. 전체 복원·초기화·덮어쓰기를 금지하고 최신 git diff로 구분한다.
- IMPLEMENTATION_PLAN.md와 이 HANDOFF.md, design/n03-preview.html은 신규 파일이며 인계 시점에는 미추적 파일이다. 다음 에이전트는 commit만 checkout한 다른 폴더에서 이 문서들을 얻을 수 없다. 같은 작업 폴더를 사용하거나 변경·신규 문서를 모두 보존해 옮겨야 한다. 이 작업에서 commit/push는 하지 않았다.
- node_modules는 존재했다. 로컬 Node.js v24.19.0, pnpm 11.25.0을 확인했으며 packageManager 선언은 pnpm@11.9.0이다. 다음 작업에서 실제 실행 버전을 다시 확인한다.
- sandbox 안에서는 node_modules 읽기가 EPERM으로 실패했고 허용된 재실행에서 검사가 가능했다. EPERM을 코드 결함으로 기록하거나 패키지 재설치로 우회하지 않는다. 현재 권한·실패 근거를 먼저 확인한다.

### 실제 서버에서 이전에 확인한 사실

- SSH 별칭: mihoservice_server. 설치 root: /home/totquf4171/modelnaru.
- 확인 당시 소스 HEAD는 로컬과 같고, API/Web/Gateway/PostgreSQL/Valkey는 healthy, 내부 웹 200·API live/ready 정상, migration 0019까지 19개 적용이었다.
- Ubuntu 24.04.4 LTS, API Node.js v24.14.1. 서버 스크립트 변경은 두 bin 파일의 실행 권한 추가, 미추적 [migrate] 파일은 0 bytes였다.
- 실제 운영 데이터가 있으나 본 작업에서 삭제하지 않았다. 서버의 비밀 설정·API 키는 문서에 기록하거나 워커에게 전달하지 않는다.
- 위 내용은 앞선 읽기 점검 결과다. 현재 가동 상태, 이미지와 소스 일치, 외부 HTTPS, 모든 Provider·로컬 모델 호환을 보장하지 않는다. 배포 시 다시 확인한다.

## 6. 확인된 결함과 검증 증거

| 내용 | 증거 수준 | 기준 문서 |
| --- | --- | --- |
| EOF·stream 내 error가 성공 done으로 종료 | 외부 통신 없는 mock 2건으로 재현 | SPEC_AUDIT AUD-04, TEST_PLAN 종합 감사 |
| AI 동시성 설정이 API 실행 코드에서 소비되지 않음 | 소스 검색·정적 대조, 부하 재현 아님 | AUD-02 |
| 요약 실행 후 일일 quota 예약 | 실제 코드 호출 순서 확인 | AUD-03 |
| 문자 기반 context와 출력/이미지/요약 입력 budget 부족 | 소스 정적 대조 | AUD-06 |
| 지속 생성·checkpoint·재구독은 아직 없음 | 현재 controller/execution/repository 확인 | AUD-01 |
| 관리자 복구·문서 상태의 불일치 | 요구·보안·CLI 문서/코드 대조 | AUD-12, AUD-15 |

- 앞선 기준선 실행: 테스트 201개 통과, Windows 조건부 시험 1개 제외, typecheck·lint 통과. 당시 실행에 대한 사실이며 새 작업이나 새 버전 통과를 뜻하지 않는다.
- 이번 인계 작성: 문서·링크·범위·단계 참조 검사만 수행한다. production build·실제 DB/E2E·실 Provider 시험은 이번에 실행하지 않는다.
- 추가 개선 항목과 종료 조건은 SPEC_AUDIT AUD-01~15 전체와 IMPLEMENTATION_PLAN의 감사 매핑표를 따른다. 위 표만 보고 감사를 축소하지 않는다.

## 7. 완료된 N04 작업 계약 (기록)

### 역할·선행 조건·읽기

- 역할: 다음 에이전트가 메인으로 조사·DB/config 구현·검증을 담당한다. N04 전체를 경량 워커에 배정하지 않는다.
- 선행: N00~N03 완료. 기존 미커밋 변경과 현재 HEAD·도구 버전을 재확인하고 보존한다. 앞선 시험 통과를 새 구현의 검증으로 사용하지 않는다.
- 기준: IMPLEMENTATION_PLAN.md N04, DATABASE_SCHEMA.md N01, SERVER_CONFIG_SPEC.md N02, CHAT_STATE_SPEC.md N01, API_SPEC.md N01, SECURITY_SPEC.md N02, ADR-032/033/036. 최종 UI 기준은 WEB_UI_SPEC.md와 ADR-037이며 이 단계의 UI 수정 근거가 아니다.
- 먼저 읽을 코드: packages/database/src/index.ts, migrate.ts, migration-plan.ts와 기존 migrations 전체, packages/database/test/migration-plan.test.ts, packages/config/src/schema.ts·index.ts, packages/config/test/config.test.ts, config.example.yaml 및 root/해당 패키지 package.json. 현행 구조를 읽고 새 계약의 정확한 변경 파일을 기록한 뒤 구현한다.

### 허용 범위와 보존 조건

- 목표: 확정 DB·config 계약을 실제 schema/설정에 반영하고 격리 PostgreSQL 시험 기반을 만든다. 상세 필드·기본값·오류 조건을 이 인계에서 재정의하지 않는다.
- 기존 수정 허용 파일: packages/database/src/index.ts, packages/database/src/migrate.ts, packages/database/src/migration-plan.ts, packages/database/test/migration-plan.test.ts, packages/config/src/schema.ts, packages/config/src/index.ts, packages/config/test/config.test.ts, config.example.yaml. v2 `init` 유지에 필요한 `tools/admin-cli/src/cli.ts` 최소 변경은 메인이 직접 수행했다. 필요한 파일만 변경한다.
- 생성 파일: `packages/database/migrations/0020_n04_foundation.sql`, `packages/database/test/n04-postgres.test.ts`. N04에서 이미 작성했으며 실DB 검증과 결함 수정 대상이다. 디렉터리 전체를 하위 워커 수정 범위로 넘기지 않는다.
- 문서 수정 허용: DATABASE_SCHEMA.md, SERVER_CONFIG_SPEC.md, TEST_PLAN.md, IMPLEMENTATION_STATUS.md, IMPLEMENTATION_PLAN.md, HANDOFF.md, SPEC_STATUS.md. 중요 결정이 바뀌면 DECISIONS.md와 관련 계약 원장도 이유·범위를 먼저 명시하고 함께 갱신한다. 설치/실행 명령 변경이 필요할 때 README.md·DEPLOYMENT_RUNBOOK.md를 함께 갱신한다.
- 보존: 기존 migration 이력은 N02의 신규 설치 전략에 따라 취급한다. 기존 사용자 변경을 덮어쓰지 않는다. 실제 config.yaml·secret·운영 DB로 테스트하지 않는다.
- 금지: N05 이후 parser/실행 job/API/UI 기능 선행 구현, 운영 서버 재시작·배포·초기화. 의존성·lockfile·패키지 명령·배포 설정은 기본 범위에 포함하지 않는다. 시험 기반에 추가 변경이 꼭 필요하면 메인이 근거와 정확한 파일을 계약에 기록하고 직접 처리한다.

### 완료·중단·인계

- 격리된 실제 PostgreSQL에서 신규 설치, 중복 key, FK/cascade, 조건부 갱신, migration 재실행을 검증한다. ADR-036의 assistant 본문 byte CHECK 교체와 config 경계값도 포함한다. 구체적 입력·기대 결과는 원장 계약을 따른다.
- config 단위 시험과 영향받는 typecheck/lint를 실행한다. 새 시험 명령은 실제로 만든 후 실행 위치·사전 조건·결과를 TEST_PLAN.md에 등록한다.
- Docker/시험 DB를 확보할 수 없으면 DB 검증을 차단으로 기록한다. SQL 문자열 검사나 mock 통과로 대체해 N04 완료를 선언하지 않는다. 독립적인 config 작업은 진행할 수 있다.
- 원장 계약 충돌·예상 밖 사용자 변경을 발견하면 해당 변경을 멈추고 메인이 정리한다. 미결정 세부사항을 하위 워커가 추측하지 않는다.
- 완료 시 변경 파일·실행 검사·남은 한계와 N05 착수 조건을 기록하고 상태 원장을 갱신한다. 실제 앱 UI·실 Provider·배포 검증은 이 단계 완료에 포함되지 않는다.

## 7A. 다음 첫 작업 계약 — N05 Provider parser·공통 호출

이 절은 N05 완료 전 계약을 보존한 기록이다. 실행 결과는 `TEST_PLAN.md` N05 절과 `PROVIDER_CONTRACT_TESTS.md` N05 절을 따른다.

- 선행·역할: N04 완료. 메인이 세 protocol 종료/오류 판정과 공통 실행 경로를 직접 조사·구현·검증한다. `IMPLEMENTATION_PLAN.md` N05 및 AI_INTEGRATION_SPEC.md N02, PROVIDER_CONTRACT_TESTS.md, SECURITY_SPEC.md N02, TEST_PLAN.md를 읽는다.
- 먼저 읽을 코드: `apps/api/src/chat-streaming.ts`, `apps/api/src/provider-parameter-policy.ts`와 이들의 호출자·기존 test. 실제 수정 파일과 생성할 protocol fixture 파일은 호출 경로를 조사한 뒤 계획 문서에 정확히 기록한다. parser/stream과 무관한 API job·Web·DB·배포 파일은 N05에서 수정하지 않는다.
- 수행·완료: 정상 terminal과 비정상 EOF/stream 내부 오류·거부·빈 답변, 누적 UTF-8 byte·idle/전체 시간·취소와 usage unknown 처리를 OpenAI·Anthropic·Gemini fixture로 확인한다. 실제 Provider 자격증명 시험은 별도 증거로 구분한다. N04 테스트 DB는 `mihoservice_server`의 중지된 `modelnaru-n04-postgres-test` 컨테이너와 전용 volume에 보존돼 있다. 운영 DB는 N05 시험 대상으로 사용하지 않는다.
- 중단·인계: API 계약이나 보안 목적지 정책의 충돌은 메인이 원장 문서를 정렬한다. N06의 지속 생성·quota를 선행 구현하지 않는다. 시험 실패·실연동 미검증을 완료로 표시하지 않고 TEST_PLAN.md·PROVIDER_CONTRACT_TESTS.md와 상태 원장에 남긴다.

## 7B. 완료된 작업 계약 — N06 지속 생성·quota

2026-10-01 완료 현황: `IMPLEMENTATION_PLAN.md` N06 범위의 job 시작·실행·조회·구독·종료와 격리 PostgreSQL 경합 검증을 완료했다. 아래 문단은 당시 작업 계약의 기록이며 현재 결과는 `TEST_PLAN.md` 최신 N06 절과 `IMPLEMENTATION_STATUS.md`를 따른다.

- 선행·역할: N04·N05 완료. 메인이 job 수명·중복 시작·quota/slot·저장/구독 경합의 설계와 구현을 직접 맡는다. 기준은 `IMPLEMENTATION_PLAN.md` N06, `CHAT_STATE_SPEC.md`·`API_SPEC.md`·`DATABASE_SCHEMA.md` N01, `AI_INTEGRATION_SPEC.md` N02, `GUEST_ACCESS_SPEC.md`, `SECURITY_SPEC.md`, `TEST_PLAN.md`다.
- 첫 작업: 현 `chat-execution.service.ts`, `chats.controller.ts`, `chat-messages.repository.ts`, access/auth 및 N04 migration의 job/quota 테이블을 읽고 호출·소유권 경로를 그린다. 실제 수정·생성 파일을 이 계획에 정확히 기록한 다음 구현한다. `streamProviderRequest`의 `maximumGeneratedTextBytes`에 job의 config snapshot 값을 전달하고 실패·취소 시 parser가 내보낸 부분 usage를 DB에 보존한다.
- 완료: `IMPLEMENTATION_PLAN.md` N06의 DB+mock Provider 중복 방지, 재접속, terminal 경합, quota/slot, session 종료·재시작 검증을 모두 통과한다. 웹 UI·실 Provider 연결·운영 배포는 수행 범위가 아니다.
- 중단: 정책·API·DB 계약 충돌은 원장에 먼저 정리한다. 운영 DB를 테스트 대상으로 사용하지 않는다. 기존 주체·대화 소유권과 session trace 제한을 유지한다.

## 7C. N07 transport 결함 수정 기록 (2026-10-01 완료)

- 역할·목표: 메인이 TEST_PLAN.md N07 독립 점검의 R1/R2를 수정한다. 선행은 현재 N07 구현이며 N08 선행 구현은 범위 밖이다.
- 읽기: provider-destination.ts, provider-discovery.ts, providers.service.ts의 testCustom, SECURITY_SPEC.md N02, PROVIDER_CONTRACT_TESTS.md, TEST_PLAN.md 최신 점검.
- 코드 수정 허용: apps/api/src/provider-destination.ts, apps/api/test/provider-destination.test.ts. 새 fixture 파일이 필요하면 정확한 경로를 계획에 먼저 기록한다. 문서는 TEST_PLAN.md, PROVIDER_CONTRACT_TESTS.md, IMPLEMENTATION_STATUS.md, IMPLEMENTATION_PLAN.md, HANDOFF.md를 갱신한다.
- 보존·금지: DNS 검증 IP 고정, TLS 인증서 검증과 목적지/redirect 제한을 보존한다. DB·운영 서버·의존성·lockfile·UI 변경과 실제 유료 호출은 금지한다.
- 완료 결과: Node 기본 주소군 자동 선택의 도메인 소켓 경로, HEAD/204/205 응답, 응답 변환 오류 rejection을 실제 transport로 시험했다. 전체 API 190개, build/typecheck/lint, 수정 빌드의 격리 DB·별도 HTTP 시험 2개가 통과했다. `TEST_PLAN.md` 최신 절에 미실행 공인 HTTPS·실모델 범위와 정리 결과를 기록했고 N07 fixture 인수를 완료로 재판정했다.
- 중단: 시험 환경 또는 계약 충돌로 재현/검증할 수 없으면 원인과 미검증을 기록한다. 기존 188개 시험 통과만으로 결함 해결을 선언하지 않는다.

## 7D. N08 완료·당시 N09 첫 작업 계약 (2026-10-01 기록)

- 완료 결과: `TEST_PLAN.md` N08의 203개 전체 API 시험, 격리 PostgreSQL 5개·별도 HTTP 제목 설정/저장과 N06/N07 회귀, API build/typecheck/lint가 통과했다. N04 schema를 재사용했고 migration·패키지·운영 서비스·Web UI는 변경하지 않았다. 제목/요약 사용량의 실패·취소·재시작 정리와 수동/삭제/session 저장 경합을 검증했다. 실제 Provider와 UI는 후속 인수다.
- 선행·역할: N06·N08 완료. 메인이 N09의 탐색·설정·첨부 경합을 조사하고 구현한다. 읽기는 IMPLEMENTATION_PLAN.md N09, API_SPEC.md N01, CHAT_STATE_SPEC.md N01, DATABASE_SCHEMA.md N01, FILE_PROCESSING_SPEC.md, SECURITY_SPEC.md, TEST_PLAN.md다.
- 첫 작업: chats/access/models/attachments의 현 코드와 기존 시험을 읽고 즐겨찾기·검색·고정 cursor·설정 revision·첨부 처리/TTL 보호의 호출/소유권 경로를 정리한다. 기존 schema/명세와 충돌을 먼저 해소하고 정확한 수정/생성 파일을 IMPLEMENTATION_PLAN에 기록한 뒤 구현한다. 디렉터리 전체나 미정 계약을 워커에게 넘기지 않는다.
- 보존·금지: 현재 미커밋 사용자 변경과 N08 결과를 보존한다. 운영 DB/서비스·실 Provider key·Web UI·의존성·migration 수정은 기본 범위 밖이다. 테스트 DB의 전용 컨테이너/volume은 재사용하되 운영 DB와 분리하며 시험 종료 후 임시 API/mock/tunnel을 정리한다.
- 완료·중단: N09의 주체별 격리·권한 회수·안정 cursor·stale 설정 충돌·첨부 처리/삭제/만료 경합을 격리 DB로 확인하고 상태/시험 문서를 갱신한다. 실행 환경이나 명세 충돌로 진행할 수 없다면 완료 대신 원인과 미검증 범위를 기록한다.

## 7E. 완료된 N10 첫 작업 계약 (2026-10-01 기록)

상태: 완료. 실제 수정 범위는 IMPLEMENTATION_PLAN.md N10, 증거는 TEST_PLAN.md N10이다. 아래 최초 계약은 작업 이력이다.

- 선행·역할: N03·N07·N08·N09 완료. 메인이 API/소유권·job 상태·복원·컴포넌트 구조를 조사하고 구현한다. 전체 단계와 async 상태/보안 판단을 경량 워커에게 넘기지 않는다.
- 읽기: IMPLEMENTATION_PLAN.md N10, WEB_UI_SPEC.md의 최종 ADR-037/8종 시안, API_SPEC.md N01/N09, CHAT_STATE_SPEC.md, FILE_PROCESSING_SPEC.md N09, SECURITY_SPEC.md 렌더링/XSS, TEST_PLAN.md 최신 N09. 코드 시작점은 apps/web/app/chat-workspace.tsx, styles.css, client-auth.ts, provider-parameter-fields.tsx와 실제 API 호출자/기존 Web test다.
- 첫 작업: 현재 단일 화면의 데이터·draft·job·model/attachment/settings 상태를 그려 재사용할 요소를 정하고 정확한 수정/생성 파일과 props/event 계약을 IMPLEMENTATION_PLAN에 먼저 기록한다. 새 revision 필수 PATCH/branch와 nextCursor·favorite/status API를 연결한다. 기존 소스/미커밋 변경을 보존하고 전체 파일을 무차별적으로 덮어쓰지 않는다.
- 금지/보존: 운영 DB/서비스·실 Provider·의존성/lockfile·배포 변경은 기본 범위 밖이다. API 계약 수정이 필요하면 먼저 원장 충돌을 정리하고 정확한 파일을 추가한다. Markdown 렌더링 보안·권한·계속 생성/GET+SSE revision·IME/draft 복원을 유지한다.
- 완료/중단: 실제 브라우저에서 다크/라이트·좁은 화면·keyboard/IME·대화 전환·구독 재접속·미완성 Markdown/XSS·모델/첨부/설정 오류 상태를 검증하고 원장을 갱신한다. 브라우저/실행 환경 차단을 source 확인이나 CSS 변경만으로 완료 처리하지 않는다.

## 7F. 완료된 N11 작업 계약 (2026-10-01)

- 결과: 구현·Web 31개·typecheck/build/lint 및 실제 Edge HTTP 160건·61개 화면 캡처 통과. TEST_PLAN.md N11 참조. 다음 단계는 7G이다.

- 선행/담당: N03·N07·N08·N09·N10 완료. 메인이 인증/권한·관리자 데이터·비밀값 마스킹·UI와 검증을 담당한다.
- 기준: IMPLEMENTATION_PLAN.md N11, WEB_UI_SPEC.md N03/N10, API_SPEC.md N07/N08/N09, PROVIDER_REGISTRATION_SPEC.md, ADMIN_LOGGING_SPEC.md, SECURITY_SPEC.md, TEST_PLAN.md N10. N10의 common CSS는 기존 관리자 구조에도 적용되므로 실제 화면을 다시 확인한다.
- 우선 읽기/수정 후보: apps/web/app/page.tsx, admin-workspace.tsx, provider-manager.tsx, access-manager.tsx, user-manager.tsx, summarization-manager.tsx, server-settings.tsx, usage-dashboard.tsx, admin-log-viewer.tsx, workspace-models.tsx, styles.css. 구현 전 호출 경로를 읽고 이 후보 중 정확한 수정 파일·신규 component/test 경로를 계획에 등록한다. wildcard 배정은 하지 않는다.
- 수행: 사용량→Provider→접근·모델→로그→서버 설정의 고정 탐색, 커스텀 Provider/단계별 진단·수동 모델·제목/요약 설정·사용량 구분, 사용자/관리자 로그인·게스트 진입을 실제 API에 연결한다. 공통 job·Markdown 경로를 관리자 개편 때문에 되돌리지 않는다.
- 보존/금지: 기존 미커밋 코드·문서, 인증/CSRF/일반·게스트 관리자 차단, nonce CSP와 안전 렌더링을 보존한다. 의존성/lockfile/DB schema·운영 DB/서비스·실 Provider 자격증명은 기본 범위 밖이다. 정책 변경이 필요하면 먼저 원장과 정확한 범위를 기록한다.
- 완료: Web 타입/시험/build/lint와 실제 브라우저의 역할별 접근·비밀값 비노출·좁은 폼/표·오류/대기 상태를 검증한다. 화면 fixture와 실제 API/DB 인수를 구분하고 실행 환경 차단은 구체적인 사유로 남긴다. N12 배포/복구 작업을 완료한 것으로 취급하지 않는다.

## 7G. 완료된 N12 작업 계약 (2026-10-01)

결과: TEST_PLAN.md N12의 격리 배포 11개 인수·API 208개/CLI 5개·타입/lint 통과. Docker source와 로컬 runtime 파일 hash 일치. 운영 미변경, 전용 컨테이너·이미지·빌더·시험 data/secret 정리 완료. 아래 최초 계약은 이력이다.

- 역할/선행: 메인이 담당. N02·N11 완료. N10/N11의 브라우저 fixture 검증을 실제 서버·배포 인수로 오해하지 않는다.
- 첫 작업은 읽기/조사: IMPLEMENTATION_PLAN.md N12, SERVER_CONFIG_SPEC.md, SECURITY_SPEC.md의 복구/session 폐기, DEPLOYMENT_PROFILE.md, DEPLOYMENT_RUNBOOK.md, README.md, TEST_PLAN.md를 확인한다. tools/admin-cli/src/cli.ts, config.example.yaml, Dockerfile, compose.yaml, deploy/gateway.conf, bin/modelnaru, bin/apichat-admin과 관련 package/config·시험을 조사한다.
- 정확한 수정/신규 시험 파일은 조사 후 N12 계획에 먼저 등록한다. 복구 정책·인증·배포 환경 변경을 경량 워커에게 넘기지 않는다. 사용자 미커밋 작업과 N04~N11 신규 파일을 보존한다.
- 수행/완료: 관리자 복구·session 폐기, 새 job SSE proxy/heartbeat·종료, runtime/config/schema 호환, 신규 설치·시작·중지·상태/log/health·업데이트를 격리 환경에서 검증하고 README/runbook을 실제 명령과 함께 갱신한다. 구체적인 조건은 N12 원장 계약을 따른다.
- 금지/중단: 운영 서비스/DB/실 Provider 자격증명 사용 및 초기화는 이 인계로 승인되지 않는다. 격리 Docker/호환 환경을 확보하지 못하면 해당 배포 인수는 완료로 표시하지 말고 실패 명령과 차단 사유를 기록한다. N13/N14를 N12 완료로 대신하지 않는다.

## 7H. 다음 N13 첫 작업 계약 (2026-10-01)

- 최신 PC 앱 후속 완료: 사용자 "일단 테스트 계속해"로 복구 모델 gemma4-12b를 승인 사설192.168.0.12:8080의 실제 custom API에 등록하고 max64 생성1회로 pending SSE 끊기 뒤 생성 지속·streaming GET+SSE 정확 복원·terminal·usage72/39·charged/원장 각1개·안전 진단을 검증했다. 통합6개·HTTP63건·브라우저 오류0, 증거 tmp/n13/local-restored/에 분리했다. 큰 본문 부하/Gateway를 중복 호출하지 않았고 전용 DB/network/tunnel/private fixture를 정리했다. 현재 서버 앱의 공인HTTP 등록 경로 선택·공인 Web HTTPS·실기기가 다음 조건이며 제품/보안 정책/운영은 변경하지 않았다.

- 최신 모델 주소 정정/복구: 사용자 설명상 192.168.0.12:8080은 작업 PC 망이다. 서버에서 그 주소의 timeout을 복구 실패나 필수 라우팅 변경 사유로 삼지 않는다. 제공한 공인 IP:808은 PC/서버 timeout이고 :8080/도메인은 HTTP 200이다. 사용자가 808은 오타·8080이 맞다고 확정했다. 서버 격리 Docker의 keyless gemma4-12b 생성 1회 max64는 22.230초·usage21/49·stop/DONE으로 통과했고 컨테이너를 정리했다. 증거 tmp/n13/local-model-restored-probe.json. 공인 HTTP 직접 진단이라 앱 custom 등록/job/quota/SSE 복원의 서버 인수를 대체하지 않는다. 지원 HTTPS endpoint 또는 별도 목적지 정책 선택이 다음 조건이며 임의로 HTTP 공인 목적지/SSRF를 허용하지 않는다. TEST_PLAN.md 최상단 참조.

- 응답 진단 후속 완료: ADMIN_LOGGING_SPEC.md N13 절의 안전 메타데이터를 공통 streamProviderRequest의 실패/종료 경계에서 기록한다. raw trace 이전 실패도 포착한다. 새 fixture 21개와 공통 parser 합계 57개, 전체 API 로컬 229개·실DB 6개 제외, typecheck/build/lint 통과. 보완 작업 자체는 로컬 검증만 했고, 이후 아래 별도 승인 실제 시험에서 harness의 안전 로그 수집·본문 대신 byte 수 보존을 확인했다. 기존 유료 실패 원인은 미확정이며 추가 실제 호출은 TEST_PLAN.md 최상단의 새 승인/격리/1회 상한 조건을 따른다.

- 최신 Gateway: 응답 진단 보완 뒤 사용자 "다음작업시작해"로 승인한 gemini-3.8-flash/256토큰/추가 1회/$0.01 이내 시험은 정상 완료했다. HTTP 200/text/event-stream·약 249초·data event 5개, 본문 2 byte·usage56/100·charged·HTTPS SSE terminal·GET/DB 일치. 통합 7개·브라우저 HTTP 60건·오류 0이며 안전 진단의 실제 수집도 확인했다. 증거는 tmp/n13/gateway-256-result.json, gateway-result.json, gateway-integration-result.json, provider-response-diagnostics.json이다. 기존 64토큰 CHAT_OUTPUT_LIMIT와 256토큰 CHAT_PROVIDER_RESPONSE_INVALID는 별도 실패 이력이며 후자는 gateway-256-no-diagnostic-result.json에 보존했다. 이전 원인은 미확정이다. 총 실제 생성 3회·모든 승인 범위 소진, 추가 호출은 새 승인 필요. 키/생성 본문을 새 증거에서 제외했고 모든 Gateway 임시 자원을 정리했다. 다음은 서버→LAN 및 공인 Web HTTPS·실기기 환경 차단 해소이며 N14는 대기다.

- 재개 후 추가 완료: TEST_PLAN.md 최상단 N13 잔여 인수 재개 절을 우선한다. 제목/요약 실제 HTTP SIGKILL·재시작(부분 usage 보존·자동 재호출 없음), 사용자 승인 파일 3개로 실제 영문 스캔 OCR/오류/정리, 작업 PC의 실제 custom LAN gemma4-12b job(usage 72/26·charged), 공개 OpenAI TLS 무인증 401을 확인했다. 아래 OCR 승인 대기는 이전 기록이다.
- 최종 부하 인수: 5분 지정·실제 313.094초, 정상 GET/SSE 정확 복원, paused 수신자만 terminal 이전 종료, API RSS 최대 281.8 MiB. 통합 8개·브라우저 HTTP 71건 통과. tmp/n13/result.json와 load-result.json, TEST_PLAN 최신 절 참조. 임시 DB/network/tunnel/컨테이너/private fixture·원격 OCR 파일은 정리했다. 다음은 서버→LAN 네트워크와 웹 앱 공인 HTTPS·실기기 환경 차단 해소이며 N14는 대기다.
- 현재 등록 경로 대기: 복구된 공인 HTTP domain:8080은 서버 Docker에서 직접 생성까지 통과했다. 기존 앱 정책은 공인 HTTPS 또는 승인 사설 literal IP:port만 지원하므로 지원 endpoint 확보나 명시적 정책 선택이 필요하다. 192.168.0.12는 서버망이 아니라 작업 PC 망이다. 라우팅/방화벽·SSRF 계약은 변경하지 않는다.

- 최신 결과: 전체 287개 통과·config Windows 조건 1개 제외, typecheck/lint/build 통과. n13-integration.mjs는 실제 관리자/사용자 인증, 이미지 estimate, reload 복원, 일반 설정 title_source 보존, 취소, 안전 Markdown/반응형을 실제 API/DB/테스트 인증서 HTTPS로 검증한다. 큰 본문 결과·환경 정리는 TEST_PLAN.md N13 최종 기록을 확인한다. N11 checkbox와 N06 terminal 알림의 비동기 시험 경합은 보정 후 통과했다.
- 사용자 승인: OCR 파일 3개 임시 전송은 명시적 동의를 받고 실행·정리했다. LAN 주소와 로컬 모델 시험도 승인받았다. 상용 Provider별 인증 검증은 키/비용 범위가 제공되지 않았으므로 fixture 지원 수준을 유지한다. 운영 env/config/mount를 재사용하지 않는다.
- 잔여: 5분/느린 SSE 수신자 부하의 최신 실행 결과는 TEST_PLAN.md를 확인한다. 보조 호출 중 process 강제 종료 HTTP 인수는 완료했다. 웹 앱의 공인 HTTPS·실기기 IME/키보드/스크린리더는 환경 확보가 필요하다. 기존 N12 Docker 11개 인수·N06/N07/N08/N09 실제 API/DB 회귀를 중복 구현하지 않는다.

- 메인 담당, N05~N12 완료 선행. TEST_PLAN.md 최신 N12·N11 독립 재확인, PROVIDER_CONTRACT_TESTS.md, SPEC_AUDIT.md, IMPLEMENTATION_PLAN.md N13 및 각 기준 명세를 읽는다. AUD-01~15별 기존 증거와 빠진 실제 연동/브라우저/HTTPS/OCR/실기기 인수를 구분한다.
- N12 script는 격리 Docker·실제 API/DB/HTTP/SSE의 배포 검증이며 외부 HTTPS·실제 Provider 인수를 대신하지 않는다. 이전 전용 /tmp 폴더·이미지·DB는 정리했으므로 재사용 가능하다고 가정하지 않는다. 재현 절차는 TEST_PLAN.md N12를 따른다.
- 조사 후 정확한 수정/생성 파일과 실행 대상을 계획에 등록한다. 기존 미커밋 작업과 로고를 보존한다. N11 checkbox 보정은 완료했으며 기대값 완화·skip으로 실패를 숨기지 않는다.
- 실제 자격증명과 대상/비용은 현재 사용자 승인 범위에서만 사용한다. 운영 서비스·DB 초기화나 N14 전환은 이 계약으로 승인되지 않는다. 환경/키 부재는 구체적인 미검증·차단으로 기록하며 source/fixture 통과로 대체하지 않는다.

## 8. 하위 에이전트에 넘길 때

- IMPLEMENTATION_PLAN 7절 인계 양식을 사용한다. 역할, 목표 하나, 최소 문맥, 정확한 읽기/수정/생성 파일, 금지·보존·완료/중단 조건, 실행 검사와 결과 형식을 채운다.
- code_light에 공개 API·DB·인증/보안·의존성·배포·복잡한 async 상태 결정을 맡기지 않는다. 사용 가능한 도구 schema를 확인하고 없는 task/scope 필드를 만들지 않는다.
- 기본 순차 호출, 동일 파일·공용 문서의 단일 작성자 원칙을 지킨다. 워커의 완료 선언 뒤 메인이 실제 diff와 검사를 확인한다.
- 도구가 없으면 메인이 처리한다. 새 chat 생성·다른 chat 메시지 전송·서버 handoff는 이 문서 작성만으로 수행된 것이 아니다.

## 9. 오류·미결정·인수 조건

- 미검증 항목: N07 transport 결함 2건과 N09 응답 결함 2건은 해결했다. N10은 production Web+loopback fixture의 실제 브라우저 인수를 완료했으며 전체 실제 API/DB/HTTPS 연결·실기기 IME/가상 키보드·음성 screen reader는 N13이다. 실제 자격증명·공인 HTTPS·Docker→실제 LAN 모델 통신 및 보조 호출 도중 강제 종료 HTTP 인수도 N13에 남는다. N11 관리자/진입 UI의 브라우저 fixture 인수는 완료했다. N12 배포 명령·업데이트 호환성은 다음 단계에서 수행한다.
- 인계 유효 조건: 모든 root 참고 문서가 3절에 연결되고 로컬 링크가 존재하며 AGENTS 색인에서 이 문서를 찾을 수 있다. 실행 상태와 이 snapshot이 다르면 실행 원장을 따른다.
- 새로 이어받은 에이전트가 수치·정책 충돌을 발견하면 관련 원장·ADR을 함께 갱신한다. 이미 위임된 기술 판단은 메인이 처리하되 제품 범위를 크게 바꾸는 결정은 사용자와 논의한다.
- 인계 문서 작성 완료와 N00 기준선 확인 완료는 별개의 결과다. 기능 구현·배포는 완료로 표시하지 않는다.

## 10. 다음 에이전트에게 전달할 메시지

```text
ModelNaru 새 버전 작업을 이어받아 주세요. 같은 작업 폴더의 HANDOFF.md와
AGENTS.md를 먼저 읽고 IMPLEMENTATION_PLAN.md 순서를 따르세요.
현재 N10-R1/N11-R1 보완은 완료했습니다. TEST_PLAN.md 최신 보완 결과와 이 문서 7G를 읽고 N12로 진행하세요. N09 보완의 API 214개·실DB/HTTP 검증과 N10 Web 31개·실제 Edge+loopback HTTP fixture·22개 캡처 결과는 TEST_PLAN.md에 있습니다. N10의 매트 UI·job 복원·설정/첨부·안전 Markdown·nonce CSP를 보존하세요. 실제 API/DB/HTTPS 전체 인수와 Provider·Docker·실기기는 N13입니다.
미커밋 문서와 신규 IMPLEMENTATION_PLAN.md/HANDOFF.md/design/n03-preview.html, 기존 사용자 변경을
보존하세요. commit만으로는 최신 계획을 가져올 수 없습니다.
TEST_PLAN.md의 N11 결과/미검증과 ADR-032~037을 확인하고 HANDOFF.md 7G 및 IMPLEMENTATION_PLAN.md N12에 정확한 수정/생성 파일·격리 운영 인수 범위를 기록한 뒤 구현하세요. fixture와 N13 실제 통합 인수를 구분하세요.
메인은 설계·핵심 구현·검증을 담당하고 code_light에는 구체화된 작은 작업만
배정하세요. 기술 세부 판단은 위임돼 있지만 확정/제안/미검증을 구분해야 합니다.
운영 서버는 mihoservice_server이며 새 버전 인수 전에는 변경·초기화하지 마세요.
```
