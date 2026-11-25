import type { BodyTrack, ForcePhase, ForceVector, Problem, ProblemParams, ProjectileParams, SolveResult } from "./types";
import { sampleAt } from "./physics";

export function motionObject(problem: Problem) {
  const label = problem.statement.match(/滑块|木块|物块|木板|小车|物资包|样本舱|石子|小球|小石块|石块|篮球|足球|铅球|钢球|弹丸/)?.[0]
    ?? problem.statement.match(/(?<![地月星])球/)?.[0] ?? "物体";
  return { label, shape: /块|包|舱|板|车/.test(label) ? "box" as const : "ball" as const };
}

export function stateAt(params: ProjectileParams, time: number) {
  const angle = params.angleDeg * Math.PI / 180;
  const vx = params.v0 * Math.cos(angle), vy0 = params.v0 * Math.sin(angle);
  return { time, x: vx * time, y: Math.max(0, params.h0 + vy0 * time - params.g * time * time / 2), vx, vy: vy0 - params.g * time };
}

/** 任意题型：取主对象在时刻 t 的状态。 */
export function stateOf(result: SolveResult, time: number) {
  return sampleAt(result.series, time);
}

/**
 * 某时刻所处的受力阶段，以及新出现 / 消失的力。
 * 「新出现」只认这个力在整段运动里的第一次登场：中途消失又回归的力沿用首次的常规色，
 * 否则同一个力每次回来都要变一次红，学生反而以为它是另一个力。
 */
export function forceStateOf(result: SolveResult, time: number) {
  const phases = result.forcePhases ?? [];
  if (!phases.length) return { phase: null as ForcePhase | null, newForces: [] as ForceVector[], goneForces: [] as ForceVector[], forces: [] as ForceVector[] };
  let index = phases.findIndex((p) => time >= p.from - 1e-6 && time < p.to - 1e-6);
  if (index < 0) index = time < 0 ? 0 : phases.length - 1;
  const phase = phases[index];
  const previous = phases[index - 1];
  const present = new Set(phase.forces.map((f) => f.id));
  const debut = (id: string) => phases.findIndex((p) => p.forces.some((f) => f.id === id)) === index;
  return {
    phase,
    forces: phase.forces,
    newForces: phase.forces.filter((f) => phase.added.includes(f.id) && debut(f.id)),
    goneForces: previous ? previous.forces.filter((f) => !present.has(f.id)) : [],
  };
}

/**
 * 面板按研究对象分组：高中受力分析的读法是「谁、受到什么力、多大、朝哪」。
 * 方向描述与该时刻的真实速度比较，速度为零时不硬说加速减速。
 */
export function forcesByBody(result: SolveResult, forces: ForceVector[], time: number) {
  return result.bodies
    .map((body) => {
      const s = sampleAt(body.series, time);
      const speed = Math.hypot(s.vx, s.vy);
      return {
        id: body.id,
        label: body.label,
        list: forces.filter((force) => force.body === body.id).map((force) => {
          const dot = s.vx * force.dx + s.vy * force.dy;
          const trend = speed < 1e-6 || Math.abs(dot) < 1e-6
            ? ""
            : Math.abs(dot) < 1e-3 * speed ? "垂直于运动方向" : dot > 0 ? "与运动同向，使它加速" : "与运动反向，使它减速";
          return { ...force, trend };
        }),
      };
    })
    .filter((group) => group.list.length > 0);
}

/**
 * 临界状态点：每个受力新出现的时刻、每个事件时刻都是临界点。
 */
