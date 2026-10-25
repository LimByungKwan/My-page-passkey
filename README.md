# 내 소개 페이지에 패스키 달기

- **공개 결과물 URL:** https://my-page-passkey.vercel.app/
- **소스 URL:** https://github.com/LimByungKwan/My-page-passkey
- 기존 소스 저장소: https://github.com/LimByungKwan/My-page
- 확인 날짜: 2026-10-25, 한국 시간 기준. JSON의 Z 표기는 UTC이며 한국 시간은 9시간을 더한다.

첫 화면은 로그인 없이 읽는 소개 페이지다. 공개 소개 아래의 정원 입구에서 비공개 노트로 이동한다. 심사자는 패스키나 계정을 등록할 필요 없이 공개 소개와 이 설명서·검증 기록을 확인하면 된다.

비공개 자료는 연습 사용자 A·B를 위해 만든 가상 프로젝트 메모, 가상 지원 목록, 가상 회고다. 실제 연락처·주소·신분증 번호·상담 내용은 넣지 않았다. 기존 소개에서 공개를 선택한 내용은 유지했다. 패스키 PIN, 개인키, Supabase 비밀 키, 실제 세션·쿠키 값은 제출하지 않는다.

기준별 확인 결과: [검증표](CHECKLIST.md) · [최종 검토](AUDIT.md) · [제출 양식](SUBMISSION.md)

## ① 무엇으로 붙였나

**라이브러리를 사용했다.** WebAuthn의 등록·인증 응답 검증은 **SimpleWebAuthn의 @simplewebauthn/server 14 계열**을 사용한다. 브라우저는 navigator.credentials.create와 navigator.credentials.get을 호출한다.

- 배포·서버: Vercel, Node.js 22, api 폴더의 서버 함수.
- 저장: Supabase PostgreSQL. Supabase Auth의 비밀번호 로그인은 사용하지 않는다.
- 로그인 유지: 서버 세션 방식. 무작위 세션 원문은 보호된 쿠키에, SHA-256 해시만 데이터베이스에 저장한다.
- 데이터베이스 소스: [database.sql](database.sql). 다섯 표와 원자적으로 처리하는 네 저장 함수를 담았다.

패스키 개인키는 사이트 서버로 보내지 않는다. Windows Hello와 Google 비밀번호 관리자가 관리한다. Google 저장소의 암호화된 기기 간 동기화는 사이트 서버로 개인키를 전송하는 것과 별개다.

## ② 왜 그걸 골랐나

WebAuthn의 공개키 형식·응답 검증을 직접 작성하는 대신 검증 라이브러리를 사용해 질문, 사이트 출처, RP ID, 사용자 확인, 서명을 검사하도록 했다. 기존 HTML·CSS·JavaScript 소개를 유지하면서 Vercel 서버 함수를 추가할 수 있어 페이지 전체를 다른 프레임워크로 옮기지 않았다.

질문·공개키·세션을 Supabase에 저장하므로 서버 함수가 다시 실행돼도 상태를 확인할 수 있다. 비공개 자료는 화면에서 가리는 것으로 끝내지 않고, 세션에서 계정을 확인한 서버만 반환한다.

첫 패스키만 잃어도 계정에 못 들어가는 상황에 대비해 **Google 비밀번호 관리자와 Windows Hello에 서로 다른 패스키 두 개**를 준비했다.

## ③ 어디를 어떻게 고쳤나

### 네 가지 주요 흐름

| 흐름 | 화면 → 서버 → 저장 |
| --- | --- |
| 새 계정·첫 패스키 등록 | [register.html](register.html) → POST [api/register-options.js](api/register-options.js) → POST [api/register-verify.js](api/register-verify.js) → database.sql의 finish_passkey_registration |
| 기존 패스키 로그인 | [private.html](private.html) → POST [api/login-options.js](api/login-options.js) → POST [api/login-verify.js](api/login-verify.js) → finish_passkey_login |
| 로그아웃 | private.html → POST [api/logout.js](api/logout.js) → 해당 auth_sessions 행 삭제 후 브라우저 쿠키 만료 |
| 비공개 자료 조회 | private.html → GET [api/private.js](api/private.js) → 유효한 세션의 account_id로 private_items 조회 |

