import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxy = { "/functions/v1/app": "http://127.0.0.1:8000" };

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // 探针导出的 PNG/Markdown 落在 dev/downloads，Chrome 下载中途会留下 .crdownload 占位文件，
  // 文件监视器读到它会 EBUSY 直接崩掉 dev server，因此这里必须忽略该目录。
  server: { host: "127.0.0.1", proxy, watch: { ignored: ["**/dev/downloads/**"] } },
  preview: { host: "127.0.0.1", proxy },
  build: { outDir: "dist" },
});
