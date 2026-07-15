// 자체 인증 — 이메일+비밀번호(scrypt) + 세션 쿠키. 저장소 = Upstash KV.
// (MVP: 이메일검증·비번재설정·레이트리밋 미포함 — 스케일 시 관리형 인증/이메일 서비스로 확장)
import { store } from "./store.js";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_TTL = 60 * 60 * 24 * 30;   // 30일(초)
const emailKey = (e) => "email:" + String(e).trim().toLowerCase();

// ── 비밀번호 해시 (scrypt + per-user salt) ──
export function hashPassword(pw) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(pw), salt, 64).toString("hex");
  return { salt, hash };
}
export function verifyPassword(pw, salt, hash) {
  if (!salt || !hash) return false;
  let stored;
  try { stored = Buffer.from(hash, "hex"); } catch (e) { return false; }
  const h = scryptSync(String(pw), salt, 64);
  return h.length === stored.length && timingSafeEqual(h, stored);
}

// ── 쿠키 ──
export function parseCookies(req) {
  const raw = (req && req.headers && req.headers.cookie) || "";
  const out = {};
  raw.split(";").forEach((p) => { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
export function sessionCookie(token, secure, maxAge = SESSION_TTL) {
  return `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
export function clearCookie(secure) {
  return `sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

// ── 세션 ──
export async function createSession(userId) {
  const token = "s_" + randomBytes(24).toString("base64url");
  await store().set("session:" + token, { userId });
  try { await store().expire("session:" + token, SESSION_TTL); } catch (e) { /* mock/미지원 무시 */ }
  return token;
}
export async function getSessionUser(req) {
  const token = parseCookies(req).sid;
  if (!token) return null;
  let sess = null;
  try { sess = await store().get("session:" + token); } catch (e) { sess = null; }
  if (!sess || !sess.userId) return null;
  return getUserById(sess.userId);
}
export async function destroySession(req) {
  const token = parseCookies(req).sid;
  if (token) { try { await store().del("session:" + token); } catch (e) {} }
}

// ── 유저 ──
export async function getUserByEmail(email) {
  let id = null;
  try { id = await store().get(emailKey(email)); } catch (e) { id = null; }
  return id ? getUserById(id) : null;
}
export async function getUserById(id) {
  try { return await store().get("user:" + id); } catch (e) { return null; }
}
export async function createUser(email, password, handle) {
  const id = "u_" + randomBytes(10).toString("hex");
  const { salt, hash } = hashPassword(password);
  const user = { id, email: String(email).trim(), salt, hash, handle, createdAt: Date.now() };
  await store().set("user:" + id, user);
  await store().set(emailKey(email), id);
  return user;
}
export async function saveUser(u) { await store().set("user:" + u.id, u); return u; }

// ── 비밀번호 재설정 토큰 (reset:{token} → { userId, at }, TTL 30분) ──
const RESET_TTL = 60 * 30;
export async function createResetToken(userId) {
  const token = "r_" + randomBytes(24).toString("base64url");
  await store().set("reset:" + token, { userId, at: Date.now() });
  try { await store().expire("reset:" + token, RESET_TTL); } catch (e) { /* mock/미지원 무시 */ }
  return token;
}
// 유효하면 userId 반환, 아니면 null. store expire 미지원 대비 age도 직접 검사.
export async function consumeResetToken(token) {
  if (!token) return null;
  let rec = null;
  try { rec = await store().get("reset:" + token); } catch (e) { rec = null; }
  if (!rec || !rec.userId) return null;
  if (rec.at && Date.now() - rec.at > RESET_TTL * 1000) { try { await store().del("reset:" + token); } catch (e) {} return null; }
  return rec.userId;
}
export async function deleteResetToken(token) { if (token) { try { await store().del("reset:" + token); } catch (e) {} } }
export async function setUserPassword(user, newPassword) {
  const { salt, hash } = hashPassword(newPassword);
  user.salt = salt; user.hash = hash;
  await saveUser(user);
  return user;
}

// 요청 host가 로컬이 아니면 Secure 쿠키 (프로덕션 https)
export function isSecureReq(req) {
  const host = (req && req.headers && req.headers.host) || "";
  return !/^(localhost|127\.|0\.0\.0\.0|\[?::1)/.test(host);
}
