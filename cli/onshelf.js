#!/usr/bin/env node
// onshelf — 자동화-네이티브 링크인바이오 CLI. REST API(/api/sites/{handle}/...)의 얇은 래퍼.
// 의존성 0 (Node 내장만). 웹 GUI·MCP와 같은 API를 친다 — 진실의 원천은 API.
//
// 설정: ~/.config/onshelf/config.json  ({ base, handle, key })  ← onshelf login 으로 저장
// 우선순위(설정값): 환경변수(API_BASE/API_KEY/SITE_HANDLE) > config 파일 > 기본값
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const VERSION = "0.1.0";
const DEFAULTS = { base: "https://onshelf.vercel.app/api", handle: "kkanajae" };

// ── 설정 파일 ──────────────────────────────────────────────
function configPath() {
  if (process.env.ONSHELF_CONFIG) return process.env.ONSHELF_CONFIG;   // 테스트/오버라이드
  const dir = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(dir, "onshelf", "config.json");
}
function loadConfig() {
  try { return JSON.parse(readFileSync(configPath(), "utf8")) || {}; } catch { return {}; }
}
function saveConfig(cfg) {
  const p = configPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
  try { chmodSync(p, 0o600); } catch {}   // 키는 비밀 — POSIX면 소유자만 (윈도우는 무시)
  return p;
}
function settings() {
  const cfg = loadConfig();
  return {
    base: (process.env.API_BASE || cfg.base || DEFAULTS.base).replace(/\/+$/, ""),
    key: process.env.API_KEY || cfg.key || "",
    handle: process.env.SITE_HANDLE || cfg.handle || DEFAULTS.handle,
  };
}

// ── API 호출 ───────────────────────────────────────────────
async function api(method, path, { body, auth = true } = {}) {
  const { base, key, handle } = settings();
  const headers = { "content-type": "application/json" };
  if (auth && key) headers.authorization = `Bearer ${key}`;
  const url = `${base}/sites/${encodeURIComponent(handle)}${path}`;
  let res;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new Error(`네트워크 오류 (${base}): ${e.message}`);
  }
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = (data && data.error) || text || `HTTP ${res.status}`;
    const hint = res.status === 401 ? "  → onshelf login 으로 키를 저장하세요."
      : res.status === 403 ? "  → 이 키는 다른 사이트(handle)에 속합니다."
        : "";
    throw new Error(`${res.status} ${msg}${hint}`);
  }
  return data;
}

// ── 인자 파서 (아주 작게, 의존성 0) ────────────────────────
// 위치인자 + --flag value / --flag=value / 불리언 플래그(boolFlags 집합).
// 값-플래그에 값이 안 붙으면 "" (해당 필드 지우기로 해석).
function parseArgs(argv, boolFlags) {
  const positionals = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      let key = a.slice(2), val;
      const eq = key.indexOf("=");
      if (eq >= 0) { val = key.slice(eq + 1); key = key.slice(0, eq); }
      else if (boolFlags.has(key)) val = true;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) val = argv[++i];
      else val = "";
      flags[key] = val;
    } else positionals.push(a);
  }
  return { positionals, flags };
}

// ── 표시 헬퍼 ──────────────────────────────────────────────
const out = (...a) => console.log(...a);
const mask = (k) => (!k ? "" : k.length <= 12 ? k.slice(0, 3) + "***" : k.slice(0, 7) + "…" + k.slice(-4));
function fail(msg) { console.error("onshelf: " + msg); process.exit(1); }

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    let data = ""; process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data.trim()));
    process.stdin.on("error", () => resolve(""));
  });
}

