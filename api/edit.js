// 대화형 수정 — POST { message } → 자연어를 연산으로 옮겨 내 페이지에 적용.
//   GET  → { ready } (키 없으면 UI가 정직하게 잠근다)
//   POST → { ok, reply, changes[], site }
// 인증 = 로그인 세션(본인 사이트만). 적용은 saveSite()의 clean()을 거친다 = AI 출력 신뢰 안 함.
import { getSessionUser } from "../lib/auth.js";
import { getSite, saveSite, newPickId } from "../lib/site.js";
import { planEdits, applyOps, editorConfigured } from "../lib/edit.js";
import { rateLimit } from "../lib/ratelimit.js";
import { store } from "../lib/store.js";

function readBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  return b && typeof b === "object" ? b : {};
}

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");

  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ ok: false, error: "로그인이 필요합니다." });
  const handle = user.handle;

  if (req.method === "GET") return res.status(200).json({ ok: true, ready: editorConfigured() });
  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ ok: false, error: "method not allowed" }); }

  if (!editorConfigured()) {
    return res.status(503).json({ ok: false, error: "대화로 수정하는 기능은 아직 준비 중이에요." });
  }
  const message = String(readBody(req).message || "").trim().slice(0, 500);
  if (!message) return res.status(422).json({ ok: false, error: "무엇을 바꿀지 알려주세요." });

  // 남용 방어 — 생성보다 가볍고 반복 호출이 자연스러운 기능이라 한도를 넉넉히
  const rl = await rateLimit(req, { scope: "edit", limit: 60, windowSec: 3600 });
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter || 600));
    return res.status(429).json({ ok: false, error: "요청이 너무 많아요. 잠시 후 다시 시도해주세요." });
  }

  const before = await getSite(handle);
  let plan;
  try {
    plan = await planEdits(before, message);
  } catch (e) {
    console.error("[edit] plan failed:", e && e.message);
    return res.status(502).json({ ok: false, error: "요청을 이해하는 중 문제가 생겼어요. 다시 말해주세요." });
  }

  // 바꿀 게 없으면(모호해서 되물음) 저장하지 않는다
  if (!plan.ops.length) {
    return res.status(200).json({ ok: true, reply: plan.reply || "무엇을 바꿀지 조금 더 알려주세요.", changes: [], site: before });
  }

  const { site, changes } = applyOps(before, plan.ops);
  // 새로 생긴 픽·블록에 서버 id 부여 (기존 항목의 id는 applyOps가 보존)
  for (const p of site.picks) if (!p.id) p.id = newPickId();
  for (const b of site.blocks) if (!b.id) b.id = newPickId();

  const saved = await saveSite(handle, site);   // clean() = AI 출력 검증 경계
  try { await store().incr("edit:" + handle); } catch (e) {}   // 집계용 숫자(과금 로직 아님)

  return res.status(200).json({ ok: true, reply: plan.reply, changes, site: saved });
}
