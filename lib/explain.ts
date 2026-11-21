// 讲解引擎：参数讲解、过程讲解、答疑。全部由解析解实时算出，数值与动画严格一致。
// 云端 AI 深度讲解为可选增强，缺失时本地内容依然完整可用。

import type { Explanation, ParamNote, Phase, Problem, QaItem, SolveResult } from "./types";
import { G_PRESETS } from "./types";
import { askLabels, kindLabel } from "./text";

const f = (x: number, d = 2): string => Number(x.toFixed(d)).toString();

interface Ctx {
  problem: Problem;
  result: SolveResult;
  v0x: number;
  v0y: number;
  landingVy: number;
  landingSpeed: number;
  landingAngle: number;
}

function ctxOf(problem: Problem, result: SolveResult): Ctx {
  const rad = (problem.params.angleDeg * Math.PI) / 180;
  const v0x = problem.params.v0 * Math.cos(rad);
  const v0y = problem.params.v0 * Math.sin(rad);
  const landingVy = -Math.sqrt(v0y * v0y + 2 * problem.params.g * problem.params.h0);
  const landingSpeed = Math.hypot(v0x, landingVy);
  const landingAngle = (Math.atan2(-landingVy, v0x) * 180) / Math.PI;
  return { problem, result, v0x, v0y, landingVy, landingSpeed, landingAngle };
}

export function buildParamNotes(problem: Problem, result: SolveResult): ParamNote[] {
  const c = ctxOf(problem, result);
  const { v0, angleDeg, h0, g } = problem.params;
  const gName = G_PRESETS.find((p) => Math.abs(p.value - g) < 1e-6)?.label ?? "自定义";
  return [
    {
      key: "v0",
      symbol: "v₀",
      label: "初速度",
      meaning: "出手瞬间的速度大小，是水平与竖直两个分量的总预算。",
      current: `${f(v0)} m/s → v₀ₓ = ${f(c.v0x)} m/s，v₀ᵧ = ${f(c.v0y)} m/s`,
      effect: `X ∝ v₀²、H ∝ v₀²、T ∝ v₀：v₀ 加倍，射程与高度都变 4 倍，飞行时间变 2 倍。当前 X = ${f(result.range)} m。`,
    },
    {
      key: "angleDeg",
      symbol: "θ",
      label: "抛射角",
      meaning: "决定 v₀ 在水平与竖直之间如何分配，不改变速度大小。",
      current: `${f(angleDeg)}°（${kindLabel(problem.params)}）→ cosθ = ${f(Math.cos((angleDeg * Math.PI) / 180))}，sinθ = ${f(Math.sin((angleDeg * Math.PI) / 180))}`,
      effect:
        h0 > 0.01
          ? `同高度抛射在 45° 射程最远；有初始高度 h₀ = ${f(h0)} m 时最佳角略小于 45°。θ→90° 射程→0、高度最大；θ=0 即平抛。`
          : `X = v₀²·sin2θ/g，在 45° 取最大值 ${f((v0 * v0) / g)} m；当前 ${f(angleDeg)}° 给出 ${f(result.range)} m。把 θ 拖到 45° 看看。`,
    },
    {
      key: "h0",
      symbol: "h₀",
      label: "初始高度",
      meaning: "出手点相对落地点的高度，只影响下落段，不影响上升段。",
      current: `${f(h0)} m${h0 > 0.01 ? "（动画中画出发射台支撑柱）" : "（从地面抛出）"}`,
      effect: `h₀ 增大 → 下落更久 → T 与 X 增大，但到最高点的时间 t₁ = v₀ᵧ/g = ${f(result.apexTime)} s 不变。`,
    },
    {
      key: "g",
      symbol: "g",
      label: "重力加速度",
      meaning: "竖直方向的加速度大小，方向始终向下，与物体质量无关。",
      current: `${f(g)} m/s²（${gName}）`,
      effect: `T ∝ 1/g、H ∝ 1/g、X ∝ 1/g：换成月球 g = 1.6，同一抛射的射程约为地球的 ${f(9.8 / 1.6, 1)} 倍，轨迹更「高慢」。`,
    },
  ];
}

