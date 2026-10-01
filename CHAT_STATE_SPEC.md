# ModelNaru 채팅 상태 명세

## N09 구현 현황 (2026-10-01)

대화 목록의 검색·고정·owner/filter cursor, 설정과 branch의 revision CAS, 모델 선택 권한 재검사와 비호환 파라미터 제거를 연결했다. 정책·입출력은 `API_SPEC.md` N09가 원장이다. PATCH/branch는 소유권 행 잠금을 먼저 잡아 job 시작 transaction과 직렬화하고 다른 탭의 stale 설정은 최신 snapshot을 포함한 충돌로 반환한다. 내부 저장소 호출의 revision 생략은 기존 서버 시험/호환 코드만 위한 것이며 공개 API는 필수다.

첨부의 수신 완료 이후 처리 상태/명시 재처리와 active job TTL 보호는 `FILE_PROCESSING_SPEC.md` N09를 따른다. 선택 첨부와 실제 컨텍스트의 이전 이미지도 같은 시작 transaction에서 고정하고 terminal에서 해제한다. 즐겨찾기는 현재 모델 권한과 분리하며 게스트 삭제에서 cascade한다.

기존 화면은 아직 새 PATCH/branch revision과 목록 nextCursor를 사용하지 않는다. N09 서버를 기존 화면의 운영 완제품으로 배포한 상태가 아니며 N10에서 새 클라이언트를 연결한다. 실제 UI·OCR·운영 통합 인수는 후속 단계다. 실행 증거와 한계는 `TEST_PLAN.md` 최신 N09 절을 따른다.

## N08 구현 현황 (2026-10-01)

N01의 보조 호출 계약을 새 job 경로에 연결했다. quota는 요약 이전에 예약하고 전송 여부를 확정하며 요약+본 생성 전체에 논리 요청 1회만 적용한다. 요약별 usage는 성공·실패·취소 및 부분 token/unknown을 기록한다. 요약 저장은 활성 job 및 시작 session 유효 조건을 요구한다. 입력 계산은 `AI_INTEGRATION_SPEC.md` N02/N08이 원장이다.

첫 정상 답변의 terminal transaction에서 제목 task를 unique하게 예약한다. 본 job의 Provider 슬롯을 반환한 뒤 동일 전역 상한의 빈 슬롯에서만 실행하며 슬롯이 없으면 실패로 정리한다. 대기열·자동 재시도는 없다. 첫 성공 당시 제목 모델이 꺼져 있거나 수동 제목이면 이후 답변에서 소급 실행하지 않는다.

명시적 제목 입력은 값이 기본 문구와 같아도 manual이다. 수동 변경은 pending task와 usage를 같은 transaction에서 취소한다. 제목은 대화·주체·시작 session·모델 가용성을 진행 중 500ms 및 최종 저장 때 다시 검사한다. 삭제 뒤 usage의 task FK가 해제돼도 usage ID로 종료한다. 재시작은 pending summary/title usage와 task를 failed로 정리하며 Provider를 재호출하지 않는다. 실패가 이미 완료된 chat의 상태/usage를 뒤집지 않는다.

검증: 격리 PostgreSQL의 요약 선예약·한도 거부·실패/취소 usage·늦은 저장 거부, 제목 수동 변경/삭제/session 폐기·재시작 정리 및 실제 HTTP 제목 설정/저장을 확인했다(`TEST_PLAN.md` N08). 기존 동기 SSE 호환 endpoint에도 입력 budget과 요약 전 quota 검사를 적용했지만 자동 제목·지속 생성·공유 슬롯의 인수 대상은 새 job endpoint다. 화면 전환은 N10/N11이다.

## N01 확정 계약: 생성 작업·보조 호출·설정 (2026-09-30, N06 job 구현)

이 절은 새 버전의 실행 정책 원장이다. 아래 `새 버전` 절의 `제안`·`미정`과 현행 3절의 동기 SSE·Temperature 1.0·브라우저 종료 취소·모델 자동 대체 기록은 새 버전에서 이 절로 대체한다. API 필드와 DB column은 각각 API_SPEC.md와 DATABASE_SCHEMA.md의 N01 절을 따른다. Provider별 종료 판정·token/byte 예산·전역 자원 설정은 AI_INTEGRATION_SPEC.md와 SERVER_CONFIG_SPEC.md N02 절을 따른다.

N06/N08 구현 현황: job 수명·독립 구독·idempotency·quota 예약 및 terminal transaction, 보조 호출 예산·자동 제목을 구현하고 격리 PostgreSQL+mock Provider에서 경합을 검증했다(`TEST_PLAN.md` N06/N08). 조건부 설정 PATCH·탐색은 N09에서 구현했고 새 화면 연결은 N10/N11에서 수행한다.

### 1. 주체·작업·상태

