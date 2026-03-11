import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import {
  ComposedChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { api } from "@/lib/api";
import type { DashboardData, Milestone } from "@/types/golf";
import type { AnalyticsData } from "@/types/analytics";
import { PageHeader } from "@/components/layout/PageHeader";
import { RecentRoundsTable } from "@/components/dashboard/RecentRoundsTable";
import { MilestoneFeed } from "@/components/dashboard/MilestoneFeed";
import { ScrollSection } from "@/components/analytics/ScrollSection";
import { NarrativeInsight } from "@/components/analytics/NarrativeInsight";

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

function BentoCard({ title, subtitle, children, className }: {
  title?: string; subtitle?: string;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-gray-200/50 ${className ?? ""}`}>
      {title && (
        <div className="mb-3">
          <div className="text-sm font-semibold text-gray-800">{title}</div>
          {subtitle && <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>}
        </div>
      )}
      {children}
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
        <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">{label}</div>
        <div className="text-2xl font-bold text-gray-900 leading-tight">{value ?? "—"}</div>
      </div>
      {trend && <Icon size={16} className={trendColor} />}
    </div>
  );
}

function ActivityCalendar({ rounds }: { rounds: { date: string | null }[] }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDOW = new Date(year, month, 1).getDay();

  const playedDays = new Set(
    rounds
      .filter(r => r.date)
      .map(r => {
        const d = new Date(r.date!);
        return d.getFullYear() === year && d.getMonth() === month ? d.getDate() : null;
      })
      .filter(Boolean) as number[]
  );

  const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const cells = [...Array(firstDOW).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div>
      <div className="text-xs font-semibold text-gray-500 mb-3">{MONTH_NAMES[month]} {year}</div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-[9px] font-bold text-gray-300 uppercase">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => (
          <div key={i} className={`aspect-square rounded-lg flex items-center justify-center text-[10px] font-medium transition-colors ${
            day == null ? "" :
            playedDays.has(day)
              ? "bg-primary text-white shadow-sm shadow-primary/30"
              : "text-gray-400 hover:bg-gray-50"
          }`}>
            {day}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="w-3 h-3 rounded-sm bg-primary" />
        <span className="text-[10px] text-gray-400">Round played ({rounds.length} this period)</span>
      </div>
    </div>
  );
}

interface DashboardPageProps {
  userId: string;
}

export function DashboardPage({ userId }: DashboardPageProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [trends, setTrends] = useState<AnalyticsData | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getDashboard(userId),
      api.getAnalytics(userId, 20),
      api.getMilestones(userId, 12),
    ]).then(([dash, analytics, ms]) => {
      setData(dash);
      setTrends(analytics);
      setMilestones(ms.milestones);
      setLoading(false);
    });
  }, [userId]);

  const dualData = useMemo(() => {
    if (!trends) return [];
    return trends.score_trend.map((row, i) => ({
      ...row,
      handicap_index: trends.handicap_trend[i]?.handicap_index ?? null,
    }));
  }, [trends]);

  const recentMix = useMemo(() => {
    if (!trends) return [];
    return (trends.score_type_distribution ?? []).slice(-5);
  }, [trends]);

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

  const girPct = Math.max(0, Math.min(100, trends?.kpis.gir_percentage ?? 0));
  const girDonutData = [{ value: girPct }, { value: 100 - girPct }];

  const putts = data.average_putts ?? 36;
  const puttsClamped = Math.max(20, Math.min(40, putts));
  const puttsGaugeData = [{ value: puttsClamped - 20 }, { value: 20 }];
  const puttsColor = putts < 30 ? "#16a34a" : putts <= 35 ? "#f59e0b" : "#ef4444";

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Recent form" />

      <ScrollSection>
        <div className="space-y-4 mt-4">

          {/* ── Zone 1: KPI stack | Hero dual trend | GIR radial ─────────── */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

            {/* KPI Stack */}
            <BentoCard>
              <div className="flex flex-col gap-5 h-full justify-between">
                <div className="pb-4 border-b border-gray-100">
                  <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-1">Handicap Index</div>
                  <div className="text-4xl font-black text-primary">{formatHI(data.handicap_index)}</div>
                </div>
                <MiniKpi label="Scoring Avg" value={data.scoring_average} trend={hiTrend} />
                <MiniKpi label="Avg Putts" value={data.average_putts} />
                <MiniKpi label="Total Rounds" value={data.total_rounds} />
              </div>
            </BentoCard>

            {/* Hero: Dual-Axis Score + HI Trend */}
            <BentoCard title="Score & Handicap Trend" subtitle="Last 20 rounds" className="md:col-span-2">
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={dualData} margin={{ top: 4, right: 40, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bentoScoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2d7a3a" stopOpacity={0.14} />
                      <stop offset="95%" stopColor="#2d7a3a" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="bentoHiGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.10} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f1" horizontal vertical={false} />
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
                    stroke="#2d7a3a" strokeWidth={2} fill="url(#bentoScoreGrad)"
                    dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  <Area yAxisId="hi" type="monotone" dataKey="handicap_index"
                    stroke="#60a5fa" strokeWidth={1.5} fill="url(#bentoHiGrad)"
                    dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
              {hiInsight && (
                <div className="mt-3">
                  <NarrativeInsight text={hiInsight.text} trend={hiInsight.trend} positiveUp={hiInsight.positiveUp} />
                </div>
              )}
            </BentoCard>

            {/* GIR % Radial Donut */}
            <BentoCard title="GIR %" subtitle="Last 20 rounds">
              <div className="relative">
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={girDonutData} dataKey="value"
                      innerRadius={50} outerRadius={68} stroke="none"
                      startAngle={90} endAngle={-270}>
                      <Cell fill="#059669" />
                      <Cell fill="#f1f5f9" />
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

          </div>

          {/* ── Zone 2: Calendar | Score Breakdown | Putts Gauge ─────────── */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

            {/* Activity Calendar */}
            <BentoCard title="This Month" className="md:col-span-2">
              <ActivityCalendar rounds={data.recent_rounds} />
            </BentoCard>

            {/* Stacked Horizontal Score Mix — last 5 rounds */}
            <BentoCard title="Recent Form" subtitle="Score mix, last 5 rounds">
              {recentMix.length > 0 ? (
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={recentMix} layout="vertical" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis type="number" domain={[0, 100]} tick={false} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="round_index"
                      tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} width={24} />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={((v: number, name: string) => [`${v.toFixed(0)}%`, name.replace("_", " ")]) as Fmt}
                    />
                    {SCORE_KEYS.map((key) => (
                      <Bar key={key} dataKey={key} stackId="a" fill={SCORE_COLORS[key]}
                        radius={key === "eagle" ? [4, 4, 0, 0] : key === "quad_bogey" ? [0, 0, 4, 4] : [0, 0, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-sm text-gray-400 text-center py-8">No data yet</div>
              )}
            </BentoCard>

            {/* Putts Gauge */}
            <BentoCard title="Avg Putts" subtitle="Per round">
              <div className="relative" style={{ height: 140 }}>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={puttsGaugeData} cx="50%" cy="100%"
                      startAngle={180} endAngle={0}
                      innerRadius={55} outerRadius={72}
                      dataKey="value" stroke="none">
                      <Cell fill={puttsColor} />
                      <Cell fill="#f1f5f9" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute bottom-2 left-0 right-0 flex flex-col items-center pointer-events-none">
                  <div className="text-2xl font-bold text-gray-900">{data.average_putts?.toFixed(1) ?? "—"}</div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide">Putts</div>
                </div>
              </div>
              <div className="flex justify-between text-[9px] text-gray-300 font-semibold uppercase tracking-wider mt-1 px-1">
                <span className="text-emerald-400">{"<30 great"}</span>
                <span className="text-amber-400">30-35</span>
                <span className="text-red-400">35+ work</span>
              </div>
            </BentoCard>

          </div>

          {/* ── Zone 3: Recent Rounds + Milestones ───────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

            <BentoCard title="Recent Rounds" className="md:col-span-3">
              <RecentRoundsTable rounds={data.recent_rounds} />
              <div className="mt-4 flex gap-3">
                <Link to="/rounds" className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity shadow-sm">
                  All Rounds
                </Link>
                <Link to="/courses" className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors">
                  Browse Courses
                </Link>
              </div>
            </BentoCard>

            <BentoCard title="Milestones">
              <MilestoneFeed milestones={milestones} />
            </BentoCard>

          </div>

        </div>
      </ScrollSection>
    </div>
  );
}
