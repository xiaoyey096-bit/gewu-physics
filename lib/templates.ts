// 题型元数据：参数滑杆、默认值、所求量与示例题。UI 与本地解析共用。

import type { Problem, ProblemParams, ProjectileParams, TemplateId } from "./types";
import { kindLabel } from "./text";

export interface ParamConfig {
  key: string;
  symbol: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export interface TemplateMeta {
  id: TemplateId;
  label: string;
  short: string;
  description: string;
  defaults: ProblemParams;
  params: ParamConfig[];
  asks: string[];
}

const projectile: TemplateMeta = {
  id: "projectile",
  label: "抛体运动",
  short: "抛体",
  description: "斜抛 · 平抛 · 竖直上抛",
  defaults: { v0: 20, angleDeg: 30, h0: 0, g: 9.8 },
  params: [
    { key: "v0", symbol: "v₀", label: "初速度", unit: "m/s", min: 0.5, max: 200, step: 0.5 },
    { key: "angleDeg", symbol: "θ", label: "抛射角", unit: "°", min: 0, max: 90, step: 1 },
    { key: "h0", symbol: "h₀", label: "初始高度", unit: "m", min: 0, max: 200, step: 0.5 },
    { key: "g", symbol: "g", label: "重力加速度", unit: "m/s²", min: 1, max: 20, step: 0.1 },
  ],
  asks: ["range", "maxHeight", "flightTime", "apexTime", "landingSpeed"],
};

const incline: TemplateMeta = {
  id: "incline",
  label: "斜面下滑",
  short: "斜面",
  description: "受力分析 · 匀变速 · 摩擦生热",
  defaults: { m: 2, angleDeg: 37, mu: 0.5, L: 4, g: 10, v0: 0 },
  params: [
    { key: "m", symbol: "m", label: "物块质量", unit: "kg", min: 0.2, max: 20, step: 0.1 },
    { key: "angleDeg", symbol: "θ", label: "斜面倾角", unit: "°", min: 5, max: 80, step: 1 },
    { key: "mu", symbol: "μ", label: "动摩擦因数", unit: "", min: 0, max: 0.9, step: 0.05 },
    { key: "L", symbol: "L", label: "斜面长度", unit: "m", min: 1, max: 20, step: 0.5 },
    { key: "v0", symbol: "v₀", label: "初速度", unit: "m/s", min: 0, max: 20, step: 0.5 },
    { key: "g", symbol: "g", label: "重力加速度", unit: "m/s²", min: 1, max: 20, step: 0.1 },
  ],
  asks: ["acceleration", "time", "speed", "heat", "workG"],
};

const blockBoard: TemplateMeta = {
  id: "blockBoard",
  label: "滑块与木板",
  short: "板-块",
  description: "受力阶段 · 相对滑动 · 共速 · 摩擦生热",
  defaults: { m: 1, M: 2, L: 7, v0: 6, mu: 0.2, muGround: 0, g: 10 },
  params: [
    { key: "v0", symbol: "v₀", label: "滑块初速度", unit: "m/s", min: 0.5, max: 30, step: 0.5 },
    { key: "m", symbol: "m", label: "滑块质量", unit: "kg", min: 0.1, max: 20, step: 0.1 },
    { key: "M", symbol: "M", label: "木板质量", unit: "kg", min: 0.2, max: 40, step: 0.1 },
    { key: "L", symbol: "L", label: "木板长度", unit: "m", min: 1, max: 20, step: 0.5 },
    { key: "mu", symbol: "μ", label: "动摩擦因数", unit: "", min: 0.01, max: 0.9, step: 0.01 },
    { key: "muGround", symbol: "μ′", label: "地面摩擦因数", unit: "", min: 0, max: 0.9, step: 0.01 },
    { key: "g", symbol: "g", label: "重力加速度", unit: "m/s²", min: 1, max: 20, step: 0.1 },
  ],
  asks: ["time", "speed", "slip", "heat"],
};

const collision1d: TemplateMeta = {
  id: "collision1d",
  label: "一维碰撞",
  short: "碰撞",
  description: "动量守恒 · 恢复系数 · 动能损失",
  defaults: { m1: 1, m2: 2, v1: 3, v2: 0, e: 1 },
  params: [
    { key: "m1", symbol: "m₁", label: "A 球质量", unit: "kg", min: 0.1, max: 20, step: 0.1 },
    { key: "m2", symbol: "m₂", label: "B 球质量", unit: "kg", min: 0.1, max: 20, step: 0.1 },
    { key: "v1", symbol: "v₁", label: "A 球初速度", unit: "m/s", min: -20, max: 20, step: 0.5 },
    { key: "v2", symbol: "v₂", label: "B 球初速度", unit: "m/s", min: -20, max: 20, step: 0.5 },
    { key: "e", symbol: "e", label: "恢复系数", unit: "", min: 0, max: 1, step: 0.05 },
  ],
  asks: ["v1After", "v2After", "loss", "momentum"],
};

export const TEMPLATES: TemplateMeta[] = [projectile, incline, blockBoard, collision1d];

export function templateMeta(id: TemplateId): TemplateMeta {
  return TEMPLATES.find((t) => t.id === id) ?? projectile;
}

export function templateBadge(problem: Problem): string {
  return problem.template === "projectile" ? kindLabel(problem.params as ProjectileParams) : templateMeta(problem.template).short;
}

export function templateLabel(problem: Problem): string {
  return templateMeta(problem.template).label;
}

export function isParamKey(problem: Problem, key: string): boolean {
  return templateMeta(problem.template).params.some((p) => p.key === key);
}

export function randomParams(id: TemplateId): ProblemParams {
  const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
  if (id === "incline") {
    const angleDeg = pick([25, 30, 37, 45, 53]);
    const tan = Math.tan((angleDeg * Math.PI) / 180);
    const mu = Math.min(0.5, Number((Math.max(0.1, tan * 0.55) * Math.random()).toFixed(2)));
    return { m: Number((1 + Math.random() * 4).toFixed(1)), angleDeg, mu, L: Number((3 + Math.random() * 5).toFixed(1)), g: pick([9.8, 10]), v0: pick([0, 0, 0, 2]) };
  }
  if (id === "blockBoard") {
    const mu = Number((0.1 + Math.random() * 0.3).toFixed(2));
    return { m: Number((0.5 + Math.random() * 2).toFixed(1)), M: Number((1 + Math.random() * 4).toFixed(1)), L: Number((5 + Math.random() * 7).toFixed(1)), v0: Number((4 + Math.random() * 8).toFixed(1)), mu, muGround: pick([0, 0, 0, Number((mu * 0.5).toFixed(2))]), g: pick([9.8, 10]) };
  }
  if (id === "collision1d") {
    return { m1: Number((0.5 + Math.random() * 2.5).toFixed(1)), m2: Number((0.5 + Math.random() * 3.5).toFixed(1)), v1: Number((2 + Math.random() * 6).toFixed(1)), v2: 0, e: pick([0, 0.5, 1]) };
  }
  return { v0: Number((6 + Math.random() * 34).toFixed(1)), angleDeg: pick([0, 15, 30, 37, 45, 53, 60, 75, 90]), h0: pick([0, 0, 0, 5, 10, 20]), g: pick([9.8, 9.8, 10, 1.6, 3.7]) };
}

export interface TemplateExample {
  key: string;
  label: string;
  statement: string;
  template: TemplateId;
  params: ProblemParams;
  ask: string[];
  questions: string[];
}

export const EXAMPLES: TemplateExample[] = [
  {
    key: "oblique",
    label: "斜抛 · 30°",
    template: "projectile",
    statement:
      "从地面以 20 m/s 的初速度、与水平方向成 30° 角斜向上抛出一小球，不计空气阻力，g 取 9.8 m/s²。求小球的射程、最大高度与飞行时间。",
    params: { v0: 20, angleDeg: 30, h0: 0, g: 9.8 },
    ask: ["range", "maxHeight", "flightTime"],
    questions: ["为什么水平方向的速度一直不变？"],
  },
  {
    key: "horizontal",
    label: "平抛 · 20 m 高台",
    template: "projectile",
    statement:
      "一架无人机在 20 m 高空以 12 m/s 的速度水平飞行，投放一个物资包，不计空气阻力，g 取 9.8 m/s²。求落地点与投放点的水平距离、落地时间与落地速度大小。",
    params: { v0: 12, angleDeg: 0, h0: 20, g: 9.8 },
    ask: ["range", "flightTime", "landingSpeed"],
    questions: ["飞行时间由什么决定？"],
  },
  {
    key: "vertical",
    label: "竖直上抛 · g=10",
    template: "projectile",
    statement:
      "以 15 m/s 的初速度竖直向上抛出一石子，g 取 10 m/s²，不计空气阻力。求石子上升的最大高度与回到抛出点所用的时间。",
    params: { v0: 15, angleDeg: 90, h0: 0, g: 10 },
    ask: ["maxHeight", "flightTime"],
    questions: ["最高点时加速度为零吗？"],
  },
  {
    key: "incline",
    label: "斜面 · 37° μ=0.5",
    template: "incline",
    statement:
      "质量 2 kg 的物块从倾角 37°、长 4 m 的斜面顶端由静止释放，物块与斜面间的动摩擦因数 μ = 0.5，取 g = 10 m/s²、sin37° = 0.6、cos37° = 0.8。求物块下滑的加速度、滑到底端的时间与速度，以及这一过程摩擦产生的热量。",
    params: { m: 2, angleDeg: 37, mu: 0.5, L: 4, g: 10, v0: 0 },
    ask: ["acceleration", "time", "speed", "heat"],
    questions: ["为什么加速度小于 g·sinθ？", "支持力为什么是 mgcosθ 而不是 mg？", "摩擦生热为什么用 μmgcosθ·L 而不是 μmg·L？"],
  },
  {
    key: "inclineStop",
    label: "斜面 · 减速停在坡面",
    template: "incline",
    statement:
      "倾角 30°、长 8 m 的固定斜面，物块与斜面间的动摩擦因数 μ = 0.8。给物块沿斜面向下 v₀ = 4 m/s 的初速度，取 g = 10 m/s²。判断物块能否滑到底端；若停在斜面上，求滑行距离与停下所需时间，并说明停下前后摩擦力发生了什么变化。",
    params: { m: 1, angleDeg: 30, mu: 0.8, L: 8, g: 10, v0: 4 },
    ask: ["acceleration", "time", "speed", "heat"],
    questions: ["速度减为零后物块为什么会停在斜面上而不反向滑上去？", "停下之后摩擦力的大小由什么决定？"],
  },
  {
    key: "blockBoard",
    label: "滑块木板 · 光滑地面",
    template: "blockBoard",
    statement:
      "长 7 m、质量 M = 2 kg 的木板静止在光滑水平面上，质量 m = 1 kg 的滑块以 v₀ = 6 m/s 的水平速度从左端滑上木板。滑块与木板间的动摩擦因数 μ = 0.2，g 取 10 m/s²。求滑块与木板达到共同速度所需的时间、共同速度、相对位移与摩擦生热。",
    params: { m: 1, M: 2, L: 7, v0: 6, mu: 0.2, muGround: 0, g: 10 },
    ask: ["time", "speed", "slip", "heat"],
    questions: ["木板为什么从 t = 0 起就有加速度？", "达到共同速度后滑块还受摩擦力吗？", "为什么 Q = μmgΔs 而不是 μmg·s滑块？"],
  },
  {
    key: "blockBoardStatic",
    label: "滑块木板 · 木板不动",
    template: "blockBoard",
    statement:
      "长 6 m、质量 M = 2 kg 的木板静止在粗糙水平面上，木板与地面间的动摩擦因数 μ′ = 0.15。质量 m = 1 kg 的滑块以 v₀ = 4 m/s 滑上木板左端，滑块与木板间的动摩擦因数 μ = 0.2，取 g = 10 m/s²，最大静摩擦力等于滑动摩擦力。通过受力分析判断木板会不会被带动，并求滑块相对木板滑行的距离与摩擦生热。",
    params: { m: 1, M: 2, L: 6, v0: 4, mu: 0.2, muGround: 0.15, g: 10 },
    ask: ["time", "speed", "slip", "heat"],
    questions: ["滑块给木板的摩擦力为什么推不动木板？", "滑块停下后木板还受地面的摩擦力吗？"],
  },
  {
    key: "blockBoardBoth",
    label: "滑块木板 · 先带动后共减速",
    template: "blockBoard",
    statement:
      "长 10 m、质量 M = 2 kg 的木板放在粗糙水平面上，木板与地面间的动摩擦因数 μ′ = 0.1。质量 m = 1 kg 的滑块以 v₀ = 6 m/s 滑上木板左端，滑块与木板间的动摩擦因数 μ = 0.4，取 g = 10 m/s²，最大静摩擦力等于滑动摩擦力。分析木板为何先被滑块带动、达到共同速度后又如何一起停下，并求各阶段的时间与摩擦生热。",
    params: { m: 1, M: 2, L: 10, v0: 6, mu: 0.4, muGround: 0.1, g: 10 },
    ask: ["time", "speed", "slip", "heat"],
    questions: ["共速之后两物体之间的摩擦力变成什么？", "为什么共速后木板不再被滑块带动？"],
  },
  {
    key: "collision",
    label: "弹性碰撞 · 1 kg / 2 kg",
    template: "collision1d",
    statement:
      "光滑水平面上，质量 m₁ = 1 kg 的 A 球以 v₁ = 3 m/s 向右运动，与静止的质量 m₂ = 2 kg 的 B 球发生一维弹性碰撞。求碰后两球的速度与系统动能损失，并说明碰撞瞬间两球之间的相互作用力。",
    params: { m1: 1, m2: 2, v1: 3, v2: 0, e: 1 },
    ask: ["v1After", "v2After", "loss"],
    questions: ["为什么碰后 A 球会反向运动？", "碰撞瞬间的弹力为什么远大于重力？", "e = 0 时两球碰后怎么运动？"],
  },
];