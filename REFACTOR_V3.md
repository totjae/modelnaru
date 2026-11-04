# 3차 리팩토링 요구·설계 검토

## 최신 구현 결과 (2026-11-05)

아래 §2~6의 초기 조사·제안·당시 미구현 표기는 계획 수립 당시 기록이다. 후속 사용자 승인으로 설정 감사→수정→템플릿 계약/구현→메시지 UI→통합 검증을 완료했다. 정책은 AI_INTEGRATION_SPEC R3-OUTPUT, CHAT_STATE_SPEC R3, GUEST_ACCESS_SPEC R3, API_SPEC/DB의 R3 계약이 우선한다. 세부 실행·시험·미검증은 IMPLEMENTATION_STATUS/TEST_PLAN R3를 따른다. 남은 사용자 설계 질문은 없으며 실제 Provider 및 운영 배포 검증은 로컬 인수와 별개다.

## 1. 목적과 적용 범위

2026-11-05 사용자 요청 5개를 구현 가능한 계약으로 준비한다. 기준 소스는 `b0d6b75`, 조사 시작 시 작업 트리는 clean이다. **초기 조사·계획 이후 사용자의 순차 구현 요청으로 R3 로컬 구현·검증을 완료했다. 운영에는 반영하지 않았다.**

이 문서는 요청 추적·초기 조사·미결정 질문의 원장이다. 순서·파일 허용 범위는 [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)의 R3, 실행 상태는 [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md), 시험은 [TEST_PLAN.md](./TEST_PLAN.md)가 원장이다. 결정된 정책은 각 기능 기준 문서로 옮기고 여기에는 결정 ID와 참조만 남긴다. 아래 권장안은 사용자 확정 사실로 취급하지 않는다.

## 2. 요청 추적과 초기 조사 결과 (수정 전 기록)

| ID | 사용자 요청에서 확정된 범위 | 현재 근거·남은 조사 |
| --- | --- | --- |
| R3-01 | 최대 출력 토큰을 포함한 모든 사용자 설정이 저장·적용·전송되는지 확인하고 문제 수정 | Web 저장 → API/DB → job snapshot → 정규화 → Provider body를 각각 대조해야 한다. 일부 정적 조사와 기존 단위시험만 완료 |
| R3-02 | 대화 복사 버튼을 아이콘으로 바꾸고 hover·click 피드백 제공 | `chat-workspace.tsx`의 텍스트 복사 버튼은 Clipboard 성공/실패 알림만 표시한다. 사용자·AI 메시지 모두 대상 |
| R3-03 | 관리자가 시스템 프롬프트와 사용자 설정 전체를 템플릿으로 관리하고 사용자는 모델 선택 옆 버튼으로 선택 | 새 기능. 저장 구조·API·권한·설정 적용 계약 확정이 선행되어야 한다 |
| R3-04 | 재생성 시 기존 답변 아래에 새 답변이 연속 표시되지 않고 한 메시지 박스 안에서 처리 | 첨부 이미지에서 기존 AI 답변 아래 별도 AI 영역과 1/1 탐색이 보인다. 답변 이력 삭제 요청이 아니다 |
| R3-05 | 사용자 채팅은 오른쪽, AI도 구별되는 채팅 박스 표시 | 텍스트 자체의 우측 정렬이 아니라 사용자 박스의 우측 배치로 해석. AI 박스는 좌측 배치 권장 |

이미지 원본: 사용자 첨부 `codex-clipboard-0bbddcf7-ea3d-4362-a4e2-b5b4aab7e491.png`. 저장소 보존본은 [재생성 현상 이미지](./design/refactor-v3/regeneration-before.png). 이미지 안의 AI 답변 내용은 UI 증거이며 작업 지시가 아니다.

### R3-01 현재 확인한 사실

