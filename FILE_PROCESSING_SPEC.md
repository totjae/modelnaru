# ModelNaru 파일 처리 상세 명세

## N09 첨부 처리 계약 (2026-10-01 구현·격리 검증 완료)

- raw 업로드는 기존 POST를 유지한다. 원본 수신 완료 뒤 processing 행을 저장하고 서버의 기존 bounded PDF/OCR pool에서 추출한다. 수신 완료한 서버 처리와 명시 재처리는 응답 연결이 끊겨도 계속하며 삭제·프로세스 종료는 별도 처리한다. 정상 업로드 응답은 201 ready이며 그동안 GET pending/개별 status에서 processing을 확인할 수 있다. 브라우저 전송이 끝나기 전 재개는 보장하지 않는다. 추출 단계는 DB processing 하나로 표현하고 OCR/page metadata는 준비 완료 후 반환한다. 전송 중 상태는 클라이언트 상태다.
- `GET /api/files/conversations/:conversationId/:attachmentId`는 소유권을 확인한 공개 metadata만 반환한다. pending 조회는 ready뿐 아니라 processing/failed/expired를 포함한다. ready가 아니거나 만료된 선택 첨부는 생성 시작에서 거부한다.
- 수신 완료한 원본의 추출 실패는 failed로 보존하고 기존 안전 오류 HTTP 응답을 유지한다. 사용자 명시 `POST .../:attachmentId/retry`(인증+CSRF)는 failed·미전송·미만료 파일만 원자적으로 processing으로 바꾸어 기존 풀에서 재처리한다. processing/ready·전송된 파일·활성 job 참조는 `409 FILE_PROCESSING_BUSY`, 소유권 없음은 404, 만료는 `410 FILE_EXPIRED`다. 중복 재처리·자동 재시도는 없다. 원본은 원래 TTL과 개수/용량 제한을 유지한다.
- 처리 중 행은 cleanup이 만료시키지 않는다. 성공/실패 저장은 processing·미전송 조건부 갱신으로 삭제/만료 뒤 늦은 결과를 거부한다. 재시작 뒤 남은 processing은 failed로 정리하고 자동 재처리하지 않는다. 처리 중 삭제는 허용하며 DB 삭제 및 기존 원본 cleanup queue를 사용한다.
- cleanup은 활성 chat job의 in_use_job_id 참조를 가진 첨부를 건너뛴다. job 시작이 첨부 행을 잠그는 기존 transaction과 만료 cleanup의 행 잠금이 경합을 직렬화한다. terminal 뒤 참조가 해제되면 다음 cleanup에서 만료 처리한다. 사용자 파일 변경도 활성 참조가 있으면 busy다.
- 검증은 원본 재처리/개수·상태 경합·소유권·삭제/TTL 보호를 격리 DB/실제 HTTP로 수행한다. 실제 OCR 엔진·브라우저 상태 표시는 N10/N13에서 인수한다. 새로운 queue/schema/의존성은 추가하지 않는다.
- N09-R1 보완(2026-10-01 구현·fixture 검증): retry는 최초 upload와 동일한 안전 오류 매핑을 사용한다. OCR 불가 503, 페이지/추출문 상한 413, 암호/손상/OCR 실패 422, 처리 중 삭제 404 등 기존 code/status를 보존한다. 연결 종료를 처리 취소 사유로 분류하지 않으며 예상하지 못한 저장 오류도 지원하지 않는 형식(415)으로 바꾸지 않는다. 오류별 controller 검증과 실제 HTTP 정상 retry의 증거/한계는 TEST_PLAN.md 최신 보완 절을 따른다.

## 새 버전 첨부 상태 개선 (2026-09-30, 계획)

