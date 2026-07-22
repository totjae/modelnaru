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

### ADR-010: 역할 공통 로그인 endpoint와 UUID 기반 사용자 session

- 상태: 확정
- 결정일: 2026-07-22
- 결정: `/api/auth/login` 하나에서 고정 관리자 username은 비밀번호·TOTP, 그 외 username은 DB 사용자 비밀번호로 검증한다. 일반 사용자 session의 `account_key`는 사용자 UUID에서 파생한다.
- 이유: 관리자 ID 충돌 금지 정책을 활용해 endpoint와 cookie 체계를 하나로 유지하고, username 변경과 무관하게 계정별 동시 session 제한을 안정적으로 적용하기 위함이다.
- 대안: 관리자와 사용자 login endpoint·cookie를 분리, username을 사용자 account key로 사용.
- 영향: 관리자 전용 guard가 principal type을 별도로 검사한다. 일반 사용자는 현재 활성 상태와 credential version을 매 session 인증에서 확인한다.

### ADR-011: 고정 Provider 카탈로그와 AES-256-GCM 자격증명 저장

- 상태: 확정
- 결정일: 2026-07-22
- 결정: 참고 파일의 전체 서비스 이름은 내장 카탈로그에 보존하고 계약이 준비된 템플릿만 등록 가능하게 한다. API 키는 배포 secret의 32-byte master key와 레코드별 nonce를 사용하는 AES-256-GCM으로 암호화한다.
- 이유: 원격 registry나 관리자 임의 endpoint를 실행하지 않으면서 필요한 LLM Gateway 간편 등록을 먼저 제공하고, DB 유출만으로 API 키를 복구할 수 없게 하기 위함이다.
- 대안: API 키를 config 파일에 저장, DB 평문·단순 hash 저장, 원격 provider JSON을 즉시 신뢰, 외부 secret manager 사용.
- 영향: master key 없이는 기존 자격증명을 복호화할 수 없다. 첫 구현은 고정 HTTPS endpoint·redirect 거부·timeout을 사용하며 key rotation 도구와 전용 인증 Provider는 후속 구현한다.

### ADR-012: 공유 계정 대신 격리된 게스트 임시 주체

- 상태: 확정
- 결정일: 2026-07-22
- 결정: 공개 시험용 사용자 계정을 공유하지 않고, 관리자가 설정한 공유 코드를 인증할 때마다 독립 `guest_id`와 수명이 제한된 임시 session을 발급한다. 게스트 대화와 첨부파일은 session 주체별로 격리하고 로그아웃·만료 후 삭제한다.
- 이유: 하나의 사용자 계정을 공유하면 시험자가 서로의 대화와 파일을 열람하고 기존 최대 3 session 정책과 충돌하므로, 공개 체험과 사용자 데이터 격리를 동시에 만족시키기 위함이다.
- 대안: 일반 사용자 계정과 비밀번호 공유, 코드 없는 완전 익명 session, 시험자마다 관리자가 사용자 계정 생성.
- 영향: 별도 게스트 설정·주체·모델 권한·일일 counter와 정리 작업이 필요하다. 공유 코드 반복 사용 우회는 session당 제한만으로 막을 수 없어 전체 게스트·IP별 제한을 함께 적용한다.

### ADR-013: 핵심 Provider 우선 표시와 adapter 개발 순서

- 상태: 확정
- 결정일: 2026-07-22
- 결정: Provider 카탈로그는 OpenAI, Anthropic, Google AI Studio, Vertex AI를 상단에 고정하고 나머지는 표시 이름 알파벳순으로 정렬한다. 신규 Provider adapter는 대화와 파일 처리 구현을 마친 뒤 추가한다.
- 이유: 실제 사용 빈도가 높은 제공자를 빠르게 찾을 수 있게 하고, Provider 범위를 넓히기 전에 대화 저장·스트리밍·첨부 처리의 공통 기반을 안정화하기 위함이다.
- 영향: LLM Gateway는 등록 가능 상태를 유지하지만 고정 상단 대상에서는 제외된다. 준비 중 Provider는 카탈로그에 남아 있으며 구현 우선순위만 연기한다.

### ADR-014: 고정 Provider endpoint와 POST SSE 채팅

