# ModelNaru

ModelNaru(모델나루)는 여러 LLM 제공자를 한곳에서 등록하고, 관리자가 생성한 사용자에게 모델별 사용 권한을 부여할 수 있는 셀프호스팅 AI 채팅 웹 서비스입니다.

## 주요 목표

- 공개 회원가입 없이 고정 관리자와 관리자 생성 사용자 운영
- 사용자별 계정·대화·첨부파일·컨텍스트 격리
- LLM Gateway, OpenAI, Anthropic, Google AI Studio와 provider template 지원
- 제공자 선택과 API key 입력을 이용한 간편 등록
- 사용자별 provider·model 권한과 parameter 범위 관리
- streaming 답변, 생성 중단, 모델 변경과 답변 재생성 branch
- TXT·Markdown·JSON·PDF·JPEG·PNG·WebP 첨부
- 사용자 system prompt, context 범위와 초과 context 요약
- AI 요청·인증·감사·파일·시스템 log 관리자 조회

이미지 입력은 지원하지만 이미지 생성 기능은 범위에 포함하지 않습니다.

## 예정 기술 구성

- Web: Next.js, TypeScript
- API: NestJS
- Database: PostgreSQL, postgres.js, versioned SQL migration
- Queue: BullMQ, Valkey
- Deployment: Docker Compose
- Reverse proxy: 기존 Nginx
- AI integration: 자체 Provider Registry 및 Adapter

## 1차 운영 환경

- Ubuntu 24.04.4 LTS
- Intel N100, RAM 16GB
- 예상 사용자 1~3명
- 애플리케이션 기본 주소 `127.0.0.1:32432`
- 기존 Nginx가 외부 80·443과 HTTPS 처리
- 외부 backup은 초기 범위에서 제외

서버 port와 고정 관리자 계정은 배포 폴더의 `config.yaml`에서 시작 시 불러옵니다. 실제 비밀번호는 평문이 아닌 Argon2id hash로 저장하며, 동봉할 `apichat-admin` 도구가 hash와 TOTP 설정을 생성하도록 설계되어 있습니다.

## 현재 상태

프로젝트 기반, 역할별 인증·사용자 관리, Provider 등록·모델 권한, 대화 저장·분기·자동 요약, 사용량 집계와 텍스트·PDF·이미지 첨부 처리가 구현되었습니다. 텍스트 레이어가 있는 PDF는 기본 100페이지까지 본문을 추출하며 JPEG·PNG·WebP는 이미지 입력이 허용된 OpenAI·Anthropic·Gemini 계열 모델에 직접 전달합니다. 첨부파일 보관 기간·만료 원본·cascade 삭제·고아 파일 정리도 자동화했으며 스캔 PDF OCR은 후속 단계입니다.

진행 상태는 [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md), 개발과 문서화 절차는 [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)를 기준으로 관리합니다.

개발 에이전트가 확인할 문서 목록과 신규 상세 문서 등록 규칙은 [AGENTS.md](./AGENTS.md)에 정의되어 있습니다.

## 주요 문서

- [개발 에이전트 필수 지침](./AGENTS.md)
- [전체 요구사항](./REQUIREMENTS.md)
- [AI 연동 명세](./AI_INTEGRATION_SPEC.md)
- [Provider 등록 명세](./PROVIDER_REGISTRATION_SPEC.md)
- [게스트 체험 명세](./GUEST_ACCESS_SPEC.md)
- [Web UI 명세](./WEB_UI_SPEC.md)
- [관리자 로그 명세](./ADMIN_LOGGING_SPEC.md)
- [기술 스택과 대체안](./TECH_STACK_OPTIONS.md)
- [운영 환경 프로필](./DEPLOYMENT_PROFILE.md)
- [서버 시작 설정](./SERVER_CONFIG_SPEC.md)
- [전체 명세 점검 결과](./SPEC_AUDIT.md)
- [명세 확정 현황](./SPEC_STATUS.md)
- [API 상세 명세](./API_SPEC.md)
- [보안 상세 명세](./SECURITY_SPEC.md)
- [배포 실행서](./DEPLOYMENT_RUNBOOK.md)
- [시험 계획과 결과](./TEST_PLAN.md)
- [설계 결정 기록](./DECISIONS.md)
- [Database 상세 명세](./DATABASE_SCHEMA.md)

`provider-manager-v1.10.0.js`는 provider와 설정 구조를 분석하기 위한 참고 파일입니다. 실제 서버 구현에서는 플러그인 runtime을 그대로 사용하지 않고 서버용 adapter 구조로 재작성합니다.

## 비밀값 관리

다음 경로와 파일은 Git에 포함하지 않습니다.

- `config.yaml`
- `secrets/`
- `data/`
- `.env*`
- private key와 인증서

API key, 관리자 비밀번호, TOTP secret, database URL과 provider 암호화 master key를 source code, 문서, fixture 또는 log에 기록해서는 안 됩니다.

## 라이선스

아직 프로젝트 라이선스를 결정하지 않았습니다. 현재 저장소의 코드와 문서는 별도 허가 없이 재사용 가능한 공개 라이선스로 배포되지 않습니다.
