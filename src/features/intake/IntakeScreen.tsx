import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  MessageCircleQuestion,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Wand2,
  ZoomIn,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, requestJson } from "@/lib/api";
import { extractProblemFile } from "@/lib/document";
import { fileToDataUrl } from "@/lib/image";
import { solveProblem } from "@/lib/physics";
import { useStore } from "@/lib/store";
import { parseParamsFromText, splitStatementAndQuestions, kindLabel, deriveTitle } from "@/lib/text";
import { templateMeta } from "@/lib/templates";
import { suggestedQuestions } from "@/lib/explain";
import { G_PRESETS, type Problem, type ProblemParams, type SessionSource, type TemplateId } from "@/lib/types";
import { ImageLightbox } from "@/src/features/library/ImageLightbox";

const TEMPLATE_IDS: TemplateId[] = ["projectile", "incline", "blockBoard", "collision1d"];

interface Draft {
  template: TemplateId;
  statement: string;
  questions: string[];
  params: ProblemParams;
  ask: string[];
  image?: string;
  imageName?: string;
  source: SessionSource;
  notice?: string;
}

interface IntakeFailure {
  code: string;
  message: string;
  reason?: string;
}

function failureTitle(code: string): string {
  if (code === "unsupported_problem") return "这道题暂不支持";
  if (code === "unreadable_image") return "图片不够清晰";
  if (code === "image_too_large") return "图片过大";
  if (code.endsWith("_rate_limited")) return "识别请求太频繁";
  if (
    code === "service_not_configured" || code === "network_error" || code === "invalid_response" ||
    code.endsWith("_upstream_auth") || code.endsWith("_model_unavailable") || code.endsWith("_upstream_error")
  ) return "识别服务暂时不可用";
  return "识别没有完成";
}

interface Props {
  configured: boolean | null;
  onCreated: (id: string) => void;
}

