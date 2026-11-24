// UI-only exports; pure renderer imports are comparison oracles, never export entry points.
// Every generated artifact stays in runProbe's ignored, unique download directory.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { BASE, RIGHT, CANVAS, runProbe, enterStudy, openExisting, timeState, waitFor, sleep } from "./cdp.mjs";

const fields = { v0: "自定义初速度 v₀", angleDeg: "自定义抛射角 θ", h0: "自定义初始高度 h₀", g: "自定义重力加速度 g" };
const displayLabels = { vectors: "速度矢量", energy: "能量", trail: "残影", strobe: "频闪", grid: "网格", markers: "关键点", glow: "发光" };
const protectedFiles = ["lib/video.ts", "lib/renderer.ts", "lib/motion.ts", "src/features/stage/VideoExport.tsx", "src/features/stage/StageView.tsx", "src/features/library/CriticalPoints.tsx", "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json", ".gitignore"];
const fingerprints = () => Object.fromEntries(protectedFiles.map(path => {
  try { return [path, createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex")]; }
  catch (error) { if (error.code === "ENOENT") return [path, null]; throw error; }
}));
const originalFiles = fingerprints();

async function installOracle(problem, fields, canvasSelector) {
  const [{ drawScene }, { solveProjectile }, { readPalette }, { criticalStates, sceneTransform, stateAt }] = await Promise.all([
    import("/lib/renderer.ts"), import("/lib/physics.ts"), import("/lib/palette.ts"), import("/lib/motion.ts"),
  ]);
  const q = window.exportQA = { snapshots: {}, images: {}, progress: [], native: { encoded: 0, closed: 0 } };
  const originalEncode = VideoEncoder.prototype.encode, originalClose = VideoEncoder.prototype.close;
  VideoEncoder.prototype.encode = function (...args) { q.native.encoded++; return originalEncode.apply(this, args); };
  VideoEncoder.prototype.close = function (...args) { q.native.closed++; return originalClose.apply(this, args); };
  q.restore = () => { VideoEncoder.prototype.encode = originalEncode; VideoEncoder.prototype.close = originalClose; q.observer.disconnect(); };
  q.observer = new MutationObserver(() => {
    const el = document.querySelector('progress[aria-label="视频导出进度"]');
    if (el && q.progress.at(-1)?.value !== el.value) q.progress.push({ value: el.value, at: performance.now() });
  });
  q.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["value"] });
  q.make = (width, height) => { const c = document.createElement("canvas"); c.width = width; c.height = height; return c; };
  q.pixels = c => c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  q.stats = c => {
    const pixels = q.pixels(c); let hash = 2166136261, transparent = 0;
    for (let i = 0; i < pixels.length; i++) { hash = Math.imul(hash ^ pixels[i], 16777619); if (i % 4 === 3 && pixels[i] !== 255) transparent++; }
    return { width: c.width, height: c.height, hash: (hash >>> 0).toString(16), nonOpaquePixels: transparent };
  };
  q.diff = (a, b, rect) => {
    const ap = q.pixels(a), bp = q.pixels(b); let error = 0, changed = 0, n = 0;
    const r = rect || { x: 0, y: 0, w: a.width, h: a.height };
    for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(a.height, Math.ceil(r.y + r.h)); y++) {
      for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(a.width, Math.ceil(r.x + r.w)); x++) {
        const i = (y * a.width + x) * 4;
        for (let c = 0; c < 3; c++) { const d = Math.abs(ap[i + c] - bp[i + c]); error += d; changed += d > 0 ? 1 : 0; n++; }
      }
    }
    return { mae: error / n, changedChannels: changed };
  };
  q.capture = name => {
    const params = Object.fromEntries(Object.entries(fields).map(([key, label]) => [key, Number(document.querySelector(`input[aria-label="${label}"]`).value)]));
    const prefs = JSON.parse(localStorage.getItem("gewu-prefs-v2"));
    const canvas = document.querySelector(canvasSelector), slider = document.querySelector('[aria-label="动画时间轴"][role="slider"]');
    const paused = ![...document.querySelectorAll('[aria-label="动画控制区"] button')].some(b => b.textContent.trim() === "暂停");
    const snapshot = { problem: { ...problem, params }, result: solveProjectile(params), palette: readPalette(), options: { ...prefs.stage }, prefs: { stage: prefs.stage, speed: prefs.speed, loop: prefs.loop }, time: Number(slider.getAttribute("aria-valuenow")), paused, width: canvas.width, height: canvas.height, scale: canvas.width / canvas.parentElement.clientWidth, live: q.stats(canvas) };
    const liveCopy = q.make(canvas.width, canvas.height); liveCopy.getContext('2d').drawImage(canvas, 0, 0); q.images[`live-${name}`] = liveCopy;
    q.snapshots[name] = snapshot;
    return { ...snapshot, result: { flightTime: snapshot.result.flightTime, apexTime: snapshot.result.apexTime }, points: criticalStates(snapshot.problem, snapshot.result) };
  };
  q.render = (snapshot, t, width, height, scale = 1, options = snapshot.options, palette = snapshot.palette, rate) => {
    const c = q.make(width, height), ctx = c.getContext("2d"); ctx.scale(scale, scale);
    drawScene(ctx, width / scale, height / scale, { problem: snapshot.problem, result: snapshot.result, time: t }, palette, options);
    ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, width / scale, height / scale); ctx.globalCompositeOperation = "source-over";
    if (rate !== undefined) { ctx.fillStyle = palette.muted; ctx.font = "12px sans-serif"; ctx.fillText(`格物 · ${rate}× 演示 · 完整运动（不含碰撞）`, 20, height - 12); }
    return c;
  };
  q.blob = (base64, type) => new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type });
  q.loadPng = async (key, base64) => {
    const bitmap = await createImageBitmap(q.blob(base64, "image/png"));
    const c = q.make(bitmap.width, bitmap.height); c.getContext("2d").drawImage(bitmap, 0, 0); bitmap.close(); q.images[key] = c;
    return q.stats(c);
  };
  q.pngMatch = (key, snapshotName, t, cell) => {
    const s = q.snapshots[snapshotName]; let actual = q.images[key];
    if (cell !== undefined) { const c = q.make(960, 540); c.getContext("2d").drawImage(actual, (cell % 2) * 960, Math.floor(cell / 2) * 600 + 50, 960, 540, 0, 0, 960, 540); actual = c; }
    const scale = cell === undefined ? s.scale : 1;
    const expected = q.render(s, t, actual.width, actual.height, scale);
    const alternate = q.render(s, t, actual.width, actual.height, scale, Object.fromEntries(Object.entries(s.options).map(([key, value]) => [key, !value])));
    return { ...q.stats(actual), match: q.diff(actual, expected), alternateOptions: q.diff(actual, alternate) };
  };
  q.decodeVideo = async (base64, snapshotName, rate) => {
    const s = q.snapshots[snapshotName], video = document.createElement("video"); video.muted = true; video.playsInline = true; video.preload = "auto";
    // 产品不再有深色模式，参照组改由探针自己造：整板反色，用来证明「帧沿用开始时的调色板」这条判据有分辨力。
    const otherPalette = Object.fromEntries(Object.entries(s.palette).map(([key, value]) => [key, "#" + [1, 3, 5].map(i => (255 - parseInt(value.slice(i, i + 2), 16)).toString(16).padStart(2, "0")).join("")]));
    const url = URL.createObjectURL(q.blob(base64, "video/mp4"));
    const event = name => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error(`video ${name} timeout`)); }, 6000);
      const cleanup = () => { clearTimeout(timer); video.removeEventListener(name, ok); video.removeEventListener("error", fail); };
      const ok = () => { cleanup(); resolve(); }, fail = () => { cleanup(); reject(new Error(`video decode: ${video.error?.message}`)); };
      video.addEventListener(name, ok, { once: true }); video.addEventListener("error", fail, { once: true });
    });
    try {
      const ready = event("loadeddata"); video.src = url; await ready;
      const metadata = { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
      const playing = event("timeupdate"); await video.play(); await playing; await new Promise(resolve => setTimeout(resolve, 150)); video.pause(); metadata.playbackAdvanced = video.currentTime > 0;
      const count = Math.max(2, Math.ceil(s.result.flightTime / rate * 30));
      const indices = [0, Math.floor((count - 1) / 2), count - 1], times = indices.map(i => s.result.flightTime * i / (count - 1));
      const expected = times.map(t => q.render(s, t, 1280, 720, 1, s.options, s.palette, rate));
      const frames = [];
      for (let k = 0; k < indices.length; k++) {
        const seeked = event("seeked"); video.currentTime = (indices[k] + 0.35) / 30; await seeked;
        const c = q.make(1280, 720); c.getContext("2d").drawImage(video, 0, 0); q.images[`video-${k}`] = c;
        const p = stateAt(s.problem.params, times[k]), transform = sceneTransform(1280, 720, s.result), x = transform.X(p.x), y = transform.Y(p.y), rect = { x: x - 10, y: y - 10, w: 20, h: 20 };
        const optionsChanged = q.render(s, times[k], 1280, 720, 1, Object.fromEntries(Object.entries(s.options).map(([key, value]) => [key, !value])), s.palette, rate);
        const paletteChanged = q.render(s, times[k], 1280, 720, 1, s.options, otherPalette, rate);
        frames.push({ ...q.stats(c), index: indices[k], videoTime: video.currentTime, physicsTime: times[k], physics: p, screen: { x, y }, sceneMatches: expected.map(e => q.diff(c, e).mae), projectileMatches: expected.map(e => q.diff(c, e, rect).mae), alternateOptions: q.diff(c, optionsChanged).mae, alternatePalette: q.diff(c, paletteChanged).mae });
      }
      return { ...metadata, count, expectedDuration: s.result.flightTime / rate, frames };
    } finally { video.pause(); video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
  };
  return { encoder: !!globalThis.VideoEncoder, videoFrame: !!globalThis.VideoFrame };
}

