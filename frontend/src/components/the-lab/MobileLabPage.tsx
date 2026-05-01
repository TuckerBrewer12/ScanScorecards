import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ComparisonTargetToggle, type ComparisonTargetValue } from "@/components/suggestions/ComparisonTargetToggle";
import { AttemptsTimeline } from "@/components/the-lab/AttemptsTimeline";
import { ParTypeCard } from "@/components/the-lab/ParTypeCard";
import { PuttingDeepDiveCard } from "@/components/the-lab/PuttingDeepDiveCard";
import { UserRadarChart } from "@/components/analytics/UserRadarChart";
import { GOAL_OPTIONS } from "@/components/the-lab/constants";
import type { BenchmarkProfile } from "@/components/the-lab/constants";
import type { AnalyticsData } from "@/types/analytics";

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
  currentGoal: number | null;
  setGoal: (g: number) => void;
  settingGoal: boolean;
  mode: "benchmark" | "peak";
  setMode: (m: "benchmark" | "peak") => void;
  comparisonTarget: ComparisonTargetValue;
  setComparisonTarget: (t: ComparisonTargetValue) => void;
  activeProfile: BenchmarkProfile | null;
  peakInsight: PeakInsight | null;
  peakScoreTypes: PeakScoreTypes | null;
  goalLabel: string | null;
  benchmarkHeading: string;
}

const panelVariants = {
  enter: (d: number) => ({ x: d * 40, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const } },
  exit: (d: number) => ({ x: -d * 40, opacity: 0, transition: { duration: 0.15 } }),
};

