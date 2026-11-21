// 题库与偏好的持久化：IndexedDB 存会话/项目（含压缩图片），localStorage 存界面偏好。
// 任一存储不可用时自动降级，核心体验不中断，并如实告知当前保存模式。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_PREFS,
  type LibraryFilter,
  type LibrarySort,
  type Prefs,
  type ProjectRecord,
  type SessionRecord,
  type SessionSource,
  type StageOptions,
  type Problem,
} from "./types";
import { deriveTitle } from "./text";

const DB_NAME = "gewu-studio";
const DB_VERSION = 1;
const PREFS_KEY = "gewu-prefs-v2";
const FALLBACK_KEY = "gewu-studio-fallback-v2";

export type StorageMode = "indexeddb" | "local" | "memory";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let settled = false;
    const done = (value: IDBDatabase | null) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const timer = setTimeout(() => done(null), 4000);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
        if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      };
      req.onsuccess = () => {
        clearTimeout(timer);
        done(req.result);
      };
      req.onerror = () => {
        clearTimeout(timer);
        done(null);
      };
      req.onblocked = () => {
        clearTimeout(timer);
        done(null);
      };
    } catch {
      clearTimeout(timer);
      done(null);
    }
  });
}

function idbRequest<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = run(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexeddb failed"));
  });
}

interface Snapshot {
  projects: ProjectRecord[];
  sessions: SessionRecord[];
}

