# 운영 UI 피드백 작업 인계

## 1. 목적·적용 범위

2026-10-02 사용자 주석 이미지 1~6을 구현 가능한 작업으로 나눈 인계 계약이다. N00~N14 완료 후 운영 UI 보완이며 N13 기능 인수 결과를 취소하지 않는다. 후속 사용자 구현 요청에 따라 UI-F0~F6의 제품 수정·로컬 브라우저 검증을 완료했다. 사용자 시각 확인과 운영 반영은 별도이며 실제 결과·한계는 TEST_PLAN.md 최신 UI-F 완료 절을 따른다. 실행 상태는 IMPLEMENTATION_STATUS.md, 순서와 의존관계는 IMPLEMENTATION_PLAN.md, 동작·치수의 원장은 WEB_UI_SPEC.md의 `UI-F 운영 피드백 계약`이다.

원본: `C:/Users/Jae/Desktop/모델나루 컨펌/1.jpg`~`6.jpg`. 저장소 인계용 동일 사본은 `design/ui-feedback/1.jpg`~`6.jpg`다. 노란 주석이 사용자 요구이고, 아래 작업 방식과 WEB_UI_SPEC의 구체 치수는 이를 구현하기 위한 메인 결정이다. 이미지를 원격 서비스에 전송하지 않는다.

## 2. 먼저 읽을 문서·현재 환경

1. AGENTS.md → HANDOFF.md 최신 절 → IMPLEMENTATION_STATUS.md.
2. WEB_UI_SPEC.md `UI-F 운영 피드백 계약`과 이 문서 전체 → IMPLEMENTATION_PLAN.md `UI-F 작업 순서`.
3. TEST_PLAN.md UI-F 검증 계획 및 기존 N10/N11 브라우저 시험. 인증/설정 계약은 SECURITY_SPEC.md·API_SPEC.md, 운영은 README.md·DEPLOYMENT_RUNBOOK.md 최신 N14 절.

현재 운영은 N14 인계 기준 `modelnaru-v2`이며 Git checkout이 아닌 archive 배포다. 작업 직전 최신 상태를 다시 읽는다. 운영 전환·재배포·초기화는 이번 UI 계획 범위가 아니다. N14 일회성 배포 스크립트를 재실행하지 않는다. 사용자 데이터·설정·Provider 키와 기존 rollback 자원을 보존한다. 유료 호출은 필요하지 않으며 N13의 소진된 승인을 재사용하지 않는다.

메인이 조사·구현·검증을 담당한다. 공유 styles.css와 chat-workspace.tsx 때문에 아래 작업은 순차 수행한다. code_light에 상태 관리·dialog·인증 설계를 위임하지 않는다. 단순 작업을 위임하는 경우에도 메인이 별도 계약으로 범위를 한정한다.

## 3. 이미지별 추적표

| ID | 근거 | 요구사항 | 담당 단계 |
| --- | --- | --- | --- |
| F01 | 1.jpg | 관리자 메뉴와 본문 시작 높이 일치 | UI-F3 |
| F02 | 2.jpg | Provider 상단/접기 항목 여백, 공통 새로고침 우측 정렬 | UI-F3 |
| F03 | 2.jpg | 일반 등록 → 커스텀 등록 → 지원 카탈로그 순서 | UI-F3 |
| F04 | 3.jpg | 이미지 예약 토큰 설정을 필요할 때 펼치고 모델 이름순 정렬 | UI-F4 |
| F05 | 4.jpg | 로그인 모드 전환 시 카드/소개 영역 높이와 위치 안정 | UI-F5 |
| F06 | 5.jpg | 대화 카드 축소·이름 버튼 제거·고정/삭제 아이콘·말줄임 | UI-F2 |
| F07 | 5.jpg | 본문과 작성창이 가용 폭 활용 | UI-F1 |
| F08 | 5.jpg | 알림 표시로 본문이 밀리지 않는 토스트 | UI-F2 |
| F09 | 5.jpg | 작성창 축소·모델 선택을 보내기 왼쪽에 배치 | UI-F2 |
| F10 | 5.jpg | 설정 패널 폭 확대·하단 버튼 2×2 정렬 | UI-F1 |
| F11 | 6.jpg | 설정 오버레이가 왼쪽으로 붙는 현상 수정 | UI-F1 |

