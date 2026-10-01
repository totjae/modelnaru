# ModelNaru 배포 실행서

## Git 전환·기존 데이터 삭제 (2026-10-02)

사용자가 운영 데이터·이전 백업과 관리자 인증까지 모두 초기화하도록 명시 요청했다. 이전 N14 보존 정책은 이번 정리 대상에 한해 대체한다. 새 root `/home/totquf4171/modelnaru-git`, project `modelnaru-git`, branch `codex/refactor-v2`다. 설치/업데이트 명령은 README.md Git 절과 같고 실제 완료 여부는 TEST_PLAN/IMPLEMENTATION_STATUS가 원장이다.

1. Git checkout의 `.env`에 COMPOSE_FILE=compose.yaml:deploy/compose.production.yaml, COMPOSE_PROJECT_NAME=modelnaru-git를 지정한다. frontend network를 먼저 생성하고 실제 subnet만 신뢰한다. fresh init으로 DB/Provider key/admin을 새로 만든다. source commit/image·migration checksum·권한·빈 DB·32433 staging 로그인/health를 검증한다. 기존 인증값은 복사하지 않는다.
2. 새 배포 준비 후 이전 modelnaru-v2 gateway/api/web를 중지하고 새 config의 server.port32432로 validate/render-env/up한다. host Nginx/site/cert는 유지한다. 공인 HTTPS·새 관리자 로그인·DB 상태를 검증한 뒤 deployment-state.json에 cutoverVerified=true를 기록한다. 실패하면 기존 데이터 삭제를 실행하지 않는다.
3. `scripts/cleanup-legacy-modelnaru.py`는 새 서비스 health/HTTPS와 old 경로 realpath/host mount/다른 container 사용 여부를 검사한다. 아래 첫 명령은 dry-run, 두 번째는 사용자 sudo로 실제 삭제한다.

```bash
cd /home/totquf4171/modelnaru-git
python3 scripts/cleanup-legacy-modelnaru.py
sudo python3 scripts/cleanup-legacy-modelnaru.py --execute
```

삭제 범위: `/home/totquf4171/modelnaru`, `/home/totquf4171/modelnaru-v2-20261002`, `/home/totquf4171/.modelnaru-n04-test`, 스크립트에 고정된 old 두 project container/network/image와 modelnaru_n04_test_data volume. 공유 base image·다른 서비스/volume/network·SSH·공인 HTTPS 인증서는 보존한다. 전역 Docker prune은 금지한다. 정리 후 과거 N14의 old root rollback 명령은 사용할 수 없다.

old 자원0·새4서비스 healthy를 재확인해 결과를 기록한다. 삭제한 과거 데이터는 복구할 수 없다. 이후 Git 업데이트 실패는 config/schema 호환성을 확인한 commit/image로만 복구하며 Git만 되돌려 DB까지 복구됐다고 주장하지 않는다. 이번 초기화 승인은 미래의 새 운영 데이터 삭제에 재사용하지 않는다.

## 이전 운영 기록: N14 v2 archive (Git 전환 전)

- 주소: https://chat.mihoservice.xyz . 서버 mihoservice_server의 /home/totquf4171/modelnaru-v2-20261002가 현재 배포 폴더다. Compose project는 modelnaru-v2이며 전용 compose.override.yaml의 name에도 고정했다. Host Nginx·기존 인증서·127.0.0.1:32432 연결을 유지했다.
- 관리자 ID·비밀번호·TOTP는 기존과 같다. 관리자 항목만 서버 내부에서 보존하고 새 DB/암호화 키/파일 경로를 생성했다. 일반 사용자·대화·Provider 연결은 빈 상태로 시작하므로 관리자 화면에서 사용자와 Provider를 새로 등록한다. 시험 계정/mock/키를 운영 설정으로 남기지 않았다.
- 기존 /home/totquf4171/modelnaru와 그 config/data/secrets 및 modelnaru project의 컨테이너는 중지 상태로 보존했다. 이 폴더에서 운영 start/update를 실행하면 포트가 충돌한다. 현재 운영 명령은 반드시 새 배포 폴더에서 실행한다.

서버의 Docker 실행 권한이 있는 기존 SSH 계정으로:

```bash
cd /home/totquf4171/modelnaru-v2-20261002
./bin/modelnaru status
./bin/modelnaru health
./bin/modelnaru logs
```

시작/중지/재시작/현재 소스 반영은 필요할 때 해당 명령 하나를 실행한다: ./bin/modelnaru start, ./bin/modelnaru stop, ./bin/modelnaru restart, ./bin/modelnaru update. start/restart/update는 build·validate·migration·health를 포함하며 update는 소스를 내려받는 명령이 아니다. 현재 배포물은 검토한 작업 폴더의 code-only archive이며 서버 Git checkout이 아니다. 다음 업데이트는 검토된 소스와 schema 호환성 확인 후 수행한다. 비밀번호 변경/TOTP 복구는 같은 폴더의 ./bin/apichat-admin 명령과 아래 기존 절차를 따른다.

