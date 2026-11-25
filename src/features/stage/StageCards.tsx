import { forceStateOf, stateAt } from "@/lib/motion";
import { sampleAt } from "@/lib/physics";
import type { BlockBoardParams, CollisionParams, ForceVector, InclineParams, Problem, ProjectileParams, SolveResult, StageOptions } from "@/lib/types";
import { cn } from "@/lib/utils";

// 动画上方的读数卡片：能量与受力按分类各占一小块，画布只留符号。
// 受力卡片列出整道题出现过的力：当前阶段作用的实心，已经退场的虚化。

interface EnergyRow { label: string; text: string; color?: string }

interface EnergyCardData {
  title: string;
  /** 标题右侧的合计；碰撞卡片是混合单位，不合计。 */
  total: string | null;
  segments: [number, string][];
  rows: EnergyRow[];
}

const VX = "var(--gw-vx)";
const VY = "var(--gw-vy)";
const INFO = "var(--gw-info)";

function fixed(value: number, digits = 1): string {
  return value.toFixed(digits);
}

function energyCard(problem: Problem, result: SolveResult, time: number): EnergyCardData {
  if (result.template === "projectile") {
    const p = problem.params as ProjectileParams;
    const s = stateAt(p, time);
    const ekx = 0.5 * s.vx * s.vx, eky = 0.5 * s.vy * s.vy, ep = p.g * Math.max(0, s.y);
    return {
      title: "机械能 · J/kg",
      total: fixed(0.5 * p.v0 * p.v0 + p.g * p.h0),
      segments: [[ekx, VX], [eky, VY], [ep, INFO]],
      rows: [
        { label: "½vₓ²", text: fixed(ekx), color: VX },
        { label: "½vᵧ²", text: fixed(eky), color: VY },
        { label: "g·y", text: fixed(ep), color: INFO },
      ],
    };
  }
  if (result.template === "incline") {
    const p = problem.params as InclineParams;
    const s = sampleAt(result.series, time);
    const rad = p.angleDeg * Math.PI / 180, sin = Math.sin(rad), cos = Math.cos(rad);
    const travelled = sin > 1e-6 ? Math.max(0, (result.height - s.y) / sin) : Math.max(0, s.x / Math.max(cos, 1e-6));
    const ek = 0.5 * p.m * (s.vx * s.vx + s.vy * s.vy);
    const ep = p.m * p.g * Math.max(0, s.y);
    const heat = result.heat * Math.min(1, travelled / Math.max(result.distance, 1e-6));
    return {
      title: "能量 · J",
      total: fixed(ek + ep + heat),
      segments: [[ek, VX], [ep, INFO], [heat, VY]],
      rows: [
        { label: "动能 Eₖ", text: fixed(ek), color: VX },
        { label: "重力势能", text: fixed(ep), color: INFO },
        { label: "摩擦生热 Q", text: fixed(heat), color: VY },
      ],
    };
  }
  if (result.template === "blockBoard") {
    const p = problem.params as BlockBoardParams;
    const block = sampleAt(result.bodies[0].series, time);
    const board = sampleAt(result.bodies[1].series, time);
    const slip = Math.abs(block.x - board.x - 0.5 + p.L / 2);
    const ekBlock = 0.5 * p.m * block.vx * block.vx;
    const ekBoard = 0.5 * p.M * board.vx * board.vx;
    const heat = p.mu * p.m * p.g * slip;
    return {
      title: "能量 · J",
      total: fixed(ekBlock + ekBoard + heat),
      segments: [[ekBlock, VX], [ekBoard, INFO], [heat, VY]],
      rows: [
        { label: "Eₖ 滑块", text: fixed(ekBlock), color: VX },
        { label: "Eₖ 木板", text: fixed(ekBoard), color: INFO },
        { label: "摩擦生热 Q", text: fixed(heat), color: VY },
      ],
    };
  }
  const p = problem.params as CollisionParams;
  const [a, b] = result.bodies;
  const sa = sampleAt(a.series, time), sb = sampleAt(b.series, time);
  const momentum = p.m1 * sa.vx + p.m2 * sb.vx;
  const ek = 0.5 * p.m1 * sa.vx * sa.vx + 0.5 * p.m2 * sb.vx * sb.vx;
  const loss = Math.max(0, result.keBefore - ek);
  return {
    title: `碰撞 · e = ${p.e}`,
    total: null,
    segments: [],
    rows: [
      { label: "动量 p", text: `${fixed(momentum, 2)} kg·m/s` },
      { label: "动能 Eₖ", text: `${fixed(ek)} J` },
      { label: "动能损失", text: `${fixed(loss)} J` },
    ],
  };
}

