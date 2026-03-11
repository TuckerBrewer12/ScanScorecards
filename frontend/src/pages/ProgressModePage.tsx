import { useMemo, useState, useEffect } from "react";
import { Flag, Target, Trophy } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { api } from "@/lib/api";
import type { AnalyticsData } from "@/types/analytics";

type Challenge = {
  key: "gir" | "putting" | "scoring";
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  achieved: number;
  targets: number[];
};

function LevelDots({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (level: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onSelect(level)}
          className={`h-3.5 w-3.5 rounded-full border transition ${
            selected >= level
              ? "bg-emerald-500 border-emerald-400"
              : "bg-white border-emerald-200 hover:border-emerald-300"
          }`}
          aria-label={`Set level ${level}`}
        />
      ))}
    </div>
  );
}

function ChallengeRow({
  challenge,
  level,
  onLevelChange,
}: {
  challenge: Challenge;
  level: number;
  onLevelChange: (level: number) => void;
}) {
  const target = challenge.targets[level - 1];
  const progress = Math.min(challenge.achieved, target);
  const percent = target > 0 ? Math.round((progress / target) * 100) : 0;
  const Icon = challenge.icon;

  return (
    <div className="relative rounded-2xl border border-emerald-300 bg-emerald-400/15 shadow-sm overflow-hidden">
      <div className="absolute left-4 -top-2.5">
        <div className="rounded-full bg-emerald-100 border border-emerald-300 px-3 py-1">
          <LevelDots selected={level} onSelect={onLevelChange} />
        </div>
      </div>
      <div className="p-5 pt-8 flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-emerald-500/20 border border-emerald-300 flex items-center justify-center">
          <Icon size={22} className="text-emerald-800" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold tracking-wide text-emerald-900 uppercase">{challenge.title}</div>
          <div className="text-sm text-emerald-900/80">{challenge.subtitle}</div>
          <div className="mt-3 h-2.5 rounded-full bg-white/80 border border-emerald-200 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-orange-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <div className="text-right pl-3">
          <div className="text-xl font-extrabold text-emerald-950">{progress}/{target}</div>
          <div className="text-xs font-semibold uppercase text-emerald-900/70">Level {level}</div>
        </div>
      </div>
    </div>
  );
}

export function ProgressModePage({ userId }: { userId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [levels, setLevels] = useState({ gir: 1, putting: 1, scoring: 1 });

  useEffect(() => {
    setLoading(true);
    api.getAnalytics(userId, 200).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [userId]);

  const challenges = useMemo<Challenge[]>(() => {
    if (!data) return [];
    const a = data.notable_achievements;

    const girAchieved = a.gir_milestones.lifetime.gir_breaks.filter((row) => row.achievement).length;
    const puttingAchieved = a.putting_milestones.lifetime.putt_breaks.filter((row) => row.achievement).length;
    const scoringAchieved =
      a.round_milestones.lifetime.score_breaks.filter((row) => row.achievement).length +
      (a.round_milestones.lifetime.first_round_under_par ? 1 : 0) +
      (a.round_milestones.lifetime.first_eagle ? 1 : 0) +
      (a.round_milestones.lifetime.first_hole_in_one ? 1 : 0);

    return [
      {
        key: "gir",
        title: "Greens Hunter",
        subtitle: "Complete GIR milestones to level up approach consistency.",
        icon: Target,
        achieved: girAchieved,
        targets: [1, 2, 3, 4, 6],
      },
      {
        key: "putting",
        title: "Putter Boss",
        subtitle: "Unlock putting milestones by lowering total putts in rounds.",
        icon: Flag,
        achieved: puttingAchieved,
        targets: [2, 4, 6, 8, 9],
      },
      {
        key: "scoring",
        title: "Score Crusher",
        subtitle: "Push scoring milestones: break score thresholds and firsts.",
        icon: Trophy,
        achieved: scoringAchieved,
        targets: [3, 6, 9, 12, 14],
      },
    ];
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading progress mode...</div>
      </div>
    );
  }

  if (!data) {
    return <div className="text-gray-500">Unable to load progress mode.</div>;
  }

  return (
    <div>
      <PageHeader title="Progress Mode" subtitle="Gamified milestone grind across GIR, putting, and scoring" />
      <div className="space-y-4">
        {challenges.map((challenge) => (
          <ChallengeRow
            key={challenge.key}
            challenge={challenge}
            level={levels[challenge.key]}
            onLevelChange={(level) => setLevels((prev) => ({ ...prev, [challenge.key]: level }))}
          />
        ))}
      </div>
    </div>
  );
}