API CPU1.5/RAM1024MiB, Web0.5/512MiB, PostgreSQL0.75/512MiB, Gateway0.25/128MiB로 제한하며 restart unless-stopped·Docker log10MiB×3을 사용한다. 새 기본 구성에는 Valkey가 없다. 설치 당시 builder CPU1.5/RAM3GiB를 사용했고 작업 종료 후 제거했다.

릴리스 식별·실행 근거는 TEST_PLAN.md 최신 N14 절, 복구 절차는 DEPLOYMENT_RUNBOOK.md 최신 N14 절을 따른다. 아래 N13 시험 환경 주소/계정/경로는 종료된 시험의 이력이다.

### N14 릴리스 식별 및 복구

소스 기준 HEAD 992662520773a5e74262b2b9b6808e02a1578e4e에 미커밋 작업을 포함한162개 code-only 파일 archive SHA256 0064c7d0092d97cc6c7b435986b8dc5dcd703bc88544cf1217ee41ed70864312로 식별한다. 이 HEAD만으로 현재 배포 소스를 재현한다고 주장하지 않는다. 소스 파일별 hash는 작업 PC tmp/n14/source-files.json, 전송 archive는 서버 source.tar.gz/PC tmp/n14/release.tar.gz에 보존했다.

새 API image sha256:02cc41cea9c16c5c788e6e8470c601ad8d2cf0b349ecaf16d9718ad9ef84eb0a, Web image sha256:c2fb62a3ba34ec9104f10326a69b0b4d8f1d6a039865c5a05e3fc33fa209ff45. 전체 실행 image 식별은 배포 root/n14-state.json 및 PC tmp/n14/n14-state.json에 있다. config v2/0600, migration0001~0020 및 재실행 checksum 확인, 새 DB/업로드/Provider master key를 사용한다. 기존 관리자 hash/TOTP만 보존했고 값은 출력/문서/PC에 전송하지 않았다.

복구는 새 v2 데이터를 v1에 합치지 않으며 전환 후 새 대화/사용자는 v2 경로에만 보존된다. 현재 old project 컨테이너와 DB가 그대로 존재하는 경우에만 아래를 사용한다. 먼저 현재 v2 활성 작업과 복구 시점의 사용자 영향을 확인한다.

```bash
# 서버에서 현재 v2 앱을 중지해 32432를 비운다. 새 데이터는 삭제하지 않는다.
cd /home/totquf4171/modelnaru-v2-20261002
docker compose --env-file .runtime.env stop gateway api web postgres
# 기존 DB/Valkey를 먼저 시작한다.
docker start modelnaru-postgres-1 modelnaru-valkey-1
# 아래 조회가 healthy인지 확인한 뒤 앱을 시작한다.
docker inspect --format '{{.State.Health.Status}}' modelnaru-postgres-1 modelnaru-valkey-1
docker start modelnaru-api-1 modelnaru-web-1 modelnaru-gateway-1
curl --fail https://chat.mihoservice.xyz/api/health/ready
```

자동 전환 첫 시도에서 서버의 공인 IP 자체 재접속 timeout으로 이 복구 원칙을 실제 수행해 기존5개 healthy를 확인했다. 원인을 확인한 후 두 번째 전환은 정상 완료했다. 기존 API/Web image는 modelnaru-rollback-20261002-api/-web 태그로도 보존했다. old config checksum 불변 확인. 기존 DB에 v2 migration을 적용하거나 old 디렉터리를 삭제하지 않는다.

scripts/deploy-n14.py는 이번 단일 경로의 일회성 prepare/verify/cutover 기록이며 이미 cutover=true이므로 재실행하지 않는다. 통상 운영은 bin/modelnaru를 사용한다. 이 서버는 자신의 WAN IP로 접근할 때 timeout이 발생하므로 자체 HTTPS 진단은 curl --resolve chat.mihoservice.xyz:443:127.0.0.1 https://chat.mihoservice.xyz/api/health/ready처럼 SNI/CA 검증을 유지한 경로를 사용한다. 외부 접근은 별도 PC의 실제 DNS/공인 HTTPS로 확인한다.


## N13 전용 서버 시험 환경 (2026-10-02, 운영 전환 아님)

현재 시험 URL은 https://test-chat.mihoservice.xyz 이며 PC·휴대폰의 같은 반응형 Web이다. 모델 주소 https://api.llmgateway.io/v1과 구분한다. 실제 실행 결과·남은 이미지/실기기 인수는 TEST_PLAN.md 최상단, 상태는 IMPLEMENTATION_STATUS.md가 기준이다.

