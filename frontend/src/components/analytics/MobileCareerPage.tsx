import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { SVGHandicapTrend } from "@/components/analytics/SVGHandicapTrend";
import { UserRadarChart } from "@/components/analytics/UserRadarChart";
import type { AnalyticsData } from "@/types/analytics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fmt = (v: any, name: any, props: any) => any;
type TimeWindow = "lifetime" | "one_year";

const SCORE_LABELS: Record<string, string> = {
  eagle: "Eagle+", birdie: "Birdie", par: "Par",
  bogey: "Bogey", double_bogey: "Double",
  triple_bogey: "Triple", quad_bogey: "Quad+",
};

const tooltipStyle = {
  fontSize: 12, borderRadius: 12,
  border: "1px solid #f1f5f9",
  boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
  background: "rgba(255,255,255,0.97)",
};

function isWithinLastDays(dateStr: string, days: number): boolean {
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return false;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return parsed >= cutoff;
}

function MilestoneBar({ label, achieved, color = "var(--color-primary)" }: {
  label: string; achieved: boolean; color?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: achieved ? color : "#e5e7eb" }} />
      <span className={`text-xs ${achieved ? "text-gray-800 font-medium" : "text-gray-400"}`}>{label}</span>
      {achieved && <span className="ml-auto text-[9px] font-bold uppercase tracking-wide" style={{ color }}>✓</span>}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number | string | null | undefined }) {
  return (
    <div className="bg-gray-50 rounded-xl p-2.5 flex flex-col gap-1">
      <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">{label}</div>
      <div className="text-xl font-bold text-gray-900">{value ?? "—"}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="text-sm font-semibold text-gray-800 mb-3">{title}</div>
      {children}
    </div>
  );
}

interface ScoreBreak {
  threshold: number;
  achievement: { date: string; course: string } | null;
}

interface MobileCareerPageProps {
  data: AnalyticsData;
  timeWindow: TimeWindow;
  setTimeWindow: (w: TimeWindow) => void;
  donutData: { name: string; value: number }[];
  recordRows: { label: string; value: number | null; meta: string | null }[];
  scoreBreaksAbove70: ScoreBreak[];
  scoreBreaks70AndBelow: ScoreBreak[];
  totalHoles: number;
  gaugeData: { value: number }[];
  hiColor: string;
  hiDisplay: string;
  trendPrimary: string;
  successColor: string;
  neutralColor: string;
  gridColor: string;
  mutedFill: string;
  scoreColors: Record<string, string>;
}

