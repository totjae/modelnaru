# 전체 명세 점검 결과

## 2026-10-02 N14 운영 전환 검증 완료

N13 필수 인수에 이어 새 v2 운영 전환·migration/설정·HTTP/SSE/취소·검증된 HTTPS·외부 Edge·실제 rollback/재전환·관리자 보존/빈 데이터·임시 자원 정리를 확인했다. TEST_PLAN/IMPLEMENTATION_STATUS 최신 N14 절 참조. 이전 N14 대기 판정은 당시 snapshot이다. 새 유료 호출은 하지 않았고 Provider별 지원 등급·장기 부하/host reboot/외부 backup 제외 범위를 유지한다.


## 2026-10-02 N13 최종 완료 갱신

필수 인수와 시험 환경 정리 완료. 사용자 sudo 종료 뒤 메인이 시험 자원0·site/cert/root 제거·운영5개 healthy를 읽기 전용 확인했다. TEST_PLAN/IMPLEMENTATION_STATUS 최신 기록 참조. N14 착수 가능, 실제 운영 전환은 미실행. 아래 정리 대기 표기는 당시 snapshot이다.


## 2026-10-02 N13 필수 인수 최종 판정 (최신)

AUD-06 이미지는 승인 추가1회/출력1024로 실제 색/도형/위치·SSE completed·known usage1159/631·DB 원장1개를 확인해 통과했다. AUD-07은 사용자 전 항목 문제없음 보고와 캡처5개로 모바일/스크린리더 수동 인수 통과다. 기존 HTTPS·OCR·제목·경합/복구/5분 부하 증거를 재사용하며 필수 N13 기능 인수는 충족했다. 다른 Provider 실제 생성/두 OS 전체/24시간·host reboot는 기존 지원 범위를 유지한다.

N14 준비 착수 가능. 실제 운영 전환은 이번에 미실행이며 시험 환경 정리는 사용자 sudo 대기다. TEST_PLAN.md/IMPLEMENTATION_STATUS.md 최신 절을 따른다. 아래 미통과/미검증 표는 당시 snapshot이다.


## 2026-10-02 N13 서버 인수 갱신 (최신)

아래 이전 감사 표의 잔여 항목은 당시 snapshot이다. 현재 판정은 IMPLEMENTATION_STATUS.md 및 TEST_PLAN.md 최상단을 따른다.

| 항목 | 최신 근거 | 잔여 |
| --- | --- | --- |
| AUD-03/08 보조 호출 | Gemini Pro 실제 자동 제목64/15초·usage84/59·auto 통과, 승인 유료 총2회 | 추가 유료 승인 없음 |
| AUD-05 목적지 | 서버 격리 앱→LLM Gateway 공인 HTTPS 호출, Web 공인 CA HTTPS 실제 Edge 로그인 통과 | 공인 HTTP 정책 유지, LAN 서버 주소 인수로 확대하지 않음 |
| AUD-06 이미지 | 실제 업로드·입력 후 max256 length 실패·안전 원인/usage 저장 | 이미지 내용 반영 인수 미통과 |
| AUD-07 실기기 | 동일 반응형 공인 Web·무료30초 fixture, 사용자 네 항목 문제없음 보고·캡처5개로 수동 인수 통과 | 정확한 기기/버전 미제공, Android Chrome 추정. 두 OS 모두/자동 음성 검증으로 확대하지 않음 |
| AUD-10 OCR | 브라우저→실제 Linux OCR→저장→mock가 실제 요청 문구 확인→SSE 완료→파일 삭제·DB 첨부0 | mock 답변을 실제 이미지 의미 인수로 치환하지 않음 |

N13 부분 완료·N14 대기. 운영 DB/서비스/계정은 미사용, 전용 site 추가로 사용자 host Nginx graceful reload만 수행했다.


## 2026-10-01 N13 인수 현황

현재 판정은 이 절과 TEST_PLAN.md N13, 실행 상태는 IMPLEMENTATION_STATUS.md가 원장이다. 아래 2026-09-30 결함 표는 수정 전 근거를 보존한 이력이며 현재 미수정 결함 목록이 아니다.

