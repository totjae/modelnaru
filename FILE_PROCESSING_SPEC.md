# ModelNaru 파일 처리 상세 명세

## 1. 목적

대화에 첨부하는 원본 파일과 추출 텍스트를 안전하게 저장하고, 현재 메시지 또는 후속 메시지의 AI 컨텍스트에 포함하는 기준을 정의한다.

## 2. 적용 범위

1차 구현은 텍스트 계열 파일의 업로드·검증·추출·원본 저장·메시지 연결을 포함한다. 텍스트 PDF와 JPEG·PNG·WebP 이미지 입력은 같은 attachment 기반 위에 후속 구현한다. 스캔 PDF OCR, DOCX, GIF와 HEIC는 제외한다.

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

### 3.3 업로드 API

`POST /api/files/conversations/:conversationId`는 인증된 사용자·게스트와 CSRF 검증을 요구한다.

- body: 파일 한 개의 원시 byte stream
- `Content-Type`: body parser가 원본을 변형하지 않도록 `application/octet-stream`으로 고정한다.
- `X-File-Media-Type`: 브라우저가 감지한 원본 MIME. MIME만 신뢰하지 않고 확장자·본문도 검증한다.
- `X-File-Name`: `encodeURIComponent`로 인코딩한 원본 파일명
- `X-Include-In-Future`: `true` 또는 `false`
- 성공: `201 Created`와 attachment metadata

업로드 직후 attachment는 특정 메시지에 연결되지 않은 pending 상태다. `POST /api/conversations/:id/messages`의 `attachmentIds`로 전송하면 같은 transaction에서 생성된 user 메시지에 연결한다. 다른 대화·사용자·게스트의 attachment, 이미 메시지에 연결된 attachment 또는 10개 초과 요청은 거부한다.

`GET /api/files/conversations/:conversationId/pending`은 새로고침 후에도 전송 전 attachment 목록을 복원하며 추출 본문과 storage key는 반환하지 않는다.

`DELETE /api/files/conversations/:conversationId/:attachmentId`는 아직 메시지에 연결되지 않은 attachment와 원본 파일을 삭제한다. 메시지에 연결된 attachment는 대화 삭제 정책을 따른다.

### 3.4 저장

- 원본은 Web 공개 경로 밖의 `storage.root` 아래 UUID 기반 object key로 저장한다.
- 원본 파일명은 DB metadata로만 보존하고 경로 구성에 사용하지 않는다.
- 임시 파일을 `storage.temp`에 exclusive 생성한 뒤 검증 완료 시 원본 경로로 원자적 rename한다.
- DB에는 소유 대화, 연결 메시지, 원본명, MIME, byte 크기, object key, 추출문, 후속 포함 여부, 생성·만료 시각을 저장한다.
- 대화 또는 소유 주체 삭제 시 DB 행은 cascade 삭제한다. 원본 파일의 즉시 제거와 만료 정리 worker는 보관 정책 단계에서 완성한다.
- 기본 만료 시각은 업로드 시각부터 `storage.attachmentRetentionDays`이며 기본 30일이다.

### 3.5 AI 컨텍스트

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
- `FILE_STORAGE_LOW`(`507`): 최소 여유 공간 미만
- `FILE_NOT_FOUND`(`404`): 존재하지 않거나 다른 주체·대화의 attachment
- `FILE_ATTACHMENT_LIMIT`(`400`): 메시지당 첨부 개수 초과
- partial upload와 DB 저장 실패 시 임시·최종 원본을 가능한 범위에서 정리한다.
- 오류 응답과 log에 원본 본문, 로컬 절대 경로 또는 다른 주체의 파일 존재 여부를 노출하지 않는다.

## 5. 검증·인수 조건

- 지원 텍스트 파일의 원본과 추출문이 저장되고 실제 AI context에 포함된다.
- 같은 제목의 파일도 UUID object key로 충돌하지 않는다.
- 경로 traversal 파일명이 저장 경로에 영향을 주지 않는다.
- 사용자·게스트·대화 소유권과 CSRF가 업로드·삭제·메시지 연결에서 강제된다.
- 10MB·10개·지원 확장자·인코딩·2,000,000자 제한을 서버에서 검증한다.
- 대화 삭제 시 attachment DB metadata가 cascade 삭제된다.
- Web에서 전송 전 attachment를 추가·취소하고 후속 메시지 포함 여부를 선택할 수 있다.

## 6. 미결정·보류 항목

- 텍스트 PDF parser와 암호화·100페이지 검증
- JPEG·PNG·WebP decoded pixel 상한과 Provider별 멀티모달 변환
- 만료·고아 파일 정리 worker의 실행 주기와 관리자 보관 기간 UI
- 악성 파일 검사
- 스캔 PDF OCR
