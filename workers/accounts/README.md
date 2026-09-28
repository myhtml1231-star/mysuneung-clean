# 수능기출 통합 계정 / 내 학습실

배포 기능 버전: `2026-09-27.accounts.v1.1`

## 운영 구조

- Google Firebase Authentication(`mysuneung`)은 로그인 신원 확인에만 사용한다. 별도 사이트 비밀번호를 수집하지 않는다.
- Cloudflare Worker `mysuneung-accounts`가 계정 API 및 `/auth`, `/my`, 계정 안내 화면을 제공한다.
- 회원 전용 D1 데이터베이스는 `mysuneung-accounts`다. 실행 지역은 APAC로 확인했지만 한국 내 저장 보장은 아니다.
- 공통 기출 원문은 기존 R2 `mysuneung-cbt`에 유지한다. 계정별 답안·메모·개인 기록은 공개 R2에 올리지 않는다.
- `universitypredict.com`은 고정된 계정 연결 경로, 일회용 코드 및 S256 PKCE를 거쳐 같은 계정을 사용한다. 대학 서버의 게이트웨이는 `/root/admission-predictor/web_mvp/account_bridge.py`다. 대학 검색/예측 핵심 로직을 대체하지 않는다.

## 동기화 범위

기출 링크 열기 기록, CBT 답안·채점 결과·진행 위치·직접 기록한 오답 이유/메모·필기, 관심 대학·비교 목록·직접 저장한 대학 조사노트를 저장한다. 이미 다운로드 폴더에 있는 모든 파일을 자동으로 추측하거나 업로드하는 기능이 아니며 대학 성적 입력과 모든 예측 결과를 자동 수집하지 않는다.

기존 비로그인 기록은 사용자 확인 후 선택한 종류만 복사한다. 계정별 브라우저 네임스페이스를 사용하며 다른 계정으로의 조용한 병합을 금지한다. 버전 충돌은 로컬/서버 중 사용자가 선택하기 전까지 덮어쓰지 않는다. 작성 중인 복습 메모에는 동기화에 따른 화면 재렌더링을 지연한다.

## 주요 파일

- `src/index.mjs`: Worker 라우팅, 계정/세션 API, 기존 공개 페이지 연결.
- `src/security.mjs`: 검증된 최근 Google JWT, Origin/CSRF, 세션 해시 및 요청 제한.
- `src/records.mjs`: 허용된 레코드 스키마, 버전/삭제 전파, 원문 기반 CBT 복원·서버 채점.
- `src/bridge.mjs`: 대학 사이트의 일회용 계정 연결.
- `src/auth-client.mjs`: Google 로그인, 메모리 내 SDK 인증, 사이트 세션 교환.
- `public/account-assets/store.js`: 두 사이트가 공유하는 계정별 사본/전송 대기/충돌/편집 스냅샷.
- `public/account-assets/workspace.*`: 내 학습실, 기출 보관함, CBT·복습, 대학 조사, 계정 설정.
- `public/account-assets/cbt-account.js`: 기존 CBT와 계정 기록 연결.
- `cbt-account.html`: 계정 연결을 포함한 R2 배포용 CBT 화면.

## 수정·배포 시 주의

1. 현재 배포본과 로컬 변경을 먼저 비교하고 백업한다. 진행 중인 다른 작업의 파일을 덮어쓰지 않는다.
2. `npm run build`, `npm test`, `node tests/bridge-test.mjs`를 실행한다.
3. 인증 브라우저 검사는 독립된 loopback 테스트 서버와 테스트 DB에서 수행한다. 테스트용 신원 검증기를 실제 서비스에 연결하지 않는다. 실행별 별도 포트/리포트 경로를 사용해 동시 작업의 결과가 섞이지 않게 한다.
4. `wrangler deploy`로 계정 Worker를 반영한다. 실제 DB가 이미 있으므로 새 DB를 만들거나 삭제하지 않는다.
5. CBT 화면 변경은 `wrangler r2 object put mysuneung-cbt/app/cbt.html --remote --file=cbt-account.html --content-type='text/html; charset=utf-8' --force`로 배포한다. 이후 `/Users/shbj/Downloads/mysuneung-cbt-worker/legacy-build/cbt.html`도 동일하게 유지한다.
6. 공유 `store.js` 변경은 대학 서버의 `web_mvp/static_v4/account-assets/store.js`에도 해시 대조 후 반영하고 대학 UI 검사를 수행한다.
7. `RATE_SALT`는 Worker secret이다. 실제 값, 세션 쿠키, Firebase ID 토큰, 테스트 TLS 개인키, 개인 학습 기록을 저장소나 공개 보고서에 포함하지 않는다.

## 검증과 남은 확인

`reports/account-release-20260927.json` 및 `reports/delivery-*` 결과를 참고한다. 독립 신원/DB 기반 계정·권한·브라우저·대학 연결 검사 101건을 통과했다. 실제 서비스에서는 Google 로그인 화면 진입, 비로그인 비공개 기록 차단, 잘못된 신원 토큰 거부 및 실제 기출 링크 기록까지 확인했다.

실제 Google 계정 선택과 최종 신규 회원 생성은 사용자가 본인 계정으로 확인해야 한다. 자동화가 실제 Google 계정 로그인을 끝까지 완료한 것으로 표시하지 않는다. 운영자의 실제 신원/연락처 등 공개 개인정보 안내의 최종 운영 정보도 별도로 확인해야 한다.

기본 세션 8시간, 로그인 유지 선택 시 7일이다. 대학 연결 세션은 별도로 표시되며 최대 8시간이다. 모든 기기 로그아웃/계정 삭제는 연결된 대학 사이트의 세션도 무효화한다. 기록 충돌과 전송 대기 내역을 처리한 뒤 로그아웃하도록 안내한다.

## 복구

`backup/finalize-1935`는 이번 마무리 이전 코드/화면이며 DB 자체의 백업이 아니다. 화면/코드를 롤백할 때에도 기존 회원 DB를 삭제하지 않는다. 원문 기출·정답 파일은 이번 계정 구현의 변경 대상이 아니었다.
