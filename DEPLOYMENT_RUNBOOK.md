# ModelNaru 배포 실행서

## 1. 목적

Ubuntu 24.04.4 LTS 서버에서 ModelNaru 기반 서비스를 설치·실행·점검하는 표준 절차를 제공한다.

## 2. 전제 조건

- Docker Engine과 Docker Compose plugin
- Git
- 배포 root `/opt/apichat`
- 기존 host Nginx와 HTTPS 인증서
- 외부에서는 80·443만 접근 가능하고 `32432`는 loopback에만 bind

## 3. 최초 설치

```bash
sudo install -d -m 0750 /opt/apichat
sudo chown "$USER":"$USER" /opt/apichat
git clone https://github.com/totjae/modelnaru.git /opt/apichat
cd /opt/apichat
chmod +x bin/apichat-admin bin/modelnaru
./bin/apichat-admin init
./bin/modelnaru start
```

`init`은 terminal에서 관리자 ID·비밀번호·TOTP 설정을 받고 `config.yaml`, `secrets/`, `data/`를 만든다. 생성된 TOTP 정보는 offline에 보관한다.

## 4. 설정 변경

```bash
cd /opt/apichat
./bin/apichat-admin set-username
./bin/apichat-admin set-password
./bin/apichat-admin reset-totp
./bin/modelnaru restart
```

시작 설정은 hot reload하지 않는다. 변경 뒤 container를 다시 시작한다.

## 5. Nginx 연결

host Nginx upstream을 `127.0.0.1:32432`로 지정한다. streaming endpoint에는 buffering과 cache를 끄고, 파일 endpoint의 `client_max_body_size`는 protocol overhead를 고려해 `12m` 이상으로 둔다. 상세 예시는 `SERVER_CONFIG_SPEC.md`를 따른다.

## 6. 점검

```bash
curl --fail http://127.0.0.1:32432/api/health/live
curl --fail http://127.0.0.1:32432/api/health/ready
docker compose ps
docker compose logs --tail=200 gateway web api postgres valkey
```

정상 상태에서는 live가 `status: ok`, ready가 `status: ready`를 반환한다.

## 7. Update와 rollback

Update 전 현재 commit hash와 `config.yaml`의 별도 local 사본을 확인한다. 외부 backup은 현재 범위에 없으므로 data 손실 가능성을 사용자가 수용한 상태다.

```bash
cd /opt/apichat
git pull --ff-only
docker compose build
docker compose --env-file .runtime.env up -d
```

Rollback은 이전에 기록한 commit으로 새 worktree나 별도 배포 directory를 구성한 뒤 같은 data volume을 연결하는 방식을 우선한다. migration이 추가된 이후에는 해당 migration의 rollback 문서를 먼저 확인한다.

## 8. 장애 대응

- gateway `502`: `web`과 `api` health 및 log 확인
- API 시작 반복: `admin-tool validate` 실행 후 config와 secret 파일 권한 확인
- host에서 접속 불가: `.runtime.env`, gateway port binding과 host Nginx upstream 확인
- disk 부족: 신규 upload를 중지하고 `data/uploads`, log, Docker image 사용량 확인

## 9. 검증·인수 조건

- gateway 외 서비스 port가 host에 공개되지 않는다.
- restart 뒤 healthcheck가 복구된다.
- server reboot 뒤 서비스 자동 시작 여부를 production 설치에서 확인한다.

## 10. 미결정·보류 항목

- 실제 도메인은 최초 배포 시 `publicBaseUrl`과 `allowedHosts`에 입력한다.
- systemd wrapper와 image registry 사용 여부는 최초 실제 배포에서 결정한다.
- 외부 backup은 현재 구성하지 않는다.
