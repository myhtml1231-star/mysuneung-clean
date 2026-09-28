# Community server migration · 2026-09-29

## 문제 원인
- 관리자 화면은 사이트 로그인 세션을 사용하지만, 문의/채팅 탭만 별도로 Firebase 브라우저 로그인 토큰을 요구했습니다.
- 정상 로그인 완료 시 Firebase 클라이언트는 즉시 signOut 되므로 관리자 문의/채팅 탭이 빈 화면처럼 보였습니다.
- 레거시 질문 게시판은 Firestore 문서에 비공개 문의 비밀번호와 본문을 함께 저장하고 브라우저에서 직접 읽었습니다.
- 레거시 수험채팅은 닉네임 비밀번호를 localStorage에만 저장해 기기 간 검증이 불가능했습니다.

## 적용
- Account Worker v1.4에 /api/community/* 추가
- community_inquiries, community_chat_users, community_chat_sessions, community_chat_messages D1 테이블 추가
- 기존 Firestore 문의 2건 / 채팅 18건을 D1로 이관
- 기존 비공개 문의 1건의 비밀번호는 이관 시 PBKDF2-SHA256 120,000회 + random salt로 해시
- 이관 검증 후 Firestore inquiries 2건 / chatMessages 18건 모두 제거
- 질문 게시판과 수험채팅방은 Account Worker가 자체 HTML/JS를 제공하고 Firestore SDK를 전혀 로드하지 않음
- 관리자 문의/채팅 탭도 D1을 직접 읽도록 변경하여 Firebase 재인증 제거
- 비공개 문의 공개 목록은 제목을 '비공개 질문'으로 대체하고 본문/답변/credential 필드를 반환하지 않음
- 비공개 문의 상세는 서버 비밀번호 검증 후에만 반환
- 채팅 닉네임 비밀번호는 서버 해시로 저장하고 HttpOnly Secure 세션 쿠키 사용
- 기존 루트 질문 게시판/수험채팅방/구형 관리자 파일도 안전한 서버 버전/리다이렉트로 교체

## 운영 검증
- Live API: 문의 2건, 채팅 18건
- Live DOM: 문의 2개, 비공개 badge 1개, 채팅 메시지 18개
- Firestore after migration: inquiries 0, chatMessages 0
- Private inquiry locked response: content/answer/credential fields 미노출
- Admin JS: Firebase 참조 0, server community API 참조 2
- Community tests 9 / Admin tests 11 / Admin UI tests 8 / Account API 25 / Security 17 모두 통과

## 배포
- Account Worker release: 2026-09-29.accounts.v1.4
- Cloudflare version: bd2ff705-42b3-49f0-a9a1-fcb56ca02ed8
- Migration: 0007_community.sql

## 주의
Firestore rules 자체는 기존 프로젝트 설정을 그대로 두었지만, 운영 앱은 더 이상 inquiries/chatMessages를 읽거나 쓰지 않으며 두 레거시 컬렉션은 비워졌습니다. 향후 Firebase 콘솔에서 해당 컬렉션의 공개 규칙도 닫는 것이 좋습니다.
