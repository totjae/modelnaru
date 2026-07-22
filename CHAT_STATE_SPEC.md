# ModelNaru 채팅 상태 명세

## 1. 목적

대화방, 메시지, 응답 분기와 AI 요청 상태를 사용자·게스트별로 안전하게 저장하고 후속 스트리밍·재생성·요약 구현이 따라야 할 기준을 정의한다.

## 2. 적용 범위

- 일반 사용자와 게스트의 대화방 생성·목록·조회·수정·삭제
- 대화별 시스템 프롬프트, 전송할 이전 메시지 수와 컨텍스트 토큰 한도
- 대화 중 모델 변경, 메시지 상태와 Provider·모델 snapshot
- 답변 재생성 분기와 활성 분기
- 스트리밍 시작·완료·실패·취소 상태
- 사용자·게스트 소유권 격리와 cascade 삭제

관리자 대화 본문 열람과 파일 첨부는 별도 단계다. 첨부는 [FILE_PROCESSING_SPEC.md](./FILE_PROCESSING_SPEC.md)가 생성된 뒤 이 구조에 연결한다.

## 3. 상세 명세

### 3.1 소유권

- 대화는 `user_id` 또는 `guest_id` 중 정확히 하나를 소유자로 가진다.
- 일반 사용자는 자신의 `user_id`, 게스트는 자신의 임시 `guest_id`에 속한 대화만 조회·변경할 수 있다.
- 고정 관리자는 일반 채팅 API를 사용하지 않는다.
- 사용자 삭제 시 대화·분기·메시지를 cascade 삭제한다.
- 게스트 로그아웃·만료 정리로 `guest_principals`가 삭제되면 같은 방식으로 임시 대화를 삭제한다.
- 존재하지만 다른 주체가 소유한 ID와 존재하지 않는 ID는 모두 `404 CHAT_NOT_FOUND`로 응답한다.

### 3.2 대화 설정

대화는 다음 설정을 가진다.

| 항목               | 기본값           | 범위             | 설명                                               |
| ------------------ | ---------------- | ---------------- | -------------------------------------------------- |
| 제목               | `새 대화`        | 1~200자          | 사용자가 수정할 수 있으며 후속 자동 제목 생성 가능 |
| 시스템 프롬프트    | 빈 문자열        | 최대 100,000자   | 대화마다 사용자 수정 가능                          |
| 이전 메시지 수     | `0`              | 0~10,000         | `0`은 개수 제한 없음                               |
| 컨텍스트 토큰 한도 | `100000`         | 1,000~2,000,000  | 초과 시 관리자 설정에 따라 자동 요약               |
| 활성 분기          | 생성된 root 분기 | 같은 대화의 분기 | 다음 요청에서 사용할 메시지 경로                   |

모델은 대화에 고정하지 않는다. 매 AI 요청에서 허용된 모델을 선택하며, 각 assistant 메시지에 실제 Provider model UUID, Provider template ID와 모델 ID snapshot을 저장한다. 대화를 다시 열면 활성 분기의 마지막 assistant 메시지가 사용한 Provider model UUID를 선택창에 복원한다. 해당 모델이 삭제·비활성화·권한 회수된 경우에는 현재 허용 모델을 유지하거나 첫 허용 모델로 대체한다.

### 3.3 분기

- 대화 생성 transaction에서 root 분기를 정확히 하나 생성하고 활성 분기로 지정한다.
- 답변 재생성 시 기존 assistant 메시지를 덮어쓰지 않고, 원래 분기를 부모로 하는 새 분기를 만든다.
- 재생성 대상은 현재 활성 경로의 가장 마지막 assistant 메시지로 제한한다. 중간 답변에서 새로운 다단계 분기를 만드는 기능은 제공하지 않는다.
- 새 분기는 교체할 기존 assistant 메시지를 `forked_from_message_id`로 참조하며 부모 분기의 해당 메시지 직전까지를 공유한다. 부모 메시지를 새 행으로 복사하지 않는다.
- 재생성이 완료되면 새 분기를 활성 분기로 전환한다. 실패·취소 시 기존 활성 분기를 유지한다.
- 이전 답변을 선택하면 root 또는 정상 완료된 재생성 분기를 활성 분기로 바꾸며 이후 요청은 선택한 경로만 컨텍스트로 사용한다.
- 재생성 중 다른 session에서 활성 분기를 먼저 바꾼 경우 완료된 새 분기는 보존하되 현재 활성 분기를 강제로 덮어쓰지 않는다.
- 첫 단계에서는 분기 삭제·이름 변경 API를 제공하지 않는다.

