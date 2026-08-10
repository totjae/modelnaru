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
