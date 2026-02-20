import type { Round, HoleScore, Hole, Tee } from "@/types/golf";
import { ScoreCell } from "./ScoreCell";

interface ScorecardGridProps {
  round: Round;
}

function getHoleData(round: Round, holeNum: number) {
  const score = round.hole_scores.find((s) => s.hole_number === holeNum);
  const hole = round.course?.holes.find((h) => h.number === holeNum);
  const tee = round.course?.tees.find(
    (t) => t.color?.toLowerCase() === round.tee_box?.toLowerCase()
  );
  const yardage = tee?.hole_yardages?.[holeNum];
  return { score, hole, yardage };
}

function sumScores(scores: (HoleScore | undefined)[]): number | null {
  const valid = scores.filter((s): s is HoleScore => s?.strokes != null);
  if (valid.length === 0) return null;
  return valid.reduce((sum, s) => sum + (s.strokes ?? 0), 0);
}

function sumPars(holes: (Hole | undefined)[]): number | null {
  const valid = holes.filter((h): h is Hole => h?.par != null);
  if (valid.length === 0) return null;
  return valid.reduce((sum, h) => sum + (h.par ?? 0), 0);
}

function NineTable({
  round,
  holes,
  label,
  showTotal,
}: {
  round: Round;
  holes: number[];
  label: string;
  showTotal?: boolean;
}) {
  const data = holes.map((n) => getHoleData(round, n));
  const allData = showTotal
    ? [...Array.from({ length: 18 }, (_, i) => getHoleData(round, i + 1))]
    : [];

  const outScore = sumScores(data.map((d) => d.score));
  const outPar = sumPars(data.map((d) => d.hole));
  const totalScore = showTotal ? sumScores(allData.map((d) => d.score)) : null;
  const totalPar = showTotal ? sumPars(allData.map((d) => d.hole)) : null;

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase">
          <th className="px-3 py-2 text-left w-20">Hole</th>
          {holes.map((n) => (
            <th key={n} className="px-2 py-2 text-center w-10">
              {n}
            </th>
          ))}
          <th className="px-2 py-2 text-center w-12 bg-gray-100">{label}</th>
          {showTotal && (
            <th className="px-2 py-2 text-center w-12 bg-gray-200">TOT</th>
          )}
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-gray-100 text-xs text-gray-400">
          <td className="px-3 py-1.5 font-medium">Yards</td>
          {data.map((d, i) => (
            <td key={holes[i]} className="px-2 py-1.5 text-center">
              {d.yardage ?? "-"}
            </td>
          ))}
          <td className="px-2 py-1.5 text-center bg-gray-50">
            {data.reduce((s, d) => s + (d.yardage ?? 0), 0) || "-"}
          </td>
          {showTotal && <td className="px-2 py-1.5 text-center bg-gray-100" />}
        </tr>
        <tr className="border-b border-gray-100 text-xs text-gray-400">
          <td className="px-3 py-1.5 font-medium">Hcp</td>
          {data.map((d, i) => (
            <td key={holes[i]} className="px-2 py-1.5 text-center">
              {d.hole?.handicap ?? "-"}
            </td>
          ))}
          <td className="px-2 py-1.5 bg-gray-50" />
          {showTotal && <td className="px-2 py-1.5 bg-gray-100" />}
        </tr>
        <tr className="border-b border-gray-200 text-sm font-medium text-gray-700">
          <td className="px-3 py-1.5">Par</td>
          {data.map((d, i) => (
            <td key={holes[i]} className="px-2 py-1.5 text-center">
              {d.hole?.par ?? "-"}
            </td>
          ))}
          <td className="px-2 py-1.5 text-center bg-gray-50 font-bold">
            {outPar ?? "-"}
          </td>
          {showTotal && (
            <td className="px-2 py-1.5 text-center bg-gray-100 font-bold">
              {totalPar ?? "-"}
            </td>
          )}
        </tr>
        <tr className="border-b border-gray-200 text-sm">
          <td className="px-3 py-1.5 font-semibold text-gray-900">Score</td>
          {data.map((d, i) => (
            <ScoreCell
              key={holes[i]}
              strokes={d.score?.strokes ?? null}
              par={d.hole?.par ?? null}
            />
          ))}
          <td className="px-2 py-1.5 text-center bg-gray-50 font-bold text-gray-900">
            {outScore ?? "-"}
          </td>
          {showTotal && (
            <td className="px-2 py-1.5 text-center bg-gray-100 font-bold text-lg text-gray-900">
              {totalScore ?? "-"}
            </td>
          )}
        </tr>
        <tr className="border-b border-gray-100 text-xs text-gray-500">
          <td className="px-3 py-1.5 font-medium">Putts</td>
          {data.map((d, i) => (
            <td key={holes[i]} className="px-2 py-1.5 text-center">
              {d.score?.putts ?? "-"}
            </td>
          ))}
          <td className="px-2 py-1.5 text-center bg-gray-50">
            {data.reduce((s, d) => s + (d.score?.putts ?? 0), 0) || "-"}
          </td>
          {showTotal && <td className="px-2 py-1.5 bg-gray-100" />}
        </tr>
        <tr className="text-xs text-gray-500">
          <td className="px-3 py-1.5 font-medium">GIR</td>
          {data.map((d, i) => (
            <td key={holes[i]} className="px-2 py-1.5 text-center">
              {d.score?.green_in_regulation === true
                ? "●"
                : d.score?.green_in_regulation === false
                ? "○"
                : "-"}
            </td>
          ))}
          <td className="px-2 py-1.5 text-center bg-gray-50">
            {data.filter((d) => d.score?.green_in_regulation === true).length ||
              "-"}
          </td>
          {showTotal && <td className="px-2 py-1.5 bg-gray-100" />}
        </tr>
      </tbody>
    </table>
  );
}

export function ScorecardGrid({ round }: ScorecardGridProps) {
  const front = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const back = [10, 11, 12, 13, 14, 15, 16, 17, 18];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
      <div className="min-w-[700px]">
        <NineTable round={round} holes={front} label="OUT" />
        <div className="border-t-2 border-gray-300" />
        <NineTable round={round} holes={back} label="IN" showTotal />
      </div>
    </div>
  );
}
