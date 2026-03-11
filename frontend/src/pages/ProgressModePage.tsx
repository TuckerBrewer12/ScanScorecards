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
  levelDescriptions: string[];
};

type ChallengeLevels = {
  gir: number;
  putting: number;
  scoring: number;
};

function LevelDots({
  selected,
  totalLevels,
  onSelect,
}: {
  selected: number;
  totalLevels: number;
  onSelect: (level: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: totalLevels }, (_, i) => i + 1).map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onSelect(level)}
          className={`h-3.5 w-3.5 rounded-full border transition focus:outline-none focus:ring-2 focus:ring-emerald-400/50 ${
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
  const selectedGoal = challenge.levelDescriptions[level - 1] ?? "";
  const isCompletedLevel = challenge.achieved >= target;

  return (
    <div className="rounded-2xl border border-emerald-300 bg-emerald-400/15 shadow-sm p-6 md:p-8">
      <div className="flex items-center justify-between gap-4 pb-4 mb-5 border-b border-emerald-300/70">
        <div className="text-xs font-semibold uppercase tracking-wider text-emerald-900/70">Challenge Level</div>
        <div className="rounded-full bg-emerald-100 border border-emerald-300 px-3 py-1.5">
          <LevelDots selected={level} totalLevels={challenge.targets.length} onSelect={onLevelChange} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[auto,1fr,auto] md:items-start gap-5 md:gap-6">
        <div className="h-14 w-14 rounded-xl bg-emerald-500/20 border border-emerald-300 flex items-center justify-center">
          <Icon size={24} className="text-emerald-800" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-2xl font-extrabold tracking-wide text-emerald-900 uppercase">{challenge.title}</div>
          <div className="mt-1 text-lg text-emerald-900/80">{challenge.subtitle}</div>
          <div className="mt-2 text-sm font-semibold text-emerald-900/90">
            {isCompletedLevel ? "Completed: " : "Current goal: "}
            <span className="font-bold">{selectedGoal}</span>
          </div>
          <div className="mt-5 h-3 rounded-full bg-white/80 border border-emerald-200 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-orange-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <div className="text-left md:text-right md:pl-3">
          <div className="text-4xl font-extrabold text-emerald-950 leading-none">{progress}/{target}</div>
          <div className="mt-1 text-sm font-semibold uppercase tracking-wide text-emerald-900/70">Level {level}</div>
        </div>
      </div>
    </div>
  );
}

export function ProgressModePage({ userId }: { userId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [levels, setLevels] = useState<ChallengeLevels>({ gir: 1, putting: 1, scoring: 1 });

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
    const girBreaks = a.gir_milestones.lifetime.gir_breaks;
    const puttBreaks = a.putting_milestones.lifetime.putt_breaks;
    const scoreBreaks = a.round_milestones.lifetime.score_breaks;

    const girAchieved = girBreaks.filter((row) => row.achievement).length;
    const puttingAchieved = puttBreaks.filter((row) => row.achievement).length;
    const scoringAchieved = scoreBreaks.filter((row) => row.achievement).length;

    return [
      {
        key: "gir",
        title: "Greens Hunter",
        subtitle: "Complete GIR milestones to level up approach consistency.",
        icon: Target,
        achieved: girAchieved,
        targets: [1, 2, 3, 4, 5, 6],
        levelDescriptions: girBreaks.map((row) => `Hit ${row.threshold}/18 GIR in one round`),
      },
      {
        key: "putting",
        title: "Putter Boss",
        subtitle: "Unlock putting milestones by lowering total putts in rounds.",
        icon: Flag,
        achieved: puttingAchieved,
        targets: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        levelDescriptions: puttBreaks.map((row) => `Record ${row.threshold} putts or fewer in one round`),
      },
      {
        key: "scoring",
        title: "Score Crusher",
        subtitle: "Push scoring milestones by breaking lower score thresholds.",
        icon: Trophy,
        achieved: scoringAchieved,
        targets: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        levelDescriptions: scoreBreaks.map((row) => `Shoot ${row.threshold} or better in one round`),
      },
    ];
  }, [data]);

  useEffect(() => {
    if (challenges.length === 0) return;
    setLevels({
      gir: Math.min(challenges[0].achieved + 1, challenges[0].targets.length),
      putting: Math.min(challenges[1].achieved + 1, challenges[1].targets.length),
      scoring: Math.min(challenges[2].achieved + 1, challenges[2].targets.length),
    });
  }, [challenges]);

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
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Progress Mode" subtitle="Gamified milestone grind across GIR, putting, and scoring" />
      <div className="space-y-6 md:space-y-8">
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
