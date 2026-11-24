// 无限层级文件夹 + 高中题库示例题注入 + 临界状态吸顶回归探针。
import { BASE, LEFT, RIGHT, ROW, runProbe, enterStudy, waitFor, sleep } from "./cdp.mjs";

const folderBtn = (name) => `button[aria-label="折叠项目 ${name}"], button[aria-label="展开项目 ${name}"]`;
const menuBtn = (name) => `button[aria-label="项目 ${name} 的操作"]`;

await runProbe("v7-folders", {port:9346, width:1440, height:900}, async ({browser, check, expect, log, shot}) => {
  const leftX = (name) => browser.evaluate(`document.querySelector(${JSON.stringify(folderBtn(name))})?.getBoundingClientRect().left ?? null`);
  const createFolder = async (parentName, name) => {
    if (parentName) {
      await browser.clickSelector(menuBtn(parentName));
      await browser.click("新建子文件夹", '[role="menuitem"]', {exact:true});
      await browser.wait(`!!document.querySelector('input[aria-label="新子文件夹名称"]')`, "subfolder input");
      await browser.type('input[aria-label="新子文件夹名称"]', name);
      await browser.key("Enter", "Enter", 13);
    } else {
      await browser.clickSelector('button[aria-label="新建项目"]');
      await browser.wait(`!!document.querySelector('input[aria-label="新项目名称"]')`, "project input");
      await browser.type('input[aria-label="新项目名称"]', name);
      await browser.key("Enter", "Enter", 13);
    }
    await browser.wait(`!!document.querySelector(${JSON.stringify(folderBtn(name))})`, `folder ${name}`);
  };

  await browser.goto(BASE);
  await enterStudy(browser);

  await createFolder(null, "高中题库");
  const rootX = await leftX("高中题库");
  check("rootFolderCreated", rootX !== null, {rootX});

  await createFolder("高中题库", "必修一");
  const level1X = await leftX("必修一");
  check("nestedFolderIndented", level1X !== null && level1X - rootX >= 10, {rootX, level1X});

  await createFolder("必修一", "第一章");
  const level2X = await leftX("第一章");
  check("deeperFolderIndented", level2X !== null && level2X - level1X >= 10, {level1X, level2X});

  await browser.clickSelector(folderBtn("高中题库"));
  check("collapseHidesDescendants", await browser.evaluate(`!document.querySelector(${JSON.stringify(`${LEFT} button[aria-label="折叠项目 必修一"], ${LEFT} button[aria-label="展开项目 必修一"]`)})`));
  await browser.clickSelector(folderBtn("高中题库"));
  await browser.wait(`!!document.querySelector(${JSON.stringify(folderBtn("第一章"))})`, "descendants restored");

  // 删除父文件夹：直属子文件夹应上浮到父级，题目迁到安全项目。
  await createFolder(null, "临时父");
  await createFolder("临时父", "临时子");
  await browser.clickSelector(menuBtn("临时父"));
  await browser.click("删除项目", '[role="menuitem"]', {exact:true});
  const orphanX = await waitFor(async () => {
    const x = await leftX("临时子");
    return x === null ? null : x;
  }, "child survives parent delete");
  check("deleteParentReparentsChild", Math.abs(orphanX - rootX) <= 2, {orphanX, rootX});
  await browser.clickSelector(menuBtn("临时子"));
  await browser.click("删除项目", '[role="menuitem"]', {exact:true});
  await browser.wait(`!document.querySelector(${JSON.stringify(menuBtn("临时子"))})`, "temp folder removed");
  await shot("01-nested-folders.png");

  // 重载触发「高中题库」一次性示例题注入。
  await browser.goto(BASE);
  await enterStudy(browser);
  const seeded = await waitFor(async () => {
    const titles = await browser.evaluate(`[...document.querySelectorAll(${JSON.stringify(`${LEFT} ${ROW}`)})].map((el) => el.getAttribute("aria-label").slice(3, -4))`);
    // 列表标题会截断成「…」，所以只匹配每道示例题的独有前缀。
    const hits = titles.filter((t) => /物块从倾角|木板静|光滑水平面上/.test(t));
    log("seedTitles", { count: titles.length, hits: hits.length, titles });
    return hits.length >= 3 ? {titles, hits} : null;
  }, "seeded model examples");
  log("seededTitles", seeded.hits);
  const folderCount = await browser.evaluate(`(() => {
    const btn = document.querySelector(${JSON.stringify(folderBtn("高中题库"))});
    const header = btn?.parentElement;
    return [...(header?.children ?? [])].filter((el) => el.tagName === "SPAN").map((el) => el.textContent.trim());
  })()`);
  check("threeExamplesInHighSchoolFolder", folderCount.some((t) => Number(t) >= 3), folderCount);

  await browser.goto(BASE);
  await enterStudy(browser);
  const again = await browser.evaluate(`[...document.querySelectorAll(${JSON.stringify(`${LEFT} ${ROW}`)})].map((el) => el.getAttribute("aria-label").slice(3, -4))`);
  check("seedingIsOneShot", again.filter((t) => /物块从倾角|木板静|光滑水平面上/.test(t)).length >= 3 && again.length === seeded.titles.length, {before:seeded.titles, again});

  // 打开注入的斜面题，验证模板与临界状态吸顶。
  const inclineTitle = seeded.hits.find((t) => /物块从倾角/.test(t));
  await browser.clickSelector(`button[aria-label=${JSON.stringify(`题目 ${inclineTitle} 的操作`)}]`);
  await browser.click("打开工作台", '[role="menuitem"]', {exact:true});
  await browser.wait(`!!document.querySelector('canvas[aria-label^="斜面下滑动画"]')`, "incline canvas");
  check("seededInclineOpensWithTemplate", true, inclineTitle);

  // 「最近」栏目：与项目树共用一条列表，当前题目高亮，计数与实际渲染行数一致（未过页时不出现「再显示」）。
  const readRecent = `(() => {
    const box = document.querySelector(${JSON.stringify(`${LEFT} section[aria-label="最近题目"]`)});
    const rows = [...(box?.querySelectorAll('button[aria-label^="打开题目 "]') ?? [])];
    const counter = [...(box?.querySelectorAll('span') ?? [])].map((el) => el.textContent.trim()).find((t) => /^\\d+\\/\\d+$/.test(t));
    return { rows: rows.length, counter, more: !!box?.querySelector('button[aria-label="显示更多最近题目"]'),
      current: rows.find((el) => el.getAttribute('aria-current') === 'true')?.getAttribute('aria-label') ?? null };
  })()`;
  const recent = await browser.evaluate(readRecent);
  log("recentSection", recent);
  check("recentSectionHighlightsOpenedProblem", recent.rows > 0 && !!recent.current && recent.current.includes(inclineTitle) && recent.rows === Number(recent.counter?.split("/")[0]) && !recent.more, recent);
  await browser.clickSelector('button[aria-label="折叠最近"]');
  check("recentSectionCollapseHidesRows", (await browser.evaluate(readRecent)).rows === 0);
  await browser.clickSelector('button[aria-label="展开最近"]');
  check("recentSectionExpandsBack", (await browser.evaluate(readRecent)).rows === recent.rows, recent);

  // 「最近」排在题库文件夹列表之后，并与上方用一条分隔线隔开；左栏底部不再放说明文案。
  const placement = await browser.evaluate(`(() => {
    const box = document.querySelector('section[aria-label="最近题目"]');
    const folders = [...document.querySelectorAll('button[aria-label^="折叠项目 "], button[aria-label^="展开项目 "]')];
    const aside = box?.closest('aside');
    return {
      recentTop: box?.getBoundingClientRect().top ?? null,
      lastFolderBottom: folders.at(-1)?.getBoundingClientRect().bottom ?? 0,
      separator: getComputedStyle(box).borderTopWidth,
      footer: /按章节建立项目|题库保存在当前浏览器/.test(aside ? aside.textContent : document.body.textContent),
    };
  })()`);
  log("recentPlacement", placement);
  check("recentSitsBelowFolderTree", placement.recentTop !== null && placement.recentTop > placement.lastFolderBottom, placement);
  check("recentSeparatedByTopRule", placement.separator !== "0px", placement.separator);
  check("libraryFooterCopyRemoved", !placement.footer, placement.footer);

  // 临界状态面板已从题库栏移入右侧页签，左栏滚动区不再承载它。
  await browser.click("对象与受力", `${RIGHT} [role="tab"]`);
  await browser.wait(`!!document.querySelector('div[aria-label="题目临界状态"]')?.getClientRects().length`, "critical panel rendered");
  const panel = await browser.evaluate(`(() => {
    const box = document.querySelector('div[aria-label="题目临界状态"]');
    return {
      visible: !!box?.getClientRects().length,
      inRightPane: box?.closest('aside')?.getAttribute('aria-label') === '动画参数与对话',
      stillInLibrary: !!document.querySelector(${JSON.stringify(`${LEFT} div[aria-label="题目临界状态"]`)}),
      states: box?.querySelectorAll('button[aria-label^="临界状态"]').length ?? 0,
      seek: box?.querySelectorAll('button[aria-label^="定位"]').length ?? 0,
    };
  })()`);
  log("criticalPanel", panel);
  check("criticalPanelOwnedByRightPane", panel.visible && panel.inRightPane && !panel.stillInLibrary, panel);
  check("inclineExampleListsSeekableStates", panel.states >= 2 && panel.seek >= 2, panel);
  await shot("02-critical-panel.png");
});