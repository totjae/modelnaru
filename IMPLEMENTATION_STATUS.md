# 구현 진행 현황

## UI-G 추가 UI 개선 — 로컬 완료 (2026-10-02)

WEB_UI_SPEC UI-G 기준 버튼 위계·무채색 새 대화·약한 선택색·답변44px/아이콘20px·아이콘만 재생성·/guest 분리·최신 모노그램 favicon/PNG/manifest 구현. Web31개·typecheck/build/lint·Edge 채팅56/진입·관리자128개 캡처 통과(TEST_PLAN 최신 절). 운영 배포·사용자 시각 인수 대기. 기존 미커밋 관리자 운영 문서 보존, API/DB/의존성 변경 없음.


## 관리자 운영 사용법 보완 (2026-10-02)

문서화 완료: README 관리자 계정 관리·DEPLOYMENT_RUNBOOK 4절에 ID/비밀번호/TOTP 등록·복구·초기 파일 정리를 상세화했다. CLI 구현과 정적으로 대조했고 실제 설정 변경/재시작은 수행하지 않았다. GIT-RESET의 old 삭제 대기 상태를 완료로 바꾸는 작업이 아니다.


## 2026-10-01 시안 로고

시안 모노그램 SVG를 생성하고 로그인·관리자·채팅 mark에 테마 색상으로 적용했다. WEB_UI_SPEC.md 상단 기준 및 TEST_PLAN.md 로고 검증 참조. N10-R1/N11-R1 보완 상태와 별개다.

최신 디자인: 사용자 승인된 무채색 매트·단일 보라 강조색을 N10 공통·채팅 앱에 적용했다. N11 관리자·로그인/게스트 UI에도 적용했다. WEB_UI_SPEC.md N10/N11과 TEST_PLAN.md 최신 결과를 따른다.

## 새 버전 작업 원장 (2026-09-30)

순서와 작업 계약은 [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)가 기준이며 실행 상태는 이 표에서만 관리한다. 문서 작성 완료와 기능 구현 완료를 구분한다.

