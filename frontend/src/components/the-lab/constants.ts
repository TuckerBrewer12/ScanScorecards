export interface BenchmarkProfile {
  gir: number; scrambling: number; putting: number;
  par3: number; par4: number; par5: number;
}

export const GOAL_OPTIONS = [
  { label: "Break 100", value: 99 },
  { label: "Break 95",  value: 94 },
  { label: "Break 90",  value: 89 },
  { label: "Break 85",  value: 84 },
  { label: "Break 80",  value: 79 },
  { label: "Break 75",  value: 74 },
  { label: "Break 72",  value: 71 },
] as const;

// Normalized 0–100 per axis representing a golfer at each scoring threshold.
// GIR & Scrambling values are real percentages (0–100).
// Putting & par scores are normalized via the same formula as buildRadarData.
export const GOAL_BENCHMARK: Record<number, BenchmarkProfile> = {
  99: { gir: 14, scrambling: 13, putting: 42, par3: 32, par4: 22, par5: 28 },
  94: { gir: 21, scrambling: 20, putting: 52, par3: 40, par4: 29, par5: 36 },
  89: { gir: 30, scrambling: 28, putting: 61, par3: 50, par4: 38, par5: 46 },
  84: { gir: 42, scrambling: 38, putting: 69, par3: 60, par4: 48, par5: 56 },
  79: { gir: 55, scrambling: 48, putting: 77, par3: 70, par4: 59, par5: 66 },
  74: { gir: 65, scrambling: 57, putting: 83, par3: 76, par4: 67, par5: 74 },
  71: { gir: 72, scrambling: 64, putting: 88, par3: 81, par4: 73, par5: 80 },
};

// ComparisonTargetToggle handicap values → benchmark profiles
export const HANDICAP_BENCHMARK: Record<number, BenchmarkProfile> = {
  0:  { gir: 72, scrambling: 64, putting: 88, par3: 81, par4: 73, par5: 80 },
  5:  { gir: 65, scrambling: 57, putting: 83, par3: 76, par4: 67, par5: 74 },
  10: { gir: 55, scrambling: 48, putting: 77, par3: 70, par4: 59, par5: 66 },
  15: { gir: 42, scrambling: 38, putting: 69, par3: 60, par4: 48, par5: 56 },
  20: { gir: 30, scrambling: 28, putting: 61, par3: 50, par4: 38, par5: 46 },
  28: { gir: 14, scrambling: 13, putting: 42, par3: 32, par4: 22, par5: 28 },
};
