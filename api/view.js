// 방문·유입 집계 — POST(공개, 페이지뷰 +1 · 유입경로 +1) / GET(관리자, 조회).
// Redis 해시 "views:{handle}", 필드 = total + 유입경로(instagram|tiktok|youtube|direct|other).
import { store, handleFrom } from "../lib/store.js";

const SOURCES = ["instagram", "tiktok", "youtube", "direct", "other"];

export default async function handler(req, res) {
  const HKEY = "views:" + handleFrom(req);

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
    const src = body && SOURCES.includes(body.source) ? body.source : "other";
    try { await store().hincrby(HKEY, "total", 1); await store().hincrby(HKEY, src, 1); } catch (e) { /* 무시 */ }
    return res.status(204).end();
  }

  if (req.method === "GET") {
    const key = req.headers["x-admin-key"] || "";
    if (!process.env.ADMIN_PASSWORD || key !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    let views = {};
    try { views = (await store().hgetall(HKEY)) || {}; } catch (e) { views = {}; }
    res.setHeader("cache-control", "no-store");
    return res.status(200).json({ ok: true, views });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false });
}
