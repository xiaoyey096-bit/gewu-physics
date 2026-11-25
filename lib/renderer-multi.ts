// 多题型 Canvas 场景：斜面、滑块-木板、一维碰撞。
// 与抛体渲染器共用同一解析结果协议；纯同步绘制，首帧/隐藏标签页下也能出图。

import type { BlockBoardParams, CollisionParams, InclineParams, Problem, SolveResult, StageOptions } from "./types";
import type { Palette } from "./renderer";
import { DEFAULT_STAGE } from "./types";
import { sampleAt } from "./physics";
import { forceStateOf, sceneTransform } from "./motion";

type SceneView = ReturnType<typeof sceneTransform>;

const PAD = { left: 48, right: 26, top: 34, bottom: 58 };

/** 物体在画布上的竖直半径：抛体小球与方块都按 7 px 绘制，台面/地面据此对齐「放在表面上」。 */
export const OBJECT_R = 7;

export type Box = { l: number; r: number; t: number; b: number };

function textBox(x: number, y: number, w: number, align: CanvasTextAlign): Box {
  const l = align === "left" ? x : align === "right" ? x - w : x - w / 2;
  return { l, r: l + w, t: y - 8, b: y + 3 };
}

const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

/** 同一个作用点会引出多支箭头，标签先按箭头方向排，挤不下再沿箭头外移或侧移。 */
const LABEL_SPOTS: [number, number][] = [[0, 0], [11, 0], [0, -12], [0, 12], [22, 0], [11, -12], [11, 12], [22, -12], [22, 12], [0, -24], [0, 24], [33, 0], [11, -24], [11, 24]];