- 상태: 확정
- 결정일: 2026-07-22
- 결정: 채팅은 CSRF로 보호한 `POST /api/conversations/:id/messages` 응답에서 공통 SSE event를 전송한다. outbound URL·인증 header·request protocol은 내장 Provider template에서만 선택한다.
- 이유: 긴 사용자 입력과 parameter를 URL에 노출하지 않고 같은 요청에서 검증·메시지 저장·스트리밍을 시작하며, 관리자 또는 사용자가 임의 outbound 목적지를 만들지 못하게 하기 위함이다.
- 대안: POST로 request ID를 만든 뒤 별도 GET EventSource 연결, WebSocket, Provider 응답 완료 후 단일 JSON 반환.
- 영향: 내부 gateway와 host Nginx 모두 실제 메시지 endpoint의 buffering을 꺼야 한다. 단일 API process에서는 in-memory AbortController로 즉시 중지하며 다중 instance 도입 전 공유 취소 신호가 필요하다.

### ADR-015: 부모 경로 공유형 답변 재생성 분기

- 상태: 확정
- 결정일: 2026-07-22
- 결정: 답변 재생성은 기존 메시지를 복사하지 않고 현재 활성 분기를 부모로 하는 자식 분기에 새 assistant 메시지만 저장한다. 자식 경로는 `forked_from_message_id` 직전까지 부모 경로를 논리적으로 상속하며 성공한 재생성만 활성화한다.
- 이유: 원본 답변과 후속 대화를 변경하지 않으면서 반복 재생성의 중복 저장을 줄이고 어느 답변 경로가 컨텍스트에 포함되는지 명확히 하기 위함이다.
- 대안: 분기마다 이전 메시지를 전부 복사, 같은 branch에 여러 assistant 후보 저장, 기존 assistant 본문 덮어쓰기.
- 영향: 대화 상세 조회와 후속 메시지 컨텍스트 구성은 branch ancestry를 합성해야 한다. 실패·취소 분기는 기록되지만 선택할 수 없으며, 동시 활성 분기 변경이 있으면 재생성 완료가 사용자의 더 최근 선택을 강제로 덮어쓰지 않는다.

### ADR-016: 마지막 답변 인라인 분기 탐색

- 상태: 확정
- 결정일: 2026-07-23
- 결정: 재생성은 활성 경로의 마지막 assistant 메시지에만 허용하고, 상단 전역 분기 선택기 대신 해당 답변 아래에서 같은 질문의 답변 후보를 좌우로 탐색한다.
- 이유: 서로 다른 시점에서 생성된 다단계 분기를 평면 목록으로 표시하면 어느 메시지에서 갈라졌는지 알기 어렵고 과거 답변 재생성 시 이후 대화가 갑자기 사라진 것처럼 보이기 때문이다.
- 대안: 전체 분기 tree 화면, 모든 assistant 메시지의 인라인 후보 탐색, 상단 flat branch selector 유지.
- 영향: 과거 assistant ID를 사용한 재생성은 서버에서도 거부한다. 답변 후보는 동일한 `parent_message_id`를 가진 branch 자체의 assistant 메시지로 계산하며 후속 대화는 현재 선택한 답변 경로에서 이어진다.

### ADR-017: 원본과 분리한 버전형 컨텍스트 요약

- 상태: 확정
- 결정일: 2026-07-23
- 결정: 컨텍스트 초과 시 오래된 활성 경로 prefix를 관리자가 지정한 모델·프롬프트로 요약하고 `context_summaries`에 별도 저장한다. 같은 모델·프롬프트 버전이며 현재 경로에 포함되는 요약은 재사용한다.
- 이유: 사용자에게 보이는 원본과 답변 분기를 훼손하지 않으면서 긴 대화의 반복 요약 비용을 줄이고 설정 변경 전후 결과를 구분하기 위함이다.
- 대안: 원본 메시지를 summary role로 교체, 매 요청 전체 재요약, 한도 초과 구간을 자동 절단.
- 영향: 내부 요약 호출은 사용자 일일 quota를 차감하지 않고 본 답변만 요약 성공 후 예약한다. 요약이 불가능하면 원문을 자르지 않고 본 요청을 실패시킨다.

## 3. 변경 규칙

기존 결정을 바꾸면 원문을 삭제하지 않고 상태를 `대체`로 바꾼 뒤 새 ADR에서 대체 관계를 밝힌다.

## 4. 검증·인수 조건

- 구현 구조와 Compose routing이 결정 내용과 일치한다.
- 새 중요 결정은 코드 변경과 같은 작업에서 추가한다.
- 실제 secret이나 운영 도메인을 기록하지 않는다.

## 5. 미결정·보류 항목

- production container image 배포 방식은 최초 실제 배포 전에 확정한다.
