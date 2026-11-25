import { useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { criticalStates, forcesByBody } from "@/lib/motion";
import type { Problem, SolveResult } from "@/lib/types";

interface Props {
  problem: Problem;
  result: SolveResult;
  onSeek: (time: number) => void;
  onExport: (time: number, label: string) => void;
  onExportAll: () => void;
}

function newton(value: number): string {
  return `${Number(value.toFixed(Math.abs(value) >= 100 ? 0 : 2))} N`;
}

/** 与运动方向相反的力在括号里带负号，学生一眼看出它拖慢物体。 */
function signed(force: { magnitude: number; trend: string }): string {
  return `${force.trend.includes("与运动反向") ? "−" : ""}${newton(force.magnitude)}`;
}

export function CriticalPoints({ problem, result, onSeek, onExport, onExportAll }: Props) {
  const [showValues, setShowValues] = useState(false);
  const points = criticalStates(problem, result);
  const objects = result.bodies.map((body) => body.label);
  return (
    <div className="flex flex-col gap-3 p-4" aria-label="题目临界状态">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">对象与受力状态</h2>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            运动对象：{objects.length ? objects.join("和") : "质点"}
            {result.bodies.length > 1 ? `，速度分别记作 ${result.bodies.map((body) => body.velocitySymbol).join("、")}` : ""}
          </p>
        </div>
        <Toggle
          variant="outline"
          size="sm"
          className="h-7 shrink-0 px-2 text-[11px] data-[state=on]:border-muted-foreground/50 data-[state=on]:bg-muted data-[state=on]:text-foreground"
          pressed={showValues}
          onPressedChange={setShowValues}
          aria-label="显示受力大小"
          title="在力符号后显示大小；与运动方向相反的力带负号"
        >
          受力大小
        </Toggle>
      </div>

      <ul className="flex flex-col gap-2">
        {points.map((point) => {
          const groups = forcesByBody(result, point.forces, point.time);
          return (
            <li key={point.id} className="rounded-xl border border-border p-3">
              <button
                type="button"
                className="w-full rounded text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`临界状态 ${point.title}`}
                onClick={() => onSeek(point.time)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSeek(point.time);
                  }
                }}
              >
                <span className="block font-medium">
                  {point.title} · t = {point.time.toFixed(2)} s
                </span>
                <span className="mt-1 block text-xs leading-6 text-muted-foreground">{point.condition}</span>
              </button>

              {point.phase && point.phase.to > point.phase.from && (
                <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
                  这一状态从 {point.phase.from.toFixed(2)} s 持续到 {point.phase.to.toFixed(2)} s
                </p>
              )}

              {groups.length > 0 && (
                <div className="mt-1.5 flex flex-col gap-0.5">
                  {groups.map((group) => (
                    <p key={group.id} className="text-xs leading-6">
                      <span className="font-medium">{group.label}：</span>
                      {group.list.map((force, index) => (
                        <span key={force.id}>
                          {index > 0 && "、"}
                          <span className="font-mono" title={force.formula}>{force.symbol}</span>
                          {showValues && <span className="text-muted-foreground">（{signed(force)}）</span>}
                        </span>
                      ))}
                    </p>
                  ))}
                </div>
              )}

              <div className="mt-2 flex gap-1">
                <Button size="xs" variant="ghost" aria-label={`定位${point.title}`} onClick={() => onSeek(point.time)}>
                  定位
                </Button>
                <Button size="xs" variant="ghost" aria-label={`导出${point.title} PNG`} onClick={() => onExport(point.time, point.title)}>
                  <Camera />
                  PNG
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Button size="xs" variant="outline" className="w-full" onClick={onExportAll}>
        <Camera />
        导出全部临界状态
      </Button>
      <p className="text-xs leading-6 text-muted-foreground">合并为一张 PNG 图版。</p>
    </div>
  );
}