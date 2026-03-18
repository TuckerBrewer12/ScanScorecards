import { useMemo } from "react";
import type { ScoringByYardageRow } from "@/types/analytics";

interface RangeInsightsHUDProps {
  rows: ScoringByYardageRow[];
}

const PAR_COLORS: Record<number, { bg: string; text: string }> = {
  3: { bg: "#ede9fe", text: "#6d28d9" },
  4: { bg: "#e0f2fe", text: "#0369a1" },
  5: { bg: "#dcfce7", text: "#15803d" },
};

export function RangeInsightsHUD({ rows }: RangeInsightsHUDProps) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.average_to_par - a.average_to_par),
    [rows],
  );

  const maxSampleSize = useMemo(
    () => Math.max(...rows.map((r) => r.sample_size), 1),
    [rows],
  );

  if (sorted.length === 0) return null;

  return (
    <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
      {sorted.map((row) => {
        const isWeakness = row.average_to_par >= 0.5;
        const isStrength = row.average_to_par <= -0.1;
        const barWidth = Math.round((row.sample_size / maxSampleSize) * 100);
        const parStyle = PAR_COLORS[row.par] ?? { bg: "#f3f4f6", text: "#6b7280" };

        return (
          <div key={`${row.par}-${row.bucket_label}`} className="px-4 py-3 flex items-center justify-between gap-4">
            {/* Left: badge + label + bar */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: parStyle.bg, color: parStyle.text }}
                >
                  Par {row.par}
                </span>
                <span className="text-xs text-gray-700 font-medium truncate">{row.bucket_label}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-gray-100 max-w-[120px]">
                  <div
                    className="h-full rounded-full bg-gray-300"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400">n={row.sample_size}</span>
              </div>
            </div>

            {/* Right: to-par + badge */}
            <div className="text-right shrink-0">
              <div
                className="text-sm font-bold tabular-nums"
                style={{ color: isWeakness ? "#ef4444" : isStrength ? "#059669" : "#6b7280" }}
              >
                {row.average_to_par > 0 ? "+" : row.average_to_par < 0 ? "−" : ""}
                {Math.abs(row.average_to_par).toFixed(2)}
              </div>
              {isWeakness && (
                <div className="text-[10px] font-semibold text-red-500 mt-0.5">Weakness</div>
              )}
              {isStrength && (
                <div className="text-[10px] font-semibold text-emerald-600 mt-0.5">Strength</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
