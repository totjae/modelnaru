# ModelNaru 보안 상세 명세

## 1. 목적

공개 회선에서 개인용으로 운영하는 ModelNaru의 기반 보안 경계와 secret 처리 규칙을 정의한다.

## 2. 적용 범위

시작 설정, 관리자·일반 사용자 credential, container 경계와 로그인·session·CSRF 구현을 다룬다.

## 3. 시작 설정과 secret

- 실제 `config.yaml`, `.runtime.env`, `secrets/`, `data/`는 Git에서 제외한다.
- `config.yaml`은 production에서 `0600`, `secrets/`는 `0700`을 권장한다.
- 관리자 비밀번호는 Argon2id PHC 문자열만 저장한다. 평문은 argument, log 또는 history에 전달하지 않는다.
- 관리자 비밀번호는 최소 10자이고 TOTP는 항상 필수다. 일반 사용자 비밀번호는 최소 8자다.
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

### 6.4 관리자 사용자 관리 권한

- 사용자 목록은 관리자 session guard, 생성·수정·비밀번호 변경·삭제는 관리자 session과 CSRF guard를 모두 통과해야 한다.
- 일반 사용자용 session이 추가돼도 관리자 guard는 `principal_type: admin` session만 허용한다.
- 관리자 ID와 대소문자만 다른 일반 사용자 ID를 생성할 수 없다.
- 사용자 관리 response·오류·감사 snapshot에는 password와 password hash를 포함하지 않는다.
- 삭제 감사 snapshot에서는 삭제 사용자의 username과 display name도 제거한다.

### 6.5 일반 사용자 인증

- 일반 사용자는 관리자가 생성한 ID와 Argon2id 비밀번호로 로그인하며 TOTP를 요구하지 않는다.
- 존재하지 않는 ID, 잘못된 비밀번호와 비활성 계정은 모두 `AUTH_INVALID_CREDENTIALS`로 응답한다.
- 존재하지 않는 사용자도 Argon2id 검증을 한 번 수행하여 계정 존재 여부에 따른 큰 시간 차이를 줄인다.
- 사용자 `account_key`는 변경 가능한 username이 아니라 내부 UUID에서 파생한다.
- 사용자 credential fingerprint는 내부 UUID와 `credential_version`에서 파생하며 비밀번호·username 변경 시 기존 session을 무효화한다.
- session 인증 시 현재 사용자 row가 없거나 비활성화됐으면 거부한다.
- 일반 사용자 session으로 관리자 API를 요청하면 `AUTH_ADMIN_REQUIRED` 403을 반환한다.

### 6.6 Provider 자격증명과 outbound 요청

- Provider API 키는 config가 가리키는 32-byte master key로 AES-256-GCM 암호화한다.
- 레코드마다 CSPRNG 12-byte nonce를 만들고 고정 AAD와 16-byte 인증 tag로 변조를 검증한다.
- master key는 read-only secret 파일에서 읽고 DB, response와 log에 저장하지 않는다.
- API 목록에는 ciphertext·nonce·tag를 포함하지 않고 충분히 긴 키의 마지막 네 글자 hint만 표시한다.
- 첫 구현은 서버에 고정된 HTTPS base URL과 모델 목록 경로만 호출하며 관리자 임의 URL·header 입력을 허용하지 않는다.
- 채팅 요청도 저장된 base URL을 그대로 신뢰하지 않고 내장 template의 고정 HTTPS URL과 일치할 때만 전송한다.
- 사용자 채팅 parameter는 `temperature`, `topP`, `maxOutputTokens`의 숫자 범위만 허용하며 임의 header·URL·JSON 필드는 upstream에 전달하지 않는다.
- 공개 모델 목록을 제공하는 LLM Gateway는 인증 전용 `GET /v1/key`가 성공한 경우에만 자격증명을 저장한다.
- 모델 조회 redirect를 거부하고 15초 timeout과 5MiB 응답 제한을 적용한다.
- upstream 오류 본문을 response나 일반 log에 포함하지 않는다.
- Provider 변경 API는 관리자 session·CSRF를 요구하고 비밀값 없는 감사 이벤트를 같은 transaction에 기록한다.

### 6.7 게스트 체험

