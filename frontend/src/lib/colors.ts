import type { ChartPalette } from "@/lib/chartPalettes";

/** Canonical semantic colors for score types — used across charts, chips, and cells. */
export const SCORE_COLORS = {
  eagle:        "#f59e0b",
  birdie:       "#059669",
  par:          "#9ca3af",
  bogey:        "#ef4444",
  double_bogey: "#60a5fa",
  triple_bogey: "#a78bfa",
  quad_bogey:   "#6d28d9",
} as const;

export const SCORE_KEYS = [
  "eagle", "birdie", "par", "bogey", "double_bogey", "triple_bogey", "quad_bogey",
] as const;
export type ScoreKey = typeof SCORE_KEYS[number];

export const SCORE_LABELS: Record<string, string> = {
  eagle: "Eagle+", birdie: "Birdie", par: "Par",
  bogey: "Bogey", double_bogey: "Double",
  triple_bogey: "Triple", quad_bogey: "Quad+",
};

/** Semantic UI colors — use these instead of hardcoding hex values in components. */
export const UI_COLORS = {
  primary:    "#2d7a3a",
  success:    "#059669",
  danger:     "#ef4444",
  warning:    "#f97316",
  scrambling: "#f97316",
  updown:     "#a855f7",
  blue:       "#60a5fa",
  purple:     "#a78bfa",
  amber:      "#f59e0b",
  neutral:    "#9ca3af",
  grid:       "#e5e7eb",
} as const;

/** Returns the chart fill color for a score key, respecting color-blind palette. */
export function scoreChartColor(key: string, palette?: ChartPalette | null): string {
  if (palette?.score) {
    const val = (palette.score as Record<string, string>)[key];
    if (val) return val;
  }
  return (SCORE_COLORS as Record<string, string>)[key] ?? "#9ca3af";
}

/** Returns Tailwind text classes for a to-par diff displayed inline as text. */
export function toParTextClass(diff: number | null): string {
  if (diff == null) return "text-gray-400";
  if (diff < 0) return "text-green-600 font-semibold";
  if (diff > 0) return "text-red-500";
  return "text-gray-600";
}
