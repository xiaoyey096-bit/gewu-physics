// 解析求解 + 动画时间序列生成（纯函数，无外部依赖）。
// 原则：动画播放的是这里算出的真实轨迹，而不是模型编造的关键帧。
// 前端镜像见 lib/physics.ts，两处修改需同步。

import type {
  BlockBoardParams, CollisionParams, InclineParams, Problem, ProblemParams, ProjectileParams, TemplateId,
} from "./schema.ts";

export interface SolutionStep {
  title: string;
  formula: string;
  explanation: string;
}

export interface Series {
  n: number;
  duration: number;
  t: number[];
  x: number[];
  y: number[];
  vx: number[];
  vy: number[];
}

export interface BodyTrack {
  id: string;
  label: string;
  shape: "ball" | "box" | "board";
  series: Series;
  w: number;
  h: number;
}

export interface SceneEvent {
  id: string;
  title: string;
  time: number;
  condition: string;
}

export interface ScalarTile {
  key: string;
  label: string;
  value: number;
  unit: string;
  digits?: number;
}

export interface SceneBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface SolveResultBase {
  template: TemplateId;
  duration: number;
  bounds: SceneBounds;
  bodies: BodyTrack[];
  events: SceneEvent[];
  scalars: ScalarTile[];
  steps: SolutionStep[];
  series: Series;
}

export interface ProjectileResult extends SolveResultBase {
  template: "projectile";
  range: number;
  maxHeight: number;
  flightTime: number;
  apexTime: number;
}

export interface InclineResult extends SolveResultBase {
  template: "incline";
  a: number;
  t: number;
  vEnd: number;
  height: number;
  distance: number;
  Wg: number;
  Wf: number;
  heat: number;
  normal: number;
  reachedBottom: boolean;
}

export interface BlockBoardResult extends SolveResultBase {
  template: "blockBoard";
  t: number;
  vCommon: number;
  slip: number;
  heat: number;
  vBlockEnd: number;
  vBoardEnd: number;
  slidOff: boolean;
}

export interface CollisionResult extends SolveResultBase {
  template: "collision1d";
  tHit: number;
  v1After: number;
  v2After: number;
  momentum: number;
  keBefore: number;
  keAfter: number;
  loss: number;
  hit: boolean;
}

export type SolveResult = ProjectileResult | InclineResult | BlockBoardResult | CollisionResult;

const fmt = (x: number, digits = 2): string => Number(x.toFixed(digits)).toString();
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function objectLabel(statement: string, fallback = "物体"): string {
  return statement.match(/滑块|物块|木块|小车|木板|物资包|样本舱|小球|钢球|石块|石子|篮球|足球|铅球|球/)?.[0] ?? fallback;
}

/** 滑块—木板模型中的滑块标签：排除“木板”，避免板名被误当滑块名。 */
function slidingLabel(statement: string): string {
  return statement.match(/滑块|物块|木块|小车|小球|钢球/)?.[0] ?? "滑块";
}

function seriesOf(n: number, duration: number, at: (t: number) => { x: number; y: number; vx: number; vy: number }): Series {
  const t: number[] = [], x: number[] = [], y: number[] = [], vx: number[] = [], vy: number[] = [];
  for (let i = 0; i < n; i++) {
    const ti = duration * i / (n - 1);
    const s = at(ti);
    t.push(ti); x.push(s.x); y.push(s.y); vx.push(s.vx); vy.push(s.vy);
  }
  return { n, duration, t, x, y, vx, vy };
}

function scalar(key: string, label: string, value: number, unit: string, digits = 2): ScalarTile {
  return { key, label, value, unit, digits };
}

