// Library regression probe: read-only problem detail, rename, delete/undo, sibling reorder, bulk/undo.
import { BASE, LEFT, ROW, runProbe, enterStudy, openExisting, waitFor } from "./cdp.mjs";

await runProbe("v2-lib", {port:9345, width:1440, height:900}, async ({browser, check, expect, log, shot}) => {
  const titles = () => browser.evaluate(`[...document.querySelectorAll(${JSON.stringify(`${LEFT} ${ROW}`)})].map((el) => el.getAttribute('aria-label').slice(3,-4))`);
  const rowMenu = (title) => `${LEFT} button[aria-label=${JSON.stringify(`题目 ${title} 的操作`)}]`;
  const sameOrder = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const openMenu = async (title) => {
    await browser.clickSelector(rowMenu(title));
    await browser.wait(`!!document.querySelector('[role="menuitem"]')`, `menu for ${title}`);
  };
  const undo = async () => {
    await browser.click("撤销", '[data-sonner-toast] button', {exact:true});
    await browser.wait(`![...document.querySelectorAll('[data-sonner-toast] button')].some((b) => b.textContent.trim() === '撤销')`, "undo action dismissed");
  };
  await browser.goto(BASE);
  await enterStudy(browser);
  const sessionTitle = await openExisting(browser);

  check("noObsoleteCurrentEditor", await browser.evaluate(`![...document.querySelectorAll(${JSON.stringify(`${LEFT} summary, ${LEFT} button`)})].some((el) => el.textContent.trim() === '编辑当前题目' || el.getAttribute('aria-label') === '编辑当前题目') && !document.querySelector(${JSON.stringify(`${LEFT} textarea[aria-label="题目内容"]`)})`));
  const beforeDetail = await titles();
  // The new bottom panel shares the left pane, but is not a library row/group.
  const criticalPanel = await browser.evaluate(`(() => {
    const panel = document.querySelector(${JSON.stringify(`${LEFT} [aria-label="题目临界状态"]`)});
    return {present:!!panel, libraryRows:panel?.querySelectorAll(${JSON.stringify(ROW)}).length,
      bottom:panel?.getBoundingClientRect().bottom, paneBottom:document.querySelector(${JSON.stringify(LEFT)})?.getBoundingClientRect().bottom};
  })()`);
  check("criticalPanelCoexistsBelowLibrary", criticalPanel.present && criticalPanel.libraryRows === 0 && Math.abs(criticalPanel.bottom - criticalPanel.paneBottom) <= 2 && beforeDetail.length > 0, criticalPanel);
  const target = await browser.box(`${LEFT} button[aria-label=${JSON.stringify(`查看题目 ${sessionTitle}`)}]`);
  // CDP click counts generate a real double-click rather than dispatching a DOM event.
  await browser.send("Input.dispatchMouseEvent", {type:"mouseMoved", x:target.x, y:target.y});
  for (const clickCount of [1, 2]) {
    await browser.send("Input.dispatchMouseEvent", {type:"mousePressed", x:target.x, y:target.y, button:"left", buttons:1, clickCount});
    await browser.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:target.x, y:target.y, button:"left", buttons:0, clickCount});
  }
  await browser.wait(`!!document.querySelector(${JSON.stringify(`${LEFT} button[aria-label="返回题库"]`)})?.getClientRects().length`, "double-click opens left problem detail");
  const detail = await browser.evaluate(`(() => {
    const section = document.querySelector(${JSON.stringify(`${LEFT} button[aria-label="返回题库"]`)})?.closest('section');
    return {heading:section?.querySelector('h2')?.textContent, statement:section?.querySelector('p')?.textContent, editors:section?.querySelectorAll('input, textarea, [contenteditable="true"]').length};
  })()`);
  check("doubleClickOpensReadOnlyProblem", detail.heading === "题目" && detail.editors === 0, detail);
  check("readOnlyDetailKeepsProblem", typeof detail.statement === "string" && detail.statement.length > 20, detail.statement);
  await browser.clickSelector(`${LEFT} button[aria-label="返回题库"]`);
  await browser.wait(`!!document.querySelector(${JSON.stringify(`${LEFT} ${ROW}`)})?.getClientRects().length`, "return restores library rows");
  check("returnRestoresLibrary", !(await browser.exists(`${LEFT} button[aria-label="返回题库"]`)) && sameOrder(await titles(), beforeDetail));

  // Explicit manual sorting removes timestamp-driven reordering from rename/undo checks.
  await browser.clickSelector(`${LEFT} [aria-label="排序方式"]`);
  await browser.click("手动排序", '[role="option"]', {exact:true});
  await browser.wait(`document.querySelector(${JSON.stringify(`${LEFT} [aria-label="排序方式"]`)})?.textContent.includes('手动排序')`, "manual sort selected");
  const before = await titles();
  const siblings = await browser.evaluate(`(() => {
    const group = [...document.querySelectorAll(${JSON.stringify(`${LEFT} ul`)})].find((el) => el.querySelectorAll(${JSON.stringify(ROW)}).length >= 2);
    return group ? [...group.querySelectorAll(${JSON.stringify(ROW)})].map((el) => el.getAttribute('aria-label').slice(3,-4)) : [];
  })()`);
  expect("atLeastTwoSiblingSessions", siblings.length >= 2, {before, siblings});
  const original = siblings[0];
  const renamed = `QA 改名验证 ${Date.now()}`;
  await openMenu(original);
  log("rowMenuItems", await browser.evaluate(`[...document.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent.trim())`));
  await browser.click("重命名", '[role="menuitem"]', {exact:true});
  await browser.wait(`document.activeElement?.getAttribute('aria-label') === '题目标题'`, "Radix rename keeps input focus");
  check("renameFocusNotStolen", true, await browser.evaluate(`({tag:document.activeElement.tagName, label:document.activeElement.getAttribute('aria-label')})`));
  await browser.type('input[aria-label="题目标题"]', renamed);
  await browser.key("Enter", "Enter", 13);
  const afterRename = await waitFor(async () => {
    const result = await titles(); return result.includes(renamed) ? result : null;
  }, "renamed row saved");
  check("renameOnlyChangesTarget", sameOrder(afterRename, before.map((title) => title === original ? renamed : title)), {before, afterRename});
  await shot("01-rename.png");

  await openMenu(renamed);
  await browser.click("删除（可撤销）", '[role="menuitem"]', {exact:true});
  const afterDelete = await waitFor(async () => {
    const result = await titles(); return !result.includes(renamed) ? result : null;
  }, "target deleted");
  check("deleteOnlyRemovesTarget", sameOrder(afterDelete, afterRename.filter((title) => title !== renamed)), {afterRename, afterDelete});
  await undo();
  const afterUndo = await waitFor(async () => {
    const result = await titles(); return result.includes(renamed) ? result : null;
  }, "single-delete undo restores row");
  check("undoRestoresExactTitlesAndOrder", sameOrder(afterUndo, afterRename), {afterRename, afterUndo});
  await shot("02-undo.png");

  await openMenu(renamed);
  await browser.click("下移一位", '[role="menuitem"]', {exact:true});
  const expectedOrder = [...afterUndo];
  const first = expectedOrder.indexOf(renamed), second = expectedOrder.indexOf(siblings[1]);
  [expectedOrder[first], expectedOrder[second]] = [expectedOrder[second], expectedOrder[first]];
  const afterMove = await waitFor(async () => {
    const result = await titles(); return !sameOrder(result, afterUndo) ? result : null;
  }, "move-down changes order");
  check("reorderSwapsOnlyAdjacentSiblings", sameOrder(afterMove, expectedOrder), {before:afterUndo, expectedOrder, afterMove});
  check("sortRemainsManual", await browser.evaluate(`document.querySelector(${JSON.stringify(`${LEFT} [aria-label="排序方式"]`)})?.textContent.includes('手动排序')`));

  await browser.clickSelector(`${LEFT} button[aria-label="批量管理"]`);
  await browser.wait(`document.querySelectorAll(${JSON.stringify(`${LEFT} [role="checkbox"]`)}).length > 0`, "bulk checkboxes");
  const count = await browser.evaluate(`document.querySelectorAll(${JSON.stringify(`${LEFT} [role="checkbox"]`)}).length`);
  check("bulkHasCheckboxPerRow", count === afterMove.length, {count, rows:afterMove.length});
  await browser.click("全选", `${LEFT} button`, {exact:true});
  const checked = await browser.evaluate(`document.querySelectorAll(${JSON.stringify(`${LEFT} [role="checkbox"][aria-checked="true"]`)}).length`);
  check("selectAllChecksEveryRow", checked === afterMove.length, {checked, rows:afterMove.length});
  await shot("03-bulk-selected.png");
  await browser.click("删除", `${LEFT} button`, {exact:true});
  await browser.wait(`document.querySelectorAll(${JSON.stringify(`${LEFT} ${ROW}`)}).length === 0`, "bulk deletion empties visible library");
  check("bulkDeleteRemovesAll", (await titles()).length === 0);
  await undo();
  const afterBulkUndo = await waitFor(async () => {
    const result = await titles(); return result.length === afterMove.length ? result : null;
  }, "bulk undo restores all rows");
  check("bulkUndoRestoresTitlesAndOrder", sameOrder(afterBulkUndo, afterMove), {afterMove, afterBulkUndo});
  if (await browser.exists(`${LEFT} button[aria-label="退出批量管理"]`)) await browser.clickSelector(`${LEFT} button[aria-label="退出批量管理"]`);

  await browser.goto(BASE);
  await enterStudy(browser);
  await openExisting(browser, renamed);
  const reloaded = await titles();
  check("libraryChangesPersist", sameOrder(reloaded, afterMove), {expected:afterMove, actual:reloaded});
  check("renamedSessionStillOpens", await browser.evaluate(`document.querySelector(${JSON.stringify(`${LEFT} button[aria-current="true"]`)})?.textContent.includes(${JSON.stringify(renamed)})`));
  await shot("04-library-reloaded.png");
});
