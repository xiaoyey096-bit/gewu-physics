// 同源 Function 请求助手（改编自 Sites 官方 api.ts 契约）。
// 保留 401/403 处理、网关错误映射与成功载荷校验；错误文案为应用自有的中文映射。

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number = 0, readonly reason?: string) {
    super(message);
    this.name = "ApiError";
  }
}

const DEFAULT_MESSAGES: Readonly<Record<string, string>> = {
  network_error: "网络请求失败，请检查连接后重试。",
  invalid_response: "服务返回了异常响应，请稍后重试。",
  invalid_body: "请求内容不合法。",
  invalid_image: "图片格式不正确，请上传 PNG/JPG 等常见图片。",
  image_too_large: "图片过大，请压缩到 7MB 以内再试。",
  service_not_configured: "识题服务尚未配置密钥，暂时无法识别图片。可以先体验示例题。",
  recognize_timeout: "识别超时，请稍后重试。",
  recognize_upstream_error: "识别服务暂时不可用，请稍后重试。",
  recognize_upstream_auth: "识题服务的密钥无效或缺少模型权限。",
  recognize_model_unavailable: "识题模型不可用，请确认模型已在控制台开通。",
  recognize_rate_limited: "识别请求过于频繁，请稍后再试。",
  recognize_bad_response: "识别结果无法解析，请换一张更清晰的题目照片。",
  explain_timeout: "AI 讲解超时，请稍后重试。",
  explain_upstream_error: "讲解服务暂时不可用，请稍后重试。",
  explain_upstream_auth: "讲解服务的密钥无效或缺少模型权限。",
  explain_model_unavailable: "讲解模型不可用，请确认模型已在控制台开通。",
  explain_rate_limited: "讲解请求过于频繁，请稍后再试。",
  explain_bad_response: "AI 讲解返回异常，请稍后重试。",
  unreadable_image: "图片不够清晰，无法辨认题目内容。",
  unsupported_problem: "当前版本支持抛体、斜面、滑块木板、一维碰撞四类题。",
  access_denied: "没有访问权限。",
  request_failed: "请求失败，请稍后重试。",
};

export async function requestJson(
  url: string,
  init: RequestInit = {},
  messages: Readonly<Record<string, string>> = {},
): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && typeof init.body === "string") headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, credentials: "same-origin" });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError(DEFAULT_MESSAGES.network_error, "network_error");
  }
  if (response.status === 401 || response.status === 403) {
    throw new ApiError(
      response.status === 401 ? "请先登录后继续。" : "没有访问权限。",
      "access_denied",
      response.status,
    );
  }
  if (response.redirected || !response.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError(DEFAULT_MESSAGES.invalid_response, "invalid_response", response.status);
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(DEFAULT_MESSAGES.invalid_response, "invalid_response", response.status);
  }
  const body = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const code =
    typeof body?.error === "string"
      ? body.error
      : (!response.ok || body?.ok === false) && typeof body?.code === "string"
        ? body.code
        : response.ok
          ? null
          : "request_failed";
  if (!response.ok || body?.ok === false || code) {
    const resolved = code ?? "request_failed";
    const message = Object.prototype.hasOwnProperty.call(messages, resolved)
      ? messages[resolved]
      : Object.prototype.hasOwnProperty.call(DEFAULT_MESSAGES, resolved)
        ? DEFAULT_MESSAGES[resolved]
        : DEFAULT_MESSAGES.request_failed;
    throw new ApiError(message, resolved, response.status, typeof body?.reason === "string" ? body.reason : undefined);
  }
  return data;
}