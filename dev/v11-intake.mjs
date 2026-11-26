// Intake failure honesty + lightbox wheel zoom.
// Health and recognition are intercepted at the network layer so both paths are deterministic and keyless.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, runProbe, enterStudy, sleep } from "./cdp.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HEALTH = {
  ok: true,
  service: "gewu-physics",
  schemaVersion: 1,
  templates: ["projectile", "incline", "blockBoard", "collision1d"],
  recognizeConfigured: true,
};
const UNSUPPORTED = { ok: false, error: "unsupported_problem", reason: "涉及弹簧弹力与多物体静摩擦，超出四种模型" };

await runProbe("v11-intake", { port: 9368, width: 1440, height: 900 }, async ({ browser, check, expect, shot, log }) => {
  const body = () => browser.evaluate("document.body.innerText");
  const handled = new Set();
  let recognizeResponse = { status: 422, body: UNSUPPORTED };

  const pump = async () => {
    for (const event of browser.events) {
      if (event.method !== "Fetch.requestPaused" || handled.has(event.params.requestId)) continue;
      handled.add(event.params.requestId);
      const url = event.params.request.url;
      const reply = url.includes("/health")
        ? { status: 200, body: HEALTH }
        : recognizeResponse;
      await browser.send("Fetch.fulfillRequest", {
        requestId: event.params.requestId,
        responseCode: reply.status,
        responseHeaders: [{ name: "Content-Type", value: "application/json" }],
        body: Buffer.from(JSON.stringify(reply.body)).toString("base64"),
      });
    }
  };
  const until = async (predicate, label, timeout = 10000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      await pump();
      if (await predicate()) return true;
      await sleep(60);
    }
    throw new Error(`Timeout: ${label}`);
  };
  const dismissExpectedHttpErrors = () => {
    const expected = browser.errors.filter((entry) => /status of 422/.test(entry));
    const kept = browser.errors.filter((entry) => !/status of 422/.test(entry));
    log("intentionalHttpErrors", expected);
    browser.errors.length = 0;
    browser.errors.push(...kept);
  };

  await browser.send("Fetch.enable", {
    patterns: [
      { urlPattern: "*/functions/v1/app/health", requestStage: "Request" },
      { urlPattern: "*/functions/v1/app/recognize", requestStage: "Request" },
    ],
  });

  await browser.goto(BASE);
  await until(() => browser.evaluate(`!![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '进入学习空间')`), "landing entry");
  await enterStudy(browser);
  await until(() => browser.exists('input[aria-label="选择题目文件"]'), "intake input");

  // --- A. lightbox wheel zoom ---
  await browser.send("DOM.enable");
  const doc = await browser.send("DOM.getDocument", { depth: -1 });
  const input = await browser.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: 'input[aria-label="选择题目文件"]' });
  await browser.send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [join(ROOT, "dev", "problem-photo.png")] });
  await until(() => browser.exists('button[aria-label="放大查看题目照片"]'), "photo staged");
  await browser.clickSelector('button[aria-label="放大查看题目照片"]');
  await until(() => browser.exists('[role="dialog"][data-state="open"] img[alt="题目照片放大预览"]'), "lightbox open");
  const percent = () => browser.evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"][data-state="open"]');
    const text = dialog?.innerText.match(/(\\d+)%/);
    return text ? Number(text[1]) : null;
  })()`);
  const viewport = await browser.evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"][data-state="open"]');
    const box = dialog.querySelector('img[alt="题目照片放大预览"]').parentElement.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  })()`);
  const base = await percent();
  check("lightboxStartsAt100", base === 100, base);
  for (let i = 0; i < 3; i++) {
    await browser.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: viewport.x, y: viewport.y, deltaX: 0, deltaY: -160, button: "none" });
    await sleep(60);
  }
  const zoomedIn = await percent();
  check("wheelZoomsIn", typeof zoomedIn === "number" && zoomedIn > base, zoomedIn);
  await shot("A1-wheel-zoom-in.png");
  for (let i = 0; i < 6; i++) {
    await browser.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: viewport.x, y: viewport.y, deltaX: 0, deltaY: 160, button: "none" });
    await sleep(60);
  }
  const zoomedOut = await percent();
  check("wheelZoomsOut", typeof zoomedOut === "number" && zoomedOut < zoomedIn, { base, zoomedIn, zoomedOut });
  await browser.key("Escape", "Escape", 27);
  await until(() => browser.evaluate(`!document.querySelector('[role="dialog"][data-state="open"]')`), "lightbox closed");

  // --- B. unsupported problem must not fabricate a problem ---
  await browser.send("DOM.getDocument", { depth: -1 }); // re-acquire after dialog
  await browser.click("识别并生成动画", "main button", { exact: true });
  await until(() => browser.evaluate(`document.body.innerText.includes('这道题暂不支持')`), "unsupported alert");
  const failureText = await body();
  check("failureReasonVisible", failureText.includes("涉及弹簧弹力与多物体静摩擦"), failureText.slice(0, 300));
  check("noFabricatedCompose", !(await browser.exists('[aria-label="题目内容（可编辑）"]')));
  check("photoKeptAfterFailure", await browser.exists('button[aria-label="放大查看题目照片"]'));
  check("retryOffered", failureText.includes("重新识别"));
  check("localParseHiddenWithoutText", !failureText.includes("按本地规则解析文字"));
  await shot("B1-unsupported-alert.png");
  dismissExpectedHttpErrors();

  // --- C. explicit local parse is opt-in and keeps real text ---
  const typed = "质量 1 kg 的小球以 20 m/s 水平抛出，g 取 9.8 m/s²，求落地时间。";
  await browser.type('[aria-label="题干或提问输入"]', typed);
  await browser.click("按本地规则解析文字", "button", { exact: true });
  await until(() => browser.exists('[aria-label="题目内容（可编辑）"]'), "compose after explicit local parse");
  const statement = await browser.evaluate(`document.querySelector('[aria-label="题目内容（可编辑）"]').value`);
  const composeText = await body();
  check("localParseKeepsTypedStatement", statement.includes("20 m/s 水平抛出"), statement);
  check("localParseHiddenNotice", composeText.includes("已按本地规则解析文字") && composeText.includes("请逐项核对参数"), composeText.slice(0, 300));
  check("localParseNoPhotoPlaceholder", !statement.includes("（图片题目）"), statement);
  await shot("C1-local-parse-compose.png");

  // --- D. re-recognize from compose returns to compose with a fresh failure, inputs intact ---
  await browser.click("返回修改输入", "button", { exact: true });
  await until(() => browser.exists('[aria-label="题干或提问输入"]'), "back to intake");
  await browser.click("识别并生成动画", "main button", { exact: true });
  await until(() => browser.evaluate(`document.body.innerText.includes('这道题暂不支持')`), "second unsupported alert");
  check("retryKeepsText", await browser.evaluate(`(() => {
    const area = document.querySelector('[aria-label="题干或提问输入"]');
    return !!area && area.value.includes("20 m/s 水平抛出");
  })()`));
  check("retryKeepsPhoto", await browser.exists('button[aria-label="放大查看题目照片"]'));
  dismissExpectedHttpErrors();
  await browser.send("Fetch.disable");
});