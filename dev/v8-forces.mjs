// 第四版验收：受力分析（画布 + 对象与临界状态）、左侧「最近」栏懒加载、入口页 + 上传与快捷键。
import { runProbe, enterStudy, BASE, LEFT, RIGHT, ROW, sleep } from "./cdp.mjs";

const CANVAS = 'main canvas[role="img"]';
const RECENT = 'section[aria-label="最近题目"]';
const RECENT_ROWS = `${RECENT} ul > li`;
const RECENT_COUNT = `${RECENT} span.ml-auto`;
const RECENT_ITEM = `${RECENT} button[aria-label^="打开题目"]`;
const RECENT_MORE = `${RECENT} button[aria-label="显示更多最近题目"]`;
const PROBLEM_PANE = 'section[aria-label="题目原文与图片"]';
const COMPOSE = 'textarea[aria-label="题干或提问输入"]';
const CONFIRM = 'textarea[aria-label="题目内容（可编辑）"]';
const STATES = 'div[aria-label="题目临界状态"]';
const STATE_ITEMS = `${STATES} li button[aria-label^="临界状态"]`;
const LIST = `${LEFT} .overflow-y-auto`;
const BLOCK_BOARD = "长 10 m、质量 M = 2 kg 的木板放在粗糙水平面上，木板与地面间的动摩擦因数 μ′ = 0.1。质量 m = 1 kg 的滑块以 v₀ = 6 m/s 滑上木板左端，滑块与木板间的动摩擦因数 μ = 0.4，取 g = 10 m/s²，最大静摩擦力等于滑动摩擦力。分析木板为何先被滑块带动、达到共同速度后又如何一起停下。";

const now = Date.now();
const QA_SESSIONS = Array.from({ length: 40 }, (_, i) => {
  const at = now - 1000 * (i + 1);
  const params = { v0: 8 + i, angleDeg: 0, h0: 5 + i, g: 9.8 };
  return {
    id: `qa-recent-${i}`, projectId: "p-qa", title: `QA 平抛 ${i}`, source: "text",
    createdAt: at, updatedAt: at, order: i,
    problem: {
      version: 1, template: "projectile",
      statement: `从高 ${5 + i} m 的平台以 ${8 + i} m/s 水平抛出一小球，g 取 9.8 m/s²，求射程与飞行时间。`,
      params, ask: ["range", "flightTime"],
    },
    baseParams: params, questions: [], questionTimes: {},
  };
});
const QA_PROJECT = { id: "p-qa", name: "QA 题集", kind: "custom", order: 9, createdAt: now };

function seedDb(sessions, project) {
  return new Promise((resolve) => {
    const req = indexedDB.open("gewu-studio", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(["sessions", "projects"], "readwrite");
      sessions.forEach((s) => tx.objectStore("sessions").put(s));
      tx.objectStore("projects").put(project);
      tx.oncomplete = () => { db.close(); resolve("ok"); };
      tx.onerror = () => { db.close(); resolve("tx-error"); };
    };
    req.onerror = () => resolve("open-error");
  });
}

const SEED_SCRIPT = `(${seedDb.toString()})(${JSON.stringify(QA_SESSIONS)}, ${JSON.stringify(QA_PROJECT)})`;

// 升级前浏览器里存下的界面偏好：那一版 forces 默认为 true，会盖住现在的「默认只保留运动方向」。
const LEGACY_PREFS = {
  leftOpen: true, rightOpen: true, leftWidth: 280, rightWidth: 320, speed: 1, loop: false,
  rightTab: "parameters", librarySort: "updated", libraryFilter: "all",
  stage: { grid: true, vectors: true, forces: true, stateArrows: true, trail: true, markers: true, strobe: false, glow: true, energy: true },
};

async function pixels(browser, test) {
  return browser.evaluate(`(() => {
    const c = document.querySelector(${JSON.stringify(CANVAS)});
    if (!c) return null;
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let hits = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (${test}) hits++;
    }
    return hits;
  })()`);
}
const INK = "r < 45 && g < 45 && b < 60 && d[i + 3] > 40";