export function solveProjectile(params: ProjectileParams, statement = ""): ProjectileResult {
  const { v0, angleDeg, h0, g } = params;
  const rad = (angleDeg * Math.PI) / 180;
  const v0x = v0 * Math.cos(rad);
  const v0y = v0 * Math.sin(rad);

  const apexTime = v0y / g;
  const maxHeight = h0 + (v0y * v0y) / (2 * g);
  const flightTime = (v0y + Math.sqrt(v0y * v0y + 2 * g * h0)) / g;
  const range = v0x * flightTime;

  const series = seriesOf(240, flightTime, (t) => ({
    x: v0x * t,
    y: h0 + v0y * t - 0.5 * g * t * t,
    vx: v0x,
    vy: v0y - g * t,
  }));

  const steps: SolutionStep[] = [
    {
      title: "第 1 步 · 分解初速度",
      formula: `v₀ₓ = v₀·cosθ = ${fmt(v0x)} m/s，v₀ᵧ = v₀·sinθ = ${fmt(v0y)} m/s`,
      explanation: "抛体运动可分解为水平方向的匀速直线运动与竖直方向的匀变速运动。",
    },
    {
      title: "第 2 步 · 最高点",
      formula: `t₁ = v₀ᵧ/g = ${fmt(apexTime)} s，H = h₀ + v₀ᵧ²/(2g) = ${fmt(maxHeight)} m`,
      explanation: "竖直速度减为 0 时到达最高点，此后开始下落。",
    },
    {
      title: "第 3 步 · 飞行时间",
      formula: `h₀ + v₀ᵧT − gT²/2 = 0 → T = ${fmt(flightTime)} s`,
      explanation: "落地时竖直位移为 −h₀，解一元二次方程取正根。",
    },
    {
      title: "第 4 步 · 水平射程",
      formula: `X = v₀ₓ·T = ${fmt(range)} m`,
      explanation: "水平方向匀速，射程等于水平速度乘以飞行时间。",
    },
  ];

  const label = objectLabel(statement, "小球");
  const body: BodyTrack = {
    id: "primary", label, shape: /块|包|舱/.test(label) ? "box" : "ball",
    series, w: 0.5, h: 0.5,
  };

  return {
    template: "projectile",
    range, maxHeight, flightTime, apexTime,
    duration: flightTime,
    bounds: { xMin: 0, xMax: Math.max(range, maxHeight * 0.6, 4), yMin: 0, yMax: Math.max(maxHeight, 2.5) },
    bodies: [body],
    events: [
      { id: "start", title: "出发点", time: 0, condition: "初始位置与初速度" },
      ...(apexTime > 0 ? [{ id: "apex", title: "最高点", time: apexTime, condition: "竖直速度为零，加速度仍向下" }] : []),
      { id: "land", title: "落地前瞬间", time: flightTime, condition: "高度为零；未模拟碰撞过程" },
    ],
    scalars: [
      scalar("range", "射程", range, "m", 1),
      scalar("maxHeight", "最大高度", maxHeight, "m", 1),
      scalar("flightTime", "飞行时间", flightTime, "s", 2),
      scalar("apexTime", "到最高点", apexTime, "s", 2),
    ],
    steps,
    series,
  };
}