/** 按当前受力阶段绘制受力箭头：常规力用墨色，刚出现的力加粗并用鲜艳色。 */
export function drawForces(
  ctx: CanvasRenderingContext2D,
  view: SceneView,
  palette: Palette,
  result: SolveResult,
  time: number,
  anchors: Record<string, { x: number; y: number }>,
  obstacles: Box[] = [],
): void {
  const { phase, newForces } = forceStateOf(result, time);
  if (!phase || !phase.forces.length) return;
  const freshIds = new Set(newForces.map((f) => f.id));
  const target = Math.min(58, Math.max(30, view.scale * 0.62));
  const sizes = phase.forces.map((f) => f.magnitude).filter((m) => m > 0);
  const ref = sizes.length ? Math.max(...sizes) : 1;
  const limit = { l: 6, r: view.width - 6, t: PAD.top - 16, b: Math.min(view.height - 6, view.oy + 44) };
  const placed: Box[] = obstacles.slice();
  ctx.save();
  ctx.font = "11px ui-monospace, monospace";
  ctx.lineWidth = 2.2;
  for (const f of phase.forces) {
    const at = anchors[f.body];
    if (!at || !result.bodies.some((item) => item.id === f.body)) continue;
    // 鲜艳色只标「第一次登场」的那一小段窗口，且阶段播过去之后回落墨色；回归的力不再重新标色。
    const fresh = freshIds.has(f.id) && time - phase.from <= Math.min(0.9, (phase.to - phase.from) * 0.3);
    const color = fresh ? palette.fresh : palette.ink;
    const len = ((f.magnitude > 0 ? f.magnitude : ref) / ref) * target;
    const ux = f.dx, uy = -f.dy;
    const x1 = at.x + ux * len, y1 = at.y + uy * len;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    // 状态变化点把新出现的力加粗，让「这一步多了哪个力」一眼看到；之后只留粗细一致的正常箭头。
    ctx.lineWidth = fresh ? 3.4 : 2.2;
    arrow(ctx, at.x, at.y, x1, y1, fresh ? 9 : 7);
    ctx.restore();
    // 画布上只写受力符号（G、N₁、f′），括号里的速度读数高中生读不懂，数值留给右栏与题解。
    const text = f.symbol;
    const align: CanvasTextAlign = ux > 0.3 ? "left" : ux < -0.3 ? "right" : "center";
    const w = ctx.measureText(text).width;
    const nx = -uy, ny = ux;
    const bx = x1 + ux * 9, by = y1 + uy * 9 + 3;
    let spot = { x: bx, y: by };
    let box = textBox(spot.x, spot.y, w, align);
    // 先找既不越界也不压字的位置；都挤不下时按「越界量 ×1000 + 重叠面积」取最不难的一档。
    let best: { spot: { x: number; y: number }; box: Box; score: number } | null = null;
    for (const [along, side] of LABEL_SPOTS) {
      const x = bx + ux * along + nx * side, y = by + uy * along + ny * side;
      const candidate = textBox(x, y, w, align);
      const outside = Math.max(0, limit.l - candidate.l) + Math.max(0, candidate.r - limit.r)
        + Math.max(0, limit.t - candidate.t) + Math.max(0, candidate.b - limit.b);
      const score = outside * 1000 + placed.reduce((sum, p) => sum + overlapArea(candidate, p), 0);
      if (!score) {
        spot = { x, y };
        box = candidate;
        best = null;
        break;
      }
      if (!best || score < best.score) best = { spot: { x, y }, box: candidate, score };
    }
    if (best) {
      spot = best.spot;
      box = best.box;
    }
    placed.push(box);
    ctx.textAlign = align;
    ctx.font = fresh ? "bold 11px ui-monospace, monospace" : "11px ui-monospace, monospace";
    label(ctx, text, spot.x, spot.y, color, palette.bg);
    ctx.font = "11px ui-monospace, monospace";
  }
  ctx.restore();
  ctx.textAlign = "left";
  ctx.font = "11px system-ui, sans-serif";
  ctx.lineWidth = 1;
}

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

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function drawGround(ctx: CanvasRenderingContext2D, width: number, view: SceneView, palette: Palette) {
  const y = view.Y(0);
  ctx.strokeStyle = palette.fg;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD.left - 12, y);
  ctx.lineTo(width - PAD.right + 12, y);
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = palette.muted;
  ctx.lineWidth = 1;
  for (let hx = PAD.left - 12; hx < width - PAD.right + 12; hx += 12) {
    ctx.beginPath();
    ctx.moveTo(hx, y + 1);
    ctx.lineTo(hx - 6, y + 8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, view: SceneView, palette: Palette): Box[] {
  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  const stepX = niceStep(view.worldW, clamp(Math.floor((view.worldW * view.scale) / 70), 3, 10));
  const stepY = niceStep(view.worldH, clamp(Math.floor((view.worldH * view.scale) / 24), 2, 8));
  const boxes: Box[] = [];
  ctx.strokeStyle = palette.grid;
  ctx.fillStyle = palette.muted;
  ctx.textAlign = "center";
  const x0 = Math.ceil(view.xMin / stepX) * stepX;
  for (let gx = x0; gx <= view.xMin + view.worldW + 1e-9; gx += stepX) {
    ctx.beginPath();
    ctx.moveTo(view.X(gx), PAD.top - 6);
    ctx.lineTo(view.X(gx), view.Y(0));
    ctx.stroke();
    const text = `${Number(gx.toFixed(2))}`;
    boxes.push(textBox(view.X(gx), view.Y(0) + 14, ctx.measureText(text).width, "center"));
    ctx.fillText(text, view.X(gx), view.Y(0) + 14);
  }
  ctx.textAlign = "right";
  const y0 = Math.ceil(view.yMin / stepY) * stepY;
  for (let gy = y0; gy <= view.yMin + view.worldH + 1e-9; gy += stepY) {
    ctx.beginPath();
    ctx.moveTo(view.ox - 6, view.Y(gy));
    ctx.lineTo(view.ox + view.worldW * view.scale, view.Y(gy));
    ctx.stroke();
    const text = `${Number(gy.toFixed(2))}`;
    boxes.push(textBox(view.ox - 10, view.Y(gy) + 4, ctx.measureText(text).width, "right"));
    ctx.fillText(text, view.ox - 10, view.Y(gy) + 4);
  }
  ctx.textAlign = "left";
  ctx.fillText("y / m", 8, PAD.top - 12);
  return boxes;
}

function drawHud(ctx: CanvasRenderingContext2D, width: number, lines: string[], palette: Palette) {
  const narrow = width < 560;
  const rowH = narrow ? 15 : 18;
  ctx.font = narrow ? "11px ui-monospace, monospace" : "13px ui-monospace, monospace";
  const boxW = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 18;
  const boxH = lines.length * rowH + 10;
  ctx.save();
  ctx.globalAlpha = 0.78;
  ctx.fillStyle = palette.surface;
  panel(ctx, PAD.left - 8, 6, boxW, boxH, 8);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = palette.fg;
  lines.forEach((line, i) => ctx.fillText(line, PAD.left + 1, 6 + (narrow ? 16 : 19) + i * rowH));
  ctx.font = "11px system-ui, sans-serif";
}

function drawStatCard(ctx: CanvasRenderingContext2D, width: number, palette: Palette, title: string, rows: [string, string, string?][]) {
  const compact = width < 640;
  const rowH = compact ? 15 : 17;
  const pw = compact ? 188 : 216;
  const ph = 28 + rows.length * rowH;
  const px = width - PAD.right - pw - 2;
  const py = PAD.top + (compact ? 12 : 16);
  ctx.save();
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = palette.surface;
  panel(ctx, px, py, pw, ph, 10);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  panel(ctx, px, py, pw, ph, 10);
  ctx.stroke();
  ctx.restore();
  ctx.font = compact ? "10px ui-monospace, monospace" : "11px ui-monospace, monospace";
  ctx.fillStyle = palette.muted;
  ctx.fillText(title, px + 10, py + 16);
  rows.forEach(([name, value, color], i) => {
    const ry = py + 32 + i * rowH;
    if (color) {
      ctx.fillStyle = color;
      ctx.fillRect(px + 10, ry - 7, compact ? 7 : 8, compact ? 7 : 8);
    }
    ctx.fillStyle = palette.muted;
    ctx.fillText(name, px + (color ? 21 : 10), ry);
    ctx.textAlign = "right";
    ctx.fillStyle = palette.fg;
    ctx.fillText(value, px + pw - 10, ry);
    ctx.textAlign = "left";
  });
  ctx.font = "11px system-ui, sans-serif";
}

function bodyAt(
  ctx: CanvasRenderingContext2D,
  view: SceneView,
  body: { shape: string; w: number; h: number; series: SolveResult["series"] },
  time: number,
  palette: Palette,
  rotation = 0,
  offset: { x: number; y: number } = { x: 0, y: 0 },
) {
  const s = sampleAt(body.series, time);
  const bx = view.X(s.x + offset.x), by = view.Y(s.y + offset.y);
  const w = Math.max(4, body.w * view.scale), h = Math.max(3, body.h * view.scale);
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(rotation);
  ctx.fillStyle = palette.body;
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 2.2;
  if (body.shape === "ball") {
    ctx.beginPath();
    ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    panel(ctx, -w / 2, -h / 2, w, h, body.shape === "board" ? 3 : 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  return { x: bx, y: by, state: s };
}

function velocityArrow(ctx: CanvasRenderingContext2D, x: number, y: number, vx: number, vy: number, scale: number, color: string, text: string, halo = "#ffffff") {
  const k = Math.min(16, Math.max(6, scale * 0.16));
  const dx = vx * k, dy = -vy * k;
  const len = Math.hypot(dx, dy);
  // 真正静止才不画方向；缓慢加速的对象（如板块模型里的木板）不能因为箭头短就连读数一起藏起来。
  if (len < 0.8) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.8;
  arrow(ctx, x, y, x + dx, y + dy);
  ctx.restore();
  const ux = dx / len, uy = dy / len;
  const reach = Math.max(len, 12);
  ctx.textAlign = ux >= 0 ? "left" : "right";
  label(ctx, text, x + ux * reach + (ux >= 0 ? 5 : -5), y + uy * reach - 5, color, halo);
  ctx.textAlign = "left";
}

export function drawTemplateScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: { problem: Problem; result: SolveResult; time: number },
  palette: Palette,
  options: StageOptions = DEFAULT_STAGE,
): void {
  const { problem, result, time } = state;
  ctx.clearRect(0, 0, width, height);
  const view = sceneTransform(width, height, result);
  ctx.font = "11px system-ui, sans-serif";
  ctx.lineWidth = 1;
  // 坐标刻度文字也参与避让，受力标签才不会压到数轴数字上。
  const obstacles = options.grid ? drawGrid(ctx, view, palette) : [];
  drawGround(ctx, width, view, palette);
  if (result.template === "incline") drawInclineScene(ctx, width, problem, result, time, view, palette, options, obstacles);
  else if (result.template === "blockBoard") drawBlockBoardScene(ctx, width, problem, result, time, view, palette, options, obstacles);
  else if (result.template === "collision1d") drawCollisionScene(ctx, width, problem, result, time, view, palette, options, obstacles);
}

function drawInclineScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  problem: Problem,
  result: Extract<SolveResult, { template: "incline" }>,
  time: number,
  view: SceneView,
  palette: Palette,
  options: StageOptions,
  obstacles: Box[],
) {
  const p = problem.params as InclineParams;
  const rad = p.angleDeg * Math.PI / 180;
  const sin = Math.sin(rad), cos = Math.cos(rad);
  const H = result.height;
  const bottomX = p.L * cos;
  const top = { x: view.X(0), y: view.Y(H) };
  const bottom = { x: view.X(bottomX), y: view.Y(0) };

  ctx.save();
  ctx.fillStyle = palette.body;
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.lineTo(view.X(0), view.Y(0));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const r = Math.min(42, Math.max(22, view.scale * 0.5));
  ctx.save();
  ctx.strokeStyle = palette.vy;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(bottom.x, bottom.y, r, Math.PI, Math.PI + rad);
  ctx.stroke();
  ctx.restore();
  label(ctx, `θ = ${p.angleDeg}°`, bottom.x - r * 0.95, bottom.y - r * 0.22, palette.vy, palette.bg);

  const body = result.bodies[0];
  const s = sampleAt(result.series, time);
  const travelled = sin > 1e-6 ? Math.max(0, (H - s.y) / sin) : Math.max(0, s.x / Math.max(cos, 1e-6));

  ctx.save();
  ctx.strokeStyle = palette.resultant;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(view.X(s.x), view.Y(s.y));
  ctx.stroke();
  ctx.restore();

  const point = bodyAt(ctx, view, body, time, palette, rad, { x: (body.h / 2) * sin, y: (body.h / 2) * cos });
  if (options.markers) {
    ctx.fillStyle = palette.muted;
    ctx.beginPath();
    ctx.arc(top.x, top.y, 3, 0, Math.PI * 2);
    ctx.fill();
    const apex = `顶端 L = ${p.L.toFixed(1)} m`;
    obstacles.push(textBox(top.x + 8, top.y - 8, ctx.measureText(apex).width, "left"));
    label(ctx, apex, top.x + 8, top.y - 8, palette.muted, palette.bg);
    if (result.reachedBottom) {
      ctx.fillStyle = palette.resultant;
      ctx.beginPath();
      ctx.arc(bottom.x, bottom.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (options.vectors) {
    const v = Math.hypot(s.vx, s.vy);
    velocityArrow(ctx, point.x, point.y, s.vx, s.vy, view.scale, palette.vx, `v ${v.toFixed(2)}`, palette.bg);
  }
  if (options.forces) drawForces(ctx, view, palette, result, time, { block: { x: point.x, y: point.y } }, obstacles);

  const vNow = Math.hypot(s.vx, s.vy);
  drawHud(ctx, width, width < 560
    ? [`t = ${time.toFixed(2)} s   s = ${travelled.toFixed(2)} m`, `v = ${vNow.toFixed(2)} m/s`]
    : [`t = ${time.toFixed(2)} s   s = ${travelled.toFixed(2)} m   v = ${vNow.toFixed(2)} m/s`], palette);

  if (options.energy) {
    const ek = 0.5 * p.m * vNow * vNow;
    const ep = p.m * p.g * Math.max(0, s.y);
    const heat = result.heat * Math.min(1, travelled / Math.max(result.distance, 1e-6));
    drawStatCard(ctx, width, palette, "能量 · J", [
      ["动能 Eₖ", ek.toFixed(1), palette.vx],
      ["重力势能", ep.toFixed(1), palette.info],
      ["摩擦生热 Q", heat.toFixed(1), palette.vy],
    ]);
  }
}

function drawBlockBoardScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  problem: Problem,
  result: Extract<SolveResult, { template: "blockBoard" }>,
  time: number,
  view: SceneView,
  palette: Palette,
  options: StageOptions,
  obstacles: Box[],
) {
  const p = problem.params as BlockBoardParams;
  const block = result.bodies[0];
  const board = result.bodies[1];
  const boardPoint = bodyAt(ctx, view, board, time, palette);
  const blockPoint = bodyAt(ctx, view, block, time, palette);
  const boardState = sampleAt(board.series, time);
  const blockState = sampleAt(block.series, time);
  const slip = Math.abs(blockState.x - boardState.x - 0.5 + p.L / 2);

  if (options.markers) {
    const y = view.Y(0) + (width < 560 ? 26 : 30);
    const x0 = view.X(boardState.x - p.L / 2 + 0.5), x1 = blockPoint.x;
    if (Math.abs(x1 - x0) > 6) {
      ctx.save();
      ctx.strokeStyle = palette.info;
      ctx.fillStyle = palette.info;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.1;
      arrow(ctx, x0, y, x1, y, 5);
      arrow(ctx, x1, y, x0, y, 5);
      ctx.restore();
      ctx.textAlign = "center";
      const slipText = `Δs = ${slip.toFixed(2)} m`;
      obstacles.push(textBox((x0 + x1) / 2, y + 13, ctx.measureText(slipText).width, "center"));
      label(ctx, slipText, (x0 + x1) / 2, y + 13, palette.info, palette.bg);
      ctx.textAlign = "left";
    }
    ctx.textAlign = "center";
    const blockName = `${block.label} m = ${p.m} kg`;
    const blockNameY = blockPoint.y - block.h * view.scale;
    obstacles.push(textBox(blockPoint.x, blockNameY, ctx.measureText(blockName).width, "center"));
    label(ctx, blockName, blockPoint.x, blockNameY, palette.muted, palette.bg);
    ctx.textAlign = "left";
  }

  if (options.vectors) {
    velocityArrow(ctx, blockPoint.x, blockPoint.y, blockState.vx, 0, view.scale, palette.vx, `v₁ ${blockState.vx.toFixed(2)}`, palette.bg);
    velocityArrow(ctx, boardPoint.x, boardPoint.y - 6, boardState.vx, 0, view.scale, palette.info, `v₂ ${boardState.vx.toFixed(2)}`, palette.bg);
  }
  if (options.forces) {
    drawForces(ctx, view, palette, result, time, {
      block: { x: blockPoint.x, y: blockPoint.y },
      board: { x: boardPoint.x, y: boardPoint.y },
    }, obstacles);
  }

  drawHud(ctx, width, width < 560
    ? [`t = ${time.toFixed(2)} s`, `v块 = ${blockState.vx.toFixed(2)}  v板 = ${boardState.vx.toFixed(2)}`, `木板 M = ${p.M} kg · L = ${p.L} m`]
    : [`t = ${time.toFixed(2)} s   v块 = ${blockState.vx.toFixed(2)} m/s   v板 = ${boardState.vx.toFixed(2)} m/s`, `木板 M = ${p.M} kg · L = ${p.L} m   μ = ${p.mu}`], palette);

  if (options.energy) {
    drawStatCard(ctx, width, palette, "能量 · J", [
      ["Eₖ 滑块", (0.5 * p.m * blockState.vx ** 2).toFixed(1), palette.vx],
      ["Eₖ 木板", (0.5 * p.M * boardState.vx ** 2).toFixed(1), palette.info],
      ["摩擦生热 Q", (p.mu * p.m * p.g * slip).toFixed(1), palette.vy],
    ]);
  }
}

function drawCollisionScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  problem: Problem,
  result: Extract<SolveResult, { template: "collision1d" }>,
  time: number,
  view: SceneView,
  palette: Palette,
  options: StageOptions,
  obstacles: Box[],
) {
  const p = problem.params as CollisionParams;
  const a = result.bodies[0], b = result.bodies[1];
  const pa = bodyAt(ctx, view, a, time, palette);
  const pb = bodyAt(ctx, view, b, time, palette);
  const sa = sampleAt(a.series, time), sb = sampleAt(b.series, time);

  if (options.markers) {
    ctx.textAlign = "center";
    const names: [string, number, number][] = [
      [`A · m₁ ${p.m1} kg`, pa.x, pa.y - a.h * view.scale],
      [`B · m₂ ${p.m2} kg`, pb.x, pb.y - b.h * view.scale],
    ];
    for (const [text, x, y] of names) {
      obstacles.push(textBox(x, y, ctx.measureText(text).width, "center"));
      label(ctx, text, x, y, palette.muted, palette.bg);
    }
    ctx.textAlign = "left";
    if (result.hit && Math.abs(time - result.tHit) < 0.16) {
      const mid = (pa.x + pb.x) / 2;
      pulse(ctx, mid, pa.y, 1 - Math.abs(time - result.tHit) / 0.16, palette.vy, 30);
      label(ctx, "碰撞", mid - 12, pa.y - 28, palette.vy, palette.bg);
    }
  }

  if (options.vectors) {
    velocityArrow(ctx, pa.x, pa.y, sa.vx, 0, view.scale, palette.vx, `v₁ ${sa.vx.toFixed(2)}`, palette.bg);
    velocityArrow(ctx, pb.x, pb.y, sb.vx, 0, view.scale, palette.info, `v₂ ${sb.vx.toFixed(2)}`, palette.bg);
  }
  if (options.forces) {
    drawForces(ctx, view, palette, result, time, { a: { x: pa.x, y: pa.y }, b: { x: pb.x, y: pb.y } }, obstacles);
  }

  drawHud(ctx, width, width < 560
    ? [`t = ${time.toFixed(2)} s`, `vA ${sa.vx.toFixed(2)}  vB ${sb.vx.toFixed(2)}`]
    : [`t = ${time.toFixed(2)} s   vA = ${sa.vx.toFixed(2)} m/s   vB = ${sb.vx.toFixed(2)} m/s`], palette);

  if (options.energy) {
    const now = time >= result.tHit && result.hit;
    const eTotal = 0.5 * p.m1 * sa.vx ** 2 + 0.5 * p.m2 * sb.vx ** 2;
    drawStatCard(ctx, width, palette, `碰撞 · e = ${p.e}`, [
      ["总动量 p", `${(p.m1 * sa.vx + p.m2 * sb.vx).toFixed(2)} kg·m/s`, palette.vx],
      [now ? "碰后 Eₖ" : "碰前 Eₖ", `${eTotal.toFixed(1)} J`, palette.info],
      ["动能损失", `${Math.max(0, result.keBefore - eTotal).toFixed(1)} J`, palette.vy],
    ]);
  }
}