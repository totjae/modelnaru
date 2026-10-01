# ModelNaru 보안 상세 명세

## N12 관리자 복구 구현 (2026-10-01, 격리 인수 완료)

기존 대화형 reset-totp와 원자적 config 저장을 유지한다. validate는 Unix config/secret 0600을 요구하고 비대화형 초기화·복구는 거부한다. 새 secret은 터미널에서만 등록하며 시험도 PTY 출력을 메모리에서 폐기한다. restart는 config 파일의 atomic rename 후 mount를 재생성한다. 새 자격증명 fingerprint와 기존 session의 불일치로 이전 관리자 session을 폐기한다. 실제 HTTP 로그인/복구 검증 결과는 TEST_PLAN.md N12에 기록한다. 실행 절차의 원장은 README.md와 DEPLOYMENT_RUNBOOK.md다.

## N02 새 버전 경계: 커스텀 outbound·렌더링·관리자 복구 (2026-09-30 확정, 항목별 구현 상태 아래 참조)

### 커스텀 Provider 목적지

- 등록·수정·동기화·시험은 관리자 session+CSRF만 허용한다. 사용자/게스트는 저장된 연결/model UUID만 선택하며 URL, DNS, header, 인증 방식과 승인 주소를 override할 수 없다. 내장 Provider의 고정 HTTPS endpoint 검증은 유지한다. 커스텀 1차 protocol은 PROVIDER_REGISTRATION_SPEC.md N02 절을 따른다.
- `public`: HTTPS만 허용한다. URL은 `userinfo`, fragment, query, 빈 host, 비HTTP scheme, IPv6 zone ID, encoded slash/backslash·dot segment를 거부한다. host를 IDNA/ASCII로 정규화하고 A/AAAA를 조회한다. 결과가 하나라도 loopback, RFC1918/ULA, link-local, metadata, multicast, unspecified 또는 예약 주소면 전체 요청을 거부한다. 결과가 없거나 검증 불가능해도 거부한다. 검증한 공인 IP 하나에만 연결하며 TLS SNI·인증서 검증은 원래 hostname으로 수행한다.
- `local`: 관리자가 연결별로 정확한 IPv4/IPv6 literal+port를 승인·저장해야 한다. HTTP는 이 승인 주소가 URL 주소와 같을 때만 허용한다. RFC1918 IPv4 또는 IPv6 ULA만 허용하고 loopback, link-local(특히 169.254.0.0/16), metadata, multicast, unspecified, public IP와 IPv4-mapped 우회는 거부한다. 로컬 host명/범위 CIDR/전체 사설망 승인은 지원하지 않는다. 주소가 바뀌면 관리자 승인을 다시 받아야 한다.
- 등록 시와 매 models 조회·채팅·요약·제목·진단 요청 시 위 검증을 반복한다. HTTP client는 검증한 IP로 실제 socket을 열고 peer IP가 같음을 확인한다. hostname을 연결 단계에서 다시 임의 해석하거나 proxy 환경 변수로 우회하지 않는다. redirect는 모든 요청에서 금지하며 3xx는 안전한 오류다. pooled connection 재사용은 같은 연결의 승인 IP·host·port와 일치할 때만 허용하고 1차 구현은 커스텀 호출마다 새 연결을 사용한다.
- URL query에 키를 넣지 않고 `authMode=none`이면 인증 header를 보내지 않는다. bearer 키는 기존 암호화·마스킹을 적용한다. 관리자가 Host·Cookie·Forwarded·Proxy-Authorization·hop-by-hop header를 지정할 수 없다. DNS/차단/redirect/인증/응답 오류는 분리된 안전 code로 반환하되 DNS 결과·내부 URL·upstream 본문·키는 일반 사용자 응답과 일반 로그에서 제외한다. 실제 사설 주소는 관리자 진단에서만 마스킹 표시한다. 이 정책을 통과하지 못한 요청은 Provider 슬롯과 일일 quota를 사용하지 않는다.

### Markdown·링크·이미지

