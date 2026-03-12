import { useMemo, useState, useEffect } from "react";
import { Flag, Target, Trophy } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScrollSection } from "@/components/analytics/ScrollSection";
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

type StreakAchievement = {
  key: "par_streak_18" | "birdie_streak_9";
  title: string;
  subtitle: string;
  achieved: number;
  target: number;
};

function LevelDots({
  selected,
  totalLevels,
  achieved,
  onSelect,
}: {
  selected: number;
  totalLevels: number;
  achieved: number;
  onSelect: (level: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: totalLevels }, (_, i) => i + 1).map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onSelect(level)}
          className={`h-3.5 w-3.5 rounded-full border transition focus:outline-none focus:ring-2 focus:ring-primary/30 ${
            level <= achieved
              ? "bg-primary border-primary/60"
              : level === achieved + 1
              ? "bg-primary/25 border-primary/30 hover:border-primary/50"
              : "bg-gray-100 border-gray-200 hover:border-gray-300"
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
  const totalLevels = challenge.targets.length;
  const isCompletedLevel = challenge.achieved >= target;
  const percent = totalLevels > 0 ? Math.round((challenge.achieved / totalLevels) * 100) : 0;
  const Icon = challenge.icon;
  const selectedGoal = challenge.levelDescriptions[level - 1] ?? "";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:-translate-y-0.5 hover:shadow-md hover:shadow-gray-200/50 transition-all duration-200">
      <div className="flex items-center justify-between gap-4 pb-4 mb-4 border-b border-gray-100">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Challenge Level</div>
        <div className="rounded-full bg-gray-50 border border-gray-200 px-3 py-1.5">
          <LevelDots selected={level} totalLevels={challenge.targets.length} achieved={challenge.achieved} onSelect={onLevelChange} />
        </div>
      </div>
      <div className="flex items-start gap-4 mt-4">
        <div className="h-10 w-10 rounded-xl bg-primary/8 border border-gray-100 flex items-center justify-center flex-shrink-0">
          <Icon size={20} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900">{challenge.title}</div>
          <div className="text-xs text-gray-400 mt-0.5">{challenge.subtitle}</div>
          <div className="mt-1.5 text-xs text-gray-500">
            {isCompletedLevel ? "Completed: " : "Goal: "}
            <span className="font-semibold text-gray-700">{selectedGoal}</span>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <div className="ml-auto flex-shrink-0 text-right">
          <div className="text-2xl font-bold text-gray-900 leading-none">{challenge.achieved}/{totalLevels}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Level {level}</div>
        </div>
      </div>
    </div>
  );
}

function StreakAchievementRow({ achievement }: { achievement: StreakAchievement }) {
  const progress = Math.min(achievement.achieved, achievement.target);
  const percent = achievement.target > 0 ? Math.round((progress / achievement.target) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:-translate-y-0.5 hover:shadow-md hover:shadow-gray-200/50 transition-all duration-200">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900">{achievement.title}</div>
          <div className="text-xs text-gray-400 mt-0.5">{achievement.subtitle}</div>
          <div className="mt-1.5 text-xs text-gray-500">
            Goal: <span className="font-semibold text-gray-700">{achievement.target} consecutive holes</span>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-indigo-600" style={{ width: `${percent}%` }} />
          </div>
        </div>
        <div className="ml-auto flex-shrink-0 text-right">
          <div className="text-2xl font-bold text-gray-900 leading-none">{progress}/{achievement.target}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Best streak</div>
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

  const streakAchievements = useMemo<StreakAchievement[]>(() => {
    if (!data) return [];
    const lifetimeStreaks = data.notable_achievements.best_performance_streaks.lifetime;
    const parStreak = Number(lifetimeStreaks.longest_par_streak ?? 0);
    const birdieStreak = Number(lifetimeStreaks.longest_birdie_streak ?? 0);

    return [
      {
        key: "par_streak_18",
        title: "Par Wall",
        subtitle: "Get a full 18-hole par streak in one round.",
        achieved: Number.isFinite(parStreak) ? parStreak : 0,
        target: 18,
      },
      {
        key: "birdie_streak_9",
        title: "Birdie Blitz",
        subtitle: "Get a 9-hole birdie streak in one round.",
        achieved: Number.isFinite(birdieStreak) ? birdieStreak : 0,
        target: 9,
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
      <ScrollSection>
        <div className="flex flex-col gap-6">
          {challenges.map((challenge) => (
            <ChallengeRow
              key={challenge.key}
              challenge={challenge}
              level={levels[challenge.key]}
              onLevelChange={(level) => setLevels((prev) => ({ ...prev, [challenge.key]: level }))}
            />
          ))}
        </div>
      </ScrollSection>

      <ScrollSection delay={0.1}>
        <div className="flex flex-col gap-6 mt-6">
          {streakAchievements.map((achievement) => (
            <StreakAchievementRow key={achievement.key} achievement={achievement} />
          ))}
        </div>
      </ScrollSection>
    </div>
  );
}
