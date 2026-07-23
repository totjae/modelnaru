# 기술 스택 및 대체안

## 1. 문서 목적

이 문서는 멀티 사용자 AI 채팅 웹 서비스 구현에 필요한 기술을 영역별로 나누고, 각 영역마다 **권장안 1개와 대체안 2개, 총 3개 선택지**를 비교한다.

선정 기준은 다음과 같다.

- Linux 단일 서버에서 먼저 운영할 수 있을 것
- GPT, Gemini, Claude 및 LLM Gateway를 한 서비스에서 다룰 수 있을 것
- `provider-manager-v1.10.0.js`의 provider template 구조를 재사용할 수 있을 것
- 사용자별 대화·파일·권한을 확실히 분리할 수 있을 것
- 스트리밍 응답, 문서 처리, 관리자 로그를 지원할 것
- 규모가 커질 때 저장소·작업 처리·AI 연동부를 전체 재작성 없이 교체할 수 있을 것

기술의 최신 버전과 지원 범위는 실제 구현 시작 시 다시 확인하고 lock file과 컨테이너 이미지 태그로 고정한다. 이 문서의 링크는 2026-07-21 기준 공식 문서이다.

## 2. 최종 권장 조합

첫 배포에는 다음 조합을 권장한다.

현재 확정된 N100 미니 PC·1~3명·공개 인터넷 환경의 구체적인 자원 한도와 보안 설정은 [DEPLOYMENT_PROFILE.md](./DEPLOYMENT_PROFILE.md)를 따른다. 이 환경에서는 일반 권장안의 Caddy 대신 기존 Nginx를 사용한다.

| 영역                | 권장 기술                                             |
| ------------------- | ----------------------------------------------------- |
| 개발 언어           | TypeScript / Node.js LTS                              |
| 저장소 구조         | pnpm workspace 기반 monorepo                          |
| 웹 프론트엔드       | Next.js App Router                                    |
| 백엔드 API          | NestJS modular monolith                               |
| UI                  | Tailwind CSS + shadcn/ui                              |
| 데이터베이스        | PostgreSQL                                            |
| DB client·migration | postgres.js + versioned SQL migration                 |
| 인증                | 자체 서버 세션 + Argon2id                             |
| AI 연동             | 자체 Provider Registry·Adapter                        |
| 답변 스트리밍       | POST 응답 기반 SSE 형식                               |
| 파일 저장           | 로컬 마운트 볼륨 + Storage Adapter                    |
| PDF 처리            | PyMuPDF 기반 별도 worker                              |
| OCR(2차)            | PaddleOCR                                             |
| 백그라운드 작업     | BullMQ + Valkey, 도입 전 호환성 통합 테스트           |
| 애플리케이션 로그   | Pino JSON + PostgreSQL 관리 로그                      |
| 관측성              | OpenTelemetry + Prometheus/Grafana, 필요 시 Loki 추가 |
| 리버스 프록시       | 기존 Nginx                                            |
| 배포                | Docker Compose                                        |
| 비밀값              | Docker secret 또는 권한 제한 환경 파일                |
| 테스트              | Vitest + Playwright                                   |
| 백업                | 초기 외부 backup 미구성, 추후 pg_dump + restic        |

전체를 처음부터 마이크로서비스로 나누지 않는다. 하나의 저장소 안에 `web`, `api`, `worker`, `shared`를 분리하되, API는 modular monolith로 시작한다. PDF·OCR worker만 프로세스를 분리하면 무거운 파일 처리가 채팅 스트리밍을 막는 문제를 줄일 수 있다.

```text
브라우저
  └─ 기존 Nginx(HTTPS)
       └─ 127.0.0.1:32432 애플리케이션 gateway
            ├─ Next.js 웹
            └─ NestJS API ─ 자체 Provider Adapter ─ 외부 LLM API
              ├─ PostgreSQL
              ├─ Valkey / BullMQ
              ├─ 파일 Storage Adapter
              └─ PDF·OCR Worker
```

