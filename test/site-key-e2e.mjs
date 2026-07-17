import { pathToFileURL } from "node:url";
import { join } from "node:path";

process.env.ADMIN_PASSWORD = "master-test-password";
process.env.DEFAULT_HANDLE = "kkanajae";
const ROOT = process.env.VIDEO_PROJECTS_ROOT
  ? join(process.env.VIDEO_PROJECTS_ROOT, "onshelf")
  : "E:/Codex_video/onshelf";
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

function mockStore() {
  const data = new Map();
  return {
    async get(key) { const value = data.get(key); return value === undefined ? null : structuredClone(value); },
    async set(key, value) { data.set(key, structuredClone(value)); return "OK"; },
    async del(key) { return data.delete(key) ? 1 : 0; },
    async hgetall() { return null; },
    _data: data,
  };
}

const storeMod = await imp("lib/store.js");
const mock = mockStore();
storeMod.__setStoreForTest(mock);
const { saveSite } = await imp("lib/site.js");
const siteRouter = (await imp("api/site-router.js")).default;

const original = {
  profile: { name: "깐깐아재", handle: "kkanajae", accent: "#123456" },
  picks: [{ id: "ep1", topic: "원본 픽", verdict: "그대로", status: "latest", buttons: [{ label: "쿠팡", url: "https://example.com/p" }] }],
  blocks: [{ id: "b1", type: "text", text: "원본 블록" }],
  design: { theme: "dark" },
};
await saveSite("kkanajae", original);
const before = structuredClone(await mock.get("site:kkanajae"));

function response() {
  return { statusCode: 200, body: null, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
async function call(method, path, token) {
  const res = response();
  await siteRouter({ method, query: { path }, headers: token ? { authorization: "Bearer " + token } : {} }, res);
  return res;
}

let pass = 0;
let fail = 0;
function check(name, condition) {
  if (condition) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("  XX  " + name); }
}

let result = await call("POST", ["kkanajae", "apikey"], "wrong");
check("잘못된 인증은 401", result.statusCode === 401);

result = await call("POST", ["kkanajae", "apikey"], "master-test-password");
const firstKey = result.body && result.body.key;
check("마스터 인증으로 사이트 키 발급", result.statusCode === 200 && /^sk_live_[\w-]+$/.test(firstKey || ""));
check("발급 후 사이트 문서 불변", JSON.stringify(await mock.get("site:kkanajae")) === JSON.stringify(before));

result = await call("GET", ["kkanajae", "picks"], firstKey);
check("새 사이트 키로 읽기", result.statusCode === 200 && result.body.picks[0].topic === "원본 픽");

result = await call("POST", ["kkanajae", "apikey"], firstKey);
const secondKey = result.body && result.body.key;
check("사이트 키 자체로 재발급", result.statusCode === 200 && secondKey && secondKey !== firstKey);
check("재발급 후 이전 키 폐기", !mock._data.has("apikey:" + firstKey));
check("재발급 후 사이트 문서 불변", JSON.stringify(await mock.get("site:kkanajae")) === JSON.stringify(before));

result = await call("GET", ["kkanajae", "picks"], firstKey);
check("폐기된 키는 401", result.statusCode === 401);
result = await call("GET", ["kkanajae", "picks"], secondKey);
check("새 키는 정상", result.statusCode === 200);

console.log(`\n== site key ${pass} passed / ${fail} failed ==`);
process.exit(fail ? 1 : 0);
