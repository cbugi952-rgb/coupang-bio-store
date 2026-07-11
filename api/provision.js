// 사이트 프로비저닝 — 운영자(마스터)가 새 사이트+키를 발급한다. (공개 회원가입은 Phase2)
// POST /api/provision  { handle, name?, force? }  →  { ok, handle, key, url }
// 인증: 마스터 시크릿 = env ADMIN_PASSWORD (x-admin-key 헤더 또는 Bearer).
import { provisionSite } from "../lib/site.js";

function isMaster(req) {
  const pw = process.env.ADMIN_PASSWORD || "";
  if (!pw) return false;
  const x = req.headers["x-admin-key"] || "";
  const raw = req.headers["authorization"] || "";
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  const b = m ? m[1].trim() : "";
  return x === pw || b === pw;
}

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }
  if (!isMaster(req)) return res.status(401).json({ ok: false, error: "운영자 인증이 필요합니다." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const result = await provisionSite(body.handle, { name: body.name, force: !!body.force });
  if (!result.ok) return res.status(result.status || 400).json(result);
  return res.status(201).json(result);
}
