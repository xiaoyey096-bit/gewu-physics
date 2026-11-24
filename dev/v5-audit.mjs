// Independent integration audit for v3: photo intake without a key, statement/question split,
// legal parameter extremes, 390px workspace/export, and library search.
// Deliberately avoids duplicating the v2–v4 suites; each check states a user-visible claim.
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, LEFT, CANVAS, runProbe, enterStudy, openExisting, showLibrary, canvasState, waitFor, sleep, fold } from "./cdp.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

await runProbe("v5-audit", { port: 9362, width: 1440, height: 900 }, async ({ browser, dir, check, expect, shot, log }) => {
  const downloads = join(dir, "downloads");
  mkdirSync(downloads, { recursive: true });
  await browser.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true });

  const body = () => browser.evaluate("document.body.innerText");
  const h1 = () => browser.evaluate('document.querySelector(\'h1[aria-label="当前会话名称"]\')?.textContent || ""');
  const digits = async () => (await body()).match(/NaN|Infinity/g) || [];
  const waitCanvas = (label) => waitFor(async () => {
    const state = await canvasState(browser);
    return state?.painted > 0 && state.cssWidth > 100 ? state : null;
  }, label, 12000);
  const stored = (key, title) => browser.evaluate(`new Promise((resolve, reject) => {
    const request = indexedDB.open('gewu-studio');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result; const cursor = db.transaction('sessions').objectStore('sessions').getAll();
      cursor.onsuccess = () => { const row = cursor.result.find((item) => item.title === ${JSON.stringify(title)}); resolve({${key}}); db.close(); }; };
  })`);

  // --- A. photo intake with the recognition service unconfigured ---
  await browser.goto(BASE);
  await browser.wait(`!![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '进入学习空间')`, "landing entry");
  await enterStudy(browser);
  await browser.wait(`!!document.querySelector('input[aria-label="选择题目文件"]')`, "intake input");
  await browser.send("DOM.enable");
  const documentNode = await browser.send("DOM.getDocument", { depth: -1 });
  const fileInput = await browser.send("DOM.querySelector", { nodeId: documentNode.root.nodeId, selector: 'input[aria-label="选择题目文件"]' });
  await browser.send("DOM.setFileInputFiles", { nodeId: fileInput.nodeId, files: [join(ROOT, "dev", "problem-photo.png")] });
  await browser.wait(`!!document.querySelector('button[aria-label="放大查看题目照片"]')`, "photo preview");
  check("photoPreviewVisible", await browser.exists('button[aria-label="放大查看题目照片"]'));
  await shot("A1-photo-staged.png");
  await browser.click("识别并生成动画", "main button", { exact: true });
  await browser.wait(`!!document.querySelector('[aria-label="题目内容（可编辑）"]')`, "compose after photo", 15000);
  const notice = await body();
  check("photoFallsBackWithExplicitNotice", notice.includes("识题服务未配置") && notice.includes("图片不参与本地解析"), notice.slice(0, 220));
  const placeholder = await browser.evaluate('document.querySelector(\'[aria-label="题目内容（可编辑）"]\').value');
  check("photoAloneYieldsPlaceholderStatement", placeholder.includes("未提供题干"), placeholder);
  check("photoPreviewCarriedIntoCompose", await browser.exists('img[alt="上传的题目照片"]'));
  await browser.type('[aria-label="题目内容（可编辑）"]', "一个小球从 20 m 高的楼顶以 15 m/s 水平抛出，g 取 9.8 m/s²。求落地时间。");
  await browser.type('[aria-label="用户提问（每行一条，可编辑）"]', "为什么水平速度不变？");
  await shot("A2-photo-compose.png");
  await browser.click("生成动画与题解", "main button", { exact: true });
  await browser.wait(`!!document.querySelector(${JSON.stringify(CANVAS)})`, "photo workspace", 15000);
  const photoCanvas = await waitCanvas("photo session canvas");
  check("photoSessionPaintsCanvas", photoCanvas.painted > 0, photoCanvas);
  const photoTitle = await h1();
  check("photoSessionGetsReadableTitle", photoTitle.length >= 4, photoTitle);
  const photoRow = await stored("image: !!row?.image, imageName: row?.imageName, source: row?.source", photoTitle);
  check("photoSessionPersistedWithImage", photoRow.image === true && photoRow.source === "photo", photoRow);
  const expected503 = browser.errors.filter((entry) => /Failed to load resource.*503/.test(entry));
  log("photoFlowConsole", browser.errors.slice());
  check("photoFlowNoUnexpectedConsoleErrors", expected503.length === browser.errors.length, browser.errors);
  browser.errors.length = 0;

  // --- B. text intake: multi-line split, empty guard, long statement ---
  if (await browser.exists(`${LEFT} button[aria-label="返回题库"]`)) await browser.clickSelector(`${LEFT} button[aria-label="返回题库"]`);
  await browser.click("新建题目会话", "button", { exact: true });
  await browser.wait(`!!document.querySelector('[aria-label="题干或提问输入"]')`, "intake again");
  const submitDisabled = () => browser.evaluate('[...document.querySelectorAll("main button")].find((b) => b.textContent.includes("识别并生成动画"))?.disabled');
  check("emptyIntakeSubmitDisabled", (await submitDisabled()) === true);
  const multi = "一个小球以 20 m/s 的速度水平抛出，g 取 9.8 m/s²。\n为什么水平方向速度不变？\n落地速度多大？";
  await browser.type('[aria-label="题干或提问输入"]', multi);
  await browser.click("识别并生成动画", "main button", { exact: true });
  await browser.wait(`!!document.querySelector('[aria-label="用户提问（每行一条，可编辑）"]')`, "compose from text");
  const questions = await browser.evaluate('document.querySelector(\'[aria-label="用户提问（每行一条，可编辑）"]\').value');
  const statement = await browser.evaluate('document.querySelector(\'[aria-label="题目内容（可编辑）"]\').value');
  check("multilineSplitKeepsTwoQuestions", questions.split("\n").filter(Boolean).length === 2, questions);
  check("splitLeavesStatementClean", statement.includes("水平抛出") && !statement.includes("为什么"), statement);
  const long = "某实验小组在综合实践课上研究平抛运动。".repeat(24) + "求落地时间。";
  await browser.type('[aria-label="题目内容（可编辑）"]', long);
  const longState = await browser.evaluate(`(() => {
    const area = document.querySelector('[aria-label="题目内容（可编辑）"]'), box = area.getBoundingClientRect();
    return {scroll: area.scrollHeight > area.clientHeight + 2, fits: box.right <= innerWidth + 1 && box.left >= -1, docOverflow: document.documentElement.scrollWidth > innerWidth};
  })()`);
  check("longStatementScrollsWithoutOverflow", longState.fits && !longState.docOverflow, longState);
  await shot("B1-long-statement.png");

  // --- C. legal parameter extremes stay finite ---
  await browser.click("生成动画与题解", "main button", { exact: true });
  await browser.wait(`!!document.querySelector(${JSON.stringify(CANVAS)})`, "long-statement workspace", 15000);
  const extremeTitle = await h1();
  const setParam = async (label, value) => {
    const input = `input[aria-label^="自定义${label}"]`;
    await browser.type(input, String(value));
    await browser.key("Enter", "Enter", 13);
    const slider = `[role="slider"][aria-label^="${label}"]`;
    await browser.wait(`Number(document.querySelector(${JSON.stringify(slider)}).getAttribute('aria-valuenow')) === ${value}`, `${label}=${value}`);
  };
  await setParam("初速度", 0.5);
  await setParam("重力加速度", 20);
  await setParam("抛射角", 0);
  await setParam("初始高度", 0);
  const tiny = await waitCanvas("tiny flight canvas");
  check("tinyFlightStillPaints", tiny.painted > 0, tiny);
  check("tinyFlightNumbersFinite", (await digits()).length === 0, await digits());
  await setParam("抛射角", 90);
  await setParam("初速度", 20);
  await setParam("重力加速度", 10);
  const vertical = await waitCanvas("vertical flight canvas");
  check("verticalFlightStillPaints", vertical.painted > 0, vertical);
  check("verticalFlightNumbersFinite", (await digits()).length === 0, await digits());
  await setParam("抛射角", 0);
  await setParam("初始高度", 200);
  await setParam("重力加速度", 1);
  const tall = await waitCanvas("tall fall canvas");
  check("tallFallStillPaints", tall.painted > 0, tall);
  check("tallFallNumbersFinite", (await digits()).length === 0, await digits());
  await shot("C1-extreme-params.png");

  // --- D. 390px workspace, solution folds and exports ---
  await browser.metrics(390, 844);
  await sleep(400);
  const narrow = await browser.evaluate(`({doc: document.documentElement.scrollWidth, win: innerWidth, canvas: !!document.querySelector('canvas')})`);
  check("mobileWorkspaceNoHorizontalOverflow", narrow.doc <= narrow.win && narrow.canvas, narrow);
  const narrowSolution = await fold(browser, "简要题解");
  check("mobileSolutionFoldReadable", narrowSolution.panel && narrowSolution.text.includes("答："), narrowSolution);
  const narrowWide = await browser.evaluate(`(() => {
    const wide = [...document.querySelectorAll('main *')].filter((el) => {
      if (el instanceof SVGElement || el.closest('.katex-mathml,[aria-hidden="true"]')) return false;
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.right > innerWidth + 1 && getComputedStyle(el).overflowX !== 'auto' && getComputedStyle(el).overflowX !== 'scroll';
    });
    return {doc: document.documentElement.scrollWidth, win: innerWidth, wide: wide.slice(0, 3).map((el) => el.tagName + ':' + (el.textContent || '').trim().slice(0, 24))};
  })()`);
  check("mobileSolutionNoStrayWideBlocks", narrowWide.doc <= narrowWide.win && narrowWide.wide.length === 0, narrowWide);
  const beforeDownload = readdirSync(downloads).filter((file) => !file.endsWith(".crdownload")).length;
  await browser.click("导出 PNG", "main button", { exact: true });
  const downloaded = await waitFor(() => {
    const files = readdirSync(downloads).filter((file) => !file.endsWith(".crdownload"));
    return files.length > beforeDownload ? files : null;
  }, "mobile PNG download", 10000).catch(() => null);
  check("mobileExportPngDownloads", Array.isArray(downloaded), downloaded);
  await browser.click("导出视频", "main button", { exact: true });
  await browser.wait(`!!document.querySelector('[role="dialog"][data-state="open"]')`, "video dialog");
  const dialog = await browser.evaluate(`(() => { const el = document.querySelector('[role="dialog"][data-state="open"]'); const box = el.getBoundingClientRect(); return {left: box.left, right: box.right, top: box.top, bottom: box.bottom, winW: innerWidth, winH: innerHeight}; })()`);
  check("mobileVideoDialogFitsViewport", dialog.left >= 0 && dialog.right <= dialog.winW + 1 && dialog.bottom <= dialog.winH + 1, dialog);
  await browser.key("Escape", "Escape", 27);
  await browser.wait(`!document.querySelector('[role="dialog"][data-state="open"]')`, "video dialog closed");
  await browser.clickSelector('button[aria-label="打开参数与对话"]');
  await browser.wait(`!!document.querySelector('[role="dialog"][data-state="open"]')`, "mobile parameter sheet");
  await sleep(500);
  const sheet = await browser.evaluate(`(() => { const el = document.querySelector('[role="dialog"][data-state="open"]'); const box = el.getBoundingClientRect(); return {left: box.left, right: box.right, scroll: el.scrollWidth, client: el.clientWidth, winW: innerWidth}; })()`);
  check("mobileParameterSheetFitsViewport", sheet.left >= 0 && sheet.right <= sheet.winW + 1 && sheet.scroll <= sheet.client + 1, sheet);
  await browser.key("Escape", "Escape", 27);
  await browser.wait(`!document.querySelector('[role="dialog"][data-state="open"]')`, "parameter sheet closed");
  await browser.metrics(1440, 900);
  await sleep(400);

  // --- E. library search ---
  const scope = await showLibrary(browser);
  const rowTitles = () => browser.evaluate(`[...document.querySelectorAll(${JSON.stringify(`${scope} button[aria-label^="题目 "][aria-label$=" 的操作"]`)})].map((el) => el.getAttribute('aria-label').slice(3, -4))`);
  const all = await rowTitles();
  await browser.type(`${scope} input[aria-label="搜索题库"]`, "月球");
  await sleep(250);
  const filtered = await rowTitles();
  check("searchNarrowsRows", filtered.length === 1 && filtered[0].includes("月球"), {all, filtered});
  await browser.clickSelector(`${scope} button[aria-label="清空搜索"]`);
  await sleep(250);
  check("clearSearchRestoresRows", (await rowTitles()).length === all.length, await rowTitles());
  log("libraryTitles", all);

  // --- F. end-to-end local parse of a vertical-throw statement ---
  if (await browser.exists(`${LEFT} button[aria-label="返回题库"]`)) await browser.clickSelector(`${LEFT} button[aria-label="返回题库"]`);
  await browser.click("新建题目会话", "button", { exact: true });
  await browser.wait(`!!document.querySelector('[aria-label="题干或提问输入"]')`, "intake for vertical");
  await browser.type('[aria-label="题干或提问输入"]', "一个小球以 20 m/s 的速度竖直向上抛出，不计空气阻力，g 取 10 m/s²。求最高点高度与飞行时间。");
  await browser.click("识别并生成动画", "main button", { exact: true });
  await browser.wait(`!!document.querySelector('[aria-label="题目内容（可编辑）"]')`, "vertical compose");
  await browser.click("生成动画与题解", "main button", { exact: true });
  await browser.wait(`!!document.querySelector(${JSON.stringify(CANVAS)})`, "vertical workspace", 15000);
  const parsed = await browser.evaluate(`Object.fromEntries([...document.querySelectorAll('input[aria-label^="自定义"]')].map((el) => [el.getAttribute('aria-label'), el.value]))`);
  check("localParserReadsVerticalThrow", parsed["自定义初速度 v₀"] === "20" && parsed["自定义抛射角 θ"] === "90" && parsed["自定义重力加速度 g"] === "10", parsed);
  const answer = await browser.evaluate(`document.querySelector('section[aria-label="简要题解"] [data-solution-source]')?.getAttribute('data-solution-source') || ''`);
  const plainAnswer = answer.replace(/\\[a-zA-Z]+/g, " ").replace(/[{}$]/g, " ");
  check("verticalAnswersUseSameSolution", /4\s*s/.test(plainAnswer) && /20\s*m/.test(plainAnswer), { excerpt: answer.slice(0, 260) });
  const verticalState = await waitCanvas("vertical end-to-end canvas");
  check("verticalEndToEndPaintsCanvas", verticalState.painted > 0, verticalState);
});