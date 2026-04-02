import { useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip,
} from "recharts";
import { Target, Trophy, CheckCircle2, BarChart2 } from "lucide-react";
import { api } from "@/lib/api";
import { ComparisonTargetToggle } from "@/components/suggestions/ComparisonTargetToggle";
import { BentoCard } from "@/components/ui/BentoCard";
import { GoalSaverCard } from "@/components/goals/GoalSaverCard";
import type { AnalyticsKPIs, ScoringByParRow, ScoreTypeRow } from "@/types/analytics";

// ── Constants ─────────────────────────────────────────────────────────────────

const GOAL_OPTIONS = [
  { label: "Break 100", value: 99 },
  { label: "Break 95",  value: 94 },
  { label: "Break 90",  value: 89 },
  { label: "Break 85",  value: 84 },
  { label: "Break 80",  value: 79 },
  { label: "Break 75",  value: 74 },
  { label: "Break 72",  value: 71 },
] as const;

interface BenchmarkProfile {
  gir: number; scrambling: number; putting: number;
  par3: number; par4: number; par5: number;
}

// Normalized 0–100 per axis representing a golfer at that scoring level.
// GIR & Scrambling values are also real percentages (0–100).
// Putting & par scores are normalized via the same formula as buildRadarData.
const GOAL_BENCHMARK: Record<number, BenchmarkProfile> = {
  99: { gir: 14, scrambling: 13, putting: 42, par3: 32, par4: 22, par5: 28 },
  94: { gir: 21, scrambling: 20, putting: 52, par3: 40, par4: 29, par5: 36 },
  89: { gir: 30, scrambling: 28, putting: 61, par3: 50, par4: 38, par5: 46 },
  84: { gir: 42, scrambling: 38, putting: 69, par3: 60, par4: 48, par5: 56 },
  79: { gir: 55, scrambling: 48, putting: 77, par3: 70, par4: 59, par5: 66 },
  74: { gir: 65, scrambling: 57, putting: 83, par3: 76, par4: 67, par5: 74 },
  71: { gir: 72, scrambling: 64, putting: 88, par3: 81, par4: 73, par5: 80 },
};

// ComparisonTargetToggle handicap values → benchmark profiles
const HANDICAP_BENCHMARK: Record<number, BenchmarkProfile> = {
  0:  { gir: 72, scrambling: 64, putting: 88, par3: 81, par4: 73, par5: 80 },
  5:  { gir: 65, scrambling: 57, putting: 83, par3: 76, par4: 67, par5: 74 },
  10: { gir: 55, scrambling: 48, putting: 77, par3: 70, par4: 59, par5: 66 },
  15: { gir: 42, scrambling: 38, putting: 69, par3: 60, par4: 48, par5: 56 },
  20: { gir: 30, scrambling: 28, putting: 61, par3: 50, par4: 38, par5: 46 },
  28: { gir: 14, scrambling: 13, putting: 42, par3: 32, par4: 22, par5: 28 },
};


// ── Types ─────────────────────────────────────────────────────────────────────

