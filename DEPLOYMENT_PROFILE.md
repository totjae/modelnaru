# 1차 운영 환경 프로필

## 1. 확정된 조건

- 용도: 개인용 소규모 서비스
- 사용자 수: 1~3명
- 공개 범위: 인터넷에서 접근 가능한 공개 회선
- 서버: Intel Processor N100 기반 미니 PC
- AI 실행 방식: 서버에서 모델을 로컬 추론하지 않고 외부 LLM Gateway·AI API를 호출
- 배포 형태: Ubuntu 24.04.4 LTS가 설치된 Linux 단일 서버
- 메모리: 16GB
- 현재 SSD 여유 공간: 약 220GB
- 외부 연결: 기존 Nginx reverse proxy가 TCP 80·443을 처리
- 애플리케이션 기본 bind: `127.0.0.1:32432`, 시작 config로 port 변경 가능
- domain과 port forwarding: 기존 구성 사용
- 외부 backup: 초기에는 구성하지 않음
- 시작 config: 서버 구동 파일 폴더의 `config.yaml`
- 계정 설정: 같은 배포물의 `bin/apichat-admin` CLI 또는 `admin-tool` 일회성 container

Intel 공식 사양상 N100은 4 core·4 thread CPU이다. 외부 AI API의 응답을 중계하는 1~3명 규모에는 충분하지만, OCR·PDF 변환처럼 CPU를 계속 사용하는 작업은 동시 실행을 제한한다.

## 2. 권장 서버 구성

### 하드웨어

| 항목           |            최소 |                        권장 | 비고                                                     |
| -------------- | --------------: | --------------------------: | -------------------------------------------------------- |
| 메모리         |             8GB |               **16GB 확정** | 현재 구성으로 충분                                       |
| SSD 여유 공간  |           100GB |           **약 220GB 확정** | 원본 첨부파일, DB, container image와 임시 PDF 공간 포함  |
| swap 또는 zram |             2GB |                         4GB | 메모리 순간 부족 보호용이며 정상 메모리 대체 용도는 아님 |
| 외부 backup    | **초기 미구성** | 추후 서버와 물리적으로 분리 | 현재는 장애 시 데이터 유실 위험 수용                     |

현재 16GB RAM과 약 220GB의 SSD 여유 공간이면 1~3명 규모에 충분하다. 전체 SSD 용량과 별개로 여유 공간을 기준으로 감시한다.

### 소프트웨어

- Ubuntu Server LTS 또는 Debian stable 계열
- Docker Engine과 Docker Compose
- 기존 Nginx reverse proxy
- Next.js web
- NestJS API
- PostgreSQL
- Valkey와 BullMQ worker
- 로컬 파일 volume
- Pino JSON log와 PostgreSQL 관리자 로그

단일 서버에서는 MinIO, Kubernetes, Elastic Stack을 추가하지 않는다. 파일은 Storage Adapter 뒤의 로컬 volume에 둔다. 외부 backup은 사용자의 현재 결정에 따라 초기 범위에서 제외한다.

## 3. 자원과 동시성 기본값

| 작업             |           기본 동시 실행 | 설명                                           |
| ---------------- | -----------------------: | ---------------------------------------------- |
| 전체 AI 생성     |                        3 | 사용자 세 명이 한 건씩 생성 가능               |
| 사용자별 AI 생성 |                        2 | 실수로 여러 탭에서 과도하게 호출하는 것을 제한 |
| 컨텍스트 요약    | 전체 AI 생성 한도에 포함 | 본 요청과 별개로 무제한 실행하지 않음          |
| PDF 텍스트 추출  |                        1 | CPU·메모리 spike 방지                          |
| OCR              |                        1 | 2차 기능이며 일반 채팅보다 낮은 queue 우선순위 |
| 파일 정리·backup |                        1 | AI 사용이 적은 시간대에 예약 실행              |

AI 요청은 대부분 외부 API 대기 시간이므로 세 건의 streaming 자체는 N100에 큰 부담이 아니다. 반면 OCR과 대형 PDF 처리는 worker thread를 하나로 제한하고 필요하면 CPU quota를 적용한다.

8GB 시스템에서는 다음을 적용한다.

