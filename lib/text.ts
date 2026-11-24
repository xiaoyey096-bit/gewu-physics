// 文本理解：把用户输入拆成「题目内容」与「用户提问」，并在无云端密钥时本地解析参数。
// 云端识题可用时以云端结果为准，这里始终提供可用的降级路径。

import type {
  BlockBoardParams, CollisionParams, InclineParams, ProblemParams, ProjectileParams, TemplateId,
} from "./types";

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
  template: TemplateId;
  params: ProblemParams;
  found: string[];
  assumed: string[];
}

const num = (re: RegExp, text: string): number | null => {
  const m = text.match(re);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
};

const gOf = (text: string): number => {
  const g = num(/g\s*(?:取|为|=|＝)\s*(\d+(?:\.\d+)?)/i, text);
  return g !== null && g > 0 && g <= 100 ? g : 10;
};

function parseProjectile(text: string, found: string[], assumed: string[]): ProjectileParams {
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
  const vertical = /竖直上抛|竖直向上抛|垂直向上/.test(text);
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
  return params;
}

function parseIncline(text: string, found: string[], assumed: string[]): InclineParams {
  const g = gOf(text);
  const m = num(/(?:质量|m)\s*(?:为|=|＝|是)?\s*(\d+(?:\.\d+)?)\s*(?:kg|千克|公斤)/i, text) ?? 2;
  const angleDeg =
    num(/(?:倾角|斜面)[^0-9]{0,8}(\d+(?:\.\d+)?)\s*(?:°|度)/, text) ??
    num(/(\d+(?:\.\d+)?)\s*(?:°|度)/, text) ?? 37;
  const mu = num(/(?:μ|摩擦因数|动摩擦因数)[^0-9]{0,6}(0?\.\d+|\d+(?:\.\d+)?)/i, text) ?? 0.5;
  const L = num(/(?:长|长度|斜面长)[^0-9]{0,6}(\d+(?:\.\d+)?)\s*(?:m|米)/, text) ?? 4;
  const v0 = num(/(?:初速度|以)[^0-9]{0,6}(\d+(?:\.\d+)?)\s*(?:m\/s|米\/秒)/, text) ?? 0;
  assumed.push(`斜面长度 L 暂按 ${L} m`, `物块质量 m 暂按 ${m} kg`, `初速度 v₀ 暂按 ${v0} m/s`, `g 暂按 ${g} m/s²`);
  found.push(`斜面倾角 θ = ${angleDeg}°`, `动摩擦因数 μ = ${mu}`);
  return { m, angleDeg, mu, L, g, v0 };
}

function parseBlockBoard(text: string, found: string[], assumed: string[]): BlockBoardParams {
  const g = gOf(text);
  const m = num(/(?:滑块|小滑块|物块)[^0-9]{0,6}(\d+(?:\.\d+)?)\s*(?:kg|千克)/, text) ?? 1;
  const M = num(/(?:木板|板)[^0-9]{0,6}(\d+(?:\.\d+)?)\s*(?:kg|千克)/, text) ?? 2;
  const L = num(/(?:板长|木板.*?长|长度)[^0-9]{0,6}(\d+(?:\.\d+)?)\s*(?:m|米)/, text) ?? 7;
  const v0 = num(/(?:以|初速度|速度)[^0-9]{0,6}(\d+(?:\.\d+)?)\s*(?:m\/s|米\/秒)/, text) ?? 6;
  const mu = num(/(?:μ|摩擦因数|动摩擦因数)[^0-9]{0,6}(0?\.\d+|\d+(?:\.\d+)?)/i, text) ?? 0.2;
  assumed.push(`滑块质量 m 暂按 ${m} kg`, `木板质量 M 暂按 ${M} kg`, `板长 L 暂按 ${L} m`, `v₀ 暂按 ${v0} m/s`, `g 暂按 ${g} m/s²`);
  found.push(`动摩擦因数 μ = ${mu}`);
  return { m, M, L, v0, mu, g };
}

