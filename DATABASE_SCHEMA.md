# ModelNaru Database 상세 명세

## N09 저장소 구현 (2026-10-01, migration 추가 없음)

- `0020`의 is_pinned/settings_revision/model_favorites/in_use_job_id 및 기존 attachments processing/failed/ready/expired를 사용한다. 별도 queue/schema/의존성은 추가하지 않았다.
- 설정/branch는 owner conversation 행을 잠근 뒤 revision 및 active job을 검사한다. job 시작의 같은 행 잠금과 직렬화되며 수동 title·pin 변경은 생성 중에도 허용한다. stale snapshot의 모델 권한·파라미터 갱신을 실행하지 않는다.
- keyset cursor는 API_SPEC.md N09 tuple을 사용한다. PostgreSQL 마이크로초 정밀도로 시각을 저장하고 드라이버의 Date 직렬화로 잘리지 않도록 cursor 시각은 text로 bind한 뒤 DB에서 timestamptz로 cast한다. 동일 시각 행은 UUID 내림차순으로 이어진다.
- 즐겨찾기는 주체·모델 partial unique로 멱등 INSERT하며 현재 허용 모델 조회와 별도로 저장 ID/selectable을 계산한다. 권한 회수는 선택을 차단하고 게스트/모델 hard delete는 기존 FK로 제거한다.
- 첨부 원본 수신 후 processing을 저장하고 ready/failed 종료는 processing·미전송·미참조 조건부 UPDATE다. 재처리는 행 잠금 아래 failed→processing으로 바뀌며 TTL을 연장하지 않는다. 늦은 완료가 삭제된 행을 다시 생성하지 않는다.
- job 시작은 첨부 행 잠금과 실제 이미지 참조 고정, 만료 cleanup은 FOR UPDATE SKIP LOCKED와 active job 제외 조건을 사용한다. terminal 후 참조 해제 시 다음 cleanup에서 만료 처리한다. 재시작은 남은 processing을 failed로 정리한다.

검증 결과는 `TEST_PLAN.md` N09에 기록한다. 운영 DB/migration에는 이번 작업을 적용하지 않았다.

## N08 저장소 구현 (2026-10-01, 기존 0020 사용)

새 migration 없이 N04의 `title_generation_settings`, `conversation_title_tasks`, conversation title source/status 및 usage의 job/summary attempt/title task/sent/known 필드를 소비한다.

- 본 job 완료 transaction은 첫 성공 답변인지·default 제목인지 검사하고 설정 모델의 title task를 unique하게 삽입한 뒤 conversation을 pending으로 바꾼다. 사용량은 task당 unique 레코드로 중복 전송을 막는다.
- 수동 제목 변경은 conversation 잠금 뒤 manual/none·pending task/usage cancelled를 함께 commit한다. 자동 결과도 같은 conversation 잠금 순서와 task pending/source default/session 유효 조건 아래 저장하므로 수동 입력을 덮어쓰지 않는다.
- 요약 저장은 job 행을 잠그고 활성 상태·시작 session을 재검사한다. summary usage는 각 호출의 attempt로 분리하며 저장 성공에 종속되지 않는다. token은 중간 수신 시 보존하고 실패/취소·프로세스 재시작의 terminal 정리에서도 유지한다.
- 삭제 후 task FK가 null이 된 사용량은 usage ID로 종료한다. 재시작 정리는 pending title task·summary/title usage를 failed로 만들고 원문/Provider 호출을 복구하지 않는다.

격리 PostgreSQL 17에서 검증했다(`TEST_PLAN.md` N08). 운영 migration 적용·데이터 전환은 N12/N13 범위이며 이번 작업에서 운영 DB는 사용하지 않았다.

## N04 구현 현황 (2026-09-30, 격리 DB 검증 완료)

`packages/database/migrations/0020_n04_foundation.sql`에 아래 N01·N02 목표의 테이블·제약·인덱스를 추가했다. `0001`~`0019`는 유지한다. `mihoservice_server`의 운영 DB와 분리한 PostgreSQL 17 테스트 DB에서 신규 설치·재실행·제약/경합을 검증했다(`TEST_PLAN.md` N04 절). `packages/database/test/n04-postgres.test.ts`는 `MODELNARU_TEST_DATABASE_URL`에 로컬 `*_test` DB를 지정한 경우에만 실제 migration을 실행한다. Job transaction과 작업별 checkpoint 상한은 아래 N06 기록을 따른다. N07은 Provider custom 필드를 사용하며 N08~N09 저장소 소비도 구현하고 격리 DB/HTTP로 검증했다.

N06에서 기존 message·usage event의 실패/취소 부분 token과 `usage_known` 기록, 메시지·일일 quota·`chat_jobs`·`chat_quota_reservations`의 단일 시작 transaction, checkpoint revision, 본문·usage·상태의 단일 terminal transaction을 구현했다. 격리 PostgreSQL에서 동시 시작·종료 경합, 미전송 quota 해제, 8 MiB 본문과 7일 보존 정리를 검증했다(`TEST_PLAN.md` 최신 N06 절). `0020` migration은 N06에서 수정하지 않았다.

## N02 커스텀 Provider 저장 계약 (2026-09-30 확정, N04 schema·N07 저장소 구현)

N04의 새 migration에서 기존 `provider_connections`에 `kind`(`builtin|custom`), nullable `protocol`, `auth_mode`(`bearer|none`), `destination_kind`(`public|local`), nullable `approved_local_ip inet`, nullable `approved_local_port integer`, `diagnostic_network/models/chat_status`와 각 `checked_at`·안전한 `error_code`를 추가한다. custom은 고정 `template_id='custom-openai'`와 `protocol='openai-chat-completions'`를 요구한다. builtin은 `protocol=null`로 두고 기존 template에서 protocol·고정 URL·인증 규칙을 해석한다. `kind`·`template_id`·`protocol`의 조합은 CHECK로 제한한다. `base_url`의 현행 HTTPS CHECK를 `public→HTTPS`, `local→HTTP+정확한 승인 IP literal/port` 조건부 CHECK로 교체한다. URL parser·DNS·실접속 검증은 DB CHECK가 아니라 SECURITY_SPEC.md N02의 outbound 경계에서 수행한다.