### 3.4 메시지와 상태

메시지 역할은 `user`, `assistant`, `summary`다. 상태는 다음과 같다.

| 상태        | 의미                               | 허용되는 다음 상태                 |
| ----------- | ---------------------------------- | ---------------------------------- |
| `pending`   | 요청을 저장했으나 upstream 전송 전 | `streaming`, `failed`, `cancelled` |
| `streaming` | 응답 조각을 수신 중                | `completed`, `failed`, `cancelled` |
| `completed` | 정상 완료                          | 없음                               |
| `failed`    | 검증·네트워크·upstream 오류        | 없음, 재생성은 새 분기             |
| `cancelled` | 사용자가 중지                      | 없음, 재생성은 새 분기             |

- 사용자 메시지는 생성과 동시에 `completed`다.
- assistant 메시지는 `pending`으로 만든 후 upstream 연결 직전에 `streaming`으로 바꾼다.
- 스트리밍 본문은 동일 assistant 메시지에 누적하고 완료 시 token usage와 `completed_at`을 기록한다.
- 실패·취소 시 이미 받은 부분 본문은 보존할 수 있으며 오류 code만 저장하고 upstream 원문 오류는 저장하지 않는다.
- `(branch_id, sequence_number)`는 유일하며 분기 내 순서를 결정한다.
- 요청 parameter는 서버 검증을 통과한 값만 JSON으로 저장한다.

### 3.5 컨텍스트 자동 요약

- 활성 분기와 이전 메시지 수 설정으로 구성한 컨텍스트가 적용 한도를 넘을 때만 요약을 실행한다.
- 오래된 prefix를 요약하고 최근 메시지는 그대로 보존한다. 요약문은 Provider에 전달할 임시 context 항목일 뿐 사용자 메시지 목록에는 표시하지 않는다.
- `context_summaries`에는 대화·생성 분기, 포함한 최초·최종 메시지 ID, 메시지 수, 요약 모델 snapshot, prompt version과 usage를 저장한다.
- 현재 활성 경로에 최종 메시지 ID가 존재하고 모델·prompt version이 같은 기존 요약은 재사용한다. 따라서 재생성 자식 분기도 공유된 부모 prefix의 요약을 사용할 수 있다.
- 요약 모델 요청은 사용자의 일일 호출량을 차감하지 않으며 본 답변은 요약 성공과 최종 한도 검사 뒤 1회를 예약한다.
- 요약은 오래된 원문을 대신해 직접 Provider context에 포함된다. 요약 내용에 따라 과거 원문을 다시 검색하는 retrieval 단계는 수행하지 않는다.
- 요약 실패 시 원본 메시지를 삭제·수정·무단 절단하지 않는다.

### 3.6 기본 API 단계

현재 다음 API를 제공한다.

- `GET /api/conversations`: 현재 주체의 대화 목록
- `POST /api/conversations`: 대화와 root 분기 생성
- `GET /api/conversations/:id`: 활성 분기와 저장된 메시지를 포함한 상세 조회
- `PATCH /api/conversations/:id`: 제목·시스템 프롬프트·컨텍스트 설정 변경
- `DELETE /api/conversations/:id`: 대화 hard delete
- `POST /api/conversations/:id/messages`: user·assistant 메시지를 저장하고 SSE로 AI 응답 전송
- `POST /api/conversations/:id/messages/:messageId/cancel`: 진행 중인 upstream 요청 취소
- `POST /api/conversations/:id/messages/:messageId/regenerate`: 기존 답변을 보존한 새 분기에서 SSE 재생성
- `PATCH /api/conversations/:id/branches/:branchId/active`: 정상 완료된 답변 분기로 전환

