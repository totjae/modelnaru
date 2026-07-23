# ModelNaru Database 상세 명세

## 1. 목적

PostgreSQL table, 관계, index, migration 실행 규칙과 삭제 정책을 실제 구현 기준으로 정의한다.

## 2. 적용 범위

첫 migration은 관리자 로그인과 사용자 관리 기반인 `users`, `sessions`를 생성한다. 두 번째 migration은 사용자 관리 작업을 보존할 `audit_logs`를 추가한다. 세 번째 migration은 Provider 연결·모델·사용자 권한 기반을 추가한다. 네 번째 migration은 사용자·게스트 모델 권한, 게스트 주체·세션과 일일 사용량 counter를 추가한다. 다섯 번째 migration은 대화·branch·message 저장 기반을 추가하며 여섯 번째부터 여덟 번째까지는 자동 요약과 Provider 파라미터를 확장한다. 아홉 번째 migration은 본문과 분리된 관리자 사용량 원장을 추가한다. 열 번째 migration은 대화방별 기본 모델과 생성 파라미터를 추가하고 열한 번째 migration은 텍스트 attachment를 추가한다. 열두 번째 migration은 PDF 페이지 metadata를, 열세 번째 migration은 이미지 크기와 모델별 이미지 입력 capability를 추가한다. 나머지 log table은 각 기능 구현 전에 후속 migration으로 추가한다.

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

`0005_chat_foundation.sql`은 일반 사용자 또는 게스트 중 정확히 하나가 소유하는 대화를 저장한다. 제목, 시스템 프롬프트, 이전 메시지 수, 컨텍스트 token 한도와 활성 branch를 가진다. `history_message_limit = 0`은 무제한이고 `context_token_limit` 기본값은 100,000이다. `0010_conversation_generation_defaults.sql`은 대화별 `default_provider_model_id`와 검증된 `generation_parameters` JSON object를 추가한다.

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
- `0013_image_attachments.sql`은 nullable `image_width`, `image_height`와 `provider_models.supports_image_input`을 추가한다. 이미지 ready 행은 양쪽 크기가 모두 필요하고 추출문·인코딩·페이지 수는 `NULL`이다. 모델 capability 기본값은 `false`이며 동기화로 덮어쓰지 않는다.
- `include_in_future_messages`는 이후 Provider context에 추출문을 계속 포함할지 결정한다.
- `expires_at` cleanup index와 대화·message 조회 index를 둔다.

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
- 요약 설정 singleton, prompt 범위와 요약 범위 message FK·중복 방지 index가 존재
- 사용량 원장은 본문 없이 주체·모델 snapshot, 상태, token과 처리 시간만 저장하고 원본 삭제 후에도 유지됨
- attachment가 대화·message 복합 FK로 격리되고 이름·종류·크기·storage key·추출문·상태 제약과 만료 index를 가짐

## 19. 미결정·보류 항목

- 이미지 OCR·변환 결과 metadata가 필요해지면 후속 migration에서 추가한다.
- 폐기·만료 session의 hard delete 주기와 보존 log는 운영 단계에서 확정한다.
