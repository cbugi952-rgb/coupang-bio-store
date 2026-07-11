// 사이트 데이터 공용 로직 — picks.js(통짜 저장) + sites/[...path].js(세밀 API) 공용 소스.
// 검증·정리(clean/safeUrl)·인증은 여기 한 곳에만. 저장소 접근은 lib/store.js.
import { store } from "./store.js";

export const siteKey = (h) => "site:" + h;

// 사이트 기본값 (브랜드·기능 전부 데이터화 → 깐깐아재 = "1호 사이트")
export const DEFAULT = {
  profile: {
    name: "깐깐아재",
    handle: "kkanajae",
    tagline: "아재가 골라줬어",
    bio: "싸다고 다 사지 마세요.\n아재가 깐깐하게 따져서 골라줍니다.",
    avatar: "assets/avatar.jpg",
    accent: "#FFD400",
    notice: "",
    contactEmail: "",
    disclosure: "본 페이지의 상품 링크는 쿠팡 파트너스·토스쇼핑 쉐어링크 활동의 일환으로, 구매 시 이에 따른 일정액의 수수료를 제공받습니다.",
    socials: { youtube: "", tiktok: "", instagram: "", threads: "", naverBlog: "", x: "" }
  },
  picks: []
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const s = (v, n) => String(v ?? "").slice(0, n);
const STATUSES = ["latest", "live", "hidden"];

// URL 스킴 화이트리스트: http(s)·mailto·상대경로만 (javascript:/data: 차단 → XSS 방지)
export function safeUrl(v, n) {
  const u = String(v ?? "").trim().slice(0, n);
  if (!u) return "";
  const m = u.match(/^([a-z][a-z0-9+.\-]*):/i);   // 스킴 있나?
  if (!m) return u;                               // 스킴 없음 = 상대경로/#/앵커 → OK
  const scheme = m[1].toLowerCase();
  return (scheme === "http" || scheme === "https" || scheme === "mailto") ? u : "";
}

// 픽 하나 정리 (POST/PATCH/통짜 저장 공용). id는 호출측에서 보장.
export function cleanPick(p) {
  p = p || {};
  return {
    id: s(p.id, 40),
    ep: s(p.ep, 12),
    topic: s(p.topic, 60),
    verdict: s(p.verdict, 80),
    category: s(p.category, 20),
    image: safeUrl(p.image, 300),
    youtube: safeUrl(p.youtube, 200),   // 쇼츠 링크 (선택)
    coupang: safeUrl(p.coupang, 500),
    toss: safeUrl(p.toss, 500),
    status: STATUSES.includes(p.status) ? p.status : "live"
  };
}

// 신뢰 못 할 body → 안전한 사이트 형태로 (통짜 저장용)
export function clean(data) {
  data = data || {};
  const pf = data.profile || {};
  const sc = pf.socials || {};
  return {
    profile: {
      name: s(pf.name ?? "깐깐아재", 40),
      handle: s(pf.handle ?? "kkanajae", 40).replace(/^@/, ""),
      tagline: s(pf.tagline ?? "아재가 골라줬어", 24),
      bio: s(pf.bio, 200),
      avatar: safeUrl(pf.avatar || "assets/avatar.jpg", 300),
      accent: HEX.test(pf.accent || "") ? pf.accent : "#FFD400",
      notice: s(pf.notice, 120),
      contactEmail: s(pf.contactEmail, 120),
      disclosure: s(pf.disclosure || DEFAULT.profile.disclosure, 300),
      socials: {
        youtube: safeUrl(sc.youtube, 300), tiktok: safeUrl(sc.tiktok, 300), instagram: safeUrl(sc.instagram, 300),
        threads: safeUrl(sc.threads, 300), naverBlog: safeUrl(sc.naverBlog, 300), x: safeUrl(sc.x, 300)
      }
    },
    picks: (Array.isArray(data.picks) ? data.picks : []).slice(0, 100).map(cleanPick)
  };
}

// 프로필 부분 병합 (PATCH /profile) — 들어온 필드만 덮어씀. 정규화는 saveSite의 clean이 담당.
export function mergeProfile(base, patch) {
  patch = patch || {};
  const merged = { ...base, ...patch };
  if (patch.socials) merged.socials = { ...(base.socials || {}), ...patch.socials };
  return merged;
}

// 최신(latest)은 최대 1개만
export function enforceSingleLatest(picks) {
  let seen = false;
  for (const p of picks) {
    if (p.status === "latest") { if (seen) p.status = "live"; else seen = true; }
  }
  return picks;
}

// 저장소 read/modify/write 헬퍼
export async function getSite(handle) {
  let data = null;
  try { data = await store().get(siteKey(handle)); } catch (e) { data = null; }
  return data || structuredClone(DEFAULT);
}
export async function saveSite(handle, data) {
  const cleaned = clean(data);
  enforceSingleLatest(cleaned.picks);
  await store().set(siteKey(handle), cleaned);
  return cleaned;
}

// 서버측 픽 ID (관리자 GUI의 uid()와 동일 형식)
export function newPickId() {
  return "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

// 인증: 요청이 이 handle에 쓸 권한이 있나.
//  - Authorization: Bearer sk_live_...  →  apikey:{key} == { handle }  (사이트 스코프)
//  - x-admin-key 또는 Bearer == ADMIN_PASSWORD  →  기본 사이트(DEFAULT_HANDLE) 소유자 (레거시 GUI·도그푸딩)
// 반환: { ok:true, via } | { ok:false, status:401|403, error }
export async function authorize(req, handle) {
  const raw = req.headers["authorization"] || req.headers["Authorization"] || "";
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  const bearer = m ? m[1].trim() : "";
  const adminPw = process.env.ADMIN_PASSWORD || "";
  const defaultHandle = process.env.DEFAULT_HANDLE || "kkanajae";
  const xkey = req.headers["x-admin-key"] || "";

  // 관리자 비밀번호 (헤더 또는 Bearer) → 기본 사이트만
  if (adminPw && (xkey === adminPw || bearer === adminPw)) {
    if (handle === defaultHandle) return { ok: true, via: "admin" };
    return { ok: false, status: 403, error: "이 사이트에 대한 권한이 없습니다." };
  }

  // 사이트 스코프 API 키
  if (bearer) {
    let rec = null;
    try { rec = await store().get("apikey:" + bearer); } catch (e) { rec = null; }
    if (rec && rec.handle === handle) return { ok: true, via: "key" };
    if (rec) return { ok: false, status: 403, error: "키가 다른 사이트에 속합니다." };
  }

  return { ok: false, status: 401, error: "인증이 필요합니다." };
}
