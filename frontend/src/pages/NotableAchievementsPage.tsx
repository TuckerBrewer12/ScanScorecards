import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AnalyticsData } from "@/types/analytics";
import { PageHeader } from "@/components/layout/PageHeader";

function Card({
  title,
  value,
}: {
  title: string;
  value: number | string | null | undefined;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-gray-500">{title}</div>
      <div className="text-lg font-semibold text-gray-900">{value ?? "—"}</div>
    </div>
  );
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
    home_course_records,
    putting_milestones,
    round_milestones,
    window_days,
  } = data.notable_achievements;
  const showHomeCourseRecords = home_course_records.lifetime.home_course_name != null;

  return (
    <div>
      <PageHeader title="Notable Achievements" subtitle="Structured player achievement records" />

      <div className="space-y-8">
        <div>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">1. Scoring Records</h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Group title="Lifetime">
              <Card title="Lowest Round" value={scoring_records.lifetime.lowest_round} />
              <Card title="Highest Round" value={scoring_records.lifetime.highest_round} />
              <Card title="Lowest 9 Holes" value={scoring_records.lifetime.lowest_9_holes} />
              <Card title="Most Birdies in a Round" value={scoring_records.lifetime.most_birdies_in_round} />
              <Card title="Most Eagles in a Round" value={scoring_records.lifetime.most_eagles_in_round} />
              <Card title="Most GIR in a Round" value={scoring_records.lifetime.most_gir_in_round} />
              <Card title="Fewest Putts in a Round" value={scoring_records.lifetime.fewest_putts_in_round} />
            </Group>
            <Group title={`Last ${window_days} Days`}>
              <Card title="Lowest Round" value={scoring_records.one_year.lowest_round} />
              <Card title="Most Birdies in a Round" value={scoring_records.one_year.most_birdies_in_round} />
              <Card title="Most GIR in a Round" value={scoring_records.one_year.most_gir_in_round} />
              <Card title="Fewest Putts in a Round" value={scoring_records.one_year.fewest_putts_in_round} />
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
              <Card title="Longest Birdie Streak" value={best_performance_streaks.lifetime.longest_birdie_streak} />
              <Card title="Longest Par Streak" value={best_performance_streaks.lifetime.longest_par_streak} />
              <Card title="Most GIR in a Row" value={best_performance_streaks.lifetime.most_gir_in_a_row} />
              <Card title="Longest 2-Putt or Less Streak" value={best_performance_streaks.lifetime.longest_2_putt_or_less_streak} />
            </Group>
            <Group title={`Last ${window_days} Days`}>
              <Card title="Longest Birdie Streak" value={best_performance_streaks.one_year.longest_birdie_streak} />
              <Card title="Longest Par Streak" value={best_performance_streaks.one_year.longest_par_streak} />
              <Card title="Most GIR in a Row" value={best_performance_streaks.one_year.most_gir_in_a_row} />
              <Card title="Longest 2-Putt or Less Streak" value={best_performance_streaks.one_year.longest_2_putt_or_less_streak} />
            </Group>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">4. Home Course Records</h2>
          {showHomeCourseRecords ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <Group title="Lifetime">
                <Card title="Home Course" value={home_course_records.lifetime.home_course_name} />
                <Card title="Lowest Score on Home Course" value={home_course_records.lifetime.lowest_score_on_home_course} />
                <Card title="Most Rounds Played at Home Course" value={home_course_records.lifetime.most_rounds_played_at_home_course} />
              </Group>
              <Group title={`Last ${window_days} Days`}>
                <Card title="Home Course" value={home_course_records.one_year.home_course_name} />
                <Card title="Lowest Score on Home Course" value={home_course_records.one_year.lowest_score_on_home_course} />
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
              <Card title="Fewest Putts in a Round" value={putting_milestones.lifetime.fewest_putts_in_round} />
              <Card title="Most 1-Putts in a Round" value={putting_milestones.lifetime.most_1_putts_in_round} />
              <Card title="Most 3-Putts in a Round" value={putting_milestones.lifetime.most_3_putts_in_round} />
            </Group>
            <Group title={`Last ${window_days} Days`}>
              <Card title="Fewest Putts in a Round" value={putting_milestones.one_year.fewest_putts_in_round} />
              <Card title="Most 1-Putts in a Round" value={putting_milestones.one_year.most_1_putts_in_round} />
              <Card title="Most 3-Putts in a Round" value={putting_milestones.one_year.most_3_putts_in_round} />
            </Group>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">6. Round Milestones</h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Group title="Lifetime">
              <Card title="First Round Under 100" value={round_milestones.lifetime.first_round_under_100} />
              <Card title="First Round Under 90" value={round_milestones.lifetime.first_round_under_90} />
              <Card title="First Round Under 80" value={round_milestones.lifetime.first_round_under_80} />
              <Card title="First Round Under 70" value={round_milestones.lifetime.first_round_under_70} />
              <Card title="First Eagle" value={round_milestones.lifetime.first_eagle} />
              <Card title="First Hole-in-One" value={round_milestones.lifetime.first_hole_in_one} />
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
