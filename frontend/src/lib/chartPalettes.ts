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
    eagle: "#1D4ED8",
    birdie: "#06B6D4",
    par: "#9CA3AF",
    bogey: "#F97316",
    double_bogey: "#8B5CF6",
    triple_bogey: "#EC4899",
    quad_bogey: "#7C3AED",
  },
  trend: {
    primary: "#1D4ED8",
    secondary: "#F97316",
    tertiary: "#06B6D4",
  },
  ui: {
    success: "#1D4ED8",
    warning: "#F97316",
    danger: "#8B5CF6",
    neutral: "#9CA3AF",
    grid: "#334155",
    mutedFill: "#E5E7EB",
  },
};

const TRITANOPIA_PALETTE: ChartPalette = {
  score: {
    eagle: "#DC2626",
    birdie: "#F97316",
    par: "#9CA3AF",
    bogey: "#2563EB",
    double_bogey: "#7C3AED",
    triple_bogey: "#DB2777",
    quad_bogey: "#4F46E5",
  },
  trend: {
    primary: "#DC2626",
    secondary: "#2563EB",
    tertiary: "#F97316",
  },
  ui: {
    success: "#DC2626",
    warning: "#F97316",
    danger: "#2563EB",
    neutral: "#9CA3AF",
    grid: "#334155",
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
