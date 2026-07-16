// 대화형 수정 — "색 좀 더 밝게", "인스타 링크 추가" 같은 말을 사이트 변경으로 옮긴다.
//
// 설계: AI에게 사이트 JSON을 통째로 다시 쓰게 하지 않는다. 그러면 픽·블록이 조용히 유실되고
// 토큰도 크다. 대신 작은 **연산 목록(ops)** 만 뽑게 하고, 적용은 우리 코드가 한다
// (기존 MCP 툴 8종과 같은 문법 — add_pick/update_profile/…).
// 적용 결과는 호출측이 saveSite()에 넣어 clean()으로 검증한다 = AI 출력 신뢰 안 함.
// 실제 모델 호출은 lib/ai.js 어댑터가 담당(OpenAI/Anthropic 중 env로 선택).
import { completeJSON, aiConfigured } from "./ai.js";

export function editorConfigured() {
  return aiConfigured();
}

// 값 필드는 문자열 하나로 통일 — 스키마가 단순해야 모델이 덜 틀리고, 유효성은 서버 clean()이 본다.
const FIELDS = ["name", "tagline", "bio", "notice", "contactEmail", "accent", "theme", "font", "background", "buttonStyle", "buttonFill", "layout", "showImages", "disclosure"];
const SOCIALS = ["youtube", "instagram", "tiktok", "threads", "naverBlog", "x"];

const obj = (props, req) => ({ type: "object", additionalProperties: false, properties: props, required: req || Object.keys(props) });
const str = (description) => (description ? { type: "string", description } : { type: "string" });

// structured output 제약(두 제공자 공통): 모든 object에 additionalProperties:false + 전체 required.
// → "안 바꿈"은 빈 문자열로 표현한다(선택 필드를 못 쓰기 때문).
// 판별자는 const 말고 **단일값 enum** — 의미는 같은데 OpenAI strict 모드까지 함께 통과한다.
const tag = (name) => ({ type: "string", enum: [name] });
export const OPS_SCHEMA = obj({
  reply: str("사용자에게 보여줄 한국어 한 줄. 무엇을 바꿨는지 또는 왜 못 바꿨는지."),
  ops: {
    type: "array",
    items: {
      anyOf: [
        obj({ op: tag("set_field"), field: { type: "string", enum: FIELDS }, value: str("accent는 #RRGGBB. showImages는 true/false. 지우려면 빈 문자열") }),
        obj({ op: tag("set_social"), platform: { type: "string", enum: SOCIALS }, url: str("전체 URL. 지우려면 빈 문자열") }),
        obj({ op: tag("set_stickers"), stickers: { type: "array", items: str() } }),
        obj({ op: tag("add_pick"), topic: str(), verdict: str(), buttons: { type: "array", items: obj({ label: str(), url: str() }) } }),
        obj({ op: tag("update_pick"), index: { type: "integer" }, topic: str("안 바꾸면 빈 문자열"), verdict: str("안 바꾸면 빈 문자열"), status: { type: "string", enum: ["", "latest", "live", "hidden"] } }),
        obj({ op: tag("remove_pick"), index: { type: "integer" } }),
        obj({ op: tag("add_block"), type: { type: "string", enum: ["text", "video", "link"] }, title: str(), body: str(), url: str(), label: str() }),
        obj({ op: tag("remove_block"), index: { type: "integer" } }),
      ],
    },
  },
}, ["reply", "ops"]);

const SYSTEM_PROMPT = `너는 사용자의 링크-인-바이오 페이지(Onshelf)를 대화로 고쳐주는 편집자다.
현재 페이지 상태와 사용자의 요청을 받아, 요청을 이루는 **연산 목록(ops)**과 사용자에게 보여줄 한 줄(reply)을 낸다.

## 값 규칙
- theme: cream(밝고 따뜻) · dark(강렬) · mint(청량) · pink(귀엽) · navy(차분·전문) · mono(미니멀)
- font: jua(둥글둥글 친근) · gothic(깔끔 범용) · nanum(부드러움) · gaegu(개구쟁이) · myeongjo(우아)
- background: solid · gradient · dots · grid
- buttonStyle: round · pill · square / buttonFill: solid · outline · soft / layout: card · list
- accent: "#RRGGBB" 형식의 hex. "더 밝게/어둡게" 같은 요청은 현재 accent를 기준으로 적당히 조정한 hex를 낸다.
- showImages: "true" 또는 "false"

## 연산 규칙
- 픽·블록은 **현재 목록의 순번(index, 0부터)** 으로 가리킨다. 사용자가 "첫 번째 픽"이라 하면 index 0.
- update_pick에서 안 바꿀 필드는 빈 문자열로 둔다.
- 요청에 없는 건 건드리지 마라. "색 바꿔줘"에 폰트까지 바꾸지 마라.
- 요청이 모호하면 ops를 비우고 reply로 무엇을 알려달라고 되물어라.
- 페이지에 없는 내용(가짜 링크·지어낸 소개)을 만들지 마라. 사용자가 준 것만 쓴다.
- 주소(handle)는 못 바꾼다. 요청받으면 reply로 안 된다고 답해라.

## reply
- 한국어 한 줄, 담백하게. 무엇을 바꿨는지 사실만. 이모지·과장 없이.`;