같은 계정에 패스키를 추가하거나 삭제하는 흐름은 [api/passkeys.js](api/passkeys.js)에 있다. GET은 이름·등록일 목록, POST는 추가 질문, PUT은 검증·저장, DELETE는 서버 등록 해제다. 저장 함수는 finish_add_passkey와 remove_passkey다.

### 공개·비공개 경계

[index.html](index.html)의 소개 내용은 그대로 공개한다. 새 정원 입구는 비공개 노트로 연결되며 자료 본문은 포함하지 않는다. private.html에도 자료 본문은 없고 빈 items 영역만 있다. 서버 조회에 성공한 뒤 textContent로 자료를 표시한다.

[garden.css](garden.css)와 [garden.js](garden.js)는 하늘·나무·구름과 화면 모션을 담당한다. 인증 판단은 꾸밈 코드가 아니라 기존 서버에서 한다. 모바일 배치와 prefers-reduced-motion 설정을 반영했다.

### 질문과 등록 검증

- 서버가 질문을 매번 새로 만들고 auth_challenges에 저장한다.
- 질문은 5분간 유효하다. 브라우저의 기기 확인 대기 시간은 별도로 60초다.
- 질문을 요청한 브라우저의 연결용 쿠키 해시와 용도를 함께 확인한다.
- 등록 검증은 저장한 질문, HTTPS Origin, RP ID, 사용자 확인 결과를 대조한다.
- 기기 확인을 취소하면 계정·공개키는 저장하지 않는다. DELETE /api/register-options로 같은 브라우저의 미사용 등록 질문도 정리한다. 탭을 닫거나 네트워크가 끊겨 정리하지 못한 질문은 5분 후 인증에 사용할 수 없게 된다.
- 성공한 저장 함수가 used_at을 기록한다. 미사용 조건 검사와 세션 생성 등이 같은 트랜잭션에서 실행되므로 같은 질문이 두 번 성공할 수 없다.

### 공개키와 저장 위치

A 계정의 현재 패스키는 다음 두 개다. 표시 이름만으로 저장 위치를 판단하지 않고 Google 비밀번호 관리자 화면과 Windows Hello 등록 과정도 확인했다.

| 이름 | 확인한 저장 위치 | 서버 기록 |
| --- | --- | --- |
| Google 백업 패스키 | Google 비밀번호 관리자 | multiDevice, backed_up=true |
| Windows Hello 예비 패스키 | 이 PC의 Windows Hello | singleDevice, backed_up=false |

다음은 Windows Hello 예비 패스키의 COSE 공개키를 base64url로 표현한 값이다. 등록 응답에서 추출한 공개키이며 SQL 조회로 public_key 저장을 확인했다. **비밀번호나 개인키가 아니다.**

~~~text
pQECAyYgASFYINjtJsyvMh2y4kO5zPnmyOxh2TwKXt5sBEPsrFmo7--BIlggiDYWROgD9_tCb46HWwmwrgUteiQEnRQOlchpdJeFNM4
~~~

[공개키 저장 화면](evidence/stored-public-key.png) · [등록 요청·응답 원문](evidence/registration.json) · [Google 저장 위치](evidence/google-storage.png)

실제 등록 요청의 credential에는 id, rawId, type, authenticatorAttachment, clientExtensionResults, response가 있다. response에는 clientDataJSON, attestationObject, transports가 있고 개인키 필드는 없다. 공개키는 attestationObject의 인증기 데이터에 포함되며 서버가 검증 후 추출해 저장한다.

취소 질문 정리는 최종 게시 보완에 포함했다. 보조 코드 검사를 통과했으며, 일괄 게시 스크립트가 배포 후 실제 질문 1개를 발급·취소해 삭제 건수까지 확인한다. [검사 범위와 보완](AUDIT.md)

### 세션과 계정 분리

세션 쿠키는 __Host-passkey_session이며 HttpOnly, Secure, SameSite=Strict, Path=/를 적용했다. 유효기간은 12시간이다. 브라우저 코드가 쿠키 원문을 읽어 화면에 출력하지 않는다.

