// Parameter/phase/speed/display controls, pane resize, theme and same-session persistence.
import { BASE, LEFT, RIGHT, ROW, CANVAS, runProbe, enterStudy, openExisting, fold, canvasState, timeState, waitFor, sleep } from "./cdp.mjs";

await runProbe("v2-interact", {port:9334, width:1440, height:900}, async ({browser, check, expect, log, shot}) => {
  const prefs = () => browser.evaluate(`JSON.parse(localStorage.getItem('gewu-prefs-v2') || '{}')`);
  const slider = (label) => browser.evaluate(`(() => {
    const el = document.querySelector('[role="slider"][aria-label^=${JSON.stringify(label)}]');
    return el ? {value:Number(el.getAttribute('aria-valuenow')), min:Number(el.getAttribute('aria-valuemin')), max:Number(el.getAttribute('aria-valuemax'))} : null;
  })()`);
  const pressed = (label) => browser.evaluate(`document.querySelector('button[aria-label=${JSON.stringify(label)}]')?.getAttribute('aria-pressed')`);
  const panelWidth = (selector) => browser.evaluate(`document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().width`);
  await browser.goto(BASE);
  await enterStudy(browser);
  const initialPrefs = await prefs();
  const initialTheme = await browser.evaluate('document.documentElement.dataset.theme');
  check("themeMatchesStoredPreferenceOrLightDefault", initialTheme === (initialPrefs.theme === "system" ? await browser.evaluate(`matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'`) : initialPrefs.theme || "light"), {initialPrefs, initialTheme});
  const sessionTitle = await openExisting(browser);
  const rowCount = await browser.evaluate(`document.querySelectorAll(${JSON.stringify(`${LEFT} ${ROW}`)}).length`);
  log("selectedExistingSession", sessionTitle);
  if (!(await browser.exists(RIGHT))) await browser.clickSelector('button[aria-label="展开参数与对话栏"]');
  await shot("10-workspace.png");

  const originalAngle = await slider("抛射角");
  expect("angleSliderAvailable", originalAngle !== null, originalAngle);
  await browser.dragSlider("抛射角", 0.5);
  await browser.wait(`Number(document.querySelector('[role="slider"][aria-label^="抛射角"]').getAttribute('aria-valuenow')) === 45`, "angle reaches 45 degrees");
  check("angleTrackDrag", true, {before:originalAngle, after:await slider("抛射角")});
  const values = {v0:(await slider("初速度"))?.value, angle:45, h0:(await slider("初始高度"))?.value, g:(await slider("重力加速度"))?.value};
  expect("physicalInputsValid", values.v0 > 0 && values.h0 >= 0 && values.g > 0, values);
  const vy = values.v0 * Math.sin(Math.PI / 4), vx = values.v0 * Math.cos(Math.PI / 4);
  const duration = (vy + Math.sqrt(vy * vy + 2 * values.g * values.h0)) / values.g;
  const expected = {range:(vx * duration).toFixed(2), height:(values.h0 + vy * vy / (2 * values.g)).toFixed(2), duration:duration.toFixed(2)};
  const solution = await fold(browser, "简要题解");
  const solutionNumbers = (solution.text.match(/-?\d+(?:\.\d+)?/g) || []).map((value) => Number(value).toString());
  check("parameterUpdatesSolution", Object.values(expected).every((value) => solutionNumbers.includes(Number(value).toString())), {values, expected, text:solution.text});
  const axis = await timeState(browser);
  check("parameterUpdatesAnimationDuration", Math.abs(axis.duration - duration) < 0.02, {axis, duration});
  await shot("11-angle45.png");

  // Display controls are inside the independently scrolling right panel.
  const displays = {"速度矢量":"vectors", "能量":"energy", "残影":"trail", "频闪":"strobe", "网格":"grid", "关键点":"markers", "发光":"glow"};
  const savedDisplays = {};
  for (const [label, key] of Object.entries(displays)) {
    const before = await pressed(label);
    expect(`${key}TogglePresent`, ["true", "false"].includes(before), before);
    await browser.clickSelector(`${RIGHT} button[aria-label=${JSON.stringify(label)}]`);
    const after = await pressed(label);
    check(`${key}ToggleChanges`, after === String(before !== "true"), {before, after});
    savedDisplays[key] = after === "true";
  }
  const displayCanvas = await canvasState(browser);
  check("displayChangesKeepCanvasPainted", displayCanvas?.painted > 0 && displayCanvas.colors > 4, displayCanvas);

  await browser.clickSelector('button[aria-label="2 倍速"]');
  check("speed2Selected", await browser.evaluate(`document.querySelector('button[role="radio"][aria-label="2 倍速"]')?.getAttribute('aria-checked') === 'true'`));
  const speedBadge = await browser.evaluate(`[...document.querySelectorAll('[aria-label="动画演示"] span')].map((el) => el.textContent).find((text) => /(?:播放中|已暂停|已结束).*2×/.test(text))`);
  check("speedBadgeUpdated", !!speedBadge, speedBadge);
  if (await pressed("循环播放") !== "true") await browser.clickSelector('button[aria-label="循环播放"]');
  check("loopEnabled", await pressed("循环播放") === "true");
  await browser.clickSelector('button[aria-label="从头播放"]');
  const start = await timeState(browser);
  await waitFor(async () => (await timeState(browser)).time > start.time + 0.1, "2x playback advances");
  await browser.click("暂停", '[aria-label="动画控制区"] button', {exact:true});

  const apex = await browser.evaluate(`(() => {
    const button = [...document.querySelectorAll('[aria-label="动画过程阶段"] button')].find((b) => b.textContent.includes('最高点'));
    return button ? {title:button.title, seek:Number(button.title.match(/[0-9.]+/)?.[0])} : null;
  })()`);
  expect("apexPhaseAvailable", apex !== null && Number.isFinite(apex.seek), apex);
  await browser.click("最高点", '[aria-label="动画过程阶段"] button');
  const atApex = await timeState(browser);
  check("phaseSeeksPausedTimeline", Math.abs(atApex.time - apex.seek) < 0.02, {apex, atApex});
  check("phaseSelectionUpdates", await browser.evaluate(`[...document.querySelectorAll('[aria-label="动画过程阶段"] button')].some((b) => b.textContent.includes('最高点') && b.getAttribute('aria-pressed') === 'true')`));
  await browser.clickSelector('section[aria-label="详细讲解"] > button[aria-expanded]');
  const detail = await fold(browser, "详细讲解");
  check("detailFoldOpens", detail.expanded === "true" && detail.panel, detail);
  const detailBlock = await browser.evaluate(`(() => {
    const section = document.querySelector('section[aria-label="详细讲解"]');
    const panel = document.getElementById(section?.querySelector('button[aria-expanded]')?.getAttribute('aria-controls'));
    return {pre:panel?.querySelectorAll('pre').length, text:panel?.querySelector('pre')?.textContent || '',
      obsolete:panel?.querySelectorAll('article, a, [role="link"], [aria-label="过程讲解"], [aria-label="动画过程阶段"], [aria-label="答疑"], [aria-label="问答记录"], [aria-label="追加提问"]').length,
      buttons:[...panel?.querySelectorAll('button') || []].map((button) => button.textContent.trim())};
  })()`);
  check("detailHasTwoMethodsInOnePlainBlock", detailBlock.pre === 1 && ["① 分解运动法", "② 能量与分段运动法"].every((method) => detailBlock.text.includes(method)), detailBlock);
  check("detailHasNoPhaseLinksOrQA", detailBlock.obsolete === 0 && detailBlock.buttons.every((text) => text === "复制详解"), detailBlock);
  check("openingDetailDoesNotSeekCanvas", Math.abs((await timeState(browser)).time - atApex.time) < 0.02);
  await shot("12-phase-detail.png");

  await browser.clickSelector('button[aria-label="收起参数与对话栏"]');
  check("rightPaneCollapses", !(await browser.exists(RIGHT)) && await browser.exists(CANVAS));
  await browser.clickSelector('button[aria-label="展开参数与对话栏"]');
  check("rightPaneExpands", await browser.exists(RIGHT));
  for (const [side, panel, label] of [["right", RIGHT, "调整讲解栏宽度"], ["left", LEFT, "调整题库栏宽度"]]) {
    const before = {width:await panelWidth(panel), preference:(await prefs())[`${side}Width`]};
    // Shrink from defaults so the CSS vw cap cannot hide the tested size change.
    const dx = side === "right" ? (before.preference > 300 ? 32 : -32) : (before.preference > 270 ? -24 : 24);
    await browser.dragBy(`[role="separator"][aria-label=${JSON.stringify(label)}]`, dx);
    const after = {width:await panelWidth(panel), preference:(await prefs())[`${side}Width`]};
    check(`${side}PaneResizes`, Math.abs(after.width - before.width) > 5 && after.preference !== before.preference, {before, after});
  }

  // Theme modes need not change resolved color immediately (light -> system).
  const oldMode = (await prefs()).theme || "light";
  await browser.clickSelector('button[aria-label^="外观："]');
  const changedMode = (await prefs()).theme;
  check("themeModeCycles", changedMode !== oldMode && ["light", "system", "dark"].includes(changedMode), {oldMode, changedMode});
  for (let n = 0; n < 3 && (await prefs()).theme !== "dark"; n++) await browser.clickSelector('button[aria-label^="外观："]');
  await browser.wait(`document.documentElement.dataset.theme === 'dark'`, "dark theme applied");
  await shot("13-dark-theme.png");
  const savedPrefs = await prefs();
  // Parameter persistence is intentionally debounced by the app; allow its 320ms flush.
  await sleep(500);
  log("beforeReload", {sessionTitle, savedPrefs, angle:await slider("抛射角"), rowCount});
  await browser.goto(BASE);
  await browser.wait(`!![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '进入学习空间')`, "reload returns landing");
  check("reloadStartsAtLanding", !(await browser.exists(CANVAS)));
  await enterStudy(browser);
  // Entering does not restore the workspace: explicitly reopen this exact session.
  await openExisting(browser, sessionTitle);
  const restored = await prefs();
  const restoredAngle = await slider("抛射角");
  check("sameSessionSelected", await browser.evaluate(`document.querySelector(${JSON.stringify(`${LEFT} button[aria-current="true"]`)})?.textContent.includes(${JSON.stringify(sessionTitle)})`));
  check("reloadDoesNotCreateSession", await browser.evaluate(`document.querySelectorAll(${JSON.stringify(`${LEFT} ${ROW}`)}).length`) === rowCount);
  check("anglePersists", restoredAngle?.value === 45, restoredAngle);
  for (const key of ["theme", "speed", "loop", "leftWidth", "rightWidth", "leftOpen", "rightOpen"]) check(`${key}Persists`, restored[key] === savedPrefs[key], {expected:savedPrefs[key], actual:restored[key]});
  for (const [label, key] of Object.entries(displays)) check(`${key}DisplayPersists`, restored.stage?.[key] === savedDisplays[key] && await pressed(label) === String(savedDisplays[key]), {expected:savedDisplays[key], actual:restored.stage?.[key]});
  check("darkPreferenceHonoredOnReload", await browser.evaluate(`document.documentElement.dataset.theme === 'dark'`));
  check("speedUIRestored", await browser.evaluate(`document.querySelector('button[role="radio"][aria-label="2 倍速"]')?.getAttribute('aria-checked') === 'true'`));
  log("afterReload", {restored, canvas:await canvasState(browser)});
  await shot("14-after-reload.png");
});
