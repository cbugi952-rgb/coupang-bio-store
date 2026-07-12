// 인증 엔드포인트: POST /api/auth/{signup|login|logout} · GET /api/auth/me
import {
  verifyPassword, createSession, destroySession, getSessionUser,
  getUserByEmail, createUser, sessionCookie, clearCookie, isSecureReq, saveUser,
} from "../../lib/auth.js";
import { provisionSite, sanitizeHandle, issueKey } from "../../lib/site.js";
import { rateLimit } from "../../lib/ratelimit.js";
import { store } from "../../lib/store.js";

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const tooMany = (res, rl, msg) => {
  res.setHeader("Retry-After", String(rl.retryAfter || 60));
  return res.status(429).json({ ok: false, error: msg });
};
function readBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  return b && typeof b === "object" ? b : {};
}

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  // GET /me — 로그인 상태
  if (action === "me") {
    const u = await getSessionUser(req);
    if (!u) return res.status(401).json({ ok: false });
    return res.status(200).json({ ok: true, email: u.email, handle: u.handle });
  }

  // API 키 조회/재발급 (로그인 세션) — CLI·MCP·REST 연동용
  if (action === "apikey") {
    const u = await getSessionUser(req);
    if (!u) return res.status(401).json({ ok: false, error: "로그인이 필요합니다." });
    if (req.method === "GET") return res.status(200).json({ ok: true, key: u.apikey || null, handle: u.handle });
    if (req.method === "POST") {
      const rl = await rateLimit(req, { scope: "apikey", limit: 10, windowSec: 600 });
      if (!rl.ok) return tooMany(res, rl, "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
      const key = await issueKey(u.handle);
      if (u.apikey) { try { await store().del("apikey:" + u.apikey); } catch (e) {} }   // 옛 키 폐기
      u.apikey = key; await saveUser(u);
      return res.status(200).json({ ok: true, key });
    }
    res.setHeader("Allow", "GET, POST"); return res.status(405).json({ ok: false });
  }

  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "method not allowed" }); }
  const b = readBody(req);
  const secure = isSecureReq(req);

  if (action === "logout") {
    await destroySession(req);
    res.setHeader("Set-Cookie", clearCookie(secure));
    return res.status(200).json({ ok: true });
  }

  if (action === "signup") {
    // 가입 남용 방어 = 사이트/키/유저 키가 무제한 생성되어 Upstash 쿼터 터지는 것 차단
    const rl = await rateLimit(req, { scope: "signup", limit: 5, windowSec: 3600 });
    if (!rl.ok) return tooMany(res, rl, "가입 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.");
    const email = String(b.email || "").trim();
    const password = String(b.password || "");
    const handle = sanitizeHandle(b.handle);
    if (!emailRe.test(email)) return res.status(422).json({ ok: false, error: "이메일 형식이 올바르지 않습니다." });
    if (password.length < 6) return res.status(422).json({ ok: false, error: "비밀번호는 6자 이상이어야 합니다." });
    if (!handle) return res.status(422).json({ ok: false, error: "주소(핸들)를 입력하세요 — 영문·숫자·-·_" });
    if (await getUserByEmail(email)) return res.status(409).json({ ok: false, error: "이미 가입된 이메일입니다." });
    const prov = await provisionSite(handle, { name: handle });
    if (!prov.ok) return res.status(prov.status || 409).json({ ok: false, error: prov.error || "이미 쓰이는 주소입니다." });
    const user = await createUser(email, password, handle);
    user.apikey = prov.key; await saveUser(user);   // 키를 유저에 저장 → 나중에 관리자에서 조회
    const token = await createSession(user.id);
    res.setHeader("Set-Cookie", sessionCookie(token, secure));
    return res.status(201).json({ ok: true, handle, key: prov.key });
  }

  if (action === "login") {
    // 무차별 대입(brute-force) 방어
    const rl = await rateLimit(req, { scope: "login", limit: 12, windowSec: 600 });
    if (!rl.ok) return tooMany(res, rl, "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.");
    const email = String(b.email || "").trim();
    const user = await getUserByEmail(email);
    if (!user || !verifyPassword(String(b.password || ""), user.salt, user.hash)) {
      return res.status(401).json({ ok: false, error: "이메일 또는 비밀번호가 맞지 않습니다." });
    }
    const token = await createSession(user.id);
    res.setHeader("Set-Cookie", sessionCookie(token, secure));
    return res.status(200).json({ ok: true, handle: user.handle });
  }

  return res.status(404).json({ ok: false, error: "알 수 없는 요청입니다." });
}