`auth_mode=none`은 credential ciphertext/nonce/tag/hint가 모두 null이어야 한다. `bearer`는 기존 AES-256-GCM 필드와 nonce 12 byte/tag 16 byte를 요구한다. 따라서 현행 NOT NULL credential 제약을 완화하고 all-or-none CHECK를 둔다. `local`만 승인 IP/port를 요구하고 `public`은 두 값을 null로 둔다. destination·URL·auth 변경은 진단 상태/시각을 transaction에서 초기화하고 감사 snapshot에는 비밀·전체 내부 주소를 넣지 않는다. 기존 내장 연결은 migration에서 `kind=builtin`·현재 template에 맞는 auth/destination으로 채운 뒤 제약을 적용한다.

`provider_models`에는 `source`(`discovered|manual`, default discovered)와 nullable `image_token_estimate integer CHECK >=1024`를 추가했다. `(provider_connection_id, model_id)` unique는 유지한다. 수동 모델도 연결 삭제/비활성·사용자 권한 제약을 따른다. 모델 조회 실패는 저장 모델을 삭제하지 않는다. `supports_image_input=true`만으로 estimate가 생기지 않으며 null이면 새 버전 이미지 입력은 거부한다. N04 migration과 N07 저장소를 격리 DB에서 검증했다. 진단 결과는 읽은 연결의 DB 행 버전이 유지될 때만 저장하여 변경 뒤 늦게 도착한 시험 결과를 폐기한다.

## N01 새 버전 저장 계약 (2026-09-30, 확정·미구현)

이 절은 N04 migration의 목표 schema다. 현재 `0001`~`0019`에는 없다. 배포된 migration은 수정하지 않으며 신규 설치 기준선/증분 선택은 N02에서 확정한다. 상태·quota·제목 정책은 CHAT_STATE_SPEC.md N01 절을 따르고 여기서는 DB 관계·제약·transaction만 정한다.

### `chat_jobs`

| Column | Type·제약 | 의미 |
| --- | --- | --- |
| `id` | uuid PK | 공개 job ID |
| `conversation_id` | uuid not null FK `conversations(id)` ON DELETE CASCADE | 대화 |
| `user_id`, `guest_id` | 각각 nullable FK ON DELETE CASCADE, 정확히 하나 not null | 작업 소유 주체 |
| `started_session_id` | uuid not null | 시작 session 식별. session hard delete 뒤에도 취소·감사용 값 보존. 조회 권한 근거로 사용하지 않음 |
| `kind` | varchar(16) check `turn`,`regenerate` | 요청 종류 |
| `idempotency_key` | uuid not null | 클라이언트 UUID v4. 주체별 unique |
| `request_fingerprint` | bytea not null, 32 bytes | 정규화 입력 SHA-256. 본문 원문 중복 저장 금지 |
| `settings_revision` | bigint not null, >=1 | 시작 시 설정 버전 |
| `maximum_generated_text_bytes` | integer not null CHECK 65536~8388608 | 시작 시 `config.yaml` 생성 본문 byte 상한 snapshot. 이후 설정 변경·재시작 뒤에도 해당 job의 복원 상한 유지 |
| `branch_id` | uuid not null, 대화 범위 FK | 실제 답변 분기 |
| `user_message_id` | nullable uuid, 대화 범위 FK | turn일 때 필요, regenerate는 null |
| `assistant_message_id` | uuid not null unique, 대화 범위 FK | 기존 messages 1:1 |
| `provider_model_id` | nullable uuid FK ON DELETE SET NULL | 시작 시 선택 모델; 삭제 후 snapshot은 message에 남음 |
| `status` | varchar(16) check `pending`,`streaming`,`completed`,`failed`,`cancelled` | 단조 상태 |
| `revision` | bigint not null default 1, >=1 | checkpoint·terminal commit마다 +1 |
| `checkpoint_content` | text not null default '', `octet_length <= 8388608` CHECK | 재접속 부분 본문과 terminal 최종 본문. runtime에서는 `maximum_generated_text_bytes` 이하로 제한 |
| `quota_state` | varchar(16) check `reserved`,`charged`,`released` | 예약 상태 요약. 예약 원장은 아래 table |
| `error_code`, `input_tokens`, `output_tokens` | nullable 안전 code·nonnegative integer | 실패·제공된 usage; unknown은 null |
| `created_at`, `updated_at`, `finished_at` | timestamptz, terminal에서 finished 필수 | 수명·재시작 정리 |

`(user_id, idempotency_key) WHERE user_id IS NOT NULL`와 `(guest_id, idempotency_key) WHERE guest_id IS NOT NULL` unique index를 둔다. `(conversation_id) WHERE status IN ('pending','streaming')`, `(user_id) WHERE user_id IS NOT NULL AND status IN (...)`, `(guest_id) WHERE guest_id IS NOT NULL AND status IN (...)` 각각 partial unique로 대화·주체 활성 작업 하나를 DB에서도 강제한다. `(status, created_at) WHERE status IN (...)`은 startup 정리에 사용한다. `(finished_at) WHERE status NOT IN (...)`은 7일 terminal 보존 정리에 사용한다. 작업의 owner는 conversation owner와 같아야 하므로 transaction에서 conversation row를 잠그고 검증하며, 대화 소유자 변경을 허용하지 않는다. branch/message는 `(id, conversation_id)` 복합 FK로 다른 대화 참조를 금지한다. 대화 상세/목록의 `activeJob`은 활성 partial index로 조회하며 message `jobId`는 `assistant_message_id` unique join에서 계산한다. 메시지에 중복 job ID column을 추가하지 않는다. terminal 정리 뒤 nullable `jobId`는 null이다. N04 새 migration은 기존 `messages_content_check`를 assistant만 `octet_length(content) <= 8388608`, user/summary는 종전 `char_length(content) <= 2000000`으로 교체한다. runtime은 assistant message와 `checkpoint_content` 모두 job의 `maximum_generated_text_bytes` 이하로 검증한 뒤 기록한다. 상태 전이는 `WHERE status IN ('pending','streaming')` 조건부 UPDATE의 반환 행으로 승자를 결정하며 terminal에서 최종 `checkpoint_content`, assistant message 본문·상태, job status·error·usage·finished_at, quota/usage 원장, 첨부 사용 해제, 성공 시 branch 활성화/제목 task 생성을 하나의 transaction에 넣는다. 이 transaction이 commit되지 않으면 모두 이전 checkpoint/상태로 남고 다음 시작의 재시작 정리에서 실패 처리한다. 중복 usage·분기 활성화는 금지한다.

