// 讲解引擎：参数讲解、过程讲解、答疑。全部由解析解实时算出，数值与动画严格一致。
// 云端 AI 深度讲解为可选增强，缺失时本地内容依然完整可用。

import type {
  BlockBoardParams, BlockBoardResult, CollisionParams, CollisionResult, Explanation, InclineParams,
  InclineResult, ParamNote, Phase, Problem, ProblemParams, ProjectileParams, ProjectileResult, QaItem, SolveResult,
} from "./types";
import { G_PRESETS } from "./types";
import { askLabels, kindLabel } from "./text";
import { templateLabel, templateMeta } from "./templates";

const f = (x: number, d = 2): string => Number(x.toFixed(d)).toString();

interface Ctx {
  problem: Problem;
  result: ProjectileResult;
  v0x: number;
  v0y: number;
  landingVy: number;
  landingSpeed: number;
  landingAngle: number;
}

function ctxOf(problem: Problem, result: SolveResult): Ctx {
  const params = problem.params as ProjectileParams;
  const res = result as ProjectileResult;
  const rad = (params.angleDeg * Math.PI) / 180;
  const v0x = params.v0 * Math.cos(rad);
  const v0y = params.v0 * Math.sin(rad);
  const landingVy = -Math.sqrt(v0y * v0y + 2 * params.g * params.h0);
  const landingSpeed = Math.hypot(v0x, landingVy);
  const landingAngle = (Math.atan2(-landingVy, v0x) * 180) / Math.PI;
  return { problem, result: res, v0x, v0y, landingVy, landingSpeed, landingAngle };
}

