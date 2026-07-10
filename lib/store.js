// 공유 저장소 싱글턴 + 사이트 핸들 유틸 (picks.js / click.js / view.js 공용).
// 테스트에서는 __setStoreForTest 로 인메모리 목으로 대체.
import { Redis } from "@upstash/redis";

let _redis;
export function store() {
  if (_redis) return _redis;
  // Vercel의 Upstash 통합은 KV_* 이름으로 주입 → UPSTASH_* / KV_* 둘 다 지원
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  _redis = new Redis({ url, token });
  return _redis;
}
export function __setStoreForTest(r) { _redis = r; }

// 요청에서 사이트 핸들을 안전하게 뽑는다 (멀티테넌트 대비 — 지금은 기본 1개).
// ?handle=xxx  (없으면 DEFAULT_HANDLE, 그것도 없으면 "kkanajae"). 영숫자/-/_ 만 허용.
export function handleFrom(req) {
  let h = req && req.query ? req.query.handle : undefined;
  if (!h) { try { h = new URL(req.url, "http://x").searchParams.get("handle"); } catch (e) {} }
  h = String(h || process.env.DEFAULT_HANDLE || "kkanajae").replace(/[^a-z0-9_-]/gi, "").slice(0, 40);
  return h || "kkanajae";
}
