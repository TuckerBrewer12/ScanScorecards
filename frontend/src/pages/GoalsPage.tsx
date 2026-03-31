import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Target, Trophy, CheckCircle2, TrendingDown, BarChart2 } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { GoalSaverCard } from "@/components/goals/GoalSaverCard";
import { BentoCard } from "@/components/ui/BentoCard";
import type { AnalyticsFilters } from "@/types/analytics";

const GOAL_OPTIONS = [
  { label: "Break 100", value: 99 },
  { label: "Break 95",  value: 94 },
  { label: "Break 90",  value: 89 },
  { label: "Break 85",  value: 84 },
  { label: "Break 80",  value: 79 },
  { label: "Break 75",  value: 74 },
  { label: "Break 72",  value: 71 },
] as const;

const ANALYTICS_FILTERS: AnalyticsFilters = { limit: 50, timeframe: "all", courseId: "all" };

interface GoalsPageProps {
  userId: string;
}

function ProgressRing({ gap, onTrack }: { gap: number; onTrack: boolean }) {
  const r = 54;
  const strokeW = 9;
  const size = 148;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const progress = onTrack ? 1 : Math.max(0.04, 1 - gap / 16);
  const offset = circ * (1 - progress);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeW} />
      <motion.circle
        cx={c} cy={c} r={r}
        fill="none"
        stroke={onTrack ? "#059669" : "#2d7a3a"}
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: "easeOut", delay: 0.15 }}
        transform={`rotate(-90 ${c} ${c})`}
      />
    </svg>
  );
}

function AttemptsTimeline({
  scores,
  goal,
}: {
  scores: { total_score: number | null; round_index: number }[];
  goal: number;
}) {
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
      {/* goal line */}
      <line x1={PX} y1={goalY} x2={W - PX - 28} y2={goalY}
        stroke="#2d7a3a" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.4} />
      <text x={W - PX - 24} y={goalY + 4} fontSize={9} fill="#2d7a3a" opacity={0.55} fontWeight="600">Goal</text>

      {/* connector */}
      <polyline
        points={valid.map((r, i) => `${toX(i)},${toY(r.total_score!)}`).join(" ")}
        fill="none" stroke="#e5e7eb" strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round"
      />

      {/* dots */}
      {valid.map((r, i) => {
        const beat = r.total_score! <= goal;
        return (
          <motion.circle
            key={i}
            cx={toX(i)} cy={toY(r.total_score!)}
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

export function GoalsPage({ userId }: GoalsPageProps) {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => api.getUser(userId),
  });

  const currentGoal = user?.scoring_goal ?? null;

  const { data: goalReport, isLoading: reportLoading } = useQuery({
    queryKey: ["goal-report", userId],
    queryFn: () => api.getGoalReport(userId, 50),
    enabled: !!currentGoal,
    retry: false,
  });

  const { data: analytics } = useQuery({
    queryKey: ["analytics", userId, ANALYTICS_FILTERS],
    queryFn: () => api.getAnalytics(userId, ANALYTICS_FILTERS),
    enabled: !!currentGoal,
  });

  const { mutate: setGoal, isPending: settingGoal } = useMutation({
    mutationFn: (value: number) => api.updateUser(userId, { scoring_goal: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", userId] });
      queryClient.invalidateQueries({ queryKey: ["goal-report", userId] });
    },
  });

  const goalLabel = currentGoal != null ? `Break ${currentGoal + 1}` : null;

  const achievedCount = useMemo(() => {
    if (!analytics?.score_trend || !currentGoal) return 0;
    return analytics.score_trend.filter(
      (r) => r.total_score != null && r.total_score <= currentGoal,
    ).length;
  }, [analytics, currentGoal]);

  return (
    <div className="space-y-5">
      <PageHeader title="Goals" />

      {/* ── Goal selector ─────────────────────────────────────────────── */}
      <BentoCard>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Your Target</p>
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

      {/* ── No goal set ───────────────────────────────────────────────── */}
      {!currentGoal && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Target size={26} className="text-primary" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Pick a target above</h2>
          <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
            We'll rank your highest-ROI improvements and track every attempt to get you there.
          </p>
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────────── */}
      {currentGoal && reportLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          Loading your goal report…
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────────── */}
      {currentGoal && goalReport && (
        <>
          {/* Hero row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Progress ring */}
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
                      <span className="text-3xl font-black text-gray-900 leading-tight">
                        +{goalReport.gap.toFixed(1)}
                      </span>
                      <span className="text-[10px] text-gray-400">strokes</span>
                    </>
                  )}
                </div>
              </div>
              <p className="text-sm font-bold text-gray-700 mt-2">{goalLabel}</p>
              {goalReport.on_track && (
                <p className="text-xs text-emerald-500 mt-0.5">Averaging below goal</p>
              )}
            </BentoCard>

            {/* Stats */}
            <div className="lg:col-span-2 grid grid-cols-2 gap-3">
              {[
                {
                  label: "Scoring Avg",
                  value: goalReport.scoring_average?.toFixed(1) ?? "—",
                  sub: "recent rounds",
                  Icon: BarChart2,
                  good: goalReport.on_track,
                },
                {
                  label: "Best Score",
                  value: goalReport.best_score ?? "—",
                  sub: goalReport.best_score != null && goalReport.best_score <= currentGoal
                    ? "goal achieved ✓"
                    : "personal best",
                  Icon: Trophy,
                  good: goalReport.best_score != null && goalReport.best_score <= currentGoal,
                },
                {
                  label: "Target Score",
                  value: currentGoal,
                  sub: goalLabel ?? "",
                  Icon: Target,
                  good: false,
                },
                {
                  label: "Times Achieved",
                  value: achievedCount === 0 ? "0" : achievedCount,
                  sub: achievedCount === 0 ? "keep going" : achievedCount === 1 ? "once!" : `${achievedCount} rounds`,
                  Icon: CheckCircle2,
                  good: achievedCount > 0,
                },
              ].map(({ label, value, sub, Icon, good }) => (
                <BentoCard key={label}>
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
                    <Icon size={13} className={good ? "text-emerald-500" : "text-gray-200"} />
                  </div>
                  <p className={`text-2xl font-black leading-none ${good ? "text-emerald-600" : "text-gray-900"}`}>
                    {value}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">{sub}</p>
                </BentoCard>
              ))}
            </div>
          </div>

          {/* Attempts timeline */}
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

          {/* Action plan */}
          {goalReport.savers.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[11px] font-bold text-primary uppercase tracking-[0.18em] whitespace-nowrap">
                  Action Plan
                </span>
                <div className="h-px flex-1 bg-primary/15 rounded-full" />
                <span className="text-xs text-gray-400 shrink-0">ranked by impact</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {goalReport.savers.map((saver, i) => (
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
        </>
      )}
    </div>
  );
}