- 준비 스크립트 scripts/prepare-n13-server.py는 mihoservice_server에서 code-only 소스를 이미 풀어둔 새로운 /tmp/modelnaru-n13-server-* 디렉터리에서만 실행한다. 기존 state/private/data가 있으면 거부한다. 기존 Linux API dependency 이미지와 현재 pnpm-lock.yaml 해시가 일치해야 하며 Docker·Node24 runtime·Poppler/Tesseract kor+eng·기존 Web base image가 필요하다. 일반 신규 서버 설치를 대신하는 명령이 아니다. 소스 준비에 .env/키/사용자 파일/.git/node_modules를 포함하지 않는다.
- 실제 실행 위치 /tmp/modelnaru-n13-server-naRXQ0에서 python3 scripts/prepare-n13-server.py를 사용했다. 현재 환경에 재실행하지 않는다. 전용 state.json에는 컨테이너/network/image·loopbackPort·시험 root가 있고 private는0700/파일0600이다.
- HTTPS는 같은 root의 enable-https.sh 복사본을 검토 후 사용자가 서버 터미널에서 sudo bash /tmp/modelnaru-n13-server-naRXQ0/enable-https.sh /tmp/modelnaru-n13-server-naRXQ0로 실행했다. DNS가 이 서버를 가리키고 host Nginx·Certbot·기존 ACME 계정/80·443 접근이 필요하다. 새 site/cert가 이미 있으면 거부한다. 기존 운영 site를 덮어쓰지 않는다. 인증서 만료2026-12-30, 단기 인수 환경이며 지속 운영 전환/갱신 후 reload 운영 구성 인수가 아니다.
- 상태: 서버 docker ps 및 해당 API/Web/PostgreSQL의 health 상태, 브라우저 URL 로그인, 시험 state.json을 확인한다. 로그는 docker logs modelnaru-n13-server-narxq0-api 등 정확한 시험 컨테이너만 읽고 원문/비밀값을 공유하지 않는다.
- 휴대폰 시험 계정 n13acceptance의 비밀번호는 서버에서 cat /tmp/modelnaru-n13-server-naRXQ0/private/mobile-credentials.json으로 본인만 확인한다. 무료 n13-mobile-fixture를 선택한다. 실제 Gemini 모델 disabled·전역 제목 null을 유지한다. 유료2회 승인은 소진됐으므로 기본 server-acceptance/title-only 모드를 새 승인 없이 반복하지 않는다.
- 실기기 결과 수집을 위해 현재 전용 환경을 유지한다. 시험 종료 후 아래 정리 절차를 따른다. 운영 컨테이너/site/volume 삭제 금지.

### N13 종료 후 정리 (아직 미실행)

선행: 실기기 결과 확보 또는 사용자의 시험 종료 지시. 서버 state.json의 root/소유 자원을 대조한다. 다음은 현재 자원의 정확한 이름이며 별도 환경에 복사해 실행하지 않는다.

1. 사용자 서버 터미널에서 sudo unlink /etc/nginx/sites-enabled/modelnaru-n13-test, sudo rm /etc/nginx/sites-available/modelnaru-n13-test 후 sudo nginx -t가 통과할 때만 sudo systemctl reload nginx를 실행한다. 이 계정은 sudo 비밀번호가 필요해 에이전트가 대신 실행할 수 없다.
2. 사용자 sudo certbot delete --cert-name test-chat.mihoservice.xyz로 시험 인증서/renewal만 제거한다. /var/www/modelnaru-n13-acme가 이 시험 전용임을 다시 확인한 뒤 제거한다.
3. 시험 Docker gateway/web/api/mobile/postgres 순으로 docker rm -f modelnaru-n13-server-narxq0-gateway modelnaru-n13-server-narxq0-web modelnaru-n13-server-narxq0-api modelnaru-n13-server-narxq0-mobile modelnaru-n13-server-narxq0-postgres를 실행한다. frontend/backend network 2개와 api/web image 2개도 같은 정확한 접두사 이름으로 docker network rm 및 docker image rm을 실행한다. 공유 base/운영 image는 제거하지 않는다.
4. /tmp/modelnaru-n13-server-naRXQ0의 realpath가 정확한 단일 시험 root임을 확인하고 필요한 안전 결과만 보존한 뒤 root의 생성 계정/private·DB·파일을 제거한다. 다른 /tmp 경로나 /srv/modelnaru를 대상으로 삼지 않는다. postgres 소유 파일 제거에 sudo가 필요할 수 있다. PC 시험 계정 복사본은 자동 harness finally에서 이미 삭제됐다.
5. 시험 자원0·운영 healthy·Web test route 종료를 확인하고 TEST_PLAN/HANDOFF/STATUS에 실제 정리 결과를 기록한다. 정리 전 완료했다고 주장하지 않는다.


