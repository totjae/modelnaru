# 명세 확정 현황

구현 기술의 권장안과 영역별 대체 기술은 [TECH_STACK_OPTIONS.md](./TECH_STACK_OPTIONS.md)를 참고한다.

전체 문서의 누락·불일치와 구현 준비도 점검 결과는 [SPEC_AUDIT.md](./SPEC_AUDIT.md)를 참고한다.

1차 운영 환경은 [DEPLOYMENT_PROFILE.md](./DEPLOYMENT_PROFILE.md)를 기준으로 한다.

서버 시작 설정은 [SERVER_CONFIG_SPEC.md](./SERVER_CONFIG_SPEC.md)를 기준으로 한다.

개발 중 상세 문서의 지속 작성·갱신은 [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)를 의무 기준으로 삼고, 진행 상태는 [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)에서 관리한다.

## 1. 현재 판단

현재 문서는 기능 설계와 서버 구조를 시작하기에는 충분하다. 그러나 운영 환경까지 포함한 최종 구현 명세가 모두 확정된 상태는 아니다. 아래 미확정 항목 중 필수 항목을 결정한 뒤 API·DB 상세 설계를 작성해야 실제 구현 중 재작업을 줄일 수 있다.

## 2. 확정된 영역

- 고정 관리자와 관리자 생성 사용자
- 회원가입 없음
- 사용자별 계정·대화·파일·컨텍스트 격리
- 세션 최대 3개, 24시간 idle·7일 absolute 만료
- 제공자 template 기반 AI 등록
- 참고 파일의 전체 provider template catalog를 1차 내장 snapshot으로 포함
- 제공자 선택과 API 키 입력을 이용한 간편 등록
- LLM Gateway, OpenAI, Anthropic, Google AI Studio 우선 지원
- 제공자별 모델 조회·요청 형식·고급 설정
- 사용자별 모델 권한
- system prompt, 컨텍스트 범위와 100,000토큰 기본 목표
- 초과 컨텍스트 요약
- 모델 변경과 답변 재생성 분기
- 텍스트·PDF·이미지 첨부와 파일 제한
- 원본·추출 데이터 저장과 30일 기본 보관
- Linux·Docker Compose 운영 방향
- 인터넷 공개 개인용 서비스, 예상 사용자 1~3명
- Intel N100·16GB RAM·SSD 여유 약 220GB·Ubuntu 24.04.4 LTS 미니 PC 단일 서버
- 전체 AI 생성 3개·PDF/OCR worker 1개 권장 동시성
- 인터넷 공개 환경의 고정 관리자 TOTP MFA와 offline 복구 code
- 기본 `127.0.0.1:32432`, 시작 config에서 port 변경 가능
- 기존 Nginx가 외부 80·443과 HTTPS를 처리
- domain·port forwarding 기존 구성 사용
- 초기 외부 backup 미구성 및 데이터 유실 위험 수용
- 서버 구동 파일 폴더의 `config.yaml`과 동봉된 `apichat-admin` 계정 설정 도구
- 개발 작업마다 코드·시험과 관련 상세 문서를 함께 갱신하는 완료 기준
- 관리자 로그 조회·검색·필터·내보내기
- 로그 마스킹과 보관 기간

## 3. 구현 착수 전 필수 결정

### P0

1. 실제 domain을 시작 config의 `publicBaseUrl`·`allowedHosts`에 입력
2. 서버 구동 파일을 둘 실제 배포 root 경로(`/opt/apichat` 권장)
3. Vertex AI, Bedrock, Copilot 전용 adapter의 MVP 포함 여부
4. 대화·첨부파일의 외부 AI 제공자 전송 고지 방식
5. 사용자·관리자 주요 화면 와이어프레임

## 4. 백엔드 상세 설계 단계에서 확정

### P1

- REST API 전체 요청·응답 JSON과 오류 코드
- API pagination, idempotency key, optimistic locking과 공통 오류 envelope
- 데이터베이스 테이블, FK, index, cascade와 migration
- 대화 분기·활성 분기 전환의 정확한 API
- 컨텍스트 토큰 계산기와 모델별 tokenizer 선택
- 요약 prompt의 변수와 결과 JSON 형식
- 백그라운드 작업 queue 사용 여부
- 파일 저장소의 객체 키와 정리 작업 방식
- provider template version·checksum·승인 절차
- 비용 계산식과 환율·가격표 갱신 방식
- 로그 내보내기 최대 기간과 건수
- 관리자 설정 변경의 동시성·충돌 처리
- 메시지 생성·취소·부분실패·재생성 상태 전이와 중복 과금 방지
- 이미지 최대 해상도·decoded pixel 한도와 악성 파일 검사 정책
- provider 비활성화·삭제 시 기존 메시지·권한·로그 보존 정책
- 비밀번호 정책, 로그인 실패 제한과 session 강제 종료 UI

## 5. 운영 배포 전 확정

### P2

- CI/CD와 배포·rollback 절차
- 모니터링 수집기와 외부 장애 알림 채널
- 데이터베이스·파일 복구 훈련 절차
- 보안 업데이트와 secret rotation 주기
- 개인정보 처리 및 이용 안내 문구
- 모바일·접근성 지원 수준
- 스캔 PDF OCR 도입 여부
- 사용자별 비용·사용량 제한
- 관리자 대화 본문 열람 기능
- MCP·batch·router·hook 등 확장 기능

## 6. 구현 가능 상태 기준

P0 항목이 확정되고 API·DB 상세 명세가 작성되면 전체 MVP 구현을 시작할 수 있다. P0 결정 전에도 UI prototype, provider engine, parser와 파일 추출 모듈은 독립적으로 개발할 수 있다.
