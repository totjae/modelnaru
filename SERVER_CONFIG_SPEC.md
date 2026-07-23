# 서버 시작 설정 명세

## 1. 목적

애플리케이션의 port, 관리자 계정과 서버 구동에 필요한 값을 하나의 시작 설정 파일에서 관리한다. 설정은 서버 시작 시 한 번 읽고 검증하며 파일 변경만으로 실행 중 설정을 즉시 바꾸지 않는다. 변경 사항은 애플리케이션 재시작 후 적용한다.

## 2. 기본 위치와 형식

- 배포 root 예시: `/opt/apichat`
- 기본 경로: 서버 구동 파일과 같은 폴더의 `./config.yaml`
- 운영 예시: `/opt/apichat/config.yaml`
- 형식: YAML
- 소유자: 서비스 전용 Linux 계정 또는 root
- 파일 권한: `0600`
- 배포 폴더는 web root 밖에 두고 `config.yaml`은 Git 추적 대상에서 제외
- Docker container에는 read-only로 mount
- 설정 파일 전체를 log나 관리자 화면에 출력하지 않음

별도 경로가 지정되지 않으면 실행한 현재 작업 폴더가 아니라 **서버 구동 파일이 위치한 배포 root**의 `config.yaml`을 사용한다. systemd나 cron의 작업 폴더가 달라져도 같은 파일을 찾도록 실행 파일 또는 compose project 경로를 기준으로 절대 경로를 계산한다.

경로는 환경변수 `APICHAT_CONFIG_FILE`로 변경할 수 있다. 이 환경변수에는 설정 파일 경로만 넣고 관리자 비밀번호나 API key를 직접 넣지 않는다.

권장 배포 구조는 다음과 같다.

```text
/opt/apichat/
  compose.yaml
  config.yaml               # Git 제외, 0600
  .gitignore
  bin/
    apichat-admin           # 계정·설정 관리 CLI
  secrets/                  # Git 제외, 0700
    database_url
    provider_master_key
  data/
    postgres/
    uploads/
    temp/
    logs/
```

## 3. 설정 예시

```yaml
version: 1

server:
  host: 127.0.0.1
  port: 32432
  publicBaseUrl: https://chat.example.com
  trustProxy:
    enabled: true
    addresses:
      - 127.0.0.1/32
  shutdownGraceSeconds: 30

admin:
  username: admin
  passwordHash: '$argon2id$v=19$...'
  totpSecret: 'BASE32_SECRET'
  requireTotp: true

database:
  urlFile: ./secrets/database_url

storage:
  root: ./data/uploads
  temp: ./data/temp
  attachmentRetentionDays: 30
  minimumFreeBytesForUpload: 21474836480
  warningFreeBytes: 42949672960

security:
  cookieSecure: true
  cookieSameSite: lax
  allowedHosts:
    - chat.example.com
  csrfEnabled: true

sessions:
  maximumActivePerAccount: 3
  idleTimeoutHours: 24
  absoluteTimeoutDays: 7

limits:
  maximumGlobalAiGenerations: 3
  maximumAiGenerationsPerUser: 2
  maximumPdfWorkers: 1
  maximumOcrWorkers: 1
  maximumFileBytes: 10485760
  maximumImagePixels: 40000000
  maximumAttachmentsPerMessage: 10
  maximumPdfPages: 100

logging:
  level: info
  directory: ./data/logs

providerSecrets:
  masterEncryptionKeyFile: ./secrets/provider_master_key
```

상대 경로는 현재 shell 작업 폴더가 아니라 `config.yaml`이 있는 배포 root를 기준으로 해석한다. 예시의 domain은 실제 서버 값으로 교체한다.

## 4. 관리자 계정 설정

- `admin.username`: 고정 관리자 ID
- `admin.passwordHash`: Argon2id로 생성한 비밀번호 hash
- 관리자 CLI는 최소 10자 비밀번호만 허용하며 `admin.requireTotp`는 항상 `true`다.
- `admin.totpSecret`: TOTP용 Base32 secret
- `admin.requireTotp`: 인터넷 공개 환경에서는 반드시 `true`