export function solveIncline(params: InclineParams, statement = ""): InclineResult {
  const { m, angleDeg, mu, L, g } = params;
  const v0 = Math.max(0, params.v0);
  const rad = angleDeg * Math.PI / 180;
  const sin = Math.sin(rad), cos = Math.cos(rad);
  const a = g * (sin - mu * cos);
  const height = L * sin;
  const decel = -a;

  let tEnd = 0, distance = 0, vEnd = v0, reachedBottom = false;
  if (a > 1e-9) {
    tEnd = (-v0 + Math.sqrt(v0 * v0 + 2 * a * L)) / a;
    distance = L;
    reachedBottom = true;
  } else if (decel > 1e-9) {
    const stopDistance = (v0 * v0) / (2 * decel);
    if (stopDistance < L - 1e-9) {
      tEnd = v0 / decel;
      distance = stopDistance;
      vEnd = 0;
    } else {
      tEnd = (v0 - Math.sqrt(Math.max(0, v0 * v0 - 2 * decel * L))) / decel;
      distance = L;
      reachedBottom = true;
    }
  } else if (v0 > 0) {
    tEnd = L / v0;
    distance = L;
    reachedBottom = true;
  }
  if (tEnd > 1e-9 && distance > 1e-9) vEnd = v0 + a * tEnd;
  vEnd = clamp(vEnd, 0, Infinity);

  const at = (t: number) => {
    const s = clamp(v0 * t + 0.5 * a * t * t, 0, distance);
    const v = Math.max(0, v0 + a * t);
    return { x: s * cos, y: height - s * sin, vx: v * cos, vy: -v * sin };
  };
  const series = seriesOf(240, tEnd, at);

  const Wg = m * g * distance * sin;
  const heat = mu * m * g * cos * distance;
  const Wf = -heat;
  const normal = m * g * cos;
  const ke = 0.5 * m * vEnd * vEnd;

  const steps: SolutionStep[] = [
    {
      title: "第 1 步 · 受力与加速度",
      formula: `a = g(sinθ − μcosθ) = ${fmt(a)} m/s²`,
      explanation: a > 0 ? "重力沿斜面的分量大于最大静摩擦力，物块加速下滑。" : "重力沿斜面的分量不足以克服摩擦，物块减速或保持静止。",
    },
    {
      title: "第 2 步 · 运动时间",
      formula: reachedBottom ? `L = v₀t + ½at² → t = ${fmt(tEnd)} s` : `v = 0 → t = ${fmt(tEnd)} s`,
      explanation: reachedBottom ? "从顶端滑到底端，位移取斜面长度 L。" : "速度减为零时停下，尚未到达底端。",
    },
    {
      title: "第 3 步 · 末速度",
      formula: `v = v₀ + at = ${fmt(vEnd)} m/s`,
      explanation: "沿斜面向下为正方向，匀变速直线运动的速度公式。",
    },
    {
      title: "第 4 步 · 功与热",
      formula: `W_G = ${fmt(Wg)} J，Q = μmgcosθ·s = ${fmt(heat)} J，E_k = ${fmt(ke)} J`,
      explanation: "重力做正功，摩擦力做负功；摩擦生热等于摩擦力大小乘以相对滑行距离。",
    },
  ];

  const label = objectLabel(statement, "物块");
  const body: BodyTrack = { id: "block", label, shape: "box", series, w: 0.7, h: 0.6 };
  const events = [
    { id: "start", title: "斜面顶端", time: 0, condition: "初速度与受力方向确定" },
    ...(tEnd > 1e-9 ? [{ id: "end", title: reachedBottom ? "到达底端" : "中途停下", time: tEnd, condition: reachedBottom ? "滑行位移达到斜面长度 L" : "速度减为零" }] : []),
  ];

  return {
    template: "incline",
    a, t: tEnd, vEnd, height, distance, Wg, Wf, heat, normal, reachedBottom,
    duration: tEnd,
    bounds: { xMin: -0.4, xMax: L * cos + 0.8, yMin: 0, yMax: height + 0.8 },
    bodies: [body],
    events,
    scalars: [
      scalar("acceleration", "加速度", a, "m/s²", 2),
      scalar("time", "滑行时间", tEnd, "s", 2),
      scalar("speed", "末速度", vEnd, "m/s", 2),
      scalar("heat", "摩擦生热", heat, "J", 1),
      scalar("workG", "重力做功", Wg, "J", 1),
    ],
    steps,
    series,
  };
}

