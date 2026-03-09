import { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fmt = (v: any, name: any, props: any) => any;
import { api } from "@/lib/api";
import type { AnalyticsData } from "@/types/analytics";
import { PageHeader } from "@/components/layout/PageHeader";

const SCORE_TYPE_COLORS: Record<string, string> = {
  eagle: "#b45309",
  birdie: "#059669",
  par: "#9ca3af",
  bogey: "#f87171",
  double_bogey: "#60a5fa",
  triple_bogey: "#a78bfa",
  quad_bogey: "#6d28d9",
};

const SCORE_TYPE_LABELS: Record<string, string> = {
  eagle: "Eagle+",
  birdie: "Birdie",
  par: "Par",
  bogey: "Bogey",
  double_bogey: "Double",
  triple_bogey: "Triple",
  quad_bogey: "Quad+",
};

function formatHI(hi: number | null | undefined): string | null {
  if (hi == null) return null;
  if (hi < 0) return `+${Math.abs(hi)}`;
  return String(hi);
}

function KPICard({
  label,
  value,
  suffix = "",
  accentClass = "border-l-primary",
}: {
  label: string;
  value: number | string | null | undefined;
  suffix?: string;
  accentClass?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${accentClass} p-5 shadow-sm`}>
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-3xl font-bold text-gray-900">
        {value != null ? `${value}${suffix}` : "—"}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">{children}</h2>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="text-sm font-semibold text-gray-700 mb-4">{title}</div>
      {children}
    </div>
  );
}

const LIMIT_OPTIONS = [20, 50, 100] as const;
type Limit = (typeof LIMIT_OPTIONS)[number];
type AnalyticsView = "round_trends" | "overall_player";

export function AnalyticsPage({ userId }: { userId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState<Limit>(50);
  const [view, setView] = useState<AnalyticsView>("round_trends");

  useEffect(() => {
    setLoading(true);
    api.getAnalytics(userId, limit).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [userId, limit]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading analytics...</div>
      </div>
    );
  }

  if (!data || data.kpis.total_rounds === 0) {
    return (
      <div>
        <PageHeader title="Analytics" subtitle="No rounds yet" />
        <div className="text-gray-400 mt-8">Play some rounds to see your analytics.</div>
      </div>
    );
  }

  const { kpis, score_trend, net_score_trend, gir_trend, putts_trend, scoring_by_par, scoring_by_handicap, gir_vs_non_gir } = data;
  // Filter out rounds with no linked course — they have holes_counted=0 and create blank gaps
  const score_type_distribution = data.score_type_distribution.filter((r) => r.holes_counted > 0);

  return (
    <div>
      <div className="mb-6">
        <PageHeader title="Analytics" subtitle={`${kpis.total_rounds} rounds analyzed`} />
        <div className="flex items-center gap-3">
          <select
            value={view}
            onChange={(e) => setView(e.target.value as AnalyticsView)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Analytics section"
          >
            <option value="round_trends">Round Trends</option>
            <option value="overall_player">Player Stats</option>
          </select>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Last</span>
            {LIMIT_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setLimit(n)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  limit === n
                    ? "bg-primary text-white shadow-sm"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {n}
              </button>
            ))}
            <span className="text-xs text-gray-500">rounds</span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <KPICard label="Handicap Index" value={formatHI(kpis.handicap_index)} accentClass="border-l-primary" />
        <KPICard label="Scoring Average" value={kpis.scoring_average} accentClass="border-l-gray-300" />
        <KPICard label="GIR %" value={kpis.gir_percentage} suffix="%" accentClass="border-l-birdie" />
        <KPICard label="Putts per GIR" value={kpis.putts_per_gir} accentClass="border-l-eagle" />
        <KPICard label="Scrambling %" value={kpis.scrambling_percentage} suffix="%" accentClass="border-l-birdie" />
      </div>

      {view === "round_trends" && (
        <>
          <SectionTitle>Round Trends</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
            <ChartCard title="Score Trend">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={score_trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="round_index" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                    formatter={((v: number) => [v, "Score"]) as Fmt}
                  />
                  <ReferenceLine y={72} stroke="#d1fae5" strokeDasharray="4 2" label={{ value: "Par 72", fontSize: 10, fill: "#059669" }} />
                  <Line type="monotone" dataKey="total_score" stroke="#2d7a3a" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Net Score Trend">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={net_score_trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="netScoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2d7a3a" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#2d7a3a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="round_index" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                    formatter={((v: number, _name: string, props: { payload: { course_handicap: number | null; gross_score: number | null } }) => {
                      const hcp = props.payload.course_handicap;
                      const gross = props.payload.gross_score;
                      const detail = hcp != null && gross != null ? ` (gross ${gross}, HCP ${hcp < 0 ? `+${Math.abs(hcp)}` : hcp})` : "";
                      return [`${v}${detail}`, "Net Score"];
                    }) as Fmt}
                  />
                  <ReferenceLine y={72} stroke="#d1fae5" strokeDasharray="4 2" label={{ value: "Par 72", fontSize: 10, fill: "#059669" }} />
                  <Area type="monotone" dataKey="net_score" stroke="#2d7a3a" strokeWidth={2} fill="url(#netScoreGrad)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="GIR % per Round">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={gir_trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="round_index" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                    formatter={((v: number) => [`${v?.toFixed(1)}%`, "GIR %"]) as Fmt}
                  />
                  <Line type="monotone" dataKey="gir_percentage" stroke="#059669" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Total Putts per Round">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={putts_trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="round_index" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                    formatter={((v: number) => [v, "Putts"]) as Fmt}
                  />
                  <ReferenceLine y={36} stroke="#e5e7eb" strokeDasharray="4 2" label={{ value: "36", fontSize: 10, fill: "#9ca3af" }} />
                  <Line type="monotone" dataKey="total_putts" stroke="#6b7280" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Score Type Distribution (% per Round)">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={score_type_distribution} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="round_index" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                    formatter={((v: number, name: string) => [`${v?.toFixed(1)}%`, SCORE_TYPE_LABELS[name] ?? name]) as Fmt}
                  />
                  {["quad_bogey", "triple_bogey", "double_bogey", "bogey", "par", "birdie", "eagle"].map((key) => (
                    <Area
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stackId="1"
                      stroke={SCORE_TYPE_COLORS[key]}
                      fill={SCORE_TYPE_COLORS[key]}
                      fillOpacity={0.85}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}

      {view === "overall_player" && (
        <>
          <SectionTitle>Player Stats</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
            <ChartCard title="Avg Score to Par by Hole Par">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={scoring_by_par} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="par" tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={false} tickFormatter={(v) => `Par ${v}`} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} tickFormatter={(v) => (v > 0 ? `+${v}` : v)} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                    formatter={((v: number) => [v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2), "Avg to Par"]) as Fmt}
                  />
                  <ReferenceLine y={0} stroke="#e5e7eb" />
                  <Bar dataKey="average_to_par" radius={[4, 4, 0, 0]}>
                    {scoring_by_par.map((row) => (
                      <Cell key={row.par} fill={row.average_to_par <= 0 ? "#059669" : "#f87171"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Avg Score to Par by Hole Difficulty (Hcp 1–18)">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={scoring_by_handicap} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="handicap" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} tickFormatter={(v) => (v > 0 ? `+${v}` : v)} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                    formatter={((v: number, _: unknown, props: { payload: { sample_size: number } }) => [
                      `${v > 0 ? "+" : ""}${v.toFixed(2)} (${props.payload.sample_size} holes)`,
                      "Avg to Par",
                    ]) as Fmt}
                    labelFormatter={(l) => `Handicap ${l} (Hardest → Easiest)`}
                  />
                  <ReferenceLine y={0} stroke="#e5e7eb" />
                  <Bar dataKey="average_to_par" radius={[3, 3, 0, 0]}>
                    {scoring_by_handicap.map((row) => (
                      <Cell key={row.handicap} fill={row.average_to_par <= 0 ? "#059669" : "#f87171"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {gir_vs_non_gir.length > 0 && (
            <>
              <SectionTitle>GIR vs No-GIR Score Distribution</SectionTitle>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-8">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={gir_vs_non_gir} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} unit="%" />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                      formatter={((v: number, name: string) => [`${v?.toFixed(1)}%`, SCORE_TYPE_LABELS[name] ?? name]) as Fmt}
                    />
                    <Legend formatter={(name) => SCORE_TYPE_LABELS[name] ?? name} wrapperStyle={{ fontSize: 12 }} />
                    {["eagle", "birdie", "par", "bogey", "double_bogey", "triple_bogey", "quad_bogey"].map((key) => (
                      <Bar key={key} dataKey={key} stackId="a" fill={SCORE_TYPE_COLORS[key]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