api/private.js의 계정 결정 위치는 sessions[0].account_id다. 요청의 accountId가 다른 계정을 가리키면 403으로 거절한다. 실제 데이터베이스 조회도 이 세션 계정으로만 필터링한다. account_id라는 임의의 주소 매개변수는 조회 계정 결정에 쓰지 않는다.

데이터베이스 표에는 RLS를 켰고 일반 anon·authenticated 역할의 권한을 회수했다. 서버 전용 비밀 키는 RLS를 우회하므로, **최종 소유자 검사는 각 서버 경로와 SQL 함수에서 한다.** 단순히 RLS만 켜서 계정 격리가 되는 구조라고 주장하지 않는다.

Vercel Production 환경변수에는 SUPABASE_URL과 SUPABASE_SECRET_KEY를 설정했다. 저장소에는 변수 이름만 있고 실제 비밀 키는 없다.

## ④ 안 열리는 것을 확인한 기록

검사는 실제 기기의 패스키로 수행했다. 아래 상태 코드는 화면에 적힌 ‘예상’ 문구가 아니라 요청·응답 본문의 실제 status와 Network 결과를 확인한 것이다. 전체 기록에서 세션 원문은 가렸다.

### 필수 네 가지 비교

| 확인 | 통과한 요청·응답 | 거절된 요청·응답 |
| --- | --- | --- |
| 로그인 없이 열기 | 로그인 세션으로 GET /api/private → 200, 자기 자료 3개 | 시크릿 창에서 같은 주소 → 401, 로그인 안내 |
| 남의 패스키로 열기 | A는 A 자료 3개, B는 B 자료 3개 조회 | B → A와 A → B의 accountId 지정 요청 모두 403 |
| 이미 쓴 질문 재사용 | 정상 서명의 POST /api/login-verify → 200, verified=true | 같은 본문 재전송 → 400, 이미 사용한 질문 안내. 서명 한 비트를 바꾼 요청은 401 |
| 패스키 삭제 뒤 로그인 | 첫 패스키를 삭제한 뒤 남은 Google 패스키로 로그인·자료 조회 성공 | 기기에 남은 삭제한 첫 패스키로 실제 로그인 응답 전송 → 401, 삭제된 패스키 안내 |

[비로그인 401](evidence/unauthenticated-401.png) · [틀린 서명 401](evidence/invalid-signature-401.png) · [정상 서명 200](evidence/valid-signature-200.png) · [재전송 400](evidence/replay-400.png) · [삭제한 키의 실제 요청·401 응답](evidence/deleted-passkey-401.png)

### 계정 간 접근과 주소 변조

- A: 5df137ad-152f-45ee-bb5e-2a0427bb682a
- B: 67d859c8-1b0a-415b-b28d-1bbf93ce2cf8

B로 로그인해 GET /api/private?accountId=5df137ad-152f-45ee-bb5e-2a0427bb682a를 요청했다. **403**과 “다른 계정의 비공개 자료는 볼 수 없습니다.”가 반환됐다.

반대로 A로 로그인해 GET /api/private?accountId=67d859c8-1b0a-415b-b28d-1bbf93ce2cf8를 요청해도 **403**으로 거절됐다.

거절 전후 SQL 조회 결과는 A=3개, B=3개로 동일했다. A로 로그인해 주소에 account_id=B를 넣어도 응답은 A의 계정 ID와 A 자료 3개였다. 새 계정의 자료에는 각각 “연습 사용자 A의…”와 “연습 사용자 B의…”가 들어 있어 구별된다.

[양방향 요청·응답과 변조 기록](evidence/account-isolation.json) · [B→A 403](evidence/b-to-a-403.png) · [A→B 403](evidence/a-to-b-403.png) · [거절 전 건수](evidence/accounts-counts-before.png) · [거절 후 건수](evidence/accounts-counts-after.png)

### 로그아웃 전 세션을 그대로 재사용

