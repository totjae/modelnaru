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

| 영역                 | 상태      | 비고                                                                            |
| -------------------- | --------- | ------------------------------------------------------------------------------- |
| 상위 요구사항        | 명세 완료 | 전체 요구·provider·log·기술·배포·config 문서 존재                               |
| 개발 문서 관리 지침  | 명세 완료 | root `AGENTS.md`, 문서 색인·갱신 기준·신규 문서 등록 형식                       |
| 프로젝트 골격        | 구현 완료 | pnpm monorepo, Next.js Web, NestJS API, 단일 gateway 구성                       |
| 시작 config loader   | 구현 완료 | YAML schema·경로·secret·권한 검증과 단위시험 완료                               |
| `apichat-admin` 도구 | 구현 완료 | init·Argon2id·TOTP·validate·show·render-env 구현                                |
| 데이터베이스         | 구현 완료 | users·sessions schema, checksum migration, Ubuntu 최초 적용과 DB readiness 확인 |
| 인증·session         | 구현 완료 | 고정 관리자 TOTP·서버 session·CSRF·로그아웃, Ubuntu HTTPS 검증 필요             |
| 사용자 관리          | 계획      | 관리자 전용                                                                     |
| provider registry    | 계획      | 전체 catalog snapshot과 검증 등급                                               |
| AI streaming         | 계획      | 공통 ChatEvent와 취소                                                           |
| 대화·branch·요약     | 계획      | 상태 전이 상세 문서 필요                                                        |
| 파일 처리            | 계획      | 텍스트·PDF·이미지, OCR은 보류                                                   |
| 관리자 log           | 계획      | 감사·보안·AI·파일·시스템                                                        |
| Ubuntu 배포          | 검증 완료 | Ubuntu Compose·외부 Nginx·HTTPS·gateway·health 실통신 확인                      |
| 외부 backup          | 보류      | 초기에는 구성하지 않음                                                          |

이 문서는 [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)의 절차에 따라 각 개발 작업에서 갱신한다.