## N02 새 버전 release·전환·복구 계약 (2026-09-30 확정, N12 구현)

새 버전은 `config.yaml version: 2`, migration `0001~0020`, job SSE proxy, 단일 API 프로세스를 요구한다. 아래 설치·운영 명령은 N12 작업 트리 기준이다. 격리 Docker 인수를 완료했으며 증거와 제한은 TEST_PLAN.md N12를 따른다. N13/N14 이전에는 운영 전환 완료로 해석하지 않는다.

1. 전환 직전 실행 중 image digest/commit, config version과 민감값을 제외한 checksum, 적용 migration checksum, Compose 서비스/volume 경로, host Nginx upstream, ModelNaru 데이터와 인접 서비스 경계를 기록한다. 기존 ModelNaru 디렉터리·config·DB/업로드 volume은 rollback을 위해 그대로 보존한다. 실제 비밀값은 문서/로그에 기록하지 않는다.
2. v2는 별도 release 디렉터리와 새 ModelNaru 전용 데이터 경로에서 `init`으로 v2 config를 생성한다. migration은 기존 `0001`~`0019`와 새 번호를 새 빈 DB에 순서대로 적용하며, 적용된 SQL은 수정하지 않는다. 기존 v1 DB를 v2에 직접 붙이는 in-place upgrade와 기존 데이터 이전은 이번 전환의 지원 경로가 아니다. 이는 사용자 승인을 받은 이번 ModelNaru 전환에만 적용하며 다른 서비스·추후 업데이트의 삭제 허용으로 해석하지 않는다.
3. 전환 전 `validate`, Compose config/build, 빈 DB migration과 재실행 checksum, API live/ready, Web/Gateway health, 새 job 구독 경로의 buffering off/15초 heartbeat, 실제 로그인·생성·재접속·중지·Provider/로컬 진단을 격리 환경에서 검증한다. 실제 외부 HTTPS는 이전 서비스를 중지한 짧은 전환 창에 확인한다. 새 release가 실패하면 새 디렉터리/volume만 중지하고, 보존한 이전 image+config+이전 volume으로 돌아간다. v2에서 새로 생성한 데이터는 이 rollback으로 이전 설치에 합쳐지지 않는다.
4. v2 이후 업데이트는 release 식별·config v2와 migration 호환성 검사를 선행한다. schema가 이전 image와 호환된다는 시험 증거 없이는 이전 image에 현재 DB를 붙이지 않는다. 파괴적 migration은 별도 복구 계획과 명시적 대상 확인을 요구한다. 외부 backup은 현재 범위가 아니며 같은 disk의 local dump는 host/SSD 손상 복구를 보장하지 않는다.
5. 종료는 새 job 접수를 멈추고 최대 `shutdownGraceSeconds=30` 동안 활성 upstream을 중단·최종 checkpoint/`CHAT_SERVER_SHUTDOWN` 실패 상태를 commit한다. 강제 종료로 남은 job은 다음 시작에서 `CHAT_SERVER_RESTARTED` 실패로 정리하고 자동 유료 재호출하지 않는다. proxy는 15초 heartbeat가 지나도록 SSE를 buffering하지 않는다. API/Web/Gateway/PostgreSQL에는 Docker JSON log 10 MiB×3개 rotation을 적용하며 DB 운영 로그 보존은 ADMIN_LOGGING_SPEC.md를 따른다.
6. 현행 Compose의 Valkey는 `compose.yaml` 의존성과 CLI 디렉터리 생성 외에 앱 사용처가 없다. 새 버전 단일 프로세스에는 필요하지 않으므로 N12에서 서비스·depends_on·신규 Valkey 폴더 생성을 제거했다. 기존 Valkey 데이터 경로는 v1 보존본과 함께 유지하며 이 문서 결정만으로 삭제하지 않는다. 다중 API worker/broker는 후속 범위다.

관리자 MFA 복구는 기존 대화형 `./bin/apichat-admin reset-totp`와 `validate`·restart·새 code 로그인으로 수행한다. Web 일회용 복구 코드는 제공하지 않는다(SECURITY_SPEC.md N02). 정확한 실행 위치와 사전 조건은 N12에서 README와 동시에 검증한다. 로컬 모델은 API container가 직접 닿는 사설 IP·port만 연결하고, Docker localhost를 호스트/다른 PC로 해석하지 않는다. 호스트 접근 mapping과 방화벽은 실제 시험한 배포 형태만 N12에서 명령으로 안내한다.

