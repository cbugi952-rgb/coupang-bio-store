// 생성 엔진 — 유튜브 채널 정보 → Onshelf 사이트 데이터(JSON).
// 서버가 이 함수로 Claude를 호출해 채널 톤에 맞는 페이지를 자동 생성한다.
// 비용: 채널당 가입 시 1회 + 대화형 수정 시 호출. Haiku 기준 한 장 ~10~20원.
// 반환은 raw 사이트 JSON — 저장은 호출측이 lib/site.js의 clean()+saveSite()로.
import Anthropic from "@anthropic-ai/sdk";

// 채널 톤 → 디자인 매핑 + 콘텐츠 규칙. no-fabrication은 프로젝트 하드룰.
const SYSTEM_PROMPT = `너는 유튜브 채널을 분석해 그 채널의 링크-인-바이오 페이지(Onshelf)를 디자인하는 AI다.
채널 정보를 받아, 채널의 분위기·주제·언어에 맞는 페이지 데이터(JSON)를 만든다.

## 디자인 (채널 분위기를 읽고 어울리게 고른다)
- theme: cream(밝고 따뜻·일상/쇼핑) · dark(강렬·게임/테크) · mint(청량·건강/뷰티) · pink(귀엽·패션/브이로그) · navy(차분·전문/비즈니스) · mono(미니멀·시크)
- accent: 채널 톤에 맞는 브랜드색 hex 하나("#RRGGBB", theme와 어울리게)
- font: jua(둥글둥글 친근) · gothic(깔끔 범용) · nanum(부드러운 손글씨) · gaegu(개구쟁이 발랄) · myeongjo(우아한 명조)
- background: solid(기본) · gradient(부드러움) · dots(경쾌한 점) · grid(정돈된 격자)
- buttonStyle: round · pill · square / buttonFill: solid · outline · soft / layout: card · list
- stickers: 채널 분위기에 맞는 이모지 1~4개 (없어도 됨)

## 콘텐츠
- name: 채널명 그대로. tagline: 채널을 한 줄로(짧게, 24자 안팎). bio: 2줄 내외 소개.
- **채널 언어에 맞춰 써라.** 한국어 채널이면 한국어, 영어 채널이면 영어로 tagline·bio·코멘트를 쓴다.
- picks: 최근 영상 3~5개를 카드로. topic=영상 주제(짧게), verdict=채널 톤을 살린 한 줄 코멘트, youtube=그 영상 링크(없으면 채널 URL), status는 첫 개만 "latest" 나머지 "live".
- blocks: 채널을 소개하는 짧은 text 블록 하나 정도(선택). 없으면 빈 배열.
- socials.youtube = 채널 URL. instagram·tiktok·x는 **확실한 정보가 있을 때만** 채우고, 없으면 빈 문자열.

## 절대 규칙
- 주어진 채널 정보에 있는 것만 써라. 없는 구독자 수·가짜 소셜 링크·지어낸 사실을 만들지 마라.
- 결과는 스키마에 맞는 JSON만 출력한다. 설명·인사말 없이 JSON만.`;

// structured output 스키마 — Claude 응답을 이 형태로 강제(유효 JSON 보장).
// structured output 제약: 모든 object에 additionalProperties:false + 전체 required (빈 문자열 허용).
export const SITE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    profile: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        tagline: { type: "string" },
        bio: { type: "string" },
        accent: { type: "string", description: "브랜드색 #RRGGBB" },
        theme: { type: "string", enum: ["cream", "dark", "mint", "pink", "navy", "mono"] },
        background: { type: "string", enum: ["solid", "gradient", "dots", "grid"] },
        font: { type: "string", enum: ["jua", "gothic", "nanum", "gaegu", "myeongjo"] },
        buttonStyle: { type: "string", enum: ["round", "pill", "square"] },
        buttonFill: { type: "string", enum: ["solid", "outline", "soft"] },
        layout: { type: "string", enum: ["card", "list"] },
        stickers: { type: "array", items: { type: "string" } },
        notice: { type: "string" },
        socials: {
          type: "object",
          additionalProperties: false,
          properties: {
            youtube: { type: "string" },
            instagram: { type: "string" },
            tiktok: { type: "string" },
            x: { type: "string" },
          },
          required: ["youtube", "instagram", "tiktok", "x"],
        },
      },
      required: ["name", "tagline", "bio", "accent", "theme", "background", "font", "buttonStyle", "buttonFill", "layout", "stickers", "notice", "socials"],
    },
    picks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          topic: { type: "string" },
          verdict: { type: "string" },
          youtube: { type: "string" },
          status: { type: "string", enum: ["latest", "live"] },
        },
        required: ["topic", "verdict", "youtube", "status"],
      },
    },
    blocks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: ["text", "link"] },
          title: { type: "string" },
          body: { type: "string" },
          url: { type: "string" },
          label: { type: "string" },
        },
        required: ["type", "title", "body", "url", "label"],
      },
    },
  },
  required: ["profile", "picks", "blocks"],
};

// 유튜브 채널 정보 → 프롬프트용 브리프 텍스트.
// channel = { name, handle, url, description, subscribers, recentVideos:[{title,url}] }
export function buildChannelBrief(ch) {
  ch = ch || {};
  const vids = (Array.isArray(ch.recentVideos) ? ch.recentVideos : [])
    .slice(0, 8)
    .map((v, i) => `  ${i + 1}. ${v.title || ""}`)
    .join("\n");
  return [
    ch.name ? `채널명: ${ch.name}` : "",
    ch.handle ? `핸들: @${ch.handle}` : "",
    ch.url ? `채널 URL: ${ch.url}` : "",
    ch.subscribers ? `구독자: ${ch.subscribers}` : "",
    ch.description ? `채널 소개: ${ch.description}` : "",
    vids ? `최근 영상:\n${vids}` : "",
  ].filter(Boolean).join("\n");
}

// INERT by default — 키 없으면 호출측이 자동 생성 경로를 막는다 (mailer.js·youtube.js와 같은 패턴).
export function generatorConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// 채널 정보로 사이트 데이터 생성. ANTHROPIC_API_KEY 환경변수 필요.
// 모델은 비용 위해 Haiku 기본(부기와 합의) — 품질 필요 시 ONSHELF_GEN_MODEL로 상향.
export async function generateSiteFromChannel(channel) {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: process.env.ONSHELF_GEN_MODEL || "claude-haiku-4-5",
    // 사이트 JSON 한 장은 대략 1~2천 토큰이지만, 잘리면 JSON이 깨져 전부 버려지므로 넉넉히.
    // 청구는 실제 생성분만 — 한도를 올려도 비용은 그대로다.
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildChannelBrief(channel) }],
    output_config: { format: { type: "json_schema", schema: SITE_SCHEMA } },
  });

  // 잘렸거나 거부당한 응답을 그냥 파싱하면 빈 사이트가 조용히 저장된다 → 명시적으로 실패시킨다.
  if (res.stop_reason === "max_tokens") throw new Error("생성 결과가 잘렸습니다 (max_tokens).");
  if (res.stop_reason === "refusal") throw new Error("모델이 이 채널에 대한 생성을 거부했습니다.");

  const block = res.content.find((b) => b.type === "text");
  if (!block || !block.text) throw new Error("생성 결과가 비어 있습니다.");
  const site = JSON.parse(block.text);
  if (!site || !site.profile) throw new Error("생성 결과에 프로필이 없습니다.");
  return site;
}
