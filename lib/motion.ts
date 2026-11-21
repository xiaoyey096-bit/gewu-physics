import type { Problem, ProjectileParams, SolveResult } from "./types";

export function motionObject(problem: Problem) {
  const label = problem.statement.match(/滑块|木块|物块|物资包|样本舱|石子|小球|小石块|石块|篮球|足球|铅球|钢球|弹丸/)?.[0]
    ?? problem.statement.match(/(?<![地月星])球/)?.[0] ?? "物体";
  return { label, shape: /块|包|舱/.test(label) ? "box" as const : "ball" as const };
}

export function stateAt(params: ProjectileParams, time: number) {
  const angle = params.angleDeg * Math.PI / 180;
  const vx = params.v0 * Math.cos(angle), vy0 = params.v0 * Math.sin(angle);
  return { time, x: vx * time, y: Math.max(0, params.h0 + vy0 * time - params.g * time * time / 2), vx, vy: vy0 - params.g * time };
}

export function criticalStates(problem: Problem, result: SolveResult) {
  const points = [
    { id: "start", title: "出发点", time: 0, condition: "初始位置与初速度" },
    { id: "apex", title: "最高点", time: result.apexTime, condition: "竖直速度为零，加速度仍向下" },
    ...(problem.params.h0 > 0 && result.apexTime > 0 ? [{ id: "return", title: "回到出发高度", time: 2 * result.apexTime, condition: "下降时再次到达初始高度" }] : []),
    { id: "land", title: "落地前瞬间", time: result.flightTime, condition: "高度为零；未模拟碰撞过程" },
  ];
  return points.map(point => ({ ...point, ...stateAt(problem.params, point.time) }));
}

export type CriticalState = ReturnType<typeof criticalStates>[number];

export function sceneTransform(width: number, height: number, result: SolveResult) {
  const worldW = Math.max(result.range, result.maxHeight * 0.6, 4);
  const worldH = Math.max(result.maxHeight, 2.5);
  const padBottom = width < 560 ? 76 : 58;
  const availW = width - 48 - 26, availH = height - 34 - padBottom;
  const scale = Math.min(availW / worldW, availH / worldH);
  const ox = 48 + Math.max(0, (availW - worldW * scale) / 2), oy = height - padBottom;
  return { worldW, worldH, availW, availH, scale, ox, oy, X: (x: number) => ox + x * scale, Y: (y: number) => oy - y * scale };
}

export function trajectoryTimeAt(problem: Problem, result: SolveResult, width: number, height: number, x: number, y: number, previous: number, branch?: "rise" | "fall") {
  const view = sceneTransform(width, height, result);
  const start = branch === "fall" ? result.apexTime : 0;
  const end = branch === "rise" ? result.apexTime : result.flightTime;
  if (end <= start) return start;
  const distance = (t: number) => {
    const point = stateAt(problem.params, t);
    return (view.X(point.x) - x) ** 2 + (view.Y(point.y) - y) ** 2;
  };
  const worldX = (x - view.ox) / view.scale, worldY = (view.oy - y) / view.scale;
  const initial = stateAt(problem.params, 0);
  const a = -problem.params.g / 2, b = initial.vy, c = problem.params.h0 - worldY;
  const p3 = 2 * a * a, p2 = 3 * a * b, p1 = b * b + 2 * a * c + initial.vx ** 2, p0 = b * c - initial.vx * worldX;
  const derivative = (t: number) => ((p3 * t + p2) * t + p1) * t + p0;
  // The squared-distance derivative is cubic; bracket every root so near-vertical branches cannot be skipped.
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