사용자가 요청한 관리자 ID·PW는 이 절에 작성하되 PW를 평문으로 저장하지 않고 `passwordHash`로 작성한다. 배포 폴더에 포함된 계정 설정 도구는 대화형 명령으로 hash와 TOTP QR 등록 정보를 생성해야 한다.

```text
./bin/apichat-admin init
./bin/apichat-admin set-password
./bin/apichat-admin reset-totp
./bin/apichat-admin validate
```

명령 이름은 구현 시 변경될 수 있지만 평문 비밀번호를 shell argument에 직접 넣지 않고 숨김 입력으로 받는다. 관리자 ID, password hash 또는 TOTP secret이 변경되면 다음 서버 시작 시 기존 관리자 session을 모두 만료한다.

TOTP 복구 code는 일회용으로 생성하고 hash만 DB에 저장한다. 원본 복구 code는 설정 파일과 같은 서버 disk에 보관하지 않는다.

## 4.1 계정 설정 도구

사용자가 표현한 “계정 설정 daemon”은 외부 port를 열고 계속 실행되는 daemon이 아니라, 필요할 때만 실행되는 **관리자 CLI 또는 일회성 container**로 구현한다. 상시 daemon으로 만들면 관리자 비밀번호 변경 기능이 추가 공격 표면이 되므로 이 프로젝트에는 불필요하다.

도구는 서버 배포물과 같은 폴더에 포함하고 다음 기능을 제공한다.

| 명령           | 기능                                                            |
| -------------- | --------------------------------------------------------------- |
| `init`         | 기본 `config.yaml`, secret과 data 폴더 생성 및 최초 관리자 설정 |
| `set-username` | 고정 관리자 ID 변경                                             |
| `set-password` | 숨김 입력으로 새 비밀번호를 두 번 받고 Argon2id hash 저장       |
| `reset-totp`   | 새 TOTP secret·QR과 일회용 복구 code 생성                       |
| `validate`     | config schema, 권한, 경로, secret 존재 여부 검사                |
| `show`         | 민감값을 마스킹한 현재 시작 설정 표시                           |

Docker만 설치된 환경에서는 동일 기능을 다음과 같이 실행할 수 있게 한다.

```text
docker compose run --rm admin-tool init
docker compose run --rm admin-tool set-password
docker compose run --rm admin-tool reset-totp
docker compose run --rm admin-tool validate
```

계정 설정 도구에는 다음 안전장치를 적용한다.

- 비밀번호와 TOTP secret을 command argument, shell history와 stdout에 출력하지 않음
- 비밀번호 입력은 terminal echo를 끄고 확인 입력을 한 번 더 받음
- Argon2id parameter는 서버의 보안 기본값을 사용하고 hash 문자열에 parameter를 포함
- `config.yaml`이 symbolic link이면 수정을 거부
- 수정 중 file lock을 사용하고 임시 파일을 `0600`으로 만든 뒤 atomic rename
- 기존 설정을 parse·validate한 뒤 대상 필드만 변경
- 관리자 계정 변경 사실만 audit 가능한 system event로 남기고 원문 값은 기록하지 않음
- 애플리케이션 실행 중 변경했다면 재시작이 필요하다는 메시지를 표시
- 일반 사용자 계정은 이 CLI가 아니라 로그인된 관리자 웹 화면에서 관리

## 5. Port와 bind 정책

- 애플리케이션 기본 port: `32432`
- `server.port`로 변경 가능
- 기본 bind 주소: `127.0.0.1`
- `32432`는 Nginx가 연결하는 애플리케이션의 단일 gateway port이며 브라우저용 web과 `/api` 경로를 모두 제공
- Nginx가 같은 host에서 프록시하므로 기본값을 `0.0.0.0`으로 변경하지 않음
- Docker를 사용할 때 host mapping은 `127.0.0.1:32432:<container-port>` 형식으로 제한
- PostgreSQL과 Valkey port는 host 외부에 publish하지 않음

