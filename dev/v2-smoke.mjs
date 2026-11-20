// Intake -> confirmation -> workspace, physics/canvas, folds/QA and real exports.
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { BASE, LEFT, RIGHT, CANVAS, runProbe, enterStudy, fold, canvasState, timeState, waitFor, sleep } from "./cdp.mjs";

await runProbe("v2-smoke", { port:9333, width:1440, height:900 }, async ({ browser, dir, check, expect, log, shot }) => {
  const downloads = join(dir, "downloads");
  mkdirSync(downloads);
  await browser.send("Browser.setDownloadBehavior", { behavior:"allow", downloadPath:downloads, eventsEnabled:true });
  await browser.goto(BASE);
  await browser.wait(`!![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '进入学习空间')`, "landing entry");
  check("landingHasNoWorkspaceCanvas", !(await browser.exists(CANVAS)));
  await enterStudy(browser);
  await browser.wait(`!!document.querySelector('[aria-label="题干或提问输入"]')`, "intake input");
  check("intakeThreeColumns", await browser.exists(LEFT) && await browser.exists(RIGHT));
  await shot("01-intake.png");

  await browser.click("斜抛 · 30°", 'main button', { exact:true });
  await browser.wait(`!!document.querySelector('[aria-label="题目内容（可编辑）"]')`, "confirmation editor");
  const statement = await browser.evaluate(`document.querySelector('[aria-label="题目内容（可编辑）"]').value`);
  check("confirmationKeepsExample", statement.includes("20 m/s") && statement.includes("30°"), statement);
  await shot("02-confirm.png");
  await browser.click("生成动画与题解", 'main button', { exact:true });
  await browser.wait(`!!document.querySelector(${JSON.stringify(CANVAS)})`, "generated workspace");
  check("workspaceThreeColumns", await browser.exists(LEFT) && await browser.exists(RIGHT));
  const canvas = await waitFor(async () => {
    const value = await canvasState(browser);
    return value?.painted > 0 && value.colors > 4 && value.cssWidth > 100 && value.cssHeight > 100 ? value : null;
  }, "nonblank projectile canvas");
  check("paintedCanvas", true, canvas);
  await shot("03-workspace.png");

  // Explicit replay is independent of startup autoplay/reduced motion/end state.
  await browser.clickSelector('button[aria-label="1 倍速"]');
  await browser.clickSelector('button[aria-label="从头播放"]');
  const t1 = await timeState(browser);
  expect("timeAxisAvailable", t1?.duration > 0, t1);
  const t2 = await waitFor(async () => {
    const value = await timeState(browser);
    return value && value.time > t1.time + 0.08 ? value : null;
  }, "animation time advances", 2500);
  check("timeAdvances", true, {t1, t2});
  await browser.click("暂停", '[aria-label="动画控制区"] button', {exact:true});
  const p1 = await timeState(browser);
  await sleep(350); // Observe a genuinely stopped playback interval.
  const p2 = await timeState(browser);
  check("pauseHolds", p1?.time === p2?.time && p1?.time < p1?.duration, {p1, p2});

  let solution = await fold(browser, "简要题解");
  let detail = await fold(browser, "详细讲解");
  check("solutionDefaultExpanded", solution.expanded === "true" && solution.panel && solution.heading === "题解", solution);
  check("detailDefaultCollapsed", detail.expanded === "false" && !detail.panel && detail.heading === "详解", detail);
  check("localPhysicsResults", ["35.35", "5.10", "2.04"].every((value) => solution.text.includes(value)), solution.text);
  check("noObsoleteTabs", !(await browser.exists('[role="tab"]')));
  await browser.clickSelector('section[aria-label="简要题解"] > button[aria-expanded]');
  solution = await fold(browser, "简要题解");
  check("solutionCollapses", solution.expanded === "false" && !solution.panel, solution);
  check("composerSurvivesBothFolds", solution.composer && detail.composer);
  await browser.clickSelector('section[aria-label="简要题解"] > button[aria-expanded]');
  check("solutionReopens", (await fold(browser, "简要题解")).panel);
  await browser.clickSelector('section[aria-label="详细讲解"] > button[aria-expanded]');
  detail = await fold(browser, "详细讲解");
  check("detailContainsPhasesAndQA", detail.expanded === "true" && await browser.exists('section[aria-label="详细讲解"] [aria-label="过程讲解"]') && await browser.exists('section[aria-label="详细讲解"] [aria-label="答疑"]'), detail);
  await shot("04-folds.png");
  await browser.clickSelector('section[aria-label="详细讲解"] > button[aria-expanded]');
  check("detailClosesAgain", !(await fold(browser, "详细讲解")).panel);
  const question = "为什么 45° 射程最远？";
  await browser.type('input[aria-label="追加提问"]', question);
  await browser.clickSelector('button[aria-label="提交提问"]');
  await browser.wait(`document.querySelector('section[aria-label="详细讲解"] > button')?.getAttribute('aria-expanded') === 'true'`, "submit opens detail");
  const answer = await browser.evaluate(`(() => {
    const article = [...document.querySelectorAll('[aria-label="答疑"] article')].find((a) => a.querySelector('h4')?.textContent === ${JSON.stringify(question)});
    return {question:article?.querySelector('h4')?.textContent, paragraphs:article?.querySelectorAll('p').length || 0, text:article?.textContent};
  })()`);
  check("followUpHasLocalAnswer", answer.question === question && answer.paragraphs > 1, answer);
  check("composerClearsAfterSubmit", await browser.evaluate(`document.querySelector('input[aria-label="追加提问"]').value === ''`));
  await shot("05-follow-up.png");

  await browser.click("导出 PNG", '[aria-label="动画控制区"] button', {exact:true});
  await browser.click("导出题解", '[aria-label="动画控制区"] button', {exact:true});
  const files = await waitFor(async () => {
    const names = readdirSync(downloads);
    return names.some((name) => name.endsWith(".png")) && names.some((name) => name.endsWith(".md")) && !names.some((name) => name.endsWith(".crdownload")) ? names : null;
  }, "PNG and Markdown downloads completed", 12000);
  const png = readFileSync(join(downloads, files.find((name) => name.endsWith(".png"))));
  expect("validPngSignature", png.length > 24 && png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), {bytes:png.length});
  const exportedCanvas = await canvasState(browser);
  check("pngMatchesCanvasDimensions", png.readUInt32BE(16) === exportedCanvas.width && png.readUInt32BE(20) === exportedCanvas.height, {width:png.readUInt32BE(16), height:png.readUInt32BE(20)});
  const markdown = readFileSync(join(downloads, files.find((name) => name.endsWith(".md"))), "utf8");
  check("markdownContainsPhysicsAndQuestion", markdown.includes(question) && markdown.includes("射程") && markdown.includes("35.35"), markdown.slice(0,1200));
  log("downloads", files.map((name) => ({file:join(downloads,name), bytes:statSync(join(downloads,name)).size})));
});
