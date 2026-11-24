import { useId, useState } from "react";
import { RotateCcw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { G_PRESETS, type ParamNote, type ProblemParams, type StageOptions, type TemplateId } from "@/lib/types";
import { TEMPLATES, templateMeta, type ParamConfig } from "@/lib/templates";

export interface ParameterPanelProps {
  template: TemplateId;
  params: ProblemParams;
  baseParams: ProblemParams;
  onTemplate: (template: TemplateId) => void;
  onParams: (p: ProblemParams, immediate?: boolean) => void;
  options: StageOptions;
  onOptions: (patch: Partial<StageOptions>) => void;
  notes: ParamNote[];
  onRandom: () => void;
}

function valueOf(params: ProblemParams, key: string): number {
  return (params as unknown as Record<string, number>)[key] ?? 0;
}

function ParameterValueInput({ config, params, onCommit }: {
  config: ParamConfig;
  params: ProblemParams;
  onCommit: (value: number) => void;
}) {
  const { key, label, symbol, unit, min, max } = config;
  const value = valueOf(params, key);
  const errorId = useId();
  const [draft, setDraft] = useState({ source: params, text: String(value) });

  // External parameter changes win immediately, even before a blur can commit an old draft.
  if (draft.source !== params) {
    setDraft({ source: params, text: String(value) });
  }
  const text = draft.source === params ? draft.text : String(value);
  const number = Number(text);
  const invalid = text.trim() === "" || !Number.isFinite(number) || number < min || number > max;

  const commit = () => {
    if (draft.source !== params || invalid) return;
    setDraft({ source: params, text: String(number) });
    if (number !== value) onCommit(number);
  };

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2 text-xs">
        <span>{label} <span className="font-mono">{symbol}</span></span>
        <div className="flex min-w-0 max-w-full items-baseline gap-1 font-mono tabular-nums">
          <input
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step="any"
            value={text}
            aria-label={`自定义${label} ${symbol}`}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            title={`输入 ${min}–${max} ${unit}，按 Enter 或离开输入框确认，按 Escape 撤销`}
            onChange={(event) => setDraft({ source: params, text: event.currentTarget.value })}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setDraft({ source: params, text: String(value) });
              }
            }}
            className={`h-7 w-24 min-w-0 rounded-md border px-2 text-right text-xs text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${invalid ? "border-red-400 bg-red-50 focus-visible:ring-red-400" : "border-sky-200 bg-sky-50 focus-visible:ring-sky-400"}`}
          />
          <span className="shrink-0 text-muted-foreground">{unit}</span>
        </div>
      </div>
      {invalid && (
        <p id={errorId} role="status" className="text-[11px] leading-relaxed text-red-600">
          请输入 {min}–{max} {unit} 范围内的有效数字（可含小数）。当前输入未应用；按 Escape 恢复。
        </p>
      )}
    </>
  );
}

const DISPLAY_TOGGLES: { key: keyof StageOptions; label: string; hint: string }[] = [
  { key: "vectors", label: "速度矢量", hint: "显示水平/竖直/合速度三个箭头" },
  { key: "energy", label: "能量", hint: "动能与势能实时条，验证机械能守恒" },
  { key: "trail", label: "残影", hint: "最近时刻的小球虚像" },
  { key: "strobe", label: "频闪", hint: "等时间间隔采样点，验证水平匀速" },
  { key: "grid", label: "网格", hint: "坐标网格与刻度" },
  { key: "markers", label: "关键点", hint: "最高点与落点标注" },
  { key: "glow", label: "发光", hint: "轨迹与小球的光晕" },
];

export function ParameterPanel({ template, params, baseParams, onTemplate, onParams, options, onOptions, notes, onRandom }: ParameterPanelProps) {
  const configs = templateMeta(template).params;
  const set = (patch: Record<string, number>, immediate = false) => onParams({ ...params, ...patch } as ProblemParams, immediate);

  return (
    <section className="flex min-w-0 flex-col gap-4 p-5" aria-label="参数讲解与调整">
      <div className="space-y-2"><h2 className="text-sm font-semibold">动画参数</h2><p className="text-[11px] leading-5 text-muted-foreground">改变一个条件，看看运动会怎样。</p></div>
      <div className="space-y-1.5">
        <span className="text-[11px] text-muted-foreground">题型模板</span>
        <Select value={template} onValueChange={(v) => onTemplate(v as TemplateId)}>
          <SelectTrigger className="h-8 w-full text-xs" aria-label="题型模板">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEMPLATES.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                <span className="flex items-center gap-2"><span>{t.label}</span><span className="text-[10px] text-muted-foreground">{t.description}</span></span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {configs.map((config) => {
          const { key, symbol, label, min, max, step } = config;
          const note = notes.find((n) => n.key === key);
          const value = valueOf(params, key);
          return (
            <section key={key} className="flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0" aria-label={`${label} ${symbol}`}>
              <ParameterValueInput config={config} params={params} onCommit={(v) => set({ [key]: v }, true)} />
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
                  <Select value={String(value)} onValueChange={(v) => set({ g: Number(v) }, true)}>
                    <SelectTrigger size="sm" className="h-7 w-[104px] shrink-0 text-[11px]" aria-label="重力加速度预设">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {G_PRESETS.map((p) => (
                        <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
                      ))}
                      {!G_PRESETS.some((p) => p.value === value) && (
                        <SelectItem value={String(value)}>自定义 {value}</SelectItem>
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
          onClick={() => onParams(baseParams, true)}
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