type RadarEntry = {
  axis: string;
  value: number;       // 0–100 normalized user score
  benchmark: number;   // 0–100 normalized benchmark score
  userRaw: string;     // human-readable user stat
  benchRaw: string;    // human-readable benchmark stat
  hasData: boolean;    // false when underlying kpi is null/untracked
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSign(v: number) {
  return (v >= 0 ? "+" : "") + v.toFixed(1);
}

function buildRadarData(
  kpis: AnalyticsKPIs,
  scoringByPar: ScoringByParRow[],
  profile: BenchmarkProfile,
): RadarEntry[] {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  const hasGir  = kpis.gir_percentage != null;
  const hasScr  = kpis.scrambling_percentage != null;
  const hasPutt = kpis.putts_per_gir != null;

  const girPct   = kpis.gir_percentage ?? 0;
  const scrPct   = kpis.scrambling_percentage ?? 0;
  const puttsRaw = kpis.putts_per_gir ?? 3.5;

  const parRow = (par: number) => scoringByPar.find((r) => r.par === par && r.sample_size > 0);

  // Inverted benchmark raw values (back-calculate from normalized 0–100 scores)
  const benchPutts = 3.5 - (profile.putting * 2.0) / 100;
  const benchPar3  = 2.0 - (profile.par3  * 2.5) / 100;
  const benchPar4  = 2.0 - (profile.par4  * 2.5) / 100;
  const benchPar5  = 2.0 - (profile.par5  * 2.5) / 100;

  return [
    {
      axis: "GIR",
      value: clamp(girPct),
      benchmark: profile.gir,
      userRaw: girPct.toFixed(0) + "%",
      benchRaw: profile.gir + "%",
      hasData: hasGir,
    },
    {
      axis: "Scrambling",
      value: clamp(scrPct),
      benchmark: profile.scrambling,
      userRaw: scrPct.toFixed(0) + "%",
      benchRaw: profile.scrambling + "%",
      hasData: hasScr,
    },
    {
      axis: "Putting",
      value: clamp(((3.5 - puttsRaw) / 2.0) * 100),
      benchmark: profile.putting,
      userRaw: puttsRaw.toFixed(2) + "/GIR",
      benchRaw: benchPutts.toFixed(2) + "/GIR",
      hasData: hasPutt,
    },
    {
      axis: "Par 3s",
      value: clamp(((2.0 - (parRow(3)?.average_to_par ?? 2.0)) / 2.5) * 100),
      benchmark: profile.par3,
      userRaw: parRow(3) ? fmtSign(parRow(3)!.average_to_par) : "—",
      benchRaw: fmtSign(benchPar3),
      hasData: !!parRow(3),
    },
    {
      axis: "Par 4s",
      value: clamp(((2.0 - (parRow(4)?.average_to_par ?? 2.0)) / 2.5) * 100),
      benchmark: profile.par4,
      userRaw: parRow(4) ? fmtSign(parRow(4)!.average_to_par) : "—",
      benchRaw: fmtSign(benchPar4),
      hasData: !!parRow(4),
    },
    {
      axis: "Par 5s",
      value: clamp(((2.0 - (parRow(5)?.average_to_par ?? 2.0)) / 2.5) * 100),
      benchmark: profile.par5,
      userRaw: parRow(5) ? fmtSign(parRow(5)!.average_to_par) : "—",
      benchRaw: fmtSign(benchPar5),
      hasData: !!parRow(5),
    },
  ];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-[11px] font-bold text-primary/50 uppercase tracking-[0.18em] whitespace-nowrap">
        {label}
      </span>
      <div className="h-px flex-1 bg-primary/10 rounded-full" />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-24 rounded-2xl bg-gray-100" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="h-32 rounded-2xl bg-gray-100" />
        <div className="h-32 rounded-2xl bg-gray-100" />
      </div>
      <div className="h-80 rounded-2xl bg-gray-100" />
    </div>
  );
}

function ProgressRing({ gap, onTrack }: { gap: number; onTrack: boolean }) {
  const r = 54; const strokeW = 9; const size = 148; const c = size / 2;
  const circ = 2 * Math.PI * r;
  const progress = onTrack ? 1 : Math.max(0.04, 1 - gap / 16);
  const offset = circ * (1 - progress);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeW} />
      <motion.circle
        cx={c} cy={c} r={r} fill="none"
        stroke={onTrack ? "#059669" : "#2d7a3a"}
        strokeWidth={strokeW} strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: "easeOut", delay: 0.15 }}
        transform={`rotate(-90 ${c} ${c})`}
      />
    </svg>
  );
}