export function criticalStates(problem: Problem, result: SolveResult) {
  const raw: { id: string; title: string; time: number; condition: string }[] = [];
  if (problem.template === "projectile" && result.template === "projectile") {
    raw.push(...projectilePoints(problem, result));
  } else {
    raw.push(...result.events.map((event) => ({ id: event.id, title: event.title, time: event.time, condition: event.condition })));
  }
  (result.forcePhases ?? []).forEach((phase) => {
    if (raw.some((point) => Math.abs(point.time - phase.from) < 1e-6)) return;
    raw.push({ id: `force-${phase.id}`, title: phase.title, time: phase.from, condition: phase.condition });
  });
  const seen = new Set<number>();
  // 抛体保留解析解取值，避免时间序列插值放大能量误差。
  const stateOfPoint = (time: number) => problem.template === "projectile" && result.template === "projectile"
    ? stateAt(problem.params as ProjectileParams, time)
    : sampleAt(result.series, time);
  return raw
    .filter((point) => {
      const key = Math.round(point.time * 1000);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.time - b.time)
    .map((point) => {
      const forces = forceStateOf(result, point.time);
      // 「新出现 / 消失」只属于受力阶段真正开始的时刻；同一阶段内的事件点（最高点、落地前）不重复标注。
      const atBoundary = !!forces.phase && Math.abs(forces.phase.from - point.time) < 5e-3;
      return {
        ...point,
        ...forces,
        newForces: atBoundary ? forces.newForces : [],
        goneForces: atBoundary ? forces.goneForces : [],
        ...stateOfPoint(point.time),
      };
    });
}

function projectilePoints(problem: Problem, result: SolveResult) {
  if (result.template !== "projectile") return [];
  const params = problem.params as ProjectileParams;
  return [
    { id: "start", title: "出发点", time: 0, condition: "初始位置与初速度" },
    { id: "apex", title: "最高点", time: result.apexTime, condition: "竖直速度为零，加速度仍向下" },
    ...(params.h0 > 0 && result.apexTime > 0 ? [{ id: "return", title: "回到出发高度", time: 2 * result.apexTime, condition: "下降时再次到达初始高度" }] : []),
    { id: "land", title: "落地前瞬间", time: result.flightTime, condition: "高度为零；未模拟碰撞过程" },
  ];
}

export type CriticalState = ReturnType<typeof criticalStates>[number];

export function sceneTransform(width: number, height: number, result: SolveResult) {
  const { xMin, yMin } = result.bounds;
  const worldW = Math.max(result.bounds.xMax - xMin, result.template === "projectile" ? 4 : 1.2);
  // 抛体的抛出点/最高点常贴着绘图区顶部，多留两成抬头空间，HUD 与最高点标注才不会压在物体上。
  const worldH = Math.max(result.bounds.yMax - yMin, 2.5) * (result.template === "projectile" ? 1.2 : 1);
  const padBottom = width < 560 ? 76 : 58;
  const availW = width - 48 - 26, availH = height - 34 - padBottom;
  const scale = Math.min(availW / worldW, availH / worldH);
  const ox = 48 + Math.max(0, (availW - worldW * scale) / 2), oy = height - padBottom;
  return {
    worldW, worldH, availW, availH, scale, ox, oy, xMin, yMin, width, height,
    X: (x: number) => ox + (x - xMin) * scale,
    Y: (y: number) => oy - (y - yMin) * scale,
  };
}

export function trajectoryTimeAt(problem: Problem, result: SolveResult, width: number, height: number, x: number, y: number, previous: number, branch?: "rise" | "fall") {
  const view = sceneTransform(width, height, result);
  if (result.template !== "projectile") {
    let best = 0, bestDistance = Infinity;
    for (let i = 0; i < result.series.n; i++) {
      const s = result.series;
      const d = (view.X(s.x[i]) - x) ** 2 + (view.Y(s.y[i]) - y) ** 2;
      if (d < bestDistance) { bestDistance = d; best = s.t[i]; }
    }
    return best;
  }
  const params = problem.params as ProjectileParams;
  const start = branch === "fall" ? result.apexTime : 0;
  const end = branch === "rise" ? result.apexTime : result.flightTime;
  if (end <= start) return start;
  const distance = (t: number) => {
    const point = stateAt(params, t);
    return (view.X(point.x) - x) ** 2 + (view.Y(point.y) - y) ** 2;
  };
  const worldX = (x - view.ox) / view.scale + view.xMin, worldY = (view.oy - y) / view.scale + view.yMin;
  const initial = stateAt(params, 0);
  const a = -params.g / 2, b = initial.vy, c = params.h0 - worldY;
  const p3 = 2 * a * a, p2 = 3 * a * b, p1 = b * b + 2 * a * c + initial.vx ** 2, p0 = b * c - initial.vx * worldX;
  const derivative = (t: number) => ((p3 * t + p2) * t + p1) * t + p0;
  const discriminant = 4 * p2 * p2 - 12 * p3 * p1;
  const turns = discriminant > 0 ? [(-2 * p2 - Math.sqrt(discriminant)) / (6 * p3), (-2 * p2 + Math.sqrt(discriminant)) / (6 * p3)] : [];
  const bounds = [start, ...turns.filter(t => t > start && t < end), end].sort((a, b) => a - b);
  const candidates = [...bounds];
  for (let i = 1; i < bounds.length; i++) {
    let lo = bounds[i - 1], hi = bounds[i];
    const left = derivative(lo), right = derivative(hi);
    if (left === 0 || right === 0 || Math.sign(left) === Math.sign(right)) continue;
    for (let j = 0; j < 48; j++) {
      const mid = (lo + hi) / 2;
      if (Math.sign(derivative(mid)) === Math.sign(left)) lo = mid;
      else hi = mid;
    }
    candidates.push((lo + hi) / 2);
  }
  return candidates.reduce((a, b) => {
    const difference = distance(a) - distance(b);
    return Math.abs(difference) <= 1e-10 ? (Math.abs(a - previous) <= Math.abs(b - previous) ? a : b) : difference < 0 ? a : b;
  });
}

export function paramsOf(problem: Problem): ProblemParams {
  return problem.params;
}