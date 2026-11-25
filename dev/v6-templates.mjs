// 四题型回归：从左侧「最近」打开示例题，断言解析解数值、画布内容随时间变化、参数面板同步。
import { BASE, runProbe, enterStudy, sleep } from "./cdp.mjs";

const RECENT_ITEM = 'section[aria-label="最近题目"] button[aria-label^="打开题目"]';

const hashOf = `(() => {
  const c = document.querySelector('canvas[aria-label]');
  if (!c || !c.width) return null;
  const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4 * 53) s = (s * 31 + d[i] + d[i+1] * 3 + d[i+2] * 7 + d[i+3]) % 2147483647;
  return s;
})()`;

const cases = [
  {
    key: "projectile", match: "无人机", label: "平抛 · h₀=20", aria: "抛体运动动画",
    expectNumbers: [2.02, 24.24],
    expectSliders: ["初速度 v₀", "抛射角 θ", "初始高度 h₀", "重力加速度 g"],
    expectApprox: true, // 开方出来的飞行时间确实被截断过，这里 ≈ 该留着
  },
  {
    key: "incline", match: "倾角 37°", label: "斜面 · 37° μ=0.5", aria: "斜面下滑动画",
    expectNumbers: [2.025, 1.988, 4.025, 31.945],
    expectSliders: ["物块质量 m", "斜面倾角 θ", "动摩擦因数 μ", "斜面长度 L", "初速度 v₀", "重力加速度 g"],
    expectApprox: true, // sin37°、cos37° 是无理数，N 与 a 只能写约等号
  },
  {
    key: "blockBoard", match: "长 7 m", label: "滑块木板 · v₀=6", aria: "滑块与木板动画",
    expectNumbers: [2, 2, 6, 12],
    expectSliders: ["滑块初速度 v₀", "滑块质量 m", "木板质量 M", "木板长度 L", "动摩擦因数 μ", "地面摩擦因数 μ′", "重力加速度 g"],
    expectExact: ["a_1 = -\\mu g = -2", "a_2 = \\frac{\\mu mg}{M} = 1", "Q = \\mu mg\\Delta s = 12"],
    noApprox: true, // g 取 10、μ 取 0.4 时这些数全都能除尽，题解里不该出现 ≈
  },
  {
    key: "collision", match: "光滑水平面上", label: "弹性碰撞 · 1 kg / 2 kg", aria: "一维碰撞动画",
    expectNumbers: [-1, 2, 3],
    expectSliders: ["A 球质量 m₁", "B 球质量 m₂", "A 球初速度 v₁", "B 球初速度 v₂", "恢复系数 e"],
    expectExact: ["v_1' = -1", "v_2' = 2"],
    noApprox: true,
  },
];

