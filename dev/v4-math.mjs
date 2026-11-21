// Focused real-input browser coverage. Run: node dev/v4-math.mjs
// Only this probe and its ignored runProbe artifacts are written.
import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { BASE, RIGHT, runProbe, enterStudy, openExisting, waitFor } from "./cdp.mjs";

await runProbe("v4-math", { port: 9361, width: 1440, height: 900 }, async ({ browser, dir, check, expect, shot, log }) => {
  const artifacts = [];
  const section = (kind) => `section[aria-label="${kind === "exam" ? "简要题解" : "详细讲解"}"]`;
  const label = (kind) => kind === "exam" ? "题解" : "详解";
  const editor = (kind) => `textarea[aria-label="编辑${label(kind)}内容"]`;
  const sourceSelector = (kind) => `${section(kind)} [data-solution-source]`;
  const source = (kind) => browser.evaluate(`document.querySelector(${JSON.stringify(sourceSelector(kind))})?.getAttribute('data-solution-source')`);
  const action = (kind, text) => browser.click(text, `${section(kind)} button`, { exact: true });
  const screenshot = async (name) => { artifacts.push(await shot(name)); };
  const buttonDisabled = (kind, text) => browser.evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(`${section(kind)} button`)})].find(b => b.textContent.trim() === ${JSON.stringify(text)}); return b ? b.disabled : null; })()`);
  const foldState = (kind) => browser.evaluate(`(() => {
    const s = document.querySelector(${JSON.stringify(section(kind))}), b = s?.querySelector('button[aria-expanded]');
    const panel = b && document.getElementById(b.getAttribute('aria-controls'));
    return { expanded:b?.getAttribute('aria-expanded'), visible:!!panel?.getClientRects().length, sources:s?.querySelectorAll('[data-solution-source]').length };
  })()`);
  const openDetail = async () => {
    if ((await foldState("detail")).expanded !== "true") await browser.clickSelector(`${section("detail")} > button`);
  };
  const staleState = (kind) => browser.evaluate(`(() => {
    const s = document.querySelector(${JSON.stringify(section(kind))});
    return { badge:s?.querySelector('button[aria-expanded]')?.textContent.includes('需核对'), warning:[...s?.querySelectorAll('[role="status"]') || []].some(n => n.textContent.includes('不会自动覆盖')) };
  })()`);
  const stored = (id) => browser.evaluate(`new Promise((resolve, reject) => {
    const request = indexedDB.open('gewu-studio');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('sessions', 'readonly'), read = tx.objectStore('sessions').getAll();
      read.onerror = () => { db.close(); reject(read.error); };
      read.onsuccess = () => { resolve(read.result.find(s => ${id ? `s.id === ${JSON.stringify(id)}` : "s.title === document.querySelector('header h1')?.textContent"})); db.close(); };
    };
  })`);
  const mathStats = async (kind) => {
    await browser.evaluate("document.fonts.ready.then(() => true)");
    return browser.evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(sourceSelector(kind))});
      const glyph = root?.querySelector('.katex-html .mathnormal') || root?.querySelector('.katex');
      return { katex:root?.querySelectorAll('.katex').length, fractions:root?.querySelectorAll('.mfrac').length,
        fractionRules:root?.querySelectorAll('.frac-line').length, radicals:root?.querySelectorAll('.sqrt').length,
        mathml:root?.querySelectorAll('math').length, errors:root?.querySelectorAll('.katex-error').length,
        font:glyph && getComputedStyle(glyph).fontFamily,
        loadedKatexFonts:[...document.fonts].filter(f => f.family.includes('KaTeX') && f.status === 'loaded').map(f => f.family),
        sourceLength:root?.getAttribute('data-solution-source')?.length };
    })()`);
  };
  const savedPair = {};
  let sessionId;
  const waitSaved = (kind, text) => waitFor(async () => (await stored(sessionId))?.solutionEdits?.[kind]?.text === text, `persisted ${kind} override`);
  const reloadWorkspace = async () => {
    const title = (await stored(sessionId)).title;
    await browser.send("Page.reload", { ignoreCache: true });
    await waitFor(async () => {
      try { return await browser.evaluate(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === '进入学习空间')`); }
      catch (error) {
        if (/navigated or closed|context.*destroyed|Cannot find context/i.test(error.message)) return false;
        throw error;
      }
    }, "home after actual reload");
    await enterStudy(browser);
    await openExisting(browser, title);
  };
  const copySource = async (kind, expected, name) => {
    await action(kind, `复制${label(kind)}`);
    const copied = (await browser.evaluate("navigator.clipboard.readText()")).replace(/\r\n/g, "\n");
    check(name, copied === expected, { exact:copied === expected, chars:copied.length, hasTex:copied.includes("\\frac") });
  };
  const overflow = async (name, width) => {
    const state = await browser.evaluate(`(() => {
      const selectors = 'html,body,main[aria-label="题目学习会话"],aside,section[aria-label="简要题解"],section[aria-label="详细讲解"],[data-solution-source]';
      const containers = [...document.querySelectorAll(selectors)].filter(e => e.clientWidth > 0).map(e => ({
        label:e.getAttribute('aria-label') || e.tagName, width:e.clientWidth, scrollWidth:e.scrollWidth
      }));
      const wide = [...document.querySelectorAll('section[aria-label="简要题解"] [role="group"],section[aria-label="详细讲解"] [role="group"]')]
        .filter(e => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 2).map(e => ({
          section:e.closest('section').getAttribute('aria-label'), width:e.clientWidth, scrollWidth:e.scrollWidth,
          overflowX:getComputedStyle(e).overflowX, tabIndex:e.tabIndex,
          left:Math.round(e.getBoundingClientRect().left), right:Math.round(e.getBoundingClientRect().right)
        }));
      return { width:innerWidth, docWidth:document.documentElement.scrollWidth,
        overflowing:containers.filter(c => c.scrollWidth > c.width + 2), wide };
    })()`);
    check(name, state.width === width && state.docWidth <= width + 2 && !state.overflowing.length &&
      state.wide.length >= 2 && state.wide.every(f => f.overflowX === "auto" && f.tabIndex === 0 && f.left >= -2 && f.right <= width + 2), state);
  };

  try {
    await browser.send("Browser.grantPermissions", { origin:BASE, permissions:["clipboardReadWrite", "clipboardSanitizedWrite"] });
    await browser.send("Browser.setDownloadBehavior", { behavior:"allowAndName", downloadPath:dir, eventsEnabled:true });
    await browser.goto(BASE);
    await enterStudy(browser);
    await openExisting(browser);
    const initial = await stored();
    expect("sampleSessionAvailable", Boolean(initial?.id), { title:initial?.title });
    sessionId = initial.id;
    const defaults = { exam:await foldState("exam"), detail:await foldState("detail") };
    check("examOpenDetailClosedByDefault", defaults.exam.expanded === "true" && defaults.exam.visible && defaults.detail.expanded === "false" && !defaults.detail.visible, defaults);
    const automatic = { exam:await source("exam"), detail:await source("detail") };
    await browser.box(`${section("exam")} > button`);
    const initialMath = await mathStats("exam");
    check("automaticExamRealFractionsRadicalsFontsNoErrors", initialMath.fractions > 0 && initialMath.fractionRules > 0 && initialMath.radicals > 0 && initialMath.mathml > 0 && initialMath.errors === 0 && initialMath.font.includes("KaTeX") && initialMath.loadedKatexFonts.length > 0, initialMath);
    await screenshot("01-automatic-exam.png");
    await openDetail();
    const detailMath = await mathStats("detail");
    check("automaticDetailTwoMethodsAndRealMath", automatic.detail.includes("① 分解运动法") && automatic.detail.includes("② 能量与分段运动法") && detailMath.fractions > 0 && detailMath.radicals > 0 && detailMath.errors === 0, detailMath);
    await copySource("exam", automatic.exam, "automaticCopyIsTexSource");

    const wide = Array.from({ length:18 }, (_, i) => `\\frac{\\sqrt{x_{${i + 1}}^{2}+1}}{y_{${i + 1}}+1}`).join(" + ");
    savedPair.exam = `V4 已保存题解\n\n行内分式 $\\frac{1}{2}$ 与根式 $\\sqrt{2}$。\n\n$$\nS = ${wide}\n$$\n\n答：保留教师修订，不使用自动覆盖。`;
    savedPair.detail = `V4 已保存详解\n\n① 自定义完整推导\n由 $\\frac{a}{b}$ 与 $\\sqrt{c}$ 得\n\n$$\nD = ${wide}\n$$\n\n② 复核方法\n答：第二种方法也保留教师文字。`;
    for (const kind of ["exam", "detail"]) {
      await action(kind, `编辑${label(kind)}`);
      check(`${kind}EditorStartsWithSourceAndFocus`, await browser.evaluate(`document.querySelector(${JSON.stringify(editor(kind))})?.value === ${JSON.stringify(automatic[kind])} && document.activeElement === document.querySelector(${JSON.stringify(editor(kind))})`));
      check(`${kind}UnchangedSaveDisabled`, await buttonDisabled(kind, `保存${label(kind)}`));
      await browser.type(editor(kind), "   ");
      check(`${kind}BlankSaveDisabled`, await buttonDisabled(kind, `保存${label(kind)}`));
      const draft = `${savedPair[kind]}\n取消标记 V4-CANCEL`;
      await browser.type(editor(kind), draft);
      const preview = await mathStats(kind);
      check(`${kind}LivePreviewBeforeSave`, await source(kind) === draft && preview.fractions >= 18 && preview.radicals >= 18 && preview.errors === 0 && !(await stored(sessionId)).solutionEdits?.[kind], { fractions:preview.fractions, radicals:preview.radicals, errors:preview.errors });
      await action(kind, "取消编辑");
      check(`${kind}CancelKeepsAutomaticAndReturnsFocus`, await source(kind) === automatic[kind] && await browser.evaluate(`document.activeElement?.textContent.trim() === ${JSON.stringify(`编辑${label(kind)}`)}`));
      await action(kind, `编辑${label(kind)}`);
      await browser.type(editor(kind), savedPair[kind]);
      await action(kind, `保存${label(kind)}`);
      await waitSaved(kind, savedPair[kind]);
      check(`${kind}SaveAppliesOverride`, await source(kind) === savedPair[kind] && !(await browser.exists(editor(kind))) && !(await staleState(kind)).warning);
      await copySource(kind, savedPair[kind], `${kind}CopySavedTexSourceExactly`);
    }
    await screenshot("02-saved-detail.png");

    // Copy and export must use saved text, not an unsaved live preview.
    await action("exam", "编辑题解");
    await browser.type(editor("exam"), "V4-UNSAVED-EXPORT $\\frac{9}{7}$");
    await copySource("exam", savedPair.exam, "copyIgnoresUnsavedPreview");
    const eventStart = browser.events.length;
    await action("exam", "导出 Markdown");
    const download = await waitFor(() => browser.events.slice(eventStart).find(e => e.method === "Browser.downloadWillBegin")?.params, "Markdown download starts");
    await waitFor(() => browser.events.slice(eventStart).some(e => e.method === "Browser.downloadProgress" && e.params.guid === download.guid && e.params.state === "completed") && existsSync(join(dir, download.guid)), "Markdown download completes");
    const markdownPath = join(dir, "saved-overrides.md");
    renameSync(join(dir, download.guid), markdownPath);
    artifacts.push(markdownPath);
    const markdown = readFileSync(markdownPath, "utf8").replace(/\r\n/g, "\n");
    const exportedExam = markdown.split("## 题解\n")[1]?.split("\n\n## 详解")[0];
    const exportedDetail = markdown.split("## 详解\n")[1]?.split("\n\n## 参数讲解")[0];
    check("markdownExportsBothSavedOverridesNotDraft", exportedExam === savedPair.exam && exportedDetail === savedPair.detail && !markdown.includes("V4-UNSAVED-EXPORT"), { path:markdownPath, suggestedFilename:download.suggestedFilename, examExact:exportedExam === savedPair.exam, detailExact:exportedDetail === savedPair.detail, chars:markdown.length });
    await action("exam", "取消编辑");
    await reloadWorkspace();
    check("bothOverridesPersistAcrossRealReload", await source("exam") === savedPair.exam && await source("detail") === savedPair.detail && (await stored(sessionId)).solutionEdits.exam.text === savedPair.exam);
    check("reloadRestoresDefaultFolds", (await foldState("exam")).expanded === "true" && (await foldState("detail")).expanded === "false");
    await openDetail();

    if (!(await browser.exists(RIGHT))) await browser.clickSelector('button[aria-label="展开参数与对话栏"]');
    await browser.click("动画参数", '[role="tab"]', { exact:true });
    const beforeParams = await stored(sessionId);
    await browser.dragSlider("抛射角", 0.5);
    await waitFor(async () => (await stored(sessionId)).problem.params.angleDeg === 45, "45 degree parameter persists");
    for (const kind of ["exam", "detail"]) {
      const stale = await staleState(kind), saved = (await stored(sessionId)).solutionEdits[kind];
      check(`${kind}ParameterChangeWarnsWithoutErasing`, stale.badge && stale.warning && await source(kind) === savedPair[kind] && saved.text === savedPair[kind] && saved.signature === beforeParams.solutionEdits[kind].signature, stale);
    }
    await browser.box(`${section("exam")} > button`);
    await screenshot("03-parameter-stale-warning.png");
    // Acknowledging unchanged stale text is meaningful and must be savable.
    for (const kind of ["exam", "detail"]) {
      await action(kind, `编辑${label(kind)}`);
      check(`${kind}StaleUnchangedTextCanBeSaved`, await buttonDisabled(kind, `保存${label(kind)}`) === false);
      await action(kind, `保存${label(kind)}`);
      check(`${kind}ResaveClearsStaleWarning`, !(await staleState(kind)).warning && await source(kind) === savedPair[kind]);
    }
    const beforeStatement = await stored(sessionId);
    await browser.click("对话", '[role="tab"]', { exact:true });
    await browser.clickSelector('button[aria-label="编辑题目"]');
    const newStatement = `${beforeStatement.problem.statement}\nV4 题干修订：仍忽略空气阻力，请核对教师保存的解答。`;
    await browser.type('textarea[aria-label="编辑题目内容"]', newStatement);
    // The problem editor intentionally starts from baseParams, not exploratory params.
    // Match the current 45-degree exploration so only the statement changes in this test.
    await browser.type('input[aria-label="编辑抛射角 θ"]', String(beforeStatement.problem.params.angleDeg));
    await browser.click("保存题目", '[role="dialog"] button', { exact:true });
    await browser.wait("!document.querySelector('[role=dialog]')", "statement editor closes");
    await waitFor(async () => (await stored(sessionId)).problem.statement === newStatement, "statement persists");
    const afterStatement = await stored(sessionId);
    check("statementOnlyEditKeepsParams", JSON.stringify(afterStatement.problem.params) === JSON.stringify(beforeStatement.problem.params), { before:beforeStatement.problem.params, after:afterStatement.problem.params });
    for (const kind of ["exam", "detail"]) {
      const stale = await staleState(kind);
      check(`${kind}StatementChangeWarnsWithoutErasing`, stale.warning && stale.badge && await source(kind) === savedPair[kind] && afterStatement.solutionEdits[kind].text === savedPair[kind], stale);
    }
    await reloadWorkspace();
    await openDetail();
    check("staleWarningsAndOverridesSurviveReload", (await staleState("exam")).warning && (await staleState("detail")).warning && await source("exam") === savedPair.exam && await source("detail") === savedPair.detail);

    for (const width of [1440, 1100, 390]) {
      await browser.metrics(width, width === 390 ? 844 : 900, width === 390);
      await overflow(`savedWideMathContainedAt${width}`, width);
      const formula = `${section("exam")} [role="group"][aria-label="独立公式（可横向滚动）"]`;
      await browser.clickSelector(formula);
      await screenshot(`04-wide-formula-${width}.png`);
      const left = await browser.evaluate(`document.querySelector(${JSON.stringify(formula)}).scrollLeft`);
      for (let i = 0; i < 5; i++) await browser.key("ArrowRight", "ArrowRight", 39);
      await browser.sleep(200); // Native smooth keyboard scrolling must settle before measuring.
      const right = await browser.evaluate(`document.querySelector(${JSON.stringify(formula)}).scrollLeft`);
      check(`wideFormulaKeyboardScrollsAt${width}`, right > left, { before:left, after:right });
      await action("exam", "编辑题解");
      check(`editorReachableAt${width}`, await browser.box(editor("exam")).then(b => b.w > 100 && b.x - b.w / 2 >= 0 && b.x + b.w / 2 <= width));
      await browser.type(editor("exam"), `${savedPair.exam}\nV4 responsive live preview ${width}`);
      await overflow(`livePreviewWideMathContainedAt${width}`, width);
      await browser.box(`${section("exam")} [data-solution-source]`);
      await screenshot(`05-live-preview-${width}.png`);
      await action("exam", "取消编辑");
      check(`responsiveCancelKeepsSavedAt${width}`, await source("exam") === savedPair.exam);
    }
    await browser.metrics(1440, 900);

    // Raw text remains a React text node; untrusted KaTeX capabilities must stay disabled.
    const raw = '<img id="v4-raw-img" src="/v4-should-not-load.png" onerror="window.__v4MathXss=1"><script id="v4-raw-script">window.__v4MathXss=2</script><svg id="v4-raw-svg" onload="window.__v4MathXss=3"></svg><a id="v4-raw-link" href="javascript:window.__v4MathXss=4">RAW</a>';
    const hostile = ["V4 安全性测试：以下 HTML 必须原样显示", raw,
      String.raw`$$\href{javascript:window.__v4MathXss=5}{JS_LINK}$$`,
      String.raw`$$\url{javascript:window.__v4MathXss=6}$$`,
      String.raw`$$\htmlClass{v4-injected-class}{CLASS} + \htmlId{v4-injected-id}{ID}$$`,
      String.raw`$$\htmlStyle{background:red}{STYLE} + \htmlData{v4-injected=yes}{DATA}$$`,
      String.raw`$$\includegraphics{https://v4.invalid/should-not-load.png}$$`,
      String.raw`$$\def\pwn{\href{javascript:window.__v4MathXss=7}{MACRO}}\pwn$$`,
      String.raw`正常公式 $\frac{1}{2}+\sqrt{3}$ 应仍可读。`,
    ].join("\n\n");
    const securityState = () => browser.evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(sourceSelector("exam"))});
      return { rawLiteral:root.textContent.includes(${JSON.stringify(raw)}),
        executableOrInjectedNodes:root.querySelectorAll('script,img,a,iframe,object,#v4-raw-svg,#v4-injected-id,.v4-injected-class,[data-v4-injected],[style*="background:red"]').length,
        javascriptLinks:[...root.querySelectorAll('*')].filter(e => ['href','xlink:href'].some(a => /^(javascript|data):/i.test(e.getAttribute(a) || ''))).length,
        sentinel:typeof window.__v4MathXss,
        fetchedPayload:performance.getEntriesByType('resource').some(r => r.name.includes('v4-should-not-load') || r.name.includes('v4.invalid')),
        validMath:root.querySelectorAll('.mfrac').length > 0 && root.querySelectorAll('.sqrt').length > 0 };
    })()`);
    const assertSecure = async (name) => {
      const state = await securityState();
      check(name, state.rawLiteral && state.executableOrInjectedNodes === 0 && state.javascriptLinks === 0 && state.sentinel === "undefined" && !state.fetchedPayload && state.validMath, state);
    };
    await action("exam", "编辑题解");
    await browser.type(editor("exam"), hostile);
    await assertSecure("previewEscapesRawHtmlAndBlocksUntrustedKatexMacros");
    await action("exam", "保存题解");
    await waitSaved("exam", hostile);
    await assertSecure("savedContentEscapesHtmlAndBlocksMacros");
    await browser.box(`${section("exam")} > button`);
    await screenshot("06-untrusted-math-and-html.png");
    await reloadWorkspace();
    await assertSecure("reloadedHostileOverrideRemainsInert");
    await openDetail();

    const malformedCases = [
      { name:"unclosedInline", text:String.raw`未闭合 $x + 1`, errors:false },
      { name:"unclosedDisplay", text:String.raw`孤立 $$\sqrt{x`, errors:false },
      { name:"missingBrace", text:String.raw`缺少右括号：$\frac{1}{$`, errors:true },
      { name:"unknownCommand", text:String.raw`未知命令：$\notARealVFourCommand{x}$`, errors:false },
      { name:"macroExpansionLimit", text:String.raw`$$\def\loop{\loop}\loop$$`, errors:true },
    ];
    await action("exam", "编辑题解");
    for (const test of malformedCases) {
      const malformed = `V4 malformed math remains readable\n\n${test.text}\n\n后续正确公式：$\\frac{7}{9}+\\sqrt{5}$`;
      await browser.type(editor("exam"), malformed);
      const state = await browser.evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(sourceSelector("exam"))});
        return { exactSource:root.getAttribute('data-solution-source') === ${JSON.stringify(malformed)},
          errors:root.querySelectorAll('.katex-error').length,
          messages:[...root.querySelectorAll('.katex-error')].map(e => e.getAttribute('title')?.slice(0,170)),
          retainedText:root.textContent.includes('V4 malformed') && root.textContent.includes('后续正确公式'),
          validFraction:root.querySelectorAll('.mfrac').length, validRoot:root.querySelectorAll('.sqrt').length,
          editorPresent:!!document.querySelector(${JSON.stringify(editor("exam"))}) };
      })()`);
      check(`${test.name}FailsGracefully`, state.exactSource && (!test.errors || state.errors > 0) && state.retainedText && state.validFraction > 0 && state.validRoot > 0 && state.editorPresent && (test.name !== "macroExpansionLimit" || state.messages.some(m => m.includes('Too many expansions'))), state);
    }
    await browser.box(`${section("exam")} [data-solution-source]`);
    await screenshot("07-malformed-math-preview.png");
    await action("exam", "取消编辑");
    check("malformedPreviewCancelKeepsSavedSource", await source("exam") === hostile);

    for (const kind of ["exam", "detail"]) {
      await action(kind, `恢复自动${label(kind)}`);
      await waitFor(async () => !(await stored(sessionId)).solutionEdits?.[kind], `restored automatic ${kind} persists`);
      const restored = await source(kind), stats = await mathStats(kind);
      check(`${kind}RestoreAutomaticUsesCurrentParameters`, restored !== automatic[kind] && !restored.includes("V4") && restored.includes("2.89") && restored.includes("10.2") && stats.errors === 0 && stats.fractions > 0 && stats.radicals > 0 && !(await staleState(kind)).warning, { chars:restored.length, fractions:stats.fractions, radicals:stats.radicals, errors:stats.errors });
    }
    await browser.box(`${section("exam")} > button`);
    await screenshot("08-restored-automatic.png");
    await reloadWorkspace();
    const final = await stored(sessionId);
    check("restoreAutomaticPersistsAcrossReload", !final.solutionEdits?.exam && !final.solutionEdits?.detail && !(await source("exam")).includes("V4") && !(await staleState("exam")).warning);
    log("scope", "Isolated temporary Chrome profile on port 9361; local 5174 app; real CDP mouse/key/text input only. IndexedDB inspected read-only. No React handlers invoked, product files edited, dependencies installed, or commits created.");
    log("finalParams", final.problem.params);
  } catch (error) {
    try { await screenshot("99-failure.png"); } catch { /* preserve original probe error */ }
    throw error;
  } finally {
    log("artifacts", artifacts);
  }
});