- 게스트 기능은 기본 비활성이고 Argon2id로 hash한 6자 이상 공유 코드가 있어야 활성화할 수 있다.
- 코드 인증마다 사용자 계정과 분리된 무작위 임시 주체를 발급하며 모든 소유권 조회에 server session의 `guest_id`를 사용한다.
- 게스트 cookie·CSRF·proxy 신뢰 기준은 일반 사용자와 동일하다.
- 코드 시도는 IP HMAC 기준 5회/15분, session 생성은 5회/시간을 기본 제한으로 적용한다.
- 게스트 session은 기본 1시간 idle·24시간 absolute 만료이며 로그아웃·만료·관리자 종료 뒤 임시 데이터를 삭제한다.
- 게스트 설정 저장은 기존 게스트 session을 항상 종료하여 변경 전 정책이나 코드로 발급된 session을 남기지 않는다.
- session당·모델별·전체 게스트 호출 제한은 upstream 전송 전에 DB에서 원자적으로 예약한다.
- 게스트 코드·hash, 원본 IP, 대화 본문, Provider 연결 정보와 API 키는 게스트 response와 일반 log에 포함하지 않는다.
- 세부 정책과 오류 code는 [GUEST_ACCESS_SPEC.md](./GUEST_ACCESS_SPEC.md)를 따른다.

### 6.8 텍스트·PDF·이미지 attachment

- 업로드·pending 설정·삭제·메시지 연결은 일반 사용자·게스트 session과 CSRF를 요구하고 server session의 주체로 대화 소유권을 검사한다.
- 원본 파일명은 표시 metadata로만 저장하며 UUID object key 외에는 로컬 경로 구성에 사용하지 않는다.
- 업로드는 `application/octet-stream` 원시 body로 받고 스트림을 쓰는 동안 byte 상한을 검사한다. 확장자·원본 MIME·텍스트 decoding과 NUL byte를 함께 검증한다.
- 임시 파일은 exclusive·0600으로 만들고 검증 뒤 storage root로 rename한다. 실패 시 partial 파일을 정리한다.
- API 응답은 추출 본문·storage key·절대 경로를 반환하지 않으며 다른 주체의 파일과 없는 파일은 같은 not-found로 처리한다.
- Provider에는 사용자가 현재 또는 후속 포함으로 선택한 추출문만 전달한다.
- PDF는 확장자·`application/pdf` MIME·signature를 함께 검사하고 PDF 파서의 script evaluation을 비활성화한다.
- 암호 입력이 필요한 PDF와 파싱 오류는 내부 예외를 노출하지 않는 표준 오류로 거부한다. 텍스트 레이어가 없는 스캔 PDF는 OCR을 임의 수행하거나 외부 서비스로 전송하지 않는다.
- 페이지 수와 추출문 상한을 원본 저장 확정 전에 검사해 과도한 처리와 컨텍스트 확대를 제한한다.
- 동시 PDF 파싱 수는 `limits.maximumPdfWorkers`로 제한해 압축 해제와 텍스트 추출이 CPU·메모리를 동시에 점유하지 않게 한다.
- 이미지는 확장자·MIME·실제 signature와 가로·세로를 함께 검사하고 40,000,000 decoded pixel 기본 상한을 적용한다.
- 원본 image base64는 API response·log·DB에 복제하지 않고 Provider 요청을 만드는 시점에 비공개 storage에서 읽는다.
- 관리자에게 이미지 입력이 명시적으로 허용된 모델만 원본 이미지를 외부 Provider로 전송한다.

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
- 같은 공유 코드를 사용한 게스트 사이의 session·대화·첨부 소유권 격리 시험이 통과한다.
- 게스트 코드·session 생성 속도 제한과 일일 호출 제한이 동시 요청에서도 우회되지 않는다.
- 채팅 mutation과 취소는 session·CSRF·대화 소유권을 검증하며 응답 event에 API 키와 upstream 오류 본문이 없다.
- cascade 삭제할 원본 경로는 DB cleanup queue에 먼저 기록하고 파일 삭제 성공 후에만 queue에서 제거해 장애 중에도 재시도한다.
- 고아 파일 정리는 UUID object key 패턴의 일반 파일만 대상으로 하며 symlink·알 수 없는 디렉터리·24시간 이내 파일을 건드리지 않는다.
- 보관 기간 조회·변경과 수동 cleanup은 관리자 guard를 적용하고 mutation에는 CSRF를 요구한다.

## 9. 미결정·보류 항목

- 장기 session token rotation은 보류하며 logout·credential 변경·만료 시 폐기한다.
- master key rotation과 기존 ciphertext 재암호화 도구는 후속 운영 보안 단계에서 구현한다.
- 로그인 실패 제한을 Valkey 공유 제한으로 전환하는 것은 다중 API instance 도입 시 수행한다.
- 관리자 TOTP 복구 code는 아직 구현하지 않는다.
