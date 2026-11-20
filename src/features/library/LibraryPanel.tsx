import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  FolderPlus,
  GripVertical,
  ListFilter,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  ZoomIn,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { copyText } from "@/lib/image";
import { solveProjectile } from "@/lib/physics";
import { filterSessions, sortSessions, useStore } from "@/lib/store";
import { deriveTitle, kindLabel } from "@/lib/text";
import type { LibraryFilter, LibrarySort, ProjectRecord, SessionRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "./ImageLightbox";

const SOURCE_LABEL: Record<SessionRecord["source"], string> = {
  photo: "图片识题",
  text: "文本输入",
  example: "示例题",
};

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

interface Props {
  onNewProblem: () => void;
  onOpenSession: (id: string) => void;
  showCurrent?: boolean;
}

export function LibraryPanel({ onNewProblem, onOpenSession, showCurrent = true }: Props) {
  const {
    projects,
    sessions,
    activeSession,
    prefs,
    setPrefs,
    updateSession,
    deleteSessions,
    restoreSessions,
    moveSession,
    createProject,
    renameProject,
    deleteProject,
  } = useStore();

  const [query, setQuery] = useState("");
  const [manage, setManage] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ projectId: string; beforeId: string | null } | null>(null);
  const [renaming, setRenaming] = useState<{ kind: "project" | "session"; id: string; value: string } | null>(null);
  const [zoom, setZoom] = useState(false);
  const [statementDraft, setStatementDraft] = useState("");
  const [questionsDraft, setQuestionsDraft] = useState("");
  const [newProject, setNewProject] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStatementDraft(activeSession?.problem.statement ?? "");
    setQuestionsDraft(activeSession?.questions.join("\n") ?? "");
  }, [activeSession?.id, activeSession?.problem.statement, activeSession?.questions]);

  const visible = useMemo(
    () => filterSessions(sortSessions(sessions, prefs.librarySort), prefs.libraryFilter, query),
    [sessions, prefs.librarySort, prefs.libraryFilter, query],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, SessionRecord[]>();
    for (const p of projects) map.set(p.id, []);
    for (const s of visible) {
      const list = map.get(s.projectId);
      if (list) list.push(s);
      else map.set(s.projectId, [s]);
    }
    return map;
  }, [projects, visible]);

  const commitStatement = () => {
    if (!activeSession) return;
    const value = statementDraft.trim();
    if (!value || value === activeSession.problem.statement) {
      setStatementDraft(activeSession.problem.statement);
      return;
    }
    updateSession(activeSession.id, {
      problem: { ...activeSession.problem, statement: value },
      title: deriveTitle(value, activeSession.problem.params),
    });
    toast.success("题目内容已更新", { duration: 1800 });
  };

  const commitQuestions = () => {
    if (!activeSession) return;
    const list = questionsDraft.split("\n").map((q) => q.trim()).filter(Boolean);
    if (list.join("\n") === activeSession.questions.join("\n")) return;
    updateSession(activeSession.id, { questions: list });
    toast.success(`已保存 ${list.length} 条提问`, { duration: 1800 });
  };

  const removeSessions = (ids: string[]) => {
    const removed = deleteSessions(ids);
    if (!removed.length) return;
    setSelected((prev) => prev.filter((id) => !ids.includes(id)));
    toast.success(`已删除 ${removed.length} 道题`, {
      description: removed.length === 1 ? removed[0].title : "可从撤销恢复",
      duration: 6000,
      action: { label: "撤销", onClick: () => restoreSessions(removed) },
    });
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const commitRename = () => {
    if (!renaming) return;
    const value = renaming.value.trim();
    if (value) {
      if (renaming.kind === "project") renameProject(renaming.id, value);
      else updateSession(renaming.id, { title: value.slice(0, 40) });
    }
    setRenaming(null);
  };

  const shift = (session: SessionRecord, dir: -1 | 1) => {
    const siblings = sessions
      .filter((s) => s.projectId === session.projectId)
      .sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((s) => s.id === session.id);
    const target = siblings[idx + dir];
    if (!target) return;
    moveSession(session.id, session.projectId, dir === -1 ? target.id : siblings[idx + 2]?.id ?? null);
    preferManualSort();
  };

  const preferManualSort = () => {
    if (prefs.librarySort === "manual") return;
    setPrefs({ librarySort: "manual" });
    toast("已切换为手动排序", { description: "拖拽与上移/下移的顺序会被保留。", duration: 2400 });
  };

  // 下拉菜单关闭时会把焦点还给触发按钮，这里把焦点抢回重命名输入框。
  useEffect(() => {
    if (!renaming) return;
    const selector = renaming.kind === "project" ? '[aria-label="项目名称"]' : '[aria-label="题目标题"]';
    const timer = window.setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(selector);
      el?.focus();
      el?.select();
    }, 60);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renaming?.kind, renaming?.id]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showCurrent && <details className="order-last shrink-0 border-t border-border p-3">
        <summary className="cursor-pointer text-xs font-medium">编辑当前题目</summary>
        <div className="mt-3 max-h-[42vh] overflow-y-auto">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground">当前题目</h2>
          {activeSession && (
            <Badge variant="outline" className="ml-auto px-1.5 text-[10px]">
              {SOURCE_LABEL[activeSession.source]}
            </Badge>
          )}
        </div>
        {activeSession ? (
          <div className="flex flex-col gap-2.5">
            {activeSession.image ? (
              <button
                type="button"
                onClick={() => setZoom(true)}
                className="group relative overflow-hidden rounded-lg border border-border"
                aria-label="放大查看上传的题目照片"
              >
                <img src={activeSession.image} alt="上传的题目照片缩略图" className="h-24 w-full object-cover" />
                <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="flex items-center gap-1 text-[11px] text-white"><ZoomIn className="size-3.5" /> 点击放大</span>
                </span>
              </button>
            ) : (
              <div
                className="flex h-16 items-center justify-center rounded-lg font-mono text-xs text-white"
                style={{ background: "linear-gradient(135deg, var(--gw-info), var(--site-accent))" }}
              >
                {kindLabel(activeSession.problem.params)} · 无图片
              </div>
            )}
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="size-1.5 rounded-full" style={{ background: "var(--gw-info)" }} />
                题目内容（失焦即保存）
              </span>
              <Textarea
                value={statementDraft}
                rows={3}
                aria-label="题目内容"
                className="min-h-[72px] resize-y text-xs leading-relaxed"
                onChange={(e) => setStatementDraft(e.target.value)}
                onBlur={commitStatement}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="size-1.5 rounded-full" style={{ background: "var(--gw-vx)" }} />
                你的问题（每行一条）
              </span>
              <Textarea
                value={questionsDraft}
                rows={2}
                placeholder="还没有提问，可在会话下方追加"
                aria-label="用户提问"
                className="min-h-[56px] resize-y text-xs leading-relaxed"
                onChange={(e) => setQuestionsDraft(e.target.value)}
                onBlur={commitQuestions}
              />
            </label>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="xs"
                onClick={async () => {
                  const ok = await copyText(activeSession.problem.statement);
                  toast[ok ? "success" : "error"](ok ? "题干已复制" : "复制失败，请手动选择文本");
                }}
              >
                <Copy /> 复制题干
              </Button>
              <Button variant="ghost" size="xs" onClick={onNewProblem}>
                <Plus /> 新题目
              </Button>
            </div>
          </div>
        ) : (
          <p className="rounded-lg gw-inset p-3 text-xs leading-relaxed text-muted-foreground">
            还没有打开题目。从下方题库选一条，或回到入口上传新题。
          </p>
        )}
        </div>
      </details>}

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 px-3 pt-3">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground">题库</h2>
          <span className="font-mono text-[10px] text-muted-foreground">{sessions.length}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant={manage ? "secondary" : "ghost"}
              size="icon-xs"
              aria-label={manage ? "退出批量管理" : "批量管理"}
              aria-pressed={manage}
              onClick={() => { setManage((m) => !m); setSelected([]); }}
            >
              <ListFilter />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="新建项目"
              onClick={() => setNewProject("")}
            >
              <FolderPlus />
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索题干 / 标题 / 提问"
              aria-label="搜索题库"
              className="h-8 pl-8 text-xs"
            />
            {query && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                aria-label="清空搜索"
                onClick={() => setQuery("")}
              >
                <X />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1">
            {([
              ["all", "全部"],
              ["photo", "图片"],
              ["text", "文本"],
              ["example", "示例"],
            ] as [LibraryFilter, string][]).map(([value, label]) => (
              <Button
                key={value}
                variant={prefs.libraryFilter === value ? "secondary" : "ghost"}
                size="xs"
                className="px-2"
                aria-pressed={prefs.libraryFilter === value}
                onClick={() => setPrefs({ libraryFilter: value })}
              >
                {label}
              </Button>
            ))}
            <Select
              value={prefs.librarySort}
              onValueChange={(v) => setPrefs({ librarySort: v as LibrarySort })}
            >
              <SelectTrigger size="sm" className="ml-auto h-7 w-[104px] text-[11px]" aria-label="排序方式">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">最近更新</SelectItem>
                <SelectItem value="created">最近创建</SelectItem>
                <SelectItem value="title">按标题</SelectItem>
                <SelectItem value="manual">手动排序</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {newProject !== null && (
            <div className="flex items-center gap-1.5">
              <Input
                autoFocus
                value={newProject}
                placeholder="项目名称"
                aria-label="新项目名称"
                className="h-7 text-xs"
                onChange={(e) => setNewProject(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (newProject.trim()) {
                      createProject(newProject);
                      toast.success("项目已创建");
                    }
                    setNewProject(null);
                  }
                  if (e.key === "Escape") setNewProject(null);
                }}
              />
              <Button
                size="xs"
                onClick={() => {
                  if (newProject.trim()) {
                    createProject(newProject);
                    toast.success("项目已创建");
                  }
                  setNewProject(null);
                }}
              >
                创建
              </Button>
            </div>
          )}
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {projects.map((project) => (
            <ProjectGroup
              key={project.id}
              project={project}
              items={grouped.get(project.id) ?? []}
              collapsed={collapsed.includes(project.id)}
              onToggleCollapse={() =>
                setCollapsed((prev) =>
                  prev.includes(project.id) ? prev.filter((x) => x !== project.id) : [...prev, project.id],
                )
              }
              manage={manage}
              selected={selected}
              activeId={activeSession?.id ?? null}
              dragId={dragId}
              dropTarget={dropTarget}
              renaming={renaming}
              onRename={setRenaming}
              onCommitRename={commitRename}
              onOpen={onOpenSession}
              onToggleSelected={toggleSelected}
              onDelete={(ids) => removeSessions(ids)}
              onShift={shift}
              onDragStart={setDragId}
              onDragOverTarget={setDropTarget}
              onDrop={(projectId, beforeId) => {
                if (dragId) {
                  moveSession(dragId, projectId, beforeId);
                  preferManualSort();
                }
                setDragId(null);
                setDropTarget(null);
              }}
              onDragEnd={() => { setDragId(null); setDropTarget(null); }}
              onDeleteProject={() => {
                const target = projects.find((p) => p.id !== project.id);
                deleteProject(project.id);
                toast.success(`项目「${project.name}」已删除`, {
                  description: target ? `其中题目已移到「${target.name}」` : undefined,
                });
              }}
              canDeleteProject={projects.length > 1}
            />
          ))}
          {visible.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              {sessions.length === 0 ? "题库为空，去入口上传第一道题。" : "没有匹配的题目，换个关键词或筛选条件。"}
            </p>
          )}
        </div>

        {manage && (
          <div className="flex items-center gap-2 border-t border-border bg-secondary/60 px-3 py-2">
            <span className="text-xs text-muted-foreground">已选 {selected.length} 项</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSelected(visible.map((s) => s.id))}
            >
              全选
            </Button>
            <Button
              variant="destructive"
              size="xs"
              disabled={!selected.length}
              onClick={() => removeSessions(selected)}
            >
              <Trash2 /> 删除
            </Button>
            <Button variant="ghost" size="xs" className="ml-auto" onClick={() => { setManage(false); setSelected([]); }}>
              完成
            </Button>
          </div>
        )}
      </section>

      {activeSession?.image && (
        <ImageLightbox
          open={zoom}
          onOpenChange={setZoom}
          src={activeSession.image}
          name={activeSession.imageName}
        />
      )}
    </div>
  );
}