| ID | 작업 | 상태 | 다음 조건/증거 |
| --- | --- | --- | --- |
| PLAN | 순서·인계 문서화 | 완료 | 실행 계획·AGENTS·개발 절차 갱신, 문서 검사 |
| HANDOFF | 전체 참고 문서 인계 | 완료 | HANDOFF.md 문서 지도·첫 작업 계약 작성, 문서 검사. N00 실행과 별개 |
| N00 | 기준선·적용 범위 | 완료 | HEAD·미커밋 문서·환경·201개 시험/typecheck/lint·문서 링크 확인. `TEST_PLAN.md`의 N00 결과 참조 |
| N01 | 실행·API·DB 계약 | 완료 | CHAT_STATE/API/DATABASE/GUEST/ADMIN_LOGGING N01 절과 ADR-032/036. 작업 발견·원자 종료·출력 상한 보완 확정, 구현·실DB 검증은 N04~N09 |
| N02 | Provider·보안·운영 계약 | 완료 | 관련 기준 문서 N02 절과 ADR-033/036. 실제 직렬화 frame byte·upstream/GET 상한 보완, 구현·실연동 검증은 N04~N12 |
| N03 | UI 시안·컴포넌트 계약 | 완료 | 매트 방향·단일 강조색 승인, 8종 렌더링 검토와 사용자 후속 진행 요청. TEST_PLAN.md N03 종료 기록·ADR-037 참조 |
| N04 | schema·config·시험 기반 | 완료 | `0020_n04_foundation.sql`, config v2·CLI init. mihoservice_server의 분리된 PostgreSQL 17 테스트 DB에서 신규 설치·재실행·제약/경합 시험 22개 통과, 전체 typecheck·lint 통과 (`TEST_PLAN.md` 최신 절). 운영 미적용 |
| N05 | parser·공통 호출 | 완료 | 세 protocol terminal·오류/EOF·1 byte 분할·usage/byte·취소/timeout fixture. API 38 file·178 test/typecheck/lint 통과, `TEST_PLAN.md` N05 결과. 실제 Provider 연결은 별도 |
| N06 | 지속 생성·quota | 완료 | 독립 job API·DB 시작/종료 transaction·재접속·SSE revision/버퍼·quota/slot·세션 폐기·재시작 복구 구현. 격리 PostgreSQL+로컬 mock Provider·별도 컴파일 API 프로세스에서 실제 HTTP/SSE·프로세스 재시작을 검증했고 N06 관련 3개 파일·7개 시험이 통과했다(`TEST_PLAN.md` 최신 N06 절). 운영 미적용, UI는 N10 |
| N07 | 커스텀 Provider | 완료 (fixture 인수) | N07-R1/R2 도메인 lookup·HEAD/204/205 변환을 수정하고 실제 소켓 시험, API 190개, 수정 빌드의 격리 DB·HTTP 시험 2개를 통과했다(`TEST_PLAN.md` 최신 보완 절). 실제 공인 HTTPS/자격증명·Docker→로컬 추론 엔진은 N13 인수 |
| N08 | 컨텍스트·요약·제목 | 완료 | 입력/출력·이미지 budget, 제한된 요약과 호출별 usage, 관리자 제목 API·공유 슬롯·조건부 저장 구현. API 203개(격리 PostgreSQL/실제 HTTP 5개 포함) 및 종료 회귀 추가 후 로컬 199개, typecheck/build/lint 통과. 상세 실행 구분은 TEST_PLAN.md N08. UI·실 Provider·운영 배포는 후속 단계 |
| N09 | 탐색·설정·첨부 API | 완료 | N09-R1/R2 수정: 재처리 오류 code/status 보존, 같은 transaction의 PATCH/충돌 activeJob 조회. API 48개 파일·214개 통과(실DB 6개 포함), 실제 HTTP streaming PATCH/충돌·terminal 회귀, typecheck/build/lint 통과. TEST_PLAN.md 최신 보완 절. 실제 OCR·UI·배포 인수는 후속 단계 |
| N10 | 공통·채팅 UI | 완료 (보완 검증) | N10-R1 명시 제목 편집만 PATCH, 일반 설정·409·자동 제목 polling 보존. Web 31개/typecheck/build/lint, 실제 HTTP/SSE 브라우저·22개 캡처 통과. TEST_PLAN.md 최신 보완 참조 |
| N11 | 관리자·진입 UI | 완료 (보완 검증) | N11-R1 imageTokenEstimate 입력·저장/실패 초안·로드·null 해제, 실제 서버 contextBudget 함수 검증. Edge HTTP 167건·63개 캡처 통과. 실API/DB/Provider 전체 인수 N13 |
| N12 | 복구·패키징·설치 | 완료 (격리 배포 검증) | CLI 복구·standalone·job SSE·정상 종료 저장·Valkey 제거·log rotation·update/health 구현. 별도 Docker/API/PostgreSQL/mock의 설치·복구·SIGTERM/SIGKILL·업데이트·stop/start 11개 인수 통과. 임시 환경 정리, 운영 미변경. TEST_PLAN.md N12 참조 |
| N13 | 통합 인수 | 완료 | 필수 HTTPS/OCR/제목/모바일·스크린리더/이미지 실제 인수 통과. 사용자 sudo 정리 후 SSH 재확인: 시험 컨테이너0/network0/image0·root/site/cert 제거, 운영5개 healthy 유지. TEST_PLAN.md 최상단·tmp/n13/server-cleanup-result.json 참조 |
| N14 | 서버 전환 | 완료 | 2026-10-02 https://chat.mihoservice.xyz → 별도 modelnaru-v2 새 DB/config2/migration20 전환. 기존 관리자 보존·실제 HTTP/SSE/취소/HTTPS·CLI health·외부 Edge 통과, 실제 rollback 후 재전환 성공. 새4개 healthy·기존5개 중지/보존, 사용자/Provider 빈 설치. TEST_PLAN.md 최상단 참조 |
| UI-F | 운영 UI 피드백 F01~F11 | 완료 (로컬 구현·검증) | 메인 UI-F0~F6 순차 완료. Web31개·typecheck/build·tmp 제외 소스 lint 통과. Edge 채팅56/관리자124개 캡처,9개 폭·2테마·경계/초안 회귀 통과. 전체 pnpm lint는 기존 tmp/n13 파서 오류로 실패. TEST_PLAN 최신 UI-F 결과 참조. 사용자 시각 확인·실기기 재검증·운영 반영 별도 |
| GIT-RESET | Git 기반 전체 재설치 | 부분 완료·old sudo 삭제 대기 | codex/refactor-v2 원격 push/서버 clone·Linux build·새 관리자/DB/키·HTTPS 생성/SSE/취소·4개 healthy 통과. old 전용 삭제 script dry-run 완료, 사용자 sudo 실행 후 old0 재확인 필요 |

