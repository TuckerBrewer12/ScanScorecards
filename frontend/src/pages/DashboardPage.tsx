import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { SVGScoreHandicapTrend } from "@/components/dashboard/SVGScoreHandicapTrend";
import { MilestoneFeed } from "@/components/dashboard/MilestoneFeed";
import { MobileDashboard } from "@/components/dashboard/MobileDashboard";
import { api } from "@/lib/api";
import { getStoredColorBlindMode } from "@/lib/accessibility";
import { getColorBlindPalette } from "@/lib/chartPalettes";
import { SCORE_COLORS, SCORE_KEYS, SCORE_LABELS } from "@/lib/colors";
import type { Milestone } from "@/types/golf";
import { RecentRoundsTable } from "@/components/dashboard/RecentRoundsTable";
import { BentoCard } from "@/components/ui/BentoCard";
import { ProfileHeroBanner } from "@/components/dashboard/ProfileHeroBanner";
import { ScanActionCard } from "@/components/dashboard/ScanActionCard";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { BestRoundHighlight } from "@/components/dashboard/BestRoundHighlight";

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.6)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
};




function ShortGameSparkline({ scrambling, upAndDown }: {
  scrambling: { round_index: number; scrambling_percentage: number }[];
  upAndDown: { round_index: number; percentage: number }[];
}) {
  const W = 200; const H = 44; const PAD = 4;
  // Align by round_index — only use rounds present in both
  const udMap = new Map(upAndDown.map((r) => [r.round_index, r.percentage]));
  const paired = scrambling
    .filter((r) => udMap.has(r.round_index))
    .slice(-12);
  if (paired.length < 2) return null;

  const xs = paired.map((_, i) => PAD + (i / (paired.length - 1)) * (W - PAD * 2));
  const toY = (v: number) => H - PAD - ((Math.max(0, Math.min(100, v)) / 100) * (H - PAD * 2));
  const scrPts = paired.map((r, i) => `${xs[i]},${toY(r.scrambling_percentage)}`).join(" ");
  const udPts  = paired.map((r, i) => `${xs[i]},${toY(udMap.get(r.round_index)!)}`).join(" ");

  return (
    <div className="mt-3 px-1">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} overflow="visible">
        <polyline points={scrPts} fill="none" stroke="#f97316" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />
        <polyline points={udPts}  fill="none" stroke="#a855f7" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />
        {/* end dots */}
        <circle cx={xs[xs.length - 1]} cy={toY(paired[paired.length - 1].scrambling_percentage)} r={2.5} fill="#f97316" />
        <circle cx={xs[xs.length - 1]} cy={toY(udMap.get(paired[paired.length - 1].round_index)!)} r={2.5} fill="#a855f7" />
      </svg>
      <div className="flex items-center gap-3 mt-1.5">
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-400" /><span className="text-[9px] text-gray-400">Scr</span></div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-400" /><span className="text-[9px] text-gray-400">U&D</span></div>
      </div>
    </div>
  );
}

function MiniKpi({ label, value, trend }: {
  label: string; value: string | number | null;
  trend?: "up" | "down" | "flat" | null;
}) {
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "down" ? "text-emerald-500" : trend === "up" ? "text-red-400" : "text-gray-300";
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">{label}</div>
        <div className="text-4xl font-semibold tracking-tighter text-gray-900 leading-tight">{value ?? "—"}</div>
      </div>
      {trend && <Icon size={16} className={trendColor} />}
    </div>
  );
}


interface DashboardPageProps {
  userId: string;
}