function fmtPicks(picks) {
  if (!picks || !picks.length) return "(픽 없음)";
  return picks.map((p, i) => {
    const badge = p.status === "latest" ? "  ★최신" : p.status === "hidden" ? "  ·숨김" : "";
    const ep = p.ep ? `[${p.ep}] ` : "";
    const stores = [p.coupang && "쿠팡", p.toss && "토스"].filter(Boolean).join("·") || "링크없음";
    const meta = [p.verdict, p.category && "#" + p.category, `(${stores})`].filter(Boolean).join("  ");
    return `${String(i + 1).padStart(2)}. ${p.id}  ${ep}${p.topic}${badge}` + (meta ? `\n      ${meta}` : "");
  }).join("\n");
}
function fmtProfile(p) {
  p = p || {};
  const soc = p.socials || {};
  const socList = Object.entries(soc).filter(([, v]) => v).map(([k]) => k).join(", ") || "(없음)";
  return [
    `이름   ${p.name || ""}  (@${p.handle || ""})`,
    `한줄   ${p.tagline || ""}`,
    p.notice ? `공지   ${p.notice}` : null,
    p.contactEmail ? `문의   ${p.contactEmail}` : null,
    `스타일 ${p.theme || "-"} / ${p.font || "-"} / 버튼:${p.buttonStyle || "-"}  accent ${p.accent || "-"}`,
    `소셜   ${socList}`,
  ].filter(Boolean).join("\n");
}
function fmtStats(s) {
  s = s || {};
  const v = s.views || {};
  const lines = [
    `방문  총 ${s.totalViews || 0}  (인스타 ${v.instagram || 0} · 틱톡 ${v.tiktok || 0} · 유튜브 ${v.youtube || 0} · 직접 ${v.direct || 0})`,
    `클릭  총 ${s.totalClicks || 0}`,
    `전환율 ${s.ctr || 0}%`,
  ];
  const clicks = s.clicks || {};
  const keys = Object.keys(clicks);
  if (keys.length) { lines.push("픽별 클릭:"); for (const k of keys) lines.push(`  ${k}  ${clicks[k]}`); }
  return lines.join("\n");
}

// 픽 필드 추출 (add/update 공용)
const PICK_FIELDS = ["topic", "coupang", "toss", "verdict", "category", "ep", "image", "youtube"];
function pickBody(flags) {
  const b = {};
  for (const f of PICK_FIELDS) if (f in flags) b[f] = flags[f];
  if (flags.latest) b.status = "latest";
  else if ("status" in flags) b.status = flags.status;
  return b;
}
// 프로필 필드 추출 (profile set)
function profileBody(flags) {
  const b = {};
  for (const f of ["name", "tagline", "bio", "notice", "accent"]) if (f in flags) b[f] = flags[f];
  if ("contact-email" in flags) b.contactEmail = flags["contact-email"];
  const socials = {};
  for (const soc of ["youtube", "tiktok", "instagram", "threads", "x"]) if (soc in flags) socials[soc] = flags[soc];
  if ("naver-blog" in flags) socials.naverBlog = flags["naver-blog"];
  if (Object.keys(socials).length) b.socials = socials;
  return b;
}

const USAGE = `onshelf — 자동화-네이티브 링크인바이오 CLI (v${VERSION})

사용법: onshelf <명령> [옵션]

설정
  login [--key <키>] [--base <url>] [--handle <핸들>]   키/서버/사이트 저장 (키는 stdin도 가능: echo <키> | onshelf login)
  logout                                               저장된 키 삭제
  whoami                                               현재 base·handle·key(마스킹) 표시
  url                                                  공개/관리자 주소 출력

픽
  picks list [--json]                                  픽 목록
  picks add --topic <t> --coupang <url> [옵션]         픽 추가 (옵션: --toss --verdict --category --ep --image --youtube --latest --status)
  picks update <id> [옵션]                             픽 부분 수정 (값 없는 --toss = 해당 필드 지우기)
  picks rm <id>                                        픽 삭제
  picks latest <id>                                    이 픽을 대표(최신)로 지정
  picks reorder <id1> <id2> ...                        나열한 순서대로 재정렬

프로필 · 통계
  profile get [--json]                                 프로필 조회 (공개 읽기)
  profile set [--name --tagline --notice --bio --accent --contact-email --youtube --tiktok --instagram --threads --naver-blog --x]
  stats [--json]                                       방문·클릭·전환율

키는 사이트 스코프 sk_live_… 또는 관리자 비밀번호(도그푸딩). 환경변수 API_BASE·API_KEY·SITE_HANDLE 로도 덮어쓸 수 있음.`;

