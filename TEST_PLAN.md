# ModelNaru 시험 계획·결과

## 1. 목적

구현 단계별 검증 범위와 실제 실행 결과를 기록한다.

## 2. 기반 단계 시험 항목

| ID              | 종류  | 대상               | 인수 조건                                   | 상태      |
| --------------- | ----- | ------------------ | ------------------------------------------- | --------- |
| FND-UNIT-001    | 단위  | config 기본값·경로 | schema parse와 상대 경로 해석이 예상과 일치 | 통과      |
| FND-UNIT-002    | 단위  | config 거부 조건   | 잘못된 port·HTTP URL·TOTP·hash를 거부       | 통과      |
| FND-UNIT-003    | 단위  | 민감값 마스킹      | CLI 표시 결과에 hash·TOTP가 없음            | 통과      |
| FND-UNIT-004    | 단위  | API health         | live와 ready response 계약 일치             | 통과      |
| FND-STATIC-001  | 정적  | 전체 workspace     | format check, lint, typecheck 통과          | 통과      |
| FND-BUILD-001   | build | Web·API·CLI        | production build 통과                       | 통과      |
| FND-COMPOSE-001 | 통합  | Compose            | Ubuntu에서 모든 container가 healthy         | 미검증    |
| FND-GATEWAY-001 | 통합  | gateway routing    | `/`은 Web, `/api/health/live`는 API 응답    | 미검증    |
| FND-SEC-001     | 보안  | port 공개          | gateway 외 host publish 없음                | 정적 통과 |

## 3. 실행 환경

- 개발 검증: Windows, Codex bundled Node.js 24.14.0, pnpm 11.9.0
- 목표 배포: Ubuntu 24.04.4 LTS, Docker Compose
- 현재 개발 host에는 Docker CLI가 없어 Compose runtime 시험은 실제 Ubuntu 환경에서 수행한다.

## 4. 실행 명령

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 5. 실제 결과

2026-07-21 개발 환경에서 다음 결과를 확인했다.

- `pnpm format:check`: 통과
- `pnpm lint`: 통과, warning 0개
- `pnpm typecheck`: 4개 workspace package 통과
- `pnpm test`: 14개 통과, Windows에서 symbolic-link 시험 1개 제외
- `pnpm build`: config·CLI·API TypeScript build와 Next.js production build 통과
- `apichat-admin show`: 예제 설정을 읽고 password hash·TOTP secret 마스킹 확인
- Compose YAML에서 host port를 가진 service가 gateway 하나뿐임을 단위시험으로 확인

Docker CLI가 없는 개발 host이므로 container health, gateway 실통신과 Linux 파일 권한은 아직 통합 검증하지 않았다.

## 6. 오류·경계 조건

- 외부 provider가 필요한 시험은 fixture 기반 contract test와 실제 credential smoke test를 구분한다.
- Docker를 실행하지 않은 정적 Compose 검토는 통합 시험 통과로 기록하지 않는다.
- Windows에서 통과한 파일 권한 시험은 Linux `0600` 검증을 대체하지 않는다.

## 7. 미결정·보류 항목

- 인증 단계에서 Playwright E2E와 session security test를 추가한다.
- provider 단계에서 실제 gateway별 contract test를 별도 문서에 기록한다.
