// Vercel Serverless Function — GET(공개 읽기) / PUT(관리자 저장).
// 저장소: Upstash Redis. 멀티테넌트 대비 KV 키 = site:{handle} (지금은 기본 사이트 1개).
// 관리자 비밀번호: env ADMIN_PASSWORD.
import { store, handleFrom } from "../lib/store.js";

const siteKey = (h) => "site:" + h;

// 사이트 기본값 (브랜드·기능 전부 데이터화 → 깐깐아재는 "1호 사이트")
const DEFAULT = {
  profile: {
    name: "깐깐아재",
    handle: "kkanajae",
    tagline: "아재가 골라줬어",   // 상단 훅바 태그
    bio: "싸다고 다 사지 마세요.\n아재가 깐깐하게 따져서 골라줍니다.",
    avatar: "assets/avatar.jpg",
    accent: "#FFD400",
    notice: "",                    // 한줄 공지 (빈값=숨김)
    contactEmail: "",              // 협업·문의
    disclosure: "본 페이지의 상품 링크는 쿠팡 파트너스·토스쇼핑 쉐어링크 활동의 일환으로, 구매 시 이에 따른 일정액의 수수료를 제공받습니다.",
    socials: { youtube: "", tiktok: "", instagram: "", threads: "", naverBlog: "", x: "" }
  },
  picks: []
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const s = (v, n) => String(v ?? "").slice(0, n);

// URL 스킴 화이트리스트: http(s)·mailto·상대경로만 허용 (javascript:/data: 등 차단 → XSS 방지)
function safeUrl(v, n) {
  const u = String(v ?? "").trim().slice(0, n);
  if (!u) return "";
  const m = u.match(/^([a-z][a-z0-9+.\-]*):/i);   // 스킴 있나?
  if (!m) return u;                               // 스킴 없음 = 상대경로/#/앵커 → OK
  const scheme = m[1].toLowerCase();
  return (scheme === "http" || scheme === "https" || scheme === "mailto") ? u : "";
}

// 입력 검증·정리 (신뢰 못 할 body → 안전한 형태로)
export function clean(data) {
  const pf = data.profile || {};
  const sc = pf.socials || {};
  return {
    profile: {
      name: s(pf.name ?? "깐깐아재", 40),
      handle: s((pf.handle ?? "kkanajae"), 40).replace(/^@/, ""),
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
    picks: (Array.isArray(data.picks) ? data.picks : []).slice(0, 100).map((p) => ({
      id: s(p.id, 40),
      ep: s(p.ep, 12),
      topic: s(p.topic, 60),
      verdict: s(p.verdict, 80),
      category: s(p.category, 20),
      image: safeUrl(p.image, 300),
      youtube: safeUrl(p.youtube, 200),   // 쇼츠 링크 (선택)
      coupang: safeUrl(p.coupang, 500),
      toss: safeUrl(p.toss, 500),
      status: ["latest", "live", "hidden"].includes(p.status) ? p.status : "live"
    }))
  };
}

// 최신(latest)은 최대 1개만
function enforceSingleLatest(picks) {
  let seen = false;
  for (const p of picks) {
    if (p.status === "latest") { if (seen) p.status = "live"; seen = true; }
  }
  return picks;
}

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
