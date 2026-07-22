# 구현 진행 현황

## 상태 정의

- `계획`: 명세만 존재
- `명세 완료`: 상위 요구와 정책 문서가 확정되었으나 코드는 아직 없음
- `구현 중`: 코드 작성과 검증 진행 중
- `문서화 필요`: 코드는 있으나 상세 문서가 최신이 아님
- `구현 완료`: 코드와 문서가 일치하고 기본 시험 통과
- `검증 완료`: 인수·통합·보안 시험까지 통과
- `보류`: 후속 단계로 연기

## 현재 상태

| 영역                 | 상태      | 비고                                                                                 |
| -------------------- | --------- | ------------------------------------------------------------------------------------ |
| 상위 요구사항        | 명세 완료 | 전체 요구·provider·log·기술·배포·config 문서 존재                                    |
| 개발 문서 관리 지침  | 명세 완료 | root `AGENTS.md`, 문서 색인·갱신 기준·신규 문서 등록 형식                            |
| 프로젝트 골격        | 구현 완료 | pnpm monorepo, Next.js Web, NestJS API, 단일 gateway 구성                            |
| 시작 config loader   | 구현 완료 | YAML schema·경로·secret·권한 검증과 단위시험 완료                                    |
| `apichat-admin` 도구 | 구현 완료 | init·Argon2id·TOTP·validate·show·render-env 구현                                     |
| 데이터베이스         | 구현 중   | 1~3차 Ubuntu 확인, 4차 권한·게스트와 5차 채팅 migration 로컬 검증                    |
| 인증·session         | 구현 완료 | 관리자 TOTP·일반 사용자 login·공통 session·CSRF, Ubuntu 사용자 최대 3 session 확인   |
| 사용자 관리          | 검증 완료 | 관리자 CRUD·비밀번호·session 폐기·감사 기록·Web UI Ubuntu 검증 완료                  |
| provider registry    | 구현 완료 | 핵심 4개 우선·나머지 알파벳순 catalog, 암호화·동기화 UI와 실제 key 확인              |
| Web UI 기반          | 구현 중   | 반응형 3열 채팅·설정·모델 복원·스트리밍·중지·재생성 분기 UI 구현, 시각 E2E 대기      |
| 모델 권한·호출 제한  | 구현 완료 | 사용자·게스트 allowlist·일일 제한 관리자 UI와 DB 원자적 예약 구현, AI 호출 연결 대기 |
| 게스트 체험          | 구현 중   | 공유 코드·독립 session·권한·할당량·대화 소유권 구현, 만료 파일 정리는 후속           |
| AI streaming         | 구현 중   | OpenAI 호환·Anthropic·Gemini SSE 공통 event와 upstream 취소 구현, 실제 key 검증 대기 |
| 대화·branch·요약     | 구현 중   | 대화 CRUD·상태·모델 변경·재생성 분기 구현, 자동 요약은 후속                          |
| 파일 처리            | 계획      | 텍스트·PDF·이미지, OCR은 보류                                                        |
| 관리자 log           | 구현 중   | 사용자 관리 audit_logs 원장 구현, 조회·retention과 다른 category는 계획              |
| Ubuntu 배포          | 검증 완료 | Ubuntu Compose·외부 Nginx·HTTPS·gateway·health 실통신 확인                           |
| 외부 backup          | 보류      | 초기에는 구성하지 않음                                                               |

이 문서는 [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)의 절차에 따라 각 개발 작업에서 갱신한다.
