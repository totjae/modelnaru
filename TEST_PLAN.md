# ModelNaru 시험 계획·결과

## UI-G 운영 반영 완료 (2026-10-02)

사용자 요청으로 codex/refactor-v2 제품 commit 99d0940을 운영 /home/totquf4171/modelnaru-git에 ff-only 반영했다. 제한 builder(CPU1.5/RAM3GiB) frozen-lockfile Linux build 통과. Web image sha256:9b0eef0a64c5406840e6615c61cff7a6c255d5cb84da84a98c6bc3a3ee801bc8로 Web만 교체, Gateway nginx -t/reload 성공. API/PostgreSQL container ID 불변,4서비스 healthy·live/ready 정상. config/secrets/data 수정·migration·실 Provider 호출 없음. 이전 Web은 modelnaru-ui-g-rollback-web 태그로 보존, 임시 builder 제거.

외부 PC의 공인 DNS/CA HTTPS Edge에서 로그인·약한 선택색/Primary 구분·로그인 하단 guest 부재·/guest 링크 및390px 가로 넘침 없음·로그인 복귀·새 SVG favicon 버전/내용·ready200·pageerror0 검증. 게스트 활성=true. 최초 networkidle 대기는30초 timeout이었으며 실제 DOM 준비/요소 기반 재시험은 통과했다. 증거 tmp/ui-g/production/login.png,guest-mobile.png 및 production-check.mjs. 실제 사용자 로그인·채팅/재생성은 이번 운영 점검에서 실행하지 않았으며 로컬 fixture 회귀 증거를 유지한다. 사용자 시각 인수는 별도다.


## UI-G 로컬 검증 완료 (2026-10-02)

버튼 역할·답변 액션·독립 /guest·모노그램 favicon을 수정했다. Web 단위31개, Web typecheck/build, 전체 lint 통과. Edge 실제 로컬 Web+fixture API에서 N10 채팅56개 캡처(생성3/취소1/구독6), N11 진입·관리자·게스트128개 캡처/HTTP280건 통과. 검증은 버튼 역할별 computed 색상·대비, 답변44px 버튼/20px SVG, 분기/재생성, 로그인 하단 guest 부재, /guest 링크·뒤로가기·직접/새로고침·비활성·잘못된 코드·429·정상 참가·인증 후 복귀, 새 SVG 아이콘 HTTP200/버전/경로를 포함한다. 390/1440px guest overflow 없음. dark desktop 로그인/설정·dark mobile guest 캡처를 육안 확인했다.

증거: tmp/ui-feedback/n10, n11. API는 fixture이며 실제 Provider/운영 접속·배포0회. 실제 모바일·Safari/Firefox·기존 브라우저 캐시 갱신은 미검증. 새 아이콘 URL 버전은 적용했지만 운영 반영 전 기존 사이트 표시가 바뀌었다고 주장하지 않는다. 사용자 최종 디자인 인수는 대기다.


## 2026-10-02 관리자 계정 사용법 문서 보완

README 관리자 계정 관리와 DEPLOYMENT_RUNBOOK 4절에 실행 위치/사전 조건, ID3~64자 허용문자, 비밀번호10자·확인 입력, 최초 TOTP와 재발급 구분, QR/수동 등록(SHA-1·6자리·30초), validate→restart→status/health→로그인, 초기 사본의 비동기화/삭제 조건, 오류·복구 절차를 추가했다. tools/admin-cli/src/cli.ts·helpers.ts 및 bin/modelnaru와 명령/검증 규칙을 정적으로 대조했다. 제품·실제 관리자 설정·서버·운영 데이터는 이번 작업에서 변경하지 않았고 자격증명/QR 출력 명령을 실행하지 않았다. 문서 상대 링크·code fence·CLI 명령명 확인 통과, git diff --check exit0(LF→CRLF 안내만 있음). 제품 시험은 문서 변경이므로 재실행하지 않았다.


## Git 운영 CLI 환경 파일 보완 (2026-10-02)

최종 health에서 기존 CLI가 --env-file .runtime.env만 전달해 .env의 COMPOSE_PROJECT_NAME/COMPOSE_FILE을 누락하는 결함을 확인했다. 새 Docker 서비스 자체는 정상이며 helper의 두 env-file 호출은 이미 통과했다. bin/modelnaru가 .env 존재 시 .env→.runtime.env 순으로 명시 로드하도록 보완했다. .env 없는 설치는 기존 동작을 유지한다. host 실행 스크립트만 변경하며 API/Web 이미지 재빌드 대상은 아니다. 서버 sh -n 통과, 실제 ./bin/modelnaru status가 새 modelnaru-git 서비스만 조회하고 health의 live/ready/Web 모두 통과했다. 임시 디렉터리/가짜 Docker로 .env 유무×status/health/logs/stop/start/restart/update 14개 인자 전달 검증도 통과했고 실제 서비스 재시작은 하지 않았다. CLI 보완 commit eb6088b, API/Web build commit5bfe5db로 구분한다.

## 2026-10-02 Git 재설치 운영 인수 (전환 완료·old 삭제 대기)

- 사용자 승인: codex/refactor-v2 새 브랜치·전체139개 코드/명세/이미지 GitHub push, 기존 운영/백업과 관리자 로그인 정보까지 초기화. 최초 push 자동 검토 거절 후 저장소/범위 명시 승인을 받아 진행했다. 실제 repo origin https://github.com/totjae/modelnaru.git. 소스 build commit 5bfe5dbc9e410fd400bdb0c3f4fb3c489a68a4fb. 이후 결과 문서 commit은 제품 source와 구분한다.
- 소스 검사: staged139개 파일의 제외 경로/주요 key·private key 패턴 검사0건. config/runtime/secrets/data/tmp/agent 첨부 제외. pnpm test301개 통과·8개 조건부 제외(API229/Web31/config15/database21/admin-cli5), pnpm typecheck/lint exit0. tmp 생성 진단 mjs와 agent 첨부만 eslint ignore에 추가했고 실제 소스/시험 규칙은 완화하지 않았다. bin2개 실행mode와 LF를 Git 관리했다.
- 새 서버: /home/totquf4171/modelnaru-git에 실제 git clone·branch checkout. .env의 COMPOSE_PROJECT_NAME=modelnaru-git 및 COMPOSE_FILE=compose.yaml:deploy/compose.production.yaml. 전용 frontend와 backend, 기존 한도의4서비스를 사용한다. Docker builder CPU1.5/RAM3GiB로 frozen-lockfile Linux config/database/admin/API/Web build 및 image4개 완료. 초기 shell 전달 마지막 CR로 service 이름 오류가 났으나 build 명령을 정상 재실행했고 dependency/lockfile 변경0이다. builder는 제거했다.
- fresh init: 관리자 admin/새 random password/TOTP·DB password·Provider master key 모두 서버 내부에서 생성. 기존 config/secret 복사0. config0600, secrets0700, bootstrap-admin.json0600. 사용자는 서버 private 파일에서 확인한다. 문서/로그/PC에 비밀값 저장0. subnet을 실제 Docker network에서 조회해 trustProxy에 정확히 반영했다.
- 32433 staging: migration20개 적용, migrate 재실행 checksum 검사, 실제 관리자 로그인/TOTP/session/health 통과. 운영 전환 후32432·기존 host Nginx 공인 CA HTTPS에서 같은 로그인과 ready 통과. PC 실제 DNS/CA에서 ready config/database ok 및 Web HTTP200. 새 api/web/gateway/postgres4개 healthy.
- 무료 mock: 새 임시 private-IP Provider/model/user로 공인 HTTPS 실제 HTTP 생성→완료→GET snapshot/SSE terminal 일치, 별도 취소→cancelled 검증. 외부 유료 호출0. 임시 user/provider/conversation/mock container/파일 제거 후 users/provider_connections/conversations/attachments 각0개. 새 운영에는 시험 모델·키가 남지 않았다. 안전 state는 서버 deployment-state.json, PC tmp/git-deploy/deployment-state.json으로 보존한다.
- source/운영: build commit에서 checkout clean 확인. API image sha256:1422d9cf6f15b6efb0c074183bca3856b3c95b71dbdf5885dacd9d1cbd3233e1, Web sha256:634b5536a98f627f94b4280a9cfefb9698cf51c4180859b957c8bad8d257dac8. 전체 image는 safe state 참조. 제품 UI는 앞선 UI-F Edge 인수 재사용이며 이번 변경에서 실기기 음성/가상 키보드를 다시 검증했다고 주장하지 않는다.
- old 삭제: cleanup-legacy-modelnaru.py 구문과 실제 dry-run 통과. old root3개, container12개, network4개, N04 volume1개, old image tag10개를 정확히 검사했다. root 삭제에는 사용자 sudo가 필요해 실행하지 않았다. 기존 v2 gateway/api/web는 중지했으며 old PostgreSQL 등 남은 자원은 최종 cleanup 대상이다. host site/cert/SSH·다른 risuai volume/network 보존. 실제 데이터 삭제 완료가 아니므로 GIT-RESET은 부분 완료다.
- 다음: README/RUNBOOK의 sudo cleanup 실행 뒤 old 자원0·새 healthy를 다시 확인한다. 과거 N14 rollback 명령은 old 삭제 이후 폐기된다. 미래 신규 데이터 초기화는 이번 승인에 포함하지 않는다.


## UI-F 구현·로컬 검증 완료 (2026-10-02 최신)

상태: F01~F11 로컬 구현·검증 완료. 사용자 최종 시각 확인·실기기 재검증·운영 반영은 별도다. 아래 최초 UI-F 계획은 당시 기록이다. 기준은 WEB_UI_SPEC.md UI-F, 수정 범위는 UI_FEEDBACK_HANDOFF.md4절이며 메인이 순차 수행했다.

### 환경·기준선·변경 범위

- Windows/Node24.19.0/기존 pnpm·Next16.2.10·Playwright/Edge headless, 실제 production Web와 loopback HTTP fixture. 운영 서버/실DB/실Provider 호출 없음.
- 기준 HEAD `992662520773a5e74262b2b9b6808e02a1578e4e`와 기존 다수 미커밋 변경을 유지했다. `tmp/ui-feedback/before/`에 git status/stat, Web app/test 원본, 기존 N10/N11 캡처와 결과를 보존했다. API·DB·의존성·lockfile·운영/배포 파일 변경 없음. 작업 전 Web build·N10(22캡처)/N11(63캡처·167 HTTP) 통과.
- 이번 변경 제품 파일: apps/web/app/{chat-dialog.tsx,chat-icons.tsx,chat-model-picker.tsx,chat-workspace.tsx,page.tsx,provider-manager.tsx,styles.css}. 시험: 기존 apps/web/test/n10-browser.mjs·n11-browser.mjs. 문서: WEB_UI_SPEC/TEST_PLAN/IMPLEMENTATION_STATUS/IMPLEMENTATION_PLAN/HANDOFF/UI_FEEDBACK_HANDOFF. 원본 대비 목록은 `tmp/ui-feedback/changed-files.json`이다.
- 첫 sandbox build는 설치된 Next.js 파일 접근 EPERM으로 exit1. 기존 설치에 대한 승인된 권한 실행으로 build 성공했으며 설치/버전 변경은 하지 않았다.

### 실제 명령·결과

실행 위치는 저장소 root. 브라우저 모듈은 기존 `C:/Users/Jae/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs` 존재 확인 후 `MODELNARU_BROWSER_MODULE`로 지정했다.

| 명령 | 실제 결과 |
| --- | --- |
| `pnpm --filter @modelnaru/web test` | exit0,8파일31개 통과 |
| `pnpm --filter @modelnaru/web typecheck` | 최종 변경 후 exit0 |
| `pnpm --filter @modelnaru/web build` | 최종 변경 후 exit0,production build 성공 |
| `pnpm lint` | exit1(pnpm, 내부 ESLint2): 기존 tmp/n13/gateway-pro-discovery.mjs의 @typescript-eslint/await-thenable typed parser 설정 오류. 미통과로 기록 |
| `pnpm exec eslint . --ignore-pattern 'tmp/**' --max-warnings=0` | exit0, 임시 증거/과거 실행 스크립트 제외 실제 소스 검사. 전역 설정·규칙 변경 없음 |
| `node apps/web/test/n10-browser.mjs` | exit0,56캡처·125 HTTP·무료 fixture job 시작3/취소1·SSE 구독6, errors/external/CSP violation0 |
| `node apps/web/test/n11-browser.mjs` | exit0,124캡처·258 HTTP, errors/external/CSP violation0 |
| `git diff --check` | exit0. 기존 LF→CRLF 경고는 검사 실패와 구분 |

최종 캡처/JSON은 `tmp/ui-feedback/n10`·`n11`; 이전 실패 시도는 failure 파일에 남을 수 있으므로 최신 result.json의 passed 판정과 실행 기록을 사용한다. browser runner는 종료 시 자신이 띄운 Edge/Next/fixture를 정리한다.

### F01~F11 증거·검증 내용

모든 경로의 기준은 `tmp/ui-feedback/`. `review.html`은 로컬 비교용이며 운영 화면이 아니다. 수정 전후 합성 데이터·스크롤 상태가 일부 다르므로 픽셀 단위 동일 장면 비교를 주장하지 않는다.