### `chat_quota_reservations`와 `usage_events`

`chat_quota_reservations`: `job_id` uuid PK/FK `chat_jobs(id)` ON DELETE CASCADE, `usage_date` date not null, `counter_keys` text[] not null(1~3개·중복 없음), `state` varchar check `reserved`,`charged`,`released`, `reserved_at`, nullable `first_sent_at`, nullable `released_at`. 시작 transaction에서 기존 `daily_usage_counters`의 해당 날짜·범위를 같은 transaction으로 증가시킨 뒤 예약 row를 만든다. 첫 Provider 전송 직전 `first_sent_at`과 `charged`를 원자적으로 기록한다. 실제 전송 전에 실패한 경우 `reserved → released` 조건부 전이와 각 counter 감소를 한 transaction으로 실행한다. 전송 여부가 불확실하면 `charged`로 보수 처리하며 중복 감소를 금지한다. terminal job 7일 정리 뒤에도 일일 counter와 집계 `usage_events`는 각 보존 정책을 따른다.

현행 `usage_events`에는 `operation_type='title'`을 추가하고 `job_id` nullable FK ON DELETE SET NULL, `conversation_id` nullable FK ON DELETE SET NULL, `attempt_number` positive integer, `sent_at` nullable, `usage_known` boolean not null을 추가한다. `(job_id, operation_type, attempt_number)`의 job_id not null partial unique로 chat/summary 중복 기록을 막는다. 제목은 아래 task의 ID를 `title_task_id` nullable FK ON DELETE SET NULL로 연결하고 `(title_task_id)` unique다. `chat`은 job당 1건, `summary`는 job당 최대 4건, `title`은 대화당 자동 시도 1건이다. `status`는 기존 pending/completed/failed/cancelled를 사용한다. upstream이 사용량을 주지 않은 경우 token nullable·`usage_known=false`; 0 token과 구별한다. Provider 전송 뒤 실패·취소도 event를 terminal로 닫으며 본문·prompt·credential은 `safe_metadata`에 저장하지 않는다.

### 기존 대화·제목·탐색 구조

- `conversations`: `settings_revision bigint NOT NULL DEFAULT 1 CHECK >=1`, `is_pinned boolean NOT NULL DEFAULT false`, `title_source varchar(16) NOT NULL DEFAULT 'default' CHECK default/auto/manual`, `title_status varchar(16) NOT NULL DEFAULT 'none' CHECK none/pending/completed/failed`를 추가한다. 모델·파라미터·시스템 문맥·context·응답 timeout 변경은 `WHERE settings_revision = :expected AND NOT EXISTS(active chat_jobs)`로 갱신하고 revision을 1 증가시킨다. 수동 제목은 `title_source='manual'`, `title_status='none'`, pending 제목 task 취소, revision 증가를 같은 transaction에서 처리한다. 활성 branch 변경도 active job이 없을 때만 허용한다.
- `conversation_title_tasks`: `id` uuid PK, `conversation_id` uuid not null unique FK ON DELETE CASCADE, `started_session_id` uuid not null, `provider_model_id` nullable FK ON DELETE SET NULL, `settings_version` bigint not null, `status` check pending/completed/failed/cancelled, `created_at`, `finished_at`. 첫 정상 chat terminal transaction에서 `title_source='default'`와 설정 활성 상태일 때만 한 행을 만들고 `title_status='pending'`으로 바꾼다. 재시작에서 pending은 failed로 정리한다. 결과 저장은 대화 존재·`title_source='default'`·task pending·시작 session 유효를 조건으로 한 transaction에서 수행한다. 수동 제목·삭제와 경합하면 결과를 폐기한다.
- `title_generation_settings`: singleton row(`id=1`), nullable `provider_model_id` FK ON DELETE SET NULL, `version bigint >=1`, `updated_at`. null은 꺼짐이다. 관리자 변경 시 version 증가. 이전 job/title task는 시작 시 snapshot을 유지한다.
- `principal_last_models`: `user_id` 또는 `guest_id` 정확히 하나 FK ON DELETE CASCADE, `provider_model_id` FK ON DELETE CASCADE, `updated_at`; 주체당 unique partial index. 권한 회수·모델 비활성화 시 행을 자동으로 신뢰하지 않고 조회 시 허용 여부를 다시 검사한다.
- `model_favorites`: `user_id` 또는 `guest_id` 정확히 하나 FK ON DELETE CASCADE, `provider_model_id` FK ON DELETE CASCADE, `created_at`; 주체+모델 복합 unique partial index. 즐겨찾기 조회도 현재 모델 권한을 join해 선택 가능 여부를 계산한다.
- 대화 목록 index: `(user_id, is_pinned DESC, updated_at DESC, id DESC)`와 guest 대응 index. 제목 검색은 소유자 필터 후 정규화 제목에 trigram 없이 우선 `ILIKE`를 적용한다. 소규모 운영을 전제로 하며 검색 성능이 실측에서 부족할 때만 추가 index를 결정한다. cursor는 owner/query/filter fingerprint와 정렬 tuple을 담고 API가 매 조회에서 다시 검증한다.
- 첨부: `attachments.in_use_job_id` nullable FK `chat_jobs(id)` ON DELETE SET NULL을 추가한다. 시작 transaction에서 선택 첨부를 job에 고정하며 cleanup은 활성 job 참조가 있으면 원본을 건너뛴다. terminal transaction에서 참조를 해제한다. 대화/주체 hard delete는 job 취소·실행 종료 신호를 먼저 기록하고 기존 cleanup queue로 원본 삭제를 이어간다.