## 새 버전 로컬 Provider 연결 안내 (N12 Docker mock 검증, 실제 모델 N13)

- 관리자 API는 `POST /api/admin/provider-connections/custom`에 이름, `baseUrl`(예: `http://<API 서버에서 도달 가능한 사설 IP>:<port>/v1`), `authMode: none|bearer`, `destinationKind: local`, URL과 정확히 일치하는 `approvedLocalIp`·`approvedLocalPort`를 받는다. Bearer일 때만 `apiKey`를 입력하며 서버가 암호화한다. 등록은 생성 요청을 실행하지 않는다. 저장 후 관리자 세션·CSRF로 `POST /api/admin/provider-connections/:id/models/sync`를 실행하거나 `POST .../:id/models/manual`에 `modelId`를 등록하고, `POST .../:id/test`의 `network`, `models`, `chat`을 각각 명시적으로 실행한다. `chat`은 실제 요청이므로 비용이 발생할 수 있다. 공개 연결은 `destinationKind: public`과 공인 HTTPS 기본 URL을 사용하며 로컬 승인 IP/port를 넣지 않는다. 필드와 오류는 API_SPEC.md N02를 따른다.
- Docker의 localhost는 해당 컨테이너 자신이다. 모델 서버가 호스트·다른 컨테이너·LAN PC 중 어디에 있는지에 따라 접근 주소와 필요한 호스트 매핑·네트워크 설정을 구분한다.
- Linux에서 특정 호스트 별칭이 자동 제공된다고 가정하지 않고 실제 Compose 구성을 검증한 명령만 안내한다. 로컬 서버 HTTP 연결의 목적지 승인 정책도 함께 설명한다.
- N12는 별도 Compose 네트워크에서 API가 명시 승인된 사설 IP/port의 무인증 mock Provider로 실제 스트리밍 요청을 보내는 경로를 검증했다. 실제 LAN 모델 서버·호스트 별칭 mapping·방화벽 변경과 실모델 호환성은 N13이며 운영 연결 성공으로 간주하지 않는다.

## 1. 목적

Ubuntu 24.04.4 LTS 서버에서 ModelNaru 기반 서비스를 설치·실행·점검하는 표준 절차를 제공한다.

## 2. 전제 조건

- Docker Engine과 Docker Compose plugin
- Git
- 기존 v1 배포 root는 보존하며 새 설치·시험은 별도 폴더와 Compose project 사용
- 기존 host Nginx와 HTTPS 인증서
- 외부에서는 80·443만 접근 가능하고 `32432`는 loopback에만 bind

## 3. 최초 설치

Docker Engine·up --wait를 지원하는 Compose, Git, Docker 실행 권한과 대화형 SSH 터미널이 필요하다. 작업 위치는 기존 설치와 다른 빈 새 배포 폴더다. 호스트 Node/pnpm은 필요 없다. 이미지 빌드는 Node 24.14 계열·pnpm 11.9.0이며 API·Web·CLI가 같은 기본 이미지를 사용한다. 저장소 URL과 검토한 release commit을 실제 값으로 지정한다.

```bash
git clone <repository-url> modelnaru-v2
cd modelnaru-v2
git checkout --detach <reviewed-release-commit>
chmod +x bin/apichat-admin bin/modelnaru
docker compose build admin-tool
./bin/apichat-admin init
./bin/apichat-admin validate
./bin/modelnaru start
./bin/modelnaru status
./bin/modelnaru health
```

`init`은 ID·공개 HTTPS 주소·숨김 비밀번호를 받고 `config.yaml`, `secrets/`, `data/`를 만든다. 생성된 TOTP는 인증 앱과 안전한 offline 보관소에 등록하고 터미널 녹화·로그·문서에 남기지 않는다. config와 secret은 0600이며 기존 config가 있으면 init을 거부한다. 기본 bind는 127.0.0.1:32432다. 같은 서버의 별도 설치는 폴더·config port·COMPOSE_PROJECT_NAME을 모두 분리한다. 새 설정은 미사용 Valkey 디렉터리를 만들지 않는다. 기존 v1 data/valkey는 보존한다.

start/restart/update는 build와 validate 성공 후 앱을 중지하고 migration·컨테이너를 재생성해 health를 기다린다. migrate exit 0, gateway/web/api/postgres healthy가 정상이다. .runtime.env는 render-env가 생성하며 직접 편집하지 않는다. 기본 API stop timeout은 40초로 앱 종료 대기 30초보다 길다. 설정 관계는 SERVER_CONFIG_SPEC.md N12를 따른다.

## 4. 설정 변경

