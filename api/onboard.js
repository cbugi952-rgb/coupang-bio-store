// 온보딩 — 가입 직후 "빈 페이지 막막함"을 없애는 두 갈래.
//   GET  → 프리셋 목록 + 자동생성 가능 여부(genReady) + 내 핸들
//   POST { mode:"preset", preset:"warm" }        → 프리셋 스타일 적용 (AI 미사용·원가 0·항상 동작)
//   POST { mode:"youtube", url:"youtube.com/@x" } → 채널 분석 → AI 생성 → 저장
//
// 인증 = 로그인 세션(본인 사이트만). API 키 경로는 안 받는다 — 온보딩은 사람이 하는 1회성 행동.
// AI 출력은 신뢰하지 않는다: 저장은 반드시 saveSite()를 거쳐 clean()이 검증(URL 스킴 화이트리스트 등).
import { getSessionUser } from "../lib/auth.js";
import { getSite, saveSite, newPickId } from "../lib/site.js";
import { PRESETS, applyPreset } from "../lib/presets.js";
import { youtubeConfigured, parseChannelRef, fetchChannel } from "../lib/youtube.js";
import { generateSiteFromChannel, generatorConfigured } from "../lib/generate.js";
import { rateLimit } from "../lib/ratelimit.js";
import { store } from "../lib/store.js";

// 자동 생성은 두 키가 다 있어야 동작 (채널 읽기 + 생성)
const genReady = () => youtubeConfigured() && generatorConfigured();

function readBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  return b && typeof b === "object" ? b : {};
}

// 유저별 생성 횟수 — 지금은 단순 집계(과금 로직 아님). 나중 요금제를 붙일 때 여기가 후크.
async function countGeneration(handle) {
  try { return await store().incr("gen:" + handle); } catch (e) { return 0; }
}

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");

  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ ok: false, error: "로그인이 필요합니다." });
  const handle = user.handle;

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, handle, genReady: genReady(), presets: PRESETS });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }

  const b = readBody(req);

  // ── 갈래 1: 프리셋 (AI 미사용 = 키 없이도 항상 동작하는 안전망) ──
  if (b.mode === "preset") {
    const preset = PRESETS.find((p) => p.id === b.preset);
    if (!preset) return res.status(422).json({ ok: false, error: "없는 스타일이에요." });
    const site = await getSite(handle);
    site.profile = applyPreset(site.profile, preset.id);
    await saveSite(handle, site);
    return res.status(200).json({ ok: true, url: "/" + handle, applied: preset.id });
  }

  // ── 갈래 2: 유튜브 채널 → AI 자동 생성 ──
  if (b.mode === "youtube") {
    if (!genReady()) {
      return res.status(503).json({ ok: false, error: "자동 생성은 아직 준비 중이에요. 스타일을 골라 시작해주세요." });
    }
    // 남용 방어 = 하루 N회 (부기 결정: 생성 횟수 과금 대신 레이트리밋). 원가 자체는 한 장 ~10~20원.
    const rl = await rateLimit(req, { scope: "generate", limit: 10, windowSec: 86400 });
    if (!rl.ok) {
      res.setHeader("Retry-After", String(rl.retryAfter || 3600));
      return res.status(429).json({ ok: false, error: "오늘 만들 수 있는 횟수를 다 썼어요. 내일 다시 시도해주세요." });
    }

    const ref = parseChannelRef(b.url);
    if (!ref) return res.status(422).json({ ok: false, error: "유튜브 채널 주소를 확인해주세요. 예: youtube.com/@채널이름" });

    let fetched;
    try {
      fetched = await fetchChannel(ref);
    } catch (e) {
      return res.status(e.status || 502).json({ ok: false, error: e.message || "유튜브 채널을 불러오지 못했어요." });
    }
    if (!fetched.ok) return res.status(fetched.status || 422).json({ ok: false, error: fetched.error });

    let gen;
    try {
      gen = await generateSiteFromChannel(fetched.channel);
    } catch (e) {
      console.error("[onboard] generate failed:", e && e.message);
      return res.status(502).json({ ok: false, error: "페이지를 만드는 중 문제가 생겼어요. 잠시 후 다시 시도하거나 스타일을 골라 시작해주세요." });
    }

    // 생성물 → 사이트 형태로. handle·contactEmail·disclosure는 AI가 못 건드리게 기존 값 유지
    // (오고지 방지 — 고지문은 유저가 제휴를 쓸 때 직접 설정하는 값).
    const site = await getSite(handle);
    const g = (gen && gen.profile) || {};
    site.profile = {
      ...site.profile,
      ...g,
      handle,
      avatar: site.profile.avatar || "",
      contactEmail: site.profile.contactEmail || "",
      disclosure: site.profile.disclosure || "",
      socials: { ...(site.profile.socials || {}), ...(g.socials || {}) },
    };
    site.picks = (Array.isArray(gen && gen.picks) ? gen.picks : []).slice(0, 5).map((p) => ({ ...p, id: newPickId() }));
    site.blocks = (Array.isArray(gen && gen.blocks) ? gen.blocks : []).slice(0, 5).map((x) => ({ ...x, id: newPickId() }));

    const saved = await saveSite(handle, site);   // clean() = AI 출력 검증 경계
    const count = await countGeneration(handle);
    return res.status(200).json({
      ok: true, url: "/" + handle, generated: count,
      channel: fetched.channel.name, picks: saved.picks.length,
    });
  }

  return res.status(422).json({ ok: false, error: "알 수 없는 요청이에요." });
}