N04 검증은 격리 PostgreSQL에서 동일 key 동시 INSERT, 활성 partial unique, owner/branch FK, 예약 해제의 한 번만 감소, checkpoint/terminal 경합, 제목 수동 우선, cascade와 7일 정리, cursor 정렬을 다룬다. 실제 migration 파일·테이블은 아직 작성하지 않았다.

## 새 버전 예정 저장 구조: 지속 생성·즐겨찾기 (2026-09-30)

- 생성 작업 ID·시작 주체/session·상태·요청 snapshot·idempotency key/입력 식별·부분 본문 checkpoint·revision·종료 사유를 저장하도록 설계한다.
- 주체별 시작 key의 유일성, 대화당 활성 작업 하나, 원자적 종료와 usage 중복 방지 및 재시작 시 남은 작업 정리를 보장한다.
- 주체와 Provider model UUID별 즐겨찾기, 대화 고정 정보를 저장한다. 게스트 만료·주체 및 모델 삭제 정책과 소유권 제약을 함께 설계한다.
- 현재 schema·migration은 변경하지 않았다. 작업 단위·보존 기간·column·index와 구체적 제약은 구현 전 확정한다. 동작 원장은 CHAT_STATE_SPEC.md다.

## 새 버전 예정 변경: 커스텀 Provider (2026-09-30)

- 내장/커스텀 구분, 프로토콜·기본 URL, 선택적 암호화 자격증명, 승인 목적지 및 수동 모델 ID 저장을 설계한다.
- 기존 Provider 연결·모델·권한 구조와 통합한다. 현재 DB 변경은 없으며 구체적 column·제약·migration은 구현 전 확정한다.

## 새 버전 예정 변경: 자동 제목 (2026-09-30)

- [채팅 상태 명세](./CHAT_STATE_SPEC.md)의 자동 제목 기능을 위한 제목 출처·수동 변경 감지·중복 작업 방지·보조 모델 설정 및 사용량 구분 저장을 설계할 예정이다.
- 현재 schema에는 이 기능이 구현되지 않았다. 구체적 table·column·제약·작업 복구 방식은 구현 전에 확정한다.
- 제목 모델 지정은 관리자 전역 설정으로 설계하며 사용자별 제목 모델 설정은 두지 않는다.
- 자동 제목의 늦은 결과가 수동 제목을 덮어쓰거나 삭제된 대화를 복원하지 않도록 원자적 갱신 조건을 설계한다.

## 1. 목적

PostgreSQL table, 관계, index, migration 실행 규칙과 삭제 정책을 실제 구현 기준으로 정의한다.

## 2. 적용 범위

첫 migration은 관리자 로그인과 사용자 관리 기반인 `users`, `sessions`를 생성한다. 두 번째 migration은 사용자 관리 작업을 보존할 `audit_logs`를 추가한다. 세 번째 migration은 Provider 연결·모델·사용자 권한 기반을 추가한다. 네 번째 migration은 사용자·게스트 모델 권한, 게스트 주체·세션과 일일 사용량 counter를 추가한다. 다섯 번째 migration은 대화·branch·message 저장 기반을 추가하며 여섯 번째부터 여덟 번째까지는 자동 요약과 Provider 파라미터를 확장한다. 아홉 번째 migration은 본문과 분리된 관리자 사용량 원장을 추가한다. 열 번째 migration은 대화방별 기본 모델과 생성 파라미터를 추가하고 열한 번째부터 열네 번째까지 attachment 종류와 수명 관리를 추가한다. `0015_admin_logs_and_request_traces.sql`은 대화별 session 전송 기록 수, 게스트 허용 설정, 운영 로그와 로그 보관 설정을 추가한다. `0016_pdf_ocr.sql`은 OCR page metadata를 추가하고 `0017_conversation_response_timeout.sql`은 대화별 Provider 응답 유휴 시간 제한을 추가한다. `0018_expand_conversation_response_timeout.sql`은 진단 시험을 위해 최소값을 1초로 확장한다.

## 3. Migration 규칙

- 위치: `packages/database/migrations`
- 파일명: 네 자리 증가 번호와 설명을 결합한 `0001_auth_foundation.sql` 형식
- 적용 순서: 파일명의 byte 기준 오름차순
- 적용 기록: runner가 관리하는 `schema_migrations`
- 무결성: SHA-256 checksum이 적용 기록과 다르면 즉시 실패
- 동시 실행: PostgreSQL advisory lock `modelnaru:schema-migrations`로 직렬화
- 원자성: 각 migration 파일 전체와 적용 기록 insert를 하나의 transaction으로 실행
- 변경 정책: 배포된 migration은 수정하지 않고 새 migration에서 변경
- 시작 정책: Compose의 `migrate` service가 PostgreSQL healthy 이후 실행되고 성공해야 API가 시작

### `schema_migrations`

애플리케이션 domain table이 아니라 migration runner 소유 table이다.

| Column       | Type           | 조건                      | 설명             |
| ------------ | -------------- | ------------------------- | ---------------- |
| `version`    | `varchar(255)` | PK                        | migration 파일명 |
| `checksum`   | `char(64)`     | not null                  | SQL 파일 SHA-256 |
| `applied_at` | `timestamptz`  | not null, default `now()` | 적용 시각        |

## 4. `users`

관리자가 Web에서 생성할 일반 사용자만 저장한다. 고정 관리자는 이 table에 저장하지 않는다.

| Column                | Type           | 조건                            | 설명                   |
| --------------------- | -------------- | ------------------------------- | ---------------------- |
| `id`                  | `uuid`         | PK, default `gen_random_uuid()` | 내부 사용자 ID         |
| `username`            | `varchar(64)`  | not null                        | 표시·로그인 ID 원문    |
| `username_normalized` | `varchar(64)`  | unique, not null                | ASCII lowercase 비교값 |
| `password_hash`       | `text`         | not null                        | Argon2id PHC 문자열    |
| `display_name`        | `varchar(100)` | nullable                        | 화면 표시 이름         |
| `is_enabled`          | `boolean`      | not null, default `true`        | 로그인 허용 여부       |
| `credential_version`  | `bigint`       | not null, default `1`           | 비밀번호 변경 시 증가  |
| `created_at`          | `timestamptz`  | not null, default `now()`       | 생성 시각              |
| `updated_at`          | `timestamptz`  | not null, 자동 갱신             | 최종 변경 시각         |

