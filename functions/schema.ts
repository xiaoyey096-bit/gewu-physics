// 结构化题目 Schema（力学 MVP：抛体 / 斜面 / 滑块木板 / 一维碰撞）。
// Edge Function 必须自包含，此文件不依赖任何 npm 包。
// 前端镜像见 lib/types.ts，两处修改需同步。

export const SCHEMA_VERSION = 1;

export type TemplateId = "projectile" | "incline" | "blockBoard" | "collision1d";

export interface ProjectileParams {
  /** 初速度大小 m/s */
  v0: number;
  /** 抛射角（与水平方向夹角）度 */
  angleDeg: number;
  /** 初始高度 m */
  h0: number;
  /** 重力加速度 m/s^2 */
  g: number;
}

export interface InclineParams {
  /** 物块质量 kg */
  m: number;
  /** 斜面倾角 度 */
  angleDeg: number;
  /** 动摩擦因数 */
  mu: number;
  /** 斜面长度 m */
  L: number;
  /** 重力加速度 m/s^2 */
  g: number;
  /** 初速度（沿斜面向下）m/s */
  v0: number;
}

export interface BlockBoardParams {
  /** 滑块质量 kg */
  m: number;
  /** 木板质量 kg */
  M: number;
  /** 木板长度 m */
  L: number;
  /** 滑块初速度 m/s */
  v0: number;
  /** 滑块与木板间的动摩擦因数 */
  mu: number;
  /** 木板与地面间的动摩擦因数，0 表示光滑地面；旧数据缺省按 0 处理 */
  muGround?: number;
  g: number;
}

export interface CollisionParams {
  m1: number;
  m2: number;
  v1: number;
  v2: number;
  /** 恢复系数 0..1 */
  e: number;
}

export type ProblemParams = ProjectileParams | InclineParams | BlockBoardParams | CollisionParams;

export interface Problem {
  version: 1;
  template: TemplateId;
  /** 识别出的题干原文 */
  statement: string;
  params: ProblemParams;
  /** 所求量，如 ["range", "maxHeight", "flightTime"] */
  ask: string[];
}

export type ValidationResult =
  | { ok: true; problem: Problem }
  | { ok: false; error: string };

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

const inRange = (x: unknown, lo: number, hi: number): x is number =>
  isFiniteNumber(x) && x >= lo && x <= hi;

export function validateProblem(input: unknown): ValidationResult {
  if (!input || typeof input !== "object") return { ok: false, error: "invalid_problem" };
  const p = input as Record<string, unknown>;
  if (p.version !== SCHEMA_VERSION) return { ok: false, error: "unsupported_schema_version" };
  const template = p.template;
  if (template !== "projectile" && template !== "incline" && template !== "blockBoard" && template !== "collision1d") {
    return { ok: false, error: "unsupported_template" };
  }
  if (typeof p.statement !== "string" || p.statement.length === 0 || p.statement.length > 4000) {
    return { ok: false, error: "invalid_statement" };
  }
  const params = p.params as Record<string, unknown> | undefined;
  if (!params || typeof params !== "object") return { ok: false, error: "invalid_params" };
  const ask = Array.isArray(p.ask)
    ? p.ask.filter((a): a is string => typeof a === "string").slice(0, 8)
    : [];

  if (template === "projectile") {
    const { v0, angleDeg, h0, g } = params;
    if (!isFiniteNumber(v0) || v0 <= 0 || v0 > 1000) return { ok: false, error: "invalid_v0" };
    if (!isFiniteNumber(angleDeg) || angleDeg < 0 || angleDeg > 90) return { ok: false, error: "invalid_angle" };
    if (!isFiniteNumber(h0) || h0 < 0 || h0 > 1000) return { ok: false, error: "invalid_h0" };
    if (!isFiniteNumber(g) || g <= 0 || g > 100) return { ok: false, error: "invalid_g" };
    return { ok: true, problem: { version: SCHEMA_VERSION, template, statement: p.statement, params: { v0, angleDeg, h0, g }, ask } };
  }

  if (template === "incline") {
    const { m, angleDeg, mu, L, g, v0 } = params;
    if (!inRange(m, 0.01, 1000)) return { ok: false, error: "invalid_m" };
    if (!inRange(angleDeg, 1, 89)) return { ok: false, error: "invalid_angle" };
    if (!inRange(mu, 0, 1)) return { ok: false, error: "invalid_mu" };
    if (!inRange(L, 0.01, 2000)) return { ok: false, error: "invalid_L" };
    if (!inRange(v0, 0, 500)) return { ok: false, error: "invalid_v0" };
    if (!inRange(g, 0.01, 100)) return { ok: false, error: "invalid_g" };
    return { ok: true, problem: { version: SCHEMA_VERSION, template, statement: p.statement, params: { m, angleDeg, mu, L, g, v0 }, ask } };
  }

  if (template === "blockBoard") {
    const { m, M, L, v0, mu, g } = params;
    if (!inRange(m, 0.01, 1000)) return { ok: false, error: "invalid_m" };
    if (!inRange(M, 0.01, 1000)) return { ok: false, error: "invalid_M" };
    if (!inRange(L, 0.01, 2000)) return { ok: false, error: "invalid_L" };
    if (!inRange(v0, 0, 500)) return { ok: false, error: "invalid_v0" };
    if (!inRange(mu, 0, 1)) return { ok: false, error: "invalid_mu" };
    if (!inRange(g, 0.01, 100)) return { ok: false, error: "invalid_g" };
    // 题目没提地面摩擦时按光滑地面处理，旧数据同样走这条默认值。
    const muGround = inRange(params.muGround, 0, 1) ? params.muGround : 0;
    return { ok: true, problem: { version: SCHEMA_VERSION, template, statement: p.statement, params: { m, M, L, v0, mu, muGround, g }, ask } };
  }

  const { m1, m2, v1, v2, e } = params;
  if (!inRange(m1, 0.01, 1000)) return { ok: false, error: "invalid_m1" };
  if (!inRange(m2, 0.01, 1000)) return { ok: false, error: "invalid_m2" };
  if (!inRange(v1, -500, 500)) return { ok: false, error: "invalid_v1" };
  if (!inRange(v2, -500, 500)) return { ok: false, error: "invalid_v2" };
  if (!inRange(e, 0, 1)) return { ok: false, error: "invalid_e" };
  return { ok: true, problem: { version: SCHEMA_VERSION, template, statement: p.statement, params: { m1, m2, v1, v2, e }, ask } };
}