import { useId, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Copy, FileText, Play, Send, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { copyText } from "@/lib/image";
import { SUGGESTED_QUESTIONS, solutionMarkdown } from "@/lib/explain";
import type { Explanation, Problem, SolveResult } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  problem: Problem;
  result: SolveResult;
  explanation: Explanation;
  activePhase: number;
  onSeekPhase: (index: number) => void;
  configured: boolean | null;
  insight?: string;
  aiBusy: boolean;
  onAsk: (question: string) => void;
  onAiExplain: () => void;
  onExportSolution: () => void;
}

export function InsightPanel({ problem, result, explanation, activePhase, onSeekPhase, configured, insight, aiBusy, onAsk, onAiExplain, onExportSolution }: Props) {
  const [question, setQuestion] = useState("");
  const [solutionOpen, setSolutionOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const solutionId = useId();
  const detailId = useId();
  const landingSpeed = Math.sqrt(problem.params.v0 ** 2 + 2 * problem.params.g * problem.params.h0);

  const ask = (q: string) => {
    const value = q.trim();
    if (!value) return;
    onAsk(value);
    setQuestion("");
    setDetailOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-label="简要题解">
        <button type="button" className="flex w-full items-center gap-3 p-5 text-left" aria-expanded={solutionOpen} aria-controls={solutionId} onClick={() => setSolutionOpen(!solutionOpen)}>
          <span className="font-mono text-xs text-muted-foreground">02</span>
          <h2 className="text-sm font-semibold">题解</h2>
          <span className="hidden text-xs text-muted-foreground sm:inline">公式与关键结论</span>
          <ChevronDown className={cn("ml-auto size-4 transition-transform", solutionOpen && "rotate-180")} />
        </button>
        {solutionOpen && (
          <div id={solutionId} className="border-t border-border px-5 pb-5">
            <div className="divide-y divide-border">
              {result.steps.map((step) => (
                <article key={step.title} className="py-4">
                  <h3 className="text-xs font-medium">{step.title}</h3>
                  <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-secondary/65 px-3 py-2 font-mono text-xs leading-7">{step.formula}</pre>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{step.explanation}</p>
                </article>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-border py-4 font-mono text-xs">
              <p>射程 <strong>{result.range.toFixed(2)} m</strong></p>
              <p>最大高度 <strong>{result.maxHeight.toFixed(2)} m</strong></p>
              <p>飞行时间 <strong>{result.flightTime.toFixed(2)} s</strong></p>
              <p>落地速度 <strong>{landingSpeed.toFixed(2)} m/s</strong></p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="xs" onClick={async () => {
                const ok = await copyText(solutionMarkdown(problem, result, explanation, explanation.qa.map((q) => q.question)));
                toast[ok ? "success" : "error"](ok ? "题解已复制到剪贴板" : "复制失败，请改用导出");
              }}><Copy /> 复制题解</Button>
              <Button variant="ghost" size="xs" onClick={onExportSolution}><FileText /> 导出 Markdown</Button>
            </div>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-label="详细讲解">
        <button type="button" className="flex w-full items-center gap-3 p-5 text-left" aria-expanded={detailOpen} aria-controls={detailId} onClick={() => setDetailOpen(!detailOpen)}>
          <span className="font-mono text-xs text-muted-foreground">03</span>
          <h2 className="text-sm font-semibold">详解</h2>
          <span className="text-xs text-muted-foreground">先想一想，再展开</span>
          <ChevronDown className={cn("ml-auto size-4 transition-transform", detailOpen && "rotate-180")} />
        </button>
        {detailOpen && (
          <div id={detailId} className="flex flex-col gap-5 border-t border-border p-5">
            <section className="flex flex-col gap-3" aria-label="过程讲解">
              <h3 className="text-xs font-semibold text-muted-foreground">运动过程 · 随播放联动</h3>
              {explanation.phases.map((phase, i) => (
                <article key={phase.id} className={cn("rounded-xl border p-4", i === activePhase ? "border-primary/40 bg-secondary/60" : "border-border")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-medium">{i + 1}. {phase.title}</h4>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">{phase.start.toFixed(2)}–{phase.end.toFixed(2)} s</span>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">{phase.text}</p>
                  <Button variant="outline" size="xs" className="mt-2" onClick={() => onSeekPhase(i)}><Play /> 跳到 {phase.seek.toFixed(2)} s</Button>
                </article>
              ))}
            </section>
            <section className="flex flex-col gap-3" aria-label="答疑">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs font-semibold text-muted-foreground">答疑 · {explanation.qa.length} 个问题</h3>
                <Button size="xs" variant="secondary" className="ml-auto" disabled={configured !== true || aiBusy || explanation.qa.length === 0} onClick={onAiExplain}>
                  {aiBusy ? <Spinner /> : <Sparkles />} AI 深度讲解
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">{configured === true ? "本地推导始终可用，AI 为增强。" : "当前由本地物理知识库作答，云端 AI 未配置。"}</p>
              {insight && <article className="rounded-xl bg-secondary/60 p-4"><h4 className="text-xs font-semibold">AI 深度讲解</h4><p className="mt-2 whitespace-pre-wrap text-xs leading-6">{insight}</p></article>}
              {explanation.qa.length === 0 && <p className="py-3 text-sm text-muted-foreground">这道题还没有提问。试着问一个「为什么」。</p>}
              {explanation.qa.map((item, i) => (
                <article key={`${item.question}-${i}`} className="rounded-xl border border-border p-4">
                  <header className="flex items-start gap-2"><h4 className="flex-1 text-sm font-medium">{item.question}</h4><Badge variant="outline" className="shrink-0 text-[10px]">{item.source === "ai" ? "AI" : "本地推导"}</Badge></header>
                  <div className="mt-3 flex flex-col gap-2">
                    {item.answer.map((line, j) => <p key={j} className="text-xs leading-6 text-muted-foreground">{line}</p>)}
                    <p className="border-l-2 border-vx pl-3 font-mono text-xs leading-6 text-vx">{item.evidence}</p>
                  </div>
                </article>
              ))}
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_QUESTIONS.filter((q) => !explanation.qa.some((item) => item.question === q)).slice(0, 4).map((q) => <Button key={q} variant="outline" size="xs" className="h-auto whitespace-normal py-2 text-left" onClick={() => ask(q)}>{q}</Button>)}
              </div>
            </section>
          </div>
        )}
      </section>
      <form className="flex items-center gap-2 rounded-2xl border border-border bg-card p-3" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="还有疑问？继续问一个为什么…" aria-label="追加提问" className="border-0 bg-transparent shadow-none" />
        <Button type="submit" size="icon-sm" disabled={!question.trim()} aria-label="提交提问"><Send /></Button>
      </form>
    </div>
  );
}
