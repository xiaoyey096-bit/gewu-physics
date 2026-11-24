// Canvas 场景渲染器：把求解出的时间序列画成物理动画。
// 纯同步绘制（不依赖 rAF），首帧/隐藏标签页下也能正确出图；背景氛围由 CSS 层承担，画布保持透明。

import type { BlockBoardParams, CollisionParams, InclineParams, Problem, ProjectileParams, SolveResult, StageOptions } from "./types";
import { DEFAULT_STAGE } from "./types";
import { sampleAt } from "./physics";
import { motionObject, sceneTransform, stateAt } from "./motion";
import { drawForces, drawTemplateScene, OBJECT_R } from "./renderer-multi";

export interface Palette {
  bg: string;
  fg: string;
  muted: string;
  border: string;
  accent: string;
  surface: string;
  vx: string;
  vy: string;
  resultant: string;
  grid: string;
  info: string;
  /** 物体描边与常规受力箭头的墨色。 */
  ink: string;
  /** 物体填充色：接近不上色。 */
  body: string;
  /** 临界状态新出现的力，用鲜艳色标出。 */
  fresh: string;
}

export interface RenderState {
  problem: Problem;
  result: SolveResult;
  time: number;
}

const PAD = { left: 48, right: 26, top: 34, bottom: 58 };

