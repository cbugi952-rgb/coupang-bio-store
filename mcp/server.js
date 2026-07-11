#!/usr/bin/env node
// 링크인바이오 MCP 서버 — 클로드/커서 등 에이전트가 링크페이지(픽·프로필)를 관리한다.
// 각 툴 = REST API(/api/sites/{handle}/...)의 얇은 래퍼. 진실의 원천은 API.
//
// 환경변수:
//   API_BASE     기본 https://coupang-bio-store.vercel.app/api
//   API_KEY      사이트 스코프 키(sk_live_...) 또는 관리자 비밀번호(ADMIN_PASSWORD)
//   SITE_HANDLE  기본 kkanajae
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = (process.env.API_BASE || "https://coupang-bio-store.vercel.app/api").replace(/\/+$/, "");
const API_KEY = process.env.API_KEY || "";
const HANDLE = process.env.SITE_HANDLE || "kkanajae";

async function api(method, path, body) {
  const res = await fetch(`${API_BASE}/sites/${HANDLE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(API_KEY ? { authorization: `Bearer ${API_KEY}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${res.status} ${data.error || text || "요청 실패"}`);
  return data;
}

const server = new McpServer({ name: "linkbio", version: "0.1.0" });

const asText = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
const wrap = (fn) => async (args) => {
  try { return asText(await fn(args || {})); }
  catch (e) { return { content: [{ type: "text", text: "오류: " + e.message }], isError: true }; }
};

server.registerTool("list_picks",
  { title: "픽 목록", description: "링크페이지의 모든 픽(상품 카드)을 반환한다.", inputSchema: {} },
  wrap(() => api("GET", "/picks")));

server.registerTool("add_pick",
  {
    title: "픽 추가",
    description: "새 상품 픽을 추가한다. topic·coupang은 필수. status=latest면 대표(최신)로 올린다.",
    inputSchema: {
      topic: z.string().describe("상품/주제명 (필수)"),
      coupang: z.string().describe("쿠팡 파트너스 링크 (필수)"),
      toss: z.string().optional().describe("토스쇼핑 쉐어링크 (선택)"),
      verdict: z.string().optional().describe("아재 한마디 — 카드 코멘트"),
      category: z.string().optional().describe("카테고리: 주방·욕실·세탁·생활·반려"),
      ep: z.string().optional().describe("회차 뱃지 (예: EP14)"),
      image: z.string().optional().describe("카드 이미지 경로/URL"),
      youtube: z.string().optional().describe("리뷰 쇼츠 링크"),
      status: z.enum(["latest", "live", "hidden"]).optional().describe("기본 live. latest=대표 픽"),
    },
  },
  wrap((a) => api("POST", "/picks", a)));

server.registerTool("update_pick",
  {
    title: "픽 수정",
    description: "기존 픽을 부분 수정한다. id는 필수, 나머지는 바꿀 필드만 넣는다.",
    inputSchema: {
      id: z.string().describe("픽 id (필수)"),
      topic: z.string().optional(), coupang: z.string().optional(), toss: z.string().optional(),
      verdict: z.string().optional(), category: z.string().optional(), ep: z.string().optional(),
      image: z.string().optional(), youtube: z.string().optional(),
      status: z.enum(["latest", "live", "hidden"]).optional(),
    },
  },
  wrap(({ id, ...fields }) => api("PATCH", `/picks/${encodeURIComponent(id)}`, fields)));

server.registerTool("delete_pick",
  { title: "픽 삭제", description: "픽을 삭제한다.", inputSchema: { id: z.string().describe("픽 id") } },
  wrap(({ id }) => api("DELETE", `/picks/${encodeURIComponent(id)}`)));

server.registerTool("set_latest",
  {
    title: "최신 지정",
    description: "이 픽을 대표(최신)로 지정한다. 기존 최신은 일반 게시로 내려간다.",
    inputSchema: { id: z.string().describe("픽 id") },
  },
  wrap(({ id }) => api("POST", `/picks/${encodeURIComponent(id)}/latest`)));

server.registerTool("reorder_picks",
  {
    title: "순서 변경",
    description: "픽 순서를 ids 배열 순서대로 재정렬한다(맨 앞이 위).",
    inputSchema: { ids: z.array(z.string()).describe("픽 id 배열 — 원하는 순서대로") },
  },
  wrap(({ ids }) => api("POST", "/picks/reorder", { ids })));

server.registerTool("update_profile",
  {
    title: "프로필 수정",
    description: "프로필(채널명·소개·한줄공지·소셜 링크 등)을 부분 병합한다.",
    inputSchema: {
      name: z.string().optional(), tagline: z.string().optional(), bio: z.string().optional(),
      notice: z.string().optional(), contactEmail: z.string().optional(), accent: z.string().optional(),
      socials: z.object({
        youtube: z.string().optional(), tiktok: z.string().optional(), instagram: z.string().optional(),
        threads: z.string().optional(), naverBlog: z.string().optional(), x: z.string().optional(),
      }).partial().optional(),
    },
  },
  wrap((a) => api("PATCH", "/profile", a)));

server.registerTool("get_stats",
  { title: "통계", description: "방문·유입경로·클릭·전환율 통계를 반환한다.", inputSchema: {} },
  wrap(() => api("GET", "/stats")));

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`linkbio MCP 실행 — API_BASE=${API_BASE} handle=${HANDLE} key=${API_KEY ? "설정됨" : "없음(공개읽기만)"}`);
