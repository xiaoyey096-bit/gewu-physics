import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BookOpen, ChevronRight, Plus, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ApiError, requestJson } from "@/lib/api";
import { buildExplanation, solutionMarkdown } from "@/lib/explain";
import { downloadText } from "@/lib/image";
import { solveProjectile } from "@/lib/physics";
import { useStore } from "@/lib/store";
import { kindLabel } from "@/lib/text";
import type { Problem, ProjectileParams, StageApi, StageOptions } from "@/lib/types";
import { useBreakpoint } from "@/lib/use-media";
import { BrandMark, PaneToggle, ServiceBadge, StorageBadge, ThemeToggle } from "./Chrome";
import { PaneResizer } from "./PaneResizer";
import { LibraryPanel } from "@/src/features/library/LibraryPanel";
import { StageView } from "@/src/features/stage/StageView";
import { ParameterPanel } from "@/src/features/stage/ParameterPanel";
import { InsightPanel } from "@/src/features/explain/InsightPanel";

interface LayoutProps {
  configured: boolean | null;
  onNewProblem: () => void;
  onHome: () => void;
  onOpenSession: (id: string) => void;
  title: string;
  projectName?: string;
  composing?: boolean;
  children: ReactNode;
  parameters?: ReactNode;
}

export function StudyLayout({ configured, onNewProblem, onHome, onOpenSession, title, projectName, composing = false, children, parameters }: LayoutProps) {
  const { prefs, setPrefs, mode } = useStore();
  const bp = useBreakpoint();
  const [leftDrawer, setLeftDrawer] = useState(false);
  const [rightDrawer, setRightDrawer] = useState(false);
  useEffect(() => {
    if (!bp.mobile) setLeftDrawer(false);
    if (bp.desktop) setRightDrawer(false);
  }, [bp.mobile, bp.desktop]);
  const library = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-4 pb-1"><Button variant="outline" className="w-full justify-start gap-2 rounded-xl" onClick={() => { setLeftDrawer(false); onNewProblem(); }}><Plus /> 新建题目会话</Button></div>
      <div className="min-h-0 flex-1"><LibraryPanel showCurrent={!composing} onNewProblem={onNewProblem} onOpenSession={(id) => { setLeftDrawer(false); onOpenSession(id); }} /></div>
      <p className="border-t border-border px-4 py-3 text-[10px] leading-5 text-muted-foreground">按章节建立项目，收藏每一次思考。<br />题库保存在当前浏览器。</p>
    </div>
  );
  const controls = parameters ?? (
    <div className="flex flex-col gap-4 p-5">
      <SlidersHorizontal className="size-5 text-muted-foreground" />
      <h2 className="text-sm font-semibold">动画参数</h2>
      <p className="text-xs leading-6 text-muted-foreground">生成一道题目后，在这里调节参数，观察轨迹和题解如何一起变化。</p>
      <div className="rounded-xl border border-dashed border-border p-4 font-mono text-xs leading-8 text-muted-foreground">v₀ · 初速度<br />θ · 抛射角<br />h₀ · 初始高度<br />g · 重力加速度</div>
      <p className="text-[11px] leading-6 text-muted-foreground">当前支持理想抛体运动：斜抛、平抛与竖直上抛。其他章节模型尚未接入。</p>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <button type="button" onClick={onHome} aria-label="返回格物首页" className="shrink-0 rounded-lg text-left"><BrandMark compact /></button>
        <ChevronRight className="hidden size-3.5 text-muted-foreground sm:block" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="hidden shrink-0 text-xs text-muted-foreground lg:inline">{projectName ?? "学习空间"}</span>
          <span className="truncate text-xs font-medium" title={title}>{title}</span>
        </div>
        <div className="hidden 2xl:block"><ServiceBadge configured={configured} /></div>
        <StorageBadge mode={mode} />
        <div className="flex shrink-0 items-center gap-1">
          {bp.mobile ? (
            <Sheet open={leftDrawer} onOpenChange={setLeftDrawer}>
              <SheetTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="打开题库"><BookOpen /></Button></SheetTrigger>
              <SheetContent side="left" aria-modal="true" className="w-[88vw] gap-0 p-0 sm:max-w-[360px]">
                <SheetHeader className="border-b border-border"><SheetTitle>题库</SheetTitle><SheetDescription>按项目收藏和管理题目会话。</SheetDescription></SheetHeader>
                <div className="min-h-0 flex-1">{library}</div>
              </SheetContent>
            </Sheet>
          ) : <PaneToggle side="left" open={prefs.leftOpen} onToggle={() => setPrefs({ leftOpen: !prefs.leftOpen })} />}
          {bp.desktop ? <PaneToggle side="right" open={prefs.rightOpen} onToggle={() => setPrefs({ rightOpen: !prefs.rightOpen })} /> : (
            <Sheet open={rightDrawer} onOpenChange={setRightDrawer}>
              <SheetTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="打开动画参数"><SlidersHorizontal /></Button></SheetTrigger>
              <SheetContent side="right" aria-modal="true" className="w-[92vw] gap-0 p-0 sm:max-w-[400px]">
                <SheetHeader className="border-b border-border"><SheetTitle>动画参数与讲解</SheetTitle><SheetDescription>调整参数后，动画与题解同步更新。</SheetDescription></SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto">{controls}</div>
              </SheetContent>
            </Sheet>
          )}
          <ThemeToggle />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {!bp.mobile && prefs.leftOpen && <>
          <aside className="min-h-0 shrink-0 bg-card" style={{ width: bp.desktop ? `min(${prefs.leftWidth}px, 24vw)` : Math.min(prefs.leftWidth, 280) }} aria-label="题库与当前题目">{library}</aside>
          <PaneResizer side="left" width={prefs.leftWidth} min={240} max={360} onWidth={(leftWidth) => setPrefs({ leftWidth })} />
        </>}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain" aria-label="题目学习会话">
          <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-4 py-6 lg:px-7">{children}</div>
        </main>
        {bp.desktop && prefs.rightOpen && <>
          <PaneResizer side="right" width={prefs.rightWidth} min={280} max={420} onWidth={(rightWidth) => setPrefs({ rightWidth })} />
          <aside className="min-h-0 shrink-0 overflow-y-auto bg-card" style={{ width: `min(${prefs.rightWidth}px, 26vw)` }} aria-label="动画参数与讲解">{controls}</aside>
        </>}
      </div>
    </div>
  );
}

