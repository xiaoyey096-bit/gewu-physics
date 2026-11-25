import type { Palette } from "./renderer";

// 与 globals.css 的 :root 浅色令牌一致：首帧还没读到 CSS 变量时也不能画成深色。
export const FALLBACK_PALETTE: Palette = {
  bg: "#f8f9fb",
  fg: "#242830",
  muted: "#727985",
  border: "#e4e7ec",
  accent: "#303846",
  surface: "#ffffff",
  vx: "#00857a",
  vy: "#b45309",
  resultant: "#c81e5a",
  grid: "#e3e7ee",
  info: "#2f6df6",
  ink: "#141821",
  body: "#ffffff",
};

export function readPalette(): Palette {
  if (typeof window === "undefined") return FALLBACK_PALETTE;
  const s = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    bg: get("--site-bg", FALLBACK_PALETTE.bg),
    fg: get("--site-fg", FALLBACK_PALETTE.fg),
    muted: get("--site-muted", FALLBACK_PALETTE.muted),
    border: get("--site-border", FALLBACK_PALETTE.border),
    accent: get("--site-accent", FALLBACK_PALETTE.accent),
    surface: get("--site-surface", FALLBACK_PALETTE.surface),
    vx: get("--gw-vx", FALLBACK_PALETTE.vx),
    vy: get("--gw-vy", FALLBACK_PALETTE.vy),
    resultant: get("--gw-v", FALLBACK_PALETTE.resultant),
    grid: get("--gw-grid", FALLBACK_PALETTE.grid),
    info: get("--gw-info", FALLBACK_PALETTE.info),
    ink: get("--gw-ink", FALLBACK_PALETTE.ink),
    body: get("--gw-body", FALLBACK_PALETTE.body),
  };
}