- 작업 종류는 새 질문 `turn`과 마지막 assistant 재생성 `regenerate`다. 서버가 발급한 `jobId`는 assistant message와 1:1이며 user/guest 소유자, 대화, 시작 session, 고정 모델·파라미터·분기·첨부 snapshot을 연결한다. 관리자는 채팅 작업을 만들 수 없다.
- 상태는 `pending → streaming → completed | failed | cancelled`이고, `pending → failed | cancelled`도 허용한다. terminal 상태에서는 어떤 재전이도 금지한다. `completed`는 Provider별 정상 종료가 확인된 뒤에만 가능하다(N02). 오류·비정상 EOF는 저장된 부분 답변이 있어도 `failed`다.
- 대화당·주체당 활성 chat job은 각각 하나다. 새 시작과 재생성 모두 같은 제한을 공유한다. 다른 대화에서 이미 생성 중이면 `CHAT_PRINCIPAL_BUSY`, 같은 대화면 `CHAT_CONVERSATION_BUSY`다. server 전체 Provider 호출 기본 3개는 본 호출·요약·제목이 공유한다. 대기열은 두지 않으며 보조 호출은 본 호출에 우선권을 주장하지 않는다.
- 시작 session이 로그아웃·폐기·만료되거나 주체/게스트가 삭제·비활성화되면 job을 취소하고 upstream을 중단한다. 모델 권한 회수·모델/연결 비활성화와 대화 삭제도 같은 종료 경계다. 다른 유효 session의 소유자는 조회·구독·중지할 수 있지만 시작 session의 수명은 연장하지 못한다. 인증·권한은 시작 시, 각 조회·구독 시, 실행 중 Provider 호출 직전과 주기 점검에서 재확인한다.
- 브라우저 연결 종료는 구독만 닫는다. 명시적 중지와 terminal 전이는 DB 조건부 갱신 한 건으로 경쟁을 정리한다. 완료가 먼저 commit되면 중지는 `CHAT_NOT_CANCELLABLE`; 중지가 먼저 commit되면 늦은 완료·제목·summary 결과는 저장하지 않는다. 재시작 시 남은 `pending/streaming`을 마지막 checkpoint와 `CHAT_SERVER_RESTARTED`를 가진 `failed`로 정리하고 자동 유료 재호출은 하지 않는다.

### 2. 시작·중복 방지·저장 경계

1. 클라이언트는 새 논리 요청마다 UUID v4 idempotency key를 생성하고 응답을 모를 때 같은 key·동일 입력으로만 재시도한다. key는 주체별로 terminal 후 7일 보존한다. 입력 fingerprint에는 작업 종류·대화/대상 메시지·정규화 본문·첨부 ID 순서·모델 UUID·정규화 파라미터·설정 revision을 포함한다. 같은 key와 fingerprint는 기존 job을 반환하고 다른 fingerprint는 `CHAT_IDEMPOTENCY_CONFLICT`다. 보존 만료 뒤 key 재사용은 새 요청이므로 클라이언트는 항상 새 UUID를 써야 한다.
2. 시작 transaction은 인증·소유권을 확인한 뒤 동일 key의 기존 job을 먼저 찾는다. fingerprint가 같으면 변경된 현재 설정으로 재검증·재실행하지 않고 기존 job을 반환한다. 새 key일 때만 모델 권한·대화 설정 revision·첨부 ready 상태를 검증하고 활성 job 제약을 선점한다. user/assistant 메시지 또는 재생성 branch, job, quota reservation을 함께 commit한다. 유효성 거부·동시성 충돌은 메시지나 quota를 만들지 않는다. 생성 응답이 유실돼도 같은 key 요청으로 동일 job을 찾는다.
3. quota 예약은 유료 요약을 포함한 어떤 Provider 요청보다 앞선다. 예약은 job당 한 번이며 주체·모델·일일 한도를 원자적으로 잡는다. Provider 요청이 한 번도 전송되지 않았으면 예약을 원자적으로 해제한다. 요약이 전송됐지만 본 호출이 실패/취소된 경우에도 논리 요청 1회는 차감한다. 같은 job의 재구독·중복 시작·내부 보조 호출은 추가 차감하지 않는다. 명시적 재시도는 새 job/key와 quota 1회다. guest 날짜·범위와 카운터 규칙은 GUEST_ACCESS_SPEC.md N01 절을 따른다.
4. 실행은 DB commit 후 단일 API 프로세스의 bounded scheduler가 맡는다. 전역 슬롯을 즉시 확보할 수 없으면 시작 transaction을 만들지 않고 재시도 가능한 `CHAT_SERVER_BUSY`로 거부한다. 시작 성공 후 예약한 슬롯은 요약/본 호출 동안 유지하되, 요약이 자신의 슬롯을 다시 기다리지 않는다. 제목은 chat job 종료 후 별도로 슬롯을 얻을 때만 시작한다. 프로세스 재시작은 1차 범위에서 작업을 재개하지 않는다.
5. 생성 본문은 서버 메모리에 누적하되 최소 1초 경과 또는 새 텍스트 4 KiB마다 DB에 checkpoint한다. 각 작업은 시작 때 `maximumGeneratedTextBytes`를 snapshot하고 UTF-8 byte로 누적 본문을 검사한다. 큰 Provider chunk나 JSON escape가 많은 본문은 AI_INTEGRATION_SPEC.md N02의 **완성 SSE frame byte** 상한을 만족하는 여러 일반 checkpoint로 나눈다. Unicode scalar 경계를 보존하고 각 checkpoint는 revision 하나와 outbound frame 하나에 대응한다. terminal 전이는 같은 frame 상한에 맞는 남은 본문·usage·종료 사유·메시지 상태를 **하나의 DB transaction**에서 저장하고 revision을 정확히 1 증가시킨다. terminal 직전에 마지막 본문만 따로 commit하지 않는다. 취소/완료 경합의 패자는 본문·usage·event를 추가하지 않는다. 무변경 heartbeat는 revision을 올리지 않는다. 작업 전체 시간과 출력 상한은 AI_INTEGRATION_SPEC.md N02 절을 따른다.

### 3. snapshot·구독과 설정 경합

