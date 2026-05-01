import { Trophy } from "lucide-react";
import type { RoundSummary } from "@/types/golf";

interface BestRoundHighlightProps {
  rounds: RoundSummary[];
}

export function BestRoundHighlight({ rounds }: BestRoundHighlightProps) {
  const validRounds = rounds.filter((r) => r.total_score != null);
  if (validRounds.length === 0) {
    return (
      <div className="text-center text-sm text-gray-500 p-4">
        Play a round to unlock highlights!
      </div>
    );
  }

  const best = validRounds.reduce((prev, curr) => {
    return curr.total_score! < prev.total_score! ? curr : prev;
  });

  const parsedDate = best.date ? new Date(best.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  const diffStr = best.to_par != null ? `To Par: ${best.to_par > 0 ? "+" + best.to_par : best.to_par}` : "";

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shadow-sm border border-amber-200">
          <Trophy size={22} className="mt-0.5" />
        </div>
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
            Best Recent Round
          </div>
          <div className="font-bold text-gray-900 leading-tight">
            {best.course_name ?? "Unknown Course"}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {parsedDate} {diffStr ? `· ${diffStr}` : ""}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-4xl font-black text-gray-900 tracking-tighter">
          {best.total_score}
        </div>
      </div>
    </div>
  );
}