메시지 전송은 `content`, `providerModelId`와 검증된 `temperature`, `topP`, `maxOutputTokens`만 받는다. 재생성은 새 `content` 없이 대상 assistant ID와 새 답변에 사용할 모델·parameter를 받는다. 모델 권한을 먼저 확인하고 컨텍스트 한도를 검사한 뒤 일일 호출량을 예약한다. 브라우저 연결 종료 또는 취소 API 요청은 같은 `AbortController`를 통해 upstream 연결도 중단한다. 모든 mutation은 CSRF 검증을 요구한다.

## 4. 오류·예외 또는 경계 조건

- `CHAT_INPUT_INVALID`(`400`): UUID, 제목, 설정 범위 또는 허용되지 않은 필드 값
- `AUTH_SESSION_REQUIRED`(`401`): session 없음·만료
- `AUTH_CSRF_INVALID`(`403`): mutation의 CSRF 검증 실패
- `CHAT_NOT_FOUND`(`404`): 대상 없음, 다른 주체 소유 또는 관리자 workspace 요청
- `CHAT_CONTEXT_LIMIT_EXCEEDED`: 요약을 사용할 수 없는 상태에서 설정한 컨텍스트 한도 초과
- `CHAT_NOT_CANCELLABLE`(`409`): 이미 완료됐거나 진행 중이 아닌 메시지 취소
- `CHAT_REGENERATION_INVALID`: 활성 경로의 마지막 답변이 아니거나 생성 중인 assistant 메시지를 재생성 대상으로 지정
- 활성 분기와 대화의 관계가 일치하지 않으면 DB 제약으로 거부한다.
- 브라우저 연결이 끊기면 현재 단일 API process의 upstream 요청을 중단하고 assistant 메시지를 `cancelled`로 저장한다.
- 같은 client mutation의 중복 전송 방지는 후속 idempotency key 단계에서 확정한다.

## 5. 검증·인수 조건

- 대화 생성 시 대화와 root 분기, 활성 분기 지정이 하나의 transaction으로 commit된다.
- 사용자·게스트 소유권이 DB 제약과 repository query 양쪽에서 강제된다.
- 다른 주체의 대화 ID는 목록·상세·수정·삭제 어디에서도 노출되지 않는다.
- 사용자와 게스트 삭제 시 대화·분기·메시지가 cascade 삭제된다.
- 기본값은 이전 메시지 무제한(`0`)과 컨텍스트 100,000 token이다.
- 대화 중 서로 다른 Provider 모델 snapshot을 가진 assistant 메시지를 저장할 수 있다.
- OpenAI 호환·Anthropic·Gemini SSE를 공통 이벤트로 변환하고 완료·실패·취소 상태를 저장한다.
- 허용되지 않은 모델은 메시지를 만들기 전에 거부하고 컨텍스트 초과는 quota 예약 전에 중단한다.
- 컨텍스트 요약은 별도 행으로 저장되고 사용자에게 표시되는 원본 메시지와 분기 경로를 변경하지 않는다.
- 같은 모델·prompt version·활성 경로의 요약을 재사용하며 요약이 불가능하면 quota 예약 전에 표준 오류로 중단한다.
- 재생성 결과는 기존 답변을 덮어쓰지 않는 새 분기로 저장할 수 있다.
- 성공한 재생성만 활성화되고 이전·새 답변 분기를 왕복해도 각 경로가 보존된다.
- 가장 최근 질문의 답변 후보만 인라인 탐색 대상으로 묶이며 과거 메시지에는 재생성 조작을 표시하지 않는다.
- controller·service 단위시험, migration 정적 시험, typecheck와 production build가 통과한다.

## 6. 미결정·보류 항목

- 스트리밍 중 DB 본문 갱신 주기와 브라우저 재연결 cursor
- 중복 과금 방지를 위한 idempotency key 수명
- Provider별 tokenizer 연결과 보수적 Unicode 문자 추정치의 교체 시점
- 대화 자동 제목 생성 시점과 사용할 모델
- 관리자 대화 본문 열람 기능과 별도 감사 절차
