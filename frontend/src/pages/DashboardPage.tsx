import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Trophy, TrendingDown, Hash, Target, Gauge } from "lucide-react";
import {
  ComposedChart, Area, AreaChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line,
} from "recharts";
import { api } from "@/lib/api";
import type { DashboardData } from "@/types/golf";
import type { AnalyticsData } from "@/types/analytics";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecentRoundsTable } from "@/components/dashboard/RecentRoundsTable";
import { ScrollSection } from "@/components/analytics/ScrollSection";
import { NarrativeInsight } from "@/components/analytics/NarrativeInsight";
import { formatToPar } from "@/types/golf";

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

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3 mb-7">
      <div className="h-px w-8 bg-primary/30 rounded-full" />
      <span className="text-[11px] font-bold text-primary/50 uppercase tracking-[0.18em]">{children}</span>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="text-sm font-semibold text-gray-800 mb-5">{title}</div>
      {children}
    </div>
  );
}

interface DashboardPageProps {
  userId: string;
}

export function DashboardPage({ userId }: DashboardPageProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [trends, setTrends] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getDashboard(userId),
      api.getAnalytics(userId, 20),
    ]).then(([dash, analytics]) => {
      setData(dash);
      setTrends(analytics);
      setLoading(false);
    });
  }, [userId]);

  const scoreTrendWithAvg = useMemo(() => {
    if (!trends) return [];
    return trends.score_trend.map((row, i) => {
      const scores = trends.score_trend
        .slice(0, i + 1)
        .map((r) => r.total_score)
        .filter((s): s is number => s != null);
      const runningAvg =
        scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
          : null;
      return { ...row, running_avg: runningAvg };
    });
  }, [trends]);

  const hiInsight = useMemo(() => {
    if (!trends) return null;
    const valid = trends.handicap_trend.filter((r) => r.handicap_index != null);
    if (valid.length < 3) return null;
    const first = valid[0].handicap_index!;
    const last = valid[valid.length - 1].handicap_index!;
    const diff = first - last; // positive = HI dropped = improving
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Season overview" />

      {/* ╔══════════════════════════════════════════════════════════════════╗ */}
      {/* ║  HERO — stat cards                                              ║ */}
      {/* ╚══════════════════════════════════════════════════════════════════╝ */}
      <ScrollSection>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
          <StatCard label="Handicap Index" value={formatHI(data.handicap_index)} icon={Gauge} highlight />
          <StatCard label="Total Rounds"   value={data.total_rounds}              icon={Hash} />
          <StatCard label="Scoring Avg"    value={data.scoring_average}           icon={TrendingDown} />
          <StatCard
            label="Best Round"
            value={data.best_round}
            icon={Trophy}
            subtitle={data.best_round_course ?? undefined}
          />
          <StatCard label="Avg Putts" value={data.average_putts ?? "—"} icon={Target} />
        </div>

        {hiInsight && (
          <NarrativeInsight
            text={hiInsight.text}
            trend={hiInsight.trend}
            positiveUp={hiInsight.positiveUp}
          />
        )}
      </ScrollSection>

      {/* ╔══════════════════════════════════════════════════════════════════╗ */}
      {/* ║  TRENDS                                                         ║ */}
      {/* ╚══════════════════════════════════════════════════════════════════╝ */}
      {trends && (
        <div className="-mx-8 px-8 py-10 mt-8 bg-gradient-to-b from-[#eef7f0]/70 to-[#f8faf8]">
          <ScrollSection>
            <SectionLabel>Trends</SectionLabel>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              <ChartCard title="Score Trend">
                <ResponsiveContainer width="100%" height={190}>
                  <ComposedChart data={scoreTrendWithAvg} margin={{ top: 4, right: 48, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashScoreGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#2d7a3a" stopOpacity={0.14} />
                        <stop offset="95%" stopColor="#2d7a3a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f1f5f1" horizontal={true} vertical={false} />
                    <XAxis dataKey="round_index" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={((v: number, name: string, props: { payload: { to_par: number | null } }) => {
                        if (name === "running_avg") return [v, "Running Avg"];
                        const tp = props.payload.to_par;
                        const tpStr = tp != null ? ` (${formatToPar(tp)})` : "";
                        return [`${v}${tpStr}`, "Score"];
                      }) as Fmt}
                    />
                    <Area
                      type="monotone"
                      dataKey="total_score"
                      stroke="#2d7a3a"
                      strokeWidth={2}
                      fill="url(#dashScoreGrad)"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="running_avg"
                      stroke="#9ca3af"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                      dot={false}
                      activeDot={false}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      label={((props: any) => {
                        if (props.index !== scoreTrendWithAvg.length - 1 || props.value == null) return <g />;
                        return (
                          <text x={props.x + 6} y={props.y} dy={4} fontSize={10} fill="#9ca3af" textAnchor="start">
                            Avg {props.value}
                          </text>
                        );
                      }) as any}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Handicap Index Trend">
                <ResponsiveContainer width="100%" height={190}>
                  <AreaChart data={trends.handicap_trend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashHiGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#2d7a3a" stopOpacity={0.14} />
                        <stop offset="95%" stopColor="#2d7a3a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f1f5f1" horizontal={true} vertical={false} />
                    <XAxis dataKey="round_index" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#9ca3af" }}
                      tickLine={false}
                      axisLine={false}
                      domain={["auto", "auto"]}
                      reversed
                      tickFormatter={(v: number) => (v < 0 ? `+${Math.abs(v)}` : String(v))}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={((v: number) => [formatHI(v), "Handicap Index"]) as Fmt}
                    />
                    <Area
                      type="monotone"
                      dataKey="handicap_index"
                      stroke="#2d7a3a"
                      strokeWidth={2}
                      fill="url(#dashHiGrad)"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      connectNulls={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

            </div>
          </ScrollSection>
        </div>
      )}

      {/* ╔══════════════════════════════════════════════════════════════════╗ */}
      {/* ║  RECENT ACTIVITY                                                ║ */}
      {/* ╚══════════════════════════════════════════════════════════════════╝ */}
      <div className="-mx-8 px-8 py-10 bg-white">
        <ScrollSection>
          <SectionLabel>Recent Activity</SectionLabel>
          <RecentRoundsTable rounds={data.recent_rounds} />
          <div className="mt-5 flex gap-3">
            <Link
              to="/rounds"
              className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
            >
              View All Rounds
            </Link>
            <Link
              to="/courses"
              className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              Browse Courses
            </Link>
          </div>
        </ScrollSection>
      </div>
    </div>
  );
}
