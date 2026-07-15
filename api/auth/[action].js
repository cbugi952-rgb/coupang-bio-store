// 인증 엔드포인트: POST /api/auth/{signup|login|logout} · GET /api/auth/me
import {
  verifyPassword, createSession, destroySession, getSessionUser,
  getUserByEmail, getUserById, createUser, sessionCookie, clearCookie, isSecureReq, saveUser,
  createResetToken, consumeResetToken, deleteResetToken, setUserPassword,
  createVerifyToken, consumeVerifyToken, deleteVerifyToken,
} from "../../lib/auth.js";
import { provisionSite, sanitizeHandle, issueKey } from "../../lib/site.js";
import { rateLimit } from "../../lib/ratelimit.js";
import { sendMail, mailerConfigured } from "../../lib/mailer.js";
import { store } from "../../lib/store.js";

const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const tooMany = (res, rl, msg) => {
  res.setHeader("Retry-After", String(rl.retryAfter || 60));
  return res.status(429).json({ ok: false, error: msg });
};
function baseUrl(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = req.headers["host"] || "onshelf.vercel.app";
  return `${proto}://${host}`;
}
function readBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  return b && typeof b === "object" ? b : {};
}

// 이메일 인증 링크 발송 — 토큰은 이메일로만(HTTP 응답/로그 미노출). 키 미설정 시 mailer가 무발송.
async function sendVerifyMail(req, user) {
  const token = await createVerifyToken(user.id);
  const link = `${baseUrl(req)}/verify?token=${token}`;
  await sendMail({
    to: user.email,
    subject: "[Onshelf] 이메일 인증",
    text: `아래 링크를 눌러 이메일을 인증해주세요 (24시간 내 유효):\n${link}\n\n요청한 적이 없다면 이 메일을 무시하세요.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:440px"><p>Onshelf 가입을 환영해요! 아래 버튼을 눌러 이메일을 인증해주세요. <b>24시간</b> 동안 유효합니다.</p><p><a href="${link}" style="display:inline-block;background:#23A455;color:#fff;font-weight:700;padding:12px 22px;border-radius:10px;text-decoration:none">이메일 인증하기</a></p><p style="color:#888;font-size:13px">요청한 적이 없다면 이 메일을 무시하세요.</p></div>`,
  });
}

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  // GET /me — 로그인 상태
  if (action === "me") {
    const u = await getSessionUser(req);
    if (!u) return res.status(401).json({ ok: false });
    return res.status(200).json({ ok: true, email: u.email, handle: u.handle, verified: !!u.verified, mailReady: mailerConfigured() });
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
    try { await sendVerifyMail(req, user); } catch (e) { /* 비차단 — 가입은 성공, 인증메일 실패해도 진행 */ }
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

  // 비밀번호 재설정 요청 — 이메일로 링크 발송. 열거 방지 위해 항상 동일 응답.
  if (action === "forgot") {
    const rl = await rateLimit(req, { scope: "forgot", limit: 5, windowSec: 3600 });
    if (!rl.ok) return tooMany(res, rl, "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
    const email = String(b.email || "").trim();
    const generic = { ok: true, message: "가입된 이메일이라면 재설정 링크를 보냈어요. 메일함(스팸함 포함)을 확인해주세요." };
    if (!emailRe.test(email)) return res.status(200).json(generic);
    const user = await getUserByEmail(email);
    if (user) {
      const token = await createResetToken(user.id);
      const link = `${baseUrl(req)}/reset?token=${token}`;
      // 링크는 이메일로만 — HTTP 응답/로그에 노출 금지(계정 탈취 방지). 키 미설정 시 mailer가 무발송.
      await sendMail({
        to: user.email,
        subject: "[Onshelf] 비밀번호 재설정",
        text: `아래 링크에서 비밀번호를 재설정하세요 (30분 내 유효):\n${link}\n\n요청한 적이 없다면 이 메일을 무시하세요.`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:440px"><p>Onshelf 비밀번호를 재설정하려면 아래 버튼을 누르세요. <b>30분</b> 동안 유효합니다.</p><p><a href="${link}" style="display:inline-block;background:#23A455;color:#fff;font-weight:700;padding:12px 22px;border-radius:10px;text-decoration:none">비밀번호 재설정</a></p><p style="color:#888;font-size:13px">요청한 적이 없다면 이 메일을 무시하세요.</p></div>`,
      });
    }
    return res.status(200).json(generic);
  }

  // 새 비밀번호로 변경 (재설정 토큰 소비)
  if (action === "reset") {
    const rl = await rateLimit(req, { scope: "reset", limit: 10, windowSec: 3600 });
    if (!rl.ok) return tooMany(res, rl, "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
    const token = String(b.token || "");
    const password = String(b.password || "");
    if (password.length < 6) return res.status(422).json({ ok: false, error: "비밀번호는 6자 이상이어야 합니다." });
    const userId = await consumeResetToken(token);
    if (!userId) return res.status(400).json({ ok: false, error: "링크가 만료되었거나 올바르지 않아요. 다시 요청해주세요." });
    const user = await getUserById(userId);
    if (!user) { await deleteResetToken(token); return res.status(400).json({ ok: false, error: "계정을 찾을 수 없어요." }); }
    await setUserPassword(user, password);
    await deleteResetToken(token);
    return res.status(200).json({ ok: true, message: "비밀번호가 바뀌었어요. 새 비밀번호로 로그인하세요." });
  }

  // 이메일 인증 (가입 시 발송한 토큰 소비) — verify.html이 POST
  if (action === "verify") {
    const rl = await rateLimit(req, { scope: "verify", limit: 20, windowSec: 3600 });
    if (!rl.ok) return tooMany(res, rl, "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
    const token = String(b.token || "");
    const userId = await consumeVerifyToken(token);
    if (!userId) return res.status(400).json({ ok: false, error: "링크가 만료되었거나 올바르지 않아요. 다시 요청해주세요." });
    const user = await getUserById(userId);
    if (!user) { await deleteVerifyToken(token); return res.status(400).json({ ok: false, error: "계정을 찾을 수 없어요." }); }
    user.verified = true; await saveUser(user);
    await deleteVerifyToken(token);
    return res.status(200).json({ ok: true, message: "이메일 인증이 완료되었어요." });
  }

  // 인증 메일 재전송 (로그인 세션 본인만) — 미인증일 때만 발송
  if (action === "resend-verify") {
    const u = await getSessionUser(req);
    if (!u) return res.status(401).json({ ok: false, error: "로그인이 필요합니다." });
    const rl = await rateLimit(req, { scope: "resend-verify", limit: 5, windowSec: 3600 });
    if (!rl.ok) return tooMany(res, rl, "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
    if (u.verified) return res.status(200).json({ ok: true, message: "이미 인증된 이메일이에요." });
    try { await sendVerifyMail(req, u); } catch (e) {}
    return res.status(200).json({ ok: true, message: "인증 메일을 다시 보냈어요. 메일함(스팸함 포함)을 확인해주세요." });
  }

  return res.status(404).json({ ok: false, error: "알 수 없는 요청입니다." });
}
