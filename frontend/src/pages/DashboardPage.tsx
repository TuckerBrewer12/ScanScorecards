import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import {
  ComposedChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { api } from "@/lib/api";
import { getStoredColorBlindMode } from "@/lib/accessibility";
import { getColorBlindPalette } from "@/lib/chartPalettes";
import type { DashboardData, Milestone } from "@/types/golf";
import type { AnalyticsData } from "@/types/analytics";
import { RecentRoundsTable } from "@/components/dashboard/RecentRoundsTable";
import { MilestoneFeed } from "@/components/dashboard/MilestoneFeed";
import { ScrollSection } from "@/components/analytics/ScrollSection";
import { NarrativeInsight } from "@/components/analytics/NarrativeInsight";
import { BentoCard } from "@/components/ui/BentoCard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fmt = (v: any, name: any, props: any) => any;

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 12,
  border: "1px solid #f1f5f9",
  boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
  background: "rgba(255,255,255,0.97)",
};

function formatHI(hi: number | null | undefined): string {
  if (hi == null) return "—";
  if (hi < 0) return `+${Math.abs(hi).toFixed(1)}`;
  return hi.toFixed(1);
}

const SCORE_COLORS: Record<string, string> = {
  eagle: "#b45309",
  birdie: "#059669",
  par: "#9ca3af",
  bogey: "#f87171",
  double_bogey: "#60a5fa",
  triple_bogey: "#a78bfa",
  quad_bogey: "#6d28d9",
};
const SCORE_KEYS = ["eagle", "birdie", "par", "bogey", "double_bogey", "triple_bogey", "quad_bogey"] as const;

const SCORE_LABELS: Record<string, string> = {
  eagle: "Eagle+", birdie: "Birdie", par: "Par",
  bogey: "Bogey", double_bogey: "Double", triple_bogey: "Triple", quad_bogey: "Quad+",
};

function getScoreDotColor(toPar: number | null, scoreLineColor: string): string {
  if (toPar == null) return scoreLineColor;
  if (toPar <= -2) return "#b45309";   // eagle+
  if (toPar === -1) return "#059669";  // birdie
  if (toPar === 0)  return "#9ca3af";  // par
  return "#ef4444";                    // bogey+
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
        <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">{label}</div>
        <div className="text-2xl font-bold text-gray-900 leading-tight">{value ?? "—"}</div>
      </div>
      {trend && <Icon size={16} className={trendColor} />}
    </div>
  );
}


interface DashboardPageProps {
  userId: string;
}

