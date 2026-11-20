// 移动端横向溢出诊断（开发用）。
import { spawn } from "node:child_process";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const proc = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}/gewu-cdp`,
  "--window-size=390,844",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets = null;
for (let i = 0; i < 30 && !targets; i++) {
  await sleep(500);
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  } catch {}
}
if (!targets) { console.log("NO_CDP"); proc.kill(); process.exit(1); }
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const send = (method, params) => new Promise((resolve) => {
  const mid = ++id;
  const onMsg = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id === mid) { ws.removeEventListener("message", onMsg); resolve(m.result); }
  };
  ws.addEventListener("message", onMsg);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: "http://127.0.0.1:5173/" });
await sleep(3500);
const expr = `(() => {
  const vw = document.documentElement.clientWidth;
  const bad = [];
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      bad.push({ tag: el.tagName, cls: (el.className.baseVal ?? el.className ?? '').toString().slice(0, 90), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
    }
  });
  return { vw, scrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 25) };
})()`;
const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
console.log(JSON.stringify(res.result?.value ?? res, null, 1));
const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
const { writeFileSync } = await import("node:fs");
writeFileSync(new URL("./shot-mobile-emu.png", import.meta.url), Buffer.from(shot.data, "base64"));
ws.close();
proc.kill();
process.exit(0);