- OpenTelemetry trace는 표본 수집하거나 초기에는 비활성화
- Prometheus·Grafana·Loki 상시 container는 제외
- OCR model은 작업 시에만 별도 worker로 실행하거나 2차 도입
- PostgreSQL shared buffer와 Node.js heap에 보수적인 상한 적용

## 4. 공개 인터넷 보안 기준

개인용이어도 인터넷에 노출되면 자동 scan과 login 공격의 대상이 되므로 다음 항목을 필수 운영 기준으로 둔다.

- 외부 공개 port는 기존 Nginx의 TCP 80·443만 허용
- PostgreSQL, Valkey, API·worker 내부 port는 host 외부에 publish하지 않음
- SSH는 key 인증만 허용하고 가능하면 관리 IP 또는 VPN에서만 접근
- 관리자 계정은 TOTP MFA를 필수로 적용하고 일회용 복구 code를 offline 보관
- 일반 사용자는 MFA 선택 사용, 관리자는 사용자 session을 즉시 만료 가능
- login 실패를 계정·IP hash 기준으로 제한하고 반복 실패는 일시 차단
- Nginx에서 HTTPS와 HSTS를 적용하고 앱에서 Secure·HttpOnly·SameSite cookie 사용
- CSRF token, CSP, Markdown sanitization, 업로드 MIME 검사를 적용
- OS 보안 update는 자동 적용하되 재부팅이 필요한 update는 관리자에게 표시
- 관리자 config와 provider master encryption key는 repository와 DB backup에 포함하지 않음

관리자 본문 열람과 원본 요청·응답 진단 기능은 2차 기능으로 유지한다.

## 5. 네트워크 구성

domain과 port forwarding은 기존 구성을 사용하며 다음 경로로 연결한다.

```text
인터넷 → 기존 TCP 80·443 구성 → Nginx → 127.0.0.1:32432 web/API
```

Nginx upstream은 `127.0.0.1:32432`를 사용한다. 외부 client가 32432 port에 직접 접근하지 못하도록 loopback bind와 firewall을 함께 적용한다. streaming endpoint에는 Nginx proxy buffering을 끈다. 상세 설정은 [SERVER_CONFIG_SPEC.md](./SERVER_CONFIG_SPEC.md)를 따른다.

## 6. 저장소와 backup 정책

- PostgreSQL과 첨부파일은 미니 PC의 SSD에 저장
- DB와 파일 volume은 서로 다른 경로로 분리
- 초기 배포에서는 외부 backup을 구성하지 않음
- 선택적으로 같은 SSD에 `pg_dump`를 생성할 수 있으나 이는 SSD 장애에 대비한 backup으로 간주하지 않음
- SSD 여유 공간이 20% 미만이면 경고
- SSD 여유 공간이 40GB 미만이면 경고하고 20GB 미만이면 신규 파일 upload를 차단

외부 backup이 없으므로 SSD·미니 PC 고장, 분실 또는 파일시스템 손상 시 대화와 파일을 복구하지 못할 수 있다. 현재는 사용자가 이 위험을 수용한 것으로 기록하며, backup 기능을 제거하지 않고 나중에 활성화할 수 있게 유지한다.

## 7. 성능 목표 초안

외부 AI 제공자의 응답 시간은 서버가 보장할 수 없으므로 내부 처리 시간과 안정성을 기준으로 둔다.

- 로그인·대화 목록 등 일반 API: 정상 부하에서 p95 500ms 이내
- AI 요청 접수 후 upstream 연결 시작: p95 1초 이내
- 3개 동시 streaming 연결 유지
- 10MB 파일 업로드 중 다른 사용자의 채팅 API가 멈추지 않음
- PDF·OCR worker 장애가 web/API process를 종료시키지 않음
- disk 또는 DB 오류 시 신규 AI 호출 전에 명확한 오류를 반환하여 답변만 생성되고 저장되지 않는 상황 방지

## 8. 확정된 실제 배포 정보

- public URL: `https://chat.mihoservice.xyz`
- 배포 root: `/home/totquf4171/modelnaru`
- Nginx site: `/etc/nginx/sites-available/modelnaru`
- Nginx upstream: `127.0.0.1:32432`
- TLS: Certbot의 `chat.mihoservice.xyz` 인증서와 자동 갱신

2026-07-21 외부 회선에서 HTTPS Web과 health API 연결을 확인했다.
