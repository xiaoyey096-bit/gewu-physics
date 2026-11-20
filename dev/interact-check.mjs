// 交互检查（开发用）：速度切换 + 参数滑杆键盘操作 → 即时重算。
import { spawn } from "node:child_process";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9334;
const proc = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}/gewu-cdp2`,
  "--window-size=1280,900",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets = null;
for (let i = 0; i < 30 && !targets; i++) {
  await sleep(500);
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch {}
}
if (!targets) { console.log("NO_CDP"); proc.kill(); process.exit(1); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
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
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true });
  return r.result?.value;
};

await send("Page.enable");
await send("Page.navigate", { url: "http://127.0.0.1:5173/" });
await sleep(3000);

// 1) 速度按钮循环切换
const speedBefore = await evaluate(`[...document.querySelectorAll('button')].find(b => /×$/.test(b.textContent.trim()))?.textContent.trim()`);
await evaluate(`[...document.querySelectorAll('button')].find(b => /×$/.test(b.textContent.trim()))?.click()`);
const speedAfter = await evaluate(`[...document.querySelectorAll('button')].find(b => /×$/.test(b.textContent.trim()))?.textContent.trim()`);
console.log(`speed: ${speedBefore} -> ${speedAfter}  ${speedBefore !== speedAfter ? "PASS" : "FAIL"}`);

// 2) 暂停播放，避免重算自动播放干扰读数
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '暂停')?.click()`);

// 3) 初速度滑杆（第 2 个 role=slider）键盘 +5 步 → 答案变化
const readState = `(() => {
  const s = document.querySelectorAll('[role=slider]')[1];
  const badges = [...document.querySelectorAll('[data-slot=badge], span')].map(e => e.textContent).filter(t => /射程/.test(t));
  return { v0: s?.getAttribute('aria-valuenow'), range: badges[0] };
})()`;
const before = await evaluate(readState);
await evaluate(`document.querySelectorAll('[role=slider]')[1].focus()`);
for (let i = 0; i < 10; i++) {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
}
await sleep(400);
const after = await evaluate(readState);
console.log(`v0: ${before.v0} -> ${after.v0}; ${before.range} -> ${after.range}  ${before.v0 !== after.v0 && before.range !== after.range ? "PASS" : "FAIL"}`);

// 4) 画布仍有内容
const painted = await evaluate(`(() => { const c = document.querySelector('canvas'); const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for (let i=0;i<d.length;i+=40){ if (d[i]!==d[0]||d[i+1]!==d[1]||d[i+2]!==d[2]) n++; } return n; })()`);
console.log(`canvas non-bg samples: ${painted}  ${painted > 50 ? "PASS" : "FAIL"}`);

ws.close();
proc.kill();
process.exit(0);