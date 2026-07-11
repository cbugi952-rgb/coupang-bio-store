// Vercel Serverless Function — GET(공개 읽기) / PUT(관리자 통짜 저장).
// 검증·정리·인증 로직은 lib/site.js 공용. 세밀 조작은 api/sites/[...path].js.
// 저장소: Upstash Redis. 멀티테넌트 KV 키 = site:{handle} (기본 = kkanajae).
import { store, handleFrom } from "../lib/store.js";
import { DEFAULT, siteKey, clean, enforceSingleLatest } from "../lib/site.js";

export { clean };   // 기존 테스트 호환 (clean을 picks.js에서 import하던 코드 유지)

export default async function handler(req, res) {
  const handle = handleFrom(req);

  if (req.method === "GET") {
    let data = null;
    try { data = await store().get(siteKey(handle)); } catch (e) { data = null; }
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "public, s-maxage=30, stale-while-revalidate=60");
    return res.status(200).json(data || DEFAULT);
  }

  if (req.method === "PUT") {
    const key = req.headers["x-admin-key"] || "";
    if (!process.env.ADMIN_PASSWORD || key !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ ok: false, error: "비밀번호가 맞지 않습니다." });
    }
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); }
      catch { return res.status(400).json({ ok: false, error: "JSON 형식이 아닙니다." }); }
    }
    if (!body || typeof body !== "object" || !Array.isArray(body.picks)) {
      return res.status(422).json({ ok: false, error: "데이터 구조가 올바르지 않습니다." });
    }
    const data = clean(body);
    enforceSingleLatest(data.picks);
    await store().set(siteKey(handle), data);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ ok: false, error: "method not allowed" });
}
