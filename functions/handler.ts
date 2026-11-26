// 格物 · 物理解题动画助手 —— Edge Function 入口处理器。
// 路由：GET health | POST recognize | POST solve | POST explain
// 浏览器同源调用 /functions/v1/app/<route>；网关会替换函数名段，这里只依赖后缀。

import { validateProblem } from "./schema.ts";
import { solveProblem } from "./physics.ts";
import { recognizeInput } from "./recognize.ts";
import { explainProblem } from "./explain.ts";
import { stringList } from "./llm.ts";

const JSON_HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" };
const MAX_BODY_BYTES = 12_000_000;

function json(status: number, body: Record<string, unknown>, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...JSON_HEADERS, ...extra } });
}

function routeOf(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean);
  if (seg[0] === "functions" && seg[1] === "v1") {
    if (seg.length > 4) return "__unknown__";
    return seg[3] ?? "health";
  }
  return seg[seg.length - 1] ?? "health";
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const len = Number(request.headers.get("content-length") ?? "0");
  if (len > MAX_BODY_BYTES) return null;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return null;
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function handler(request: Request): Promise<Response> {
  const route = routeOf(new URL(request.url).pathname);

  if (route === "health") {
    if (request.method !== "GET") {
      return json(405, { ok: false, error: "method_not_allowed" }, { Allow: "GET" });
    }
    return json(200, {
      ok: true,
      service: "gewu-physics",
      schemaVersion: 1,
      templates: ["projectile", "incline", "blockBoard", "collision1d"],
      // 只暴露"是否已配置"，绝不暴露密钥本身。
      recognizeConfigured: Boolean(Deno.env.get("ARK_API_KEY")),
    });
  }

  if (route === "recognize") {
    if (request.method !== "POST") {
      return json(405, { ok: false, error: "method_not_allowed" }, { Allow: "POST" });
    }
    const apiKey = Deno.env.get("ARK_API_KEY");
    if (!apiKey) return json(503, { ok: false, error: "service_not_configured" });
    const body = await readJsonBody(request);
    if (!body) return json(400, { ok: false, error: "invalid_body" });
    const outcome = await recognizeInput(apiKey, { image: body.image, text: body.text });
    if (!outcome.ok) {
      return json(outcome.status, { ok: false, error: outcome.error, ...(outcome.reason ? { reason: outcome.reason } : {}) });
    }
    return json(200, { ok: true, problem: outcome.problem, questions: outcome.questions });
  }

  if (route === "explain") {
    if (request.method !== "POST") {
      return json(405, { ok: false, error: "method_not_allowed" }, { Allow: "POST" });
    }
    const apiKey = Deno.env.get("ARK_API_KEY");
    if (!apiKey) return json(503, { ok: false, error: "service_not_configured" });
    const body = await readJsonBody(request);
    if (!body) return json(400, { ok: false, error: "invalid_body" });
    const validated = validateProblem(body.problem);
    if (!validated.ok) return json(400, { ok: false, error: validated.error });
    const outcome = await explainProblem(apiKey, validated.problem, stringList(body.questions, 6, 200));
    if (!outcome.ok) return json(outcome.status, { ok: false, error: outcome.error });
    return json(200, { ok: true, insight: outcome.insight, answers: outcome.answers });
  }

  if (route === "solve") {
    if (request.method !== "POST") {
      return json(405, { ok: false, error: "method_not_allowed" }, { Allow: "POST" });
    }
    const body = await readJsonBody(request);
    if (!body) return json(400, { ok: false, error: "invalid_body" });
    const validated = validateProblem(body.problem);
    if (!validated.ok) return json(400, { ok: false, error: validated.error });
    return json(200, { ok: true, result: solveProblem(validated.problem) });
  }

  return json(404, { ok: false, error: "not_found" });
}