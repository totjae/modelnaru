# ModelNaru 보안 상세 명세

## 1. 목적

공개 회선에서 개인용으로 운영하는 ModelNaru의 기반 보안 경계와 secret 처리 규칙을 정의한다.

## 2. 적용 범위

시작 설정, 관리자 credential, container 경계와 고정 관리자 로그인·session·CSRF 구현을 다룬다.

## 3. 시작 설정과 secret

- 실제 `config.yaml`, `.runtime.env`, `secrets/`, `data/`는 Git에서 제외한다.
- `config.yaml`은 production에서 `0600`, `secrets/`는 `0700`을 권장한다.
- 관리자 비밀번호는 Argon2id PHC 문자열만 저장한다. 평문은 argument, log 또는 history에 전달하지 않는다.
- TOTP secret은 Base32로 생성하며 public deployment에서는 `admin.requireTotp: true`가 아니면 검증에 실패한다.
- provider master key와 DB URL은 별도 파일을 참조하며 애플리케이션 log에 출력하지 않는다.
- 관리자 CLI의 설정 출력은 password hash와 TOTP secret을 항상 마스킹한다.

## 4. 파일 변경 안전성

- 관리자 CLI는 symbolic link인 설정 파일을 수정하지 않는다.
- 기존 YAML이 schema 검증에 실패하면 일부 필드만 덮어쓰지 않는다.
- 설정 변경은 같은 directory의 임시 파일을 쓴 뒤 atomic rename한다.
- POSIX에서는 변경 후 `0600`을 적용한다.

## 5. Network와 proxy

- 기본 host bind는 `127.0.0.1`이며 gateway만 host port를 publish한다.
- PostgreSQL, Valkey, Web과 API port는 Compose network 밖으로 publish하지 않는다.
- 외부 TLS는 기존 host Nginx가 종료한다.
- `X-Forwarded-*`는 `server.trustProxy.addresses`에 등록한 proxy에서 온 연결만 신뢰한다.
- public base URL은 HTTPS여야 하고 허용 host 목록이 비어 있으면 안 된다.

## 6. 관리자 인증 기준

- 관리자 ID는 시작 설정에 고정한다.
- 공개 환경에서 관리자 TOTP는 필수다.
- Argon2id 기본값은 memory 19,456 KiB 이상, iterations 2 이상, parallelism 1 이상으로 한다.
- 세션은 계정당 최대 3개, idle 24시간, absolute 7일을 기본값으로 한다.
- 관리자 credential 변경 시 기존 관리자 session 전체 만료를 인증 단계에서 구현한다.

### 6.1 Password와 TOTP

- 비밀번호는 `@node-rs/argon2`로 config의 Argon2id PHC 문자열을 검증한다.
- TOTP는 RFC 6238 SHA-1, 30초 period, 6자리이며 server 시각 기준 이전·현재·다음 window만 허용한다.
- 로그인 실패 response는 ID·비밀번호·TOTP 중 실패 지점을 노출하지 않는다.
- 로그인 실패 제한은 API process별 username·IP 조합에 적용한다. 5회부터 일시 차단하며 성공 시 해당 기록을 제거한다.

### 6.2 Session token과 cookie

- session token과 CSRF token은 각각 CSPRNG 32 bytes를 base64url로 생성한다.
- DB에는 각 token의 SHA-256 hash만 저장하고 원문은 cookie로만 전달한다.
- `modelnaru_session`: HttpOnly, Secure, 설정된 SameSite, Path `/`, absolute 만료까지의 Max-Age.
- `modelnaru_csrf`: Secure, 설정된 SameSite, Path `/`, JavaScript가 header에 복사할 수 있도록 HttpOnly를 사용하지 않음.
- cookie Domain은 설정하지 않아 현재 host 전용으로 둔다.
- session 인증 시 idle·absolute 만료, revoked 상태와 관리자 credential fingerprint를 모두 검증한다.
- credential fingerprint는 관리자 ID·password hash·TOTP secret·MFA 설정의 SHA-256이며 원문 credential은 session table에 저장하지 않는다.
- 활성 session은 최대 3개이고 네 번째 login transaction에서 `last_seen_at`이 가장 오래된 session을 폐기한다.

### 6.3 CSRF

- 상태 변경 인증 API는 `X-CSRF-Token` header를 요구한다.
- header 원문은 CSRF cookie와 constant-time 비교하고, SHA-256 값은 DB의 `csrf_token_hash`와 비교한다.
- same-origin Web만 사용하고 CORS를 활성화하지 않는다.

## 7. 오류·경계 조건

- 설정 parse 오류, 허용 범위를 벗어난 제한값, 필수 secret 파일 부재는 시작 실패 사유다.
- 개발용 HTTP는 명시적인 development mode에서만 허용하며 production 검증에는 사용할 수 없다.
- CLI는 비대화형 terminal에서 비밀번호를 받을 수 없으면 실패하고 사용자가 TTY에서 다시 실행하도록 안내한다.
- server 시각이 크게 틀리면 정상 TOTP도 거부되므로 production host의 시간 동기화가 필요하다.

## 8. 검증·인수 조건

- 잘못된 port, HTTP public URL, 누락된 TOTP와 잘못된 Argon2 hash가 validator에서 거부된다.
- 저장소 추적 파일에 실제 secret이 없다.
- Compose에서 gateway 외 port가 host에 publish되지 않는다.
- `show` 명령 결과에 민감값이 나타나지 않는다.
- 인증 cookie 속성, TOTP window, session 만료·폐기와 CSRF 거부 시험이 통과한다.

## 9. 미결정·보류 항목

- 장기 session token rotation은 보류하며 logout·credential 변경·만료 시 폐기한다.
- provider credential envelope encryption 구현은 provider registry 단계에서 결정한다.
- 로그인 실패 제한을 Valkey 공유 제한으로 전환하는 것은 다중 API instance 도입 시 수행한다.
- 관리자 TOTP 복구 code는 아직 구현하지 않는다.