const FORCE_CATEGORIES: { id: string; label: string; match: (name: string) => boolean }[] = [
  { id: "gravity", label: "重力", match: (name) => name.includes("重力") },
  { id: "elastic", label: "弹力", match: (name) => /支持力|压力|弹力|拉力|张力/.test(name) },
  { id: "friction", label: "摩擦力", match: (name) => name.includes("摩擦") },
  { id: "other", label: "其他", match: () => true },
];

interface ForceChip { force: ForceVector; active: boolean; bodyLabel: string }
interface ForceGroup { id: string; label: string; list: ForceChip[] }

function forceGroups(result: SolveResult, time: number): ForceGroup[] {
  const { phase } = forceStateOf(result, time);
  if (!phase) return [];
  const active = new Set(phase.forces.map((force) => force.id));
  const bodies = new Map(result.bodies.map((body) => [body.id, body.label]));
  const all = new Map<string, ForceVector>();
  for (const item of result.forcePhases ?? []) {
    for (const force of item.forces) if (!all.has(force.id)) all.set(force.id, force);
  }
  const buckets = FORCE_CATEGORIES.map<ForceChip[]>(() => []);
  for (const force of all.values()) {
    const index = FORCE_CATEGORIES.findIndex((category) => category.match(force.name));
    buckets[index].push({ force, active: active.has(force.id), bodyLabel: bodies.get(force.body) ?? "" });
  }
  return FORCE_CATEGORIES.map((category, index) => ({ id: category.id, label: category.label, list: buckets[index] }))
    .filter((group) => group.list.length > 0);
}

function EnergyBlock({ data }: { data: EnergyCardData }) {
  const total = data.segments.reduce((sum, [value]) => sum + Math.max(0, value), 0);
  return (
    <section aria-label="能量卡片" className="min-w-[212px] flex-[1.6] rounded-xl border border-border bg-background px-2.5 py-2">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-medium text-muted-foreground">{data.title}</h3>
        {data.total !== null && <span className="font-mono text-[11px] tabular-nums text-foreground">Σ {data.total}</span>}
      </header>
      {data.segments.length > 0 && total > 0 && (
        <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-border" role="presentation">
          {data.segments.map(([value, color], index) => (
            <span key={index} style={{ width: `${(Math.max(0, value) / total) * 100}%`, background: color }} />
          ))}
        </div>
      )}
      <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {data.rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-1">
            {row.color && <i aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: row.color }} />}
            <dt className="text-[10px] text-muted-foreground">{row.label}</dt>
            <dd className="font-mono text-[11px] tabular-nums text-foreground">{row.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ForceBlock({ group, showBody }: { group: ForceGroup; showBody: boolean }) {
  return (
    <section aria-label={`受力卡片 ${group.label}`} className="grow shrink-0 basis-[150px] rounded-xl border border-border bg-background px-2.5 py-2 sm:grow-0">
      <h3 className="text-[11px] font-medium text-muted-foreground">{group.label}</h3>
      <div className="mt-1 flex flex-wrap gap-1">
        {group.list.map(({ force, active, bodyLabel }) => (
          <span
            key={force.id}
            data-force={force.id}
            data-active={active}
            title={showBody ? `${force.name} · ${bodyLabel}` : force.name}
            className={cn(
              "inline-flex items-baseline gap-1 rounded-md border px-1.5 py-0.5",
              active ? "border-border bg-card" : "border-dashed border-border opacity-40",
            )}
          >
            <span className="font-mono text-[11px] text-ink">{force.symbol}</span>
            {showBody && <span className="text-[9px] text-muted-foreground">{bodyLabel}</span>}
          </span>
        ))}
      </div>
    </section>
  );
}

export function StageCards({ problem, result, time, options }: { problem: Problem; result: SolveResult; time: number; options: StageOptions }) {
  const energy = options.energy ? energyCard(problem, result, time) : null;
  const groups = forceGroups(result, time);
  if (!energy && groups.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" aria-label="动画卡片">
      {energy && <EnergyBlock data={energy} />}
      {groups.map((group) => <ForceBlock key={group.id} group={group} showBody={result.bodies.length > 1} />)}
    </div>
  );
}