- job revision은 DB의 1부터 시작하는 단조 증가 정수이며 JSON에서는 정밀도 손실을 피하도록 십진 문자열로 표현한다. 각 일반 checkpoint·상태·terminal commit에서 정확히 1 증가한다. 대화 상세/목록의 `activeJob`으로 재접속할 job ID를 찾고 assistant message의 nullable `jobId`로 해당 답변을 식별한다. 메시지가 페이지 밖에 있어도 활성 ID는 상세에 남는다. 정확한 JSON과 보존 범위는 API_SPEC.md N01 절을 따른다.
- 구독은 listener 등록 후 DB revision을 읽고 본문 없는 첫 `snapshot` 메타데이터를 보낸다. 클라이언트는 별도 GET job에서 전체 checkpoint를 받아 그 revision 이하 SSE 변경을 버리고 이후 연속 revision만 적용한다. terminal transaction의 최종 본문과 상태는 같은 revision의 단일 `terminal` event로 표시한다. 구독 중 revision이 연속되지 않으면 구독을 닫고 GET/재구독한다. 이벤트 history는 저장하지 않으며 `Last-Event-ID`는 복구 기준으로 사용하지 않는다.
- SSE 연결마다 bounded buffer를 둔다. `maximumSsePendingBytes`는 직렬화된 미전송 SSE frame에만 적용하고 job의 `maximumGeneratedTextBytes`까지 허용하는 GET 본문은 그 buffer에 넣지 않는다. 느린 구독자는 종료하고 GET/재동기화를 안내한다. 구독/조회는 Provider 호출·quota 예약을 하지 않는다. terminal event 또는 terminal GET 이후 SSE는 닫힌다. 15초 heartbeat마다 인증/session/권한을 다시 확인하고 실패하면 연결을 닫으며 해당 시작 session의 무효화는 job 취소로 이어진다.
- 대화 설정은 `settingsRevision`으로 조건부 갱신한다. 모델 즉시 저장과 고급 설정 `적용` 모두 이전 revision을 제출하고, stale이면 `CHAT_SETTINGS_CONFLICT`와 현재 설정을 반환한다. 서버는 활성 job 중 모델·생성 설정·분기 변경을 `CHAT_CONVERSATION_BUSY`로 거부한다. 시작 job은 이미 저장된 설정 revision의 모델/파라미터를 snapshot한다. 모델 변경 시 이전 모델의 비호환 파라미터는 제거하고 그 사실을 응답에 표시한다. 저장된 모델이 권한에서 사라지면 자동 대체하지 않고 다음 시작을 막아 새 허용 모델 선택을 요구한다.
- 새 대화의 마지막 선택 모델은 모델 저장 성공 transaction에서 주체별로 갱신하며 권한이 유지될 때만 제안한다. guest 값은 임시 주체 삭제와 함께 제거한다. 본문 입력 초안은 화면 전환 중 브라우저 메모리에서 보존한다.

### 4. 보조 호출·제목·탐색·첨부

- 자동 요약 모델과 제목 모델은 관리자 전역 지정이다. 두 보조 호출은 사용자 모델 allowlist의 예외지만 활성/가용 연결·목적지 검증·전역 Provider 슬롯·자원 한도는 동일하게 적용한다. 사용자에게 그 모델을 직접 채팅에 호출할 권한을 주지 않는다. 요약은 예약된 chat job 안에서만 실행하고 동일 job의 자동 재시도는 없다. 요약 입력은 호출당 최대 12,000 Unicode 문자, 출력 요청 상한은 1,024 token, job당 최대 4회·각 호출 60초다. 더 작은 모델 입력/출력 한도는 N02 계산을 우선하고 부족하면 본 호출 전 `CHAT_CONTEXT_LIMIT_EXCEEDED`로 실패한다.
- 제목 모델 미지정 시 자동 제목은 꺼진다. 첫 정상 chat 답변 뒤, 수동 제목이 없는 대화에 정확히 한 번 시도한다. 입력은 첫 사용자 본문 최대 1,000자와 첫 정상 assistant 본문 최대 1,000자만 사용하며 첨부 원본·이미지는 제외한다. 출력 요청 상한 64 token, 호출 전체 15초, 저장 제목은 공백·제어문자 정규화 후 한 줄 1~200자다. 제목 실패·빈 출력·재시작은 임시 제목을 유지하고 자동 재시도하지 않는다. 제목 작업 시작 여부를 DB에 먼저 기록해 중복을 막고, 저장 시 `titleSource = default` 대기·대화 존재·시작 session 유효 조건을 재확인한다. 사용자가 제목을 수정하면 `manual`이 우선하며 pending 제목 작업을 취소하고 늦은 자동 결과는 폐기한다.
- 제목/요약 호출은 사용자·게스트 일일 채팅 횟수를 추가 차감하지 않는다. 각각 별도 usage event에 성공·실패·취소와 제공된 token 수를 기록한다. upstream이 token을 제공하지 않으면 `unknown`으로 두고 0으로 추정하지 않는다. 기본 로그에는 prompt·대화/요약/제목 본문을 저장하지 않는다.
- 즐겨찾기는 주체+모델 UUID unique이며 권한이 아니다. 제목 검색은 소유권을 먼저 적용하고 고정 우선·최근 갱신·UUID 순서의 안정 cursor를 사용한다. 대화 삭제·게스트 만료 시 해당 탐색 상태를 제거한다.
- 시작 transaction에서 첨부를 선택·연결한 뒤 실행이 끝날 때까지 원본 정리를 막는다. 실행 중 만료되더라도 요청 snapshot은 유효하지만 새 요청에 재사용할 수 없다. 삭제·권한 종료 시 작업을 먼저 취소하고 원본은 파일 cleanup queue로 정리한다. 파일 처리 상태 조회/재시도는 FILE_PROCESSING_SPEC.md의 N09 계약에서 구체화한다.