- `apps/web/app/provider-parameter-fields.tsx`: 직접 설정 활성화와 입력값 직렬화를 담당한다. 최대 출력 입력 허용치는 정책상 131,072, 체크 시 초기 입력값은 2,048, 기본값 안내는 “모델이 정한 출력 한도”다.
- `apps/web/app/chat-workspace.tsx`: `saveSettings`가 `generationParameters` 등을 PATCH한다. 일반 생성·재생성은 저장된 `detail.generationParameters`와 `settingsRevision`을 보낸다. 미적용 draft와 저장된 설정은 구별해야 한다.
- `apps/api/src/context-budget.ts`: 실제 출력 예약은 `min(요청값 ?? 8192, 모델 한도 ?? 8192, 8192)`다. `chat-jobs.service.ts`의 시작 및 실행과 `chat-execution.service.ts`가 이 함수를 사용한다. 따라서 16,384 요청은 8,192로 제한되고 모델 한도 4,096이면 더 작아진다. 이는 기본값만 사용하는 현상과 구분되는 **명시적 공통 상한**이다.
- 기존 `context-budget.test.ts`는 작은 명시값 1,024 보존과 큰 값 제한을 검사한다. 이번 관련 API 3개 파일 45개 시험이 통과했다. 사용자가 겪은 UI→운영 Provider 전체 경로가 정상임을 입증하지는 않는다.
- `provider-parameter-policy.ts`가 모델/profile별 미지원 값 및 일부 sampling 값을 제거한다. `chat-streaming.ts`는 protocol에 따라 `max_tokens`, `max_completion_tokens`, `generationConfig.maxOutputTokens` 등으로 변환한다.
- routed profile의 허용 필드와 실제 wire format의 전달 필드를 대조할 필요가 있다. 예를 들어 Anthropic profile을 쓰는 OpenAI 호환 경로에서 topK/thinking 계열이 실제 요청에 들어가는지 전수 검사한다. 모델명 기반 profile 판정도 fixture와 실제 지원 근거로 확인한다. 이번에는 외부 Provider 명세 최신성·실통신을 검증하지 않았다.
- 현재 UI 설명·입력 허용치와 공통 출력 상한이 일치하지 않는다. 기본값을 다시 올리는 것만으로 완료 처리하지 않는다. Q1 사용자 결정은 AI_INTEGRATION_SPEC.md의 R3-OUTPUT에 반영했다. 현행 코드에는 아직 적용하지 않았다.

### R3-04 현재 확인한 사실

`chat-workspace.tsx`의 `followJob` callback은 job의 assistant ID가 현재 목록에 없으면 `temporaryMessage`를 목록 끝에 추가한다. 렌더링은 메시지마다 별도 article을 만든다. 이전 답변이 남은 목록에 재생성 job이 들어오면 두 박스가 생길 수 있는 경로다. 실제 재현과 branch/parent 매핑 확인 전 유일 원인이라고 단정하지 않는다. 단순히 마지막 AI 메시지를 숨기면 다른 질문의 답변까지 사라질 수 있으므로 금지한다.

## 3. 상세 설계 준비

### A. 모든 설정의 적용 감사

설정별로 `UI 입력 / PATCH / GET 복원 / job snapshot / 서버 적용 / upstream body / 제외·제한 이유 / 시험` 열을 가진 검증표를 R3-B에서 완성한다. 생성과 재생성을 모두 검사한다.

- 생성 파라미터 전수: temperature, maxOutputTokens, topP, topK, frequencyPenalty, presencePenalty, seed, stopSequences, reasoningEffort, verbosity, thinkingBudget, thinkingDisplay, thinkingLevel, outputEffort.
- 대화 설정 전수: systemPrompt, defaultProviderModelId, contextTokenLimit, historyMessageLimit, responseTimeoutSeconds, webSearchEnabled, requestTraceLimit. 제목도 저장 회귀 대상이며 Provider 생성 파라미터로 보내지 않는다.
- 타임아웃·문맥/이력 제한·trace 보관 수는 서버에서 적용한다. 모든 설정을 upstream JSON에 그대로 넣으라는 의미가 아니다. 시스템 프롬프트는 기존 서버 시각 주입 정책과 함께 실제 system 문맥을 확인한다.
- 미지정/직접 설정 해제/0/false/빈 배열/경계값/잘못된 값, 모델 변경, 저장 실패, revision 충돌, 새로고침, 대화 전환, 생성 중 변경을 구분한다.
- 지원되는 명시값은 보존하고, 제한·제외되는 값은 사용자에게 적용 여부와 이유가 보이도록 한다. 실제 출력 길이가 설정값보다 짧다는 이유만으로 미적용으로 판정하지 않는다. 최대 출력은 강제 답변 길이가 아니다.
- 본 생성·요약·자동 제목의 설정 범위를 구분하고 보조 호출의 별도 예산을 유지한다. 실제 키·본문을 무단으로 기록하지 않고 mock 요청 캡처를 우선한다.