완료 증거는 TEST_PLAN.md 또는 해당 계약 시험 문서에 기록하고 이 표에서 참조한다. 구현을 시작하면 담당자·수정 파일·차단 사유·다음 인계 내용을 추가한다. 아래 날짜별 기록은 배경과 결정 이력이며 이 원장의 실행 상태를 덮어쓰지 않는다.

## 2026-09-30 종합 감사 결과

- 완료: 새 버전 명세와 현행 코드 정적 대조, stream EOF·오류 이벤트 mock 재현 2건, 현재/초기 명세 적용 범위 구분.
- 발견: AI 동시성 설정 미연결, quota 확인 전 요약 호출, 불완전/오류 stream의 성공 처리, 컨텍스트 budget 부족. 현재 코드 수정은 이번 감사 범위에서 수행하지 않았다.
- 명세 보완 대기: SPEC_AUDIT.md AUD-01~15. P0 계약을 구체화한 뒤 핵심 실행부를 구현하고 P1 항목은 출시 전 검증한다.
- 코드·DB·서버 변경 없음. 감사 완료와 새 버전 구현 완료를 구분한다.

## 2026-09-30 지속 생성·사용성 개선 범위 확정

- 사용자 확정: 화면 전환·새로고침 후 계속 생성, 모델 즐겨찾기.
- 위임에 따른 설계 결정: 서버 작업·재구독 분리, checkpoint·revision·시작 중복 방지, 명시적 종료·재시작 복구, 주체별 즐겨찾기·모델 검색, 제목 검색·고정, 오류·첨부·컨텍스트 안내와 Provider 진단.
- 기본 자원 정책: 대화·주체당 생성 1개, 전체 Provider 호출 3개, 작업 총 실행 기본 30분. 시험 후 조정 시 기준 문서를 함께 갱신한다.
- 구현 순서: 작업 수명·API/DB 계약 → Provider 공통 실행·진단 → 새 채팅 UI·탐색 → 첨부·오류·컨텍스트 안내 → 통합·설치 검증.
- 상태: 설계 확정·미구현. 구체적 schema·API와 체크포인트 주기 등은 구현 직전 설계하며 서버·DB는 변경하지 않았다.

## 2026-09-30 커스텀 Provider 계획

- 기능 포함 확정: 관리자 직접 주소·API 키 등록과 로컬 모델 서버 연결.
- 설계안: OpenAI 호환 우선, 키/무인증, 자동 모델 조회 또는 수동 ID, 명시적 로컬 목적지 승인. 상세 기준은 PROVIDER_REGISTRATION_SPEC.md와 SECURITY_SPEC.md에 기록했다.
- 미구현·미검증: Adapter·등록 UI·API·DB·Docker 연결 변경과 실제 로컬 모델 계약 시험.

## 2026-09-30 설정 동작·자동 제목 계획 추가

- 확정: 대화별 모델 즉시 저장·다음 요청 적용, 생성 중 변경 비활성화, 고급 설정 적용 버튼·미적용 변경 확인, 새 대화 Provider 기본값.
- 기능 포함 확정: 지정 모델을 통한 대화 제목 자동 생성과 수동 제목 수정.
- 추가 확정: 제목 생성 모델은 관리자 전역 설정으로 지정하며 사용자·게스트별 모델 설정은 제공하지 않는다.
- 세부 설계 제안: 첫 정상 답변 후 1회, 실패 시 임시 제목 유지, 수동 제목 우선, 보조 호출 사용량 분리. 아직 사용자 확정 전이다.
- 미구현: UI·API·DB·Provider 호출 변경. 검증은 문서 간 기준·상태와 diff 검사만 수행한다.

## 2026-09-30 새 버전 계획

