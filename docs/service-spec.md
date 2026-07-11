# 자동화-네이티브 링크인바이오 — 서비스 스펙

**v0.1 · 2026-07-10 · 작명 미정(TBD)**

> **웨지:** API-first / CLI / MCP로 **자동화되는** 링크인바이오. 링크인바이오는 전부 GUI 전용인데, 터미널·스크립트·AI 에이전트(MCP)로 관리되는 건 아무도 안 만들었다.
> **타겟:** AI 에이전트·자동화 크리에이터 **먼저**, GUI 대중은 2차.
> **도그푸딩:** 깐깐아재(현재 `kkanajae-links` 코드베이스 = Vercel + Upstash).
> **MVP 데모:** "클로드한테 '내 새 픽 추가해' 하면 라이브 반영" (MCP).

---

## 1. 아키텍처 — API 하나, 클라이언트 셋

```
                  ┌─ 웹 GUI (공개페이지 + 관리자)
   REST API ──────┼─ CLI  (linkbio, npm)
 (Vercel funcs)   └─ MCP 서버 (클로드·커서 등 에이전트)
        │
   Upstash Redis  (사이트 데이터 · 통계 · API 키)
```

- **공개페이지**(방문자용) = API 공개 GET을 읽어 렌더.
- **관리자 / CLI / MCP** = 인증된 쓰기. 셋 다 같은 API를 친다.
- 원칙: **API가 진실의 원천.** 모든 클라이언트는 API의 얇은 껍데기.

---

## 2. 데이터 모델 (Upstash KV)

| 키 | 값 |
|---|---|
| `site:{handle}` | 사이트 JSON (profile + picks) |
| `clicks:{handle}` | 해시 `{pickId}:{store}` → n |
| `views:{handle}` | 해시 `total, instagram, tiktok, youtube, direct, other` |
| `apikey:{key}` | `{ handle }` — Phase2: `{ userId, handle, scopes }` |
| `user:{id}` *(Phase2)* | `{ email, plan, sites:[handle] }` |

### site JSON
```json
{
  "profile": {
    "name","handle","tagline","bio","avatar","accent",
    "notice","contactEmail","disclosure",
    "socials": { "youtube","tiktok","instagram","threads","naverBlog","x" }
  },
  "picks": [
    { "id","ep","topic","verdict","category","image","youtube","coupang","toss","status" }
  ]
}
```
- `status`: `latest` | `live` | `hidden` (latest 최대 1개, 서버가 강제)
- **MVP는 `coupang`/`toss` 고정.** 일반화(Phase2) → `stores: [{ store, url }]` 배열로 N개 구매처(쿠팡·토스·네이버·알리…). `ep`은 선택 badge로.

---

## 3. REST API

Base `https://{domain}/api` · 쓰기 인증 `Authorization: Bearer {apiKey}` · 공개 읽기 무인증.

| Method | Path | 인증 | 설명 |
|---|---|:--:|---|
| GET | `/sites/{h}` | – | 공개 데이터(profile + picks) |
| PUT | `/sites/{h}` | ✓ | 통짜 교체 (GUI 저장용) |
| GET | `/sites/{h}/picks` | ✓ | 픽 목록 |
| POST | `/sites/{h}/picks` | ✓ | 픽 추가 → 생성된 픽 반환 **(자동화 주력)** |
| PATCH | `/sites/{h}/picks/{id}` | ✓ | 픽 부분 수정 |
| DELETE | `/sites/{h}/picks/{id}` | ✓ | 픽 삭제 |
| POST | `/sites/{h}/picks/{id}/latest` | ✓ | 최신 지정 (기존 latest→live) |
| POST | `/sites/{h}/picks/reorder` | ✓ | body `{ ids:[...] }` |
| PATCH | `/sites/{h}/profile` | ✓ | 프로필 필드 병합 |
| GET | `/sites/{h}/stats` | ✓ | `{ views, clicks, ctr }` |
| POST | `/sites/{h}/view` | – | 방문 비콘 `{ source }` |
| POST | `/sites/{h}/click` | – | 클릭 비콘 `{ id, store }` |

- **검증:** URL 스킴 화이트리스트(http/https/mailto)·길이 슬라이스·latest 1개·상태값 enum — 현행 `clean()` 그대로 재사용.
- **동시성:** 픽 추가/수정은 `site:{handle}` JSON의 read-modify-write. MVP는 저빈도라 OK, Phase2에서 낙관적 잠금 또는 Redis Lua로 원자화.
- **응답:** 성공 `{ ok:true, ... }` / 실패 `{ ok:false, error }` + status(400/401/403/404/422).