| 감사 | 구현·검증 근거 | N13 잔여 인수 |
| --- | --- | --- |
| AUD-01 지속 생성 | N06 실제 HTTP/SSE·PostgreSQL·재시작 회귀, N13 실제 Web 새로고침 복원 | 큰 답변 결과는 TEST_PLAN N13 참조 |
| AUD-02 동시성 | N06 실제 API 주체/전역 제한, N08 공유 슬롯 실DB, N13 5분 실제 SSE/RSS | 5분 시나리오만 검증, 24시간 부하 보장 아님 |
| AUD-03 quota | N06/N08 admission·예약·정산 경합 및 실제 API 회귀, N13 실제 keyless 요약/제목의 개별 usage·실패 격리 | 유료 보조 호출은 미실행·상용 지원 확대 주장 없음 |
| AUD-04 stream 종료 | N05 protocol fixture, N06/N07 실제 mock HTTP, N13 실제 LAN 및 LLM Gateway gemini-3.8-flash 정상 종료·SSE·usage/quota·안전 진단 | 다른 Provider별 실제 인증/정상/실패 인수는 fixture 수준. 기존 Gateway 비정상 응답 원인은 미확정 |
| AUD-05 목적지 | N07 DNS/IP/HEAD 회귀, 공개 OpenAI TLS 무인증401, 복구된 PC 사설 custom API→gemma4-12b 생성 지속/GET+SSE 복원·usage/quota/안전 진단 통과, 서버 Docker→공인 domain:8080 직접 생성 통과 | 192.168.0.12는 PC 망, :8080 확정. 공인 HTTP는 서버 앱 등록 정책 밖이므로 공인 HTTPS endpoint 또는 별도 정책 선택 필요; PC 앱/서버 직접 생성은 서버 앱의 공인HTTP 등록 인수 대체 불가 |
| AUD-06 context | N08 budget/이미지 실DB, N13 estimate UI 저장·실제 요약 max512/usage1383·195·요약 저장1개 | 실제 모델 이미지 입력 미실행, max128 요약 length 실패 기록 보존 |
| AUD-07 렌더링 | N10 CSP/XSS fixture, N13 실제 HTTPS 안전 Markdown·외부 로드 없음 | 모바일 실기기·IME·스크린리더 미실행 |
| AUD-08 보조 호출 | N08 실DB·N13 HTTP SIGKILL/재시작과 실제 LAN 요약 성공·제목 실패 격리 | gemma4-12b 고정64 제목은 length 실패. 호환 제목 모델의 실제 성공 인수 필요 |
| AUD-09 설정 | N09 실DB PATCH/409 activeJob, N13 일반 설정의 title_source 보존 | 명시 제목/충돌은 기존 N09/N10 증거 재사용 |
| AUD-10 첨부 | N09 lifecycle/오류 실DB·N10 UI, N13 한국어/영문 OCR engine·오류/정리 및 실제 텍스트/PDF/PNG HTTP·retry422·404·삭제·job 연결 | 전체 스캔 PDF HTTP→OCR는 PC Tesseract 부재로 미실행; Linux 격리 API 인수 필요 |
| AUD-11 탐색 | N09 소유권/keyset/즐겨찾기 실DB, N10 UI fixture | 기존 관련 증거 재사용, 동일 조합의 중복 시험 추가 없음 |
| AUD-12 복구 | N12 격리 Docker 실제 CLI·TOTP·session 폐기 | N12 증거 재사용 |
| AUD-13 설치/복구 | N12 설치·migration checksum·종료·재시작·동일 release update | N14 운영 전환/host reboot 미실행, 미래 migration 호환성은 미보장 |
| AUD-14 자원 | N13 실제 5분/3.06 MiB, paused 수신자만 종료·정상 수신자 정확 복원, RSS 최대 281.8 MiB<768 MiB | Windows API 시나리오 통과, Linux 24시간 부하로 확대하지 않음 |
| AUD-15 문서 | 단계별 계약·구현·fixture·실연동 구분 및 N13 결과 원장 갱신 | 필수 미검증이 있어 N14 대기 |

