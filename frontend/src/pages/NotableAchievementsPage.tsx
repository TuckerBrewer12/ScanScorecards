import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AnalyticsData } from "@/types/analytics";
import { PageHeader } from "@/components/layout/PageHeader";

function Card({
  title,
  value,
  meta,
}: {
  title: string;
  value: number | string | null | undefined;
  meta?: string | null;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-gray-500">{title}</div>
      <div className="text-lg font-semibold text-gray-900">{value ?? "—"}</div>
      {meta ? <div className="text-xs text-gray-500 mt-0.5">{meta}</div> : null}
    </div>
  );
}

function EventCard({
  title,
  event,
}: {
  title: string;
  event: { date: string; course: string } | null | undefined;
}) {
  const value = event ? `${event.date} — ${event.course}` : "—";
  return <Card title={title} value={value} />;
}

function eventMeta(event: { date: string; course: string } | null | undefined): string | null {
  if (!event) return null;
  return `${event.date} — ${event.course}`;
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="text-sm font-semibold text-gray-700 mb-4">{title}</div>
      <div className="grid grid-cols-2 gap-3 text-sm">{children}</div>
    </div>
  );
}

export function NotableAchievementsPage({ userId }: { userId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

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
        <div className="text-gray-400">Loading notable achievements...</div>
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

  return (
    <div>
      <PageHeader title="Notable Achievements" subtitle="Structured player achievement records" />

      <div className="space-y-8">
        <div>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">1. Round Records</h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Group title="Lifetime">
              <Card title="Lowest Round" value={scoring_records.lifetime.lowest_round} meta={eventMeta(scoring_records_events.lifetime.lowest_round)} />
              <Card title="Highest Round" value={scoring_records.lifetime.highest_round} meta={eventMeta(scoring_records_events.lifetime.highest_round)} />
              <Card title="Lowest 9 Holes" value={scoring_records.lifetime.lowest_9_holes} meta={eventMeta(scoring_records_events.lifetime.lowest_9_holes)} />
              <Card title="Most Birdies in a Round" value={scoring_records.lifetime.most_birdies_in_round} meta={eventMeta(scoring_records_events.lifetime.most_birdies_in_round)} />
              <Card title="Most Eagles in a Round" value={scoring_records.lifetime.most_eagles_in_round} meta={eventMeta(scoring_records_events.lifetime.most_eagles_in_round)} />
              <Card title="Most GIR in a Round" value={scoring_records.lifetime.most_gir_in_round} meta={eventMeta(scoring_records_events.lifetime.most_gir_in_round)} />
              <Card title="Fewest Putts in a Round" value={scoring_records.lifetime.fewest_putts_in_round} meta={eventMeta(scoring_records_events.lifetime.fewest_putts_in_round)} />
            </Group>
            <Group title={`Last ${window_days} Days`}>
              <Card title="Lowest Round" value={scoring_records.one_year.lowest_round} meta={eventMeta(scoring_records_events.one_year.lowest_round)} />
              <Card title="Most Birdies in a Round" value={scoring_records.one_year.most_birdies_in_round} meta={eventMeta(scoring_records_events.one_year.most_birdies_in_round)} />
              <Card title="Most GIR in a Round" value={scoring_records.one_year.most_gir_in_round} meta={eventMeta(scoring_records_events.one_year.most_gir_in_round)} />
              <Card title="Fewest Putts in a Round" value={scoring_records.one_year.fewest_putts_in_round} meta={eventMeta(scoring_records_events.one_year.fewest_putts_in_round)} />
            </Group>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">2. Career Totals</h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Group title="Lifetime">
              <Card title="Total Rounds Played" value={career_totals.lifetime.total_rounds_played} />
              <Card title="Total Holes Played" value={career_totals.lifetime.total_holes_played} />
              <Card title="Total Birdies" value={career_totals.lifetime.total_birdies} />
              <Card title="Total Eagles" value={career_totals.lifetime.total_eagles} />
              <Card title="Total Hole-in-Ones" value={career_totals.lifetime.total_hole_in_ones} />
              <Card title="Total Pars" value={career_totals.lifetime.total_pars} />
              <Card title="Total Bogeys" value={career_totals.lifetime.total_bogeys} />
              <Card title="Total Double Bogeys+" value={career_totals.lifetime.total_double_bogeys_plus} />
              <Card title="Total Triple Bogeys" value={career_totals.lifetime.total_triple_bogeys} />
              <Card title="Total GIR" value={career_totals.lifetime.total_gir} />
              <Card title="Total 3-Putts" value={career_totals.lifetime.total_3_putts} />
            </Group>
            <Group title={`Last ${window_days} Days`}>
              <Card title="Rounds Played" value={career_totals.one_year.rounds_played} />
              <Card title="Birdies" value={career_totals.one_year.birdies} />
              <Card title="Eagles" value={career_totals.one_year.eagles} />
              <Card title="Hole-in-Ones" value={career_totals.one_year.hole_in_ones} />
              <Card title="GIR" value={career_totals.one_year.gir} />
              <Card title="Triple Bogeys" value={career_totals.one_year.triple_bogeys} />
              <Card title="3-Putts" value={career_totals.one_year.three_putts} />
            </Group>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">3. Best Performance Streaks</h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Group title="Lifetime">
              <Card title="Longest Birdie Streak" value={best_performance_streaks.lifetime.longest_birdie_streak} meta={eventMeta(best_performance_streaks_events.lifetime.longest_birdie_streak)} />
              <Card title="Longest Par Streak" value={best_performance_streaks.lifetime.longest_par_streak} meta={eventMeta(best_performance_streaks_events.lifetime.longest_par_streak)} />
              <Card title="Most GIR in a Row" value={best_performance_streaks.lifetime.most_gir_in_a_row} meta={eventMeta(best_performance_streaks_events.lifetime.most_gir_in_a_row)} />
              <Card title="Longest 2-Putt or Less Streak" value={best_performance_streaks.lifetime.longest_2_putt_or_less_streak} meta={eventMeta(best_performance_streaks_events.lifetime.longest_2_putt_or_less_streak)} />
            </Group>
            <Group title={`Last ${window_days} Days`}>
              <Card title="Longest Birdie Streak" value={best_performance_streaks.one_year.longest_birdie_streak} meta={eventMeta(best_performance_streaks_events.one_year.longest_birdie_streak)} />
              <Card title="Longest Par Streak" value={best_performance_streaks.one_year.longest_par_streak} meta={eventMeta(best_performance_streaks_events.one_year.longest_par_streak)} />
              <Card title="Most GIR in a Row" value={best_performance_streaks.one_year.most_gir_in_a_row} meta={eventMeta(best_performance_streaks_events.one_year.most_gir_in_a_row)} />
              <Card title="Longest 2-Putt or Less Streak" value={best_performance_streaks.one_year.longest_2_putt_or_less_streak} meta={eventMeta(best_performance_streaks_events.one_year.longest_2_putt_or_less_streak)} />
            </Group>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">4. Home Course Records</h2>
          {showHomeCourseRecords ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <Group title="Lifetime">
                <Card title="Home Course" value={home_course_records.lifetime.home_course_name} />
                <Card
                  title="Lowest Score on Home Course"
                  value={home_course_records.lifetime.lowest_score_on_home_course}
                  meta={eventMeta(home_course_records_events.lifetime.lowest_score_on_home_course)}
                />
                <Card title="Most Rounds Played at Home Course" value={home_course_records.lifetime.most_rounds_played_at_home_course} />
              </Group>
              <Group title={`Last ${window_days} Days`}>
                <Card title="Home Course" value={home_course_records.one_year.home_course_name} />
                <Card
                  title="Lowest Score on Home Course"
                  value={home_course_records.one_year.lowest_score_on_home_course}
                  meta={eventMeta(home_course_records_events.one_year.lowest_score_on_home_course)}
                />
              </Group>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 text-sm text-gray-600">
              No home course set.
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">5. Putting Milestones</h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Group title="Lifetime">
              {putting_milestones.lifetime.putt_breaks.map((row) => (
                <EventCard
                  key={row.threshold}
                  title={`First Round Under ${row.threshold} Putts`}
                  event={row.achievement}
                />
              ))}
              <Card title="Fewest Putts in a Round" value={putting_milestones.lifetime.fewest_putts_in_round} meta={eventMeta(putting_milestones_events.lifetime.fewest_putts_in_round)} />
              <Card title="Most 1-Putts in a Round" value={putting_milestones.lifetime.most_1_putts_in_round} meta={eventMeta(putting_milestones_events.lifetime.most_1_putts_in_round)} />
              <Card title="Most 3-Putts in a Round" value={putting_milestones.lifetime.most_3_putts_in_round} meta={eventMeta(putting_milestones_events.lifetime.most_3_putts_in_round)} />
            </Group>
            <Group title={`Last ${window_days} Days`}>
              <Card title="Fewest Putts in a Round" value={putting_milestones.one_year.fewest_putts_in_round} meta={eventMeta(putting_milestones_events.one_year.fewest_putts_in_round)} />
              <Card title="Most 1-Putts in a Round" value={putting_milestones.one_year.most_1_putts_in_round} meta={eventMeta(putting_milestones_events.one_year.most_1_putts_in_round)} />
              <Card title="Most 3-Putts in a Round" value={putting_milestones.one_year.most_3_putts_in_round} meta={eventMeta(putting_milestones_events.one_year.most_3_putts_in_round)} />
              <Card
                title="Lifetime Putting Milestones Achieved"
                value={putting_milestones.one_year.putting_milestones_achieved_from_lifetime_set}
              />
            </Group>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">6. GIR Milestones</h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Group title="Lifetime">
              {gir_milestones.lifetime.gir_breaks.map((row) => (
                <EventCard
                  key={row.threshold}
                  title={`First Round with ${row.threshold}/18 GIR`}
                  event={row.achievement}
                />
              ))}
              <Card
                title="Highest GIR % in a Round"
                value={
                  gir_milestones.lifetime.highest_gir_percentage_in_round != null
                    ? `${gir_milestones.lifetime.highest_gir_percentage_in_round.toFixed(1)}%`
                    : "—"
                }
                meta={eventMeta(gir_milestones_events.lifetime.highest_gir_percentage_in_round)}
              />
              <Card
                title="Most GIR in a Round"
                value={gir_milestones.lifetime.most_gir_in_round}
                meta={eventMeta(gir_milestones_events.lifetime.most_gir_in_round)}
              />
            </Group>
            <Group title={`Last ${window_days} Days`}>
              <Card title="Best GIR Round" value={gir_milestones.one_year.best_gir_in_round} meta={eventMeta(gir_milestones.one_year.best_gir_round)} />
              <Card
                title="Highest GIR %"
                value={
                  gir_milestones.one_year.highest_gir_percentage != null
                    ? `${gir_milestones.one_year.highest_gir_percentage.toFixed(1)}%`
                    : "—"
                }
                meta={eventMeta(gir_milestones_events.one_year.highest_gir_percentage)}
              />
              <Card
                title="Lifetime GIR Milestones Achieved"
                value={gir_milestones.one_year.gir_milestones_achieved_from_lifetime_set}
              />
            </Group>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">7. Scoring Milestones</h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Group title="Lifetime">
              {round_milestones.lifetime.score_breaks.map((row) => (
                <EventCard
                  key={row.threshold}
                  title={`First Round Under ${row.threshold}`}
                  event={row.achievement}
                />
              ))}
              <EventCard title="First Eagle" event={round_milestones.lifetime.first_eagle} />
              <EventCard title="First Hole-in-One" event={round_milestones.lifetime.first_hole_in_one} />
            </Group>
            <Group title={`Last ${window_days} Days`}>
              <Card title="New Personal Records Achieved" value={round_milestones.one_year.new_personal_records_achieved_count} />
              <Card title="Records" value={round_milestones.one_year.new_personal_records_achieved.join(", ") || "—"} />
            </Group>
          </div>
        </div>
      </div>
    </div>
  );
}
