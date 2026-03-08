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

  const { scoring_records, window_days } = data.notable_achievements;

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
      </div>
    </div>
  );
}