## 4. 단계별 실행 계약

모든 단계 공통: 아래 명시된 파일만 수정하며 새 제품/시험 파일 생성은 기본적으로 허용하지 않는다. 필요한 파일이 추가로 확인되면 메인이 사유·정확한 경로를 이 계약에 먼저 등록한다. 매 단계 결과 문서 수정 허용은 WEB_UI_SPEC.md, TEST_PLAN.md, IMPLEMENTATION_STATUS.md, IMPLEMENTATION_PLAN.md, HANDOFF.md, 이 문서다. 명세를 중복 작성하지 않고 원장을 참조한다.

### UI-F0 — 기준선 확보

- 선행: 본 인계. 읽기: 위 문서와 이미지 전체, 수정 대상 코드, 기존 브라우저 harness.
- 수정 허용: 결과 문서만. 생성 허용: `tmp/ui-feedback/` 아래 로컬 캡처·검사 로그·수정 전 파일 상태 기록. tmp 증거는 커밋 가능한 문서의 결과 설명을 대체하지 않는다.
- 수행: git status/diff로 기존 변경을 기록하고 현재 빌드에서 이미지의 화면을 loopback fixture로 재현한다. F11은 dialog 표시 상태에서 폭을 왕복 변경해 확인한다. 기존 실패와 이번 수정으로 발생한 실패를 구분한다.
- 코드 관찰: chat-dialog.tsx는 1024px 경계에서 show/showModal을 전환한다. styles.css에는 static drawer·1023px 이하 fixed inset·767px 이하 width와 후속 덮어쓰기가 공존한다. chat toast는 static이며 기본 drawer 폭은280px이다. 이것은 조사 출발점이며 F11의 원인을 확정한 것은 아니다.
- 완료: 수정 전 캡처/폭/재현 절차 확보. 환경 오류로 재현하지 못하면 제한을 기록하고 구현 완료로 표시하지 않는다.

### UI-F1 — 채팅 레이아웃·설정 패널

- 선행: UI-F0. 읽기: WEB_UI_SPEC UI-F의 F07/F10/F11, chat-dialog.tsx, chat-workspace.tsx, styles.css.
- 수정 허용: `apps/web/app/styles.css`, `apps/web/app/chat-dialog.tsx`, `apps/web/app/chat-workspace.tsx`, `apps/web/test/n10-browser.mjs`.
- 수행: 그리드/본문 폭과 panel 위치·폭을 함께 수정하고 하단 버튼 DOM을 2×2로 정렬한다. 상충하는 해당 selector를 정리하며 파일 끝에 덮어쓰기만 반복하지 않는다. 공용 확인 dialog는 별도로 보존한다.
- 보존: 열려 있는 설정 초안, 409 충돌 처리, 생성 중 제한, modal focus trap/Escape/호출 버튼 복귀, 데스크톱 비모달 접근성, 저장/취소/삭제 동작.
- 완료: 패널 open 상태에서 1023↔1024px 왕복해 오른쪽 위치·초안·포커스·스크롤 유지, 320~2560px 가로 넘침 없음, 남는 본문 폭 활용 및 F10 정렬.
- 중단: 인증/API/DB 변경이 필요해지거나 기존 dialog 기능이 깨지면 원인을 먼저 기록한다. 화면만 맞추려고 focus/충돌 시험을 제거하지 않는다.

### UI-F2 — 대화 목록·작성창·알림

