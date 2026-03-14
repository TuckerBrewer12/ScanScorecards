// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fmt = (v: any, name: any, props: any) => any;

import { useEffect, useState, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell, Legend,
  ComposedChart, ReferenceArea, Line,
} from "recharts";
import { Gauge, Hash, TrendingDown, Trophy, Target } from "lucide-react";
import { api } from "@/lib/api";
import type {
  AnalyticsData, ScoreTrendRow, ScoreTypeRow, GIRTrendRow, ScoringByParRow, PuttsTrendRow,
} from "@/types/analytics";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { ScrollSection } from "@/components/analytics/ScrollSection";
import { NarrativeInsight } from "@/components/analytics/NarrativeInsight";
import { StickyScoreBar } from "@/components/analytics/StickyScoreBar";
import { BestRoundCard } from "@/components/analytics/BestRoundCard";

// ─── Constants ───────────────────────────────────────────────────────────────

const SCORE_COLORS: Record<string, string> = {
  eagle:        "#f59e0b",
  birdie:       "#059669",
  par:          "#9ca3af",
  bogey:        "#f87171",
  double_bogey: "#60a5fa",
  triple_bogey: "#a78bfa",
  quad_bogey:   "#6d28d9",
};

const SCORE_LABELS: Record<string, string> = {
  eagle: "Eagle+", birdie: "Birdie", par: "Par",
  bogey: "Bogey", double_bogey: "Double",
  triple_bogey: "Triple", quad_bogey: "Quad+",
};

const SCORE_KEYS = ["eagle", "birdie", "par", "bogey", "double_bogey", "triple_bogey", "quad_bogey"] as const;

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 12,
  border: "1px solid #f1f5f9",
  boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
  background: "rgba(255,255,255,0.97)",
};

const LIMIT_OPTIONS = [20, 50, 100] as const;
type Limit = (typeof LIMIT_OPTIONS)[number];

// ─── Data helpers ─────────────────────────────────────────────────────────────

function rollingAvg(data: ScoreTrendRow[], w = 5) {
  return data.map((row, i) => {
    const slice = data.slice(Math.max(0, i - w + 1), i + 1);
    const valid = slice.filter((r) => r.total_score != null).map((r) => r.total_score!);
    return {
      ...row,
      rolling_avg: valid.length ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10 : null,
    };
  });
}

function aggregateDonut(dist: ScoreTypeRow[]) {
  const filtered = dist.filter((r) => r.holes_counted > 0);
  if (!filtered.length) return [];
  let total = 0;
  const sums: Record<string, number> = {};
  for (const row of filtered) {
    total += row.holes_counted;
    for (const key of SCORE_KEYS) {
      sums[key] = (sums[key] ?? 0) + ((row[key] as number) / 100) * row.holes_counted;
    }
  }
  return SCORE_KEYS.map((key) => ({
    name: key,
    value: total > 0 ? Math.round((sums[key] / total) * 1000) / 10 : 0,
  })).filter((d) => d.value > 0);
}

type InsightCategory = "scoring" | "gir" | "putting";
interface Insight {
  text: string;
  trend?: "up" | "down" | "flat";
  positiveUp?: boolean;
  category: InsightCategory;
}

