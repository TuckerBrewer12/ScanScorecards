import { CheckCircle2, Target, Trophy, BarChart2 } from "lucide-react";
import { motion } from "framer-motion";
import { ComparisonTargetToggle, type ComparisonTargetValue } from "@/components/suggestions/ComparisonTargetToggle";
import { GoalSaverCard } from "@/components/goals/GoalSaverCard";
import { ProgressRing } from "@/components/the-lab/ProgressRing";
import { AttemptsTimeline } from "@/components/the-lab/AttemptsTimeline";
import { buildRadarData, UserRadarChart } from "@/components/analytics/UserRadarChart";
import { GOAL_OPTIONS } from "@/components/the-lab/constants";
import type { BenchmarkProfile } from "@/components/the-lab/constants";
import type { AnalyticsData, GoalReport } from "@/types/analytics";
import type { GoalSaver } from "@/types/analytics";

interface PeakInsight {
  top: { total_score: number | null; round_index: number; course_name?: string | null }[];
  bestAvg: number;
  overallAvg: number | null | undefined;
  gapToGoal: number;
}

interface PeakScoreTypes {
  peak: { birdies: number; bogeys: number; doubles: number };
  all: { birdies: number; bogeys: number; doubles: number };
}

interface MobileLabPageProps {
  analyticsData: AnalyticsData | undefined;
  goalReport: GoalReport | undefined;
  currentGoal: number | null;
  setGoal: (g: number) => void;
  settingGoal: boolean;
  mode: "benchmark" | "peak";
  setMode: (m: "benchmark" | "peak") => void;
  comparisonTarget: ComparisonTargetValue;
  setComparisonTarget: (t: ComparisonTargetValue) => void;
  activeProfile: BenchmarkProfile | null;
  radarData: ReturnType<typeof buildRadarData>;
  peakInsight: PeakInsight | null;
  peakScoreTypes: PeakScoreTypes | null;
  savers: GoalSaver[];
  achievedCount: number;
  goalLabel: string | null;
  benchmarkHeading: string;
}

