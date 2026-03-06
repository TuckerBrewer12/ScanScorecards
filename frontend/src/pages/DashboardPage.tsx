import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, TrendingDown, Hash, Target, Gauge } from "lucide-react";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { api } from "@/lib/api";
import type { DashboardData } from "@/types/golf";
import type { AnalyticsData } from "@/types/analytics";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecentRoundsTable } from "@/components/dashboard/RecentRoundsTable";
import { formatToPar } from "@/types/golf";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fmt = (v: any, name: any, props: any) => any;

function formatHI(hi: number | null | undefined): string {
  if (hi == null) return "—";
  if (hi < 0) return `+${Math.abs(hi).toFixed(1)}`;
  return hi.toFixed(1);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  if (!data) return null;

  const scoringAvg = data.scoring_average;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Season overview" />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Handicap Index" value={formatHI(data.handicap_index)} icon={Gauge} highlight />
        <StatCard label="Total Rounds" value={data.total_rounds} icon={Hash} />
        <StatCard label="Scoring Average" value={data.scoring_average} icon={TrendingDown} />
        <StatCard
          label="Best Round"
          value={data.best_round}
          icon={Trophy}
          subtitle={data.best_round_course ?? undefined}
        />
        <StatCard label="Avg Putts" value={data.average_putts ?? "-"} icon={Target} />
      </div>

      {/* Trend Charts */}
      {trends && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
          {/* Score Trend */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="text-sm font-semibold text-gray-700 mb-4">Score Trend</div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trends.score_trend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2d7a3a" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2d7a3a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="round_index" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                  formatter={((v: number, _: unknown, props: { payload: { to_par: number | null } }) => {
                    const tp = props.payload.to_par;
                    const tpStr = tp != null ? ` (${formatToPar(tp)})` : "";
                    return [`${v}${tpStr}`, "Score"];
                  }) as Fmt}
                />
                {scoringAvg != null && (
                  <ReferenceLine y={scoringAvg} stroke="#e5e7eb" strokeDasharray="4 2" label={{ value: `Avg ${scoringAvg}`, fontSize: 10, fill: "#9ca3af", position: "insideTopRight" }} />
                )}
                <Area type="monotone" dataKey="total_score" stroke="#2d7a3a" strokeWidth={2} fill="url(#scoreGrad)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Handicap Index Trend */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="text-sm font-semibold text-gray-700 mb-4">Handicap Index Trend</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trends.handicap_trend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="hiGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2d7a3a" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#2d7a3a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="round_index" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                  domain={["auto", "auto"]}
                  reversed
                  tickFormatter={(v: number) => v < 0 ? `+${Math.abs(v)}` : String(v)}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                  formatter={((v: number) => [formatHI(v), "Handicap Index"]) as Fmt}
                />
                <Line type="monotone" dataKey="handicap_index" stroke="#2d7a3a" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent Rounds */}
      <RecentRoundsTable rounds={data.recent_rounds} />

      <div className="mt-4 flex gap-3">
        <Link
          to="/rounds"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          View All Rounds
        </Link>
        <Link
          to="/courses"
          className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Browse Courses
        </Link>
      </div>
    </div>
  );
}
