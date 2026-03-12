import { Trophy, Target, CircleDot, Star, Zap, TrendingDown } from "lucide-react";
import type { Milestone } from "@/types/golf";

const ICON_MAP: Record<Milestone["type"], React.ElementType> = {
  score_break: Trophy,
  gir_break: Target,
  putt_break: CircleDot,
  eagle: Star,
  hole_in_one: Zap,
  under_par: TrendingDown,
  par_streak: Trophy,
  birdie_streak: Star,
};

const COLOR_MAP: Record<Milestone["type"], string> = {
  score_break: "bg-amber-50 text-amber-500",
  gir_break:   "bg-emerald-50 text-emerald-500",
  putt_break:  "bg-sky-50 text-sky-500",
  eagle:       "bg-purple-50 text-purple-500",
  hole_in_one: "bg-rose-50 text-rose-500",
  under_par:   "bg-primary/8 text-primary",
  par_streak:  "bg-indigo-50 text-indigo-500",
  birdie_streak: "bg-fuchsia-50 text-fuchsia-500",
};

function parseDate(raw: string): string {
  // raw is "YYYY/M/D"
  const [y, m, d] = raw.split("/").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface MilestoneFeedProps {
  milestones: Milestone[];
}

export function MilestoneFeed({ milestones }: MilestoneFeedProps) {
  if (milestones.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4">
        No milestones yet — keep playing!
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {milestones.map((m, i) => {
        const Icon = ICON_MAP[m.type];
        const color = COLOR_MAP[m.type];
        return (
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50/80 transition-colors"
          >
            <div className={`p-2 rounded-lg shrink-0 ${color}`}>
              <Icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 leading-tight">
                {m.label}
              </p>
              <p className="text-xs text-gray-400 truncate mt-0.5">
                {m.course}
              </p>
            </div>
            <span className="text-xs text-gray-400 shrink-0 tabular-nums">
              {parseDate(m.date)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
