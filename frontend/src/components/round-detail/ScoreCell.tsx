import { getScoreColor } from "@/types/golf";

interface ScoreCellProps {
  strokes: number | null;
  par: number | null;
}

export function ScoreCell({ strokes, par }: ScoreCellProps) {
  if (strokes === null || par === null) {
    return <td className="px-2 py-1.5 text-center text-sm text-gray-300">-</td>;
  }

  const colorClass = getScoreColor(strokes, par);
  const diff = strokes - par;

  const isOverPar = diff >= 1;
  const shapeClass = isOverPar ? "rounded-sm" : "rounded-full";
  const ringClass =
    diff <= -2
      ? "ring-2 ring-eagle/50"
      : diff === -1
      ? "ring-2 ring-birdie/50"
      : diff === 1
      ? "ring-1 ring-bogey/40"
      : diff === 2
      ? "ring-1 ring-double/40"
      : diff >= 3
      ? "ring-1 ring-triple/40"
      : "";

  return (
    <td className="px-1 py-1 text-center">
      <span
        className={`inline-flex items-center justify-center w-7 h-7 text-sm font-semibold transition-all duration-150 ${shapeClass} ${colorClass} ${ringClass}`}
      >
        {strokes}
      </span>
    </td>
  );
}