### 5. N01 인수와 후속 경계

- N04~N09 구현 시 동일 key 동시 시작, 새 session의 `activeJob` 발견, message/job 1:1, GET/SSE snapshot·commit 경합, 큰 본문 GET과 slow subscriber, 완료/중지 경합, session 폐기, quota 해제/차감, summary 선호출 방지, 제목 수동 변경/삭제 경합을 실제 PostgreSQL과 mock Provider로 검증한다.
- N02 Provider 종료·오류·예산 계약과 N03 UI 상태 계약은 각 원장 문서에 확정했다. N06 job 경로는 실DB로 검증했고 N08~N13 후속 범위는 `IMPLEMENTATION_STATUS.md`를 따른다.

## 새 버전: 화면과 독립된 생성·탐색 개선 (2026-09-30, 설계 확정·미구현)

이 절은 새 버전에서 기존 브라우저 연결 종료 시 upstream 취소 규칙보다 우선한다. 사용자는 계속 생성과 즐겨찾기를 확정하고 나머지 개선 판단을 위임했다.

### 생성 수명과 복원

- 대화 전환·새로고침·탭 닫기·일시적 네트워크 단절은 화면 구독만 종료한다. 서버의 생성 작업은 계속한다.
- 생성 시작과 이벤트 구독을 분리한다. 서버 발급 작업 ID로 현재 상태·저장된 부분 본문을 복원하고 이후 갱신을 이어 받는다. 재접속은 Provider 호출이나 일일 한도 예약을 다시 실행하지 않는다.
- 부분 본문은 제한된 주기로 DB에 checkpoint하고 완료·실패·취소 시 최종 상태와 함께 저장한다. token마다 DB에 쓰지 않는다. 재접속 snapshot과 후속 이벤트에는 단조 증가 revision을 사용해 유실·중복·순서 역전을 방지한다. 정확한 주기와 API 형태는 구현 설계에서 정한다.
- 시작 요청은 주체별 idempotency key와 입력 일치 검증으로 중복 메시지·Provider 호출·한도 예약을 막는다. 동일 key의 다른 입력은 충돌로 거부한다. 정상 재시도는 별도 명시적 동작과 새 key를 사용한다.
- 명시적 중지, 대화 삭제, 시작 session의 로그아웃·폐기·만료, 주체 비활성화·삭제는 진행 작업과 upstream을 취소한다. 권한 회수·모델 비활성화도 실행 지속 여부를 재검사하고 해당 작업을 중단한다.
- 완료와 취소의 경합은 조건부 상태 전이로 처리한다. terminal 상태를 뒤집거나 usage를 중복 기록하지 않는다. 다른 session이라도 같은 소유자는 유효 인증·권한 아래 작업 조회·중지가 가능하나, session 전송 기록은 기존 session 격리를 유지한다.
- API 프로세스 재시작 후 Provider 응답 자체를 이어 생성하는 것은 1차 범위가 아니다. 남은 pending/streaming 작업은 중단 사유가 있는 failed 상태로 정리하고 마지막 저장 부분을 복원한다. upstream을 자동 재호출하지 않는다.
- 서버는 브라우저의 읽기 속도와 독립적으로 생성·저장한다. 느린 구독자의 버퍼에는 상한을 적용하며 초과 시 구독을 종료하고 snapshot 재동기화를 유도한다.
- 새 버전 기본 동시성은 대화당 1개, 주체당 1개, 서버 전체 Provider 호출 3개다. 본 생성·요약·제목이 공통 상한을 공유하고 보조 호출보다 본 대화를 우선한다. 슬롯을 잡은 작업이 내부 보조 호출 슬롯을 기다리며 교착하지 않도록 설계한다.
- 무제한 대기열은 두지 않고 혼잡 시 재시도 가능한 상태로 안내한다. Provider idle timeout과 별도로 한 생성 작업의 전체 실행 상한은 기본 30분으로 둔다. 숫자는 성능 시험 결과에 따라 관련 문서를 함께 갱신한다.

### 모델·대화 탐색

- 모델명 검색·Provider 필터·즐겨찾기를 제공한다. 즐겨찾기는 사용자 계정별 서버 저장, 게스트는 임시 주체 수명 동안만 저장한다.
- 즐겨찾기는 Provider model UUID로 식별해 같은 모델 ID의 다른 연결을 구분한다. 즐겨찾기가 권한을 부여하지 않으며 삭제·비활성화·권한 회수 모델은 선택할 수 없다.
- 대화는 제목 검색·고정·이름 변경·삭제를 제공한다. 고정은 해당 소유자 범위이며 본문 검색·폴더·태그는 후속 범위다.
- 입력 초안은 대화 전환 중 보존한다. 새로고침 이후 초안 복구는 1차 보장 범위가 아니며 비밀 대화 내용을 브라우저에 영구 저장하지 않는다.

### 실패와 컨텍스트 안내

- 인증·모델 권한·호출 한도·접속 실패·timeout·Provider 오류를 구분하고 사용자에게 가능한 다음 행동을 안내한다.
- 명시적 재시도 전에는 새 유료 호출을 자동 실행하지 않는다. 실패·취소 시 부분 답변과 원래 사용자 입력을 보존하고 요청 시작 여부가 불명확하면 작업 상태부터 조회한다.
- 자동 요약 여부, 적용 컨텍스트 설정, 첨부 후속 포함 여부를 표시한다. 추정 token은 실제 사용량과 명확히 구분하고 출처 없는 정확도를 표시하지 않는다.

### 검증·남은 기술 설계