릴리스 후보 승인 보류. 사용자가 제공한 keyless 모델은 작업 PC에서 실제 API 생성까지, 복구된 공인 HTTP domain:8080은 서버 격리 Docker에서 직접 생성까지 검증했다. 서버의 앱 등록 경로에는 기존 공인 HTTPS/사설 literal 정책을 충족하는 endpoint 또는 명시적인 정책 선택이 필요하다. LLM Gateway의 선택 모델은 정상 생성·SSE·usage/quota와 안전 진단을 통과했고 다른 상용 Provider의 인증 생성은 fixture 수준을 유지한다. 테스트 인증서 HTTPS 통과를 웹 앱의 공인 인증서·외부 네트워크 인수로 치환하지 않는다. 실기기 인수도 남아 있다. 최신 실행 증거는 TEST_PLAN.md 최상단을 따른다.

## 2026-09-30 N02 계약 진행 기록

- AUD-04~07과 AUD-12~14의 Provider 종료·입력/출력 예산·커스텀 목적지·렌더링·TOTP 복구·설치/rollback 계약을 각 기준 문서 N02 절과 ADR-033에서 확정했다. AUD-02의 새 config 기본값도 SERVER_CONFIG_SPEC.md N02에서 맞췄다.
- 문서 계약의 완료는 stream parser 결함 수정, 실제 접속 검증, DB migration, browser 보안 시험 또는 배포 인수 완료가 아니다. 구현 단계와 필수 시험은 IMPLEMENTATION_PLAN.md N04~N13 및 TEST_PLAN.md를 따른다.

## 2026-09-30 N01 계약 진행 기록

- AUD-01~03과 AUD-08~11의 작업·quota·제목·설정·탐색 계약은 CHAT_STATE_SPEC.md, API_SPEC.md, DATABASE_SCHEMA.md, GUEST_ACCESS_SPEC.md, ADMIN_LOGGING_SPEC.md의 N01 절과 ADR-032에서 문서로 확정했다. 발견된 런타임 결함은 아직 수정하지 않았다.
- 이 기록은 N01 시점의 snapshot이다. 위 N02 절에서 후속 문서 계약을 확정했으며 감사 항목의 구현·실DB 시험 완료 판정은 아니다.

## 2026-09-30 새 버전 종합 재점검

### 판단과 적용 범위

제품 범위·디자인 방향은 충분하나 지속 생성, 커스텀 주소와 신규 렌더링에 관한 구현 계약은 아직 부족하다. 현재 코드에서 실제 개선 대상도 확인했다. 기능을 더 넓히기보다 아래 P0 계약을 확정하고 실패 경로를 먼저 검증한다. 사용자가 세부 개선 판단을 위임했으므로 구현 기술 결정을 위해 같은 승인을 반복 요청할 필요는 없다.

이 절이 현재 감사 결과다. 아래 기존 1~절은 초기 MVP 설계 당시 기록이며 새 버전 판단으로 사용하지 않는다. 특히 운영 환경·DB/API 문서가 아직 없다는 전제, 사용자당 동시성 2개 등 과거 수치는 현재 원장 문서와 구분한다.

점검 근거는 저장소 명세·구현·테스트 코드와 이 대화에서 앞서 수행한 서버 읽기 점검이다. 이번 감사에서는 서버를 다시 변경·시험하지 않았다. 이전 서버 점검에서 소스 commit 9926625, migration 19개 적용과 내부 health 정상을 확인했으며 배포 이미지와 소스의 완전 일치·외부 HTTPS·실제 Provider 전체 호환을 증명한 것은 아니다.

### 구현 전 필수 보완