await runProbe("v4-export", { port: 9362, width: 1600, height: 1000 }, async ({ browser, dir, check, expect, log, shot }) => {
  const downloads = join(dir, "downloads"); mkdirSync(downloads);
  await browser.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true });
  const ev = expression => browser.evaluate(expression);
  const text = selector => ev(`document.querySelector(${JSON.stringify(selector)})?.textContent || ''`);
  const capture = name => ev(`exportQA.capture(${JSON.stringify(name)})`);
  const inventory = () => readdirSync(downloads).sort();
  const downloadsStarted = () => browser.events.filter(e => e.method === "Browser.downloadWillBegin").length;
  const uiButton = label => `[...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.trim() === ${JSON.stringify(label)})`;
  const noPartial = () => !inventory().some(file => /\.crdownload$|\.tmp$/.test(file));
  const nextDownload = async (before, ext) => {
    const filename = await waitFor(() => inventory().find(file => !before.includes(file) && file.endsWith(ext) && statSync(join(downloads, file)).size > 0) || null, `${ext} download completes`, 120000);
    await waitFor(noPartial, "no partial download remains");
    return { name: filename, path: join(downloads, filename), bytes: readFileSync(join(downloads, filename)) };
  };
  const png = async (key, action, snapshot, time, cell) => {
    const before = inventory(); await action(); const file = await nextDownload(before, ".png");
    check(`${key}: PNG signature`, file.bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), { file: file.path, bytes: file.bytes.length });
    const decoded = await ev(`exportQA.loadPng(${JSON.stringify(key)}, ${JSON.stringify(file.bytes.toString("base64"))})`);
    check(`${key}: opaque decoded PNG`, decoded.nonOpaquePixels === 0, decoded);
    if (snapshot) {
      const match = await ev(`exportQA.pngMatch(${JSON.stringify(key)}, ${JSON.stringify(snapshot)}, ${time}, ${cell ?? "undefined"})`);
      check(`${key}: exact renderer/state/settings match`, match.match.mae === 0 && match.alternateOptions.mae > 0.05, match);
    }
    return { ...decoded, path: file.path };
  };
  const stable = async (name, before, comparePalette = true) => {
    const after = await capture(`${name}-after`);
    check(`${name}: preserves paused live time and settings`, after.paused && before.paused && after.time === before.time && JSON.stringify(after.prefs) === JSON.stringify(before.prefs) && JSON.stringify(after.problem.params) === JSON.stringify(before.problem.params) && (!comparePalette || JSON.stringify(after.palette) === JSON.stringify(before.palette)), { before: { time: before.time, paused: before.paused, hash: before.live.hash, prefs: before.prefs }, after: { time: after.time, paused: after.paused, hash: after.live.hash, prefs: after.prefs } });
  };
  const setParam = async (key, value) => {
    await browser.type(`input[aria-label=${JSON.stringify(fields[key])}]`, String(value)); await browser.key("Enter", "Enter", 13);
    await browser.wait(`Number(document.querySelector('[role="slider"][aria-label=${JSON.stringify(fields[key].slice(3))}]')?.getAttribute('aria-valuenow')) === ${value}`, `${key} committed`);
  };
  const pauseAt = async fraction => { await browser.dragSlider("动画时间轴", fraction); await browser.wait(`[...document.querySelectorAll('[aria-label="动画控制区"] button')].some(b => b.textContent.trim() === '播放')`, "paused timeline"); };
  const setRate = async value => {
    await browser.clickSelector('select[aria-label="视频倍速"]'); await browser.key("Home", "Home", 36);
    for (let i = 0; i < [0.25, 0.5, 1, 2, 5, 10, 20].indexOf(value); i++) await browser.key("ArrowDown", "ArrowDown", 40);
    await browser.key("Enter", "Enter", 13); await browser.wait(`document.querySelector('select[aria-label="视频倍速"]').value === '${value}'`, "video rate selected");
  };
  const openVideo = async () => { await browser.click("导出视频", 'button', { exact: true }); await browser.wait(`!!document.querySelector('[role="dialog"] select[aria-label="视频倍速"]')`, "export dialog opens"); };
  const closeVideo = async () => { await browser.clickSelector('[role="dialog"] [data-slot="dialog-close"]'); await browser.wait(`!document.querySelector('[role="dialog"]')`, "export dialog closes"); };
  const start = () => browser.click("开始导出 MP4", '[role="dialog"] button', { exact: true });

  try {
    await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
    await browser.goto(BASE); await enterStudy(browser); const title = await openExisting(browser); log("session", title);
    if (!(await browser.exists(RIGHT))) await browser.click("展开参数与对话栏");
    const problem = await ev(`new Promise((resolve, reject) => { const r = indexedDB.open('gewu-studio'); r.onerror = () => reject(r.error); r.onsuccess = () => { const db = r.result, request = db.transaction('sessions').objectStore('sessions').getAll(); request.onsuccess = () => { resolve(request.result.find(s => s.title === ${JSON.stringify(title)}).problem); db.close(); }; }; })`);
    const capabilities = await ev(`(${installOracle.toString()})(${JSON.stringify(problem)}, ${JSON.stringify(fields)}, ${JSON.stringify(CANVAS)})`);
    log("browserCapabilities", capabilities);
    for (const [key, value] of Object.entries({ v0: 24, angleDeg: 37, h0: 5, g: 10 })) await setParam(key, value);
    const chosenOptions = { vectors: false, energy: true, trail: false, strobe: true, grid: false, markers: true, glow: false };
    for (const [key, label] of Object.entries(displayLabels)) {
      if (await ev(`document.querySelector('button[aria-label="${label}"]').getAttribute('aria-pressed')`) !== String(chosenOptions[key])) await browser.clickSelector(`${RIGHT} button[aria-label="${label}"]`);
    }
    await browser.clickSelector('button[aria-label="0.5 倍速"]');
    await pauseAt(0.32);
    const baseline = await capture("baseline"); log("baseline", baseline);
    expect("nonzero elevated trajectory with four distinct critical states", baseline.points.length === 4 && new Set(baseline.points.map(p => p.time)).size === 4 && baseline.time > 0 && baseline.time < baseline.result.flightTime, baseline.points);
    const current = await png("current", () => browser.click("导出 PNG", '[aria-label="动画控制区"] button', { exact: true }), "baseline", baseline.time);
    check("current PNG dimensions match stage", current.width === baseline.width && current.height === baseline.height, current);
    await stable("current PNG", baseline);
    await browser.click("对象与受力", `${RIGHT} [role="tab"]`);
    await browser.wait(`!!document.querySelector('div[aria-label="题目临界状态"]')?.getClientRects().length`, "临界状态面板出现");
    const critical = [];
    for (const point of baseline.points) {
      const image = await png(point.id, () => browser.clickSelector(`button[aria-label=${JSON.stringify(`导出${point.title} PNG`)}]`), "baseline", point.time);
      check(`${point.id}: individual PNG dimensions`, image.width === baseline.width && image.height === baseline.height, image);
      critical.push(image); await stable(`critical ${point.id}`, baseline);
    }
    check("individual critical images are distinct", new Set(critical.map(image => image.hash)).size === 4, critical);
    const sheet = await png("sheet", () => browser.click("导出全部临界状态", "button", { exact: true }));
    check("contact sheet dimensions", sheet.width === 1920 && sheet.height === Math.ceil(baseline.points.length / 2) * 600, sheet);
    const cells = [];
    for (const [i, point] of baseline.points.entries()) {
      const match = await ev(`exportQA.pngMatch('sheet', 'baseline', ${point.time}, ${i})`); cells.push(match.hash);
      check(`sheet ${point.id}: renderer/state/settings match (one-level compositing tolerance)`, match.match.mae < 0.0001 && match.match.changedChannels <= 32 && match.alternateOptions.mae > 0.05, match);
    }
    check("contact sheet cells have distinct states", new Set(cells).size === 4, cells); await stable("contact sheet", baseline);
    await shot("01-png-exports.png");
    // 临界导出用完了「对象与受力」页签，后面的改参数步骤要回到「动画参数」。
    await browser.click("动画参数", `${RIGHT} [role="tab"]`);
    await browser.wait(`!!document.querySelector('input[aria-label=${JSON.stringify(fields.v0)}]')?.getClientRects().length`, "参数页签恢复可见");

    await openVideo();
    check("export rate defaults to live speed", await ev(`document.querySelector('select[aria-label="视频倍速"]').value === '0.5'`));
    await setRate(0.25); const successBefore = inventory();
    await start();
    await browser.wait(`!!document.querySelector('progress[aria-label="视频导出进度"]')`, "native encoding progress appears");
    check("rate locked during native export", await ev(`document.querySelector('select[aria-label="视频倍速"]').disabled`));
    await shot("02-mp4-progress.png");
    // 系统深色偏好是导出弹窗之外的外部事件：产品没有深色模式，编码中的底色必须与开始时一致。
    await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
    const during = await capture("during-video");
    check("osDarkFlipKeepsStartPalette", JSON.stringify(during.palette) === JSON.stringify(baseline.palette), { baseline: baseline.palette, during: during.palette });
    const movie = await nextDownload(successBefore, ".mp4");
    await browser.wait(`document.querySelector('[role="dialog"] [role="status"]')?.textContent.includes('MP4 已生成并下载')`, "MP4 success status", 120000);
    const progress = await ev("exportQA.progress"); log("successfulProgress", progress);
    // React may batch the final 100% render with the success/idle render; success was awaited above.
    check("visible encoding progress advances monotonically to success", progress.some(p => p.value > 0 && p.value < 100) && progress.at(-1)?.value >= 90 && progress.every((p, i) => !i || p.value >= progress[i - 1].value), progress);
    check("MP4 ftyp, avc1 video entry and avcC header", movie.bytes.toString("ascii", 4, 8) === "ftyp" && movie.bytes.indexOf(Buffer.from("avc1"), 100) > 100 && movie.bytes.indexOf(Buffer.from("avcC")) > 100, { path: movie.path, bytes: movie.bytes.length, avc1VideoOffset: movie.bytes.indexOf(Buffer.from("avc1"), 100), avcCOffset: movie.bytes.indexOf(Buffer.from("avcC")) });
    const video = await ev(`exportQA.decodeVideo(${JSON.stringify(movie.bytes.toString("base64"))}, 'baseline', 0.25)`);
    log("decodedVideo", video);
    check("native video playback and finite 1280x720 duration", video.playbackAdvanced && video.width === 1280 && video.height === 720 && Number.isFinite(video.duration) && Math.abs(video.duration - video.expectedDuration) <= 2 / 30, { width: video.width, height: video.height, duration: video.duration, expected: video.expectedDuration, playbackAdvanced: video.playbackAdvanced });
    check("decoded first/middle/last frames distinct", new Set(video.frames.map(f => f.hash)).size === 3, video.frames.map(f => ({ hash: f.hash, physics: f.physics, time: f.videoTime })));
    for (const [i, frame] of video.frames.entries()) {
      const correct = frame.sceneMatches[i], body = frame.projectileMatches[i];
      check(`MP4 frame ${i}: actual projectile state matches expected time`, correct < 5 && body < 35 && frame.sceneMatches.every((score, j) => j === i || score > correct + 0.1) && frame.projectileMatches.every((score, j) => j === i || score > body + 1), frame);
      check(`MP4 frame ${i}: start settings/palette snapshot retained`, frame.alternateOptions > correct + 0.2 && frame.alternatePalette > correct + 10, { correct, alternateOptions: frame.alternateOptions, alternatePalette: frame.alternatePalette });
      const data = await ev(`exportQA.images['video-${i}'].toDataURL('image/png').split(',')[1]`);
      writeFileSync(join(dir, `mp4-decoded-${["first", "middle", "last"][i]}.png`), Buffer.from(data, "base64"), { flag: "wx" });
    }
    await stable("MP4 export (OS dark flip must not move the picture)", baseline);
    await browser.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
    await closeVideo();
    await stable("MP4 export after restoring OS preference", baseline);
    await shot("03-mp4-completed.png");

    // Direct parameter inputs, not internal application setters, exercise the duration guards.
    for (const [key, value] of Object.entries({ v0: 200, angleDeg: 90, h0: 0, g: 1 })) await setParam(key, value);
    await pauseAt(0.25); const long = await capture("long");
    await openVideo(); await setRate(2);
    check("over-120-second export blocked with helpful message", long.result.flightTime === 400 && await ev(`${uiButton("开始导出 MP4")}?.disabled`) && (await text('[role="dialog"]')).includes("视频最长支持 120 秒，请提高视频倍速"), { physicalDuration: long.result.flightTime, videoDuration: long.result.flightTime / 2 });
    await setRate(5);
    check("raising video rate enables valid duration", !(await ev(`${uiButton("开始导出 MP4")}?.disabled`)), { videoDuration: long.result.flightTime / 5 });
    for (const mode of ["cancel-button", "close-dialog"]) {
      const before = inventory(), begun = downloadsStarted(), counters = await ev("({...exportQA.native})");
      await ev("exportQA.progress = []"); await start();
      await browser.wait(`document.querySelector('progress[aria-label="视频导出进度"]')?.value > 0`, `${mode} actual encoding begins`, 20000);
      const running = await ev("({...exportQA.native})");
      expect(`${mode}: real native frames were encoded`, running.encoded > counters.encoded, { counters, running });
      if (mode === "cancel-button") {
        await browser.click("取消导出", '[role="dialog"] button', { exact: true });
        await browser.wait(`document.querySelector('[role="dialog"] [role="status"]')?.textContent.includes('已取消，未生成文件')`, "cancel status");
        check("cancel returns dialog to retryable idle", !(await browser.exists('progress[aria-label="视频导出进度"]')) && !(await ev(`${uiButton("开始导出 MP4")}?.disabled`)));
        await shot("04-cancelled.png");
      } else await closeVideo();
      await browser.wait(`exportQA.native.closed > ${counters.closed}`, `${mode} native encoder closes`, 20000);
      const stopped = await ev("({...exportQA.native})"); await sleep(800);
      const later = await ev("({...exportQA.native})");
      check(`${mode}: stops encoding and creates no partial/final download`, later.encoded === stopped.encoded && JSON.stringify(before) === JSON.stringify(inventory()) && downloadsStarted() === begun && noPartial(), { stopped, later, downloadsBefore: before.length, downloadsAfter: inventory().length, downloadEvents: downloadsStarted() - begun });
      await stable(mode, long);
      if (mode === "cancel-button") { await closeVideo(); await openVideo(); await setRate(5); }
    }
    await openVideo();
    check("closed job reopens without stale progress/message", !(await browser.exists('progress[aria-label="视频导出进度"]')) && !(await text('[role="dialog"]')).includes("正在逐帧编码") && !(await browser.exists('[role="dialog"] [role="status"]')));
    await closeVideo();

    for (const [key, value] of Object.entries({ v0: 20, angleDeg: 0, h0: 0, g: 10 })) await setParam(key, value);
    const zero = await capture("zero"); await openVideo();
    check("zero flight export blocked with PNG alternative", zero.result.flightTime === 0 && await ev(`${uiButton("开始导出 MP4")}?.disabled`) && (await text('[role="dialog"]')).includes("当前运动时长为零，请导出状态 PNG"));
    await shot("05-zero-flight.png"); await closeVideo();
    await png("zero-png", () => browser.click("导出 PNG", '[aria-label="动画控制区"] button', { exact: true }), "zero", 0);
    await stable("zero PNG", zero);

    for (const [key, value] of Object.entries({ v0: 24, angleDeg: 37, h0: 5, g: 10 })) await setParam(key, value);
    await pauseAt(0.32); const unsupported = await capture("unsupported");
    await openVideo(); await setRate(2);
    const unsupportedBefore = inventory(), unsupportedEvents = downloadsStarted();
    await ev(`window.exportEncoderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'VideoEncoder'); Object.defineProperty(globalThis, 'VideoEncoder', { configurable: true, writable: true, value: undefined }); true;`);
    try {
      await start(); await browser.wait(`document.querySelector('[role="dialog"] [role="status"]')?.textContent.includes('此浏览器不支持 MP4 编码')`, "forced unsupported browser message");
      const message = await text('[role="dialog"] [role="status"]');
      check("missing VideoEncoder handled gracefully", message.includes("最新版 Chrome 或 Edge") && !(await browser.exists('progress[aria-label="视频导出进度"]')) && !(await ev(`${uiButton("开始导出 MP4")}?.disabled`)), message);
      await sleep(500);
      check("unsupported export creates no partial/final download", JSON.stringify(unsupportedBefore) === JSON.stringify(inventory()) && downloadsStarted() === unsupportedEvents && noPartial());
      await shot("06-unsupported.png"); await closeVideo();
      await png("unsupported-png", () => browser.click("导出 PNG", '[aria-label="动画控制区"] button', { exact: true }), "unsupported", unsupported.time);
      await stable("unsupported and PNG fallback", unsupported);
    } finally { await ev(`Object.defineProperty(globalThis, 'VideoEncoder', window.exportEncoderDescriptor); delete window.exportEncoderDescriptor;`); }
    log("downloadEvents", browser.events.filter(e => e.method.startsWith("Browser.download")).map(e => ({ method: e.method, ...e.params })));
    log("artifacts", inventory().map(name => ({ path: join(downloads, name), bytes: statSync(join(downloads, name)).size })));
    log("scope", "Fresh isolated Chrome on 9362; all export starts use reachable UI clicks. Renderer imports only form comparison oracles; no product configuration, dependencies or application state setters changed. OS color scheme intentionally changes mid-export and is restored. VideoEncoder is temporarily hidden only after successful native MP4 download/playback.");
  } finally {
    const finalFiles = fingerprints();
    check("protected product/config/dependency files unchanged during run", JSON.stringify(originalFiles) === JSON.stringify(finalFiles), Object.keys(originalFiles).filter(path => originalFiles[path] !== finalFiles[path]).map(path => ({ path, before: originalFiles[path], after: finalFiles[path] })));
    await ev(`if (window.exportEncoderDescriptor) Object.defineProperty(globalThis, 'VideoEncoder', window.exportEncoderDescriptor); window.exportQA?.restore();`).catch(() => {});
    log("finalDownloads", inventory().map(name => join(downloads, name)));
  }
});