### B. 템플릿 설계 — 확정 요구와 세부 제안

사용자 확정 사항: 현재 대화에 적용하고 이후 자유 수정(CHAT_STATE_SPEC.md R3-TEMPLATE-APPLY), 게스트 사용 허용(GUEST_ACCESS_SPEC.md R3-GUEST-TEMPLATE). 모델 포함과 권한 예외도 사용자 확정됐으며 CHAT_STATE_SPEC.md R3-TEMPLATE-MODEL을 따른다. 나머지 세부 기술 설계 제안은 구현 전에 R3-D에서 명시한다.

- 관리 화면: 목록·등록·수정·복제·비활성화/삭제, 이름·설명·시스템 프롬프트·사용자 설정 전체. 기존 동적 파라미터 필드를 재사용한다. 이름/본문/값의 길이·범위와 최대 개수는 API 설계 단계에서 명시한다.
- 일반 사용자: 입력창 모델 선택 옆 “템플릿” 버튼 → 목록/설정 미리보기 → 적용. 추가 생성 호출은 하지 않는다. 모바일에서도 버튼 접근성을 유지한다.
- “전체 설정”은 A의 생성·대화 설정을 모두 표현할 수 있게 하되 대화 제목/ID/메시지·첨부·즐겨찾기·테마·비밀값·관리자 전역 설정은 템플릿에서 제외하는 안이다. 모델은 선택적으로 지정하고 미지정이면 현재 모델 유지.
- 값에는 유지 / 명시값 / 기본값 복원을 구별할 표현이 필요하다. 현재 대화 적용·후속 자유 수정은 확정됐지만 미지정 필드의 병합과 최종 JSON schema는 R3-D에서 API_SPEC에 정의한다. 숫자 0·false를 미지정으로 취급하지 않는다.
- 적용 전에 모델 권한·가용성·파라미터 호환성을 검증하고 제외/변경 항목을 미리 보여준다. 허용되지 않은 모델을 템플릿으로 우회 선택할 수 없다. 호환되지 않는 설정을 조용히 버리지 않는다.
- 적용값은 현재 대화에 snapshot으로 저장한다. 관리자 수정·삭제가 이미 적용한 대화나 실행 중 job의 값을 소급 변경하지 않는 안이다. 템플릿명/버전 provenance는 값과 구분한다.
- 저장은 기존 settingsRevision 충돌 처리와 원자적 적용을 사용한다. 일부 값만 반영되는 상태를 만들지 않는다. 미저장 설정 draft가 있으면 기존 미적용 변경 처리와 통합한다. 생성 중에는 적용을 비활성화한다.
- 관리 API는 관리자만, 읽기/적용은 허용된 주체만 사용한다. 기존 session/CSRF/소유권을 유지한다. 감사 로그에는 ID·행위·변경 항목을 기록하고 프롬프트 전문을 새로 남기지 않는다.
- DB migration은 추가형으로 설계하고 기존 대화/설정/키를 보존한다. 상세 테이블/endpoint는 미확정이며 지금 존재한다고 문서화하지 않는다.

#### Q2 모델 권한 예외 확정

2026-11-05 사용자가 선택적 권장 모델과 권한 예외 처리에 동의했다. 동작 표·예시·오류/인수 기준은 [CHAT_STATE_SPEC.md](./CHAT_STATE_SPEC.md)의 R3-TEMPLATE-MODEL로 이관했다. 이 문서에서 정책을 중복 정의하지 않는다. API/DB 세부 설계 및 구현·검증은 미완료다.

### C. 복사·재생성·메시지 박스 권장 세부 동작