- 선행: UI-F1. 수정 허용: `apps/web/app/chat-workspace.tsx`, `apps/web/app/chat-icons.tsx`, `apps/web/app/chat-model-picker.tsx`, `apps/web/app/styles.css`, `apps/web/test/n10-browser.mjs`.
- 읽기: WEB_UI_SPEC UI-F의 F06/F08/F09, 기존 titleChanged·draft·첨부·SSE 상태 경로.
- 수행: 목록 이름 액션 제거/아이콘 배치, 모델 선택 위치와 작성창 높이 조정, 레이아웃 밖 토스트. 요청 payload·API 순서는 변경하지 않는다.
- 보존: 고정/삭제 확인·선택 상태, 제목은 설정에서 편집 가능, 자동 제목 보존, 모델 검색/즐겨찾기/선택 복귀, 첨부·취소·중복 전송 방지, 한국어 조합 입력, 에러 접근성.
- 완료: 긴 제목·다자리 메시지 수·빈 목록·첨부10개·긴 모델명·다중 행 입력·생성/실패/취소 상태 검증. 알림 전후 본문/작성창 bounding box가 동일하고 타이머는 unmount 시 정리된다.
- 중단: 오류 안내가 사라져 복구할 수 없거나 전송/설정 초안이 유실되면 완료 처리하지 않는다.

### UI-F3 — 관리자 공통·Provider 등록 배치

- 선행: UI-F2(공통 CSS 충돌 방지). 읽기: WEB_UI_SPEC UI-F F01~F03, 관리자 각 section 구조.
- 수정 허용: `apps/web/app/styles.css`, `apps/web/app/admin-workspace.tsx`, `apps/web/app/provider-manager.tsx`, `apps/web/app/custom-provider-form.tsx`, `apps/web/app/usage-dashboard.tsx`, `apps/web/app/access-manager.tsx`, `apps/web/app/admin-log-viewer.tsx`, `apps/web/app/server-settings.tsx`, `apps/web/test/n11-browser.mjs`.
- 수행 범위는 레이아웃·header 정렬·등록 블록 순서만이다. 기존에 없는 새로고침 버튼을 새로 추가하지 않는다.
- 보존: 폼 입력·인증·등록·동기화·진단·암호화 계약·busy/실패 상태. 숨긴 폼의 필수 필드가 다른 폼 제출을 막지 않도록 확인한다.
- 완료: 관리자 모든 탭에서 상단 정렬/새로고침 위치 확인, 일반·커스텀 각각 등록 fixture 통과, 좁은 폭에서 순서 유지/겹침 없음.

### UI-F4 — 모델 목록 간결화

- 선행: UI-F3. 수정 허용: `apps/web/app/provider-manager.tsx`, `apps/web/app/styles.css`, `apps/web/test/n11-browser.mjs`.
- 읽기: WEB_UI_SPEC UI-F F04 및 N10-R1/N11-R1 이미지 예산 계약.
- 수행: 모델별 예약 토큰 편집을 접기/펼치기로 이동하고 표시 이름 기준의 안정 정렬을 적용한다. 원본 state 배열을 직접 sort하지 않는다.
- 보존: null/정수 범위/빈 값 저장 시 이미지 off를 같은 PATCH로 보내는 규칙, 저장 실패 초안 유지, 관리자의 명시적인 이미지 활성화. 이 선행 조건 때문에 미설정 checkbox를 클릭해야만 편집할 수 있게 만들지 않는다.
- 완료: 이름 중복·숫자·대소문자·한글·비활성 모델·동기화 후 정렬, 미설정→편집→저장→활성화·실패 초안·값 삭제 경로를 fixture로 확인한다.

### UI-F5 — 로그인 모드 높이 안정화

- 선행: UI-F4. 수정 허용: `apps/web/app/page.tsx`, `apps/web/app/styles.css`, `apps/web/test/n11-browser.mjs`.
- 읽기: WEB_UI_SPEC UI-F F05, SECURITY_SPEC 인증 계약.
- 수행: 같은 위치의 form/card와 TOTP 행 공간을 확보한다. 인증을 두 요청/두 단계로 바꾸지 않는다. 모바일의 높이 제약은 스크롤로 처리한다.
- 보존: 관리자 인증에 TOTP 필요, 일반 사용자는 TOTP 제출/탭 정지 없음, 세션 복구·오류·게스트 진입·자동완성 동작.
- 완료: 모드 전환 전후 정상 상태에서 card 상단/하단·소개 로고 위치 차이≤1px, 오류가 있어도 텍스트 잘림 없음. 320px 폭/낮은 viewport·가상 키보드에서 로그인 가능.

