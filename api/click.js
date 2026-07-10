// 클릭 집계 — POST(공개, 카운트 +1) / GET(관리자, 카운트 조회).
// Redis 해시 "clicks:{handle}", 필드 = "{pickId}:{store}" (store = coupang | toss).
import { store, handleFrom } from "../lib/store.js";

const STORES = ["coupang", "toss"];

export default async function handler(req, res) {
  const HKEY = "clicks:" + handleFrom(req);

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
    const id = body && typeof body.id === "string" ? body.id.slice(0, 40) : "";
    const shop = body && STORES.includes(body.store) ? body.store : "";
    if (!id || !shop) return res.status(400).json({ ok: false });
    try { await store().hincrby(HKEY, `${id}:${shop}`, 1); } catch (e) { /* 조용히 무시 */ }
    return res.status(204).end();
  }

  if (req.method === "GET") {
    const key = req.headers["x-admin-key"] || "";
    if (!process.env.ADMIN_PASSWORD || key !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    let counts = {};
    try { counts = (await store().hgetall(HKEY)) || {}; } catch (e) { counts = {}; }
    res.setHeader("cache-control", "no-store");
    return res.status(200).json({ ok: true, counts });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false });
}
