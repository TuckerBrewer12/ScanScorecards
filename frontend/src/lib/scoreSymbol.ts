import type { CSSProperties } from "react";

export const SCORE_SYMBOL_COLORS = {
  eagle:  { bg: "#a16207", fg: "#fff" },
  birdie: { bg: "#0b8a5e", fg: "#fff" },
  par:    { bg: "#e5e7eb", fg: "#4b5563" },
  bogey:  { bg: "#d94040", fg: "#fff" },
  double: { bg: "#3b78e0", fg: "#fff" },
  triple: { bg: "#7c52e0", fg: "#fff" },
} as const;

/** Inline styles for an editable input cell (circle/square via border-radius + box-shadow). */
export function scoreInputStyle(diff: number | null): CSSProperties {
  const { eagle, birdie, par, bogey, double: dbl, triple } = SCORE_SYMBOL_COLORS;

  if (diff === null)  return { background: "#fff", borderRadius: 4, border: "1px solid #d1d5db", color: "#374151" };
  if (diff <= -2)     return { background: eagle.bg,  color: eagle.fg,  borderRadius: "50%", border: "none",
                                boxShadow: `0 0 0 2px #fff, 0 0 0 4px ${eagle.bg}` };
  if (diff === -1)    return { background: birdie.bg, color: birdie.fg, borderRadius: "50%", border: "none" };
  if (diff === 0)     return { background: par.bg,    color: par.fg,    borderRadius: 4,      border: "none" };
  if (diff === 1)     return { background: bogey.bg,  color: bogey.fg,  borderRadius: 2,      border: "none" };
  if (diff === 2)     return { background: dbl.bg,    color: dbl.fg,    borderRadius: 2,      border: "none",
                                boxShadow: `0 0 0 2px #fff, 0 0 0 4px ${dbl.bg}` };
  // Triple+: purple square with "/" stripe overlay
  return {
    background: `repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.28) 5px, rgba(255,255,255,0.28) 7px), ${triple.bg}`,
    color: triple.fg, borderRadius: 2, border: "none",
  };
}