제약:

- 사용자명은 영문·숫자·점·밑줄·하이픈 3~64자다.
- `username_normalized`는 lowercase이고 대소문자를 무시해 unique다.
- `password_hash`는 `$argon2id$`로 시작한다.
- `credential_version`은 1 이상이다.

삭제 정책:

- 사용자 삭제는 hard delete다.
- `sessions.user_id`는 `ON DELETE CASCADE`다.
- 대화·첨부 table이 추가되면 동일 사용자 FK와 원본 파일 삭제 작업을 하나의 삭제 workflow에서 처리한다.

수정 정책:

- password 변경 시 `credential_version`을 1 증가시키고 활성 session을 `password_changed`로 폐기한다.
- username 변경 시 `credential_version`을 1 증가시키고 활성 session을 `account_changed`로 폐기한다.
- `is_enabled`를 false로 변경하면 활성 session을 `account_disabled`로 폐기한다.

## 5. `sessions`

고정 관리자와 일반 사용자 browser session의 server-side 상태를 저장한다.

| Column                   | Type           | 조건                            | 설명                                                   |
| ------------------------ | -------------- | ------------------------------- | ------------------------------------------------------ |
| `id`                     | `uuid`         | PK, default `gen_random_uuid()` | 내부 session ID                                        |
| `principal_type`         | `varchar(16)`  | `admin` 또는 `user`             | principal 종류                                         |
| `user_id`                | `uuid`         | nullable FK                     | 일반 사용자일 때만 설정                                |
| `account_key`            | `varchar(128)` | not null                        | 계정별 session 제한용 안정 식별자                      |
| `token_hash`             | `bytea`        | unique, 32 bytes                | session token SHA-256, 원문 저장 금지                  |
| `csrf_token_hash`        | `bytea`        | 32 bytes                        | CSRF token SHA-256                                     |
| `credential_fingerprint` | `bytea`        | 32 bytes                        | 관리자 설정 또는 사용자 credential version fingerprint |
| `created_at`             | `timestamptz`  | not null                        | 생성 시각                                              |
| `last_seen_at`           | `timestamptz`  | not null                        | 마지막 활동 시각                                       |
| `idle_expires_at`        | `timestamptz`  | not null                        | 기본 24시간 idle 만료                                  |
| `absolute_expires_at`    | `timestamptz`  | not null                        | 기본 7일 절대 만료                                     |
| `revoked_at`             | `timestamptz`  | nullable                        | 명시적 폐기 시각                                       |
| `revoked_reason`         | `varchar(64)`  | nullable                        | 비민감 폐기 사유 code                                  |
| `ip_hash`                | `bytea`        | nullable, 32 bytes              | 원본 IP 대신 keyed hash                                |
| `user_agent_hash`        | `bytea`        | nullable, 32 bytes              | User-Agent hash                                        |

제약:

- `admin` session은 `user_id IS NULL`, `user` session은 `user_id IS NOT NULL`이다.
- token, CSRF token과 원본 IP는 저장하지 않는다.
- `last_seen_at >= created_at`, `idle_expires_at > last_seen_at`, `absolute_expires_at > created_at`이어야 한다.
- 계정별 활성 session 최대 3개 제한은 인증 transaction에서 적용한다.
- 고정 관리자 `account_key`는 정규화한 관리자 ID에서 파생하고 login transaction에서 advisory lock으로 직렬화한다.
- 일반 사용자 `account_key`는 변경되지 않는 사용자 UUID에서 파생하고 같은 방식으로 login transaction을 직렬화한다.
- `credential_fingerprint`는 관리자는 시작 credential, 일반 사용자는 사용자 UUID와 `credential_version`의 SHA-256이다. 현재 값과 다르면 인증 단계에서 폐기한다.
- idle·absolute 만료 row는 login 또는 인증 요청에서 lazy revoke하며 자동 hard delete 주기는 아직 두지 않는다.

Index:

- `token_hash` unique index: 인증 조회
- `(account_key, created_at DESC) WHERE revoked_at IS NULL`: 계정별 활성 session 정리
- `(idle_expires_at) WHERE revoked_at IS NULL`: idle 만료 정리
- `(absolute_expires_at) WHERE revoked_at IS NULL`: 절대 만료 정리
- `(user_id) WHERE user_id IS NOT NULL`: 사용자 session 조회·cascade 보조

## 6. `audit_logs`

관리자 사용자 관리 작업의 최소 감사 원장을 저장한다. 후속 관리자 로그 단계에서 같은 table을 조회·보존 정책에 연결한다.

| Column               | Type           | 조건                            | 설명                             |
| -------------------- | -------------- | ------------------------------- | -------------------------------- |
| `id`                 | `uuid`         | PK, default `gen_random_uuid()` | 감사 이벤트 ID                   |
| `occurred_at`        | `timestamptz`  | not null, default `now()`       | 발생 시각                        |
| `actor_type`         | `varchar(16)`  | `admin` 또는 `system`           | 행위자 종류                      |
| `actor_id`           | `varchar(128)` | nullable                        | 관리자 account key               |
| `action`             | `varchar(64)`  | not null                        | `user.created` 등 작업 code      |
| `target_type`        | `varchar(64)`  | not null                        | 현재 `user`                      |
| `target_id`          | `uuid`         | nullable                        | 삭제 후에도 보존할 대상 ID       |
| `before_data`        | `jsonb`        | nullable                        | 비밀값을 제외한 변경 전 snapshot |
| `after_data`         | `jsonb`        | nullable                        | 비밀값을 제외한 변경 후 snapshot |
| `reason`             | `varchar(500)` | nullable                        | 선택적 작업 사유                 |
| `ip_hash`            | `bytea`        | nullable, 32 bytes              | keyed IP hash                    |
| `user_agent_summary` | `varchar(255)` | nullable                        | 길이를 제한한 User-Agent 요약    |
| `request_id`         | `uuid`         | nullable                        | 후속 request 추적 ID             |