| ID | 우선순위 | 누락·문제와 근거 | 필요한 조치·인수 기준 | 기준 문서 |
| --- | --- | --- | --- | --- |
| AUD-01 | P0 | 지속 생성은 방향만 확정됐고 작업 API·DB·revision·idempotency 보존 계약은 미정 | 시작/조회/구독/중지 계약, 원자적 snapshot과 이후 이벤트 연결, stale cursor 복구, key 보존·충돌·재시도 범위를 정한다. 재연결마다 Provider 호출·quota가 증가하지 않아야 한다 | API_SPEC, DATABASE_SCHEMA, CHAT_STATE_SPEC |
| AUD-02 | P0 | 현재 config에 AI 전역·사용자 동시성은 있으나 apps/api/src에서 해당 설정 참조가 없다. 새 명세 주체당 1개는 배포 기본 2개와 다르다 | 원자적 작업 admission과 실제 Provider 슬롯을 분리한다. 시작·요약·제목·종료·재시작에서 상한을 검증하고 config/UI/문서 기본값을 통일한다. 1개 정책에서는 A 생성 중 B 전송이 제한됨을 시안에서 명확히 알린다 | CHAT_STATE_SPEC, SERVER_CONFIG_SPEC |
| AUD-03 | P0 | chat-execution.service.ts에서 fitContext 후 reserveDailyRequest를 호출한다 | 한도 소진 상태에서 유료 요약이 먼저 실행되지 않도록 요청 admission·quota 예약/해제·전송 여부 기록 순서를 정한다. 실패 후 반복 시 보조 비용이 무제한 발생하지 않게 한다 | CHAT_STATE_SPEC, GUEST_ACCESS_SPEC, AI_INTEGRATION_SPEC |
| AUD-04 | P0 | 정상 종료 신호가 없는 EOF와 HTTP 200 stream 내 error가 완료로 처리됨. 아래 mock 재현 참조 | Provider별 정상 종료·오류·거부·빈 출력·길이 제한을 구분한다. 미완료 EOF는 부분 응답 실패로 보존하며 자동 유료 재호출하지 않는다 | AI_INTEGRATION_SPEC, PROVIDER_CONTRACT_TESTS |
| AUD-05 | P0 | 커스텀 주소의 DNS/실접속 검증과 로컬 승인 구현 방식·지원 프로토콜 범위가 미정 | 1차 프로토콜을 고정하고 URL 정규화·실연결 목적지 검증·DNS rebinding·IPv6·redirect·무인증을 계약 시험한다. Docker에서 호스트/LAN 연결을 실제 확인한다 | PROVIDER_REGISTRATION_SPEC, SECURITY_SPEC |
| AUD-06 | P0 | 컨텍스트 계산은 문자 수이며 출력 예약·이미지·메시지 overhead와 요약 모델 자체 입력 한도 계산이 불충분 | 본 모델과 요약 모델 각각 입력 budget을 계산한다. 출력 예약·안전 여유·첨부·이미지를 포함하고 모르는 한도는 명시한다. 요약 모델보다 큰 transcript를 그대로 보내지 않게 분할/거부 정책을 정한다 | AI_INTEGRATION_SPEC, CHAT_STATE_SPEC |
| AUD-07 | P0 | 새 UI는 Markdown·코드·표를 제공하지만 렌더링 신뢰 경계가 미정. 현 UI는 message.content를 텍스트로 출력 | raw HTML 기본 비활성, 링크 scheme 제한, 외부 이미지 자동 로드 정책, 외부 링크·클립보드 처리와 CSP를 확정한다. XSS fixture·긴 코드·미완성 Markdown streaming을 시험한다 | SECURITY_SPEC, WEB_UI_SPEC |

### 개발·출시 전 보완

