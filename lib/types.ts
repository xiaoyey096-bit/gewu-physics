// 结构化题目 Schema 与求解结果类型（前端镜像，与 functions/schema.ts、functions/physics.ts 同步）。

export const SCHEMA_VERSION = 1;

export type TemplateId = "projectile";

export interface ProjectileParams {
  v0: number;
  angleDeg: number;
  h0: number;
  g: number;
}

export interface Problem {
  version: 1;
  template: TemplateId;
  statement: string;
  params: ProjectileParams;
  ask: string[];
}

export interface SolutionStep {
  title: string;
  formula: string;
  explanation: string;
}

export interface Series {
  n: number;
  duration: number;
  t: number[];
  x: number[];
  y: number[];
  vx: number[];
  vy: number[];
}

export interface SolveResult {
  template: "projectile";
  range: number;
  maxHeight: number;
  flightTime: number;
  apexTime: number;
  steps: SolutionStep[];
  series: Series;
}

export interface HealthInfo {
  ok: true;
  service: string;
  schemaVersion: number;
  templates: string[];
  recognizeConfigured: boolean;
}

/** 题库：项目（分组）→ 会话（一次题目 + 提问 + 动画参数）。 */
export interface ProjectRecord {
  id: string;
  name: string;
  kind: "auto" | "custom";
  order: number;
  createdAt: number;
}

export type SessionSource = "photo" | "text" | "example";

export interface SessionRecord {
  id: string;
  projectId: string;
  title: string;
  source: SessionSource;
  createdAt: number;
  updatedAt: number;
  order: number;
  image?: string;
  imageName?: string;
  problem: Problem;
  /** 识别/输入时的原始参数，供「重置参数」回到初始状态。 */
  baseParams: ProjectileParams;
  questions: string[];
  questionTimes?: Record<string, number>;
  solutionEdits?: Partial<Record<"exam" | "detail", { text: string; signature: string }>>;
  /** 云端 AI 深度讲解缓存（可选）。 */
  insight?: string;
  aiAnswers?: { question: string; answer: string }[];
}

export interface StageOptions {
  grid: boolean;
  vectors: boolean;
  trail: boolean;
  markers: boolean;
  strobe: boolean;
  glow: boolean;
  energy: boolean;
}

export type ThemeMode = "system" | "light" | "dark";
export type RightTab = "parameters" | "chat";
export type LibrarySort = "updated" | "created" | "title" | "manual";
export type LibraryFilter = "all" | "photo" | "text" | "example";

export interface Prefs {
  theme: ThemeMode;
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  speed: number;
  loop: boolean;
  rightTab: RightTab;
  stage: StageOptions;
  librarySort: LibrarySort;
  libraryFilter: LibraryFilter;
}

export interface ParamNote {
  key: keyof ProjectileParams;
  symbol: string;
  label: string;
  meaning: string;
  current: string;
  effect: string;
}

export interface Phase {
  id: string;
  title: string;
  text: string;
  start: number;
  end: number;
  seek: number;
}

export interface QaItem {
  question: string;
  answer: string[];
  evidence: string;
  source: "local" | "ai";
}

export interface Explanation {
  params: ParamNote[];
  phases: Phase[];
  qa: QaItem[];
}

export interface StageApi {
  seek: (t: number) => void;
  play: () => void;
  pause: () => void;
  replay: () => void;
  exportPng: (time?: number, label?: string) => void;
  exportCritical: () => void;
}

export const DEFAULT_STAGE: StageOptions = {
  grid: true,
  vectors: true,
  trail: true,
  markers: true,
  strobe: false,
  glow: true,
  energy: true,
};

export const DEFAULT_PREFS: Prefs = {
  theme: "light",
  leftOpen: true,
  rightOpen: true,
  leftWidth: 280,
  rightWidth: 320,
  speed: 1,
  loop: false,
  rightTab: "parameters",
  stage: DEFAULT_STAGE,
  librarySort: "updated",
  libraryFilter: "all",
};

export const SPEEDS = [0.25, 0.5, 1, 2] as const;

export const G_PRESETS = [
  { label: "地球 9.8", value: 9.8 },
  { label: "题目取 10", value: 10 },
  { label: "月球 1.6", value: 1.6 },
  { label: "火星 3.7", value: 3.7 },
] as const;