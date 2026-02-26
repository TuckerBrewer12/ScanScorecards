import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, TrendingDown, Hash, Target } from "lucide-react";
import { api } from "@/lib/api";
import type { DashboardData } from "@/types/golf";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecentRoundsTable } from "@/components/dashboard/RecentRoundsTable";

interface DashboardPageProps {
  userId: string;
}

export function DashboardPage({ userId }: DashboardPageProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDashboard(userId).then((d) => {
      setData(d);
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

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Season overview" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Rounds"
          value={data.total_rounds}
          icon={Hash}
        />
        <StatCard
          label="Scoring Average"
          value={data.scoring_average}
          icon={TrendingDown}
        />
        <StatCard
          label="Best Round"
          value={data.best_round}
          icon={Trophy}
          subtitle={data.best_round_course ?? undefined}
        />
        <StatCard
          label="Avg Putts"
          value={data.average_putts ?? "-"}
          icon={Target}
        />
      </div>

      <RecentRoundsTable rounds={data.recent_rounds} />

      <div className="mt-6 flex gap-3">
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
