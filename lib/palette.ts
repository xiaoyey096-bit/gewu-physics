import type { Palette } from "./renderer";

export const FALLBACK_PALETTE: Palette = {
  bg: "#0e1a2b",
  fg: "#e8eef7",
  muted: "#94a5be",
  border: "#263c55",
  accent: "#ff5c93",
  surface: "#15263c",
  vx: "#2ee6cf",
  vy: "#fbbf24",
  resultant: "#ff5c93",
  grid: "#1e3348",
  info: "#6ea8ff",
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
  };
}