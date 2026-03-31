// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fmt = (v: any, name: any, props: any) => any;

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, PieChart, Pie, Cell, Legend,
  CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { SVGTimeSeriesArea } from "@/components/analytics/SVGTimeSeriesArea";
import { Gauge, Hash, TrendingDown, Trophy, Target } from "lucide-react";
import { api } from "@/lib/api";
import { getStoredColorBlindMode } from "@/lib/accessibility";
import { getColorBlindPalette } from "@/lib/chartPalettes";
import type {
  AnalyticsData, AnalyticsFilters, ScoreTrendRow, ScoreTypeRow, GIRTrendRow, ScoringByParRow, PuttsTrendRow,
} from "@/types/analytics";
import { ScrollSection } from "@/components/analytics/ScrollSection";
import { NarrativeInsight } from "@/components/analytics/NarrativeInsight";
import { StickyScoreBar } from "@/components/analytics/StickyScoreBar";
import { BestRoundCard } from "@/components/analytics/BestRoundCard";
import { ParMatrixGrid } from "@/components/analytics/ParMatrixGrid";
import { AnalyticsFilterBar } from "@/components/analytics/AnalyticsFilterBar";

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: AnalyticsFilters = { limit: 50, timeframe: "all", courseId: "all" };

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
    <div className="flex items-center gap-3 w-full">
      <span className="text-[11px] font-bold text-primary uppercase tracking-[0.18em] whitespace-nowrap">{children}</span>
      <div className="h-px flex-1 bg-primary/15 rounded-full" />
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="analytics-chart-card bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
      <div className="mb-2">
        <div className="text-sm font-semibold text-gray-800">{title}</div>
        {subtitle && <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AnalyticsPage({ userId }: { userId: string }) {
  const [filters, setFilters] = useState<AnalyticsFilters>(DEFAULT_FILTERS);
  const { data, isLoading: loading } = useQuery({
    queryKey: ["analytics", userId, filters],
    queryFn: () => api.getAnalytics(userId, filters),
  });
  const { data: playedCourses = [] } = useQuery({
    queryKey: ["played-courses", userId],
    queryFn: () => api.getPlayedCourses(userId),
  });
  const { data: user } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => api.getUser(userId),
  });
  const colorBlindMode = useMemo(() => getStoredColorBlindMode(), []);
  const colorBlindPalette = useMemo(() => getColorBlindPalette(colorBlindMode), [colorBlindMode]);
  const scoreColors = colorBlindPalette?.score ?? SCORE_COLORS;
  const trendPrimary = colorBlindPalette?.trend.primary ?? "#2d7a3a";
  const trendSecondary = colorBlindPalette?.trend.secondary ?? "#f97316";
  const trendTertiary = colorBlindPalette?.trend.tertiary ?? "#a855f7";
  const successColor = colorBlindPalette?.ui.success ?? "#059669";
  const dangerColor = colorBlindPalette?.ui.danger ?? "#f87171";
  const neutralColor = colorBlindPalette?.ui.neutral ?? "#6b7280";
  const gridColor = colorBlindPalette?.ui.grid ?? "#f1f5f1";
  const mutedFill = colorBlindPalette?.ui.mutedFill ?? "#e5e7eb";

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

  const isEmpty = !data || data.kpis.total_rounds === 0;

  const header = (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">
          {(() => {
            const parts: string[] = [];
            parts.push(filters.limit === 500 ? "All rounds" : `Last ${filters.limit} rounds`);
            if (filters.courseId !== "all") {
              if (filters.courseId === "home") {
                parts.push("Home Course");
              } else {
                const c = playedCourses.find((pc) => pc.id === filters.courseId);
                if (c) parts.push(c.name ?? "Selected Course");
              }
            }
            if (filters.timeframe === "ytd") parts.push("YTD");
            if (filters.timeframe === "1y") parts.push("Last 12 mo");
            return parts.map((p, i) => (
              <span key={i}>
                {i > 0 && <span className="text-gray-300 mx-1">·</span>}
                <span className="font-semibold text-gray-700">{p}</span>
              </span>
            ));
          })()}
        </p>
      </div>
      <AnalyticsFilterBar
        filters={filters}
        onChange={setFilters}
        playedCourses={playedCourses}
        hasHomeCourse={!!user?.home_course_id}
      />
    </div>
  );

  if (isEmpty) {
    const isFiltered = filters.courseId !== "all" || filters.timeframe !== "all";
    return (
      <div>
        {header}
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <p className="text-gray-400 text-sm">
            {isFiltered
              ? "No rounds found for the selected filters."
              : "Play some rounds to see your analytics."}
          </p>
        </div>
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

      {/* ── Dynamic Header ────────────────────────────────────────────────── */}
      {header}

      {/* ── Panoramic Bento Bar ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-wrap divide-y md:divide-y-0 md:divide-x divide-gray-50 overflow-hidden mb-4">
        {/* Handicap — accent cell */}
        <div className="flex-1 min-w-[110px] p-3 bg-primary relative overflow-hidden flex flex-col">
          <div className="absolute -top-5 -right-5 w-20 h-20 rounded-full bg-white/5 blur-2xl pointer-events-none" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">Handicap Index</span>
          <span className="text-xl font-bold text-white">{formatHI(kpis.handicap_index) ?? "—"}</span>
          <Gauge size={13} className="absolute top-3 right-3 text-white/25" />
        </div>
        {/* Regular cells */}
        {[
          { label: "Rounds",      value: kpis.total_rounds,            icon: Hash },
          { label: "Scoring Avg", value: kpis.scoring_average,         icon: TrendingDown },
          { label: "Best Round",  value: bestRound?.total_score ?? null, icon: Trophy,
            subtitle: (() => { const ev = notable_achievements?.scoring_records_events?.lifetime?.lowest_score; return ev?.course; })() },
          { label: "Avg Putts",   value: avgPutts,                     icon: Target },
        ].map(({ label, value, icon: Icon, subtitle }) => (
          <div key={label} className="flex-1 min-w-[110px] p-3 flex flex-col relative">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</span>
            <span className="text-xl font-bold text-gray-900">{value ?? "—"}</span>
            {subtitle && <span className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</span>}
            <Icon size={13} className="absolute top-3 right-3 text-gray-200" />
          </div>
        ))}
      </div>

      {/* ── Unified dense grid ────────────────────────────────────────────── */}
      <ScrollSection>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

          {/* ── Scoring ── */}
          <div className="lg:col-span-2 flex items-center gap-3 mt-2 mb-0">
            <SectionLabel>Scoring</SectionLabel>
          </div>

          <div className="lg:col-span-2">
            <BestRoundCard scoreTrend={data.score_trend} netScoreTrend={data.net_score_trend} achievements={notable_achievements} />
          </div>

          {scoringInsights.length > 0 && (
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-2">
              {scoringInsights.slice(0, 2).map((ins, i) => (
                <NarrativeInsight key={i} text={ins.text} trend={ins.trend} positiveUp={ins.positiveUp} />
              ))}
            </div>
          )}

          <ChartCard title="Score Trend" subtitle="5-round rolling average">
            <SVGTimeSeriesArea
              data={scoreTrendWithAvg}
              valueKey="total_score"
              rollingAvgKey="rolling_avg"
              indexKey="round_index"
              color={trendPrimary}
              gridColor={gridColor}
              referenceLine={{ y: 72, label: "Par 72" }}
              gradientSuffix="score"
              showDots={false}
              height={130}
              tooltipLabel="Score"
            />
          </ChartCard>

          <ChartCard title="Net Score Trend" subtitle="Handicap-adjusted score per round">
            <SVGTimeSeriesArea
              data={net_score_trend}
              valueKey="net_score"
              indexKey="round_index"
              color={trendPrimary}
              gridColor={gridColor}
              referenceLine={{ y: 72, label: "Par 72" }}
              gradientSuffix="netScore"
              showDots={false}
              height={130}
              tooltipLabel="Net Score"
              renderTooltipExtra={(row) => (
                <>
                  {row.course_name && (
                    <div className="text-[11px] text-gray-400 mt-1 truncate max-w-[160px]">{row.course_name}</div>
                  )}
                  <div className="border-t border-gray-100 mt-1.5 pt-1.5 flex flex-col gap-0.5">
                    {row.to_par != null && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-500">To Par</span>
                        <span className={`font-semibold ${row.to_par < 0 ? "text-emerald-600" : row.to_par > 0 ? "text-red-500" : "text-gray-500"}`}>
                          {row.to_par > 0 ? `+${row.to_par}` : row.to_par === 0 ? "E" : row.to_par}
                        </span>
                      </div>
                    )}
                    {row.course_handicap != null && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-500">Course HCP</span>
                        <span className="font-semibold text-gray-800">
                          {row.course_handicap < 0 ? `+${Math.abs(row.course_handicap)}` : row.course_handicap}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}
            />
          </ChartCard>

          {/* ── Ball Striking ── */}
          <div className="lg:col-span-2 flex items-center gap-3 mt-2 mb-0">
            <SectionLabel>Ball Striking</SectionLabel>
          </div>

          {girInsights.length > 0 && (
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-2">
              {girInsights.map((ins, i) => (
                <NarrativeInsight key={i} text={ins.text} trend={ins.trend} positiveUp={ins.positiveUp} />
              ))}
            </div>
          )}

          <ChartCard title="GIR % per Round" subtitle={girData.length < (data?.gir_trend ?? []).length ? "Rounds without GIR data excluded" : undefined}>
            <SVGTimeSeriesArea
              data={girData}
              valueKey="gir_percentage"
              unit="%"
              indexKey="round_index"
              color={successColor}
              gridColor={gridColor}
              yDomain={[0, 100]}
              gradientSuffix="gir"
              showDots={girData.length <= 30}
              height={130}
              tooltipLabel="GIR %"
              formatTooltipValue={(v) => `${v.toFixed(1)}%`}
            />
          </ChartCard>

          {(scrambling_trend.length > 0 || up_and_down_trend.length > 0) ? (
            <ChartCard title="Short Game" subtitle="Scrambling % vs Up & Down %">
              <SVGTimeSeriesArea
                data={scrambling_trend.map((r, i) => ({
                  ...r,
                  up_and_down_pct: up_and_down_trend[i]?.percentage ?? null,
                }))}
                valueKey="scrambling_percentage"
                secondaryValueKey="up_and_down_pct"
                secondaryColor={trendTertiary}
                indexKey="round_index"
                unit="%"
                color={trendSecondary}
                gridColor={gridColor}
                yDomain={[0, 100]}
                tooltipLabel="Scrambling"
                secondaryTooltipLabel="Up & Down"
                gradientSuffix="shortGame"
                showDots={true}
                height={130}
                formatTooltipValue={(v) => `${v.toFixed(1)}%`}
              />
            </ChartCard>
          ) : null}

          {/* Score Mix Donut */}
          <div>
            <ChartCard title="Score Mix" subtitle="Career breakdown across all rounds">
              <div className="flex items-center gap-4">
                <div className="relative h-[160px] w-[160px] shrink-0">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={46}
                        outerRadius={66}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {donutData.map((entry) => (
                          <Cell key={entry.name} fill={scoreColors[entry.name]} />
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
                        <div className="text-xl font-black text-gray-800">{birdiePct.toFixed(0)}%</div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: successColor }}>birdies</div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 min-w-0">
                  {donutData.map((d) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: scoreColors[d.name] }} />
                      <span className="text-xs text-gray-500 flex-1 truncate">{SCORE_LABELS[d.name] ?? d.name}</span>
                      <span className="text-xs font-semibold text-gray-700 tabular-nums">{d.value.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartCard>
          </div>

          {/* ── Putting ── */}
          <div className="lg:col-span-2 flex items-center gap-3 mt-2 mb-0">
            <SectionLabel>Putting</SectionLabel>
          </div>

          {puttingInsights.length > 0 && (
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-2">
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

          <ChartCard title="Total Putts per Round">
            <SVGTimeSeriesArea
              data={putts_trend.filter((r) => r.total_putts != null)}
              valueKey="total_putts"
              indexKey="round_index"
              color={neutralColor}
              gridColor={gridColor}
              referenceLine={{ y: 36, label: "36" }}
              gradientSuffix="putts"
              showDots={true}
              height={130}
              tooltipLabel="Putts"
            />
          </ChartCard>

          {threePuttsData.length > 0 && (
            <ChartCard title="3-Putts per Round" subtitle="Holes with 3+ putts">
              <SVGTimeSeriesArea
                data={threePuttsData}
                valueKey="three_putt_count"
                indexKey="round_index"
                color={dangerColor}
                gridColor={gridColor}
                yDomain={[0, "auto"]}
                referenceLine={{ y: 2, label: "2" }}
                gradientSuffix="threePutts"
                showDots={true}
                height={130}
                tooltipLabel="3-Putts"
              />
            </ChartCard>
          )}

          {/* ── Performance Profile ── */}
          <div className="lg:col-span-2 flex items-center gap-3 mt-2 mb-0">
            <SectionLabel>Performance Profile</SectionLabel>
          </div>

          <ChartCard title="Avg Score to Par by Hole Par">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={scoring_by_par} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={gridColor} vertical={false} />
                <XAxis dataKey="par" tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `Par ${v}`}
                />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => (v > 0 ? `+${v}` : v)}
                />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={((v: number) => [v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2), "Avg to Par"]) as Fmt}
                />
                <ReferenceLine y={0} stroke={mutedFill} />
                <Bar dataKey="average_to_par" radius={[6, 6, 0, 0]}>
                  {scoring_by_par.map((row) => (
                    <Cell key={row.par} fill={row.average_to_par <= 0 ? successColor : dangerColor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Avg Score by Hole Difficulty" subtitle="Handicap 1 (hardest) → 18 (easiest)">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={scoring_by_handicap} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={gridColor} vertical={false} />
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
                <ReferenceLine y={0} stroke={mutedFill} />
                <Bar dataKey="average_to_par" radius={[4, 4, 0, 0]}>
                  {scoring_by_handicap.map((row) => (
                    <Cell key={row.handicap} fill={row.average_to_par <= 0 ? successColor : dangerColor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {scoring_by_yardage.length > 0 && (
            <div className="lg:col-span-2">
              <ParMatrixGrid rows={scoring_by_yardage} />
            </div>
          )}

          {gir_vs_non_gir.length > 0 && (
            <div className="lg:col-span-2">
              <ChartCard title="GIR vs No-GIR Score Distribution"
                subtitle="On vs off the green in regulation">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={gir_vs_non_gir} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={gridColor} vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} unit="%" />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={((v: number, name: string) => [`${v?.toFixed(1)}%`, SCORE_LABELS[name] ?? name]) as Fmt}
                    />
                    <Legend formatter={(name) => SCORE_LABELS[name] ?? name} wrapperStyle={{ fontSize: 11 }} />
                    {(["eagle", "birdie", "par", "bogey", "double_bogey", "triple_bogey", "quad_bogey"] as const).map((key) => (
                      <Bar key={key} dataKey={key} stackId="a" fill={scoreColors[key]}
                        radius={key === "eagle" ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

        </div>
      </ScrollSection>
    </div>
  );
}
