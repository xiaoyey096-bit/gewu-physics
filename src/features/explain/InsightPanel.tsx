import { useId, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Copy, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/image";
import { buildDetailedSolution, buildExamSolution } from "@/lib/explain";
import type { Problem, SolveResult } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  problem: Problem;
  result: SolveResult;
  onExportSolution: () => void;
}

export function InsightPanel({ problem, result, onExportSolution }: Props) {
  const [solutionOpen, setSolutionOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const solutionId = useId();
  const detailId = useId();
  const solution = buildExamSolution(problem, result);
  const details = buildDetailedSolution(problem, result);
  const blockClassName = "whitespace-pre-wrap break-words rounded-xl border border-border/70 bg-secondary/40 p-4 font-mono text-[13px] leading-[2]";

  const copy = async (text: string, label: string) => {
    const ok = await copyText(text);
    toast[ok ? "success" : "error"](ok ? `${label}已复制到剪贴板` : "复制失败，请改用导出");
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-label="简要题解">
        <button type="button" className="flex w-full items-center gap-3 p-5 text-left" aria-expanded={solutionOpen} aria-controls={solutionId} onClick={() => setSolutionOpen(!solutionOpen)}>
          <span className="font-mono text-xs text-muted-foreground">02</span>
          <h2 className="text-sm font-semibold">题解</h2>
          <span className="hidden text-xs text-muted-foreground sm:inline">标准答题过程</span>
          <ChevronDown className={cn("ml-auto size-4 transition-transform", solutionOpen && "rotate-180")} />
        </button>
        <div id={solutionId} hidden={!solutionOpen} className="border-t border-border p-5">
          <pre className={blockClassName}>{solution}</pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="xs" onClick={() => copy(solution, "题解")}><Copy /> 复制题解</Button>
            <Button variant="ghost" size="xs" onClick={onExportSolution}><FileText /> 导出 Markdown</Button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-label="详细讲解">
        <button type="button" className="flex w-full items-center gap-3 p-5 text-left" aria-expanded={detailOpen} aria-controls={detailId} onClick={() => setDetailOpen(!detailOpen)}>
          <span className="font-mono text-xs text-muted-foreground">03</span>
          <h2 className="text-sm font-semibold">详解</h2>
          <span className="text-xs text-muted-foreground">两种完整解法 · 展开查看</span>
          <ChevronDown className={cn("ml-auto size-4 transition-transform", detailOpen && "rotate-180")} />
        </button>
        <div id={detailId} hidden={!detailOpen} className="border-t border-border p-5">
          <pre className={blockClassName}>{details}</pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="xs" onClick={() => copy(details, "详解")}><Copy /> 复制详解</Button>
          </div>
        </div>
      </section>
    </div>
  );
}
