import { handler } from "../functions/handler.ts";

// 可选加载 functions/.env（已被 gitignore）；不存在时沿用进程环境变量。
try {
  const text = await Deno.readTextFile(new URL("../functions/.env", import.meta.url));
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
    if (value && !Deno.env.get(match[1])) Deno.env.set(match[1], value);
  }
} catch {
  // 没有本地 env 文件属正常情况。
}

Deno.serve({ hostname: "127.0.0.1", port: 8000 }, handler);