function niceStep(span: number, target = 8): number {
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) {
    if (raw <= m * mag) return m * mag;
  }
  return 10 * mag;
}

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, head = 7) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;
  const ux = dx / len, uy = dy / len;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * head - uy * head * 0.5, y1 - uy * head + ux * head * 0.5);
  ctx.lineTo(x1 - ux * head + uy * head * 0.5, y1 - uy * head - ux * head * 0.5);
  ctx.closePath();
  ctx.fill();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, halo: string) {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = halo;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function pulse(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number, color: string, max = 26) {
  const r = 4 + progress * max;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 0.55 * (1 - progress));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: RenderState,
  palette: Palette,
  options: StageOptions = DEFAULT_STAGE,
): void {
  const { problem, result, time } = state;
  if (result.template !== "projectile") {
    drawTemplateScene(ctx, width, height, state, palette, options);
    return;
  }
  const { series } = result;
  const params = problem.params as ProjectileParams;
  const cur = { ...stateAt(params, time), t: time };
  const T = series.duration || 1;

  ctx.clearRect(0, 0, width, height);

  const view = sceneTransform(width, height, result);
  const { worldW, worldH, availW, availH, scale, ox, oy, X, Y } = view;
  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

  ctx.font = "11px system-ui, sans-serif";
  ctx.lineWidth = 1;

  // 坐标网格
  if (options.grid) {
    const stepX = niceStep(worldW, clamp(Math.floor((worldW * scale) / 70), 3, 10));
    const stepY = niceStep(worldH, clamp(Math.floor((worldH * scale) / 24), 2, 8));
    ctx.strokeStyle = palette.grid;
    ctx.fillStyle = palette.muted;
    ctx.textAlign = "center";
    for (let gx = 0; gx <= worldW + 1e-9; gx += stepX) {
      ctx.beginPath();
      ctx.moveTo(X(gx), PAD.top - 6);
      ctx.lineTo(X(gx), oy);
      ctx.stroke();
      ctx.fillText(`${Number(gx.toFixed(2))}`, X(gx), oy + 14);
    }
    ctx.textAlign = "right";
    for (let gy = 0; gy <= worldH + 1e-9; gy += stepY) {
      ctx.beginPath();
      ctx.moveTo(ox - 6, Y(gy));
      ctx.lineTo(width - PAD.right, Y(gy));
      ctx.stroke();
      ctx.fillText(`${Number(gy.toFixed(2))}`, ox - 10, Y(gy) + 4);
    }
    ctx.textAlign = "left";
    ctx.fillText("y / m", 8, PAD.top - 12);
  }

  // 地面 + 粉笔斜纹
  ctx.strokeStyle = palette.fg;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD.left - 12, oy);
  ctx.lineTo(width - PAD.right + 12, oy);
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = palette.muted;
  ctx.lineWidth = 1;
  for (let hx = PAD.left - 12; hx < width - PAD.right + 12; hx += 12) {
    ctx.beginPath();
    ctx.moveTo(hx, oy + 1);
    ctx.lineTo(hx - 6, oy + 8);
    ctx.stroke();
  }
  ctx.restore();

  // 发射台：只画抛出点所在的一小段台边，台面顶线在抛出点下方一个物体半径处，物体才是「放在台面上」
  const h0 = params.h0;
  if (h0 > 0.01) {
    const padTop = Y(h0) + OBJECT_R;
    const padR = X(0) + Math.max(6, 0.15 * scale);
    const padL = Math.max(6, padR - Math.max(26, 1.5 * scale));
    const padH = Math.max(5, 0.28 * scale);
    ctx.fillStyle = palette.body;
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1.8;
    ctx.fillRect(padL, padTop, padR - padL, padH);
    ctx.strokeRect(padL, padTop, padR - padL, padH);
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = palette.muted;
    ctx.lineWidth = 1;
    for (let hx = padL + 5; hx < padR + 6; hx += 9) {
      ctx.beginPath();
      ctx.moveTo(hx, padTop + padH);
      ctx.lineTo(hx - 6, padTop + padH + 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 完整轨迹（淡色虚线预览）
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = palette.muted;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  for (let i = 0; i < series.n; i++) {
    const px = X(series.x[i]), py = Y(Math.max(0, series.y[i]));
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([]);

  // 频闪点：等时间间隔采样，水平间距相等、竖直间距递增
  if (options.strobe) {
    const count = 12;
    ctx.fillStyle = palette.info;
    for (let k = 0; k <= count; k++) {
      const tk = (T * k) / count;
      if (tk > cur.t + 1e-9) break;
      const s = sampleAt(series, tk);
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(X(s.x), Y(Math.max(0, s.y)), 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // 已走过的轨迹
  ctx.save();
  if (options.glow) {
    ctx.shadowColor = palette.resultant;
    ctx.shadowBlur = 10;
  }
  ctx.strokeStyle = palette.resultant;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (let i = 0; i < series.n && series.t[i] <= cur.t; i++) {
    const px = X(series.x[i]), py = Y(Math.max(0, series.y[i]));
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.lineTo(X(cur.x), Y(Math.max(0, cur.y)));
  ctx.stroke();
  ctx.restore();

  // 残影：最近若干时刻的小球虚像
  if (options.trail && cur.t > 0) {
    const ghosts = 9;
    const gap = T / 46;
    for (let k = ghosts; k >= 1; k--) {
      const tk = cur.t - k * gap;
      if (tk < 0) continue;
      const s = sampleAt(series, tk);
      ctx.save();
      ctx.globalAlpha = 0.05 + 0.2 * (1 - k / ghosts);
      ctx.fillStyle = palette.resultant;
      ctx.beginPath();
      ctx.arc(X(s.x), Y(Math.max(0, s.y)), 6.5 * (1 - k / (ghosts + 3)), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  const bx = X(cur.x), by = Y(Math.max(0, cur.y));

  // 关键点标注与脉冲
  if (options.markers) {
    if (cur.t >= result.apexTime && result.apexTime > 0) {
      const ax = X((result.range * result.apexTime) / T);
      const ay = Y(result.maxHeight);
      ctx.strokeStyle = palette.muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax - 5, ay); ctx.lineTo(ax + 5, ay);
      ctx.moveTo(ax, ay - 5); ctx.lineTo(ax, ay + 5);
      ctx.stroke();
      ctx.textAlign = "center";
      label(ctx, `最高点 ${result.maxHeight.toFixed(2)} m`, ax, ay - 12, palette.muted, palette.bg);
      ctx.textAlign = "left";
      const d = Math.abs(cur.t - result.apexTime);
      if (d < 0.22) pulse(ctx, ax, ay, 1 - d / 0.22, palette.vy, 22);
    }
    if (cur.t >= T - 1e-6 && T > 0) {
      ctx.fillStyle = palette.resultant;
      ctx.beginPath();
      ctx.arc(X(result.range), oy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = "right";
      label(ctx, `射程 ${result.range.toFixed(2)} m`, X(result.range) - 8, oy - 26, palette.muted, palette.bg);
      ctx.textAlign = "left";
    }
    if (cur.t > T - 0.34) {
      const p = clamp((cur.t - (T - 0.34)) / 0.34, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.5 * (1 - p);
      ctx.strokeStyle = palette.resultant;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(X(result.range), oy, 6 + p * 34, (6 + p * 34) * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 尺寸标注：把轨迹上方的空白变成可读的 H / X 标尺
  if (options.markers) {
    const apexX = X((result.range * result.apexTime) / T);
    const narrowWorld = result.range * scale < 40;
    const dimX = result.apexTime > 0 ? apexX + (narrowWorld ? 34 : 0) : width - PAD.right - 10;
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = palette.muted;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.moveTo(ox - 6, Y(result.maxHeight));
    ctx.lineTo(width - PAD.right, Y(result.maxHeight));
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
    ctx.save();
    ctx.strokeStyle = palette.vy;
    ctx.fillStyle = palette.vy;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.2;
    arrow(ctx, dimX, Y(0), dimX, Y(result.maxHeight), 6);
    arrow(ctx, dimX, Y(result.maxHeight), dimX, Y(0), 6);
    ctx.restore();
    ctx.textAlign = "left";
    label(ctx, `H = ${result.maxHeight.toFixed(2)} m`, dimX + 7, (Y(0) + Y(result.maxHeight)) / 2 + 4, palette.vy, palette.bg);
    if (result.range * scale > 60) {
      const dy = oy + 30;
      ctx.save();
      ctx.strokeStyle = palette.vx;
      ctx.fillStyle = palette.vx;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.2;
      arrow(ctx, X(0), dy, X(result.range), dy, 6);
      arrow(ctx, X(result.range), dy, X(0), dy, 6);
      ctx.restore();
      ctx.textAlign = "center";
      label(ctx, `X = ${result.range.toFixed(2)} m`, (X(0) + X(result.range)) / 2, dy + 14, palette.vx, palette.bg);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = palette.muted;
    ctx.fillText("x / m", width - PAD.right, oy + 44);
    ctx.textAlign = "left";
  }

  // 出手角与初速度方向（仅在起始阶段显示，避免与瞬时矢量重叠）
  const vScale = Math.min(3.2, (Math.min(availW, availH) * 0.34) / Math.max(params.v0, 1));
  if (cur.t < T * 0.07 && params.angleDeg > 0.5) {
    const rad = (params.angleDeg * Math.PI) / 180;
    const r = Math.min(46, Math.max(24, params.v0 * vScale * 0.5));
    ctx.save();
    ctx.strokeStyle = palette.vy;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(X(0), Y(h0), r, -rad, 0);
    ctx.stroke();
    ctx.textAlign = "left";
    label(ctx, `θ = ${params.angleDeg}°`, X(0) + r * 0.72, Y(h0) - r * 0.34, palette.vy, palette.bg);
    ctx.restore();
    ctx.textAlign = "left";
  }

  // 速度矢量分解
  if (options.vectors && Math.hypot(cur.vx, cur.vy) > 0.05) {
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = palette.vx; ctx.fillStyle = palette.vx;
    arrow(ctx, bx, by, bx + cur.vx * vScale, by);
    ctx.strokeStyle = palette.vy; ctx.fillStyle = palette.vy;
    arrow(ctx, bx, by, bx, by - cur.vy * vScale);
    ctx.strokeStyle = palette.resultant; ctx.fillStyle = palette.resultant;
    ctx.lineWidth = 2.2;
    arrow(ctx, bx, by, bx + cur.vx * vScale, by - cur.vy * vScale);
    ctx.font = "10px ui-monospace, monospace";
    if (Math.abs(cur.vx * vScale) > 26) {
      label(ctx, "v₀ₓ", bx + cur.vx * vScale * 0.5, by + 13, palette.vx, palette.bg);
    }
    if (Math.abs(cur.vy * vScale) > 22) {
      label(ctx, "vᵧ", bx + 7, by - cur.vy * vScale * 0.55, palette.vy, palette.bg);
    }
    label(ctx, "v", bx + cur.vx * vScale + 6, by - cur.vy * vScale - 4, palette.resultant, palette.bg);
    ctx.font = "11px system-ui, sans-serif";
  }

  const object = motionObject(problem);
  const objectPath = () => {
    ctx.beginPath();
    if (object.shape === "box") ctx.rect(bx - 8, by - OBJECT_R, 16, OBJECT_R * 2);
    else ctx.arc(bx, by, OBJECT_R, 0, Math.PI * 2);
  };
  ctx.save();
  if (options.glow) {
    ctx.shadowColor = palette.resultant;
    ctx.shadowBlur = 14;
  }
  ctx.fillStyle = palette.body;
  objectPath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 2.2;
  objectPath();
  ctx.stroke();
  if (options.forces) drawForces(ctx, view, palette, result, time, { primary: { x: bx, y: by } });

  // HUD
  const speed = Math.hypot(cur.vx, cur.vy);
  const narrow = width < 560;
  const lines = narrow
    ? [
        `t = ${cur.t.toFixed(2)} s   x = ${cur.x.toFixed(2)} m`,
        `y = ${Math.max(0, cur.y).toFixed(2)} m   v = ${speed.toFixed(2)} m/s`,
      ]
    : [`t = ${cur.t.toFixed(2)} s   x = ${cur.x.toFixed(2)} m   y = ${Math.max(0, cur.y).toFixed(2)} m   v = ${speed.toFixed(2)} m/s`];
  // 轨迹方程与画面数值同源，提醒学生动画不是预设关键帧；放进 HUD 底色里才不会压到抛出点。
  const eq = narrow ? null : "x = v₀·cosθ·t    y = h₀ + v₀·sinθ·t − g·t²/2";
  const rowH = narrow ? 13 : 16;
  ctx.font = narrow ? "10px ui-monospace, monospace" : "12px ui-monospace, monospace";
  const hudW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  ctx.font = "10px ui-monospace, monospace";
  const boxW = Math.max(hudW, eq ? ctx.measureText(eq).width : 0) + 18;
  const boxH = (lines.length + (eq ? 1 : 0)) * rowH + 10;
  ctx.save();
  ctx.globalAlpha = 0.78;
  ctx.fillStyle = palette.surface;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(PAD.left - 8, 6, boxW, boxH, 8);
  else ctx.rect(PAD.left - 8, 6, boxW, boxH);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = palette.fg;
  ctx.font = narrow ? "10px ui-monospace, monospace" : "12px ui-monospace, monospace";
  lines.forEach((line, i) => {
    ctx.fillText(line, PAD.left + 1, 6 + (narrow ? 14 : 17) + i * rowH);
  });
  if (eq) {
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = palette.muted;
    ctx.fillText(eq, PAD.left + 1, 6 + 17 + lines.length * rowH);
  }
  ctx.font = "11px system-ui, sans-serif";

  // 能量视角：轨迹上方的空白用来实时验证机械能守恒（按单位质量计，J/kg）
  if (options.energy && width >= 340) {
    const compact = width < 640;
    const g = params.g;
    const ekx = 0.5 * cur.vx * cur.vx;
    const eky = 0.5 * cur.vy * cur.vy;
    const ep = g * Math.max(0, cur.y);
    const total = 0.5 * params.v0 * params.v0 + g * params.h0;
    const pw = compact ? 186 : 216;
    const ph = compact ? 82 : 92;
    const px = width - PAD.right - pw - 2;
    const py = PAD.top + (compact ? 26 : 30);
    const card = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
      else ctx.rect(x, y, w, h);
    };
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = palette.surface;
    card(px, py, pw, ph, 10);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    card(px, py, pw, ph, 10);
    ctx.stroke();
    ctx.restore();
    ctx.font = compact ? "9px ui-monospace, monospace" : "10px ui-monospace, monospace";
    ctx.fillStyle = palette.muted;
    ctx.fillText(compact ? "机械能守恒 · J/kg" : "机械能守恒 · 比能量 J/kg", px + 10, py + 16);
    ctx.textAlign = "right";
    ctx.fillStyle = palette.fg;
    ctx.fillText(`Σ ${total.toFixed(1)}`, px + pw - 10, py + 16);
    ctx.textAlign = "left";
    const bx0 = px + 10, by0 = py + (compact ? 22 : 24), bw = pw - 20, bh = compact ? 8 : 9;
    const denom = Math.max(total, 1e-6);
    ctx.save();
    card(bx0, by0, bw, bh, 4);
    ctx.clip();
    let sx = bx0;
    for (const [v, c] of [[ekx, palette.vx], [eky, palette.vy], [ep, palette.info]] as [number, string][]) {
      const w = (v / denom) * bw;
      ctx.fillStyle = c;
      ctx.fillRect(sx, by0, w + 0.6, bh);
      sx += w;
    }
    ctx.restore();
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx0, by0, bw, bh);
    const rows: [string, string, number][] = [
      ["水平动能 ½vₓ²", palette.vx, ekx],
      ["竖直动能 ½vᵧ²", palette.vy, eky],
      [compact ? "势能 g·y" : "重力势能 g·y", palette.info, ep],
    ];
    rows.forEach(([name, color, v], i) => {
      const ry = py + (compact ? 42 : 48) + i * (compact ? 13 : 15);
      ctx.fillStyle = color;
      ctx.fillRect(bx0, ry - (compact ? 6 : 7), compact ? 6 : 7, compact ? 6 : 7);
      ctx.fillStyle = palette.muted;
      ctx.fillText(name, bx0 + (compact ? 10 : 12), ry);
      ctx.textAlign = "right";
      ctx.fillStyle = palette.fg;
      ctx.fillText(v.toFixed(1), px + pw - 10, ry);
      ctx.textAlign = "left";
    });
    ctx.font = "11px system-ui, sans-serif";
  }
}