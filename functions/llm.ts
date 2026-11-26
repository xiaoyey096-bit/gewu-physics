// 火山方舟（Ark）OpenAI 兼容端点的共用调用层。
// 固定可信服务端目标 + 超时 + 明确的错误分类；绝不回显上游异常或密钥。

const ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
// 模型 ID 在方舟控制台开通后可直接使用；可用环境变量 ARK_MODEL 覆盖。
export const DEFAULT_MODEL = "doubao-seed-2-1-lite-260915";
export const TIMEOUT_MS = 60_000;

export type UserContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

export type ModelCall =
  | { kind: "ok"; content: string }
  | { kind: "timeout" }
  | { kind: "http"; status: number };

export async function callModel(
  apiKey: string,
  model: string,
  system: string,
  user: UserContent,
  timeoutMs = TIMEOUT_MS,
): Promise<ModelCall> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0,
        // 识题与讲解都是有界输出，关闭深度思考以控制时延与费用。
        thinking: { type: "disabled" },
      }),
    });
  } catch {
    return { kind: "timeout" };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) return { kind: "http", status: response.status };

  try {
    const data = await response.json() as { choices?: { message?: { content?: unknown } }[] };
    const raw = data.choices?.[0]?.message?.content;
    return { kind: "ok", content: typeof raw === "string" ? raw : "" };
  } catch {
    return { kind: "http", status: 502 };
  }
}

export type JsonCall =
  | { ok: true; value: unknown }
  | { ok: false; status: number; error: string };

/** 把上游 HTTP 状态归入应用自有错误码，避免与网关的 401/403 混淆。 */
function upstreamFailure(status: number, prefix: "recognize" | "explain"): { status: number; error: string } {
  if (status === 401 || status === 403) return { status: 502, error: `${prefix}_upstream_auth` };
  if (status === 404) return { status: 502, error: `${prefix}_model_unavailable` };
  if (status === 429) return { status: 429, error: `${prefix}_rate_limited` };
  return { status: 502, error: `${prefix}_upstream_error` };
}

/** 调用一次模型并解析 JSON 对象；错误码按 badResponseError 前缀归类。 */
export async function completeJson(
  apiKey: string,
  system: string,
  user: UserContent,
  badResponseError: string,
  timeoutError = "recognize_timeout",
): Promise<JsonCall> {
  const prefix = badResponseError.startsWith("explain") ? "explain" : "recognize";
  const model = Deno.env.get("ARK_MODEL")?.trim() || DEFAULT_MODEL;
  const call = await callModel(apiKey, model, system, user);
  if (call.kind === "timeout") return { ok: false, status: 504, error: timeoutError };
  if (call.kind === "http") return { ok: false, ...upstreamFailure(call.status, prefix) };

  const cleaned = call.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch {
    return { ok: false, status: 502, error: badResponseError };
  }
}

/** 模型主动声明「无法处理」时的统一出口。 */
export function declaredError(value: unknown): { status: number; error: string; reason?: string } | null {
  if (!value || typeof value !== "object" || !("error" in value)) return null;
  const e = value as { error?: unknown; reason?: unknown };
  const code = e.error === "unreadable_image" ? "unreadable_image" : "unsupported_problem";
  const reason = typeof e.reason === "string" ? e.reason.slice(0, 200) : undefined;
  return { status: 422, error: code, reason };
}

export function stringList(input: unknown, max: number, maxLength: number): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    out.push(trimmed.slice(0, maxLength));
    if (out.length >= max) break;
  }
  return out;
}