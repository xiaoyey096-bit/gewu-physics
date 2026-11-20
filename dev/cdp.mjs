// Test-only CDP helper. No server starts, application imports, or shared browser profiles.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
export const BASE = process.env.BASE || "http://127.0.0.1:5174";
export const LEFT = 'aside[aria-label="题库与当前题目"]';
export const RIGHT = 'aside[aria-label="动画参数与讲解"]';
export const ROW = 'button[aria-label^="题目 "][aria-label$=" 的操作"]';
export const CANVAS = 'canvas[aria-label^="抛体运动动画"]';
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitFor(predicate, label, timeout = 8000) {
  const end = Date.now() + timeout;
  let last;
  do {
    last = await predicate();
    if (last) return last;
    await sleep(100);
  } while (Date.now() < end);
  const error = new Error(`Timeout: ${label}; last=${JSON.stringify(last)}`);
  error.name = "AssertionError";
  throw error;
}

export async function launch({ port = 9333, width = 1440, height = 900 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), "gewu-qa-"));
  const proc = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, "--force-device-scale-factor=1",
    "--no-first-run", "--no-default-browser-check", "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding", "about:blank",
  ], { stdio: "ignore" });
  let launchError;
  proc.once("error", (error) => { launchError = error; });
  let ws;
  const pending = new Map();
  const close = async () => {
    for (const request of pending.values()) request.reject(new Error("CDP closed"));
    pending.clear();
    try { ws?.close(); } catch { /* already closed */ }
    try { proc.kill(); } catch { /* already exited */ }
  };
  try {
    const target = await waitFor(async () => {
      if (launchError) throw launchError;
      if (proc.exitCode !== null) throw new Error(`Chrome exited: ${proc.exitCode}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) });
        return (await response.json()).find((item) => item.type === "page");
      } catch { return null; }
    }, "Chrome CDP ready", 15000);
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP WebSocket open timeout")), 10000);
      ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP WebSocket error")); }, { once: true });
    });
    let seq = 0;
    const events = [], errors = [], warnings = [];
    ws.addEventListener("message", ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.id && pending.has(msg.id)) {
        const request = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) request.reject(new Error(JSON.stringify(msg.error)));
        else request.resolve(msg.result);
      } else if (msg.method) {
        events.push(msg);
        if (msg.method === "Runtime.exceptionThrown") {
          const detail = msg.params.exceptionDetails;
          errors.push(`EXCEPTION: ${detail.exception?.description ?? detail.text}`);
        }
        if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
          const text = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(" ");
          (msg.params.type === "error" ? errors : warnings).push(`CONSOLE: ${text}`);
        }
        if (msg.method === "Log.entryAdded" && ["error", "warning"].includes(msg.params.entry.level)) {
          const entry = msg.params.entry;
          (entry.level === "error" ? errors : warnings).push(`LOG: ${entry.text} ${entry.url ?? ""}`);
        }
      }
    });
    ws.addEventListener("close", () => {
      for (const request of pending.values()) request.reject(new Error("CDP disconnected"));
      pending.clear();
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      try { ws.send(JSON.stringify({ id, method, params })); }
      catch (error) { pending.get(id).reject(error); pending.delete(id); }
    });
    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(`EVAL: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
      return result.result?.value;
    };
    const wait = (expression, label = expression, timeout) => waitFor(() => evaluate(expression), label, timeout);
    const exists = (selector) => evaluate(`!!document.querySelector(${JSON.stringify(selector)})`);
    const metrics = async (w, h, mobile = false) => {
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
      await sleep(350); // Breakpoint / sheet transition and ResizeObserver.
    };
    const goto = async (url) => {
      const navigation = await send("Page.navigate", { url });
      if (navigation.errorText) throw new Error(`Navigation: ${navigation.errorText}`);
      await wait('document.readyState === "complete"', "document ready");
    };
    const shot = async (file) => {
      const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(file, Buffer.from(result.data, "base64"), { flag: "wx" });
      return file;
    };
    const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", {
      type, x, y, button: "left", clickCount: 1, ...extra,
    });
    const clickAt = async (x, y) => {
      await mouse("mouseMoved", x, y);
      await mouse("mousePressed", x, y, { buttons: 1 });
      await mouse("mouseReleased", x, y, { buttons: 0 });
      await sleep(120);
    };
    // Resolve again after scrolling; reject hidden, disabled, clipped or covered controls.
    // Opacity is not excluded: library menu triggers become visible on real hover.
    const box = async (selector, { text, exact = false, index = 0 } = {}) => {
      const find = `(() => {
        const candidates = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((el) => {
          const r = el.getBoundingClientRect();
          const css = getComputedStyle(el);
          if (r.width < 2 || r.height < 2 || css.visibility === "hidden" || el.closest('[inert]') || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
          const want = ${JSON.stringify(text ?? null)};
          if (want === null) return true;
          return [(el.textContent || '').trim(), el.getAttribute('aria-label') || ''].some((value) => ${exact} ? value === want : value.includes(want));
        });
        return candidates[${index}];
      })()`;
      await wait(`(() => { const el = ${find}; if (!el) return false; el.scrollIntoView({block:'center', inline:'center', behavior:'instant'}); return true; })()`, `control available: ${text ?? selector}`);
      // Closed details can suspend unrelated transitions indefinitely.
      await wait(`(() => {
        const el = ${find}; if (!el) return false;
        for (let node = el; node; node = node.parentElement) {
          if (node.getAnimations().some((animation) => animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity)) return false;
        }
        return true;
      })()`, `control animations settled: ${text ?? selector}`);
      return wait(`(() => {
        const el = ${find}; if (!el) return null;
        const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null;
        const hit = document.elementFromPoint(x, y);
        return hit && (hit === el || el.contains(hit)) ? {x, y, w:r.width, h:r.height} : null;
      })()`, `control reachable: ${text ?? selector}`);
    };
    const clickSelector = async (selector, options) => {
      const target = await box(selector, options);
      await clickAt(target.x, target.y);
      return true;
    };
    const click = (text, selector = 'button,[role="menuitem"],[role="option"],summary', options = {}) => clickSelector(selector, { ...options, text });
    const key = async (keyName, code = keyName, windowsVirtualKeyCode = 0, modifiers = 0) => {
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: keyName, code, windowsVirtualKeyCode, modifiers });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: keyName, code, windowsVirtualKeyCode, modifiers });
    };
    const type = async (selector, value) => {
      await clickSelector(selector);
      await key("a", "KeyA", 65, 2);
      await send("Input.insertText", { text: value });
      await wait(`document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`, `input value: ${selector}`);
      return true;
    };
    const dragBy = async (selector, dx) => {
      const start = await box(selector);
      await mouse("mouseMoved", start.x, start.y);
      await mouse("mousePressed", start.x, start.y, { buttons: 1 });
      await sleep(60); // Let React attach the resizer's pointermove listener.
      for (let i = 1; i <= 8; i++) {
        await mouse("mouseMoved", start.x + dx * i / 8, start.y, { buttons: 1 });
        await sleep(25);
      }
      await mouse("mouseReleased", start.x + dx, start.y, { buttons: 0 });
    };
    const dragSlider = async (ariaLabel, fraction) => {
      if (fraction < 0 || fraction > 1) throw new Error("Slider fraction outside 0..1");
      const selector = `[role="slider"][aria-label^=${JSON.stringify(ariaLabel)}]`;
      const thumb = await box(selector);
      const track = await evaluate(`(() => {
        const thumb = document.querySelector(${JSON.stringify(selector)});
        const track = thumb?.closest('[data-slot="slider"]')?.querySelector('[data-slot="slider-track"]');
        if (!track) return null;
        const r = track.getBoundingClientRect(); return {x:r.x, w:r.width};
      })()`);
      if (!track || track.w <= thumb.w) throw new Error(`Slider track unavailable: ${ariaLabel}`);
      // Radix compensates for half-thumb offsets at either end of the track.
      const targetX = track.x + thumb.w / 2 + (track.w - thumb.w) * fraction;
      await dragBy(selector, targetX - thumb.x);
      return true;
    };
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Log.enable");
    await metrics(width, height);
    return { send, evaluate, wait, exists, goto, shot, metrics, errors, warnings, events, close, sleep,
      click, clickSelector, clickAt, box, key, type, dragSlider, dragBy };
  } catch (error) {
    await close();
    throw error;
  }
}