await runProbe("v6-templates", { port: 9335, width: 1440, height: 900 }, async ({ browser, check, expect, log, shot }) => {
  await browser.goto(BASE);
  await enterStudy(browser);

  for (const item of cases) {
    const opened = await browser.evaluate(`(() => {
      const rows = [...document.querySelectorAll(${JSON.stringify(RECENT_ITEM)})];
      const hit = rows.find((b) => b.getAttribute("aria-label").includes(${JSON.stringify(item.match)}));
      if (!hit) return null;
      hit.scrollIntoView({ block: "center" });
      hit.click();
      return hit.getAttribute("aria-label");
    })()`);
    expect(`${item.key}OpenedFromRecent`, opened !== null, opened);
    await browser.wait(`!!document.querySelector('main canvas[aria-label]')`, `${item.key} workspace`, 20000);

    const canvasLabel = await browser.evaluate(`document.querySelector('main canvas[aria-label]').getAttribute('aria-label')`);
    check(`${item.key}CanvasAria`, canvasLabel.startsWith(item.aria), canvasLabel);
    const state = await browser.evaluate(`(() => {
      const c = document.querySelector('main canvas[aria-label]');
      const p = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let painted = 0; const colors = new Set();
      for (let i = 0; i < p.length; i += 4 * 97) { if (p[i+3] > 8) painted++; colors.add(p.slice(i,i+4).join(',')); }
      return {w:c.width, h:c.height, painted, colors:colors.size};
    })()`);
    expect(`${item.key}Painted`, state.painted > 200 && state.colors > 4, state);
    const t = await browser.evaluate(`(() => { const s = document.querySelector('[role="slider"][aria-label="动画时间轴"]'); return s ? {d:Number(s.getAttribute('aria-valuemax'))} : null; })()`);
    expect(`${item.key}Duration`, t && t.d > 0, t);

    const h0 = await browser.evaluate(hashOf);
    await browser.dragSlider("动画时间轴", 0.55);
    await sleep(250);
    const h1 = await browser.evaluate(hashOf);
    check(`${item.key}FrameChanges`, typeof h0 === "number" && typeof h1 === "number" && h0 !== h1, { h0, h1 });

    const sliders = await browser.evaluate(`[...document.querySelectorAll('aside [role="slider"]')].map(e => e.getAttribute('aria-label'))`);
    check(`${item.key}Sliders`, item.expectSliders.every((s) => sliders.includes(s)), sliders);

    const source = await browser.evaluate(`(() => {
      const s = document.querySelector('section[aria-label="简要题解"] [data-solution-source]');
      return s ? s.textContent : '';
    })()`);
    const nums = (source.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    const missing = item.expectNumbers.filter((v) => !nums.some((n) => Math.abs(n - v) <= 0.05));
    check(`${item.key}SolutionNumbers`, missing.length === 0, { missing, count: nums.length, sample: source.slice(0, 260) });

    // 题解里的关系符号：能除尽的写 = ，真被截断的才写 ≈（≈ 后面必然带小数位）。
    const missingExact = (item.expectExact ?? []).filter((want) => !source.includes(want));
    check(`${item.key}ExactEqualsShown`, missingExact.length === 0, { missingExact, sample: source.slice(0, 320) });
    const approxSites = source.match(/\\approx\s-?[\d.]+/g) || [];
    check(`${item.key}ApproxCarriesDecimals`, approxSites.every((s) => /\d\.\d/.test(s)), approxSites.slice(0, 6));
    if (item.expectApprox) check(`${item.key}RoundedKeepsApprox`, approxSites.length > 0, source.slice(0, 320));
    if (item.noApprox) check(`${item.key}ExactDataNoApprox`, approxSites.length === 0, approxSites.slice(0, 6));

    // 受力分析：每个题型都要列出临界状态与受力
    const forces = await browser.evaluate(`(() => {
      const tabs = [...document.querySelectorAll('aside[aria-label="动画参数与对话"] [role="tab"]')];
      const hit = tabs.find((t) => t.textContent.includes("对象与受力"));
      hit?.click();
      const box = document.querySelector('div[aria-label="题目临界状态"]');
      return { tab: !!hit, points: box ? box.querySelectorAll('li button[aria-label^="临界状态"]').length : -1, labels: box ? [...box.querySelectorAll("ul ul li")].map((li) => li.textContent.trim()).slice(0, 3) : [] };
    })()`);
    expect(`${item.key}CriticalStates`, forces.tab && forces.points >= 1 && forces.labels.length > 0, forces);
    await shot(`02-${item.key}-stage.png`);
    log(`${item.key}State`, { state, duration: t?.d, opened });
  }

  // 模板切换：在同一会话内从当前题型切换到抛体，确认画布与参数一起换掉。
  await browser.evaluate(`(() => {
    const b = [...document.querySelectorAll('button[aria-label="题型模板"]')][0];
    b?.click();
  })()`);
  await sleep(200);
  await browser.evaluate(`(() => {
    const opt = [...document.querySelectorAll('[role="option"]')].find((e) => e.textContent.includes('抛体运动'));
    opt?.click();
  })()`);
  await sleep(600);
  const switched = await browser.evaluate(`document.querySelector('main canvas[aria-label]')?.getAttribute('aria-label') || ''`);
  check("switchToProjectile", switched.startsWith("抛体运动动画"), switched);
  const switchedSliders = await browser.evaluate(`[...document.querySelectorAll('aside [role="slider"]')].map(e => e.getAttribute('aria-label'))`);
  check("switchToProjectileSliders", ["初速度 v₀", "抛射角 θ", "初始高度 h₀", "重力加速度 g"].every((s) => switchedSliders.includes(s)), switchedSliders);
});
