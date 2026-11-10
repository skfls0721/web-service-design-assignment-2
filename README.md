# 과제 2: 신청 승인 서비스

웹서비스설계 한국어 분반 개인 과제입니다. Node.js 24, Express, SQLite로 행사 신청·승인·승인 취소·FIFO 자동 승급과 변경 이력을 구현했습니다.

- GitHub: https://github.com/skfls0721/web-service-design-assignment-2
- 제출 마감: 2026년 11월 25일 23:59 (한국 시간)
- 상태: 필수 업무 규칙과 API 구현 완료
- 보고서: [`docs/report.pdf`](docs/report.pdf)
- 화면·테스트 증거: [`docs/evidence/`](docs/evidence/)

## 실행 방법

Node.js 24.x와 npm이 필요합니다. Node.js 20은 지원하지 않습니다.

```sh
node --version
npm ci
npm test
npm run test:assignment
npm start
```

브라우저에서 http://127.0.0.1:3000 을 엽니다. 서버는 Ctrl+C로 종료합니다. DB 초기화는 서버를 종료한 뒤 실행하고 `RESET`을 입력합니다.

```sh
npm run db:reset
```

첫 실행 때 SQLite DB와 로컬 JWT 비밀 키가 자동 생성됩니다. 생성 파일은 Git에 포함하지 않습니다.

## 연습 계정

공통 비밀번호는 `Classroom123!`입니다. 가상 계정이며 실제 이용자 계정이 아닙니다.

| 로그인 | 이름 | 역할 및 담당 행사 |
|---|---|---|
| alice | 민지 | 학생 |
| bob | 준호 | 학생 |
| charlie | 서연 | 학생 |
| manager1 | 운영자 A | 행사 1, 정원 2명 |
| manager2 | 운영자 B | 행사 2, 정원 1명 |

## 구현 내용

`src/application-service.js`에 업무 규칙과 트랜잭션 처리를 구현했습니다.

- `apply`: 학생 신원·중복 신청을 검사하고 PENDING 및 APPLY 이력을 저장합니다.
- `cancel`: 본인의 PENDING 신청만 취소하고 CANCELLED 및 CANCEL 이력을 저장합니다.
- `approve`: 담당 운영자의 요청과 최신 상태·정원을 검사하고 APPROVED 및 APPROVE 이력을 저장합니다.
- `revoke`: 담당 운영자가 승인된 신청을 사유와 함께 취소하고, 같은 행사의 FIFO 대기자 한 명을 자동 승급합니다. REVOKE와 AUTO_APPROVE 이력의 원인 ID를 연결합니다.
- 모든 상태 변경과 이력 저장은 같은 SQLite 트랜잭션(`BEGIN IMMEDIATE` ... `COMMIT`)에서 처리합니다. 저장 오류가 나면 `ROLLBACK`으로 전체 변경을 되돌립니다.