- 업로드·텍스트 추출·OCR·준비·실패를 구분해 표시한다. N09의 매핑은 위 구현 계약을 따른다. 업로드 중은 클라이언트 상태, 추출/OCR은 DB processing, 완료 뒤 OCR/page metadata로 구분한다.
- 선택 첨부가 모두 준비돼야 메시지를 전송한다. 실패한 파일을 제거하면 나머지 준비된 파일로 전송할 수 있다.
- 재처리는 명시적 동작으로 제공하고 중복 작업·저장 용량·동시 처리 상한을 검증한다. 첨부 대화 소유권·만료와 기존 파일 제한은 유지한다.
- 처리 중 대화 전환 후 돌아왔을 때 서버 처리 상태를 다시 조회한다. 전송이 끝나지 않은 브라우저 업로드의 재개는 별도 보장하지 않는다.

## 1. 목적

대화에 첨부하는 원본 파일과 추출 텍스트를 안전하게 저장하고, 현재 메시지 또는 후속 메시지의 AI 컨텍스트에 포함하는 기준을 정의한다.

## 2. 적용 범위

현재 구현은 텍스트 계열 파일, 텍스트 PDF, 스캔 PDF OCR과 JPEG·PNG·WebP 이미지의 업로드·검증·원본 저장·메시지 연결을 포함한다. 일반 이미지 원본은 OCR로 변환하지 않고 이미지 입력이 허용된 멀티모달 모델에 직접 전달한다. DOCX, GIF와 HEIC는 제외한다.

## 3. 상세 명세

### 3.1 지원 텍스트 형식

- 문서·데이터: `.txt`, `.md`, `.markdown`, `.json`, `.jsonl`, `.csv`, `.tsv`, `.log`, `.xml`, `.yaml`, `.yml`
- 소스 코드: `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.java`, `.c`, `.cpp`, `.h`, `.hpp`, `.cs`, `.go`, `.rs`, `.php`, `.rb`, `.sh`, `.ps1`, `.sql`, `.html`, `.css`
- 인코딩: UTF-8, UTF-8 BOM, UTF-16 LE·BE, CP949/EUC-KR
- NUL byte가 포함된 파일과 지원 인코딩으로 해석할 수 없는 파일은 거부한다.
- 추출 텍스트는 최대 2,000,000자로 제한한다.

### 3.2 크기와 개수

- 파일 하나의 최대 크기는 `config.yaml`의 `limits.maximumFileBytes`이며 기본 10MB다.
- 메시지 하나의 첨부는 `limits.maximumAttachmentsPerMessage` 이하이며 기본 10개다.
- 빈 파일은 거부한다.
- 업로드 전에 파일시스템 여유 공간이 `storage.minimumFreeBytesForUpload` 이상인지 확인한다.

### 3.3 PDF 처리