- 디자인 방향 확정: 사용자·관리자 UI 전면 개편, Linear·Raycast·Craft 참고, 매트 표면과 아이리스 보라색 강조. 기준은 WEB_UI_SPEC.md와 ADR-025에 기록했다.
- 전환 조건 확정: 기존 운영 데이터 보존·이전은 필수가 아니며 새 설치를 허용한다(ADR-026). 실제 초기화는 수행하지 않았다.
- 기본 화면 구성 확정: 채팅의 왼쪽 목록·중앙 본문과 입력창·기본 닫힘 오른쪽 설정 패널, 입력창 모델 선택, 관리자 사이드 메뉴와 사용량 첫 화면, 간결한 첫 방문 화면, 모바일 목록·설정 별도 화면(ADR-027).
- 계획: 세부 조작·전체 기능 범위·구체적 디자인 토큰과 시안. 구현과 브라우저 검증은 미착수다.
- 아래 기능별 현황은 현재 배포 버전의 기록이며 새 버전 완료 상태를 의미하지 않는다.

## 상태 정의

- `계획`: 명세만 존재
- `명세 완료`: 상위 요구와 정책 문서가 확정되었으나 코드는 아직 없음
- `구현 중`: 코드 작성과 검증 진행 중
- `문서화 필요`: 코드는 있으나 상세 문서가 최신이 아님
- `구현 완료`: 코드와 문서가 일치하고 기본 시험 통과
- `검증 완료`: 인수·통합·보안 시험까지 통과
- `보류`: 후속 단계로 연기

## 현재 상태

| 영역                 | 상태      | 비고                                                                                                                                                                                                                                                    |
| -------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 상위 요구사항        | 명세 완료 | 전체 요구·provider·log·기술·배포·config 문서 존재                                                                                                                                                                                                       |
| 개발 문서 관리 지침  | 명세 완료 | root `AGENTS.md`, 문서 색인·갱신 기준·신규 문서 등록 형식                                                                                                                                                                                               |
| 프로젝트 골격        | 구현 완료 | pnpm monorepo, Next.js Web, NestJS API, 단일 gateway 구성                                                                                                                                                                                               |
| 시작 config loader   | 구현 완료 | YAML schema·경로·secret·권한 검증과 단위시험 완료                                                                                                                                                                                                       |
| `apichat-admin` 도구 | 구현 완료 | init·Argon2id·TOTP·validate·show·render-env 구현                                                                                                                                                                                                        |
| 데이터베이스         | 구현 중   | 1~~3차 Ubuntu 확인, 4~~18차 권한·게스트·채팅·요약·사용량·attachment·로그·OCR·대화 timeout migration 로컬 검증, startup hook DB readiness 대기 적용                                                                                                      |
| 인증·session         | 구현 완료 | 관리자 TOTP·일반 사용자 login·공통 session·CSRF, Ubuntu 사용자 최대 3 session 확인                                                                                                                                                                      |
| 사용자 관리          | 검증 완료 | 관리자 CRUD·비밀번호·session 폐기·감사 기록·Web UI Ubuntu 검증 완료                                                                                                                                                                                     |
| provider registry    | 구현 완료 | 전체 catalog parameter profile, 핵심 4개 등록·암호화·동기화 UI와 실제 key 확인                                                                                                                                                                          |
| Web UI 기반          | 구현 중   | 실제 port·하드웨어를 제외한 계층·설계 원칙·사용자와 관리자 역할 분리 중심 포트폴리오, 관리자 탭·Usage·서버 보관 설정, Provider 활성 모델 초록 상태 버튼, 보라 MN·슬림 헤더·고정 높이 대화 목록·행별 삭제·설정 모달·낮은 화면 입력창 보존, 시각 E2E 대기 |
| 모델 권한·호출 제한  | 구현 완료 | 사용자·게스트 allowlist·일일 제한 관리자 UI와 DB 원자적 예약 구현, AI 호출 연결 대기                                                                                                                                                                    |
| 게스트 체험          | 구현 중   | 공유 코드·독립 session·권한·할당량·대화 소유권과 logout·설정 저장 시 원본 cleanup queue 처리 구현, HTTPS E2E 대기                                                                                                                                       |
| AI streaming         | 구현 중   | Provider별 동적 parameter policy·3종 SSE·upstream 취소 구현, 전체 adapter는 후속                                                                                                                                                                        |
| 대화·branch·요약     | 구현 중   | CRUD·분기·자동 요약·대화방별 모델·동적 Provider 파라미터 저장 구현, Ubuntu 재검증 대기                                                                                                                                                                  |
| 파일 처리            | 구현 중   | 텍스트·PDF·JPEG·PNG·WebP 저장·추출·멀티모달, 로컬 Poppler·Tesseract 한국어·영어 스캔 PDF OCR, DB 보관 설정·1시간 cleanup worker·cascade queue·고아 정리·만료 metadata UI 구현. 악성 검사 후속                                                           |
| 관리자 log           | 구현 완료 | Usage·audit·보안·파일·시스템 통합 조회, 필터·상세·CSV·범주별 retention과 cleanup 구현. Ubuntu migration·화면 E2E 대기                                                                                                                                   |
| session 전송 기록    | 구현 완료 | 사용자·게스트 대화별 0~3개, session 최대 30개·2MB 메모리 기록, secret·이미지 마스킹, 종료·삭제 연동과 Web 상세 모달 구현. Ubuntu E2E 대기                                                                                                               |
| Ubuntu 배포          | 검증 완료 | Ubuntu Compose·외부 Nginx·HTTPS·gateway·health 실통신 확인                                                                                                                                                                                              |
| 외부 backup          | 보류      | 초기에는 구성하지 않음                                                                                                                                                                                                                                  |