export function DashboardPage({ userId }: DashboardPageProps) {
  const navigate = useNavigate();
  const { data: fetched, isLoading: loading, error, refetch } = useQuery({
    queryKey: ["dashboard", userId],
    queryFn: async () => {
      const [dashboardResult, analyticsResult] = await Promise.allSettled([
        api.getDashboard(userId),
        api.getAnalytics(userId, { limit: 20, timeframe: "all", courseId: "all" }),
      ]);
      if (dashboardResult.status !== "fulfilled") {
        throw dashboardResult.reason;
      }
      return [
        dashboardResult.value,
        analyticsResult.status === "fulfilled" ? analyticsResult.value : null,
      ] as const;
    },
  });
  const { data: user } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => api.getUser(userId),
  });
  const { data: goalReport } = useQuery({
    queryKey: ["goal-report", userId],
    queryFn: () => api.getGoalReport(userId, 20),
    enabled: !!user?.scoring_goal,
    retry: false,
  });
  const data = fetched?.[0] ?? null;
  const trends = fetched?.[1] ?? null;
  const colorBlindMode = useMemo(() => getStoredColorBlindMode(), []);
  const colorBlindPalette = useMemo(
    () => getColorBlindPalette(colorBlindMode),
    [colorBlindMode],
  );
  const scoreColors = colorBlindPalette?.score ?? SCORE_COLORS;
  const scoreLineColor = colorBlindPalette?.trend.primary ?? "#2d7a3a";
  const handicapLineColor = colorBlindPalette?.trend.secondary ?? "#60a5fa";
  const girColor = colorBlindPalette?.ui.success ?? "#059669";
  const warningColor = colorBlindPalette?.ui.warning ?? "#f59e0b";
  const dangerColor = colorBlindPalette?.ui.danger ?? "#ef4444";
  const gridColor = colorBlindPalette?.ui.grid ?? "#d1d5db";
  const mutedFill = colorBlindPalette?.ui.mutedFill ?? "#f1f5f9";


  const recentMilestones = useMemo<Milestone[]>(() => {
    if (!trends) return [];
    const a = trends.notable_achievements;
    const normalizeDate = (raw: string) => raw.split("T")[0].replace(/-/g, "/");

    const scoreBest = a.round_milestones.lifetime.first_round_under_par
      ? { type: "score_break" as const, label: `First round under par (${a.round_milestones.lifetime.first_round_under_par.score})`, date: normalizeDate(a.round_milestones.lifetime.first_round_under_par.date), course: a.round_milestones.lifetime.first_round_under_par.course }
      : (() => {
          const best = a.round_milestones.lifetime.score_breaks.filter(r => r.achievement != null).reduce<typeof a.round_milestones.lifetime.score_breaks[number] | null>((c, r) => (!c || r.threshold < c.threshold ? r : c), null);
          return best?.achievement ? { type: "score_break" as const, label: `Best score: ${best.threshold} or better`, date: normalizeDate(best.achievement.date), course: best.achievement.course } : null;
        })();

    const puttingBest = (() => {
      const best = a.putting_milestones.lifetime.putt_breaks.filter(r => r.achievement != null).reduce<typeof a.putting_milestones.lifetime.putt_breaks[number] | null>((c, r) => (!c || r.threshold < c.threshold ? r : c), null);
      return best?.achievement ? { type: "putt_break" as const, label: `Fewest putts: ${best.threshold}`, date: normalizeDate(best.achievement.date), course: best.achievement.course } : null;
    })();

    const parStreakEvent = a.best_performance_streaks_events.lifetime.longest_par_streak;
    const parStreak = parStreakEvent ? { type: "par_streak" as const, label: `Par streak: ${a.best_performance_streaks.lifetime.longest_par_streak} in a row`, date: normalizeDate(parStreakEvent.date), course: parStreakEvent.course } : null;

    return ([scoreBest, puttingBest, parStreak] as Array<Milestone | null>)
      .filter((m): m is Milestone => m !== null)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3);
  }, [trends]);

  const dualData = useMemo(() => {
    if (!trends) return [];
    return trends.score_trend.map((row, i) => ({
      ...row,
      handicap_index: trends.handicap_trend[i]?.handicap_index ?? null,
      used_in_hi: trends.handicap_trend[i]?.used_in_hi ?? null,
      differential: trends.handicap_trend[i]?.differential ?? null,
      hi_threshold: trends.handicap_trend[i]?.hi_threshold ?? null,
    }));
  }, [trends]);

  const recentDistribution = useMemo(() => {
    if (!trends) return [];
    const last5 = (trends.score_type_distribution ?? []).slice(-5);
    if (last5.length === 0) return [];
    let total = 0;
    const sums: Record<string, number> = {};
    for (const row of last5) {
      total += row.holes_counted;
      for (const key of SCORE_KEYS) {
        sums[key] = (sums[key] ?? 0) + ((row[key] as number) / 100) * row.holes_counted;
      }
    }
    return SCORE_KEYS.map(key => ({
      name: key,
      label: SCORE_LABELS[key],
      value: total > 0 ? Math.round((sums[key] / total) * 1000) / 10 : 0,
      color: scoreColors[key],
    })).filter(d => d.value > 0);
  }, [trends, scoreColors]);


  const last20ScoringAvg = useMemo(() => {
    const valid = (trends?.score_trend ?? []).filter(r => r.total_score != null);
    if (!valid.length) return null;
    const sum = valid.reduce((s, r) => s + r.total_score!, 0);
    return sum / valid.length;
  }, [trends]);

  const hiTrend = useMemo(() => {
    if (!trends) return null;
    const valid = trends.handicap_trend.filter(r => r.handicap_index != null);
    if (valid.length < 3) return null;
    const diff = valid[0].handicap_index! - valid[valid.length - 1].handicap_index!;
    if (Math.abs(diff) < 0.3) return "flat" as const;
    return diff > 0 ? "down" as const : "up" as const;
  }, [trends]);

  const girPct = useMemo(() => {
    const rows = (trends?.gir_trend ?? []).slice(-5).filter(r => r.total_gir != null && r.holes_played > 0);
    if (!rows.length) return Math.max(0, Math.min(100, trends?.kpis.gir_percentage ?? 0));
    const totalGir = rows.reduce((s, r) => s + (r.total_gir ?? 0), 0);
    const totalHoles = rows.reduce((s, r) => s + r.holes_played, 0);
    return Math.max(0, Math.min(100, (totalGir / totalHoles) * 100));
  }, [trends]);

  const scramblingPct = useMemo(() => {
    const rows = (trends?.scrambling_trend ?? []).slice(-5);
    const opps = rows.reduce((s, r) => s + r.scramble_opportunities, 0);
    const succ = rows.reduce((s, r) => s + r.scramble_successes, 0);
    return opps > 0 ? (succ / opps) * 100 : null;
  }, [trends]);

  const upAndDownPct = useMemo(() => {
    const rows = (trends?.up_and_down_trend ?? []).slice(-5);
    const opps = rows.reduce((s, r) => s + r.opportunities, 0);
    const succ = rows.reduce((s, r) => s + r.successes, 0);
    return opps > 0 ? (succ / opps) * 100 : null;
  }, [trends]);

  const girDonutData = useMemo(() => [{ value: girPct }, { value: 100 - girPct }], [girPct]);

  const putts = useMemo(() => {
    const rows = (trends?.putts_trend ?? []).slice(-5).filter(r => r.total_putts != null && r.holes_played > 0);
    if (!rows.length) return data?.average_putts ?? 36;
    const totalPutts = rows.reduce((s, r) => s + (r.total_putts ?? 0), 0);
    const totalHoles = rows.reduce((s, r) => s + r.holes_played, 0);
    return totalHoles > 0 ? (totalPutts / totalHoles) * 18 : (data?.average_putts ?? 36);
  }, [trends, data?.average_putts]);

  const puttsClamped = useMemo(() => Math.max(20, Math.min(40, putts)), [putts]);
  const puttsGaugeData = useMemo(() => [{ value: puttsClamped - 20 }, { value: 20 }], [puttsClamped]);
  const puttsColor = putts < 30
    ? (colorBlindPalette?.ui.success ?? "#16a34a")
    : putts <= 35 ? warningColor : dangerColor;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="text-sm text-red-500 text-center max-w-md px-4">
          {(error as Error | null)?.message ?? "Dashboard data failed to load."}
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Mobile layout */}
      <div className="md:hidden">
        <MobileDashboard
          data={data}
          trends={trends}
          user={user ?? null}
          goalReport={goalReport ?? null}
          dualData={dualData}
          recentMilestones={recentMilestones}
          last20ScoringAvg={last20ScoringAvg}
          girPct={girPct}
          recentDistribution={recentDistribution}
          scramblingPct={scramblingPct}
          upAndDownPct={upAndDownPct}
          putts={putts}
          scoreLineColor={scoreLineColor}
          handicapLineColor={handicapLineColor}
          girColor={girColor}
          mutedFill={mutedFill}
        />
      </div>

      <div className="hidden md:block pb-12">
        <div className="flex gap-6 max-w-[1400px] mx-auto items-start">
          
          {/* Left Main Content */}
          <div className="flex-1 min-w-0 flex flex-col">
            <ProfileHeroBanner user={user ?? null} handicapIndex={data.handicap_index} />
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 auto-rows-min mt-6">
              
              {/* Highlight Card */}
              <BentoCard className="lg:col-span-3">
                <BestRoundHighlight rounds={data.recent_rounds} />
              </BentoCard>

              {/* 1. KPI Stack */}
              <BentoCard className="lg:col-span-1">
                <div className="flex flex-col gap-5 h-full justify-between">
                  <MiniKpi label="Scoring Avg (L20)" value={last20ScoringAvg != null ? last20ScoringAvg.toFixed(1) : null} trend={hiTrend} />
                  <MiniKpi label="Total Rounds" value={data.total_rounds} />
                </div>
              </BentoCard>

              {/* 2. Hero: Dual-Axis Score + HI Trend */}
              <BentoCard title="Score & Handicap Trend" subtitle="Last 20 rounds" className="md:col-span-2 lg:col-span-2">
                <SVGScoreHandicapTrend
                  data={dualData}
                  scoreColor={scoreLineColor}
                  handicapColor={handicapLineColor}
                  gridColor={gridColor}
                />
              </BentoCard>

              {/* 3. GIR % Radial Donut */}
              <BentoCard title="GIR %" subtitle="Last 5 rounds" className="lg:col-span-1">
                <div className="relative">
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={girDonutData} dataKey="value"
                        innerRadius={50} outerRadius={68} stroke="none"
                        startAngle={90} endAngle={-270}>
                        <Cell fill={girColor} />
                        <Cell fill={mutedFill} />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-4xl font-semibold tracking-tighter text-gray-900">{girPct.toFixed(0)}%</div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">GIR</div>
                  </div>
                </div>
              </BentoCard>

              {/* 4. Scoring Distribution */}
              <BentoCard title="Score Mix" subtitle="Last 5 rounds · % of holes" className="lg:col-span-1 overflow-hidden">
                {recentDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={recentDistribution} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <CartesianGrid stroke={gridColor} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#6b7280", fontWeight: 700 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#6b7280", fontWeight: 700 }} tickLine={false} axisLine={false} unit="%" />
                      <Tooltip contentStyle={tooltipStyle}
                        formatter={(value: number | string | ReadonlyArray<number | string> | undefined) => {
                          const base = Array.isArray(value) ? value[0] : value;
                          const n = typeof base === "number" ? base : Number(base);
                          return [Number.isFinite(n) ? `${n.toFixed(1)}%` : `${String(base ?? "")}%`, ""];
                        }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28}>
                        {recentDistribution.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-sm text-gray-400 text-center py-8">No data yet</div>
                )}
              </BentoCard>

              {/* 5. Short Game */}
              <BentoCard title="Short Game" subtitle="Last 5 rounds" className="lg:col-span-1 !p-3">
                <div className="flex items-center justify-around mt-6">
                  <div className="text-center">
                    <div className="text-4xl font-semibold text-gray-900 tracking-tighter">
                      {scramblingPct != null ? `${scramblingPct.toFixed(0)}%` : "—"}
                    </div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Scrambling</div>
                  </div>
                  <div className="w-px h-8 bg-gray-100" />
                  <div className="text-center">
                    <div className="text-4xl font-semibold text-gray-900 tracking-tighter">
                      {upAndDownPct != null ? `${upAndDownPct.toFixed(0)}%` : "—"}
                    </div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Up & Down</div>
                  </div>
                </div>
                {trends && (
                  <ShortGameSparkline
                    scrambling={trends.scrambling_trend}
                    upAndDown={trends.up_and_down_trend}
                  />
                )}
              </BentoCard>

              {/* 6. Avg Putts Gauge */}
              <BentoCard title="Avg Putts" subtitle="Last 5 rounds" className="lg:col-span-1 !p-3">
                <div className="mx-auto w-full max-w-[260px]">
                  <div className="relative" style={{ height: 120 }}>
                    <ResponsiveContainer width="100%" height={120}>
                      <PieChart>
                        <Pie data={puttsGaugeData} cx="50%" cy="100%"
                          startAngle={180} endAngle={0}
                          innerRadius={52} outerRadius={72}
                          dataKey="value" stroke="none">
                          <Cell fill={puttsColor} />
                          <Cell fill={mutedFill} />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pointer-events-none">
                      <div className="text-2xl font-bold text-gray-900">{putts.toFixed(1)}</div>
                      <div className="text-[9px] text-gray-400 uppercase tracking-wide">Putts</div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-center gap-3 text-[9px] text-gray-300 font-semibold uppercase tracking-wider mt-2">
                  <span style={{ color: girColor }}>{"<30 great"}</span>
                  <span style={{ color: warningColor }}>30-35</span>
                  <span style={{ color: dangerColor }}>35+ work</span>
                </div>
              </BentoCard>

              {/* 7. Recent Milestones */}
              <BentoCard title="Milestones" className="lg:col-span-1 overflow-hidden">
                <MilestoneFeed milestones={recentMilestones} />
              </BentoCard>

              {/* 8. Goal Widget */}
              <BentoCard className="lg:col-span-1 !p-4" interactive onClick={() => navigate("/the-lab")}>
                {user?.scoring_goal && goalReport ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Scoring Goal</div>
                        <div className="text-sm font-bold text-gray-900">
                          Target: Break {user.scoring_goal + 1}
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-primary">Goals →</span>
                    </div>
                    <div className="mb-3">
                      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>Avg {goalReport.scoring_average?.toFixed(1)}</span>
                        <span>Goal {user.scoring_goal + 1}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, Math.max(5, goalReport.on_track ? 100 : goalReport.gap == null ? 5 : (1 - goalReport.gap / Math.max(goalReport.scoring_average ?? 1, 1)) * 100))}%`,
                            background: goalReport.on_track ? "#059669" : "linear-gradient(90deg, #2d7a3a, #9ca3af)",
                          }}
                        />
                      </div>
                    </div>
                    {goalReport.savers[0] && (
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        <span className="font-semibold text-gray-700">Focus: </span>
                        {goalReport.savers[0].headline}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-start justify-center h-full gap-2">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Scoring Goal</div>
                    <p className="text-sm text-gray-500">Set a scoring goal to track your progress.</p>
                    <button
                      onClick={() => navigate("/the-lab")}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Set a goal →
                    </button>
                  </div>
                )}
              </BentoCard>

              {/* Note: Recent Rounds is now in the sidebar */}
              <div className="lg:col-span-3 flex justify-end gap-3 mt-4 lg:hidden">
                  {/* Hide this on xl where sidebar is visible, but we need recent rounds on lg where sidebar breaks */}
                  <Link to="/rounds" className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity shadow-sm">
                    All Rounds
                  </Link>
                  <Link to="/courses" className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors">
                    Browse Courses
                  </Link>
              </div>

            </div>
          </div>

          {/* Right Sidebar (Desktop Asymmetric Layout) */}
          <div className="w-[300px] shrink-0 hidden xl:flex flex-col gap-6 sticky top-20 self-start">
            <ScanActionCard />

            <BentoCard title="Activity" subtitle="Last 30 days" className="!p-4">
              <ActivityHeatmap rounds={data.recent_rounds} />
            </BentoCard>

             <BentoCard className="!px-0 !py-3 overflow-hidden" interactive>
                <div className="px-5 mb-2">
                  <div className="text-sm font-semibold text-gray-800 dark:text-white">Recent Rounds</div>
                </div>
                <div className="max-h-[600px] overflow-y-auto px-4 -mx-1">
                  <RecentRoundsTable rounds={data.recent_rounds.slice(0, 10)} />
                </div>
                <div className="mt-4 px-4 pb-1">
                  <Link to="/rounds" className="w-full flex items-center justify-center px-4 py-2 bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-100 transition-colors">
                    View All Round History
                  </Link>
                </div>
             </BentoCard>

          </div>

        </div>
      </div>
    </div>
  );
}