export function MobileLabPage({
  analyticsData,
  goalReport,
  currentGoal,
  setGoal,
  settingGoal,
  mode,
  setMode,
  comparisonTarget,
  setComparisonTarget,
  activeProfile,
  peakInsight,
  peakScoreTypes,
  savers,
  achievedCount,
  goalLabel,
  benchmarkHeading,
}: MobileLabPageProps) {
  const recentAttempts = analyticsData?.score_trend?.filter((r) => r.total_score != null) ?? [];

  return (
    <div className="space-y-4 px-4 py-4">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">The Lab</h1>
        <p className="text-xs text-gray-400">Your blueprint to lower scores.</p>
      </div>

      {/* Benchmark Radar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">{benchmarkHeading}</p>

        {/* Mode pills */}
        <div className="flex gap-2 mb-2">
          {(["benchmark", "peak"] as const).map((m) => {
            const active = mode === m;
            const disabled = m === "peak" && !peakInsight;
            return (
              <button
                key={m}
                onClick={() => !disabled && setMode(m)}
                disabled={disabled}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  active ? "bg-primary text-white shadow-sm" : "bg-gray-100 text-gray-500"
                } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                {m === "benchmark" ? "Avg (L20)" : "Peak"}
              </button>
            );
          })}
        </div>

        {/* Comparison target pills — horizontal scroll */}
        {mode === "benchmark" && (
          <div className="mb-2">
            <ComparisonTargetToggle value={comparisonTarget} onChange={setComparisonTarget} vertical={false} />
          </div>
        )}

        {/* Radar */}
        {analyticsData?.kpis && (
          <UserRadarChart
            kpis={analyticsData.kpis}
            scoringByPar={analyticsData.scoring_by_par ?? []}
            profile={activeProfile ?? undefined}
            height={240}
            outerRadius={88}
            primaryColor="#2d7a3a"
            gridColor="#e5e7eb"
            showTooltip
            emptyMessage="Play more rounds to build your performance shape."
            margin={{ top: 20, right: 36, bottom: 24, left: 36 }}
          />
        )}
      </div>

      {/* Goal Selector */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2.5">Set Your Target</p>
        <div className="flex flex-wrap gap-1.5">
          {GOAL_OPTIONS.map(({ label, value }) => {
            const active = currentGoal === value;
            return (
              <button
                key={value}
                onClick={() => setGoal(value)}
                disabled={settingGoal}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  active
                    ? "bg-primary text-white shadow-sm"
                    : "bg-gray-50 text-gray-600 border border-gray-100"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Goal Stats */}
      {currentGoal && goalReport && goalReport.gap != null && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
          <div className="flex gap-3 items-start">
            {/* Ring + label */}
            <div className="shrink-0 flex flex-col items-center gap-1">
              <div className="relative">
                <ProgressRing gap={goalReport.gap} onTrack={goalReport.on_track} size={96} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  {goalReport.on_track ? (
                    <>
                      <CheckCircle2 size={16} className="text-emerald-500" />
                      <span className="text-[9px] font-bold text-emerald-600 mt-0.5">Done</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Gap</span>
                      <span className="text-xl font-black text-gray-900 leading-tight">+{goalReport.gap.toFixed(1)}</span>
                      <span className="text-[8px] text-gray-400">strokes</span>
                    </>
                  )}
                </div>
              </div>
              <span className="text-[9px] text-gray-400 text-center leading-tight max-w-[88px]">{goalLabel}</span>
            </div>

            {/* 2×2 stat cells */}
            <div className="flex-1 grid grid-cols-2 gap-1.5">
              {[
                { label: "Scoring Avg", value: goalReport.scoring_average?.toFixed(1) ?? "—", Icon: BarChart2, good: goalReport.on_track },
                { label: "Best Score", value: goalReport.best_score ?? "—", Icon: Trophy, good: goalReport.best_score != null && goalReport.best_score <= currentGoal },
                { label: "Target", value: currentGoal, Icon: Target, good: false },
                { label: "Achieved", value: achievedCount === 0 ? "0" : achievedCount, Icon: CheckCircle2, good: achievedCount > 0 },
              ].map(({ label, value, Icon, good }) => (
                <div key={label} className="bg-gray-50 rounded-lg px-2 py-1.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[8px] font-bold uppercase tracking-wide text-gray-400">{label}</span>
                    <Icon size={10} className={good ? "text-emerald-500" : "text-gray-200"} />
                  </div>
                  <span className={`text-base font-black leading-none ${good ? "text-emerald-600" : "text-gray-900"}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Attempts Timeline */}
      {currentGoal && recentAttempts.length >= 3 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
          <p className="text-xs font-semibold text-gray-800 mb-1">Recent Attempts</p>
          <p className="text-[10px] text-gray-400 mb-2 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            green rounds beat the goal
          </p>
          <AttemptsTimeline scores={analyticsData!.score_trend} goal={currentGoal} />
        </div>
      )}

      {/* Peak Game Analysis */}
      {peakInsight && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Your Peak Game</p>
          <div className="flex items-end gap-3 mb-2">
            <span className="text-2xl font-black text-gray-900 tracking-tighter">{peakInsight.bestAvg.toFixed(1)}</span>
            <span className="text-xs text-gray-400 pb-0.5">avg · best {peakInsight.top.length} rounds</span>
            {peakInsight.overallAvg != null && (
              <span className="text-xs text-gray-400 pb-0.5 ml-auto">Overall {peakInsight.overallAvg.toFixed(1)}</span>
            )}
          </div>

          {peakInsight.gapToGoal <= 0 ? (
            <p className="text-xs font-semibold text-emerald-600 mb-2">Your best rounds already {goalLabel}.</p>
          ) : (
            <p className="text-xs text-gray-600 mb-2">
              Just <span className="font-bold text-gray-900">{peakInsight.gapToGoal.toFixed(1)} strokes</span> away on your best days.
            </p>
          )}

          <div className="space-y-1 border-t border-gray-50 pt-2 mb-3">
            {peakInsight.top.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-400 truncate max-w-[160px]">{r.course_name ?? `Round ${i + 1}`}</span>
                <span className="font-bold text-gray-700 shrink-0 ml-2">{r.total_score}</span>
              </div>
            ))}
          </div>

          {peakScoreTypes && (() => {
            const metrics = [
              { label: "Birdies", peak: peakScoreTypes.peak.birdies, avg: peakScoreTypes.all.birdies, higherIsBetter: true, strokeMult: 1, color: "#059669" },
              { label: "Bogeys",  peak: peakScoreTypes.peak.bogeys,  avg: peakScoreTypes.all.bogeys,  higherIsBetter: false, strokeMult: 1, color: "#ef4444" },
              { label: "Doubles+", peak: peakScoreTypes.peak.doubles, avg: peakScoreTypes.all.doubles, higherIsBetter: false, strokeMult: 2, color: "#60a5fa" },
            ];
            return (
              <div className="border-t border-gray-50 pt-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Peak vs. Average</p>
                <div className="space-y-2">
                  {metrics.map(({ label, peak, avg, higherIsBetter, strokeMult, color }) => {
                    const diff = peak - avg;
                    const good = higherIsBetter ? diff > 0 : diff < 0;
                    const strokeImpact = (higherIsBetter ? diff : -diff) * strokeMult;
                    const maxVal = Math.max(peak, avg, 0.1) * 1.2;
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] font-semibold text-gray-600">{label}</span>
                          <span className="text-[10px] font-bold" style={{ color: good ? "#059669" : strokeImpact === 0 ? "#9ca3af" : "#ef4444" }}>
                            {strokeImpact > 0 ? "+" : ""}{strokeImpact.toFixed(1)} strokes {strokeImpact >= 0 ? "gained" : "lost"}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {[{ label: "Peak", val: peak, col: color }, { label: "Avg", val: avg, col: "#d1d5db" }].map(({ label: bl, val, col }) => (
                            <div key={bl} className="flex items-center gap-1.5">
                              <span className="text-[9px] text-gray-400 w-8 text-right shrink-0">{bl}</span>
                              <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${(val / maxVal) * 100}%`, backgroundColor: col }} />
                              </div>
                              <span className="text-[10px] font-bold text-gray-600 w-6 shrink-0">{val.toFixed(1)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Priority Fixes */}
      {currentGoal && savers.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary/50 mb-2">What's Holding You Back</p>
          <div className="space-y-3">
            {savers.slice(0, 2).map((saver, i) => (
              <motion.div
                key={saver.type}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
              >
                <GoalSaverCard saver={saver} />
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