function computeInsights(
  scoreTrend: ScoreTrendRow[],
  girTrend: GIRTrendRow[],
  scoringByPar: ScoringByParRow[],
  puttsTrend: PuttsTrendRow[],
): Insight[] {
  const out: Insight[] = [];

  // ── Scoring ──────────────────────────────────────────────────────────────
  if (scoreTrend.length >= 6) {
    const mid = Math.floor(scoreTrend.length / 2);
    const first = scoreTrend.slice(0, mid).filter((r) => r.total_score != null).map((r) => r.total_score!);
    const last  = scoreTrend.slice(mid).filter((r) => r.total_score != null).map((r) => r.total_score!);
    if (first.length && last.length) {
      const diff = (first.reduce((a, b) => a + b, 0) / first.length) - (last.reduce((a, b) => a + b, 0) / last.length);
      if (Math.abs(diff) >= 0.3) {
        out.push({
          category: "scoring",
          text: diff > 0
            ? `Your scoring average has improved by ${Math.abs(diff).toFixed(1)} strokes over the last ${scoreTrend.length} rounds.`
            : `Your scoring average has climbed by ${Math.abs(diff).toFixed(1)} strokes recently — worth monitoring.`,
          trend: diff > 0 ? "down" : "up",
          positiveUp: false,
        });
      }
    }
  }

  if (scoringByPar.length) {
    const best = [...scoringByPar].sort((a, b) => a.average_to_par - b.average_to_par)[0];
    out.push({
      category: "scoring",
      text: `You score best on par ${best.par}s — averaging ${best.average_to_par > 0 ? "+" : ""}${best.average_to_par.toFixed(2)} across ${best.sample_size} holes.`,
      trend: best.average_to_par <= 0 ? "down" : "flat",
      positiveUp: false,
    });
  }

  // ── GIR ──────────────────────────────────────────────────────────────────
  const girWithData = girTrend.filter((r) => r.gir_percentage != null);
  if (girWithData.length >= 1) {
    const avgGIR = girWithData.reduce((a, r) => a + r.gir_percentage!, 0) / girWithData.length;
    out.push({
      category: "gir",
      text: avgGIR >= 55
        ? `Your average GIR% is ${avgGIR.toFixed(1)}% — excellent ball striking.`
        : avgGIR >= 33
        ? `Your average GIR% is ${avgGIR.toFixed(1)}% — improving this is one of the fastest routes to lower scores.`
        : `Your average GIR% is ${avgGIR.toFixed(1)}% — irons are the area to target for the biggest scoring gains.`,
      trend: avgGIR >= 50 ? "up" : "flat",
      positiveUp: true,
    });
  }

  if (girWithData.length >= 4) {
    const mid = Math.floor(girWithData.length / 2);
    const first3 = girWithData.slice(0, mid);
    const last3  = girWithData.slice(mid);
    const diff = (last3.reduce((a, r) => a + r.gir_percentage!, 0) / last3.length)
               - (first3.reduce((a, r) => a + r.gir_percentage!, 0) / first3.length);
    if (Math.abs(diff) >= 1) {
      out.push({
        category: "gir",
        text: diff > 0
          ? `GIR% trending up ${Math.abs(diff).toFixed(0)} points over recent rounds — ball striking improving.`
          : `GIR% has dipped ${Math.abs(diff).toFixed(0)} points recently — iron consistency worth a look.`,
        trend: diff > 0 ? "up" : "down",
        positiveUp: true,
      });
    }
  }

  // ── Putting ───────────────────────────────────────────────────────────────
  const puttsWithData = puttsTrend.filter((r) => r.total_putts != null);
  if (puttsWithData.length >= 1) {
    const avgPutts = puttsWithData.reduce((a, r) => a + r.total_putts!, 0) / puttsWithData.length;
    out.push({
      category: "putting",
      text: avgPutts <= 30
        ? `Averaging ${avgPutts.toFixed(1)} putts per round — outstanding on the green.`
        : avgPutts <= 34
        ? `Averaging ${avgPutts.toFixed(1)} putts per round — solid putting.`
        : `Averaging ${avgPutts.toFixed(1)} putts per round — reducing three-putts is the fastest path to lower scores.`,
      trend: avgPutts <= 32 ? "down" : avgPutts <= 36 ? "flat" : "up",
      positiveUp: false,
    });
  }

  if (puttsWithData.length >= 4) {
    const mid = Math.floor(puttsWithData.length / 2);
    const firstPutts = puttsWithData.slice(0, mid).map((r) => r.total_putts!);
    const lastPutts  = puttsWithData.slice(mid).map((r) => r.total_putts!);
    const diff = (firstPutts.reduce((a, b) => a + b, 0) / firstPutts.length)
               - (lastPutts.reduce((a, b) => a + b, 0) / lastPutts.length);
    if (Math.abs(diff) >= 0.5) {
      out.push({
        category: "putting",
        text: diff > 0
          ? `Putts per round improving — down ${Math.abs(diff).toFixed(1)} strokes on average.`
          : `Putts per round up ${Math.abs(diff).toFixed(1)} strokes recently.`,
        trend: diff > 0 ? "down" : "up",
        positiveUp: false,
      });
    }
  }

  return out;
}

