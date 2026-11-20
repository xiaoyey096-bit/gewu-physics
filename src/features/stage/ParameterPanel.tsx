import { RotateCcw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { G_PRESETS, type ParamNote, type ProjectileParams, type StageOptions } from "@/lib/types";

export interface ParameterPanelProps {
  params: ProjectileParams;
  baseParams: ProjectileParams;
  onParams: (p: ProjectileParams) => void;
  options: StageOptions;
  onOptions: (patch: Partial<StageOptions>) => void;
  notes: ParamNote[];
  onRandom: () => void;
}

const PARAM_SLIDERS: {
  key: keyof ProjectileParams;
  symbol: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "v0", symbol: "v₀", label: "初速度", unit: "m/s", min: 0.5, max: 200, step: 0.5 },
  { key: "angleDeg", symbol: "θ", label: "抛射角", unit: "°", min: 0, max: 90, step: 1 },
  { key: "h0", symbol: "h₀", label: "初始高度", unit: "m", min: 0, max: 200, step: 0.5 },
  { key: "g", symbol: "g", label: "重力加速度", unit: "m/s²", min: 1, max: 20, step: 0.1 },
];

const DISPLAY_TOGGLES: { key: keyof StageOptions; label: string; hint: string }[] = [
  { key: "vectors", label: "速度矢量", hint: "显示水平/竖直/合速度三个箭头" },
  { key: "energy", label: "能量", hint: "动能与势能实时条，验证机械能守恒" },
  { key: "trail", label: "残影", hint: "最近时刻的小球虚像" },
  { key: "strobe", label: "频闪", hint: "等时间间隔采样点，验证水平匀速" },
  { key: "grid", label: "网格", hint: "坐标网格与刻度" },
  { key: "markers", label: "关键点", hint: "最高点与落点标注" },
  { key: "glow", label: "发光", hint: "轨迹与小球的光晕" },
];

export function ParameterPanel({ params, baseParams, onParams, options, onOptions, notes, onRandom }: ParameterPanelProps) {
  const set = (patch: Partial<ProjectileParams>) => onParams({ ...params, ...patch });

  return (
    <section className="flex min-w-0 flex-col gap-4 p-5" aria-label="参数讲解与调整">
      <div className="space-y-2"><h2 className="text-sm font-semibold">动画参数</h2><p className="text-[11px] leading-5 text-muted-foreground">改变一个条件，看看运动会怎样。</p></div>
      <div className="flex flex-col divide-y divide-border">
        {PARAM_SLIDERS.map(({ key, symbol, label, unit, min, max, step }) => {
          const note = notes.find((n) => n.key === key);
          const value = params[key];
          return (
            <section key={key} className="flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0" aria-label={`${label} ${symbol}`}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span>{label} <span className="font-mono">{symbol}</span></span>
                <span className="shrink-0 font-mono tabular-nums">
                  {Number(value.toFixed(2))} <span className="text-muted-foreground">{unit}</span>
                </span>
              </div>
              {note?.meaning && <p className="text-[11px] leading-relaxed text-muted-foreground">{note.meaning}</p>}
              <div className="flex min-w-0 items-center gap-2">
                <Slider
                  value={[value]}
                  min={min}
                  max={max}
                  step={step}
                  onValueChange={(v) => set({ [key]: key === "g" ? Number(v[0].toFixed(1)) : v[0] })}
                  aria-label={`${label} ${symbol}`}
                  className="min-w-0 flex-1 [&_[data-slot=slider-range]]:bg-foreground/70 [&_[data-slot=slider-thumb]]:border-muted-foreground"
                />
                {key === "g" && (
                  <Select value={String(params.g)} onValueChange={(v) => set({ g: Number(v) })}>
                    <SelectTrigger size="sm" className="h-7 w-[104px] shrink-0 text-[11px]" aria-label="重力加速度预设">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {G_PRESETS.map((p) => (
                        <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
                      ))}
                      {!G_PRESETS.some((p) => Math.abs(p.value - params.g) < 1e-6) && (
                        <SelectItem value={String(params.g)}>自定义 {Number(params.g.toFixed(1))}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {note && (note.effect || note.current) && (
                <details className="text-[11px] leading-relaxed text-muted-foreground">
                  <summary className="cursor-pointer rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${label} ${symbol} 更多讲解`}>
                    更多讲解
                  </summary>
                  <div className="mt-1.5 space-y-1.5 break-words">
                    {note.effect && <p><span className="font-medium text-foreground">调整影响：</span>{note.effect}</p>}
                    {note.current && <p><span className="font-medium text-foreground">当前参数：</span>{note.current}</p>}
                  </div>
                </details>
              )}
            </section>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="xs"
          onClick={() => onParams(baseParams)}
          disabled={JSON.stringify(params) === JSON.stringify(baseParams)}
          title="回到识别/输入时的参数"
        >
          <RotateCcw /> 重置参数
        </Button>
        <Button variant="outline" size="xs" onClick={onRandom}>
          <Shuffle /> 随机一题
        </Button>
      </div>
      <div className="space-y-2 border-t border-border pt-3" role="group" aria-label="动画显示选项">
        <h4 className="text-[11px] font-medium text-muted-foreground">显示选项</h4>
        <div className="flex flex-wrap gap-1.5">
          {DISPLAY_TOGGLES.map((t) => (
            <Toggle
              key={t.key}
              variant="outline"
              size="sm"
              title={t.hint}
              aria-label={t.label}
              className="h-7 gap-1 px-2 text-[11px] data-[state=on]:border-muted-foreground/50 data-[state=on]:bg-muted data-[state=on]:text-foreground"
              pressed={options[t.key]}
              onPressedChange={(v) => onOptions({ [t.key]: v })}
            >
              {t.label}
            </Toggle>
          ))}
        </div>
      </div>
    </section>
  );
}