export async function enterStudy(browser) {
  await browser.click("进入学习空间", "button", { exact: true });
  await browser.wait('!!document.querySelector(\'main[aria-label="题目学习会话"]\')', "study layout");
}

export async function showLibrary(browser) {
  if (await browser.exists('button[aria-label="展开题库与题目栏"]')) await browser.click("展开题库与题目栏");
  else if (await browser.exists('button[aria-label="打开题库"]')) await browser.click("打开题库");
  const scope = await browser.exists(LEFT) ? LEFT : '[role="dialog"][data-state="open"]';
  await browser.click("全部", `${scope} button`, { exact: true });
  await browser.wait(`document.querySelectorAll(${JSON.stringify(`${scope} ${ROW}`)}).length > 0`, "existing library rows");
  return scope;
}

export async function openExisting(browser, title) {
  const scope = await showLibrary(browser);
  const selector = title ? `${scope} button[aria-label=${JSON.stringify(`题目 ${title} 的操作`)}]` : `${scope} ${ROW}`;
  const selectedTitle = title ?? await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-label').slice(3, -4)`);
  await browser.clickSelector(selector);
  await browser.click("打开工作台", '[role="menuitem"]', { exact: true });
  await browser.wait(`!!document.querySelector(${JSON.stringify(CANVAS)}) && !document.querySelector('[role="dialog"][data-state="open"]')`, "existing workspace selected");
  return selectedTitle;
}

