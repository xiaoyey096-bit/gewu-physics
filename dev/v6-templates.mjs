// P0 多题型探针：斜面 / 滑块木板 / 一维碰撞。
// 断言：数值来自解析解、画布有内容且随时间变化、题解与参数面板同步。
import { BASE, runProbe, enterStudy, sleep } from "./cdp.mjs";

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
    key: "incline", label: "斜面 · 37° μ=0.5", aria: "斜面下滑动画",
    expectNumbers: [2.025, 1.988, 4.025, 31.945],
    expectBadge: "斜面",
    expectSliders: ["物块质量 m", "斜面倾角 θ", "动摩擦因数 μ", "斜面长度 L", "初速度 v₀", "重力加速度 g"],
  },
  {
    key: "blockBoard", label: "滑块木板 · v₀=6", aria: "滑块与木板动画",
    expectNumbers: [2, 2, 6, 12],
    expectBadge: "板-块",
    expectSliders: ["滑块初速度 v₀", "滑块质量 m", "木板质量 M", "木板长度 L", "动摩擦因数 μ", "重力加速度 g"],
  },
  {
    key: "collision", label: "弹性碰撞 · 1 kg / 2 kg", aria: "一维碰撞动画",
    expectNumbers: [-1, 2, 3],
    expectBadge: "碰撞",
    expectSliders: ["A 球质量 m₁", "B 球质量 m₂", "A 球初速度 v₁", "B 球初速度 v₂", "恢复系数 e"],
  },
];

await runProbe("v6-templates", { port: 9335, width: 1440, height: 900 }, async ({ browser, check, expect, log, shot }) => {
  await browser.goto(BASE);
  await enterStudy(browser);
  await browser.wait(`!!document.querySelector('[aria-label="题干或提问输入"]')`, "intake");

  for (const item of cases) {
    if (await browser.exists('button[aria-label="题型模板"]')) {
      await browser.click("新建题目会话", 'main button, aside button', { exact: true });
      await browser.wait(`!!document.querySelector('[aria-label="题干或提问输入"]')`, "intake again");
    }
    await browser.click(item.label, "main button", { exact: true });
    await browser.wait(`!!document.querySelector('[aria-label="题目内容（可编辑）"]')`, `${item.key} confirmation`);
    const badge = await browser.evaluate(`[...document.querySelectorAll('[data-slot=badge]')].map(e => e.textContent).join('|')`);
    check(`${item.key}Badge`, badge.includes(item.expectBadge), badge);
    await shot(`01-${item.key}-confirm.png`);
    await browser.click("生成动画与题解", "main button", { exact: true });
    await browser.wait(`!!document.querySelector('canvas[aria-label]')`, `${item.key} workspace`);

    const canvasLabel = await browser.evaluate(`document.querySelector('canvas[aria-label]').getAttribute('aria-label')`);
    check(`${item.key}CanvasAria`, canvasLabel.startsWith(item.aria), canvasLabel);
    const state = await browser.evaluate(`(() => {
      const c = document.querySelector('canvas[aria-label]');
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
    const templateValue = await browser.evaluate(`document.querySelector('button[aria-label="题型模板"]')?.textContent || ''`);
    check(`${item.key}TemplateSelect`, templateValue.trim().startsWith(item.key === "collision" ? "一维碰撞" : item.key === "blockBoard" ? "滑块与木板" : "斜面下滑"), templateValue);

    const source = await browser.evaluate(`(() => {
      const s = document.querySelector('section[aria-label="简要题解"] [data-solution-source]');
      return s ? s.textContent : '';
    })()`);
    const nums = (source.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    const missing = item.expectNumbers.filter((v) => !nums.some((n) => Math.abs(n - v) <= 0.03));
    check(`${item.key}SolutionNumbers`, missing.length === 0, { missing, count: nums.length, sample: source.slice(0, 260) });
    const notes = await browser.evaluate(`[...document.querySelectorAll('section[aria-label="参数讲解与调整"] details')].length`);
    expect(`${item.key}ParamNotes`, notes >= 3, notes);
    await shot(`02-${item.key}-stage.png`);
    log(`${item.key}State`, { state, duration: t?.d, templateValue, h0, h1 });
  }

  // 模板切换：在同一会话内从碰撞切换到抛体，确认画布 aria 恢复旧选择器前缀。
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
  const switched = await browser.evaluate(`document.querySelector('canvas[aria-label]')?.getAttribute('aria-label') || ''`);
  check("switchToProjectile", switched.startsWith("抛体运动动画"), switched);
  const switchedSliders = await browser.evaluate(`[...document.querySelectorAll('aside [role="slider"]')].map(e => e.getAttribute('aria-label'))`);
  check("switchToProjectileSliders", ["初速度 v₀", "抛射角 θ", "初始高度 h₀", "重力加速度 g"].every((s) => switchedSliders.includes(s)), switchedSliders);
});