| ID | 우선순위 | 누락·문제 | 필요한 조치·인수 기준 | 기준 문서 |
| --- | --- | --- | --- | --- |
| AUD-08 | P1 | 제목 모델 지정자는 확정됐으나 나머지가 여전히 제안이며 보조 모델 권한·한도와 실패 usage 처리가 미정 | 제목 1회·수동 제목 우선·실패 격리를 기본으로 확정하고 입력/출력/시간 예산과 관리자 지정 보조 모델의 권한 예외를 명시한다. 사용자는 제목 모델을 직접 채팅에 호출할 권한을 얻지 않는다. 실패·취소의 known/unknown usage를 보존한다 | CHAT_STATE_SPEC, ADMIN_LOGGING_SPEC |
| AUD-09 | P1 | 생성 중 UI 변경 금지만으로 다른 탭·session의 설정/분기 변경을 막지 못함 | 설정 revision/조건부 갱신과 서버 측 active job 검사, 모델 전환 시 비호환 파라미터 처리, 제목 생성과 수동 변경 경합을 정의한다 | API_SPEC, DATABASE_SCHEMA |
| AUD-10 | P1 | 첨부 처리 단계를 화면에 표시하려면 처리 job·상태 조회 계약 필요. 파일 TTL cleanup과 실행 중 사용 경합은 미정 | 처리 상태 조회/재시도/취소, 업로드 실패 정리, 메시지 수락 이후 첨부 snapshot 또는 사용 중 보호 정책을 정한다. 만료 metadata와 실제 입력 일치 검증 | FILE_PROCESSING_SPEC |
| AUD-11 | P1 | 대화 목록은 전체 조회이고 새 제목 검색·고정의 정렬·pagination 계약 미정 | 제목 검색은 서버에서 소유권 필터와 함께 수행한다. 고정/최근 정렬·안정 cursor·한도·동기화 시 선택 유지와 즐겨찾기 삭제 모델 처리를 정의한다 | API_SPEC, WEB_UI_SPEC |
| AUD-12 | P1 | 요구·설정 명세는 TOTP 일회용 복구 code를 약속하지만 보안 명세에는 미구현, CLI에는 secret 재발급만 있음 | 복구 code 구현 또는 CLI 기반 복구의 출시 정책을 하나로 정하고 실제 로그인·복구·기존 session 폐기를 시험한다. 제공하지 않는 기능을 README에서 약속하지 않는다 | SERVER_CONFIG_SPEC, SECURITY_SPEC, DEPLOYMENT_RUNBOOK |
| AUD-13 | P1 | 기존 데이터 폐기 허용은 이번 전환 조건이며 이후 업데이트 rollback 정책까지 해결하지 않음 | release 식별·설정 버전·DB 호환·종료 대기·부분 작업 종료와 신규 설치/업데이트 절차를 정한다. 호환성 확인 없이 이전 이미지에 현재 DB를 붙이지 않는다. 외부 backup은 기존 보류를 유지하되 로컬 복구 수단과 보장 범위를 명시한다 | DEPLOYMENT_RUNBOOK, README |
| AUD-14 | P1 | 1MiB SSE event 제한은 전체 생성 본문 상한이 아님. content 누적·summary 누적에 별도 byte 상한 없음 | 작업별 출력 byte/token·총시간·구독 수·버퍼·trace 한도와 Docker log rotation을 정한다. 대용량·느린 구독자 시험에서 메모리 증가가 유한해야 한다 | SERVER_CONFIG_SPEC, AI_INTEGRATION_SPEC |
| AUD-15 | P1 | SPEC_STATUS와 상태표에 초기/현행/새 버전이 섞이고 동일 정책이 여러 문서에서 다른 상태임 | 현재 확정 목록과 계약 대기를 구분하고 정책 원장을 지정한다. runtime 확인·단위 시험·실서비스 시험 등 증거 수준을 분리한다 | SPEC_STATUS, IMPLEMENTATION_STATUS, TEST_PLAN |

### 실제 코드 확인과 재현 결과

