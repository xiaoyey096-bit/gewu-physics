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
  /** 速度符号，用于力标签括号，如 v、v₁、v₂。 */
  velocitySymbol: string;
}

/** 一个力矢量：方向为世界坐标单位向量，大小为牛顿。 */
export interface ForceVector {
  /** 跨阶段稳定 id，用于判断“新出现的力”。 */
  id: string;
  /** 箭头标签：G、N、f、F 等。 */
  symbol: string;
  /** 中文名：重力、支持力、滑动摩擦力…… */
  name: string;
  /** 受力物体 id。 */
  body: string;
  dx: number;
  dy: number;
  /** 力的大小（N）。 */
  magnitude: number;
  /** 计算式，如 “μmg = 4 N”。 */
  formula: string;
}

/** 受力阶段：[from, to) 内各物体的受力情况。 */
export interface ForcePhase {
  id: string;
  title: string;
  from: number;
  to: number;
  condition: string;
  /** 相对上一阶段新出现（或性质改变）的力 id，渲染时用鲜艳色标注。 */
  added: string[];
  forces: ForceVector[];
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
  /** 按时间划分的受力阶段，临界状态即阶段边界。 */
  forcePhases: ForcePhase[];
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
const EPS = 1e-9;

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

function force(id: string, symbol: string, name: string, body: string, dx: number, dy: number, magnitude: number, formula: string): ForceVector {
  return { id, symbol, name, body, dx, dy, magnitude, formula };
}

/** 竖直向下的重力；magnitude 传 0 表示题中未给质量，只画方向。 */
function weight(body: string, mass: number, g: number, symbol = "G"): ForceVector {
  const n = mass * g;
  return force(`${body}-G`, symbol, "重力", body, 0, -1, n, n > 0 ? `${symbol} = mg = ${fmt(n)} N` : `${symbol} = mg，方向竖直向下`);
}

function support(body: string, symbol: string, name: string, dx: number, dy: number, magnitude: number, formula: string): ForceVector {
  return force(`${body}-N`, symbol, name, body, dx, dy, magnitude, formula);
}

/** 相对上一阶段新出现（或性质、方向改变）的力 id，渲染与临界状态列表用鲜艳色标注。 */
function phase(id: string, title: string, from: number, to: number, condition: string, previous: ForceVector[], forces: ForceVector[]): ForcePhase {
  const before = new Set(previous.map((item) => item.id));
  return { id, title, from, to, condition, added: forces.filter((item) => !before.has(item.id)).map((item) => item.id), forces };
}

/** pos + vel·t + ½acc·t² = target 的最小正根；永远到不了则 Infinity。 */
function timeToReach(pos: number, vel: number, acc: number, target: number): number {
  const d = target - pos;
  if (Math.abs(d) < 1e-9) return Infinity;
  if (Math.abs(acc) < 1e-9) return Math.sign(vel) === Math.sign(d) ? Math.abs(d / vel) : Infinity;
  const disc = vel * vel - 2 * acc * d;
  if (disc < 0) return Infinity;
  const roots = [(-vel + Math.sqrt(disc)) / acc, (-vel - Math.sqrt(disc)) / acc];
  const positive = roots.filter((r) => r > 1e-7);
  return positive.length ? Math.min(...positive) : Infinity;
}

/** 速度变号（回到零）所需时间；不会过零则 Infinity。 */
function zeroCrossTime(v: number, a: number): number {
  return Math.abs(v) > 1e-7 && v * a < -EPS ? -v / a : Infinity;
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
    series, w: 0.5, h: 0.5, velocitySymbol: "v",
  };
  const gravity = weight("primary", 0, 0);

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
    forcePhases: [
      phase("flight", "空中飞行", 0, flightTime, "离开手后只受重力（忽略空气阻力），加速度恒为 g 向下", [], [gravity]),
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

  // 中途停下或根本不动时，补一段静止阶段：滑动摩擦力消失、静摩擦力出现。
  const stuck = !reachedBottom && mu * cos >= sin - 1e-9;
  const restTail = stuck ? (v0 > 1e-9 ? 1.8 : 2.4) : 0;
  const duration = tEnd + restTail;

  const at = (t: number) => {
    const s = clamp(v0 * t + 0.5 * a * t * t, 0, distance);
    const v = Math.max(0, v0 + a * t);
    return { x: s * cos, y: height - s * sin, vx: v * cos, vy: -v * sin };
  };
  const series = seriesOf(240, duration, at);

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
  const body: BodyTrack = { id: "block", label, shape: "box", series, w: 0.7, h: 0.6, velocitySymbol: "v" };
  const vertical = [weight("block", m, g), support("block", "N", "支持力", sin, cos, normal, `N = mgcosθ = ${fmt(normal)} N`)];
  const slideForces: ForceVector[] = [...vertical];
  if (mu > EPS && (v0 > EPS || Math.abs(a) > EPS)) {
    slideForces.push(force("block-f", "f", "滑动摩擦力", "block", -cos, sin, mu * m * g * cos, `f = μmgcosθ = ${fmt(mu * m * g * cos)} N`));
  }
  const restForces: ForceVector[] = [...vertical];
  const hold = m * g * sin;
  if (stuck) restForces.push(force("block-fs", "f静", "静摩擦力", "block", -cos, sin, hold, `f静 = mgsinθ = ${fmt(hold)} N ≤ μmgcosθ`));

  const phases: ForcePhase[] = [];
  if (tEnd > 1e-9) phases.push(phase("slide", "沿斜面滑行", 0, tEnd, "重力、支持力与沿斜面向上的滑动摩擦力共存，合力沿斜面产生加速度", [], slideForces));
  if (restTail > 0) phases.push(phase("rest", stuck ? "静止在斜面上" : "停在斜面上", tEnd, duration, v0 > 1e-9 ? "速度减为零后摩擦力由滑动摩擦变为静摩擦，大小恰等于 mgsinθ" : "重力沿斜面分量 mgsinθ 不超过最大静摩擦力，物块始终静止", phases[phases.length - 1]?.forces ?? [], restForces));
  if (phases.length === 0) phases.push(phase("hold", "静止在斜面上", 0, Math.max(duration, 2.4), "重力沿斜面分量不超过最大静摩擦力，物块不下滑", [], restForces.length ? restForces : slideForces));

  const events = [
    { id: "start", title: "斜面顶端", time: 0, condition: "初速度与受力方向确定" },
    ...(tEnd > 1e-9 ? [{ id: "end", title: reachedBottom ? "到达底端" : "中途停下", time: tEnd, condition: reachedBottom ? "滑行位移达到斜面长度 L" : "速度减为零，摩擦力性质改变" }] : []),
    ...(stuck && v0 <= 1e-9 ? [{ id: "hold", title: "保持静止", time: 0, condition: "mgsinθ ≤ μmgcosθ，静摩擦足以平衡下滑分量" }] : []),
  ];

  return {
    template: "incline",
    a, t: tEnd, vEnd, height, distance, Wg, Wf, heat, normal, reachedBottom,
    duration: Math.max(duration, phases[phases.length - 1].to),
    bounds: { xMin: -0.4, xMax: L * cos + 0.8, yMin: 0, yMax: height + 0.8 },
    bodies: [body],
    events,
    forcePhases: phases,
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

interface BbSegment {
  from: number;
  to: number;
  kind: "slide" | "together" | "uniform" | "rest";
  x1: number; v1: number;
  x2: number; v2: number;
  a1: number; a2: number;
  /** 滑块相对木板的滑动方向：+1 向右（朝木板右端），-1 向左。 */
  dir: number;
  /** 地面对木板的摩擦力（含符号，N）。 */
  groundF: number;
  groundStatic: boolean;
  /** 共速后两物体之间的静摩擦力大小（N）。 */
  staticF: number;
}

/** 滑块—木板：分段解析。地面摩擦足以锁住木板时木板不动，否则木板先被摩擦力带动。 */
export function solveBlockBoard(params: BlockBoardParams, statement = ""): BlockBoardResult {
  const { m, M, L, v0, mu, g } = params;
  const muGround = Math.max(0, params.muGround ?? 0);
  const blockX0 = 0.5;
  const fSlide = mu * m * g;
  const fGroundMax = muGround * (m + M) * g;
  const smooth = fGroundMax <= 1e-9;

  const segments: BbSegment[] = [];
  let t = 0, x1 = blockX0, v1 = Math.max(0, v0), x2 = L / 2, v2 = 0;
  let slidOff = false, tEvent = 0, slipAtEvent = 0, vEventBlock = Math.max(0, v0), vEventBoard = 0;
  let slipTotal = 0, pendingDir = 0;

  const relDisp = () => (x1 - blockX0) - (x2 - L / 2);

  const push = (kind: BbSegment["kind"], dt: number, a1: number, a2: number, dir: number, groundF: number, groundStatic: boolean, staticF: number) => {
    if (dt <= EPS) return;
    segments.push({ from: t, to: t + dt, kind, x1, v1, x2, v2, a1, a2, dir, groundF, groundStatic, staticF });
    x1 += v1 * dt + 0.5 * a1 * dt * dt;
    v1 += a1 * dt;
    x2 += v2 * dt + 0.5 * a2 * dt * dt;
    v2 += a2 * dt;
    if (kind === "together" || kind === "uniform" || kind === "rest") { v1 = v2; }
    if (kind === "rest") { v1 = 0; v2 = 0; }
    t += dt;
  };

  for (let guard = 0; guard < 12 && t < 60; guard++) {
    const relSpeed = v1 - v2;
    const rel = relDisp();
    if (Math.abs(relSpeed) > 1e-7 || pendingDir !== 0) {
      const dir = Math.abs(relSpeed) > 1e-7 ? Math.sign(relSpeed) : pendingDir;
      pendingDir = 0;
      const drive = dir * fSlide;
      const a1 = -drive / m;
      let a2 = 0, groundF = 0, groundStatic = false;
      if (Math.abs(v2) < 1e-7 && Math.abs(drive) <= fGroundMax + 1e-7) {
        groundStatic = true;
        groundF = -drive;
      } else {
        const moving = Math.abs(v2) > 1e-7 ? Math.sign(v2) : Math.sign(drive);
        groundF = -moving * fGroundMax;
        a2 = (drive + groundF) / M;
      }
      const limit = dir > 0 ? L : -0.4;
      const tRel = Math.abs(a1 - a2) > EPS ? (v2 - v1) / (a1 - a2) : Infinity;
      const tOff = timeToReach(rel, relSpeed, a1 - a2, limit);
      const tStop1 = zeroCrossTime(v1, a1);
      const tStop2 = zeroCrossTime(v2, a2);
      const dt = Math.min(tRel, tOff, tStop1, tStop2, 60 - t);
      if (!(dt > EPS)) break;
      const offFirst = tOff <= dt + EPS && tOff <= tRel && tOff <= tStop1 && tOff <= tStop2;
      slipTotal += Math.abs(relSpeed * dt + 0.5 * (a1 - a2) * dt * dt);
      const commonFirst = !offFirst && dt === tRel;
      push("slide", dt, a1, a2, dir, groundF, groundStatic, 0);
      if (!tEvent && (offFirst || commonFirst)) { tEvent = t; vEventBlock = v1; vEventBoard = v2; slipAtEvent = relDisp(); }
      if (offFirst) { slidOff = true; slipAtEvent = dir > 0 ? L : 0; break; }
      if (commonFirst) { const vc = (v1 + v2) / 2; v1 = vc; v2 = vc; }
      continue;
    }

    // 相对静止：一起匀速、一起减速（静摩擦）或停下。
    if (Math.abs(v1) < 1e-7 && Math.abs(v2) < 1e-7) {
      push("rest", Math.min(1.8, 60 - t), 0, 0, 0, 0, false, 0);
      break;
    }
    if (smooth) {
      push("uniform", Math.min(2.4, 60 - t), 0, 0, 0, 0, false, 0);
      break;
    }
    const aCom = -Math.sign(v1) * fGroundMax / (m + M);
    const needed = m * Math.abs(aCom);
    if (needed <= fSlide + 1e-7) {
      const dt = Math.min(Math.abs(v1 / aCom), 60 - t);
      slipTotal += 0;
      push("together", dt, aCom, aCom, 0, -Math.sign(v1) * fGroundMax, false, needed);
      continue;
    }
    // 静摩擦不足以维持共速：滑块相对木板再次向前滑。
    pendingDir = Math.sign(v1) || 1;
  }

  const duration = segments.length ? segments[segments.length - 1].to : 0;
  const sample = (time: number) => {
    const seg = segments.find((s) => time <= s.to + 1e-9) ?? segments[segments.length - 1];
    if (!seg) return { x1: blockX0, v1: 0, x2: L / 2, v2: 0 };
    const dt = clamp(time - seg.from, 0, seg.to - seg.from);
    return {
      x1: seg.x1 + seg.v1 * dt + 0.5 * seg.a1 * dt * dt,
      v1: seg.v1 + seg.a1 * dt,
      x2: seg.x2 + seg.v2 * dt + 0.5 * seg.a2 * dt * dt,
      v2: seg.v2 + seg.a2 * dt,
    };
  };
  const block = seriesOf(240, duration, (time) => {
    const s = sample(time);
    return { x: s.x1, y: 0.55, vx: s.v1, vy: 0 };
  });
  const board = seriesOf(240, duration, (time) => {
    const s = sample(time);
    return { x: s.x2, y: 0.1, vx: s.v2, vy: 0 };
  });

  const vCommon = vEventBlock;
  const slip = clamp(slipAtEvent, 0, L);
  const heat = fSlide * slipTotal;
  const keAfter = 0.5 * m * vEventBlock * vEventBlock + 0.5 * M * vEventBoard * vEventBoard;

  const steps: SolutionStep[] = [
    {
      title: "第 1 步 · 分别受力",
      formula: `a₁ = −μg = ${fmt(-mu * g)} m/s²，木板驱动力 f = μmg = ${fmt(fSlide)} N`,
      explanation: smooth
        ? "地面光滑，木板一受到滑块的摩擦力就立刻加速，起点即为木板速度出现的临界点。"
        : fSlide <= fGroundMax
          ? `滑块给木板的摩擦力 μmg = ${fmt(fSlide)} N 不超过地面对木板的最大静摩擦力 ${fmt(fGroundMax)} N，木板保持静止。`
          : `滑块给木板的摩擦力 μmg = ${fmt(fSlide)} N 大于地面最大静摩擦力 ${fmt(fGroundMax)} N，木板从 t = 0 起被带动。`,
    },
    {
      title: "第 2 步 · 相对加速度",
      formula: `a_rel = a₁ − a₂ = ${fmt(segments.length ? segments[0].a1 - segments[0].a2 : 0)} m/s²`,
      explanation: "以木板为参考系，滑块按相对加速度减速；相对位移即两物体滑过的距离差。",
    },
    {
      title: slidOff ? "第 3 步 · 滑离时刻" : "第 3 步 · 共速时刻",
      formula: slidOff
        ? `Δs = L → t = ${fmt(tEvent)} s`
        : `v₁ = v₂ → t = ${fmt(tEvent)} s，v = ${fmt(vCommon)} m/s`,
      explanation: slidOff ? "相对位移达到板长时滑块从右端滑离。" : "两者速度相等后相对静止，摩擦力性质随即改变。",
    },
    {
      title: "第 4 步 · 速度与热量",
      formula: smooth
        ? `v_共 = mv₀/(m+M) = ${fmt(vCommon)} m/s，Δs = ${fmt(slip)} m，Q = μmgΔs = ${fmt(heat)} J`
        : `v_共 = ${fmt(vCommon)} m/s（含地面摩擦），Δs = ${fmt(slip)} m，Q = μmgΔs = ${fmt(heat)} J`,
      explanation: "摩擦生热等于滑动摩擦力乘以相对位移，而不是任一物体的对地位移。",
    },
  ];

  const blockLabel = slidingLabel(statement);
  const bodies: BodyTrack[] = [
    { id: "block", label: blockLabel, shape: "box", series: block, w: 0.7, h: 0.7, velocitySymbol: "v₁" },
    { id: "board", label: "木板", shape: "board", series: board, w: L, h: 0.2, velocitySymbol: "v₂" },
  ];

  const phases: ForcePhase[] = [];
  const blockWeight = weight("block", m, g);
  const blockNormal = support("block", "N₁", "木板对滑块的支持力", 0, 1, m * g, `N₁ = mg = ${fmt(m * g)} N`);
  const boardWeight = weight("board", M, g, "G");
  const press = force("board-press", "F₁′", "滑块对木板的压力", "board", 0, -1, m * g, `F₁′ = mg = ${fmt(m * g)} N`);
  const boardNormal = support("board", "N₂", "地面对木板的支持力", 0, 1, (m + M) * g, `N₂ = (m+M)g = ${fmt((m + M) * g)} N`);
  segments.forEach((seg, index) => {
    const list: ForceVector[] = [];
    if (seg.kind === "slide") {
      list.push(blockWeight, blockNormal);
      list.push(force(`block-f${seg.dir > 0 ? "" : "-back"}`, "f", "滑块受的滑动摩擦力", "block", -seg.dir, 0, fSlide, `f = μmg = ${fmt(fSlide)} N，与相对运动方向相反`));
      list.push(boardWeight, press, boardNormal);
      list.push(force(`board-f${seg.dir > 0 ? "" : "-back"}`, "f′", "滑块对木板的摩擦力", "board", seg.dir, 0, fSlide, `f′ = μmg = ${fmt(fSlide)} N，是木板前进的驱动力`));
      if (seg.groundStatic) {
        list.push(force("board-fg-static", "f地", "地面对木板的静摩擦力", "board", -Math.sign(seg.groundF) || -1, 0, Math.abs(seg.groundF), `f地 = f′ = ${fmt(Math.abs(seg.groundF))} N ≤ μ′(m+M)g`));
      } else if (Math.abs(seg.groundF) > EPS) {
        list.push(force("board-fg", "f地", "地面对木板的滑动摩擦力", "board", -Math.sign(seg.groundF) || -1, 0, Math.abs(seg.groundF), `f地 = μ′(m+M)g = ${fmt(Math.abs(seg.groundF))} N`));
      }
    } else if (seg.kind === "together") {
      list.push(blockWeight, blockNormal);
      list.push(force("block-fs", "f静", "木板对滑块的静摩擦力", "block", Math.sign(seg.a1) || -1, 0, seg.staticF, `f静 = ma = ${fmt(seg.staticF)} N ≤ μmg`));
      list.push(boardWeight, press, boardNormal);
      list.push(force("board-fs", "f静′", "滑块对木板的静摩擦力", "board", -Math.sign(seg.a1) || 1, 0, seg.staticF, `f静′ = f静 = ${fmt(seg.staticF)} N`));
      list.push(force("board-fg", "f地", "地面对木板的滑动摩擦力", "board", -Math.sign(seg.v1) || -1, 0, fGroundMax, `f地 = μ′(m+M)g = ${fmt(fGroundMax)} N`));
    } else {
      list.push(blockWeight, blockNormal, boardWeight, press, boardNormal);
    }
    const condition = seg.kind === "slide"
      ? (seg.groundStatic
        ? `滑块在木板上滑动；μmg = ${fmt(fSlide)} N 不足以克服地面最大静摩擦力 ${fmt(fGroundMax)} N，木板静止`
        : `滑块在木板上滑动，木板受摩擦力 f′ = ${fmt(fSlide)} N 与地面摩擦 ${fmt(Math.abs(seg.groundF))} N`)
      : seg.kind === "uniform"
        ? "两者共速，地面光滑，摩擦力消失，一起匀速运动"
        : seg.kind === "together"
          ? `两者共速后一起减速，静摩擦力 f静 = ${fmt(seg.staticF)} N 提供滑块所需的减速度`
          : "两者都停下，水平方向不再受摩擦力";
    const previous = phases[phases.length - 1]?.forces ?? [];
    phases.push(phase(`p${index}`, phaseTitle(seg, index), seg.from, seg.to, condition, previous, list));
  });
  if (!phases.length) {
    phases.push(phase("p0", "静止在原处", 0, Math.max(duration, 2), "滑块与木板间没有相对运动趋势，水平方向不受摩擦力", [], [blockWeight, blockNormal, boardWeight, press, boardNormal]));
  }

  const mainEvent: SceneEvent[] = [];
  if (tEvent > EPS) {
    const stopped = Math.abs(vEventBlock) < 1e-6 && Math.abs(vEventBoard) < 1e-6;
    mainEvent.push({
      id: "end",
      title: slidOff ? "滑块滑离木板" : stopped ? "滑块停在木板上" : "达到共同速度",
      time: tEvent,
      condition: slidOff
        ? "相对位移等于板长 L"
        : stopped
          ? "滑块速度减为零，木板始终未被带动，两者之间的摩擦力随即消失"
          : "两者速度相等，滑动摩擦力随即消失或变为静摩擦力",
    });
  }
  const slow = segments.find((s) => s.kind === "rest" && s.from > tEvent + 1e-6);
  if (slow) mainEvent.push({ id: "stop", title: "两者停下", time: slow.from, condition: "地面摩擦力把共同速度减到零，摩擦力同时消失" });

  const events = [
    { id: "start", title: "开始相对滑动", time: 0, condition: "滑块以 v₀ 滑上静止木板" },
    ...mainEvent,
  ];

  const maxBlock = Math.max(...block.x) + 0.6;
  const maxBoard = Math.max(...board.x) + L / 2 + 0.6;

  return {
    template: "blockBoard",
    t: tEvent, vCommon, slip, heat, vBlockEnd: vEventBlock, vBoardEnd: vEventBoard, slidOff,
    duration,
    bounds: { xMin: -0.4, xMax: Math.max(maxBlock, maxBoard, L + 1.5), yMin: 0, yMax: 1.5 },
    bodies,
    events,
    forcePhases: phases,
    scalars: [
      scalar("time", slidOff ? "滑离时间" : "共速时间", tEvent, "s", 2),
      scalar("speed", slidOff ? "滑块末速度" : "共同速度", slidOff ? vEventBlock : vCommon, "m/s", 2),
      scalar("slip", "相对位移", slip, "m", 2),
      scalar("heat", "摩擦生热", heat, "J", 1),
      scalar("ke", "末动能", keAfter, "J", 1),
    ],
    steps,
    series: block,
  };
}

function phaseTitle(seg: BbSegment, index: number): string {
  if (seg.kind === "slide") return index === 0 ? "滑块在木板上滑动" : "继续相对滑动";
  if (seg.kind === "uniform") return "共速后一起匀速";
  if (seg.kind === "together") return "共速后一起减速";
  return "都停下后";
}

export function solveCollision(params: CollisionParams, statement = ""): CollisionResult {
  const { m1, m2, v1, v2, e } = params;
  const total = m1 + m2;
  const g = 9.8;
  const v1After = ((m1 - e * m2) * v1 + (1 + e) * m2 * v2) / total;
  const v2After = ((m2 - e * m1) * v2 + (1 + e) * m1 * v1) / total;
  const r1 = clamp(0.32 * Math.cbrt(m1), 0.22, 0.55);
  const r2 = clamp(0.32 * Math.cbrt(m2), 0.22, 0.55);
  const gap = 4.5;
  const closing = v1 - v2;
  const hit = closing > 1e-9 && gap > r1 + r2;
  const tHit = hit ? (gap - r1 - r2) / closing : 0;
  const contact = hit ? clamp(tHit * 0.1, 0.06, 0.16) : 0;
  const duration = hit ? tHit + contact + 2 : 2;
  const vCommonMoment = (m1 * v1 + m2 * v2) / total;
  const x1 = (t: number) => {
    if (!hit || t <= tHit) return v1 * t;
    const atHit = v1 * tHit;
    if (t <= tHit + contact) return atHit + vCommonMoment * (t - tHit);
    return atHit + vCommonMoment * contact + v1After * (t - tHit - contact);
  };
  const x2 = (t: number) => {
    if (!hit || t <= tHit) return gap + v2 * t;
    const atHit = gap + v2 * tHit;
    if (t <= tHit + contact) return atHit + vCommonMoment * (t - tHit);
    return atHit + vCommonMoment * contact + v2After * (t - tHit - contact);
  };
  // 接触期间两球共速压缩，速度读数按恢复系数线性过渡到碰后值。
  const blend = (before: number, after: number, t: number) => {
    if (!hit || t <= tHit) return before;
    if (t >= tHit + contact) return after;
    return before + (after - before) * ((t - tHit) / contact);
  };
  const vx1 = (t: number) => blend(v1, v1After, t);
  const vx2 = (t: number) => blend(v2, v2After, t);

  const a = seriesOf(240, duration, (t) => ({ x: x1(t), y: r1, vx: vx1(t), vy: 0 }));
  const b = seriesOf(240, duration, (t) => ({ x: x2(t), y: r2, vx: vx2(t), vy: 0 }));
  const momentum = m1 * v1 + m2 * v2;
  const keBefore = 0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2;
  const keAfter = hit ? 0.5 * m1 * v1After * v1After + 0.5 * m2 * v2After * v2After : keBefore;
  const loss = Math.max(0, keBefore - keAfter);
  const xs = [...a.x, ...b.x, 0, gap + (hit ? v2After * (2 + contact) : v2 * duration)];

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
    { id: "a", label: "A", shape: "ball", series: a, w: r1 * 2, h: r1 * 2, velocitySymbol: "v₁" },
    { id: "b", label: "B", shape: "ball", series: b, w: r2 * 2, h: r2 * 2, velocitySymbol: "v₂" },
  ];

  const rest = (body: string, mass: number, symbol: string): ForceVector[] => [
    weight(body, mass, g),
    support(body, symbol, "地面支持力", 0, 1, mass * g, `${symbol} = mg = ${fmt(mass * g)} N`),
  ];
  const pre = [...rest("a", m1, "N₁"), ...rest("b", m2, "N₂")];
  const phases: ForcePhase[] = [];
  if (hit) {
    phases.push(phase("pre", "碰前匀速", 0, tHit, "水平面光滑，两球各自只受重力与支持力，动量守恒条件成立", [], pre));
    const impulse1 = m1 * (v1After - v1) / contact;
    const impulse2 = m2 * (v2After - v2) / contact;
    const during = [...pre];
    if (Math.abs(impulse1) > EPS) during.push(force("a-F", "F", "B 对 A 的弹力", "a", Math.sign(impulse1) || -1, 0, Math.abs(impulse1), `F = Δp/Δt ≈ ${fmt(Math.abs(impulse1))} N（接触时间 ${fmt(contact)} s）`));
    if (Math.abs(impulse2) > EPS) during.push(force("b-F", "F′", "A 对 B 的弹力", "b", Math.sign(impulse2) || 1, 0, Math.abs(impulse2), `F′ = Δp/Δt ≈ ${fmt(Math.abs(impulse2))} N，与 F 等大反向`));
    phases.push(phase("hit", "碰撞瞬间", tHit, tHit + contact, "两球接触，相互作用弹力远大于重力，速度在这一小段时间内连续改变", pre, during));
    phases.push(phase("after", "碰后匀速", tHit + contact, duration, "分离后弹力消失，水平方向再次不受力", during, pre));
  } else {
    phases.push(phase("free", "两球不相碰", 0, duration, "两球没有相互接近，水平方向始终不受力，保持原速度", [], pre));
  }

  const events = [
    { id: "start", title: "碰前", time: 0, condition: "两球匀速接近" },
    ...(hit ? [{ id: "hit", title: "碰撞瞬间", time: tHit, condition: "两球接触，弹力出现，速度突变" }] : [{ id: "no-hit", title: "未发生碰撞", time: 0, condition: "两球没有相互接近" }]),
    ...(hit ? [{ id: "leave", title: "两球分离", time: tHit + contact, condition: "弹力消失，碰后各自匀速" }] : []),
    { id: "after", title: "碰后", time: duration, condition: hit ? "两球各自匀速运动" : "保持原速度" },
  ];

  return {
    template: "collision1d",
    tHit, v1After, v2After, momentum, keBefore, keAfter, loss, hit,
    duration,
    bounds: { xMin: Math.min(...xs) - r1 - 0.8, xMax: Math.max(...xs) + r2 + 0.8, yMin: 0, yMax: Math.max(r1, r2) + 0.9 },
    bodies,
    events,
    forcePhases: phases,
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

/** 当前时刻所处的受力阶段；阶段边界上的点取后一阶段。 */
export function forcePhaseAt(result: SolveResult, time: number): ForcePhase | null {
  const phases = result.forcePhases ?? [];
  if (!phases.length) return null;
  const clamped = clamp(time, 0, result.duration);
  return phases.find((p) => clamped >= p.from - 1e-9 && clamped < p.to - 1e-9) ?? phases[phases.length - 1];
}
