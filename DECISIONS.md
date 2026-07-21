# ModelNaru 설계 결정 기록

## 1. 목적

구현 중 내려진 중요한 기술 결정을 이유와 영향까지 기록한다. 상태는 `확정`, `대체`, `보류`로 구분한다.

## 2. 결정 목록

### ADR-001: TypeScript monorepo

- 상태: 확정
- 결정일: 2026-07-21
- 결정: pnpm workspace 안에 Next.js Web, NestJS API, 공통 설정 package와 관리자 CLI를 둔다.
- 이유: 소규모 운영 환경에서 공통 type과 검증 규칙을 공유하고 배포 단위를 명확히 나눌 수 있다.
- 대안: 단일 NestJS 애플리케이션, Python FastAPI와 별도 frontend.
- 영향: Node.js 24 LTS 계열과 pnpm을 표준 개발 환경으로 사용한다.

### ADR-002: 단일 gateway port

- 상태: 확정
- 결정일: 2026-07-21
- 결정: 내부 gateway만 host의 `127.0.0.1:32432`에 publish하고 `/api`는 API, 나머지는 Web으로 전달한다.
- 이유: 기존 host Nginx 설정과 연결 지점을 하나로 유지하고 PostgreSQL·Valkey·내부 서비스의 직접 노출을 막는다.
- 대안: Next.js rewrites, host Nginx에서 Web/API를 각각 직접 연결.
- 영향: Compose 내부에 경량 Nginx gateway가 포함된다. 실제 외부 HTTPS 종료는 기존 host Nginx가 담당한다.
- Network: gateway·Web·API가 사용하는 frontend network는 API의 외부 LLM 호출을 위해 outbound를 허용한다. PostgreSQL·Valkey의 backend network는 `internal`로 격리하며 host 공개 여부는 `ports`가 gateway에만 존재하도록 제한한다.

### ADR-003: 시작 설정과 runtime 환경 분리

- 상태: 확정
- 결정일: 2026-07-21
- 결정: 배포 root의 `config.yaml`을 기준 설정으로 사용하고, Compose가 필요한 bind 주소와 port만 `apichat-admin render-env`가 `.runtime.env`로 생성한다.
- 이유: Compose는 YAML 애플리케이션 설정을 직접 읽을 수 없으며 실제 비밀값을 image나 저장소에 넣어서는 안 된다.
- 대안: 모든 설정을 환경 변수로 관리, Compose 파일에 값을 직접 기록.
- 영향: `config.yaml`과 `.runtime.env`는 Git에서 제외한다. API와 CLI는 같은 schema로 원본 설정을 검증한다.

### ADR-004: 기반 단계의 영속 서비스

- 상태: 확정
- 결정일: 2026-07-21
- 결정: PostgreSQL 17과 Valkey 8을 Compose 내부 서비스로 준비하되 애플리케이션 table과 migration은 인증 단계에서 도입한다.
- 이유: 기반 배포 연결은 먼저 검증하면서 아직 확정하지 않은 인증·대화 schema를 성급히 고정하지 않기 위함이다.
- 영향: 현재 readiness는 설정 유효성까지 검사하며 DB·Valkey 실제 연결 검사는 다음 단계에 추가한다.

### ADR-005: Versioned SQL migration과 얇은 database client

- 상태: 확정
- 결정일: 2026-07-21
- 결정: PostgreSQL schema는 순서가 고정된 SQL migration으로 관리하고, 애플리케이션 연결에는 `postgres.js`를 사용한다.
- 이유: 1~3명 규모의 N100 서버에서 ORM code generation과 별도 query engine 없이 SQL 계약을 직접 검토할 수 있고 image와 build 부담이 작다.
- 대안: Prisma ORM, Drizzle ORM, TypeORM.
- 영향: migration 파일은 한 번 적용되면 수정하지 않는다. 자체 runner가 checksum과 PostgreSQL advisory lock을 검증하며 Compose 시작 시 API보다 먼저 실행한다.

