import { Monitor, Moon, PanelLeft, PanelRight, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore, type StorageMode } from "@/lib/store";
import type { ThemeMode } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Atmosphere({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("gw-board gw-grain pointer-events-none fixed inset-0 -z-10 overflow-hidden", className)}>
      <svg
        className="gw-drift absolute inset-0 h-full w-full opacity-[0.22]"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="gw-arc-a" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--gw-info)" />
            <stop offset="55%" stopColor="var(--gw-vx)" />
            <stop offset="100%" stopColor="var(--site-accent)" />
          </linearGradient>
          <linearGradient id="gw-arc-b" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--gw-vy)" />
            <stop offset="100%" stopColor="var(--site-accent)" />
          </linearGradient>
        </defs>
        <path d="M -60 720 Q 330 60 760 720" fill="none" stroke="url(#gw-arc-a)" strokeWidth="2.5" />
        <path d="M 240 780 Q 640 200 1120 780" fill="none" stroke="url(#gw-arc-b)" strokeWidth="1.6" strokeDasharray="7 9" />
        <path d="M 520 820 Q 880 320 1260 820" fill="none" stroke="var(--gw-vx)" strokeWidth="1.2" opacity="0.7" />
        <g fill="var(--site-accent)">
          <circle cx="330" cy="392" r="4" />
          <circle cx="640" cy="490" r="3" />
          <circle cx="880" cy="572" r="3.5" />
        </g>
      </svg>
      <div className="absolute inset-x-0 top-0 h-px gw-hairline" />
    </div>
  );
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-[10px] shadow-sm"
        style={{ background: "var(--site-accent)" }}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
          <path d="M3 19 Q 10 3 21 19" stroke="var(--site-on-accent)" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="10.6" cy="8.4" r="2.4" fill="var(--site-on-accent)" />
          <path d="M3 19h18" stroke="var(--site-on-accent)" strokeWidth="1.4" opacity="0.65" strokeLinecap="round" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-lg font-semibold tracking-tight">格物</span>
        {!compact && <span className="mt-1 text-[11px] text-muted-foreground">物理解题动画助手</span>}
      </span>
    </div>
  );
}

const THEME_ORDER: ThemeMode[] = ["dark", "light", "system"];
const THEME_LABEL: Record<ThemeMode, string> = { dark: "深色黑板", light: "浅色学习空间", system: "跟随系统" };

export function ThemeToggle() {
  const { prefs, setPrefs } = useStore();
  const Icon = prefs.theme === "dark" ? Moon : prefs.theme === "light" ? Sun : Monitor;
  const next = THEME_ORDER[(THEME_ORDER.indexOf(prefs.theme) + 1) % THEME_ORDER.length];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`外观：${THEME_LABEL[prefs.theme]}，点击切换到${THEME_LABEL[next]}`}
          onClick={() => setPrefs({ theme: next })}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">外观：{THEME_LABEL[prefs.theme]} → {THEME_LABEL[next]}</TooltipContent>
    </Tooltip>
  );
}

export function ServiceBadge({ configured }: { configured: boolean | null }) {
  const state =
    configured === true
      ? { text: "识题服务在线", color: "var(--gw-success)" }
      : configured === false
        ? { text: "识题服务未配置", color: "var(--gw-warning)" }
        : { text: "识题服务检测中", color: "var(--site-muted)" };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground"
      title={configured === false ? "服务端未配置密钥：图片识别不可用，文本解析与动画照常工作" : "云端视觉识题服务状态"}
    >
      <span className={cn("size-1.5 rounded-full", configured === null && "gw-blink")} style={{ background: state.color }} />
      {state.text}
    </span>
  );
}

export function StorageBadge({ mode }: { mode: StorageMode }) {
  if (mode === "indexeddb") return null;
  const text = mode === "local" ? "浏览器本地保存" : "本次会话不保存";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]"
      style={{ borderColor: "color-mix(in oklab, var(--gw-warning) 45%, transparent)", color: "var(--gw-warning)" }}
      title={mode === "local" ? "IndexedDB 不可用，题库已降级保存到 localStorage" : "浏览器存储不可用，刷新后题库会重置"}
    >
      {text}
    </span>
  );
}

export function PaneToggle({
  side,
  open,
  onToggle,
}: {
  side: "left" | "right";
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = side === "left" ? PanelLeft : PanelRight;
  const label = side === "left" ? "题库与题目栏" : "动画参数栏";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={open ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={`${open ? "收起" : "展开"}${label}`}
          aria-pressed={open}
          onClick={onToggle}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{open ? `收起${label}` : `展开${label}`}</TooltipContent>
    </Tooltip>
  );
}