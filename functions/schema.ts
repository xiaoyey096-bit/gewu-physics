// 结构化题目 Schema（力学 MVP：抛体运动）。
// Edge Function 必须自包含，此文件不依赖任何 npm 包。
// 前端镜像见 lib/types.ts，两处修改需同步。

export const SCHEMA_VERSION = 1;

export type TemplateId = "projectile";

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

export interface Problem {
  version: 1;
  template: TemplateId;
  /** 识别出的题干原文 */
  statement: string;
  params: ProjectileParams;
  /** 所求量，如 ["range", "maxHeight", "flightTime"] */
  ask: string[];
}

export type ValidationResult =
  | { ok: true; problem: Problem }
  | { ok: false; error: string };

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

export function validateProblem(input: unknown): ValidationResult {
  if (!input || typeof input !== "object") return { ok: false, error: "invalid_problem" };
  const p = input as Record<string, unknown>;
  if (p.version !== SCHEMA_VERSION) return { ok: false, error: "unsupported_schema_version" };
  if (p.template !== "projectile") return { ok: false, error: "unsupported_template" };
  if (typeof p.statement !== "string" || p.statement.length === 0 || p.statement.length > 4000) {
    return { ok: false, error: "invalid_statement" };
  }
  const params = p.params as Record<string, unknown> | undefined;
  if (!params || typeof params !== "object") return { ok: false, error: "invalid_params" };
  const { v0, angleDeg, h0, g } = params;
  if (!isFiniteNumber(v0) || v0 <= 0 || v0 > 1000) return { ok: false, error: "invalid_v0" };
  if (!isFiniteNumber(angleDeg) || angleDeg < 0 || angleDeg > 90) return { ok: false, error: "invalid_angle" };
  if (!isFiniteNumber(h0) || h0 < 0 || h0 > 1000) return { ok: false, error: "invalid_h0" };
  if (!isFiniteNumber(g) || g <= 0 || g > 100) return { ok: false, error: "invalid_g" };
  const ask = Array.isArray(p.ask)
    ? p.ask.filter((a): a is string => typeof a === "string").slice(0, 8)
    : [];
  return {
    ok: true,
    problem: {
      version: SCHEMA_VERSION,
      template: "projectile",
      statement: p.statement,
      params: { v0, angleDeg, h0, g },
      ask,
    },
  };
}