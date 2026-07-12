// 간단한 고정 윈도우 레이트리밋 (Upstash INCR + EXPIRE).
// 목적 = 공개 가입/로그인/비콘 남용 방어 (무료 Upstash 쿼터 고갈 → 라이브 동반 다운 방지).
// 저장소 오류 시 fail-open (Redis 하이컵으로 정상 사용자를 락아웃하지 않음).
import { store } from "./store.js";

// 프록시(Vercel) 뒤 실제 클라이언트 IP. x-forwarded-for 첫 항목 우선.
export function clientIp(req) {
  const xff = req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"] || "";
  const first = String(xff).split(",")[0].trim();
  return first || req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "unknown";
}

// scope별 고정 윈도우 카운터. 키 = rl:{scope}:{ip}:{bucket}
// 반환: { ok, count, limit, retryAfter(초) }
export async function rateLimit(req, { scope, limit, windowSec }) {
  const ip = clientIp(req);
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl:${scope}:${ip}:${bucket}`;
  let count;
  try {
    count = await store().incr(key);
    if (count === 1) await store().expire(key, windowSec);
  } catch (e) {
    return { ok: true, count: 0, limit, retryAfter: 0 };   // fail-open
  }
  return { ok: count <= limit, count, limit, retryAfter: count <= limit ? 0 : windowSec };
}