export function buildPhases(problem: Problem, result: SolveResult): Phase[] {
  const c = ctxOf(problem, result);
  const T = result.series.duration;
  const t1 = result.apexTime;
  const w = Math.max(0.04, T * 0.03);
  const w2 = Math.max(0.05, T * 0.04);
  const flat = problem.params.angleDeg <= 0.5;
  return [
    {
      id: "rise",
      title: flat ? "出手 · 平抛开始" : "上升段",
      text: flat
        ? `平抛没有上升段：出手时 vᵧ = 0，此后橙色箭头向下并不断变长；青色箭头始终 ${f(c.v0x)} m/s 不变。轨迹从出手点立刻向下弯曲。`
        : `vᵧ 从 ${f(c.v0y)} m/s 每秒减少 ${f(problem.params.g)} m/s，水平分量保持 ${f(c.v0x)} m/s。合速度方向逐渐变平，轨迹上升但越来越「缓」。`,
      start: 0,
      end: Math.max(0, t1 - w),
      seek: flat ? T * 0.2 : t1 * 0.5,
    },
    {
      id: "apex",
      title: "最高点",
      text: flat
        ? `出手点即最高点，离地 ${f(result.maxHeight)} m。此处 vᵧ = 0，但加速度仍是 g —— 速度为零不代表受力为零。`
        : `t₁ = ${f(t1)} s 时 vᵧ = 0，合速度只剩水平分量 ${f(c.v0x)} m/s，方向水平；离地高度 H = ${f(result.maxHeight)} m。加速度仍为 g，方向向下。`,
      start: Math.max(0, t1 - w),
      end: Math.min(T, t1 + w),
      seek: t1,
    },
    {
      id: "fall",
      title: "下落段",
      text: `vᵧ 反向增大，轨迹变陡。相等时间间隔里水平位移相等（匀速），竖直位移越来越大，相邻位移差恒为 g·Δt² —— 打开「频闪」开关就能看到这组点。`,
      start: Math.min(T, t1 + w),
      end: Math.max(0, T - w2),
      seek: t1 + (T - t1) * 0.55,
    },
    {
      id: "land",
      title: "落地",
      text: `t = T = ${f(T)} s 时 y = 0，水平射程 X = ${f(result.range)} m。落地速度 v = ${f(c.landingSpeed)} m/s，方向与水平成 ${f(c.landingAngle)}° 向下；由能量守恒 ½mv² = ½mv₀² + mgh₀ 可直接验证。`,
      start: Math.max(0, T - w2),
      end: T,
      seek: T,
    },
  ];
}

export function phaseIndexAt(phases: Phase[], t: number): number {
  for (let i = phases.length - 1; i >= 0; i--) {
    if (t >= phases[i].start - 1e-9) return i;
  }
  return 0;
}

interface KnowledgeEntry {
  test: RegExp;
  build: (c: Ctx) => { answer: string[]; evidence: string };
}