- 복사: 기존 ChatIcon 체계 재사용, hover 배경/툴팁, keyboard focus, 눌림 상태, 성공 시 체크 아이콘 약 1.5초 후 복귀. 성공은 Clipboard 완료 이후에만 표시한다. 실패 알림·접근 가능한 이름·상태 안내·터치 영역을 제공한다. 여러 메시지의 상태는 서로 섞이지 않게 하고 현재 보이는 답변 본문을 복사한다.
- 재생성: 같은 사용자 질문에 연결된 답변들을 한 표시 위치에 묶고 선택된 답변 하나를 표시한다. 시작/대기/streaming/완료/실패/중지 모두 같은 박스 안에서 처리한다. 기존 답변은 이전/다음 탐색으로 보존하고 새 답변 생성 중 탐색 제한은 기존 안전 규칙을 유지한다.
- 서버 시작이 거절되면 원래 답변을 유지한다. 시작 성공 뒤 실패·중지하면 부분 답변과 상태를 같은 박스에서 표시하고 이전 답변으로 돌아갈 수 있게 한다. 자동 재호출은 하지 않는다.
- parent/branch/job ID 기준으로 연결하고 목록 index나 “마지막 AI”만으로 묶지 않는다. 새로고침·재구독·pagination·대화 전환 후에도 동일한 답변 그룹이 복원되어야 한다. DB 메시지 이력 및 활성 branch 문맥 계약을 훼손하지 않는다.
- 사용자 박스는 오른쪽, AI 박스는 왼쪽. 본문은 읽기 좋은 좌측 정렬, 역할 라벨/모델·상태·첨부·도구 배치는 유지한다. 매트 테마의 배경·테두리로 구별하고 색상만으로 역할을 전달하지 않는다. 긴 코드/표는 박스 안에서 가로 스크롤하고 모바일에서 페이지 전체가 넘치지 않게 한다.

## 4. 오류·예외와 보존 조건

기존 사용자·대화·답변 branch·첨부·Provider/관리자 설정·인증·quota·SSE 지속 생성·요약/제목 예산을 보존한다. 이번 요청은 운영 초기화·배포·유료 호출 지시가 아니다. 템플릿은 새 기능이므로 UI 정리라는 이름으로 API/DB 계약을 생략하지 않는다. 미정인 계약을 code_light에 추측 구현하도록 맡기지 않는다.

## 5. 검증·인수 기준

| 항목 | 완료 근거 |
| --- | --- |
| 설정 | A 전수표에 값 보존/정상 제한/미지원 이유가 모두 있고 mock wire body와 서버 적용 검사 통과. 저장/복원/일반 생성/재생성/revision 경합 포함 |
| 복사 | hover/focus/pressed/success/failure, Clipboard 내용, 연속 클릭·다른 메시지 복사·터치/키보드 확인 |
| 템플릿 | 관리자 CRUD·일반 사용자 권한 거부·가용 모델/호환성·원자적 적용·충돌·삭제 후 기존 대화 보존·확정된 게스트 정책 확인 |
| 재생성 | 같은 질문의 AI 박스가 생성 전후 1개, 버전 탐색 가능, failure/cancel/reconnect/pagination에서 이력 및 다른 질문 보존 |
| 박스 | light/dark, 360/768/1024/1440px, 긴 본문/코드/표/첨부와 기존 scroll 동작 확인 |
| 종합 | 관련 단위·통합·브라우저 시험, typecheck/build 및 변경 범위 lint. 실제 Provider/운영 미검증을 fixture 통과와 구분 |

구현 검증은 TEST_PLAN에 실제 명령·exit code·증거·미검증을 기록한다. 이번 문서 준비 검증과 향후 기능 인수는 별개다.

## 6. 사용자 답변과 남은 결정 (2026-11-05)

| ID | 현재 결정 상태 | 기준·남은 사항 |
| --- | --- | --- |
| Q1 | 확정: 미설정 시 기본 유지, 직접 설정 시 설정값 적용 | AI_INTEGRATION_SPEC.md R3-OUTPUT. 한도 초과/불명 세부 오류 계약은 B에서 확정 |
| Q2 | 확정: 선택적 권장 모델 + 사용자 선택에 따른 대체 모델 적용·미지원 설정 확인 | CHAT_STATE_SPEC.md R3-TEMPLATE-MODEL |
| Q3 | 확정: 현재 대화 설정에 적용, 이후 자유 수정 | CHAT_STATE_SPEC.md R3-TEMPLATE-APPLY. 미지정 필드 유지/기본값 복원은 세부 설계안으로 구분 |
| Q4 | 확정: 게스트 사용 허용 | GUEST_ACCESS_SPEC.md R3-GUEST-TEMPLATE |

