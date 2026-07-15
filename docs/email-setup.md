# 이메일 발송 켜기 (비밀번호 재설정 / 인증)

비밀번호 재설정 플로우는 **코드가 이미 완성**돼 있고, 실제 이메일 발송만 키가 있어야 동작한다.
키가 없으면 흐름은 그대로 돌지만 메일이 **나가지 않는다**(서버 로그에 `[mailer] skipped …`만 남고,
보안상 링크는 로그·HTTP 응답 어디에도 노출하지 않음).

## 켜는 법 (약 3분)

1. https://resend.com 가입 (무료 티어: 하루 100통·월 3,000통).
2. 대시보드 → **API Keys** → **Create API Key** (권한 Sending) → 키 복사 (`re_...`).
3. Vercel → 프로젝트 **onshelf** → Settings → **Environment Variables** 에 추가:
   - `RESEND_API_KEY` = `re_...` (Production)
4. **Redeploy** (또는 다음 배포부터 적용).

이게 전부다. 이제 `/login → 비밀번호를 잊으셨나요?` 에서 이메일을 넣으면 실제로 재설정 메일이 간다.

## 보내는 주소 (선택)

기본 발신자는 Resend 테스트 주소(`onboarding@resend.dev`)라 바로 동작하지만, 스팸함으로 갈 수 있다.
자기 도메인을 쓰려면:

1. Resend → **Domains** → 도메인 추가 → 안내대로 DNS(SPF·DKIM) 레코드 등록·검증.
2. Vercel 환경변수 `MAIL_FROM` = `Onshelf <no-reply@내도메인>` 추가 → Redeploy.

## 동작 요약 (코드)

- `lib/mailer.js` — `sendMail({to,subject,html,text})`. 키 없으면 `{ok:true, delivered:false}`(무발송).
- `POST /api/auth/forgot` `{email}` — 가입된 이메일이면 `reset:{token}`(TTL 30분) 생성 후 메일 발송.
  **열거 방지**: 이메일 존재 여부와 무관하게 항상 동일한 성공 응답을 준다.
- `POST /api/auth/reset` `{token,password}` — 토큰 검증·소비 후 비밀번호(scrypt) 교체. 레이트리밋 적용.
- `reset.html`(`/reset?token=…`) — 새 비밀번호 입력 화면.

## 이메일 인증(회원가입 확인)도 켜려면

같은 `RESEND_API_KEY` 하나로 동작한다. (인증 플로우를 추가한 경우) 별도 키 불필요.