| 항목 | 수정 전 증거 | 수정 후 증거·결과 |
| --- | --- | --- |
| F01 관리자 시작 높이 | before/n11/dark-1440-사용량.png | n11/dark-1440-사용량.png 및 모든 탭·1024px 이상 상단 차이≤1px |
| F02/F03 여백·우측 액션·등록 순서 | before/n11/dark-1440-Provider.png | n11/dark-1440-Provider.png. 모든 탭 헤더 액션 우측 차이≤1px, 일반→커스텀→카탈로그 DOM 순서·독립 등록2종 성공·키 입력 초기화 |
| F04 정렬·이미지 편집 | before/n11/image-budget-1440.png | n11/models-collapsed-1440.png·image-budget-1440.png·image-budget-390.png. 한글/숫자/대소문자/중복 표시명/비활성 모델·ID 동률 정렬, 저장 실패 초안, sync/다른 모델 PATCH 초안 유지, null 저장 시 image off·실제 서버 contextBudget 회귀 |
| F05 로그인 높이 | design/ui-feedback/4.jpg, before/n11의 entry 캡처 | n11/*-user-stable.png·*-admin-stable.png.9개 폭×2테마18쌍, 같은600px 높이에서 카드·로고 상하좌우 차이≤1px. 일반 사용자 TOTP DOM/FormData 없음, 관리자 required 유지·기존 단일 로그인 성공 |
| F06 대화 카드 | before/n10/dark-1440.png | n10/dark-1440.png·stress-long-title-attachments.png. 카드90px, 긴 제목·9자리 수 말줄임, 아이콘44px·aria-pressed·전체 제목/상태 접근성, 이름 변경은 설정에서 성공·삭제 취소 보존·빈 검색 목록 |
| F07/F09 본문·작성창 | before/n10/dark-1440-settings.png·dark-390.png | n10/dark-1440-settings.png·dark-390.png. 가용 폭에서48px/24px만 제외, 기본134px/126px,2행→최대160px 자동 성장, 모델은 보내기 왼쪽·긴 이름 생략·첨부10개·IME Enter 미전송 |
| F08 토스트 | before/n10 캡처·기존 static CSS 원본 | n10/persistent-error-toast.png. 성공5초 후 DOM 해제·수동 닫기, 오류5.1초 뒤 유지·복구 버튼 보존, 알림 전후 본문/작성창 box 동일 |
| F10 설정 폭·하단 | before/n10/dark-1440-settings.png | n10/dark-1440-settings.png·dark-390-settings.png. desktop clamp360~420px/mobile min420px, 같은 폭2×2 버튼, 본문 스크롤·하단 유지 |
| F11 오른쪽 위치·경계 | before/boundary/boundary.json·boundary-*.png | n10/boundary-1023.png·boundary-1024.png. 열린 패널 왕복4회에서 modal 상태·right edge·title 초안·focus·scrollTop100 보존. 원본 왼쪽 이동은 수정 전 로컬에서도 미재현이며 원인 해결을 단정하지 않음 |

시각 범위: dark/light,320·390·768·1023·1024·1280·1440·1920·2560px, 대표390/1440/2560 캡처 직접 검토. 기존 Markdown 코드/표·외부 이미지 차단·SSE/재접속/자동 제목 PATCH·409 초안 보존·첨부 실패/재처리/취소·세션 만료/권한 분리·게스트 진입 회귀를 유지했다. 200%는720×500 CSS reflow 동등 시험, 가상 키보드는390×450 viewport 축소 모사다. modal Tab35회·Escape·호출 버튼 복귀를 확인했다. 낮은600px에서 첨부10개/15행 입력/긴 모델명 picker는 내부 스크롤로 사용 가능하며 채팅 영역 밖으로 잘리지 않는다.

### 검증 중 발견·보완 및 남은 한계

- 새 작성창과 구 CSS의 grid 좌표 충돌을 실제 모델 클릭 실패로 검출해 좌표를 정리했다. 제목/메타 분리에 맞춰 시험의 선택 locator를 변경하되 생성 중/완료 상태 검사는 별도로 유지했다. 모바일에서 접힌 목록을 다시 열고 삭제 취소하는 경로로 시험을 수정했다.
- F6 캡처에서 낮은768px 폭 화면의 picker 상단 잘림과 sidebar 접힘 시 테마 버튼 겹침을 발견했다. UI-F2 범위에서 실제 chat-main 상단을 기준으로 picker 높이를 계산하고 하단46px 공간을 확보한 뒤 최종 build/typecheck/lint·두 runner를 재검증했다.
- 사용자 시각 최종 인수·실제 휴대폰 키보드/음성·Safari/Firefox는 이번 미검증이다. 기존 N13 수동 인수를 새 UI 검증으로 전용하지 않는다. API/실DB/실유료 Provider/운영 배포 시험은 이번 범위 밖이며 추가 호출0회다.
- 설치/운영 명령 변경이 없으므로 README/DEPLOYMENT_RUNBOOK 갱신은 해당하지 않는다. 운영 반영 시 별도 데이터 보존 업데이트 계약이 필요하며 N14 일회성 전환 재실행 금지다.

## UI-F 운영 UI 피드백 검증 계획 (2026-10-02)

상태: 계획 작성, 제품 변경·새 UI 시험 미실행. 사용자 주석6개 이미지의 요구를 F01~F11로 분류했다. 검증 명령·viewport/테마/경계/접근성·완료 기준은 UI_FEEDBACK_HANDOFF.md 5절, 기대 동작은 WEB_UI_SPEC.md UI-F가 원장이다. 기존 N13/N14 인수 증거는 보존하며 새 UI 변경을 검증한 증거로 대체하지 않는다.

구현자는 F01~F11별 수정 전/후 캡처·환경·명령·exit code·기능 회귀 결과를 이 절 후속 기록에 연결한다. 사용자 수동 모바일/음성 인수와 fixture 자동 검증은 구분한다. 이번 문서 작업 검사는 주석 이미지 사본 SHA256 동일성·문서 링크·git diff --check로 한정한다. 실제 결과: 이미지6개 SHA256 원본/사본 일치, 관련8개 문서의 상대 링크와 수정 허용 코드/시험 파일 존재 확인 통과, 추적 문서 git diff --check exit0. 새 인계 문서도 후행 공백/충돌 표식 없음. 기존 LF→CRLF 경고는 오류와 구분했다. 제품 시험은 실행하지 않았다.

## 2026-10-02 N14 실제 운영 전환 완료 (최신)

- 승인/범위: 사용자 N14 승인으로 새 릴리스/빈 v2 DB 전환을 수행했다. 현재 운영 root /home/totquf4171/modelnaru-v2-20261002, project modelnaru-v2, 공개 https://chat.mihoservice.xyz, loopback32432. 이전 /home/totquf4171/modelnaru 및 DB/uploads/config/secrets·컨테이너/image는 중지 상태로 보존했다. 새 유료 Provider 호출은0회다.
- 배포물: 작업 폴더 code-only162개 파일, 기반 HEAD992662520773a5e74262b2b9b6808e02a1578e4e + 미커밋 작업. archive SHA256 0064c7d0092d97cc6c7b435986b8dc5dcd703bc88544cf1217ee41ed70864312가 PC/서버 일치. 공식 Dockerfile로 Node24 Linux config/database/admin/API/Web 전체 build 성공, 새 project 이미지 사용. buildx CPU1.5/RAM3GiB 제한. 운영 source/image 상세는 DEPLOYMENT_RUNBOOK 최신 N14 절과 tmp/n14/n14-state.json 참조.
- 준비: 공식 대화형 init CLI를 PTY로 실행하고 transcript/생성 secret은 출력하지 않았다. 임시 bootstrap 관리자로 사전 HTTP 로그인·CSRF·custom private 목적지 등록·일반 사용자 권한/API를 확인한 뒤 기존 관리자 username/hash/TOTP 항목만 서버 내부 read-only mount에서 새 config로 보존했다. 새 password/DB/Provider master key는 v2 전용이었다. 최종 admin JSON 동등성 true·old config checksum 불변·config version2/mode0600/port32432를 확인했다. 기존 관리자 비밀번호를 에이전트가 입력해 실제 로그인한 것은 아니며 임시 관리자 로그인 경로와 credential 동등성 검증으로 구분한다.
- migration/격리: 별도 modelnaru-v2 PostgreSQL의 빈 DB에0001~0020 적용, 재실행 checksum 통과. staging loopback32433에서 API/Web/Gateway/DB healthy, 실제 HTTP 로그인→job 생성→SSE snapshot 수신 후 연결 종료→계속 생성→최종 GET 본문 N14 OK→종료 snapshot의 revision/contentBytes 일치→취소204/cancelled를 확인했다. 무료 mock의 정확한 사설IP9090만 승인했고 기존 운영 생성 중 메시지0을 확인한 뒤 전환했다.
- 시행 중 smoke 스크립트 오류: Python http 함수의 module 이름 충돌, mock JS 문자열 줄바꿈, 이미 종료된 job의 SSE terminal event/취소 status 기대값을 기존 계약(terminal 상태 snapshot/204)에 맞게 수정했다. 제품 코드는 변경하지 않았다. 실패한 무료 시도도 합산해 mock chat7개(completed4/cancelled3)였다. 정상 staging과 전환 후 HTTPS smoke가 최종 통과했다.
- 전환/복구: 첫 전환은 새 서비스 healthy 후 서버→공인 WAN IP HTTPS timeout으로 자동 복구했다. 기존 DB/Valkey 먼저 시작 후 API/Web/Gateway를 복구해5개 healthy를 확인했다. PC 공인 HTTPS200 및 서버 curl --resolve 동일 도메인/SNI/CA 검증200으로 자체 WAN 재접속 경로 차이를 확인했다. 이후 인증서를 검증한 host Nginx loopback TLS로 로그인·생성 지속·GET/SSE snapshot·취소를 통과했고 두 번째 전환 성공. host Nginx/cert 파일은 수정하지 않았다. 자체 loopback TLS 검증을 외부 접속 시험으로 혼동하지 않는다.
- 외부 재검증: PC 실제 DNS/공인 HTTPS에서 Web200·API ready200/config/database ok, 현재 소스 logo SVG 일치. 실제 Edge 관리자 진입 화면1440×1000/390×844 캡처2개, 관리자 입력 폼 표시·가로 넘침false·page errors0. Edge 종료 완료. 공개 생성 자체는 서버의 CA/SNI 검증된 동일 Nginx 경로에서 수행했으며 PC 외부 경로는 Web/ready/자산·진입 브라우저를 확인했다. N13의 외부 브라우저 생성·실모델 인수는 재사용했다.
- 운영 CLI: 새 root의 bin/apichat-admin validate 및 bin/modelnaru status/health 성공, API/Web/Gateway/PostgreSQL4개 healthy·migration exit0. Compose override name:modelnaru-v2를 명시해 --env-file .runtime.env만 쓰는 운영 CLI도 기존 modelnaru project와 충돌하지 않는 것을 config/status로 확인했다. restart unless-stopped·자원 제한·log rotation은 실제 inspect/Compose 기준이다.
- 최종 정리/상태: n14 무료 mock 컨테이너·파일, bootstrap password 파일, buildx builder 제거. 새 DB users/providers/conversations/attachments 각0·migration20, 감사/usage의 합성 smoke 기록은 유지한다. 기존 운영5개는 중지 상태로 보존, 새 DB/업로드/키는 독립. 생성 중 작업 없음. 기존 ID/비밀번호/TOTP로 관리자 로그인 후 일반 사용자/Provider를 새로 등록하는 빈 설치다.
- 안전 증거: tmp/n14/n14-state.json, n14-final-audit.json, external-https-result.json, public-browser-result.json, public-login-desktop.png/public-login-mobile.png, source-files.json. 운영 비밀번호/TOTP/키/DB URL·사용자 본문은 증거에 저장하지 않았다. 제품 코드/의존성/schema 변경 없음. 새 scripts/deploy-n14.py Python 구문 확인, 문서 diff 검사. 기존 N13 전체 회귀를 중복 실행하지 않았다.
- 완료 판정: N14 완료. 실제 운영 서비스 v2 전환·관리자 보존·새 schema·health·HTTPS·로그인/생성/복구/취소·실제 rollback 증거 확보. 새로운 실유료 Provider 등록/호출은 수행하지 않았고 기존 N13 실모델 지원 범위를 유지한다. host reboot·장기24시간 부하·외부 backup·이전 사용자 데이터 이전은 지원/검증 범위 밖이다.


## 2026-10-02 N13 최종 종료·시험 환경 정리 확인 (최신)

사용자가 02:07 KST에 sudo 정리 스크립트를 실행했고 nginx -t 성공·시험 인증서 삭제·소유 Docker 자원 제거·정상 종료 로그를 제공했다. 메인은 SSH 읽기 전용 조회로 시험 containers0/networks0/images0, /tmp/modelnaru-n13-server-naRXQ0·전용 Nginx enabled/available site·시험 인증서 live/renewal·ACME 폴더 제거를 재확인했다. 운영 API/Web/Gateway/Valkey/PostgreSQL5개는 모두 healthy/Up20h이며 이번 정리에서 변경하지 않았다. 기존 trade site의 protocol options 경고는 nginx -t 성공을 막지 않았고 별도 운영 site 수정은 하지 않았다.

N13 필수 기능 인수와 시험 환경 정리까지 완료. 안전 증거 tmp/n13/server-cleanup-result.json 및 기존 image-retest-result.json/image-retest-safe-audit.json·사용자 모바일 캡처를 보존한다. 새 실제 Provider 호출/운영 전환 없음. 아래 정리 대기/유지 기록은 당시 snapshot이며 현재 시험 URL·계정·root는 종료됐다. 삭제된 시험 스크립트/URL을 재실행·재접속 대상으로 안내하지 않는다.

N14 착수 가능. 다음 작업에서 현재 운영 대상·새 release 식별·별도 데이터 초기화/기존 보존·rollback 절차를 재확인한 뒤 전환한다. N14 자체는 아직 미실행이다.


## 2026-10-02 N13 필수 인수 통과·N14 판정 (최신)

상태: N13 필수 기능 인수 통과, 전용 시험 환경 정리는 사용자 sudo 실행 대기. N14 전환 준비 착수 가능이며 실제 운영 전환은 이번 작업에서 실행하지 않았다. 아래 이전 미승인/실패/미검증 기록은 당시 snapshot을 보존한다.

- 사용자 승인: gemini-pro-latest/출력1024/입력 추정1536/새 예산 $0.02/추가1회. 기존 apps/web/test/n13-server-acceptance.mjs에 IMAGE_ONLY 분기만 추가하고 이전 결과와 분리했다. 모델 가격 GET 재확인 결과 예상 $0.01536, vision/streaming 지원 유지. 새 전용 사용자 n13imageonce의 quota1, 전역 제목 null, 고정256×256 PNG1개, 짧은 영문 지시문만 사용했다. PDF/history/색·도형 정답 힌트는 넣지 않았다.
- 실행: 작업 PC에서 MODELNARU_BROWSER_MODULE=기존 Playwright 경로, MODELNARU_N13_SERVER_IMAGE_ONLY=1, TITLE_ONLY/OCR_ONLY=0으로 node apps/web/test/n13-server-acceptance.mjs를 실행했다. 실제 공인 HTTPS Edge 로그인/이미지 file input 업로드→ready→HTTP job202→SSE terminal200→최종 GET completed. 답변에서 색(red/blue)·도형(square/circle)·위치(top/upper-left, bottom/lower-right) 검사 모두 true. 본문은 메모리에서만 비교하고 결과에는 참/거짓·contentBytes73만 저장했다. browser errors0, exit0.
- 원장 대조: 새 사용자 usage chat completed 정확히1개, title/summary0개, known input1159/output631, duration7185ms. 격리 DB의 Gemini 전체 호출은 이전2개+이번1개=3개다. 같은 승인 재실행을 막는 결과 파일 guard를 POST 이전에 기록했으며 자동 재시도 없음. 실제 수신 usage 기준 이번 비용 추정 $0.00989, 이전2회와 합산 $0.016232이며 청구서 실비 확정은 아니다.
- 안전 진단: HTTP200/text/event-stream, headers518ms·first byte3860ms·last byte7152ms, event8/frame8/chunk12, receivedBytes12487, outcome/stage completed·내부 원인/error null. 키·프롬프트·생성 본문·원본 SSE를 증거에 저장하지 않았다. 최초 max256 length 실패는 그대로 보존했다.
- 정리 확인: 대화 DELETE204, storedFileCount/queuedFileCount/storedBytes0, 별도 DB attachments count0. 시험 모델 disabled=true, 전역 제목 null 유지. Edge 종료·승인 PC 시험 password/TOTP 복사본 삭제 확인. 안전 증거 tmp/n13/image-retest-result.json 및 image-retest-safe-audit.json. 이번 추가1회 승인은 소진됐으므로 더 호출하지 않는다.
- 모바일: 아래 사용자 수동 인수 절의 전 항목 문제없음 보고·캡처5개를 재사용한다. Android Chrome 추정의 실제 사용자 확인이며 음성/재접속/첨부를 캡처만으로 자동 검증한 것으로 확대하지 않는다. 다른 OS·정확한 기기/버전/24시간 부하/host reboot/다른 Provider 실제 인증 생성은 기존 미보장 지원 범위를 유지한다. 이들 범위를 새로 검증했다고 주장하지 않는다.
- 최종 검사: 해당 mjs node --check·ESLint·Prettier 통과, cleanup-n13-server.sh bash -n 및 원격 state 이름/port/site 대조 통과. 제품 코드/schema/의존성/키 파일/운영 서비스 변경 없음. 문서 변경은 git diff --check로 확인한다. 이미 통과한 기존 회귀/설치/재시작/5분 부하를 반복하지 않았다.
- 시험 환경 정리 대기: 서버 컨테이너5개/network2개/image2개, /tmp/modelnaru-n13-server-naRXQ0 및 전용 Nginx site/cert가 아직 유지된다. 운영5개 healthy/Up20h. scripts/cleanup-n13-server.sh를 서버 root에 전송해 검토 가능한 정리 명령을 준비했으며 사용자 sudo 실행을 요청했다. sudo 요구 때문에 실제 host/site/cert/DB 삭제는 아직 하지 않았다. 기능 인수 통과와 정리 실행 완료를 구분한다.
- N14 판정: 기능 인수 선행 조건 충족. N14 준비 착수 가능. 실제 전환 전 시험 환경 정리 결과 및 운영 release·초기화 대상/기존 데이터 보존·복구 경로를 재확인한다. 사용자의 이번 범위는 N13 마무리이므로 운영 전환을 실행하지 않았다.


## 2026-10-02 N13 잔여 두 항목·N14 판정 (최신)

상태: 재시험 조건 산정/사용자 체크리스트 준비 완료, 실제 이미지 재시험 미승인·미실행, 모바일·스크린리더 네 항목은 사용자 수동 인수 통과. N14 요청은 중단되었으며 읽기 전용 운영 경로/포트/image/자원 조회만 수행했고 운영 서비스·DB·설정은 변경하지 않았다. N13 완료로 바꾸지 않는다.

### 이미지 추가 1회 제안

- 기준: 기존 max256 요청은 length/OUTPUT_TOKEN_LIMIT로 실패했다. 실패 결과를 보존하며 이번에는 같은 고정 PNG만 보내 OCR PDF·history·자동 제목을 제외한다. 모델은 기존 vision/streaming 모델 gemini-pro-latest, HTTPS endpoint https://api.llmgateway.io/v1이다.
- 2026-10-02 01:46 KST에 인증된 모델 목록 GET만 실행해 현재 가격과 vision/streaming을 다시 확인했다. 입력 $2/백만 토큰·출력 $12/백만 토큰·image/request 추가요금0이다. 생성 호출은0회다. 안전 증거 tmp/n13/image-retest-proposal.json은 키·프롬프트·생성 본문을 포함하지 않는다.
- 제안 출력 상한1024토큰, 입력 추정1536토큰(이미지 예약1024와 짧은 지시문 여유). 예상 $0.003072+$0.012288=$0.01536, 새 승인 요청 예산 $0.02·생성 정확히1회·자동 재시도0회. 입력/이미지 예약은 실측 과금 token의 강제 상한이 아니므로 금액은 추정이다. 이전2회 승인은 소진됐으며 이 제안은 새 호출 승인이 아니다.
- 승인 전 모델 활성화/설정 변경/생성 금지. 승인 후 실행 직전에 가격·모델 능력·짧은 입력·예산을 재확인하고 추정이 승인 예산을 넘거나 모델/가격이 불명확하면 호출하지 않는다. 자동 제목 null 유지, 호출 직후 시험 모델 비활성화와 첨부 삭제, usage·실패 원인·HTTP/Content-Type/수신 시간/event 수만 기록한다. Provider 키·본문·원본 SSE를 저장하지 않는다.
- 성공: 색/도형을 알려주지 않는 지시문에 대한 실제 이미지 답변이 고정 PNG의 색·도형·위치를 식별하고 job completed/SSE terminal/usage 저장이 일치한다. 실패/추론 budget 소진 시 실패 증거만 기록하고 추가 호출 없이 중단한다. 제목64/15초 정책 변경 없음.

### 2026-10-02 모바일·스크린리더 사용자 인수 완료

사용자가 TalkBack/VoiceOver 설명과 네 항목 체크리스트를 받은 뒤 “전부문제없어”라고 보고하고 화면 캡처5개를 제공했다. 따라서 모바일 네 항목은 사용자 수동 인수 통과로 기록한다. 자동 시험이나 캡처만으로 음성 출력/새로고침/첨부 동작을 독립 검증한 것으로 주장하지 않는다.

| 항목 | 결과·근거 |
| --- | --- |
| 한국어 조합·키보드 위 작성창/전송 버튼 | 사용자 통과 보고, 캡처2·3·5에서 한국어 입력과 열린 키보드 위 작성창/전송 버튼 직접 확인 |
| 첨부 처리·전송 | 사용자 통과 보고. 캡처는 첨부 버튼만 보여 실제 파일 처리 증거와 구분 |
| 생성 중 새로고침·정상 완료·누락/중복 없음 | 사용자 통과 보고, 캡처4 생성 중/중지 버튼·5 완료 상태 표시 확인. 재접속 자체는 사용자 보고 근거 |
| 스크린리더 버튼 이름·생성/완료 안내 | 설명 후 사용자 전 항목 문제없음 보고. 캡처1·2·3·5의 focus 표시 확인, 실제 음성 출력은 사용자 수동 확인 근거 |

환경은 화면 UI에서 Android Chrome으로 추정되며 정확한 기기/OS·브라우저 버전은 미제공이다. 다른 OS/브라우저·VoiceOver 양쪽 모두의 검증으로 확대하지 않는다. PC Tab 별도 추가 실행은 주장하지 않으며 기존 키보드 회귀 증거를 유지한다.

원본 증거 위치: .codex-remote-attachments/01a0ee16-6b29-7973-bd9d-3c8ad20ed737/af356063-bd0f-4b0d-8342-7bba2dda52cc/ 아래 1-1000139427.jpg, 2-1000139432.jpg, 3-1000139434.jpg, 4-1000139436.jpg, 5-1000139438.jpg. 사용자 제공 원본은 수정/외부 전송하지 않았다. 이전 “모바일 전반 정상” 및 결과 대기 기록은 당시 snapshot이며 이 확인이 대체한다. 이미지 추가 유료 호출 승인은 이 메시지에 포함되지 않았다.

### 모바일·스크린리더 짧은 체크리스트 (완료 기준 보존)

대상 https://test-chat.mihoservice.xyz, 시험 사용자 n13acceptance, 무료 n13-mobile-fixture. 시험 비밀번호는 서버 private/mobile-credentials.json을 본인만 확인한다. “모바일 잘되는거같아”는 전반 정상 의견으로 보존하며 항목별 합격으로 확대하지 않는다. 기기·브라우저와 다음 네 항목에 통과/문제/미실행을 답한다.

1. 한국어 조합 입력 중 Enter 오발송 없음, 화면 키보드가 열려도 작성창·전송 버튼 표시.
2. 첨부가 처리 완료되고 전송 가능.
3. 무료 모델 생성 중 새로고침 후 약30초 뒤 답변 완료, 누락·중복 없음.
4. TalkBack/VoiceOver에서 전송·첨부·중지 버튼 이름 및 생성/완료 상태 안내. 가능하면 PC Tab 이동/버튼 실행도 확인.

### N14 착수 판정

현재 운영 전환 착수 불가. 모바일 필수 항목/스크린리더는 사용자 수동 인수 통과했지만 이미지 성공 인수가 아직 없다. 준비 문서·읽기 전용 조회는 가능하지만 실제 전환은 하지 않는다. 두 인수가 통과하면 N13 완료 판정 후 실제 release/데이터 초기화·보존 경로/복구 범위를 재확인해 N14를 진행한다. 항목을 제외하려면 명시적 출시 범위 조정과 잔여 위험 기록이 필요하며 이번 요청은 제외 승인이 아니다.

문서 검증만 수행했다. 제품/설정/계정/DB/운영 서비스 변경·추가 생성 호출 없음. 기존 인수는 재사용하며 런타임 전체 회귀를 중복 실행하지 않는다.


## 2026-10-02 N13 공인 HTTPS 서버 인수 (최신, 부분 완료)

- 적용: 현재 작업 폴더의 API/Web을 Linux에서 다시 빌드한 격리 환경. 운영 DB·계정·저장소와 분리했으며 운영 컨테이너 5개는 healthy/Up19h였다. 제품 코드·DB schema·의존성·lockfile·공인 HTTP 목적지 정책은 변경하지 않았다. 신규 시험 파일은 scripts/prepare-n13-server.py, scripts/enable-n13-test-https.sh, scripts/n13-mobile-provider.cjs, apps/web/test/n13-server-acceptance.mjs이며 ESLint에 정확한 시험 파일을 등록했다.
- 환경: mihoservice_server /tmp/modelnaru-n13-server-naRXQ0, 전용 PostgreSQL17/modelnaru_test 및 API/Web/gateway/mobile 컨테이너, 전용 frontend/backend network·저장소·생성 계정. gateway는 127.0.0.1:32776에만 바인딩했다. API CPU0.75/RAM768MiB, Web0.5/512MiB, DB0.5/256MiB, gateway0.25/128MiB, 무료 mock0.1/128MiB. 현재 lock SHA256 312c286dfe43f49b83ac74f86985306652c810d36df898cafe0b75b366326fbe가 기존 Linux dependency 이미지와 일치함을 확인하고 code-only 소스만 전송·재빌드했다. build는 network none이었다.
- HTTPS 완료: 사용자가 sudo로 새 시험 Nginx site와 Certbot 인증서를 설치했다. https://test-chat.mihoservice.xyz 는 PC·휴대폰의 동일 반응형 Web이다. 유효한 공인 인증서(2026-12-30 만료), nginx -t/reload, Node 기본 CA 및 Edge 기본 인증서 검증, 실제 관리자 비밀번호/TOTP 로그인·Secure HttpOnly cookie를 통과했다. 모델 HTTPS는 별개로 https://api.llmgateway.io/v1을 사용했다. 기존 운영 site 파일은 수정하지 않았다. 공유 host Nginx는 사용자가 새 site 추가 후 graceful reload했다.
- 유료 호출: 사용자가 승인한 gemini-pro-latest 이미지1회·제목1회만 실행했다. 사전 모델 조회의 가격/streaming/vision 확인과 입력2560·출력320 합산 예상 $0.00896≤$0.01 후 호출했다. DB usage 원장 chat/title 각1개, 총2개. 수신 usage 기준 비용 추정 $0.006342이며 청구서 실비 확정은 아니다. 키·프롬프트·생성 본문·원본 SSE를 증거에 저장하지 않았다.
- 실제 이미지: 브라우저 PNG/PDF 업로드와 이미지 budget1024 전달 뒤 max256 생성은 failed/CHAT_OUTPUT_LIMIT였다. HTTP200/text/event-stream, duration4775ms, known usage1221/252, finish_reason=length, 내부 원인 OUTPUT_TOKEN_LIMIT·처리 단계 termination. 실패 이벤트도 안전 진단에 포함됐다. 이미지 색/도형 반영은 확인하지 못했으며 성공 인수로 처리하지 않는다. 승인된 두 호출을 소진해 추가 유료 재시도는 하지 않았다.
- 실제 제목 완료: 무료 mock의 정상 main 이후 지정 Gemini 제목1회가 고정64토큰/15초 계약에서 completed·auto, 13글자, 2629ms, known usage84/59였다. 보조 호출 DB 원장도 1개였다. 이후 전역 제목 Provider를 null로, 유료 모델을 disabled로 바꿔 휴대폰 시험에서 추가 유료 호출을 막았다. 제목 예산 계약 변경 없음.
- 전체 스캔 PDF 완료: 공인 HTTPS Edge 실제 file input → 한국어 raster PDF upload → 서버 Poppler/Tesseract kor+eng → ready/page1/OCR1 → 추출문 저장 → 첨부 ID를 포함한 HTTP job → 무료 OpenAI 호환 Provider가 실제 messages의 고정 OCR 문구를 확인 → HTTP200 SSE terminal/completed → 대화 삭제·파일 정리. API storedFileCount/queuedFileCount/storedBytes 모두0, 별도 시험 DB SELECT count(*) FROM attachments도0이었다. OCR 엔진·실제 HTTP/UI/DB는 실제 경로이며 마지막 답변은 무료 mock이다. 앞선 유료 답변 실패를 OCR/이미지 의미 인수의 성공으로 바꾸지 않는다.
- 시험 fixture 보완: 처음 GET 대화 응답을 중첩 객체로 오인한 접근, 재사용 브라우저의 이전 대화 선택, OCR 단어 사이 공백을 고려하지 않은 문자열 검사를 수정했다. 마지막 검사는 기존 OCR engine 시험과 동일한 공백 정규화이며 UTF-8 stream decoding도 보존했다. 제품 결함은 발견하지 않았다. 초기 OCR 검증 실패는 보존하며 최종 OCR_ONLY exit0, title-only exit0, 최초 통합 호출은 실패했다. allChecksPassed=false를 유지한다.
- 재현: 작업 PC에서 MODELNARU_BROWSER_MODULE을 설치된 Playwright index.mjs 경로로 지정하고 MODELNARU_N13_SERVER_OCR_ONLY=1, MODELNARU_N13_SERVER_TITLE_ONLY=0으로 node apps/web/test/n13-server-acceptance.mjs를 실행했다. OCR 모드는 제목 null을 먼저 확인하며 생성은 무료 mock만 사용한다. 기본 모드/title-only의 유료 호출을 새 승인 없이 반복하지 않는다. 안전 증거 tmp/n13/server-acceptance-result.json, server-safe-audit.json, gateway-pro-discovery.json. 최종 DB 첨부 count0을 다시 조회해 audit의 uploadFileCount와 관측 시각을 갱신했다. acceptance result의 ocrFileCleanup도 파일0을 확인한다.
- 최종 검사: 신규 Node harness/fixture node --check, 정확한 파일만의 ESLint·Prettier, 저장소 git diff --check exit0. 서버 준비 Python 구문과 HTTPS shell bash -n 및 현재 Linux API/Web 실제 build는 통과했다. lint 첫 실행의 CommonJS require 금지는 단독 cjs fixture 한 줄에 사유를 기재해 해소했으며 제품 규칙을 완화하지 않았다. 기존 전체 API/Web 회귀를 이 변경에서 다시 실행한 것으로 주장하지 않는다.
- 정리/보존: 자동 Edge 프로세스와 사용자가 승인한 PC 시험 비밀번호/TOTP 복사본은 finally에서 삭제했다. source archive의 서버 복사본·중간 build container/image를 정리했다. SSH 터널은 없다. 휴대폰 인수를 위해 전용 5개 컨테이너·2개 network·2개 image·시험 폴더·전용 Nginx site/인증서는 의도적으로 유지한다. 종료 후 정리는 DEPLOYMENT_RUNBOOK.md 최신 N13 절을 따른다. 운영 자원 삭제 금지.
- 남은 필수: 실제 이미지 내용 반영, 실제 휴대폰 IME/키보드/첨부/생성 중 새로고침·재접속, TalkBack/VoiceOver·키보드 탐색. 사용자가 모바일 전반 정상 의견을 보고했으며 개별 체크리스트·기기/브라우저 확인 범위는 대기다. 다른 실제 Provider는 fixture 지원 수준, Linux24시간 부하·host reboot는 미검증 범위다. N13 부분 완료, N14 대기.

### 2026-10-02 사용자 모바일 확인

사용자가 “모바일 잘되는거같아”라고 보고했다. 모바일 전반 사용에 특이 문제를 보고하지 않은 사용자 확인으로 기록한다. 기기/브라우저와 IME·화면 키보드·첨부·생성 중 새로고침/재접속·스크린리더의 개별 실행 여부는 아직 확인되지 않았다. 항목별 모두 통과나 N13 완료로 확대하지 않는다. 확인 범위를 추가 요청했고 시험 환경은 유지한다. 제품 변경·추가 모델 호출 없음.

### 사용자 실기기 확인 기준

https://test-chat.mihoservice.xyz 에 시험 사용자 n13acceptance로 로그인한다. 비밀번호는 서버 private/mobile-credentials.json을 본인 터미널에서 확인하고 채팅에 전송하지 않는다. 모델 n13-mobile-fixture만 사용한다(무료·약30초 응답). 기기/OS/브라우저와 각 항목의 통과/문제/미실행을 기록한다.

1. 한국어 조합 중 Enter가 오발송하지 않는가.
2. 화면 키보드가 열려도 작성창·전송 버튼이 보이고 가로 넘침이 없는가.
3. 첨부 처리 상태 확인·전송이 가능한가.
4. 생성 중 새로고침 후 계속 생성하며 약30초 뒤 답변이 누락·중복 없이 완료되는가.
5. TalkBack/VoiceOver가 버튼 이름과 생성 상태를 안내하는가. PC Tab 탐색도 결과를 기록한다.


## 2026-10-02 N13 잔여 시험 (실행 종료·일부 통과/자동 제목 실패)

- 변경 범위: 기존 apps/web/test/n13-integration.mjs의 LOCAL_REMAINING 모드와 apps/api/test/n13-ocr.mjs 한국어 합성 raster fixture. 제품 코드·schema·의존성·운영 설정·키 파일은 변경하지 않았다. Gateway 모드를 끄고 상용 호출 없이 승인된 keyless gemma4-12b만 사용했다.
- 환경/명령: fresh PostgreSQL17 전용 컨테이너 modelnaru-n13-remaining-postgres-test, 전용 network modelnaru-n13-remaining-test, 서버 loopback32775↔PC SSH tunnel45439. 기존 build의 별도 API/Web/mock와 Edge·검증된 자체 인증서 HTTPS. MODELNARU_TEST_DATABASE_URL은 실행 환경에만 제공했다. 기존 Playwright/OpenSSL 경로, MODELNARU_N13_GATEWAY_TEST=0, LOCAL_BASE=http://192.168.0.12:8080/v1, LOCAL_MODEL=gemma4-12b, LOCAL_REMAINING=1, SOAK_SECONDS=0을 지정해 node apps/web/test/n13-integration.mjs를 실행했다(변수는 모두 MODELNARU_N13_ 접두사, DB/browser/OpenSSL은 기존 harness 명칭).
- 최종 실행: 8개 PASS, 자동 제목 정상 완료 assertion 실패로 종료 코드1. 기존 TLS/로그인·실제 UI 새로고침·일반 설정 제목 보존·취소·반응형 5개와 첨부 2개·실제 요약1개가 통과했다. 마지막 실패 때문에 requests 전체 배열은 해당 실행에 저장되지 않았으므로 HTTP 총 건수는 주장하지 않는다. 이후 finally에서 실패 시에도 execution-result.json을 기록하도록 보완했고 구문/lint로 확인했다. 이 기록 보완만을 위해 실제 모델을 추가 호출하지 않았다.
- 첨부 실제 HTTP: 텍스트 upload201→metadata200/ready→pending→PATCH200→job202/완료. mock Provider가 추출문 marker를 실제 요청에서 확인했고 DB message_id 연결·pending0을 검증했다. 텍스트 PDF는 page1/OCR0, PNG16×16 ready. 손상 PDF upload422/FILE_PDF_INVALID, failed 원본의 retry도 같은422/code 보존, 다른 conversation 경로의 파일 조회404, pending 파일3개 DELETE204 및 pending0. 실제 이미지 모델 입력이나 스캔 PDF의 전체 API→OCR 경로는 이 시험으로 대체하지 않는다.
- 실제 요약: main은 mock, 요약 helper만 실제 LAN 소켓으로 호출했다. 오래된 history를 DB fixture로 넣고 실제 HTTP job이 요약을 자동 실행했다. max512, completed·usage1383/195(known), context_summaries1개·covered_message_count1·41글자, 이후 main completed. 예산 추정은 보수적 입력 제한이며 Provider 실측 token과 저장 값의 일치를 확인했다. 앞선 max128 호출은 finish_reason=length에 따른 OUTPUT_TOKEN_LIMIT/CHAT_OUTPUT_LIMIT로 실패했고 summary 미저장·failed/unknown usage를 보존했다.
- 실제 자동 제목: 고정 max64/15초 계약을 유지했다. HTTP200/text/event-stream, 3.565초/63이벤트 후 length→OUTPUT_TOKEN_LIMIT/CHAT_OUTPUT_LIMIT. task/usage failed, usage unknown(usage 이벤트 수신 전 종료), title_source=default 보존, 본 chat completed. 별도 실제 DB 확인에서 title task/usage 각각1개·해당 main quota1개를 검증했다. 성공한 자동 제목 인수로 표시하지 않는다. 현재 모델의 고정 제목 예산 호환성이 남았으며 정책/예산을 임의 완화하지 않았다.
- 시행 중 fixture 문제: 첫 실행의 summary input budget에서 newest turn조차 들어가지 못한 설정과 usage_events의 존재하지 않는 created_at 조회를 수정했다. 제품 결함이 아니며 첫 실행의 첨부/정상 생성 증거는 attempt-1에 보존했다. 두 번째 기본 생성은 max64 length 실패였고 usage unknown·quota charged·GET/SSE 정확 복원/terminal이었다(attempt-2). 이미 통과한 기본 생성은 이후 잔여 모드에서 반복하지 않는다. 실제 keyless 호출 총5회(일반 생성2·요약2·제목1), 제품의 자동 재시도 없음.
- 한국어 OCR: Windows Malgun Gothic으로 개인정보 없는 고정 raster를 기존 승인 파일에 포함했다. 서버의 기존 API runtime 이미지 sha256:c688a03b51ec2784ccf3defdbbdd714f52d5cb92cd010eaa205a6db35edc45d3에서 승인된 파일3개만 read-only mount, network none/read-only/CPU0.5/RAM512MiB/tmpfs128MiB. 실제 Poppler/Tesseract kor+eng으로 영문과 한국어 2문장·숫자12345 assertion, page limit/손상 PDF/성공·실패 임시 정리 통과·exit0. 최초 /fixture mount의 pdfjs 의존성 탐색 오류는 이미지 원래 /workspace/apps/api 경로에 파일3개를 mount해 해결했다. 임의 사용자 PDF의 OCR 품질 보장은 아니다.
- SHA256 로컬/원격 일치: n13-ocr.mjs 55e234c54b605f5178af7ac3ec90fd77b62764fc50335548af803a46f46b23a1; 나머지 두 module hash는 이전 OCR 기록과 동일. 안전 증거: tmp/n13/local-remaining/remaining-result.json, title-failure-isolation.json, provider-response-diagnostics.json, attempt-1~3; tmp/n13/korean-ocr-result.json. 프롬프트·실제 생성/요약/제목 본문·키·원본 SSE는 증거에 저장하지 않는다. chars/byte/token과 고정 내부 원인만 저장한다.
- 최종 로컬 검사: 제목·요약·응답 진단 기존 회귀 3개 파일/29개 통과, 두 harness 구문·lint·Prettier 확인. 기본 저장소 줄바꿈 설정의 git diff --check exit0. 실행 로그는 tmp/n13/remaining-regression.log. 제품 코드의 추가 변경/전체 build 재실행은 없었다.
- 최종 정리: API/Web/Edge/mock/proxy/private config/cert 종료, DB/network 제거, SSH tunnel 종료, OCR 컨테이너·승인 임시 폴더 삭제. 소유 Node/private 폴더/터널 listener0, 원격 소유 시험 컨테이너0. 운영 컨테이너5개 healthy/Up18h·미변경. 구문/lint 및 git diff --check 통과(기존 CRLF 경고와 구분).
- 남은 차단/범위: (1) gemma4-12b 자동 제목은 고정64에서 실패하므로 호환하는 제목 모델의 성공 인수 필요. (2) 서버 앱은 공인 HTTP:8080을 등록할 수 없어 같은 모델의 지원 HTTPS endpoint 또는 명시 정책 결정 필요. (3) 별도 공인 Web HTTPS와 실제 모바일/IME/스크린리더 환경·결과 없음. (4) PC에 Tesseract가 없어 전체 스캔 PDF의 실제 HTTP→OCR는 Linux 격리 API 환경이 필요하며 현재 승인된3개만의 engine 검증과 분리한다. (5) 실제 이미지 모델 입력 및 나머지 상용 Provider는 대상/자격증명/호출 한도 미확보. 기존 fixture 지원 등급을 넘겨 주장하지 않는다. 24시간 Linux 부하는 미보장 범위이며 기존5분·N12 설치/재시작 증거를 재사용한다. N13 부분 완료·N14 대기 유지.


## N13 복구 모델의 앱 경로 후속 (완료)

- 사용자 "일단 테스트 계속해"로 기존 LOCAL harness를 이어서 검증했다. 현재 컴파일 API·production Web·실제 Edge·테스트 인증서 HTTPS proxy·새 격리 PostgreSQL 17을 사용했다. 실제 custom 모델은 작업 PC에서 승인된 사설 literal http://192.168.0.12:8080/v1의 gemma4-12b이며 상용 Gateway 모드는 껐다. 테스트 키 파일을 읽지 않고 운영 설정/DB/서비스를 사용하지 않았다.
- 결과: 전체 통합 6개 검사 통과(exit 0), 브라우저 HTTP 응답 63건·오류 0개. 실제 관리자 custom 등록·수동 모델 활성화·사용자 권한 부여 뒤 생성 POST 1회/max64를 실행했다. job completed·본문 2 byte·usage72/39·usage_known=true·quota charged였다. chat usage event와 quota reservation이 각각 1개이며 GET/DB 저장값이 일치했다.
- SSE: 생성 pending snapshot을 받자마자 첫 연결을 끊었다. 취소 API는 호출하지 않았다. 재연결 GET snapshot은 streaming이었고 후속 HTTPS SSE terminal을 수신했다. GET revision 이하 event는 제외하고 이후 revision이 연속인지 확인한 뒤 snapshot+SSE 본문/revision을 최종 GET과 비교해 누락/중복 없이 일치했다. 이는 복구된 실제 모델의 생성 지속/재접속 결과이며 기본 mock UI 새로고침 회귀도 함께 통과했다.
- 안전 진단: HTTP 200/text/event-stream, header15,542ms·첫 byte16,204ms·전체17,463ms, 수신9,728 byte·37 chunk·38 data event, outcome/stage completed·원인/공개 오류 null. 원본 prompt·생성 본문·raw event는 새 결과에 저장하지 않고 contentBytes만 기록했다. 실행 절대 시각과 상세 메타데이터는 증거 JSON을 따른다.
- 증거 tmp/n13/local-restored/local-result.json, result.json, provider-response-diagnostics.json 및 화면 캡처. LOCAL 모드 결과를 별도 폴더로 분리해 이전 Gateway/부하 증거를 보존했다. 이미 통과한 대용량/5분 부하는 중복 실행하지 않았다. harness eslint/node --check와 git diff --check 통과. 이번 수정은 시험 harness뿐이며 제품 코드/API/DB schema/의존성은 변경하지 않았다.
- API/Web/browser/mock/proxy/private fixture와 전용 PostgreSQL modelnaru-n13-localapi-postgres-test·network modelnaru-n13-localapi-test·loopback tunnel45437을 정리했다. 전용 원격 container/network 없음, 로컬 private 폴더·터널 listener·N13 Node process 각0개, 운영 container 5개 healthy를 최종 확인했다.
- 범위: 작업 PC의 승인 사설 모델에 대한 실제 앱/DB/SSE 인수는 통과했다. 서버의 공인 HTTP :8080 직접 생성 증거는 이전 절과 별도다. 서버 앱에서 공인 HTTP 등록을 허용한 것은 아니므로 지원 HTTPS endpoint/목적지 정책 선택과 공인 Web HTTPS·실기기 인수는 여전히 남는다. N13 부분 완료·N14 대기를 유지한다.

## 2026-10-01 N13 로컬 모델 복구 재확인 (직접 연결 통과·앱 등록 경로 대기)

- 사용자 복구/사용 승인 뒤 PC·mihoservice_server의 제공 도메인 models GET이 정상 응답했다. 모델 5개를 확인했다. 사용자는 192.168.0.12:8080이 서버망이 아니라 작업 PC 쪽 망임을 명시했다. 서버에서 그 주소로 timeout인 것을 복구 실패로 판정하지 않는다. 서버→작업망 라우팅 변경은 수행하지 않는다.
- 새로 제공한 http://210.223.161.68:808/v1/models는 서버 5.002초·PC 5.008초 connect timeout(HTTP 000)이었다. 도메인과 같은 공인 IP의 :8080/v1/models는 서버·PC 모두 HTTP 200(약 37/44ms)이었다. 사용자가 808은 오타이고 8080이 맞다고 확정했다. 이후 대상은 :8080이다. 주소/포트는 관리자 시험 문맥의 승인 대상이며 일반 사용자 진단 응답에 노출하지 않는다.
- 서버의 일회용 컨테이너 modelnaru-n13-local-recheck에서 domain:8080 models GET HTTP 200과 gemma4-12b 실제 생성 1회를 실행했다. keyless·max_tokens=64·stream/include_usage 사용. HTTP 200/text/event-stream·finish_reason=stop·[DONE] 수신, 생성 본문 2 byte, usage 21/49, 48 data event·수신 12,270 byte, header 약 20.318초·전체 22.230초로 완료했다. 모델 목록 당시 unloaded였지만 지연 원인을 특정하지 않는다. 프롬프트·본문·raw event·models args/preset은 증거에서 제외했다.
- 증거 tmp/n13/local-model-restored-probe.json. 운영 API image는 Node runtime으로만 재사용했고 운영 env/mount/config/network는 복사하지 않았다. 컨테이너는 read-only·uid 1000·CPU 0.25·RAM 128MiB·cap-drop/no-new-privileges·--rm으로 실행했고 제거를 확인했다. 운영 5개 컨테이너 healthy, Gateway/상용 Provider 호출 0회·키 파일 접근 없음. 제품·DB/schema·의존성·라우팅·방화벽은 변경하지 않았다.
- 인수 범위: 서버 Docker의 원격 모델 TCP/HTTP/SSE/usage 직접 연결은 통과했다. 현재 SECURITY_SPEC.md N02는 공인 목적지에 HTTPS, 로컬 HTTP에는 정확한 사설 literal IP:port만 허용하므로 공인 HTTP domain/IP는 앱 custom 등록 대상이 아니다. 결과의 applicationPolicyAcceptance=false는 이 구분이다. 앱 job/DB/quota/GET 재연결의 서버 환경 인수는 이번 직접 요청으로 대체하지 않는다. 같은 모델의 공인 HTTPS endpoint 확보 또는 사용자 요청에 따른 별도 목적지 정책 변경/설계가 다음 조건이다. 해당 정책 변경은 이번 시험에서 수행하거나 승인받은 것이 아니다. 공인 Web HTTPS·실기기 인수도 남아 N13 부분 완료·N14 대기를 유지한다.

## 2026-10-01 N13 진단 적용 Gateway 재시험 (정상 생성 인수 통과)

사용자 "다음작업시작해"로 직전에 제시한 gemini-3.8-flash/256토큰/추가 1회/예상 $0.01 이내의 실제 재시험을 승인했다. 새로운 전용 PostgreSQL 17·network·loopback SSH tunnel과 현재 API 진단 빌드로 기존 Gateway harness를 실행했다. 기본 TLS/키 확인/암호화 등록/UI/API 6개 및 실제 Gateway HTTP/SSE·usage/quota 검사 1개, 총 7개 인수가 통과했다(exit 0). 브라우저 HTTP 응답 60건·오류 0개다. 이전 572초 실패의 JSON 증거는 tmp/n13/gateway-256-no-diagnostic-result.json에 보존했다. 아래 진단 보완의 "추가 실제 호출 없음"은 그 이전 로컬 보완 작업의 범위다.

- 실제 생성은 completed·errorCode=null, 본문 2 byte, input/output 56/100, usage event completed·usage_known=true·quota charged였다. 실제 HTTPS SSE terminal과 GET job·DB의 일치를 확인했다. 유료 chat POST는 이번 1회이며, 이전 64토큰/256토큰 실패를 합친 전체 실제 생성 시도는 3회다. 자동 추가 재시도는 없다. 이번 승인 범위도 소진됐다.
- 안전 진단: HTTP 200, Content-Type text/event-stream, header 346ms, 첫 byte 15,346ms, 마지막 byte 249,098ms, 전체 249,131ms. 수신 4,701 byte·20 chunk·5 frame·5 data event([DONE] 포함), outcome/stage completed, 내부 원인/공개 오류 null이었다. DB job 생성부터 종료 commit까지는 약 251초다. 첫 byte는 생성 본문 도착 시간과 같다고 단정하지 않는다. 지연 원인/운영 응답 시간 합격까지 확정하는 결과는 아니다.
- 증거: tmp/n13/gateway-256-result.json(안전 진단 포함), gateway-result.json(usage/quota), gateway-integration-result.json(7개 검사/HTTP 상태), provider-response-diagnostics.json(공통 진단). 생성 본문은 저장하지 않고 contentBytes만 기록했다. 파일을 테스트 키와 메모리 비교해 키가 없음을 확인했고 .env 원문을 출력/원격 복사하지 않았다. pricing 기반 입력 1024/출력 256 예상 상한 $0.001728은 $0.01 이내이며 실제 청구 비용 확인은 아니다.
- API/Web/browser/mock/proxy/private fixture는 harness finally에서 정리했다. 전용 컨테이너 modelnaru-n13-gatewaydiag-postgres-test·network modelnaru-n13-gatewaydiag-test·loopback tunnel 45436을 정리했다. 전용 원격 자원 없음, 로컬 private 폴더/Node/터널 listener 0개, 운영 5개 컨테이너 healthy를 확인했다. 운영 서비스/DB/config·사용자 .env·의존성·제품 코드는 변경하지 않았다. 문서 diff 검사는 통과했다.
- 판단: 선택한 LLM Gateway 모델의 정상 생성 인수와 진단 수집은 통과했다. 이전 CHAT_PROVIDER_RESPONSE_INVALID는 원본 응답/진단이 없어 원인을 소급 확정할 수 없고, 이번 성공만으로 수정된 결함이나 모든 Provider 지원을 주장하지 않는다. N13은 서버→LAN 연결 timeout 및 Web 앱 공인 HTTPS/실기기 미확보 때문에 부분 완료이며 N14는 대기다.

## 2026-10-01 N13 응답 진단 보완 (완료·추가 실제 호출 없음)

- 적용: apps/api/src/chat-streaming.ts 공통 처리기에 기본 process 로그 provider_response_diagnostic를 추가했다. HTTP 상태·allowlist Content-Type·헤더/첫 byte/마지막 byte 시각/경과·byte/chunk/frame/data event 수·실패 단계·고정 내부 원인 코드·기존 공개 오류를 기록한다. 상세 필드/보존 기준은 ADMIN_LOGGING_SPEC.md N13 절이 원장이다. 키·URL·prompt·생성 본문·임의 upstream 필드·예외 문구는 제외한다.
- 검증 전 JSON/구조/finish/UTF-8/framing 실패는 공통 catch/finally에서 진단한다. 기존 원본 onRawEvent 위치를 옮기거나 실패 원문을 저장하지 않았다. raw callback이 호출되지 않은 실패에도 진단 1건이 남는 assertion을 추가했다. 원본 trace 비활성 상태의 실제 loopback HTTP/SSE fixture에서도 HTTP 상태·수신·실패 단계와 안전 로그를 확인했다.
- 새 fixture apps/api/test/provider-response-diagnostic.test.ts 21개: malformed JSON, schema/error event, unknown finish, premature DONE, incomplete EOF/frame, empty/oversized frame, invalid UTF-8, body interruption, 성공/heartbeat/event count, 0 byte chunk, output token/byte/refusal, HTTP 502/204/Content-Type 마스킹, header/idle/total timeout, 취소/network error, callback 실패 비간섭 및 기밀 sentinel 비노출을 검사했다.
- 실행: pnpm --filter @modelnaru/api test — 43개 file·229개 통과, 실DB 조건부 6개 제외. pnpm --filter @modelnaru/api exec vitest run test/provider-response-diagnostic.test.ts test/chat-streaming.test.ts — 2개 file·57개 통과(최종 재실행 포함). 증거 tmp/n13/diagnostic-api-regression.log와 diagnostic-fixture.log. API typecheck/build, 변경 3개 코드 파일 eslint, harness node --check, git diff --check 통과.
- harness 보완: stdout에서 고정 진단 marker와 허용 필드만 수집한다. 다음 실행의 provider-response-diagnostics.json 및 gateway-256-result.json에 진단을 보존하고 생성 본문 대신 contentBytes만 기록한다. GET/SSE 결과와 진단 누락 여부를 성공 assertion 전에 보존한다. 이번에는 실DB/브라우저 전체 harness를 재실행하지 않았고 그 경로는 구문/lint/타입 기반 검증만 했다. 운영·키 파일·DB/schema·의존성 변경은 없다. 모든 네트워크 fixture는 loopback으로 종료/정리했으며 외부 Provider 호출은 0회다.

### 실제 재시험 조건 (위 1회 실행 완료·향후 추가 호출은 새 승인 필요)

1. 위 시험까지 실제 생성 3회 승인 범위는 소진됐다. 향후 추가 호출에는 선택 모델·출력 예산·생성 횟수·예상 비용 상한의 새 승인이 필요하다. 이번 gemini-3.8-flash/256토큰/1회/$0.01 이내 승인을 재사용하지 않는다. 승인 뒤 최신 모델 가격/streaming 정보로 예상 상한을 다시 확인한다. 실제 청구 비용은 별도 증거 없이는 확정하지 않는다.
2. 새 테스트 PostgreSQL·계정·network·loopback tunnel을 만들고 운영 서비스/DB/config/key를 재사용하지 않는다. API는 이 진단 보완 빌드로 실행한다. 사용자 .env.n13-test를 로컬 메모리로만 읽으며 자식 환경에서 키를 제거한다. 원격 DB에는 임시 master key로 암호화한 credential만 넣는다.
3. MODELNARU_N13_GATEWAY_TEST=1, MODELNARU_N13_GATEWAY_MAX_OUTPUT_TOKENS=256와 MAX_GENERATIONS=1을 확인한다. 실제 chat POST는 기존 fetch 경계의 1회 제한을 유지하고 보조 유료 제목/요약이 없는 짧은 질문을 사용한다. requestTraceLimit=0을 유지한다. 유료 자동 재시도/다른 모델 전환은 하지 않는다.
4. 실제 HTTPS SSE terminal·GET job·usage/quota와 안전 진단을 함께 보존한다. 완료/본문 존재/usage 일치/charged가 모두 맞아야 정상 인수다. 실패하면 stage/internalCause/httpStatus/contentType/count/timing으로 분류하며 이번 기존 실패 원인을 추측해 parser 기대값을 완화하지 않는다. JSON_INVALID 등 진단만으로 원본 payload를 복원하거나 upstream blame을 확정하지 않는다.
5. 결과와 미검증 범위를 원장에 기록하고 API/Web/browser/proxy/mock·DB/container/network/tunnel/private fixture를 정리한다. 전체 요청은 기존 30분 상한을 따른다. 정상 생성 인수가 통과해도 서버→LAN 및 공인 Web HTTPS·실기기 차단은 별도로 남는다.

## 2026-10-01 N13 LLM Gateway 실제 인수

### 256토큰 재시험 (실행 완료·정상 생성 인수 실패)

- 사용자 "시작해"로 추가 생성 1회·출력 256토큰·예상 $0.01 이내를 승인했다. 사용자 .env를 변경하지 않고 process 환경으로 출력 예산만 지정했다. 가격 메타데이터 기준 입력 1024/출력 256토큰의 예상 상한은 $0.001728이며 실제 청구 금액 증거는 아니다.
- 새 전용 PostgreSQL 17 컨테이너·network·loopback SSH tunnel에서 기존 실제 HTTP/HTTPS SSE harness를 실행했다. 키 확인·모델 조회·암호화 등록 및 기본 UI/API 검사 6개가 통과했고 유료 chat POST 1회를 확인했다. runner는 Gateway의 completed assertion에서 exit 1로 종료됐다. 전체 인수 통과로 해석하지 않는다.
- 실제 job은 약 572초 후 failed/CHAT_PROVIDER_RESPONSE_INVALID, 본문 0 byte, input/output null로 종료됐다. 실제 HTTPS SSE terminal은 수신했다. 격리 DB에서 usage event failed·usage_known=false·quota charged를 확인했다. unknown usage를 0이나 정상 성공으로 처리하지 않았다. 실제 청구 비용은 확인하지 않았다.
- 증거: tmp/n13/gateway-256-no-diagnostic-result.json(후속 시험 전에 보존한 기존 결과). 실패 assertion 전에 실제 GET 결과·SSE terminal·유료 호출 수를 저장했고, DB에서 확인한 duration/usage/quota를 추가했다. requestTraceLimit=0으로 원본 Provider 응답은 보존하지 않았으므로 비정상 응답의 구체적 형식과 Gateway/상위 Provider/API parser 중 원인은 확정할 수 없다. 이 상태는 전체 timeout(30분) 결과가 아니다. 같은 실행에서 추가 유료 재시도는 하지 않았다.
- 컨테이너 modelnaru-n13-gateway256-postgres-test, network modelnaru-n13-gateway256-test, loopback tunnel 45435, API/Web/browser/mock/proxy/private fixture를 정리했다. private 폴더·시험 Node·터널 listener 0개, 원격 전용 컨테이너/network 없음, 기존 운영 5개 컨테이너 healthy를 확인했다. .env.n13-test는 보존·Git ignore 확인했다. git diff --check 통과. 아래 64토큰 시험은 별도 승인으로 실행한 이전 결과다.

사용자가 .env.n13-test의 테스트 키와 gemini-3.8-flash를 입력하고 실행을 요청했다. 기존 n13-integration.mjs에 Gateway 모드를 추가해 실제 관리자 등록/키 검증/모델 discovery와 암호화 저장, 사용자 job·HTTPS SSE를 실행했다. 키를 로그/문서/자식 process 환경에 기록하지 않으며 원격 DB에는 임시 master key로 암호화된 credential만 저장했다. 실제 유료 chat POST는 fetch 경계에서 1회로 제한하고 나머지 outbound는 기존 mock 또는 승인된 Gateway 경로만 허용했다.

- 현재 authenticated 모델 목록 144개와 선택 모델의 streaming·가격 메타데이터를 확인했다. 입력 예산 1024와 출력 64토큰으로 추산한 비용은 설정된 $0.01 이내였다. 관리자 API의 /key 검증·모델 동기화·등록과 키 비노출/암호화 assertion은 통과했다.
- 실제 생성 1회는 failed/CHAT_OUTPUT_LIMIT였다. 본문 2 byte(부분 답변 OK), input/output usage 56/60, usage_known=true, usage event failed와 quota charged를 확인했다. 정상 종료를 완료로 처리하지 않은 것은 기존 Provider length 계약과 일치한다. 모델 출력 상한이 이 요청의 정상 종료를 보장하지 못했으므로 성공 인수로 표시하지 않는다.
- 증거 tmp/n13/gateway-64-result.json. 첫 실행은 실패 결과 assertion 이전에 파일을 쓰지 않아 실제 테스트 DB의 제한된 상태/usage 값만 다시 읽어 보존했다. 후속 runner는 성공/실패를 assertion 이전에 기록하도록 보완했다. 키 원문은 읽기 출력하지 않았다.
- 당시 지정했던 1회 한도에 도달해 같은 실행에서는 추가 호출하지 않았다. 이후 사용자의 별도 승인으로 위 256토큰 재시험 1회를 실행했다. 두 실행 합계 유료 POST는 2회이며 추가 승인 없는 재호출은 금지한다. 사용자 .env의 키/모델/설정은 임의 수정하지 않았다.
- 첫 실행의 API/Web/browser/mock/proxy/private fixture 및 Gateway 전용 DB/network/tunnel은 정리했다. 운영 서비스는 변경하지 않았다. 변경 mjs eslint는 실행 전 통과했다.

## 2026-10-01 N13 잔여 인수 재개

- 후속 LLM Gateway: .env.n13-test를 만들고 기존 Git ignore 적용을 확인했다. 실제 키는 사용자 입력 대기다. 준비 파일만 생성했으며 실제 Gateway 인증/생성은 미실행이다. 실제 시험은 현재 격리 HTTP/API/DB harness를 재사용하고 키를 원격 서버에 복사하지 않는다.

적용: 아래 첫 N13 인수 이후 사용자 요청으로 이어진 작업이다. 현재 제품 코드/DB/schema/의존성은 변경하지 않았다. 최신 판정은 이 절이 이전의 OCR 승인 대기·보조 호출 미실행 기록보다 우선한다.

### 완료한 추가 검증

- 실제 보조 호출 강제 종료: 기존 apps/api/test/chat-jobs-http-postgres.test.ts harness를 확장했다. 실제 HTTP로 제목 생성과 요약 생성을 시작하고 API child에 SIGKILL 후 새 API를 기동했다. 제목의 원래 chat job은 completed와 본문/usage 3/4를 보존했고 title task/usage/conversation title_status는 failed, 부분 usage 7/2를 보존했다. 요약은 chat job이 CHAT_SERVER_RESTARTED, summary usage는 failed·11/5, quota charged, 새 summary 저장 0건이었다. 두 경우 Provider 호출 수가 재시작 후 늘지 않았다. 이 기존 HTTP 인수 파일 1개 전체가 64.42초·종료 코드 0으로 통과했다. tmp/n13/auxiliary-restart.log 참조.
- 요약 fixture 첫 실행은 출력 기본값을 생략해 요청이 보조 호출에 도달하지 않아 실패했다. 기존 N08와 같은 maxOutputTokens=64를 명시해 인수 경로를 만들었다. 제품 정책/기대값은 완화하지 않았다. 추가 SQL 반환 타입을 명시한 뒤 변경 시험 eslint·API typecheck 통과.
- 실제 OCR: 사용자에게서 파일 3개 전송의 명시적 승인을 받은 뒤 실행했다. 기존 modelnaru-api 이미지의 poppler/tesseract runtime에 현재 pdf-ocr.js/pdf-attachments.js와 n13-ocr.mjs만 read-only mount했다. network=none/read-only/CPU0.5/RAM512MiB/tmpfs128MiB이며 운영 env/config/data mount는 없다. 1페이지 이미지 전용 PDF가 실제 kor+eng Tesseract에서 영문 문자열 MODEL NARU OCR ACCEPTANCE로 인식됐고, page limit·invalid PDF 오류와 성공/실패 임시 폴더 정리가 통과했다. 한국어 인식 품질이나 전체 새 API 이미지/첨부 HTTP 인수를 이 결과로 주장하지 않는다.
- OCR 첫 fixture는 폰트에 의존하는 text PDF→raster 경로에서 PdfOcrNoTextError로 실패했다. 해당 raster의 원인을 별도 확정하지 않고 Windows Arial로 만든 고정 raster를 script에 포함해 폰트에 의존하는 fixture 생성 단계를 제거했으며 재실행 종료 코드 0을 확인했다. 사용자 제공 PDF나 개인정보는 없다.
- 실행 파일 대조: 로컬/서버 SHA256 일치. n13-ocr.mjs b50e666483ea4d2ddaddb21f3d030a5e668532935852ff3b5f24c0587306d02b, pdf-ocr.js e3b466788ab1e00f4f00910e819116912ef3e35a8cbcd8d1a1f19ed87274f945, pdf-attachments.js f7d9d58ccdadd4edc46f1bfa0f807314e569237c5863e73455382f6fcbaa340c. OCR 컨테이너와 승인된 원격 파일 3개·임시 폴더는 제거했다.
- 실제 LAN 모델: 사용자가 제공한 mihoservice.iptime.org:8080/v1/models와 사설 192.168.0.12:8080의 목록 조회 성공. 후자는 현재 앱의 승인된 사설 IP/port 계약으로 실제 관리자 API에 keyless custom 등록·수동 모델 추가·활성화·사용자 권한 부여 후 실제 사용자 job API로 gemma4-12b를 호출했다. 정상 completed, 본문 2 byte, input/output 72/26, quota charged를 실제 DB에서 확인했다. authMode none이며 실제 키는 사용하지 않았다. OpenAI mock shim을 거치지 않는 custom pinned transport다.
- LAN 시험 첫 실행은 mock UI의 기본 모델이 실제 모델로 정렬되어 의도하지 않은 테스트 질문을 먼저 전송했다. fixture가 명시적으로 n13-model을 선택하도록 고쳤다. 첫 호출은 20초 대기 후 API 정리로 중단됐으며, 이후 실제 모델에 64토큰 상한의 짧은 질문 1회가 완료됐다. 자동 유료 재시도는 없다.

### 5분 부하·최종 결과와 정리

- 확장한 n13-integration.mjs 최종 종료 코드 0, 인수 8개 통과, 브라우저 API 응답 71건, pageerror/외부 브라우저 요청 0, mock 호출 3회. 별도 승인 LAN 모델 완료 호출 1회는 mock 수에 합산하지 않는다. 결과는 tmp/n13/result.json이다.
- MODELNARU_N13_SOAK_SECONDS=300으로 3,211,264 byte를 5분에 걸쳐 생성했다. 실제 총 313.094초, 정상 HTTPS SSE 수신자와 실제 HTTP 소켓을 pause한 수신자를 함께 연결했다. 느린 수신자는 terminal 이전 280,567 byte에서 연결 종료됐고 정상 수신자의 GET 본문/SSE 재조립은 원문과 정확히 일치했다. 모든 정상 수신 frame은 실제 직렬화 크기 64 KiB 이내였다.
- API 프로세스의 RSS를 1초마다 수집해 최대 295,436,288 byte(약 281.8 MiB)를 관측했고 설정 기준 768 MiB 이내임을 assertion으로 검증했다. tmp/n13/load-result.json에 시계열·최대값·수신자 결과가 있다. Windows API의 단일 5분 시나리오 인수이며 Linux API 컨테이너의 24시간 안정성이나 모든 동시 사용자 조합을 보장하지 않는다.
- 재현 시 기존 N13 환경에 승인된 MODELNARU_N13_LOCAL_BASE와 MODELNARU_N13_LOCAL_MODEL, MODELNARU_N13_SOAK_SECONDS=300을 추가하고 같은 script를 실행한다. 실제 모델 옵션은 둘 다 지정해야 하며 없으면 실제 Provider는 호출하지 않는다. 실제 호출 비용/대상 승인은 실행 전에 확인한다. fixture DB는 빈 public schema만 허용한다. 이번 대상은 사용자 승인 keyless gemma4-12b였다.
- 변경 시험 eslint·API typecheck·git diff --check 통과. 제품 코드 변경이 없어 이전 전체 287개 회귀/build 증거를 재사용하고, 이번에는 보조 호출 추가 HTTP 시험과 확장한 통합 인수를 실행했다. 전체 회귀를 다시 실행했다고 합산하지 않는다.
- API/Web/Edge/mock/proxy·생성 secret/config/cert는 finally로 정리했다. modelnaru-n13-followup-postgres-test(--rm)와 modelnaru-n13-followup-test network, 해당 SSH tunnel을 제거했다. OCR와 LAN probe 컨테이너·원격 OCR 폴더도 없다. 운영 5개 컨테이너는 Up 15 hours/healthy 유지. 사용자 모델 서버 설정·프로세스는 변경하지 않았다.
- 최종 판정: 실행 가능한 독립 잔여 인수는 위 범위에서 완료했다. 서버→LAN 연결과 웹 앱의 공인 HTTPS/실기기 환경 차단이 남아 N13 전체 완료 및 N14 전환 승인은 보류다.

### 최종 환경 차단

- 공개 Provider transport는 현재 secureProviderFetch로 https://api.openai.com/v1/models에 무인증 GET을 1회 실행해 예상 401을 받았다. Node 24의 실제 공개 DNS/pinned lookup/TLS 경로가 통과했고 키/생성 호출은 사용하지 않았다. 인증된 OpenAI 생성 또는 웹 앱의 외부 HTTPS 배포 인수는 아니다.

- 서버→LAN 모델: mihoservice_server 호스트 curl은 192.168.0.12:8080 connect timeout(5초), 일회용 Docker Node fetch도 connect timeout(10초)이었다. 서버 경로는 src 192.168.75.100, gateway 192.168.75.1, enp1s0이며 모델은 192.168.0.12로 서로 다른 subnet이다. 원인은 이 결과만으로 방화벽 또는 라우팅 중 하나로 확정하지 않는다. 서버에서 해당 주소 연결이 가능해진 뒤 재검증해야 한다. 네트워크 설정은 변경하지 않았다.
- 공인 HTTPS와 실기기 IME/가상 키보드/스크린리더 인수는 여전히 환경/실측이 없다. 현재 테스트 인증서·headless 화면 인수로 대체하지 않는다. 원격 상용 Provider별 키 인수는 수행하지 않았으며 fixture 지원 수준을 유지한다.

## 2026-10-01 N13 통합 인수 — 부분 완료

N13은 아직 완료가 아니며 N14 운영 전환은 대기다. 기존 미커밋 N00~N12를 보존했다. 이번 제품 코드/DB/API/의존성 변경은 없고 시험과 원장만 보완했다.

### 기존 증거와 이번 실행

- 기존 N06의 실제 HTTP/SSE disconnect·GET/revision 재접속·idempotency·terminal 경합·process restart·session/동시성, N07 custom transport, N08/N09 DB 경합 시험을 재사용했다. 전체 API 시험을 테스트 DB에 연결해 재실행했으며 같은 흐름을 새 mock 단위 시험으로 대체하지 않았다.
- N12 Docker 설치/TOTP 복구/정상·강제 종료/동일 release update 11개 인수는 이전 증거를 재사용한다. 이번에는 재실행한 것으로 계산하지 않는다.
- 전체 pnpm test: API 214개(실DB 조건부 6개 모두 포함), database 22개, Web 31개, CLI 5개, config 15개 통과. config의 Windows symlink 권한 시험 1개는 기존 OS 조건으로 제외됐으며 Linux 전체 회귀 통과로 표현하지 않는다. 총 287개 통과·1개 제외. tmp/n13/unit-tests.log 참조.
- pnpm typecheck, pnpm lint, pnpm build 통과. tmp/n13/typecheck.log, lint.log, build.log. 현재 config/database/API 컴파일 및 Web production build를 사용했다.
- 기존 N11 browser: 실제 Edge·fixture HTTP 167건·63개 캡처 통과. checkbox check() 직후 재렌더링 경합은 click→실제 PATCH 성공→checked를 기다리도록 수정했다. 기대값은 보존했다.
- 실DB 전체 첫 실행은 chat-jobs-postgres의 terminal 이벤트 1건이 실패했다. DB commit을 별도 reader가 먼저 읽을 수 있으므로 이벤트 발행까지 5초 이내 poll하도록 수정했다. 완료/본문/terminal/Provider 1회 기대값은 그대로며 재실행에서 API 214개 모두 통과했다.

### 새 실제 Web/API/DB/HTTPS 시험

apps/web/test/n13-integration.mjs: 실제 컴파일 API, production Next Web, Edge headless, 인증서가 있는 로컬 HTTPS proxy, mihoservice_server의 전용 PostgreSQL 17 컨테이너를 사용한다. DB는 운영과 다른 계정/저장소/network이고 CPU 0.5·메모리 256 MiB·서버 loopback에만 바인딩했다. 로컬 SSH tunnel로 접근한다. 운영 config/DB/Provider 키는 사용하지 않는다.

Provider만 별도 로컬 mock이다. API fetch shim은 OpenAI 호스트를 mock으로 치환하고 다른 outbound를 거부한다. TLS는 생성된 단기 인증서를 Node 클라이언트에서 CA로 직접 검증하고 브라우저는 그 인증서의 SPKI만 허용한다. OS trust 변경·전역 certificate 무시는 없고 공인 HTTPS/실제 Provider TLS 검증은 아니다.

검증 항목:

1. 실제 관리자 TOTP 로그인, Secure/HttpOnly session, 사용자 생성/권한 부여, 일반 사용자의 관리자 API 403.
2. 이미지 estimate UI 저장 2048과 이미지 활성화를 실제 API→DB에서 확인.
3. 사용자 UI 생성 중 page reload, GET+SSE 복원, Provider 1회, 완료 DB 본문 정확 일치, 중복 heading 없음, raw HTML·javascript 링크 무실행/외부 요청 없음.
4. 시스템 프롬프트만 수정했을 때 실제 DB title_source 보존, UI 취소 후 cancelled 저장.
5. 실제 데이터로 390/1440 폭의 가로 overflow 없음, 브라우저 pageerror 없음. 관리자와 모바일 캡처를 직접 확인했다. 총 3개 캡처이며 실기기 키보드·스크린리더 인수는 아니다.
6. 출력 config 8 MiB·SSE queue 64 KiB에서 3 MiB + 제어문자 64 KiB의 실제 GET/SSE 경계를 별도로 실행한다. 초기 60초 대기는 원격 DB에 누적 checkpoint를 전송하는 중 2,211,840 byte에서 초과했다. 제품 timeout/기대 결과는 유지하고 이 시험의 대기를 180초로 설정했다. 최종 결과는 아래에 기록한다.

재현: 저장소 root에서 현재 build와 새 빈 loopback *_test PostgreSQL을 준비한다. MODELNARU_TEST_DATABASE_URL은 환경에 주입하며 값은 문서/로그에 기록하지 않는다. MODELNARU_BROWSER_MODULE은 기존 Playwright index.mjs, MODELNARU_OPENSSL은 기존 openssl 실행 파일의 절대 경로로 지정하고 node apps/web/test/n13-integration.mjs를 실행한다. 새 패키지 설치는 없다. script는 기존 public table이 있으면 거부하고 자체 API/Web/browser/proxy/mock·생성된 config/key/certificate를 finally에서 정리한다. 호출자는 소유한 DB 컨테이너/network/tunnel을 별도로 정리한다.

### 최종 실행 결과·정리

- n13-integration.mjs 종료 코드 0, 인수 6개 모두 통과. 브라우저 관측 API 응답 54건, 캡처 3개, mock Provider 3회, pageerror/외부 browser 요청 0. 별도 Node 클라이언트의 TLS health와 대용량 SSE는 이 54건에 합산하지 않았다. 결과: tmp/n13/result.json 및 admin-real-api.png, chat-390.png, chat-1440.png.
- 실제 3,211,264 byte 본문(3 MiB ASCII + 제어문자 64 KiB)은 completed로 저장됐고 GET content와 SSE text 합계가 원문에 정확히 일치했다. JSON·SSE 헤더를 포함한 모든 수신 frame이 65,536 byte 이하였다. 8 MiB 설정에서 기본 2 MiB보다 큰 답변을 생성·저장·복원했고 queue 최소값과 JSON escape 경계도 검증했다. 8 MiB 전체 생성 HTTP 인수로 확대하지 않는다(8 MiB 저장은 기존 DB 시험).
- 진행 중 Windows API PeakWorkingSet64 307,523,584 byte, DB 75.05 MiB/256 MiB를 관측했다. 하나의 관측이며 Linux API 컨테이너 RSS 제한·장시간/느린 수신자 부하 합격 기준으로 사용하지 않는다. SSH DB 누적 checkpoint 전송 지연을 포함한 시험이므로 운영 처리량으로 해석하지 않는다.
- 초기 runner 실패 3건은 모델 관리 펼침 누락, SQL started_at 대신 실제 created_at 사용, 설정 저장 후 자동 닫힘을 다시 클릭한 오류였다. 시험만 보정했다. 제품 결함을 숨기는 skip이나 assertion 삭제는 없다. 이후 기본 5개 통과, 대용량 60초 대기 초과, 동일 기대값의 180초 재실행에서 최종 6개 통과 순서다.
- N13 API/Web/Edge/proxy/mock 및 private config/key/cert 임시 폴더는 runner finally로 정리했다. 서버의 modelnaru-n13-postgres-test(--rm, 전용 저장소)와 modelnaru-n13-test network를 삭제하고 해당 SSH tunnel만 종료했다. 운영 5개 컨테이너는 모두 Up 14 hours/healthy로 유지됐다. OCR 파일 전송은 승인 거절로 수행하지 않았다.
- 변경 시험 구문/eslint와 git diff --check 통과. N13 필수 미검증 때문에 단계는 부분 완료다.

### 잔여·차단 구분

- 실제 Provider/모델·테스트 키 파일·허용 호출/비용·LAN 추론 주소가 없어 요청 중이다. 운영 키로 대체하지 않는다.
- 공인 HTTPS 대상과 인증서·외부 네트워크, 실제 모바일 IME/키보드/스크린리더 인수 환경이 없다.
- 실제 OCR: apps/api/test/n13-ocr.mjs를 준비했고 구문/lint만 통과했다. 로컬 tesseract가 없어 서버 기존 런타임을 일회용 컨테이너로 재사용하려 했으나, 시험 script와 현재 PDF 모듈 2개 전송을 자동 승인 검토가 거절했다(이전의 미커밋 코드 전송 불필요 조건). 사용자에게 정확히 3개 파일의 일시 전송 허용을 요청했다. 실행하지 않은 OCR을 통과로 기재하지 않는다.
- 장시간 부하·느린 수신자의 RSS 상한, 보조 호출 도중 실제 process 강제 종료는 미실행이다. 기존 단위/DB 경계·컨테이너 memory limit만으로 이 성능 인수를 대체하지 않는다.
- N13 전체 완료/릴리스 후보 판정은 보류. AUD별 대조는 SPEC_AUDIT.md N13 표를 따른다.

## 2026-10-01 N12 관리자 복구·패키징·설치

상태: **N12 완료 — 격리 Docker 배포 인수 통과**. 운영 전환은 수행하지 않았다.

### 구현과 시험 환경

- 변경: Next standalone 실행·정적 asset 배치, Valkey 서비스/의존성/신규 폴더 제거, Docker JSON 로그 10 MiB×3, config 종료 대기+10초의 Compose stop timeout, 새 job SSE proxy, start/restart/update/health 명령과 실행 문서. API는 DB close 이전 hook에서 접수를 차단하고 upstream 취소·최종 저장·제목 작업 종료를 기다린다. 정상 종료는 CHAT_SERVER_SHUTDOWN, 강제 종료 복구는 CHAT_SERVER_RESTARTED다.
- 서버: mihoservice_server의 /tmp/modelnaru-n12-20261001, Compose project modelnaru-n12-20261001, loopback 동적 port, 별도 modelnaru_test PostgreSQL·별도 mock Provider. 운영 config/DB/자격증명과 실제 Provider는 사용하지 않았다. Docker 29.4.2·Compose 5.1.3, 빌드/실행 이미지 Node v24.14.1·pnpm 11.9.0을 직접 확인했다.
- 시험 자원: 별도 buildx 빌더 CPU 1.5·RAM 3GiB, API 0.75/768MiB, Web 0.5/512MiB, PostgreSQL 0.5/256MiB, Gateway·mock 각 0.25/128MiB. 포트·네트워크·bind data·계정/비밀값을 운영과 분리했다.
- 실행 소스 대조: 로컬/서버 allowlist 런타임 파일 160개의 경로순 SHA256 집계가 9e5ed2f8ad6edd6beb654e414a76e0b4f35808f1aa15ccef6ed825cf27c34138로 일치했다. 기존 미커밋 N00~N11을 포함한 작업 트리이며 git HEAD만으로 실행 버전을 지칭하지 않는다.
- 소스 전송: 최초 포괄 전송은 자동 승인 검토에서 거절됐다. 빌드에 필요한 경로 allowlist 160개를 검사한 뒤 승인받아 전송했다. config/환경파일/secrets/data/키 파일은 제외했고 검출된 DB 문자열 1건은 CLI의 동적 생성 템플릿이었다. 이후 수정 파일과 비밀값 없는 시험 script만 반영했다.
- 로컬: API fixture 42개 파일·208개 시험 통과, 기존 실DB 조건부 6개는 이 명령에서 제외. CLI 5개·API/CLI typecheck·변경 TypeScript eslint·git diff --check 통과. 이번 실DB 증거는 아래 Docker 배포 시험이며 조건부 시험 6개를 재실행한 것으로 합산하지 않는다.

### 재현 방법과 검증 범위

전제: Linux Docker/Compose·Python 3, 운영과 분리된 새 /tmp/modelnaru-n12-* 소스 폴더. scripts/test-n12-deployment.py는 이 경로와 config 미존재를 확인하며 생성된 TOTP/비밀번호/cookie/SQL을 로그에 기록하지 않는다. init/reset 출력은 PTY 메모리에서 폐기한다. 운영 폴더에서 실행하면 안 된다.

```bash
# 새 시험 checkout에서만 실행, 고유 이름을 사용
export COMPOSE_PROJECT_NAME="$(basename "$PWD")"
export BUILDX_BUILDER="$COMPOSE_PROJECT_NAME"
docker buildx create --name "$BUILDX_BUILDER" --driver docker-container \
  --driver-opt memory=3g,cpu-period=100000,cpu-quota=150000
chmod +x bin/apichat-admin bin/modelnaru
docker compose build admin-tool api web migrate
python3 scripts/test-n12-deployment.py
```

script는 대화형 init, v1/0600 오류, README start/status/logs/health, standalone asset, 20개 migration, 실행 컨테이너 log/자원/stop timeout, 실제 관리자 HTTP 로그인·TOTP 복구, PostgreSQL 사용자 fixture의 실제 대화/job HTTP, Gateway SSE snapshot/append/heartbeat, SIGTERM commit·SIGKILL recovery, checksum 거부, 같은 release update와 stop/start 데이터 보존을 검사한다. 실패 시 script는 근거를 남기고 중단하며 호출자는 해당 project down·전용 builder 제거·경로 확인한 임시 data/secret 정리를 수행한다.

### 최종 실행 결과·정리

- scripts/test-n12-deployment.py의 11개 인수 단계 모두 통과했다. 비대화형 TOTP reset 거부, config v1/권한 거부, 새 설정 초기화와 실제 관리자 로그인/복구를 포함한다. 복구 후 이전 session과 이전 code는 401, 새 code는 200이었다.
- 실제 Gateway HTTP에서 대화/job 생성과 SSE snapshot·append·15초 heartbeat를 받았다. 생성 중 SIGTERM 후 job/message/usage는 failed, errorCode는 CHAT_SERVER_SHUTDOWN, 본문은 부분 답변을 보존했고 input/output 3/2·quota charged가 일치했다. SIGKILL 뒤 CHAT_SERVER_RESTARTED로 복구되고 mock 호출은 두 작업의 2회 그대로였다.
- 적용 migration 20개, 의도적 checksum 불일치 거부, 복구한 checksum으로 update 재실행, job 2개 보존 및 stop/start/health를 통과했다. Web HTML·번들 static·로고 200, 실행 컨테이너 log 순환과 API 40초 stop timeout도 확인했다.
- 실행 script SHA256: 0f0b4db41e57a68e86e07164ae3c96591655ee4db22baa20df1dc8969f8e727e. 최종 API image c85e769a831c0dece5e66ae57dc172ae7e2310abc00ed8a39b52aec788a0e18e, Web image cdd1b49f915b18ed261680ec073a3352a2230806a44da902c1cc1c2c19eb8090. 로그는 로컬 tmp/n12/result.log에 보존했다.
- 정리: 전용 project의 컨테이너·네트워크·빌더 및 cache volume·project label 이미지와 확인한 /tmp 시험 폴더(data·생성 비밀값 포함)를 제거했다. SSH 터널은 만들지 않았다. 운영 5개 컨테이너는 계속 Up 13 hours/healthy였고 변경하지 않았다. 공용 Docker prune은 사용하지 않았다.

### 발견·수정한 실패

- 신규 설치 start의 migrate image 누락: --no-build 기동 전에 migrate도 명시적으로 build하도록 수정했다. 기존 이미지가 있는 서버의 healthy 상태로는 드러나지 않는 경로였다.
- 초기 proxy 수정의 /api/conversations/ prefix가 collection POST에 301을 유발했다. 새 jobs/:jobId/events와 기존 messages만 정규식으로 매칭하도록 고쳤다. 실제 대화 생성 요청을 회귀 gate로 유지했다.
- 시험 Python 함수 http와 표준 모듈 이름이 충돌했다. import alias로 고쳤다. 이 실패는 제품 로그인 오류로 집계하지 않는다.

### 제한과 후속

- 격리 HTTP·실제 Gateway/API/PostgreSQL·mock Provider 검증이다. 외부 HTTPS/인증서·방화벽, 실제 유료 Provider·LAN 모델 서버, 전체 브라우저+API 인수, OCR 실파일·실기기·장시간 부하·호스트 reboot는 N13/N14에 남는다.
- 같은 release 재적용은 미래 schema 변경의 하위 호환/rollback을 보장하지 않는다. 현재 DB를 이전 이미지에 붙이는 임의 rollback과 v1 DB의 in-place upgrade는 지원하지 않는다.
- 기존 N11 브라우저 runner checkbox의 간헐 실패는 위 독립 재확인 기록대로 남으며 N12에서 완료로 덮어쓰지 않는다.



## 2026-10-01 N10-R1/N11-R1 독립 재확인

- 코드 검토: 이미지 estimate 로드·정수/범위/null 검증·저장 실패 초안·null 해제와 capability 동시 비활성화를 확인했다. 설정 제목은 실제 onChange와 폼을 열 때의 원래 제목을 대조하며 일반 저장에는 title을 보내지 않는다. 시안 SVG 및 CSS mask도 보존돼 있다.
- 직접 실행: production Web build(TypeScript 포함), Web 31개 회귀와 git diff --check 통과. 새 build로 N10 브라우저 22개 캡처·3회 생성/1회 취소/6회 구독 통과. N11은 첫 실행에서 n11-browser.mjs:537 imageToggle.check 직후 상태 검사에 실패했고 동일 소스 재실행은 63개 캡처·167개 HTTP로 통과했다.
- 잔여 시험 안정성: 이미지 checkbox는 서버 응답 후 controlled checked가 갱신된다. runner의 check()는 클릭 직후 checked를 요구해 다음 waitForFunction에 도달하기 전에 실패할 수 있다. 재실행 통과만으로 이 간헐 실패를 없었던 것으로 처리하지 않는다. 후속 시험 보완은 click 후 PATCH 성공과 checked를 기다리되 최종 checked/저장값 검증을 유지해야 한다.
- 판정: 앞선 제품 결함 두 건은 수정 확인했고 N12 착수 가능 판단을 유지한다. N11 runner 간헐 실패는 시험 안정성 보완으로 남긴다. 이번에는 실제 API/DB·외부 Provider·OCR·실기기 인수를 수행하지 않았다. 앱 코드와 운영 서버 변경 없음.

## 2026-10-01 N10-R1/N11-R1 보완 완료

- N11-R1: 관리자 모델에 imageTokenEstimate 조회/입력/PATCH를 연결했다. 1,024~2,147,483,647 정수와 null을 구분한다. 미설정 모델의 이미지 활성화는 예약값 저장 전까지 비활성화하고, 예약값을 비우면 같은 PATCH로 supportsImageInput=false를 보낸다. 저장 실패 시 초안을 보존한다. 모델 행 grid와 내부 스크롤을 보완해 입력/체크박스 겹침을 제거했다.
- N10-R1: 설정을 열 때의 제목과 사용자 편집 여부를 별도로 기록한다. 사용자가 제목을 바꾼 경우에만 title 필드를 전송한다. 자동 제목 polling으로 input defaultValue가 변한 것은 명시 편집으로 간주하지 않는다. 일반 설정 저장·409 재시도는 pending/auto 상태를 보존하고, 명시 제목 변경·409 재시도는 manual/none으로 전환한다.
- 직접 검사: production Web build, Web 8개 파일·31개 시험, Web typecheck, 전체 Web eslint 및 diff 검사를 통과했다. 코드 수정은 provider-manager.tsx, chat-workspace.tsx, 해당 모델 행 styles.css와 기존 n10/n11-browser.mjs에 한정한다. 기존 로고/사용자 변경을 보존했다.
- N11 브라우저: 실제 Edge+loopback fixture HTTP 167건·63개 캡처 통과. 추가 검증은 null 상태의 이미지 활성화 차단, 1023/소수/상한 초과 무전송, 2048 저장 실패 후 초안·재시도, 이미지 활성화, 다시 조회한 값, null 해제와 capability 동시 비활성화, 1024 저장·390px 내부 스크롤 접근이다. 실제 apps/api/src/context-budget.ts의 contextBudget을 직접 import하여 UI 저장 전/해제 후 CHAT_IMAGE_BUDGET_UNKNOWN, 저장 후 한 장당 2048 예약·input=4096을 확인했다. 서버 코드를 복제한 성공 fixture로 이 검사를 대체하지 않았다.
- N10 브라우저: 실제 Edge+HTTP/SSE 101건·22개 캡처 통과. PATCH에 title이 있으면 manual/none으로 전환하는 실제 repository 규칙을 fixture에 반영했다. systemPrompt만 저장·409 재시도 payload에 title이 없는지 확인했다. 자동 제목 완료를 실제 목록 polling으로 열린 폼에 반영한 뒤 일반 설정 저장에서 auto/완료 상태를 보존했다. 명시 제목 변경은 충돌 시 초안을 유지하고 재시도 후 manual/none으로 전환했다. 기존 새로고침/재연결/취소/재생성도 통과했다.
- 시험 보완: viewport를 모바일로 바꿀 때 자동 목록 닫힘과 경합하던 기존 시험은 본문 표시 완료를 기다리도록 수정했다. 본문 표시와 가로 넘침 기준은 유지한다.
- 재현은 아래 N10/N11의 production build와 browser runner 명령을 그대로 따른다. N11 runner는 서버 순수 TypeScript 함수를 읽으므로 기존 Node 24 runtime을 사용한다. 증거는 tmp/n10/result.json, tmp/n11/result.json 및 각 캡처다. 최종 프로세스 조회에서 해당 Next/n10-browser/n11-browser 0개를 확인했고 DB 컨테이너/터널은 만들지 않았다.
- 범위/한계: 실제 HTTP 요청을 사용한 Web fixture와 서버 budget 함수 검증이다. 이번에는 실제 API 프로세스+PostgreSQL의 새 통합 시험이나 실제 이미지 Provider 호출을 수행하지 않았다. API/DB schema·패키지·운영 서비스·실 자격증명은 변경/사용하지 않았다. 이 범위는 기존 N13 인수로 유지한다. 두 UI 결함 보완 완료로 N10/N11 완료 및 N12 착수 가능 상태를 복원한다.

## 2026-10-01 시안 로고 SVG

N03 시안의 path를 재사용한 투명 SVG와 화면 공통 CSS mask를 적용했다. SVG XML 파싱·path 일치·git diff --check로 검증한다. 앱 기능·서버 변경은 없으며 새 브라우저 시각 검증과 설치 아이콘 교체는 수행하지 않았다. N10/N11의 앞선 기능 보완 상태는 유지한다.

## 2026-10-01 N10/N11 독립 점검 — UI/API 연결 보완 필요

- 직접 검증: Web 8개 파일·31개 시험 및 typecheck 통과. 기존 production build로 n11-browser.mjs 재실행: passed, HTTP 160건·캡처 61개, errors/external 빈 배열. 기존 N10 데스크톱 채팅과 N11 모바일 Provider 캡처도 시각 검토했다. 이번에 production build·실API/DB·실 Provider/OCR·N10 browser runner·lint는 재실행하지 않았다.
- N11-R1 (P1): provider-manager.tsx의 이미지 capability 체크박스는 supportsImageInput만 PATCH하고 model 타입·form·payload 어디에도 imageTokenEstimate 입력이 없다. 신규 모델의 DB 기본값은 null이며 N08 contextBudget은 이미지 첨부와 null estimate 조합에 CHAT_IMAGE_BUDGET_UNKNOWN을 던진다. 현재 source contextBudget을 Node로 직접 실행해 이 오류를 확인했다. UI에서 이미지를 활성화해도 필수 예약값을 설정할 수 없어 이미지 생성이 실패한다. PROVIDER_REGISTRATION_SPEC.md의 관리자 명시 estimate 계약을 UI에 연결하고 저장값 로드·검증·수정·실패 초안을 시험한다. 실제 이미지 모델을 호출한 재현은 아니다.
- N10-R1 (P2): chat-workspace.tsx saveSettings는 제목 입력을 수정하지 않아도 title을 항상 PATCH한다. 서버는 title 필드 존재만으로 title_source=manual/title_status=none으로 변경하고 pending title task를 취소한다. 따라서 새 대화에서 시스템 프롬프트/출력 설정만 저장해도 자동 제목이 비활성화되고, 자동 제목 pending 중 저장하면 결과를 버린다. UI payload와 서버 저장 경로를 대조해 확인했다. 제목을 명시적으로 편집한 경우에만 전송하도록 보완하고, 일반 설정 저장·명시 제목 수정·설정 중 자동 제목 갱신의 경합을 시험한다.
- 판정: N10/N11은 위 보완 후 재판정한다. 기존 fixture 통과를 실제 API 계약 충족으로 대체하지 않는다. 앱 코드·API/DB·운영 서비스는 이번 점검에서 수정하지 않았다.

## 2026-10-01 N11 관리자·진입 UI — 구현·브라우저 fixture 인수 완료

- 환경: Windows / Node 24.19.0 / Next.js 16.2.10 production build / 기존 번들 Playwright+headless Edge. 별도 Web 프로세스와 임의 loopback port의 HTTP fixture를 사용했다. 운영 서비스·DB·실 Provider 자격증명을 사용하지 않았으며 패키지/lockfile/API/DB schema 변경은 없다.
- 구현: 고정 관리자 5개 메뉴, 커스텀/로컬 Provider 등록·수정·수동 모델·세 단계 진단·비용 확인, 자동 제목 설정, 보고된 토큰/최근 대화·요약·제목·미보고 구분, 로그인/TOTP/조건부 게스트 진입. 기존 사용자/권한/요약/파일/로그 API를 재사용했다. 사용자·로그 dialog 접근성과 최신 로그 요청 보호, 게스트 파일 첨부 허용 및 파일 설정 미조회 표시도 보완했다.

| 검사 | 직접 실행 결과/한계 |
| --- | --- |
| Web 회귀 | 8개 파일·31개 통과. N10 GET/SSE·Markdown·model/pagination/navigation 회귀 유지 |
| 정적/빌드 | Web typecheck, production build, Web 전체 eslint 0 error, git diff --check 통과 |
| 실제 Edge HTTP | n11-browser.mjs 최종 통과. HTTP 요청 160건, 캡처 61개. pageerror/외부 요청/CSP violation 0건 |
| 진입/권한 화면 | 로그인 오류의 안전 메시지, 사용자→관리자 전환 시 비밀번호 초기화, 관리자 TOTP, 로그아웃, 게스트 비활성 시 form 비노출, 사용자/게스트 chat 분리. 일반 사용자 새로고침에서 관리자 API 호출 증가 0건. 서버 guard의 실제 권한 인수는 기존 N07/N09 기록 및 N13과 구분 |
| Provider | 로컬 승인 IP/포트·none 생성, 목록 주소 비노출, 수정과 키 입력 제거, 수동 모델, network 성공/models HTTP 422 실패/chat 성공, 비용 확인 취소 시 호출 0건·명시 실행 후 호출, 목록 조회 실패 후 재조회 |
| 설정 | 제목 HTTP 409 실패 시 초안 보존·재저장 성공, 요약 모델 저장, 보관 일수 저장, 게스트 첨부 허용 해제 저장. 요청 payload를 fixture가 확인하며 비밀 payload를 결과 artifact에 기록하지 않음 |
| dialog/탐색 | 사용자 정보 저장, 비밀번호 dialog Tab 10회 내부 순환·Escape 후 호출 버튼 복귀, 로그 상세 Escape. 메뉴별 사용자·권한·로그·서버 표/폼 렌더링 |
| 반응형/시각 | light/dark × 320/390/768/1024/1440px의 진입+5개 관리자 화면 60개, 720×500px의 200% 상당 reflow 1개. 모든 캡처에서 document 가로 넘침 0. 대표 390px 진입/Provider, 1440px 서버, 720px 로그 화면을 직접 이미지 검토. 테마 조작이 폼에 겹치던 문제와 모바일 checkbox/720px 로그 고정 열 넘침을 수정 |

재현: 저장소 root에서 아래 명령을 실행한다. 설치된 Edge와 기존 Playwright module 경로가 전제이며 의존성 설치 명령이 아니다.

~~~powershell
pnpm --filter @modelnaru/web test
pnpm --filter @modelnaru/web typecheck
pnpm --filter @modelnaru/web build
pnpm exec eslint apps/web/app apps/web/proxy.ts apps/web/test --max-warnings=0
$env:MODELNARU_BROWSER_MODULE = 'C:/Users/Jae/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
node apps/web/test/n11-browser.mjs
~~~

- 증거: tmp/n11/result.json, next.log, PNG 61개(ignored). runner finally에서 browser/fixture HTTP/Next를 정리했다. 최종 Win32_Process 조회에서 n11-browser 및 이 작업 폴더의 Next start 프로세스 0개를 확인했다. 이번 작업에는 DB 컨테이너·SSH 터널이 필요하지 않았다.
- 미검증 경계: 실제 API+PostgreSQL+HTTPS에 연결한 브라우저 전체 인수, 실제 Provider/TOTP 인증 검증/로컬 엔진·운영 로그 export 데이터·실기기 키보드/음성 screen reader는 N13이다. 720px reflow는 OS/브라우저 메뉴를 조작한 실제 200% 확대와 다르다. fixture 화면 시험을 서버 권한·DB 경합 증거로 대체하지 않는다. 설치/복구/업데이트와 운영 전환은 N12~N14이며 이번에 실행하지 않았다.

## 2026-10-01 N10 공통·채팅 UI — 구현·브라우저 fixture 인수 완료

- 환경/범위: Windows Node 24, Next.js 16 production build, 기존 번들 Playwright와 headless Microsoft Edge. `n10-browser.mjs`가 별도 Next 프로세스와 loopback HTTP API fixture를 임의 포트에서 시작하고 실제 브라우저 fetch/SSE를 연결한다. 운영 DB/서비스·실제 Provider·자격증명은 사용하지 않았다. 이번 단계는 실제 API+PostgreSQL을 다시 실행한 결과가 아니며 N09의 서버 검증과 N13 전체 통합 인수를 구분한다. 의존성/lockfile 변경은 없다.
- 코드: 이전 동기 생성 SSE에서 job 시작/GET/구독/취소로 전환했다. job/API/Markdown/model picker/dialog를 분리하고 매트 테마, 탐색·즐겨찾기·CAS 설정·첨부 상태·초안·오류 복구와 nonce CSP를 구현했다. 브라우저 검증 중 발견한 모바일 포커스 이탈, 이전 CSS의 작성창 하단 공백/본문 축소/목록 버튼 가림/오류 버튼 클릭 차단을 수정했다.

| 검사 | 실행 증거 |
| --- | --- |
| Web 단위/회귀 | `pnpm --filter @modelnaru/web test`: 8개 파일·31개 통과. 기존 model selection/message pagination/branch navigation/scroll/latest request/parameter 시험과 신규 GET+SSE 중복 제거·Unicode·terminal·revision 틈 복구·직렬화 overflow·세션 만료·abort·bigint revision, Markdown/XSS/unsafe URL·미완성 fence·큰 본문 포함 |
| 브라우저 작업 수명 | 실제 production UI→loopback HTTP/SSE. 새 질문 2건과 명시 재생성 1건, 구독 6회, 명시 취소 1회. 생성 중 새로고침에서 같은 job 발견, 대화 전환 취소 0회, 연결 강제 종료 후 GET/SSE 본문 중복·누락 없이 복원. 다른 대화를 보는 동안 끝난 재생성의 목록 완료 표시와 본문 복원 확인 |
| 시작 응답 불명 | fixture가 job을 만든 뒤 게이트웨이 502를 반환. UI의 같은 요청 확인으로 동일 key/body 재사용, 생성 수 증가 없음. 새로운 자동 생성 POST를 보내지 않음 |
| 탐색·입력·설정 | 제목 검색, 대화별 초안 복원, IME composing Enter·Shift+Enter 무전송, 모델 검색/즉시 저장·즐겨찾기, 고정/이름 변경 실제 조작, 미적용 설정 계속 편집, stale 409에서 서버 값·초안 보존 후 재적용, code Clipboard 복사 확인 |
| 첨부·오류 | 실제 브라우저 raw text upload, failed 첨부의 전송 비활성·명시 retry→ready, quota/주체 동시성/서버 혼잡의 구분 안내·초안 보존, 세션 만료 안내, 허용 모델 없음 입력 비활성 확인 |
| 보안 | raw script/SVG/event handler는 text로 표시, 위험 scheme link 차단, 외부 Markdown image 요청 0건, CSP 위반 0건·pageerror 0건. 문서마다 CSP nonce 변경 확인. 복사는 표시 code text만 사용 |
| 화면/접근성 | 다크·라이트 각각 320/390/768/1024/1440px에서 가로 넘침 없음과 작성창 하단 배치 측정. 각 폭의 채팅/설정, 720×500의 200% 확대에 해당하는 CSS viewport 재배치, 390×450의 키보드 축소 화면 등 PNG 22개. 모바일 Tab 35회 sheet 내부 순환, 중첩 전송 기록 닫기, Esc와 열기 버튼 focus 복귀 확인 |
| 대비 | 라이트/다크 본문 14.37/15.17:1, 보조 글자 4.89/6.46:1, 주요 버튼 6.88/7.55:1, 입력 경계 3.01/3.64:1. 토큰 조합을 실제 computed style로 읽어 텍스트 4.5·비텍스트 3 기준과 비교 |
| 정적/빌드 | Web typecheck, production build, `pnpm exec eslint apps/web/app apps/web/proxy.ts apps/web/test --max-warnings=0` 통과. 신규 JS browser runner는 해당 파일만 JS lint로 등록했으며 기존 TypeScript 규칙을 완화하지 않음 |

재현(저장소 root): 기존 의존성이 준비된 상태에서 `pnpm --filter @modelnaru/web build` 후, PowerShell의 `MODELNARU_BROWSER_MODULE` 환경 변수에 설치된 `playwright/index.mjs` 절대 경로를 지정하고 `node apps/web/test/n10-browser.mjs`를 실행한다. 저장소 패키지 설치/버전 변경은 필요 없다. 이번에는 Codex workspace runtime의 Playwright와 설치된 Edge를 사용했다. runner는 고정 운영 포트/DB/계정에 연결하지 않는다.

결과 파일은 `tmp/n10/result.json`(최종 passed, fixture 요청 97회), `tmp/n10/*-settings.png`, 테마/폭별 PNG, `zoom-200.png`, `keyboard-viewport.png`다. tmp는 Git 제외이므로 재현 가능한 runner를 시험 원본으로 보존한다. finally에서 browser/context·fixture HTTP 연결·Next 프로세스를 정리했고 잔여 Next/runner 프로세스가 없음을 확인했다.

미검증/후속: 실제 API+PostgreSQL+HTTPS proxy를 한 경로로 묶은 전체 인수, 실제 Provider/OCR·Android/iOS 가상 키보드/한국어 IME 장치·음성 screen reader는 N13에서 수행한다. 200% 항목은 CSS viewport 축소에 의한 reflow 시험이며 물리 브라우저 메뉴 확대 시험과 구분한다. 관리자/로그인 화면의 새 구조와 그 브라우저 인수는 N11이다. 위 제한을 현재 브라우저 fixture 통과로 대체하지 않는다.

## 2026-10-01 N09-R1/R2 독립 재확인

- R1: upload/retry 공통 오류 매핑과 원래 저장 오류 보존을 확인했다. service/controller 회귀에서 OCR 불가·페이지 초과·암호 PDF·OCR 실패·추출문 초과·삭제의 status/code, 연결 종료 후 오류 보존, ready 저장 중 삭제를 확인했다.
- R2: PATCH 성공 및 stale CAS snapshot이 동일 transaction으로 attachActiveJobs를 호출함을 확인했다. pending/streaming 및 terminal 후 null을 검증하는 실DB/HTTP 회귀 소스를 검토했다.
- 직접 실행: API 42개 파일·208개 통과, 실DB 조건부 6개 제외. API typecheck 및 git diff --check 통과. 이번 재확인에서는 실DB·실제 OCR·외부 Provider·lint를 재실행하지 않았다. 아래 214개 전체 실행은 구현 담당자의 이전 기록이며 이번 직접 실행과 구분한다.
- 판정: 앞선 두 결함의 수정이 확인됐고 이번 수정 범위에서 추가 차단 결함을 발견하지 않았다. N09 완료·N10 착수 가능 판단을 유지한다. 앱 코드와 운영 서버 변경 없음.

## 2026-10-01 N09-R1/R2 보완 검증 — 완료

- 변경: upload/retry의 추출 오류 매핑을 AttachmentsService의 동일 함수로 통합했다. retry controller의 disconnect signal 전달을 제거하여 연결 종료가 실제 실패 원인을 덮어쓰지 않는다. PATCH 성공과 settingsRevision 충돌 snapshot은 conversation 행 잠금이 유지되는 동일 transaction에서 activeJob을 조회한다. schema·의존성·lockfile·Web UI·운영 서비스 변경은 없다.
- R1 회귀: `attachments.service.test.ts`는 실제 service와 controller를 연결하고 extractor 실패 fixture 및 응답 close 이벤트를 주입했다. OCR 불가 503/FILE_PDF_OCR_UNAVAILABLE, PDF 페이지 초과 413/FILE_PDF_PAGE_LIMIT, 암호 PDF 422, OCR 실패 422, 추출문 크기 초과 413, 삭제 404의 code/status와 failed 저장을 확인했다. ready 저장 중 삭제 및 예상하지 못한 저장 오류도 원래 오류를 보존한다. 이 오류 시험은 실제 HTTP 소켓이나 OCR 엔진 실행 시험이 아니다. 정상 원본 retry의 실제 HTTP 200은 기존 `providers-custom-http-postgres.test.ts`에서 다시 검증했다.
- R2 실DB 회귀: `n09-postgres.test.ts`에서 pending job 중 title/pin PATCH 성공·stale CAS snapshot의 job ID/status/revision과 최신 title/pin/settingsRevision을 확인했다. terminal 후 성공·충돌 응답은 activeJob=null이다. 별도 컴파일 API 프로세스·mock Provider를 사용하는 `providers-custom-http-postgres.test.ts`는 streaming 중 pin PATCH 200 및 stale PATCH 409의 활성 job snapshot과 완료 후 PATCH의 null을 실제 HTTP로 확인했다. 기존 자동 제목 시험도 유지했다.
- 실행 환경: Windows Node 24 작업 트리, mihoservice_server의 운영과 분리된 PostgreSQL 17 `modelnaru-n04-postgres-test`, `_test` DB와 loopback SSH 터널. 시험별 schema·임시 storage/config·API/mock은 finally에서 삭제한다. 운영 DB·서비스·실제 Provider 자격증명은 사용하지 않았다.
- 실행: 관련 DB/HTTP 두 파일·2개 통과. 최종 API build 후 `pnpm exec vitest run`(apps/api, 격리 DB 환경 변수 설정) **48개 파일·214개 통과, 제외 0개**. 조건부 실DB 시험 6개와 기존 HTTP/SSE·프로세스 재시작 회귀를 포함한다. API typecheck/build와 API src/test eslint 통과. 검증 중 불필요한 인자·fixture async lint 오류는 수정했고 최종 lint에서 0건이다.
- 제한: 실제 OCR binary 실행, 외부 Provider, 새 Web UI·브라우저 상태 인수, Docker 배포 인수는 이번 보완 범위 밖이며 N10/N13에서 검증한다. 두 응답 결함은 해결됐고 N09 완료·N10 착수 가능으로 판정한다. 아래 독립 점검과 이전 완료 기록은 보완 전 이력이다.
- 최종 확인/정리: fixture의 lint 수정 후 service/controller 회귀 12개와 API typecheck를 다시 통과했고 `git diff --check`도 통과했다. 테스트 컨테이너는 exited, 이번 SSH 터널 중지 후 35432 리스너 0개·임시 API 프로세스 0개를 확인했다. 기존 전용 테스트 volume은 보존했다.

## 2026-10-01 N08/N09 독립 점검 — N09 응답 보완 필요

- 범위: 자동 제목·컨텍스트 예산, 탐색/CAS/즐겨찾기/첨부 변경 경로와 시험을 검토했다. 코드 수정·운영 서버 변경은 하지 않았다.
- 직접 실행: 전체 API 42개 파일·200개 통과, 격리 PostgreSQL 조건부 6개 제외. API typecheck 통과. 이번에는 DB·실제 OCR·외부 Provider·lint를 재실행하지 않았으며 이전 206개 실DB 포함 결과와 구분한다.
- N09-R1 (P2): attachments.service.ts retry의 catch가 TaskQueueFull/연결 abort 이외의 모든 오류를 FileTypeUnsupportedError로 바꾼다. 기존 빌드의 service에 mock repository/extractor를 주입하여 PdfOcrUnavailableError, PdfPageLimitError, AttachmentNotFoundError가 모두 FileTypeUnsupportedError로 변하는 것을 확인했다(파일/DB/네트워크 없음). OCR 불가 503, 페이지 초과 413, 처리 중 삭제 404가 415로 잘못 응답한다. 최초 upload의 안전 오류 매핑을 재사용하고 조건부 finish 실패의 원래 오류도 보존해야 한다. 명시 재처리의 정상·OCR/크기/삭제 실패에 대해 controller HTTP status/code까지 검증한다.
- N09-R2 (P2): chats.repository.ts mapConversation은 activeJob을 null로 초기화한다. list/detail은 attachActiveJobs로 채우지만 locked의 conflict snapshot과 update의 성공 반환은 채우지 않는다. 활성 job 중 허용된 title/isPinned PATCH 및 stale revision 응답이 진행 작업을 없는 것으로 반환한다. 이는 소스 경로로 확인했고 이번 실DB 재현은 하지 않았다. 현재 transaction에서 실제 job metadata를 포함하도록 보완하고 활성 job 중 PATCH 성공·409 snapshot의 job ID/status/revision과 terminal 뒤 null을 검증한다.
- 판정: N08에 새 차단 결함은 확인하지 못했으나 N09는 위 두 응답 계약 보완 후 재판정한다. 기존 통과 시험을 삭제/완화하지 않고 회귀를 추가한다. N10 착수는 N09 보완 뒤로 둔다. 아래 완료 보고는 보완 전 실행 기록이다.

## N09 탐색·설정·첨부 API (2026-10-01 완료)

- 환경: Windows Node 24 작업 트리, 수정 빌드의 별도 로컬 API 프로세스·mock Provider, mihoservice_server의 운영과 분리된 PostgreSQL 17 전용 테스트 컨테이너. loopback SSH 터널과 `_test` DB 이름 보호 조건을 유지했다. 시험별 schema·임시 config/storage/API/mock을 finally에서 정리한다. 운영 DB/서비스·실제 Provider key는 사용하지 않았다.
- 구현/계약: `API_SPEC.md` N09의 검색·고정·keyset·revision CAS·모델 권한/파라미터 제거·즐겨찾기, `FILE_PROCESSING_SPEC.md` N09의 처리 상태/재처리·삭제/TTL 보호를 구현했다. schema/의존성/lockfile/Web UI/배포 명령은 바꾸지 않았다.

| 시험 | 새 검증 증거 |
| --- | --- |
| `n09-postgres.test.ts` | user/guest/타인 대화 격리, literal `%` 검색·고정 우선·같은 시각의 UUID cursor·owner/query 변경 cursor 거부, 동일 revision 동시 PATCH 1회만 성공·최신 충돌 snapshot, 모델 변경 disabled 파라미터 제거·권한 회수 선택 거부 |
| 같은 실DB 시험의 즐겨찾기 | PUT 중복 1행, 다른 주체의 즐겨찾기 격리, 권한 회수 뒤 selectable=false/추가 거부·삭제 허용, 게스트 삭제 cascade |
| 같은 실DB 시험의 첨부/설정 경합 | 실제 job 시작 후 설정/branch busy·수동 title 허용, 사용 중 삭제 busy·TTL cleanup 제외, terminal 뒤 cleanup, failed 동시 retry 1회만 processing, processing 조회·restart 정리·삭제 뒤 늦은 결과 미저장·타인 조회 거부 |
| `providers-custom-http-postgres.test.ts` 확장 | 실제 API의 revision 누락400·동시 PATCH 200/409·충돌 snapshot, 제목 검색/다음 cursor·잘못된 날짜/조건/중복 query400, 즐겨찾기 CSRF403·멱등204·모델 검색 isFavorite·삭제204 |
| 같은 HTTP 시험의 raw 첨부 | 실제 text bytes POST→201 ready, pending/개별 metadata 조회(내부 storageKey/extractedText 미노출), ready retry409·failed 원본 재처리200 |
| `attachments.service.test.ts` 추가/보완 | 원본 저장 processing→ready·추출문 metadata, 수신 완료 후 연결 신호가 끊겨도 추출/ready 저장 지속. 과대 raw 수신 제거와 이미지 payload 회귀도 유지 |
| 기존 N06~N08 시험 | 생성/SSE 재접속·API 프로세스 재시작·session/concurrency·quota·terminal 경합·Provider 목적지·요약/제목 회귀 유지 |

- 최종 실행: apps/api에서 전용 `MODELNARU_TEST_DATABASE_URL`을 비밀 출력 없이 설정한 뒤 `pnpm exec vitest run`. **2026-10-01 15:28:02 KST, 48개 파일·206개 시험 통과, 50.21초, 제외 0개**. PostgreSQL 조건부 6개를 모두 실행했다. root에서 `pnpm --filter @modelnaru/api typecheck`, `pnpm --filter @modelnaru/api build`, `pnpm exec eslint apps/api/src apps/api/test --max-warnings=0` 통과. 변경 파일은 Prettier 검사와 `git diff --check`로 확인한다.
- 발견/수정: cursor timestamp의 드라이버 직렬화에서 마이크로초가 잘려 다음 페이지가 누락되는 결함을 text bind→DB cast로 수정했다. policy가 조용히 제거한 disabled 파라미터의 removedParameters 누락도 수정했다. 첨부 pending 정적 경로가 metadata route에 가려지지 않도록 등록 순서를 정리했다. 새 DB fixture의 storage key 형식 및 model_favorites 컬럼명 오류를 교정했다. 검증 기준값을 완화하거나 시험을 제외하지 않았다.
- 미검증: 새 UI의 실제 브라우저 상태/접근성은 N10/N11, 실제 PDF/OCR 엔진·처리 중 브라우저 연결 해제 HTTP 인수·실 Provider/Docker는 N13, 운영 배포는 N12~N14다. 수신 완료 뒤 연결 독립성은 service 시험이고 실제 HTTP 강제 연결 해제 시험으로 주장하지 않는다. processing의 restart는 실제 DB 저장소 복구이며 파일 처리 중 강제 API 종료 전용 시험은 N13에 남긴다. 기존 UI는 아직 새 PATCH/branch revision과 pagination을 사용하지 않는다.
- 정리: 전용 PostgreSQL 컨테이너 `exited`, 이번 SSH 터널 listener 0개, 해당 임시 API 프로세스 0개를 확인했다. 시험별 schema·config/storage/mock은 finally에서 정리했고 전용 volume은 후속 시험 재사용을 위해 보존했다. `git diff --check` 및 N09 변경 파일의 Prettier 검사도 통과했다.
- 판정: N09 서버 API 완료. 새 UI 연결은 다음 N10이다.

## N08 컨텍스트·요약·자동 제목 (2026-10-01 완료)

- 적용: 새 job API의 N08 계약. `AI_INTEGRATION_SPEC.md` N02/N08의 예산, `CHAT_STATE_SPEC.md` N01/N08의 quota·보조 호출·제목 수명을 구현했다. 기존 동기 SSE는 입력 budget/요약 전 quota 검사를 보완한 호환 경로이며 새 공유 슬롯·자동 제목의 인수 대상이 아니다.
- 환경: Windows Node 24의 로컬 작업 트리, 별도 API 프로세스, mock Provider, `mihoservice_server`의 운영과 분리된 PostgreSQL 17 전용 테스트 컨테이너. DB는 loopback SSH 터널과 `_test` 이름 보호 조건을 사용하고 시험별 schema를 생성·삭제했다. 운영 DB·서비스·실 Provider 자격증명을 사용하지 않았다.

| 증거 | 확인 내용 |
| --- | --- |
| `apps/api/test/context-budget.test.ts` | UTF-8/JSON escaping overhead, unknown model fallback·출력 예약·안전 여유, 이미지 비용/누락 거부 |
| `apps/api/test/summarization.service.test.ts` | 호환 prefix 재사용, 메시지 경계 분할·직전 요약 전달, 최대 4회·출력 1024 제한, 초과 단일 message 무전송, 실패 부분 usage |
| `apps/api/test/title-generation.test.ts` | 입력 각 1000자·출력 64, 제목 제어문자/한 줄/Unicode 200자 정규화, shared slot 미확보 무전송, 실패 격리 |
| `apps/api/test/n08-postgres.test.ts` | 요약+본 생성 quota 1회, 한도 소진 시 요약 0회, 요약 실패/취소의 부분 usage·quota charged, 종료 job 요약 저장 거부, 수동 제목/삭제/session 폐기 후 늦은 결과 거부, 제목 task 1회·재시작 pending 정리 무재호출 |
| `apps/api/test/providers-custom-http-postgres.test.ts` | 수정 빌드의 실제 HTTP 관리자 제목 GET/PUT·일반 사용자 403, chat 완료 뒤 별도 title usage 1회 및 대화 GET의 auto/completed, 승인 사설 IP Provider transport·SSE 회귀 |
| 기존 `chat-jobs-postgres`, `chat-jobs-http-postgres`, `providers-custom-postgres` | N06 시작/terminal/quota 경합·SSE/재접속/프로세스 재시작·session/concurrency 및 N07 저장/목적지 회귀 |

- 실행(앱 폴더 `apps/api`): `pnpm typecheck`, `pnpm build`, `pnpm exec eslint src test --max-warnings=0` 통과. root에서는 `pnpm --filter @modelnaru/api typecheck/build` 및 `pnpm exec eslint apps/api/src apps/api/test --max-warnings=0`로 같은 검사를 실행했다. N08 수정 파일은 Prettier 적용 후 검사했다.
- 최종 시험: 테스트 전용 `MODELNARU_TEST_DATABASE_URL`을 비밀 출력 없이 설정하고 `pnpm exec vitest run` 실행. **2026-10-01 04:07:18 KST, 47개 파일·203개 시험 모두 통과, 52.27초, 제외 0개**. 그중 실제 PostgreSQL 조건부 5개가 모두 실행됐다. DB 미설정 실행은 198개 통과·5개 제외이며 위 최종 실행으로 제외 범위를 채웠다. 요약 가용성 진행 중 재검사 보완을 포함한 최종 소스로 실행했다.
- 보완 과정: 전체 회귀의 titleSource 기대값과 검증된 이미지 estimate가 빠진 fixture를 새 계약에 맞게 보완했다. mock Promise lint 표현식의 구문 오류도 수정 후 타입·전체 시험·lint를 다시 통과했다. 시험 삭제/skip/기대값 완화·패키지 변경은 없었다.
- 최종 종료 경합 보완: 위 실DB 실행 뒤 `TitleGenerationService`가 shutdown 이후 새 task를 시작하지 않도록 방어하고 unit 회귀 1개를 추가했다. **04:19:22 KST 로컬 전체 199개 통과·DB 조건부 5개 제외**, API typecheck/build/lint 재통과. DB/HTTP 로직은 변경하지 않았으므로 위 5개 실DB 증거를 유지하며 마지막 실행에서 재실행했다고 주장하지 않는다. 총 고유 시험은 204개다.
- 비밀/본문 로그: 설정 감사 기록의 필드를 모델 ID·version으로 제한하고 runner의 실패 로그는 고정 안전 메시지만 사용한다. 보조 입력/출력·upstream 오류 본문은 감사/서버 로그에 추가하지 않았다(코드 대조). 관리자 본문 표시와 실제 UI의 비노출은 N11 인수에 남는다.
- 미검증: 실제 Provider 자격증명·실모델 품질/비용·공인 HTTPS·Docker→실모델은 N13, 제목 설정/상태 브라우저 UI는 N11, 운영 배포는 N12~N14다. 보조 task의 restart 정리는 실제 DB repository로 시험했고 API 프로세스 실제 재시작 시험은 기존 N06 chat job 회귀다. 보조 호출 도중 강제 프로세스 종료 전용 HTTP 시험은 추가하지 않았으며 N13에서 인수한다.
- 정리: 테스트별 schema·임시 API/mock/config는 시험의 finally에서 정리됐다. 전용 PostgreSQL 컨테이너는 `exited`로 확인했고 이번 로컬 SSH 터널을 종료했다. 전용 volume은 후속 시험 재사용을 위해 보존했다. 단계 판정은 N08 완료이며 다음은 N09다.

## 2026-10-01 N07-R1/R2 독립 재확인

- 검토 범위: 앞서 재현한 두 결함의 수정과 회귀 시험을 대조했다. lookup의 all/single 반환 분기, HEAD/204/205 null body 및 변환 예외의 Promise rejection 처리를 확인했다. 기존 목적지 검증·IP 고정·TLS·redirect 제한을 유지한다.
- 직접 재실행: 전체 API 시험 40개 파일·190개 통과, 실DB 조건부 4개 제외. 도메인 실제 소켓 연결과 HEAD/204/205·잘못된 상태 코드 회귀 시험을 포함한다. API typecheck와 git diff --check도 통과했다.
- 판정: 이전 P1 두 건은 해결됐으며 이번 수정 범위에서 추가 차단 결함을 발견하지 않았다. N07 fixture 완료·N08 착수 가능 판단을 유지한다. 이번 재확인에서 실DB·외부 HTTPS·실제 키·Docker 네트워크·lint는 재실행하지 않았으며 이전 실행 기록과 구분한다. 앱 코드·서버 변경 없음.

## 2026-10-01 N07-R1/R2 transport 보완 결과 (완료)

- R1: 고정 IP lookup callback이 Node 기본 주소군 자동 선택의 `options.all` 요청에는 `{address,family}` 배열을, 단일 주소 요청에는 기존 address/family 인자를 반환하게 수정했다. IP 고정, 공개/사설 목적지 구분, TLS 원래 hostname 검증과 redirect 금지는 유지했다. 로컬 TCP 서버에 도메인 hostname으로 실제 `http.request`를 연결하고 Node 24가 `options.all=true`로 lookup을 호출했으며 고정 IP로 응답을 수신한 회귀 시험이 통과했다. 이 lookup 함수는 커스텀 HTTPS 요청에도 공통 사용된다. 실제 공인 HTTPS Provider 통신은 N13 미검증이다.
- R2: HEAD 또는 HTTP 204/205/304는 본문 없이 `Response`를 구성하고 원래 응답을 drain한다. 응답 변환에서 예외가 나면 Promise를 reject하며 Node response callback에서 처리되지 않은 예외가 나가지 않게 했다. 사설 IP에 바인딩한 실제 HTTP 서버에서 HEAD 200, **HEAD 204**, GET 204, GET 205와 `Response` 생성이 실패하는 600 상태를 시험했다. 모든 정상 무본문 응답은 null body이고 600은 처리된 rejection이었다.
- 검증: `apps/api/test/provider-destination.test.ts` 5개 통과. 전체 API 단위 시험 40개 파일·190개 통과(격리 DB 조건부 4개는 별도), API build/typecheck·저장소 lint 통과. 수정된 컴파일 API로 격리 PostgreSQL과 사설 IP mock Provider를 사용하는 `providers-custom-postgres.test.ts`·`providers-custom-http-postgres.test.ts` 2개를 다시 실행해 통과했다. 운영 DB·서비스·실제 Provider 자격증명은 사용하지 않았다. 시험용 API·mock 서버와 고유 schema는 시험 종료 시 제거했고 SSH 터널 PID 35712와 전용 컨테이너는 중지했다.
- 판정: N07 fixture 인수의 두 차단 결함을 해결했고 N08 착수 가능하다. 공인 HTTPS 실접속, 실제 자격증명, Docker→실제 로컬 모델 통신은 기존 계획대로 N13에 남는다.

## 2026-10-01 N07 독립 점검 — 당시 완료 판정 재개방 (위 보완으로 해결)

- 범위: N07 목적지 검증·공통 HTTP transport·관리자 연결 경로를 정적 검토하고 기존 API 시험과 두 최소 재현을 실행했다. 앱 코드는 수정하지 않았고 운영/시험 DB·실제 Provider 자격증명을 사용하지 않았다.
- 회귀: pnpm --filter @modelnaru/api test — 40개 파일·188개 통과, 실DB 조건부 4개 제외. 최초 sandbox node_modules EPERM 후 허용된 동일 명령 재실행 결과다. 이번 점검에서 실DB·typecheck·lint는 재실행하지 않았다.
- N07-R1 (P1): provider-destination.ts의 lookup callback이 options.all을 무시하고 단일 address/family를 반환한다. Node v24.19.0의 기본 주소군 자동 선택에서 도메인 요청은 주소 배열을 기대하여 ERR_INVALID_IP_ADDRESS: Invalid IP address: undefined로 실패한다. 현재 TypeScript 소스를 stripTypeScriptTypes로 읽고 DNS lookup만 공인 fixture 주소 한 개로 대체한 secureProviderFetch 호출에서 재현했다. 실제 원격 통신·키 없이 요청 생성 경로를 시험했다. 등록 DNS 검사 성공과 IP literal mock 시험은 이 경로를 검증하지 않는다.
- N07-R2 (P1): 응답 callback에서 HTTP 204에 ReadableStream을 넣어 new Response를 생성하면 TypeError가 발생한다. 실제 사설 IP의 일회성 로컬 HTTP 서버가 HEAD 204를 반환하도록 하고 원본 provider-destination.ts를 직접 import해 재현했다. 오류는 Promise rejection이 아니라 uncaughtException으로 발생했다: Response constructor: Invalid response status code 204. API에는 이를 처리하는 전역 handler가 없으므로 프로세스 종료 위험이다. 재현 프로세스/서버는 종료됐다.
- 수정·인수: R1은 lookup all/single 계약을 모두 지키며 검증 IP pinning을 유지한다. R2는 HEAD 및 204/205처럼 본문이 없는 응답을 올바르게 변환하고 응답 변환 오류를 Promise reject로 전달한다. 실제 transport 회귀 시험으로 두 결함을 재현 후 수정 통과시키고 기존 API 시험을 재실행한다. 목적지 허용 규칙·redirect 거부·TLS 검증은 완화하지 않는다.
- 판정: N07 수정 필요, N08 대기. 아래 N07 fixture 통과 기록은 당시 실행 증거로 보존하되 위 결함을 해결하기 전 현재 완료 근거로 사용하지 않는다. 공인 HTTPS/실제 키/Docker→실모델 인수는 여전히 N13에 남는다.

## 2026-10-01 N07 커스텀·로컬 Provider 인수 결과 (구현·fixture 검증 완료)

- 구현: OpenAI Chat Completions 호환 custom 연결의 관리자 등록·수정·목록, 암호화된 Bearer 또는 무인증, 모델 목록 동기화·수동 ID, network/models/chat 단계별 진단, 이미지 estimate 필드를 추가했다. 사용자 job과 요약은 같은 목적지 검증 경로를 쓴다. 요청마다 URL·A/AAAA·승인 IP를 검증하고 검증 IP로 새 socket을 열며 redirect를 거부한다. 제목 생성과 이미지 budget 적용은 N08에 남는다.
- 환경: 운영 DB·서비스·실제 자격증명 없이 `mihoservice_server`의 전용 PostgreSQL 17 테스트 컨테이너를 로컬 SSH 터널로 연결했다. 테스트는 loopback의 `_test` DB에만 접속하고 매 실행 고유 schema를 삭제한다. mock Provider는 Windows의 사설 IP에 바인딩했고 별도 컴파일 API 프로세스가 실제 HTTP 요청·SSE로 접속했다.
- 실행: `pnpm --filter @modelnaru/api build`, API `typecheck`, 저장소 `pnpm lint`, 전체 API 단위 시험 40개 파일·188개 시험 통과(환경 변수 없는 실행에서 조건부 DB 4개 제외). 격리 DB 환경에서 `pnpm exec vitest run test/providers-custom-postgres.test.ts test/providers-custom-http-postgres.test.ts test/chat-jobs-postgres.test.ts test/chat-jobs-http-postgres.test.ts`로 4개 파일·4개 시험 통과했다. 새 HTTP 시험은 등록·마스킹·관리자 권한·진단·수동/조회 모델·키/무인증·실제 job 생성·동기화 실패 보존·network redirect/metadata 거부·활성 job 변경 409를 확인한다. 목적지 단위 시험은 혼합/변경 DNS, IPv6·mapped·승인 규칙을 확인했다. 목록 조회 redirect 오류가 네트워크 오류로 바뀌던 경로를 수정하고 `provider-discovery.test.ts`의 오류 분류 회귀 시험을 추가했다. 수정된 빌드로 전체 단위 및 격리 DB 4개 시험을 다시 실행해 통과했다.
- 미검증: 실제 공인 HTTPS/외부 Provider 자격증명, Docker API 컨테이너에서 실 로컬 모델 엔진 접근, 브라우저 관리자 UI·운영 배포는 수행하지 않았다. N13·N11·N12에서 각각 인수한다. 제목·이미지 budget은 N08에서 구현·검증한다. 위 결과는 mock fixture와 별도 API 프로세스의 증거이지 실제 모델 연결 성공의 증거가 아니다.
- 종료 확인: 시험용 API 프로세스·mock 서버·임시 파일·고유 schema는 시험 `finally`에서 정리했다. 로컬 SSH 터널 PID 3964와 최종 재시험 PID 35576, 분리된 `modelnaru-n04-postgres-test` 컨테이너를 중지했다. 전용 테스트 volume은 후속 시험 재사용을 위해 보존했다. 마지막 전체 API 단위 시험 40개 파일·188개 통과, TypeScript 검사와 `git diff --check` 통과를 확인했다.

## 2026-10-01 N06 실제 HTTP/SSE 통합 재검증 (완료)

- 기존 증거와 공백: `apps/api/test/chat-jobs-postgres.test.ts`는 격리 PostgreSQL에서 저장소·서비스를 직접 호출하고 mock `fetch`를 사용했다. `apps/api/test/chat-jobs.test.ts`는 controller를 직접 호출하고 응답 객체를 흉내 냈다. 두 시험은 job transaction·조건부 terminal·quota·SSE frame 로직을 검증했지만, 별도 API 프로세스의 실제 HTTP/SSE 연결·연결 해제·재시작은 실행하지 않았다. 따라서 아래 시험을 추가했다.
- 환경·격리: `mihoservice_server`의 분리된 `modelnaru-n04-postgres-test` PostgreSQL 17 컨테이너를 서버 loopback 포트 35432와 로컬 SSH 터널로만 사용했다. 시험은 `MODELNARU_TEST_DATABASE_URL`이 loopback의 이름이 `_test`로 끝나는 DB인지 확인하고 실행마다 고유 schema를 만들어 제거한다. 로컬에서 컴파일한 API를 임시 config·secret 파일과 임의 포트로 별도 프로세스에서 실행했다. 공식 OpenAI 주소로 향하는 API 프로세스의 `fetch`만 시험 전용 preload에서 로컬 mock HTTP Provider로 전달하고, 다른 외부 `fetch`는 거부했다. 실제 Provider 자격증명·운영 DB·서비스는 사용하지 않았다.
- `apps/api/test/chat-jobs-http-postgres.test.ts` 1개 통과: 동시 동일 idempotency key의 HTTP POST 두 건이 같은 job을 반환하고 Provider 호출·job·quota 예약이 각각 1개였다. SSE socket을 끊은 뒤 mock Provider의 출력이 계속 진행되어 GET checkpoint에 저장됐고, 재접속 GET 본문과 SSE snapshot/revision·terminal을 합쳐 최종 본문을 누락·중복 없이 복원했다. 다른 대화의 같은 주체는 409, 별도 주체는 전역 slot 1개 설정에서 503으로 거부됐으며 추가 Provider 호출이 없었다. 완료/취소 경합 뒤 job·message·usage 상태와 본문/token, quota 상태를 실제 DB에서 대조했다. 생성 중 API 프로세스를 강제 종료하고 새 프로세스를 띄우자 `CHAT_SERVER_RESTARTED` 실패로 정리됐고 Provider 호출 수가 늘지 않았다. 시작 session을 폐기하자 실제 GET guard가 401을 반환하고 실행 중 job이 취소됐다.
- 실행 증거: API 빌드 `pnpm --filter @modelnaru/api build` 통과. API 폴더에서 `pnpm exec vitest run test/chat-jobs-http-postgres.test.ts test/chat-jobs-postgres.test.ts test/chat-jobs.test.ts` 최종 재실행 결과 **3개 파일·7개 시험 통과**(격리 DB URL은 환경변수로만 전달). API typecheck·신규 시험 lint도 통과했다. 초기 시험 하네스의 Windows ESM 경로와 `tsx` 직접 실행 시 Nest decorator 메타데이터 문제를 수정해 컴파일 산출물로 최종 실행했다. 앱 소스 결함은 발견되지 않았다.
- 정리: 시험용 API 자식 프로세스·로컬 mock HTTP 서버·임시 config/secret 디렉터리와 고유 PostgreSQL schema는 시험의 `finally`에서 제거했다. 로컬 SSH 터널 PID 30740을 중지했고 전용 `modelnaru-n04-postgres-test` 컨테이너를 중지했다. 테스트 컨테이너와 전용 volume은 후속 격리 시험 재사용을 위해 남겼다.
- 범위: 실제 브라우저 UI와 리버스 프록시를 통한 동작, 외부 Provider 실통신, 운영 배포는 이 시험에 포함하지 않았다. 각각 N10/N13/N12~N14에서 검증한다.

## 2026-10-01 N06 지속 생성·quota 인수 결과 (완료)

- 구현: `POST /api/conversations/:id/jobs`, 재생성 job 시작, job GET/SSE/중지와 대화 `activeJob`·assistant `jobId`를 연결했다. 시작은 주체 잠금 아래 메시지·quota·job·첨부 사용 참조를 한 transaction으로 commit한다. 동일 key는 기존 job을 반환하며, 상이 입력·활성 작업·slot 부족·stale 설정·quota 초과는 부작용 없이 거부한다. 생성은 HTTP 연결과 분리했고 완료/취소는 한 terminal transaction의 조건부 갱신으로 결정한다. 재시작은 checkpoint를 `CHAT_SERVER_RESTARTED`로 정리하며 유료 요청을 재호출하지 않는다. 요약 Provider 전송 직전에 예약을 차감해, 재사용 요약만 한 경우에는 미전송 예약을 해제한다.
- 격리 DB: `mihoservice_server`의 기존 `modelnaru-n04-postgres-test` 컨테이너(`postgres:17-alpine`, 전용 volume/계정/DB, 서버 loopback 포트 35432)를 시작해 로컬 SSH 터널로 연결했다. `apps/api/test/chat-jobs-postgres.test.ts`는 `MODELNARU_TEST_DATABASE_URL`이 `localhost`의 `*_test` DB일 때만 실행하고, 각 실행에서 고유 schema를 생성·제거한다. 실제 값은 출력·문서에 기록하지 않았다. 운영 컨테이너·DB·volume에는 연결하거나 변경하지 않았다.
- 실제 DB+mock Provider 통과: 같은 key 동시 시작에서 job/메시지/quota/upstream 1회, 다른 fingerprint·주체 소유권 거부, 전역 slot 부족·stale 설정·quota 초과 무부작용, 완료/취소 선착순의 message/job/usage 일치, 미전송 quota 해제와 이미 전송한 quota 유지, 재시작 `failed` 복구, 새 session의 `activeJob`→job GET/구독·assistant `jobId`, 정상 SSE terminal, 재생성 branch 성공 시 활성화, 8 MiB checkpoint/message/GET 본문 일치, 시작 session 폐기 시 작업 취소, 7일 지난 terminal job 삭제 후 message `jobId=null`을 검증했다. 시험 파일 1개·실DB 시험 1개 통과.
- SSE·API 단위 시험: 제어문자 JSON escape를 포함한 완성 frame을 최소 64 KiB pending 설정에서 32 KiB 이하로 분할, listener 등록 후 snapshot revision 이하 중복 제거, 순차 append/terminal 전달, 느린 구독자만 buffer 상한에서 종료, job 공개 응답에서 시작 session ID 제외, quota 거부의 `429`·`scope`·`resetAt` 응답을 확인했다. `apps/api/test/chat-jobs.test.ts` 5개 통과. 전체 `pnpm test`에서 240개 통과·2개 조건부 제외(API 184개 통과·실DB 조건부 1개 제외), `pnpm typecheck`, `pnpm lint`, `git diff --check` 통과. 조건부 실DB 1개는 위 별도 실행에서 통과했다. 기존 브라우저 UI의 동기 SSE 경로는 N10 전환 전 현행 버전 호환으로 남아 있으며 새 job API 인수와 별개다.
- 시험 종료: 로컬 SSH 터널과 격리 테스트 컨테이너만 중지했다. 컨테이너·전용 volume·계정의 환경 파일은 N07 이후 재사용을 위해 보존했다.
- 범위: Provider 응답은 mock fixture이며 실제 자격증명/외부 Provider 통신은 N07/N13에서 검증한다. 새 Web UI, N09 설정 PATCH 전체 계약·탐색, N12 배포·운영 적용은 후속 단계다.

## 2026-09-30 N06 착수 기록 (당시 부분 구현, 최신 결과는 위 2026-10-01 절)

- `chat-execution.service.ts`가 Provider parser에 작업별 `maximumGeneratedTextBytes`를 전달할 수 있게 하고, Provider가 전달한 부분 `inputTokens`/`outputTokens`를 실패·취소 처리까지 유지하도록 했다. `chat-messages.repository.ts`의 실패/취소 message·usage event 갱신은 해당 token과 `usage_known`을 함께 저장한다. 아직 새 job의 config snapshot에서 이 입력을 전달하는 경로는 없다.
- `chat-messages.repository.ts`의 새 질문·재생성 시작과 `access.repository.ts`의 quota 예약을 외부 DB transaction에서 호출할 수 있게 했다. 시작 잠금 안에서 선택적 `settingsRevision`을 검사한다. 같은 transaction으로 job·quota reservation·message를 생성하는 새 서비스/API는 아직 없다.
- 검증: 로컬 API 38 file·179 test 통과, API typecheck·전체 lint·`git diff --check` 통과. 부분 usage의 실행부 전달은 mock Provider 단위 시험으로 확인했다. 외부 transaction·quota 경합·실제 DB 영속화 시험은 N06 job 시작 경로 완성 뒤 격리 PostgreSQL에서 수행해야 한다. 운영 서버·DB는 변경하지 않았다.

## 2026-09-30 N05 Provider parser 인수 결과 (fixture 완료)

- 변경: `apps/api/src/chat-streaming.ts`에서 OpenAI `stop`+`[DONE]`, Anthropic 정상 `stop_reason`+`message_stop`, Gemini `STOP`+EOF만 `done`으로 확정한다. 내부 오류·거부·길이 초과·불완전 종료·빈 답변을 분리하고 정상 종료 전 `done`을 내보내지 않는다. `normalizeProviderStreamEvent`는 text/usage만 정규화한다.
- byte/시간: UTF-8/SSE 분할 조립, 불완전 UTF-8·SSE 거부, 1 MiB event·64 MiB upstream·32 MiB serialized request·설정 가능한 생성 본문 byte 상한(기본 2 MiB, 절대 최대 8 MiB), header 30초·idle·총 30분 제한을 parser에 넣었다. 취소와 timeout을 구분하고 오류 본문은 사용자 오류 객체에 전달하지 않는다.
- 검증: `apps/api/test/chat-streaming.test.ts`의 OpenAI/Anthropic/Gemini 정상·1 byte 분할·EOF·오류·거부·길이·빈 usage fixture, 공통 HTTP/JSON/UTF-8/SSE/byte·취소/timeout 경계. 로컬 `pnpm --filter @modelnaru/api test`: 38 file·178 test 통과. `pnpm --filter @modelnaru/api typecheck`, `pnpm lint`, 변경 TypeScript Prettier와 `git diff --check` 통과.
- 당시 범위: mock Provider fixture 결과다. 실제 credential·커스텀 endpoint/로컬 모델 연결은 N07/N13에서 별도 검증한다. 이 시점에는 N06 job의 config snapshot 전달과 실패/취소 usage DB 보존, 작업 총 수명/구독이 연결되지 않았다. 이후 구현·검증 결과는 문서 상단 N06 절을 따른다.

## 2026-09-30 N04 격리 PostgreSQL 인수 결과 (완료)

- 환경: `mihoservice_server`의 운영 `modelnaru-postgres-1`과 분리된 `modelnaru-n04-postgres-test` 컨테이너. 동일한 로컬 이미지 `postgres:17-alpine`, 전용 계정·DB `n04_runner/modelnaru_test`, 전용 volume `modelnaru_n04_test_data`, 서버 `127.0.0.1:35432`에만 publish했다. CPU 1개·메모리 768 MiB·PID 128개·자동 재시작 없음으로 제한했다. 로컬 작업 폴더에서 SSH 터널 `127.0.0.1:35432`로 접속했으며 미커밋 코드를 서버에 복사하지 않았다. 비밀번호 값은 출력·문서에 기록하지 않았다.
- `MODELNARU_TEST_DATABASE_URL`을 로컬 `postgresql://...@127.0.0.1:35432/modelnaru_test`로 지정해 저장소 root에서 `pnpm --filter @modelnaru/database test`를 실행했다. 2개 test file·22개 시험 모두 통과(실DB 시험 포함). 기존 `0001`~`0019` 적용 후 내장 Provider 행을 넣고 `0020`을 적용했으며, 재실행 checksum, builtin 변환, local 승인 포트, 수동 모델 중복/이미지 추정값, 활성 job 및 같은 key의 두 연결 동시 INSERT, branch FK, quota 예약 1회 해제·중복 key, assistant/checkpoint 8 MiB byte 경계, terminal 조건부 갱신, 수동 제목 우선, 대화 삭제 cascade를 실제 DB에서 확인했다.
- 변경한 config/database를 빌드하고 실제 `packages/database/dist/migrate.js` runner를 같은 테스트 DB에 두 번 실행했다. 첫 실행은 `0001`~`0020` 적용, 두 번째는 `Database migrations are up to date.`였다. `schema_migrations`는 20건이며 임시 `n04_` schema 잔여 0개를 확인했다. 첫 5초 제한 시간 초과가 남긴 고유 시험 schema는 테스트 DB에서만 제거했고, 통합 시험 제한을 120초로 조정해 재검증했다.
- 추가 검사: config v2 경계값 15개 통과·Windows 조건부 1개 제외, 전체 `pnpm test` 206개 통과·2개 제외(실DB 연결 전 결과), 최종 `pnpm typecheck`·`pnpm lint`·변경 파일 Prettier·`git diff --check` 통과. 실제 DB 시험은 위 별도 실행 결과가 최신 근거다.
- 시험 후 SSH 터널과 테스트 컨테이너를 중지했다. 컨테이너·전용 volume·서버 계정의 `~/.modelnaru-n04-test/pg.env`(0600)는 N06 후속 시험 재사용을 위해 보존했다. 재사용 시 서버에서 `docker start modelnaru-n04-postgres-test` 후 로컬에서 `ssh -N -L 127.0.0.1:35432:127.0.0.1:35432 mihoservice_server`로 터널을 열고 테스트 URL은 로컬 환경변수에만 둔다. 운영 DB·volume·컨테이너·서비스에는 변경을 가하지 않았다. 실제 API job 동작·Provider 실통신·앱 배포 시험은 N05~N13에 남는다.

## 2026-09-30 N04 schema·config 구현 중 (실DB 시험 전 기록)

- 변경: `packages/database/migrations/0020_n04_foundation.sql`에 Provider custom/local 필드·제약, job/idempotency/활성 partial unique, quota 예약, 제목·최근 모델·즐겨찾기, 대화 revision/고정, 첨부 사용 job, usage 연결, assistant 8 MiB byte CHECK를 추가했다. 기존 `0001`~`0019`는 변경하지 않았다. `packages/config/src/schema.ts`와 `config.example.yaml`은 v2·주체당 활성 1·출력/SSE 상한으로 변경했고 CLI `init`도 v2를 생성하도록 맞췄다.
- 실행 위치: 저장소 root. `pnpm --filter @modelnaru/config test` 15 통과·Windows 조건부 1 제외. `pnpm --filter @modelnaru/database test` 21 통과·실DB 시험 1 제외. `pnpm typecheck`, `pnpm lint`, `pnpm test` 통과(`pnpm test`: 206 통과·2 제외). 처음 샌드박스 실행에서는 기존 Vitest 파일을 읽지 못해 EPERM이 났고, 승인된 동일 명령 실행에서는 통과했다. 신규 SQL 실행 성공을 뜻하지 않는다.
- 실DB 시험 파일: `packages/database/test/n04-postgres.test.ts`. 로컬 `*_test` 데이터베이스에만 연결하며 고유 schema를 생성/삭제한다. `MODELNARU_TEST_DATABASE_URL`을 지정한 뒤 저장소 root에서 `pnpm --filter @modelnaru/database test`를 실행한다. 기존 `0001`~`0019` 후 내장 Provider fixture를 넣고 `0020`을 적용하여 기존 행 변환·custom 목적지 제약·job 활성/중복 key·quota key·terminal 조건부 갱신·cascade·migration 재실행을 확인하도록 작성했다.
- 미검증: 현재 로컬에는 Docker·`psql`·PostgreSQL·WSL 배포가 없고 운영 서버 DB를 시험 대상으로 쓰지 않았다. 따라서 격리 DB migration 실행, FK/제약·경합과 재실행은 아직 검증되지 않았다. N04는 구현 중이며 N05 착수 조건을 충족하지 않았다. 실DB 시험 통과 뒤 결함을 수정하고 완료 판정한다.

## 2026-09-30 N03 종료·N04 문서 인계

- 판정: 최종 매트 방향·단일 보라 강조색 승인, 아래 8종 통합 시각 검토, 사용자 N04 후속 진행·문서 정리 요청을 근거로 N03 완료. N04는 착수 가능·미착수다(ADR-037).
- 적용 기준: WEB_UI_SPEC.md 상단과 design/n03-preview.html. 아래 글로우·리퀴드·반투명 및 검토 대기 기록은 각 시점의 이력이며 최종 디자인이나 현재 차단 조건이 아니다.
- 이번 변경: UI 명세·결정·상태·계획·인계를 정렬했다. 검증: 코드 블록의 예시를 제외한 root Markdown 로컬 링크 164개가 모두 존재하며, 현재 단계 참조를 대조했고 git diff --check를 통과했다. 앱 코드·DB·서버 변경 및 새 기능 시험은 수행하지 않았다.
- 남은 인수: N04 실제 PostgreSQL/config, N10/N11 실제 앱 접근성·모바일/키보드·네트워크·API 동작, N13 통합 시험. 정적 시안 완료가 기능 구현 완료를 뜻하지 않는다.

## 2026-09-30 매트 디자인 8종 통합

- 사용자 승인된 매트 방향과 단일 보라 강조색을 라이트·모바일·관리자·로그인·모델/첨부·오류 시안에 확장했다. 관리자/로그인 갤러리는 전체 폭, 관리자 목록은 행 구분선, 사용량은 한 묶음 지표, 라이트 답변 일정은 실제 table로 표현한다. 문자 조작 아이콘을 SVG로 교체하고 disabled 모델 버튼에 테마 글자색을 명시했다.
- 실제 브라우저에서 8종의 전체 렌더링과 390px 모바일 렌더링을 확인했다. section 8개·disabled 버튼 5개를 보존했다. 390px/320px에서 document scrollWidth는 각각 375px/305px로 가로 넘침이 없었다. viewport override는 해제했다. `git diff --check` 통과. 확장본 사용자 검토와 실제 앱의 기능·접근성·성능 인수는 별개다.

## 2026-09-30 매트 채팅 재설계 시각 검토

- 01번을 완료된 답변 예시로 다시 구성했다. 제목/본문 계층, 읽기 영역, 사이드바, inline SVG 조작 아이콘, 단일 작성창을 재설계했다. 다크 공통 표면의 반투명/리퀴드 효과는 제거했다. 02~08은 이전 기능/상태 참고 시안이다.
- 브라우저에서 01번 새 배치와 390px 전체 렌더링을 확인했다. 390px에서 문서 scrollWidth 375px, section 8개를 확인했고 임시 viewport를 해제했다. 실제 API·키보드 전 동선·화면 읽기·성능 인수는 수행하지 않았다. 새 시각 기준은 사용자 검토 중이며 이전 디자인의 승인/검증을 그대로 승계하지 않는다.

## 2026-09-30 리퀴드 변형 검토

- 사용자 요청에 따라 이전 작성창·버튼·상태 점 글로우 CSS를 제거했다. 다크 작성창과 패널에 무채색 반사 그라데이션·안쪽 가장자리 하이라이트·검은 접촉 그림자를 적용하고 브라우저 새로고침 후 시각 확인했다. 작성창 반경은 20px이며 포커스는 회색 outline이다. 실제 굴절이나 글자 왜곡은 구현하지 않았다. 사용자 검토 중인 정적 시안이며 이전 글로우 시험 기록은 과거 변형의 결과다.

## 2026-09-30 다크 글로우 변형 검토

- 정적 시안에 작성창 focus-within 보라 글로우, 작성창 활성 주요 버튼의 hover/focus 광채, 생성 상태 점의 작은 녹색 빛, 패널 상단 흰색 하이라이트를 적용했다. disabled 버튼은 광채 대상에서 제외하며 reduced-motion에서는 전환을 제거한다.
- 실제 브라우저에서 작성창을 클릭해 포커스와 보라 테두리/광채, 차콜 바탕 및 작은 상태 점을 확인했다. 앱 구현·최종 디자인 승인은 아니며 이 변경은 WEB_UI_SPEC.md의 사용자 검토 중 제안을 따른다.

## 2026-09-30 다크 무채색·반투명 변형 시안

- 사용자 요청으로 HTML 다크 토큰을 무채색 차콜·반투명 회색으로 변경했다. 기존 8종 화면 구조와 라이트 테마는 유지했다. WEB_UI_SPEC.md 상단에 승인 전 제안으로 기록했다.
- 실제 미리보기 브라우저에서 차콜 바탕·회색 선택 행·패널과 보라 주요 버튼을 시각 확인했다. 이번 검토는 정적 시안의 색상 변경 확인이며 실제 앱 접근성·성능 검증이나 최종 디자인 승인이 아니다.

## 2026-09-30 N03 후속 독립 재확인

- 서버 재시작 없이 현재 파일과 HTTP 응답을 대조했다. 모두 17,992 byte이며 바이트 단위로 일치한다. SHA-256은 `F191E5B455727D1B13F606414964839047F351EF825510FD3D052B07D95FB88D`다.
- 새로고침 후 브라우저에서 section 8개·disabled 버튼 5개, 모델/첨부 및 오류 상태 gallery를 확인했다. 390px에서 문서 scrollWidth 375px, 모바일 작성창 아래 여백 약 14.8px다. 320px/1440px에서도 scrollWidth는 각각 305px/1425px로 문서 가로 넘침이 없다. 모바일 전체 렌더링에서 관리자·로그인 한 열 배치와 상태 표현을 확인했다. 임시 viewport 설정은 해제했다.
- 판정: 이전의 파일/서버 불일치, 누락 상태 시안, 모바일 작성창 하단 배치와 문서 가로 넘침 지적은 이번 수정본에서 해결됐다. N03 정적 시안 검토 관점에서 추가 차단 사항은 발견하지 못했다. 사용자 디자인 승인과 실제 앱 N10/N11의 상호작용·접근성 인수는 별개다. 앱 코드·서버 배포는 변경하지 않았다.

## 2026-09-30 N03 시안 재복원·실제 렌더링 재검토

- 20:44:06.821에 `design/n03-preview.html`이 이전 13,138 byte·SHA-256 `244C3BBC38FB905484757DF587F621A177412BEB4751BF4DB97D415F1F32334C`로 다시 기록된 것을 확인했다. 이 작업의 하위 에이전트는 없고, 앱의 같은 작업 폴더를 사용하는 다른 채팅은 조회 시 idle이었다. 저장소 검색에서 시안 파일을 쓰는 스크립트는 찾지 못했다. 당시 파일 기록 시각과 새 미리보기 서버 시작 시각(20:49:09)이 달라 덮어쓴 주체는 확정할 수 없다.
- 8종 시안을 다시 저장했다. 현재 파일은 17,992 byte·SHA-256 `F191E5B455727D1B13F606414964839047F351EF825510FD3D052B07D95FB88D`로 이전 복원본과 바이트 단위로 일치한다. 서버를 재시작하지 않고 HTTP 응답이 8종·17,992 byte로 바뀐 것을 확인해, 현재 서버는 최신 파일을 읽고 있음을 확인했다.
- 실제 브라우저에서 8종 및 모바일 버튼 비활성을 확인했다. 390px viewport: `documentElement.scrollWidth=375px`, 화면 오른쪽 경계를 넘는 요소 0개, 모바일 specimen 하단과 작성창 하단 사이 약 15px. 320px: `scrollWidth=305px`, 넘침 요소 0개. 1024px: `scrollWidth=1009px`, section 8개. 390px 전체 화면에서 관리자·로그인 한 열 배치, 상태 카드, 다크/라이트 색상과 주요 문구를 시각 검토했다. 브라우저 viewport override는 검토 후 해제했다.
- 판정: 시안의 이번 복원본에 대한 기본 반응형·시각 검토는 통과했다. 반복된 파일 덮어쓰기 원인은 미확정이며 사용자 재확인 전까지 N03은 부분 완료, N04는 대기한다. 실제 앱의 키보드·화면 읽기·가상 키보드·200% 확대 인수는 N10/N11에서 별도 수행한다.

## 2026-09-30 N03 시안 첫 복원·반응형 수정 (이전 서버 응답 기록)

- `design/n03-preview.html`을 기본 6종과 상태 gallery 2종, 총 8개 section으로 복원했다. 모델 검색·Provider 필터·즐겨찾기·긴 이름, 첨부 처리·실패, 빈/로딩·부분 실패·권한/세션·혼잡·미적용 설정을 포함한다. 모바일 복구 화면의 모델 변경·전송 버튼은 실제 `disabled` 속성으로 비활성화했다.
- 모바일 `.main`에 최소 높이를 주고 작성창을 하단으로 밀었다. 700px 이하에서는 데스크톱 시안의 사이드바를 숨기고 설정 패널을 본문 아래로 옮기며, 관리자와 로그인 시안은 한 열을 사용한다. 목록 행과 작성창 버튼은 줄바꿈을 허용한다.
- 파일 정적 검사: 17,992 byte, SHA-256 `F191E5B455727D1B13F606414964839047F351EF825510FD3D052B07D95FB88D`, section/caption 각각 8개, `disabled` 버튼 5개, HTML 컨테이너 닫힘 오류 0개. `git diff --check` 통과. 기존 작업 중인 다른 문서 변경은 보존했다.
- 미리보기 `http://127.0.0.1:8763/`는 새로고침 및 직접 HTTP 조회에서 계속 13,138 byte·section 6개를 응답했다(`Cache-Control: no-store`). 2026-09-30 19:48 시작한 Node 서버가 이전 HTML을 메모리에 보관한 것으로 추정한다. 서버 응답과 현재 파일이 다르므로 수정된 화면의 390px overflow·하단 위치·겹침·대비는 아직 브라우저에서 검증하지 못했다. N03은 부분 완료, N04는 대기다. 미리보기 서버를 현재 파일로 다시 시작한 뒤 390px과 넓은 화면을 재검토한다.

## 2026-09-30 N03 실제 브라우저 재검토 (수정 전 6종 파일 기준)

- 당시 대상 파일: `design/n03-preview.html`, 13,138 byte, SHA-256 `244C3BBC38FB905484757DF587F621A177412BEB4751BF4DB97D415F1F32334C`. 당시 파일은 section 6개이며 상태 gallery 07/08과 `disabled` 속성이 없었다. 아래 18,455 byte·8종 검증 기록과 파일이 일치하지 않아 해당 기록을 당시 시안의 증거로 사용할 수 없었다. 이후 복원된 현재 파일은 위 절을 따른다.
- 방법: 해당 HTML 하나만 제공하는 loopback HTTP 미리보기를 열어 in-app browser에서 실제 렌더링을 확인했다. 파일 URL은 사용하지 않았다. viewport 1440×1000 및 390×844에서 확인하고 임시 viewport 설정을 해제했다.
- 결과: 다크/라이트의 매트 표면·보라 강조·목록/본문/설정 구획은 확인했다. 모바일 복구 화면에는 활성 전송 버튼과 모델 선택 표시가 남아 있다. 모바일 specimen 높이 675px에서 작성창 하단은 specimen 상단 기준 약 444px여서 아래에 큰 빈 공간이 남는다. 390px viewport의 문서 scrollWidth는 402px로 갤러리에 가로 overflow가 있다. 관리자·진입 시안을 반폭 카드에 배치해 문구가 과하게 줄바꿈되므로 실제 화면 폭별 검토용 배치 보완이 필요하다.
- 판정: N03 부분 완료 유지. 상태 gallery/비활성 표현을 포함한 최신 시안 파일을 복원·확정한 뒤 다시 시각 검토한다. 이번 결과는 정적 시안 검토이며 실제 앱의 API·키보드·화면 읽기·가상 키보드·200% 확대 인수 결과가 아니다.

## 2026-09-30 출력·SSE 크기 계약 재검토 (문서·계산 단계)

- 발견·수정: `maximumGeneratedTextBytes`의 설정 최대 8 MiB에 생성·checkpoint·assistant message·GET 복원의 동일 UTF-8 byte 상한을 적용한다. `chat_jobs`는 시작 시 설정값을 저장하고 DB는 8 MiB 절대 제약을 둔다. 기존 assistant message 2,000,000자 CHECK는 N04 migration에서 교체한다. GET JSON HTTP body 한도는 `6 × 작업 상한 + 1 MiB`로 둔다. upstream 누적 응답 상한은 JSON/SSE overhead를 고려해 64 MiB로 확정했다(ADR-036).
- SSE 시험 계산: Node.js `Buffer.byteLength`로 원문 U+0000 65,536개(UTF-8 65,536 byte)를 `id: 2`, `event: append`, JSON `data:`와 빈 줄까지 직렬화하면 393,270 byte였다. pending 설정 최솟값 65,536 byte에서 frame 상한은 32,768 byte이고 같은 예시의 5,452개 조각은 32,766 byte, 5,453개 조각은 32,772 byte다. 텍스트 길이만 검사하면 실패한다는 근거다.
- GET 최악 길이 계산: U+0000 8,388,608개(원문 8 MiB)를 `{job:{content}}` JSON으로 직렬화하면 50,331,670 byte이며 `6 × 8 MiB + 1 MiB = 51,380,224` byte 상한 아래다. 이 계산은 DB·HTTP 구현 시험이 아니다.
- 당시 N04~N06 시험 계획: config 65,536/2,097,152/8,388,608 경계에서 생성·checkpoint·message·GET 본문 byte 일치, 설정 변경·재시작 뒤 기존 job 상한 snapshot 보존, ASCII/emoji/제어문자 JSON escaping, `id/event/data`와 줄바꿈을 포함한 실제 frame byte 분할, 서버 pending 65,536 및 클라이언트 262,144 byte 경계, terminal 마지막 frame과 DB 단일 transaction, upstream 64 MiB 총량을 검증한다. N06에서 실DB+mock Provider의 8 MiB checkpoint/message/GET, 완성 frame 상한과 서버 pending 경계를 확인했다. 전체 대용량 Provider HTTP→GET 및 브라우저 클라이언트 buffer 경계는 N13 인수에 남는다.

## 2026-09-30 N01~N03 검토 보완 (문서·소스 단계)

- 당시 발견·수정: 새 session이 job ID를 찾지 못하는 계약 공백은 대화 상세/목록 `activeJob`과 assistant message `jobId`로 보완했다. terminal 직전 별도 append commit 설명을 제거하고 최종 본문·메시지/job 상태·usage의 단일 transaction 및 단일 SSE terminal event로 통일했다. GET 본문과 SSE 메타데이터 snapshot을 분리했다. 크기 수치는 위 ADR-036 재검토 절이 최신 기준이다.
- N04~N06 필수 계약 시험: 다른 유효 session의 대화 상세 `activeJob` 발견·assistant message `jobId` join·7일 정리 후 null, 최근 50개 밖 활성 메시지의 ID 발견, terminal/취소 동시 경합에서 본문·상태·usage 한 번만 commit, terminal transaction rollback과 재시작 정리, GET 본문과 SSE pending buffer 분리, GET 중 SSE revision 증가·event queue 초과·terminal 선착순을 실제 PostgreSQL+mock Provider로 검증한다.
- N03 보완: 정적 시안에 모델 검색·Provider 필터·즐겨찾기·긴 이름, 첨부 준비/실패, 빈/로딩, 부분 실패, 권한/세션, 동시성/서버 혼잡, 미적용 설정, 모바일 활성 작업의 전송/모델 변경 비활성을 추가했다. 소스에서 이름 ellipsis, 작은 화면의 카드 1열 전환, 비활성 버튼과 오류별 문구를 확인했다. 실제 렌더링의 겹침·대비·위계는 로컬 `file:` URL 브라우저 정책 때문에 확인하지 못했다. N03은 부분 완료, N04는 대기다.
- 정적 대비 계산: 시안 CSS의 text/surface 비율은 라이트 15.43:1·다크 14.30:1, muted/surface는 5.58:1·6.91:1, 기본 보라 버튼의 흰 글자는 6.88:1이었다. 이는 토큰 값의 계산이며 실제 화면의 겹침·상태·확대·모바일 렌더링 검토를 대신하지 않는다.
- 검사 결과: 정적 HTML 18,455 byte, 기본 6종+상태 2종의 section/닫힘/caption 각 8개, div 시작/끝 각 94개, 끝 공백 0개다. 필수 상태 문구 9개가 모두 존재한다. root Markdown 26개에서 참조한 로컬 문서·시안 링크의 누락 0개, `git diff --check` 종료 코드 0이다. 이는 소스 구조·링크 검사다. 신규 API·DB·UI 런타임 시험과 실제 브라우저 시각 인수는 수행하지 않았다.

## 2026-09-30 N03 정적 시안 검증 (디자인 단계)

- 대상: 당시 WEB_UI_SPEC.md N03 계약과 design/n03-preview.html의 다크·라이트 데스크톱 채팅, 모바일, 관리자 Provider·사용량, 첫 방문 진입 기본 6종. 후속 필수 상태 시안은 위 검토 보완 절을 따른다.
- 당시 검사 결과: HTML 파일 13,138 byte, 기본 시안 표제·`specimen` section·닫는 section 각 6개를 확인했다. 이후 시안 07/08을 추가했으므로 현재 파일 크기·section 수의 검증 결과는 위 검토 보완 절 이후의 검사로 갱신한다. 정적 HTML의 숫자와 상태는 예시 데이터다.
- N10/N11 필수 인수: 실제 브라우저 320/390/768/1024px, 다크/라이트와 200% 확대, 긴 한글·모델명·코드/표, 키보드·화면 읽기, 미적용 설정/충돌, 재접속·부분 실패, 관리자 비용 안내·비밀값 비노출, CSP/Markdown 경계를 시험한다.
- 미검증: 이 단계는 앱 UI 코드를 바꾸지 않았다. 로컬 `file:` 시안을 in-app browser에서 열려는 요청은 브라우저 URL 정책이 차단해 화면 렌더링을 시각적으로 확인하지 못했다. 정책 우회 없이 파일 구조만 확인했다. 실제 API·auth·키보드·screen reader·반응형 브라우저 인수는 N10/N11에서 구현·검증한다.

## 2026-09-30 N02 계약 검증 (문서 단계)

- 대상: AI_INTEGRATION_SPEC.md, PROVIDER_REGISTRATION_SPEC.md, SECURITY_SPEC.md, SERVER_CONFIG_SPEC.md, DEPLOYMENT_PROFILE.md, DEPLOYMENT_RUNBOOK.md, PROVIDER_CONTRACT_TESTS.md의 N02 절, API_SPEC.md·DATABASE_SCHEMA.md N02 입출력/저장 계약과 ADR-033. 정상 종료·오류·빈 답변·부분 usage, context 추정·상한, public/local 목적지, Markdown 신뢰 경계, TOTP CLI 복구, config v2·신규 설치·rollback의 연결을 대조했다.
- 문서 검사 결과: root Markdown 26개의 로컬 문서 링크가 모두 존재하고 `git diff --check`가 종료 코드 0이다. N02 문서의 정적 정합성 확인이며 아래 현행 코드 시험이나 신규 기능의 실행 검증을 뜻하지 않는다.
- N04~N08 필수 시험: 격리 PostgreSQL migration의 builtin row 변환과 custom 제약, config v1 거부/v2 경계값, OpenAI·Anthropic·Gemini 정상/비정상 종료·stream 내부 오류·거부·빈 답변·usage 누락 fixture, byte·timeout·slot/구독/버퍼 상한, 공개 DNS 혼합 주소·재바인딩·redirect·proxy·IPv6·승인 local 주소 접속, 키/무인증·수동 모델 진단 단계를 검증한다.
- N10/N12~N13 필수 시험: Markdown의 script/HTML/위험 URL/원격 이미지 차단, CSP, TOTP reset 후 이전 session 무효화, gateway의 job SSE 무버퍼, 종료 30초와 부분 상태, 새 volume 설치·구 config 거부·rollback·README/runbook 명령을 검증한다.
- 미검증: 이 단계는 문서 변경만 수행했다. 앱 코드·migration·Compose·서버를 변경하거나 Provider·DB·브라우저·실배포 시험을 실행하지 않았다. 아래 N00의 현행 201개 통과는 새 계약 시험 결과가 아니다.

## 2026-09-30 N01 계약 검증 (문서 단계)

- 대상: CHAT_STATE_SPEC.md·API_SPEC.md·DATABASE_SCHEMA.md·GUEST_ACCESS_SPEC.md·ADMIN_LOGGING_SPEC.md의 N01 절과 ADR-032. 시작/재생성·조회/구독/중지의 권한·입출력·오류, key 보존·충돌, snapshot/revision, terminal·quota transaction, 제목/요약·설정·첨부·탐색 계약을 대조한다.
- 문서 검사 결과: root Markdown 26개의 로컬 링크 존재, `git diff --check`, 다섯 기준 문서의 N01 절·ADR-032·N02 착수 가능 상태 참조 모두 통과했다. 아래 기존 201개 현행 테스트 통과는 새 계약 검증이 아니다.
- N04~N09 필수 자동 시험: 실제 PostgreSQL에서 동일 key 병렬 시작의 job·메시지·quota·upstream 단일성, 다른 입력 409, 대화/주체 partial unique, 예약 전 유료 요약 금지, 미전송 해제와 전송/불확실 차감, 자정 경계, checkpoint+구독 race와 terminal 선착순, 재시작 실패 정리, session/권한 회수, 제목 수동 변경/삭제 경합, 첨부 cleanup 경합, 설정 revision/검색 cursor를 검증한다. mock Provider는 정상·오류·부분 응답을 제어한다.
- 미검증: 현재는 API·DB·runtime·브라우저·실제 Provider 변경이 없으며 새 endpoint/constraint/slot/usage를 실행해 보지 않았다. N02의 Provider 종료 조건·자원 계산과 N04 이후 실제 DB 시험을 통과하기 전에는 새 버전 기능 완료로 표시하지 않는다.

## 2026-09-30 N00 기준선 재확인

- 작업 위치: `C:\Users\Jae\Documents\APIchat` (Windows PowerShell). 기준 HEAD `992662520773a5e74262b2b9b6808e02a1578e4e`, Node.js `v24.19.0`, pnpm `11.25.0` (`packageManager` 선언은 `pnpm@11.9.0`).
- 시작 상태: 추적 Markdown 22개 수정, `HANDOFF.md`와 `IMPLEMENTATION_PLAN.md` 미추적. 기능 코드·migration·lockfile·실제 설정 변경은 발견되지 않았다. 기존 문서 변경과 미추적 파일을 보존했다. `git status`의 사용자 전역 ignore 읽기 경고와 `git diff`의 LF→CRLF 경고는 기록하되 변경 파일로 취급하지 않는다.
- `git diff --check`: 종료 코드 0. root Markdown 26개의 `./*.md` 로컬 링크 존재 검사: 통과. `git diff --stat`은 미추적 두 문서를 포함하지 않으므로 위 상태 목록을 함께 본다.
- 기본 권한의 `pnpm test`: `node_modules/.pnpm/.../vitest.mjs` 읽기 EPERM으로 종료 코드 1. 같은 명령을 허용 권한에서 재실행한 결과 종료 코드 0, 201개 통과·Windows 조건부 시험 1개 제외. EPERM은 코드 결함으로 분류하지 않는다.
- 허용 권한에서 `pnpm typecheck`, `pnpm lint`: 각각 종료 코드 0. 검사는 현행 코드의 기준선이며 새 버전 API·DB·Provider·브라우저·실제 서버 인수가 아니다. production build, 실제 PostgreSQL, HTTPS E2E와 실 Provider 시험은 N00에서 실행하지 않았다.
- N01 착수 기준: 위 결과와 미커밋 상태를 유지하고, `IMPLEMENTATION_PLAN.md` N01의 허용 문서에서 작업/API/DB/보조 호출 계약을 확정한다. 과거 감사에서 재현된 stream 오류 등은 이번 기준선 통과로 해결된 것이 아니다.

## 2026-09-30 전체 문서 인계 검증

- 범위: HANDOFF.md의 전체 root Markdown 문서 지도, AGENTS/README 진입 링크, 원장 우선순위·미커밋 변경·과거/현재 검증 구분과 N00 첫 작업 계약.
- 검사: root Markdown 전체가 인계 지도에 연결되는지, 로컬 문서 링크가 존재하는지, N00~N14 참조와 신규 문서 공백·최종 줄바꿈 및 git diff 공백을 확인한다.
- 실행 결과: root Markdown 26개 전체 참조, 로컬 문서 링크, 계획에 정의된 단계 참조, 신규 문서 공백·최종 줄바꿈과 `git diff --check` 모두 통과.
- 범위 밖: N00 기준선 재실행, 앱 코드·DB·서버 변경, 다음 에이전트 생성·메시지 전송. 이번에는 전달 가능한 문서를 준비한다.

## 2026-09-30 실행 계획 문서 검증

- 범위: IMPLEMENTATION_PLAN.md N00~N14의 선행 참조·단계 순서, AUD-01~15 추적, 역할·허용/금지 범위·인계 필드와 공용 문서 작성 규칙.
- 확인 대상: AGENTS 문서 색인, 계획/진행 상태 구분, root package.json 및 workspace scripts의 명령 존재, 로컬 문서 링크와 git diff 공백 검사.
- 실행 결과: PowerShell 검사로 N00~N14의 15개 고유 ID·선행 참조 순서·진행 원장 행과 AUD-01~15의 단계 연결 확인, 로컬 Markdown 문서 링크 존재 검사·`git diff --check` 통과. 명령은 각 package.json과 대조했다.
- 구현·시험 실행 상태: 계획 문서만 작성했다. 단위·통합·build·서버 배포 검사를 이번 작업에서 실행하지 않는다.

## 2026-09-30 종합 감사 검증

- 실행: API workspace에서 설치된 tsx와 mock Response로 streamProviderRequest를 호출했다. 실제 Provider·서버·키는 사용하지 않았다.
- 재현: 완료 신호 없는 EOF는 text_delta→done, HTTP 200 본문의 error 이벤트는 done으로 종료하고 둘 다 예외가 없었다. 결함 확인 결과이며 정상 계약 시험 통과가 아니다.
- 첫 실행은 root에서 tsx 패키지를 찾지 못해 실패했고 API workspace로 위치를 수정한 실행은 종료 코드 0으로 위 동작을 확인했다.
- 정적 확인: AI 동시성 config 소비 코드 부재, 요약/일일 quota 실행 순서, 컨텍스트 계산, TOTP 복구 명세 차이. 실제 부하·DB 경합 재현은 미실행이다.
- 후속 인수 시험: SPEC_AUDIT.md AUD-01~15의 계약·동시성·오류·복구·UI 검증. 현재 문서 수정만 수행했으므로 전체 회귀·build·배포는 재실행하지 않았다.
- 문서 검증: root Markdown의 코드 블록 밖 로컬 문서 링크 존재 검사와 `git diff --check` 통과.

## 새 버전 지속 생성·탐색 인수 시험 (2026-09-30, 실행 전)

- 동일 요청으로 대화 이동·새로고침·탭 닫기·연결 단절을 수행하고 Provider 호출 1회와 부분/완료 응답 복원을 확인한다.
- 중복 시작·snapshot/이벤트 경합·역순 revision·느린 구독자에서 본문 중복·누락과 중복 quota/usage 기록이 없는지 확인한다.
- 중지·완료 경합, 대화 삭제·로그아웃·만료·권한 회수, API 프로세스 재시작 후 상태 정리와 자동 재호출 방지를 검증한다.
- 대화·주체·서버 동시성, idle/전체 실행 상한, 요약·제목 보조 호출의 공통 슬롯과 교착 방지를 검증한다.
- 모델 검색·필터·즐겨찾기의 사용자/게스트 격리·권한 변경·삭제·재로그인 복원과 대화 제목 검색·고정을 검증한다.
- 첨부 처리 상태·전송 차단·실패 항목 제거, 오류별 복구 동작, 전환 중 입력 보존, 컨텍스트 추정 표시와 Provider 단계별 진단을 브라우저에서 검증한다.
- README만 따른 신규 설치와 설치 직후 로그인→모델 선택→생성→재접속→중지 흐름을 인수 기준으로 삼는다.
- 현재 결과: 문서 계획만 추가했다. 런타임·DB·브라우저·배포 시험은 미실행이며 문서 참조와 diff 검사를 수행한다.
- 문서 검증 결과: 관련 기준 문서 존재와 ADR 참조 확인, `git diff --check` 통과.

## 새 버전 커스텀 Provider 시험 계획 (2026-09-30)

- 계약 시험 항목은 PROVIDER_CONTRACT_TESTS.md의 새 버전 절을 따른다. 원격·로컬 연결, 모델 수동 등록, 보안 목적지 검증, Docker 접근성을 포함한다.
- 이번 작업은 문서 변경이며 기능·실통신 시험은 미실행이다. 문서 참조·범위 구분과 `git diff --check`를 확인한다.

## 새 버전 설정·자동 제목 시험 계획 (2026-09-30)

- 계획: 모델 즉시 저장 실패 시 복원, 다음 요청 적용, 생성 중 snapshot 유지, 미적용 설정 확인과 주체별 기본 모델 격리.
- 계획: 제목 생성 성공·모델 미설정·오류·빈 결과·시간 초과, 수동 이름 변경과 결과 도착 경합, 삭제·게스트 만료 후 결과 폐기, 중복 작업·재생성 시 중복 호출 방지.
- 계획: 관리자만 전역 제목 모델을 변경할 수 있고 사용자·게스트의 변경 요청은 거부하며 CSRF 검증을 적용한다. 사용자별 제목 모델 선택 UI가 없는지 확인한다.
- 계획: 보조 호출 사용량 구분과 관리자 로그의 대화·제목 본문 비노출. 최종 권한·호출 한도 정책 확정 후 시험 조건을 구체화한다.
- 미실행: 기능 구현과 런타임 시험. 문서 참조·확정/제안 상태 구분 및 `git diff --check`를 점검한다.
- 문서 점검 결과: 관련 명세의 상태 구분과 참조 대상 확인, `git diff --check` 통과.

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
| DB-STARTUP-001     | 단위 | DB 초기화 순서       | lifecycle hook이 DB ready 이후 설정을 조회         | 통과      |

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
| PROVIDER-UI-001     | 정적 | 모델 활성 상태 버튼     | `사용 중`은 초록 포인트, `사용 안 함`은 중립색    | 통과 |

## 8. 게스트·모델 권한 시험 항목

| ID                  | 종류 | 대상              | 인수 조건                                                                                                                   | 상태 |
| ------------------- | ---- | ----------------- | --------------------------------------------------------------------------------------------------------------------------- | ---- |
| ACCESS-UNIT-001     | 단위 | 사용자 모델 권한  | 코드 hash·timezone·quota 오류 변환과 migration 계약                                                                         | 통과 |
| ACCESS-CONCUR-001   | 통합 | 일일 호출 counter | 동시 요청에서 사용자·모델·게스트 한도를 원자적으로 초과하지 않음                                                            | 계획 |
| GUEST-AUTH-001      | 단위 | 공유 코드·session | hash 검증·생성 속도 제한·idle·absolute 만료 계산                                                                            | 통과 |
| GUEST-POLICY-001    | 통합 | 게스트 설정 저장  | 설정 저장 시 기존 게스트 session을 항상 모두 종료                                                                           | 계획 |
| UI-STATIC-001       | 정적 | 공통 UI theme     | 라이트·다크 token·역할별 7색 단색 포인트·focus·checkbox 정렬                                                                | 통과 |
| UI-THEME-001        | E2E  | 테마 전환         | 시스템 추종·수동 전환·새로고침 후 선택 복원                                                                                 | 계획 |
| UI-COMPOSER-001     | 정적 | 채팅 작성 영역    | 파일·전송 버튼 동일 크기·Enter 전송·Shift+Enter 줄바꿈·IME 보호                                                             | 통과 |
| UI-LANDING-001      | 정적 | 비로그인 메인     | 인프라·게스트 제목이 데스크톱·모바일에서 정확히 두 줄, 소개 고정 줄바꿈, 계층별 책임·역할 분리·설계 원칙과 운영 상세 비노출 | 통과 |
| GUEST-ISOLATION-001 | 보안 | 게스트 소유권     | 같은 코드를 쓴 두 guest가 상대 대화·첨부를 조회하지 못함                                                                    | 계획 |
| GUEST-CLEANUP-001   | 통합 | 임시 데이터 삭제  | logout·만료·관리자 종료 후 기한 내 연쇄 삭제                                                                                | 계획 |
| GUEST-E2E-001       | E2E  | HTTPS 게스트 체험 | 코드 참가·독립 대화·호출 제한·logout                                                                                        | 계획 |

## 8.1 관리자 Usage·메뉴 시험 항목

| ID               | 종류 | 대상                   | 인수 조건                                                              | 상태      |
| ---------------- | ---- | ---------------------- | ---------------------------------------------------------------------- | --------- |
| USAGE-STATIC-001 | 정적 | 9차 migration          | 본문 없는 원장·snapshot·상태·token·삭제 후 보존 FK와 기간 index        | 통과      |
| USAGE-UNIT-001   | 단위 | 기간 검증              | 7개 상대 기간만 허용하고 시작 시각을 요청 시각에서 정확히 계산         | 통과      |
| USAGE-API-001    | 단위 | 관리자 조회 API        | 기본 1일·no-store·잘못된 기간 400·사용자/게스트 접근 거부              | 부분 통과 |
| USAGE-INT-001    | 통합 | 요청 원장·PostgreSQL   | 생성·재생성의 완료·실패·취소와 token·처리시간이 원자적으로 기록        | 계획      |
| USAGE-UI-001     | 정적 | 관리자 Usage·메뉴 분리 | 첫 화면 Usage, 5개 메뉴, 7개 기간, 요약·사용자별·모델별·최근 요청 표시 | 통과      |
| USAGE-E2E-001    | E2E  | Ubuntu 관리자 대시보드 | 실제 호출 후 기간·사용자·모델 집계와 사용자 삭제 후 기록 보존          | 계획      |

## 9. 채팅 기반 시험 항목

| ID                  | 종류 | 대상                | 인수 조건                                                       | 상태 |
| ------------------- | ---- | ------------------- | --------------------------------------------------------------- | ---- |
| CHAT-STATIC-001     | 정적 | 5차 migration       | 소유권·cascade·root branch·상태·순서·모델 snapshot 제약         | 통과 |
| CHAT-UNIT-001       | 단위 | service·controller  | 기본값·입력 범위·관리자 거부·소유권 not-found mapping           | 통과 |
| CHAT-DEFAULTS-001   | 단위 | 10차 migration·API  | 대화별 모델·파라미터 저장, 기존 대화 backfill과 JSON 제약       | 통과 |
| CHAT-INT-001        | 통합 | PostgreSQL CRUD     | 사용자·게스트 격리와 생성 transaction·수정·삭제                 | 계획 |
| CHAT-SECURITY-001   | 보안 | session·CSRF·소유권 | 다른 주체 ID 비노출, 모든 mutation CSRF 적용                    | 계획 |
| PROVIDER-ORDER-001  | 단위 | Provider catalog    | 핵심 4개 고정 상단, LLM Gateway 포함 나머지 표시 이름 알파벳순  | 통과 |
| CHAT-STREAM-001     | 단위 | Provider adapter    | OpenAI·Anthropic·Gemini URL·header·body와 SSE chunk 정규화      | 통과 |
| CHAT-CONTEXT-001    | 단위 | 컨텍스트 한도       | 초과 시 quota 예약 전 실패 상태와 표준 오류 저장                | 통과 |
| CHAT-CANCEL-001     | 통합 | 중지·연결 종료      | upstream abort와 assistant `cancelled`·부분 본문 보존           | 계획 |
| CHAT-E2E-001        | E2E  | HTTPS 텍스트 채팅   | 실제 허용 모델로 생성·stream·저장·새로고침·모델 변경            | 계획 |
| CHAT-MODEL-001      | 단위 | 모델 선택 복원      | 저장 모델 우선·마지막 허용 모델·첫 허용 모델 순서로 fallback    | 통과 |
| CHAT-PARAMS-001     | 단위 | 설정 form 복원      | 저장된 숫자·문자열·목록 파라미터를 대화 전환 시 독립 복원       | 통과 |
| CHAT-BRANCH-001     | 단위 | 분기 경로 합성      | 부모 prefix 공유·반복 재생성·잘못된 fork 거부                   | 통과 |
| CHAT-REGEN-001      | 단위 | 재생성 service·API  | 전용 저장 경로·입력 검증·분기 전환 소유권 전달                  | 통과 |
| CHAT-REGEN-E2E-001  | E2E  | HTTPS 답변 재생성   | 원본 보존·성공 시 활성화·실패 시 유지·분기 왕복·후속 문맥       | 계획 |
| CHAT-REGEN-LAST-001 | 단위 | 재생성 대상 제한    | 마지막 assistant만 허용하고 과거·생성 중 답변 거부              | 통과 |
| CHAT-NAV-001        | 단위 | 인라인 답변 탐색    | 동일 질문의 branch 자체 답변만 후보로 구성                      | 통과 |
| CHAT-SCROLL-001     | 단위 | 최신 답변 자동 추적 | 하단 임계값 안에서는 추적하고 과거 내용 열람 시 추적 중단       | 통과 |
| CHAT-REFRESH-001    | 정적 | 응답 완료 상태 갱신 | 전체 loading 전환 없이 상세·목록 데이터만 갱신                  | 통과 |
| CHAT-TOAST-001      | 정적 | 상태 메시지         | 레이아웃 비점유·성공/오류 접근성·5초 fade 후 자동 제거          | 통과 |
| CHAT-LAYOUT-001     | 정적 | 채팅 패널 재구성    | 새 대화 포함 목록 전체 접기·설정 모달·스크롤·역할별 테두리 적용 | 통과 |
| CHAT-LAYOUT-002     | 정적 | 낮은 화면·긴 목록   | 사이드바·메시지만 독립 스크롤하고 입력창·전송 버튼은 항상 유지  | 통과 |
| CHAT-LIST-001       | 정적 | 대화 목록 행        | 68px 고정 높이·초과 시 스크롤·행별 삭제·현재 대화 전환 처리     | 통과 |
| CHAT-SETTINGS-001   | 정적 | 대화 설정 모달      | 기본 닫힘·큰 모달·Esc·바깥 클릭·미저장 확인·모바일 전체 화면    | 통과 |
| CHAT-HEADER-001     | 정적 | 채팅 상단 헤더      | 브랜드·공간·ID·로그아웃 한 줄 배치와 좁은 화면 말줄임           | 통과 |
| FILE-STATIC-001     | 정적 | 11차 migration      | 대화 cascade·message 복합 FK·UUID key·추출문·상태·만료 index    | 통과 |
| FILE-TEXT-001       | 단위 | 텍스트 추출         | 경로형 이름·확장자·MIME·UTF-8/16·NUL·글자 상한·context 합성     | 통과 |
| FILE-STORAGE-001    | 단위 | 원본 저장           | UUID 경로·0600 임시 파일·byte 상한·실패 시 partial 정리         | 통과 |
| FILE-API-001        | 단위 | 업로드·메시지 API   | octet stream header·CSRF 전제·attachment ID 전달·파일-only 입력 | 통과 |
| FILE-E2E-001        | E2E  | HTTPS 텍스트 첨부   | 원본·추출 저장, AI 활용, 후속 포함 전환, 삭제·격리              | 계획 |
| FILE-PDF-001        | 단위 | PDF 텍스트 추출     | signature·실제 텍스트·페이지 수·페이지 제한·OCR 필요·손상 구분  | 통과 |
| FILE-PDF-002        | 정적 | 12차 migration      | PDF page_count 범위·ready 추출문·인코딩 제약                    | 통과 |
| FILE-OCR-001        | 단위 | 스캔 PDF OCR 전환   | 텍스트 레이어 없음·페이지 구분·무결과 오류                      | 통과 |
| FILE-OCR-002        | 단위 | 로컬 OCR engine     | 페이지별 렌더링·kor+eng 인식·임시 파일 정리                     | 통과 |
| FILE-OCR-003        | 정적 | 16차 migration      | OCR 페이지 수 범위·PDF 전체 페이지 수 이하 제약                 | 통과 |
| FILE-POOL-001       | 단위 | bounded task pool   | active 제한·queue 포화 거부·abort 제거·종료 시 waiter 거부      | 통과 |
| FILE-POOL-002       | 단위 | 업로드 controller   | HTTP close를 upload AbortSignal로 전달                          | 통과 |

3단계 런타임 안정성 검증에서는 파일 처리 관련 API 시험 5개 파일의 16개
테스트, config 시험 10개가 통과했으며 config 시험 1개는 조건부 항목으로
건너뛰었다. API·config·관리자 CLI typecheck와 전체 lint도 통과했다.

4단계 검증에서는 전체 API 시험 38개 파일의 139개 테스트와 config 시험
10개가 통과했으며 config 시험 1개는 조건부 항목으로 건너뛰었다.
API·config·관리자 CLI typecheck도 통과했다.

### 7.1 런타임 안정성 수동 시험 묶음

`scripts/generate-runtime-test-fixtures.py`를 실행하면
`output/pdf/runtime-stability`에 아래 수동 시험 파일을 생성한다. 생성물은
대용량 fixture의 실수 커밋을 막기 위해 Git에서 제외한다.

| ID                 | 시험 파일·절차                                                                                  | 기대 결과                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| RUNTIME-MANUAL-001 | `01-text-utf8.txt`, `02-structured.md`, `03-data.json`을 각각 첨부하고 고유 표식·계산 결과 질문 | 고유 표식과 JSON 합계 46을 정확히 응답                                           |
| RUNTIME-MANUAL-002 | `04-text-layer.pdf`를 첨부하고 2페이지 표식과 계산 결과 질문                                    | `MN-PDF-PAGE2-774`, 500 응답, OCR 표시 없음                                      |
| RUNTIME-MANUAL-003 | `05-scanned-ocr.pdf`를 첨부하고 6페이지 표식·숫자 질문                                          | OCR 처리 표시, `MN-OCR-PAGE-06-64`, 822 응답                                     |
| RUNTIME-MANUAL-004 | 스캔 PDF 처리 중 새로고침·탭 종료 후 다른 파일 업로드                                           | 취소 요청이 queue를 점유하지 않고 다음 파일 정상 처리                            |
| RUNTIME-MANUAL-005 | 별도 탭에서 스캔 PDF 6개를 거의 동시에 업로드                                                   | 기본 worker 1·queue 4가 유지되며 포화 시 `FILE_PROCESSING_BUSY`, API health 유지 |
| RUNTIME-MANUAL-006 | `06-page-limit-101.pdf` 업로드                                                                  | `FILE_PDF_PAGE_LIMIT`으로 거부                                                   |
| RUNTIME-MANUAL-007 | `07-invalid-signature.pdf` 업로드                                                               | `FILE_PDF_INVALID`로 거부                                                        |
| RUNTIME-MANUAL-008 | `08-empty.txt`와 `09-over-10mb.txt`를 각각 업로드                                               | 각각 `FILE_INPUT_INVALID`, `FILE_TOO_LARGE`로 거부                               |
| RUNTIME-MANUAL-009 | `10-unsupported.docx` 업로드                                                                    | `FILE_TYPE_UNSUPPORTED`로 거부                                                   |
| RUNTIME-MANUAL-010 | 이미지 입력 허용 모델에 `11-image-vision.png` 첨부                                              | 표식 `MN-VISION-742`와 도형·색상 순서를 인식                                     |
| RUNTIME-MANUAL-011 | 이미지 입력 미허용 모델에 같은 PNG 첨부 후 전송                                                 | Provider 호출 전 `CHAT_IMAGE_MODEL_UNSUPPORTED`로 거부                           |
| RUNTIME-MANUAL-012 | `12-attachment-count`의 10개를 전송한 뒤 11개 전송 시도                                         | 10개는 허용되고 11개는 UI 또는 API에서 거부                                      |
| RUNTIME-MANUAL-013 | `13-image-request-limit`의 PNG 3개를 이미지 허용 모델에서 한 메시지로 전송                      | 개별 업로드는 성공하고 Provider 호출 전 `CHAT_IMAGE_PAYLOAD_TOO_LARGE`로 거부    |

동시 처리와 취소 시험 전후에는 `docker stats --no-stream`,
`docker compose ps`와 API log를 확인한다. API가 재시작·unhealthy 상태가 되거나
작업 종료 뒤 메모리가 지속적으로 증가하면 실패로 기록한다.
| FILE-OCR-E2E-001 | E2E | Ubuntu 스캔 PDF | 실제 한국어·영어 OCR·AI 컨텍스트·임시 파일 정리·N100 처리 시간 | 계획 |
| FILE-PDF-E2E-001 | E2E | HTTPS PDF 첨부 | 텍스트 PDF AI 활용·페이지 표시·암호·스캔·100페이지 거부 | 계획 |
| FILE-IMAGE-001 | 단위 | 이미지 본문 검증 | JPEG·PNG·WebP 확장자/MIME·signature·해상도·픽셀 상한 | 통과 |
| FILE-IMAGE-002 | 단위 | 멀티모달 변환 | OpenAI image_url·Anthropic image block·Gemini inline_data | 통과 |
| FILE-IMAGE-003 | 단위 | 모델 capability | 기본 비활성·관리자 변경·동기화 보존·미지원 모델 quota 전 차단 | 통과 |
| FILE-IMAGE-004 | 단위 | 요청 이미지 합계 | DB metadata 사전 상한·실제 byte 재검사·quota 전 거부 | 통과 |
| CHAT-REQUEST-001 | 단위 | Provider 요청 lifecycle | 요청 단일 직렬화·trace/fetch 재사용·trace image 제거 사본 | 통과 |
| FILE-IMAGE-E2E-001 | E2E | HTTPS 이미지 첨부 | 실제 모델 JPEG·PNG·WebP 인식·후속 포함·미지원 모델 차단 | 계획 |
| FILE-LIFE-001 | 단위 | 만료·삭제 queue | 만료 metadata 전환·원본 삭제 성공·실패 재시도 | 통과 |
| FILE-LIFE-002 | 정적 | 14차 migration | DB 보관 설정·expired 상태·cascade cleanup trigger | 통과 |
| FILE-LIFE-003 | 단위 | 관리자 보관 API | 1~3,650일 입력·감사 context·잘못된 범위 거부 | 통과 |
| FILE-LIFE-E2E-001 | E2E | Ubuntu 파일 수명 | 기간 변경·수동 정리·metadata 유지·대화/사용자/guest 즉시 삭제 | 계획 |
| UI-ICON-001 | 정적 | 브랜드 아이콘 | 보라 MN SVG·favicon·Apple·PWA 자산과 metadata 연결 | 통과 |
| UI-MARK-001 | 정적 | 페이지 브랜드 마크 | 보라 테두리·반투명 표면·MN mask의 다크·라이트 공용 적용 | 통과 |
| SUMMARY-STATIC-001 | 정적 | 6차 migration | 설정 singleton·버전·범위·message 경계·cascade·중복 방지 index | 통과 |
| SUMMARY-PARAM-001 | 단위 | 7차 migration·API | sampling 범위·nullable 기본값·최대 출력 범위 검증 | 통과 |
| PROVIDER-PARAM-001 | 단위 | parameter policy | 전체 catalog profile·OpenAI reasoning·Anthropic thinking 규칙 | 통과 |
| PROVIDER-PARAM-002 | 단위 | request mapping | Gemini penalty·seed·stop·thinking과 Anthropic/OpenAI 필드 변환 | 통과 |
| SUMMARY-PARAM-002 | 정적 | 8차 migration·Web | 고급 JSON·설명·기본 동작·직접 설정 checkbox·충돌 사유 표시 | 통과 |

## 9.1 관리자 통합 로그·session 전송 기록 시험

| ID                | 종류 | 범위                    | 검증 내용                                                                 | 상태      |
| ----------------- | ---- | ----------------------- | ------------------------------------------------------------------------- | --------- |
| LOG-STATIC-001    | 정적 | 15차 migration          | 운영 로그 제약·index, 보관 singleton, 대화 0~3, 게스트 허용 설정          | 통과      |
| LOG-UNIT-001      | 단위 | 관리자 로그 controller  | 필터 범위 검증, page 매핑과 조회 감사 호출                                | 통과      |
| LOG-UI-001        | 정적 | 관리자 Web              | 다섯 범주, 기간·수준·상태·검색, 상세·CSV·retention·즉시 정리              | 통과      |
| TRACE-UNIT-001    | 단위 | API process memory      | 대화별 개수 제한, session 삭제, auth header·query secret·이미지 마스킹    | 통과      |
| TRACE-SEC-001     | 보안 | session·대화 소유권     | 다른 session·사용자·게스트 기록 조회 차단과 logout·만료·삭제 시 제거      | 부분 통과 |
| TRACE-E2E-001     | E2E  | 사용자·게스트 HTTPS Web | 실제 Provider 요청·응답 표시, 0~3 설정·수동 삭제·재로그인 후 빈 목록 확인 | 계획      |
| SUMMARY-UNIT-001  | 단위 | 요약 context 구성       | Unicode 추정·호환 요약 재사용·최근 메시지 보존                            | 통과      |
| SUMMARY-FAIL-001  | 단위 | 요약 실패 처리          | 본 호출 quota 예약 전 표준 오류·failed 상태 저장                          | 통과      |
| SUMMARY-ADMIN-001 | 통합 | 관리자 요약 설정        | 관리자·CSRF·활성 모델 검증·prompt version·감사 기록                       | 계획      |
| SUMMARY-E2E-001   | E2E  | HTTPS 자동 요약         | 실제 모델 요약·원본 보존·재사용·후속 답변 품질                            | 계획      |

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

2026-07-23 개발 환경에서 다음 결과를 확인했다.

- `pnpm format:check`: 통과
- `pnpm lint`: 통과, warning 0개
- `pnpm typecheck`: 5개 workspace package 통과
- `pnpm test`: 161개 통과, Windows에서 symbolic-link 시험 1개 제외
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
- 대화에 저장된 모델 우선 복원, 활성 분기의 마지막 허용 모델과 첫 허용 모델 fallback을 Web 단위시험으로 확인
- 10차 migration의 대화별 모델·파라미터와 기존 대화 backfill 계약, 저장된 생성 파라미터의 설정 form 복원을 단위시험으로 확인
- 11차 migration attachment FK·제약·index, 텍스트 이름·MIME·인코딩·상한·context 합성, UUID 원본 저장과 partial 정리, raw upload·메시지 attachment 전달을 단위시험으로 확인
- 부모 경로 공유형 분기 합성, 반복 재생성, 잘못된 fork 거부와 재생성 전용 실행·API 입력·분기 활성화 service 단위시험 통과
- 마지막 assistant 답변만 재생성 대상으로 허용하고 동일 질문의 실제 branch 답변만 인라인 탐색 후보로 구성하는 단위시험 통과
- 메시지 목록 하단 96px 자동 추적 경계와 사용자가 위로 스크롤한 경우의 추적 중단 단위시험 통과
- 6차 migration의 요약 설정·메시지 경계·cascade·중복 방지 제약, Unicode 기반 한도 추정, 호환 요약 재사용과 요약 실패 시 quota 예약 방지를 단위시험으로 확인
- Ubuntu HTTPS에서 Gemini·OpenAI 호환 모델 응답, 모델별 snapshot·token usage 저장, 새로고침 후 대화 복원과 assistant 취소 상태 저장을 확인했으며 대화별 모델 선택 복원은 수정 후 재배포 검증 대기
- Ubuntu에서 `0003_provider_registry.sql` 적용과 LLM Gateway·OpenAI 실제 키 등록·모델 조회·동기화·활성 변경·감사 기록을 확인
- Provider Manager 전체 catalog의 parameter profile 존재, GPT-5·o 계열 sampling 유지·reasoning 충돌 제거, Anthropic thinking의 sampling 제거, Gemini 고급 필드 변환을 단위시험으로 확인

2026-07-22 Ubuntu 최초 migration 실행은 internal backend network에서 Corepack이 `pnpm`을 내려받으려다 DNS `EAI_AGAIN`으로 실패했다. PostgreSQL은 healthy였고 migration 적용 전 실패하여 schema 손상은 없었다. Runtime command를 build된 JavaScript의 직접 `node` 실행으로 변경한 뒤 재배포하여 `0001_auth_foundation.sql` 적용, migrate exit code 0, API·Web·PostgreSQL·Valkey healthy와 readiness `database: ok`를 확인했다. Migration 재실행과 `schema_migrations` 직접 조회, DB 중단 시 readiness 503 확인은 남아 있다.

## 13. 오류·경계 조건

- 외부 provider가 필요한 시험은 fixture 기반 contract test와 실제 credential smoke test를 구분한다.
- Docker를 실행하지 않은 정적 Compose 검토는 통합 시험 통과로 기록하지 않는다.
- Windows에서 통과한 파일 권한 시험은 Linux `0600` 검증을 대체하지 않는다.

## 14. 미결정·보류 항목

- 실제 Ubuntu HTTPS 관리자 login 검증 후 Playwright E2E 자동화 범위를 확정한다.
- Anthropic·Google 실제 credential smoke test 결과를 `PROVIDER_CONTRACT_TESTS.md`에 기록한다.

## 15. 2026-07-23 Provider registry 확장 시험

- 카탈로그 40개 항목의 ID 중복, HTTPS URL, 인증 방식과 모델 공급 경로를 정적으로 검증한다.
- bearer-optional 빈 키의 Authorization 생략과 static model 정규화를 검증한다.
- Cloudflare Account ID가 고정 origin 안에서만 URL로 치환되는지 검증한다.
- Provider 등록 controller가 template configuration을 service에 전달하되 비밀값을 응답하지 않는지 검증한다.
- 일반 채팅 기본 parameter가 Temperature `1.0`으로 변환되는지 Web 단위 시험으로 검증한다.
- GPT-5·o 계열 추론 모델에서는 기본 Temperature가 upstream 요청에서 제거되는지 검증한다.
- 실제 Provider별 credential smoke test는 Ubuntu 배포에서 관리자가 해당 키를 보유한 항목만 별도로 수행한다.

## 16. 런타임 안정성 개선 시험

| ID                | 종류 | 범위                 | 검증 내용                                            | 상태 |
| ----------------- | ---- | -------------------- | ---------------------------------------------------- | ---- |
| RUNTIME-SSE-001   | 단위 | Provider SSE parser  | 미완성 이벤트가 1MiB를 넘으면 즉시 거부              | 통과 |
| RUNTIME-SSE-002   | 단위 | 채팅 controller      | 실행 계층이 예외를 던져도 SSE response `end` 호출    | 통과 |
| RUNTIME-SSE-003   | 단위 | Provider timeout     | 120초 동안 chunk가 없으면 upstream abort             | 통과 |
| RUNTIME-SSE-004   | 회귀 | 정상 Provider stream | 분할 chunk·사용량·완료 event 동작 유지               | 통과 |
| RUNTIME-WEB-001   | 빌드 | Browser SSE parser   | 1MiB client buffer 상한의 typecheck                  | 통과 |
| RUNTIME-SSE-005   | 단위 | SSE response writer  | `write=false`이면 `drain` 전까지 event producer 대기 | 통과 |
| RUNTIME-SSE-006   | 단위 | 대화별 timeout       | 1초 override 적용·전용 timeout 오류 반환             | 통과 |
| RUNTIME-TRACE-001 | 단위 | 요청 추적 저장소     | 기록 ID index로 stream 갱신·완료 항목 조회           | 통과 |
| RUNTIME-TRACE-002 | 단위 | 요청 추적 저장소     | process 64MiB 예산 초과 시 가장 오래된 기록 제거     | 통과 |
| RUNTIME-TRACE-003 | 단위 | 요청 추적 저장소     | trim·session 종료 시 index와 byte 합계 동시 정리     | 통과 |
| RUNTIME-CHAT-001  | 단위 | 대화 상세 API        | 기본 50개·최대 100개 pagination 입력 검증            | 통과 |
| RUNTIME-CHAT-002  | 단위 | Web message page     | 이전 page 병합 시 중복 제거·시간순 유지              | 통과 |
| RUNTIME-CHAT-003  | 회귀 | 분기 전환·재생성     | 활성 경로와 최신 답변 후보 탐색 유지                 | 통과 |
| RUNTIME-CHAT-004  | 통합 | PostgreSQL 활성 경로 | 다단계 재생성 경로·50개 경계·cursor 연속 조회        | 대기 |
| RUNTIME-WEB-002   | 단위 | 대화 비동기 상태     | 이전 fetch 취소·최신 요청만 화면 상태 반영           | 통과 |
| RUNTIME-MODEL-001 | 단위 | Provider 모델 조회   | stream 5MiB 초과 즉시 cancel                         | 통과 |
| RUNTIME-MODEL-002 | 단위 | Provider 모델 조회   | 최대 10,000개 원소 제한과 정상 분할 chunk 유지       | 통과 |

실행 결과:

- API 관련 3개 시험 파일, 15개 시험 통과
- API TypeScript typecheck 통과
- Web TypeScript typecheck 통과
- 변경 파일 Prettier 검사 통과

2단계 추가 실행 결과:

- API 관련 4개 시험 파일, 20개 시험 통과
- `drain` 전 producer 정지와 연결 종료 시 waiter 해제를 모두 확인
- API TypeScript typecheck와 전체 lint 통과

대화별 응답 타임아웃 확장 결과:

- `0017` 기본 120초와 `0018`의 1~1,800초 DB 제약 확인
- 대화 생성·수정 API 범위 검증과 1초 runtime override 확인
- timeout을 일반 network 오류와 구분한 `CHAT_PROVIDER_TIMEOUT` 반환 확인

5단계 요청 추적 저장소 개선 결과:

- API 전체 38개 시험 파일, 143개 시험 통과
- 전역 byte budget 초과 시 오래된 기록 제거와 session trim·종료 후 index 및
  byte 합계 정리 확인
- API TypeScript typecheck, 전체 lint와 변경 파일 Prettier 검사 통과

6단계 활성 분기·message pagination 결과:

- API 전체 38개 시험 파일, 145개 시험 통과
- Web 전체 5개 시험 파일, 14개 시험 통과
- API·Web TypeScript typecheck, 전체 lint와 production build 통과
- 실제 PostgreSQL 다단계 분기와 50개 초과 대화 검증은 Ubuntu 배포 후 수행

7단계 stale response·모델 조회 제한 결과:

- API 전체 38개 시험 파일, 148개 시험 통과
- Web 전체 6개 시험 파일, 16개 시험 통과
- 1MiB 분할 chunk 정상 결합, 여섯 번째 chunk에서 5MiB 초과 cancel,
  10,001개 모델 거부 확인
- 이전 Web 요청 abort와 요청 세대 불일치 상태 갱신 차단 확인
- 전체 lint, API·Web typecheck와 production build 통과

### 16.1 Ubuntu 5·6·7단계 통합 확인

배포 갱신 후 프로젝트 root에서 다음을 실행한다. 대화 ID를 생략하면 저장된
메시지가 가장 많은 대화를 자동 선택한다.

```bash
cd /home/totquf4171/modelnaru
chmod +x scripts/test-runtime-stages-5-7.sh
./scripts/test-runtime-stages-5-7.sh
```

특정 대화를 검사하려면 UUID를 전달한다.

```bash
./scripts/test-runtime-stages-5-7.sh \
  00000000-0000-4000-8000-000000000000
```

자동 시험의 인수 조건:

- API 대상 시험과 Web 대상 시험이 모두 종료 코드 0으로 끝난다.
- 활성 경로 진단에서 `active_path_messages`가 전체 분기 메시지보다 클 수
  없고, `initial_page_size`는 최대 50이다.
- 활성 경로가 51개 이상이면 `has_older_page`가 `t`다.
- 마지막 health 응답의 `status`가 `ready`다.

수동 시나리오:

1. **5단계 요청 추적**
   - 대화 설정의 전송 기록 보관을 3으로 저장한다.
   - 같은 대화에서 네 번 답변을 완료하고 전송 기록 창을 연다.
   - 최신 기록 세 개만 보이는지 확인한다.
   - 로그아웃 후 다시 로그인해 이전 session의 전송 기록이 사라졌는지
     확인한다.
2. **6단계 pagination·분기**
   - 활성 경로가 51개 이상인 대화를 연다.
   - 처음에는 최근 50개만 표시되고 상단에 `이전 메시지 불러오기`가
     보이는지 확인한다.
   - 버튼을 누르면 중복 없이 과거 메시지가 추가되고 읽던 위치가 갑자기
     이동하지 않는지 확인한다.
   - 마지막 답변을 두 번 재생성한 뒤 좌우 화살표로 각 답변을 왕복하고,
     선택한 답변 뒤에 새 메시지를 보내 해당 분기가 이어지는지 확인한다.
3. **7단계 stale response**
   - Chrome 개발자 도구 Network에서 `Slow 3G`를 선택한다.
   - 메시지가 많은 대화 A를 누른 직후 대화 B를 선택한다.
   - 요청 완료 후에도 제목·메시지·첨부·모델이 모두 B의 값인지 확인한다.
   - `이전 메시지 불러오기` 직후 다른 대화로 전환해 이전 대화 page가 새
     대화에 합쳐지지 않는지 확인한다.
4. **7단계 Provider 모델 조회**
   - 관리자 Provider 화면에서 기존 정상 Provider의 모델 동기화를 실행한다.
   - 모델 목록과 기존 활성 상태가 정상 표시되는지 확인한다.
   - 5MiB stream 중단과 10,000개 상한 자체는 자동 시험의 mock Provider
     검증 결과로 확인하며 실제 Provider에 과대 응답을 보내지 않는다.
# 웹 검색·현재 시각 시험 (2026-08-10)

- 자동: Migration 0019의 두 boolean 컬럼과 기본값을 확인한다.
- 자동: Anthropic `web_search_20250305`, Gemini `google_search` 요청 변환을 확인한다.
- 자동: Provider 요청 시스템 문맥에 UTC ISO 8601 현재 시각이 포함되는지 확인한다.
- 수동: 관리자가 검색 능력을 켠 모델만 대화 설정에서 검색을 선택할 수 있는지 확인한다.
- 수동: 검색이 필요한 최신 질문과 검색이 불필요한 질문을 각각 보내 Provider 동작과 요청 추적 기록을 확인한다.
- 수동: 대화의 저장된 시스템 프롬프트 원문에는 동적 시각이 누적되지 않는지 확인한다.

## 새 버전 디자인 검증 계획 (2026-09-30)

- 문서 확인: WEB_UI_SPEC.md의 새 기준과 현행 배포 기준의 적용 범위, ADR-025·026·027과 기존 ADR의 대체 상태, 구현 상태와 AGENTS.md 문서 색인을 대조한다. 문서 링크 대상 존재 여부와 diff 공백 오류를 확인한다.
- 실행 결과: 위 문서 간 참조·상태 구분과 로컬 참조 문서 존재 여부 확인, `git diff --check` 통과.
- 계획: 다크·라이트 데스크톱 채팅, 모바일 채팅, 관리자 Provider 화면의 시각 일관성을 검증한다.
- 계획: 긴 한국어·코드·표·모델명, 빈 화면·로딩·오류·첨부 처리 상태, 키보드 focus·대비·모바일 입력창을 검증한다.
- 계획: 설정 패널의 기본 닫힘·대화 병행 사용, 입력창 모델 선택, 관리자 사용량 진입, 모바일 목록·설정 왕복 시 대화·작성 내용 보존을 검증한다.
- 상태: 디자인 방향과 기본 화면 구성을 확정했으며 시안 검토·UI 구현·브라우저 시험은 미실행이다. 문서 변경이므로 런타임 시험을 재실행하지 않는다.
