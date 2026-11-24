import { useRef, useState } from "react";
import { Copy, Pencil, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { suggestedQuestions } from "@/lib/explain";
import { copyText } from "@/lib/image";
import { templateMeta } from "@/lib/templates";
import { ASK_LABELS } from "@/lib/text";
import type { Explanation, Problem, ProblemParams, SessionRecord } from "@/lib/types";

interface Props {
  session: SessionRecord;
  explanation: Explanation;
  configured: boolean | null;
  aiBusy: boolean;
  insight?: string;
  exploring: boolean;
  onAsk: (question: string) => void;
  onAiExplain: () => void;
  onEditProblem: (problem: Problem) => void;
}

const frame = "rounded-xl border border-sky-200 bg-sky-50/20 p-3 dark:border-sky-800 dark:bg-sky-950/15";

const fieldsOf = (template: SessionRecord["problem"]["template"]) => templateMeta(template).params;
const paramsOf = (base: ProblemParams, template: SessionRecord["problem"]["template"]) =>
  Object.fromEntries(fieldsOf(template).map(({ key }) => [key, String((base as unknown as Record<string, number>)[key])])) as Record<string, string>;

export function ConversationPanel({ session, explanation, configured, aiBusy, insight, exploring, onAsk, onAiExplain, onEditProblem }: Props) {
  const [question, setQuestion] = useState("");
  const [editing, setEditing] = useState(false);
  const [statement, setStatement] = useState(session.problem.statement);
  const [params, setParams] = useState(() => paramsOf(session.baseParams, session.problem.template));
  const [ask, setAsk] = useState(session.problem.ask);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const meta = templateMeta(session.problem.template);
  const fields = fieldsOf(session.problem.template);
  const valid = !!statement.trim() && ask.length > 0 && fields.every(({ key, min, max }) => params[key]?.trim() && Number.isFinite(Number(params[key])) && Number(params[key]) >= min && Number(params[key]) <= max);

  const copy = async (text: string) => {
    const ok = await copyText(text);
    toast[ok ? "success" : "error"](ok ? "已复制" : "复制失败，请手动选择文本");
  };
  const send = (text: string) => {
    const value = text.trim();
    if (!value) return;
    onAsk(value);
    setQuestion("");
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (node) node.scrollTop = node.scrollHeight;
      inputRef.current?.focus();
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="题目对话">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
        <article aria-label="对话题目" className={frame}>
          <h2 className="mb-2 text-xs font-semibold text-muted-foreground">题目</h2>
          <p className="whitespace-pre-wrap break-words text-xs leading-7">{session.problem.statement}</p>
          <div className="mt-2 flex items-center gap-1 text-muted-foreground">
            <Button variant="ghost" size="icon-xs" aria-label="复制题目" title="复制题目" onClick={() => void copy(session.problem.statement)}><Copy /></Button>
            <Dialog open={editing} onOpenChange={(open) => {
              if (open) {
                setStatement(session.problem.statement);
                setParams(paramsOf(session.baseParams, session.problem.template));
                setAsk(session.problem.ask);
              }
              setEditing(open);
            }}>
              <DialogTrigger asChild><Button variant="ghost" size="icon-xs" aria-label="编辑题目" title="编辑题目"><Pencil /></Button></DialogTrigger>
              <DialogContent aria-modal="true" className="max-h-[85dvh] overflow-y-auto">
                <DialogHeader><DialogTitle>编辑题目</DialogTitle><DialogDescription>修改题干中的数值时，请同步校正初始参数与所求量。保存后会重新计算，并清除旧的 AI 讲解。</DialogDescription></DialogHeader>
                <form className="space-y-4" onSubmit={(event) => {
                  event.preventDefault();
                  if (!valid) return;
                  onEditProblem({ ...session.problem, statement: statement.trim(), params: Object.fromEntries(fields.map(({ key }) => [key, Number(params[key])])) as unknown as ProblemParams, ask });
                  setEditing(false);
                }}>
                  <label className="flex flex-col gap-2 text-xs">题目内容<Textarea value={statement} onChange={(event) => setStatement(event.target.value)} aria-label="编辑题目内容" rows={5} required className="leading-7" /></label>
                  <div className="grid grid-cols-2 gap-3">
                    {fields.map(({ key, label, symbol, unit, min, max }) => <label key={key} className="flex flex-col gap-1 text-xs">{label}（{unit || "—"}）<Input type="number" inputMode="decimal" step="any" min={min} max={max} required value={params[key] ?? ""} aria-label={`编辑${label}${symbol ? ` ${symbol}` : ""}`} onChange={(event) => setParams({ ...params, [key]: event.target.value })} /></label>)}
                  </div>
                  <fieldset className="flex flex-wrap gap-3"><legend className="mb-2 text-xs">所求量</legend>{meta.asks.map((key) => <label key={key} className="flex items-center gap-2 text-xs"><Checkbox checked={ask.includes(key)} onCheckedChange={(checked) => setAsk(checked ? [...ask, key] : ask.filter((value) => value !== key))} />{ASK_LABELS[key] ?? key}</label>)}</fieldset>
                  {!valid && <p role="status" className="text-xs text-destructive">请填写题干、范围内的参数，并至少选择一个所求量。</p>}
                  <DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(false)}>取消</Button><Button type="submit" disabled={!valid}>保存题目</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </article>
        {exploring && <p className="text-[11px] leading-6 text-muted-foreground">当前为参数探究，回答中的数值随动画参数更新；题目原文保持不变。</p>}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{configured === true ? "本地推导 · 可选 AI 增强" : "本地推导 · 云端 AI 未配置"}</span>
          <Button size="icon-xs" variant="ghost" disabled={configured !== true || aiBusy || explanation.qa.length === 0} aria-label="AI 深度讲解" title="AI 深度讲解" onClick={onAiExplain}>{aiBusy ? <Spinner /> : <Sparkles />}</Button>
        </div>
        {explanation.qa.map((item, index) => {
          const time = session.questionTimes?.[item.question];
          return <div key={`${item.question}-${index}`} className="space-y-2" aria-label="问答记录">
            <article className={`${frame} ml-3`} aria-label="用户提问">
              <p className="whitespace-pre-wrap break-words text-xs leading-7">{item.question}</p>
              <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                {typeof time === "number" && Number.isFinite(time) && <time dateTime={new Date(time).toISOString()} className="text-[10px]" title={new Date(time).toLocaleString("zh-CN")}>{new Date(time).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</time>}
                <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label={`复制提问 ${index + 1}`} onClick={() => void copy(item.question)}><Copy /></Button>
              </div>
            </article>
            <article className={`${frame} mr-1`} aria-label="问题回答">
              <h3 className="mb-2 text-[10px] text-muted-foreground">{item.source === "ai" ? "AI 讲解" : "格物 · 本地推导"}</h3>
              {item.answer.map((line, i) => <p key={i} className="whitespace-pre-wrap break-words text-xs leading-7">{line}</p>)}
              <p className="mt-2 break-words font-mono text-xs leading-7">{item.evidence}</p>
              <Button variant="ghost" size="icon-xs" className="mt-2 text-muted-foreground" aria-label={`复制回答 ${index + 1}`} onClick={() => void copy([...item.answer, item.evidence].join("\n"))}><Copy /></Button>
            </article>
          </div>;
        })}
        {insight && <article className={frame} aria-label="AI 补充讲解"><h3 className="mb-2 text-xs font-semibold">AI 补充讲解</h3><p className="whitespace-pre-wrap break-words text-xs leading-7">{insight}</p></article>}
        <div className="flex flex-wrap gap-2">
          {suggestedQuestions(session.problem).filter((q) => !session.questions.includes(q)).slice(0, 3).map((q) => <Button key={q} variant="outline" size="xs" className="h-auto whitespace-normal border-sky-200 py-2 text-left dark:border-sky-800" onClick={() => send(q)}>{q}</Button>)}
        </div>
      </div>
      <form className="m-3 mt-0 flex shrink-0 items-end gap-2 rounded-xl border border-sky-200 bg-card p-2 dark:border-sky-800" onSubmit={(event) => { event.preventDefault(); send(question); }}>
        <Textarea ref={inputRef} value={question} onChange={(event) => setQuestion(event.target.value)} aria-label="追加提问" placeholder="继续提问…" rows={2} className="max-h-32 min-h-14 resize-none border-0 bg-transparent text-xs shadow-none" onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(question); }
        }} />
        <Button type="submit" size="icon-sm" disabled={!question.trim()} aria-label="提交提问"><Send /></Button>
      </form>
    </section>
  );
}
