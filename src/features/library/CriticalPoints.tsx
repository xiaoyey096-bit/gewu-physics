import { Camera, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { criticalStates, motionObject } from "@/lib/motion";
import type { Problem, SolveResult } from "@/lib/types";

interface Props {
  problem: Problem;
  result: SolveResult;
  onSeek: (time: number) => void;
  onExport: (time: number, label: string) => void;
  onExportAll: () => void;
}

export function CriticalPoints({ problem, result, onSeek, onExport, onExportAll }: Props) {
  return <details className="max-h-[44dvh] shrink-0 overflow-y-auto border-t border-border bg-sky-50/20 dark:bg-sky-950/10" aria-label="题目临界状态">
    <summary className="sticky top-0 z-10 cursor-pointer border-b border-sky-200/70 bg-sky-50/95 px-3 py-2 text-xs font-semibold backdrop-blur-sm dark:border-sky-900 dark:bg-sky-950/95">对象与临界状态</summary>
    <div className="space-y-3 px-3 pb-3 pt-3">
      <p className="text-[11px] leading-5 text-muted-foreground">运动对象：{motionObject(problem).label} · {problem.template === "projectile" ? "理想抛体" : problem.template === "incline" ? "斜面滑动模型" : problem.template === "blockBoard" ? "滑块—木板模型" : "一维碰撞模型"}<br />双击状态跳转；触屏可点“定位”。仅分析当前模型{problem.template === "projectile" ? "，不含接触或碰撞" : "，数值由解析解给出"}。</p>
      <ul className="space-y-2">
        {criticalStates(problem, result).map(point => <li key={point.id} className="rounded-lg border border-sky-200/70 p-2 dark:border-sky-900">
          <button type="button" className="w-full rounded text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`临界状态 ${point.title}`} onDoubleClick={() => onSeek(point.time)} onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSeek(point.time); }
          }}>
            <span className="block font-medium">{point.title} · {point.time.toFixed(2)} s</span>
            <span className="mt-1 block text-[10px] leading-5 text-muted-foreground">{point.condition}<br />x = {point.x.toFixed(2)} m · y = {point.y.toFixed(2)} m<br />vₓ = {point.vx.toFixed(2)} m/s · vᵧ = {point.vy.toFixed(2)} m/s</span>
          </button>
          <div className="mt-1 flex gap-1">
            <Button size="xs" variant="ghost" aria-label={`定位${point.title}`} onClick={() => onSeek(point.time)}>定位</Button>
            <Button size="xs" variant="ghost" aria-label={`导出${point.title} PNG`} onClick={() => onExport(point.time, point.title)}><Camera />PNG</Button>
          </div>
        </li>)}
      </ul>
      <Button size="xs" variant="outline" className="w-full" onClick={onExportAll}><Download />导出全部临界状态</Button>
      <p className="text-[10px] text-muted-foreground">合并为一张 PNG 图版，保留当前显示选项。</p>
    </div>
  </details>;
}