- 이 기능은 구현 전이며 대화 전환·새로고침 복원, 중복 시작, 이벤트 경계 경합, 중지·삭제·권한 회수, 서버 재시작, 동시성 상한을 통합 시험한다.
- 남은 기술 설계: 작업·revision·checkpoint schema, API와 SSE 재구독 계약, 종료 처리, 동시성 구현. 단일 API 배포를 우선하며 별도 broker·다중 worker 도입은 필수로 두지 않는다.

## 새 버전: 모델 선택·설정 저장과 자동 제목 (2026-09-30, 미구현)

### 확정한 설정 동작

- 입력창에서 모델을 선택하면 해당 대화에 즉시 저장하고 다음 요청부터 적용한다. 저장 실패 시 기존 선택으로 복원하고 오류를 알린다.
- 실행 중 요청은 시작 시점의 모델·설정 snapshot을 유지한다. 해당 대화의 생성 중에는 모델·설정 변경 조작을 비활성화한다.
- 고급 설정은 패널에서 수정한 뒤 `적용`으로 저장한다. 미적용 변경을 버리고 닫으려면 확인한다.
- 새 대화는 마지막 사용 가능한 모델과 Provider 기본 파라미터로 시작한다. 이전 선택이 없거나 권한이 사라졌으면 허용 모델을 선택하도록 한다. 마지막 선택은 사용자·게스트 주체별로 격리하며 저장 위치는 구현 설계에서 확정한다.
- 기존 대화는 해당 대화에 저장한 모델·설정을 복원한다. 저장 모델을 사용할 수 없으면 이를 표시하고 새 허용 모델을 선택하게 한다.
- 이 절은 새 버전에서 기존 Temperature 1.0 직접 설정 기본값과 사용 불가능한 저장 모델의 자동 대체 규칙을 대체한다.

### 자동 제목 생성 요구사항

- 기능 포함 확정: 제목 생성용 모델을 지정하면 대화 내용을 바탕으로 제목을 자동 생성한다. 사용자는 제목을 수동으로 수정할 수 있다.
- 지정 주체 확정: 관리자만 제목 생성 모델을 전역으로 지정·변경한다. 사용자·게스트에게 개별 제목 모델 선택 설정은 제공하지 않는다. 대화 모델·자동 요약 모델과는 별도로 설정한다.
- 이 절을 자동 제목 동작의 기준 문서로 사용한다. 아래 세부 정책은 제안이며 후속 확정이 필요하다.

### 세부 동작 제안

- 미지정 상태는 기능 꺼짐으로 취급한다.
- 첫 정상 답변 완료 후, 제목을 수동 지정하지 않은 대화에서 한 번 실행한다. 본 답변 완료와 입력창 사용을 제목 생성 때문에 지연시키지 않는다.
- 입력은 첫 사용자 메시지와 첫 정상 답변의 길이가 제한된 텍스트만 사용한다. 첨부 원본·이미지·전체 대화·자격증명은 추가하지 않는다. 첨부만 있는 질문은 정상 답변의 텍스트로 제목을 만든다.
- 제목은 대화 언어에 맞는 짧은 한 줄의 일반 텍스트로 정규화하고 기존 제목 길이 상한을 지킨다. 메시지는 제목 생성 지시를 변경하는 명령이 아니라 요약 대상 데이터로 취급한다.
- 실패·빈 응답·시간 초과·모델 비활성화 시 기존 임시 제목을 유지한다. 대화 생성이나 본 답변을 실패시키지 않으며 자동 반복 재시도와 답변 재생성에 따른 반복 호출은 하지 않는다.
- 사용자가 수동 제목을 저장했으면 늦게 도착한 자동 결과가 덮어쓰지 않는다. 삭제·게스트 만료된 대화에는 결과를 저장하거나 대화를 다시 만들지 않는다.
- 동시 요청으로 제목 작업이 중복 실행되지 않게 하고 재시작 후 중복 방지 상태를 유지한다. 정확한 작업 저장·복구 방식은 구현 설계에서 확정한다.
- 내부 보조 호출로 사용자·게스트 일일 채팅 횟수와 분리하되 실제 Provider 비용은 발생한다. 모델·token·성공/실패·처리 시간은 제목 생성 유형으로 집계하고 입력·출력 본문은 관리자 로그에 남기지 않는다.
- 관리자 지정 보조 모델로 텍스트가 전송됨을 사용 안내에 포함한다. 사용자별 모델 권한과 보조 모델 사용 정책, 입력·출력·시간·동시 실행 상한을 구현 전에 확정한다.

### 검증·미결정

- 모델 저장 실패 복원, 생성 중 snapshot 유지, 미적용 설정 확인, 주체별 기본 모델 격리를 검증한다.
- 자동 제목 성공·실패·수동 제목 우선·대화 삭제·게스트 만료·중복 작업·재생성·모델 미지정 시나리오를 검증한다.
- 미결정: 입력 범위와 상한의 최종값, 보조 호출의 사용자별 모델 권한 적용·한도, DB 필드·작업 상태·API 계약.

## 1. 목적

대화방, 메시지, 응답 분기와 AI 요청 상태를 사용자·게스트별로 안전하게 저장하고 후속 스트리밍·재생성·요약 구현이 따라야 할 기준을 정의한다.

## 2. 적용 범위

- 일반 사용자와 게스트의 대화방 생성·목록·조회·수정·삭제
- 대화별 시스템 프롬프트, 전송할 이전 메시지 수와 컨텍스트 토큰 한도
- 대화 중 모델 변경, 메시지 상태와 Provider·모델 snapshot
- 답변 재생성 분기와 활성 분기
- 스트리밍 시작·완료·실패·취소 상태
- 사용자·게스트 소유권 격리와 cascade 삭제