**예) 픽 추가**
```http
POST /api/sites/kkanajae/picks
Authorization: Bearer sk_live_xxx
Content-Type: application/json

{ "ep":"EP14", "topic":"텀블러", "verdict":"진공 이중벽이 다 한다",
  "category":"주방", "coupang":"https://link.coupang.com/a/..",
  "toss":"https://sharelink.toss.im/..", "status":"latest" }

→ 200  { "ok":true, "pick": { "id":"p_ab12", "ep":"EP14", ... } }
```

---

## 4. 인증 (API 키)

- 키 형식 `sk_live_{random}` — **사이트 스코프.** 매핑 `apikey:{key} → { handle }`.
- 헤더 `Authorization: Bearer sk_live_...`. 키가 가리키는 handle ≠ 요청 handle → **403**.
- **MVP:** 깐깐아재 사이트에 키 1개 발급(시드/수동). 
- **Phase2:** GUI에서 유저가 발급·회수·이름표·스코프(read-only 등). 웹은 세션 로그인, 프로그램 접근은 키 — 둘 다 같은 API.
- 현행 단일 `ADMIN_PASSWORD` → 이 키 체계로 승격(패스워드는 GUI 로그인용으로 분리).

---

## 5. MCP 서버 — 웨지 데모

`@modelcontextprotocol/sdk` 기반. 클라이언트 설정에 `API_BASE` + `API_KEY`. 노출 툴:

| 툴 | 입력 | 동작 |
|---|---|---|
| `list_picks` | `{}` | 현재 픽 목록 |
| `add_pick` | `{ topic, coupang, toss?, verdict?, category?, ep?, image?, youtube?, status? }` | 픽 추가 |
| `update_pick` | `{ id, ...fields }` | 수정 |
| `delete_pick` | `{ id }` | 삭제 |
| `set_latest` | `{ id }` | 최신 지정 |
| `reorder_picks` | `{ ids:[...] }` | 순서 |
| `update_profile` | `{ name?, tagline?, notice?, contactEmail?, accent?, socials? }` | 프로필 |
| `get_stats` | `{}` | 방문·유입·클릭·전환율 |

- 각 툴 = 해당 REST 호출의 얇은 래퍼(키로 인증).
- **설치(MVP):** 유저가 클로드 데스크톱/코드 MCP 설정에 `npx @ourservice/mcp` + 키 등록 → "내 새 픽 추가해" 로 동작.
- **데모 스크립트:** "EP14 텀블러 픽 추가 — 쿠팡 …, 토스 …, 카테고리 주방, 최신" → 공개페이지 라이브 반영 확인.

---

## 6. CLI (`linkbio`) — 구현됨 (`cli/`, 의존성 0)

REST API 얇은 래퍼. **MCP 툴 8종과 1:1 대응.** 키는 `linkbio login`으로 저장(`~/.config/linkbio/config.json`, POSIX면 600). env `API_BASE`·`API_KEY`·`SITE_HANDLE` 로도 덮어씀(CI·일회성).
```bash
linkbio login --key <sk_live_… 또는 관리자비번> --handle kkanajae   # echo <키> | linkbio login 도 가능
linkbio picks list [--json]
linkbio picks add --ep EP14 --topic 텀블러 --coupang <url> --toss <url> --category 주방 --latest
linkbio picks update <id> --toss <url>       # 값 없는 --toss = 그 필드 지우기
linkbio picks rm <id>
linkbio picks latest <id>                     # 대표(최신) 지정
linkbio picks reorder <id1> <id2> ...
linkbio profile get [--json]                  # 공개 읽기(키 불필요)
linkbio profile set --notice "이번 주 신상 3종" --instagram <url>
linkbio stats [--json]
linkbio whoami | url | logout
```
- 활용: 발행 파이프라인 훅 — "영상 올리면 픽 자동 추가". 설정법 = `cli/README.md`.

---

## 7. 트래킹 (공개 비콘)

- **view:** 페이지 로드 시 `{ source }` — referrer + UA로 instagram/tiktok/youtube/direct 판별.
- **click:** 구매처 버튼 클릭 `{ id, store }`.
- 집계 = KV 해시. `stats` API로 조회.
- ⚠️ vanity 등급 — 봇/중복 필터·레이트리밋은 Phase2. 정밀 매출은 쿠팡 파트너스·토스 대시보드가 정본.

