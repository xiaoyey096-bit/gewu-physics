import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ImagePlus,
  MessageCircleQuestion,
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
import { fileToDataUrl } from "@/lib/image";
import { solveProjectile } from "@/lib/physics";
import { useStore } from "@/lib/store";
import { parseParamsFromText, splitStatementAndQuestions, kindLabel, deriveTitle } from "@/lib/text";
import { G_PRESETS, type Problem, type ProjectileParams, type SessionSource } from "@/lib/types";
import { ImageLightbox } from "@/src/features/library/ImageLightbox";

interface ExamplePreset {
  key: string;
  label: string;
  statement: string;
  params: ProjectileParams;
  ask: string[];
  questions: string[];
}

const EXAMPLES: ExamplePreset[] = [
  {
    key: "oblique",
    label: "斜抛 · 30°",
    statement:
      "从地面以 20 m/s 的初速度、与水平方向成 30° 角斜向上抛出一小球，不计空气阻力，g 取 9.8 m/s²。求小球的射程、最大高度与飞行时间。",
    params: { v0: 20, angleDeg: 30, h0: 0, g: 9.8 },
    ask: ["range", "maxHeight", "flightTime"],
    questions: ["为什么水平方向的速度一直不变？"],
  },
  {
    key: "horizontal",
    label: "平抛 · 20 m 高台",
    statement:
      "一架无人机在 20 m 高空以 12 m/s 的速度水平飞行，投放一个物资包，不计空气阻力，g 取 9.8 m/s²。求落地点与投放点的水平距离、落地时间与落地速度大小。",
    params: { v0: 12, angleDeg: 0, h0: 20, g: 9.8 },
    ask: ["range", "flightTime", "landingSpeed"],
    questions: ["飞行时间由什么决定？"],
  },
  {
    key: "vertical",
    label: "竖直上抛 · g=10",
    statement:
      "以 15 m/s 的初速度竖直向上抛出一石子，g 取 10 m/s²，不计空气阻力。求石子上升的最大高度与回到抛出点所用的时间。",
    params: { v0: 15, angleDeg: 90, h0: 0, g: 10 },
    ask: ["maxHeight", "flightTime"],
    questions: ["最高点时加速度为零吗？"],
  },
];

interface Draft {
  statement: string;
  questions: string[];
  params: ProjectileParams;
  ask: string[];
  image?: string;
  imageName?: string;
  source: SessionSource;
  notice?: string;
}

interface Props {
  configured: boolean | null;
  onCreated: (id: string) => void;
  onOpenSession: (id: string) => void;
  onOpenLibrary: () => void;
}

