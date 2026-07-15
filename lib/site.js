// 사이트 데이터 공용 로직 — picks.js(통짜 저장) + sites/[...path].js(세밀 API) 공용 소스.
// 검증·정리(clean/safeUrl)·인증은 여기 한 곳에만. 저장소 접근은 lib/store.js.
import { store } from "./store.js";
import { randomBytes } from "node:crypto";
import { getSessionUser } from "./auth.js";

export const siteKey = (h) => "site:" + h;
// 핸들 정규화: 영문·숫자·-·_ 만, 소문자, 최대 40자 (URL·키 안전)
export const sanitizeHandle = (h) => String(h || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 40).toLowerCase();
// 정적 라우트와 겹치는 핸들 금지 — 파일시스템 우선 서빙에 가려 접속 불가한 주소가 됨 (app.html readHandle의 예약어와 동기화)
export const RESERVED_HANDLES = new Set(["index", "app", "admin", "login", "api", "assets", "images", "terms", "privacy", "docs"]);

// 사이트 기본값 (브랜드·기능 전부 데이터화 → 깐깐아재 = "1호 사이트")
export const DEFAULT = {
  profile: {
    name: "",
    handle: "",
    tagline: "",
    bio: "",
    avatar: "",
    accent: "#7C5CFC",
    layout: "card",          // card(카드형) | list(심플 리스트형)
    showImages: true,        // 상품 사진 표시 여부
    theme: "cream",          // 배경 테마: cream|dark|mint|pink|navy|mono
    background: "solid",     // 배경 스타일: solid|gradient|dots|grid|image
    backgroundImage: "",     // 배경 사진 URL (background=image일 때)
    font: "jua",             // 폰트: jua|gothic|nanum|gaegu|myeongjo
    buttonStyle: "round",    // 버튼 모양: round|pill|square
    buttonFill: "solid",     // 버튼 채우기: solid|outline|soft
    stickers: [],            // 이모지 스티커 (최대 6)
    notice: "",
    contactEmail: "",
    disclosure: "",   // 제휴 고지는 사용자가 필요할 때만 설정 (강제 X)
    socials: { youtube: "", tiktok: "", instagram: "", threads: "", naverBlog: "", x: "" },
    stickers: []
  },
  picks: [],
  blocks: []
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

// 이미지 필드 전용: http(s)·상대경로 + data:image(base64) 허용 (업로드 사진 저장용).
// data:text/html 등은 불허 → <img>/background에만 쓰이므로 스크립트 실행 불가.
export function safeImageUrl(v, n) {
  const u = String(v ?? "").trim().slice(0, n);
  if (!u) return "";
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,[A-Za-z0-9+/=\s]+$/i.test(u)) return u;
  return safeUrl(u, n);
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
    youtube: safeUrl(p.youtube, 200),   // 쇼츠/영상 링크 (선택)
    // 자유 버튼 (라벨+URL, 최대 4). 있으면 카드가 이걸 렌더(쇼핑 전용 아님).
    buttons: (Array.isArray(p.buttons) ? p.buttons : []).slice(0, 4)
      .map((b) => ({ label: s(b && b.label, 20), url: safeUrl(b && b.url, 500) }))
      .filter((b) => b.label || b.url),
    coupang: safeUrl(p.coupang, 500),   // 레거시(buttons 없을 때 하위호환 렌더)
    toss: safeUrl(p.toss, 500),         // 레거시
    status: STATUSES.includes(p.status) ? p.status : "live"
  };
}

// 콘텐츠 블록 하나 정리 (text|video|link)
export function cleanBlock(b) {
  b = b || {};
  const type = ["text", "video", "link"].includes(b.type) ? b.type : "text";
  return {
    id: s(b.id, 40),
    type,
    title: s(b.title, 80),
    body: s(b.body, 500),
    url: safeUrl(b.url, 500),
    label: s(b.label, 60),
  };
}