상세 사용자 절차는 [README 관리자 계정 관리](./README.md#관리자-계정-관리)를 따른다. 아래는 같은 명령의 운영 적용 기준이다. 현재 실행 위치는 `/home/totquf4171/modelnaru-git`, 실행 계정은 Docker 권한이 있는 서버 SSH 사용자이며 대화형 터미널이 필요하다. 일반 사용자 계정 변경은 관리자 Web 화면에서 수행한다.

```bash
cd /home/totquf4171/modelnaru-git
# 아래 세 변경 명령 중 필요한 것만 실행
./bin/apichat-admin set-username
./bin/apichat-admin set-password
./bin/apichat-admin reset-totp
# 선택한 변경을 모두 마친 뒤 한 번 검증·적용
./bin/apichat-admin validate
./bin/modelnaru restart
./bin/modelnaru status
./bin/modelnaru health
```

- set-username: 영문/숫자/점/밑줄/하이픈3~64자. 비밀번호와 TOTP secret은 보존한다. 인증 앱 표시 이름 변경은 별도이며 재등록은 불필요하다.
- set-password: 새 비밀번호10자 이상을 두 번 입력하며 기존 비밀번호는 요구하지 않는다. hash만 저장하고 ID/TOTP는 보존한다.
- reset-totp: 새로운 secret을 저장하고 QR/Secret을 출력한다. 기존 secret 표시 명령이 아니다. 인증 앱에서 QR 스캔 또는 키 수동 입력(시간 기반/SHA-1/6자리/30초)으로 등록한다. init 직후 표시된 secret 또는 변경하지 않은 자동 설치 초기 secret으로 정상 등록할 수 있다면 reset은 필요하지 않다.
- 시작 설정은 hot reload하지 않으며 atomic rename된 config도 컨테이너 재생성 후 반영된다. validate 실패 시 재시작 전에 해결한다. restart는 build/검증/migration/컨테이너 재생성/health를 포함하므로 활성 생성에 미치는 영향을 확인한다. 변경 후 기존 관리자 session은 거부될 수 있으며 TOTP 교체 후 이전 코드는 거부된다.
- 적용 후 공인 Web 관리자 탭에서 현재 ID/비밀번호/현재6자리 코드로 로그인한다. 문제가 있으면 휴대폰 자동 시간·서버 timedatectl status·이전 인증 앱 항목 사용 여부를 확인한다. 비밀번호/TOTP 원문을 공유하지 않는다. shell과 secret을 모두 잃으면 Web 복구 코드로 우회할 수 없다.

이번 Git 자동 설치의 `secrets/bootstrap-admin.json`은 생성 당시의 ID/password/totpSecret/등록 URI 사본이며 설정 변경에 맞춰 갱신되지 않는다. 사용자만 서버에서 확인하고, 새 로그인·인증 앱 등록·복구용 secret 보관을 확인한 뒤 아래 파일만 삭제한다. 일반 init은 이 JSON 파일을 만들지 않으므로 없다는 이유로 다시 init하지 않는다.

```bash
rm -- /home/totquf4171/modelnaru-git/secrets/bootstrap-admin.json
```

위 사본 삭제는 config.yaml의 관리자 설정을 변경하지 않는다. config.yaml0600/secrets 디렉터리0700·secret 파일0600을 유지하고 전체 secrets/data 삭제나 권한 완화로 복구하지 않는다.

## 5. Nginx 연결

공개 DNS·인증서를 준비한 host Nginx에서 upstream을 config의 loopback 주소·port로 지정한다(기본 127.0.0.1:32432). `/api/conversations/:id/jobs/:jobId/events`를 포함한 대화 경로는 buffering/cache를 끄고 read/send timeout을 600초로 둔다. 15초 heartbeat가 즉시 전달되어야 한다. 파일 body 상한은 protocol overhead를 포함해 12m 이상이다. 내부 gateway와 외부 proxy 예시는 SERVER_CONFIG_SPEC.md 6절을 따른다. 외부 HTTPS·인증서·방화벽 변경은 N13/N14에서 별도 검증한다.

## 6. 점검

```bash
curl --fail http://127.0.0.1:32432/api/health/live
curl --fail http://127.0.0.1:32432/api/health/ready
./bin/modelnaru status
./bin/modelnaru health
./bin/modelnaru logs
```

정상 상태에서는 live가 `status: ok`, ready가 `status: ready`와 `database: ok`를 반환한다. `migrate` service는 migration 적용 후 exit code 0으로 종료되는 것이 정상이다.

Migration을 별도로 재검증할 때는 다음 명령을 사용한다. 이미 적용된 migration은 checksum만 확인하고 다시 실행하지 않는다.

```bash
docker compose run --rm migrate
```

Production container는 build 결과물을 `node`로 직접 실행하며 시작 시 `pnpm`, Corepack 또는 외부 package registry에 접근하지 않는다. 따라서 backend internal network에서도 migration과 API가 시작되어야 한다.

PDF OCR 도구는 API image에 포함된다. 재빌드 후 다음 명령에서 Poppler와 한국어·영어 Tesseract 데이터가 확인돼야 한다.

```bash
docker compose exec api pdftoppm -v
docker compose exec api tesseract --list-langs
```

언어 목록에는 `eng`, `kor`가 모두 있어야 한다. OCR은 host package를 사용하지 않으므로 Ubuntu host에 Tesseract를 별도로 설치하지 않는다.

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

### 6.5 첨부파일 보관·정리 점검

관리자 `서버` 메뉴에서 보관 일수를 확인하고 `지금 정리`를 실행한다. 보관 기간을 바꾸면 기존 attachment의 `expires_at`도 생성 시각 기준으로 갱신되며 `file.retention_updated`, 수동 실행 시 `file.cleanup_requested` 감사 이벤트가 남아야 한다.

```bash
docker compose exec postgres \
  psql -U modelnaru -d modelnaru \
  -c "SELECT retention_days, last_cleanup_at, last_cleanup_expired_count, last_cleanup_deleted_count, last_cleanup_failed_count, last_cleanup_guest_count FROM attachment_settings;"

docker compose exec postgres \
  psql -U modelnaru -d modelnaru \
  -c "SELECT status, count(*) FROM attachments GROUP BY status ORDER BY status;"

docker compose exec postgres \
  psql -U modelnaru -d modelnaru \
  -c "SELECT reason, attempt_count, last_attempt_at, last_error FROM attachment_cleanup_queue ORDER BY queued_at LIMIT 20;"
```

대화·사용자 또는 게스트 session을 삭제한 뒤 cleanup queue가 비워지고 해당 UUID 원본이 `data/uploads`에서 제거되는지 확인한다. 만료 시험은 시험 attachment의 `expires_at`만 과거로 변경한 뒤 관리자 `지금 정리`를 실행하고, attachment 행은 `expired`로 남되 `extracted_text`가 `NULL`이며 Web에 `원본 만료`가 표시되는지 확인한다.

## 7. Update와 rollback

v2 업데이트 전 검토한 release의 config v2·기존 schema 호환성을 확인하고 현재 commit/이미지 ID·적용 migration checksum을 기록한다. config·DB·업로드 복구 사본은 비밀 파일과 함께 접근 제한된 위치에 보존한다. 같은 디스크 사본은 디스크 고장 복구를 보장하지 않는다. dirty checkout은 변경을 먼저 보존한다. v1→v2의 in-place upgrade는 지원하지 않는다.

파일 처리 동시성 설정에는 `maximumPdfQueueSize`와
`maximumOcrQueueSize`가 포함된다. 기존 `config.yaml`에 두 항목이 없으면 각각
기본값 `4`가 적용되므로 기존 설치는 그대로 업데이트할 수 있다. 값을 명시적으로
조정한 경우에는 애플리케이션을 다시 시작해야 반영된다.

이미지 요청 합계 설정 `maximumImageBytesPerRequest`가 없는 기존 설정에는
기본값 `20971520`(20MiB)이 적용된다. 이 값은 파일 하나의 업로드 상한과 별개이며
후속 포함 이미지를 합친 Provider 요청 전체에 적용된다.

```bash
# 설치한 v2 배포 폴더에서
git status --short
git rev-parse HEAD
git fetch origin
git checkout --detach <reviewed-compatible-release-commit>
./bin/modelnaru update
./bin/modelnaru health
./bin/modelnaru status
```

update는 빌드·설정 검증 뒤 앱을 중지한다. migration checksum 불일치·누락·SQL 실패면 새 API 시작을 차단하며 자동 rollback하지 않는다. checksum 검사는 적용 SQL 무결성을 확인하며 모든 schema의 하위 호환을 보증하지 않는다. 이전 image에 현재 DB를 붙이는 rollback은 호환 시험 증거가 있을 때만 허용한다. 그 외에는 보존한 이전 설치의 image+config+DB+업로드 전체로 복구한다. 새 데이터는 이전 DB에 자동 병합되지 않는다. N12의 같은 release 업데이트 시험을 임의의 미래 migration 호환 증거로 사용하지 않는다.

stop은 해당 Compose project의 컨테이너/네트워크만 제거하며 bind mount data/와 secrets를 보존한다. 배포 폴더에서 `./bin/modelnaru stop` 후 `./bin/modelnaru start`로 다시 시작한다. 서비스별 JSON 로그는 10 MiB×3 순환이다. 정상 API 종료는 upstream 중단과 최종 DB commit을 기다리고, 강제 종료는 다음 부팅에서 실패로 정리하며 Provider를 자동 재호출하지 않는다.

## 8. 장애 대응

- gateway `502`: `web`과 `api` health 및 log 확인
- API 시작 반복: `admin-tool validate` 실행 후 config와 secret 파일 권한 확인
- migrate 실패: `docker compose logs migrate postgres`에서 checksum·SQL·연결 오류 확인. 적용된 migration 파일은 수정하지 않음
- API log에 `Database client is not initialized`가 나타남: lifecycle을 포함한 startup hook이 `DatabaseService.ready()`를 기다리는 현재 image인지 확인하고 rebuild
- migrate log에 Corepack 또는 registry download가 나타남: runtime command가 build 결과물을 `node`로 직접 실행하는 현재 image인지 확인하고 `./bin/modelnaru start`로 rebuild
- host에서 접속 불가: `.runtime.env`, gateway port binding과 host Nginx upstream 확인
- TOTP login 실패: server 시간 동기화 상태와 인증 앱의 현재 code 확인. ID·비밀번호·TOTP 원문은 log에 남기지 않음
- disk 부족: 신규 upload를 중지하고 `data/uploads`, log, Docker image 사용량 확인
- `FILE_PROCESSING_BUSY` 반복: PDF·OCR worker와 queue 설정, CPU 및 메모리 사용량을 함께 확인. 기본값은 처리 worker 각각 `1`, 대기 queue 각각 `4`이며 자원 상태를 확인하지 않고 queue 크기만 늘리지 않음

## N08 자동 제목 운영 확인 (2026-10-01, 작업 트리만 검증)

사전 조건은 N08 API 실행·migration 0020 적용·관리자 session이다. `README.md`의 자동 제목 설정 절에 따라 GET/PUT `/api/admin/title-generation`을 사용한다. 모델 지정 후 새 job API의 첫 성공 대화에서 titleSource/titleStatus와 별도 `operation_type=title` 사용량을 확인한다. `providerModelId:null`은 이후 시도를 끄며 기존 pending task의 모델 snapshot을 바꾸지 않는다. 수동 제목은 자동 결과보다 우선한다. 실패 시 임시 제목을 유지하고 자동 재시도하지 않으므로 모델·연결 가용성을 먼저 확인한다.

이 절을 위해 운영 서비스나 DB를 변경하지 않았다. 격리 API·PostgreSQL·mock Provider 시험 결과는 `TEST_PLAN.md` N08이다. 실제 Provider 비용/호환성·운영 Docker 인수는 N13, 운영 반영은 N14다. 설치·시작·업데이트 명령은 이번 작업에서 변경하지 않았다.

## 9. 검증·인수 조건

- gateway 외 서비스 port가 host에 공개되지 않는다.
- restart 뒤 healthcheck가 복구된다.
- server reboot 뒤 서비스 자동 시작 여부를 production 설치에서 확인한다.

## 10. 미결정·보류 항목

- systemd wrapper와 image registry 사용 여부는 최초 실제 배포에서 결정한다.
- 외부 backup은 현재 구성하지 않는다.

### N13 완료 후 시험 환경 정리 명령 (2026-10-02, 실행 대기)

안전 결과는 PC tmp/n13/image-retest-result.json 및 image-retest-safe-audit.json에 보존했다. scripts/cleanup-n13-server.sh는 현재 단일 root/state와 정확한 시험 site/loopbackPort를 확인한 뒤 시험 site 비활성화→nginx -t/reload→시험 Certbot 인증서/ACME→자체5개 container/2개 network/2개 image→정확한 시험 root만 제거한다. 운영 project/base image/site/data는 대상이 아니다. 구문과 현재 이름/포트를 대조했으며 실제 삭제는 아직 미실행이다.

사용자 서버 터미널 실행: sudo bash /tmp/modelnaru-n13-server-naRXQ0/cleanup-n13-server.sh /tmp/modelnaru-n13-server-naRXQ0

현재 계정은 sudo 비밀번호를 요구하므로 사용자 실행 결과가 필요하다. 비밀번호는 채팅에 보내지 않는다. 성공 뒤 시험 자원0·운영 healthy를 확인하고 원장에 정리 완료를 기록한다. N14 운영 전환은 별도 작업이다.

### N13 시험 환경 종료 확인 (2026-10-02)

사용자 sudo 실행 및 SSH 재확인으로 시험 containers/networks/images0·시험 root/site/cert/renewal/ACME 제거 완료. 운영5개 healthy 유지. 위 시험 URL·계정·현재 root용 sudo 명령은 종료된 환경의 실행 이력이며 다시 실행하지 않는다. 안전 결과는 TEST_PLAN.md 최신 절 및 tmp/n13/server-cleanup-result.json 참조. N14 실제 운영 전환은 별도 작업이며 아직 실행하지 않았다.