function readFallback(): Snapshot | null {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.sessions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeFallback(snapshot: Snapshot): boolean {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      rightTab: parsed.rightTab === "chat" ? "chat" : "parameters",
      stage: { ...DEFAULT_PREFS.stage, ...(parsed.stage ?? {}) },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function seedSnapshot(): Snapshot {
  const now = Date.now();
  const day = 86_400_000;
  const projects: ProjectRecord[] = [
    { id: "p-demo", name: "示例题库", kind: "auto", order: 0, createdAt: now - 6 * day },
    { id: "p-mine", name: "我的题目", kind: "custom", order: 1, createdAt: now - 5 * day },
  ];
  const make = (
    id: string,
    projectId: string,
    order: number,
    ageDays: number,
    statement: string,
    params: Problem["params"],
    ask: string[],
    questions: string[],
    source: SessionSource = "example",
  ): SessionRecord => ({
    id,
    projectId,
    title: deriveTitle(statement, params),
    source,
    createdAt: now - ageDays * day,
    updatedAt: now - ageDays * day + 3_600_000,
    order,
    problem: { version: 1, template: "projectile", statement, params, ask },
    baseParams: params,
    questions,
  });
  const sessions: SessionRecord[] = [
    make(
      "s-demo-1",
      "p-demo",
      0,
      2,
      "示例题：从地面以 20 m/s 的初速度、与水平方向成 30° 角斜向上抛出一小球，不计空气阻力，g 取 9.8 m/s²。求小球的射程、最大高度与飞行时间。",
      { v0: 20, angleDeg: 30, h0: 0, g: 9.8 },
      ["range", "maxHeight", "flightTime"],
      ["为什么水平方向的速度一直不变？"],
    ),
    make(
      "s-demo-2",
      "p-demo",
      1,
      3,
      "示例题：一架无人机在 20 m 高空以 12 m/s 的速度水平飞行，投放一个物资包，不计空气阻力，g 取 9.8 m/s²。求物资包落地点与投放点的水平距离、落地时间与落地速度大小。",
      { v0: 12, angleDeg: 0, h0: 20, g: 9.8 },
      ["range", "flightTime", "landingSpeed"],
      ["飞行时间由什么决定？"],
    ),
    make(
      "s-demo-3",
      "p-demo",
      2,
      4,
      "示例题：以 15 m/s 的初速度竖直向上抛出一石子，g 取 10 m/s²，不计空气阻力。求石子上升的最大高度与回到抛出点所用的时间。",
      { v0: 15, angleDeg: 90, h0: 0, g: 10 },
      ["maxHeight", "flightTime"],
      ["最高点时加速度为零吗？"],
    ),
    make(
      "s-mine-1",
      "p-mine",
      0,
      1,
      "探究题：在月球表面（g = 1.6 m/s²）以 8 m/s、与水平方向成 45° 抛出一枚样本舱，忽略阻力。求射程与滞空时间，并与地球情形对比。",
      { v0: 8, angleDeg: 45, h0: 0, g: 1.6 },
      ["range", "flightTime"],
      ["抛射角多大时射程最远？"],
      "text",
    ),
  ];
  return { projects, sessions };
}

export interface NewSessionInput {
  projectId?: string;
  problem: Problem;
  questions: string[];
  source: SessionSource;
  image?: string;
  imageName?: string;
  title?: string;
}

export type PrefsPatch = Partial<Omit<Prefs, "stage">> & { stage?: Partial<StageOptions> };

interface StoreValue {
  ready: boolean;
  mode: StorageMode;
  projects: ProjectRecord[];
  sessions: SessionRecord[];
  activeId: string | null;
  activeSession: SessionRecord | null;
  prefs: Prefs;
  setPrefs: (patch: PrefsPatch) => void;
  setActive: (id: string | null) => void;
  createSession: (input: NewSessionInput) => SessionRecord;
  updateSession: (id: string, patch: Partial<SessionRecord>) => void;
  deleteSessions: (ids: string[]) => SessionRecord[];
  restoreSessions: (records: SessionRecord[]) => void;
  moveSession: (id: string, projectId: string, beforeId: string | null) => void;
  createProject: (name: string) => ProjectRecord;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<StorageMode>("memory");
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs());

  const dbRef = useRef<IDBDatabase | null>(null);
  const modeRef = useRef<StorageMode>("memory");
  const projectsRef = useRef<ProjectRecord[]>([]);
  const sessionsRef = useRef<SessionRecord[]>([]);

  const persistSnapshot = useCallback(() => {
    if (modeRef.current !== "local") return;
    writeFallback({ projects: projectsRef.current, sessions: sessionsRef.current });
  }, []);

  const saveSessions = useCallback(
    (list: SessionRecord[]) => {
      const db = dbRef.current;
      if (db && list.length) {
        void Promise.all(list.map((s) => idbRequest(db, "sessions", "readwrite", (st) => st.put(s)))).catch(() => {
          modeRef.current = "local";
          setMode("local");
          persistSnapshot();
        });
      }
      persistSnapshot();
    },
    [persistSnapshot],
  );

  const removeSessions = useCallback(
    (ids: string[]) => {
      const db = dbRef.current;
      if (db && ids.length) {
        void Promise.all(ids.map((id) => idbRequest(db, "sessions", "readwrite", (st) => st.delete(id)))).catch(() => {
          modeRef.current = "local";
          setMode("local");
          persistSnapshot();
        });
      }
      persistSnapshot();
    },
    [persistSnapshot],
  );

  const saveProjects = useCallback(
    (list: ProjectRecord[]) => {
      const db = dbRef.current;
      if (db && list.length) {
        void Promise.all(list.map((p) => idbRequest(db, "projects", "readwrite", (st) => st.put(p)))).catch(() => {
          modeRef.current = "local";
          setMode("local");
          persistSnapshot();
        });
      }
      persistSnapshot();
    },
    [persistSnapshot],
  );

  const commitSessions = useCallback(
    (next: SessionRecord[], changed: SessionRecord[], removed: string[] = []) => {
      sessionsRef.current = next;
      setSessions(next);
      if (changed.length) saveSessions(changed);
      if (removed.length) removeSessions(removed);
    },
    [saveSessions, removeSessions],
  );

  const commitProjects = useCallback(
    (next: ProjectRecord[], changed: ProjectRecord[], removed: string[] = []) => {
      projectsRef.current = next;
      setProjects(next);
      if (changed.length) saveProjects(changed);
      const db = dbRef.current;
      if (db && removed.length) {
        void Promise.all(removed.map((id) => idbRequest(db, "projects", "readwrite", (st) => st.delete(id)))).catch(() => {});
      }
      persistSnapshot();
    },
    [saveProjects, persistSnapshot],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const db = await openDatabase();
      let snapshot: Snapshot | null = null;
      let nextMode: StorageMode = "memory";
      if (db) {
        try {
          const [p, s] = await Promise.all([
            idbRequest<ProjectRecord[]>(db, "projects", "readonly", (st) => st.getAll()),
            idbRequest<SessionRecord[]>(db, "sessions", "readonly", (st) => st.getAll()),
          ]);
          snapshot = { projects: p ?? [], sessions: s ?? [] };
          nextMode = "indexeddb";
        } catch {
          snapshot = null;
        }
      }
      if (!snapshot || !snapshot.projects.length) {
        const fallback = readFallback();
        if (fallback && fallback.projects.length) {
          snapshot = fallback;
          nextMode = db ? "indexeddb" : "local";
        }
      }
      if (!snapshot || !snapshot.projects.length) {
        snapshot = seedSnapshot();
        nextMode = db ? "indexeddb" : writeFallback(snapshot) ? "local" : "memory";
      }
      if (!alive) return;
      dbRef.current = db;
      modeRef.current = nextMode;
      setMode(nextMode);
      projectsRef.current = snapshot.projects;
      sessionsRef.current = snapshot.sessions.map((s) => ({
        ...s,
        baseParams: s.baseParams ?? s.problem.params,
        questions: Array.isArray(s.questions) ? s.questions : [],
      }));
      setProjects(snapshot.projects);
      setSessions(sessionsRef.current);
      if (db) {
        saveProjects(snapshot.projects);
        saveSessions(snapshot.sessions);
      } else if (nextMode === "local") {
        writeFallback(snapshot);
      }
      setReady(true);
    })();
    return () => {
      alive = false;
    };
    // 仅在挂载时加载一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPrefs = useCallback((patch: PrefsPatch) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch, stage: { ...prev.stage, ...(patch.stage ?? {}) } };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* 偏好写入失败不影响使用 */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = prefs.theme === "dark" || (prefs.theme === "system" && mq.matches);
      root.dataset.theme = dark ? "dark" : "light";
      root.style.colorScheme = dark ? "dark" : "light";
    };
    apply();
    if (prefs.theme === "system") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [prefs.theme]);

  const createSession = useCallback(
    (input: NewSessionInput): SessionRecord => {
      const list = sessionsRef.current;
      const projectId = input.projectId ?? projectsRef.current[0]?.id ?? "p-mine";
      const minOrder = list.filter((s) => s.projectId === projectId).reduce((m, s) => Math.min(m, s.order), 0);
      const now = Date.now();
      const record: SessionRecord = {
        id: uid("s"),
        projectId,
        title: input.title ?? deriveTitle(input.problem.statement, input.problem.params),
        source: input.source,
        createdAt: now,
        updatedAt: now,
        order: minOrder - 1,
        image: input.image,
        imageName: input.imageName,
        problem: input.problem,
        baseParams: input.problem.params,
        questions: input.questions,
        questionTimes: Object.fromEntries(input.questions.map((question) => [question, now])),
      };
      commitSessions([record, ...list], [record]);
      setActiveId(record.id);
      return record;
    },
    [commitSessions],
  );

  const updateSession = useCallback(
    (id: string, patch: Partial<SessionRecord>) => {
      const list = sessionsRef.current;
      const target = list.find((s) => s.id === id);
      if (!target) return;
      const next: SessionRecord = { ...target, ...patch, updatedAt: Date.now() };
      commitSessions(
        list.map((s) => (s.id === id ? next : s)),
        [next],
      );
    },
    [commitSessions],
  );

  const deleteSessions = useCallback(
    (ids: string[]): SessionRecord[] => {
      const set = new Set(ids);
      const removed = sessionsRef.current.filter((s) => set.has(s.id));
      if (!removed.length) return [];
      commitSessions(
        sessionsRef.current.filter((s) => !set.has(s.id)),
        [],
        ids,
      );
      setActiveId((cur) => (cur && set.has(cur) ? null : cur));
      return removed;
    },
    [commitSessions],
  );

  const restoreSessions = useCallback(
    (records: SessionRecord[]) => {
      if (!records.length) return;
      const existing = new Set(sessionsRef.current.map((s) => s.id));
      const added = records.filter((r) => !existing.has(r.id));
      commitSessions([...added, ...sessionsRef.current], added);
    },
    [commitSessions],
  );

  const moveSession = useCallback(
    (id: string, projectId: string, beforeId: string | null) => {
      const list = sessionsRef.current;
      const moving = list.find((s) => s.id === id);
      if (!moving || moving.id === beforeId) return;
      const rest = list.filter((s) => s.id !== id);
      const target = rest.filter((s) => s.projectId === projectId).sort((a, b) => a.order - b.order);
      const idx = beforeId ? target.findIndex((s) => s.id === beforeId) : target.length;
      const insertAt = idx < 0 ? target.length : idx;
      target.splice(insertAt, 0, { ...moving, projectId });
      const reindexed = target.map((s, i) => ({ ...s, order: i }));
      const changedMap = new Map(reindexed.map((s) => [s.id, s]));
      const others = rest.filter((s) => s.projectId !== projectId);
      const next = [...others, ...reindexed];
      const changed = next.filter((s) => {
        const old = list.find((o) => o.id === s.id);
        return changedMap.has(s.id) && (!old || old.order !== s.order || old.projectId !== s.projectId);
      });
      commitSessions(next, changed.length ? changed : [changedMap.get(id)!]);
    },
    [commitSessions],
  );

  const createProject = useCallback(
    (name: string): ProjectRecord => {
      const trimmed = name.trim() || "未命名项目";
      const maxOrder = projectsRef.current.reduce((m, p) => Math.max(m, p.order), -1);
      const record: ProjectRecord = {
        id: uid("p"),
        name: trimmed.slice(0, 24),
        kind: "custom",
        order: maxOrder + 1,
        createdAt: Date.now(),
      };
      commitProjects([...projectsRef.current, record], [record]);
      return record;
    },
    [commitProjects],
  );

  const renameProject = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const target = projectsRef.current.find((p) => p.id === id);
      if (!target) return;
      const next = { ...target, name: trimmed.slice(0, 24) };
      commitProjects(
        projectsRef.current.map((p) => (p.id === id ? next : p)),
        [next],
      );
    },
    [commitProjects],
  );

  const deleteProject = useCallback(
    (id: string) => {
      const remaining = projectsRef.current.filter((p) => p.id !== id);
      if (!remaining.length) return;
      const fallbackProject = remaining[0];
      const moved = sessionsRef.current
        .filter((s) => s.projectId === id)
        .map((s) => ({ ...s, projectId: fallbackProject.id }));
      commitProjects(remaining, [], [id]);
      if (moved.length) {
        const map = new Map(moved.map((s) => [s.id, s]));
        commitSessions(
          sessionsRef.current.map((s) => map.get(s.id) ?? s),
          moved,
        );
      }
    },
    [commitProjects, commitSessions],
  );

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      mode,
      projects: [...projects].sort((a, b) => a.order - b.order),
      sessions,
      activeId,
      activeSession,
      prefs,
      setPrefs,
      setActive: setActiveId,
      createSession,
      updateSession,
      deleteSessions,
      restoreSessions,
      moveSession,
      createProject,
      renameProject,
      deleteProject,
    }),
    [
      ready,
      mode,
      projects,
      sessions,
      activeId,
      activeSession,
      prefs,
      setPrefs,
      createSession,
      updateSession,
      deleteSessions,
      restoreSessions,
      moveSession,
      createProject,
      renameProject,
      deleteProject,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore 必须在 StoreProvider 内使用");
  return ctx;
}

export function sortSessions(list: SessionRecord[], sort: LibrarySort): SessionRecord[] {
  const copy = [...list];
  if (sort === "manual") return copy.sort((a, b) => a.order - b.order);
  if (sort === "title") return copy.sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));
  if (sort === "created") return copy.sort((a, b) => b.createdAt - a.createdAt);
  return copy.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function filterSessions(list: SessionRecord[], filter: LibraryFilter, query: string): SessionRecord[] {
  const q = query.trim().toLowerCase();
  return list.filter((s) => {
    if (filter !== "all" && s.source !== filter) return false;
    if (!q) return true;
    return (
      s.title.toLowerCase().includes(q) ||
      s.problem.statement.toLowerCase().includes(q) ||
      s.questions.some((x) => x.toLowerCase().includes(q))
    );
  });
}