const KNOWLEDGE: KnowledgeEntry[] = [
  {
    test: /水平.*(不变|匀速|恒定|为什么|一样)|为什么.*水平|vx|v₀ₓ/,
    build: (c) => ({
      answer: [
        "忽略空气阻力时，小球在空中只受重力，方向竖直向下，水平方向合力为 0。",
        "由牛顿第二定律 aₓ = Fₓ/m = 0，水平速度保持不变，做匀速直线运动。",
        "动画里青色箭头代表 v₀ₓ，它的长度自始至终不变；变化的只有橙色箭头 vᵧ。",
      ],
      evidence: `本题 v₀ₓ = v₀·cosθ = ${f(c.v0x)} m/s，全程恒定。`,
    }),
  },
  {
    test: /竖直|重力|加速度|vy|vᵧ|失重/,
    build: (c) => ({
      answer: [
        "竖直方向只受重力，加速度恒为 g，方向向下，与速度方向无关。",
        "上升时 vᵧ 与 a 反向 → 减速；最高点 vᵧ = 0 但 a 仍为 g；下落时同向 → 加速。",
        "所以最高点不是「平衡点」：速度为零的瞬间，受力并不为零。",
      ],
      evidence: `vᵧ(t) = ${f(c.v0y)} − ${f(c.problem.params.g)}·t；t₁ = ${f(c.result.apexTime)} s 时 vᵧ = 0。`,
    }),
  },
  {
    test: /45|最远|最大射程|射程.*(最大|最远)|角度.*(最远|最大)/,
    build: (c) => ({
      answer: [
        "落回同一高度时 X = v₀²·sin2θ/g，sin2θ 在 2θ = 90° 即 θ = 45° 时取最大值 1。",
        "θ 与 (90° − θ) 的射程相同（例如 30° 与 60°），但 60° 飞得更高更久。",
        "若出手点高于落地点（h₀ > 0），最佳角略小于 45°，因为下落段额外赠送了水平飞行时间。",
      ],
      evidence:
        c.problem.params.h0 > 0.01
          ? `本题 h₀ = ${f(c.problem.params.h0)} m，当前 θ = ${f(c.problem.params.angleDeg)}° 给出 X = ${f(c.result.range)} m；把 θ 调到 40°~45° 对比试试。`
          : `本题 θ = ${f(c.problem.params.angleDeg)}° → X = ${f(c.result.range)} m；45° 时 X = ${f((c.problem.params.v0 ** 2) / c.problem.params.g)} m。`,
    }),
  },
  {
    test: /时间|多久|几秒|飞行|滞空/,
    build: (c) => ({
      answer: [
        "飞行时间完全由竖直方向决定：解 h₀ + v₀ᵧT − gT²/2 = 0 取正根。",
        "T = (v₀ᵧ + √(v₀ᵧ² + 2gh₀))/g。水平速度再大也不会延长滞空时间。",
        "从地面抛出时 T = 2v₀ᵧ/g，上升与下落各占一半；有 h₀ 时下落段更长。",
      ],
      evidence: `本题 T = ${f(c.result.series.duration)} s，其中上升 ${f(c.result.apexTime)} s、下落 ${f(c.result.series.duration - c.result.apexTime)} s。`,
    }),
  },
  {
    test: /最高|高度|多高|apex/,
    build: (c) => ({
      answer: [
        "最高点出现在 vᵧ = 0 的时刻 t₁ = v₀ᵧ/g。",
        "由 vᵧ² = v₀ᵧ² − 2gΔy 得上升高度 Δy = v₀ᵧ²/(2g)，离地最大高度 H = h₀ + Δy。",
        "增大 θ 或 v₀ 都会抬高 H；增大 g 会压低 H。",
      ],
      evidence: `本题 t₁ = ${f(c.result.apexTime)} s，H = ${f(c.result.maxHeight)} m。`,
    }),
  },
  {
    test: /落地速度|末速度|落到地面.*速度|速度.*多大|撞击/,
    build: (c) => ({
      answer: [
        "落地时水平分量仍是 v₀ₓ，竖直分量 vᵧ = −√(v₀ᵧ² + 2gh₀)。",
        "合速度 v = √(v₀ₓ² + vᵧ²)，方向与水平夹角 arctan(|vᵧ|/v₀ₓ) 向下。",
        "用能量守恒更快：½mv² = ½mv₀² + mgh₀ → v = √(v₀² + 2gh₀)，与抛射角无关。",
      ],
      evidence: `本题 v = ${f(c.landingSpeed)} m/s，方向向下 ${f(c.landingAngle)}°；√(v₀²+2gh₀) = ${f(Math.sqrt(c.problem.params.v0 ** 2 + 2 * c.problem.params.g * c.problem.params.h0))} m/s。`,
    }),
  },
  {
    test: /抛物线|为什么.*弯|轨迹.*形状|曲线/,
    build: (c) => ({
      answer: [
        "水平 x = v₀ₓt，竖直 y = h₀ + v₀ᵧt − gt²/2。",
        "消去 t = x/v₀ₓ 得 y = h₀ + x·tanθ − g·x²/(2v₀²cos²θ)。",
        "这是关于 x 的二次函数，二次项系数为负，所以轨迹是开口向下的抛物线。",
      ],
      evidence: `本题 y = ${f(c.problem.params.h0)} + ${f(Math.tan((c.problem.params.angleDeg * Math.PI) / 180))}·x − ${f(c.problem.params.g / (2 * c.v0x * c.v0x || 1), 4)}·x²。`,
    }),
  },
  {
    test: /对称|上升.*下落|一半|相等/,
    build: (c) => ({
      answer: [
        "从地面抛出并落回地面时，上升与下落完全对称：时间各为 T/2，同一高度处速度大小相等、方向相反。",
        "出手点高于落地点时对称被打破：下落段更长，落地速度大于出手速度。",
        "对称的根源是竖直方向加速度恒定，运动方程关于最高点对称。",
      ],
      evidence: `本题上升 ${f(c.result.apexTime)} s、下落 ${f(c.result.series.duration - c.result.apexTime)} s${c.problem.params.h0 > 0.01 ? "（h₀ > 0，不对称）" : "（对称）"}。`,
    }),
  },
  {
    test: /空气阻力|阻力|摩擦|实际|真实/,
    build: (c) => ({
      answer: [
        "本动画是理想模型：忽略空气阻力，只受重力，因此轨迹是严格抛物线。",
        "真实情况下阻力与速度方向相反，水平速度会衰减，射程变短、最大高度降低。",
        "轨迹也不再对称：下降段更陡，落地角大于抛射角，落点比理想值近。",
      ],
      evidence: `理想射程 ${f(c.result.range)} m 是上限；阻力越大，实际值越小于它。`,
    }),
  },
  {
    test: /质量|重量|多重|轻重|铁球|木球/,
    build: () => ({
      answer: [
        "抛体轨迹与质量无关。重力 F = mg，代入 a = F/m 得 a = g，质量被约掉。",
        "所以同一初速度、同一角度抛出的铁球与木球（忽略阻力）轨迹完全重合。",
        "这也是伽利略「轻重物体同时落地」结论的同一根源。",
      ],
      evidence: "动画中改变 v₀、θ、h₀、g 会改变轨迹，但没有任何质量参数。",
    }),
  },
  {
    test: /频闪|间隔|相等时间|照片|打点/,
    build: (c) => ({
      answer: [
        "频闪照片每隔相同时间 Δt 记录一次位置。",
        "水平方向匀速 → 相邻点水平间距相等；竖直方向匀变速 → 相邻竖直位移差恒为 g·Δt²。",
        "数一数点的间距，就能反推 g：g = Δ(Δy)/Δt²。",
      ],
      evidence: `打开控制区的"频闪"开关，本题全程 ${f(c.result.series.duration)} s 被等分为 12 段，每段 ${f(c.result.series.duration / 12, 3)} s。`,
    }),
  },
  {
    test: /单位|换算|km\/h|千米|公里/,
    build: () => ({
      answer: [
        "国际单位制：速度 m/s、长度 m、时间 s、加速度 m/s²、角度在公式里用弧度。",
        "km/h → m/s 除以 3.6；cm → m 除以 100；g 取 9.8 或按题目要求取 10。",
        "角度代入三角函数时注意计算器处于 DEG 模式。",
      ],
      evidence: "例如 72 km/h = 20 m/s；本题所有参数均已换算为国际单位。",
    }),
  },
  {
    test: /能量|动能|势能|守恒/,
    build: (c) => ({
      answer: [
        "只有重力做功，机械能守恒：½mv² + mgy = ½mv₀² + mgh₀。",
        "最高点动能最小（只剩水平分量），势能最大；落地时势能全部转回动能。",
        "用能量法求落地速度比分解运动更快，且与抛射角无关。",
      ],
      evidence: `落地 v = √(v₀² + 2gh₀) = ${f(c.landingSpeed)} m/s，最高点 v = v₀ₓ = ${f(c.v0x)} m/s。`,
    }),
  },
];