// 신뢰 못 할 body → 안전한 사이트 형태로 (통짜 저장용)
export function clean(data) {
  data = data || {};
  const pf = data.profile || {};
  const sc = pf.socials || {};
  return {
    profile: {
      name: s(pf.name ?? "", 40),
      handle: s(pf.handle ?? "", 40).replace(/^@/, ""),
      tagline: s(pf.tagline ?? "", 24),
      bio: s(pf.bio, 200),
      avatar: safeImageUrl(pf.avatar || "", 200000),
      accent: HEX.test(pf.accent || "") ? pf.accent : "#7C5CFC",
      layout: ["card", "list"].includes(pf.layout) ? pf.layout : "card",
      showImages: pf.showImages === false ? false : true,
      theme: ["cream", "dark", "mint", "pink", "navy", "mono"].includes(pf.theme) ? pf.theme : "cream",
      background: ["solid", "gradient", "dots", "grid", "image"].includes(pf.background) ? pf.background : "solid",
      backgroundImage: safeImageUrl(pf.backgroundImage, 500000),
      font: ["jua", "gothic", "nanum", "gaegu", "myeongjo"].includes(pf.font) ? pf.font : "jua",
      buttonStyle: ["round", "pill", "square"].includes(pf.buttonStyle) ? pf.buttonStyle : "round",
      buttonFill: ["solid", "outline", "soft"].includes(pf.buttonFill) ? pf.buttonFill : "solid",
      stickers: (Array.isArray(pf.stickers) ? pf.stickers : []).slice(0, 6).map((x) => s(x, 8)).filter(Boolean),
      notice: s(pf.notice, 120),
      contactEmail: s(pf.contactEmail, 120),
      disclosure: s(pf.disclosure || DEFAULT.profile.disclosure, 300),
      socials: {
        youtube: safeUrl(sc.youtube, 300), tiktok: safeUrl(sc.tiktok, 300), instagram: safeUrl(sc.instagram, 300),
        threads: safeUrl(sc.threads, 300), naverBlog: safeUrl(sc.naverBlog, 300), x: safeUrl(sc.x, 300)
      }
    },
    picks: (Array.isArray(data.picks) ? data.picks : []).slice(0, 100).map(cleanPick),
    blocks: (Array.isArray(data.blocks) ? data.blocks : []).slice(0, 20).map(cleanBlock)
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

  // 세션 쿠키 (로그인한 사이트 소유자)
  try {
    const su = await getSessionUser(req);
    if (su) return su.handle === handle ? { ok: true, via: "session" } : { ok: false, status: 403, error: "이 사이트에 대한 권한이 없습니다." };
  } catch (e) {}

  return { ok: false, status: 401, error: "인증이 필요합니다." };
}

// ── 사이트/키 발급 (멀티유저 프로비저닝) ──
// 지금은 운영자(마스터)만 호출 — 공개 회원가입은 Phase2. 사이트 하나 = 핸들 하나 + 스코프 키 N개.
export function newApiKey() {
  return "sk_live_" + randomBytes(24).toString("base64url");
}
export async function issueKey(handle) {
  const key = newApiKey();
  await store().set("apikey:" + key, { handle });
  return key;
}
// 새 사이트 생성 + 첫 키 발급. 이미 있으면 409(force면 유지하고 키만 재발급).
export async function provisionSite(handle, opts = {}) {
  handle = sanitizeHandle(handle);
  if (!handle) return { ok: false, status: 422, error: "handle이 필요합니다 (영문·숫자·-·_)." };
  if (RESERVED_HANDLES.has(handle)) return { ok: false, status: 422, error: "사용할 수 없는 주소예요. 다른 주소를 골라주세요." };
  const existing = await store().get(siteKey(handle));
  if (existing && !opts.force) return { ok: false, status: 409, error: "이미 존재하는 handle입니다." };
  const profile = { ...structuredClone(DEFAULT.profile), handle, name: opts.name || handle };
  const site = clean({ profile, picks: (existing && existing.picks) || [] });
  await store().set(siteKey(handle), site);
  const key = await issueKey(handle);
  return { ok: true, handle, key, created: !existing, url: "/" + handle };   // 예쁜 주소 (rewrite: /{handle} → index.html)
}