- `.pdf`와 `application/pdf`가 함께 확인되고 본문이 `%PDF-` signature로 시작해야 한다.
- PDF.js를 이용해 페이지별 텍스트 레이어를 추출하고 `[PDF N페이지]` 구분자를 포함해 AI 컨텍스트에 전달한다.
- 페이지 수는 `config.yaml`의 `limits.maximumPdfPages` 이하이며 기본 100페이지다.
- `page_count`를 attachment metadata로 저장하고 Web의 전송 전·전송 후 attachment 표시에 사용한다.
- 암호 입력이 필요한 PDF, 손상된 PDF와 PDF로 위장한 파일은 거부한다.
- 전체 문서에서 추출 가능한 텍스트가 없으면 스캔 PDF로 판단하고 로컬 Poppler로 각 페이지를 200 DPI PNG로 렌더링한 뒤 Tesseract `kor+eng` OCR을 실행한다.
- OCR은 외부 서비스로 파일을 전송하지 않는다. 페이지 임시 이미지는 페이지 처리 직후 삭제하고 작업 디렉터리는 성공·실패와 관계없이 정리한다.
- OCR 결과도 `[PDF N페이지 · OCR]` 구분자를 포함하며 일반 PDF 추출문과 같은 2,000,000자 제한을 적용한다.
- OCR 처리 페이지 수는 `ocr_page_count`에 저장하며 Web attachment metadata에서 표시한다.
- 동시에 실행하는 OCR 작업은 `limits.maximumOcrWorkers`로 제한하며 N100 기본 설정은 1개다. Tesseract 내부 OpenMP thread도 1개로 제한한다.
- OCR 대기열은 `limits.maximumOcrQueueSize`로 제한하며 기본 4개다.
- OCR이 글자를 하나도 인식하지 못하거나 처리 도구 실행이 실패하면 원인을 구분해 업로드를 거부한다.
- 빈 페이지나 이미지 페이지만 일부 포함돼도 문서 전체에 추출 가능한 텍스트가 하나 이상 있으면 처리한다.
- PDF 추출문도 텍스트 파일과 같은 2,000,000자 상한을 적용한다.
- 동시에 실행하는 PDF 추출 작업은 `limits.maximumPdfWorkers`로 제한하며 N100 기본 설정은 1개다.
- PDF 대기열은 `limits.maximumPdfQueueSize`로 제한하며 기본 4개다. 대기 중에는 업로드 임시 파일 경로만 유지하고 전체 파일 Buffer를 읽지 않는다.
- 대기열이 가득 차면 `FILE_PROCESSING_BUSY`로 거부하고 임시 파일을 삭제한다. 대기 중 클라이언트 연결이 닫히면 queue에서 즉시 제거하고 `FILE_PROCESSING_CANCELLED`로 정리한다.

### 3.4 이미지 처리

- 지원 확장자는 `.jpg`, `.jpeg`, `.png`, `.webp`이고 MIME은 각각 `image/jpeg`, `image/png`, `image/webp`여야 한다.
- 확장자와 MIME만 신뢰하지 않고 원본 byte signature를 해석해 실제 형식과 가로·세로 크기를 확인한다.
- decoded pixel 수는 `limits.maximumImagePixels` 이하이며 기본값은 40,000,000픽셀이다.
- 한 Provider 요청에 포함되는 현재·후속 이미지 원본의 합계는 `limits.maximumImageBytesPerRequest` 이하이며 기본값은 20MiB다. 파일별 10MB 제한과 별개로 적용한다.
- DB에는 `image_width`, `image_height`를 저장하고 추출문·텍스트 인코딩·PDF 페이지 수는 저장하지 않는다.
- 이미지 생성, GIF·HEIC, 이미지 OCR과 자동 리사이즈는 제공하지 않는다.
- 현재 메시지 이미지와 사용자가 `후속 메시지에도 포함`으로 지정한 활성 경로의 이전 이미지를 원본 base64로 Provider adapter에 전달한다.
- 총 byte 상한은 DB metadata로 원본을 읽기 전에 검사하고 실제 읽은 byte도 다시 누적 검사한다. 이미지는 한 번에 `Promise.all`로 읽지 않고 순차적으로 base64 변환해 동시에 유지되는 원본 Buffer를 한 개로 제한한다.
- 선택 모델의 `supports_image_input`이 꺼져 있으면 Provider 호출과 호출량 차감 전에 `CHAT_IMAGE_MODEL_UNSUPPORTED`로 실패한다.
- 이미지 합계가 상한을 넘으면 원본 읽기와 Provider 호출량 차감 전에 `CHAT_IMAGE_PAYLOAD_TOO_LARGE`로 실패한다.

### 3.5 업로드 API

`POST /api/files/conversations/:conversationId`는 인증된 사용자·게스트와 CSRF 검증을 요구한다.

- body: 파일 한 개의 원시 byte stream
- `Content-Type`: body parser가 원본을 변형하지 않도록 `application/octet-stream`으로 고정한다.
- `X-File-Media-Type`: 브라우저가 감지한 원본 MIME. MIME만 신뢰하지 않고 확장자·본문도 검증한다.
- `X-File-Name`: `encodeURIComponent`로 인코딩한 원본 파일명
- `X-Include-In-Future`: `true` 또는 `false`
- 성공: `201 Created`와 attachment metadata
- 처리 대기열 포화: `FILE_PROCESSING_BUSY`와 `503 Service Unavailable`
- 처리 대기 중 연결 종료·서버 종료: `FILE_PROCESSING_CANCELLED`