이 문서는 [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)의 절차에 따라 각 개발 작업에서 갱신한다.

## 2026-07-23 Provider registry 확장

- Provider Manager 원격 registry 32개 template: 구현 완료
- bearer·bearer-optional 인증, 동적 모델 조회, static model 병합: 구현 완료
- Cloudflare Account ID 고정 URL 치환과 검증: 구현 완료
- 일반 채팅 Temperature 1.0 초기값: 구현 완료
- Vertex AI·AWS Bedrock·GitHub Copilot 전용 인증 adapter: 보류
- Gemini Express·NovelAI 실제 계약 adapter: 보류

## 2026-07-27 런타임 안정성 감사 후속

- 1단계 SSE 버퍼 상한·Provider idle timeout·오류 종료 보장: 구현 완료, 단위 시험·API/Web typecheck 통과
- 2단계 SSE response backpressure: 구현 완료, drain·연결 종료 단위 시험과 typecheck·lint 통과
- 3단계 파일 처리 bounded semaphore와 취소: 구현 완료, queue 상한·대기 취소·종료 정리 단위 시험과 typecheck·lint 통과
- 4단계 이미지 총용량·JSON 중복 생성 제거: 구현 완료, 20MiB 기본 요청 상한·순차 base64 변환·Provider 요청 단일 직렬화·binary 제거 trace 사본 적용 및 단위 시험·typecheck 통과
- 대화별 응답 타임아웃: 구현 완료, 일반 대화 설정에서 기본 120초·1~1,800초 저장, 첫 응답·stream chunk idle timer와 전용 오류 적용, Ubuntu 검증 대기
- 5단계 요청 추적 전역 byte budget·O(1) 조회: 구현 완료, process 64MiB 상한·오래된 기록 제거·ID index·정리 경로 일원화 및 API 전체 143개 시험 통과
- 6단계 활성 분기 중심 대화 조회·pagination: 구현 완료, Provider 컨텍스트·상세 조회 활성 경로화와 최근 50개·최대 100개 cursor page 및 Web 이전 메시지 병합 구현, Ubuntu PostgreSQL 검증 대기
- 7단계 Web stale response·Provider 모델 조회 streaming 제한: 구현 완료, workspace·대화·이전 page 요청 취소 및 최신 세대 검증, 모델 목록 streaming 5MiB·10,000개 상한 적용과 전체 회귀시험·build 통과
# 2026-08-10 구현 현황

- 완료: 모델별 웹 검색 능력 관리, 대화별 웹 검색 설정, Anthropic·Gemini·LLM Gateway 요청 변환.
- 완료: 모든 Provider 호출의 시스템 문맥에 서버 기준 UTC ISO 8601 현재 시각 동적 주입.
- 검증 중: 실제 자격증명을 사용한 Provider별 검색 응답 및 인용 표현 확인.
- 보류: OpenAI Responses API 웹 검색 어댑터와 검색 인용의 별도 구조화·영구 저장.
