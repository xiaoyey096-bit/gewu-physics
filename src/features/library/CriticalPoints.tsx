import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { criticalStates, forcesByBody, phaseChanges } from "@/lib/motion";
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
  const objects = result.bodies.map((body) => body.label);
  return (
    <div className="flex flex-col gap-3 p-4" aria-label="题目临界状态">
      <div>
        <h2 className="text-sm font-semibold">对象与受力状态</h2>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          运动对象：{objects.length ? objects.join("和") : "质点"}
          {result.bodies.length > 1 ? `，速度分别记作 ${result.bodies.map((body) => body.velocitySymbol).join("、")}` : ""} · {model}
          <br />下面按时间顺序列出每一个运动状态：这段时间谁在动、每个对象各受哪些力、和上一阶段比多了哪个力或少了哪个力。
          「定位」只把画面停在该时刻并显示速度方向；画布上画不画受力箭头由「受力分析」开关决定，这里列出的力值不受影响。
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {points.map((point) => {
          const groups = forcesByBody(result, point.forces, point.time);
          const changes = phaseChanges(result, point.newForces, point.goneForces);
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

              {changes.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 rounded-lg bg-muted/40 p-2">
                  {changes.map((line) => (
                    <li key={line} className="text-xs leading-6">{line}</li>
                  ))}
                </ul>
              )}

              {groups.length > 0 && (
                <div className="mt-2 flex flex-col gap-2">
                  {groups.map((group) => (
                    <div key={group.id}>
                      <p className="text-xs leading-6 font-medium">{group.label}受到的力</p>
                      <ul className="mt-0.5 flex flex-col gap-1">
                        {group.list.map((force) => (
                          <li key={force.id} className="flex items-baseline gap-1.5 text-xs leading-6">
                            <span className="shrink-0 font-mono">{force.symbol}</span>
                            <span className="min-w-0" title={force.formula}>
                              {force.name} = {newton(force.magnitude)}
                              {force.trend ? `，${force.trend}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
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
      <p className="text-xs leading-6 text-muted-foreground">合并为一张 PNG 图版，保留当前显示选项。数值由解析解给出。</p>
    </div>
  );
}
