import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { Round } from "@/types/golf";
import { formatToPar } from "@/types/golf";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScorecardGrid } from "@/components/round-detail/ScorecardGrid";

export function RoundDetailPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roundId) return;
    api.getRound(roundId).then((r) => {
      setRound(r);
      setLoading(false);
    });
  }, [roundId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading round...</div>
      </div>
    );
  }

  if (!round) return <div>Round not found</div>;

  const totalScore = round.hole_scores.reduce(
    (sum, s) => sum + (s.strokes ?? 0),
    0
  );
  const coursePar =
    round.course?.holes.reduce((sum, h) => sum + (h.par ?? 0), 0) ?? null;
  const toPar = coursePar !== null ? totalScore - coursePar : null;

  return (
    <div>
      <Link
        to="/rounds"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary mb-4"
      >
        <ArrowLeft size={16} />
        Back to Rounds
      </Link>

      <PageHeader
        title={round.course?.name ?? "Unknown Course"}
        subtitle={
          [
            round.date
              ? new Date(round.date).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : null,
            round.notes,
          ]
            .filter(Boolean)
            .join(" — ")
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">Score</div>
          <div className="text-3xl font-bold text-gray-900">{totalScore}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">To Par</div>
          <div
            className={`text-3xl font-bold ${
              toPar !== null && toPar < 0
                ? "text-green-600"
                : toPar !== null && toPar > 0
                ? "text-red-500"
                : "text-gray-900"
            }`}
          >
            {formatToPar(toPar)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">Tee</div>
          <div className="text-lg font-semibold text-gray-900">
            {round.tee_box ?? "-"}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">Course Par</div>
          <div className="text-lg font-semibold text-gray-900">
            {coursePar ?? "-"}
          </div>
        </div>
      </div>

      <ScorecardGrid round={round} />
    </div>
  );
}
