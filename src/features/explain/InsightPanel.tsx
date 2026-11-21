import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Copy, FileText, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/image";
import { buildDetailedSolution, buildExamSolution } from "@/lib/explain";
import type { Problem, SessionRecord, SolveResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MathText } from "./MathText";

type SolutionKind = "exam" | "detail";
type SolutionEdit = NonNullable<SessionRecord["solutionEdits"]>[SolutionKind];

interface Props {
  problem: Problem;
  result: SolveResult;
  solutionEdits?: SessionRecord["solutionEdits"];
  onSaveSolution: (kind: SolutionKind, text: string | null) => void;
  onExportSolution: () => void;
}

function SolutionContent({ kind, automatic, edit, signature, onSaveSolution, onExportSolution }: {
  kind: SolutionKind;
  automatic: string;
  edit: SolutionEdit;
  signature: string;
  onSaveSolution: Props["onSaveSolution"];
  onExportSolution?: () => void;
}) {
  const label = kind === "exam" ? "题解" : "详解";
  const source = edit?.text ?? automatic;
  const stale = Boolean(edit && edit.signature !== signature);
  const [editor, setEditor] = useState<{ text: string; signature: string } | null>(null);
  const isEditing = editor !== null;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const hintId = useId();
  const textareaId = useId();
  const draftStale = editor !== null && editor.signature !== signature;
  const canSave = editor !== null && Boolean(editor.text.trim()) && (editor.text !== source || stale);

  useEffect(() => {
    if (isEditing) textareaRef.current?.focus();
    else if (wasEditing.current) editButtonRef.current?.focus();
    wasEditing.current = isEditing;
  }, [isEditing]);

  const copy = async () => {
    const ok = await copyText(source);
    toast[ok ? "success" : "error"](ok ? `${label}已复制到剪贴板` : "复制失败，请改用导出");
  };

  return (
    <>
      {stale && (
        <p role="status" className="mb-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          题目、参数或所求量已变化，当前仍保留已保存的{label}，不会自动覆盖。请核对后保存，或选择“恢复自动{label}”。
        </p>
      )}
      <div className="min-w-0 max-w-full rounded-xl border border-border/70 bg-secondary/40 p-4">
        {editor ? (
          <div className="min-w-0 space-y-3">
            <label htmlFor={textareaId} className="block text-sm font-medium">编辑{label}内容</label>
            <p id={hintId} className="text-xs text-muted-foreground">
              支持普通文字、$行内公式$ 与 $$独立公式$$；保存后生效。
            </p>
            {draftStale && (
              <p role="status" className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                编辑期间题目已变化，草稿仍保留。保存会将此草稿用于当前题目，请先核对。
              </p>
            )}
            <textarea
              ref={textareaRef}
              id={textareaId}
              aria-label={`编辑${label}内容`}
              aria-describedby={hintId}
              className="block min-h-64 w-full min-w-0 resize-y rounded-lg border border-input bg-background p-3 font-mono text-sm leading-relaxed text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              value={editor.text}
              onChange={(event) => setEditor({ ...editor, text: event.target.value })}
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={!canSave} onClick={() => {
                if (!canSave) return;
                onSaveSolution(kind, editor.text);
                setEditor(null);
              }}>保存{label}</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditor(null)}>取消编辑</Button>
            </div>
            <div className="min-w-0 border-t border-border/70 pt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">实时预览</p>
              <MathText text={editor.text} />
            </div>
          </div>
        ) : <MathText text={source} />}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="xs" onClick={copy}><Copy aria-hidden="true" /> 复制{label}</Button>
        <Button ref={editButtonRef} type="button" variant="outline" size="xs" disabled={isEditing} onClick={() => setEditor({ text: source, signature })}>
          <Pencil aria-hidden="true" /> 编辑{label}
        </Button>
        {edit && (
          <Button type="button" variant="ghost" size="xs" disabled={isEditing} onClick={() => onSaveSolution(kind, null)}>
            <RotateCcw aria-hidden="true" /> 恢复自动{label}
          </Button>
        )}
        {onExportSolution && (
          <Button type="button" variant="ghost" size="xs" onClick={onExportSolution}><FileText aria-hidden="true" /> 导出 Markdown</Button>
        )}
      </div>
    </>
  );
}

export function InsightPanel({ problem, result, solutionEdits, onSaveSolution, onExportSolution }: Props) {
  const [solutionOpen, setSolutionOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const solutionId = useId();
  const detailId = useId();
  const signature = JSON.stringify([problem.statement, problem.params, problem.ask]);
  const solution = buildExamSolution(problem, result);
  const details = buildDetailedSolution(problem, result);

  const editBadge = (kind: SolutionKind) => solutionEdits?.[kind] && (
    <span className={cn("text-xs", solutionEdits[kind]?.signature !== signature ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
      {solutionEdits[kind]?.signature !== signature ? "已编辑 · 需核对" : "已编辑"}
    </span>
  );

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card" aria-label="简要题解">
        <button type="button" className="flex w-full min-w-0 items-center gap-3 p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-expanded={solutionOpen} aria-controls={solutionId} onClick={() => setSolutionOpen(!solutionOpen)}>
          <span className="font-mono text-xs text-muted-foreground">02</span>
          <h2 className="text-sm font-semibold">题解</h2>
          <span className="hidden text-xs text-muted-foreground sm:inline">标准答题过程</span>
          {editBadge("exam")}
          <ChevronDown aria-hidden="true" className={cn("ml-auto size-4 shrink-0 transition-transform", solutionOpen && "rotate-180")} />
        </button>
        <div id={solutionId} hidden={!solutionOpen} className="min-w-0 border-t border-border p-5">
          <SolutionContent kind="exam" automatic={solution} edit={solutionEdits?.exam} signature={signature} onSaveSolution={onSaveSolution} onExportSolution={onExportSolution} />
        </div>
      </section>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card" aria-label="详细讲解">
        <button type="button" className="flex w-full min-w-0 items-center gap-3 p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-expanded={detailOpen} aria-controls={detailId} onClick={() => setDetailOpen(!detailOpen)}>
          <span className="font-mono text-xs text-muted-foreground">03</span>
          <h2 className="text-sm font-semibold">详解</h2>
          <span className="hidden text-xs text-muted-foreground sm:inline">两种完整解法 · 展开查看</span>
          {editBadge("detail")}
          <ChevronDown aria-hidden="true" className={cn("ml-auto size-4 shrink-0 transition-transform", detailOpen && "rotate-180")} />
        </button>
        <div id={detailId} hidden={!detailOpen} className="min-w-0 border-t border-border p-5">
          <SolutionContent kind="detail" automatic={details} edit={solutionEdits?.detail} signature={signature} onSaveSolution={onSaveSolution} />
        </div>
      </section>
    </div>
  );
}
