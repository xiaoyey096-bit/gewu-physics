// 1440 / 1100 / 390: no horizontal overflow, painted canvas, explicit sheets and mobile folds.
import { BASE, LEFT, RIGHT, ROW, CANVAS, runProbe, enterStudy, openExisting, fold, canvasState, waitFor } from "./cdp.mjs";

await runProbe("v2-responsive", {port:9346, width:1440, height:900}, async ({browser, check, expect, log, shot}) => {
  const dialog = '[role="dialog"][data-state="open"]';
  const isSheetOpen = () => browser.exists(dialog);
  const overflow = async (name, width) => {
    const state = await browser.evaluate(`(() => {
      const selectors = 'html, body, main[aria-label="题目学习会话"], aside, [role="dialog"], section[aria-label="动画演示"], [aria-label="动画控制区"], section[aria-label="简要题解"], section[aria-label="详细讲解"], section[aria-label="参数讲解与调整"], section[aria-label="题目对话"]';
      const containers = [...document.querySelectorAll(selectors)].filter((el) => el.clientWidth > 0).map((el) => ({
        tag:el.tagName, label:el.getAttribute('aria-label') || el.getAttribute('role'), width:el.clientWidth, scrollWidth:el.scrollWidth,
      }));
      return {width:innerWidth, height:innerHeight, docWidth:document.documentElement.scrollWidth, docHeight:document.documentElement.scrollHeight, containers,
        overflowing:containers.filter((el) => el.scrollWidth > el.width + 2)};
    })()`);
    check(name, state.width === width && state.docWidth <= width + 2 && state.overflowing.length === 0, state);
  };
  const painted = async (name) => {
    const state = await waitFor(async () => {
      const value = await canvasState(browser);
      return value?.cssWidth > 100 && value?.cssHeight > 100 && value?.painted > 0 && value?.colors > 4 ? value : null;
    }, `${name} canvas redraw`);
    check(name, Math.abs(state.width - state.cssWidth) <= 2 && Math.abs(state.height - state.cssHeight) <= 2, state);
  };
  const openParameters = async (name) => {
    await browser.clickSelector('button[aria-label="打开参数与对话"]');
    await browser.wait(`!!document.querySelector(${JSON.stringify(dialog)})`, `${name} sheet opens`);
    await browser.click('动画参数', '[role="tab"]', {exact:true});
    const state = await browser.evaluate(`(() => {
      const sheet = document.querySelector(${JSON.stringify(dialog)});
      return {title:sheet?.querySelector('h2')?.textContent, sliders:sheet?.querySelectorAll('[role="slider"]').length, modal:sheet?.getAttribute('aria-modal'),
        visibleSliders:[...sheet?.querySelectorAll('[role="slider"]') || []].filter((el) => el.getClientRects().length).length,
        tabs:[...document.querySelectorAll('[role="tab"]')].map((el) => ({text:el.textContent.trim(), inSheet:sheet?.contains(el)}))};
    })()`);
    check(`${name}ParameterSheet`, state.title === "动画参数与对话" && state.sliders === 4 && state.visibleSliders === 4 && state.modal === "true", state);
    check(`${name}OnlyRightSheetTabs`, state.tabs.length === 2 && state.tabs.every((tab) => tab.inSheet) && state.tabs[0].text === "动画参数" && state.tabs[1].text === "对话", state.tabs);
    await browser.wait(`!!document.activeElement?.closest(${JSON.stringify(dialog)})`, `${name} focus enters sheet`);
    const trapped = [];
    for (let i = 0; i < 20; i++) {
      await browser.key("Tab", "Tab", 9, i < 10 ? 0 : 8);
      trapped.push(await browser.evaluate(`!!document.activeElement?.closest(${JSON.stringify(dialog)})`));
    }
    check(`${name}KeyboardFocusStaysInSheet`, trapped.every(Boolean), trapped);
  };
  const closeSheet = async (name, opener) => {
    await browser.click("Close", `${dialog} button`, {exact:true});
    await browser.wait(`!document.querySelector('[role="dialog"]')`, `${name} sheet closes`);
    check(`${name}SheetClosed`, !(await isSheetOpen()));
    check(`${name}FocusRestored`, await browser.evaluate(`document.activeElement?.getAttribute('aria-label') === ${JSON.stringify(opener)}`));
  };
  const reachable = async (name, selector, text) => {
    const box = await browser.box(selector, text ? {text, exact:true} : {});
    const viewport = await browser.evaluate('({width:innerWidth, height:innerHeight})');
    check(name, box.x - box.w / 2 >= -2 && box.x + box.w / 2 <= viewport.width + 2 && box.y - box.h / 2 >= -2 && box.y + box.h / 2 <= viewport.height + 2, {box, viewport});
  };

  await browser.goto(BASE);
  await enterStudy(browser);
  const title = await openExisting(browser);
  if (!(await browser.exists(RIGHT))) await browser.clickSelector('button[aria-label="展开参数与对话栏"]');
  check("desktopHasThreeColumns", await browser.exists(LEFT) && await browser.exists(RIGHT) && await browser.exists('main[aria-label="题目学习会话"]'));
  check("desktopHasNoSheet", !(await isSheetOpen()));
  await painted("desktopCanvas");
  await overflow("desktop1440NoOverflow", 1440);
  await reachable("desktopExportReachable", '[aria-label="动画控制区"] button', "导出 PNG");
  await shot("20-desktop.png");

  await browser.metrics(1100,800);
  check("tabletDoesNotAutoOpenSheet", !(await isSheetOpen()));
  check("tabletKeepsLibraryNotRightAside", await browser.exists(LEFT) && !(await browser.exists(RIGHT)));
  await painted("tabletCanvas");
  await overflow("tablet1100NoOverflow", 1100);
  await openParameters("tablet");
  await overflow("tabletSheetNoOverflow", 1100);
  await reachable("tabletOffscreenDisplayReachable", `${dialog} button[aria-label="频闪"]`);
  const strobeBefore = await browser.evaluate(`document.querySelector(${JSON.stringify(`${dialog} button[aria-label="频闪"]`)})?.getAttribute('aria-pressed')`);
  await browser.clickSelector(`${dialog} button[aria-label="频闪"]`);
  check("tabletParameterToggleWorks", await browser.evaluate(`document.querySelector(${JSON.stringify(`${dialog} button[aria-label="频闪"]`)})?.getAttribute('aria-pressed')`) === String(strobeBefore !== "true"), {strobeBefore});
  await shot("21-tablet-parameters.png");
  await closeSheet("tablet", "打开参数与对话");
  await reachable("tabletExportReachable", '[aria-label="动画控制区"] button', "导出 PNG");
  await shot("22-tablet-stage.png");

  await browser.metrics(390,844,true);
  check("mobileHasNeitherDesktopAside", !(await browser.exists(LEFT)) && !(await browser.exists(RIGHT)));
  check("mobileNoObsoleteBottomTabs", !(await browser.exists('nav[aria-label="视图切换"], main[aria-label="题目学习会话"] [role="tab"]')) && !(await browser.exists('[role="tab"]')));
  await overflow("mobile390NoOverflow",390);
  await painted("mobileCanvas");
  await reachable("mobileCanvasReachable",CANVAS);
  await shot("23-mobile-stage.png");
  await openParameters("mobile");
  await browser.dragSlider("抛射角",0.5);
  await browser.wait(`Number(document.querySelector('[role="dialog"] [role="slider"][aria-label^="抛射角"]').getAttribute('aria-valuenow')) === 45`, "mobile angle slider changes");
  check("mobileAngleControlWorks",true);
  await reachable("mobileParameterBottomReachable",`${dialog} button`,"随机一题");
  await overflow("mobileParameterSheetNoOverflow",390);
  await shot("24-mobile-parameters.png");
  await closeSheet("mobileParameters","打开参数与对话");

  const solution = await fold(browser,"简要题解"), detail = await fold(browser,"详细讲解");
  check("mobileFoldDefaultsRetained",solution.expanded === "true" && solution.panel && detail.expanded === "false" && !detail.panel,{solution,detail});
  await browser.clickSelector('section[aria-label="简要题解"] > button[aria-expanded]');
  check("mobileSolutionCloses",!(await fold(browser,"简要题解")).panel);
  await browser.clickSelector('button[aria-label="打开参数与对话"]');
  await browser.wait(`!!document.querySelector(${JSON.stringify(dialog)})`, "mobile chat sheet opens");
  await browser.click('对话', '[role="tab"]', {exact:true});
  await reachable("mobileComposerReachableWhileFolded",`${dialog} section[aria-label="题目对话"] textarea[aria-label="追加提问"]`);
  check("mobileComposerVisibleWithBothFoldsClosed", (await fold(browser,"简要题解")).composer && (await fold(browser,"详细讲解")).composer);
  const question = "最高点时加速度为零吗？";
  await browser.type('textarea[aria-label="追加提问"]',question);
  await browser.clickSelector('button[aria-label="提交提问"]');
  await browser.wait(`[...document.querySelectorAll('section[aria-label="题目对话"] [aria-label="问答记录"]')].some((record) => record.querySelector('article[aria-label="用户提问"] p')?.textContent === ${JSON.stringify(question)} && record.querySelectorAll('article[aria-label="问题回答"] p').length > 1)`, "mobile answer appears in chat");
  check("mobileQAPresent",await browser.evaluate(`[...document.querySelectorAll(${JSON.stringify(`${dialog} section[aria-label="题目对话"] [aria-label="问答记录"]`)})].some((record) => record.querySelector('article[aria-label="用户提问"] p')?.textContent === ${JSON.stringify(question)} && record.querySelectorAll('article[aria-label="问题回答"] p').length > 1)`));
  const afterAsk = await fold(browser,"详细讲解");
  check("mobileFollowUpKeepsDetailCollapsed",afterAsk.expanded === "false" && !afterAsk.panel && afterAsk.composer,afterAsk);
  check("mobileComposerClearsAfterSubmit",await browser.evaluate(`document.querySelector('textarea[aria-label="追加提问"]').value === ''`));
  await overflow("mobileChatSheetNoOverflow",390);
  await closeSheet("mobileChat","打开参数与对话");
  await browser.clickSelector('section[aria-label="简要题解"] > button[aria-expanded]');
  check("mobileSolutionReopens",(await fold(browser,"简要题解")).panel);
  // Open details explicitly: asking in the right sheet must not expand them.
  await browser.clickSelector('section[aria-label="详细讲解"] > button[aria-expanded]');
  const openedDetail = await fold(browser,"详细讲解");
  check("mobileDetailOpensWithTwoMethods",openedDetail.expanded === "true" && openedDetail.panel && ["① 分解运动法", "② 能量与分段运动法"].every((method) => openedDetail.text.includes(method)),openedDetail);
  for (const label of ["简要题解", "详细讲解"]) {
    const block = await browser.evaluate(`(() => {
      const section = document.querySelector('section[aria-label=${JSON.stringify(label)}]');
      const math = section?.querySelector('[data-solution-source]');
      return {blocks:section?.querySelectorAll('[data-solution-source]').length, source:math?.getAttribute('data-solution-source') || '',
        displays:math?.querySelectorAll('.katex-display').length, errors:math?.querySelectorAll('.katex-error').length,
        obsolete:section?.querySelectorAll('pre, article, a, [aria-label="过程讲解"], [aria-label="答疑"], [aria-label="问答记录"], [aria-label="追加提问"]').length};
    })()`);
    check(`mobile${label}RenderedMathBlock`, block.blocks === 1 && block.source.includes('$$') && block.displays > 0 && block.errors === 0 && block.obsolete === 0, block);
  }
  await overflow("mobileOpenFoldsNoOverflow",390);
  await shot("25-mobile-folds.png");

  await browser.clickSelector('button[aria-label="打开题库"]');
  await browser.wait(`!!document.querySelector(${JSON.stringify(dialog)})`,"mobile library drawer opens");
  const rows = await browser.evaluate(`document.querySelectorAll(${JSON.stringify(`${dialog} ${ROW}`)}).length`);
  expect("mobileLibraryRowsAvailable",rows > 0,rows);
  check("mobileLibraryDrawerTitle",await browser.evaluate(`document.querySelector(${JSON.stringify(dialog)})?.querySelector('h2')?.textContent === '题库与题目'`));
  await overflow("mobileLibraryDrawerNoOverflow",390);
  await shot("26-mobile-library.png");
  await closeSheet("mobileLibrary","打开题库");
  // Select an existing row through the drawer and a real Radix menu; it must close.
  await openExisting(browser,title);
  check("mobileSelectionClosesDrawer",!(await isSheetOpen()) && await browser.exists(CANVAS));
  await browser.clickSelector('button[aria-label="2 倍速"]');
  check("mobileSpeed2Selected",await browser.evaluate(`document.querySelector('button[role="radio"][aria-label="2 倍速"]')?.getAttribute('aria-checked') === 'true'`));
  await reachable("mobileExportPngReachable",'[aria-label="动画控制区"] button',"导出 PNG");
  await reachable("mobileExportSolutionReachable",'[aria-label="动画控制区"] button',"导出题解");
  await overflow("mobileControlsNoOverflow",390);
  await shot("27-mobile-controls.png");

  await browser.metrics(1440,900);
  await browser.wait(`!!document.querySelector(${JSON.stringify(LEFT)}) && !!document.querySelector(${JSON.stringify(RIGHT)})`,"desktop panes restored");
  check("desktopPanesReturnWithoutSheet",!(await isSheetOpen()));
  await painted("restoredDesktopCanvas");
  await overflow("restoredDesktopNoOverflow",1440);
  await browser.metrics(390,844,true);
  await browser.clickSelector('button[aria-label="打开参数与对话"]');
  await browser.wait(`!!document.querySelector(${JSON.stringify(dialog)})`, "parameter sheet reopens");
  await browser.key("Escape", "Escape", 27);
  await browser.wait(`!document.querySelector('[role="dialog"]')`, "Escape closes sheet");
  check("escapeRestoresParameterTriggerFocus", await browser.evaluate(`document.activeElement?.getAttribute('aria-label') === '打开参数与对话'`));
  for (const opener of ["打开参数与对话", "打开题库"]) {
    await browser.clickSelector(`button[aria-label=${JSON.stringify(opener)}]`);
    await browser.wait(`!!document.querySelector(${JSON.stringify(dialog)})`, `${opener} opens before resize`);
    await browser.metrics(1440,900);
    await browser.wait(`!document.querySelector('[role="dialog"]')`, "desktop removes open drawer");
    check(`${opener}DesktopReleasesModal`, await browser.evaluate(`getComputedStyle(document.body).pointerEvents !== 'none' && !document.querySelector('main[aria-label="题目学习会话"]')?.closest('[aria-hidden="true"]')`));
    await browser.metrics(390,844,true);
    check(`${opener}DoesNotReopenAfterResize`, !(await isSheetOpen()));
  }
  log("finalSession",title);
});