export function IntakeScreen({ configured, onCreated, onOpenSession, onOpenLibrary }: Props) {
  const { sessions, createSession } = useStore();
  const [stage, setStage] = useState<"compose" | "confirm">("compose");
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [imageName, setImageName] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const recent = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4),
    [sessions],
  );

  const acceptFile = useCallback(async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件（PNG / JPG 等）。");
      return;
    }
    setError(null);
    try {
      const url = await fileToDataUrl(file);
      setImage(url);
      setImageName(file.name || "题目照片.jpg");
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

  const useExample = (preset: ExamplePreset) => {
    setError(null);
    setDraft({
      statement: preset.statement,
      questions: preset.questions,
      params: preset.params,
      ask: preset.ask,
      source: "example",
    });
    setStage("confirm");
  };

  const submit = async () => {
    const trimmed = text.trim();
    if (!image && !trimmed) {
      setError("请先上传题目照片，或输入题干 / 问题。");
      textRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const localSplit = splitStatementAndQuestions(trimmed);
    let problem: Problem;
    let questions: string[];
    let notice: string | undefined;
    const source: SessionSource = image ? "photo" : "text";

    if (configured === true) {
      try {
        const data = (await requestJson("/functions/v1/app/recognize", {
          method: "POST",
          body: JSON.stringify({ image, text: trimmed || undefined }),
        })) as { ok: true; problem: Problem; questions?: string[] };
        if (!data?.problem || data.problem.template !== "projectile") {
          throw new ApiError("识别结果不完整，请重试。", "invalid_response");
        }
        problem = data.problem;
        questions = (data.questions ?? []).filter((q) => typeof q === "string" && q.trim());
        if (!questions.length) questions = localSplit.questions;
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : "识别失败，请稍后重试。";
        const parsed = parseParamsFromText(trimmed);
        problem = {
          version: 1,
          template: "projectile",
          statement:
            localSplit.statement ||
            trimmed ||
            (image ? "（图片题目）云端识别未成功，请补充题干或直接校正下方参数。" : "（未提供题干）"),
          params: parsed.params,
          ask: ["range", "maxHeight", "flightTime"],
        };
        questions = localSplit.questions;
        notice = `${msg} 已改用本地解析，请校正参数后再生成动画。`;
      }
    } else {
      const parsed = parseParamsFromText(trimmed);
      problem = {
        version: 1,
        template: "projectile",
        statement: localSplit.statement || trimmed || "（未提供题干，可直接调整参数探究）",
        params: parsed.params,
        ask: ["range", "maxHeight", "flightTime"],
      };
      questions = localSplit.questions;
      notice =
        configured === false
          ? `识题服务未配置：已按本地规则解析文本${image ? "（图片不参与本地解析）" : ""}。${parsed.assumed.length ? "未识别的量：" + parsed.assumed.join("、") + "。" : ""}`
          : undefined;
    }

    setDraft({
      statement: problem.statement,
      questions,
      params: problem.params,
      ask: problem.ask?.length ? problem.ask : ["range", "maxHeight", "flightTime"],
      image,
      imageName,
      source,
      notice,
    });
    setBusy(false);
    setStage("confirm");
  };

  const generate = () => {
    if (!draft) return;
    const problem: Problem = {
      version: 1,
      template: "projectile",
      statement: draft.statement.trim() || deriveTitle("", draft.params),
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
    () => (draft ? solveProjectile(draft.params) : null),
    [draft],
  );

  const setParam = (patch: Partial<ProjectileParams>) => {
    setDraft((d) => (d ? { ...d, params: { ...d.params, ...patch } } : d));
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
              className="gw-rise gw-panel relative overflow-hidden rounded-2xl p-4 sm:p-5"
              style={{ "--d": "120ms" } as React.CSSProperties}
              aria-label="题目输入"
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
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="上传物理题图片"
                  className={`mb-3 flex min-h-[124px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                    dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
                  }`}
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      inputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    void acceptFile(e.dataTransfer.files?.[0]);
                  }}
                >
                  <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
                    <ImagePlus className="size-5" />
                  </span>
                  <span className="text-sm font-medium">拖拽 / 点击 / Ctrl+V 粘贴题目照片</span>
                  <span className="text-xs text-muted-foreground">支持 JPG · PNG，自动压缩；也可以只输入文字</span>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="选择题目图片文件"
                onChange={(e) => { void acceptFile(e.target.files?.[0]); e.target.value = ""; }}
              />

              <Textarea
                ref={textRef}
                value={text}
                rows={3}
                placeholder="粘贴题干，或直接提问：为什么水平方向的速度一直不变？（Ctrl + Enter 发送）"
                aria-label="题干或提问输入"
                className="min-h-[92px] resize-y text-sm"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    void submit();
                  }
                }}
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">示例题：</span>
                {EXAMPLES.map((ex) => (
                  <Button key={ex.key} variant="outline" size="xs" onClick={() => useExample(ex)}>
                    <Wand2 /> {ex.label}
                  </Button>
                ))}
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
              {configured === false && (
                <Alert className="mt-3">
                  <AlertTitle>识题服务未配置</AlertTitle>
                  <AlertDescription>
                    服务端尚未配置识别密钥，图片识别暂不可用；文本解析、动画、讲解与题解全部照常工作，参数可手动校正。
                  </AlertDescription>
                </Alert>
              )}
            </section>

            <section className="gw-rise flex flex-col gap-3" style={{ "--d": "200ms" } as React.CSSProperties}>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">最近题目</h2>
                <span className="text-xs text-muted-foreground">点击任意一条直接进入动画工作台</span>
                <Button variant="link" size="xs" className="ml-auto px-0" onClick={onOpenLibrary}>
                  查看全部题库
                </Button>
              </div>
              {recent.length === 0 ? (
                <p className="rounded-xl gw-inset p-4 text-sm text-muted-foreground">
                  题库还是空的。上传一张题目照片，或点上面的示例题开始。
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {recent.map((s) => {
                    const r = solveProjectile(s.problem.params);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onOpenSession(s.id)}
                        className="gw-panel group flex flex-col gap-2 rounded-xl p-3 text-left transition-transform hover:-translate-y-0.5 hover:border-primary/60"
                      >
                        <span className="flex items-center gap-2">
                          {s.image ? (
                            <img src={s.image} alt="" className="h-9 w-12 rounded object-cover" />
                          ) : (
                            <span
                              className="grid h-9 w-12 place-items-center rounded font-mono text-[10px] text-white"
                              style={{ background: "linear-gradient(135deg, var(--gw-info), var(--site-accent))" }}
                            >
                              {kindLabel(s.problem.params)}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.title}</span>
                        </span>
                        <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {s.problem.statement}
                        </span>
                        <span className="mt-auto flex flex-wrap gap-1.5 font-mono text-[10px] text-muted-foreground">
                          <span className="rounded bg-secondary px-1.5 py-0.5">X {r.range.toFixed(1)} m</span>
                          <span className="rounded bg-secondary px-1.5 py-0.5">T {r.flightTime.toFixed(2)} s</span>
                          {s.questions.length > 0 && (
                            <span className="rounded px-1.5 py-0.5 text-vx" style={{ background: "color-mix(in oklab, var(--gw-vx) 14%, transparent)" }}>
                              {s.questions.length} 问
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
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
              <Badge variant="secondary" className="ml-auto">{kindLabel(draft.params)}</Badge>
            </div>

            {draft.notice && (
              <Alert className="gw-rise">
                <AlertTitle>已降级为本地解析</AlertTitle>
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
                  {([
                    { key: "v0", label: "初速度 v₀", unit: "m/s", min: 0.5, max: 200, step: 0.5 },
                    { key: "angleDeg", label: "抛射角 θ", unit: "°", min: 0, max: 90, step: 1 },
                    { key: "h0", label: "初始高度 h₀", unit: "m", min: 0, max: 200, step: 0.5 },
                  ] as const).map((field) => (
                    <label key={field.key} className="flex flex-col gap-1">
                      <span className="text-[11px] text-muted-foreground">{field.label}</span>
                      <span className="flex items-center gap-1">
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          value={draft.params[field.key]}
                          aria-label={field.label}
                          className="h-8 font-mono text-xs"
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) setParam({ [field.key]: Math.min(field.max, Math.max(field.min, v)) } as Partial<ProjectileParams>);
                          }}
                        />
                        <span className="text-[11px] text-muted-foreground">{field.unit}</span>
                      </span>
                    </label>
                  ))}
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted-foreground">重力加速度 g</span>
                    <Select
                      value={String(draft.params.g)}
                      onValueChange={(v) => setParam({ g: Number(v) })}
                    >
                      <SelectTrigger size="sm" className="h-8 w-full font-mono text-xs" aria-label="重力加速度">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {G_PRESETS.map((p) => (
                          <SelectItem key={p.value} value={String(p.value)}>{p.label} m/s²</SelectItem>
                        ))}
                        {!G_PRESETS.some((p) => Math.abs(p.value - draft.params.g) < 1e-6) && (
                          <SelectItem value={String(draft.params.g)}>自定义 {draft.params.g} m/s²</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </label>
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
                  {["为什么水平方向的速度一直不变？", "抛射角多大时射程最远？", "落地时的速度有多大？"].map((q) => (
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
                      <span className="rounded px-2 py-1" style={{ background: "color-mix(in oklab, var(--gw-v) 14%, transparent)", color: "var(--gw-v)" }}>
                        射程 {draftResult.range.toFixed(2)} m
                      </span>
                      <span className="rounded px-2 py-1" style={{ background: "color-mix(in oklab, var(--gw-vy) 16%, transparent)", color: "var(--gw-vy)" }}>
                        最高 {draftResult.maxHeight.toFixed(2)} m
                      </span>
                      <span className="rounded px-2 py-1" style={{ background: "color-mix(in oklab, var(--gw-vx) 14%, transparent)", color: "var(--gw-vx)" }}>
                        飞行 {draftResult.flightTime.toFixed(2)} s
                      </span>
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
                  onClick={() => { setStage("compose"); void submit(); }}
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
          当前支持斜抛 · 平抛 · 竖直上抛（更多题型陆续加入）。先求解，再动画：动画与题解数值严格一致。
        </p>
      </footer>

      {image && (
        <ImageLightbox open={zoomOpen} onOpenChange={setZoomOpen} src={image} name={imageName} />
      )}
    </div>
  );
}