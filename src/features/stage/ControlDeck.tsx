import type { ReactNode } from "react";
import { Camera, FileText, Pause, Play, Repeat, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SPEEDS, type Phase } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  time: number;
  duration: number;
  playing: boolean;
  onPlayPause: () => void;
  onReplay: () => void;
  onScrub: (t: number) => void;
  speed: number;
  onSpeed: (s: number) => void;
  loop: boolean;
  onLoop: (b: boolean) => void;
  phases: Phase[];
  activePhase: number;
  onSeekPhase: (index: number) => void;
  onExportPng: () => void;
  onExportSolution: () => void;
  videoExport: ReactNode;
}

export function ControlDeck(props: Props) {
  const {
    time, duration, playing, onPlayPause, onReplay, onScrub,
    speed, onSpeed, loop, onLoop,
    phases, activePhase, onSeekPhase,
    onExportPng, onExportSolution,
  } = props;
  const atEnd = duration > 0 && time >= duration - 1e-6;

  return (
    <div className="flex min-w-0 shrink-0 flex-col gap-2 rounded-xl border border-border bg-card p-2.5" aria-label="动画控制区">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" className="min-w-[86px]" onClick={onPlayPause} disabled={duration <= 0}>
          {playing ? (<><Pause /> 暂停</>) : atEnd ? (<><Play /> 重播</>) : (<><Play /> 播放</>)}
        </Button>
        <Button size="icon-sm" variant="outline" onClick={onReplay} aria-label="从头播放" title="从头播放">
          <RotateCcw />
        </Button>
        <Toggle
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2 text-[11px] data-[state=on]:border-muted-foreground/50 data-[state=on]:bg-muted data-[state=on]:text-foreground"
          pressed={loop}
          onPressedChange={onLoop}
          aria-label="循环播放"
        >
          <Repeat /> 循环
        </Toggle>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={String(speed)}
          onValueChange={(v) => { if (v) onSpeed(Number(v)); }}
          aria-label="播放倍速"
          className="h-8"
        >
          {SPEEDS.map((s) => (
            <ToggleGroupItem
              key={s}
              value={String(s)}
              className="h-8 px-2 font-mono text-[11px] data-[state=on]:bg-muted data-[state=on]:text-foreground"
              aria-label={`${s} 倍速`}
            >
              {s}×
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex min-w-[150px] flex-1 items-center gap-2">
          <Slider
            value={[Math.min(time, duration)]}
            min={0}
            max={Math.max(duration, 0.001)}
            step={Math.max(duration, 0.001) / 240}
            onValueChange={(v) => onScrub(v[0])}
            aria-label="动画时间轴"
            className="[&_[data-slot=slider-range]]:bg-foreground/70 [&_[data-slot=slider-thumb]]:border-muted-foreground"
          />
          <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">
            {time.toFixed(2)} / {duration.toFixed(2)} s
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex basis-full flex-wrap gap-1 sm:basis-auto sm:flex-1" role="group" aria-label="动画过程阶段">
          {phases.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSeekPhase(i)}
              aria-pressed={i === activePhase}
              title={`跳到 ${p.seek.toFixed(2)} s`}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                i === activePhase
                  ? "border-muted-foreground/50 bg-muted font-medium text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="font-mono">{i + 1}</span> {p.title}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button variant="outline" size="xs" onClick={onExportPng}>
            <Camera /> 导出 PNG
          </Button>
          <Button variant="outline" size="xs" onClick={onExportSolution}>
            <FileText /> 导出题解
          </Button>
          {props.videoExport}
        </div>
      </div>
    </div>
  );
}