// ── 메인 ───────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "help" || argv.includes("--help") || argv.includes("-h")) { out(USAGE); return; }
  if (argv[0] === "--version" || argv[0] === "-v" || argv[0] === "version") { out(VERSION); return; }

  const BOOL = new Set(["latest", "json", "force", "help", "version"]);
  const { positionals, flags } = parseArgs(argv, BOOL);
  const [cmd, ...rest] = positionals;

  switch (cmd) {
    case "login": {
      const cfg = loadConfig();
      if (flags.base) cfg.base = String(flags.base).replace(/\/+$/, "");
      if (flags.handle) cfg.handle = String(flags.handle);
      let key = flags.key;
      if (key === undefined || key === true || key === "") key = await readStdin();
      if (key) cfg.key = String(key).trim();
      if (!cfg.key) fail("키가 필요합니다.  onshelf login --key <sk_live_… 또는 관리자비번>  (또는 echo <키> | onshelf login)");
      const p = saveConfig(cfg);
      out(`저장됨 → ${p}`);
      out(`  base=${cfg.base || DEFAULTS.base}  handle=${cfg.handle || DEFAULTS.handle}  key=${mask(cfg.key)}`);
      return;
    }
    case "logout": {
      const cfg = loadConfig(); delete cfg.key; saveConfig(cfg);
      out("로그아웃 — 저장된 키를 삭제했습니다."); return;
    }
    case "whoami": {
      const s = settings();
      out(`base   ${s.base}`);
      out(`handle ${s.handle}`);
      out(`key    ${s.key ? mask(s.key) : "(없음 — 공개 읽기만 가능)"}`);
      return;
    }
    case "url": {
      const s = settings();
      const origin = s.base.replace(/\/api$/, "");
      out(`공개  ${origin}/${s.handle}`);
      out(`관리  ${origin}/admin?u=${s.handle}`);
      return;
    }
    case "picks": {
      const sub = rest[0], args = rest.slice(1);
      if (sub === "list" || sub === "ls" || !sub) {
        const { picks } = await api("GET", "/picks");
        out(flags.json ? JSON.stringify(picks, null, 2) : fmtPicks(picks));
      } else if (sub === "add") {
        const body = pickBody(flags);
        if (!body.topic) fail("--topic 은 필수입니다.");
        if (!body.coupang) console.error("onshelf: (경고) --coupang 없음 — 쿠팡 링크 없이 게시됩니다.");
        const { pick } = await api("POST", "/picks", { body });
        out(`추가됨: ${pick.id}  ${pick.ep ? `[${pick.ep}] ` : ""}${pick.topic}${pick.status === "latest" ? "  ★최신" : ""}`);
        if (flags.json) out(JSON.stringify(pick, null, 2));
      } else if (sub === "update" || sub === "set") {
        const id = args[0]; if (!id) fail("픽 id가 필요합니다:  onshelf picks update <id> --toss <url>");
        const body = pickBody(flags);
        if (!Object.keys(body).length) fail("바꿀 필드가 없습니다 (예: --toss <url>, --verdict \"...\").");
        const { pick } = await api("PATCH", `/picks/${encodeURIComponent(id)}`, { body });
        out(`수정됨: ${pick.id}  ${pick.topic}`);
        if (flags.json) out(JSON.stringify(pick, null, 2));
      } else if (sub === "rm" || sub === "remove" || sub === "delete" || sub === "del") {
        const id = args[0]; if (!id) fail("픽 id가 필요합니다:  onshelf picks rm <id>");
        const r = await api("DELETE", `/picks/${encodeURIComponent(id)}`);
        out(`삭제됨: ${r.removed}`);
      } else if (sub === "latest") {
        const id = args[0]; if (!id) fail("픽 id가 필요합니다:  onshelf picks latest <id>");
        const { pick } = await api("POST", `/picks/${encodeURIComponent(id)}/latest`);
        out(`최신 지정: ${pick.id}  ${pick.topic}`);
      } else if (sub === "reorder") {
        if (!args.length) fail("id들을 순서대로 나열하세요:  onshelf picks reorder <id1> <id2> ...");
        const { picks } = await api("POST", "/picks/reorder", { body: { ids: args } });
        out(fmtPicks(picks));
      } else fail(`알 수 없는 picks 하위명령: ${sub}  (list|add|update|rm|latest|reorder)`);
      return;
    }
    case "profile": {
      const sub = rest[0];
      if (sub === "get" || !sub) {
        const site = await api("GET", "", { auth: false });   // 공개 읽기 = /sites/{h}
        out(flags.json ? JSON.stringify(site.profile, null, 2) : fmtProfile(site.profile));
      } else if (sub === "set") {
        const body = profileBody(flags);
        if (!Object.keys(body).length) fail("바꿀 필드가 없습니다 (예: --notice \"이번 주 신상 3종\").");
        const { profile } = await api("PATCH", "/profile", { body });
        out("프로필 수정됨.");
        if (flags.json) out(JSON.stringify(profile, null, 2));
      } else fail(`알 수 없는 profile 하위명령: ${sub}  (get|set)`);
      return;
    }
    case "stats": {
      const { stats } = await api("GET", "/stats");
      out(flags.json ? JSON.stringify(stats, null, 2) : fmtStats(stats));
      return;
    }
    default:
      fail(`알 수 없는 명령: ${cmd || "(없음)"}\n${USAGE}`);
  }
}

main().catch((e) => { console.error("onshelf: " + e.message); process.exit(1); });
