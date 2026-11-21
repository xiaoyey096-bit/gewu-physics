import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { criticalStates, motionObject, sceneTransform, stateAt, trajectoryTimeAt } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { VideoExport } from "./VideoExport";
import { Badge } from "@/components/ui/badge";
import { drawScene } from "@/lib/renderer";
import { FALLBACK_PALETTE, readPalette } from "@/lib/palette";
import { downloadDataUrl } from "@/lib/image";
import { phaseIndexAt } from "@/lib/explain";
import { kindLabel } from "@/lib/text";
import type { Palette } from "@/lib/renderer";
import type { Phase, Problem, ProjectileParams, SolveResult, StageApi, StageOptions } from "@/lib/types";
import { useReducedMotion } from "@/lib/use-media";
import { cn } from "@/lib/utils";
import { ControlDeck } from "./ControlDeck";

interface Props {
  problem: Problem;
  result: SolveResult;
  params: ProjectileParams;
  options: StageOptions;
  speed: number;
  onSpeed: (s: number) => void;
  loop: boolean;
  onLoop: (b: boolean) => void;
  phases: Phase[];
  activePhase: number;
  onPhaseChange: (index: number) => void;
  apiRef: React.MutableRefObject<StageApi | null>;
  onExportSolution: () => void;
  compact: boolean;
}