`before_data`와 `after_data`에는 username, display name, enabled 상태, credential version만 허용하며 password·hash·token은 저장하지 않는다. 사용자 삭제 이벤트는 username·display name도 제거하고 `target_id`만 비가역 대상 식별자로 보존한다. `occurred_at DESC`와 `(target_type, target_id, occurred_at DESC)` index를 둔다.

## 7. `provider_connections`

관리자가 등록한 Provider 연결과 암호화 자격증명을 저장한다. `template_id`, 표시 이름, 고정 `base_url`, AES-256-GCM `credential_ciphertext`·12-byte nonce·16-byte auth tag, 선택적 마지막 네 글자 hint, 활성·상태·모델 동기화 시각을 가진다. 이름은 `lower(name)` unique index로 중복을 막는다. API 키 원문과 인증 header는 저장하지 않는다.

## 8. `provider_models`

연결별 모델 ID, 표시 이름, context·출력 한도, 안전한 metadata, 활성·가용 상태와 마지막 조회 시각을 저장한다. `(provider_connection_id, model_id)`가 unique이며 연결 물리 삭제 시 cascade한다. 동기화에서 사라진 모델은 삭제하지 않고 `is_available = false`로 보존한다. 신규 모델은 `is_enabled = false`로 시작한다.

## 9. `user_model_permissions`

사용자와 Provider 모델의 명시적 허용 상태, nullable 모델별 일일 호출 제한과 향후 parameter policy JSON을 저장한다. `(user_id, provider_model_id)` 복합 PK이며 사용자 또는 모델 삭제 시 cascade한다.

## 10. 게스트·일일 사용량

`0004_access_and_guest.sql`은 [GUEST_ACCESS_SPEC.md](./GUEST_ACCESS_SPEC.md)에 따라 `guest_settings`, `guest_principals`, `guest_model_permissions`와 `daily_usage_counters`를 추가한다. `sessions`는 `principal_type = 'guest'`일 때만 설정되는 nullable `guest_id` FK를 갖는다.

- 게스트 설정은 singleton이며 코드 원문 대신 Argon2id hash만 저장한다.
- 일반 사용자와 게스트 모델 권한에는 nullable 모델별 일일 호출 제한을 둔다.
- 일반 사용자 계정 전체 일일 제한도 nullable 값으로 저장한다.
- 일일 counter는 현지 날짜·주체 범위·모델의 unique key와 원자적 upsert를 사용한다.
- 게스트 주체 삭제 시 session과 임시 대화 데이터가 cascade되도록 한다.
- 대화 table은 `user_id`와 `guest_id` 중 정확히 하나만 설정되도록 제약한다.

## 11. `conversations`

`0005_chat_foundation.sql`은 일반 사용자 또는 게스트 중 정확히 하나가 소유하는 대화를 저장한다. 제목, 시스템 프롬프트, 이전 메시지 수, 컨텍스트 token 한도와 활성 branch를 가진다. `history_message_limit = 0`은 무제한이고 `context_token_limit` 기본값은 100,000이다. `0010_conversation_generation_defaults.sql`은 대화별 `default_provider_model_id`와 검증된 `generation_parameters` JSON object를 추가한다. `0015`는 0~~3 범위의 `request_trace_limit`을 기본 3으로 추가한다. 이 column은 메모리 기록의 개수만 제어하며 요청·응답 본문 자체는 DB에 저장하지 않는다. `0017`은 `response_timeout_seconds`를 기본 120초로 추가하고 `0018`은 진단 시험을 위해 허용 범위를 1~~1,800초로 확장한다. 이 값은 Provider에 전송하는 생성 파라미터가 아니라 서버가 첫 응답과 다음 streaming chunk의 유휴 시간을 제한하는 실행 설정이다.

- `user_id`와 `guest_id`는 각각 소유 주체 삭제 시 cascade한다.
- 소유 주체별 `(owner_id, updated_at DESC)` partial index로 목록을 조회한다.
- `(active_branch_id, id)` 복합 FK는 활성 branch가 같은 대화에 속함을 강제하고, 생성 transaction의 순환 참조를 위해 commit까지 지연한다.
- `default_provider_model_id`는 대화 설정에서 선택한 기본 모델이며 모델 삭제 시 `NULL`이 된다. 실제 호출 시에는 현재 주체의 모델 권한과 활성 상태를 다시 검증한다.
- `generation_parameters`는 대화별 생성 기본값 JSON object이며 DB 기본값은 `{ "temperature": 1 }`이다. 메시지 호출 시 선택 모델의 parameter policy로 다시 정규화한다.
- 열 번째 migration은 기존 대화의 활성 분기에서 가장 최근 assistant 메시지가 사용한 모델과 `request_parameters`를 한 번 backfill한다. 해당 메시지가 없으면 모델은 `NULL`, 파라미터는 DB 기본값을 유지한다.

## 12. `conversation_branches`

대화 생성 시 parent가 없는 root branch를 하나 만든다. 대화별 root branch는 partial unique index로 하나만 허용한다. 재생성 branch는 같은 대화의 `parent_branch_id`와 교체 대상 assistant의 `forked_from_message_id`를 보존한다. 자식 분기는 부모의 분기 대상 직전까지를 논리적으로 상속하고 새 assistant와 이후 메시지만 자체 행으로 저장한다. 대화 삭제 시 모든 branch가 cascade 삭제된다.

## 13. `messages`

분기 내 `sequence_number`로 순서를 정하고 `user`, `assistant`, `summary` 역할과 `pending`, `streaming`, `completed`, `failed`, `cancelled` 상태를 저장한다. 실제 호출에 사용된 Provider 모델 FK와 template·model ID snapshot, 검증된 parameter JSON, token usage와 일반화된 오류 code를 저장한다.