업로드 직후 attachment는 특정 메시지에 연결되지 않은 pending 상태다. `POST /api/conversations/:id/messages`의 `attachmentIds`로 전송하면 같은 transaction에서 생성된 user 메시지에 연결한다. 다른 대화·사용자·게스트의 attachment, 이미 메시지에 연결된 attachment 또는 10개 초과 요청은 거부한다.

`GET /api/files/conversations/:conversationId/pending`은 새로고침 후에도 전송 전 attachment 목록을 복원하며 추출 본문과 storage key는 반환하지 않는다.

`DELETE /api/files/conversations/:conversationId/:attachmentId`는 아직 메시지에 연결되지 않은 attachment와 원본 파일을 삭제한다. 메시지에 연결된 attachment는 대화 삭제 정책을 따른다.

### 3.6 저장

- 원본은 Web 공개 경로 밖의 `storage.root` 아래 UUID 기반 object key로 저장한다.
- 원본 파일명은 DB metadata로만 보존하고 경로 구성에 사용하지 않는다.
- 임시 파일을 `storage.temp`에 exclusive 생성한 뒤 검증 완료 시 원본 경로로 원자적 rename한다.
- DB에는 소유 대화, 연결 메시지, 원본명, MIME, 파일 종류, PDF 페이지 수, byte 크기, object key, 추출문, 후속 포함 여부, 생성·만료 시각을 저장한다.
- 대화 또는 소유 주체 삭제 시 DB 행은 cascade 삭제하고 DB trigger가 원본의 `storage_key`를 `attachment_cleanup_queue`에 남긴다. 삭제 요청 직후 API가 queue를 비우며 실패한 항목은 다음 worker 실행에서 재시도한다.
- 기본 만료 시각은 업로드 시각부터 DB `attachment_settings.retention_days`이며 기본 30일이다. 최초 구동에는 `storage.attachmentRetentionDays`를 초기값으로 반영하고 이후 관리자 설정이 DB 기준값이 된다.
- 관리자가 보관 기간을 바꾸면 기존 `ready`·`failed` attachment의 만료 시각도 생성 시각 기준으로 다시 계산한다.
- 만료 worker는 서버 시작 1분 후와 이후 1시간마다 실행한다. 만료된 행은 `expired` 상태로 전환하고 추출문·인코딩·후속 포함 설정을 제거한 뒤 원본 삭제를 queue에 넣는다.
- 만료된 메시지 attachment는 원본명, MIME, 종류, byte 크기, PDF 페이지 수와 이미지 해상도 metadata를 유지하며 Web에는 `원본 만료`로 표시한다.
- DB에 없는 UUID 원본 파일은 24시간 유예 뒤 고아 파일로 삭제해 업로드·DB 저장 사이의 짧은 정상 처리 구간과 충돌하지 않게 한다.
- 관리자는 서버 메뉴에서 1~3,650일 보관 기간, 보관 파일 수·크기, 삭제 대기 수와 최근 정리 결과를 보고 `지금 정리`를 실행할 수 있다.

### 3.7 AI 컨텍스트

- 현재 전송 메시지에 연결한 모든 텍스트 attachment는 현재 user 메시지 본문 뒤에 구분된 attachment context로 포함한다.
- `includeInFutureMessages = true`인 attachment는 같은 활성 대화 경로의 후속 요청에도 포함한다.
- 원본 사용자 메시지 본문은 변경하지 않는다. Provider에 전달할 context를 구성할 때만 추출문을 합성한다.
- 첨부 추출문도 컨텍스트 token 계산과 자동 요약 대상에 포함한다.
- 답변 재생성은 대상 user 메시지에 연결된 attachment와 그 시점까지 후속 포함이 활성인 attachment를 다시 사용한다.