export async function fold(browser, label) {
  return browser.evaluate(`(() => {
    const section = document.querySelector('section[aria-label=${JSON.stringify(label)}]');
    const button = section?.querySelector('button[aria-expanded]');
    const panel = button && document.getElementById(button.getAttribute('aria-controls'));
    return {expanded:button?.getAttribute('aria-expanded'), heading:button?.querySelector('h2')?.textContent,
      panel:!!panel, text:(panel?.textContent || '').trim(), composer:!!document.querySelector('input[aria-label="追加提问"]')?.getClientRects().length};
  })()`);
}

export async function canvasState(browser) {
  return browser.evaluate(`(() => {
    const c = document.querySelector(${JSON.stringify(CANVAS)});
    if (!c || !c.width || !c.height) return null;
    const pixels = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let painted = 0; const colors = new Set();
    for (let i = 0; i < pixels.length; i += 4 * 97) {
      if (pixels[i+3] > 8) painted++;
      colors.add(pixels.slice(i,i+4).join(','));
    }
    const rect = c.getBoundingClientRect();
    return {width:c.width, height:c.height, cssWidth:rect.width, cssHeight:rect.height, painted, colors:colors.size};
  })()`);
}

export async function timeState(browser) {
  return browser.evaluate(`(() => {
    const slider = document.querySelector('[role="slider"][aria-label="动画时间轴"]');
    return slider ? {time:Number(slider.getAttribute('aria-valuenow')), duration:Number(slider.getAttribute('aria-valuemax'))} : null;
  })()`);
}

// Reports always describe failures, including launch errors. Screenshots/downloads use a
// fresh folder; existing baseline screenshots and previous run artifacts are never replaced.
export async function runProbe(name, options, test) {
  const out = join(fileURLToPath(new URL(".", import.meta.url)), "downloads");
  mkdirSync(out, { recursive: true });
  const report = { name, base:BASE, status:"running", completed:false, startedAt:new Date().toISOString(), checks:[], observations:{}, fatal:null };
  let browser;
  const check = (name, passed, actual) => {
    const result = { name, status:passed ? "passed" : "failed", actual };
    report.checks.push(result);
    console.log(JSON.stringify(result));
    return passed;
  };
  const expect = (name, passed, actual) => {
    if (!check(name, passed, actual)) {
      const error = new Error(name); error.name = "AssertionError"; throw error;
    }
  };
  try {
    report.artifactDir = mkdtempSync(join(out, `${name}-run-`));
    browser = await launch(options);
    await test({ browser, dir:report.artifactDir, check, expect,
      log:(name, value) => { report.observations[name] = value; },
      shot:(file) => browser.shot(join(report.artifactDir, file)),
    });
    report.completed = true;
  } catch (error) {
    report.fatal = { kind:!browser ? "launch" : error.name === "AssertionError" ? "assertion" : "execution", message:error.message, stack:error.stack };
    console.error(`${name}: ${error.stack || error}`);
  } finally {
    if (browser) {
      check("consoleErrors", browser.errors.length === 0, browser.errors);
      report.observations.consoleWarnings = browser.warnings;
      await browser.close();
    }
    report.status = report.fatal || report.checks.some((entry) => entry.status === "failed") ? "failed" : "passed";
    report.finishedAt = new Date().toISOString();
    if (report.status === "failed") process.exitCode = 1;
    const reportPath = join(out, `${name}-report.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({status:report.status, report:reportPath, artifactDir:report.artifactDir}));
  }
}