interface Props {
  configured: boolean | null;
  onNewProblem: () => void;
  onHome: () => void;
}

export function Workspace({ configured, onNewProblem, onHome }: Props) {
  const { activeSession, projects, prefs, setPrefs, setActive, updateSession } = useStore();
  const bp = useBreakpoint();
  const session = activeSession!;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [liveParams, setLiveParams] = useState<ProjectileParams>(session.problem.params);
  const [activePhase, setActivePhase] = useState(0);
  const [aiBusy, setAiBusy] = useState(false);
  const stageApi = useRef<StageApi | null>(null);
  const pendingRef = useRef<ProjectileParams | null>(null);
  const timerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    const current = sessionRef.current;
    updateSession(current.id, { problem: { ...current.problem, params: pending } });
  }, [updateSession]);
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [flush]);

  const onParams = useCallback((params: ProjectileParams) => {
    setLiveParams(params);
    pendingRef.current = params;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, 320);
  }, [flush]);
  const result = useMemo(() => solveProjectile(liveParams), [liveParams]);
  const problem = useMemo<Problem>(() => ({ ...session.problem, params: liveParams }), [session.problem, liveParams]);
  const explanation = useMemo(() => buildExplanation(problem, result, session.questions, session.aiAnswers), [problem, result, session.questions, session.aiAnswers]);
  const phases = explanation.phases;
  const onPhaseChange = useCallback((index: number) => setActivePhase(index), []);
  const onOptions = useCallback((patch: Partial<StageOptions>) => setPrefs({ stage: patch }), [setPrefs]);
  const onSpeed = useCallback((speed: number) => setPrefs({ speed }), [setPrefs]);
  const onLoop = useCallback((loop: boolean) => setPrefs({ loop }), [setPrefs]);
  const seekPhase = useCallback((index: number) => { if (phases[index]) stageApi.current?.seek(phases[index].seek); }, [phases]);
  const openSession = (id: string) => { flush(); setActive(id); };
  const leave = (action: () => void) => { flush(); action(); };

  const randomize = useCallback(() => {
    const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
    onParams({ v0: Number((6 + Math.random() * 34).toFixed(1)), angleDeg: pick([0, 15, 30, 37, 45, 53, 60, 75, 90]), h0: pick([0, 0, 0, 5, 10, 20]), g: pick([9.8, 9.8, 10, 1.6, 3.7]) });
    toast("已随机生成一组参数", { duration: 2200 });
  }, [onParams]);
  const exportSolution = useCallback(() => {
    const current = sessionRef.current;
    downloadText(solutionMarkdown(problem, result, explanation, current.questions), `格物题解-${current.title.slice(0, 20)}.md`);
    toast.success("题解已导出为 Markdown", { duration: 2400 });
  }, [problem, result, explanation]);
  const ask = useCallback((question: string) => {
    const current = sessionRef.current;
    if (current.questions.some((q) => q.trim() === question.trim())) toast("这个问题已经在答疑列表里了");
    else { updateSession(current.id, { questions: [...current.questions, question] }); toast.success("已加入答疑"); }
  }, [updateSession]);
  const aiExplain = useCallback(async () => {
    if (configured !== true || aiBusy) return;
    const current = sessionRef.current;
    setAiBusy(true);
    try {
      const data = await requestJson("/functions/v1/app/explain", { method: "POST", body: JSON.stringify({ problem, summary: { range: result.range, maxHeight: result.maxHeight, flightTime: result.flightTime, apexTime: result.apexTime }, questions: current.questions }) }) as { ok: true; insight?: string; answers?: { question: string; answer: string }[] };
      updateSession(current.id, { insight: data.insight?.trim() || current.insight, aiAnswers: data.answers?.length ? data.answers : current.aiAnswers });
      toast.success("AI 深度讲解已生成");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "AI 讲解暂时不可用", { description: "本地物理推导不受影响。" });
    } finally { setAiBusy(false); }
  }, [configured, aiBusy, problem, result, updateSession]);

  return (
    <StudyLayout configured={configured} onNewProblem={() => leave(onNewProblem)} onHome={() => leave(onHome)} onOpenSession={openSession} title={session.title} projectName={projects.find((p) => p.id === session.projectId)?.name}
      parameters={<ParameterPanel params={liveParams} baseParams={session.baseParams} onParams={onParams} options={prefs.stage} onOptions={onOptions} notes={explanation.params} onRandom={randomize} />}>
      <section className="flex flex-col gap-3" aria-label="当前题干">
        <div className="flex items-center gap-2"><Badge variant="outline" className="bg-card text-[10px]">{kindLabel(liveParams)}</Badge><span className="text-[11px] text-muted-foreground">题目会话</span></div>
        <h1 className="text-base font-medium leading-8 tracking-wide">{session.problem.statement}</h1>
        {JSON.stringify(liveParams) !== JSON.stringify(session.baseParams) && <p className="text-xs text-vy">当前为参数探究：下方动画与题解使用右侧参数，原题干保持不变。</p>}
      </section>
      <section className="min-w-0 rounded-2xl border border-border bg-card p-3 sm:p-4" aria-label="动画演示">
        <div className="mb-3 flex items-center gap-3"><span className="font-mono text-xs text-muted-foreground">01</span><h2 className="text-sm font-semibold">动画演示</h2><span className="ml-auto text-[10px] text-muted-foreground">先观察，再推导</span></div>
        <StageView problem={problem} result={result} params={liveParams} options={prefs.stage} speed={prefs.speed} onSpeed={onSpeed} loop={prefs.loop} onLoop={onLoop} phases={phases} activePhase={activePhase} onPhaseChange={onPhaseChange} apiRef={stageApi} onExportSolution={exportSolution} compact={bp.mobile} />
      </section>
      <InsightPanel problem={problem} result={result} explanation={explanation} activePhase={activePhase} onSeekPhase={seekPhase} configured={configured} insight={session.insight} aiBusy={aiBusy} onAsk={ask} onAiExplain={aiExplain} onExportSolution={exportSolution} />
      <p className="pb-3 text-center text-[10px] text-muted-foreground">理想模型 · 忽略空气阻力 · 动画与题解使用同一解析解</p>
    </StudyLayout>
  );
}