관리자 대화 본문 열람과 파일 첨부는 별도 단계다. 첨부는 [FILE_PROCESSING_SPEC.md](./FILE_PROCESSING_SPEC.md)가 생성된 뒤 이 구조에 연결한다.

## 3. 상세 명세

### 3.1 소유권

- 대화는 `user_id` 또는 `guest_id` 중 정확히 하나를 소유자로 가진다.
- 일반 사용자는 자신의 `user_id`, 게스트는 자신의 임시 `guest_id`에 속한 대화만 조회·변경할 수 있다.
- 고정 관리자는 일반 채팅 API를 사용하지 않는다.
- 사용자 삭제 시 대화·분기·메시지를 cascade 삭제한다.
- 게스트 로그아웃·만료 정리로 `guest_principals`가 삭제되면 같은 방식으로 임시 대화를 삭제한다.
- 존재하지만 다른 주체가 소유한 ID와 존재하지 않는 ID는 모두 `404 CHAT_NOT_FOUND`로 응답한다.

### 3.2 대화 설정

대화는 다음 설정을 가진다.

| 항목               | 기본값           | 범위             | 설명                                               |
| ------------------ | ---------------- | ---------------- | -------------------------------------------------- |
| 제목               | `새 대화`        | 1~200자          | 사용자가 수정할 수 있으며 후속 자동 제목 생성 가능 |
| 시스템 프롬프트    | 빈 문자열        | 최대 100,000자   | 대화마다 사용자 수정 가능                          |
| 이전 메시지 수     | `0`              | 0~10,000         | `0`은 개수 제한 없음                               |
| 컨텍스트 토큰 한도 | `100000`         | 1,000~2,000,000  | 초과 시 관리자 설정에 따라 자동 요약               |
| 기본 모델          | `null`           | 허용 모델 UUID   | 대화 설정에서 선택한 다음 호출 모델                |
| 생성 파라미터      | temperature `1`  | 모델별 policy    | 대화방별로 독립 저장되는 생성 기본값               |
| 응답 타임아웃      | `120초`          | 1~1,800초        | 첫 응답·다음 streaming chunk의 최대 유휴 대기 시간 |
| 전송 기록 보관 수  | `3`              | 0~3              | 현재 session에서 확인할 최근 요청·응답 수          |
| 활성 분기          | 생성된 root 분기 | 같은 대화의 분기 | 다음 요청에서 사용할 메시지 경로                   |

대화는 UUID로 식별하며 제목이 같아도 설정을 공유하지 않는다. 설정 모달에서 저장한 기본 모델, 생성 파라미터와 응답 타임아웃은 해당 대화 행에만 저장한다. 대화를 다시 열면 저장한 기본 모델·파라미터·타임아웃을 복원하고, 저장 모델이 삭제·비활성화·권한 회수된 경우에는 활성 분기의 마지막 허용 모델, 그 다음 첫 허용 모델 순서로 대체한다.

응답 타임아웃은 Provider 요청 body에 포함하지 않는다. 서버는 요청을 시작한 시점과 정상 chunk를 받은 시점마다 이 타이머를 다시 시작한다. 제한 시간 동안 새 데이터가 없으면 upstream 요청을 취소하고 `CHAT_PROVIDER_TIMEOUT`으로 실패 처리한다. 따라서 정상 streaming 데이터가 계속 도착하는 장문 응답의 전체 생성 시간을 직접 제한하지 않는다.

기본 모델은 다음 요청의 선택값이며 과거 메시지의 실행 기록을 바꾸지 않는다. 각 assistant 메시지에는 실제 Provider model UUID, Provider template·model ID snapshot과 요청 당시 검증된 파라미터를 계속 저장한다.

### 3.3 분기

- 대화 생성 transaction에서 root 분기를 정확히 하나 생성하고 활성 분기로 지정한다.
- 답변 재생성 시 기존 assistant 메시지를 덮어쓰지 않고, 원래 분기를 부모로 하는 새 분기를 만든다.
- 재생성 대상은 현재 활성 경로의 가장 마지막 assistant 메시지로 제한한다. 중간 답변에서 새로운 다단계 분기를 만드는 기능은 제공하지 않는다.
- 새 분기는 교체할 기존 assistant 메시지를 `forked_from_message_id`로 참조하며 부모 분기의 해당 메시지 직전까지를 공유한다. 부모 메시지를 새 행으로 복사하지 않는다.
- 재생성이 완료되면 새 분기를 활성 분기로 전환한다. 실패·취소 시 기존 활성 분기를 유지한다.
- 이전 답변을 선택하면 root 또는 정상 완료된 재생성 분기를 활성 분기로 바꾸며 이후 요청은 선택한 경로만 컨텍스트로 사용한다.
- 재생성 중 다른 session에서 활성 분기를 먼저 바꾼 경우 완료된 새 분기는 보존하되 현재 활성 분기를 강제로 덮어쓰지 않는다.
- 첫 단계에서는 분기 삭제·이름 변경 API를 제공하지 않는다.

### 3.4 메시지와 상태

메시지 역할은 `user`, `assistant`, `summary`다. 상태는 다음과 같다.

| 상태        | 의미                               | 허용되는 다음 상태                 |
| ----------- | ---------------------------------- | ---------------------------------- |
| `pending`   | 요청을 저장했으나 upstream 전송 전 | `streaming`, `failed`, `cancelled` |
| `streaming` | 응답 조각을 수신 중                | `completed`, `failed`, `cancelled` |
| `completed` | 정상 완료                          | 없음                               |
| `failed`    | 검증·네트워크·upstream 오류        | 없음, 재생성은 새 분기             |
| `cancelled` | 사용자가 중지                      | 없음, 재생성은 새 분기             |