export function DashboardPage({ userId }: DashboardPageProps) {
  const { data: fetched, isLoading: loading } = useQuery({
    queryKey: ["dashboard", userId],
    queryFn: () => Promise.all([api.getDashboard(userId), api.getAnalytics(userId, 20)]),
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
  const gridColor = colorBlindPalette?.ui.grid ?? "#f1f5f1";
  const mutedFill = colorBlindPalette?.ui.mutedFill ?? "#f1f5f9";

  const recentMilestones = useMemo<Milestone[]>(() => {
    if (!trends) return [];
    const a = trends.notable_achievements;
    const normalizeDate = (raw: string) => {
      const d = raw.split("T")[0];
      return d.replace(/-/g, "/");
    };

    const scoreBest = a.round_milestones.lifetime.first_round_under_par
      ? {
          type: "score_break" as const,
          label: `First round under par (${a.round_milestones.lifetime.first_round_under_par.score})`,
          date: normalizeDate(a.round_milestones.lifetime.first_round_under_par.date),
          course: a.round_milestones.lifetime.first_round_under_par.course,
        }
      : (() => {
          const best = a.round_milestones.lifetime.score_breaks
            .filter((row) => row.achievement != null)
            .reduce<typeof a.round_milestones.lifetime.score_breaks[number] | null>(
              (curr, row) => (!curr || row.threshold < curr.threshold ? row : curr),
              null
            );
          if (!best?.achievement) return null;
          return {
            type: "score_break" as const,
            label: `Best scoring milestone: ${best.threshold} or better`,
            date: normalizeDate(best.achievement.date),
            course: best.achievement.course,
          };
        })();

    const puttingBest = (() => {
      const best = a.putting_milestones.lifetime.putt_breaks
        .filter((row) => row.achievement != null)
        .reduce<typeof a.putting_milestones.lifetime.putt_breaks[number] | null>(
          (curr, row) => (!curr || row.threshold < curr.threshold ? row : curr),
          null
        );
      if (!best?.achievement) return null;
      return {
        type: "putt_break" as const,
        label: `Best putting milestone: ${best.threshold} putts or fewer`,
        date: normalizeDate(best.achievement.date),
        course: best.achievement.course,
      };
    })();

    const girBest = (() => {
      const best = a.gir_milestones.lifetime.gir_breaks
        .filter((row) => row.achievement != null)
        .reduce<typeof a.gir_milestones.lifetime.gir_breaks[number] | null>(
          (curr, row) => (!curr || row.threshold > curr.threshold ? row : curr),
          null
        );
      if (!best?.achievement) return null;
      return {
        type: "gir_break" as const,
        label: `Best GIR milestone: ${best.threshold}/18 GIR`,
        date: normalizeDate(best.achievement.date),
        course: best.achievement.course,
      };
    })();

    const parStreakEvent = a.best_performance_streaks_events.lifetime.longest_par_streak;
    const parStreakCount = a.best_performance_streaks.lifetime.longest_par_streak;
    const parStreak = parStreakEvent
      ? {
          type: "par_streak" as const,
          label: `Longest par-or-better streak milestone: ${parStreakCount} in a row`,
          date: normalizeDate(parStreakEvent.date),
          course: parStreakEvent.course,
        }
      : null;

    const birdieStreakEvent = a.best_performance_streaks_events.lifetime.longest_birdie_streak;
    const birdieStreakCount = a.best_performance_streaks.lifetime.longest_birdie_streak;
    const birdieStreak = birdieStreakEvent
      ? {
          type: "birdie_streak" as const,
          label: `Longest birdie streak milestone: ${birdieStreakCount} in a row`,
          date: normalizeDate(birdieStreakEvent.date),
          course: birdieStreakEvent.course,
        }
      : null;

    const milestoneItems: Array<Milestone | null> = [scoreBest, puttingBest, girBest, parStreak, birdieStreak];
    return milestoneItems
      .filter((m): m is Milestone => m !== null)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [trends]);

  const dualData = useMemo(() => {
    if (!trends) return [];
    return trends.score_trend.map((row, i) => ({
      ...row,
      handicap_index: trends.handicap_trend[i]?.handicap_index ?? null,
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

  const hiInsight = useMemo(() => {
    if (!trends) return null;
    const valid = trends.handicap_trend.filter((r) => r.handicap_index != null);
    if (valid.length < 3) return null;
    const first = valid[0].handicap_index!;
    const last = valid[valid.length - 1].handicap_index!;
    const diff = first - last;
    if (Math.abs(diff) < 0.3) return null;
    return {
      text:
        diff > 0
          ? `Your handicap index has dropped ${Math.abs(diff).toFixed(1)} points over your last 20 rounds.`
          : `Your handicap index has risen ${Math.abs(diff).toFixed(1)} points recently — form worth watching.`,
      trend: (diff > 0 ? "down" : "up") as "down" | "up",
      positiveUp: false,
    };
  }, [trends]);

  const hiTrend = useMemo(() => {
    if (!trends) return null;
    const valid = trends.handicap_trend.filter(r => r.handicap_index != null);
    if (valid.length < 3) return null;
    const diff = valid[0].handicap_index! - valid[valid.length - 1].handicap_index!;
    if (Math.abs(diff) < 0.3) return "flat" as const;
    return diff > 0 ? "down" as const : "up" as const;
  }, [trends]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  if (!data) return null;

  const scramblingPct = trends?.kpis.scrambling_percentage ?? null;
  const upAndDownPct = trends?.kpis.up_and_down_percentage ?? null;

  const girPct = Math.max(0, Math.min(100, trends?.kpis.gir_percentage ?? 0));
  const girDonutData = [{ value: girPct }, { value: 100 - girPct }];

  const putts = data.average_putts ?? 36;
  const puttsClamped = Math.max(20, Math.min(40, putts));
  const puttsGaugeData = [{ value: puttsClamped - 20 }, { value: 20 }];
  const puttsColor = putts < 30
    ? (colorBlindPalette?.ui.success ?? "#16a34a")
    : putts <= 35 ? warningColor : dangerColor;

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Good morning, Golfer</h1>
          <p className="text-sm text-gray-400 mt-0.5">Recent form</p>
        </div>
        <div className="flex items-center gap-2 bg-primary/8 rounded-full px-4 py-1.5">
          <span className="text-xs font-bold text-primary uppercase tracking-widest">HI</span>
          <span className="text-sm font-black text-primary">{formatHI(data?.handicap_index)}</span>
        </div>
      </div>

      <ScrollSection>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 auto-rows-min mt-4">

          {/* 1. KPI Stack */}
          <BentoCard className="lg:col-span-1">
            <div className="flex flex-col gap-5 h-full justify-between">
              <div className="pb-4 border-b border-gray-100">
                <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-1">Handicap Index</div>
                <div className="text-4xl font-black text-primary">{formatHI(data.handicap_index)}</div>
              </div>
              <MiniKpi label="Scoring Avg" value={data.scoring_average} trend={hiTrend} />
              <MiniKpi label="Total Rounds" value={data.total_rounds} />
            </div>
          </BentoCard>

          {/* 2. Hero: Dual-Axis Score + HI Trend */}
          <BentoCard title="Score & Handicap Trend" subtitle="Last 20 rounds" className="md:col-span-2 lg:col-span-2">
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={dualData} margin={{ top: 4, right: 40, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="bentoScoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={scoreLineColor} stopOpacity={0.14} />
                    <stop offset="95%" stopColor={scoreLineColor} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="bentoHiGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={handicapLineColor} stopOpacity={0.10} />
                    <stop offset="95%" stopColor={handicapLineColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridColor} horizontal vertical={false} />
                <XAxis dataKey="round_index" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="score" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                <YAxis yAxisId="hi" orientation="right" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false}
                  domain={["auto", "auto"]} tickFormatter={(v: number) => formatHI(v)} />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={((v: number, name: string) => [
                    name === "handicap_index" ? formatHI(v) : v,
                    name === "handicap_index" ? "HI" : "Score",
                  ]) as Fmt}
                />
                <Area yAxisId="score" type="monotone" dataKey="total_score"
                  stroke={scoreLineColor} strokeWidth={2} fill="url(#bentoScoreGrad)"
                  activeDot={{ r: 5, strokeWidth: 0 }}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (!payload.total_score) return <g key={props.key} />;
                    const color = getScoreDotColor(payload.to_par, scoreLineColor);
                    return <circle key={props.key} cx={cx} cy={cy} r={3.5} fill={color} stroke="white" strokeWidth={1.5} />;
                  }}
                  label={(props: any) => {
                    const { x, y, value } = props;
                    if (!value) return <g key={props.key} />;
                    return <text key={props.key} x={x} y={y - 8} textAnchor="middle" fontSize={9} fill="#9ca3af" fontWeight="600">{value}</text>;
                  }}
                />
                <Area yAxisId="hi" type="monotone" dataKey="handicap_index"
                  stroke={handicapLineColor} strokeWidth={1.5} fill="url(#bentoHiGrad)"
                  dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </BentoCard>

          {/* 3. GIR % Radial Donut */}
          <BentoCard title="GIR %" subtitle="Last 20 rounds" className="lg:col-span-1">
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
                <div className="text-2xl font-bold text-gray-900">{girPct.toFixed(0)}%</div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">GIR</div>
              </div>
            </div>
            <div className="text-center text-xs text-gray-400 mt-1">
              Tour avg ≈ 67%
            </div>
          </BentoCard>

          {/* 4. Scoring Distribution — tall, row-span-2 */}
          <BentoCard title="Score Mix" subtitle="Last 5 rounds · % of holes" className="lg:col-span-1 lg:row-span-2 overflow-hidden">
            {recentDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={recentDistribution} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke={gridColor} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={((v: number, _: unknown, props: any) => [`${v.toFixed(1)}%`, props.payload.label]) as Fmt}
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
          <BentoCard title="Short Game" subtitle="Last 20 rounds" className="lg:col-span-1 !p-3">
            <div className="flex items-center justify-around">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900 tracking-tighter">
                  {scramblingPct != null ? `${scramblingPct.toFixed(0)}%` : "—"}
                </div>
                <div className="text-[10px] font-medium text-gray-500 uppercase mt-0.5">Scrambling</div>
              </div>
              <div className="w-px h-6 bg-gray-100" />
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900 tracking-tighter">
                  {upAndDownPct != null ? `${upAndDownPct.toFixed(0)}%` : "—"}
                </div>
                <div className="text-[10px] font-medium text-gray-500 uppercase mt-0.5">Up & Down</div>
              </div>
            </div>
          </BentoCard>

          {/* 6. Avg Putts Gauge */}
          <BentoCard title="Avg Putts" subtitle="Per round" className="lg:col-span-1 !p-3">
            <div className="mx-auto w-full max-w-[260px]">
              <div className="relative" style={{ height: 72 }}>
                <ResponsiveContainer width="100%" height={72}>
                  <PieChart>
                    <Pie data={puttsGaugeData} cx="50%" cy="100%"
                      startAngle={180} endAngle={0}
                      innerRadius={30} outerRadius={42}
                      dataKey="value" stroke="none">
                      <Cell fill={puttsColor} />
                      <Cell fill={mutedFill} />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pointer-events-none">
                  <div className="text-sm font-bold text-gray-900">{data.average_putts?.toFixed(1) ?? "—"}</div>
                  <div className="text-[8px] text-gray-400 uppercase tracking-wide">Putts</div>
                </div>
              </div>
            </div>
            <div className="flex justify-center gap-3 text-[9px] text-gray-300 font-semibold uppercase tracking-wider mt-1">
              <span style={{ color: girColor }}>{"<30 great"}</span>
              <span style={{ color: warningColor }}>30-35</span>
              <span style={{ color: dangerColor }}>35+ work</span>
            </div>
          </BentoCard>

          {/* 7. Right Sidebar — row-span-2 */}
          <div className="lg:col-span-1 lg:row-span-2 flex flex-col gap-4">
            <BentoCard title="Recent Milestones" className="overflow-hidden flex-1">
              <MilestoneFeed milestones={recentMilestones} />
            </BentoCard>
            {hiInsight && (
              <BentoCard title="Caddie Insight">
                <NarrativeInsight text={hiInsight.text} trend={hiInsight.trend} positiveUp={hiInsight.positiveUp} />
              </BentoCard>
            )}
          </div>

          {/* 8. Recent Rounds — cols 2–3 of last row */}
          <BentoCard title="Recent Rounds" className="md:col-span-2 lg:col-span-2 overflow-hidden">
            <RecentRoundsTable rounds={data.recent_rounds.slice(0, 2)} />
            <div className="mt-4 flex gap-3">
              <Link to="/rounds" className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity shadow-sm">
                All Rounds
              </Link>
              <Link to="/courses" className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors">
                Browse Courses
              </Link>
            </div>
          </BentoCard>

        </div>
      </ScrollSection>
    </div>
  );
}