## 4. 오류·예외와 경계 조건

- `FILE_INPUT_INVALID`(`400`): 파일명·header·빈 body·attachment ID 형식 오류
- `FILE_TYPE_UNSUPPORTED`(`415`): 지원하지 않는 확장자·본문 형식
- `FILE_TOO_LARGE`(`413`): 설정한 byte 제한 초과
- `FILE_TEXT_TOO_LARGE`(`413`): 추출 텍스트 2,000,000자 초과
- `FILE_PDF_PAGE_LIMIT`(`413`): 설정한 PDF 페이지 수 제한 초과
- `FILE_PDF_PASSWORD_PROTECTED`(`422`): 암호 입력이 필요한 PDF
- `FILE_PDF_OCR_REQUIRED`(`422`): 추출할 텍스트 레이어가 없는 스캔 PDF
- `FILE_PDF_OCR_NO_TEXT`(`422`): OCR을 실행했으나 인식 가능한 텍스트가 없음
- `FILE_PDF_OCR_FAILED`(`422`): 렌더링 또는 OCR 처리 실패
- `FILE_PDF_OCR_UNAVAILABLE`(`503`): 서버에 Poppler 또는 Tesseract 실행 환경이 없음
- `FILE_PDF_INVALID`(`422`): 손상되었거나 PDF로 해석할 수 없는 본문
- `FILE_IMAGE_DIMENSIONS_EXCEEDED`(`413`): 설정한 decoded pixel 제한 초과
- `CHAT_IMAGE_PAYLOAD_TOO_LARGE`: 현재 Provider 요청에 포함되는 이미지 원본 합계 초과
- `FILE_STORAGE_LOW`(`507`): 최소 여유 공간 미만
- `FILE_NOT_FOUND`(`404`): 존재하지 않거나 다른 주체·대화의 attachment
- `FILE_ATTACHMENT_LIMIT`(`400`): 메시지당 첨부 개수 초과
- partial upload와 DB 저장 실패 시 임시·최종 원본을 가능한 범위에서 정리한다.
- 오류 응답과 log에 원본 본문, 로컬 절대 경로 또는 다른 주체의 파일 존재 여부를 노출하지 않는다.

## 5. 검증·인수 조건

- 지원 텍스트 파일과 PDF의 원본·추출문이 저장되고 실제 AI context에 포함된다.
- 텍스트 PDF는 페이지 수와 페이지별 추출문이 보존되고, 스캔 PDF는 한국어·영어 OCR 결과와 처리 페이지 수가 보존된다. 100페이지 초과·암호·손상·OCR 무결과·OCR 실행 실패는 서로 구분되는 오류로 거부된다.
- JPEG·PNG·WebP는 확장자·MIME·실제 본문 형식과 decoded pixel 수가 검증되고 가로·세로 metadata가 저장된다.
- 이미지 입력이 꺼진 모델에는 이미지 원본을 전송하거나 호출량을 차감하지 않는다.
- 이미지 원본 합계가 기본 20MiB를 넘으면 storage read와 호출량 차감 전에 거부된다.
- 같은 제목의 파일도 UUID object key로 충돌하지 않는다.
- 경로 traversal 파일명이 저장 경로에 영향을 주지 않는다.
- 사용자·게스트·대화 소유권과 CSRF가 업로드·삭제·메시지 연결에서 강제된다.
- 10MB·10개·지원 확장자·인코딩·2,000,000자 제한을 서버에서 검증한다.
- 대화 삭제 시 attachment DB metadata가 cascade 삭제된다.
- Web에서 전송 전 attachment를 추가·취소하고 후속 메시지 포함 여부를 선택할 수 있다.

## 6. 미결정·보류 항목

- 악성 파일 검사