function parseCollision(text: string, found: string[], assumed: string[]): CollisionParams {
  const masses = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:kg|千克|公斤)/g)].map((m) => Number(m[1]));
  const speeds = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:m\/s|米\/秒)/g)].map((m) => Number(m[1]));
  const m1 = masses[0] ?? 1;
  const m2 = masses[1] ?? 2;
  const v1 = speeds[0] ?? 3;
  const v2 = speeds[1] ?? 0;
  const e = /粘在|一起|非弹性/.test(text) && !/完全弹性/.test(text) ? 0 : 1;
  assumed.push(`两球质量暂按 ${m1} kg / ${m2} kg`, `两球初速度暂按 ${v1} m/s / ${v2} m/s`);
  found.push(`恢复系数 e = ${e}（${e === 1 ? "完全弹性" : "完全非弹性"}）`);
  return { m1, m2, v1, v2, e };
}

export function detectTemplate(text: string): TemplateId {
  if (/碰撞|相撞|正碰|对心碰|碰后/.test(text)) return "collision1d";
  if (/木板|滑上.*板|滑块.*板|板.*滑块/.test(text)) return "blockBoard";
  if (/斜面|斜坡|沿斜|倾角/.test(text)) return "incline";
  return "projectile";
}

export function parseParamsFromText(text: string): LocalParse {
  const template = detectTemplate(text);
  const found: string[] = [];
  const assumed: string[] = [];
  if (template === "collision1d") return { template, params: parseCollision(text, found, assumed), found, assumed };
  if (template === "blockBoard") return { template, params: parseBlockBoard(text, found, assumed), found, assumed };
  if (template === "incline") return { template, params: parseIncline(text, found, assumed), found, assumed };
  return { template, params: parseProjectile(text, found, assumed), found, assumed };
}

export function kindLabel(params: ProblemParams): string {
  if (!("angleDeg" in params)) return "抛体";
  const p = params as ProjectileParams;
  if (p.angleDeg <= 0.5) return "平抛";
  if (p.angleDeg >= 89.5) return "竖直上抛";
  return "斜抛";
}

export function deriveTitle(statement: string, params: ProblemParams, template: TemplateId = "projectile"): string {
  const clean = statement.replace(/\s+/g, " ").trim();
  if (clean.length >= 6) return clean.slice(0, 22) + (clean.length > 22 ? "…" : "");
  if (template === "incline") {
    const p = params as InclineParams;
    return `斜面下滑 · θ ${p.angleDeg}° · μ ${p.mu}`;
  }
  if (template === "blockBoard") {
    const p = params as BlockBoardParams;
    return `滑块木板 · v₀ ${p.v0} m/s`;
  }
  if (template === "collision1d") {
    const p = params as CollisionParams;
    return `一维碰撞 · e ${p.e}`;
  }
  const p = params as ProjectileParams;
  return `${kindLabel(p)} · v₀ ${p.v0} m/s · θ ${p.angleDeg}°`;
}

export const ASK_LABELS: Record<string, string> = {
  range: "射程",
  maxHeight: "最大高度",
  flightTime: "飞行时间",
  apexTime: "到最高点的时间",
  landingSpeed: "落地速度",
  acceleration: "加速度",
  time: "滑行时间",
  speed: "末速度",
  heat: "摩擦生热",
  workG: "重力做功",
  slip: "相对位移",
  v1After: "A 碰后速度",
  v2After: "B 碰后速度",
  loss: "动能损失",
  momentum: "总动量",
};

const DEFAULT_ASKS: Record<TemplateId, string[]> = {
  projectile: ["range", "maxHeight", "flightTime"],
  incline: ["acceleration", "time", "speed"],
  blockBoard: ["time", "speed", "slip"],
  collision1d: ["v1After", "v2After", "loss"],
};

export function askLabels(ask: string[], template: TemplateId = "projectile"): string[] {
  const labels = ask.map((a) => ASK_LABELS[a]).filter(Boolean);
  return labels.length ? labels : DEFAULT_ASKS[template].map((a) => ASK_LABELS[a]);
}