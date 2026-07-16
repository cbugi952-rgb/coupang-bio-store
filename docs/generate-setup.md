# 유튜브 자동 생성 켜기 (온보딩 AI)

`/onboard`의 **"유튜브 채널로 시작"**(채널 링크 → AI가 페이지 자동 생성)은 **코드가 이미 완성**돼 있고,
API 키 2개만 있으면 켜진다. 키가 없으면 그 카드는 **"준비 중"으로 잠기고**(되는 척 안 함) 프리셋 경로만
동작한다 — `docs/email-setup.md`의 `RESEND_API_KEY`와 똑같은 방식.

두 키가 **모두** 있어야 켜진다(`genReady = YOUTUBE_API_KEY && ANTHROPIC_API_KEY`). 하나만 넣으면 잠긴 채다.

## 1. YouTube Data API 키 (무료, 약 3분)

채널 이름·소개·최근 영상을 읽는 데 쓴다.

1. https://console.cloud.google.com 접속 (구글 계정).
2. 상단 프로젝트 선택 → **새 프로젝트** (이름 아무거나, 예: `onshelf`) → 만들기.
3. 검색창에 **YouTube Data API v3** → 선택 → **사용** 버튼.
4. 왼쪽 **사용자 인증 정보** → **사용자 인증 정보 만들기** → **API 키** → 키 복사 (`AIza...`).
5. (권장) 그 키의 **키 수정** → *API 제한사항* → **YouTube Data API v3만** 선택 → 저장.
   서버에서만 쓰는 키라 *애플리케이션 제한사항*은 `없음`으로 둔다.

**비용**: 무료. 하루 10,000 쿼터인데 우리는 **생성 1회당 2 쿼터**만 쓴다(= 하루 약 5,000회).
`search`(1회 100 쿼터)를 안 쓰고 업로드 재생목록을 읽도록 짜서 50배 아꼈다. 카드 등록 불필요.

## 2. Anthropic API 키 (소액, 약 3분)

채널 정보를 받아 페이지(색·글꼴·소개·픽 카드)를 만드는 데 쓴다.

1. https://console.anthropic.com 접속 → 가입/로그인.
2. **Settings → API Keys** → **Create Key** → 키 복사 (`sk-ant-...`).
3. **Billing**에서 크레딧 충전 (최소 $5). 무료 크레딧이 남아 있으면 그걸로도 된다.

**비용**: 모델은 가장 싼 **Haiku 4.5**(입력 $1 / 출력 $5 per 1M 토큰) 고정 → **페이지 한 장 약 10~20원**.
$5면 대략 300~500장. 남용 방어로 **IP당 하루 10회** 레이트리밋이 걸려 있다.
품질을 올리고 싶으면 env `ONSHELF_GEN_MODEL`로 모델만 바꾸면 된다(비용은 올라감).

## 3. Vercel에 넣기

Vercel → 프로젝트 **onshelf** → Settings → **Environment Variables** → Production에 2개 추가:

| Name | Value |
|---|---|
| `YOUTUBE_API_KEY` | `AIza...` |
| `ANTHROPIC_API_KEY` | `sk-ant-...` |

→ **Redeploy**. 끝. `/onboard`의 유튜브 카드가 "준비 중" 뱃지를 떼고 열린다.

## 확인

가입하면 자동으로 `/onboard`로 간다. 거기서 유튜브 채널 주소(예: `youtube.com/@채널이름`)를 넣고
**AI로 만들기** → 몇 초 뒤 내 페이지가 채널 톤에 맞게 만들어진 채로 편집기가 뜬다.

키가 잘 들어갔는지만 보려면 로그인 상태에서 `GET /api/onboard` 응답의 `genReady`가 `true`인지 보면 된다.

## 동작 요약 (코드)

- `lib/youtube.js` — `parseChannelRef(url)`(유튜브 주소만 허용) → `fetchChannel(ref)`.
  `channels`(1 쿼터) + 업로드 재생목록 `playlistItems`(1 쿼터). 구독자 비공개면 **빈 값**으로 둔다(지어내지 않음).
- `lib/generate.js` — `generateSiteFromChannel(channel)`. Haiku + **structured output**(`SITE_SCHEMA`)로
  유효한 JSON 강제. 응답이 잘리거나(`max_tokens`) 거부되면(`refusal`) **명시적으로 실패**시킨다
  (안 그러면 빈 페이지가 조용히 저장됨).
- `lib/presets.js` — AI를 안 쓰는 고정 스타일 5종. 키 없이도 항상 동작하는 안전망.
- `api/onboard.js` — 세션 인증. `GET`=프리셋+`genReady` / `POST {mode:"preset"|"youtube"}`.
  **AI 출력은 신뢰하지 않는다**: 저장은 `saveSite()`의 `clean()`을 거쳐 `javascript:` 같은 링크가 걸러지고,
  `handle`·`contactEmail`·`disclosure`는 AI가 못 건드리게 보류한다(비제휴 유저 오고지 방지).
- 생성 횟수는 `gen:{handle}`에 집계된다. **과금 로직이 아니라 그냥 숫자** — 나중에 요금제를 붙일 때 쓸 자리.