N10 구현/검증 상태(2026-10-01): safe-markdown.tsx는 아래 경계를 React text node와 URL allowlist로 구현했다. proxy.ts가 응답별 nonce를 생성하고 요청/응답 CSP에 넣으며 layout.tsx의 theme script도 같은 nonce를 사용한다. 문서는 동적 렌더링·private/no-store다. production CSP의 script/style에 unsafe-inline/unsafe-eval을 추가하지 않았다. Edge production Web+loopback API fixture에서 CSP header/nonce 변경, XSS fixture 비실행, 외부 이미지 요청 0건·CSP 위반 0건을 확인했다. Next 적용 방식은 [공식 CSP 문서](https://nextjs.org/docs/app/guides/content-security-policy)를 따른다. 배포 proxy를 포함한 HTTPS 인수와 실기기/실제 자격증명은 N13이다.

- 새 렌더러는 text/Markdown을 신뢰하지 않는다. raw HTML은 파싱·렌더링하지 않고 텍스트로 표시한다. HTML 속성·inline event handler, SVG/MathML 삽입, `javascript:`·`data:`·`file:`·`blob:` 링크를 허용하지 않는다. 링크는 상대 same-origin 또는 `https:`, `http:`, `mailto:`만 클릭 가능하다. 외부 링크는 새 탭과 `rel="noopener noreferrer"`를 사용한다.
- 외부 Markdown 이미지 URL은 자동 fetch/렌더링하지 않고 alt와 안전한 링크만 표시한다. 사용자 업로드 이미지는 인증된 same-origin 파일 경로만 표시한다. 코드 블록과 표의 내용은 text node로 렌더링하고 복사 버튼은 표시된 텍스트만 Clipboard API에 쓴다. 미완성 streaming Markdown도 동일 경계를 적용한다.
- N10에서 응답별 nonce를 가진 CSP를 적용한다. 최소 지시문: `default-src 'self'`, `script-src 'self' 'nonce-<request nonce>'`, `connect-src 'self'`, `img-src 'self' data: blob:`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`. Next.js 초기 theme script도 nonce를 받거나 외부 자체 script로 옮긴다. 무제한 `unsafe-inline`/`unsafe-eval`로 우회하지 않는다. N03에서 디자인 시안은 이 경계를 전제로 한다.

### 관리자 TOTP 복구

- 새 버전의 공식 복구 경로는 서버 shell에 접근할 수 있는 관리자의 기존 `./bin/apichat-admin reset-totp`다. 일회용 Web 복구 코드는 제공하지 않는다. 새 TOTP secret/QR은 CLI의 대화형 출력에서만 제시하고 offline으로 보관하며 문서·로그·스크린샷에 복사하지 않는다. 변경된 config를 검증하고 서비스를 재시작하면 credential fingerprint가 달라져 기존 관리자 session은 다음 인증에서 모두 거부된다. 새 secret의 TOTP로 로그인해야 한다.
- host shell 접근 권한을 잃고 offline secret도 없으면 앱 자체만으로 관리자 MFA를 복구할 수 없다. README·SERVER_CONFIG_SPEC·DEPLOYMENT_RUNBOOK·REQUIREMENTS·DEPLOYMENT_PROFILE의 복구 설명은 이 정책에 맞췄다. N12에서 CLI 출력·권한·session 폐기를 실제 시험한다. 현재 `reset-totp` 명령은 존재하지만 새 버전 인수 시험은 아직 없다.

N07에서 등록·모델 조회·채팅·요약에 공통 목적지 검증과 IP 고정 접속을 구현했다. 격리 DB·별도 API 프로세스·사설 IP mock 서버 시험에서 승인 주소 접속, 차단 주소·redirect 거부, key/none, 관리자 권한, 연결 변경 중 활성 작업 보호를 확인했다. DNS 혼합·재결과·IPv4-mapped·IPv6는 목적지 단위 시험으로 확인했다. 실제 Docker 네트워크와 공인 HTTPS 실접속은 N13에서 검증한다. 렌더링 CSP·XSS는 N10에서 production Web·fixture API를 사용하는 실제 브라우저로 검증했다. 배포 HTTPS 환경 인수는 N13, 관리자 복구의 새 버전 인수는 N12 범위로 남는다.

## 2026-09-30 렌더링·복구 감사 보완 대기

- 새 Markdown 렌더러 도입 전 raw HTML 비활성·URL scheme 제한·외부 이미지 자동 요청 정책·외부 링크 처리·CSP와 XSS fixture를 확정한다(AUD-07). 현재의 텍스트 렌더링을 새 HTML 렌더링의 보안 검증으로 대체하지 않는다.
- N02 계약 전에는 TOTP 일회용 복구 code와 현행 CLI가 충돌했다. 위 N02 절에서 CLI 재설정을 선택했고 재발급·기존 session 폐기는 N12 인수 시험 대상이다(AUD-12).

## 새 버전 지속 생성·즐겨찾기 경계 (2026-09-30, 계획)

- 브라우저 구독 종료는 인증 종료가 아니다. 서버 작업은 시작 session의 유효성·주체·모델 권한을 확인하며 로그아웃·폐기·만료 및 권한 회수 시 중단한다.
- 작업 ID·revision만 알아서는 조회·구독·취소할 수 없다. 매 접근에 유효 session과 소유권을 검사하고 취소 mutation에 CSRF를 적용한다.
- 즐겨찾기·대화 고정·검색은 주체별로 격리한다. 즐겨찾기로 모델 허용 목록을 우회할 수 없다.
- 부분 응답은 소유 대화의 DB 데이터로 취급하며 관리자 로그와 다른 session의 전송 기록에 복제하지 않는다. 삭제 후 늦은 작업 결과는 저장하지 않는다.
- 생성·구독·보조 호출에 유한한 시간·동시성·버퍼 상한을 적용한다. 상세 기준은 CHAT_STATE_SPEC.md다.

## 새 버전 커스텀 Provider 보안 원안 (2026-09-30 작성, N07 적용 범위는 위 N02 절)

- 사용자 요청에 따라 관리자 지정 커스텀·로컬 모델 목적지를 지원한다. 기존 고정 HTTPS URL 일치 조건은 내장 Provider에 유지하고 커스텀 연결에는 별도 목적지 정책을 적용한다.
- 등록·수정·시험은 관리자 session·CSRF 검증을 요구한다. 사용자·게스트 요청은 저장된 연결 ID만 참조하며 URL·header를 덮어쓸 수 없다.
- 외부는 HTTPS를 기본으로 한다. 로컬 HTTP·사설 IP 접근은 해당 연결의 정확한 host·port를 관리자가 명시적으로 허용한 경우로 제한하며 사설 네트워크 전체를 일괄 허용하지 않는다.
- URL userinfo·fragment·비HTTP scheme을 거부하고 자격증명은 URL query에 넣지 않는다. redirect는 따르지 않는다.
- 등록 시험뿐 아니라 모델 조회·채팅·제목·요약 실행 때도 DNS의 IPv4/IPv6 결과와 실제 연결 목적지를 검사한다. 검증 후 재해석으로 목적지가 바뀌는 우회를 차단하는 연결 방식을 구현 전에 확정한다.
- metadata·link-local·unspecified·multicast 및 허용하지 않은 loopback 목적지는 차단한다. 로컬 모델 허용을 내부 관리 서비스 전체에 대한 접근 허용으로 확대하지 않는다.
- API 키는 암호화 저장·마스킹하며 인증 없음 모드는 인증 header를 보내지 않는다. 고급 header를 지원할 경우 Host·Cookie·proxy 및 hop-by-hop header 재정의를 제한한다.
- 대상별 timeout·응답 크기·동시성 상한과 취소 처리를 적용한다. 키·본문이 포함된 URL이나 upstream 원문 오류는 관리자 로그로 복제하지 않는다.
- 위 항목은 설계안이며 목적지 승인 저장·주소 해석·접속 검증 방식과 실패 코드는 구현 전 확정·시험한다.

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
- 암호 입력이 필요한 PDF와 파싱 오류는 내부 예외를 노출하지 않는 표준 오류로 거부한다. 텍스트 레이어가 없는 스캔 PDF는 컨테이너 내부 Poppler·Tesseract로만 OCR하며 외부 서비스로 전송하지 않는다.
- OCR subprocess는 shell 없이 고정 실행 파일과 인자 배열로 호출한다. 원본명은 명령 인자나 임시 경로에 사용하지 않고 UUID 작업 디렉터리를 사용한다.
- OCR은 페이지별 90초 명령 제한, 16MB 출력 제한, worker·OpenMP thread 1개 기본값을 적용한다. 임시 PDF·PNG는 성공·실패와 관계없이 삭제하고 본문·절대 경로는 로그에 남기지 않는다.
- 페이지 수와 추출문 상한을 원본 저장 확정 전에 검사해 과도한 처리와 컨텍스트 확대를 제한한다.
- 동시 PDF 파싱 수는 `limits.maximumPdfWorkers`로 제한해 압축 해제와 텍스트 추출이 CPU·메모리를 동시에 점유하지 않게 한다.
- PDF·OCR 대기열은 각각 `limits.maximumPdfQueueSize`, `limits.maximumOcrQueueSize`로 제한한다. 처리 permit을 얻기 전에는 전체 임시 파일을 heap Buffer로 읽지 않는다.
- 대기 중 HTTP 연결 종료 시 AbortSignal로 waiter를 queue에서 제거하고, 서버 종료 시 모든 대기 waiter를 거부해 retained Promise를 남기지 않는다.
- 이미지는 확장자·MIME·실제 signature와 가로·세로를 함께 검사하고 40,000,000 decoded pixel 기본 상한을 적용한다.
- 현재 Provider 요청의 이미지 원본 합계는 기본 20MiB로 제한하고 DB metadata와 실제 storage byte를 각각 검사한다.
- 원본 image base64는 API response·log·DB에 복제하지 않고 Provider 요청을 만드는 시점에 비공개 storage에서 순차적으로 읽는다.

### 6.9 session 한정 요청·응답 기록

- 일반 사용자와 게스트는 대화 설정에서 최근 0~3개의 실제 Provider 전송 기록을 볼 수 있다.
- 기록은 현재 API process 메모리에만 있고 PostgreSQL·Valkey·파일·관리자 로그에 저장하지 않는다.
- Authorization, API key 계열 header, URL query의 key·token·secret과 이미지 base64를 저장 전에 제거한다. 기록용 요청은 실제 JSON 문자열을 다시 parse하지 않고 요청 builder가 만든 binary 제거 사본을 사용한다.
- 대화 소유권과 현재 session ID를 함께 검사하며 같은 계정의 다른 브라우저 session과도 공유하지 않는다.
- 단일 기록 2MB, session 전체 30개, API process 전체 합계 64MiB를 넘지
  못한다.
- process 전체 예산을 초과하면 생성 시각이 가장 오래된 기록부터 제거한다.
  기록 ID는 별도 index로 관리해 stream event 추가·완료·실패 처리에서 전체
  session을 순회하지 않는다.
- 로그아웃·만료·session 제한 폐기·credential 변경·계정 및 대화 삭제·게스트 종료 시 관련 기록을 즉시 삭제한다.
- 관리자 통합 로그는 운영 진단 metadata만 취급하고 사용자 메시지, AI 답변, system prompt와 첨부 본문을 저장하지 않는다.
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
- session 전송 기록에서 인증 정보와 이미지 base64가 마스킹되고 다른 session·주체가 조회할 수 없다.
- 채팅 mutation과 취소는 session·CSRF·대화 소유권을 검증하며 응답 event에 API 키와 upstream 오류 본문이 없다.
- cascade 삭제할 원본 경로는 DB cleanup queue에 먼저 기록하고 파일 삭제 성공 후에만 queue에서 제거해 장애 중에도 재시도한다.
- 고아 파일 정리는 UUID object key 패턴의 일반 파일만 대상으로 하며 symlink·알 수 없는 디렉터리·24시간 이내 파일을 건드리지 않는다.
- 보관 기간 조회·변경과 수동 cleanup은 관리자 guard를 적용하고 mutation에는 CSRF를 요구한다.

## 9. 미결정·보류 항목

- 장기 session token rotation은 보류하며 logout·credential 변경·만료 시 폐기한다.
- master key rotation과 기존 ciphertext 재암호화 도구는 후속 운영 보안 단계에서 구현한다.
- 로그인 실패 제한을 Valkey 공유 제한으로 전환하는 것은 다중 API instance 도입 시 수행한다.
- 관리자 TOTP 복구 code는 아직 구현하지 않는다.