interface GroupProps {
  project: ProjectRecord;
  items: SessionRecord[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  manage: boolean;
  selected: string[];
  activeId: string | null;
  dragId: string | null;
  dropTarget: { projectId: string; beforeId: string | null } | null;
  renaming: { kind: "project" | "session"; id: string; value: string } | null;
  onRename: (value: { kind: "project" | "session"; id: string; value: string } | null) => void;
  onCommitRename: () => void;
  onOpen: (id: string) => void;
  onToggleSelected: (id: string) => void;
  onDelete: (ids: string[]) => void;
  onShift: (session: SessionRecord, dir: -1 | 1) => void;
  onDragStart: (id: string | null) => void;
  onDragOverTarget: (target: { projectId: string; beforeId: string | null } | null) => void;
  onDrop: (projectId: string, beforeId: string | null) => void;
  onDragEnd: () => void;
  onDeleteProject: () => void;
  canDeleteProject: boolean;
}

function ProjectGroup(props: GroupProps) {
  const { project, items, collapsed, manage, selected, activeId, dragId, dropTarget, renaming } = props;
  // 重命名时阻止 Radix 把焦点还给菜单触发按钮，否则输入框会立刻失焦并提交空改名。
  const keepFocus = useRef(false);
  const onCloseAutoFocus = (event: Event) => {
    if (!keepFocus.current) return;
    event.preventDefault();
    keepFocus.current = false;
  };
  return (
    <div className="mb-1">
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md px-1.5 py-1.5",
          dropTarget?.projectId === project.id && dropTarget.beforeId === null && "bg-primary/10",
        )}
        onDragOver={(e) => {
          if (!dragId) return;
          e.preventDefault();
          props.onDragOverTarget({ projectId: project.id, beforeId: null });
        }}
        onDrop={(e) => {
          e.preventDefault();
          props.onDrop(project.id, null);
        }}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={collapsed ? `展开项目 ${project.name}` : `折叠项目 ${project.name}`}
          aria-expanded={!collapsed}
          onClick={props.onToggleCollapse}
        >
          {collapsed ? <ChevronRight /> : <ChevronDown />}
        </Button>
        <Folder className="size-3.5 shrink-0 text-vy" />
        {renaming?.kind === "project" && renaming.id === project.id ? (
          <Input
            autoFocus
            value={renaming.value}
            aria-label="项目名称"
            className="h-6 flex-1 text-xs"
            onChange={(e) => props.onRename({ ...renaming, value: e.target.value })}
            onBlur={props.onCommitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") props.onCommitRename();
              if (e.key === "Escape") props.onRename(null);
            }}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-xs font-medium"
            onClick={props.onToggleCollapse}
            title={project.name}
          >
            {project.name}
          </button>
        )}
        <span className="font-mono text-[10px] text-muted-foreground">{items.length}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`项目 ${project.name} 的操作`}
              className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40" onCloseAutoFocus={onCloseAutoFocus}>
            <DropdownMenuItem
              onClick={() => {
                keepFocus.current = true;
                props.onRename({ kind: "project", id: project.id, value: project.name });
              }}
            >
              <Pencil /> 重命名
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={!props.canDeleteProject}
              onClick={props.onDeleteProject}
            >
              <Trash2 /> 删除项目
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!collapsed && (
        <ul className="ml-2 flex flex-col gap-0.5 border-l border-border pl-1.5">
          {items.map((session) => {
            const result = solveProjectile(session.problem.params);
            const isDropBefore = dropTarget?.projectId === project.id && dropTarget.beforeId === session.id;
            return (
              <li
                key={session.id}
                draggable={!manage}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", session.id);
                  e.dataTransfer.effectAllowed = "move";
                  props.onDragStart(session.id);
                }}
                onDragEnd={props.onDragEnd}
                onDragOver={(e) => {
                  if (!dragId || dragId === session.id) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const before = e.clientY < rect.top + rect.height / 2;
                  props.onDragOverTarget({
                    projectId: project.id,
                    beforeId: before ? session.id : null,
                  });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  props.onDrop(project.id, dropTarget?.beforeId ?? null);
                }}
                className={cn(
                  "group/item relative rounded-md transition-colors",
                  isDropBefore && "before:absolute before:-top-0.5 before:left-0 before:right-0 before:h-0.5 before:rounded-full before:bg-primary",
                  dragId === session.id && "opacity-40",
                )}
              >
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-md px-1.5 py-1.5",
                    activeId === session.id ? "bg-primary/12 ring-1 ring-primary/40" : "hover:bg-secondary",
                  )}
                >
                  {manage ? (
                    <Checkbox
                      checked={selected.includes(session.id)}
                      onCheckedChange={() => props.onToggleSelected(session.id)}
                      aria-label={`选择 ${session.title}`}
                      className="mt-1"
                    />
                  ) : (
                    <GripVertical className="mt-1 size-3.5 shrink-0 cursor-grab text-muted-foreground opacity-0 group-hover/item:opacity-100" />
                  )}
                  <button
                    type="button"
                    onClick={() => props.onOpen(session.id)}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    aria-current={activeId === session.id ? "true" : undefined}
                  >
                    {session.image ? (
                      <img src={session.image} alt="" className="mt-0.5 h-8 w-11 shrink-0 rounded object-cover" />
                    ) : (
                      <span
                        className="mt-0.5 grid h-8 w-11 shrink-0 place-items-center rounded font-mono text-[9px] text-white"
                        style={{ background: "linear-gradient(135deg, var(--gw-vx), var(--gw-info))" }}
                      >
                        {kindLabel(session.problem.params)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      {renaming?.kind === "session" && renaming.id === session.id ? (
                        <Input
                          autoFocus
                          value={renaming.value}
                          aria-label="题目标题"
                          className="h-6 text-xs"
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => props.onRename({ ...renaming, value: e.target.value })}
                          onBlur={props.onCommitRename}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") props.onCommitRename();
                            if (e.key === "Escape") props.onRename(null);
                          }}
                        />
                      ) : (
                        <span className="block truncate text-xs font-medium">{session.title}</span>
                      )}
                      <span className="mt-0.5 flex flex-wrap items-center gap-1 font-mono text-[10px] text-muted-foreground">
                        <span>X {result.range.toFixed(1)}m</span>
                        <span>·</span>
                        <span>T {result.flightTime.toFixed(2)}s</span>
                        <span>·</span>
                        <span>{relTime(session.updatedAt)}</span>
                      </span>
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`题目 ${session.title} 的操作`}
                        className="shrink-0 opacity-0 group-hover/item:opacity-100 data-[state=open]:opacity-100"
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44" onCloseAutoFocus={onCloseAutoFocus}>
                      <DropdownMenuItem onClick={() => props.onOpen(session.id)}>
                        <ZoomIn /> 打开工作台
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          keepFocus.current = true;
                          props.onRename({ kind: "session", id: session.id, value: session.title });
                        }}
                      >
                        <Pencil /> 重命名
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => props.onShift(session, -1)}>上移一位</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => props.onShift(session, 1)}>下移一位</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => props.onDelete([session.id])}>
                        <Trash2 /> 删除（可撤销）
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="px-2 py-2 text-[11px] text-muted-foreground">
              空项目 · 拖拽题目到此即可归组
            </li>
          )}
        </ul>
      )}
    </div>
  );
}