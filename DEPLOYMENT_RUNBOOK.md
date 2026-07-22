# ModelNaru 배포 실행서

## 1. 목적

Ubuntu 24.04.4 LTS 서버에서 ModelNaru 기반 서비스를 설치·실행·점검하는 표준 절차를 제공한다.

## 2. 전제 조건

- Docker Engine과 Docker Compose plugin
- Git
- 현재 배포 root `/home/totquf4171/modelnaru`
- 기존 host Nginx와 HTTPS 인증서
- 외부에서는 80·443만 접근 가능하고 `32432`는 loopback에만 bind

## 3. 최초 설치

```bash
cd /home/totquf4171
git clone https://github.com/totjae/modelnaru.git modelnaru
cd /home/totquf4171/modelnaru
chmod +x bin/apichat-admin bin/modelnaru
./bin/apichat-admin init
./bin/modelnaru start
```

`init`은 terminal에서 관리자 ID·비밀번호·TOTP 설정을 받고 `config.yaml`, `secrets/`, `data/`를 만든다. 생성된 TOTP 정보는 offline에 보관한다.

## 4. 설정 변경

```bash
cd /home/totquf4171/modelnaru
./bin/apichat-admin set-username
./bin/apichat-admin set-password
./bin/apichat-admin reset-totp
./bin/modelnaru restart
```

시작 설정은 hot reload하지 않는다. 변경 뒤 container를 다시 시작한다.

## 5. Nginx 연결

host Nginx의 `chat.mihoservice.xyz` server block에서 upstream을 `127.0.0.1:32432`로 지정한다. TLS 인증서는 `/etc/letsencrypt/live/chat.mihoservice.xyz/`에 있고 Certbot 자동 갱신을 사용한다. `/api/conversations/:id/messages` streaming endpoint에는 buffering과 cache를 끄고, 파일 endpoint의 `client_max_body_size`는 protocol overhead를 고려해 `12m` 이상으로 둔다. 상세 예시는 `SERVER_CONFIG_SPEC.md`를 따른다.

## 6. 점검

```bash
curl --fail http://127.0.0.1:32432/api/health/live
curl --fail http://127.0.0.1:32432/api/health/ready
docker compose ps
docker compose logs --tail=200 migrate gateway web api postgres valkey
```

정상 상태에서는 live가 `status: ok`, ready가 `status: ready`와 `database: ok`를 반환한다. `migrate` service는 migration 적용 후 exit code 0으로 종료되는 것이 정상이다.

Migration을 별도로 재검증할 때는 다음 명령을 사용한다. 이미 적용된 migration은 checksum만 확인하고 다시 실행하지 않는다.

```bash
docker compose run --rm migrate
```

Production container는 build 결과물을 `node`로 직접 실행하며 시작 시 `pnpm`, Corepack 또는 외부 package registry에 접근하지 않는다. 따라서 backend internal network에서도 migration과 API가 시작되어야 한다.

### 6.1 관리자 로그인 점검

배포 후 `https://chat.mihoservice.xyz`에서 서버 설정의 관리자 ID·비밀번호와 인증 앱의 현재 6자리 TOTP code로 로그인한다. 새로고침 후 session 유지와 로그아웃을 확인한다. 브라우저 개발자 도구에서는 `modelnaru_session` cookie가 Secure·HttpOnly·SameSite이고 `modelnaru_csrf`가 Secure·SameSite인지 확인한다. 실제 cookie 원문은 log나 지원 요청에 첨부하지 않는다.

Session row는 다음과 같이 원문 token 없이 확인한다.

```bash
docker compose exec postgres \
  psql -U modelnaru -d modelnaru \
  -c "SELECT principal_type, account_key, created_at, last_seen_at, revoked_at, revoked_reason FROM sessions ORDER BY created_at DESC LIMIT 5;"
```

### 6.2 사용자 관리 점검

관리자 로그인 후 사용자 관리 화면에서 시험 계정을 생성하고 표시 이름 편집, 비활성화·활성화와 비밀번호 변경을 확인한다. 삭제는 해당 사용자의 session과 향후 연결 데이터까지 제거하는 작업이므로 시험 계정에만 수행한다.

두 번째 migration과 감사 기록은 다음처럼 확인한다.

```bash
docker compose exec postgres \
  psql -U modelnaru -d modelnaru \
  -c "SELECT version, applied_at FROM schema_migrations ORDER BY version;"

docker compose exec postgres \
  psql -U modelnaru -d modelnaru \
  -c "SELECT action, target_type, target_id, occurred_at FROM audit_logs ORDER BY occurred_at DESC LIMIT 10;"
```

`0002_user_management_audit.sql`이 기록되고 사용자 작업별 `user.created`, `user.updated`·`user.enabled`·`user.disabled`, `user.password_changed`, `user.deleted` 이벤트가 나타나야 한다. 감사 JSON이나 지원 자료에 실제 password·cookie를 포함하지 않는다.

