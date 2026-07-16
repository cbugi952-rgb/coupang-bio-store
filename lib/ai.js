// AI 제공자 어댑터 — generate.js·edit.js가 쓰는 호출은 한 가지 모양뿐이다:
//   시스템 프롬프트 + 사용자 메시지 + JSON 스키마 → 스키마를 지키는 JSON.
// 그 모양을 여기 한 곳에 두고 OpenAI / Anthropic 둘 다 지원한다.
// 부기가 크레딧 있는 쪽을 쓰다가 떨어지면 env 하나만 바꿔 갈아탄다(코드 수정 X).
//
// 고르는 법: AI_PROVIDER=openai|anthropic. 안 정하면 키가 있는 쪽을 자동으로.
// 모델은 ONSHELF_GEN_MODEL로 덮어쓸 수 있다(기본은 각 제공자의 저가 티어).
//
// 스키마는 두 제공자의 structured output 제약을 모두 만족해야 한다:
//   모든 object에 additionalProperties:false + 전체 required. (const 말고 enum — 아래 주석 참고)

export function aiProvider() {
  const want = String(process.env.AI_PROVIDER || "").trim().toLowerCase();
  if (want === "openai") return process.env.OPENAI_API_KEY ? "openai" : null;
  if (want === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (want) return null;                                    // 오타 등 — 조용히 다른 데로 새지 않는다
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

// 키가 없으면 호출측이 기능을 정직하게 잠근다(mailer의 mailerConfigured와 같은 규칙)
export function aiConfigured() {
  return !!aiProvider();
}

const DEFAULT_MODEL = { openai: "gpt-5-mini", anthropic: "claude-haiku-4-5" };
export const aiModel = () => process.env.ONSHELF_GEN_MODEL || DEFAULT_MODEL[aiProvider()] || "";

// 잘리거나 거부당한 응답을 그냥 파싱하면 빈 페이지가 조용히 저장된다 → 무조건 명시적으로 실패시킨다.
const TRUNCATED = "생성 결과가 잘렸습니다.";
const REFUSED = "모델이 이 요청을 거부했습니다.";
const EMPTY = "생성 결과가 비어 있습니다.";

async function viaOpenAI({ model, system, user, schema, schemaName, maxTokens }) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI();
  const res = await client.chat.completions.create({
    model,
    // max_tokens는 폐기됐고 최신(gpt-5 등) 계열과 비호환 — max_completion_tokens가 정본
    max_completion_tokens: maxTokens,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
  });
  const c = res.choices && res.choices[0];
  if (!c) throw new Error(EMPTY);
  if (c.message && c.message.refusal) throw new Error(REFUSED);
  if (c.finish_reason === "length") throw new Error(TRUNCATED);
  if (c.finish_reason === "content_filter") throw new Error(REFUSED);
  const text = c.message && c.message.content;
  if (!text) throw new Error(EMPTY);
  return JSON.parse(text);
}

async function viaAnthropic({ model, system, user, schema, maxTokens }) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: { type: "json_schema", schema } },
  });
  if (res.stop_reason === "max_tokens") throw new Error(TRUNCATED);
  if (res.stop_reason === "refusal") throw new Error(REFUSED);
  const block = res.content.find((b) => b.type === "text");
  if (!block || !block.text) throw new Error(EMPTY);
  return JSON.parse(block.text);
}

// 스키마를 지키는 JSON 하나를 받아온다. 실패는 전부 throw — 호출측이 502로 바꿔 사용자에게 알린다.
export async function completeJSON({ system, user, schema, schemaName = "result", maxTokens = 8192 }) {
  const provider = aiProvider();
  if (!provider) throw new Error("AI 키가 설정되지 않았습니다.");
  const model = aiModel();
  const args = { model, system, user, schema, schemaName, maxTokens };
  return provider === "openai" ? viaOpenAI(args) : viaAnthropic(args);
}