export const SUGGESTED_QUESTIONS = [
  "为什么水平方向的速度一直不变？",
  "抛射角多大时射程最远？",
  "落地时的速度有多大？",
  "飞行时间由什么决定？",
  "为什么轨迹是抛物线？",
  "空气阻力会让结果怎样变化？",
];

export function answerQuestion(question: string, problem: Problem, result: SolveResult): QaItem {
  const c = ctxOf(problem, result);
  const q = question.trim();
  for (const entry of KNOWLEDGE) {
    if (entry.test.test(q)) {
      const { answer, evidence } = entry.build(c);
      return { question: q, answer, evidence, source: "local" };
    }
  }
  return {
    question: q,
    answer: [
      "这道题属于" + kindLabel(problem.params) + "运动，可分解为水平匀速与竖直匀变速两个独立运动。",
      `按当前参数：v₀ₓ = ${f(c.v0x)} m/s，v₀ᵧ = ${f(c.v0y)} m/s，飞行 ${f(result.series.duration)} s，射程 ${f(result.range)} m，最大高度 ${f(result.maxHeight)} m。`,
      "把问题问得更具体一些（例如「为什么水平速度不变」「落地速度多大」「45° 是否最远」），我可以给出对应的推导；也可以开启 AI 深度讲解获得更展开的回答。",
    ],
    evidence: `所求量：${askLabels(problem.ask).join("、")}。`,
    source: "local",
  };
}

