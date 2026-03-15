// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fmt = (v: any, name: any, props: any) => any;

import { useEffect, useState, useMemo } from "react";
import {
  AreaChart, Area,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis,
  ResponsiveContainer, Tooltip, ReferenceLine,
} from "recharts";
import { api } from "@/lib/api";
import type { AnalyticsData, AnalyticsKPIs, ScoreTypeRow, ScoringByParRow } from "@/types/analytics";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScrollSection } from "@/components/analytics/ScrollSection";

// ─── Constants ────────────────────────────────────────────────────────────────

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 12,
  border: "1px solid #f1f5f9",
  boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
  background: "rgba(255,255,255,0.97)",
};

const SCORE_COLORS: Record<string, string> = {
  eagle:        "#b45309",
  birdie:       "#059669",
  par:          "#9ca3af",
  bogey:        "#f87171",
  double_bogey: "#60a5fa",
  triple_bogey: "#a78bfa",
  quad_bogey:   "#6d28d9",
};

const SCORE_KEYS = ["eagle", "birdie", "par", "bogey", "double_bogey", "triple_bogey", "quad_bogey"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function buildRadarData(kpis: AnalyticsKPIs, scoringByPar: ScoringByParRow[]) {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const parAvg = (par: number) =>
    scoringByPar.find((r) => r.par === par)?.average_to_par ?? 0;
  return [
    { axis: "GIR",        value: clamp(kpis.gir_percentage ?? 0) },
    { axis: "Scrambling", value: clamp(kpis.scrambling_percentage ?? 0) },
    { axis: "Putting",    value: clamp((2.5 - (kpis.putts_per_gir ?? 2.0)) / 1.0 * 100) },
    { axis: "Par 3s",     value: clamp(50 + (-parAvg(3)) * 10) },
    { axis: "Par 4s",     value: clamp(50 + (-parAvg(4)) * 10) },
    { axis: "Par 5s",     value: clamp(50 + (-parAvg(5)) * 10) },
  ];
}

function eventMeta(event: { date: string; course: string } | null | undefined): string | null {
  if (!event) return null;
  return `${event.date} — ${event.course}`;
}

function isWithinLastDays(dateStr: string, days: number): boolean {
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return false;
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return parsed >= cutoff;
}

type TimeWindow = "lifetime" | "one_year";

// ─── Sub-components ───────────────────────────────────────────────────────────


function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-gray-200/50 ${className ?? ""}`}>
      <div className="mb-4">
        <div className="text-sm font-semibold text-gray-800">{title}</div>
        {subtitle && <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number | string | null | undefined }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 flex flex-col gap-1">
      <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value ?? "—"}</div>
    </div>
  );
}

function MilestoneBar({ label, achieved }: { label: string; achieved: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${achieved ? "bg-primary" : "bg-gray-200"}`} />
      <div className={`text-sm ${achieved ? "text-gray-900 font-medium" : "text-gray-400"}`}>{label}</div>
      {achieved && <div className="ml-auto text-[10px] font-bold text-primary uppercase tracking-wide">Achieved</div>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function CareerPage({ userId }: { userId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("lifetime");

  useEffect(() => {
    setLoading(true);
    api.getAnalytics(userId, 200).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [userId]);

  const donutData = useMemo(
    () => aggregateDonut(data?.score_type_distribution ?? []),
    [data?.score_type_distribution],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading career...</div>
      </div>
    );
  }

  if (!data) {
    return <div className="text-gray-500">Unable to load achievements.</div>;
  }

  const {
    scoring_records,
    career_totals,
    best_performance_streaks,
    best_performance_streaks_events,
    putting_milestones,
    gir_milestones,
    round_milestones,
    scoring_records_events,
    window_days,
  } = data.notable_achievements;

  const w = timeWindow;

  const totalHoles = career_totals.lifetime.total_holes_played ?? 0;
  const radarData = buildRadarData(data.kpis, data.scoring_by_par);

  const hi = Math.max(0, Math.min(36, data.kpis.handicap_index ?? 18));
  const gaugeData = [{ value: hi }, { value: 36 - hi }];
  const hiColor = hi < 10 ? "#16a34a" : hi < 20 ? "#f59e0b" : "#ef4444";
  const hiDisplay =
    data.kpis.handicap_index != null
      ? data.kpis.handicap_index < 0
        ? `+${Math.abs(data.kpis.handicap_index)}`
        : data.kpis.handicap_index.toFixed(1)
      : "—";

  const recordRows = [
    {
      label: "Lowest Round",
      value: scoring_records[w].lowest_round,
      meta: eventMeta(scoring_records_events[w].lowest_round),
    },
    {
      label: "Most Birdies",
      value: scoring_records[w].most_birdies_in_round,
      meta: eventMeta(scoring_records_events[w].most_birdies_in_round),
    },
    {
      label: "Most GIR",
      value: scoring_records[w].most_gir_in_round,
      meta: eventMeta(scoring_records_events[w].most_gir_in_round),
    },
    {
      label: "Fewest Putts",
      value: scoring_records[w].fewest_putts_in_round,
      meta: eventMeta(scoring_records_events[w].fewest_putts_in_round),
    },
    {
      label: "Birdie Streak",
      value: best_performance_streaks[w].longest_birdie_streak,
      meta: eventMeta(best_performance_streaks_events[w].longest_birdie_streak),
    },
    {
      label: "Par-or-Better Streak",
      value: best_performance_streaks[w].longest_par_streak,
      meta: eventMeta(best_performance_streaks_events[w].longest_par_streak),
    },
  ];

  const scoreBreaksAbove70 = round_milestones.lifetime.score_breaks.filter((row) => row.threshold > 70);
  const scoreBreaks70AndBelow = round_milestones.lifetime.score_breaks.filter((row) => row.threshold <= 70);

  return (
    <div>
      <div className="mb-6">
        <PageHeader title="Career" subtitle="Player achievement records" />
        <div className="flex gap-2">
          {(["lifetime", "one_year"] as TimeWindow[]).map((tw) => (
            <button
              key={tw}
              onClick={() => setTimeWindow(tw)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                timeWindow === tw
                  ? "bg-primary text-white shadow-sm"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {tw === "lifetime" ? "Lifetime" : `Last ${window_days} Days`}
            </button>
          ))}
        </div>
      </div>

      <ScrollSection>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">

          {/* ── Hero: Handicap Index Trend ───────────────────────────────── */}
          <ChartCard
            title="Handicap Index Trend"
            subtitle={data.kpis.handicap_index != null ? `Current: ${hiDisplay}` : undefined}
            className="xl:col-span-3"
          >
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.handicap_trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="hiGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#2d7a3a" stopOpacity={0.13} />
                    <stop offset="95%" stopColor="#2d7a3a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="round_index" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={((v: number) => [v?.toFixed(1), "Handicap Index"]) as Fmt}
                />
                <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="3 3" />
                <Area
                  type="monotone"
                  dataKey="handicap_index"
                  stroke="#2d7a3a"
                  strokeWidth={2}
                  fill="url(#hiGrad)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ── Score Mix Donut ──────────────────────────────────────────── */}
          <ChartCard title="Career Score Mix">
            <div className="relative">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    innerRadius={60}
                    outerRadius={80}
                    stroke="none"
                    paddingAngle={2}
                  >
                    {donutData.map((d) => (
                      <Cell key={d.name} fill={SCORE_COLORS[d.name]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={((v: number) => [`${v.toFixed(1)}%`, ""]) as Fmt}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-2xl font-bold text-gray-900">{totalHoles}</div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">holes</div>
              </div>
            </div>
          </ChartCard>

          {/* ── Player Profile Radar ─────────────────────────────────────── */}
          <ChartCard title="Player Profile">
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData} outerRadius={80}>
                <PolarGrid stroke="#f1f5f9" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: "#6b7280" }} />
                <Radar
                  dataKey="value"
                  stroke="#2d7a3a"
                  fill="#2d7a3a"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ── Round Records Table ──────────────────────────────────────── */}
          <ChartCard title="Round Records" className="xl:col-span-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-[10px] uppercase tracking-widest text-gray-400 font-semibold pb-2 w-[30%]">Record</th>
                  <th className="text-right text-[10px] uppercase tracking-widest text-gray-400 font-semibold pb-2 pr-4 w-[15%]">Value</th>
                  <th className="text-left text-[10px] uppercase tracking-widest text-gray-400 font-semibold pb-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recordRows.map((row) => (
                  <tr key={row.label}>
                    <td className="py-2.5 text-gray-600">{row.label}</td>
                    <td className="py-2.5 pr-4 text-right font-bold text-gray-900">{row.value ?? "—"}</td>
                    <td className="py-2.5 text-xs text-gray-400 truncate max-w-[160px]">{row.meta ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ChartCard>

          {/* ── Handicap Index Gauge ─────────────────────────────────────── */}
          <ChartCard title="Handicap Index">
            <div className="relative" style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={gaugeData}
                    cx="50%"
                    cy="100%"
                    startAngle={180}
                    endAngle={0}
                    innerRadius={70}
                    outerRadius={90}
                    dataKey="value"
                    stroke="none"
                  >
                    <Cell fill={hiColor} />
                    <Cell fill="#f1f5f9" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute bottom-2 left-0 right-0 flex flex-col items-center pointer-events-none">
                <div className="text-2xl font-bold text-gray-900">{hiDisplay}</div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">HCP Index</div>
              </div>
            </div>
          </ChartCard>

          {/* ── Career Totals ────────────────────────────────────────────── */}
          <ChartCard
            title={w === "lifetime" ? "Career Totals" : "Year Totals"}
            className="xl:col-span-2"
          >
            <div className="grid grid-cols-3 gap-3">
              {w === "lifetime" ? (
                <>
                  <StatTile label="Rounds" value={career_totals.lifetime.total_rounds_played} />
                  <StatTile label="Birdies" value={career_totals.lifetime.total_birdies} />
                  <StatTile label="Eagles" value={career_totals.lifetime.total_eagles} />
                  <StatTile label="Pars" value={career_totals.lifetime.total_pars} />
                  <StatTile label="Bogeys" value={career_totals.lifetime.total_bogeys} />
                  <StatTile label="GIR" value={career_totals.lifetime.total_gir} />
                  <StatTile label="3-Putts" value={career_totals.lifetime.total_3_putts} />
                  <StatTile label="Hole-in-Ones" value={career_totals.lifetime.total_hole_in_ones} />
                  <StatTile label="Doubles" value={career_totals.lifetime.total_double_bogeys} />
                </>
              ) : (
                <>
                  <StatTile label="Rounds" value={career_totals.one_year.rounds_played} />
                  <StatTile label="Birdies" value={career_totals.one_year.birdies} />
                  <StatTile label="Eagles" value={career_totals.one_year.eagles} />
                  <StatTile label="GIR" value={career_totals.one_year.gir} />
                  <StatTile label="3-Putts" value={career_totals.one_year.three_putts} />
                  <StatTile label="Hole-in-Ones" value={career_totals.one_year.hole_in_ones} />
                  <StatTile label="Doubles" value={career_totals.one_year.double_bogeys} />
                  <StatTile label="Triples" value={career_totals.one_year.triple_bogeys} />
                  <StatTile label="Quad+" value={career_totals.one_year.quad_bogeys_plus} />
                </>
              )}
            </div>
          </ChartCard>

          {/* ── Career Milestones ────────────────────────────────────────── */}
          <ChartCard title="Career Milestones" className="xl:col-span-2">
            {w === "lifetime" ? (
              <div className="grid grid-cols-2 gap-2">
                {scoreBreaksAbove70.map((row) => (
                  <MilestoneBar
                    key={row.threshold}
                    label={`Break ${row.threshold}`}
                    achieved={row.achievement != null}
                  />
                ))}
                <MilestoneBar
                  label="Round Under Par"
                  achieved={round_milestones.lifetime.first_round_under_par != null}
                />
                {scoreBreaks70AndBelow.map((row) => (
                  <MilestoneBar
                    key={row.threshold}
                    label={`Break ${row.threshold}`}
                    achieved={row.achievement != null}
                  />
                ))}
                <MilestoneBar
                  label="First Eagle"
                  achieved={round_milestones.lifetime.first_eagle != null}
                />
                <MilestoneBar
                  label="Hole-in-One"
                  achieved={round_milestones.lifetime.first_hole_in_one != null}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-sm text-gray-500 mb-3">
                  {round_milestones.one_year.new_personal_records_achieved_count} new personal records in the last {window_days} days.
                </div>
                {round_milestones.one_year.new_personal_records_achieved.map((pr) => (
                  <MilestoneBar key={pr} label={pr} achieved={true} />
                ))}
                {round_milestones.one_year.new_personal_records_achieved.length === 0 && (
                  <div className="text-sm text-gray-400">No new records yet — keep playing!</div>
                )}
              </div>
            )}
          </ChartCard>

          {/* ── Putting Milestones ───────────────────────────────────────── */}
          <ChartCard title="Putting Milestones" className="xl:col-span-2">
            <div className="grid grid-cols-2 gap-2">
              {putting_milestones.lifetime.putt_breaks.map((row) => {
                const achieved = w === "lifetime"
                  ? row.achievement != null
                  : row.achievement != null && isWithinLastDays(row.achievement.date, window_days);
                return (
                  <MilestoneBar
                    key={row.threshold}
                    label={`Break ${row.threshold} Putts`}
                    achieved={achieved}
                  />
                );
              })}
            </div>
          </ChartCard>

          {/* ── GIR Milestones ───────────────────────────────────────────── */}
          <ChartCard title="GIR Milestones" className="xl:col-span-2">
            <div className="grid grid-cols-2 gap-2">
              {gir_milestones.lifetime.gir_breaks.map((row) => {
                const achieved = w === "lifetime"
                  ? row.achievement != null
                  : row.achievement != null && isWithinLastDays(row.achievement.date, window_days);
                return (
                  <MilestoneBar
                    key={row.threshold}
                    label={`${row.threshold}/18 GIR`}
                    achieved={achieved}
                  />
                );
              })}
            </div>
          </ChartCard>

        </div>
      </ScrollSection>
    </div>
  );
}
