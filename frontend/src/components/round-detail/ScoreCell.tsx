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

  return (
    <td className="px-1 py-1.5 text-center">
      <span
        className={`inline-flex items-center justify-center w-8 h-8 text-sm font-semibold rounded-full ${colorClass} ${
          diff === -1
            ? "ring-2 ring-birdie"
            : diff >= 1
            ? "ring-1 ring-current"
            : ""
        }`}
      >
        {strokes}
      </span>
    </td>
  );
}