function AttemptsTimeline({ scores, goal }: { scores: { total_score: number | null; round_index: number }[]; goal: number }) {
  const valid = scores.filter((r) => r.total_score != null).slice(-24);
  if (valid.length < 3) return null;
  const W = 560; const H = 96; const PX = 8; const PY = 14;
  const vals = valid.map((r) => r.total_score!);
  const minV = Math.min(...vals, goal) - 4;
  const maxV = Math.max(...vals, goal) + 4;
  const toX = (i: number) => PX + (i / (valid.length - 1)) * (W - PX * 2);
  const toY = (v: number) => PY + ((v - minV) / (maxV - minV)) * (H - PY * 2);
  const goalY = toY(goal);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} overflow="visible">
      <line x1={PX} y1={goalY} x2={W - PX - 28} y2={goalY}
        stroke="#2d7a3a" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.4} />
      <text x={W - PX - 24} y={goalY + 4} fontSize={9} fill="#2d7a3a" opacity={0.55} fontWeight="600">Goal</text>
      <polyline
        points={valid.map((r, i) => `${toX(i)},${toY(r.total_score!)}`).join(" ")}
        fill="none" stroke="#e5e7eb" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
      />
      {valid.map((r, i) => {
        const beat = r.total_score! <= goal;
        return (
          <motion.circle key={i} cx={toX(i)} cy={toY(r.total_score!)}
            r={beat ? 5.5 : 4}
            fill={beat ? "#059669" : "#f3f4f6"}
            stroke={beat ? "#059669" : "#d1d5db"}
            strokeWidth={beat ? 0 : 1.5}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.025, duration: 0.3, ease: "easeOut" }}
          />
        );
      })}
    </svg>
  );
}

