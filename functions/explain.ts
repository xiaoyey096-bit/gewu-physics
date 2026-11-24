// 云端深度讲解：在本地解析解之上，补充概念性讲解与逐题答疑。
// 数值由服务端求解结果给定，模型只负责解释，不允许改动数值。

import type { InclineParams, BlockBoardParams, CollisionParams, Problem, ProjectileParams } from "./schema.ts";
import { solveProblem } from "./physics.ts";
import { completeJson, stringList } from "./llm.ts";

const SYSTEM_PROMPT = `你是一位耐心、严谨的中学物理老师，面向学生讲解力学题，题型包括抛体运动、斜面下滑、滑块与木板、一维碰撞。只输出一个 JSON 对象，不要输出任何其他文字或 Markdown 代码块。
JSON 结构：
{
  "insight": "200-400 字的深度讲解",
  "answers": [{ "question": "用户提问原文", "answer": "120-260 字的回答" }]
}
规则：
- 讲解必须使用给定的数值（参数、解析解与各所求量），不得自行改算或编造数据。
- insight 讲清本题的物理图景：受力与运动如何分解、哪些量守恒、能量如何转化、结果由哪些条件决定，并点出一个容易误解的地方。
- answers 逐条回答给定问题，先给结论再给理由，必要时引用本题数值作为证据；问题与本题无关时，也要用对应模型的知识正面回答。
- 语言为简体中文，语气平实，不要用夸张的营销措辞，不要输出 LaTeX 或 Markdown 标记。
- 若无法完成，输出 {"error":"unsupported_problem","reason":"简短中文原因"}。`;

export type ExplainOutcome =
  | { ok: true; insight: string; answers: { question: string; answer: string }[] }
  | { ok: false; status: number; error: string };

const f = (x: number): string => Number(x.toFixed(3)).toString();

function knownOf(problem: Problem): string {
  if (problem.template === "projectile") {
    const { v0, angleDeg, h0, g } = problem.params as ProjectileParams;
    return `已知：v₀ = ${f(v0)} m/s，θ = ${f(angleDeg)}°，h₀ = ${f(h0)} m，g = ${f(g)} m/s²`;
  }
  if (problem.template === "incline") {
    const p = problem.params as InclineParams;
    return `已知：m = ${f(p.m)} kg，θ = ${f(p.angleDeg)}°，μ = ${f(p.mu)}，L = ${f(p.L)} m，v₀ = ${f(p.v0)} m/s，g = ${f(p.g)} m/s²`;
  }
  if (problem.template === "blockBoard") {
    const p = problem.params as BlockBoardParams;
    return `已知：滑块 m = ${f(p.m)} kg，木板 M = ${f(p.M)} kg，L = ${f(p.L)} m，v₀ = ${f(p.v0)} m/s，μ = ${f(p.mu)}，g = ${f(p.g)} m/s²`;
  }
  const p = problem.params as CollisionParams;
  return `已知：m₁ = ${f(p.m1)} kg，m₂ = ${f(p.m2)} kg，v₁ = ${f(p.v1)} m/s，v₂ = ${f(p.v2)} m/s，恢复系数 e = ${f(p.e)}`;
}

export async function explainProblem(
  apiKey: string,
  problem: Problem,
  questions: string[],
): Promise<ExplainOutcome> {
  const result = solveProblem(problem);
  const asked = stringList(questions, 6, 200);

  const facts = problem.template === "projectile"
    ? (() => {
        const p = problem.params as ProjectileParams;
        const r = result;
        if (r.template !== "projectile") return "";
        const landingSpeed = Math.sqrt(p.v0 * p.v0 + 2 * p.g * p.h0);
        return [
          `题干：${problem.statement.slice(0, 1200)}`,
          knownOf(problem),
          `分解：v₀ₓ = ${f(r.series.vx[0])} m/s，v₀ᵧ = ${f(r.series.vy[0])} m/s`,
          `解析解：射程 X = ${f(r.range)} m，最大高度 H = ${f(r.maxHeight)} m，飞行时间 T = ${f(r.flightTime)} s，到达最高点 t₁ = ${f(r.apexTime)} s，落地速度大小 = ${f(landingSpeed)} m/s`,
          asked.length ? `用户提问：\n${asked.map((q, i) => `${i + 1}. ${q}`).join("\n")}` : "用户提问：无（answers 输出空数组）",
        ].join("\n");
      })()
    : [
        `题干：${problem.statement.slice(0, 1200)}`,
        `题型：${problem.template}`,
        knownOf(problem),
        `解析解：${result.scalars.map((s) => `${s.label} = ${f(s.value)} ${s.unit}`).join("，")}`,
        `解题步骤：${result.steps.map((s) => `${s.title}（${s.formula}）`).join("；")}`,
        asked.length ? `用户提问：\n${asked.map((q, i) => `${i + 1}. ${q}`).join("\n")}` : "用户提问：无（answers 输出空数组）",
      ].join("\n");

  const call = await completeJson(
    apiKey,
    SYSTEM_PROMPT,
    `请基于以下本题数据完成讲解与答疑，只输出 JSON。\n\n${facts}`,
    "explain_bad_response",
    "explain_timeout",
  );
  if (!call.ok) return call;

  const value = call.value;
  if (!value || typeof value !== "object") return { ok: false, status: 502, error: "explain_bad_response" };
  const record = value as Record<string, unknown>;
  if (typeof record.error === "string") return { ok: false, status: 422, error: "unsupported_problem" };

  const insight = typeof record.insight === "string" ? record.insight.trim().slice(0, 2000) : "";
  const answers: { question: string; answer: string }[] = [];
  if (Array.isArray(record.answers)) {
    for (const item of record.answers) {
      if (!item || typeof item !== "object") continue;
      const a = item as Record<string, unknown>;
      const answer = typeof a.answer === "string" ? a.answer.trim().slice(0, 1600) : "";
      if (!answer) continue;
      const rawQuestion = typeof a.question === "string" ? a.question.trim() : "";
      const matched = asked.find((q) => q === rawQuestion) ?? asked[answers.length];
      if (!matched) continue;
      if (answers.some((x) => x.question === matched)) continue;
      answers.push({ question: matched, answer });
      if (answers.length >= 6) break;
    }
  }

  if (!insight && !answers.length) return { ok: false, status: 502, error: "explain_bad_response" };
  return { ok: true, insight, answers };
}