- `(branch_id, sequence_number)`는 unique다.
- branch와 conversation 복합 FK로 다른 대화의 branch에 메시지를 삽입할 수 없다.
- Provider 모델이 삭제돼도 FK만 `NULL`로 바꾸고 template·model snapshot은 보존한다.
- 완료 상태와 `completed_at` 존재 여부를 일치시킨다.
- 대화 또는 branch 삭제 시 cascade한다.
- 재생성 assistant가 완료될 때 같은 transaction에서 조건부로 `conversations.active_branch_id`를 새 분기로 전환한다. 실패·취소 분기는 저장하되 활성화하지 않는다.

## 14. 컨텍스트 요약

`0006_context_summarization.sql`은 전역 `summarization_settings` singleton과 원본 메시지를 변경하지 않는 `context_summaries` 이력을 추가한다.

- 관리자는 활성 Provider 모델 하나와 20~20,000자의 요약 prompt를 지정한다. 모델이 지정되지 않은 초기 상태에서는 자동 요약을 실행하지 않는다.
- `0007_summarization_parameters.sql`은 선택적 `temperature`(0~~2)와 `top_p`(0~~1)를 추가한다. `NULL`은 Provider 기본 sampling 값을 사용한다는 뜻이다.
- `0008_provider_parameter_profiles.sql`은 Provider별 고급 요약 파라미터를 보존하는 `provider_parameters` JSON object를 추가한다. API는 허용 key·형식·범위를 중앙 policy로 검증한 값만 저장한다.
- prompt를 저장할 때마다 `prompt_version`을 증가시켜 이전 결과와 새 설정을 구분한다.
- 요약은 대화·생성 당시 branch, 포함한 최초·최종 메시지, 포함 개수, Provider 모델과 template·model snapshot, token usage를 보존한다.
- 현재 분기 경로에 `last_message_id`가 포함되고 모델·prompt version이 같은 가장 넓은 기존 요약만 재사용한다.
- 대화·branch·포함 메시지 삭제 시 관련 요약도 cascade 삭제한다. Provider 모델 삭제 시 실제 FK만 `NULL`로 바꾸고 snapshot은 유지한다.
- 같은 branch 끝점·prompt version·Provider 모델의 중복 생성을 partial unique index로 방지한다.

## 15. `usage_events`

`0009_usage_ledger.sql`은 AI 요청의 집계용 원장을 대화 본문과 분리해 저장한다.

| Column                          | Type           | 조건                                  | 설명                                 |
| ------------------------------- | -------------- | ------------------------------------- | ------------------------------------ |
| `id`                            | `uuid`         | PK                                    | 사용량 이벤트 ID                     |
| `assistant_message_id`          | `uuid`         | nullable unique, `ON DELETE SET NULL` | 원 요청 추적용 메시지 ID             |
| `principal_type`                | `varchar(16)`  | `user` 또는 `guest`                   | 호출 주체 종류                       |
| `principal_id`                  | `uuid`         | not null, FK 없음                     | 삭제 후에도 집계 가능한 당시 주체 ID |
| `principal_label`               | `varchar(100)` | not null                              | 당시 사용자명 또는 축약 게스트 표시  |
| `provider_model_id`             | `uuid`         | nullable, `ON DELETE SET NULL`        | 현재 Provider 모델과의 선택적 연결   |
| `provider_template_id_snapshot` | `varchar(64)`  | not null                              | 호출 당시 Provider template          |
| `model_id_snapshot`             | `varchar(255)` | not null                              | 호출 당시 모델 ID                    |
| `operation_type`                | `varchar(16)`  | `chat` 또는 `summary`                 | 일반 대화 또는 자동 요약 호출        |
| `status`                        | `varchar(16)`  | pending/completed/failed/cancelled    | 요청 상태                            |
| `input_tokens`                  | `integer`      | nullable, 0 이상                      | Provider가 보고한 입력 token         |
| `output_tokens`                 | `integer`      | nullable, 0 이상                      | Provider가 보고한 출력 token         |
| `duration_ms`                   | `integer`      | nullable, 0 이상                      | 요청 시작부터 종료까지 걸린 시간     |
| `started_at`                    | `timestamptz`  | not null                              | 요청 원장 생성 시각                  |
| `completed_at`                  | `timestamptz`  | nullable                              | 완료·실패·취소 시각                  |

- 새 assistant 요청을 만들 때 같은 transaction에서 `pending` 원장을 생성하고 완료·실패·취소 전환과 함께 갱신한다. 새 컨텍스트 요약 저장도 같은 transaction에서 완료 원장을 생성하며 재사용한 기존 요약은 새 호출로 세지 않는다.
- 대화·사용자·게스트가 삭제돼도 원장은 보존한다. 메시지와 Provider 모델 FK만 `NULL`이 되며 snapshot은 유지한다.
- 대화 본문, system prompt, 응답 본문, API key와 생성 parameter는 저장하지 않는다.
- migration 적용 시 기존 assistant 메시지를 한 번 backfill한다. 기존 실패·취소 메시지의 종료 시각은 마지막 갱신 시각을 사용한다.
- 전체 기간, 주체별 기간과 모델별 기간 index를 둔다.

## 16. `attachments`

`0011_text_attachments.sql`은 대화 소유 attachment와 선택적인 user message 연결을 저장한다.

