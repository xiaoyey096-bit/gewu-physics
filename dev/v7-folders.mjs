// 无限层级文件夹 + 高中题库示例题注入 + 临界状态吸顶回归探针。
import { BASE, LEFT, ROW, runProbe, enterStudy, waitFor, sleep } from "./cdp.mjs";

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
    const hits = titles.filter((t) => /物块从倾角|木板静止|光滑水平面上，质量 1 kg/.test(t));
    return hits.length === 3 ? {titles, hits} : null;
  }, "seeded model examples");
  log("seededTitles", seeded.hits);
  const folderCount = await browser.evaluate(`(() => {
    const btn = document.querySelector(${JSON.stringify(folderBtn("高中题库"))});
    const header = btn?.parentElement;
    return [...(header?.children ?? [])].filter((el) => el.tagName === "SPAN").map((el) => el.textContent.trim());
  })()`);
  check("threeExamplesInHighSchoolFolder", folderCount.some((t) => t === "3"), folderCount);

  await browser.goto(BASE);
  await enterStudy(browser);
  const again = await browser.evaluate(`[...document.querySelectorAll(${JSON.stringify(`${LEFT} ${ROW}`)})].map((el) => el.getAttribute("aria-label").slice(3, -4))`);
  check("seedingIsOneShot", again.filter((t) => /物块从倾角|木板静止|光滑水平面上，质量 1 kg/.test(t)).length === 3 && again.length === seeded.titles.length, {before:seeded.titles, again});

  // 打开注入的斜面题，验证模板与临界状态吸顶。
  const inclineTitle = seeded.hits.find((t) => /物块从倾角/.test(t));
  await browser.clickSelector(`button[aria-label=${JSON.stringify(`题目 ${inclineTitle} 的操作`)}]`);
  await browser.click("打开工作台", '[role="menuitem"]', {exact:true});
  await browser.wait(`!!document.querySelector('canvas[aria-label^="斜面下滑动画"]')`, "incline canvas");
  check("seededInclineOpensWithTemplate", true, inclineTitle);

  await browser.click("对象与临界状态", "summary", {exact:true});
  await browser.wait(`document.querySelector(${JSON.stringify(`${LEFT} [aria-label="题目临界状态"]`)})?.open === true`, "critical panel expanded");
  const sticky = await browser.evaluate(`(() => {
    const details = document.querySelector(${JSON.stringify(`${LEFT} [aria-label="题目临界状态"]`)});
    const summary = details?.querySelector("summary");
    if (!details || !summary) return null;
    details.scrollTop = details.scrollHeight;
    const d = details.getBoundingClientRect(), s = summary.getBoundingClientRect();
    return {open: details.open, scrolled: details.scrollTop, offset: s.top - d.top, summaryVisible: s.bottom > d.top && s.top < d.bottom};
  })()`);
  check("criticalSummaryStickyWhileScrolled", !!sticky && sticky.open && sticky.scrolled > 0 && sticky.offset >= -1 && sticky.offset <= 3, sticky);
  await sleep(150);
  await browser.click("对象与临界状态", "summary", {exact:true});
  const collapsedAfterScroll = await browser.evaluate(`(() => {
    const details = document.querySelector(${JSON.stringify(`${LEFT} [aria-label="题目临界状态"]`)});
    return details ? !details.open : false;
  })()`);
  check("criticalSummaryCollapsesAfterScroll", collapsedAfterScroll);
  await shot("02-sticky-summary.png");
});