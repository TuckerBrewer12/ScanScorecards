import type { ScoringByParRow, ScoreTypeRow } from "@/types/analytics";
import type { BenchmarkProfile } from "./constants";

interface Props {
  scoringByPar: ScoringByParRow[];
  scoreTypeDist: ScoreTypeRow[];
  benchmark: BenchmarkProfile | null;
  benchmarkLabel: string;
}

// Inverse of: normalized = clamp(((2 - avg_to_par) / 2.5) * 100)
function normToAvgToPar(n: number) {
  return 2.0 - (n / 100) * 2.5;
}

function parColor(v: number): string {
  if (v <= 0.6) return "#059669";
  if (v <= 1.1) return "#f59e0b";
  return "#ef4444";
}

function parTextClass(v: number): string {
  if (v <= 0.6) return "text-emerald-600";
  if (v <= 1.1) return "text-amber-500";
  return "text-red-500";
}

export function ParTypeCard({ scoringByPar, scoreTypeDist, benchmark, benchmarkLabel }: Props) {
  const MAX = 2.4;

  const rows = [
    {
      label: "Par 3s",
      data: scoringByPar.find((r) => r.par === 3),
      bmkNorm: benchmark?.par3 ?? null,
      barColor: "#ef4444",
    },
    {
      label: "Par 4s",
      data: scoringByPar.find((r) => r.par === 4),
      bmkNorm: benchmark?.par4 ?? null,
      barColor: "#f59e0b",
    },
    {
      label: "Par 5s",
      data: scoringByPar.find((r) => r.par === 5),
      bmkNorm: benchmark?.par5 ?? null,
      barColor: "#059669",
    },
  ];

  // Double+ rate per round from score type distribution
  const doublePlusRates = [0, 0, 0]; // par3/4/5 — not available per par type
  const overallDoubleRates = scoreTypeDist.map((r) => {
    const total = r.holes_counted || 1;
    return ((r.double_bogey + r.triple_bogey + r.quad_bogey) / 100) * total;
  });
  const avgDoublesPerRound =
    overallDoubleRates.length > 0
      ? overallDoubleRates.reduce((a, b) => a + b, 0) / overallDoubleRates.length
      : null;

  // Proportional estimates for par type double rate (par 3 worst, par 5 best)
  const doubleBarData =
    avgDoublesPerRound != null
      ? [
          { label: "Par 3", pct: Math.min(99, avgDoublesPerRound * 1.45 * (100 / 18)), color: "rgba(239,68,68,.6)" },
          { label: "Par 4", pct: Math.min(99, avgDoublesPerRound * 1.05 * (100 / 18)), color: "rgba(245,158,11,.6)" },
          { label: "Par 5", pct: Math.min(99, avgDoublesPerRound * 0.5  * (100 / 18)), color: "rgba(5,150,105,.6)" },
        ]
      : null;

  void doublePlusRates;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-5">
      <div>
        <p className="text-sm font-semibold text-gray-800">Scoring by Par Type</p>
        <p className="text-xs text-gray-400 mt-0.5">Avg strokes above par per hole · last 20 rounds</p>
      </div>

      <div className="space-y-4">
        {rows.map(({ label, data, bmkNorm }) => {
          const player = data?.average_to_par ?? null;
          const bmkVal = bmkNorm != null ? normToAvgToPar(bmkNorm) : null;

          if (player === null || (data?.sample_size ?? 0) < 1) {
            return (
              <div key={label}>
                <div className="flex justify-between mb-1.5">
                  <span className="text-sm font-semibold text-gray-700">{label}</span>
                  <span className="text-xs text-gray-400">No data</span>
                </div>
              </div>
            );
          }

          const playerPct = Math.min(100, Math.max(0, (player / MAX) * 100));
          const bmkPct    = bmkVal != null ? Math.min(100, Math.max(0, (bmkVal / MAX) * 100)) : null;
          const diff       = bmkVal != null ? player - bmkVal : null;
          const color      = parColor(player);
          const textCls    = parTextClass(player);

          return (
            <div key={label}>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-sm font-semibold text-gray-700">{label}</span>
                <span className={`text-sm font-mono font-semibold ${textCls}`}>
                  {player >= 0 ? "+" : ""}{player.toFixed(2)} avg
                </span>
              </div>
              <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                {/* benchmark bar (behind) */}
                {bmkPct != null && (
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${bmkPct}%`, backgroundColor: "#1e3d25", opacity: 0.22 }}
                  />
                )}
                {/* player bar */}
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                  style={{ width: `${playerPct}%`, backgroundColor: color }}
                />
              </div>
              {diff != null && bmkVal != null && (
                <p className={`text-[11px] mt-1 ${diff <= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {benchmarkLabel} {bmkVal >= 0 ? "+" : ""}{bmkVal.toFixed(2)}
                  {" · "}
                  {diff > 0 ? "+" : ""}{diff.toFixed(2)} strokes to close gap
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Double+ rate mini chart */}
      {doubleBarData && (
        <div className="pt-3 border-t border-gray-50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
            Double+ Rate (est.)
          </p>
          <div className="flex items-end gap-3 h-[64px]">
            {doubleBarData.map(({ label, pct, color }) => (
              <div key={label} className="flex-1 flex flex-col items-center gap-1">
                <span className="font-mono text-[10px] text-gray-500">{Math.round(pct)}%</span>
                <div
                  className="w-full rounded-t-sm"
                  style={{ height: `${Math.max(4, (pct / 40) * 42)}px`, backgroundColor: color }}
                />
                <span className="text-[10px] text-gray-400">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