- `conversation_id`는 대화 삭제 시 cascade하며 `(message_id, conversation_id)` 복합 FK는 다른 대화의 메시지 연결을 막는다.
- 메시지 전송 전에는 `message_id = NULL`이고, 전송 transaction에서 생성한 user 메시지 ID를 기록한다.
- `original_name`은 표시 metadata일 뿐 저장 경로에 사용하지 않는다. `storage_key`는 UUID 기반 상대 경로이며 unique다.
- `file_kind`는 `text`, `pdf`, `image`, `status`는 `processing`, `ready`, `failed`로 제한한다. 현재 API는 `text`·`pdf`의 `ready` 행을 생성한다.
- text ready 행은 최대 2,000,000자의 `extracted_text`와 `text_encoding`을 반드시 가진다.
- `0012_pdf_attachments.sql`은 nullable `page_count`를 추가한다. PDF ready 행은 추출문과 1~500 범위의 페이지 수가 필요하며 텍스트 인코딩은 `NULL`이다. 실제 업로드 상한은 config 기본값인 100페이지로 더 엄격하게 검사한다.
- `0016_pdf_ocr.sql`은 `ocr_page_count`를 추가한다. 값은 0~500이며 PDF에서는 전체 `page_count` 이하, PDF가 아닌 attachment에서는 항상 0이어야 한다.
- `0013_image_attachments.sql`은 nullable `image_width`, `image_height`와 `provider_models.supports_image_input`을 추가한다. 이미지 ready 행은 양쪽 크기가 모두 필요하고 추출문·인코딩·페이지 수는 `NULL`이다. 모델 capability 기본값은 `false`이며 동기화로 덮어쓰지 않는다.
- `0014_attachment_lifecycle.sql`은 `expired` 상태, singleton `attachment_settings`, 재시도 가능한 `attachment_cleanup_queue`와 cascade 삭제 전 원본 key를 보존하는 trigger를 추가한다.
- `include_in_future_messages`는 이후 Provider context에 추출문을 계속 포함할지 결정한다.
- `expires_at` cleanup index와 대화·message 조회 index를 둔다.

`attachment_settings`는 보관 일수와 최근 cleanup 결과를 관리한다. `attachment_cleanup_queue`는 파일시스템 삭제가 성공한 뒤에만 제거한다. 만료 attachment는 추출문과 후속 포함 설정을 제거하되 파일명·크기·페이지·해상도 metadata를 유지한다.

## 16.1 관리자 운영 로그와 보관 설정

`0015_admin_logs_and_request_traces.sql`은 다음 table과 설정을 추가한다.

- `operational_logs`: `security`, `file`, `system` 범주의 수준·작업·상태·주체·대상·Provider/model snapshot·일반화 오류·처리 시간·안전한 JSON metadata를 저장한다.
- `log_settings`: singleton 행으로 AI·보안·감사·파일·시스템 범주별 보관 일수와 최근 cleanup 시각·삭제 건수를 저장한다.
- `guest_settings.request_trace_enabled`: 게스트의 session 한정 전송 기록 허용 여부이며 기본 true다.
- 범주·발생 시각, 작업·발생 시각과 오류 발생 시각 partial index로 관리자 최신순 조회를 지원한다.
- 전송 기록 원문은 `operational_logs`나 별도 table에 저장하지 않는다.

## 17. 오류·경계 조건

- 적용 기록은 있는데 repository에 migration 파일이 없으면 downgrade 또는 불완전 배포로 보고 실패한다.
- 기존 migration checksum이 다르면 파일 변조로 보고 실패한다.
- migration 실패 시 해당 파일의 transaction을 rollback하고 API를 시작하지 않는다.
- DB URL과 password는 migration log에 출력하지 않는다.

## 18. 검증·인수 조건

- migration 계획 정렬·checksum 단위시험 통과
- SQL에 users·sessions 제약과 필수 index가 존재
- 같은 migration을 반복 실행해도 재적용되지 않음
- 두 runner가 동시에 실행돼도 한 번만 적용됨
- DB 장애 또는 migration 실패 시 API container가 ready 상태가 되지 않음
- 일반 사용자 hard delete 시 session이 cascade 삭제됨
- 사용자 관리 mutation과 audit insert가 같은 transaction에서 commit 또는 rollback됨
- audit snapshot에 password·hash·token이 없음
- Provider credential nonce·auth tag 길이와 HTTPS base URL 제약이 존재
- Provider 모델 unique·cascade와 사용자 모델 권한 복합 PK가 존재
- Provider 감사 snapshot에 API 키·ciphertext·nonce·tag가 없음
- 게스트 소유권의 user·guest 상호 배타 제약과 만료 삭제 관계가 존재
- 날짜별 호출 counter의 unique 제약과 동시 원자적 예약 시험 통과
- 대화의 사용자·게스트 상호 배타 소유권과 주체 삭제 cascade가 존재
- 대화마다 root branch가 하나이며 활성 branch가 같은 대화에 속함
- 메시지 역할·상태·분기 순서·모델 snapshot 제약이 존재
- 대화별 기본 모델 FK와 생성 파라미터 JSON object 제약이 존재하며 기존 대화 backfill이 활성 분기의 최신 assistant를 기준으로 한다.
- 활성 분기 화면 조회와 Provider 컨텍스트 구성은
  `conversation_branches.parent_branch_id`를 재귀적으로 따라가며, 각 부모
  분기에서는 자식의 `forked_from_message_id`보다 앞선 sequence만 포함한다.
  메시지 page는 기존 `messages_branch_sequence_unique` index를 사용하므로
  별도 migration을 추가하지 않는다.
- 대화별 응답 유휴 타임아웃이 1~1,800초 범위로 제한되고 기본값은 120초다.
- 요약 설정 singleton, prompt 범위와 요약 범위 message FK·중복 방지 index가 존재
- 사용량 원장은 본문 없이 주체·모델 snapshot, 상태, token과 처리 시간만 저장하고 원본 삭제 후에도 유지됨
- attachment가 대화·message 복합 FK로 격리되고 이름·종류·크기·storage key·추출문·상태 제약과 만료 index를 가짐
- 운영 로그 범주·수준·상태와 보관 기간에 DB 제약이 있고 대화별 전송 기록 수는 0~3으로 제한됨

## 19. 미결정·보류 항목

- 이미지 OCR·변환 결과 metadata가 필요해지면 후속 migration에서 추가한다.
- 폐기·만료 session의 hard delete 주기와 보존 log는 운영 단계에서 확정한다.
# Migration 0019 — 모델 웹 검색 (2026-08-10)

- `provider_models.supports_web_search boolean NOT NULL DEFAULT false`: 관리자가 검증한 모델별 Provider 네이티브 웹 검색 능력이다.
- `conversations.web_search_enabled boolean NOT NULL DEFAULT false`: 해당 대화가 웹 검색 사용을 요청하는지 저장한다.
- 기존 모델과 대화는 모두 안전하게 비활성 상태로 마이그레이션된다.