export function buildParamNotes(problem: Problem, result: SolveResult): ParamNote[] {
  if (problem.template !== "projectile" || result.template !== "projectile") return buildMultiParamNotes(problem, result);
  const c = ctxOf(problem, result);
  const { v0, angleDeg, h0, g } = problem.params as ProjectileParams;
  const gName = G_PRESETS.find((p) => Math.abs(p.value - g) < 1e-6)?.label ?? "自定义";
  return [
    {
      key: "v0",
      symbol: "v₀",
      label: "初速度",
      meaning: "出手瞬间的速度大小，是水平与竖直两个分量的总预算。",
      current: `${f(v0)} m/s → v₀ₓ = ${f(c.v0x)} m/s，v₀ᵧ = ${f(c.v0y)} m/s`,
      effect: `X ∝ v₀²、H ∝ v₀²、T ∝ v₀：v₀ 加倍，射程与高度都变 4 倍，飞行时间变 2 倍。当前 X = ${f(c.result.range)} m。`,
    },
    {
      key: "angleDeg",
      symbol: "θ",
      label: "抛射角",
      meaning: "决定 v₀ 在水平与竖直之间如何分配，不改变速度大小。",
      current: `${f(angleDeg)}°（${kindLabel(problem.params as ProjectileParams)}）→ cosθ = ${f(Math.cos((angleDeg * Math.PI) / 180))}，sinθ = ${f(Math.sin((angleDeg * Math.PI) / 180))}`,
      effect:
        h0 > 0.01
          ? `同高度抛射在 45° 射程最远；有初始高度 h₀ = ${f(h0)} m 时最佳角略小于 45°。θ→90° 射程→0、高度最大；θ=0 即平抛。`
          : `X = v₀²·sin2θ/g，在 45° 取最大值 ${f((v0 * v0) / g)} m；当前 ${f(angleDeg)}° 给出 ${f(c.result.range)} m。把 θ 拖到 45° 看看。`,
    },
    {
      key: "h0",
      symbol: "h₀",
      label: "初始高度",
      meaning: "出手点相对落地点的高度，只影响下落段，不影响上升段。",
      current: `${f(h0)} m${h0 > 0.01 ? "（动画中画出发射台支撑柱）" : "（从地面抛出）"}`,
      effect: `h₀ 增大 → 下落更久 → T 与 X 增大，但到最高点的时间 t₁ = v₀ᵧ/g = ${f(c.result.apexTime)} s 不变。`,
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
  if (problem.template !== "projectile" || result.template !== "projectile") return buildMultiPhases(problem, result);
  const c = ctxOf(problem, result);
  const r = result;
  const params = problem.params as ProjectileParams;
  const T = r.series.duration;
  const t1 = r.apexTime;
  const w = Math.max(0.04, T * 0.03);
  const w2 = Math.max(0.05, T * 0.04);
  const flat = params.angleDeg <= 0.5;
  return [
    {
      id: "rise",
      title: flat ? "出手 · 平抛开始" : "上升段",
      text: flat
        ? `平抛没有上升段：出手时 vᵧ = 0，此后橙色箭头向下并不断变长；青色箭头始终 ${f(c.v0x)} m/s 不变。轨迹从出手点立刻向下弯曲。`
        : `vᵧ 从 ${f(c.v0y)} m/s 每秒减少 ${f(params.g)} m/s，水平分量保持 ${f(c.v0x)} m/s。合速度方向逐渐变平，轨迹上升但越来越「缓」。`,
      start: 0,
      end: Math.max(0, t1 - w),
      seek: flat ? T * 0.2 : t1 * 0.5,
    },
    {
      id: "apex",
      title: "最高点",
      text: flat
        ? `出手点即最高点，离地 ${f(r.maxHeight)} m。此处 vᵧ = 0，但加速度仍是 g —— 速度为零不代表受力为零。`
        : `t₁ = ${f(t1)} s 时 vᵧ = 0，合速度只剩水平分量 ${f(c.v0x)} m/s，方向水平；离地高度 H = ${f(r.maxHeight)} m。加速度仍为 g，方向向下。`,
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
      text: `t = T = ${f(T)} s 时 y = 0，水平射程 X = ${f(r.range)} m。落地速度 v = ${f(c.landingSpeed)} m/s，方向与水平成 ${f(c.landingAngle)}° 向下；由能量守恒 ½mv² = ½mv₀² + mgh₀ 可直接验证。`,
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
      evidence: `vᵧ(t) = ${f(c.v0y)} − ${f((c.problem.params as ProjectileParams).g)}·t；t₁ = ${f(c.result.apexTime)} s 时 vᵧ = 0。`,
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
        (c.problem.params as ProjectileParams).h0 > 0.01
          ? `本题 h₀ = ${f((c.problem.params as ProjectileParams).h0)} m，当前 θ = ${f((c.problem.params as ProjectileParams).angleDeg)}° 给出 X = ${f(c.result.range)} m；把 θ 调到 40°~45° 对比试试。`
          : `本题 θ = ${f((c.problem.params as ProjectileParams).angleDeg)}° → X = ${f(c.result.range)} m；45° 时 X = ${f(((c.problem.params as ProjectileParams).v0 ** 2) / (c.problem.params as ProjectileParams).g)} m。`,
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
      evidence: `本题 v = ${f(c.landingSpeed)} m/s，方向向下 ${f(c.landingAngle)}°；√(v₀²+2gh₀) = ${f(Math.sqrt((c.problem.params as ProjectileParams).v0 ** 2 + 2 * (c.problem.params as ProjectileParams).g * (c.problem.params as ProjectileParams).h0))} m/s。`,
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
      evidence: `本题 y = ${f((c.problem.params as ProjectileParams).h0)} + ${f(Math.tan(((c.problem.params as ProjectileParams).angleDeg * Math.PI) / 180))}·x − ${f((c.problem.params as ProjectileParams).g / (2 * c.v0x * c.v0x || 1), 4)}·x²。`,
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
      evidence: `本题上升 ${f(c.result.apexTime)} s、下落 ${f(c.result.series.duration - c.result.apexTime)} s${(c.problem.params as ProjectileParams).h0 > 0.01 ? "（h₀ > 0，不对称）" : "（对称）"}。`,
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

export function suggestedQuestions(problem: Problem): string[] {
  if (problem.template === "incline") return ["为什么加速度小于 g·sinθ？", "摩擦生热怎么算？", "倾角多大时物块会静止？"];
  if (problem.template === "blockBoard") return ["为什么滑块和木板最后会一起运动？", "相对位移和木板长度有什么关系？", "摩擦生热为什么用相对位移？"];
  if (problem.template === "collision1d") return ["为什么碰后 A 球会反向运动？", "完全弹性碰撞为什么动能守恒？", "恢复系数 e 表示什么？"];
  return SUGGESTED_QUESTIONS;
}

export function answerQuestion(question: string, problem: Problem, result: SolveResult): QaItem {
  if (problem.template !== "projectile" || result.template !== "projectile") return answerMultiQuestion(question, problem, result);
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
      "这道题属于" + kindLabel(problem.params as ProjectileParams) + "运动，可分解为水平匀速与竖直匀变速两个独立运动。",
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
  if (problem.template !== "projectile" || result.template !== "projectile") return buildMultiExamSolution(problem, result);
  const c = ctxOf(problem, result);
  const params = problem.params as ProjectileParams;
  const r = result;
  const need = solutionNeeds(problem);
  const math = (formula: string) => `$$\n${formula}\n$$`;
  const lines = [
    "解",
    "忽略空气阻力，取落地平面为 $y = 0$，竖直向上为正。",
    ...(need.range ? [math(String.raw`v_{0x} = v_0 \cos\theta \approx ${f(c.v0x)}\,\mathrm{m/s}`)] : []),
    ...(need.flightTime || need.maxHeight || need.apexTime ? [math(String.raw`v_{0y} = v_0 \sin\theta \approx ${f(c.v0y)}\,\mathrm{m/s}`)] : []),
  ];
  if (need.apexTime) lines.push(math(String.raw`t_1 = \frac{v_{0y}}{g} \approx ${f(r.apexTime)}\,\mathrm{s}`));
  if (need.maxHeight) {
    lines.push("相对落地平面的最大高度：", math(String.raw`H = h_0 + \frac{v_{0y}^{2}}{2g} \approx ${f(r.maxHeight)}\,\mathrm{m}`));
  }
  if (need.flightTime) {
    lines.push(
      String.raw`落地时 $h_0 + v_{0y}T - \frac{1}{2}gT^2 = 0$，取非负的落地时刻：`,
      math(String.raw`T = \frac{v_{0y} + \sqrt{v_{0y}^{2} + 2gh_0}}{g} \approx ${f(r.flightTime)}\,\mathrm{s}`),
    );
    if (r.flightTime === 0) lines.push("初始已在落地平面且无向上的初速度，故 $T = 0$。");
  }
  if (need.range) lines.push(math(String.raw`X = v_{0x}T \approx ${f(r.range)}\,\mathrm{m}`));
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
  if (problem.template !== "projectile" || result.template !== "projectile") return buildMultiDetailedSolution(problem, result);
  const c = ctxOf(problem, result);
  const params = problem.params as ProjectileParams;
  const r = result;
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
    first.push("最高点 $v_y = 0$，", math(String.raw`t_1 = \frac{v_{0y}}{g} \approx ${f(r.apexTime)}\,\mathrm{s}`));
  }
  if (need.maxHeight) {
    first.push("代入位置方程，得到相对落地平面的最大高度：", math(String.raw`H = y(t_1) = h_0 + \frac{v_{0y}^{2}}{2g} \approx ${f(r.maxHeight)}\,\mathrm{m}`));
  }
  if (motionTime) {
    first.push(
      String.raw`落地时 $y(T) = 0$，即 $h_0 + v_{0y}T - \frac{1}{2}gT^2 = 0$，取非负的落地时刻：`,
      math(String.raw`T = \frac{v_{0y} + \sqrt{v_{0y}^{2} + 2gh_0}}{g} \approx ${f(r.flightTime)}\,\mathrm{s}`),
    );
    if (r.flightTime === 0) first.push("本题物体初始已在落地平面且无向上的初速度，故 $T = 0$。");
  }
  if (need.range) first.push(math(String.raw`X = v_{0x}T \approx ${f(r.range)}\,\mathrm{m}`));
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
      math(String.raw`H = h_0 + \frac{v_{0y}^{2}}{2g} \approx ${f(r.maxHeight)}\,\mathrm{m}`),
    );
  }
  if (need.apexTime || need.flightTime) {
    second.push(
      String.raw`上升段末竖直速度为 $0$，由匀减速运动关系 $H - h_0 = \frac{1}{2}gt_1^2$ 得：`,
      math(String.raw`t_1 = \sqrt{\frac{2(H - h_0)}{g}} = \frac{v_{0y}}{g} \approx ${f(r.apexTime)}\,\mathrm{s}`),
    );
  }
  if (need.flightTime) {
    const fallTime = Math.sqrt((2 * r.maxHeight) / params.g);
    second.push(
      String.raw`从最高点下落，竖直初速度为 $0$，由 $H = \frac{1}{2}gt_2^2$ 得：`,
      math(String.raw`t_2 = \sqrt{\frac{2H}{g}} \approx ${f(fallTime)}\,\mathrm{s}`),
      math(String.raw`T = t_1 + t_2 \approx ${f(r.flightTime)}\,\mathrm{s}`),
    );
    if (r.flightTime === 0) second.push("本题 $H = 0$ 且 $v_{0y} = 0$，故 $t_1 = t_2 = T = 0$。");
  }
  if (need.range) {
    second.push("水平方向匀速，故射程为：", math(String.raw`X = v_{0x}T \approx ${f(r.range)}\,\mathrm{m}`));
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
  const lines: string[] = [
    `# ${problem.template === "projectile" ? `${kindLabel(problem.params as ProjectileParams)}运动` : templateLabel(problem)} · 题解`,
    "",
    "## 题目",
    problem.statement,
    "",
    "## 已知量",
    ...knownQuantities(problem),
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

function knownQuantities(problem: Problem): string[] {
  if (problem.template === "projectile") {
    const { v0, angleDeg, h0, g } = problem.params as ProjectileParams;
    return [
      String.raw`- 初速度 $v_0 = ${f(v0)}\,\mathrm{m/s}$`,
      String.raw`- 抛射角 $\theta = ${f(angleDeg)}^{\circ}$`,
      String.raw`- 初始高度 $h_0 = ${f(h0)}\,\mathrm{m}$`,
      String.raw`- 重力加速度 $g = ${f(g)}\,\mathrm{m/s^2}$`,
    ];
  }
  if (problem.template === "incline") {
    const p = problem.params as InclineParams;
    return [
      `- 物块质量 $m = ${f(p.m)}\\,\\mathrm{kg}$`,
      `- 斜面倾角 $\\theta = ${f(p.angleDeg)}^{\\circ}$`,
      `- 动摩擦因数 $\\mu = ${f(p.mu)}$`,
      `- 斜面长度 $L = ${f(p.L)}\\,\\mathrm{m}$`,
      `- 初速度 $v_0 = ${f(p.v0)}\\,\\mathrm{m/s}$`,
      `- 重力加速度 $g = ${f(p.g)}\\,\\mathrm{m/s^2}$`,
    ];
  }
  if (problem.template === "blockBoard") {
    const p = problem.params as BlockBoardParams;
    return [
      `- 滑块质量 $m = ${f(p.m)}\\,\\mathrm{kg}$`,
      `- 木板质量 $M = ${f(p.M)}\\,\\mathrm{kg}$`,
      `- 木板长度 $L = ${f(p.L)}\\,\\mathrm{m}$`,
      `- 滑块初速度 $v_0 = ${f(p.v0)}\\,\\mathrm{m/s}$`,
      `- 动摩擦因数 $\\mu = ${f(p.mu)}$`,
      `- 重力加速度 $g = ${f(p.g)}\\,\\mathrm{m/s^2}$`,
    ];
  }
  const p = problem.params as CollisionParams;
  return [
    `- A 球质量 $m_1 = ${f(p.m1)}\\,\\mathrm{kg}$，初速度 $v_1 = ${f(p.v1)}\\,\\mathrm{m/s}$`,
    `- B 球质量 $m_2 = ${f(p.m2)}\\,\\mathrm{kg}$，初速度 $v_2 = ${f(p.v2)}\\,\\mathrm{m/s}$`,
    `- 恢复系数 $e = ${f(p.e)}$`,
  ];
}

// ───────────────────────── 多题型讲解 ─────────────────────────

function buildMultiParamNotes(problem: Problem, result: SolveResult): ParamNote[] {
  if (problem.template === "incline" && result.template === "incline") {
    const p = problem.params as InclineParams;
    const r = result;
    const rad = p.angleDeg * Math.PI / 180;
    return [
      { key: "m", symbol: "m", label: "物块质量", meaning: "质量同时影响重力、支持力与摩擦力，但加速度与质量无关。", current: `${f(p.m)} kg，支持力 N = ${f(r.normal)} N`, effect: `摩擦生热 Q = μmgcosθ·s 与 m 成正比；当前 Q = ${f(r.heat)} J。加速度 a = g(sinθ − μcosθ) 不随 m 改变。` },
      { key: "angleDeg", symbol: "θ", label: "斜面倾角", meaning: "决定重力沿斜面分量与支持力的大小。", current: `${f(p.angleDeg)}°，sinθ = ${f(Math.sin(rad))}，cosθ = ${f(Math.cos(rad))}`, effect: `θ 增大 → 下滑分力增大、支持力减小。当前 a = ${f(r.a)} m/s²；tanθ = ${f(Math.tan(rad))}，与 μ = ${f(p.mu)} 比较可判断能否自行下滑。` },
      { key: "mu", symbol: "μ", label: "动摩擦因数", meaning: "描述斜面与物块之间的粗糙程度。", current: `${f(p.mu)}，摩擦力 f = μmgcosθ = ${f(p.mu * p.m * p.g * Math.cos(rad))} N`, effect: `μ 越大，加速度越小、摩擦生热越多。当前 a = ${f(r.a)} m/s²；当 tanθ ≤ μ 时物块无法自行下滑。` },
      { key: "L", symbol: "L", label: "斜面长度", meaning: "决定滑行总位移与重力做功的行程。", current: `${f(p.L)} m，斜面高差 h = ${f(r.height)} m`, effect: `L 增大 → 滑行时间变长、摩擦生热增大。当前重力做功 W_G = ${f(r.Wg)} J。` },
      { key: "v0", symbol: "v₀", label: "初速度", meaning: "沿斜面向下的初始速度。", current: `${f(p.v0)} m/s${p.v0 === 0 ? "（由静止释放）" : ""}`, effect: `初速度越大，到达底端越快、末速度越大；当前末速度 v = ${f(r.vEnd)} m/s。` },
      { key: "g", symbol: "g", label: "重力加速度", meaning: "重力加速度，方向竖直向下。", current: `${f(p.g)} m/s²`, effect: `a、W_G、Q 都与 g 成正比；当前 a = ${f(r.a)} m/s²。` },
    ];
  }
  if (problem.template === "blockBoard" && result.template === "blockBoard") {
    const p = problem.params as BlockBoardParams;
    const r = result;
    return [
      { key: "v0", symbol: "v₀", label: "滑块初速度", meaning: "滑块滑上木板瞬间的对地速度，是系统动量的来源。", current: `${f(p.v0)} m/s，初动能 ${f(0.5 * p.m * p.v0 * p.v0)} J`, effect: `v₀ 越大，相对滑动时间越长、摩擦生热越多。当前${r.slidOff ? "滑离" : "共速"}时间 ${f(r.t)} s。` },
      { key: "m", symbol: "m", label: "滑块质量", meaning: "滑块质量影响摩擦力大小与惯性。", current: `${f(p.m)} kg，摩擦力 f = μmg = ${f(p.mu * p.m * p.g)} N`, effect: r.slidOff ? `m 增大 → 木板加速更快，相对位移变小；当前相对位移 ${f(r.slip)} m。` : `m 增大 → 共同速度更接近 v₀；当前 v_共 = ${f(r.vCommon)} m/s。` },
      { key: "M", symbol: "M", label: "木板质量", meaning: "木板质量越大，越难被摩擦力带动。", current: `${f(p.M)} kg，a_板 = μmg/M = ${f(p.mu * p.m * p.g / p.M)} m/s²`, effect: `M 增大 → 木板加速度减小、共速时间变长。当前${r.slidOff ? "滑离" : "共速"}时间 ${f(r.t)} s。` },
      { key: "L", symbol: "L", label: "木板长度", meaning: "决定滑块能否在板上完成共速。", current: `${f(p.L)} m，相对位移 ${f(r.slip)} m`, effect: r.slidOff ? `当前相对位移已达到板长，滑块会从右端滑离。` : `当前相对位移小于板长，滑块不会滑离；把 L 调到 ${f(Math.ceil(r.slip * 10) / 10)} m 以下就会滑离。` },
      { key: "mu", symbol: "μ", label: "动摩擦因数", meaning: "滑块与木板之间的粗糙程度。", current: `${f(p.mu)}`, effect: `μ 越大 → 相对加速度越大、共速越快、摩擦生热越多。当前 Q = ${f(r.heat)} J。` },
      { key: "g", symbol: "g", label: "重力加速度", meaning: "重力加速度。", current: `${f(p.g)} m/s²`, effect: `摩擦力与相对加速度都与 g 成正比；当前 Q = ${f(r.heat)} J。` },
    ];
  }
  if (problem.template === "collision1d" && result.template === "collision1d") {
    const p = problem.params as CollisionParams;
    const r = result;
    return [
      { key: "m1", symbol: "m₁", label: "A 球质量", meaning: "A 球的惯性大小，影响碰后速度分配。", current: `${f(p.m1)} kg，动量 ${f(p.m1 * p.v1)} kg·m/s`, effect: `m₁ 越大，A 球碰后速度越接近原速度。当前 v₁′ = ${f(r.v1After)} m/s。` },
      { key: "m2", symbol: "m₂", label: "B 球质量", meaning: "B 球的惯性大小。", current: `${f(p.m2)} kg，动量 ${f(p.m2 * p.v2)} kg·m/s`, effect: `m₂ 越大，A 球被「反弹」得越明显。当前 v₂′ = ${f(r.v2After)} m/s。` },
      { key: "v1", symbol: "v₁", label: "A 球初速度", meaning: "A 球碰前速度，向右为正。", current: `${f(p.v1)} m/s`, effect: `碰后速度随 v₁ 线性变化；当前总动量 p = ${f(r.momentum)} kg·m/s。` },
      { key: "v2", symbol: "v₂", label: "B 球初速度", meaning: "B 球碰前速度，向右为正。", current: `${f(p.v2)} m/s`, effect: `只有 A 的相对速度大于 B 时才会发生碰撞；当前${r.hit ? `碰撞时刻 ${f(r.tHit)} s` : "两球不会碰撞"}。` },
      { key: "e", symbol: "e", label: "恢复系数", meaning: "碰后分离速度与碰前接近速度之比。", current: `${f(p.e)}（${p.e >= 0.999 ? "完全弹性" : p.e <= 0.001 ? "完全非弹性" : "非完全弹性"}）`, effect: `e 越小，动能损失越大；当前 ΔEₖ = ${f(r.loss)} J。` },
    ];
  }
  return [];
}

function buildMultiPhases(problem: Problem, result: SolveResult): Phase[] {
  if (problem.template === "incline" && result.template === "incline") {
    const p = problem.params as InclineParams;
    const r = result;
    const T = Math.max(r.duration, 1e-9);
    const endTitle = r.reachedBottom ? "到达底端" : "中途停下";
    return [
      { id: "start", title: "开始下滑", text: `沿斜面方向：mg sinθ − μmg cosθ = ma，得 a = ${f(r.a)} m/s²。垂直斜面方向受力平衡，N = ${f(r.normal)} N。`, start: 0, end: T * 0.3, seek: 0 },
      { id: "slide", title: "匀变速下滑", text: `速度每秒变化 ${f(r.a)} m/s。重力做正功、摩擦力做负功，动能与摩擦热同时增加。已滑行 ${f(r.distance)} m。`, start: T * 0.3, end: T * 0.85, seek: T * 0.55 },
      { id: "end", title: endTitle, text: r.reachedBottom ? `滑到斜面底端，v = ${f(r.vEnd)} m/s，用时 ${f(r.t)} s。摩擦生热 Q = μmgcosθ·L = ${f(r.heat)} J。` : `速度减为零，滑行 ${f(r.distance)} m 后停下，未到达底端。摩擦生热 Q = ${f(r.heat)} J。`, start: T * 0.85, end: T, seek: T },
    ];
  }
  if (problem.template === "blockBoard" && result.template === "blockBoard") {
    const r = result;
    const T = Math.max(r.duration, 1e-9);
    return [
      { id: "start", title: "开始相对滑动", text: `滑块速度大于木板，二者之间出现滑动摩擦力。滑块减速、木板加速，系统总动量守恒。`, start: 0, end: T * 0.3, seek: 0 },
      { id: "slide", title: "相对滑动", text: `滑块速度每秒减少 μg，木板速度每秒增加 μmg/M。相对位移不断增大，摩擦生热 Q = μmgΔs。当前相对位移 ${f(r.slip)} m。`, start: T * 0.3, end: T * 0.85, seek: T * 0.55 },
      { id: "end", title: r.slidOff ? "滑块滑离木板" : "达到共同速度", text: r.slidOff ? `相对位移达到板长 ${f(r.slip)} m，滑块从右端滑离，末速度 ${f(r.vBlockEnd)} m/s。` : `两者速度相等，v_共 = mv₀/(m+M) = ${f(r.vCommon)} m/s，此后一起匀速。摩擦生热 Q = ${f(r.heat)} J。`, start: T * 0.85, end: T, seek: T },
    ];
  }
  if (problem.template === "collision1d" && result.template === "collision1d") {
    const r = result;
    const T = Math.max(r.duration, 1e-9);
    if (!r.hit) {
      return [{ id: "before", title: "匀速运动", text: "两球没有相互接近，不会发生碰撞，各自保持原速度。", start: 0, end: T, seek: 0 }];
    }
    const w = Math.max(0.06, T * 0.06);
    return [
      { id: "before", title: "碰前", text: `两球匀速接近，系统总动量 p = ${f(r.momentum)} kg·m/s。`, start: 0, end: Math.max(0, r.tHit - w), seek: 0 },
      { id: "hit", title: "碰撞瞬间", text: `t = ${f(r.tHit)} s 两球接触。碰后速度突变为 v₁′ = ${f(r.v1After)} m/s、v₂′ = ${f(r.v2After)} m/s。`, start: Math.max(0, r.tHit - w), end: Math.min(T, r.tHit + w), seek: r.tHit },
      { id: "after", title: "碰后", text: `两球各自匀速运动。碰前动能 ${f(r.keBefore)} J，碰后 ${f(r.keAfter)} J，损失 ${f(r.loss)} J。`, start: Math.min(T, r.tHit + w), end: T, seek: Math.min(T, r.tHit + 0.6) },
    ];
  }
  return [];
}

function multiNeed(problem: Problem) {
  return new Set(problem.ask);
}

function buildMultiExamSolution(problem: Problem, result: SolveResult): string {
  const math = (formula: string) => `$$\n${formula}\n$$`;
  if (problem.template === "incline" && result.template === "incline") {
    const p = problem.params as InclineParams;
    const r = result;
    const ask = multiNeed(problem);
    const rad = p.angleDeg * Math.PI / 180;
    const lines = ["解", "以沿斜面向下为正方向。垂直斜面方向受力平衡：", math(`N = mg\\cos\\theta \\approx ${f(r.normal)}\\,\\mathrm{N}`), "沿斜面方向：", math(`mg\\sin\\theta - \\mu mg\\cos\\theta = ma`), math(`a = g(\\sin\\theta - \\mu\\cos\\theta) \\approx ${f(r.a)}\\,\\mathrm{m/s^2}`)];
    if (ask.has("time")) lines.push(r.reachedBottom ? "由 $L = v_0t + \\frac{1}{2}at^2$ 取正根：" : "由 $v = v_0 + at = 0$：", math(`t \\approx ${f(r.t)}\\,\\mathrm{s}`));
    if (ask.has("speed")) lines.push("由速度—位移关系：", math(`v = \\sqrt{v_0^2 + 2aL} \\approx ${f(r.vEnd)}\\,\\mathrm{m/s}`));
    if (ask.has("heat")) lines.push("摩擦生热等于摩擦力乘以滑行距离：", math(`Q = \\mu mg\\cos\\theta \\cdot s \\approx ${f(r.heat)}\\,\\mathrm{J}`));
    if (ask.has("workG")) lines.push("重力做功：", math(`W_G = mgh = mgs\\sin\\theta \\approx ${f(r.Wg)}\\,\\mathrm{J}`));
    const answers = [
      ask.has("acceleration") ? `加速度为 ${f(r.a)} m/s²` : "",
      ask.has("time") ? `滑行时间为 ${f(r.t)} s` : "",
      ask.has("speed") ? `末速度为 ${f(r.vEnd)} m/s` : "",
      ask.has("heat") ? `摩擦生热为 ${f(r.heat)} J` : "",
      ask.has("workG") ? `重力做功为 ${f(r.Wg)} J` : "",
    ].filter(Boolean);
    lines.push(`答：${answers.join("；") || "题目未指定支持的所求量"}。`);
    return lines.join("\n\n");
  }
  if (problem.template === "blockBoard" && result.template === "blockBoard") {
    const p = problem.params as BlockBoardParams;
    const r = result;
    const ask = multiNeed(problem);
    const lines = [
      "解",
      "滑块受向左的滑动摩擦力，木板受向右的滑动摩擦力：",
      math(`a_1 = -\\mu g \\approx ${f(-p.mu * p.g)}\\,\\mathrm{m/s^2},\\qquad a_2 = \\frac{\\mu mg}{M} \\approx ${f((p.mu * p.m * p.g) / p.M)}\\,\\mathrm{m/s^2}`),
      r.slidOff ? "滑块从右端滑离时，相对位移等于板长：" : "达到共同速度时，两者速度相等：",
      r.slidOff
        ? math(`L = v_0t - \\frac{1}{2}\\mu g\\left(1 + \\frac{m}{M}\\right)t^2 \\implies t \\approx ${f(r.t)}\\,\\mathrm{s}`)
        : math(`v_0 + a_1t = a_2t \\implies t = \\frac{v_0}{\\mu g(1 + m/M)} \\approx ${f(r.t)}\\,\\mathrm{s}`),
    ];
    if (ask.has("speed")) lines.push(r.slidOff ? "此时两物体速度分别为：" : "共同速度由动量守恒直接得到：", math(r.slidOff ? `v_1 \\approx ${f(r.vBlockEnd)}\\,\\mathrm{m/s},\\qquad v_2 \\approx ${f(r.vBoardEnd)}\\,\\mathrm{m/s}` : `v = \\frac{mv_0}{m + M} \\approx ${f(r.vCommon)}\\,\\mathrm{m/s}`));
    if (ask.has("slip")) lines.push("相对位移：", math(`\\Delta s = v_0t + \\frac{1}{2}a_1t^2 - \\frac{1}{2}a_2t^2 \\approx ${f(r.slip)}\\,\\mathrm{m}`));
    if (ask.has("heat")) lines.push("摩擦生热等于摩擦力乘以相对位移：", math(`Q = \\mu mg\\Delta s \\approx ${f(r.heat)}\\,\\mathrm{J}`));
    const answers = [
      ask.has("time") ? `${r.slidOff ? "滑离" : "共速"}时间为 ${f(r.t)} s` : "",
      ask.has("speed") ? `${r.slidOff ? "滑块末速度" : "共同速度为"} ${f(r.slidOff ? r.vBlockEnd : r.vCommon)} m/s` : "",
      ask.has("slip") ? `相对位移为 ${f(r.slip)} m` : "",
      ask.has("heat") ? `摩擦生热为 ${f(r.heat)} J` : "",
    ].filter(Boolean);
    lines.push(`答：${answers.join("；") || "题目未指定支持的所求量"}。`);
    return lines.join("\n\n");
  }
  const p = problem.params as CollisionParams;
  const r = result as CollisionResult;
  const ask = multiNeed(problem);
  const lines = [
    "解",
    "水平方向不受外力，系统动量守恒：",
    math(`m_1v_1 + m_2v_2 = m_1v_1' + m_2v_2' = ${f(r.momentum)}\\,\\mathrm{kg\\cdot m/s}`),
    "恢复系数关系：",
    math(`e = \\frac{v_2' - v_1'}{v_1 - v_2} = ${f(p.e)}`),
    "解得：",
    math(`v_1' \\approx ${f(r.v1After)}\\,\\mathrm{m/s},\\qquad v_2' \\approx ${f(r.v2After)}\\,\\mathrm{m/s}`),
  ];
  if (ask.has("loss")) lines.push("动能损失：", math(`\\Delta E_k = \\frac{1}{2}m_1v_1^2 + \\frac{1}{2}m_2v_2^2 - \\left(\\frac{1}{2}m_1v_1'^2 + \\frac{1}{2}m_2v_2'^2\\right) \\approx ${f(r.loss)}\\,\\mathrm{J}`));
  const answers = [
    ask.has("v1After") ? `A 球碰后速度为 ${f(r.v1After)} m/s` : "",
    ask.has("v2After") ? `B 球碰后速度为 ${f(r.v2After)} m/s` : "",
    ask.has("loss") ? `动能损失为 ${f(r.loss)} J` : "",
    ask.has("momentum") ? `总动量为 ${f(r.momentum)} kg·m/s` : "",
  ].filter(Boolean);
  lines.push(`答：${answers.join("；") || "题目未指定支持的所求量"}。`);
  return lines.join("\n\n");
}

function buildMultiDetailedSolution(problem: Problem, result: SolveResult): string {
  const math = (formula: string) => `$$\n${formula}\n$$`;
  if (problem.template === "incline" && result.template === "incline") {
    const p = problem.params as InclineParams;
    const r = result;
    const first = [
      "① 受力分析与匀变速运动",
      "解",
      "沿斜面方向取向下为正，垂直斜面方向受力平衡。",
      math(`N = mg\\cos\\theta \\approx ${f(r.normal)}\\,\\mathrm{N}`),
      math(`mg\\sin\\theta - f = ma, \\qquad f = \\mu N`),
      math(`a = g(\\sin\\theta - \\mu\\cos\\theta) \\approx ${f(r.a)}\\,\\mathrm{m/s^2}`),
      r.reachedBottom ? math(`L = v_0t + \\frac{1}{2}at^2 \\implies t \\approx ${f(r.t)}\\,\\mathrm{s}`) : math(`v_0 + at = 0 \\implies t \\approx ${f(r.t)}\\,\\mathrm{s}`),
      math(`v = v_0 + at \\approx ${f(r.vEnd)}\\,\\mathrm{m/s}`),
    ];
    const second = [
      "② 功与能量",
      "解",
      "以底端为重力势能零点，从顶端到末位置：",
      math(`W_G = mg\\Delta h \\approx ${f(r.Wg)}\\,\\mathrm{J}`),
      math(`W_f = -\\mu mg\\cos\\theta \\cdot s \\approx ${f(r.Wf)}\\,\\mathrm{J}`),
      "由动能定理：",
      math(`W_G + W_f = \\frac{1}{2}mv^2 - \\frac{1}{2}mv_0^2`),
      math(`v \\approx ${f(r.vEnd)}\\,\\mathrm{m/s}`),
      "摩擦生热等于克服摩擦力做功：",
      math(`Q = -W_f \\approx ${f(r.heat)}\\,\\mathrm{J}`),
    ];
    return [...first, ...second].join("\n\n");
  }
  if (problem.template === "blockBoard" && result.template === "blockBoard") {
    const p = problem.params as BlockBoardParams;
    const r = result;
    const first = [
      "① 分别受力与相对运动",
      "解",
      "滑块受向左摩擦力，木板受向右摩擦力：",
      math(`a_1 = -\\mu g \\approx ${f(-p.mu * p.g)}\\,\\mathrm{m/s^2}`),
      math(`a_2 = \\frac{\\mu mg}{M} \\approx ${f((p.mu * p.m * p.g) / p.M)}\\,\\mathrm{m/s^2}`),
      r.slidOff ? "滑块滑离时相对位移为 L：" : "共速时两速度相等：",
      r.slidOff
        ? math(`L = v_0t + \\frac{1}{2}(a_1 - a_2)t^2 \\implies t \\approx ${f(r.t)}\\,\\mathrm{s}`)
        : math(`v_0 + a_1t = a_2t \\implies t \\approx ${f(r.t)}\\,\\mathrm{s}`),
      r.slidOff ? math(`v_1 \\approx ${f(r.vBlockEnd)}\\,\\mathrm{m/s},\\qquad v_2 \\approx ${f(r.vBoardEnd)}\\,\\mathrm{m/s}`) : math(`v = \\frac{mv_0}{m + M} \\approx ${f(r.vCommon)}\\,\\mathrm{m/s}`),
    ];
    const second = [
      "② 动量与能量",
      "解",
      "水平面光滑，系统水平方向动量守恒：",
      math(`mv_0 = (m + M)v \\implies v \\approx ${f(r.vCommon)}\\,\\mathrm{m/s}`),
      "由能量守恒，摩擦生热等于系统动能减少量：",
      math(`Q = \\frac{1}{2}mv_0^2 - \\frac{1}{2}(m + M)v^2 \\approx ${f(r.heat)}\\,\\mathrm{J}`),
      r.slidOff ? "由于相对位移达到板长，滑块在共速前已从右端滑离。" : math(`\\Delta s = \\frac{Q}{\\mu mg} \\approx ${f(r.slip)}\\,\\mathrm{m}`),
    ];
    return [...first, ...second].join("\n\n");
  }
  const p = problem.params as CollisionParams;
  const r = result as CollisionResult;
  const first = [
    "① 动量守恒与恢复系数",
    "解",
    "取向右为正，水平方向动量守恒：",
    math(`m_1v_1 + m_2v_2 = m_1v_1' + m_2v_2'`),
    "恢复系数定义：",
    math(`v_2' - v_1' = e(v_1 - v_2)`),
    "联立解得：",
    math(`v_1' = \\frac{(m_1 - em_2)v_1 + (1 + e)m_2v_2}{m_1 + m_2} \\approx ${f(r.v1After)}\\,\\mathrm{m/s}`),
    math(`v_2' = \\frac{(m_2 - em_1)v_2 + (1 + e)m_1v_1}{m_1 + m_2} \\approx ${f(r.v2After)}\\,\\mathrm{m/s}`),
  ];
  const second = [
    "② 能量检验",
    "解",
    "碰前总动能：",
    math(`E_{k0} = \\frac{1}{2}m_1v_1^2 + \\frac{1}{2}m_2v_2^2 \\approx ${f(r.keBefore)}\\,\\mathrm{J}`),
    "碰后总动能：",
    math(`E_{k1} = \\frac{1}{2}m_1v_1'^2 + \\frac{1}{2}m_2v_2'^2 \\approx ${f(r.keAfter)}\\,\\mathrm{J}`),
    "动能损失：",
    math(`\\Delta E_k = E_{k0} - E_{k1} \\approx ${f(r.loss)}\\,\\mathrm{J}`),
    p.e >= 0.999 ? "完全弹性碰撞中动能守恒，损失应为 0。" : "损失转化为内能；e = 0 时损失最大，两球碰后同速。",
  ];
  return [...first, ...second].join("\n\n");
}

function answerMultiQuestion(question: string, problem: Problem, result: SolveResult): QaItem {
  const q = question.trim();
  const evidence = `所求量：${askLabels(problem.ask).join("、")}。`;
  if (problem.template === "incline" && result.template === "incline") {
    const p = problem.params as InclineParams;
    const r = result;
    if (/为什么.*(小|小于)|加速度|g.*sin|受力/.test(q)) return { question: q, source: "local", answer: ["沿斜面方向的重力分量是 mg sinθ，但摩擦力 μmg cosθ 与它反向。", "由牛顿第二定律 mg sinθ − μmg cosθ = ma，所以 a = g(sinθ − μcosθ)，必然小于 g sinθ。", "质量在方程两边约去，因此加速度与物块质量无关。"], evidence: `本题 a = ${f(r.a)} m/s²，g sinθ = ${f(p.g * Math.sin(p.angleDeg * Math.PI / 180))} m/s²。` };
    if (/热|能量|摩擦|做功/.test(q)) return { question: q, source: "local", answer: ["摩擦生热等于滑动摩擦力乘以相对滑行距离：Q = μmg cosθ·s。", "重力做正功 W_G = mgh，摩擦力做负功 W_f = −Q；若没有其他力，动能定理给出 W_G − Q = ΔEₖ。", "注意热量用相对位移计算，本题物块相对斜面滑行 s。"], evidence: `本题 Q = ${f(r.heat)} J，W_G = ${f(r.Wg)} J，末动能 ${f(0.5 * p.m * r.vEnd * r.vEnd)} J。` };
    if (/静止|不动|倾角|μ|tan/.test(q)) return { question: q, source: "local", answer: ["物块能否自行下滑，取决于 tanθ 与 μ 的大小关系。", "tanθ > μ 时重力沿斜面分量大于最大静摩擦力，可以下滑；tanθ ≤ μ 时保持静止。", "本题可以先算 tanθ 与 μ 比较，再判断。"], evidence: `本题 tanθ = ${f(Math.tan(p.angleDeg * Math.PI / 180))}，μ = ${f(p.mu)}。` };
    return { question: q, source: "local", answer: ["这是斜面滑动模型：沿斜面方向受重力分量与摩擦力，垂直方向受力平衡。", `当前 a = ${f(r.a)} m/s²，滑行 ${f(r.distance)} m，末速度 ${f(r.vEnd)} m/s，摩擦生热 ${f(r.heat)} J。`, "可以继续问「加速度为什么小于 g sinθ」「摩擦生热怎么算」。"], evidence };
  }
  if (problem.template === "blockBoard" && result.template === "blockBoard") {
    const r = result;
    if (/一起|共同|共速|为什么/.test(q)) return { question: q, source: "local", answer: ["滑块相对木板向右滑动，受到向左的摩擦力而减速；木板受到向右的摩擦力而加速。", "两者速度差逐渐减小，当速度相等时相对静止，摩擦力消失，此后一起匀速运动。", "水平面光滑，系统总动量守恒，所以共同速度由 mv₀ = (m+M)v 决定。"], evidence: `本题${r.slidOff ? "相对位移达到板长，滑块在共速前滑离" : `共速时间 ${f(r.t)} s，共同速度 ${f(r.vCommon)} m/s`}。` };
    if (/相对位移|滑离|板长|L/.test(q)) return { question: q, source: "local", answer: ["相对位移是滑块相对木板走过的距离，等于两者对地位移之差。", "共速前相对位移 Δs = v₀²/[2μg(1+m/M)]；若 Δs ≥ L，滑块会从木板右端滑离。", "本题的板长与相对位移可以直接比较。"], evidence: `本题相对位移 ${f(r.slip)} m，板长见参数；${r.slidOff ? "已滑离" : "未滑离"}。` };
    if (/热|能量|动能/.test(q)) return { question: q, source: "local", answer: ["摩擦生热 Q = f·Δs，必须用相对位移，不能用任一物体的对地位移。", "系统动能减少量等于 Q；水平面光滑时总动量守恒。", "滑块减少的动能一部分传给木板，一部分转化为内能。"], evidence: `本题 Q = ${f(r.heat)} J，碰前动能 ${f(0.5 * (problem.params as BlockBoardParams).m * (problem.params as BlockBoardParams).v0 ** 2)} J。` };
    return { question: q, source: "local", answer: ["这是滑块—木板模型：通过摩擦力交换动量，相对滑动产生热量。", `当前${r.slidOff ? "滑块已滑离" : `共速时间 ${f(r.t)} s、共同速度 ${f(r.vCommon)} m/s`}，相对位移 ${f(r.slip)} m，摩擦生热 ${f(r.heat)} J。`, "可以继续问「为什么最后一起运动」「摩擦生热为什么用相对位移」。"], evidence };
  }
  const r = result as CollisionResult;
  const p = problem.params as CollisionParams;
  if (/反向|反弹|为什么.*(反|退)/.test(q)) return { question: q, source: "local", answer: ["碰后速度由动量守恒与恢复系数共同决定，不是简单地「撞了就停」。", "当 A 球质量小于 B 球且完全弹性时，A 球会被反弹，速度方向相反。", "可以代入公式 v₁′ = [(m₁ − em₂)v₁ + (1+e)m₂v₂]/(m₁+m₂) 验证。"], evidence: `本题 v₁′ = ${f(r.v1After)} m/s${r.v1After < 0 ? "，方向与初速度相反" : ""}。` };
  if (/弹性|动能|损失|守恒/.test(q)) return { question: q, source: "local", answer: ["完全弹性碰撞 e = 1，动量与动能同时守恒；非弹性碰撞 e < 1，部分动能转化为内能。", "动能损失 ΔEₖ = ½·m₁m₂/(m₁+m₂)·(1−e²)·(v₁−v₂)²。", "e = 0 时两球碰后同速，损失最大。"], evidence: `本题 e = ${f(p.e)}，碰前 ${f(r.keBefore)} J，碰后 ${f(r.keAfter)} J，损失 ${f(r.loss)} J。` };
  if (/恢复系数|e\b|e 表示/.test(q)) return { question: q, source: "local", answer: ["恢复系数 e = (v₂′ − v₁′)/(v₁ − v₂)，描述碰后分离速度与碰前接近速度之比。", "e = 1 为完全弹性，e = 0 为完全非弹性，0 < e < 1 为一般非弹性碰撞。", "e 只由材料与结构决定，与质量、速度无关（理想模型）。"], evidence: `本题 e = ${f(p.e)}。` };
  return { question: q, source: "local", answer: ["这是一维正碰模型：水平方向动量守恒，恢复系数给出速度关系。", `当前 v₁′ = ${f(r.v1After)} m/s，v₂′ = ${f(r.v2After)} m/s，动能损失 ${f(r.loss)} J。`, "可以继续问「为什么碰后 A 球反向」「恢复系数表示什么」。"], evidence };
}

export { templateMeta };