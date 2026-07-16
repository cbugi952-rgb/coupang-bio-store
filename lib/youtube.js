// YouTube Data API v3 — 채널 정보·최근 영상 읽기 (AI 자동 생성의 입력).
// INERT by default — YOUTUBE_API_KEY 없으면 youtubeConfigured()=false (mailer.js와 같은 패턴).
//
// 쿼터: channels(1) + playlistItems(1) = 생성당 2유닛. 무료 한도 10,000/일.
// search(100유닛)를 안 쓰고 uploads 재생목록을 도는 이유 = 같은 결과에 쿼터 50배 절약.
//
// 활성화(코드 변경 없음): env YOUTUBE_API_KEY
//   console.cloud.google.com → YouTube Data API v3 사용 설정 → API 키 발급

const API = "https://www.googleapis.com/youtube/v3";

export function youtubeConfigured() {
  return !!process.env.YOUTUBE_API_KEY;
}

// 유저가 붙여넣은 값 → 채널 참조.
// 우리가 네트워크로 부르는 건 googleapis.com뿐이고 유저 URL을 그대로 fetch하지 않는다 → SSRF 여지 없음.
export function parseChannelRef(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (/^@[\w.\-]{1,60}$/.test(raw)) return { type: "handle", value: raw.slice(1) };   // "@채널" 만 붙여넣은 경우
  let u;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw); } catch (e) { return null; }
  if (!/^([\w-]+\.)*youtube\.com$/i.test(u.hostname)) return null;
  const seg = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (!seg.length) return null;
  if (seg[0].startsWith("@")) return { type: "handle", value: seg[0].slice(1) };
  if (seg[0] === "channel" && seg[1]) return { type: "id", value: seg[1] };
  if ((seg[0] === "c" || seg[0] === "user") && seg[1]) return { type: "legacy", value: seg[1] };
  return null;
}

async function callApi(path, params) {
  const q = new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY });
  const r = await fetch(`${API}/${path}?${q}`);
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    console.error(`[youtube] ${path} ${r.status}: ${t.slice(0, 200)}`);
    const e = new Error(r.status === 403 ? "유튜브 조회 한도에 걸렸어요. 잠시 후 다시 시도해주세요." : "유튜브 채널을 불러오지 못했어요.");
    e.status = r.status === 403 ? 429 : 502;
    throw e;
  }
  return r.json();
}

const channelUrl = (ch) => {
  const cu = ch.snippet && ch.snippet.customUrl;
  if (cu) return "https://www.youtube.com/" + (cu.startsWith("@") ? cu : "@" + cu);
  return "https://www.youtube.com/channel/" + ch.id;
};

// 채널 참조 → 생성 프롬프트에 넣을 채널 정보. 전부 API가 준 실데이터만 담는다(no-fabrication).
// 반환: { ok:true, channel } | { ok:false, status, error }
export async function fetchChannel(ref) {
  if (!ref) return { ok: false, status: 422, error: "유튜브 채널 주소를 확인해주세요. 예: youtube.com/@채널이름" };
  const params = { part: "snippet,statistics,contentDetails" };
  if (ref.type === "handle") params.forHandle = "@" + ref.value;
  else if (ref.type === "id") params.id = ref.value;
  else params.forUsername = ref.value;   // 옛 /user/ 주소

  const j = await callApi("channels", params);
  const ch = j.items && j.items[0];
  if (!ch) {
    return {
      ok: false, status: 404,
      error: ref.type === "legacy"
        ? "이 주소 형식은 채널을 특정하기 어려워요. 채널 페이지의 @주소로 다시 시도해주세요. 예: youtube.com/@채널이름"
        : "그 채널을 찾지 못했어요. 주소를 확인해주세요. 예: youtube.com/@채널이름",
    };
  }

  // 최근 업로드 — 실패해도 채널 정보만으로 생성 가능하므로 비차단.
  let recentVideos = [];
  const uploads = ch.contentDetails && ch.contentDetails.relatedPlaylists && ch.contentDetails.relatedPlaylists.uploads;
  if (uploads) {
    try {
      const v = await callApi("playlistItems", { part: "snippet", playlistId: uploads, maxResults: "8" });
      recentVideos = (v.items || [])
        .map((i) => {
          const sn = i.snippet || {};
          const id = sn.resourceId && sn.resourceId.videoId;
          return { title: String(sn.title || ""), url: id ? "https://www.youtube.com/watch?v=" + id : "" };
        })
        .filter((x) => x.title && x.url);
    } catch (e) { /* 비차단 */ }
  }

  const st = ch.statistics || {};
  return {
    ok: true,
    channel: {
      name: String((ch.snippet && ch.snippet.title) || ""),
      handle: String((ch.snippet && ch.snippet.customUrl) || "").replace(/^@/, ""),
      url: channelUrl(ch),
      description: String((ch.snippet && ch.snippet.description) || "").slice(0, 1200),
      subscribers: st.hiddenSubscriberCount ? "" : String(st.subscriberCount || ""),
      recentVideos,
    },
  };
}