- 사용자 메시지는 생성과 동시에 `completed`다.
- assistant 메시지는 `pending`으로 만든 후 upstream 연결 직전에 `streaming`으로 바꾼다.
- 스트리밍 본문은 동일 assistant 메시지에 누적하고 완료 시 token usage와 `completed_at`을 기록한다.
- 실패·취소 시 이미 받은 부분 본문은 보존할 수 있으며 오류 code만 저장하고 upstream 원문 오류는 저장하지 않는다.
- `(branch_id, sequence_number)`는 유일하며 분기 내 순서를 결정한다.
- 요청 parameter는 서버 검증을 통과한 값만 JSON으로 저장한다.
- user 메시지는 같은 대화에 속한 텍스트·PDF·이미지 attachment metadata를 가질 수 있다. 원본 본문은 그대로 저장하며 AI context를 만들 때만 현재 첨부와 후속 포함 첨부를 합성한다. PDF 추출문은 페이지 구분자를 유지하고 이미지는 활성 경로의 가장 최근 user 요청에 멀티모달 block으로 연결한다.
- attachment가 만료되면 메시지 연결과 표시 metadata는 유지하되 상태를 `expired`로 바꾸고 이후 context·재생성 입력에서는 제외한다.

### 3.5 컨텍스트 자동 요약

- 활성 분기와 이전 메시지 수 설정으로 구성한 컨텍스트가 적용 한도를 넘을 때만 요약을 실행한다.
- 오래된 prefix를 요약하고 최근 메시지는 그대로 보존한다. 요약문은 Provider에 전달할 임시 context 항목일 뿐 사용자 메시지 목록에는 표시하지 않는다.
- `context_summaries`에는 대화·생성 분기, 포함한 최초·최종 메시지 ID, 메시지 수, 요약 모델 snapshot, prompt version과 usage를 저장한다.
- 현재 활성 경로에 최종 메시지 ID가 존재하고 모델·prompt version이 같은 기존 요약은 재사용한다. 따라서 재생성 자식 분기도 공유된 부모 prefix의 요약을 사용할 수 있다.
- 요약 모델 요청은 사용자의 일일 호출량을 차감하지 않으며 본 답변은 요약 성공과 최종 한도 검사 뒤 1회를 예약한다.
- 요약은 오래된 원문을 대신해 직접 Provider context에 포함된다. 요약 내용에 따라 과거 원문을 다시 검색하는 retrieval 단계는 수행하지 않는다.
- 요약 실패 시 원본 메시지를 삭제·수정·무단 절단하지 않는다.

### 3.6 기본 API 단계

현재 다음 API를 제공한다.

- `GET /api/conversations`: 현재 주체의 대화 목록
- `POST /api/conversations`: 대화와 root 분기 생성
- `GET /api/conversations/:id`: 대화 설정·분기 선택 정보와 활성 경로의 최근
  50개 메시지를 포함한 상세 조회
- `GET /api/conversations/:id/messages`: 활성 경로의 이전 메시지를
  `beforeSequence` cursor와 `limit`으로 조회
- `PATCH /api/conversations/:id`: 제목·시스템 프롬프트·컨텍스트·기본 모델·생성 파라미터·응답 타임아웃 설정 변경
- `DELETE /api/conversations/:id`: 대화 hard delete
- `POST /api/conversations/:id/messages`: attachment를 user 메시지에 연결하고 user·assistant 메시지를 저장한 뒤 SSE로 AI 응답 전송
- `POST /api/conversations/:id/messages/:messageId/cancel`: 진행 중인 upstream 요청 취소
- `POST /api/conversations/:id/messages/:messageId/regenerate`: 기존 답변을 보존한 새 분기에서 SSE 재생성
- `PATCH /api/conversations/:id/branches/:branchId/active`: 정상 완료된 답변 분기로 전환

메시지 전송은 `content`, `providerModelId`와 검증된 `temperature`, `topP`, `maxOutputTokens`만 받는다. 재생성은 새 `content` 없이 대상 assistant ID와 새 답변에 사용할 모델·parameter를 받는다. 모델 권한을 먼저 확인하고 컨텍스트 한도를 검사한 뒤 일일 호출량을 예약한다. 브라우저 연결 종료 또는 취소 API 요청은 같은 `AbortController`를 통해 upstream 연결도 중단한다. 모든 mutation은 CSRF 검증을 요구한다.

### 3.7 session 한정 Provider 전송 기록

- 대화별 `request_trace_limit`은 0~3이며 기본값은 3이다. 0이면 새 기록을 만들지 않는다.
- 실제 Provider로 보낸 protocol·URL·method·header·JSON body와 수신한 원시 이벤트, 최종 본문·token·처리 시간을 API process 메모리에만 저장한다.
- Authorization·API key 계열 header와 URL query secret은 마스킹하고 이미지 data/base64는 길이 안내로 대체한다.
- 단일 기록은 최대 2MB, session 전체는 최대 30개다. 초과분은 오래된 순서로 삭제하거나 안전한 미리보기로 절단한다.
- 일반 사용자와 게스트는 현재 session·자신의 대화 기록만 조회·삭제할 수 있다. 관리자 통합 로그에는 이 본문이 복제되지 않는다.
- 로그아웃, idle·absolute 만료, 최대 동시 session 초과, 비밀번호 변경, 계정 비활성화·삭제, 대화 삭제와 게스트 설정 저장·만료 정리 때 해당 메모리 기록을 즉시 제거한다.
- API process 재시작 시 기록은 자연스럽게 사라진다. Valkey와 PostgreSQL에는 기록하지 않는다.
- API는 `GET /api/conversations/:id/traces`와 `DELETE /api/conversations/:id/traces`를 제공한다.