### ADR-006: 고정 관리자와 일반 사용자의 session principal 분리

- 상태: 확정
- 결정일: 2026-07-21
- 결정: 고정 관리자는 `config.yaml`에 유지하고 `users` table에는 관리자가 생성한 일반 사용자만 저장한다. `sessions`는 `admin`과 `user` principal을 모두 표현한다.
- 이유: 고정 관리자 bootstrap 요구를 유지하면서 session 만료·동시 로그인 제한은 하나의 저장 구조로 관리하기 위함이다.
- 영향: 관리자 session은 `user_id`가 없고 credential fingerprint로 설정 변경을 감지한다. 일반 사용자 삭제 시 FK cascade로 session을 함께 삭제한다.

### ADR-007: Production runtime에서 package manager 미사용

- 상태: 확정
- 결정일: 2026-07-22
- 결정: API, Web, migration container는 build 단계에서 생성된 결과물을 `node`로 직접 실행하고 runtime command에서 `pnpm`이나 Corepack을 호출하지 않는다.
- 이유: backend internal network는 외부 인터넷이 차단되어 있으며 실행 사용자별 Corepack cache가 없으면 container 시작 중 package manager download가 발생할 수 있다.
- 대안: runtime image에 pnpm을 별도 고정 설치, backend network의 외부 통신 허용.
- 영향: production 시작은 package registry 상태와 무관하며, 실행 경로가 바뀌면 Dockerfile과 runtime command 정적 검증을 함께 갱신한다.

### ADR-008: Opaque server session과 double-submit CSRF

- 상태: 확정
- 결정일: 2026-07-22
- 결정: 인증은 browser에 무작위 opaque session cookie를 발급하고 DB에는 SHA-256 hash와 만료·폐기 상태만 저장한다. 상태 변경 요청은 읽기 가능한 CSRF cookie, `X-CSRF-Token` header와 DB hash를 모두 검증한다.
- 이유: JWT처럼 credential 변경 이후에도 자체 유효한 token을 남기지 않고, 고정 관리자 설정 변경·동시 session 제한·강제 logout을 server에서 즉시 적용하기 위함이다.
- 대안: stateless JWT access·refresh token, cookie session middleware 저장소, SameSite cookie만 사용하는 CSRF 방어.
- 영향: 모든 후속 관리자·사용자 mutation API는 공통 session 인증과 CSRF 검증을 적용하며, cookie 원문과 CSRF 원문을 log나 DB에 저장하지 않는다.

### ADR-009: 사용자 mutation과 감사 기록의 단일 transaction

- 상태: 확정
- 결정일: 2026-07-22
- 결정: 사용자 생성·수정·비활성화·비밀번호 변경·삭제와 해당 `audit_logs` insert, 필요한 session 폐기를 하나의 PostgreSQL transaction에서 처리한다.
- 이유: 계정은 변경됐지만 감사 기록이나 session 폐기가 누락되는 부분 성공을 방지하기 위함이다.
- 대안: application log만 기록, 비동기 audit queue, 사용자 변경 후 별도 audit insert.
- 영향: audit insert 실패 시 사용자 mutation도 rollback한다. password·hash·token은 snapshot에서 제외하고 삭제 이벤트는 사용자 표시 identity도 제거한다.

## 3. 변경 규칙

기존 결정을 바꾸면 원문을 삭제하지 않고 상태를 `대체`로 바꾼 뒤 새 ADR에서 대체 관계를 밝힌다.

## 4. 검증·인수 조건

- 구현 구조와 Compose routing이 결정 내용과 일치한다.
- 새 중요 결정은 코드 변경과 같은 작업에서 추가한다.
- 실제 secret이나 운영 도메인을 기록하지 않는다.

## 5. 미결정·보류 항목

- production container image 배포 방식은 최초 실제 배포 전에 확정한다.
