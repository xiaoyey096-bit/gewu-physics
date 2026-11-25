import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BookOpen, ChevronRight, Crosshair, MessageSquare, Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, requestJson } from "@/lib/api";
import { buildExplanation, solutionMarkdown } from "@/lib/explain";
import { downloadText } from "@/lib/image";
import { solveProblem } from "@/lib/physics";
import { useStore } from "@/lib/store";
import { deriveTitle } from "@/lib/text";
import { EXAMPLES, randomParams, templateMeta } from "@/lib/templates";
import type { Problem, ProblemParams, StageApi, StageOptions, TemplateId } from "@/lib/types";
import { useBreakpoint } from "@/lib/use-media";
import { BrandMark, PaneToggle, ServiceBadge, StorageBadge } from "./Chrome";
import { PaneResizer } from "./PaneResizer";
import { LibraryPanel } from "@/src/features/library/LibraryPanel";
import { StageView } from "@/src/features/stage/StageView";
import { ParameterPanel } from "@/src/features/stage/ParameterPanel";
import { InsightPanel } from "@/src/features/explain/InsightPanel";
import { ConversationPanel } from "@/src/features/explain/ConversationPanel";
import { CriticalPoints } from "@/src/features/library/CriticalPoints";

interface LayoutProps {
  configured: boolean | null;
  onNewProblem: () => void;
  onHome: () => void;
  onOpenSession: (id: string, showProblem?: boolean) => void;
  title: string;
  projectName?: string;
  composing?: boolean;
  showProblem?: boolean;
  onBackToLibrary?: () => void;
  children: ReactNode;
  parameters?: ReactNode;
  conversation?: ReactNode;
  criticalPoints?: ReactNode;
}

