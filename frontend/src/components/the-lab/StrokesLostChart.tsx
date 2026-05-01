import type { GoalSaver } from "@/types/analytics";

const SAVER_META: Record<
  GoalSaver["type"],
  { label: string; color: string }
> = {
  three_putt_bleed:        { label: "Lag putting (3-putts)",  color: "#ef4444" },
  gir_opportunity:         { label: "GIR misses",             color: "#f97316" },
  blowup_holes:            { label: "Blow-up holes (Dbl+)",   color: "#eab308" },
  scrambling_opportunity:  { label: "Scrambling failures",    color: "#3b82f6" },
  achilles_heel:           { label: "Achilles heel holes",    color: "#8b5cf6" },
  par5_opportunity:        { label: "Par 5 scoring",          color: "#059669" },
  home_course_demon:       { label: "Home course holes",      color: "#a78bfa" },
};

interface Props {
  savers: GoalSaver[];
  goalLabel: string | null;
  totalGap: number | null;
}

export function StrokesLostChart({ savers, goalLabel, totalGap }: Props) {
  if (!savers.length) return null;

  // Sort by strokes_saved descending (biggest impact first)
  const sorted = [...savers].sort((a, b) => b.strokes_saved - a.strokes_saved);
  const maxPct = Math.max(...sorted.map((s) => s.percentage_of_gap), 1);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between mb-1">
        <p className="text-sm font-semibold text-gray-800">Where You're Losing Shots</p>
        <span className="text-xs text-gray-400 shrink-0 ml-3">
          Per round vs. {goalLabel ?? "your goal"}
        </span>
      </div>
      {totalGap != null && totalGap > 0 && (
        <p className="text-xs text-gray-500 mb-5">
          Total gap:{" "}
          <span className="font-semibold text-gray-800">
            +{totalGap.toFixed(1)} strokes/round
          </span>
        </p>
      )}

      <div className="space-y-3">
        {sorted.map((saver) => {
          const meta = SAVER_META[saver.type] ?? {
            label: saver.type,
            color: "#9ca3af",
          };
          const barPct = (saver.percentage_of_gap / maxPct) * 100;

          return (
            <div key={saver.type} className="flex items-center gap-3">
              <span className="w-[148px] text-xs font-medium text-gray-600 shrink-0 truncate">
                {meta.label}
              </span>
              <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${barPct}%`,
                    backgroundColor: meta.color,
                    opacity: 0.75,
                  }}
                />
              </div>
              <span className="w-12 text-right font-mono text-xs font-semibold text-[#ef4444] shrink-0">
                −{saver.strokes_saved.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-50 flex justify-end">
        <span className="text-[11px] text-gray-400">Bar length = share of total gap</span>
      </div>
    </div>
  );
}