- 동시성: packages/config/src/schema.ts에 maximumGlobalAiGenerations/maximumAiGenerationsPerUser가 있으나 apps/api/src 검색 결과 소비 코드가 없다. 무제한 실행이 실제 부하에서 재현됐다는 뜻은 아니며 설정 강제가 연결되지 않은 정적 근거다.
- quota 순서: apps/api/src/chat-execution.service.ts에서 fitContext(약 149행), reserveDailyRequest(약 171행), active 등록(약 217행) 순서다. 따라서 요약 중 취소와 quota 거부 경계도 새 작업 설계에서 함께 해결해야 한다.
- stream: apps/api/src/chat-streaming.ts의 normalizeProviderStreamEvent와 EOF fallback을 mock Response로 직접 실행했다. 외부 접속·API 키 없이 truncated_without_finish는 events=[text_delta,done], threw=false, stream_error_event는 events=[done], threw=false였다. 정상 종료 없이 성공처럼 처리되는 두 경로를 확인했다.
- 컨텍스트: summarization.service.ts의 estimateContextSize는 Array.from(text).length다. chat-execution.service.ts의 effectiveContextLimit에서 모델 출력 토큰을 차감하지 않으며 이미지는 텍스트 budget 검사 뒤 붙인다. 요약 요청에도 요약 모델 contextWindow 기반의 입력 검사가 보이지 않는다.
- 저장: 현재 부분 본문은 ChatExecutionService의 문자열에 누적하고 complete/finishIncomplete에서 저장한다. 지속 생성·재시작 복원은 현재 기능이 아니며 별도 구현이 필요하다.
- UI: chat-workspace.tsx의 상태·SSE·통신·렌더링 결합은 기존 조사 결과와 같다. 분리는 계속 생성 계약과 함께 진행하고 CSS 재작성만으로 완료 처리하지 않는다.

### 작업 순서와 완료 판단

구체적인 의존관계·담당·파일 범위·완료 조건과 AUD별 추적은 [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)를 따른다. 실행 상태는 IMPLEMENTATION_STATUS.md의 새 버전 작업 원장이 기준이다.

1. P0의 작업 계약·admission/quota·Provider 정상/실패·컨텍스트·목적지 정책을 기준 문서에 구체화한다.
2. 실패 fixture와 실제 PostgreSQL 원자성/동시성 시험을 먼저 확보하고 백엔드 실행부를 정리한다.
3. 새 화면 시안을 검토하고 지속 생성·모델 선택·첨부를 공통 계약에 연결한다.
4. P1의 관리자 복구·사용량·배포·README와 실제 Provider/로컬 모델·브라우저 시험을 완료한다.

새 기능 확장은 이번 감사의 우선 조치가 아니다. vector DB, 다중 서버, 복잡한 plugin engine과 본문 검색은 후속으로 유지한다. 감사 완료는 새 버전 구현 완료를 뜻하지 않는다.

이번에 완료한 검증: 소스·문서 정적 대조, 외부 통신 없는 stream mock 2건, 문서 diff 검사. 첫 mock 실행은 루트에 tsx가 없어 실패했고 설치된 API workspace에서 재실행해 위 결과를 얻었다. 전체 회귀시험은 이전 201개 통과/1개 제외 결과를 이번 실행 결과로 재사용하지 않으며 이번 감사에서 재실행하지 않았다.

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