export function StudyLayout({ configured, onNewProblem, onHome, onOpenSession, title, projectName, composing = false, showProblem = false, onBackToLibrary = () => {}, children, parameters, conversation, criticalPoints }: LayoutProps) {
  const { prefs, setPrefs, mode } = useStore();
  const bp = useBreakpoint();
  const [leftDrawer, setLeftDrawer] = useState(bp.mobile && showProblem);
  const [rightDrawer, setRightDrawer] = useState(false);
  useEffect(() => {
    if (!bp.mobile) setLeftDrawer(false);
    if (bp.desktop) setRightDrawer(false);
  }, [bp.mobile, bp.desktop]);
  const library = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-4 pb-1"><Button variant="outline" className="w-full justify-start gap-2 rounded-xl" onClick={() => { setLeftDrawer(false); onNewProblem(); }}><Plus /> 新建题目会话</Button></div>
      <div className="min-h-0 flex-1"><LibraryPanel showProblem={!composing && showProblem} onBackToLibrary={onBackToLibrary} onOpenSession={(id, detail) => { if (!detail) setLeftDrawer(false); onOpenSession(id, detail); }} /></div>
    </div>
  );
  const controls = parameters ?? (
    <div className="flex flex-col gap-4 p-5">
      <SlidersHorizontal className="size-5 text-muted-foreground" />
      <h2 className="text-sm font-semibold">动画参数</h2>
      <p className="text-xs leading-6 text-muted-foreground">生成一道题目后，在这里调节参数，观察轨迹和题解如何一起变化。</p>
      <div className="rounded-xl border border-dashed border-border p-4 font-mono text-xs leading-8 text-muted-foreground">抛体 v₀ · θ · h₀<br />斜面 m · θ · μ · L<br />滑块木板 m · M · L · μ<br />碰撞 m₁ · m₂ · v₁ · v₂ · e</div>
      <p className="text-xs leading-6 text-muted-foreground">当前接入抛体、斜面下滑、滑块木板与一维碰撞四类模型；其余题型陆续加入。</p>
    </div>
  );
  const rightPanel = (
    <Tabs value={prefs.rightTab} onValueChange={(value) => setPrefs({ rightTab: value === "chat" || value === "states" ? value : "parameters" })} className="h-full min-h-0 gap-0">
      <div className="shrink-0 border-b border-border p-3">
        <TabsList className="w-full" aria-label="右侧面板">
          <TabsTrigger value="parameters" className="text-foreground/85"><SlidersHorizontal />动画参数</TabsTrigger>
          <TabsTrigger value="chat" className="text-foreground/85"><MessageSquare />对话</TabsTrigger>
          <TabsTrigger value="states" className="text-foreground/85"><Crosshair />对象与受力</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="parameters" forceMount className="min-h-0 overflow-y-auto data-[state=inactive]:hidden">{controls}</TabsContent>
      <TabsContent value="chat" forceMount className="min-h-0 overflow-hidden data-[state=inactive]:hidden">{conversation ?? <p className="p-5 text-xs leading-7 text-muted-foreground">打开或新建一道题目后，可以在这里提问、复制内容和编辑题目。</p>}</TabsContent>
      <TabsContent value="states" forceMount className="min-h-0 overflow-y-auto data-[state=inactive]:hidden">{criticalPoints ?? <p className="p-5 text-xs leading-7 text-muted-foreground">打开一道题目后，这里列出每个临界状态点的受力与速度。</p>}</TabsContent>
    </Tabs>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <button type="button" onClick={onHome} aria-label="返回格物首页" className="shrink-0 rounded-lg text-left"><BrandMark compact /></button>
          <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground lg:block" />
          <span className="hidden truncate text-xs text-muted-foreground lg:block">{projectName ?? "学习空间"}</span>
        </div>
        <h1 className="min-w-0 flex-1 truncate text-center text-xs font-medium lg:text-sm" aria-label="当前会话名称" title={title}>{title}</h1>
        <div className="flex shrink-0 items-center justify-end gap-1">
          <div className="hidden 2xl:block"><ServiceBadge configured={configured} /></div>
          <StorageBadge mode={mode} />
          {bp.mobile ? (
            <Sheet open={leftDrawer} onOpenChange={setLeftDrawer}>
              <SheetTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="打开题库"><BookOpen /></Button></SheetTrigger>
              <SheetContent side="left" aria-modal="true" className="w-[88vw] gap-0 p-0 sm:max-w-[360px]">
                <SheetHeader className="border-b border-border"><SheetTitle>题库与题目</SheetTitle><SheetDescription>选择题目，查看原文与图片。</SheetDescription></SheetHeader>
                <div className="min-h-0 flex-1">{library}</div>
              </SheetContent>
            </Sheet>
          ) : <PaneToggle side="left" open={prefs.leftOpen} onToggle={() => setPrefs({ leftOpen: !prefs.leftOpen })} />}
          {bp.desktop ? <PaneToggle side="right" open={prefs.rightOpen} onToggle={() => setPrefs({ rightOpen: !prefs.rightOpen })} /> : (
            <Sheet open={rightDrawer} onOpenChange={setRightDrawer}>
              <SheetTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="打开参数与对话"><SlidersHorizontal /></Button></SheetTrigger>
              <SheetContent side="right" aria-modal="true" className="w-[92vw] gap-0 p-0 sm:max-w-[400px]">
                <SheetHeader className="border-b border-border"><SheetTitle>动画参数与对话</SheetTitle><SheetDescription>调节动画参数，或切换到对话继续提问。</SheetDescription></SheetHeader>
                <div className="min-h-0 flex-1">{rightPanel}</div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {!bp.mobile && prefs.leftOpen && <>
          <aside className="min-h-0 shrink-0 bg-card" style={{ width: bp.desktop ? `min(${prefs.leftWidth}px, 24vw)` : Math.min(prefs.leftWidth, 280) }} aria-label="题库与当前题目">{library}</aside>
          <PaneResizer side="left" width={prefs.leftWidth} min={240} max={360} onWidth={(leftWidth) => setPrefs({ leftWidth })} />
        </>}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain scrollbar-none" aria-label="题目学习会话">
          <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-4 py-6 lg:px-7">{children}</div>
        </main>
        {bp.desktop && prefs.rightOpen && <>
          <PaneResizer side="right" width={prefs.rightWidth} min={280} max={420} onWidth={(rightWidth) => setPrefs({ rightWidth })} />
          <aside className="min-h-0 shrink-0 overflow-hidden bg-card" style={{ width: `min(${prefs.rightWidth}px, 26vw)` }} aria-label="动画参数与对话">{rightPanel}</aside>
        </>}
      </div>
    </div>
  );
}

interface Props {
  configured: boolean | null;
  onNewProblem: () => void;
  onHome: () => void;
  onOpenSession: (id: string, showProblem?: boolean) => void;
  showProblem: boolean;
  onBackToLibrary: () => void;
}

export function Workspace({ configured, onNewProblem, onHome, onOpenSession, showProblem, onBackToLibrary }: Props) {
  const { activeSession, projects, prefs, setPrefs, updateSession } = useStore();
  const bp = useBreakpoint();
  const session = activeSession!;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [liveParams, setLiveParams] = useState<ProblemParams>(session.problem.params);
  const [activePhase, setActivePhase] = useState(0);
  const [aiBusy, setAiBusy] = useState(false);
  const aiVersion = useRef(0);
  const stageApi = useRef<StageApi | null>(null);
  const pendingRef = useRef<ProblemParams | null>(null);
  const timerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    const current = sessionRef.current;
    updateSession(current.id, { problem: { ...current.problem, params: pending }, insight: undefined, aiAnswers: undefined });
  }, [updateSession]);
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); aiVersion.current++; };
  }, [flush]);

  const onParams = useCallback((params: ProblemParams, immediate = false) => {
    aiVersion.current++;
    setLiveParams(params);
    pendingRef.current = params;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (immediate) flush();
    else timerRef.current = window.setTimeout(flush, 320);
  }, [flush]);
  const problem = useMemo<Problem>(() => ({ ...session.problem, params: liveParams }), [session.problem, liveParams]);
  const result = useMemo(() => solveProblem(problem), [problem]);
  const paramsSaved = JSON.stringify(liveParams) === JSON.stringify(session.problem.params);
  const explanation = useMemo(() => buildExplanation(problem, result, session.questions, paramsSaved ? session.aiAnswers : undefined), [problem, result, session.questions, session.aiAnswers, paramsSaved]);
  const phases = explanation.phases;
  const exploring = JSON.stringify(liveParams) !== JSON.stringify(session.baseParams);
  const onPhaseChange = useCallback((index: number) => setActivePhase(index), []);
  const onOptions = useCallback((patch: Partial<StageOptions>) => setPrefs({ stage: patch }), [setPrefs]);
  const onSpeed = useCallback((speed: number) => setPrefs({ speed }), [setPrefs]);
  const onLoop = useCallback((loop: boolean) => setPrefs({ loop }), [setPrefs]);
  const openSession = (id: string, detail?: boolean) => { flush(); onOpenSession(id, detail); };
  const leave = (action: () => void) => { flush(); action(); };

  const randomize = useCallback(() => {
    onParams(randomParams(sessionRef.current.problem.template));
    toast("已随机生成一组参数", { duration: 2200 });
  }, [onParams]);
  const changeTemplate = useCallback((template: TemplateId) => {
    const current = sessionRef.current;
    if (template === current.problem.template) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
    aiVersion.current++;
    const meta = templateMeta(template);
    const example = EXAMPLES.find((e) => e.template === template);
    const params = meta.defaults;
    const statement = example?.statement ?? current.problem.statement;
    const ask = example?.ask ?? meta.asks;
    setLiveParams(params);
    const next: Problem = { version: 1, template, statement, params, ask };
    updateSession(current.id, {
      problem: next,
      baseParams: params,
      title: deriveTitle(statement, params, template),
      questions: [],
      questionTimes: {},
      insight: undefined,
      aiAnswers: undefined,
      solutionEdits: {},
    });
    toast(`已切换到「${meta.label}」示例`, { duration: 2200 });
  }, [updateSession]);
  const exportSolution = useCallback(() => {
    const current = sessionRef.current;
    downloadText(solutionMarkdown(problem, result, explanation, current.questions, { exam: current.solutionEdits?.exam?.text, detail: current.solutionEdits?.detail?.text }), `格物题解-${current.title.slice(0, 20)}.md`);
    toast.success("题解已导出为 Markdown", { duration: 2400 });
  }, [problem, result, explanation]);
  const ask = useCallback((question: string) => {
    const current = sessionRef.current;
    if (current.questions.some((q) => q.trim() === question.trim())) toast("这个问题已经在对话里了");
    else {
      aiVersion.current++;
      updateSession(current.id, { questions: [...current.questions, question], questionTimes: { ...current.questionTimes, [question]: Date.now() } });
    }
  }, [updateSession]);
  const editProblem = useCallback((next: Problem) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
    aiVersion.current++;
    const current = sessionRef.current;
    setLiveParams(next.params);
    updateSession(current.id, {
      problem: next,
      baseParams: next.params,
      title: current.title === deriveTitle(current.problem.statement, current.baseParams, current.problem.template) ? deriveTitle(next.statement, next.params, next.template) : current.title,
      insight: undefined,
      aiAnswers: undefined,
    });
    toast.success("题目已保存，动画与题解已更新");
  }, [updateSession]);
  const saveSolution = useCallback((kind: "exam" | "detail", text: string | null) => {
    const edits = { ...sessionRef.current.solutionEdits };
    if (text === null) delete edits[kind];
    else edits[kind] = { text, signature: JSON.stringify([problem.statement, problem.params, problem.ask]) };
    updateSession(sessionRef.current.id, { solutionEdits: edits });
  }, [problem, updateSession]);
  const aiExplain = useCallback(async () => {
    if (configured !== true || aiBusy) return;
    flush();
    const current = sessionRef.current;
    const version = ++aiVersion.current;
    setAiBusy(true);
    try {
      const summary = result.template === "projectile"
        ? { range: result.range, maxHeight: result.maxHeight, flightTime: result.flightTime, apexTime: result.apexTime }
        : { duration: result.duration, scalars: Object.fromEntries(result.scalars.map((s) => [s.key, { label: s.label, value: s.value, unit: s.unit }])) };
      const data = await requestJson("/functions/v1/app/explain", { method: "POST", body: JSON.stringify({ problem, summary, questions: current.questions }) }) as { ok: true; insight?: string; answers?: { question: string; answer: string }[] };
      if (version !== aiVersion.current) return;
      updateSession(current.id, { insight: data.insight?.trim() || current.insight, aiAnswers: data.answers?.length ? data.answers : current.aiAnswers });
      toast.success("AI 深度讲解已生成");
    } catch (error) {
      if (version === aiVersion.current) toast.error(error instanceof ApiError ? error.message : "AI 讲解暂时不可用", { description: "本地物理推导不受影响。" });
    } finally { setAiBusy(false); }
  }, [configured, aiBusy, problem, result, updateSession, flush]);

  return (
    <StudyLayout configured={configured} onNewProblem={() => leave(onNewProblem)} onHome={() => leave(onHome)} onOpenSession={openSession} title={session.title} projectName={projects.find((p) => p.id === session.projectId)?.name} showProblem={showProblem} onBackToLibrary={onBackToLibrary}
      criticalPoints={<CriticalPoints problem={problem} result={result} onSeek={(time) => stageApi.current?.seekState(time)} onExport={(time, label) => stageApi.current?.exportPng(time, label)} onExportAll={() => stageApi.current?.exportCritical()} />}
      parameters={<ParameterPanel template={problem.template} params={liveParams} baseParams={session.baseParams} onTemplate={changeTemplate} onParams={onParams} options={prefs.stage} onOptions={onOptions} notes={explanation.params} onRandom={randomize} />}
      conversation={<ConversationPanel session={session} explanation={explanation} configured={configured} aiBusy={aiBusy} insight={paramsSaved ? session.insight : undefined} exploring={exploring} onAsk={ask} onAiExplain={aiExplain} onEditProblem={editProblem} />}>
      {exploring && <p className="text-xs text-vy">当前为参数探究：动画与题解使用右侧参数，原题干保持不变。</p>}
      <section className="min-w-0 rounded-2xl border border-border bg-card p-3 sm:p-4" aria-label="动画演示">
        <div className="mb-3 flex items-center gap-3"><span className="font-mono text-xs text-muted-foreground">01</span><h2 className="text-sm font-semibold">动画演示</h2><span className="ml-auto text-[10px] text-muted-foreground">先观察，再推导</span></div>
        <StageView problem={problem} result={result} params={liveParams} options={prefs.stage} onOptions={onOptions} speed={prefs.speed} onSpeed={onSpeed} loop={prefs.loop} onLoop={onLoop} phases={phases} activePhase={activePhase} onPhaseChange={onPhaseChange} apiRef={stageApi} onExportSolution={exportSolution} compact={bp.mobile} />
      </section>
      <InsightPanel problem={problem} result={result} onExportSolution={exportSolution} solutionEdits={session.solutionEdits} onSaveSolution={saveSolution} />
      <p className="pb-3 text-center text-[10px] text-muted-foreground">理想模型 · 忽略空气阻力 · 动画与题解使用同一解析解</p>
    </StudyLayout>
  );
}
