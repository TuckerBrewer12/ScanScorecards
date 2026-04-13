import type { ScoringByYardageRow } from "@/types/analytics";
import { YardageTargetScatter } from "./YardageTargetScatter";

interface YardageAnalysisCardProps {
  row: ScoringByYardageRow;
}

function toParColor(avgToPar: number): string {
  if (avgToPar < -0.1) return "#059669";
  if (avgToPar > 0.4)  return "#ef4444";
  return "#9ca3af";
}

function toParSign(n: number): string {
  if (n < 0) return `−${Math.abs(n).toFixed(2)}`;
  if (n > 0) return `+${n.toFixed(2)}`;
  return "E";
}

const SCORE_SEGMENTS = [
  { key: "eagle",        label: "Eagle+", color: "#f59e0b", test: (n: number) => n <= -2 },
  { key: "birdie",       label: "Birdie",  color: "#059669", test: (n: number) => n === -1 },
  { key: "par",          label: "Par",     color: "#9ca3af", test: (n: number) => n === 0 },
  { key: "bogey",        label: "Bogey",   color: "#ef4444", test: (n: number) => n === 1 },
  { key: "double",       label: "Double",  color: "#60a5fa", test: (n: number) => n === 2 },
  { key: "triple",       label: "Triple",  color: "#a78bfa", test: (n: number) => n === 3 },
  { key: "quad",         label: "Quad+",   color: "#6d28d9", test: (n: number) => n >= 4 },
] as const;

export function YardageAnalysisCard({ row }: YardageAnalysisCardProps) {
  const rawScores = row.raw_scores || [];
  const total = rawScores.length;
  const hasScores = total > 0;

  const segments = SCORE_SEGMENTS.map(seg => ({
    ...seg,
    pct: hasScores ? (rawScores.filter(s => seg.test(s.to_par)).length / total) * 100 : 0,
  })).filter(s => s.pct > 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <span className="text-lg font-extrabold tracking-tight text-gray-900">
            {row.bucket_label}
          </span>
          <span className="text-xs font-medium text-gray-400 ml-1">YDS</span>
        </div>
        <span className="text-xs text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">
          n={row.sample_size}
        </span>
      </div>

      {/* Scatter */}
      <YardageTargetScatter rawScores={rawScores} bucketLabel={row.bucket_label} />

      {/* Divider */}
      <div className="border-t border-gray-50 mt-3 pt-3">
        {/* 3-col metrics */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="text-center">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">GIR%</div>
            <div className="text-sm font-bold text-gray-800">
              {row.gir_percentage != null ? `${row.gir_percentage.toFixed(0)}%` : "—"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Avg</div>
            <div className="text-sm font-bold text-gray-800">
              {(row.par + row.average_to_par).toFixed(1)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">To Par</div>
            <div
              className="text-sm font-bold"
              style={{ color: toParColor(row.average_to_par) }}
            >
              {toParSign(row.average_to_par)}
            </div>
          </div>
        </div>

        {/* Score distribution bar */}
        {hasScores && (
          <div>
            <div className="h-2 rounded-full overflow-hidden flex gap-px">
              {segments.map(seg => (
                <div
                  key={seg.key}
                  style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}
                  title={`${seg.label}: ${seg.pct.toFixed(0)}%`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
              {segments.map(seg => (
                <div key={seg.key} className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: seg.color }} />
                  <span className="text-[9px] text-gray-400">{seg.label} {seg.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