---

## 8. 로드맵

- **1a — 깐깐아재 배포(단일)**: 현행 코드 그대로 Vercel + Upstash. 링크페이지 검증.
- **1b — 웨지 프로토타입**: 세밀 API 엔드포인트 + API 키 + **MCP 서버**. 깐깐아재를 클로드/MCP로 관리(도그푸딩) + 데모 영상.
- **2 — 멀티유저 SaaS**: 계정(관리형 인증 Clerk/Supabase)·가입·온보딩·유저별 키/사이트·GUI·라우팅(핸들 경로 또는 서브도메인)·결제(포트원/토스페이먼츠)·요금제(무료/Pro)·`stores` 배열 일반화.
- **2+**: 커스텀 도메인·어뷰즈 신고/차단·레이트리밋·웹훅/자동화 통합·통계 시계열.

---

## 9. 오픈 이슈 / 결정 대기

- 서비스 **작명 + 도메인**.
- 데이터 모델 일반화(`coupang`/`toss` → `stores[]`) 시점.
- 인증 스택: 자체 vs Clerk/Supabase (Phase2).
- 결제·사업자등록·이용약관·개인정보처리방침 = Phase2 **사업 트랙**(코드와 별개, 병행).
- MCP 배포 형태: 로컬 `npx` vs 원격 호스팅 MCP.
- 개념 모트 얕음 → **속도 + 니치 각인**(MCP 레지스트리·개발자 커뮤니티 선점)이 관건.

---

## 10. 구현 현황 (2026-07-11 · `saas` 브랜치)

MVP 기능 완성 + 웨지 3종(웹·MCP·CLI) 완성. **`main`(라이브 kkanajae) 무영향·미배포.**

**구현됨**
- **자동화 코어 (웨지 3종 완성)**: 세밀 REST API(`/api/sites/{handle}/*` — 픽 CRUD·set-latest·reorder·profile·stats) + **MCP 서버**(`mcp/`, 툴 8개) + **CLI**(`cli/linkbio`, 의존성 0, MCP 툴 1:1) + 사이트/키 프로비저닝(`/api/provision`) → 웹 GUI·MCP·CLI 세 클라이언트가 같은 API
- **멀티테넌트**: 사이트별 데이터(`site:{handle}`)·스코프 키(`apikey:{key}`), 공개페이지 `/?u=handle`, 관리자 `/admin?u=handle`(키 또는 세션)
- **편집기**(admin.html) + **실시간 미리보기**(실제 공개페이지 iframe에 postMessage = WYSIWYG)
- **커스터마이징**: 테마6·배경(무늬4+사진 업로드)·폰트5·버튼모양3·채우기3·브랜드색·레이아웃2·사진 on/off·이모지 스티커·블록(텍스트/영상/링크)·아바타 업로드
- **인증**: 이메일+비밀번호(scrypt)·httpOnly 세션 쿠키·가입/로그인/로그아웃/me (`lib/auth.js`·`api/auth/*`·`login.html`)
- **예쁜 주소** `/{handle}`: `vercel.json` rewrite(`/:handle → index.html`, cleanUrls로 /admin·/login·/assets·/api는 파일시스템 우선) + index.html `<base href="/">`(서브패스 상대경로 자산 보정) + 경로/`?u=` 겸용 핸들 리더. provision·CLI·가입 안내 주소 전부 `/{handle}`로 통일
- **검증**: 로컬 목 저장소 + 미니 노드서버(실제 핸들러·실제 페이지 바이트·실제 CLI 프로세스), 누적 160+ 체크 통과

**공개 출시 전 남은 것(대부분 사업/운영 결정)**
- 배포: `saas`→프리뷰 / 별도 프로젝트 / `main` 머지 (부기 결정)
- 결제·요금제 → 사업자등록·이용약관·개인정보처리방침
- 이미지 클라우드 저장소(스케일 시 Vercel Blob/R2 — 현재는 리사이즈 후 data URL로 KV에 담음)
- 하드닝: 이메일 인증·비밀번호 재설정·레이트리밋 (예쁜 주소 `/{handle}` = 완료)

**재개 방법**: `git checkout saas`. 로컬 확인 = 미니 노드서버에 실제 핸들러 얹고 Playwright(패턴은 세션 스크래치패드 `demo*.mjs`). 배포 시 데이터 격리 주의(프리뷰가 Upstash 공유하면 `?u=demo` 등 별 핸들로).
