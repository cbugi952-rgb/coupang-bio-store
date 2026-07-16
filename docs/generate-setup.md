# AI 기능 켜기 (유튜브 자동 생성 · 말로 고치기)

두 기능은 **코드가 이미 완성**돼 있고, API 키 2개만 있으면 켜진다:

| 기능 | 어디 | 필요한 키 |
|---|---|---|
| 유튜브 채널로 시작 (채널 링크 → 페이지 자동 생성) | `/onboard` | 유튜브 + AI **둘 다** |
| 말로 고치기 ("색 좀 더 밝게") | 편집기 대화창 | AI 키만 |

키가 없으면 각 기능은 **"준비 중"으로 잠긴다**(되는 척 안 함) — `docs/email-setup.md`의
`RESEND_API_KEY`와 똑같은 방식. 그동안 프리셋으로 시작하기와 손으로 편집하기는 그대로 동작한다.

**AI 키는 OpenAI / Anthropic 중 아무거나 하나**면 된다. 둘 다 지원하고, 나중에 갈아타는 건
환경변수 하나 바꾸는 게 전부다(코드 수정 없음).

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

## 2. AI 키 — OpenAI **또는** Anthropic (둘 중 하나만)

채널 정보를 받아 페이지(색·글꼴·소개·픽 카드)를 만들고, 대화형 수정도 이 키로 돈다.

### (a) OpenAI를 쓸 경우 — 크레딧이 이미 있다면 이쪽

1. https://platform.openai.com → **API keys** → **Create new secret key** → 복사 (`sk-...`).
2. **Billing**에 크레딧이 남아 있는지 확인. (ChatGPT Plus 구독과 **API 크레딧은 별개**다 —
   Plus만 있고 API 크레딧이 0이면 호출이 실패한다.)

기본 모델 = **`gpt-5-mini`**(저가 티어). 더 싸게 가려면 env `ONSHELF_GEN_MODEL=gpt-5-nano`.

### (b) Anthropic을 쓸 경우

1. https://console.anthropic.com → **Settings → API Keys** → **Create Key** → 복사 (`sk-ant-...`).
2. **Billing**에서 크레딧 충전 (최소 $5).

기본 모델 = **`claude-haiku-4-5`**(저가 티어, 입력 $1 / 출력 $5 per 1M) → **페이지 한 장 약 10~20원**,
$5면 대략 300~500장. (OpenAI 쪽 원가는 실제 호출로 재본 뒤 여기 채울 것 — 추측 수치는 안 적는다.)

남용 방어: 생성은 **IP당 하루 10회**, 말로 고치기는 **IP당 시간당 60회** 레이트리밋.

## 3. Vercel에 넣기

Vercel → 프로젝트 **onshelf** → Settings → **Environment Variables** → Production에 추가:

| Name | Value | 비고 |
|---|---|---|
| `YOUTUBE_API_KEY` | `AIza...` | 필수 (유튜브 자동 생성용) |
| `OPENAI_API_KEY` | `sk-...` | OpenAI를 쓸 경우 |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Anthropic을 쓸 경우 |
| `AI_PROVIDER` | `openai` 또는 `anthropic` | **선택** — 둘 다 넣었을 때만 필요 |
| `ONSHELF_GEN_MODEL` | 모델명 | **선택** — 기본 모델을 바꿀 때 |

→ **Redeploy**. 끝.

**제공자 고르는 규칙**: `AI_PROVIDER`를 정하면 그걸 쓴다. 안 정하면 **키가 있는 쪽을 자동으로**
고르고, 둘 다 있으면 OpenAI가 우선이다. `AI_PROVIDER`에 오타를 내면 다른 데로 새지 않고
그냥 기능이 잠긴다(조용히 엉뚱한 제공자로 청구되는 것보다 낫다).

**나중에 갈아타기**: 크레딧이 떨어지면 새 키를 넣고 `AI_PROVIDER`만 바꿔 Redeploy.
코드는 안 건드린다.

## 확인

가입하면 자동으로 `/onboard`로 간다. 거기서 유튜브 채널 주소(예: `youtube.com/@채널이름`)를 넣고
**AI로 만들기** → 몇 초 뒤 내 페이지가 채널 톤에 맞게 만들어진 채로 편집기가 뜬다.
편집기의 **말로 고치기**에 "테마를 다크로 바꿔줘"를 넣어보면 대화형 수정도 확인된다.

키가 잘 들어갔는지만 보려면 로그인 상태에서 `GET /api/onboard`의 `genReady`, `GET /api/edit`의
`ready`가 `true`인지 보면 된다.

## 동작 요약 (코드)

- `lib/ai.js` — **제공자 어댑터**. 두 기능이 쓰는 호출은 한 모양뿐이라(시스템 프롬프트 + 메시지 +
  JSON 스키마 → JSON) 여기 한 곳에 두고 OpenAI/Anthropic을 갈아끼운다. 잘림(`length`/`max_tokens`)·
  거부(`refusal`/`content_filter`)는 **명시적으로 실패**시킨다 — 안 그러면 빈 페이지가 조용히 저장된다.
- `lib/youtube.js` — `parseChannelRef(url)`(유튜브 주소만 허용) → `fetchChannel(ref)`.
  `channels`(1 쿼터) + 업로드 재생목록 `playlistItems`(1 쿼터). 구독자 비공개면 **빈 값**으로 둔다(지어내지 않음).
- `lib/generate.js` — `generateSiteFromChannel(channel)`. **structured output**(`SITE_SCHEMA`)로 유효 JSON 강제.
- `lib/edit.js` — `planEdits()`가 자연어를 **연산 목록(ops)** 으로 바꾸고 `applyOps()`가 적용.
  사이트 JSON을 통째로 다시 쓰게 하지 않는 이유 = 그러면 픽·블록이 조용히 유실된다.
- `lib/presets.js` — AI를 안 쓰는 고정 스타일 5종. 키 없이도 항상 동작하는 안전망.
- `api/onboard.js` · `api/edit.js` — 세션 인증(본인 사이트만).
  **AI 출력은 신뢰하지 않는다**: 저장은 `saveSite()`의 `clean()`을 거쳐 `javascript:` 같은 링크가 걸러지고,
  `handle`·`contactEmail`·`disclosure`는 AI가 못 건드리게 보류한다(비제휴 유저 오고지 방지).
- 횟수는 `gen:{handle}` / `edit:{handle}`에 집계된다. **과금 로직이 아니라 그냥 숫자** — 나중에 요금제를 붙일 자리.

### 스키마를 고칠 때 주의

`SITE_SCHEMA`·`OPS_SCHEMA`는 **두 제공자의 structured output 제약을 모두** 만족해야 한다:
모든 object에 `additionalProperties:false` + 모든 속성이 `required`, 루트는 object,
판별자는 `const` 말고 **단일값 enum**(OpenAI strict 호환). 스크래치패드 `ai-adapter.mjs`가
이 규칙을 자동 감사하니 스키마를 손대면 그걸 돌려볼 것.