function formatHI(hi: number | null | undefined): string | null {
  if (hi == null) return null;
  if (hi < 0) return `+${Math.abs(hi)}`;
  return String(hi);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3 mb-7">
      <div className="h-px w-8 bg-primary/30 rounded-full" />
      <span className="text-[11px] font-bold text-primary/50 uppercase tracking-[0.18em]">{children}</span>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="mb-5">
        <div className="text-sm font-semibold text-gray-800">{title}</div>
        {subtitle && <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AnalyticsPage({ userId }: { userId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState<Limit>(50);

  useEffect(() => {
    setLoading(true);
    api.getAnalytics(userId, limit).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [userId, limit]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const scoreTrendWithAvg = useMemo(
    () => rollingAvg(data?.score_trend ?? []),
    [data?.score_trend],
  );

  const donutData = useMemo(
    () => aggregateDonut(data?.score_type_distribution?.filter((r) => r.holes_counted > 0) ?? []),
    [data?.score_type_distribution],
  );

  // Only include rounds that actually have GIR data recorded
  const girData = useMemo(
    () => (data?.gir_trend ?? []).filter((r) => r.gir_percentage != null && r.total_gir != null),
    [data?.gir_trend],
  );

  // Only include rounds that have putt data recorded
  const threePuttsData = useMemo(() => {
    const roundsWithPutts = new Set(
      (data?.putts_trend ?? []).filter((r) => r.total_putts != null).map((r) => r.round_id),
    );
    return (data?.three_putts_trend ?? []).filter((r) => roundsWithPutts.has(r.round_id));
  }, [data?.three_putts_trend, data?.putts_trend]);

  const insights = useMemo(
    () => computeInsights(
      data?.score_trend ?? [],
      data?.gir_trend ?? [],
      data?.scoring_by_par ?? [],
      data?.putts_trend ?? [],
    ),
    [data?.score_trend, data?.gir_trend, data?.scoring_by_par, data?.putts_trend],
  );

  const scoringInsights = insights.filter((i) => i.category === "scoring");
  const girInsights     = insights.filter((i) => i.category === "gir");
  const puttingInsights = insights.filter((i) => i.category === "putting");

  const birdiePct = donutData.find((d) => d.name === "birdie")?.value;

  const bestRound = useMemo(() => {
    const valid = (data?.score_trend ?? []).filter((r) => r.total_score != null);
    return valid.length ? valid.reduce((b, r) => (r.total_score! < b.total_score! ? r : b)) : null;
  }, [data?.score_trend]);

  const avgPutts = useMemo(() => {
    const valid = (data?.putts_trend ?? []).filter((r) => r.total_putts != null).map((r) => r.total_putts!);
    if (!valid.length) return null;
    return (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1);
  }, [data?.putts_trend]);

  // ── Guards ────────────────────────────────────────────────────────────────
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

  const {
    kpis, net_score_trend, putts_trend,
    scoring_by_par, scoring_by_yardage, scoring_by_handicap, gir_vs_non_gir,
    notable_achievements, scrambling_trend, up_and_down_trend,
  } = data;

  return (
    <div>
      {/* ── Sticky bar ────────────────────────────────────────────────────── */}
      <StickyScoreBar kpis={kpis} />

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <PageHeader title="Analytics" subtitle="Season overview" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Last</span>
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
          <span className="text-xs text-gray-400">rounds</span>
        </div>
      </div>

      {/* ── Dashboard-style stat row ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
        <StatCard label="Handicap Index"   value={formatHI(kpis.handicap_index)}  icon={Gauge}        highlight />
        <StatCard label="Total Rounds"     value={kpis.total_rounds}              icon={Hash} />
        <StatCard label="Scoring Average"  value={kpis.scoring_average}           icon={TrendingDown} />
        <StatCard
          label="Best Round"
          value={bestRound?.total_score ?? null}
          icon={Trophy}
          subtitle={
            (() => {
              const ev = notable_achievements?.scoring_records_events?.lifetime?.lowest_score;
              return ev ? ev.course : undefined;
            })()
          }
        />
        <StatCard label="Avg Putts" value={avgPutts} icon={Target} />
      </div>

      <ScrollSection className="mb-7" delay={0.05}>
        <BestRoundCard scoreTrend={data.score_trend} netScoreTrend={data.net_score_trend} achievements={notable_achievements} />
      </ScrollSection>

      {/* ╔══════════════════════════════════════════════════════════════════╗ */}
      {/* ║  SCORING                                                        ║ */}
      {/* ╚══════════════════════════════════════════════════════════════════╝ */}
      <div className="-mx-8 px-8 py-10 bg-gradient-to-b from-[#eef7f0]/70 to-[#f8faf8]">
        <ScrollSection>
          <SectionLabel>Scoring</SectionLabel>

          {scoringInsights.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-7">
              {scoringInsights.slice(0, 2).map((ins, i) => (
                <NarrativeInsight key={i} text={ins.text} trend={ins.trend} positiveUp={ins.positiveUp} />
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCard title="Score Trend" subtitle="5-round rolling average">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={scoreTrendWithAvg} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#2d7a3a" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#2d7a3a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f1" horizontal={true} vertical={false} />
                  <XAxis dataKey="round_index" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={((v: number, name: string) => [v, name === "rolling_avg" ? "5-Round Avg" : "Score"]) as Fmt}
                  />
                  <ReferenceLine y={72} stroke="#d1fae5" strokeDasharray="4 2"
                    label={{ value: "Par 72", fontSize: 10, fill: "#059669" }}
                  />
                  <Area type="monotone" dataKey="total_score" stroke="#2d7a3a" strokeWidth={1.5}
                    fill="url(#scoreGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                  <Area type="monotone" dataKey="rolling_avg" stroke="#2d7a3a" strokeWidth={2.5}
                    fill="none" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} strokeOpacity={0.45}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Net Score Trend" subtitle="Handicap-adjusted score per round">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={net_score_trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="netScoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#2d7a3a" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#2d7a3a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f1" horizontal={true} vertical={false} />
                  <XAxis dataKey="round_index" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={((v: number, _n: string, props: { payload: { course_handicap: number | null; gross_score: number | null } }) => {
                      const hcp = props.payload.course_handicap;
                      const gross = props.payload.gross_score;
                      const detail = hcp != null && gross != null
                        ? ` (gross ${gross}, HCP ${hcp < 0 ? `+${Math.abs(hcp)}` : hcp})`
                        : "";
                      return [`${v}${detail}`, "Net Score"];
                    }) as Fmt}
                  />
                  <ReferenceLine y={72} stroke="#d1fae5" strokeDasharray="4 2"
                    label={{ value: "Par 72", fontSize: 10, fill: "#059669" }}
                  />
                  <Area type="monotone" dataKey="net_score" stroke="#2d7a3a" strokeWidth={2}
                    fill="url(#netScoreGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </ScrollSection>
      </div>

      {/* ╔══════════════════════════════════════════════════════════════════╗ */}
      {/* ║  BALL STRIKING & SCORE MIX                                      ║ */}
      {/* ╚══════════════════════════════════════════════════════════════════╝ */}
      <div className="-mx-8 px-8 py-10 bg-white">
        <ScrollSection>
          <SectionLabel>Ball Striking</SectionLabel>

          {girInsights.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-7">
              {girInsights.map((ins, i) => (
                <NarrativeInsight key={i} text={ins.text} trend={ins.trend} positiveUp={ins.positiveUp} />
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCard title="GIR % per Round" subtitle={girData.length < (data?.gir_trend ?? []).length ? "Rounds without GIR data excluded" : undefined}>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={girData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="girGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#059669" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f1" horizontal={true} vertical={false} />
                  <XAxis dataKey="round_index" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={((v: number) => [`${v?.toFixed(1)}%`, "GIR %"]) as Fmt}
                  />
                  <Area type="monotone" dataKey="gir_percentage" stroke="#059669" strokeWidth={2}
                    fill="url(#girGrad)" dot={{ r: 3, fill: "#059669", strokeWidth: 0 }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Score Mix Donut */}
            <ChartCard title="Score Mix" subtitle="Career breakdown across all rounds">
              <div className="flex items-center gap-6">
                <div className="relative h-[200px] w-[200px] shrink-0">
                  <ResponsiveContainer width={200} height={200}>
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={82}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {donutData.map((entry) => (
                          <Cell key={entry.name} fill={SCORE_COLORS[entry.name]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle}
                        formatter={((v: number, name: string) => [`${v.toFixed(1)}%`, SCORE_LABELS[name] ?? name]) as Fmt}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    {birdiePct != null && (
                      <>
                        <div className="text-2xl font-black text-gray-800">{birdiePct.toFixed(0)}%</div>
                        <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">birdies</div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 min-w-0">
                  {donutData.map((d) => (
                    <div key={d.name} className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: SCORE_COLORS[d.name] }} />
                      <span className="text-xs text-gray-500 flex-1 truncate">{SCORE_LABELS[d.name] ?? d.name}</span>
                      <span className="text-xs font-semibold text-gray-700 tabular-nums">{d.value.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartCard>
          </div>
        </ScrollSection>
      </div>

      {/* ╔══════════════════════════════════════════════════════════════════╗ */}
      {/* ║  PUTTING                                                        ║ */}
      {/* ╚══════════════════════════════════════════════════════════════════╝ */}
      <div className="-mx-8 px-8 py-10 bg-gradient-to-b from-[#f0f5ff]/50 to-[#f8faf8]">
        <ScrollSection>
          <SectionLabel>Putting</SectionLabel>

          {puttingInsights.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-7">
              {puttingInsights.map((ins, i) => (
                <NarrativeInsight key={i} text={ins.text} trend={ins.trend} positiveUp={ins.positiveUp} />
              ))}
              {kpis.putts_per_gir != null && (
                <NarrativeInsight
                  text={`${kpis.putts_per_gir} putts per GIR — ${kpis.putts_per_gir <= 1.8 ? "elite putting from the green." : kpis.putts_per_gir <= 2.0 ? "solid from the green, room to sharpen." : "two-putt rate is an area to target."}`}
                  trend={kpis.putts_per_gir <= 1.9 ? "down" : "up"}
                  positiveUp={false}
                />
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCard title="Total Putts per Round">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={putts_trend.filter(r => r.total_putts != null)} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="puttsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6b7280" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#6b7280" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f1" horizontal={true} vertical={false} />
                  <XAxis dataKey="round_index" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false}
                    domain={[(min: number) => Math.max(20, min - 2), (max: number) => max + 2]}
                  />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={((v: number) => [v, "Putts"]) as Fmt}
                  />
                  <ReferenceLine y={36} stroke="#e5e7eb" strokeDasharray="4 2"
                    label={{ value: "36", fontSize: 10, fill: "#9ca3af" }}
                  />
                  <Area type="monotone" dataKey="total_putts" stroke="#6b7280" strokeWidth={2}
                    fill="url(#puttsGrad)" dot={{ r: 3, fill: "#6b7280", strokeWidth: 0 }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {threePuttsData.length > 0 && (
              <ChartCard title="3-Putts per Round" subtitle="Number of holes with 3 or more putts">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={threePuttsData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="threePuttGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#f87171" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f1f5f1" horizontal={true} vertical={false} />
                    <XAxis dataKey="round_index" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false}
                      domain={[0, (max: number) => Math.max(6, max + 1)]}
                      allowDecimals={false}
                    />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={((v: number) => [v, "3-Putts"]) as Fmt}
                    />
                    <ReferenceLine y={2} stroke="#e5e7eb" strokeDasharray="4 2"
                      label={{ value: "2", fontSize: 10, fill: "#9ca3af" }}
                    />
                    <Area type="monotone" dataKey="three_putt_count" stroke="#f87171" strokeWidth={2}
                      fill="url(#threePuttGrad)" dot={{ r: 3, fill: "#f87171", strokeWidth: 0 }}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>
        </ScrollSection>
      </div>

      {/* ╔══════════════════════════════════════════════════════════════════╗ */}
      {/* ║  SHORT GAME                                                     ║ */}
      {/* ╚══════════════════════════════════════════════════════════════════╝ */}
      {(scrambling_trend.length > 0 || up_and_down_trend.length > 0) && (
        <div className="-mx-8 px-8 py-10 bg-gradient-to-b from-[#fdf4ff]/50 to-[#f8faf8]">
          <ScrollSection delay={0.1}>
            <SectionLabel>Short Game</SectionLabel>
            <ChartCard
              title="Short Game"
              subtitle="Scrambling % vs Up & Down % · rounds with GIR misses recorded"
            >
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart
                  data={scrambling_trend.map((r, i) => ({
                    ...r,
                    up_and_down_pct: up_and_down_trend[i]?.percentage ?? null,
                  }))}
                  margin={{ top: 8, right: 16, left: -16, bottom: 0 }}
                >
                  <CartesianGrid stroke="#f1f5f1" vertical={false} />
                  <XAxis dataKey="round_index" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={((v: number, name: string) => {
                      if (name === "scrambling_percentage") return [`${v.toFixed(1)}%`, "Scrambling"];
                      if (name === "up_and_down_pct") return [`${v.toFixed(1)}%`, "Up & Down"];
                      return [v, name];
                    }) as Fmt}
                  />
                  <Line type="monotone" dataKey="scrambling_percentage" stroke="#f97316"
                    strokeWidth={2} dot={{ r: 3, fill: "#f97316", strokeWidth: 0 }} connectNulls />
                  <Line type="monotone" dataKey="up_and_down_pct" stroke="#a855f7"
                    strokeWidth={2} dot={{ r: 3, fill: "#a855f7", strokeWidth: 0 }} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          </ScrollSection>
        </div>
      )}

      {/* ╔══════════════════════════════════════════════════════════════════╗ */}
      {/* ║  PERFORMANCE PROFILE                                            ║ */}
      {/* ╚══════════════════════════════════════════════════════════════════╝ */}
      <div className="-mx-8 px-8 py-10">
        <ScrollSection>
          <SectionLabel>Performance Profile</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            <ChartCard title="Avg Score to Par by Hole Par">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={scoring_by_par} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f1" vertical={false} />
                  <XAxis dataKey="par" tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `Par ${v}`}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => (v > 0 ? `+${v}` : v)}
                  />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={((v: number) => [v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2), "Avg to Par"]) as Fmt}
                  />
                  <ReferenceLine y={0} stroke="#e5e7eb" />
                  <Bar dataKey="average_to_par" radius={[6, 6, 0, 0]}>
                    {scoring_by_par.map((row) => (
                      <Cell key={row.par} fill={row.average_to_par <= 0 ? "#059669" : "#f87171"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Avg Score by Hole Difficulty" subtitle="Handicap 1 (hardest) → 18 (easiest)">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={scoring_by_handicap} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f1" vertical={false} />
                  <XAxis dataKey="handicap" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => (v > 0 ? `+${v}` : v)}
                  />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={((v: number, _: unknown, props: { payload: { sample_size: number } }) => [
                      `${v > 0 ? "+" : ""}${v.toFixed(2)} (${props.payload.sample_size} holes)`,
                      "Avg to Par",
                    ]) as Fmt}
                    labelFormatter={(l) => `Hcp ${l}`}
                  />
                  <ReferenceLine y={0} stroke="#e5e7eb" />
                  <Bar dataKey="average_to_par" radius={[4, 4, 0, 0]}>
                    {scoring_by_handicap.map((row) => (
                      <Cell key={row.handicap} fill={row.average_to_par <= 0 ? "#059669" : "#f87171"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {scoring_by_yardage.length > 0 && (() => {
            const yardageData = scoring_by_yardage.map(r => ({
              ...r,
              label: `P${r.par} ${r.bucket_label}`,
            }));
            const par3 = scoring_by_yardage.filter(r => r.par === 3);
            const par4 = scoring_by_yardage.filter(r => r.par === 4);
            const par5 = scoring_by_yardage.filter(r => r.par === 5);
            const makeArea = (par: number, x1: string, x2: string) => (
              <ReferenceArea key={par} x1={x1} x2={x2}
                fill={par === 3 ? "#f0fdf4" : par === 4 ? "#eff6ff" : "#faf5ff"}
                fillOpacity={1}
                label={{ value: `Par ${par}`, position: "insideTop", fontSize: 11, fill: "#9ca3af", dy: -10 }}
              />
            );
            const referenceAreas = [
              par3.length > 0 && makeArea(3, `P3 ${par3[0].bucket_label}`, `P3 ${par3[par3.length - 1].bucket_label}`),
              par4.length > 0 && makeArea(4, `P4 ${par4[0].bucket_label}`, `P4 ${par4[par4.length - 1].bucket_label}`),
              par5.length > 0 && makeArea(5, `P5 ${par5[0].bucket_label}`, `P5 ${par5[par5.length - 1].bucket_label}`),
            ];
            const sharedXAxis = (
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
                angle={-35}
                textAnchor="end"
                interval={0}
                height={55}
              />
            );
            return (
              <div className="flex flex-col gap-5 mb-5">
                <ChartCard title="Avg Score to Par by Yardage" subtitle="Shaded by par group">
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={yardageData} margin={{ top: 16, right: 16, left: -16, bottom: 40 }}>
                      {referenceAreas}
                      <CartesianGrid stroke="#f1f5f1" vertical={false} />
                      {sharedXAxis}
                      <YAxis
                        tick={{ fontSize: 11, fill: "#9ca3af" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => (v > 0 ? `+${v}` : String(v))}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={((v: number, _name: string, props: { payload: { sample_size: number } }) => [
                          `${v > 0 ? "+" : ""}${v.toFixed(2)} (n=${props.payload.sample_size})`,
                          "Avg to Par",
                        ]) as Fmt}
                      />
                      <ReferenceLine y={0} stroke="#e5e7eb" />
                      <Bar dataKey="average_to_par" radius={[5, 5, 0, 0]} maxBarSize={36}>
                        {scoring_by_yardage.map((row, i) => (
                          <Cell key={i} fill={row.average_to_par <= 0 ? "#059669" : "#f87171"} />
                        ))}
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="GIR % by Yardage" subtitle="Green in regulation rate · shaded by par group">
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={yardageData} margin={{ top: 16, right: 16, left: -16, bottom: 40 }}>
                      {referenceAreas}
                      <CartesianGrid stroke="#f1f5f1" vertical={false} />
                      {sharedXAxis}
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fill: "#9ca3af" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={((v: number, _name: string, props: { payload: { sample_size: number } }) => [
                          `${v.toFixed(1)}% (n=${props.payload.sample_size})`,
                          "GIR %",
                        ]) as Fmt}
                      />
                      <Bar dataKey="gir_percentage" radius={[5, 5, 0, 0]} maxBarSize={36} fill="#60a5fa" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            );
          })()}

          {gir_vs_non_gir.length > 0 && (
            <ScrollSection delay={0.1}>
              <ChartCard title="GIR vs No-GIR Score Distribution"
                subtitle="Where your scores come from — on vs off the green in regulation">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={gir_vs_non_gir} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#f1f5f1" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} unit="%" />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={((v: number, name: string) => [`${v?.toFixed(1)}%`, SCORE_LABELS[name] ?? name]) as Fmt}
                    />
                    <Legend formatter={(name) => SCORE_LABELS[name] ?? name} wrapperStyle={{ fontSize: 11 }} />
                    {(["eagle", "birdie", "par", "bogey", "double_bogey", "triple_bogey", "quad_bogey"] as const).map((key) => (
                      <Bar key={key} dataKey={key} stackId="a" fill={SCORE_COLORS[key]}
                        radius={key === "eagle" ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </ScrollSection>
          )}
        </ScrollSection>
      </div>
    </div>
  );
}