| 영역                      | 상태        | 점검 결과                                                                                            |
| ------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| 사용자 역할·회원가입 정책 | 확정        | 고정 관리자, 관리자 생성 사용자, 회원가입 없음, 공유 코드 기반 임시 게스트                           |
| 사용자 데이터 격리        | 확정        | 서버 소유권 검사와 사용자·게스트별 대화·파일 분리 원칙 존재                                          |
| 로그인·세션               | 부분 확정   | 사용자 3세션·24시간 idle·7일 absolute와 게스트 1시간 idle·24시간 absolute, 복구 절차는 미정          |
| 대화·분기                 | 부분 확정   | 모델 변경·재생성 분기는 확정, 동시 요청·중복 전송 상태 머신은 상세 설계 필요                         |
| 컨텍스트·요약             | 부분 확정   | 사용자 설정과 요약 원칙은 확정, tokenizer·요약 결과 규격·동시 갱신 규칙은 미정                       |
| AI 제공자                 | 부분 확정   | 참고 파일의 전체 catalog 보존 원칙은 확정, 제공자별 검증 등급과 복잡한 인증 제공자의 MVP 범위는 미정 |
| AI 요청 규격              | 부분 확정   | OpenAI·Anthropic·Gemini 엔진 방향은 확정, fixture와 정확한 오류·timeout 기본값 필요                  |
| 사용자 파라미터           | 확정        | 모델 정책과 관리자 허용 범위 내에서만 수정                                                           |
| 첨부파일                  | 부분 확정   | 형식·10MB·10개·PDF 100페이지·30일 보관은 확정, 이미지 해상도와 악성 파일 검사 정책은 미정            |
| 로그                      | 대부분 확정 | 종류·필드·마스킹·보관·내보내기 존재, 감사 로그 위변조 방지 방식은 미정                               |
| 관리자 화면               | 부분 확정   | 필요한 메뉴는 정의, 실제 화면 흐름·wireframe 미정                                                    |
| 기술 스택                 | 권장안 확정 | 대체 기술도 정리됨, 서버 환경에 따라 최종 선택 필요                                                  |
| 배포·HTTPS                | 대부분 확정 | Ubuntu 24.04.4 LTS·Compose·기존 Nginx 80·443과 앱 32432, 실제 배포 root만 필요                       |
| backup·복구               | 정책 확정   | 초기 외부 backup 미구성, 장애 시 데이터 유실 위험 수용                                               |
| 성능·가용성               | 미확정      | 동시 요청 수, latency 목표, 자원 한도와 허용 중단 시간이 필요                                        |
| 법적·개인정보 안내        | 미확정      | 파일·대화가 외부 AI 제공자에 전달된다는 안내와 운영 지역별 검토 필요                                 |

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

| 항목             | 상태        | 현재 값 또는 필요한 정보                                           |
| ---------------- | ----------- | ------------------------------------------------------------------ |
| 공개 범위        | 확정        | 인터넷 공개                                                        |
| 예상 규모        | 일부 확정   | 사용자 1~3명, 게스트 활성 session 기본 10개, 전체 AI 동시 생성 3개 |
| 서버 CPU         | 확정        | Intel N100 미니 PC                                                 |
| RAM·disk·OS      | 확정        | RAM 16GB, SSD 여유 약 220GB, Ubuntu 24.04.4 LTS                    |
| domain·network   | 확정        | 기존 domain·port forwarding과 Nginx 80·443 proxy 사용              |
| 저장 위치        | 권장안      | 단일 서버 PostgreSQL·로컬 volume, 실제 경로 필요                   |
| backup 목표      | 확정        | 초기 외부 backup 미구성, 장애 시 데이터 유실 위험 수용             |
| 관리자 보안      | 기본안 확정 | TOTP MFA 필수, offline 일회용 복구 code                            |
| MVP 전용 adapter | 미확정      | Vertex AI, Bedrock, Copilot 실제 활성화 여부                       |
| 외부 전송 안내   | 미확정      | 대화·첨부파일의 AI 제공자 전송 고지 방식                           |

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
- 선택적 공유 코드 기반 게스트 체험은 기본 활성 session 10개, session당 하루 20회·전체 하루 100회로 시작
- Intel N100 미니 PC 단일 서버
- RAM 16GB, SSD 여유 약 220GB, Ubuntu 24.04.4 LTS
- 기존 Nginx가 80·443을 처리하고 앱은 기본 127.0.0.1:32432 사용
- domain과 port forwarding 구성 완료
- 초기 외부 backup 미구성
- config는 서버 구동 파일 폴더에 두고 동봉된 계정 설정 CLI가 password hash를 생성
- 서버는 AI를 로컬 추론하지 않고 외부 API를 호출

이 조건에 맞춘 자원·보안·동시성 정책은 [DEPLOYMENT_PROFILE.md](./DEPLOYMENT_PROFILE.md)에 정리했다. 시작 config와 Nginx 연결 기준은 [SERVER_CONFIG_SPEC.md](./SERVER_CONFIG_SPEC.md)에 정리했다. 운영 환경 관련 P0는 실제 배포 root 입력만 남았다.