export function StageView(props: Props) {
  const {
    problem, result, params, options,
    speed, onSpeed, loop, onLoop, phases, activePhase, onPhaseChange,
    apiRef, onExportSolution, compact,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef(0);
  const rafRef = useRef(0);
  const phaseRef = useRef(-1);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [palette, setPalette] = useState<Palette>(FALLBACK_PALETTE);
  const reducedMotion = useReducedMotion();
  const duration = result.series.duration;
  const object = motionObject(problem);
  const dragRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragBranch, setDragBranch] = useState<"rise" | "fall">("rise");
  const vertical = Math.abs(Math.cos(params.angleDeg * Math.PI / 180)) < 1e-6;

  const paint = useCallback((t: number) => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (w <= 0 || h <= 0) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(ctx, w, h, { problem, result, time: t }, palette, options);
  }, [problem, result, palette, options]);

  const paintRef = useRef(paint);
  useEffect(() => {
    paintRef.current = paint;
  }, [paint]);

  // 主题切换后重新取色（data-theme 由 store 写入）
  useEffect(() => {
    const refresh = () => setPalette(readPalette());
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", refresh);
    return () => {
      observer.disconnect();
      mq.removeEventListener("change", refresh);
    };
  }, []);

  // 尺寸变化重绘
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => paintRef.current(timeRef.current));
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // 数据变化：归零并同步绘制首帧
  useEffect(() => {
    timeRef.current = 0;
    phaseRef.current = 0;
    setTime(0);
    paintRef.current(0);
    onPhaseChange(0);
    setPlaying(!reducedMotion && result.series.duration > 0);
  }, [result, reducedMotion, onPhaseChange]);

  useEffect(() => {
    paintRef.current(timeRef.current);
  }, [paint]);

  const reportPhase = useCallback((t: number) => {
    const idx = phaseIndexAt(phases, t);
    if (idx !== phaseRef.current) {
      phaseRef.current = idx;
      onPhaseChange(idx);
    }
  }, [phases, onPhaseChange]);

  // 播放循环
  useEffect(() => {
    if (!playing) return;
    let last = 0;
    const tick = (ts: number) => {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
      last = ts;
      let t = timeRef.current + dt * speed;
      if (t >= duration) {
        if (loop && duration > 0) {
          t = t % duration;
        } else {
          timeRef.current = duration;
          setTime(duration);
          paintRef.current(duration);
          reportPhase(duration);
          setPlaying(false);
          return;
        }
      }
      timeRef.current = t;
      setTime(t);
      paintRef.current(t);
      reportPhase(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed, loop, duration, reportPhase]);

  const seek = useCallback((t: number) => {
    const clamped = Math.max(0, Math.min(t, duration));
    timeRef.current = clamped;
    setTime(clamped);
    paintRef.current(clamped);
    reportPhase(clamped);
  }, [duration, reportPhase]);

  const play = useCallback(() => {
    if (duration <= 0) return;
    if (timeRef.current >= duration - 1e-6) {
      timeRef.current = 0;
      setTime(0);
    }
    setPlaying(true);
  }, [duration]);

  const pause = useCallback(() => setPlaying(false), []);

  const replay = useCallback(() => {
    timeRef.current = 0;
    setTime(0);
    paintRef.current(0);
    reportPhase(0);
    if (duration > 0) setPlaying(true);
  }, [duration, reportPhase]);

  const snapshot = useCallback((t: number, width: number, height: number, scale = 1) => {
    const out = document.createElement("canvas");
    out.width = width; out.height = height;
    const ctx = out.getContext("2d")!;
    ctx.scale(scale, scale);
    drawScene(ctx, width / scale, height / scale, { problem, result, time: Math.max(0, Math.min(t, duration)) }, palette, options);
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width / scale, height / scale);
    return out;
  }, [problem, result, duration, palette, options]);
  const exportPng = useCallback((t = timeRef.current, label = "当前状态") => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap || !wrap.clientWidth) return;
    const out = snapshot(t, canvas.width, canvas.height, canvas.width / wrap.clientWidth);
    downloadDataUrl(out.toDataURL("image/png"), `格物-${kindLabel(params)}-${label}-${t.toFixed(2)}s-${Date.now()}.png`);
  }, [snapshot, params]);
  const exportCritical = useCallback(() => {
    const points = criticalStates(problem, result);
    const out = document.createElement("canvas");
    out.width = 1920; out.height = Math.ceil(points.length / 2) * 600;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, out.width, out.height);
    points.forEach((point, i) => {
      const x = (i % 2) * 960, y = Math.floor(i / 2) * 600;
      ctx.fillStyle = palette.fg; ctx.font = "20px sans-serif";
      ctx.fillText(`${object.label} · ${point.title} · t = ${point.time.toFixed(2)} s`, x + 24, y + 34);
      ctx.drawImage(snapshot(point.time, 960, 540), x, y + 50);
    });
    downloadDataUrl(out.toDataURL("image/png"), `格物-全部临界状态-${Date.now()}.png`);
  }, [problem, result, palette, object.label, snapshot]);

  useEffect(() => {
    apiRef.current = { seek, play, pause, replay, exportPng, exportCritical };
    return () => { apiRef.current = null; };
  }, [apiRef, seek, play, pause, replay, exportPng, exportCritical]);

  const pointerPosition = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
  };
  const beginDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || duration <= 0 || dragRef.current !== null) return;
    const p = pointerPosition(event), view = sceneTransform(p.width, p.height, result), point = stateAt(params, timeRef.current);
    if (Math.hypot(p.x - view.X(point.x), p.y - view.Y(point.y)) > 26) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    pause(); cancelAnimationFrame(rafRef.current);
    dragRef.current = event.pointerId; setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current !== event.pointerId) return;
    event.preventDefault();
    const p = pointerPosition(event);
    seek(trajectoryTimeAt(problem, result, p.width, p.height, p.x, p.y, timeRef.current, vertical ? dragBranch : undefined));
  };
  const endDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current !== event.pointerId) return;
    dragRef.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const playPause = () => {
    if (playing) pause();
    else play();
  };

  return (
    <div className="flex h-auto min-w-0 flex-col gap-2">
      <div
        ref={wrapRef}
        className={cn(
          "relative flex-none overflow-hidden rounded-xl border border-border",
          compact ? "h-[38vh] min-h-[220px]" : "h-[360px] xl:h-[400px]",
        )}
        style={{ background: "var(--site-surface)" }}
      >
        <canvas
          ref={canvasRef}
          className={cn("absolute inset-0 h-full w-full touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400", dragging ? "cursor-grabbing" : "cursor-grab")}
          role="img"
          tabIndex={0}
          aria-label={`抛体运动动画：拖动${object.label}沿轨迹定位；方向键微调，Home 回起点，End 到落地`}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
            event.preventDefault(); pause();
            seek(event.key === "Home" ? 0 : event.key === "End" ? duration : timeRef.current + (["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1) * duration / 100);
          }}
        />
        <div className="pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-1">
          <Badge variant="secondary" className="px-2 text-[10px]">{kindLabel(params)} · 解析解</Badge>
          <span className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {playing ? "播放中" : time >= duration && duration > 0 ? "已结束" : "已暂停"} · {speed}×
          </span>
        </div>
        <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap items-center gap-2 rounded-lg bg-background/70 px-2 py-1 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><i className="size-2 rounded-full" style={{ background: "var(--gw-vx)" }} />水平 v₀ₓ</span>
          <span className="flex items-center gap-1"><i className="size-2 rounded-full" style={{ background: "var(--gw-vy)" }} />竖直 vᵧ</span>
          <span className="flex items-center gap-1"><i className="size-2 rounded-full" style={{ background: "var(--gw-v)" }} />合速度 v</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>运动对象：{object.label} · 拖住对象沿轨迹定位，松手保持暂停。</span>
        {vertical && <div className="flex gap-1" role="group" aria-label="竖直运动拖动分支">
          <Button size="xs" variant={dragBranch === "rise" ? "secondary" : "outline"} aria-pressed={dragBranch === "rise"} onClick={() => setDragBranch("rise")}>上升段拖动</Button>
          <Button size="xs" variant={dragBranch === "fall" ? "secondary" : "outline"} aria-pressed={dragBranch === "fall"} onClick={() => setDragBranch("fall")}>下落段拖动</Button>
          <span>同一高度有两个时刻，请先选分支。</span>
        </div>}
      </div>
      <ControlDeck
        time={time}
        duration={duration}
        playing={playing}
        onPlayPause={playPause}
        onReplay={replay}
        onScrub={(t) => { pause(); seek(t); }}
        speed={speed}
        onSpeed={onSpeed}
        loop={loop}
        onLoop={onLoop}
        phases={phases}
        activePhase={activePhase}
        onSeekPhase={(i) => { pause(); seek(phases[i].seek); }}
        onExportPng={() => exportPng()}
        onExportSolution={onExportSolution}
        videoExport={<VideoExport problem={problem} result={result} palette={palette} options={options} speed={speed} />}
      />
    </div>
  );
}