### UI-F6 — 통합 시각 검증·인계

- 선행: UI-F1~F5 완료. 수정 허용: 두 기존 browser mjs와 결과 문서. 생성 허용: `tmp/ui-feedback/` 캡처/로그·검토용 `review.html`. 제품 결함은 해당 단계로 돌려보낸다.
- 완료: F01~F11별 before/after·viewport·실행 결과 연결, TEST_PLAN에 실제 명령/exit/미검증 기록, 사용자 확인용 시안 준비. 검증 완료와 사용자 시각 확인·운영 반영을 각각 구분한다.
- 운영 배포 명령/파일 변경은 제외한다. 사용자에게 로컬 결과와 남은 위험을 인계하고 최신 운영 데이터를 보존하는 별도 배포 작업으로 넘긴다.

## 5. 검증·인수 기준

저장소 root에서 기존 설치 도구를 사용한다. dependency/lockfile/환경을 임의 변경하지 않는다.

```powershell
pnpm --filter @modelnaru/web test
pnpm --filter @modelnaru/web typecheck
pnpm --filter @modelnaru/web build
pnpm lint
$env:MODELNARU_BROWSER_MODULE = 'C:/Users/Jae/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
node apps/web/test/n10-browser.mjs
node apps/web/test/n11-browser.mjs
git diff --check
```

Playwright 모듈 경로가 실제 존재하는지 먼저 확인한다. 없으면 현재 설치 경로를 확인해 지정한다. 기존 runner는 production Web build와 loopback fixture를 사용한다. API/실DB/유료 모델 시험으로 확대하지 않는다. 각 단계에는 해당 browser 검사만 실행하고 최종 제품 변경 뒤 전체 Web 검사와 두 runner를 한 번 수행한다. 실패를 숨기는 skip/expectation 완화는 금지한다.

시각 검증: dark/light, 폭320·390·768·1023·1024·1280·1440·1920·2560px. 전체 장면은 대표 폭390/1440/2560, 경계 폭은 패널·가로 넘침·모드 전환 집중 검사. 1023↔1024 왕복, 200% zoom, 높이600px, 긴 제목/모델명, 코드블록·표·이미지, 설정/모델 picker 열린 상태, 알림과 오류, 첨부/작성창 자동 성장 확인. 모바일 가상 키보드·음성 결과는 실제 수동 검증과 browser emulation을 구분한다.

아이콘 accessible name·고정 aria-pressed·최소44px 터치 대상, 키보드 탭 순서, modal/비modal 전환, 토스트 live region을 확인한다. 기존 N10 제목 PATCH 보존·N11 이미지 estimate 검사를 유지한다. CSS만 고정 문자열로 검사하는 무의미한 테스트를 추가하지 않는다.

## 6. 금지 범위·미결정

- DB/API/schema/권한/인증 정책, dependency/lockfile, Provider 요청/토큰 예산, 배포 스크립트·운영 설정, 시안 로고/색상 재설계는 제외한다.
- 공개 API·DB 입출력 변경 없음. UI 입력과 상태 전이만 기존 계약 안에서 바뀐다. 서버 명령이 바뀌지 않아 README/DEPLOYMENT_RUNBOOK 변경은 이번 범위에 해당하지 않는다.
- 구현을 막는 기능 결정은 없음. 구체 치수는 WEB_UI_SPEC의 구현 기준으로 확정하고 실제 캡처 검증 후 메인이 같은 원장을 갱신할 수 있다. 사용자가 별도로 승인한 디자인이라고 표현하지 않는다.
- 운영 반영 시점·배포할 release는 이번 문서 범위 밖이며 미결정이다. 최초 요청은 작업 순서와 인계 작성이었고 후속 요청으로 UI 구현·로컬 검증까지 수행했다. 운영 배포 권한으로 확대하지 않는다.
