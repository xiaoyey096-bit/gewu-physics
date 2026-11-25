# 格物 · 物理解题动画助手

把一道物理题变成**可交互的运动动画**：上传题目照片或直接输入题干，AI 先区分「题目内容」与「你的问题」，
再求解出解析解，最后由同一个解驱动动画、参数讲解、分步题解和逐条答疑。

线上地址：<https://gewu-physics-brq725ks9ut.qoder.zone>（当前为私有访问，需要 Qoder 账号）

面向读者：中学生与大学物理初学者。

## 为什么不是「AI 画个动画」

动画如果靠预设关键帧或经验曲线拟合，学生拖一下滑杆就会发现数值对不上。本项目的基本约束是
**先求解，再动画**：

- `lib/physics.ts` 用分段解析解算出位移、速度、加速度、摩擦力的突变时刻；
- 画布（`lib/renderer.ts`）、讲解文案（`lib/explain.ts`）、题解 Markdown 三处数值全部取自这一份解；
- 改任何一个参数就重新求解，动画、读数、题解同步变化，不存在「近似口径」。

多个临界状态是这类题目的难点（滑块和木板谁先动、共速后摩擦力怎么变），所以动画时间轴上每个临界态都会
列出「这一阶段新出现了哪些力、哪些力消失」。画布默认只保留运动方向（速度）要素，受力箭头要显式打开
「受力分析」才会叠加；整段运动中第一次登场的力用红色标出，消失后又回来的力保持墨色，不重复提示。

## 功能

- **题目输入**：照片 / PDF / Word / txt / 直接打字；Enter 提交，Ctrl+Enter 换行；识别结果可先编辑再确认。
- **动画舞台**：播放、倍速、阶段跳转、9 个显示开关（受力分析、状态箭头、轨迹、矢量、频闪、尺寸标注、能量面板等），参数滑杆实时重算。
- **右侧面板**：动画参数 / 对话 / 对象与受力三个页签；对象与受力页签列出每个研究对象的受力随阶段变化，点「定位」把画面停在该临界状态并显示速度方向。
- **导出**：当前帧 PNG、临界帧拼图 PNG、MP4 视频、题解 Markdown，全部在浏览器本地完成。
- **题库**：项目分组（支持无限层级文件夹）、搜索、筛选、排序、拖拽、批量管理、删除可撤销。
- **本地优先**：题目与作答存在浏览器 IndexedDB，三级回退（IndexedDB → localStorage → 内存），不上传作业数据。
- **响应式**：1440 / 1100 / 390 三档布局；界面只有浅色一套配色，系统「深色模式」偏好不影响任何底色。

已支持的物理模型：平抛与斜抛、斜面（含静/动摩擦力转换）、滑块—木板板块模型、一维弹性与非弹性碰撞。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS 4 + shadcn/Radix 原语 |
| 物理与绘制 | 自研解析求解器 + Canvas 2D 同步绘制 + KaTeX 公式 |
| 本地能力 | pdf.js（PDF 取字）、docx 解析、mp4-muxer（浏览器内导出视频） |
| 服务端 | Qoder Sites Edge Function（Deno），仅做识题、讲解、答疑三类 LLM 调用 |
| 存储 | 浏览器 IndexedDB；服务端不落库 |

## 本地运行

```bash
npm ci
npm run dev            # Vite 前端，默认 http://127.0.0.1:5173
npm run dev:function   # 可选：本地函数服务，监听 http://127.0.0.1:8000
npm run build          # tsc --noEmit + vite build → dist
npm run check:function # deno check functions/index.ts
```

两个端口是两条独立进程：**5173 是页面**，**8000 是服务端函数的本地替身**。Vite 把页面上的
`/functions/v1/app/*` 请求代理到 `127.0.0.1:8000`；线上则由 Qoder Sites 网关直接路由到 Edge Function，
本地代理配置不代表线上路由。只跑 `npm run dev` 也能看动画、题解、导出等全部本地功能。

本地没有 `DASHSCOPE_API_KEY`，因此 `/app/recognize`、`/app/explain` 返回 503
`service_not_configured`、`/app/health` 里 `recognizeConfigured:false` —— 这是设计如此：
密钥只存在于站点的服务端环境变量中，由管理员在部署平台上手工填写，从不进入代码、仓库或本地终端。
带密钥的链路只能在发布后验证。

## 实测验收

改完必须跑探针：用无头 Chrome 通过 CDP 发真实鼠标键盘事件，断言 DOM 与画布像素，并记录控制台报错。
探针默认打 `http://127.0.0.1:5173`，如果本地 Vite 起了别的端口（5173 被占用时会顺延），用 `BASE` 覆盖：

```bash
BASE=http://127.0.0.1:5173 node dev/v8-forces.mjs
```

`dev/` 下的主要探针：`v2-smoke`（入口到导出）、`v2-interact`（滑杆/倍速/浅色底色不受系统深色影响/刷新持久化）、
`v2-lib`（重命名、删除+撤销、排序、批量）、`v2-responsive`（三档屏宽无横向溢出）、
`v3-workspace`（单双击、标准答题、详解双解法）、`v4-math`（KaTeX 渲染与超长公式回退）、
`v4-export`（PNG / MP4，含真实解码校验）、`v4-motion`（临界态与能量守恒数值）、
`v5-audit`（照片入口降级、题干/提问拆分、参数极值）、`v6-templates`（多模型）、
`v7-folders`（项目分组、子文件夹、示例题库只播种一次）、
`v8-forces`（受力分析与临界状态）、`v10-upload`（真实 docx / pdf 文件走上传链路）。

通过口径：`consoleErrors` 为空、画布有实际绘制像素、导出文件真实生成且能被解码。
报告与截图落在 `dev/downloads/`，该目录不参与站点构建，也不要提交。

## 目录

```
lib/            物理内核与共享层（在仓库根，不在 src 下，见下方别名说明）
src/features/   intake 输入 / stage 舞台与控制 / explain 右栏 / library 题库 / shell 三栏外壳
components/ui/  shadcn 原语
functions/      Edge Function：handler / recognize / explain / llm / schema / physics
dev/            仅开发期：CDP 探针、截图与本地题目夹具，不参与站点构建
docs/           高中物理示例题库
vendor/         第三方样式表原件及其许可证
```

别名 `@` 指向**项目根**（`tsconfig.json` 与 vite alias 一致）：`@/lib/...` 是根目录 `lib/`，
`@/components/ui/...` 是根目录 `components/`，src 内部特性要写 `@/src/features/...`。
仓库里还有一份本地开发文档（协作约定与完整坑清单），随开发环境维护，未纳入发布产物。

## 发布

构建产物为 `dist/`，服务端代码为 `functions/`，通过 Qoder Sites 的 `prepare_site` →
`publish_site` 流程发布；密钥以 `secretNames:["DASHSCOPE_API_KEY"]` 声明，值只在平台侧录入。
部署不上传 `dev/`、`node_modules` 或源码。

## 来源

本项目基于 Qoder Sites 的 React starter 模板改造，UI 组件目录、hooks、Tailwind 样式表与
vendored shadcn CSS 的出处与许可证说明见 `PROVENANCE.md` 与 `vendor/`。