대기자 순서는 같은 행사의 PENDING 신청에서 `created_at ASC, id ASC`로 고정합니다. 직접 승인에는 FIFO를 적용하지 않습니다. 상태 전이도는 [Mermaid Live Editor](https://mermaid.live/edit#pako:eNp9kU1LAkEYx7_K8BxjFV1b1t1DILqGJCoeOtR2WNxJBXdXxt2wREiioPRQB-lNw1tRHaKE1q_kTt-hfVODojnN85_5_Z556UDFUDGI0DIVE2fqSpUoWuSAlXXkjt21PRSJbKCSVMjkCptBGBb-QjpVSEv5vJQR0dfwlp6MkfNh07GNnMHx3H5D9POJng1-c6lSqVzc9jCnP3X6M0TvpvSmRx8uEX3s0ckVohcz18MgOhnSeze9fqWjyX-iAAg7ItofoWwuW0T0_SU8jCePO8-n3s65fR64FrwvK0vbxa2_D_VTHpDLq_uo-1JBHDpWITBQJXUVRJNYmAENE03xSuh4gAxmDWtYBtGdEqxa7UjFaBhEBlnvumhT0XcMQ1vQxLCqNRD3lUbLraymuvq0ZUqwrmKSNizdBJFlfQeIHWiDmIhFY-scy7MJXhA4NiZwDBy6m-JCNCHwSSGejPMcLyS6DBz5XWPRJM91vwEIJs4k)에서 만들었습니다. 원본은 [`docs/state-transition.mmd`](docs/state-transition.mmd), 렌더링 이미지는 [`docs/state-transition-mermaid.png`](docs/state-transition-mermaid.png)에 있습니다. 트랜잭션과 승인 취소 시퀀스 다이어그램은 보고서에 설명했습니다.

## 검증 결과

- `npm test`: 제공 기반 테스트 4/4 통과
- `npm run test:assignment`: 필수 시나리오 T01~T32 모두 통과
- `npm run test:advanced`: 선택 심화 동시 승인 테스트는 미실행
- 화면 검증 U01~U05의 캡처는 `docs/evidence/`에 포함했습니다. U05는 대기자 없는 승인 취소 후 `REVOKED`, 승인 0/2, `promoted: null`과 AUTO_APPROVE 이력이 없음을 캡처했습니다.
- 이력 저장 실패 주입 결과 T28~T30은 전체 롤백을 확인합니다. 테스트 로그의 `TEST_INJECTED_FAILURE`는 실패 주입 검증 중 의도적으로 출력됩니다.

세부 실행 결과는 [`docs/evidence/test-base.txt`](docs/evidence/test-base.txt)와 [`docs/evidence/test-assignment.txt`](docs/evidence/test-assignment.txt)에 있습니다. 화면 검증은 [`docs/report.pdf`](docs/report.pdf)에 화면과 흐름별 설명을 함께 수록했습니다.

## 파일 안내

- `src/application-service.js`: 신청·취소·승인·승인 취소·자동 승급 및 트랜잭션
- `src/repository.js`, `src/db.js`: SQLite 조회·저장 도구와 스키마
- `src/app.js`, `src/auth.js`, `src/server.js`: API·인증·서버
- `public/`: 제공된 기본 화면
- `tests/`: 기반 테스트, 필수 테스트, 선택 심화 테스트
- `docs/API.md`: API 계약과 오류 규칙
- `docs/report.pdf`: 설계·구현·검증 보고서
- `docs/state-transition.mmd`, `docs/state-transition-mermaid.png`: Mermaid 상태 전이도 원본과 이미지
- `docs/evidence/`: 자동 테스트 출력과 U01~U05 화면 캡처

## AI 활용 및 출처

Anthropic Claude를 사용했습니다.

- AI가 한 일: `src/application-service.js`의 `apply`, `cancel`, `approve`, `revoke` 구현 초안 작성(트랜잭션 구조, FIFO 대기자 선택 SQL 포함), 테스트 결과 해석, 화면 검증 절차 안내, README와 보고서 작성 보조
- 본인이 한 일: 제공 코드·DB 스키마·API 문서를 확인해 Claude에 제공, 구현 적용, `npm test`와 `npm run test:assignment` 실행으로 T01~T32 통과 확인, U01~U05 화면 검증을 직접 수행하고 캡처, 증거가 부족한 부분 재촬영, 서버 재시작 후 데이터 유지 확인, 저장소와 보고서 제출 정리
- 참고 자료: 과제 안내문, `docs/API.md`, [Node.js 24 SQLite 문서](https://nodejs.org/docs/latest-v24.x/api/sqlite.html), [Express 5 문서](https://expressjs.com/en/5x/api/)

## 제출 전

최종 제출 커밋 SHA를 LMS 온라인 작성란에 기록하고, `docs/report.pdf`와 같은 버전을 LMS 파일 제출란에도 첨부합니다. 저장소는 공개로 설정되어 있습니다. `node_modules`, 생성 DB·JWT 키, 실제 `.env`, 개인 정보는 저장소에 포함하지 않습니다.