서버 검사에서 동일한 세션 원문을 보관하고 다음 순서로 요청했다. 보고서에는 같은 값을 [가림: 같은 세션 A]로 표시했다.

| 순서 | 동일한 세션으로 보낸 요청 | 실제 응답 |
| --- | --- | --- |
| 1 | GET /api/private | 200, A 자료 3개 |
| 2 | POST /api/logout | 200, 로그아웃 완료 |
| 3 | 이전 세션 값 그대로 GET /api/private | 401, 로그인 만료 |

[전체 요청·응답](evidence/logout.json). 브라우저에서 쿠키를 지운 뒤 단순 재조회한 것에 그치지 않고 서버가 이전 원문을 다시 보내 거절됨을 확인했다.

### 등록·취소·복구 대비

- 등록 질문 여러 개가 서로 다르고 성공한 요청에만 used_at이 기록됐다. [등록 질문](evidence/registration-challenges.png)
- 로그인 질문도 매번 달랐다. [로그인 질문](evidence/login-challenges.png)
- 등록 취소 안내 후 accounts=0, passkeys=0을 확인했다. [취소 화면](evidence/registration-cancel.png) · [저장되지 않은 결과](evidence/cancel-empty-database.png)
- 같은 계정에 이름·등록일이 있는 패스키 두 개를 확인했다. [두 패스키 목록](evidence/two-passkeys.png)
- 첫 키 1212의 DELETE /api/passkeys가 200으로 성공했고 remaining=1이었다. [삭제 기록](evidence/delete-passkey-200.png)
- 남은 키로 로그인한 뒤 패스키 1개를 확인했다. [남은 키로 로그인](evidence/remaining-passkey-login.png)
- 삭제한 키를 Windows Hello에서 실제 선택해 서명 응답을 보냈으나 서버는 401로 거절했다. [검사 결과](evidence/deleted-passkey-result.png) · [실제 요청·거절](evidence/deleted-passkey-401.png)
- 마지막 1개를 삭제하려는 요청은 409로 거절됐고 1개가 그대로 남았다. [마지막 키 삭제 거절](evidence/last-passkey-409.png)
- 이 검사 이후 등록 요청 원문을 남기면서 Windows Hello 예비 키를 다시 추가했다. 최종 A 계정은 Google+Windows Hello 두 개다. [등록 전후 목록](evidence/registration.json)

### 페이지 소스와 공개 접근

시크릿 창에서 소개와 잠긴 화면을 확인했다. 비로그인 페이지 소스의 items 영역은 비어 있고 실제 가상 자료 문장은 없었다. 공개·잠긴 HTML을 쿠키 없이 다시 받아 검사해도 세 비공개 본문 문장이 없었다. 자료 API와 패스키 목록 API는 비로그인 요청을 401로 거절했다.

[공개·비공개 경계](evidence/public-private-boundary.png) · [로그인 전 화면](evidence/logged-out-private.png) · [쿠키 없는 공개 접근·소스 검사 기록](evidence/public-verification.json)

공개 GitHub 저장소의 현재 소스를 내려받아 문법과 알려진 비밀 키·개인키·토큰 패턴을 검사했고 발견되지 않았다. 이는 모든 종류의 비밀값이 없다는 수학적 증명은 아니며, 실제 비밀값을 소스에 넣지 않는 운영과 함께 확인했다.

### 검증용 페이지

- [test-login.html](test-login.html): 틀린 서명·정상 로그인·동일 응답 재전송.
- [test-deleted.html](test-deleted.html): 기기에 남아 있는 삭제한 패스키의 실제 응답을 서버에 보내 거절 확인.
- [api/test-logout.js](api/test-logout.js): 동일한 이전 세션 원문으로 로그아웃 전후 요청. 실제 쿠키는 출력하지 않음.
- [test-register.html](test-register.html): 로그인한 계정에 추가 등록하고 공개 요청·응답을 표시. 실행하면 실제 패스키가 추가되므로 단순 구경용 버튼은 아님.

심사자가 이 검사를 다시 수행하거나 잠긴 노트에 들어갈 필요는 없다. 제출한 기록을 보면 된다.

## ⑤ AI와 나