export function buildExplanation(
  problem: Problem,
  result: SolveResult,
  questions: string[],
  aiAnswers?: { question: string; answer: string }[],
): Explanation {
  const qa: QaItem[] = questions.map((q) => {
    const ai = aiAnswers?.find((a) => a.question.trim() === q.trim());
    if (ai && ai.answer.trim()) {
      const local = answerQuestion(q, problem, result);
      return { question: q, answer: [ai.answer.trim()], evidence: local.evidence, source: "ai" };
    }
    return answerQuestion(q, problem, result);
  });
  return { params: buildParamNotes(problem, result), phases: buildPhases(problem, result), qa };
}

function solutionNeeds(problem: Problem) {
  const ask = new Set(problem.ask);
  return {
    range: ask.has("range"),
    maxHeight: ask.has("maxHeight"),
    flightTime: ask.has("flightTime") || ask.has("range"),
    apexTime: ask.has("apexTime"),
    landingSpeed: ask.has("landingSpeed"),
  };
}

function solutionAnswer(c: Ctx): string {
  const answers: Record<string, string> = {
    range: `射程为 ${f(c.result.range)} m`,
    maxHeight: `相对落地平面的最大高度为 ${f(c.result.maxHeight)} m`,
    flightTime: `飞行时间为 ${f(c.result.flightTime)} s`,
    apexTime: `到最高点的时间为 ${f(c.result.apexTime)} s`,
    landingSpeed: `落地速度大小为 ${f(c.landingSpeed)} m/s`,
  };
  const requested = [...new Set(c.problem.ask)]
    .filter((key) => Object.hasOwn(answers, key))
    .map((key) => answers[key]);
  return `答：${requested.length ? requested.join("；") : "题目未指定支持的所求量"}。`;
}

/** 标准答题文本；仅展示所求量及必要的中间量，数值始终取未舍入的解析解。 */
export function buildExamSolution(problem: Problem, result: SolveResult): string {
  const c = ctxOf(problem, result);
  const need = solutionNeeds(problem);
  const math = (formula: string) => `$$\n${formula}\n$$`;
  const lines = [
    "解",
    "忽略空气阻力，取落地平面为 $y = 0$，竖直向上为正。",
    ...(need.range ? [math(String.raw`v_{0x} = v_0 \cos\theta \approx ${f(c.v0x)}\,\mathrm{m/s}`)] : []),
    ...(need.flightTime || need.maxHeight || need.apexTime ? [math(String.raw`v_{0y} = v_0 \sin\theta \approx ${f(c.v0y)}\,\mathrm{m/s}`)] : []),
  ];
  if (need.apexTime) lines.push(math(String.raw`t_1 = \frac{v_{0y}}{g} \approx ${f(result.apexTime)}\,\mathrm{s}`));
  if (need.maxHeight) {
    lines.push("相对落地平面的最大高度：", math(String.raw`H = h_0 + \frac{v_{0y}^{2}}{2g} \approx ${f(result.maxHeight)}\,\mathrm{m}`));
  }
  if (need.flightTime) {
    lines.push(
      String.raw`落地时 $h_0 + v_{0y}T - \frac{1}{2}gT^2 = 0$，取非负的落地时刻：`,
      math(String.raw`T = \frac{v_{0y} + \sqrt{v_{0y}^{2} + 2gh_0}}{g} \approx ${f(result.flightTime)}\,\mathrm{s}`),
    );
    if (result.flightTime === 0) lines.push("初始已在落地平面且无向上的初速度，故 $T = 0$。");
  }
  if (need.range) lines.push(math(String.raw`X = v_{0x}T \approx ${f(result.range)}\,\mathrm{m}`));
  if (need.landingSpeed) {
    lines.push(
      String.raw`由机械能守恒 $\frac{1}{2}mv^2 = \frac{1}{2}mv_0^2 + mgh_0$，`,
      math(String.raw`v = \sqrt{v_0^2 + 2gh_0} \approx ${f(c.landingSpeed)}\,\mathrm{m/s}`),
    );
  }
  lines.push(solutionAnswer(c));
  return lines.join("\n\n");
}