export function solveBlockBoard(params: BlockBoardParams, statement = ""): BlockBoardResult {
  const { m, M, L, v0, mu, g } = params;
  const aBlock = -mu * g;
  const aBoard = (mu * m * g) / M;
  const relDecel = mu * g * (1 + m / M);
  const tCo = v0 / relDecel;
  const slipCo = v0 * v0 / (2 * relDecel);
  const slidOff = slipCo >= L;

  let tEnd = tCo, slip = slipCo, vBlockEnd = (m * v0) / (m + M), vBoardEnd = vBlockEnd;
  if (slidOff) {
    const disc = Math.max(0, v0 * v0 - 2 * relDecel * L);
    tEnd = (v0 - Math.sqrt(disc)) / relDecel;
    slip = L;
    vBlockEnd = v0 + aBlock * tEnd;
    vBoardEnd = aBoard * tEnd;
  }
  const vCommon = (m * v0) / (m + M);
  const heat = mu * m * g * slip;
  const keBefore = 0.5 * m * v0 * v0;
  const keAfter = 0.5 * m * vBlockEnd * vBlockEnd + 0.5 * M * vBoardEnd * vBoardEnd;

  const blockX0 = 0.5;
  const block = seriesOf(240, tEnd, (t) => ({
    x: blockX0 + v0 * t + 0.5 * aBlock * t * t,
    y: 0.2 + 0.35,
    vx: v0 + aBlock * t,
    vy: 0,
  }));
  const board = seriesOf(240, tEnd, (t) => ({
    x: L / 2 + 0.5 * aBoard * t * t,
    y: 0.1,
    vx: aBoard * t,
    vy: 0,
  }));

  const steps: SolutionStep[] = [
    {
      title: "第 1 步 · 分别受力",
      formula: `a₁ = −μg = ${fmt(aBlock)} m/s²，a₂ = μmg/M = ${fmt(aBoard)} m/s²`,
      explanation: "滑块受向左的滑动摩擦力而减速，木板受向右的摩擦力而加速。",
    },
    {
      title: "第 2 步 · 相对加速度",
      formula: `a_rel = a₁ − a₂ = −μg(1 + m/M) = ${fmt(-relDecel)} m/s²`,
      explanation: "以木板为参考系，滑块以更大的相对加速度减速。",
    },
    {
      title: slidOff ? "第 3 步 · 滑离时刻" : "第 3 步 · 共速时刻",
      formula: slidOff ? `L = v₀t − ½a_rel t² → t = ${fmt(tEnd)} s` : `t = v₀ / (μg(1 + m/M)) = ${fmt(tEnd)} s`,
      explanation: slidOff ? "相对位移达到板长时滑块从右端滑离。" : "两者速度相等后，相对静止，一起匀速运动。",
    },
    {
      title: "第 4 步 · 速度与热量",
      formula: slidOff
        ? `v₁ = ${fmt(vBlockEnd)} m/s，v₂ = ${fmt(vBoardEnd)} m/s，Q = μmgL = ${fmt(heat)} J`
        : `v_共 = mv₀/(m+M) = ${fmt(vCommon)} m/s，Δs = ${fmt(slip)} m，Q = μmgΔs = ${fmt(heat)} J`,
      explanation: "摩擦生热等于滑动摩擦力乘以相对位移，而不是任一物体的对地位移。",
    },
  ];

  const blockLabel = slidingLabel(statement);
  const bodies: BodyTrack[] = [
    { id: "block", label: blockLabel, shape: "box", series: block, w: 0.7, h: 0.7 },
    { id: "board", label: "木板", shape: "board", series: board, w: L, h: 0.2 },
  ];
  const maxBlock = Math.max(...block.x) + 0.6;
  const maxBoard = Math.max(...board.x) + L / 2 + 0.6;
  const events = [
    { id: "start", title: "开始相对滑动", time: 0, condition: "滑块以 v₀ 滑上静止木板" },
    ...(tEnd > 1e-9 ? [{ id: "end", title: slidOff ? "滑块滑离木板" : "达到共同速度", time: tEnd, condition: slidOff ? "相对位移等于板长 L" : "两者速度相等，摩擦力消失" }] : []),
  ];

  return {
    template: "blockBoard",
    t: tEnd, vCommon, slip, heat, vBlockEnd, vBoardEnd, slidOff,
    duration: tEnd,
    bounds: { xMin: -0.4, xMax: Math.max(maxBlock, maxBoard), yMin: 0, yMax: 1.5 },
    bodies,
    events,
    scalars: [
      scalar("time", slidOff ? "滑离时间" : "共速时间", tEnd, "s", 2),
      scalar("speed", slidOff ? "滑块末速度" : "共同速度", slidOff ? vBlockEnd : vCommon, "m/s", 2),
      scalar("slip", "相对位移", slip, "m", 2),
      scalar("heat", "摩擦生热", heat, "J", 1),
      scalar("ke", "末动能", keAfter, "J", 1),
    ],
    steps,
    series: block,
  };
}