export function IntakeScreen({ configured, onCreated }: Props) {
  const { createSession } = useStore();
  const [stage, setStage] = useState<"compose" | "confirm">("compose");
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [imageName, setImageName] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileNotice, setFileNotice] = useState<string | undefined>();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [failure, setFailure] = useState<IntakeFailure | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const acceptFile = useCallback(async (file: File | undefined | null) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setFileBusy(true);
      setFileNotice(undefined);
      try {
        const doc = await extractProblemFile(file);
        if (doc.image) {
          setImage(doc.image);
          setImageName(`${file.name.replace(/\.[^.]+$/, "")} · 首页`);
        }
        if (doc.text) {
          setText((prev) => (prev.trim() ? `${prev.trim()}\n${doc.text}` : doc.text));
          textRef.current?.focus();
        }
        if (!doc.image && !doc.text) setError(doc.notice ?? "没有从这个文件里读到内容。");
        else if (doc.notice) setFileNotice(doc.notice);
        else if (doc.image) setFileNotice(`已读取 ${file.name} 首页图片${doc.text ? " 与文字层" : ""}。`);
        else setFileNotice(`已把 ${file.name} 的文字填进输入框。`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "文件读取失败。");
      } finally {
        setFileBusy(false);
      }
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      setImage(url);
      setImageName(file.name || "题目照片.jpg");
      setFileNotice(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "图片处理失败。");
    }
  }, []);

  useEffect(() => {
    if (stage !== "compose") return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (item) {
        e.preventDefault();
        void acceptFile(item.getAsFile());
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [stage, acceptFile]);

  const buildDraft = (problem: Problem, questions: string[], source: SessionSource, notice?: string): Draft => ({
    template: problem.template,
    statement: problem.statement,
    questions,
    params: problem.params,
    ask: problem.ask?.length ? problem.ask : templateMeta(problem.template).asks,
    image,
    imageName,
    source,
    notice,
  });

  const submit = async () => {
    const trimmed = text.trim();
    if (!image && !trimmed) {
      setError("请先上传题目照片，或输入题干 / 问题。");
      textRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    setFailure(null);
    const source: SessionSource = image ? "photo" : "text";

    if (configured === true) {
      try {
        const data = (await requestJson("/functions/v1/app/recognize", {
          method: "POST",
          body: JSON.stringify({ image, text: trimmed || undefined }),
        })) as { ok: true; problem: Problem; questions?: string[] };
        if (!data?.problem || !TEMPLATE_IDS.includes(data.problem.template)) {
          throw new ApiError("识别结果不完整，请重试。", "invalid_response");
        }
        const questions = (data.questions ?? []).filter((q) => typeof q === "string" && q.trim());
        setDraft(buildDraft(data.problem, questions.length ? questions : splitStatementAndQuestions(trimmed).questions, source));
        setBusy(false);
        setStage("confirm");
        return;
      } catch (e) {
        setFailure(
          e instanceof ApiError
            ? { code: e.code, message: e.message, reason: e.reason }
            : { code: "network_error", message: "识别失败，请稍后重试。" },
        );
        setStage("compose");
        setBusy(false);
        return;
      }
    }

    const localSplit = splitStatementAndQuestions(trimmed);
    const parsed = parseParamsFromText(trimmed);
    const problem: Problem = {
      version: 1,
      template: parsed.template,
      statement:
        localSplit.statement ||
        trimmed ||
        (image ? "（图片题目）云端识别未开启，请补充题干或直接校正下方参数。" : "（未提供题干，可直接调整参数探究）"),
      params: parsed.params,
      ask: templateMeta(parsed.template).asks,
    };
    const assumed = parsed.assumed.length ? " 未识别的量取默认值：" + parsed.assumed.join("、") + "。" : "";
    setDraft(buildDraft(
      problem,
      localSplit.questions,
      source,
      configured === false
        ? `识题服务未配置：已按本地规则解析文本${image ? "（图片不参与本地解析）" : ""}。${assumed}`
        : `未能确认识题服务状态：已按本地规则解析文本。${assumed}`,
    ));
    setBusy(false);
    setStage("confirm");
  };

  const submitLocal = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const localSplit = splitStatementAndQuestions(trimmed);
    const parsed = parseParamsFromText(trimmed);
    const problem: Problem = {
      version: 1,
      template: parsed.template,
      statement: localSplit.statement || trimmed,
      params: parsed.params,
      ask: templateMeta(parsed.template).asks,
    };
    const assumed = parsed.assumed.length ? "，未识别的量取默认值：" + parsed.assumed.join("、") : "";
    setDraft(buildDraft(problem, localSplit.questions, image ? "photo" : "text", `已按本地规则解析文字${assumed}。请逐项核对参数。`));
    setFailure(null);
    setStage("confirm");
  };

  const generate = () => {
    if (!draft) return;
    const problem: Problem = {
      version: 1,
      template: draft.template,
      statement: draft.statement.trim() || deriveTitle("", draft.params, draft.template),
      params: draft.params,
      ask: draft.ask,
    };
    const record = createSession({
      problem,
      questions: draft.questions.map((q) => q.trim()).filter(Boolean),
      source: draft.source,
      image: draft.image,
      imageName: draft.imageName,
    });
    onCreated(record.id);
  };

  const draftResult = useMemo(
    () => (draft ? solveProblem({ version: 1, template: draft.template, statement: draft.statement, params: draft.params, ask: draft.ask }) : null),
    [draft],
  );

  const setParam = (patch: Record<string, number>) => {
    setDraft((d) => (d ? { ...d, params: { ...d.params, ...patch } as ProblemParams } : d));
  };

  return (
    <div className="relative flex flex-col">
      <div className="w-full flex-1 py-4">
        {stage === "compose" ? (
          <div className="flex flex-col gap-6">
            <div className="gw-rise flex flex-col gap-3" style={{ "--d": "40ms" } as React.CSSProperties}>
              <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] text-muted-foreground">
                <span className="h-px w-8 gw-hairline" />
                第一步 · 上传题目
              </span>
              <h1 className="text-2xl font-medium leading-relaxed tracking-tight sm:text-3xl">让一道物理题，动起来。</h1>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground">上传题目照片，或输入题干。从观察运动开始，再一步步理解公式。</p>
            </div>

            <section
              className={`gw-rise gw-panel relative overflow-hidden rounded-2xl p-4 sm:p-5 transition-colors ${
                dragOver ? "ring-2 ring-primary/60" : ""
              }`}
              style={{ "--d": "120ms" } as React.CSSProperties}
              aria-label="题目输入"
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void acceptFile(e.dataTransfer.files?.[0]);
              }}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
                <span className="gw-sweep block h-px w-1/3 gw-hairline" />
              </div>

              {image ? (
                <div className="mb-3 flex items-center gap-3 rounded-xl gw-inset p-3">
                  <button
                    type="button"
                    onClick={() => setZoomOpen(true)}
                    className="group relative shrink-0 overflow-hidden rounded-lg border border-border"
                    aria-label="放大查看题目照片"
                  >
                    <img src={image} alt="题目照片缩略预览" className="h-20 w-28 object-cover" />
                    <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                      <ZoomIn className="size-4 text-white" />
                    </span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{imageName ?? "题目照片"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">已压缩至 1600px 内 · 点击缩略图可放大</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>换一张</Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="移除图片"
                      onClick={() => { setImage(undefined); setImageName(undefined); }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mb-2 text-xs leading-6 text-muted-foreground">
                  可以只写文字；也能把题目图片拖进来、Ctrl+V 粘贴，或用左下角 + 选择本地文件（图片 · PDF · Word · txt）。
                </p>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/*,.pdf,.docx,.txt,.md"
                className="hidden"
                aria-label="选择题目文件"
                onChange={(e) => { void acceptFile(e.target.files?.[0]); e.target.value = ""; }}
              />

              <Textarea
                ref={textRef}
                value={text}
                rows={5}
                placeholder="粘贴题干，或直接提问：为什么水平方向的速度一直不变？（Enter 发送，Ctrl + Enter 换行）"
                aria-label="题干或提问输入"
                className="min-h-[120px] resize-y text-sm"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  if (e.ctrlKey || e.metaKey || e.shiftKey) {
                    e.preventDefault();
                    const el = e.currentTarget;
                    const start = el.selectionStart, end = el.selectionEnd;
                    const next = `${text.slice(0, start)}\n${text.slice(end)}`;
                    setText(next);
                    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 1; });
                    return;
                  }
                  e.preventDefault();
                  if (!busy) void submit();
                }}
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="icon-sm" aria-label="添加本地文件" title="添加图片 / PDF / Word / txt" onClick={() => inputRef.current?.click()}>
                  <Plus />
                </Button>
                {fileBusy && (<><Spinner className="size-3.5" /><span className="text-[11px] text-muted-foreground">正在读取文件…</span></>)}
                {fileNotice && <span className="min-w-0 flex-1 text-[11px] leading-5 text-muted-foreground">{fileNotice}</span>}
                <div className="ml-auto flex items-center gap-2">
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">{text.length} 字</span>
                  <Button onClick={() => void submit()} disabled={busy || (!image && !text.trim())}>
                    {busy ? (<><Spinner /> 识别中…</>) : (<><Send /> 识别并生成动画</>)}
                  </Button>
                </div>
              </div>

              {error && (
                <Alert variant="destructive" className="mt-3">
                  <AlertTitle>还差一步</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {failure && (
                <Alert className="mt-3">
                  <AlertTitle>{failureTitle(failure.code)}</AlertTitle>
                  <AlertDescription>
                    <p>
                      {failure.message}
                      {failure.reason ? `（${failure.reason}）` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button variant="outline" size="xs" disabled={busy} onClick={() => void submit()}>
                        重新识别
                      </Button>
                      {text.trim() && (
                        <Button variant="outline" size="xs" onClick={submitLocal}>
                          按本地规则解析文字
                        </Button>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              {configured === false && (
                <Alert className="mt-3">
                  <AlertTitle>识题服务未配置</AlertTitle>
                  <AlertDescription>
                    服务端尚未配置识别密钥，图片识别暂不可用；文本解析、动画、讲解与题解全部照常工作，参数可手动校正。
                  </AlertDescription>
                </Alert>
              )}
            </section>

          </div>
        ) : draft ? (
          <div className="flex flex-col gap-4">
            <div className="gw-rise flex flex-wrap items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setStage("compose")}>
                <ArrowLeft /> 返回修改输入
              </Button>
              <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] text-muted-foreground">
                <span className="h-px w-8 gw-hairline" />
                第二步 · 确认题干与提问
              </span>
              <Badge variant="secondary" className="ml-auto">{draft.template === "projectile" ? kindLabel(draft.params) : templateMeta(draft.template).short}</Badge>
            </div>

            {draft.notice && (
              <Alert className="gw-rise">
                <AlertTitle>本地解析结果</AlertTitle>
                <AlertDescription>{draft.notice}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="gw-rise gw-panel flex flex-col gap-3 rounded-2xl p-4" style={{ "--d": "80ms" } as React.CSSProperties}>
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <span className="size-2 rounded-full" style={{ background: "var(--gw-info)" }} />
                  题目内容
                </h2>
                {draft.image && (
                  <button
                    type="button"
                    onClick={() => setZoomOpen(true)}
                    className="group relative overflow-hidden rounded-lg border border-border"
                    aria-label="放大查看题目照片"
                  >
                    <img src={draft.image} alt="上传的题目照片" className="max-h-40 w-full object-contain" />
                    <span className="absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                      点击放大
                    </span>
                  </button>
                )}
                <Textarea
                  value={draft.statement}
                  rows={5}
                  aria-label="题目内容（可编辑）"
                  className="min-h-[120px] text-sm leading-relaxed"
                  onChange={(e) => setDraft({ ...draft, statement: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  {templateMeta(draft.template).params.filter((f) => f.key !== "g").map((field) => (
                    <label key={field.key} className="flex flex-col gap-1">
                      <span className="text-[11px] text-muted-foreground">{field.label}</span>
                      <span className="flex items-center gap-1">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          value={(draft.params as unknown as Record<string, number>)[field.key] ?? 0}
                          aria-label={field.label}
                          className="h-8 font-mono text-xs"
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) setParam({ [field.key]: Math.min(field.max, Math.max(field.min, v)) });
                          }}
                        />
                        <span className="text-[11px] text-muted-foreground">{field.unit}</span>
                      </span>
                    </label>
                  ))}
                  {"g" in draft.params && (
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">重力加速度 g</span>
                    <Select
                      value={String((draft.params as unknown as Record<string, number>).g)}
                      onValueChange={(v) => setParam({ g: Number(v) })}
                    >
                      <SelectTrigger size="sm" className="h-8 w-full font-mono text-xs" aria-label="重力加速度">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {G_PRESETS.map((p) => (
                          <SelectItem key={p.value} value={String(p.value)}>{p.label} m/s²</SelectItem>
                        ))}
                        {!G_PRESETS.some((p) => Math.abs(p.value - (draft.params as unknown as Record<string, number>).g) < 1e-6) && (
                          <SelectItem value={String((draft.params as unknown as Record<string, number>).g)}>自定义 {(draft.params as unknown as Record<string, number>).g} m/s²</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </label>
                  )}
                </div>
              </section>

              <section className="gw-rise gw-panel flex flex-col gap-3 rounded-2xl p-4" style={{ "--d": "160ms" } as React.CSSProperties}>
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <span className="size-2 rounded-full" style={{ background: "var(--gw-vx)" }} />
                  你的问题
                  <Badge variant="outline" className="ml-auto">{draft.questions.length} 条</Badge>
                </h2>
                <Textarea
                  value={draft.questions.join("\n")}
                  rows={5}
                  placeholder={"每行一个问题，例如：\n为什么水平速度不变？\n落地速度有多大？"}
                  aria-label="用户提问（每行一条，可编辑）"
                  className="min-h-[120px] text-sm leading-relaxed"
                  onChange={(e) => setDraft({ ...draft, questions: e.target.value.split("\n") })}
                />
                <p className="text-xs text-muted-foreground">
                  生成动画后，在右侧「对话」查看逐条回答与数值依据。
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedQuestions({ version: 1, template: draft.template, statement: draft.statement, params: draft.params, ask: draft.ask }).slice(0, 3).map((q) => (
                    <Button
                      key={q}
                      variant="outline"
                      size="xs"
                      onClick={() => setDraft({ ...draft, questions: [...draft.questions.filter(Boolean), q] })}
                    >
                      <MessageCircleQuestion /> {q}
                    </Button>
                  ))}
                </div>
                {draftResult && (
                  <div className="mt-auto flex flex-col gap-2 rounded-xl gw-inset p-3">
                    <span className="text-[11px] text-muted-foreground">按当前参数实时算出</span>
                    <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                      {draftResult.scalars.slice(0, 3).map((s2, i) => (
                        <span key={s2.key} className="rounded px-2 py-1" style={{ background: `color-mix(in oklab, ${["var(--gw-v)", "var(--gw-vy)", "var(--gw-vx)"][i % 3]} 14%, transparent)`, color: ["var(--gw-v)", "var(--gw-vy)", "var(--gw-vx)"][i % 3] }}>
                          {s2.label} {s2.value.toFixed(s2.digits ?? 2)} {s2.unit}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="gw-rise flex flex-wrap items-center gap-2" style={{ "--d": "240ms" } as React.CSSProperties}>
              <Button size="lg" onClick={generate}>
                <Sparkles /> 生成动画与题解
              </Button>
              {draft.image && configured === true && (
                <Button
                  size="lg"
                  variant="outline"
                  disabled={busy}
                  onClick={() => { void submit(); }}
                >
                  {busy ? <Spinner /> : <Wand2 />} 重新识别
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                题目会自动保存；中间查看动画与题解，右侧调整参数。
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <footer className="w-full pb-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          当前支持抛体 · 斜面下滑 · 滑块木板 · 一维碰撞（更多题型陆续加入）。先求解，再动画：动画与题解数值严格一致。
        </p>
      </footer>

      {image && (
        <ImageLightbox open={zoomOpen} onOpenChange={setZoomOpen} src={image} name={imageName} />
      )}
    </div>
  );
}