await runProbe("v8-forces", { width: 1440, height: 900 }, async ({ browser, expect, check, shot, log }) => {
  await browser.goto(BASE);
  const seeded = await browser.evaluate(SEED_SCRIPT);
  log("seed", seeded);
  expect("QA 题库写入成功", seeded === "ok", seeded);
  await browser.evaluate(`localStorage.setItem("gewu-prefs-v2", ${JSON.stringify(JSON.stringify(LEGACY_PREFS))}); localStorage.removeItem("gewu-forces-default-off-v1");`);
  await browser.goto(BASE);
  await enterStudy(browser);

  // —— 入口页：示例题与最近题目都不再占据中间区域 ——
  const intake = await browser.evaluate(`(() => {
    const main = document.querySelector('main[aria-label="题目学习会话"]');
    const file = document.querySelector('input[type="file"][aria-label="选择题目文件"]');
    return {
      exampleChips: [...main.querySelectorAll("button")].filter((b) => /斜抛 ·|平抛 ·|滑块木板 ·|弹性碰撞 ·/.test(b.textContent)).length,
      mentionsExample: main.textContent.includes("示例题"),
      mentionsRecent: main.textContent.includes("最近题目"),
      accept: file?.getAttribute("accept") ?? null,
      plus: !!document.querySelector('button[aria-label="添加本地文件"]'),
      scrollbar: getComputedStyle(main).scrollbarWidth,
    };
  })()`);
  log("intake", intake);
  check("入口页无示例题按钮", intake.exampleChips === 0 && !intake.mentionsExample, intake);
  check("入口页不再放最近题目", !intake.mentionsRecent, intake.mentionsRecent);
  check("本地文件支持图片/PDF/Word/txt", ["image", "pdf", "docx", "txt"].every((k) => (intake.accept ?? "").includes(k)), intake.accept);
  check("左下角 + 按钮存在", intake.plus, intake.plus);
  check("中间区域不显示竖向滚动条", intake.scrollbar === "none", intake.scrollbar);

  // —— Enter 发送 / Ctrl+Enter 换行 ——
  await browser.type(COMPOSE, BLOCK_BOARD);
  await browser.key("Enter", "Enter", 13, 2);
  const afterCtrlEnter = await browser.evaluate(`document.querySelector(${JSON.stringify(COMPOSE)})?.value ?? null`);
  check("Ctrl+Enter 只换行不提交", typeof afterCtrlEnter === "string" && afterCtrlEnter.endsWith("\n") && !!afterCtrlEnter, JSON.stringify(afterCtrlEnter?.slice(-12)));
  await browser.key("Enter", "Enter", 13);
  await browser.wait(`!!document.querySelector(${JSON.stringify(CONFIRM)})`, "第二步出现", 30000);
  check("Enter 直接提交进入第二步", true, "确认阶段已渲染");
  await shot("v8-01-confirm.png");
  await browser.click("返回修改输入");

  // —— 左侧「最近」栏：15 条预加载 + 滚动续取，与题库共用一条滚动条 ——
  const firstPage = await browser.evaluate(`(() => {
    const list = document.querySelector(${JSON.stringify(LIST)});
    return {
      rows: document.querySelectorAll(${JSON.stringify(RECENT_ROWS)}).length,
      counter: document.querySelector(${JSON.stringify(RECENT_COUNT)})?.textContent ?? null,
      scrollers: document.querySelectorAll(${JSON.stringify(`${LEFT} .overflow-y-auto`)}).length,
      treeRows: list ? list.querySelectorAll(${JSON.stringify(ROW)}).length : -1,
    };
  })()`);
  log("recentFirstPage", firstPage);
  check("最近栏首屏只渲染 15 条", firstPage.rows === 15, firstPage);
  check("最近栏显示已加载/总数", /^15\/\d+$/.test(firstPage.counter ?? ""), firstPage.counter);
  expect("左侧只有一条竖向滚动条", firstPage.scrollers === 1, firstPage.scrollers);
  check("题库树与最近栏同在一个滚动容器", firstPage.treeRows > 0, firstPage.treeRows);

  // 未加载完时保留「再显示 N 条」入口
  const moreButton = await browser.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(RECENT_MORE)}); return b ? b.textContent.trim() : null; })()`);
  log("recentMoreButton", moreButton);
  check("首屏后仍有手动补取入口", /再显示\s*15\s*条/.test(moreButton ?? ""), moreButton);

  // 滚动到分页哨兵 → 观察者逐页续取，直到全部条目加载完
  await browser.evaluate(`(() => { document.querySelector(${JSON.stringify(RECENT_MORE)})?.scrollIntoView({ block: "center" }); })()`);
  await browser.wait(`document.querySelectorAll(${JSON.stringify(RECENT_ROWS)}).length > 15`, "最近栏滚动续取下一页", 4000);
  const secondPage = await browser.evaluate(`(() => ({ rows: document.querySelectorAll(${JSON.stringify(RECENT_ROWS)}).length, counter: document.querySelector(${JSON.stringify(RECENT_COUNT)})?.textContent }))()`);
  log("recentSecondPage", secondPage);
  check("滚动到最近栏分页哨兵自动加载下一页", secondPage.rows > 15, secondPage);

  for (let i = 0; i < 6; i++) {
    const pending = await browser.evaluate(`(() => !!document.querySelector(${JSON.stringify(RECENT_MORE)}))()`);
    if (!pending) break;
    await browser.evaluate(`(() => { document.querySelector(${JSON.stringify(RECENT_MORE)})?.scrollIntoView({ block: "center" }); })()`);
    await sleep(500);
  }
  const lastPage = await browser.evaluate(`(() => {
    const items = [...document.querySelectorAll(${JSON.stringify(RECENT_ITEM)})];
    return {
      rows: document.querySelectorAll(${JSON.stringify(RECENT_ROWS)}).length,
      counter: document.querySelector(${JSON.stringify(RECENT_COUNT)})?.textContent,
      unique: new Set(items.map((b) => b.getAttribute("aria-label"))).size,
    };
  })()`);
  log("recentLastPage", lastPage);
  const [shown, total] = lastPage.counter.split("/").map(Number);
  check("加载完不再出现补取按钮，且条目数与计数一致", lastPage.rows === shown && shown === total && lastPage.unique === total, lastPage);
  await shot("v8-02-recent.png");

  // —— 从最近栏打开滑块—木板综合题 ——
  const recentTitles = await browser.evaluate(`[...document.querySelectorAll(${JSON.stringify(RECENT_ITEM)})].slice(0, 3).map((b) => b.getAttribute("aria-label"))`);
  log("recentTitles", recentTitles);
  await browser.clickSelector(`${RECENT} button[aria-label*="长 10 m"]`);
  await browser.wait(`!!document.querySelector(${JSON.stringify(CANVAS)})`, "工作台已打开", 20000);
  // 与题库行一致：点「最近」条目直接进入题目界面（左栏换成题面 + 「返回题库」）。
  const openedProblem = await browser.exists(PROBLEM_PANE);
  check("点击最近条目直接进入题目界面", openedProblem, openedProblem);

  // 迁移只改运行时读取，不重写存好的偏好：老用户进来必须看不到受力箭头，但原始记录保持原样。
  const legacyState = await browser.evaluate(`(() => ({
    stored: JSON.parse(localStorage.getItem("gewu-prefs-v2") ?? "null")?.stage?.forces ?? null,
    marker: localStorage.getItem("gewu-forces-default-off-v1"),
    pressed: document.querySelector('div[aria-label="动画控制区"] button[aria-label="受力分析"]')?.getAttribute("aria-pressed"),
  }))()`);
  log("legacyPrefs", legacyState);
  check("老偏好 forces:true 被一次性迁移，受力分析开关为关", legacyState.pressed === "false" && legacyState.stored === true, legacyState);
  await browser.click("返回题库");
  await browser.wait(`!!document.querySelector(${JSON.stringify(RECENT_ITEM)})`, "最近栏恢复");
  check("返回题库后最近栏重新可见", await browser.exists(RECENT_ITEM), true);
  // 条目已经是当前题时，再点一次也要有反应：重新进入题目界面。
  await browser.clickSelector(`${RECENT} button[aria-label*="长 10 m"]`);
  const reopened = await browser.exists(PROBLEM_PANE);
  check("重复点击当前最近条目仍进入题目界面", reopened, reopened);
  await browser.click("返回题库");
  await browser.wait(`!!document.querySelector(${JSON.stringify(RECENT_ITEM)})`, "最近栏恢复");
  log("panelState", await browser.evaluate(`(() => ({ innerWidth: window.innerWidth, asides: [...document.querySelectorAll("aside")].map((a) => a.getAttribute("aria-label")), tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim()) }))()`));
  await browser.wait(`!!document.querySelector(${JSON.stringify(`${RIGHT} [role="tab"]`)})`, "右侧面板就绪");

  const tabs = await browser.evaluate(`[...document.querySelectorAll(${JSON.stringify(`${RIGHT} [role="tab"]`)})].map((t) => t.textContent.trim())`);
  log("rightTabs", tabs);
  expect("右侧面板含对象与受力页签", tabs.some((t) => t.includes("对象与受力")), tabs);
  await browser.click("对象与受力", `${RIGHT} [role="tab"]`);
  await browser.wait(`!!document.querySelector(${JSON.stringify(STATES)})`, "临界状态列表出现");

  const states = await browser.evaluate(`(() => {
    const box = document.querySelector(${JSON.stringify(STATES)});
    return {
      objects: box.querySelector("p")?.textContent.slice(0, 40),
      points: box.querySelectorAll(${JSON.stringify(STATE_ITEMS)}).length,
      labels: [...box.querySelectorAll("ul ul li")].map((li) => li.textContent.trim()),
      fresh: box.querySelectorAll("span.text-fresh").length,
      seek: [...box.querySelectorAll('button[aria-label^="定位"]')].map((b) => b.getAttribute("aria-label")),
    };
  })()`);
  log("states", { ...states, labels: states.labels.slice(0, 14) });
  check("两个对象的力都列出", states.points >= 3 && /滑块（v₁）、木板（v₂）/.test(states.objects ?? ""), states.objects);
  check("受力标签写成 f′（v₂ 0）", states.labels.some((t) => t.includes("f′（v₂ 0）")), states.labels.slice(0, 12));
  check("新出现的力标了「新」并用醒目色", states.fresh >= 3, states.fresh);
  await shot("v8-03-states.png");

  // —— 画布：默认只画运动方向，受力是显式打开的叠加层 ——
  // 用比醒目色更严的红，避开合速度 #c81e5a 被算成受力箭头。
  const FRESH_RED = "r > 190 && g < 70 && b < 70 && d[i + 3] > 40";
  const TEAL = "r < 40 && g > 100 && g < 170 && b > 90 && b < 160";
  const locateFirst = () => browser.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(STATES)})?.querySelector('button[aria-label^="定位"]'); b?.click(); return b?.getAttribute("aria-label") ?? null; })()`);

  const idleFresh = await pixels(browser, FRESH_RED);
  const DECK_FORCE = 'div[aria-label="动画控制区"] button[aria-label="受力分析"]';
  const RIGHT_FORCE = `${RIGHT} button[aria-label="受力分析"]`;
  const idleToggles = await browser.evaluate(`(() => ({
    deck: document.querySelector(${JSON.stringify(DECK_FORCE)})?.getAttribute("aria-pressed") ?? null,
    panel: document.querySelector(${JSON.stringify(RIGHT_FORCE)})?.getAttribute("aria-pressed") ?? null,
  }))()`);
  log("idleForces", { idleFresh, ...idleToggles });
  check("控制条与右栏都有「受力分析」，且默认关闭", idleToggles.deck === "false" && idleToggles.panel === "false", idleToggles);
  check("默认画布不出现受力箭头", idleFresh < 30, idleFresh);

  // 定位只把画面停在该时刻：物体描边还在，但不画受力。
  const firstState = await locateFirst();
  await sleep(600);
  const ink = await pixels(browser, INK);
  const locateFresh = await pixels(browser, FRESH_RED);
  log("locateWithoutForces", { firstState, ink, locateFresh });
  check("物体与常规标注用墨色描边", ink > 400, ink);
  check("未打开受力分析时，定位也不画受力箭头", locateFresh < 30, locateFresh);
  await shot("v8-04-canvas-locate-no-forces.png");

  // 控制条上的「受力分析」直接叠加受力，不必先切右栏页签；两处开关共用同一份偏好，状态要同步。
  await browser.click("受力分析", DECK_FORCE);
  await browser.wait(`document.querySelector(${JSON.stringify(DECK_FORCE)})?.getAttribute("aria-pressed") === "true"`, "控制条受力开关已按下");
  const synced = await browser.evaluate(`(() => ({
    deck: document.querySelector(${JSON.stringify(DECK_FORCE)})?.getAttribute("aria-pressed"),
    panel: document.querySelector(${JSON.stringify(RIGHT_FORCE)})?.getAttribute("aria-pressed"),
  }))()`);
  log("deckToggleSync", synced);
  check("控制条打开受力后，右栏「受力分析」同步为开", synced.deck === "true" && synced.panel === "true", synced);
  await locateFirst();
  await sleep(600);
  const freshStart = await pixels(browser, FRESH_RED);
  log("locateWithForces", { freshStart });
  check("打开受力分析后，定位画出新受力箭头", freshStart > 300, freshStart);
  await shot("v8-05-canvas-locate-forces.png");

  const seekTarget = states.seek.find((label) => /定位两者停下|定位达到共同速度|定位滑块停在/.test(label)) ?? states.seek[1];
  await browser.clickSelector(`${RIGHT} button[aria-label="${seekTarget}"]`);
  await sleep(600);
  const freshNext = await pixels(browser, FRESH_RED);
  const afterSeek = await browser.evaluate(`(() => {
    const box = document.querySelector(${JSON.stringify(STATES)});
    return [...box.querySelectorAll("li")]
      .filter((li) => li.querySelector("button[aria-label^='临界状态']"))
      .filter((li) => li.querySelector("span.text-fresh"))
      .map((li) => li.querySelector("button[aria-label^='临界状态']").textContent.replace(/\\s+/g, " ").slice(0, 22).trim());
  })()`);
  log("afterSeek", { seekTarget, freshNext, markedStates: afterSeek });
  check("定位到下一临界状态仍有醒目色箭头", freshNext > 40, freshNext);
  check("多个临界阶段都标出新出现的力", afterSeek.length >= 2, afterSeek);
  // 「新」只属于这个力在整段运动里的第一次登场：消失后又回来的力不能再标一次。
  // 标签形如「G（v₁ 6）」，两个物体的重力符号都叫 G，所以按「符号 + 速度符号」去重。
  const debutSymbols = await browser.evaluate(`(() => {
    const key = (text) => text.split("（")[0] + "（" + (text.split("（")[1] ?? "").split(" ")[0];
    return [...document.querySelectorAll(${JSON.stringify(`${STATES} span.text-fresh`)})]
      .map((el) => el.textContent.trim()).filter((text) => text !== "新").map(key);
  })()`);
  check("同一个力不会在多个临界状态被标成新出现", debutSymbols.length === new Set(debutSymbols).size, debutSymbols);
  await shot("v8-05-canvas-seek.png");

  // 拖到阶段中后段：受力仍持续绘制，但醒目色要退回墨色，否则整段动画都染红就失去「刚出现」的含义。
  await browser.dragSlider("动画时间轴", 0.78);
  await sleep(400);
  const settled = await pixels(browser, FRESH_RED);
  const settledInk = await pixels(browser, INK);
  log("settled", { settled, settledInk });
  check("阶段播过后受力仍在、醒目色退回墨色", settled < 120 && settledInk > 400, { settled, settledInk });
  await shot("v8-06-canvas-settled.png");

  // —— 「状态箭头」只管定位时的速度箭头，受力归「受力分析」单独控制 ——
  const setToggle = async (label, want) => {
    const sel = `${RIGHT} button[aria-label="${label}"]`;
    const pressed = await browser.evaluate(`document.querySelector(${JSON.stringify(sel)})?.getAttribute("aria-pressed")`);
    if ((pressed === "true") !== want) await browser.click(label, sel);
    return want;
  };
  // 显示选项在「动画参数」页签里，非当前页签的内容虽然留在 DOM 但不可点，先切过去。
  await browser.click("动画参数", `${RIGHT} [role="tab"]`);
  await setToggle("速度矢量", false);
  await setToggle("受力分析", true);
  await setToggle("状态箭头", true);
  // 能量条的分量色与水平速度箭头同色，先关掉，免得把条当成箭头。
  await setToggle("能量", false);
  // 此刻右栏停在「动画参数」页签，临界状态列表不可点，用脚本触发同一个「定位」按钮。
  await locateFirst();
  await sleep(400);
  const withArrows = await pixels(browser, TEAL);
  const withForces = await pixels(browser, FRESH_RED);
  await setToggle("状态箭头", false);
  await sleep(400);
  const withoutArrows = await pixels(browser, TEAL);
  const stillForces = await pixels(browser, FRESH_RED);
  // 再把受力也关掉：定位画面只剩物体与轨迹，两类箭头都不该出现。
  await setToggle("受力分析", false);
  await locateFirst();
  await sleep(400);
  const plainArrows = await pixels(browser, TEAL);
  const plainForces = await pixels(browser, FRESH_RED);
  log("stateArrows", { withArrows, withForces, withoutArrows, stillForces, plainArrows, plainForces });
  check("定位时默认附带速度箭头，关掉状态箭头不影响受力", withArrows > 60 && withoutArrows < 20 && stillForces > 100, { withArrows, withoutArrows, stillForces });
  check("关掉受力分析后定位只剩运动要素", plainArrows < 20 && plainForces < 30, { plainArrows, plainForces });
  await shot("v8-07-state-arrows.png");

  // —— 光滑地面板块题：木板从 t=0 就以 1 m/s² 加速，早期读数不能因为箭头短就整条不画 ——
  await setToggle("速度矢量", true);
  await setToggle("关键点", false);
  await browser.clickSelector(`${RECENT} button[aria-label*="长 7 m"]`);
  await browser.wait(`!!document.querySelector(${JSON.stringify(CANVAS)})`, "光滑地面板块题就绪", 20000);
  const clockText = () => browser.evaluate(`(() => {
    const el = [...document.querySelectorAll("span")].find((e) => /^[0-9]+\\.[0-9]{2} \\/ [0-9]+\\.[0-9]{2} s$/.test(e.textContent.trim()));
    return el ? el.textContent.trim().split(" / ").map((x) => parseFloat(x)) : null;
  })()`);
  const boardTotal = (await clockText())?.[1] ?? 0;
  log("boardDuration", boardTotal);
  await browser.dragSlider("动画时间轴", boardTotal > 0 ? 0.2 / boardTotal : 0);
  await sleep(400);
  const INFO_BLUE = "r > 30 && r < 80 && g > 85 && g < 140 && b > 200 && d[i + 3] > 40";
  const earlyClock = await clockText();
  const earlyBoard = await pixels(browser, INFO_BLUE);
  log("earlyBoardLabel", { earlyClock, earlyBoard });
  check("木板 t<0.5 s 已画出 v₂ 读数与方向", (earlyClock?.[0] ?? 9) < 0.5 && earlyBoard > 20, { earlyClock, earlyBoard });
  await shot("v8-08-early-v2.png");
  await browser.dragSlider("动画时间轴", 0);
  await sleep(400);
  // 阶段按钮把画面精确带回 t = 0.00，此时木板速度为 0，不该画出方向。
  await browser.click("开始相对滑动", 'div[aria-label="动画过程阶段"] button');
  await sleep(400);
  const zeroClock = await clockText();
  const zeroBoard = await pixels(browser, INFO_BLUE);
  log("boardAtZero", { zeroClock, zeroBoard });
  check("回到 t=0.00 木板速度为 0 时不画 v₂ 方向", zeroClock?.[0] === 0 && zeroBoard < 5, { zeroClock, zeroBoard });
  await browser.click("返回题库");
  await browser.wait(`!!document.querySelector(${JSON.stringify(RECENT_ITEM)})`, "最近栏恢复");

  // —— 斜面题：停下前后摩擦力性质改变 ——
  await browser.clickSelector(`${RECENT} button[aria-label*="倾角 30°"]`);
  await browser.wait(`!!document.querySelector(${JSON.stringify(STATE_ITEMS)})`, "斜面临界状态就绪", 20000);
  const incline = await browser.evaluate(`(() => {
    const box = document.querySelector(${JSON.stringify(STATES)});
    return { points: box.querySelectorAll(${JSON.stringify(STATE_ITEMS)}).length, labels: [...box.querySelectorAll("ul ul li")].map((li) => li.textContent.trim()) };
  })()`);
  log("incline", incline);
  check("斜面停下后滑动摩擦力换成静摩擦力并标注消失", incline.labels.some((t) => /f静（v 0）/.test(t)) && incline.labels.some((t) => /本阶段消失：f/.test(t)), incline.labels.slice(0, 12));
  await shot("v8-06-incline.png");

  // —— 迁移只发生一次：用户显式打开受力之后刷新，必须保持打开，不能被迁移反复按回关闭 ——
  await setToggle("受力分析", true);
  await browser.goto(BASE);
  await enterStudy(browser);
  await browser.clickSelector(`${RECENT} button[aria-label*="倾角 30°"]`);
  await browser.wait(`!!document.querySelector('button[aria-label="受力分析"]')`, "刷新后显示选项就绪", 20000);
  const afterReload = await browser.evaluate(`(() => ({
    marker: localStorage.getItem("gewu-forces-default-off-v1"),
    pressed: document.querySelector('div[aria-label="动画控制区"] button[aria-label="受力分析"]')?.getAttribute("aria-pressed"),
  }))()`);
  log("afterReload", afterReload);
  check("刷新后用户显式打开的受力分析保持打开", afterReload.pressed === "true" && afterReload.marker === "1", afterReload);
  await shot("v8-09-prefs-migration.png");
});
