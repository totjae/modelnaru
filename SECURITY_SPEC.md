# ModelNaru 보안 상세 명세

## 1. 목적

공개 회선에서 개인용으로 운영하는 ModelNaru의 기반 보안 경계와 secret 처리 규칙을 정의한다.

## 2. 적용 범위

이번 기반 단계는 시작 설정, 관리자 credential 생성, container port, proxy 신뢰, 파일 권한과 log 노출을 다룬다. 로그인·session·CSRF의 실제 구현은 다음 인증 단계에서 확장한다.

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

## 7. 오류·경계 조건

- 설정 parse 오류, 허용 범위를 벗어난 제한값, 필수 secret 파일 부재는 시작 실패 사유다.
- 개발용 HTTP는 명시적인 development mode에서만 허용하며 production 검증에는 사용할 수 없다.
- CLI는 비대화형 terminal에서 비밀번호를 받을 수 없으면 실패하고 사용자가 TTY에서 다시 실행하도록 안내한다.

## 8. 검증·인수 조건

- 잘못된 port, HTTP public URL, 누락된 TOTP와 잘못된 Argon2 hash가 validator에서 거부된다.
- 저장소 추적 파일에 실제 secret이 없다.
- Compose에서 gateway 외 port가 host에 publish되지 않는다.
- `show` 명령 결과에 민감값이 나타나지 않는다.

## 9. 미결정·보류 항목

- session token 저장 형식과 rotation은 인증 단계에서 결정한다.
- provider credential envelope encryption 구현은 provider registry 단계에서 결정한다.