export function MobileLabPage({
  analyticsData,
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
  goalLabel,
  benchmarkHeading,
}: MobileLabPageProps) {
  const recentAttempts = analyticsData?.score_trend?.filter((r) => r.total_score != null) ?? [];

  const [activePanel, setActivePanel] = useState(0);
  const [direction, setDirection] = useState(1);
  const touchStartX = useRef<number | null>(null);

  const panels: { key: "scoring" | "putting" | "peak"; label: string }[] = [
    ...(analyticsData && analyticsData.scoring_by_par.length > 0
      ? [{ key: "scoring" as const, label: "By Par" }] : []),
    ...(analyticsData && analyticsData.three_putts_trend.length > 0
      ? [{ key: "putting" as const, label: "Putting" }] : []),
    ...(peakInsight ? [{ key: "peak" as const, label: "Peak" }] : []),
  ];

  const goTo = (idx: number) => {
    const clamped = Math.max(0, Math.min(idx, panels.length - 1));
    if (clamped === activePanel) return;
    setDirection(clamped > activePanel ? 1 : -1);
    setActivePanel(clamped);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    goTo(dx < 0 ? activePanel + 1 : activePanel - 1);
  };

  const currentKey = panels[activePanel]?.key;

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

        {/* Comparison target pills */}
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

      {/* Swipeable: Scoring · Putting · Peak */}
      {panels.length > 0 && (
        <div>
          <div className="mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary/50">Performance</p>
          </div>

          {/* Tab pills */}
          {panels.length > 1 && (
            <div className="flex gap-2 mb-3">
              {panels.map((panel, i) => (
                <button
                  key={panel.key}
                  onClick={() => goTo(i)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    activePanel === i
                      ? "bg-primary text-white shadow-sm"
                      : "bg-white border border-gray-200 text-gray-500"
                  }`}
                >
                  {panel.label}
                </button>
              ))}
            </div>
          )}

          {/* Panel content */}
          <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} className="relative">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentKey}
                custom={direction}
                variants={panelVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                {currentKey === "scoring" && analyticsData && (
                  <ParTypeCard
                    scoringByPar={analyticsData.scoring_by_par}
                    scoreTypeDist={analyticsData.score_type_distribution}
                    benchmark={activeProfile}
                    benchmarkLabel={
                      mode === "peak"
                        ? "Peak game"
                        : typeof comparisonTarget === "number"
                        ? `HCP ${comparisonTarget}`
                        : goalLabel ?? "Target"
                    }
                  />
                )}

                {currentKey === "putting" && analyticsData && (
                  <PuttingDeepDiveCard
                    threePuttsTrend={analyticsData.three_putts_trend}
                    puttsTrend={analyticsData.putts_trend}
                  />
                )}

                {currentKey === "peak" && peakInsight && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Your Peak Game</p>
                    <div className="flex items-end gap-4 mb-3">
                      <div>
                        <span className="text-4xl font-black text-gray-900 tracking-tighter">{peakInsight.bestAvg.toFixed(1)}</span>
                        <span className="text-sm text-gray-400 ml-2">avg · best {peakInsight.top.length} rounds</span>
                      </div>
                      {peakInsight.overallAvg != null && (
                        <div className="pb-1 ml-auto text-right">
                          <span className="text-xs text-gray-400">Overall avg </span>
                          <span className="text-sm font-semibold text-gray-500">{peakInsight.overallAvg.toFixed(1)}</span>
                        </div>
                      )}
                    </div>

                    {peakInsight.gapToGoal <= 0 ? (
                      <p className="text-sm font-semibold text-emerald-600 mb-3">
                        Your best rounds already {goalLabel} — make it your new normal.
                      </p>
                    ) : (
                      <p className="text-sm text-gray-600 mb-3">
                        Just{" "}
                        <span className="font-bold text-gray-900">{peakInsight.gapToGoal.toFixed(1)} strokes</span>{" "}
                        away from {goalLabel} on your best days.
                      </p>
                    )}

                    <div className="space-y-1.5 border-t border-gray-50 pt-3 mb-4">
                      {peakInsight.top.map((r, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-gray-400 truncate max-w-[180px]">{r.course_name ?? `Round ${i + 1}`}</span>
                          <span className="font-bold text-gray-700 shrink-0 ml-2">{r.total_score}</span>
                        </div>
                      ))}
                    </div>

                    {peakScoreTypes && (() => {
                      const metrics = [
                        { label: "Birdies",  peak: peakScoreTypes.peak.birdies, avg: peakScoreTypes.all.birdies, higherIsBetter: true,  strokeMult: 1, color: "#059669" },
                        { label: "Bogeys",   peak: peakScoreTypes.peak.bogeys,  avg: peakScoreTypes.all.bogeys,  higherIsBetter: false, strokeMult: 1, color: "#ef4444" },
                        { label: "Doubles+", peak: peakScoreTypes.peak.doubles, avg: peakScoreTypes.all.doubles, higherIsBetter: false, strokeMult: 2, color: "#60a5fa" },
                      ];
                      return (
                        <div className="border-t border-gray-50 pt-4">
                          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                            <span className="text-[#facc15] font-extrabold">Peak</span> vs. Average
                          </p>
                          <div className="space-y-3">
                            {metrics.map(({ label, peak, avg, higherIsBetter, strokeMult, color }) => {
                              const diff = peak - avg;
                              const good = higherIsBetter ? diff > 0 : diff < 0;
                              const strokeImpact = (higherIsBetter ? diff : -diff) * strokeMult;
                              const maxVal = Math.max(peak, avg, 0.1) * 1.2;
                              const peakPct = (peak / maxVal) * 100;
                              const avgPct = (avg / maxVal) * 100;
                              return (
                                <div key={label}>
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] font-semibold text-gray-600">{label}</span>
                                    <span className="text-[11px] font-bold" style={{ color: good ? "#059669" : strokeImpact === 0 ? "#9ca3af" : "#ef4444" }}>
                                      {strokeImpact > 0 ? "+" : ""}{strokeImpact.toFixed(1)} strokes {strokeImpact >= 0 ? "gained" : "lost"}
                                    </span>
                                  </div>
                                  <div className="space-y-1.5 mt-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] text-[#facc15] font-bold w-8 text-right shrink-0">Peak</span>
                                      <div className="flex-1 h-3.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${peakPct}%`, backgroundColor: "#facc15" }} />
                                      </div>
                                      <span className="text-[11px] font-bold text-gray-700 w-8 shrink-0 text-right">{peak.toFixed(1)}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] text-gray-400 w-8 text-right shrink-0">Avg</span>
                                      <div className="flex-1 h-3.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${avgPct}%`, backgroundColor: color }} />
                                      </div>
                                      <span className="text-[11px] font-bold text-gray-400 w-8 shrink-0 text-right">{avg.toFixed(1)}</span>
                                    </div>
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
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Dot indicators */}
          {panels.length > 1 && (
            <div className="flex justify-center items-center gap-1.5 mt-3">
              {panels.map((_, i) => (
                <motion.button
                  key={i}
                  onClick={() => goTo(i)}
                  animate={{ width: i === activePanel ? 20 : 6, opacity: i === activePanel ? 1 : 0.35 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: 6 }}
                />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