/** 两种各自完整的解法，供详解展示、复制与 Markdown 导出共用。 */
export function buildDetailedSolution(problem: Problem, result: SolveResult): string {
  const c = ctxOf(problem, result);
  const need = solutionNeeds(problem);
  const math = (formula: string) => `$$\n${formula}\n$$`;
  const motionTime = need.flightTime || need.landingSpeed;
  const first = [
    "① 分解运动法",
    "解",
    "忽略空气阻力，取落地平面为 $y = 0$，竖直向上为正；物体的加速度 $a_x = 0$，$a_y = -g$。",
    ...(need.range || need.landingSpeed ? [math(String.raw`v_{0x} = v_0 \cos\theta \approx ${f(c.v0x)}\,\mathrm{m/s}`)] : []),
    ...(motionTime || need.maxHeight || need.apexTime ? [math(String.raw`v_{0y} = v_0 \sin\theta \approx ${f(c.v0y)}\,\mathrm{m/s}`)] : []),
  ];
  if (need.range) first.push("水平方向做匀速运动：$x = v_{0x}t$。");
  if (motionTime || need.maxHeight || need.apexTime) {
    first.push(
      "竖直方向做匀变速运动：",
      math(String.raw`y = h_0 + v_{0y}t - \frac{1}{2}gt^2,\qquad v_y = v_{0y} - gt`),
    );
  }
  if (need.maxHeight || need.apexTime) {
    first.push("最高点 $v_y = 0$，", math(String.raw`t_1 = \frac{v_{0y}}{g} \approx ${f(result.apexTime)}\,\mathrm{s}`));
  }
  if (need.maxHeight) {
    first.push("代入位置方程，得到相对落地平面的最大高度：", math(String.raw`H = y(t_1) = h_0 + \frac{v_{0y}^{2}}{2g} \approx ${f(result.maxHeight)}\,\mathrm{m}`));
  }
  if (motionTime) {
    first.push(
      String.raw`落地时 $y(T) = 0$，即 $h_0 + v_{0y}T - \frac{1}{2}gT^2 = 0$，取非负的落地时刻：`,
      math(String.raw`T = \frac{v_{0y} + \sqrt{v_{0y}^{2} + 2gh_0}}{g} \approx ${f(result.flightTime)}\,\mathrm{s}`),
    );
    if (result.flightTime === 0) first.push("本题物体初始已在落地平面且无向上的初速度，故 $T = 0$。");
  }
  if (need.range) first.push(math(String.raw`X = v_{0x}T \approx ${f(result.range)}\,\mathrm{m}`));
  if (need.landingSpeed) {
    first.push(
      "落地速度由水平、竖直分量合成：",
      math(String.raw`v_y(T) = v_{0y} - gT = -\sqrt{v_{0y}^{2} + 2gh_0} \approx ${f(c.landingVy)}\,\mathrm{m/s}`),
      math(String.raw`v = \sqrt{v_{0x}^{2} + v_y(T)^2} \approx ${f(c.landingSpeed)}\,\mathrm{m/s}`),
    );
  }
  first.push(solutionAnswer(c));

  const second = [
    "② 能量与分段运动法",
    "解",
    "忽略空气阻力，以落地平面为重力势能零点。",
    ...(need.range ? [math(String.raw`v_{0x} = v_0 \cos\theta \approx ${f(c.v0x)}\,\mathrm{m/s}`)] : []),
    ...(need.flightTime || need.maxHeight || need.apexTime ? [math(String.raw`v_{0y} = v_0 \sin\theta \approx ${f(c.v0y)}\,\mathrm{m/s}`)] : []),
  ];
  if (need.maxHeight || need.flightTime || need.apexTime) {
    second.push(
      "$H$ 表示相对落地平面的最大高度。从抛出点至最高点，水平方向动能不变，竖直分运动满足：",
      math(String.raw`\frac{1}{2}mv_{0y}^{2} = mg(H - h_0)`),
      math(String.raw`H = h_0 + \frac{v_{0y}^{2}}{2g} \approx ${f(result.maxHeight)}\,\mathrm{m}`),
    );
  }
  if (need.apexTime || need.flightTime) {
    second.push(
      String.raw`上升段末竖直速度为 $0$，由匀减速运动关系 $H - h_0 = \frac{1}{2}gt_1^2$ 得：`,
      math(String.raw`t_1 = \sqrt{\frac{2(H - h_0)}{g}} = \frac{v_{0y}}{g} \approx ${f(result.apexTime)}\,\mathrm{s}`),
    );
  }
  if (need.flightTime) {
    const fallTime = Math.sqrt((2 * result.maxHeight) / problem.params.g);
    second.push(
      String.raw`从最高点下落，竖直初速度为 $0$，由 $H = \frac{1}{2}gt_2^2$ 得：`,
      math(String.raw`t_2 = \sqrt{\frac{2H}{g}} \approx ${f(fallTime)}\,\mathrm{s}`),
      math(String.raw`T = t_1 + t_2 \approx ${f(result.flightTime)}\,\mathrm{s}`),
    );
    if (result.flightTime === 0) second.push("本题 $H = 0$ 且 $v_{0y} = 0$，故 $t_1 = t_2 = T = 0$。");
  }
  if (need.range) {
    second.push("水平方向匀速，故射程为：", math(String.raw`X = v_{0x}T \approx ${f(result.range)}\,\mathrm{m}`));
  }
  if (need.landingSpeed) {
    second.push(
      "从抛出点到落地，机械能守恒：",
      math(String.raw`\frac{1}{2}mv^2 = \frac{1}{2}mv_0^2 + mgh_0`),
      math(String.raw`v = \sqrt{v_0^2 + 2gh_0} \approx ${f(c.landingSpeed)}\,\mathrm{m/s}`),
    );
  }
  second.push(solutionAnswer(c));
  return [...first, ...second].join("\n\n");
}

