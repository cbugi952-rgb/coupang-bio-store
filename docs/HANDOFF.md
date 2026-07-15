# 🌙 밤샘 작업 핸드오프 — Onshelf 공개 출시 마감 (2026-07-15~16)

부기 goal "공개 출시 마감"을 `saas` 브랜치에서만, 로컬 검증으로 진행했어요.
**라이브(main) 배포는 안 했습니다 — 아침에 아래 명령으로 직접 배포하세요.**

---

## ① 밤새 한 일 — `saas` 커밋 4개 (main보다 앞섬)

모두 `saas` 브랜치. `main`은 아직 `d058a13`(등딱지 브랜드)에 그대로 = 라이브 무변경.

| 커밋 | 내용 |
|---|---|
| `418c543` | **SEO + 보안 헤더** — `robots.txt`·`sitemap.xml`, index/docs canonical+og:url, terms/privacy description+canonical, `vercel.json` 보안 헤더(nosniff·X-Frame-Options SAMEORIGIN·Referrer-Policy·Permissions-Policy·HSTS)+`/assets` 캐시. 로직 변경 없음. |
| `03823d1` | **빈 주소 claim 화면** — 없는 핸들(`/누구도안쓴주소`) 방문 시 빈 페이지 대신 "아직 비어 있는 주소예요 → 이 주소로 시작하기" 안내(→ `/login?handle=`). 루트·프리뷰·기존 페이지는 무영향. |
| `c1add68` | **비밀번호 재설정 플로우** — `lib/mailer.js`(키 없으면 무발송) + `/api/auth/forgot`·`/api/auth/reset`(레이트리밋·30분 단회 토큰·열거 방지·링크 미유출) + `reset.html` + login "비밀번호를 잊으셨나요?" + 예약핸들 `reset`. |
| `ce3751d` | **온보딩** — 가입 직후(`/admin.html?welcome=1`) 3단계 안내 카드(내 주소·첫 링크·꾸미기 + API 키 위치). 닫으면 핸들별 기억. |

변경 파일 16개 / +379 −16.

---

## ② 라이브 반영 방법 (아침에 부기가)

```bash
cd Desktop/kkanajae-links
git checkout main
git merge --ff-only saas      # d058a13 → ce3751d (4커밋 FF)
git push origin main          # Vercel 자동배포
```

배포 후 라이브 스모크 권장:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://onshelf.vercel.app/robots.txt   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://onshelf.vercel.app/sitemap.xml  # 200
curl -s https://onshelf.vercel.app/누구도안쓴핸들xyz | grep -o "아직 비어 있는" # 있으면 claim OK
# /kkanajae·/bugi·/demo·/bomi·/jia 200 + 정상 렌더 확인, /login·/admin 정상
```

⚠️ **배포 후 반드시**: 실제 회원가입 1회로 온보딩·claim 흐름을 눈으로 확인(프로덕션 KV라 테스트 계정은 나중에 지우면 됨). 비번재설정은 아래 ③-1 키를 넣어야 메일이 실제로 갑니다.

---

## ③ 부기 액션 체크리스트 (내가 못 하는 것 = 계정·키·결정)

1. **이메일 키(재설정 실동작)** — 지금은 플로우만 완성, 메일이 **안 나감**. `docs/email-setup.md`대로
   Resend 무료 키 발급 → Vercel 환경변수 `RESEND_API_KEY` 추가 → 재배포. (약 3분, 이거 하나면 재설정 켜짐)
2. **npm publish** — CLI/MCP는 `npm login` 후 `docs/publish-cli.md`대로 (부기 계정 필요, 그대로 유효).
3. **도메인** — onshelf.link 등(선점된 .co/.io 대신). 미정.
4. **KIPRIS 상표** — "onshelf"·"온셸프"·"온쉘프" 수동 확인 (42류·35류).
5. **[결정 필요] 비제휴 유저 오고지** — 아래 ⑤-a 참고. 코드로 고칠 수 있지만 법무/제품 판단이 필요해 안 건드렸어요.

---

## ④ 검증 결과 (전부 로컬, 프로덕션 무접촉)

- **비번재설정 in-process e2e 11/11** — 링크 미유출·이메일 열거 방지·단회 토큰·만료·레이트리밋·구비번 거부/새비번 로그인. (`[mailer] skipped` 로그로 무발송 확인)
- **예약핸들 5/5** — `docs`·`reset` 등 서버측 422 차단, 정상 핸들은 발급.
- **claim vs 정상 렌더** — 하네스(실제 핸들러+목스토어)로 `/kkanajae` 렌더 / `/없는핸들` claim 확인(스샷).
- **인라인 스크립트 6개 파싱** — login·reset·app·index·admin·docs 문법 무결.
- **모바일 반응형** — 랜딩·docs·claim·login·reset 폭 504에서 오버플로우/깨짐 없음(스샷). 랜딩 reduced-motion 대응 확인.
- **회귀** — 기존 테넌트 데이터·API·라우팅 무변경(코드 additive, 프로덕션 KV 미접촉).

로컬 검증 도구는 스크래치패드에 있음(`harness.mjs`·`reset-e2e.mjs`·`syntax-check.mjs`·`test-reserved.mjs`) — 재실행하려면 `node <파일>`.

---

## ⑤ 미해결 · 리스크 · 다음

- **a) [중요·결정 필요] 비제휴 유저 오고지 가능성** — 새 유저가 쿠팡/토스 없이 게시해도 푸터에 기본
  "쿠팡 파트너스…" 고지문이 뜰 수 있음. 원인: `admin.html` normalize가 빈 disclosure를 쿠팡 문구로
  기본채움 → 서버 clean이 보존 → `app.html`이 무조건 표시. **안전한 픽스 후보**: (i) admin normalize
  기본값을 ""로, 또는 (ii) app.html에서 disclosure는 유저가 설정했을 때만 표시. 단 kkanajae의 정상 고지·
  "제휴 링크 쓰면 고지 의무는 유저"라는 약관과 얽혀 **부기 판단이 필요**해 밤샘엔 안 건드림.
- **b) 이메일 인증(회원가입 확인)** — 안 만들었음. `lib/mailer.js`가 이미 있어 **재설정과 똑같은 패턴**으로
  쉽게 추가 가능(verify 토큰 + `/api/auth/verify` + admin 배너). 비차단(가입은 그대로, 배너만) 권장. 다음 세션.
- **c) 죽은 코드(admin `.pv-*`)** — 미리보기가 iframe이라 `.pv-*` CSS·`chips()`/`heroBuys()`가 안 쓰일
  가능성. 제거가 확실히 안전한지 로그인 미리보기로 검증이 필요해 보수적으로 **안 지움**. 저우선.
- **d) 테넌트별 OG/타이틀** — `/{handle}` 공유 시 미리보기가 전역 Onshelf OG로 나옴(크롤러는 JS 미실행).
  진짜 테넌트별 OG는 SSR/엣지 함수가 필요 = 아키텍처 변경이라 범위 밖. 지금은 문제 아님.
- **e) 온보딩·claim 실동작** — 세션 인증이 필요해 로컬에선 카드 디자인만 독립 검증. **배포 후 실제 가입으로
  최종 확인** 필요(위 ②).

— 밤샘 세션 (Claude)
