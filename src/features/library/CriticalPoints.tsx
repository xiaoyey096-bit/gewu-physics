import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { criticalStates, forceLabel } from "@/lib/motion";
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

export function CriticalPoints({ problem, result, onSeek, onExport, onExportAll }: Props) {
  const points = criticalStates(problem, result);
  const model = problem.template === "projectile" ? "理想抛体" : problem.template === "incline" ? "斜面滑动模型" : problem.template === "blockBoard" ? "滑块—木板模型" : "一维碰撞模型";
  return (
    <div className="flex flex-col gap-3 p-4" aria-label="题目临界状态">
      <div>
        <h2 className="text-sm font-semibold">对象与临界状态</h2>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          运动对象：{result.bodies.map((body) => `${body.label}（${body.velocitySymbol}）`).join("、") || "质点"} · {model}
          <br />凡有新受力出现的时刻都列为临界状态点，「定位」后画布即显示此刻受力；只有整段运动中第一次登场的力用红色标出，消失后又回来的力保持墨色。
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {points.map((point) => (
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

            {point.forces.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 rounded-lg bg-muted/40 p-2">
                {point.forces.map((force) => {
                  const fresh = point.newForces.some((item) => item.id === force.id);
                  return (
                    <li key={force.id} className="flex items-baseline gap-1.5 text-xs leading-6">
                      <span className={`shrink-0 font-mono ${fresh ? "font-bold text-fresh" : "text-foreground"}`}>{forceLabel(force, result, point.time)}</span>
                      <span className="truncate text-muted-foreground" title={force.formula}>
                        {force.name}
                        {force.magnitude > 0 ? ` = ${newton(force.magnitude)}` : ""}
                      </span>
                      {fresh && <span className="shrink-0 text-fresh">新</span>}
                    </li>
                  );
                })}
                {point.goneForces.length > 0 && (
                  <li className="text-xs leading-6 text-muted-foreground">本阶段消失：{point.goneForces.map((force) => force.symbol).join("、")}</li>
                )}
              </ul>
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
        ))}
      </ul>

      <Button size="xs" variant="outline" className="w-full" onClick={onExportAll}>
        <Camera />
        导出全部临界状态
      </Button>
      <p className="text-xs leading-6 text-muted-foreground">合并为一张 PNG 图版，保留当前显示选项。数值由解析解给出。</p>
    </div>
  );
}
