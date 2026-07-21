# 관리자 로그 및 감사 기록 명세

## 1. 목적

고정 관리자가 서비스 운영, 보안 사고, AI 요청 실패와 파일 처리 문제를 관리자 웹 화면에서 조회할 수 있게 한다. 로그는 문제를 진단할 수 있을 만큼 상세해야 하지만 API 키, 비밀번호, 대화 본문과 첨부파일 내용은 기본적으로 기록하지 않는다.

## 2. 로그 분류

### 2.1 감사 로그

관리자 또는 시스템이 설정을 변경한 기록이다.

- 사용자 생성·수정·비활성화·삭제
- 사용자 비밀번호 변경
- 제공자 연결 생성·수정·삭제·활성화
- API 키 등록·교체·삭제
- 모델 동기화와 모델 활성화 변경
- 사용자별 모델 권한 변경
- 파일 보관 기간 등 시스템 설정 변경
- provider template import·업데이트 승인
- 로그 보관 정책 변경
- 관리자 대화 본문 열람 기능 사용

변경 작업에는 변경 전·후 값을 저장하되 비밀번호, API 키, private key와 토큰은 `***`로 대체한다.

### 2.2 인증 및 보안 로그

- 로그인 성공·실패
- 로그아웃
- 세션 만료와 강제 종료
- 4번째 로그인에 따른 가장 오래된 세션 종료
- 비활성 계정 로그인 시도
- 권한 없는 대화·파일·모델 접근 시도
- CSRF 검증 실패
- 로그인 속도 제한 발생
- 차단된 파일 업로드
- SSRF 방어로 차단된 provider URL
- 의심스러운 관리자 API 호출

로그인 실패 로그에는 입력한 비밀번호를 절대 저장하지 않는다. 존재하지 않는 사용자와 잘못된 비밀번호를 사용자 화면에서는 같은 오류로 처리한다.

### 2.3 AI 요청 로그

각 AI 요청에 다음 정보를 저장한다.

- 요청 ID와 추적 ID
- 사용자 ID와 대화방 ID
- 메시지 ID와 활성 분기 ID
- 제공자 연결 ID와 템플릿 ID
- 모델 ID와 요청 형식
- 사용한 자격증명 내부 ID 또는 키 그룹 ID
- 스트리밍 여부
- 입력·출력·추론·캐시 토큰
- 예상 비용과 실제 비용(제공되는 경우)
- 요청 시작·첫 토큰·완료 시각
- 첫 토큰 지연과 전체 처리 시간
- HTTP 상태와 표준화된 오류 코드
- 중단 사유
- 재시도 횟수와 fallback 모델
- 파일 첨부 개수와 형식, 총 크기
- 컨텍스트 요약 사용 여부와 요약 모델
- 사용자 취소 여부

기본 요청 로그에는 system prompt, 사용자 메시지, AI 답변, 추출 문서 내용과 이미지 데이터를 저장하지 않는다.

### 2.4 파일 처리 로그

- 업로드 시작·완료·실패
- 파일 내부 ID, 사용자 ID와 메시지 ID
- 원본 파일명은 선택적으로 마스킹한 값만 표시
- 확장자, MIME, 크기와 PDF 페이지 수
- 인코딩 감지 결과
- 텍스트 추출 성공·실패
- 이미지 검증과 EXIF 제거 결과
- 파일 만료·삭제
- 사용자·대화 삭제에 따른 연쇄 삭제
- 악성 또는 바이너리 파일 차단 사유

파일 본문과 원본 파일 경로는 로그에 저장하지 않는다. 저장소 객체 키가 필요하면 관리자에게도 전체 값 대신 축약값을 표시한다.

### 2.5 시스템 및 작업 로그

- 애플리케이션 시작·종료와 버전
- 데이터베이스 연결 오류
- migration 실행 결과
- provider model sync 결과
- 파일 정리 작업 결과
- 백업·복구 작업 결과
- 디스크 부족 경고
- 외부 API 연결 시간초과
- 백그라운드 요약 작업 실패
- 로그 정리 작업 결과

## 3. 로그 수준

- `DEBUG`: 개발 환경 전용 상세 진단
- `INFO`: 정상 작업 완료
- `WARN`: 복구 가능한 오류, 재시도, 제한 초과 접근
- `ERROR`: 요청 실패 또는 운영자 확인 필요
- `SECURITY`: 인증·권한·SSRF 등 보안 이벤트

