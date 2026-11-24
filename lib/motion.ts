import type { Problem, ProblemParams, ProjectileParams, SolveResult } from "./types";
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

export function criticalStates(problem: Problem, result: SolveResult) {
  // 抛体保留解析解取值，避免时间序列插值放大能量误差。
  if (problem.template === "projectile" && result.template === "projectile") {
    const params = problem.params as ProjectileParams;
    return projectilePoints(problem, result).map((point) => ({ ...point, ...stateAt(params, point.time) }));
  }
  const points = result.events
    .filter((event, index, list) => list.findIndex((e) => Math.abs(e.time - event.time) < 1e-9) === index)
    .map((event) => ({ id: event.id, title: event.title, time: event.time, condition: event.condition }));
  return points.map(point => ({ ...point, ...sampleAt(result.series, point.time) }));
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
  const worldH = Math.max(result.bounds.yMax - yMin, 2.5);
  const padBottom = width < 560 ? 76 : 58;
  const availW = width - 48 - 26, availH = height - 34 - padBottom;
  const scale = Math.min(availW / worldW, availH / worldH);
  const ox = 48 + Math.max(0, (availW - worldW * scale) / 2), oy = height - padBottom;
  return {
    worldW, worldH, availW, availH, scale, ox, oy, xMin, yMin,
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