## 3. 영역별 기술 대체안

### 3.1 개발 언어와 백엔드 런타임

| 구분     | 기술                              | 적합한 경우                                                                | 주의점                                       |
| -------- | --------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| **권장** | TypeScript + Node.js LTS + NestJS | 참고 JS의 provider 로직을 가장 자연스럽게 옮기고 프론트와 타입을 공유할 때 | CPU 작업은 worker로 분리해야 함              |
| 대체안 1 | Python + FastAPI                  | AI·OCR·문서 처리 라이브러리를 백엔드에서 직접 많이 사용할 때               | 프론트와 타입·검증 모델을 별도로 관리해야 함 |
| 대체안 2 | Java + Spring Boot                | 대규모 조직, 강한 정적 타입, 장기적인 엔터프라이즈 운영이 우선일 때        | 초기 개발량과 메모리 사용량이 상대적으로 큼  |

이 프로젝트는 provider 참고 코드가 JavaScript이고 UI도 TypeScript를 사용하므로 NestJS가 가장 효율적이다. NestJS의 모듈 단위로 `auth`, `users`, `providers`, `chat`, `files`, `logs`를 분리한다. 참고: [NestJS 공식 문서](https://docs.nestjs.com/)

### 3.2 웹 프론트엔드

| 구분     | 기술               | 적합한 경우                                                                  | 주의점                                                 |
| -------- | ------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| **권장** | Next.js App Router | React 생태계, 서버 렌더링, 관리자 화면과 채팅 화면을 한 프로젝트에서 만들 때 | 프록시가 스트리밍 응답을 버퍼링하지 않도록 설정해야 함 |
| 대체안 1 | React + Vite       | 완전한 SPA와 독립 백엔드 구성이 더 단순할 때                                 | 라우팅·인증·배포 규칙을 직접 조합해야 함               |
| 대체안 2 | Nuxt               | 개발팀이 Vue에 더 익숙할 때                                                  | 참고 코드와 백엔드 공유 타입 활용성이 낮아질 수 있음   |

Next.js는 Linux 자체 호스팅과 스트리밍을 지원한다. 참고: [Next.js App Router](https://nextjs.org/docs/app), [Next.js 자체 호스팅](https://nextjs.org/docs/app/guides/self-hosting)

### 3.3 UI 컴포넌트와 스타일

| 구분     | 기술                     | 적합한 경우                                                       | 주의점                                               |
| -------- | ------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------- |
| **권장** | Tailwind CSS + shadcn/ui | ChatGPT형 레이아웃을 세밀하게 변경하고 소스 코드를 직접 소유할 때 | 접근성·키보드 동작을 실제 화면에서 검증해야 함       |
| 대체안 1 | MUI                      | 표, 폼, 관리자 화면을 빠르게 구축할 때                            | 기본 디자인의 개성이 강하고 번들 크기가 커질 수 있음 |
| 대체안 2 | Mantine                  | 풍부한 훅과 컴포넌트로 빠르게 개발할 때                           | 장기 커스터마이징 전에 테마 구조를 정해야 함         |

채팅 UI에는 Markdown 렌더러, 코드 구문 강조, 가상 스크롤 또는 페이지 단위 메시지 로딩이 추가로 필요하다.

### 3.4 데이터베이스

| 구분     | 기술       | 적합한 경우                                                            | 주의점                                                      |
| -------- | ---------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| **권장** | PostgreSQL | 대화 분기, JSON 메타데이터, 로그 검색, 트랜잭션을 안정적으로 처리할 때 | 정기 백업과 vacuum·index 점검 필요                          |
| 대체안 1 | MariaDB    | 기존 MySQL 운영 경험과 인프라가 있을 때                                | JSON 및 일부 고급 쿼리 설계를 PostgreSQL안과 다르게 해야 함 |
| 대체안 2 | SQLite     | 단일 사용자 데모나 로컬 프로토타입일 때                                | 다중 사용자·동시 쓰기 운영 서버에는 권장하지 않음           |

운영 데이터의 기준 원장은 PostgreSQL로 둔다. 대화 본문, 사용자, 권한, 세션, 사용량, 감사 로그는 파일이 아닌 DB에 저장하고 원본 첨부파일만 파일 저장소에 둔다. 참고: [PostgreSQL 공식 문서](https://www.postgresql.org/docs/current/)

### 3.5 Database client와 migration

| 구분     | 기술                        | 적합한 경우                                              | 주의점                                                   |
| -------- | --------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| **선택** | postgres.js + versioned SQL | 작은 운영 규모에서 SQL 계약과 migration을 직접 검토할 때 | query type과 관계 mapping을 애플리케이션에서 관리해야 함 |
| 대체안 1 | Prisma                      | schema 기반 type 생성과 ORM relation이 더 중요할 때      | code generation과 runtime 구성이 추가됨                  |
| 대체안 2 | Drizzle ORM                 | SQL에 가까운 type-safe query builder가 필요할 때         | migration 운영 규칙을 별도로 고정해야 함                 |

ModelNaru는 N100 서버의 단순한 배포와 SQL 검토 가능성을 우선해 postgres.js와 checksum 기반 자체 migration runner를 선택했다. 세부 규칙은 [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)와 [DECISIONS.md](./DECISIONS.md)를 따른다.

### 3.6 로그인, 세션, 비밀번호

| 구분     | 기술                                        | 적합한 경우                                                                   | 주의점                                                    |
| -------- | ------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| **권장** | 자체 서버 세션 + Argon2id + HttpOnly cookie | 회원가입 없이 관리자 생성 계정, 3세션 제한, 강제 만료를 명세 그대로 구현할 때 | 인증 코드는 보안 테스트와 코드 검토가 필수                |
| 대체안 1 | Better Auth                                 | TypeScript 기반 인증 기능을 라이브러리로 줄이고 싶을 때                       | 고정 관리자 config와 세션 제거 정책을 adapter로 맞춰야 함 |
| 대체안 2 | Keycloak                                    | SSO, 조직·그룹·외부 IdP까지 확장할 계획이 있을 때                             | 현재 규모에는 별도 서버 운영이 과할 수 있음               |

세션 원본은 PostgreSQL에 저장하고 로그인 성공 시 가장 오래된 세션을 종료해 최대 3개를 유지한다. Valkey는 빠른 세션 조회·폐기 알림에 쓸 수 있지만 기준 원장으로 삼지 않는다. 관리자 비밀번호는 평문이 아니라 config에 Argon2id hash로 저장한다.

### 3.7 AI 제공자 연동

| 구분     | 기술                             | 적합한 경우                                                                                               | 주의점                                                                      |
| -------- | -------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **권장** | 자체 Provider Registry + Adapter | `provider-manager-v1.10.0.js`의 모든 서비스 template, 필드, 모델 조회와 고급 설정을 가장 충실히 이식할 때 | 제공자 API 변경을 직접 추적하고 adapter 테스트를 유지해야 함                |
| 대체안 1 | Vercel AI SDK                    | 주요 제공자를 통일된 TypeScript 인터페이스로 빠르게 붙일 때                                               | 참고 JS의 모든 특수 옵션이 그대로 노출되지는 않을 수 있음                   |
| 대체안 2 | LiteLLM Proxy                    | 100개 이상 제공자, 중앙 라우팅, fallback, 비용·한도 기능이 중요할 때                                      | Python proxy 서비스와 별도 설정 DB를 운영해야 하며 앱 권한과 중복될 수 있음 |

권장 구조는 `template → credential validator → model discovery → capability normalization → request adapter → stream normalizer → usage/error normalizer` 순서다. API 키만 입력하면 기본 endpoint와 모델 목록을 자동 적용하고, 세부 설정 화면에서는 provider template에 정의된 필드만 표시한다.

자체 adapter 내부에서 AI SDK를 부분적으로 사용할 수는 있지만, AI SDK 자체를 provider registry의 기준 원장으로 삼지는 않는다. LiteLLM도 LLM Gateway용 선택지로 연결할 수 있으나 현재 앱의 사용자·모델 권한은 앱 서버가 최종 검사한다. 참고: [AI SDK provider 구조](https://ai-sdk.dev/docs/foundations/providers-and-models), [LiteLLM 공식 문서](https://docs.litellm.ai/)

### 3.8 AI 답변 스트리밍

| 구분     | 기술                                         | 적합한 경우                                                                     | 주의점                                                        |
| -------- | -------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **권장** | `fetch` POST 응답 + `text/event-stream` 형식 | 사용자 메시지·첨부 정보를 POST하고 토큰, usage, error 이벤트를 순서대로 보낼 때 | native EventSource가 아니라 fetch stream parser를 사용해야 함 |
| 대체안 1 | WebSocket                                    | 양방향 실시간 제어와 다수의 동시 이벤트가 필요할 때                             | 연결 복구, 인증 갱신, 프록시 설정이 복잡해짐                  |
| 대체안 2 | NDJSON chunk stream                          | 이벤트 구조를 단순 JSON line으로 유지할 때                                      | 범용 SSE 도구와 바로 호환되지 않음                            |

이 프로젝트에서는 생성 시작·텍스트 delta·usage·완료·오류 이벤트가 주 흐름이므로 SSE 형식이면 충분하다. 중단 요청은 별도 `DELETE/POST cancel` API와 서버의 AbortController를 연결한다. 참고: [NestJS SSE](https://docs.nestjs.com/techniques/server-sent-events)

### 3.9 첨부파일 저장소

| 구분     | 기술                                     | 적합한 경우                                      | 주의점                                                                           |
| -------- | ---------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| **권장** | Linux 로컬 마운트 볼륨 + Storage Adapter | 단일 서버 MVP에서 비용과 운영 복잡도를 줄일 때   | 서버 디스크와 별개 위치로 반드시 백업해야 함                                     |
| 대체안 1 | MinIO                                    | 사내 S3 호환 저장소와 lifecycle 규칙이 필요할 때 | 단일 노드 MinIO는 서버 장애 자체를 해결하지 못함; 라이선스와 운영 방식 검토 필요 |
| 대체안 2 | Amazon S3 또는 S3 호환 클라우드          | 서버와 파일 내구성을 분리하고 확장할 때          | 저장·전송 비용과 외부 서비스 의존성이 생김                                       |

코드는 처음부터 `put/get/delete/exists/presign` 인터페이스로 저장소를 감싼다. DB에는 임의 object key, 소유자, MIME, hash, 크기, 만료일만 저장하며 사용자 입력 파일명을 실제 경로로 사용하지 않는다. 참고: [MinIO Linux 문서](https://min.io/docs/minio/linux/index.html), [Amazon S3 객체 개요](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingObjects.html)

### 3.10 TXT·PDF 문서 추출

| 구분     | 기술                    | 적합한 경우                                                          | 주의점                                                      |
| -------- | ----------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| **권장** | Python worker + PyMuPDF | PDF 텍스트·페이지·이미지 추출과 향후 OCR 연결을 안정적으로 처리할 때 | AGPL/상용 라이선스 조건을 배포 방식과 함께 사전 검토해야 함 |
| 대체안 1 | Apache Tika server      | 매우 다양한 문서 형식을 한 인터페이스로 추출할 때                    | 현재 미지원인 DOCX 등까지 범위가 넓고 Java 서비스가 추가됨  |
| 대체안 2 | Node.js parser 조합     | TXT 계열과 단순 PDF만 처리하며 서비스를 TypeScript 하나로 유지할 때  | PDF별 추출 품질과 패키지 유지 상태를 개별 검증해야 함       |

TXT·MD·JSON·CSV·코드 파일은 Node.js에서 encoding을 감지해 처리하고, PDF만 worker로 넘기는 혼합 구성이 적합하다. PDF는 업로드 직후 100페이지 제한을 먼저 검사하고, 텍스트 추출 실패 여부를 기록한다. 참고: [PyMuPDF 기본 사용법](https://pymupdf.readthedocs.io/en/latest/the-basics.html)

### 3.11 스캔 PDF OCR

| 구분     | 기술                    | 적합한 경우                                         | 주의점                                                    |
| -------- | ----------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| **선택** | Tesseract OCR           | 완전한 로컬 처리와 가벼운 오픈소스 구성이 중요할 때 | 문서 방향·표·복잡한 배치의 품질 튜닝이 필요함             |
| 대체안 1 | PaddleOCR               | 한글과 영문이 섞인 스캔 문서의 인식률이 중요할 때   | Python worker, 모델 파일, CPU·메모리 자원이 추가로 필요함 |
| 대체안 2 | Google Cloud Vision OCR | 운영 부담보다 인식 품질과 확장성이 중요할 때        | 파일 외부 전송, 비용, 개인정보 고지가 필요함              |

현재 구현은 텍스트 레이어가 전혀 없는 PDF에만 Poppler 200 DPI 렌더링과 Tesseract `kor+eng`를 적용한다. N100의 CPU·메모리 부담을 줄이기 위해 페이지를 순차 처리하고 동시 worker와 OpenMP thread를 기본 1개로 제한한다. 참고: [PaddleOCR 다국어 모델](https://www.paddleocr.ai/v3.1.1/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html), [PyMuPDF OCR 설명](https://pymupdf.readthedocs.io/en/latest/recipes-ocr.html), [Tesseract 문서](https://tesseract-ocr.github.io/tessdoc/)

### 3.12 백그라운드 작업과 예약 작업

| 구분     | 기술                 | 적합한 경우                                                  | 주의점                                                                                    |
| -------- | -------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **권장** | BullMQ + Valkey      | PDF 추출, OCR, 30일 파일 삭제, 로그 정리, 재시도가 필요할 때 | BullMQ의 공식 설명은 Redis 기반이므로 선택한 Valkey 버전·client 조합을 통합 테스트해야 함 |
| 대체안 1 | BullMQ + Redis       | BullMQ 문서와 동일한 기본 구성을 원할 때                     | Redis의 배포 라이선스와 운영 정책을 확인해야 함                                           |
| 대체안 2 | pg-boss + PostgreSQL | 별도 인메모리 서버 없이 작업량이 작은 단일 서버를 원할 때    | 채팅량·OCR량이 늘면 DB 부하가 업무 데이터와 경쟁할 수 있음                                |

작업은 중복 실행될 수 있다고 가정하고 idempotent하게 설계한다. 예를 들어 파일 삭제는 이미 파일이 없어도 성공으로 처리한다. BullMQ는 재시도, 지연, 반복 작업과 worker concurrency를 제공한다. 참고: [BullMQ 공식 문서](https://docs.bullmq.io/), [Valkey 공식 문서](https://valkey.io/docs/)

### 3.13 캐시, 세션 보조, 요청 빈도 제한

| 구분     | 기술            | 적합한 경우                                                                | 주의점                                             |
| -------- | --------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| **권장** | Valkey          | 세션 보조, rate limit counter, 짧은 모델 목록 cache를 오픈소스로 운영할 때 | 영구 업무 데이터는 PostgreSQL에 유지해야 함        |
| 대체안 1 | Redis           | 기존 Redis 운영 경험과 관리형 서비스가 있을 때                             | 라이선스·서비스 비용 확인 필요                     |
| 대체안 2 | PostgreSQL only | 초기 사용자가 적고 서비스 수를 최소화할 때                                 | 빈번한 counter와 queue가 늘면 DB 병목이 될 수 있음 |

Valkey 장애 때문에 로그인 정보나 대화가 유실되어서는 안 된다. 세션·권한의 최종 판단은 PostgreSQL과 앱 서버에서 수행한다.

### 3.14 애플리케이션 로그와 관리자 로그 화면

| 구분     | 기술                                  | 적합한 경우                                                | 주의점                                                             |
| -------- | ------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| **권장** | Pino JSON log + PostgreSQL log tables | AI 요청·보안·감사·파일 로그를 관리자 UI에서 바로 검색할 때 | 운영 디버그 로그 전체를 DB에 넣지 말고 감사성 이벤트만 저장해야 함 |
| 대체안 1 | OpenTelemetry + Loki + Grafana        | 여러 프로세스의 로그·trace를 한곳에서 검색하고 시각화할 때 | 사용자용 관리자 로그와 운영자 관측 로그의 권한을 분리해야 함       |
| 대체안 2 | Elastic Stack                         | 대규모 전문 검색과 복잡한 장기 분석이 필요할 때            | 단일 서버 MVP에는 메모리와 운영 부담이 큼                          |

관리자 화면에서 보는 감사·보안·AI 사용 로그는 PostgreSQL에 구조화해 보존하고, stack trace와 컨테이너 stdout 같은 운영 로그는 JSON으로 남긴다. API 키, Authorization header, 원문 prompt·response는 기본적으로 로그에 기록하지 않는다. 참고: [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/), [Grafana Loki HTTP API](https://grafana.com/docs/loki/latest/reference/loki-http-api/)

### 3.15 메트릭, 장애 추적, 알림

| 구분     | 기술                                 | 적합한 경우                                                  | 주의점                                       |
| -------- | ------------------------------------ | ------------------------------------------------------------ | -------------------------------------------- |
| **권장** | OpenTelemetry + Prometheus + Grafana | 요청 시간, 오류율, queue 길이, 자원 사용량을 자체 운영할 때  | 알림 수집기와 보존 기간을 별도로 설정해야 함 |
| 대체안 1 | Sentry                               | 프론트·백엔드 예외와 release 단위 오류 추적을 빠르게 붙일 때 | 외부 전송 정보의 마스킹·개인정보 정책 필요   |
| 대체안 2 | Elastic APM                          | 로그·검색·APM을 Elastic으로 통일할 때                        | 초기 규모에 비해 무거울 수 있음              |

최소 지표는 API 요청 수·오류율·p95 latency, provider별 오류율, 진행 중 AI 요청 수, queue 대기 수, DB 연결 수, 디스크 사용량, 파일 삭제 실패 수다. OpenTelemetry는 vendor-neutral한 trace·metric·log 계측 규격을 제공한다. 참고: [OpenTelemetry 공식 문서](https://opentelemetry.io/docs/)

### 3.16 HTTPS와 리버스 프록시

| 구분     | 기술    | 적합한 경우                                               | 주의점                                                 |
| -------- | ------- | --------------------------------------------------------- | ------------------------------------------------------ |
| **권장** | Nginx   | 이미 구성된 domain·인증서·80·443 proxy를 그대로 사용할 때 | streaming endpoint의 buffering과 timeout을 조정해야 함 |
| 대체안 1 | Caddy   | 새 서버에서 인증서 발급·갱신을 가장 단순하게 운영할 때    | 현재 기존 Nginx와 역할이 중복됨                        |
| 대체안 2 | Traefik | Docker label 기반 다수 서비스·도메인을 동적으로 운영할 때 | 현재 단일 서비스에는 설정 개념이 더 복잡할 수 있음     |

현재 배포에서는 기존 Nginx를 사용하고 `/api/chat/`의 proxy buffering을 끈다. 새 환경에서 대체할 경우 Caddy는 public domain의 인증서 발급·갱신과 HTTP→HTTPS 전환을 자동화한다. 참고: [Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html), [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https)

### 3.17 Linux 배포 방식

| 구분     | 기술                     | 적합한 경우                                                             | 주의점                                                    |
| -------- | ------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| **권장** | Docker Compose           | 한 대의 Linux 서버에 web·api·worker·DB·Valkey를 재현 가능하게 배포할 때 | 자동 failover는 제공하지 않으므로 백업·복구 절차가 필요함 |
| 대체안 1 | Podman + systemd/Quadlet | rootless container와 systemd 통합을 우선할 때                           | 팀의 Podman 운영 경험이 필요함                            |
| 대체안 2 | k3s/Kubernetes           | 여러 서버, 자동 복구, 수평 확장이 실제로 필요할 때                      | 현재 규모에는 구축·운영 복잡도가 지나침                   |

초기에는 Compose로 시작하고 healthcheck, restart policy, read-only filesystem, resource limit, 영속 volume을 명시한다. 참고: [Docker Compose production 사용](https://docs.docker.com/compose/how-tos/production/)

### 3.18 API 키와 서버 비밀값 관리

| 구분     | 기술                                                           | 적합한 경우                                                         | 주의점                                                 |
| -------- | -------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| **권장** | Docker secret 또는 권한 제한 env file + 앱 수준 AES-GCM 암호화 | 단일 서버에서 관리자 config와 provider API key를 안전하게 관리할 때 | 암호화 master key와 DB backup을 같은 위치에 두면 안 됨 |
| 대체안 1 | SOPS + age                                                     | GitOps 방식으로 암호화된 설정 파일을 버전 관리할 때                 | 복호화 key 배포 절차가 필요함                          |
| 대체안 2 | HashiCorp Vault                                                | 동적 secret, rotation, 감사, 여러 서버가 필요할 때                  | 별도 고가용성 운영 자체가 큰 업무임                    |

provider API key는 DB에 AES-256-GCM으로 암호화하고 레코드마다 nonce를 생성한다. UI에는 마지막 몇 글자만 표시하고, 수정 시에만 새 값을 받는다. master key는 DB가 아닌 Linux secret에 둔다.

### 3.19 자동 테스트

| 구분     | 기술                          | 적합한 경우                                                   | 주의점                                                      |
| -------- | ----------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| **권장** | Vitest + Playwright           | TypeScript 단위 테스트와 실제 브라우저 E2E를 빠르게 운영할 때 | AI API는 mock server와 소수의 실제 smoke test로 분리해야 함 |
| 대체안 1 | Jest + Cypress                | NestJS/Jest 경험과 Cypress UI가 익숙할 때                     | 테스트 도구 구성이 상대적으로 무거워질 수 있음              |
| 대체안 2 | Node test runner + Playwright | 외부 단위 테스트 의존성을 최소화할 때                         | mock·fixture 생태계가 팀 기대보다 부족할 수 있음            |

필수 보안 E2E에는 타 사용자 conversation/file ID 직접 요청 차단, 4번째 로그인 시 기존 세션 종료, 비활성 사용자 차단, 허용되지 않은 모델·파라미터 거부, API key 비노출을 포함한다.

### 3.20 백업과 복구

| 구분     | 기술                   | 적합한 경우                                                  | 주의점                                      |
| -------- | ---------------------- | ------------------------------------------------------------ | ------------------------------------------- |
| **권장** | pg_dump + restic       | 소규모 DB와 로컬 첨부파일을 암호화해 외부 저장소로 백업할 때 | 데이터가 커지면 dump 시간과 RPO 한계가 생김 |
| 대체안 1 | pgBackRest + restic    | PostgreSQL 증분·PITR과 파일 백업을 분리 운영할 때            | 설정과 복구 훈련이 더 복잡함                |
| 대체안 2 | WAL-G + S3 호환 저장소 | WAL 기반 시점 복구와 클라우드 저장을 자동화할 때             | S3 자격증명과 retention 관리가 필요함       |

백업 성공 로그만 확인해서는 충분하지 않다. 별도 임시 환경에 정기적으로 복원해 DB와 원본 파일의 연결이 실제로 살아 있는지 검증해야 한다. 사용자 삭제 시 즉시 삭제해야 하는 파일이 backup에 남을 수 있으므로 backup 보존 기간과 개인정보 처리 안내도 함께 정한다.

## 4. 선택 가능한 완성 조합 3가지

### 조합 A: 권장 균형형

- Next.js + NestJS + PostgreSQL + postgres.js
- 자체 Provider Adapter
- 로컬 volume + Storage Adapter
- BullMQ + Valkey
- PDF.js 텍스트 추출 + Poppler·Tesseract OCR
- 기존 Nginx + Docker Compose

현재 요구사항과 가장 잘 맞는다. 단일 서버에서 시작하면서도 provider, storage, worker를 교체할 수 있다.

### 조합 B: 최소 운영형

- Next.js full-stack + PostgreSQL + Drizzle
- 자체 Provider Adapter 또는 AI SDK
- 로컬 volume
- queue와 cache 없이 PostgreSQL scheduled job 사용
- Node.js PDF parser
- 기존 Nginx + Docker Compose

사용자가 적은 개인·내부 서비스에는 가장 단순하지만, OCR·대량 파일 처리·복잡한 provider 호환성이 늘어나면 구조를 다시 나눠야 한다.

### 조합 C: 확장 우선형

- Next.js + NestJS 또는 FastAPI
- PostgreSQL + versioned SQL migration
- LiteLLM Proxy와 자체 권한 계층
- S3 object storage
- 전용 queue·worker
- OpenTelemetry + Prometheus/Grafana + Loki
- Traefik + k3s/Kubernetes

여러 서버와 많은 사용자를 전제로 할 때 적합하다. 현재 단계에서는 비용과 운영 복잡도가 커서 권장하지 않는다.

## 5. 서로 섞을 때 주의할 조합

- 자체 Provider Adapter와 LiteLLM을 함께 쓸 경우 모델 ID, 재시도, 비용 로그의 책임 주체를 하나로 정해야 한다. 그렇지 않으면 동일 요청이 이중 집계되거나 이중 재시도될 수 있다.
- BullMQ는 queue 데이터가 임의로 eviction되면 안 된다. Valkey 또는 Redis에 queue 전용 instance를 쓰거나 `noeviction` 정책을 검증한다.
- 로컬 파일 저장과 다중 API 서버를 함께 쓰려면 공유 파일시스템이 필요하다. 다중 서버로 확장하는 순간 S3 호환 저장소로 옮기는 편이 안전하다.
- WebSocket을 선택해도 AI 제공자의 upstream streaming 방식은 provider adapter에서 별도로 정규화해야 한다.
- 관리자 감사 로그를 Loki/Elastic에만 두면 앱 권한과 보존·삭제 정책을 구현하기 어려워진다. 감사 로그의 기준 원장은 PostgreSQL에 두는 편이 적절하다.
- SQLite는 단일 사용자 prototype에는 가능하지만 이 명세의 다중 사용자 운영 DB로 사용하지 않는다.

## 6. 구현 시작 전에 최종 결정할 항목

기술 후보는 충분히 정리되었지만 아래 운영 정보는 실제 선택에 영향을 준다.

1. 예상 사용자 수와 동시에 생성할 AI 응답 수
2. Linux 배포판, CPU, 메모리, 디스크 용량
3. 인터넷 공개·사내망·VPN 중 공개 범위
4. 도메인과 HTTPS 인증서 운영 주체
5. 외부 backup을 추후 도입할 시 저장 위치, RPO와 RTO
6. PyMuPDF와 MinIO 등 채택 구성요소의 라이선스 검토 결과
7. 파일을 외부 AI 제공자로 전송할 때 표시할 개인정보 안내

위 항목이 확정되지 않아도 로컬 prototype과 provider adapter 개발은 시작할 수 있다. 다만 운영 서버 배포와 backup 설계 전에는 반드시 확정해야 한다.
