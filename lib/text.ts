// 文本理解：把用户输入拆成「题目内容」与「用户提问」，并在无云端密钥时本地解析参数。
// 云端识题可用时以云端结果为准，这里始终提供可用的降级路径。

import type { ProjectileParams } from "./types";

const QUESTION_HEAD = /^(为什么|为何|怎么|怎样|如何|是否|能不能|可不可以|请问|解释一下|解释|说明一下|说明|什么是|难道|是不是)/;
const QUESTION_TAIL = /(吗|呢|么)[？?。！!]?$/;

export function splitStatementAndQuestions(text: string): { statement: string; questions: string[] } {
  const parts = text
    .split(/\n+|(?<=[。！？；!?;])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const statement: string[] = [];
  const questions: string[] = [];
  for (const part of parts) {
    const isQuestion =
      /[？?]/.test(part) || QUESTION_HEAD.test(part) || QUESTION_TAIL.test(part);
    if (isQuestion) questions.push(part.replace(/[？?]+$/, "？"));
    else statement.push(part);
  }
  return { statement: statement.join("\n"), questions };
}

export interface LocalParse {
  params: ProjectileParams;
  found: string[];
  assumed: string[];
}

const num = (re: RegExp, text: string): number | null => {
  const m = text.match(re);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
};

export function parseParamsFromText(text: string): LocalParse {
  const found: string[] = [];
  const assumed: string[] = [];
  const params: ProjectileParams = { v0: 20, angleDeg: 30, h0: 0, g: 9.8 };

  const kmh = num(/(\d+(?:\.\d+)?)\s*(?:km\/h|千米\/小时|公里\/小时)/i, text);
  const ms = num(/(\d+(?:\.\d+)?)\s*(?:m\/s|米\/秒|米每秒)/i, text);
  if (ms !== null && ms > 0) {
    params.v0 = ms;
    found.push("初速度 v₀");
  } else if (kmh !== null && kmh > 0) {
    params.v0 = Number((kmh / 3.6).toFixed(2));
    found.push("初速度 v₀（km/h 换算）");
  } else {
    assumed.push("初速度 v₀ 暂按 20 m/s");
  }

  const flat = /平抛|水平抛出|水平方向抛出|沿水平/.test(text);
  const vertical = /竖直上抛|竖直向上抛|竖直上抛|垂直向上/.test(text);
  const deg =
    num(/(?:与水平|水平方向|仰角|抛射角|夹角|成)\D{0,6}(\d+(?:\.\d+)?)\s*(?:°|度)/, text) ??
    num(/(\d+(?:\.\d+)?)\s*(?:°|度)/, text);
  if (flat) {
    params.angleDeg = 0;
    found.push("抛射角 θ = 0°（平抛）");
  } else if (vertical) {
    params.angleDeg = 90;
    found.push("抛射角 θ = 90°（竖直上抛）");
  } else if (deg !== null && deg >= 0 && deg <= 90) {
    params.angleDeg = deg;
    found.push("抛射角 θ");
  } else {
    assumed.push("抛射角 θ 暂按 30°");
  }

  const h =
    num(/(?:高|高度|平台|楼顶|悬崖|塔)\D{0,6}(\d+(?:\.\d+)?)\s*(?:m|米)(?!\/)/, text) ??
    num(/(\d+(?:\.\d+)?)\s*(?:m|米)\s*(?:高|的高度|高的平台|平台)/, text);
  if (/从地面|地面上|地面抛出|水平地面/.test(text)) {
    params.h0 = 0;
    found.push("初始高度 h₀ = 0（地面）");
  } else if (h !== null && h >= 0) {
    params.h0 = h;
    found.push("初始高度 h₀");
  } else {
    assumed.push("初始高度 h₀ 暂按 0 m");
  }

  const g = num(/g\s*(?:取|为|=|＝)\s*(\d+(?:\.\d+)?)/i, text);
  if (g !== null && g > 0 && g <= 100) {
    params.g = g;
    found.push(`重力加速度 g = ${g}`);
  } else {
    assumed.push("g 暂按 9.8 m/s²");
  }

  return { params, found, assumed };
}

export function kindLabel(params: ProjectileParams): string {
  if (params.angleDeg <= 0.5) return "平抛";
  if (params.angleDeg >= 89.5) return "竖直上抛";
  return "斜抛";
}

export function deriveTitle(statement: string, params: ProjectileParams): string {
  const clean = statement.replace(/\s+/g, " ").trim();
  if (clean.length >= 6) return clean.slice(0, 22) + (clean.length > 22 ? "…" : "");
  return `${kindLabel(params)} · v₀ ${params.v0} m/s · θ ${params.angleDeg}°`;
}

export const ASK_LABELS: Record<string, string> = {
  range: "射程",
  maxHeight: "最大高度",
  flightTime: "飞行时间",
  apexTime: "到最高点的时间",
  landingSpeed: "落地速度",
};

export function askLabels(ask: string[]): string[] {
  const labels = ask.map((a) => ASK_LABELS[a]).filter(Boolean);
  return labels.length ? labels : ["射程", "最大高度", "飞行时间"];
}