운영 환경 기본값은 `INFO` 이상이며 `DEBUG`는 전체 서비스에 장시간 활성화할 수 없게 한다. 관리자가 제한된 시간 동안 특정 제공자 또는 요청 ID에 대해서만 상세 진단을 활성화할 수 있게 확장한다.

## 4. 관리자 로그 화면

관리자 메뉴에 “로그”를 두고 다음 탭을 제공한다.

- AI 요청
- 로그인·보안
- 관리자 감사
- 파일 처리
- 시스템·작업

### 4.1 목록 화면

목록에는 다음 열을 기본 표시한다.

- 발생 시각
- 수준
- 로그 종류
- 사용자 또는 관리자
- 제공자·모델
- 작업 또는 오류 요약
- HTTP 상태
- 처리 시간
- 요청 ID

목록은 최신순이며 cursor pagination을 사용한다.

### 4.2 검색과 필터

- 시작·종료 일시
- 로그 종류와 수준
- 사용자명 또는 사용자 ID
- 제공자와 모델
- HTTP 상태
- 성공·실패·취소
- 오류 코드
- 요청 ID·추적 ID
- 파일 형식
- 관리자 작업 종류

검색 문자열은 원문 메시지나 첨부파일 내용을 검색하지 않는다.

### 4.3 상세 화면

상세 화면은 다음 정보를 구역별로 표시한다.

- 요청·이벤트 기본 정보
- 사용자와 대화 식별자
- 제공자·모델·요청 형식
- 파라미터 값
- 토큰·비용·처리 시간
- 재시도와 fallback 이력
- 마스킹된 요청·응답 헤더
- 표준화된 오류와 upstream 오류 요약
- 관련 감사·보안 이벤트 링크

Authorization, Cookie, API key, private key, session token, OAuth token과 proxy auth는 필드 전체를 숨긴다.

## 5. 원본 요청·응답 진단

원본 body 저장은 기본 비활성화한다. 제공자 호환성 문제를 진단하기 위해 필요한 경우 다음 조건에서만 제한적으로 활성화한다.

- 고정 관리자만 활성화 가능
- 특정 제공자 또는 요청 ID 범위 지정
- 최대 30분 후 자동 비활성화
- 활성화 사유 입력
- 감사 로그 기록
- API 키와 인증 헤더 강제 제거
- 대화 본문·파일 내용은 기본 마스킹
- 저장된 진단 로그는 최대 24시간 후 자동 삭제

대화 본문을 포함한 진단은 관리자 본문 열람 기능과 동일한 권한·사유·감사 정책을 적용하며 2차 기능으로 둔다.

## 6. 데이터 구조

### `audit_logs`

- `id`, `occurred_at`
- `actor_type`, `actor_id`
- `action`, `target_type`, `target_id`
- `before_data`, `after_data`
- `reason`, `ip_hash`, `user_agent_summary`
- `request_id`

사용자 관리 단계에서는 이 구조의 `audit_logs` table과 사용자 생성·수정·비활성화·비밀번호 변경·삭제 기록을 먼저 구현한다. password·password hash는 before/after snapshot에 포함하지 않는다. 관리자 로그 조회 화면, retention job과 다른 log category는 관리자 log 단계까지 보류한다.

### `security_logs`

- `id`, `occurred_at`
- `event_type`, `severity`
- `user_id`, `session_id`
- `ip_hash`, `user_agent_summary`
- `result`, `reason_code`
- `request_id`, `metadata`

### `ai_request_logs`

- `id`, `request_id`, `trace_id`
- `user_id`, `conversation_id`, `message_id`, `branch_id`
- `provider_connection_id`, `provider_template_id`, `model_id`
- `credential_id`, `key_group_id`
- `request_format`, `streaming`
- `input_tokens`, `output_tokens`, `reasoning_tokens`, `cached_tokens`
- `estimated_cost`, `actual_cost`, `currency`
- `started_at`, `first_token_at`, `completed_at`, `duration_ms`
- `http_status`, `result_status`, `stop_reason`, `error_code`
- `retry_count`, `fallback_history`
- `attachment_count`, `attachment_bytes`
- `summary_used`, `summary_model_id`
- `safe_metadata`

### `file_processing_logs`

- `id`, `occurred_at`
- `user_id`, `attachment_id`, `message_id`
- `operation`, `result`, `reason_code`
- `mime_type`, `extension`, `size_bytes`, `page_count`
- `encoding`, `duration_ms`
- `request_id`, `safe_metadata`

