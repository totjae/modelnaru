# ModelNaru Database 상세 명세

## 1. 목적

PostgreSQL table, 관계, index, migration 실행 규칙과 삭제 정책을 실제 구현 기준으로 정의한다.

## 2. 적용 범위

첫 migration은 관리자 로그인과 사용자 관리 기반인 `users`, `sessions`를 생성한다. 두 번째 migration은 사용자 관리 작업을 보존할 `audit_logs`를 추가한다. 세 번째 migration은 Provider 연결·모델·사용자 권한 기반을 추가한다. 네 번째 migration은 사용자·게스트 모델 권한, 게스트 주체·세션과 일일 사용량 counter를 추가한다. 대화, message, 첨부와 나머지 log table은 각 기능 구현 전에 후속 migration으로 추가한다.

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

## 11. 오류·경계 조건

- 적용 기록은 있는데 repository에 migration 파일이 없으면 downgrade 또는 불완전 배포로 보고 실패한다.
- 기존 migration checksum이 다르면 파일 변조로 보고 실패한다.
- migration 실패 시 해당 파일의 transaction을 rollback하고 API를 시작하지 않는다.
- DB URL과 password는 migration log에 출력하지 않는다.

## 12. 검증·인수 조건

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

## 13. 미결정·보류 항목

- 대화·branch·첨부 삭제 관계는 채팅과 파일 상세 명세 작성 후 추가한다.
- 폐기·만료 session의 hard delete 주기와 보존 log는 운영 단계에서 확정한다.
