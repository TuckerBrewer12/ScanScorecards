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
  // Updated from "Representative amateur golf statistics by score and skill band"
  // (score-band -> handicap proxy mapping from the PDF).
  99: { gir: 10, scrambling: 18, putting: 66, par3: 41, par4: 6,  par5: 0  }, // <100 (HI~25)
  94: { gir: 17, scrambling: 20, putting: 66, par3: 49, par4: 29, par5: 23 }, // <95  (HI~20)
  89: { gir: 24, scrambling: 21, putting: 70, par3: 56, par4: 39, par5: 36 }, // <90  (HI~15)
  84: { gir: 36, scrambling: 31, putting: 73, par3: 65, par4: 54, par5: 51 }, // <85  (HI~10)
  79: { gir: 44, scrambling: 41, putting: 78, par3: 72, par4: 60, par5: 58 }, // <80  (HI~5)
  74: { gir: 53, scrambling: 44, putting: 80, par3: 77, par4: 66, par5: 69 }, // interpolated (<80 to scratch)
  71: { gir: 61, scrambling: 47, putting: 83, par3: 81, par4: 73, par5: 80 }, // scratch (HI~0)
};

// ComparisonTargetToggle handicap values → benchmark profiles
export const HANDICAP_BENCHMARK: Record<number, BenchmarkProfile> = {
  0:  { gir: 61, scrambling: 47, putting: 83, par3: 81, par4: 73, par5: 80 },
  5:  { gir: 44, scrambling: 41, putting: 78, par3: 72, par4: 60, par5: 58 },
  10: { gir: 36, scrambling: 31, putting: 73, par3: 65, par4: 54, par5: 51 },
  15: { gir: 24, scrambling: 21, putting: 70, par3: 56, par4: 39, par5: 36 },
  20: { gir: 17, scrambling: 20, putting: 66, par3: 49, par4: 29, par5: 23 },
  25: { gir: 10, scrambling: 18, putting: 66, par3: 41, par4: 6,  par5: 0  },
};