시스템 프로세스 로그는 stdout에 JSON Lines로 기록하고 운영 로그 수집기가 저장한다. 관리자 화면에 필요한 오류·작업 요약은 별도 `system_event_logs` 테이블에도 저장한다.

## 7. 보관 기간 기본값

| 로그                | 기본 보관 | 관리자 변경 범위 |
| ------------------- | --------: | ---------------: |
| AI 요청 로그        |      90일 |          7~365일 |
| 인증·보안 로그      |     180일 |         30~730일 |
| 관리자 감사 로그    |     365일 |       90~1,825일 |
| 파일 처리 로그      |      90일 |          7~365일 |
| 시스템 이벤트 로그  |      30일 |          7~180일 |
| 제한 진단 원본 로그 |    24시간 |         최대 7일 |

로그 삭제 작업은 하루 1회 실행하고 삭제 건수와 실패 여부를 시스템 이벤트로 남긴다.

사용자 삭제 시 AI 요청·파일 처리 로그의 사용자 식별자는 익명화한다. 대화 ID, 메시지 ID와 파일 ID는 제거한다. 관리자 감사 로그는 무결성을 위해 보존하되 삭제된 사용자 표시명 대신 비가역 식별자를 사용한다.

## 8. IP와 개인정보

- 원본 IP는 기본 저장하지 않고 서버 비밀 salt를 사용한 hash와 필요한 경우 축약된 네트워크 대역만 저장한다.
- User-Agent는 전체 문자열 대신 브라우저·OS 요약을 저장한다.
- 대화 제목, 메시지 본문, 파일명은 기본 로그에서 제외한다.
- 이메일 등 사용자 개인정보가 오류 메시지에 포함될 경우 저장 전에 마스킹한다.
- 로그 다운로드에도 동일한 마스킹 정책을 적용한다.

## 9. 내보내기

- 현재 필터 결과를 CSV 또는 JSON으로 내보낼 수 있다.
- 최대 내보내기 건수와 기간을 제한한다.
- 내보내기는 백그라운드 작업으로 생성하고 제한 시간 후 삭제한다.
- 파일 생성·다운로드·삭제를 감사 로그에 남긴다.
- 민감정보가 제거된 컬럼만 포함한다.

## 10. 알림과 대시보드

관리자 대시보드에 다음 정보를 표시한다.

- 최근 24시간 요청 수와 성공률
- 제공자·모델별 오류율
- 평균·95백분위 첫 토큰 시간과 전체 처리 시간
- 401·403·429·5xx 발생 수
- 로그인 실패와 보안 이벤트 수
- 파일 처리 실패 수
- 토큰 사용량과 추정 비용

다음 조건에는 경고 표시를 제공한다.

- 동일 제공자에서 연속 인증 실패
- 짧은 시간 내 429 또는 5xx 급증
- 로그인 실패 급증
- 디스크 사용량 또는 로그 저장소 임계치 초과
- 파일 정리·백업 작업 반복 실패

외부 이메일·Slack 알림은 2차 범위로 둔다.

## 11. 서버 API 초안

- `GET /admin/logs/ai-requests`
- `GET /admin/logs/security`
- `GET /admin/logs/audit`
- `GET /admin/logs/files`
- `GET /admin/logs/system`
- `GET /admin/logs/{category}/{id}`
- `POST /admin/logs/export`
- `GET /admin/logging/settings`
- `PATCH /admin/logging/settings`
- `POST /admin/logging/diagnostic-session`
- `DELETE /admin/logging/diagnostic-session/{id}`

로그 조회·내보내기·설정 변경은 고정 관리자만 가능하다. 모든 조회와 내보내기도 감사 로그에 남긴다.

## 12. 인수 조건

- 관리자가 웹 화면에서 AI 요청, 보안, 감사, 파일과 시스템 로그를 조회할 수 있다.
- 사용자·제공자·모델·상태·기간·요청 ID로 필터링할 수 있다.
- AI 요청 실패의 HTTP 상태, 오류 코드와 재시도 이력을 확인할 수 있다.
- API 키, 비밀번호, 토큰과 private key가 목록·상세·내보내기에 나타나지 않는다.
- 대화와 첨부파일 본문은 기본 로그에 저장되지 않는다.
- 설정된 기간이 지난 로그가 자동 삭제된다.
- 사용자 삭제 후 운영 로그의 사용자·대화·파일 식별자가 익명화된다.
- 관리자 로그 조회와 내보내기가 감사 기록에 남는다.
- 로그 저장 실패가 AI 응답 자체를 불필요하게 실패시키지 않으며 시스템 경고가 남는다.