export function solveCollision(params: CollisionParams, statement = ""): CollisionResult {
  const { m1, m2, v1, v2, e } = params;
  const total = m1 + m2;
  const v1After = ((m1 - e * m2) * v1 + (1 + e) * m2 * v2) / total;
  const v2After = ((m2 - e * m1) * v2 + (1 + e) * m1 * v1) / total;
  const r1 = clamp(0.32 * Math.cbrt(m1), 0.22, 0.55);
  const r2 = clamp(0.32 * Math.cbrt(m2), 0.22, 0.55);
  const gap = 4.5;
  const closing = v1 - v2;
  const hit = closing > 1e-9 && gap > r1 + r2;
  const tHit = hit ? (gap - r1 - r2) / closing : 0;
  const duration = hit ? tHit + 2 : 2;
  const x1 = (t: number) => (hit && t > tHit ? v1 * tHit + v1After * (t - tHit) : v1 * t);
  const x2 = (t: number) => (hit && t > tHit ? gap + v2 * tHit + v2After * (t - tHit) : gap + v2 * t);
  const vx1 = (t: number) => (hit && t > tHit ? v1After : v1);
  const vx2 = (t: number) => (hit && t > tHit ? v2After : v2);

  const a = seriesOf(240, duration, (t) => ({ x: x1(t), y: 0.6, vx: vx1(t), vy: 0 }));
  const b = seriesOf(240, duration, (t) => ({ x: x2(t), y: 0.6, vx: vx2(t), vy: 0 }));
  const momentum = m1 * v1 + m2 * v2;
  const keBefore = 0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2;
  const keAfter = hit ? 0.5 * m1 * v1After * v1After + 0.5 * m2 * v2After * v2After : keBefore;
  const loss = Math.max(0, keBefore - keAfter);
  const xs = [...a.x, ...b.x, 0, gap + (hit ? v2After * 2 : v2 * 2)];

  const steps: SolutionStep[] = [
    {
      title: "第 1 步 · 动量守恒",
      formula: `m₁v₁ + m₂v₂ = ${fmt(momentum)} kg·m/s`,
      explanation: "水平方向不受外力，碰撞前后系统总动量保持不变。",
    },
    {
      title: "第 2 步 · 恢复系数",
      formula: `e = (v₂′ − v₁′)/(v₁ − v₂) = ${fmt(e)}`,
      explanation: "e = 1 为完全弹性碰撞，e = 0 为完全非弹性碰撞。",
    },
    {
      title: "第 3 步 · 碰后速度",
      formula: `v₁′ = ${fmt(v1After)} m/s，v₂′ = ${fmt(v2After)} m/s`,
      explanation: "联立动量守恒与恢复系数关系，解出两个末速度。",
    },
    {
      title: "第 4 步 · 动能变化",
      formula: `ΔE_k = ${fmt(loss)} J（碰前 ${fmt(keBefore)} J → 碰后 ${fmt(keAfter)} J）`,
      explanation: "e < 1 时部分动能转化为内能；完全弹性碰撞动能守恒。",
    },
  ];

  const bodies: BodyTrack[] = [
    { id: "a", label: "A", shape: "ball", series: a, w: r1 * 2, h: r1 * 2 },
    { id: "b", label: "B", shape: "ball", series: b, w: r2 * 2, h: r2 * 2 },
  ];
  const events = [
    { id: "start", title: "碰前", time: 0, condition: "两球匀速接近" },
    ...(hit ? [{ id: "hit", title: "碰撞瞬间", time: tHit, condition: "两球接触，速度突变" }] : [{ id: "no-hit", title: "未发生碰撞", time: 0, condition: "两球没有相互接近" }]),
    { id: "after", title: "碰后", time: duration, condition: hit ? "两球各自匀速运动" : "保持原速度" },
  ];

  return {
    template: "collision1d",
    tHit, v1After, v2After, momentum, keBefore, keAfter, loss, hit,
    duration,
    bounds: { xMin: Math.min(...xs) - r1 - 0.8, xMax: Math.max(...xs) + r2 + 0.8, yMin: 0, yMax: 1.4 },
    bodies,
    events,
    scalars: [
      scalar("v1After", "A 碰后速度", v1After, "m/s", 2),
      scalar("v2After", "B 碰后速度", v2After, "m/s", 2),
      scalar("loss", "动能损失", loss, "J", 2),
      scalar("momentum", "总动量", momentum, "kg·m/s", 2),
    ],
    steps,
    series: a,
  };
}

export function solveProblem(problem: Problem): SolveResult {
  switch (problem.template) {
    case "incline": return solveIncline(problem.params as InclineParams, problem.statement);
    case "blockBoard": return solveBlockBoard(problem.params as BlockBoardParams, problem.statement);
    case "collision1d": return solveCollision(problem.params as CollisionParams, problem.statement);
    default: return solveProjectile(problem.params as ProjectileParams, problem.statement);
  }
}

export function solveParams(template: TemplateId, params: ProblemParams, statement = ""): SolveResult {
  return solveProblem({ version: 1, template, statement, params, ask: [] });
}

/** 在时间序列上按时刻线性插值取状态。 */
export function sampleAt(series: Series, time: number) {
  const { t, x, y, vx, vy, n } = series;
  const clamped = Math.max(0, Math.min(time, t[n - 1] ?? 0));
  let i = 0;
  while (i < n - 2 && t[i + 1] < clamped) i++;
  const span = t[i + 1] - t[i] || 1;
  const f = (clamped - t[i]) / span;
  const lerp = (a: number[]) => a[i] + (a[i + 1] - a[i]) * f;
  return { t: clamped, x: lerp(x), y: lerp(y), vx: lerp(vx), vy: lerp(vy) };
}