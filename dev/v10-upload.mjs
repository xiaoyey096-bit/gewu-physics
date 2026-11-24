// 本地题目文件实测：真 .docx 与真 .pdf 走「+ 添加本地文件」→ 抽取文字 → 提交 → 确认页。
// 夹具在 dev/uploads/：docx 由 python-docx 生成，pdf 由无头 Chrome 打印同题干 HTML 得到。
import { fileURLToPath } from "node:url";
import { launch, enterStudy, BASE, sleep } from "./cdp.mjs";

const upload = (name) => fileURLToPath(new URL(`uploads/${name}`, import.meta.url));

const files = [
  { name: "题目-滑块木板.docx", path: upload("题目-滑块木板.docx"), keyword: "木板" },
  { name: "题目-平抛.pdf", path: upload("题目-平抛.pdf"), keyword: "无人机" },
];

const TEXT = 'textarea[aria-label="题干或提问输入"]';
const results = [];
const browser = await launch({ port: 9342, width: 1440, height: 900 });
await browser.send("DOM.enable");
try {
  for (const file of files) {
    await browser.goto(BASE);
    await sleep(400);
    await enterStudy(browser);
    const doc = await browser.send("DOM.getDocument", { depth: -1 });
    const found = await browser.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: `input[aria-label="选择题目文件"]` });
    if (!found.nodeId) throw new Error(`${file.name}：找不到文件输入框`);
    await browser.send("DOM.setFileInputFiles", { files: [file.path], nodeId: found.nodeId });
    const picked = await browser.wait(
      `(() => { const t = document.querySelector(${JSON.stringify(TEXT)}); return t && t.value.includes(${JSON.stringify(file.keyword)}) ? t.value : null; })()`,
      `${file.name} 抽取到正文`,
      20000,
    );
    const notice = await browser.evaluate(`(() => {
      const main = document.querySelector("main") || document.body;
      const line = [...main.querySelectorAll("p,span,div")].map((el) => el.textContent.trim()).find((s) => /已把|已读取|没从这个文件|识题服务|解析失败|读不出/.test(s));
      return line ? line.slice(0, 90) : null;
    })()`);
    await browser.key("Enter", "Enter");
    const confirm = await browser.wait(
      `(() => { const t = document.querySelector('textarea[aria-label="题目内容（可编辑）"]'); return t ? { statement: t.value.slice(0, 40), template: (document.querySelector('[aria-label="题型模板"]')?.textContent || "").trim() } : null; })()`,
      `${file.name} 进入确认页`,
      25000,
    );
    results.push({ file: file.name, chars: picked.length, notice, confirm });
  }
} finally {
  const consoleErrors = browser.errors.slice(0, 6);
  console.log(JSON.stringify({ results, consoleErrors }, null, 2));
  if (consoleErrors.length) process.exitCode = 1;
  await browser.close();
}