export function buildSiteBrief(site) {
  const p = site.profile || {};
  const picks = (site.picks || []).map((x, i) => `  ${i}. ${x.topic || "(제목 없음)"}${x.verdict ? " — " + x.verdict : ""}${x.status === "latest" ? " [최신]" : x.status === "hidden" ? " [숨김]" : ""}`).join("\n");
  const blocks = (site.blocks || []).map((b, i) => `  ${i}. [${b.type}] ${b.title || b.label || b.body || ""}`.slice(0, 90)).join("\n");
  const socials = SOCIALS.filter((k) => (p.socials || {})[k]).map((k) => `${k}=${p.socials[k]}`).join(" ");
  return [
    `이름: ${p.name || "(없음)"}`,
    `한 줄 소개: ${p.tagline || "(없음)"}`,
    p.bio ? `소개: ${p.bio}` : "",
    `디자인: theme=${p.theme} accent=${p.accent} font=${p.font} background=${p.background} buttonStyle=${p.buttonStyle} buttonFill=${p.buttonFill} layout=${p.layout} showImages=${p.showImages}`,
    p.notice ? `공지: ${p.notice}` : "",
    p.contactEmail ? `문의 이메일: ${p.contactEmail}` : "",
    (p.stickers || []).length ? `스티커: ${p.stickers.join(" ")}` : "",
    socials ? `소셜: ${socials}` : "소셜: (없음)",
    picks ? `픽 (${site.picks.length}개):\n${picks}` : "픽: (없음)",
    blocks ? `블록 (${site.blocks.length}개):\n${blocks}` : "블록: (없음)",
  ].filter(Boolean).join("\n");
}

// 자연어 → ops. 생성과 같은 제공자·모델 정책(lib/ai.js).
export async function planEdits(site, message) {
  const out = await completeJSON({
    system: SYSTEM_PROMPT,
    user: `## 현재 페이지\n${buildSiteBrief(site)}\n\n## 요청\n${message}`,
    schema: OPS_SCHEMA,
    schemaName: "onshelf_edit_ops",
    maxTokens: 4096,
  });
  return { reply: String((out && out.reply) || ""), ops: Array.isArray(out && out.ops) ? out.ops : [] };
}

const LABEL = { theme: "테마", font: "글꼴", accent: "브랜드색", background: "배경", buttonStyle: "버튼 모양", buttonFill: "버튼 채우기", layout: "레이아웃", name: "이름", tagline: "한 줄 소개", bio: "소개", notice: "공지", contactEmail: "문의 이메일", showImages: "사진 표시", disclosure: "고지문" };

// ops를 사이트에 적용. 순수 함수 — 저장은 호출측이 saveSite()로(거기서 clean()이 검증).
// 잘못된 op는 조용히 건너뛰고 changes에도 안 남긴다(=사용자에게 거짓 보고 안 함).
export function applyOps(site, ops) {
  const s = structuredClone(site);
  s.profile = s.profile || {}; s.picks = s.picks || []; s.blocks = s.blocks || [];
  s.profile.socials = s.profile.socials || {};
  const changes = [];
  const at = (arr, i) => Number.isInteger(i) && i >= 0 && i < arr.length;

  for (const op of Array.isArray(ops) ? ops : []) {
    if (!op || typeof op !== "object") continue;
    switch (op.op) {
      case "set_field": {
        if (!FIELDS.includes(op.field)) break;
        const v = String(op.value ?? "");
        s.profile[op.field] = op.field === "showImages" ? v === "true" : v;
        changes.push(`${LABEL[op.field] || op.field} → ${v || "(지움)"}`);
        break;
      }
      case "set_social": {
        if (!SOCIALS.includes(op.platform)) break;
        s.profile.socials[op.platform] = String(op.url ?? "");
        changes.push(`${op.platform} 링크 ${op.url ? "설정" : "지움"}`);
        break;
      }
      case "set_stickers": {
        s.profile.stickers = (Array.isArray(op.stickers) ? op.stickers : []).slice(0, 6);
        changes.push(`스티커 ${s.profile.stickers.length}개`);
        break;
      }
      case "add_pick": {
        s.picks.push({ topic: String(op.topic ?? ""), verdict: String(op.verdict ?? ""), status: "live", buttons: Array.isArray(op.buttons) ? op.buttons : [] });
        changes.push(`픽 추가: ${op.topic || "(제목 없음)"}`);
        break;
      }
      case "update_pick": {
        if (!at(s.picks, op.index)) break;
        const p = s.picks[op.index];
        if (op.topic) { p.topic = String(op.topic); }
        if (op.verdict) { p.verdict = String(op.verdict); }
        if (op.status) { p.status = String(op.status); }
        changes.push(`픽 ${op.index + 1}번 수정`);
        break;
      }
      case "remove_pick": {
        if (!at(s.picks, op.index)) break;
        changes.push(`픽 삭제: ${s.picks[op.index].topic || "(제목 없음)"}`);
        s.picks.splice(op.index, 1);
        break;
      }
      case "add_block": {
        s.blocks.push({ type: op.type || "text", title: String(op.title ?? ""), body: String(op.body ?? ""), url: String(op.url ?? ""), label: String(op.label ?? "") });
        changes.push(`블록 추가: ${op.title || op.type}`);
        break;
      }
      case "remove_block": {
        if (!at(s.blocks, op.index)) break;
        changes.push(`블록 삭제: ${s.blocks[op.index].title || s.blocks[op.index].type}`);
        s.blocks.splice(op.index, 1);
        break;
      }
    }
  }
  return { site: s, changes };
}
