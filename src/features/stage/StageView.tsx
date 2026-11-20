import { useCallback, useEffect, useRef, useState } from "react";
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

  const exportPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    downloadDataUrl(out.toDataURL("image/png"), `格物-${kindLabel(params)}-${Date.now()}.png`);
  }, [palette.bg, params]);

  useEffect(() => {
    apiRef.current = { seek, play, pause, replay, exportPng };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, seek, play, pause, replay, exportPng]);

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
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label="抛体运动动画：小球沿解析解轨迹运动，显示速度矢量分解、频闪点与关键点标注"
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

      <ControlDeck
        time={time}
        duration={duration}
        playing={playing}
        onPlayPause={playPause}
        onReplay={replay}
        onScrub={seek}
        speed={speed}
        onSpeed={onSpeed}
        loop={loop}
        onLoop={onLoop}
        phases={phases}
        activePhase={activePhase}
        onSeekPhase={(i) => { seek(phases[i].seek); }}
        onExportPng={exportPng}
        onExportSolution={onExportSolution}
      />
    </div>
  );
}