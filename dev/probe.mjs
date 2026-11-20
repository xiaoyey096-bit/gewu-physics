// 本地 Function 探测脚本（仅开发用，不进入发布产物）。
const BASE = "http://127.0.0.1:8000/functions/v1/app";
const results = [];

async function probe(name, path, init, expect) {
  try {
    const res = await fetch(BASE + path, init);
    const body = await res.json().catch(() => null);
    const pass = expect(res.status, body);
    results.push({ name, status: res.status, pass, body: JSON.stringify(body).slice(0, 220) });
  } catch (e) {
    results.push({ name, pass: false, body: String(e) });
  }
}

const problem = {
  version: 1,
  template: "projectile",
  statement: "示例：以 20 m/s、30° 斜抛，初始高度 0，g=9.8，求射程、最大高度、飞行时间。",
  params: { v0: 20, angleDeg: 30, h0: 0, g: 9.8 },
  ask: ["range", "maxHeight", "flightTime"],
};

await probe("health", "", undefined, (s, b) => s === 200 && b.ok === true && b.recognizeConfigured === false);
await probe("solve 正常", "/solve", { method: "POST", body: JSON.stringify({ problem }) },
  (s, b) => s === 200 && b.ok && Math.abs(b.result.range - 35.31) < 0.2 && b.result.series.n === 240);
await probe("solve 非法参数", "/solve", { method: "POST", body: JSON.stringify({ problem: { ...problem, params: { ...problem.params, v0: -5 } } }) },
  (s, b) => s === 400 && b.error === "invalid_v0");
await probe("solve 坏 JSON", "/solve", { method: "POST", body: "{oops" }, (s, b) => s === 400 && b.error === "invalid_body");
await probe("solve GET 拒绝", "/solve", undefined, (s, b) => s === 405 && b.error === "method_not_allowed");
await probe("recognize 未配置", "/recognize", { method: "POST", body: JSON.stringify({ image: "data:image/png;base64,AAAA" }) },
  (s, b) => s === 503 && b.error === "service_not_configured");
await probe("未知路由", "/bogus", undefined, (s, b) => s === 404 && b.error === "not_found");

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}  [${r.status ?? "-"}]  ${r.body}`);
}
console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);