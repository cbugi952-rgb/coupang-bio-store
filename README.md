# 깐깐아재 링크 (kkanajae-links)

인포크링크를 대체하는 **깐깐아재 자체 링크-인-바이오**. 프레임워크 없이 순수 HTML/CSS/JS + **Vercel**(무료).

- **공개페이지** `/` — 인스타·틱톡·유튜브 프로필에 거는 주소. 회차별로 **쿠팡(필수)·토스쇼핑(선택)** 두 구매처 버튼 + 그 화 카툰 이미지.
- **관리자** `/admin` — 비밀번호로 잠금. 픽 추가·정렬·수정 후 **게시**하면 공개페이지에 바로 반영.
- **저장소** — Upstash Redis(무료)의 단일 키 `data`에 JSON. 데이터 API = `/api/picks` (GET 공개 / PUT 관리자).

두 제휴(쿠팡 파트너스·토스쇼핑 쉐어링크) 모두 구매 시 수수료가 발생하므로, **대가성 고지 문구가 공개페이지 하단에 항상 표시**된다(끄지 못함).

## 폴더
```
index.html          공개페이지
admin.html          관리자
assets/avatar.jpg   마스코트 프로필 사진
images/epNN.jpg     회차별 카드 이미지(그 화 카툰, 웹용 축소본)
api/picks.js        데이터 API (GET/PUT + Upstash + 비밀번호)
vercel.json         cleanUrls (/admin 접속용)
```

## 배포 (한 번만 세팅 — Vercel 무료 계정)
1. **가입**: https://vercel.com 무료 가입.
2. **프로젝트 올리기** (둘 중 하나)
   - 이 폴더를 GitHub 저장소에 올리고 Vercel에서 **Import** (프레임워크 = Other, 그대로 Deploy), 또는
   - 이 폴더에서 `npx vercel` 실행(로그인 후 안내대로).
3. **저장소(Upstash Redis) 연결**: Vercel 프로젝트 → **Storage** 탭 → Marketplace의 **Upstash → Redis** 생성 → 이 프로젝트에 연결.
   → `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` 환경변수가 **자동으로** 들어간다.
4. **관리자 비밀번호**: 프로젝트 → Settings → **Environment Variables** → `ADMIN_PASSWORD` 추가(원하는 값).
5. **재배포**: 환경변수 반영을 위해 한 번 더 Deploy → `https://kkanajae-links.vercel.app` 같은 주소가 나온다.

## 로컬에서 미리 보기 (선택)
```
npm install
vercel link            # 프로젝트 연결(최초 1회)
vercel env pull .env.local   # Upstash·비번 값 받아오기
vercel dev             # http://localhost:3000  (관리자: /admin)
```

## 매 화 운영 (부기)
1. `주소/admin` 접속 → 🔑로 비밀번호 입력(처음 한 번, 브라우저에 저장됨).
2. 카드 내용(회차·주제·한마디·**그 화 카툰 이미지**)은 에피소드 만들 때 미리 채워둠 → **부기는 쿠팡·토스 링크 두 개만** 붙이면 됨.
3. 새 픽을 **⭐최신**으로 두면 공개페이지 맨 위 노란 히어로 카드가 된다.
4. **변경사항 게시** → 공개페이지에 즉시 반영.
5. 공개 주소를 인스타·틱톡·유튜브 프로필 링크에 붙이기.

## 참고
- 카드 이미지 = 그 화 귀여운 카툰(제품 실사 아님 → 브랜드핏 + 저작권 안전). `images/epNN.jpg`에 웹용 축소본을 두고 픽의 이미지 경로로 지정.
- 쿠팡/토스 링크에서 상품 사진 자동 추출은 하지 않음(쿠팡 봇 차단 + 이미지 저작권).
- 커스텀 도메인(kkanajae.com 등)은 나중에 Vercel → Domains에서 연결.
- 폰트 = 주아체(BM Jua, Google Fonts). 링크 공유 시 미리보기(OG) = `assets/og.jpg`. 배포 후 `og:image`를 배포 도메인 절대주소로 바꾸면 카톡·SNS 미리보기가 확실해짐.
- 버튼 클릭 통계: 공개페이지 버튼 클릭 → `/api/click` 집계(Redis 해시), 관리자 목록에 픽별 쿠팡·토스 클릭수 표시.
