import type { ColorBlindMode } from "@/lib/accessibility";

export interface ChartPalette {
  score: {
    eagle: string;
    birdie: string;
    par: string;
    bogey: string;
    double_bogey: string;
    triple_bogey: string;
    quad_bogey: string;
  };
  trend: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  ui: {
    success: string;
    warning: string;
    danger: string;
    neutral: string;
    grid: string;
    mutedFill: string;
  };
}

const PROTANOPIA_PALETTE: ChartPalette = {
  score: {
    eagle: "#2563EB",
    birdie: "#0EA5E9",
    par: "#94A3B8",
    bogey: "#F59E0B",
    double_bogey: "#A855F7",
    triple_bogey: "#EC4899",
    quad_bogey: "#7C2D12",
  },
  trend: {
    primary: "#2563EB",
    secondary: "#F59E0B",
    tertiary: "#0EA5E9",
  },
  ui: {
    success: "#2563EB",
    warning: "#F59E0B",
    danger: "#A855F7",
    neutral: "#94A3B8",
    grid: "#334155",
    mutedFill: "#E2E8F0",
  },
};

const DEUTERANOPIA_PALETTE: ChartPalette = {
  score: {
    eagle: "#0891B2",
    birdie: "#14B8A6",
    par: "#9CA3AF",
    bogey: "#EA580C",
    double_bogey: "#EC4899",
    triple_bogey: "#D946EF",
    quad_bogey: "#A21CAF",
  },
  trend: {
    primary: "#0891B2",
    secondary: "#EA580C",
    tertiary: "#D946EF",
  },
  ui: {
    success: "#14B8A6",
    warning: "#EA580C",
    danger: "#D946EF",
    neutral: "#9CA3AF",
    grid: "#374151",
    mutedFill: "#E5E7EB",
  },
};

const TRITANOPIA_PALETTE: ChartPalette = {
  score: {
    eagle: "#B91C1C",
    birdie: "#DC2626",
    par: "#9CA3AF",
    bogey: "#2563EB",
    double_bogey: "#1D4ED8",
    triple_bogey: "#7C3AED",
    quad_bogey: "#4338CA",
  },
  trend: {
    primary: "#B91C1C",
    secondary: "#2563EB",
    tertiary: "#7C3AED",
  },
  ui: {
    success: "#B91C1C",
    warning: "#7C3AED",
    danger: "#2563EB",
    neutral: "#9CA3AF",
    grid: "#374151",
    mutedFill: "#E5E7EB",
  },
};

const PALETTE_BY_MODE: Record<Exclude<ColorBlindMode, "none">, ChartPalette> = {
  protanopia: PROTANOPIA_PALETTE,
  deuteranopia: DEUTERANOPIA_PALETTE,
  tritanopia: TRITANOPIA_PALETTE,
};

export function getColorBlindPalette(mode: ColorBlindMode): ChartPalette | null {
  if (mode === "none") return null;
  return PALETTE_BY_MODE[mode];
}
