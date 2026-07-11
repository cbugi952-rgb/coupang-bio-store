// 세밀(RESTful) 사이트 API — CLI·MCP·자동화가 치는 프로그램용 엔드포인트.
// 경로: /api/sites/{handle}[/picks[/{id}[/latest]]] | /picks/reorder | /profile | /stats
// 공개 GET(사이트 읽기)만 무인증, 나머지 쓰기는 authorize()(API키 또는 관리자 비번).
// 통짜 저장 GUI는 그대로 /api/picks 사용 — 이 파일은 병렬 추가(기존 동작 불변).
import { store } from "../../lib/store.js";
import {
  DEFAULT, siteKey, getSite, saveSite, cleanPick, mergeProfile,
  enforceSingleLatest, newPickId, authorize
} from "../../lib/site.js";

const sanitizeHandle = (h) => String(h || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 40);

function readBody(req) {
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return {}; } }
  return body && typeof body === "object" ? body : {};
}

const ok = (res, obj, status = 200) => res.status(status).json({ ok: true, ...obj });
const fail = (res, status, error) => res.status(status).json({ ok: false, error });

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json; charset=utf-8");

  const parts = Array.isArray(req.query.path) ? req.query.path
    : (req.query.path ? [req.query.path] : []);
  const handle = sanitizeHandle(parts[0]);
  if (!handle) return fail(res, 400, "사이트 핸들이 필요합니다.");
  const seg1 = parts[1] || "";   // "" | picks | profile | stats
  const seg2 = parts[2] || "";   // {pickId} | reorder
  const seg3 = parts[3] || "";   // latest
  const method = req.method;

  // ── 공개 읽기: GET /sites/{h} ──
  if (method === "GET" && !seg1) {
    let data = null;
    try { data = await store().get(siteKey(handle)); } catch (e) { data = null; }
    res.setHeader("cache-control", "public, s-maxage=30, stale-while-revalidate=60");
    return res.status(200).json(data || DEFAULT);
  }

  // ── 이하 전부 인증 필요 ──
  const auth = await authorize(req, handle);
  if (!auth.ok) return fail(res, auth.status, auth.error);

  // PUT /sites/{h} — 통짜 교체
  if (method === "PUT" && !seg1) {
    const body = readBody(req);
    if (!Array.isArray(body.picks)) return fail(res, 422, "picks 배열이 필요합니다.");
    const saved = await saveSite(handle, body);
    return ok(res, { site: saved });
  }

  // GET /sites/{h}/picks — 목록
  if (method === "GET" && seg1 === "picks" && !seg2) {
    const site = await getSite(handle);
    return ok(res, { picks: site.picks });
  }

  // POST /sites/{h}/picks — 추가 (맨 앞 = 최신 관례) → 생성된 픽 반환
  if (method === "POST" && seg1 === "picks" && !seg2) {
    const body = readBody(req);
    if (!body.topic) return fail(res, 422, "topic(주제)은 필수입니다.");
    const site = await getSite(handle);
    const pick = cleanPick({ ...body, id: newPickId() });
    site.picks.unshift(pick);
    enforceSingleLatest(site.picks);
    await saveSite(handle, site);
    return ok(res, { pick }, 201);
  }

  // POST /sites/{h}/picks/reorder — body { ids:[...] }
  if (method === "POST" && seg1 === "picks" && seg2 === "reorder") {
    const ids = readBody(req).ids;
    if (!Array.isArray(ids)) return fail(res, 422, "ids 배열이 필요합니다.");
    const site = await getSite(handle);
    const byId = new Map(site.picks.map((p) => [p.id, p]));
    const next = [];
    for (const id of ids) { const p = byId.get(id); if (p) { next.push(p); byId.delete(id); } }
    for (const p of byId.values()) next.push(p);   // 목록에 빠진 픽은 뒤로
    site.picks = next;
    await saveSite(handle, site);
    return ok(res, { picks: site.picks });
  }

  // POST /sites/{h}/picks/{id}/latest — 최신 지정
  if (method === "POST" && seg1 === "picks" && seg2 && seg3 === "latest") {
    const site = await getSite(handle);
    const target = site.picks.find((p) => p.id === seg2);
    if (!target) return fail(res, 404, "픽을 찾을 수 없습니다.");
    site.picks.forEach((p) => { if (p.status === "latest") p.status = "live"; });
    target.status = "latest";
    await saveSite(handle, site);
    return ok(res, { pick: target });
  }

  // PATCH /sites/{h}/picks/{id} — 부분 수정
  if (method === "PATCH" && seg1 === "picks" && seg2) {
    const body = readBody(req);
    const site = await getSite(handle);
    const i = site.picks.findIndex((p) => p.id === seg2);
    if (i < 0) return fail(res, 404, "픽을 찾을 수 없습니다.");
    site.picks[i] = cleanPick({ ...site.picks[i], ...body, id: site.picks[i].id });
    enforceSingleLatest(site.picks);
    await saveSite(handle, site);
    return ok(res, { pick: site.picks[i] });
  }

  // DELETE /sites/{h}/picks/{id}
  if (method === "DELETE" && seg1 === "picks" && seg2) {
    const site = await getSite(handle);
    const i = site.picks.findIndex((p) => p.id === seg2);
    if (i < 0) return fail(res, 404, "픽을 찾을 수 없습니다.");
    const [removed] = site.picks.splice(i, 1);
    await saveSite(handle, site);
    return ok(res, { removed: removed.id });
  }

  // PATCH /sites/{h}/profile — 프로필 필드 병합
  if (method === "PATCH" && seg1 === "profile") {
    const body = readBody(req);
    const site = await getSite(handle);
    site.profile = mergeProfile(site.profile, body.profile || body);
    const saved = await saveSite(handle, site);
    return ok(res, { profile: saved.profile });
  }

  // GET /sites/{h}/stats — 방문·클릭·전환율 (관리자/키)
  if (method === "GET" && seg1 === "stats") {
    let clicks = {}, views = {};
    try { clicks = (await store().hgetall("clicks:" + handle)) || {}; } catch (e) { clicks = {}; }
    try { views = (await store().hgetall("views:" + handle)) || {}; } catch (e) { views = {}; }
    const totalViews = Number(views.total || 0);
    const totalClicks = Object.values(clicks).reduce((a, b) => a + Number(b || 0), 0);
    const ctr = totalViews ? Math.round((totalClicks / totalViews) * 1000) / 10 : 0;
    return ok(res, { stats: { views, clicks, totalViews, totalClicks, ctr } });
  }

  res.setHeader("Allow", "GET, POST, PATCH, PUT, DELETE");
  return fail(res, 404, "알 수 없는 경로 또는 메서드입니다.");
}
