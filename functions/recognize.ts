// 识题：图片 and/or 文字 → 结构化题目 + 用户提问。
// 调用阿里云百炼 DashScope 的千问视觉模型（OpenAI 兼容端点），共用 llm.ts 的回退与超时策略。

import { validateProblem, type Problem } from "./schema.ts";
import { completeJson, declaredError, stringList, type UserContent } from "./llm.ts";

const MAX_IMAGE_CHARS = 10_000_000; // base64 data URL 上限约 7.5MB 原图
const MAX_TEXT_CHARS = 4000;

const SYSTEM_PROMPT = `你是物理题识别引擎。读取用户上传的物理题图片和/或文字，判断题型并提取参数，只输出一个 JSON 对象，不要输出任何其他文字或 Markdown 代码块。
JSON 结构：
{
  "version": 1,
  "template": "projectile" | "incline" | "blockBoard" | "collision1d",
  "statement": "题干原文（含已知量与所求，简体中文）",
  "params": { ... },
  "ask": ["所求量 key"],
  "questions": ["用户自己的提问原文", "..."]
}
题型与参数（全部换算为国际单位）：
- projectile（抛体/平抛/斜抛/竖直上抛）：params = { "v0": m/s, "angleDeg": 度（平抛 0，竖直上抛 90）, "h0": m, "g": 默认 9.8 }；ask 取 ["range","maxHeight","flightTime","apexTime","landingSpeed"] 的子集。
- incline（物块沿斜面下滑/上滑，含摩擦）：params = { "m": kg, "angleDeg": 倾角, "mu": 动摩擦因数, "L": 斜面长度 m, "g": 默认 10, "v0": 沿斜面向下的初速度 m/s（由静止为 0）}；ask 取 ["acceleration","time","speed","heat","workG"] 的子集。
- blockBoard（滑块滑上木板、相对滑动/共速/滑离）：params = { "m": 滑块 kg, "M": 木板 kg, "L": 木板长度 m, "v0": 滑块初速度 m/s, "mu": 滑块与木板间动摩擦因数, "g": 默认 10 }；ask 取 ["time","speed","slip","heat"] 的子集。
- collision1d（一维正碰/弹性碰撞/完全非弹性碰撞）：params = { "m1": kg, "m2": kg, "v1": m/s, "v2": m/s, "e": 恢复系数（完全弹性 1，完全非弹性 0，一般 0~1）}；ask 取 ["v1After","v2After","loss","momentum"] 的子集。
规则：
- 只能使用上面四种 template 之一；优先选择与题干情境最匹配的模型。
- 只把题目本身放进 statement（已知条件、物理情境、所求量），不要把用户的提问混进去。
- questions 只放「用户提问」：为什么/是否/如何/怎样一类的概念性疑问，或图片中手写的额外问题。题目要求计算的量属于 ask，不属于 questions。没有提问时输出空数组 []。
- 提问保留用户原话，最多 6 条，每条不超过 100 字；不要自行编造用户没问的问题。
- 若题目不属于上述四类，或关键参数缺失无法确定，输出 {"error":"unsupported_problem","reason":"简短中文原因"}。
- 图片模糊无法辨认且文字也不足以确定题目时，输出 {"error":"unreadable_image","reason":"简短中文原因"}。`;

export type RecognizeOutcome =
  | { ok: true; problem: Problem; questions: string[] }
  | { ok: false; status: number; error: string; reason?: string };

export async function recognizeInput(
  apiKey: string,
  input: { image?: unknown; text?: unknown },
): Promise<RecognizeOutcome> {
  const hasImage = input.image !== undefined && input.image !== null && input.image !== "";
  let imageDataUrl = "";
  if (hasImage) {
    if (typeof input.image !== "string" || !input.image.startsWith("data:image/")) {
      return { ok: false, status: 400, error: "invalid_image" };
    }
    if (input.image.length > MAX_IMAGE_CHARS) {
      return { ok: false, status: 413, error: "image_too_large" };
    }
    imageDataUrl = input.image;
  }

  let text = "";
  if (input.text !== undefined && input.text !== null) {
    if (typeof input.text !== "string") return { ok: false, status: 400, error: "invalid_body" };
    text = input.text.trim().slice(0, MAX_TEXT_CHARS);
  }
  if (!imageDataUrl && !text) return { ok: false, status: 400, error: "invalid_body" };

  const parts: Exclude<UserContent, string> = [];
  if (imageDataUrl) parts.push({ type: "image_url", image_url: { url: imageDataUrl } });
  parts.push({
    type: "text",
    text: text
      ? `请识别这道物理题，区分题目内容与用户提问，按要求只输出 JSON。\n\n用户输入的文字：\n${text}`
      : "请识别这道物理题，区分题目内容与用户提问，按要求只输出 JSON。",
  });

  const call = await completeJson(apiKey, SYSTEM_PROMPT, parts, "recognize_bad_response");
  if (!call.ok) return call;

  const declared = declaredError(call.value);
  if (declared) return { ok: false, ...declared };

  const validated = validateProblem(call.value);
  if (!validated.ok) return { ok: false, status: 422, error: "recognize_bad_response" };

  const questions = stringList((call.value as Record<string, unknown>).questions, 6, 100);
  return { ok: true, problem: validated.problem, questions };
}