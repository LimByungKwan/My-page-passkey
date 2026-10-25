# 과제 8 검증표

확인일: 2026-10-25. 화면·요청 검사는 사용자가 실제 패스키로 수행했고, 설명서·코드 검사는 AI가 정리했다. “완료”는 아래 기록이 있는 경우다. 제출 문서와 증거를 GitHub에 업로드하고 나서 링크가 열리는지 마지막으로 확인한다.

| 기준 | 결과 | 기록·소스 위치 |
| --- | --- | --- |
| T08-C01 | 완료 | README 첫머리 HTTPS 결과물 URL 1개 |
| T08-C02 | 완료 | README 첫머리 HTTPS 소스 URL 1개 |
| T08-C03 | 공개 접근 확인 | 시크릿 소개 확인, 쿠키 없는 두 URL HTTP 200 및 공개 저장소 다운로드. public-verification.json |
| T08-C10 | 완료 | 로그인 없는 공개 소개 첫 화면 |
| T08-C11 | 완료 | 과제 1 소개 내용 82개 블록 보존 검사, index.html |
| T08-C12 | 완료 | 비공개 자료는 가상 내용. 개인정보·실제 비밀값 미포함 설명 및 소스 패턴 검사 |
| T08-C13 | 완료 | public-private-boundary.png |
| T08-C14 | 완료 | A·B 각각 자료 3개, accounts-counts-after.png |
| T08-C15 | 완료 | logged-out-private.png |
| T08-C16 | 완료 | 비로그인 GET /api/private 거절 |
| T08-C17 | 완료 | unauthenticated-401.png |
| T08-C18 | 완료 | 사용자 페이지 소스와 쿠키 없는 두 HTML 검사. public-verification.json |
| T08-C19 | 완료 | api/register-options.js, auth_challenges 저장 |
| T08-C20 | 완료 | registration-challenges.png |
| T08-C21 | 완료 | stored-public-key.png |
| T08-C22 | 완료 | README ③의 전체 공개키 문자열과 설명, SQL 저장 화면 |
| T08-C23 | 완료 | registration.json의 실제 등록 요청 본문 |
| T08-C24 | 완료 | 이름이 있는 두 키 목록 |
| T08-C25 | 계정·공개키 취소 검증 완료 | 취소 후 두 표 0개. 임시 질문 즉시 정리는 최종 보완이며 게시 스크립트가 실배포에서 추가 확인 |
| T08-C26 | 완료 | Google 저장소 화면, Windows Hello 추가 등록 과정, README ③ |
| T08-C27 | 완료 | api/login-options.js |
| T08-C28 | 완료 | login-challenges.png |
| T08-C29 | 완료 | api/login-verify.js, verifyAuthenticationResponse |
| T08-C30 | 완료 | invalid-signature-401.png와 valid-signature-200.png |
| T08-C31 | 완료 | replay-400.png의 원본 요청 재전송·실제 거절 |
| T08-C32 | 완료 | README ①·③ 서버 세션 설명 |
| T08-C33 | 완료 | logout.json의 같은 세션 원문 재요청 401 |
| T08-C34 | 완료 | 세션은 [가림: 같은 세션 A]로 기록. 실제 쿠키 미출력 |
| T08-C35 | 완료 | 제출 사이트 HTML에 password 입력 필드 없음 |
| T08-C36 | 완료 | 두 계정의 패스키·자료 SQL 결과와 계정별 가상 본문 |
| T08-C37 | 완료 | a-to-b-403.png, account-isolation.json |
| T08-C38 | 완료 | b-to-a-403.png, account-isolation.json |
| T08-C39 | 완료 | accounts-counts-before.png와 accounts-counts-after.png, 둘 다 A=3·B=3 |
| T08-C40 | 완료 | account-isolation.json의 account_id=B 요청 → A 자료 3개 |
| T08-C41 | 완료 | README ③: api/private.js의 세션 계정 결정·403·조회 필터 위치 |
| T08-C42 | 완료 | two-passkeys.png와 최종 registration.json의 같은 A 계정 두 키 |
| T08-C43 | 완료 | 이름·등록일 목록, two-passkeys.png |
| T08-C44 | 완료 | 삭제 200 뒤 남은 Google 키로 재로그인, remaining-passkey-login.png |
| T08-C45 | 완료 | deleted-passkey-401.png |
| T08-C46 | 완료 | 마지막 삭제 409, 모든 키 분실 시 복구 없음 화면·README |
| T08-C47 | 완료 | README의 ①~⑥ 구분 |
| T08-C48 | 완료 | 라이브러리·SimpleWebAuthn 이름 명시 |
| T08-C49 | 완료 | README ③ 네 흐름·경로 표 및 database.sql |
| T08-C50 | 완료 | README ④ 필수 네 가지 성공·거절 비교 |
| T08-C51 | 완료 | README ⑥의 복구·요청 제한·기존 세션 폐기 한계 |
| T08-C52 | 완료 | README의 짧은 확인 방법 4줄 |
| T08-C53 | 완료 | README ⑤ AI와 내 판단 3줄 |

## 제출 직전

- [ ] Publish-Task08.ps1로 검토 파일을 한 번 커밋·푸시한다.
- [ ] 새 시크릿 창에서 결과물 URL과 소스 URL을 열어 등록·로그인·CAPTCHA 없이 확인한다.
- [ ] README의 증거 링크와 database.sql이 열리는지 확인한다.
- [ ] Vercel 반영 후 게시 스크립트의 최종 검사 passed=true를 확인한다.
