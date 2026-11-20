// DashScope（阿里云百炼）OpenAI 兼容端点的共用调用层。
// 固定可信服务端目标 + 超时 + 候选模型顺序回退；绝不回显上游异常或密钥。

const ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
// 模型可用性随账号开通情况不同，按顺序取第一个可用者。
export const MODEL_CANDIDATES = ["qwen3-vl-plus", "qwen3-vl-max", "qwen-vl-max-latest"];
export const TIMEOUT_MS = 60_000;

export type UserContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

export type ModelCall =
  | { kind: "ok"; content: string }
  | { kind: "timeout" }
  | { kind: "rejected" };

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
      }),
    });
  } catch {
    return { kind: "timeout" };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) return { kind: "rejected" };

  try {
    const data = await response.json() as { choices?: { message?: { content?: unknown } }[] };
    const raw = data.choices?.[0]?.message?.content;
    return { kind: "ok", content: typeof raw === "string" ? raw : "" };
  } catch {
    return { kind: "rejected" };
  }
}

export type JsonCall =
  | { ok: true; value: unknown }
  | { ok: false; status: number; error: string };

/** 依次尝试候选模型，取回第一个可解析的 JSON 对象。 */
export async function completeJson(
  apiKey: string,
  system: string,
  user: UserContent,
  badResponseError: string,
  timeoutError = "recognize_timeout",
): Promise<JsonCall> {
  let content: string | null = null;
  for (const model of MODEL_CANDIDATES) {
    const call = await callModel(apiKey, model, system, user);
    if (call.kind === "ok") {
      content = call.content;
      break;
    }
    if (call.kind === "timeout") return { ok: false, status: 504, error: timeoutError };
  }
  if (content === null) return { ok: false, status: 502, error: "recognize_upstream_error" };

  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
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