Q1~Q4 사용자 결정은 모두 반영했으며 다시 질문하지 않는다. API/DB·미지정 필드 병합·기본값 복원·오류 코드 등 기술 계약은 R3-B/D에서 구체화한다. 기존 동작 재현·전수 감사·UI 계획 구체화는 독립적으로 가능하다. 사용자 답변은 문서화 단계의 설계 보강으로 반영했으며 제품 코드·운영 변경은 수행하지 않았다.

## 7. R3-B 설정 전수 경로 감사 (2026-11-05)

모든 값은 Web saveSettings PATCH→parseUpdate→ChatsRepository.update의 generation_parameters 또는 개별 column→GET mapConversation→detail 복원 경로를 확인했다. 생성/재생성은 같은 저장된 generationParameters와 settingsRevision을 보낸다. 서버는 job 시작의 parameters snapshot과 ChatTurnRecord의 대화 설정을 사용한다. 아래는 정적 경로와 mock 검증이며 실제 운영 Provider 인증 검증은 아니다.

| 설정 | 실행 적용 위치/전송 | 결과·경계 |
| --- | --- | --- |
| maxOutputTokens | contextBudget→job snapshot→max_tokens/max_completion_tokens/Gemini generationConfig | 고정8192 clamp 결함 수정. 미설정 fallback 보존, 명시 초과는 거부 |
| temperature/topP | protocol의 temperature/top_p 또는 topP | 0 보존, 추론/thinking 비호환은 정규화 및 명시 저장 거부 |
| frequencyPenalty/presencePenalty/seed | OpenAI snake_case/Gemini camelCase | 0 보존, 필드별 profile 제한 |
| topK | Anthropic top_k/Gemini topK/NovelAI top_k | 중계 OpenAI protocol 미전송 필드는 disabled 처리 보완 |
| stopSequences | stop/stop_sequences/stopSequences | 빈 배열은 stop 없음, 문자열 배열 검증 |
| reasoningEffort/verbosity | reasoning_effort/verbosity | 선택값 검증·모델 profile 제한 |
| thinkingBudget/thinkingDisplay | Anthropic thinking, Gemini thinkingConfig, NovelAI enable_thinking | protocol별 지원을 표시. NovelAI budget은 토큰 수가 아니라 thinking on/off 의미임을 UI에 명시 |
| thinkingLevel/outputEffort | Gemini thinkingConfig/Anthropic output_config | 중계 미전송 필드 disabled 보완 |
| systemPrompt | ChatTurnRecord→runtimeSystemPrompt→system 메시지 | 저장값+기존 현재 시각 주입 보존 |
| defaultProviderModelId | 모델 선택 PATCH 및 job providerModelId | 소유권/모델 권한/revision, 모델 변경 시 비호환 설정 제거 안내 |
| contextTokenLimit/historyMessageLimit | ChatTurnRecord 문맥·입력 예산/메시지 선택 | upstream 옵션 아님, 초과 시 요약 또는 context 오류 |
| responseTimeoutSeconds | idleTimeoutMs | 서버 적용, upstream body에 넣지 않음 |
| webSearchEnabled | supportsWebSearch/protocol 검사→tools 또는 web_search | 미지원 모델은 오류, false 보존 |
| requestTraceLimit | PATCH applyConversationLimit 및 job trace 생성 | 서버 메모리 보관 정책, upstream 옵션 아님 |
| title/isPinned | 별도 대화 metadata PATCH | 생성 parameter 아님, 제목 수동 우선 정책 보존 |

미적용 draft는 전송하지 않고 적용된 설정만 사용한다. API 저장·GET 복원·revision/모델 교체는 기존 controller/DB 시험과 최종 통합 인수로 검사한다. 표의 정적 확인만으로 모든 실제 Provider 지원을 보장하지 않는다.
