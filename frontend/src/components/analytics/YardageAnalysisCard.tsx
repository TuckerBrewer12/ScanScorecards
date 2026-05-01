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
      {/* Header: yardage + sample size + Avg + To Par */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-lg font-extrabold tracking-tight text-gray-900">
            {row.bucket_label}
          </span>
          <span className="text-xs font-medium text-gray-400 ml-1">YDS</span>
          <div className="text-[10px] text-gray-400 mt-0.5">n={row.sample_size}</div>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Avg</div>
            <div className="text-base font-bold text-gray-900">
              {(row.par + row.average_to_par).toFixed(1)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">To Par</div>
            <div
              className="text-base font-bold"
              style={{ color: toParColor(row.average_to_par) }}
            >
              {toParSign(row.average_to_par)}
            </div>
          </div>
        </div>
      </div>

      {/* Scatter */}
      <YardageTargetScatter rawScores={rawScores} bucketLabel={row.bucket_label} />

      {/* Divider + GIR% + score distribution */}
      <div className="border-t border-gray-50 mt-3 pt-3">
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="text-sm font-bold uppercase tracking-wide" style={{ color: "#059669" }}>GIR%</span>
          <span className="text-sm font-bold text-gray-800">
            {row.gir_percentage != null ? `${row.gir_percentage.toFixed(0)}%` : "—"}
          </span>
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
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: seg.color }} />
                  <span className="text-[11px] font-semibold" style={{ color: seg.color }}>{seg.label}</span>
                  <span className="text-[11px] font-bold text-gray-600">{seg.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