### 6.3 일반 사용자 로그인 점검

관리자 화면에서 활성 시험 계정을 만든 뒤 로그아웃하고 기본 사용자 탭에서 해당 ID·비밀번호로 로그인한다. TOTP 입력은 사용자 탭에 표시되지 않아야 한다. 로그인 후 개인 작업공간이 보이고 새로고침해도 session이 유지되며 관리자 사용자 관리 화면은 노출되지 않아야 한다.

서로 다른 browser profile 또는 시크릿 창을 이용해 같은 계정으로 네 번 로그인하면 가장 오래 사용하지 않은 session이 폐기돼야 한다. 비밀번호 변경과 계정 비활성화 뒤에는 기존 사용자 session이 다음 요청에서 거부돼 로그인 화면으로 돌아가야 한다. 시험이 끝나면 로그아웃하고 시험 계정을 삭제한다.

```bash
docker compose exec postgres \
  psql -U modelnaru -d modelnaru \
  -c "SELECT principal_type, user_id, account_key, created_at, last_seen_at, revoked_at, revoked_reason FROM sessions WHERE principal_type = 'user' ORDER BY created_at DESC LIMIT 10;"
```

일반 사용자 row는 `principal_type = 'user'`, `user_id`가 설정돼야 한다. 지원 자료에는 cookie나 token 원문을 포함하지 않는다.

### 6.4 Provider 등록 점검

관리자 화면에서 LLM Gateway를 선택하고 연결 이름과 실제 API 키를 입력한다. 등록 성공 시 모델 목록이 나타나고 API 키는 다시 표시되지 않아야 한다. 시험 모델 하나를 활성화하고 모델 동기화, 연결 비활성화·활성화를 확인한다.

```bash
docker compose exec postgres \
  psql -U modelnaru -d modelnaru \
  -c "SELECT template_id, name, credential_hint, is_enabled, status, last_model_sync_at FROM provider_connections ORDER BY created_at DESC;"

docker compose exec postgres \
  psql -U modelnaru -d modelnaru \
  -c "SELECT model_id, is_enabled, is_available FROM provider_models ORDER BY model_id LIMIT 30;"

docker compose exec postgres \
  psql -U modelnaru -d modelnaru \
  -c "SELECT action, target_type, occurred_at FROM audit_logs WHERE action LIKE 'provider.%' ORDER BY occurred_at DESC LIMIT 20;"
```

DB와 API log 출력에 API 키 원문이 없어야 한다. 지원 요청에는 `credential_ciphertext`, nonce, tag와 master key도 첨부하지 않는다. 실제 LLM Gateway 결과는 `PROVIDER_CONTRACT_TESTS.md`에 성공 여부만 기록한다.

## 7. Update와 rollback

Update 전 현재 commit hash와 `config.yaml`의 별도 local 사본을 확인한다. 외부 backup은 현재 범위에 없으므로 data 손실 가능성을 사용자가 수용한 상태다.

```bash
cd /home/totquf4171/modelnaru
git pull --ff-only
./bin/modelnaru start
```

Rollback은 이전에 기록한 commit으로 새 worktree나 별도 배포 directory를 구성한 뒤 같은 data volume을 연결하는 방식을 우선한다. migration이 추가된 이후에는 해당 migration의 rollback 문서를 먼저 확인한다.

## 8. 장애 대응

- gateway `502`: `web`과 `api` health 및 log 확인
- API 시작 반복: `admin-tool validate` 실행 후 config와 secret 파일 권한 확인
- migrate 실패: `docker compose logs migrate postgres`에서 checksum·SQL·연결 오류 확인. 적용된 migration 파일은 수정하지 않음
- migrate log에 Corepack 또는 registry download가 나타남: runtime command가 build 결과물을 `node`로 직접 실행하는 현재 image인지 확인하고 `./bin/modelnaru start`로 rebuild
- host에서 접속 불가: `.runtime.env`, gateway port binding과 host Nginx upstream 확인
- TOTP login 실패: server 시간 동기화 상태와 인증 앱의 현재 code 확인. ID·비밀번호·TOTP 원문은 log에 남기지 않음
- disk 부족: 신규 upload를 중지하고 `data/uploads`, log, Docker image 사용량 확인

## 9. 검증·인수 조건

- gateway 외 서비스 port가 host에 공개되지 않는다.
- restart 뒤 healthcheck가 복구된다.
- server reboot 뒤 서비스 자동 시작 여부를 production 설치에서 확인한다.

## 10. 미결정·보류 항목

- systemd wrapper와 image registry 사용 여부는 최초 실제 배포에서 결정한다.
- 외부 backup은 현재 구성하지 않는다.
