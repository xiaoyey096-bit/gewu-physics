// 抛体运动求解（前端镜像，与 functions/physics.ts 同步）。
// 用途：参数滑杆变动时本地即时重算重播，无需再调用 LLM/服务端。

import type { ProjectileParams, SolveResult, SolutionStep } from "./types";

const fmt = (x: number, digits = 2): string =>
  Number(x.toFixed(digits)).toString();

export function solveProjectile(params: ProjectileParams): SolveResult {
  const { v0, angleDeg, h0, g } = params;
  const rad = (angleDeg * Math.PI) / 180;
  const v0x = v0 * Math.cos(rad);
  const v0y = v0 * Math.sin(rad);

  const apexTime = v0y / g;
  const maxHeight = h0 + (v0y * v0y) / (2 * g);
  const flightTime = (v0y + Math.sqrt(v0y * v0y + 2 * g * h0)) / g;
  const range = v0x * flightTime;

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

  const n = 240;
  const t: number[] = [], x: number[] = [], y: number[] = [], vx: number[] = [], vy: number[] = [];
  for (let i = 0; i < n; i++) {
    const ti = (flightTime * i) / (n - 1);
    t.push(ti);
    x.push(v0x * ti);
    y.push(h0 + v0y * ti - 0.5 * g * ti * ti);
    vx.push(v0x);
    vy.push(v0y - g * ti);
  }

  return {
    template: "projectile",
    range,
    maxHeight,
    flightTime,
    apexTime,
    steps,
    series: { n, duration: flightTime, t, x, y, vx, vy },
  };
}

/** 在时间序列上按时刻线性插值取状态。 */
export function sampleAt(series: SolveResult["series"], time: number) {
  const { t, x, y, vx, vy, n } = series;
  const clamped = Math.max(0, Math.min(time, t[n - 1]));
  let i = 0;
  while (i < n - 2 && t[i + 1] < clamped) i++;
  const span = t[i + 1] - t[i] || 1;
  const f = (clamped - t[i]) / span;
  const lerp = (a: number[]) => a[i] + (a[i + 1] - a[i]) * f;
  return { t: clamped, x: lerp(x), y: lerp(y), vx: lerp(vx), vy: lerp(vy) };
}