export function MobileCareerPage({
  data,
  timeWindow,
  setTimeWindow,
  donutData,
  recordRows,
  scoreBreaksAbove70,
  scoreBreaks70AndBelow,
  totalHoles,
  gaugeData: _gaugeData,
  hiColor: _hiColor,
  hiDisplay,
  trendPrimary,
  successColor,
  neutralColor,
  gridColor,
  mutedFill: _mutedFill,
  scoreColors,
}: MobileCareerPageProps) {
  const [milestoneTab, setMilestoneTab] = useState<"career" | "putting" | "gir">("career");

  const { notable_achievements: na } = data;
  const { career_totals, putting_milestones, gir_milestones, round_milestones, window_days } = na;
  const w = timeWindow;

  return (
    <div className="space-y-4 px-4 py-4">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-3">Career</h1>
        <div className="flex gap-2">
          {(["lifetime", "one_year"] as TimeWindow[]).map((tw) => (
            <button
              key={tw}
              onClick={() => setTimeWindow(tw)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                timeWindow === tw
                  ? "bg-primary text-white shadow-sm"
                  : "bg-white border border-gray-200 text-gray-600"
              }`}
            >
              {tw === "lifetime" ? "Lifetime" : `Last ${window_days} Days`}
            </button>
          ))}
        </div>
      </div>

      {/* HCP Trend */}
      <Card title={`Handicap Index Trend${data.kpis.handicap_index != null ? ` · ${hiDisplay}` : ""}`}>
        <SVGHandicapTrend
          data={data.handicap_trend}
          color={trendPrimary}
          gridColor={gridColor}
          height={160}
        />
      </Card>

      {/* Career Totals */}
      <Card title={w === "lifetime" ? "Career Totals" : "Year Totals"}>
        <div className="grid grid-cols-2 gap-2">
          {w === "lifetime" ? (
            <>
              <StatTile label="Rounds" value={career_totals.lifetime.total_rounds_played} />
              <StatTile label="Birdies" value={career_totals.lifetime.total_birdies} />
              <StatTile label="Eagles" value={career_totals.lifetime.total_eagles} />
              <StatTile label="Pars" value={career_totals.lifetime.total_pars} />
              <StatTile label="Bogeys" value={career_totals.lifetime.total_bogeys} />
              <StatTile label="Doubles" value={career_totals.lifetime.total_double_bogeys} />
              <StatTile label="GIR" value={career_totals.lifetime.total_gir} />
              <StatTile label="3-Putts" value={career_totals.lifetime.total_3_putts} />
              <StatTile label="Hole-in-Ones" value={career_totals.lifetime.total_hole_in_ones} />
            </>
          ) : (
            <>
              <StatTile label="Rounds" value={career_totals.one_year.rounds_played} />
              <StatTile label="Birdies" value={career_totals.one_year.birdies} />
              <StatTile label="Eagles" value={career_totals.one_year.eagles} />
              <StatTile label="GIR" value={career_totals.one_year.gir} />
              <StatTile label="3-Putts" value={career_totals.one_year.three_putts} />
              <StatTile label="Doubles" value={career_totals.one_year.double_bogeys} />
              <StatTile label="Triples" value={career_totals.one_year.triple_bogeys} />
              <StatTile label="Quad+" value={career_totals.one_year.quad_bogeys_plus} />
              <StatTile label="Hole-in-Ones" value={career_totals.one_year.hole_in_ones} />
            </>
          )}
        </div>
      </Card>

      {/* Career Score Mix */}
      <Card title="Career Score Mix">
        <div className="relative">
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie
                data={donutData}
                dataKey="value"
                cx="50%"
                cy="50%"
                innerRadius={44}
                outerRadius={60}
                stroke="none"
                paddingAngle={2}
              >
                {donutData.map((d) => (
                  <Cell key={d.name} fill={scoreColors[d.name]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={((v: number, name: string) => [`${v.toFixed(1)}%`, SCORE_LABELS[name] ?? name]) as Fmt}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-xl font-bold text-gray-900">{totalHoles}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">holes</div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          {donutData.map((d) => (
            <div key={d.name} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: scoreColors[d.name] }} />
              <span className="text-xs text-gray-500 flex-1">{SCORE_LABELS[d.name] ?? d.name}</span>
              <span className="text-xs font-semibold text-gray-700 tabular-nums">{d.value.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Player Profile Radar */}
      <Card title="Player Profile">
        <UserRadarChart
          kpis={data.kpis}
          scoringByPar={data.scoring_by_par}
          height={180}
          outerRadius={70}
          primaryColor={trendPrimary}
          gridColor={gridColor}
          axisColor={neutralColor}
        />
      </Card>

      {/* Round Records */}
      <Card title="Round Records">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[400px] text-sm">
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
                  <td className="py-2.5 text-xs text-gray-400 truncate max-w-[140px]">{row.meta ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Milestones — tabbed */}
      <Card title="Milestones">
        <div className="flex gap-2 mb-4">
          {([
            { key: "career", label: "Career" },
            { key: "putting", label: "Putting" },
            { key: "gir", label: "GIR" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setMilestoneTab(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                milestoneTab === key ? "bg-primary text-white shadow-sm" : "bg-gray-100 text-gray-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {milestoneTab === "career" && (
          <div className="space-y-2.5">
            {w === "lifetime" ? (
              <>
                {scoreBreaksAbove70.map((row) => (
                  <MilestoneBar key={row.threshold} label={`Break ${row.threshold}`} achieved={row.achievement != null} color={successColor} />
                ))}
                <MilestoneBar label="Round Under Par" achieved={round_milestones.lifetime.first_round_under_par != null} color={successColor} />
                {scoreBreaks70AndBelow.map((row) => (
                  <MilestoneBar key={row.threshold} label={`Break ${row.threshold}`} achieved={row.achievement != null} color={successColor} />
                ))}
                <MilestoneBar label="First Eagle" achieved={round_milestones.lifetime.first_eagle != null} color={successColor} />
                <MilestoneBar label="Hole-in-One" achieved={round_milestones.lifetime.first_hole_in_one != null} color={successColor} />
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-2">
                  {round_milestones.one_year.new_personal_records_achieved_count} new personal records in the last {window_days} days.
                </p>
                {round_milestones.one_year.new_personal_records_achieved.map((pr) => (
                  <MilestoneBar key={pr} label={pr} achieved={true} color={successColor} />
                ))}
                {round_milestones.one_year.new_personal_records_achieved.length === 0 && (
                  <p className="text-xs text-gray-400">No new records yet — keep playing!</p>
                )}
              </>
            )}
          </div>
        )}

        {milestoneTab === "putting" && (
          <div className="space-y-2.5">
            {putting_milestones.lifetime.putt_breaks.map((row) => {
              const achieved = w === "lifetime"
                ? row.achievement != null
                : row.achievement != null && isWithinLastDays(row.achievement.date, window_days);
              return (
                <MilestoneBar key={row.threshold} label={`Break ${row.threshold} Putts`} achieved={achieved} color={successColor} />
              );
            })}
          </div>
        )}

        {milestoneTab === "gir" && (
          <div className="space-y-2.5">
            {gir_milestones.lifetime.gir_breaks.map((row) => {
              const achieved = w === "lifetime"
                ? row.achievement != null
                : row.achievement != null && isWithinLastDays(row.achievement.date, window_days);
              return (
                <MilestoneBar key={row.threshold} label={`${row.threshold}/18 GIR`} achieved={achieved} color={successColor} />
              );
            })}
          </div>
        )}
      </Card>

    </div>
  );
}