export function solutionMarkdown(
  problem: Problem,
  result: SolveResult,
  explanation: Explanation,
  questions: string[],
  edits?: { exam?: string; detail?: string },
): string {
  const { v0, angleDeg, h0, g } = problem.params;
  const lines: string[] = [
    `# ${kindLabel(problem.params)}运动 · 题解`,
    "",
    "## 题目",
    problem.statement,
    "",
    "## 已知量",
    String.raw`- 初速度 $v_0 = ${f(v0)}\,\mathrm{m/s}$`,
    String.raw`- 抛射角 $\theta = ${f(angleDeg)}^{\circ}$`,
    String.raw`- 初始高度 $h_0 = ${f(h0)}\,\mathrm{m}$`,
    String.raw`- 重力加速度 $g = ${f(g)}\,\mathrm{m/s^2}$`,
    `- 所求：${askLabels(problem.ask).join("、")}`,
    "",
    "## 题解",
    edits?.exam ?? buildExamSolution(problem, result),
    "",
    "## 详解",
    edits?.detail ?? buildDetailedSolution(problem, result),
    "",
    "## 参数讲解",
  ];
  explanation.params.forEach((p) => {
    lines.push(`- **${p.symbol} ${p.label}**：${p.meaning} 当前 ${p.current}。${p.effect}`);
  });
  lines.push("", "## 过程讲解");
  explanation.phases.forEach((p) => lines.push(`- **${p.title}**（t ≈ ${f(p.seek)} s）：${p.text}`));
  if (questions.length) {
    lines.push("", "## 答疑");
    explanation.qa.forEach((item) => {
      lines.push(`**问：${item.question}**`, ...item.answer.map((a) => `- ${a}`), `> 数值依据：${item.evidence}`, "");
    });
  }
  lines.push("", "---", "由 格物 · 物理解题动画助手 生成（解析解，非预设关键帧）。");
  return lines.join("\n");
}