1. **AI에게 맡긴 일:** 패스키·세션·계정 격리 코드, SQL 함수, 검사 페이지와 설명서 작성, 하늘·나무 디자인 및 모션 구현을 맡겼다.
2. **내가 직접 판단한 일:** 원본 저장소를 보존하려고 새 저장소를 만들었고 Vercel 배포를 선택했다. 기기에서 패스키를 직접 등록·취소·선택하고, 요청 결과·공개키·건수·저장 위치를 확인했다.
3. **AI 제안을 따르지 않은 일:** PC에 블루투스가 없어 휴대폰 QR 등록 제안을 그대로 진행하지 않고 Google 비밀번호 관리자를 사용했다. 처음의 크림색·초록색 중심 디자인 대신 푸른 하늘과 나무가 있는 방향을 요청했다.

## ⑥ 아직 못 막은 것

- **모든 실제 패스키를 잃었을 때의 계정 복구:** 마지막 서버 등록 삭제는 막지만, 기기와 Google 계정의 패스키를 모두 잃으면 복구할 수 없다. 별도의 신원 확인·복구 절차는 구현하지 않았다.
- **요청량 제한과 자동 정리:** 회원 등록·질문 발급 API에 IP별 요청 제한을 붙이지 않았다. 만료된 질문과 세션은 인증에 쓰지 않지만, 오래된 행을 주기적으로 삭제하는 작업은 아직 없다.
- **패스키 삭제와 기존 로그인 세션의 전체 폐기:** 삭제한 키로 새 로그인은 거절하지만, 삭제 전에 다른 브라우저에서 만들어진 모든 세션을 함께 폐기하지 않는다. 해당 세션은 로그아웃하거나 최대 12시간 후 만료된다.
- **이미 잠금 해제된 기기의 사용:** 다른 사람이 잠금 해제된 PC나 비밀번호 관리자를 사용할 수 있는 상황까지 사이트만으로 막을 수 없다.

## 짧은 확인 방법 · 4줄

1. **어디로 가나요:** https://my-page-passkey.vercel.app/ — 새 시크릿 창에서 연다.
2. **세 단계 안에 무엇을 하나요:** 소개 확인 → 상단 비공개 노트 입구 선택 → 비공개 노트로 들어가기.
3. **무엇이 보이면 통과인가요:** 소개는 등록 없이 보이고, 비공개 화면은 “잠김 · 로그인 필요”이며 자료 본문은 보이지 않는다.
4. **안 될 때는 무엇이 보이나요:** 공개 소개에 로그인·초대·CAPTCHA가 필요하거나, 로그인하지 않았는데 비공개 본문이 보이거나, 접속 오류가 나온다.

## 보조 자동 검사

접근 제한·세션 삭제·취소 질문 정리·마지막 패스키 보호에 대한 코드 검사 13개도 통과했다. 데이터베이스 응답을 모의 처리한 검사이며 위 실기기 증거를 대체하지 않는다. [검사 기록](evidence/code-audit.json)

## 소스 실행과 설정

정적 소개를 보는 데는 추가 계정이 필요 없다. 패스키 서버를 새로 배포하려면 Vercel과 Supabase 관리 권한이 필요하다. database.sql은 새 프로젝트에서 재현하기 위한 소스이며, 이미 검사한 기존 데이터베이스에 다시 실행할 필요는 없다.

Vercel의 서버 전용 환경변수 이름은 SUPABASE_URL, SUPABASE_SECRET_KEY다. 실제 값은 제출하지 않는다. 배포 도메인을 바꾸면 등록·인증 경로의 ORIGIN과 RP_ID도 새 도메인에 맞춰야 하며 기존 도메인의 패스키를 자동 이전할 수는 없다.

## 참고 문서

- [SimpleWebAuthn 서버 검증](https://simplewebauthn.dev/docs/packages/server)
- [Supabase 역할과 RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase 서버 전용 비밀 키](https://supabase.com/docs/guides/getting-started/api-keys)
- [Chrome의 패스키와 저장 위치](https://support.google.com/chrome/answer/13168025?hl=ko)