## 4. 오류·예외 또는 경계 조건

- `CHAT_INPUT_INVALID`(`400`): UUID, 제목, 설정 범위 또는 허용되지 않은 필드 값
- `AUTH_SESSION_REQUIRED`(`401`): session 없음·만료
- `AUTH_CSRF_INVALID`(`403`): mutation의 CSRF 검증 실패
- `CHAT_NOT_FOUND`(`404`): 대상 없음, 다른 주체 소유 또는 관리자 workspace 요청
- `CHAT_CONTEXT_LIMIT_EXCEEDED`: 요약을 사용할 수 없는 상태에서 설정한 컨텍스트 한도 초과
- `CHAT_IMAGE_PAYLOAD_TOO_LARGE`: 현재 요청의 이미지 원본 합계가 서버 설정 상한 초과
- `CHAT_NOT_CANCELLABLE`(`409`): 이미 완료됐거나 진행 중이 아닌 메시지 취소
- `CHAT_REGENERATION_INVALID`: 활성 경로의 마지막 답변이 아니거나 생성 중인 assistant 메시지를 재생성 대상으로 지정
- 활성 분기와 대화의 관계가 일치하지 않으면 DB 제약으로 거부한다.
- 브라우저 연결이 끊기면 현재 단일 API process의 upstream 요청을 중단하고 assistant 메시지를 `cancelled`로 저장한다.
- 같은 client mutation의 중복 전송 방지는 후속 idempotency key 단계에서 확정한다.

## 5. 검증·인수 조건

- 대화 생성 시 대화와 root 분기, 활성 분기 지정이 하나의 transaction으로 commit된다.
- 사용자·게스트 소유권이 DB 제약과 repository query 양쪽에서 강제된다.
- 다른 주체의 대화 ID는 목록·상세·수정·삭제 어디에서도 노출되지 않는다.
- 사용자와 게스트 삭제 시 대화·분기·메시지가 cascade 삭제된다.
- 기본값은 이전 메시지 무제한(`0`)과 컨텍스트 100,000 token이다.
- 제목이 같은 여러 대화에서도 기본 모델과 생성 파라미터가 대화 UUID별로 독립 저장·복원된다.
- 대화별 응답 타임아웃을 저장·복원하며 첫 응답 또는 streaming chunk가 제한 시간 안에 없으면 timeout 오류로 종료한다.
- 대화 중 서로 다른 Provider 모델 snapshot을 가진 assistant 메시지를 저장할 수 있다.
- OpenAI 호환·Anthropic·Gemini SSE를 공통 이벤트로 변환하고 완료·실패·취소 상태를 저장한다.
- 허용되지 않은 모델은 메시지를 만들기 전에 거부하고 컨텍스트 초과는 quota 예약 전에 중단한다.
- 컨텍스트 요약은 별도 행으로 저장되고 사용자에게 표시되는 원본 메시지와 분기 경로를 변경하지 않는다.
- 같은 모델·prompt version·활성 경로의 요약을 재사용하며 요약이 불가능하면 quota 예약 전에 표준 오류로 중단한다.
- 재생성 결과는 기존 답변을 덮어쓰지 않는 새 분기로 저장할 수 있다.
- 성공한 재생성만 활성화되고 이전·새 답변 분기를 왕복해도 각 경로가 보존된다.
- 가장 최근 질문의 답변 후보만 인라인 탐색 대상으로 묶이며 과거 메시지에는 재생성 조작을 표시하지 않는다.
- 상세 화면과 Provider 컨텍스트는 비활성 분기의 전체 본문을 읽지 않고
  `active_branch_id`에서 root 방향으로 이어지는 경로만 조회한다.
- 상세 화면은 활성 경로 최근 50개를 먼저 표시하고 이전 기록은 사용자가
  요청할 때 최대 100개 단위로 추가한다. cursor는 현재 page의 최소
  `sequence_number`이며 중복 없이 역방향으로 이동한다.
- controller·service 단위시험, migration 정적 시험, typecheck와 production build가 통과한다.
- 서로 다른 session이 같은 계정·대화를 열어도 전송 기록을 공유하지 않으며 종료된 session의 기록은 조회할 수 없다.

## 6. 미결정·보류 항목

- 스트리밍 중 DB 본문 갱신 주기와 브라우저 재연결 cursor
- 중복 과금 방지를 위한 idempotency key 수명
- Provider별 tokenizer 연결과 보수적 Unicode 문자 추정치의 교체 시점
- 대화 자동 제목 생성 시점과 사용할 모델의 실제 선택값. 지정 주체는 새 버전에서 관리자로 확정했다.
- 관리자 대화 본문 열람 기능과 별도 감사 절차
# 대화별 웹 검색 상태와 동적 시각 (2026-08-10)

- 웹 검색 사용 여부는 사용자 전역값이 아니라 대화별 설정이며 분기와 무관하게 대화 전체에 적용한다.
- 재생성도 현재 대화의 웹 검색 설정을 동일하게 사용한다.
- 호출 시각은 대화 상태로 저장하지 않는다. 매 호출·재생성 시점의 UTC ISO 8601 값을 동적으로 시스템 문맥에 추가한다.
- 모델을 검색 미지원 모델로 바꾼 상태에서는 웹 검색 호출을 시작하지 않고 명시적 오류를 반환한다.
