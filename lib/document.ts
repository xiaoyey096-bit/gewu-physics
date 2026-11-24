// 本地题目文件 → 文字 / 图片：txt·md·docx 直接抽文字，pdf 取文字层并把首页渲染成图片交给识题。
// docx 用浏览器原生 DecompressionStream 解 zip，不引入额外依赖；pdf 按需动态加载 pdf.js。

export interface DocumentInput {
  /** 抽取出的题干文字，可能为空。 */
  text: string;
  /** PDF 首页渲染出的 PNG data URL。 */
  image?: string;
  /** 未能完成的部分，用一句话说明，界面如实提示。 */
  notice?: string;
}

const MAX_TEXT_CHARS = 4000;

function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/** 扫描 zip 的本地文件头，取出指定条目的内容。 */
async function unzipEntry(buffer: ArrayBuffer, wanted: string): Promise<Uint8Array | null> {
  const view = new DataView(buffer);
  let offset = 0;
  while (offset + 30 <= buffer.byteLength) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compressed = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = decode(new Uint8Array(buffer, offset + 30, nameLength));
    const start = offset + 30 + nameLength + extraLength;
    if (compressed === 0) return null;
    if (name === wanted) {
      const bytes = new Uint8Array(buffer, start, compressed);
      if (method === 0) return bytes;
      if (typeof DecompressionStream === "undefined") return null;
      const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    offset = start + compressed;
  }
  return null;
}

function stripTags(xml: string): string {
  return xml
    .replace(/<w:tab[^>]*\/>/g, " ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractDocx(file: File): Promise<DocumentInput> {
  try {
    const buffer = await file.arrayBuffer();
    const xml = await unzipEntry(buffer, "word/document.xml");
    if (!xml) return { text: "", notice: "这份 docx 读不出正文（可能是加密或非常规打包），请把题干粘贴进来。" };
    const text = stripTags(decode(xml)).slice(0, MAX_TEXT_CHARS);
    return text ? { text } : { text: "", notice: "这份 docx 里没有文字，题目可能是图片；请改用截图上传。" };
  } catch {
    return { text: "", notice: "docx 解析失败，请把题干粘贴进来或改上传图片。" };
  }
}

async function extractPdf(file: File): Promise<DocumentInput> {
  try {
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const data = new Uint8Array(await file.arrayBuffer());
    const task = pdfjs.getDocument({ data });
    const page = await (await task.promise).getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(viewport.width, 2000);
    canvas.height = Math.round(canvas.width * (viewport.height / viewport.width));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      await task.destroy();
      return { text: "", notice: "浏览器不支持画布渲染，无法读取 PDF 首页。" };
    }
    const scale = canvas.width / viewport.width;
    await page.render({ canvas, canvasContext: ctx, viewport: page.getViewport({ scale: viewport.scale * scale }) }).promise;
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join("")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_TEXT_CHARS);
    await task.destroy();
    const image = canvas.toDataURL("image/jpeg", 0.86);
    if (!text) return { text: "", image, notice: "PDF 里没有可复制的文字，已把首页当作图片交给识别。" };
    return { text, image };
  } catch {
    return { text: "", notice: "这份 PDF 解析失败（可能受保护），请改传题目截图或文字。" };
  }
}

export async function extractProblemFile(file: File): Promise<DocumentInput> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return extractDocx(file);
  }
  if (lower.endsWith(".pdf") || file.type === "application/pdf") {
    return extractPdf(file);
  }
  if (lower.endsWith(".txt") || lower.endsWith(".md") || file.type.startsWith("text/")) {
    const text = (await file.text()).trim().slice(0, MAX_TEXT_CHARS);
    return text ? { text } : { text: "", notice: "文件是空的。" };
  }
  return { text: "", notice: "暂不支持这种文件；可以用题目图片、PDF、Word（.docx）或 txt。" };
}
