import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AnalyticsData } from "@/types/analytics";
import { PageHeader } from "@/components/layout/PageHeader";

function MetricRow({
  label,
  value,
  meta,
}: {
  label: string;
  value: number | string | null | undefined;
  meta?: string | null;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-base font-semibold text-gray-900">{value ?? "—"}</div>
      {meta ? <div className="text-xs text-gray-500">{meta}</div> : null}
    </div>
  );
}

function SectionCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 ${className ?? ""}`}>
      <div className="text-sm font-semibold text-gray-700 mb-3">{title}</div>
      <div className="grid grid-cols-2 gap-3 text-sm">{children}</div>
    </div>
  );
}

function eventMeta(event: { date: string; course: string } | null | undefined): string | null {
  if (!event) return null;
  return `${event.date} — ${event.course}`;
}

type TimeWindow = "lifetime" | "one_year";

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
    home_course_records,
    home_course_records_events,
    putting_milestones,
    putting_milestones_events,
    gir_milestones,
    gir_milestones_events,
    round_milestones,
    scoring_records_events,
    window_days,
  } = data.notable_achievements;
  const showHomeCourseRecords = home_course_records.lifetime.home_course_name != null;

  const w = timeWindow;

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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Round Records */}
        <SectionCard title="Round Records">
          <MetricRow label="Lowest Round" value={scoring_records[w].lowest_round} meta={eventMeta(scoring_records_events[w].lowest_round)} />
          {w === "lifetime" && (
            <>
              <MetricRow label="Highest Round" value={scoring_records.lifetime.highest_round} meta={eventMeta(scoring_records_events.lifetime.highest_round)} />
              <MetricRow label="Lowest 9 Holes" value={scoring_records.lifetime.lowest_9_holes} meta={eventMeta(scoring_records_events.lifetime.lowest_9_holes)} />
              <MetricRow label="Most Eagles in a Round" value={scoring_records.lifetime.most_eagles_in_round} meta={eventMeta(scoring_records_events.lifetime.most_eagles_in_round)} />
            </>
          )}
          <MetricRow label="Most Birdies in a Round" value={scoring_records[w].most_birdies_in_round} meta={eventMeta(scoring_records_events[w].most_birdies_in_round)} />
          <MetricRow label="Most GIR in a Round" value={scoring_records[w].most_gir_in_round} meta={eventMeta(scoring_records_events[w].most_gir_in_round)} />
          <MetricRow label="Fewest Putts in a Round" value={scoring_records[w].fewest_putts_in_round} meta={eventMeta(scoring_records_events[w].fewest_putts_in_round)} />
        </SectionCard>

        {/* Career Totals */}
        <SectionCard title={w === "lifetime" ? "Career Totals" : "Year Totals"}>
          {w === "lifetime" ? (
            <>
              <MetricRow label="Total Rounds Played" value={career_totals.lifetime.total_rounds_played} />
              <MetricRow label="Total Holes Played" value={career_totals.lifetime.total_holes_played} />
              <MetricRow label="Total Birdies" value={career_totals.lifetime.total_birdies} />
              <MetricRow label="Total Eagles" value={career_totals.lifetime.total_eagles} />
              <MetricRow label="Total Hole-in-Ones" value={career_totals.lifetime.total_hole_in_ones} />
              <MetricRow label="Total Pars" value={career_totals.lifetime.total_pars} />
              <MetricRow label="Total Bogeys" value={career_totals.lifetime.total_bogeys} />
              <MetricRow label="Total Double Bogeys" value={career_totals.lifetime.total_double_bogeys} />
              <MetricRow label="Total Triple Bogeys" value={career_totals.lifetime.total_triple_bogeys} />
              <MetricRow label="Total Quad Bogeys+" value={career_totals.lifetime.total_quad_bogeys_plus} />
              <MetricRow label="Total GIR" value={career_totals.lifetime.total_gir} />
              <MetricRow label="Total 3-Putts" value={career_totals.lifetime.total_3_putts} />
            </>
          ) : (
            <>
              <MetricRow label="Rounds Played" value={career_totals.one_year.rounds_played} />
              <MetricRow label="Birdies" value={career_totals.one_year.birdies} />
              <MetricRow label="Eagles" value={career_totals.one_year.eagles} />
              <MetricRow label="Hole-in-Ones" value={career_totals.one_year.hole_in_ones} />
              <MetricRow label="GIR" value={career_totals.one_year.gir} />
              <MetricRow label="Double Bogeys" value={career_totals.one_year.double_bogeys} />
              <MetricRow label="Triple Bogeys" value={career_totals.one_year.triple_bogeys} />
              <MetricRow label="Quad Bogeys+" value={career_totals.one_year.quad_bogeys_plus} />
              <MetricRow label="3-Putts" value={career_totals.one_year.three_putts} />
            </>
          )}
        </SectionCard>

        {/* Best Performance Streaks */}
        <SectionCard title="Best Performance Streaks">
          <MetricRow label="Longest Birdie Streak" value={best_performance_streaks[w].longest_birdie_streak} meta={eventMeta(best_performance_streaks_events[w].longest_birdie_streak)} />
          <MetricRow label="Longest Par Streak" value={best_performance_streaks[w].longest_par_streak} meta={eventMeta(best_performance_streaks_events[w].longest_par_streak)} />
          <MetricRow label="Most GIR in a Row" value={best_performance_streaks[w].most_gir_in_a_row} meta={eventMeta(best_performance_streaks_events[w].most_gir_in_a_row)} />
          <MetricRow label="Longest 2-Putt or Less Streak" value={best_performance_streaks[w].longest_2_putt_or_less_streak} meta={eventMeta(best_performance_streaks_events[w].longest_2_putt_or_less_streak)} />
        </SectionCard>

        {/* Home Course Records */}
        <SectionCard title="Home Course Records">
          {showHomeCourseRecords ? (
            <>
              <MetricRow label="Home Course" value={home_course_records[w].home_course_name} />
              <MetricRow
                label="Lowest Score on Home Course"
                value={home_course_records[w].lowest_score_on_home_course}
                meta={eventMeta(home_course_records_events[w].lowest_score_on_home_course)}
              />
              {w === "lifetime" && (
                <MetricRow label="Most Rounds Played at Home Course" value={home_course_records.lifetime.most_rounds_played_at_home_course} />
              )}
            </>
          ) : (
            <div className="col-span-2 text-sm text-gray-600">No home course set.</div>
          )}
        </SectionCard>

        {/* Putting Milestones */}
        <SectionCard title="Putting Milestones">
          <MetricRow label="Fewest Putts in a Round" value={putting_milestones[w].fewest_putts_in_round} meta={eventMeta(putting_milestones_events[w].fewest_putts_in_round)} />
          <MetricRow label="Most 1-Putts in a Round" value={putting_milestones[w].most_1_putts_in_round} meta={eventMeta(putting_milestones_events[w].most_1_putts_in_round)} />
          <MetricRow label="Most 3-Putts in a Round" value={putting_milestones[w].most_3_putts_in_round} meta={eventMeta(putting_milestones_events[w].most_3_putts_in_round)} />
          {w === "lifetime"
            ? putting_milestones.lifetime.putt_breaks.map((row) => (
                <MetricRow key={row.threshold} label={`First Round Under ${row.threshold} Putts`} value={row.achievement ? "Achieved" : "—"} meta={eventMeta(row.achievement)} />
              ))
            : <MetricRow label="Lifetime Putting Milestones Achieved" value={putting_milestones.one_year.putting_milestones_achieved_from_lifetime_set} />
          }
        </SectionCard>

        {/* GIR Milestones */}
        <SectionCard title="GIR Milestones">
          <MetricRow
            label="Highest GIR % in a Round"
            value={w === "lifetime"
              ? (gir_milestones.lifetime.highest_gir_percentage_in_round != null ? `${gir_milestones.lifetime.highest_gir_percentage_in_round.toFixed(1)}%` : "—")
              : (gir_milestones.one_year.highest_gir_percentage != null ? `${gir_milestones.one_year.highest_gir_percentage.toFixed(1)}%` : "—")
            }
            meta={w === "lifetime" ? eventMeta(gir_milestones_events.lifetime.highest_gir_percentage_in_round) : eventMeta(gir_milestones_events.one_year.highest_gir_percentage)}
          />
          {w === "lifetime" ? (
            <>
              <MetricRow label="Most GIR in a Round" value={gir_milestones.lifetime.most_gir_in_round} meta={eventMeta(gir_milestones_events.lifetime.most_gir_in_round)} />
              {gir_milestones.lifetime.gir_breaks.map((row) => (
                <MetricRow key={row.threshold} label={`First Round with ${row.threshold}/18 GIR`} value={row.achievement ? "Achieved" : "—"} meta={eventMeta(row.achievement)} />
              ))}
            </>
          ) : (
            <>
              <MetricRow label="Best GIR Round" value={gir_milestones.one_year.best_gir_in_round} meta={eventMeta(gir_milestones.one_year.best_gir_round)} />
              <MetricRow label="Lifetime GIR Milestones Achieved" value={gir_milestones.one_year.gir_milestones_achieved_from_lifetime_set} />
            </>
          )}
        </SectionCard>

        {/* Scoring Milestones */}
        <SectionCard title="Scoring Milestones" className="xl:col-span-2">
          {w === "lifetime" ? (
            <>
              {round_milestones.lifetime.score_breaks.map((row) => (
                <MetricRow key={row.threshold} label={`First Round Under ${row.threshold}`} value={row.achievement ? "Achieved" : "—"} meta={eventMeta(row.achievement)} />
              ))}
              <MetricRow
                label="First Round Under Par"
                value={round_milestones.lifetime.first_round_under_par?.score ?? "—"}
                meta={eventMeta(round_milestones.lifetime.first_round_under_par)}
              />
              <MetricRow label="First Eagle" value={round_milestones.lifetime.first_eagle ? "Achieved" : "—"} meta={eventMeta(round_milestones.lifetime.first_eagle)} />
              <MetricRow label="First Hole-in-One" value={round_milestones.lifetime.first_hole_in_one ? "Achieved" : "—"} meta={eventMeta(round_milestones.lifetime.first_hole_in_one)} />
            </>
          ) : (
            <>
              <MetricRow label="New Personal Records Achieved" value={round_milestones.one_year.new_personal_records_achieved_count} />
              {round_milestones.one_year.new_personal_records_achieved.map((pr) => (
                <MetricRow key={pr} label={pr} value="New PR" />
              ))}
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
