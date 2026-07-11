// 인증 엔드포인트: POST /api/auth/{signup|login|logout} · GET /api/auth/me
import {
  verifyPassword, createSession, destroySession, getSessionUser,
  getUserByEmail, createUser, sessionCookie, clearCookie, isSecureReq,
} from "../../lib/auth.js";
import { provisionSite, sanitizeHandle } from "../../lib/site.js";

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
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

  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "method not allowed" }); }
  const b = readBody(req);
  const secure = isSecureReq(req);

  if (action === "logout") {
    await destroySession(req);
    res.setHeader("Set-Cookie", clearCookie(secure));
    return res.status(200).json({ ok: true });
  }

  if (action === "signup") {
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
    const token = await createSession(user.id);
    res.setHeader("Set-Cookie", sessionCookie(token, secure));
    return res.status(201).json({ ok: true, handle, key: prov.key });
  }

  if (action === "login") {
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