// Custom tooltip shown on radar hover
function RadarTooltipContent({ payload }: { payload?: Array<{ payload: RadarEntry }> }) {
  if (!payload?.length) return null;
  const entry = payload[0]?.payload as RadarEntry | undefined;
  if (!entry?.axis) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl border border-gray-100 shadow-lg px-3 py-2.5 text-xs">
      <p className="font-bold text-gray-800 mb-2">{entry.axis}</p>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#2d7a3a" }} />
          <span className="text-gray-500">You</span>
          <span className="font-bold text-gray-900 ml-auto">{entry.userRaw}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0 bg-gray-300" />
          <span className="text-gray-500">Target</span>
          <span className="font-semibold text-gray-500 ml-auto">{entry.benchRaw}</span>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface TheLabPageProps {
  userId: string;
}

export function TheLabPage({ userId }: TheLabPageProps) {
  const queryClient = useQueryClient();
  const [targetHandicap, setTargetHandicap] = useState<number | null>(null);
  const [radarMode, setRadarMode] = useState<"benchmark" | "peak">("benchmark");

  // Queries
  const { data: user } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => api.getUser(userId),
  });
  const currentGoal = user?.scoring_goal ?? null;

  const { data: goalReport, isLoading: reportLoading } = useQuery({
    queryKey: ["goal-report", userId],
    queryFn: () => api.getGoalReport(userId, 20),
    enabled: !!currentGoal,
    retry: false,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["analytics", userId, { limit: 20 }],
    queryFn: () => api.getAnalytics(userId, { limit: 20, timeframe: "all", courseId: "all" }),
  });

  // Goal mutation
  const { mutate: setGoal, isPending: settingGoal } = useMutation({
    mutationFn: (value: number) => api.updateUser(userId, { scoring_goal: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", userId] });
      queryClient.invalidateQueries({ queryKey: ["goal-report", userId] });
    },
  });

  // Benchmark profile: driven solely by the toggle, independent of goal
  const benchmarkProfile = useMemo<BenchmarkProfile | null>(() => {
    if (targetHandicap != null) return HANDICAP_BENCHMARK[targetHandicap] ?? null;
    return null;
  }, [targetHandicap]);

  // Best rounds insight — top 3 rounds by score, for peak-game analysis
  const peakInsight = useMemo(() => {
    if (!currentGoal || !analytics?.score_trend) return null;
    const valid = analytics.score_trend
      .filter((r) => r.total_score != null)
      .sort((a, b) => a.total_score! - b.total_score!);
    if (valid.length < 2) return null;
    const top = valid.slice(0, Math.min(3, valid.length));
    const bestAvg = top.reduce((s, r) => s + r.total_score!, 0) / top.length;
    const overallAvg = analytics.kpis.scoring_average;
    const gapToGoal = bestAvg - currentGoal;
    return { top, bestAvg, overallAvg, gapToGoal };
  }, [analytics, currentGoal]);

  // Peak profile — nearest GOAL_BENCHMARK entry to the user's best-rounds average
  const peakProfile = useMemo<BenchmarkProfile | null>(() => {
    if (!peakInsight) return null;
    const thresholds = [71, 74, 79, 84, 89, 94, 99] as const;
    const nearest = thresholds.reduce((a, b) =>
      Math.abs(b - peakInsight.bestAvg) < Math.abs(a - peakInsight.bestAvg) ? b : a,
    );
    return GOAL_BENCHMARK[nearest];
  }, [peakInsight]);

  // Score type breakdown for peak rounds vs overall average
  const peakScoreTypes = useMemo(() => {
    if (!peakInsight || !analytics?.score_type_distribution?.length) return null;
    const peakIds = new Set(peakInsight.top.map((r) => r.round_id).filter(Boolean));
    const peakRows = analytics.score_type_distribution.filter((r) => r.round_id && peakIds.has(r.round_id));
    const allRows = analytics.score_type_distribution;
    if (!peakRows.length) return null;

    // Values are percentages (0–100); convert back to counts via holes_counted
    const avgCount = (rows: ScoreTypeRow[], key: keyof ScoreTypeRow) =>
      rows.reduce((s, r) => s + ((r[key] as number) / 100) * r.holes_counted, 0) / rows.length;
    const doublesPlus = (rows: ScoreTypeRow[]) =>
      rows.reduce((s, r) => s + ((r.double_bogey + r.triple_bogey + r.quad_bogey) / 100) * r.holes_counted, 0) / rows.length;

    return {
      peak: {
        birdies: avgCount(peakRows, "birdie"),
        bogeys: avgCount(peakRows, "bogey"),
        doubles: doublesPlus(peakRows),
      },
      all: {
        birdies: avgCount(allRows, "birdie"),
        bogeys: avgCount(allRows, "bogey"),
        doubles: doublesPlus(allRows),
      },
    };
  }, [peakInsight, analytics]);

  // Active profile: switches between peer benchmark and peak game
  const activeProfile = radarMode === "peak" ? peakProfile : benchmarkProfile;

  // Radar data — always build from user analytics; benchmark overlay is optional
  const { radarData, missingAxes } = useMemo(() => {
    if (!analytics?.kpis) return { radarData: null, missingAxes: [] };
    // Use a zero-profile when no overlay is selected so user shape always renders
    const profile = activeProfile ?? { gir: 0, scrambling: 0, putting: 0, par3: 0, par4: 0, par5: 0 };
    const all = buildRadarData(analytics.kpis, analytics.scoring_by_par ?? [], profile);
    const missing = all.filter((e) => !e.hasData).map((e) => e.axis);
    const data = all.filter((e) => e.hasData);
    return { radarData: data.length >= 3 ? data : null, missingAxes: missing };
  }, [analytics, activeProfile]);

  // Custom axis tick that shows axis name + user's raw value below
  const renderTick = useCallback(
    (props: { cx: number; cy: number; x: number; y: number; payload: { value: string } }) => {
      const { cx, cy, x, y, payload } = props;
      const entry = radarData?.find((e) => e.axis === payload.value);
      const dx = x - cx;
      const anchor = Math.abs(dx) < 15 ? "middle" : dx > 0 ? "start" : "end";
      // Shift lines: name always at y, value slightly below
      const nameY = y;
      const valY = y + 16;
      return (
        <g>
          <text x={x} y={nameY} textAnchor={anchor} fill="#6b7280" fontSize={13} fontWeight={600}>
            {payload.value}
          </text>
          {entry && (
            <text x={x} y={valY} textAnchor={anchor} fontSize={12} fontWeight={700}>
              <tspan fill="#2d7a3a">{entry.userRaw}</tspan>
              {activeProfile && (
                <tspan fill="#6b7280"> vs {entry.benchRaw}</tspan>
              )}
            </text>
          )}
        </g>
      );
    },
    [radarData, activeProfile],
  );

  const goalLabel = GOAL_OPTIONS.find((o) => o.value === currentGoal)?.label ?? null;

  const achievedCount = useMemo(() => {
    if (!analytics?.score_trend || !currentGoal) return 0;
    return analytics.score_trend.filter(
      (r) => r.total_score != null && r.total_score <= currentGoal,
    ).length;
  }, [analytics, currentGoal]);

  // Radar card heading
  const benchmarkHeading = useMemo(() => {
    if (radarMode === "peak") return peakInsight ? `You vs. Your Peak Game (avg ${peakInsight.bestAvg.toFixed(1)})` : "Peak Game";
    if (targetHandicap === 0)  return "You vs. Scratch";
    if (targetHandicap === 5)  return "You vs. Break-80 Shape";
    if (targetHandicap === 10) return "You vs. Break-85 Shape";
    if (targetHandicap === 15) return "You vs. Break-90 Shape";
    if (targetHandicap === 20) return "You vs. Break-95 Shape";
    if (targetHandicap === 28) return "You vs. Break-100 Shape";
    return "Your Performance Shape";
  }, [radarMode, targetHandicap, peakInsight]);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">The Lab</h1>
        <p className="text-sm text-gray-400 mt-1">Your blueprint to lower scores.</p>
      </div>

      {/* ── Section 3: Benchmark Analysis ──────────────────────────────── */}
      <div>
        <div className="mb-4">
          <SectionDivider label="Benchmark Analysis" />
        </div>

        {analyticsLoading ? (
          <LoadingSkeleton />
        ) : (
          <BentoCard>
            {/* Main layout: left controls | right chart */}
            <div className="flex gap-5 items-stretch">

              {/* Left panel: mode toggle + peer toggle + legend + notice */}
              <div className="flex flex-col gap-3 w-36 shrink-0">
                <p className="text-sm font-bold text-gray-900 leading-tight">{benchmarkHeading}</p>

                {/* Mode toggle — vertical */}
                <div className="flex flex-col bg-gray-100 rounded-xl p-0.5 gap-0.5">
                  {(["benchmark", "peak"] as const).map((mode) => {
                    const active = radarMode === mode;
                    const disabled = mode === "peak" && !peakInsight;
                    return (
                      <button
                        key={mode}
                        onClick={() => !disabled && setRadarMode(mode)}
                        disabled={disabled}
                        className={`px-2.5 py-1.5 rounded-[10px] text-xs font-semibold transition-all text-left ${
                          active ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600"
                        } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        {mode === "benchmark" ? "Average (L20)" : "Peak Game"}
                      </button>
                    );
                  })}
                </div>

                {/* Peer toggle — vertical, only in benchmark mode */}
                {radarMode === "benchmark" && (
                  <ComparisonTargetToggle value={targetHandicap} onChange={setTargetHandicap} vertical />
                )}

                {/* Legend */}
                <div className="flex flex-col gap-1.5 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#2d7a3a" }} />
                    You
                  </span>
                  {activeProfile && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                      Target shape
                    </span>
                  )}
                </div>

                {missingAxes.length > 0 && (
                  <p className="text-[10px] text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5 leading-relaxed">
                    No {missingAxes.join(", ")} data — log putts & GIR to unlock the full shape.
                  </p>
                )}
              </div>

              {/* Right panel: radar chart */}
              <div className="flex-1 min-w-0">
                {radarData ? (
                  <ResponsiveContainer width="100%" height={420}>
                    <RadarChart data={radarData} outerRadius={155} margin={{ top: 24, right: 44, bottom: 24, left: 44 }}>
                      <PolarGrid stroke="#e5e7eb" />
                      <PolarAngleAxis dataKey="axis" tick={renderTick as never} />
                      <Radar
                        dataKey="value"
                        stroke="#2d7a3a"
                        fill="#2d7a3a"
                        fillOpacity={0.18}
                        strokeWidth={2}
                        dot={{ r: 4, fill: "#2d7a3a", strokeWidth: 0 }}
                        activeDot={{ r: 6, fill: "#2d7a3a", stroke: "white", strokeWidth: 2 }}
                      />
                      {activeProfile && (
                        <Radar
                          dataKey="benchmark"
                          stroke="#9ca3af"
                          fill="#9ca3af"
                          fillOpacity={0.07}
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                          dot={{ r: 3, fill: "#9ca3af", strokeWidth: 0 }}
                        />
                      )}
                      <Tooltip
                        content={<RadarTooltipContent />}
                        wrapperStyle={{ outline: "none" }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-48 text-sm text-gray-400">
                    {currentGoal
                      ? "Play more rounds to build your performance shape."
                      : "Set a target above to see your benchmark comparison."}
                  </div>
                )}
              </div>

            </div>
          </BentoCard>
        )}
      </div>

      {/* ── Section 1: Goal Selector ────────────────────────────────────── */}
      <BentoCard>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Set Your Target</p>
        <div className="flex flex-wrap gap-2">
          {GOAL_OPTIONS.map(({ label, value }) => {
            const active = currentGoal === value;
            return (
              <button
                key={value}
                onClick={() => setGoal(value)}
                disabled={settingGoal}
                className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${
                  active
                    ? "bg-primary text-white shadow-sm"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-100"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </BentoCard>

      {/* ── Goal stats ─────────────────────────────────────────────────── */}
      {currentGoal && goalReport && goalReport.gap != null && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <BentoCard className="flex flex-col items-center justify-center py-5">
              <div className="relative">
                <ProgressRing gap={goalReport.gap} onTrack={goalReport.on_track} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  {goalReport.on_track ? (
                    <>
                      <CheckCircle2 size={24} className="text-emerald-500" />
                      <span className="text-xs font-bold text-emerald-600 mt-0.5">Achieved</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Gap</span>
                      <span className="text-3xl font-black text-gray-900 leading-tight">+{goalReport.gap.toFixed(1)}</span>
                      <span className="text-[10px] text-gray-400">strokes</span>
                    </>
                  )}
                </div>
              </div>
              <p className="text-sm font-bold text-gray-700 mt-2">{goalLabel}</p>
              {goalReport.on_track && <p className="text-xs text-emerald-500 mt-0.5">Averaging below goal</p>}
            </BentoCard>

            <div className="lg:col-span-2 grid grid-cols-2 gap-3">
              {[
                { label: "Scoring Avg", value: goalReport.scoring_average?.toFixed(1) ?? "—", sub: "recent rounds", Icon: BarChart2, good: goalReport.on_track },
                { label: "Best Score", value: goalReport.best_score ?? "—", sub: goalReport.best_score != null && goalReport.best_score <= currentGoal ? "goal achieved ✓" : "personal best", Icon: Trophy, good: goalReport.best_score != null && goalReport.best_score <= currentGoal },
                { label: "Target Score", value: currentGoal, sub: goalLabel ?? "", Icon: Target, good: false },
                { label: "Times Achieved", value: achievedCount === 0 ? "0" : achievedCount, sub: achievedCount === 0 ? "keep going" : achievedCount === 1 ? "once!" : `${achievedCount} rounds`, Icon: CheckCircle2, good: achievedCount > 0 },
              ].map(({ label, value, sub, Icon, good }) => (
                <BentoCard key={label}>
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
                    <Icon size={13} className={good ? "text-emerald-500" : "text-gray-200"} />
                  </div>
                  <p className={`text-2xl font-black leading-none ${good ? "text-emerald-600" : "text-gray-900"}`}>{value}</p>
                  <p className="text-[11px] text-gray-400 mt-1">{sub}</p>
                </BentoCard>
              ))}
            </div>
          </div>

          {analytics?.score_trend && analytics.score_trend.filter((r) => r.total_score != null).length >= 3 && (
            <BentoCard>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Recent Attempts</p>
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    green rounds beat the goal
                  </p>
                </div>
                {achievedCount > 0 && (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                    {achievedCount} under {currentGoal + 1}
                  </span>
                )}
              </div>
              <AttemptsTimeline scores={analytics.score_trend} goal={currentGoal} />
            </BentoCard>
          )}
        </>
      )}

      {/* ── Section 1b: Peak Game Analysis ─────────────────────────────── */}
      {peakInsight && (
        <BentoCard>
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">
            Your Peak Game
          </p>
          <div className="flex items-end gap-4 mb-3">
            <div>
              <span className="text-4xl font-black text-gray-900 tracking-tighter">
                {peakInsight.bestAvg.toFixed(1)}
              </span>
              <span className="text-sm text-gray-400 ml-2">avg · best {peakInsight.top.length} rounds</span>
            </div>
            {peakInsight.overallAvg != null && (
              <div className="pb-1 text-right">
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
                <span className="text-gray-400 truncate max-w-[180px]">
                  {r.course_name ?? `Round ${i + 1}`}
                </span>
                <span className="font-bold text-gray-700 shrink-0 ml-2">{r.total_score}</span>
              </div>
            ))}
          </div>

          {/* Score type breakdown: peak vs average */}
          {peakScoreTypes && (() => {
            // Stroke multipliers: each birdie/bogey = 1 stroke, each double+ ≈ 2 strokes
            const metrics = [
              {
                label: "Birdies",
                peak: peakScoreTypes.peak.birdies,
                avg: peakScoreTypes.all.birdies,
                higherIsBetter: true,
                strokeMult: 1,
                color: "#059669",
              },
              {
                label: "Bogeys",
                peak: peakScoreTypes.peak.bogeys,
                avg: peakScoreTypes.all.bogeys,
                higherIsBetter: false,
                strokeMult: 1,
                color: "#ef4444",
              },
              {
                label: "Doubles+",
                peak: peakScoreTypes.peak.doubles,
                avg: peakScoreTypes.all.doubles,
                higherIsBetter: false,
                strokeMult: 2,
                color: "#60a5fa",
              },
            ];
            return (
              <div className="border-t border-gray-50 pt-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
                  Peak vs. Average
                </p>
                <div className="space-y-3">
                  {metrics.map(({ label, peak, avg, higherIsBetter, strokeMult, color }) => {
                    const diff = peak - avg;
                    const good = higherIsBetter ? diff > 0 : diff < 0;
                    // Strokes gained = good direction × count diff × stroke value
                    const strokeImpact = (higherIsBetter ? diff : -diff) * strokeMult;
                    const maxVal = Math.max(peak, avg, 0.1) * 1.2;
                    const peakPct = (peak / maxVal) * 100;
                    const avgPct = (avg / maxVal) * 100;
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-semibold text-gray-600">{label}</span>
                          <span
                            className="text-[11px] font-bold"
                            style={{ color: good ? "#059669" : strokeImpact === 0 ? "#9ca3af" : "#ef4444" }}
                          >
                            {strokeImpact > 0 ? "+" : ""}{strokeImpact.toFixed(1)} strokes {strokeImpact >= 0 ? "gained" : "lost"}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 w-10 text-right shrink-0">Peak</span>
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${peakPct}%`, backgroundColor: color }} />
                            </div>
                            <span className="text-[11px] font-bold text-gray-700 w-8 shrink-0">{peak.toFixed(1)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 w-10 text-right shrink-0">Avg</span>
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${avgPct}%`, backgroundColor: "#d1d5db" }} />
                            </div>
                            <span className="text-[11px] font-bold text-gray-400 w-8 shrink-0">{avg.toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </BentoCard>
      )}

      {/* ── Section 2: Priority Fixes (top 2 savers) ───────────────────── */}
      {currentGoal && !reportLoading && goalReport && goalReport.savers.length > 0 && (
        <div>
          <SectionDivider label="What's Holding You Back" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {goalReport.savers.slice(0, 2).map((saver, i) => (
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