Next.js web과 NestJS API를 별도 container로 실행하면 경량 gateway container가 `/`는 web, `/api`는 API로 전달하고 gateway 하나만 host의 32432에 publish한다. 또는 배포 구현에서 web server가 동일한 routing을 담당할 수 있다. Nginx와 애플리케이션이 서로 다른 host 또는 격리된 container network에 있는 경우에만 bind 주소와 firewall 규칙을 별도로 변경한다.

## 6. Nginx 연동 기준

기존 Nginx가 TCP 80·443을 수신하고 HTTPS 인증서를 관리한다. 애플리케이션은 인증서를 직접 관리하지 않는다.

기본 proxy 대상은 다음과 같다.

```nginx
upstream apichat_backend {
    server 127.0.0.1:32432;
    keepalive 16;
}

server {
    listen 443 ssl http2;
    server_name chat.example.com;

    location / {
        proxy_pass http://apichat_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }

    location ~ ^/api/conversations/[^/]+/messages(?:$|/) {
        proxy_pass http://apichat_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }

    location ^~ /api/files/ {
        proxy_pass http://apichat_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 12m;
        proxy_request_buffering off;
    }
}
```

실제 endpoint 경로가 상세 API 명세에서 바뀌면 Nginx location도 같이 변경한다. 현재 스트리밍 endpoint인 `/api/conversations/:id/messages`와 취소 하위 경로에는 `proxy_buffering off`를 적용한다. 내부 gateway와 host Nginx 양쪽에 같은 기준을 적용한다.

파일은 한 요청에 하나씩 최대 10MB를 업로드하고 성공한 attachment ID를 메시지에 최대 10개 연결한다. 따라서 Nginx의 단일 요청 허용 크기는 12MB로 충분하다. 브라우저는 여러 파일을 최대 2개씩 병렬 업로드한다.

## 7. Proxy 신뢰와 원본 IP

- `X-Forwarded-*` header는 설정된 trusted proxy에서 온 연결일 때만 신뢰
- 현재 구조에서는 `127.0.0.1/32`의 Nginx만 trusted proxy로 등록
- 외부 client가 애플리케이션 port 32432에 직접 접근할 수 없도록 firewall과 bind 주소로 차단
- rate limit과 보안 log의 IP hash는 검증된 `X-Forwarded-For`의 첫 client 주소를 사용
- 여러 proxy 또는 CDN을 추가할 때 trusted proxy 목록을 명시적으로 갱신

## 8. 설정 검증과 시작 실패

다음 경우 서버는 경고만 내고 실행하지 않고 즉시 실패해야 한다.

- YAML 문법 또는 schema version 오류
- port 범위 오류 또는 port 사용 중
- 관리자 ID·password hash·TOTP secret 누락
- 인터넷 공개 설정인데 `requireTotp`가 false
- database URL secret 파일을 읽을 수 없음
- provider master encryption key 누락 또는 길이 오류
- storage·temp·log 경로가 없거나 쓰기 불가
- `publicBaseUrl`이 HTTPS가 아님
- `allowedHosts`가 비어 있음
- 최대 크기·session·동시성 값이 허용 범위를 벗어남

시작 log에는 config version, bind 주소, port, 경로와 활성 기능만 표시한다. 관리자 ID, hash, TOTP secret, DB URL과 암호화 key는 표시하지 않는다.

## 9. 설정 우선순위

1. 코드에 포함된 안전한 기본값
2. 서버 배포 root의 `./config.yaml`
3. 배포 시 명시한 소수의 비밀값 파일 참조

관리자 UI는 시작 설정의 관리자 ID·password hash, bind address, port, DB URL과 master key를 수정하지 못한다. 첨부 보관 기간, 요약 모델·prompt와 provider 설정처럼 운영 중 변경 가능한 값은 DB의 관리자 설정으로 관리한다.

## 10. 설정 변경 감사

설정 파일 자체를 애플리케이션이 수정하지 않는다. 시작 시 민감 필드를 제외한 설정 checksum을 계산해 system event log에 기록한다. 이전 시작과 checksum이 다르면 변경된 설정 category와 관리자 session 만료 여부를 기록한다.
