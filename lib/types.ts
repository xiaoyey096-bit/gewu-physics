// 结构化题目 Schema 与求解结果类型（前端镜像，与 functions/schema.ts、functions/physics.ts 同步）。

export const SCHEMA_VERSION = 1;

export type TemplateId = "projectile" | "incline" | "blockBoard" | "collision1d";

export interface ProjectileParams {
  v0: number;
  angleDeg: number;
  h0: number;
  g: number;
}

/** 斜面下滑：从斜面顶端以 v0 沿斜面向下运动，L 为斜面长度。 */
export interface InclineParams {
  m: number;
  angleDeg: number;
  mu: number;
  L: number;
  g: number;
  v0: number;
}

/** 滑块-木板：滑块 m 以 v0 滑上静止木板 M，板长 L，板与滑块间动摩擦因数 mu，木板与地面间动摩擦因数 muGround（0 表示光滑地面）。 */
export interface BlockBoardParams {
  m: number;
  M: number;
  L: number;
  v0: number;
  mu: number;
  muGround: number;
  g: number;
}

/** 一维正碰：m1、m2 以 v1、v2 运动，恢复系数 e（1 完全弹性，0 完全非弹性）。 */
export interface CollisionParams {
  m1: number;
  m2: number;
  v1: number;
  v2: number;
  e: number;
}

export type ProblemParams = ProjectileParams | InclineParams | BlockBoardParams | CollisionParams;

export interface Problem {
  version: 1;
  template: TemplateId;
  statement: string;
  params: ProblemParams;
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

export interface BodyTrack {
  id: string;
  label: string;
  shape: "ball" | "box" | "board";
  /** 采样轨迹；位置取物体中心（m）。 */
  series: Series;
  /** 渲染尺寸（m）：宽、高。 */
  w: number;
  h: number;
  /** 速度符号，用于力标签括号，如 v、v₁、v₂。 */
  velocitySymbol: string;
}

/** 一个力矢量：方向为世界坐标单位向量，大小为牛顿。 */
export interface ForceVector {
  /** 跨阶段稳定 id，用于判断“新出现的力”。 */
  id: string;
  /** 箭头标签：G、N、f、F 等。 */
  symbol: string;
  /** 中文名：重力、支持力、滑动摩擦力…… */
  name: string;
  /** 受力物体 id。 */
  body: string;
  dx: number;
  dy: number;
  /** 力的大小（N）。 */
  magnitude: number;
  /** 计算式，如 “μmg = 4 N”。 */
  formula: string;
}

/** 受力阶段：[from, to) 内各物体的受力情况。 */
export interface ForcePhase {
  id: string;
  title: string;
  from: number;
  to: number;
  condition: string;
  /** 相对上一阶段新出现（或性质改变）的力 id，渲染时用鲜艳色标注。 */
  added: string[];
  forces: ForceVector[];
}

export interface SceneEvent {
  id: string;
  title: string;
  time: number;
  condition: string;
}

export interface ScalarTile {
  key: string;
  label: string;
  value: number;
  unit: string;
  digits?: number;
}

export interface SceneBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface SolveResultBase {
  template: TemplateId;
  duration: number;
  bounds: SceneBounds;
  /** 参与动画的物体；第一个为主对象，与 series 相同。 */
  bodies: BodyTrack[];
  events: SceneEvent[];
  /** 按时间划分的受力阶段，临界状态即阶段边界。 */
  forcePhases: ForcePhase[];
  scalars: ScalarTile[];
  steps: SolutionStep[];
  /** 主对象的时间序列（抛体即原 series）。 */
  series: Series;
}

export interface ProjectileResult extends SolveResultBase {
  template: "projectile";
  range: number;
  maxHeight: number;
  flightTime: number;
  apexTime: number;
}

export interface InclineResult extends SolveResultBase {
  template: "incline";
  /** 沿斜面向下的加速度 m/s²（可为负，表示减速）。 */
  a: number;
  /** 运动总时间 s。 */
  t: number;
  /** 到达底端或停下时的速度 m/s（沿斜面向下为正）。 */
  vEnd: number;
  /** 斜面高差 m。 */
  height: number;
  /** 实际滑行距离 m。 */
  distance: number;
  /** 重力做功 J。 */
  Wg: number;
  /** 摩擦力做功 J（负值）。 */
  Wf: number;
  /** 摩擦生热 J。 */
  heat: number;
  /** 支持力 N。 */
  normal: number;
  /** 是否滑到底端（否则中途停下）。 */
  reachedBottom: boolean;
}

export interface BlockBoardResult extends SolveResultBase {
  template: "blockBoard";
  /** 共速时间或滑离时间 s。 */
  t: number;
  /** 共速速度 m/s。 */
  vCommon: number;
  /** 相对位移 m（滑离时等于 L）。 */
  slip: number;
  /** 摩擦生热 J。 */
  heat: number;
  /** 滑块末速度 m/s。 */
  vBlockEnd: number;
  /** 木板末速度 m/s。 */
  vBoardEnd: number;
  /** 滑块是否滑离木板（相对位移达到板长）。 */
  slidOff: boolean;
}

export interface CollisionResult extends SolveResultBase {
  template: "collision1d";
  /** 碰撞时刻 s。 */
  tHit: number;
  /** 碰后速度 m/s。 */
  v1After: number;
  v2After: number;
  /** 总动量 kg·m/s。 */
  momentum: number;
  /** 碰前、碰后总动能 J。 */
  keBefore: number;
  keAfter: number;
  /** 动能损失 J。 */
  loss: number;
  /** 是否发生接触（接近速度为正）。 */
  hit: boolean;
}

export type SolveResult = ProjectileResult | InclineResult | BlockBoardResult | CollisionResult;

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
  /** 父文件夹；null 或缺省表示顶层。 */
  parentId?: string | null;
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
  baseParams: ProblemParams;
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
  /** 受力箭头：按当前受力阶段绘制，新出现的力用鲜艳色。 */
  forces: boolean;
  trail: boolean;
  markers: boolean;
  strobe: boolean;
  glow: boolean;
  energy: boolean;
}

export type ThemeMode = "system" | "light" | "dark";
export type RightTab = "parameters" | "chat" | "states";
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
  key: string;
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
  forces: true,
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