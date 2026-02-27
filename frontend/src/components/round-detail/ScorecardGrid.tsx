import type { Round, HoleScore } from "@/types/golf";
import { getScoreColor } from "@/types/golf";
import { ScoreCell } from "./ScoreCell";

type EditedScores = Record<number, { strokes: number | null; putts: number | null }>;

interface ScorecardGridProps {
  round: Round;
  editMode?: boolean;
  editedScores?: EditedScores;
  editedTeeBox?: string;
  availableTees?: string[];
  onScoreChange?: (holeNumber: number, field: "strokes" | "putts", value: number | null) => void;
  onTeeBoxChange?: (teeBox: string) => void;
}

function getHoleData(round: Round, holeNum: number, activeTeeBox?: string | null) {
  const score = round.hole_scores.find((s) => s.hole_number === holeNum);
  const hole = round.course?.holes.find((h) => h.number === holeNum);
  const teeColor = activeTeeBox ?? round.tee_box;
  const tee = round.course?.tees.find(
    (t) => t.color?.toLowerCase() === teeColor?.toLowerCase()
  );
  const yardage = tee?.hole_yardages?.[holeNum] ?? round.user_tee?.hole_yardages?.[holeNum];
  const effectivePar: number | null = hole?.par ?? score?.par_played ?? null;
  return { score, hole, yardage, effectivePar };
}

// Use key-existence to distinguish "explicitly cleared" (null) from "untouched" (fall back)
function resolveEdited(
  holeNum: number,
  field: "strokes" | "putts",
  editedScores: EditedScores | undefined,
  fallback: number | null | undefined
): number | null {
  if (editedScores && holeNum in editedScores) return editedScores[holeNum][field];
  return fallback ?? null;
}

function sumValues(vals: (number | null | undefined)[]): number | null {
  const valid = vals.filter((v): v is number => v != null);
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0);
}

function sumEffectivePars(pars: (number | null)[]): number | null {
  const valid = pars.filter((p): p is number => p != null);
  if (valid.length === 0) return null;
  return valid.reduce((sum, p) => sum + p, 0);
}

function formatToPar(diff: number | null): string {
  if (diff === null) return "-";
  if (diff === 0) return "E";
  if (diff > 0) return `+${diff}`;
  return `${diff}`;
}

function toParColorClass(diff: number | null): string {
  if (diff === null) return "text-gray-400";
  if (diff < 0) return "text-green-600 font-semibold";
  if (diff > 0) return "text-red-500";
  return "text-gray-600";
}

function NineTable({
  round,
  holes,
  label,
  showTotal,
  editMode,
  editedScores,
  activeTeeBox,
  onScoreChange,
}: {
  round: Round;
  holes: number[];
  label: string;
  showTotal?: boolean;
  editMode?: boolean;
  editedScores?: EditedScores;
  activeTeeBox?: string | null;
  onScoreChange?: (holeNumber: number, field: "strokes" | "putts", value: number | null) => void;
}) {
  const data = holes.map((n) => getHoleData(round, n, activeTeeBox));
  const allHoles = showTotal ? Array.from({ length: 18 }, (_, i) => i + 1) : [];

  // Key-existence check: if user cleared a value to null, don't fall back to original
  const effectiveStrokes = holes.map((n, i) =>
    editMode
      ? resolveEdited(n, "strokes", editedScores, data[i].score?.strokes)
      : (data[i].score?.strokes ?? null)
  );
  const effectivePutts = holes.map((n, i) =>
    editMode
      ? resolveEdited(n, "putts", editedScores, data[i].score?.putts)
      : (data[i].score?.putts ?? null)
  );

  const outScore = sumValues(effectiveStrokes);
  const outPar = sumEffectivePars(data.map((d) => d.effectivePar));
  const outToPar = outScore !== null && outPar !== null ? outScore - outPar : null;

  const totalScore = showTotal
    ? sumValues(
        allHoles.map((n) => {
          const d = getHoleData(round, n);
          return editMode
            ? resolveEdited(n, "strokes", editedScores, d.score?.strokes)
            : (d.score?.strokes ?? null);
        })
      )
    : null;
  const totalPar = showTotal
    ? sumEffectivePars(allHoles.map((n) => getHoleData(round, n).effectivePar))
    : null;
  const totalToPar = totalScore !== null && totalPar !== null ? totalScore - totalPar : null;

  const editRowClass = editMode ? "bg-amber-50/40" : "";

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase">
          <th className="px-3 py-2 text-left w-20">Hole</th>
          {holes.map((n) => (
            <th key={n} className="px-2 py-2 text-center w-10">{n}</th>
          ))}
          <th className="px-2 py-2 text-center w-12 bg-gray-100">{label}</th>
          {showTotal && <th className="px-2 py-2 text-center w-12 bg-gray-200">TOT</th>}
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-gray-100 text-xs text-gray-400">
          <td className="px-3 py-1.5 font-medium">Yards</td>
          {data.map((d, i) => (
            <td key={holes[i]} className="px-2 py-1.5 text-center">{d.yardage ?? "-"}</td>
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
              {d.hole?.handicap ?? d.score?.handicap_played ?? "-"}
            </td>
          ))}
          <td className="px-2 py-1.5 bg-gray-50" />
          {showTotal && <td className="px-2 py-1.5 bg-gray-100" />}
        </tr>
        <tr className="border-b border-gray-200 text-sm font-medium text-gray-700">
          <td className="px-3 py-1.5">Par</td>
          {data.map((d, i) => (
            <td key={holes[i]} className="px-2 py-1.5 text-center">{d.effectivePar ?? "-"}</td>
          ))}
          <td className="px-2 py-1.5 text-center bg-gray-50 font-bold">{outPar ?? "-"}</td>
          {showTotal && (
            <td className="px-2 py-1.5 text-center bg-gray-100 font-bold">{totalPar ?? "-"}</td>
          )}
        </tr>

        {/* Score row — colored circle inputs in edit mode */}
        <tr className={`border-b border-gray-100 text-sm ${editRowClass}`}>
          <td className="px-3 py-1.5 font-semibold text-gray-900">Score</td>
          {holes.map((n, i) => {
            if (!editMode) {
              return <ScoreCell key={n} strokes={data[i].score?.strokes ?? null} par={data[i].effectivePar} />;
            }
            const strokes = effectiveStrokes[i];
            const par = data[i].effectivePar;
            const colorClass =
              strokes !== null && par !== null
                ? getScoreColor(strokes, par)
                : "bg-white border-2 border-dashed border-gray-300 text-gray-400";
            const diff = strokes !== null && par !== null ? strokes - par : null;
            const ringClass =
              diff === -1 ? "ring-2 ring-birdie" : diff !== null && diff >= 1 ? "ring-1 ring-current" : "";
            return (
              <td key={n} className="px-1 py-1.5 text-center">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={strokes !== null ? String(strokes) : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") { onScoreChange?.(n, "strokes", null); return; }
                    const num = parseInt(v, 10);
                    if (!isNaN(num)) onScoreChange?.(n, "strokes", num);
                  }}
                  className={`w-8 h-8 text-center text-sm font-semibold rounded-full focus:outline-none focus:ring-2 focus:ring-primary/40 ${colorClass} ${ringClass}`}
                />
              </td>
            );
          })}
          <td className="px-2 py-1.5 text-center bg-gray-50 font-bold text-gray-900">
            {outScore ?? "-"}
          </td>
          {showTotal && (
            <td className="px-2 py-1.5 text-center bg-gray-100 font-bold text-lg text-gray-900">
              {totalScore ?? "-"}
            </td>
          )}
        </tr>

        <tr className="border-b border-gray-200 text-xs">
          <td className="px-3 py-1.5 font-medium text-gray-500">To Par</td>
          {holes.map((n, i) => {
            const diff =
              effectiveStrokes[i] != null && data[i].effectivePar != null
                ? effectiveStrokes[i]! - data[i].effectivePar!
                : null;
            return (
              <td key={n} className={`px-2 py-1.5 text-center ${toParColorClass(diff)}`}>
                {formatToPar(diff)}
              </td>
            );
          })}
          <td className={`px-2 py-1.5 text-center bg-gray-50 font-bold ${toParColorClass(outToPar)}`}>
            {formatToPar(outToPar)}
          </td>
          {showTotal && (
            <td className={`px-2 py-1.5 text-center bg-gray-100 font-bold text-sm ${toParColorClass(totalToPar)}`}>
              {formatToPar(totalToPar)}
            </td>
          )}
        </tr>

        {/* Putts row — inputs in edit mode */}
        <tr className={`border-b border-gray-100 text-xs text-gray-500 ${editRowClass}`}>
          <td className="px-3 py-1.5 font-medium">Putts</td>
          {holes.map((n, i) =>
            editMode ? (
              <td key={n} className="px-1 py-1.5 text-center">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={effectivePutts[i] !== null ? String(effectivePutts[i]) : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") { onScoreChange?.(n, "putts", null); return; }
                    const num = parseInt(v, 10);
                    if (!isNaN(num)) onScoreChange?.(n, "putts", num);
                  }}
                  className="w-8 h-6 text-center text-xs bg-white border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </td>
            ) : (
              <td key={n} className="px-2 py-1.5 text-center">{data[i].score?.putts ?? "-"}</td>
            )
          )}
          <td className="px-2 py-1.5 text-center bg-gray-50">
            {sumValues(effectivePutts) ?? "-"}
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
            {data.filter((d) => d.score?.green_in_regulation === true).length || "-"}
          </td>
          {showTotal && <td className="px-2 py-1.5 bg-gray-100" />}
        </tr>
      </tbody>
    </table>
  );
}

export function ScorecardGrid({
  round,
  editMode,
  editedScores,
  editedTeeBox,
  availableTees,
  onScoreChange,
  onTeeBoxChange,
}: ScorecardGridProps) {
  const front = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const back = [10, 11, 12, 13, 14, 15, 16, 17, 18];

  const activeTeeBox = editMode ? editedTeeBox : round.tee_box;
  const tee =
    round.course?.tees.find(
      (t) => t.color?.toLowerCase() === activeTeeBox?.toLowerCase()
    ) ?? round.user_tee ?? null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Scorecard header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="font-bold text-gray-900 text-base">
              {round.course?.name ?? round.course_name_played ?? "Unknown Course"}
            </div>
            {round.course?.location && (
              <div className="text-xs text-gray-500">{round.course.location}</div>
            )}
          </div>
          <div className="text-right text-sm text-gray-600 space-y-0.5">
            {editMode ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Tee:</span>
                {availableTees && availableTees.length > 0 ? (
                  <select
                    value={editedTeeBox ?? ""}
                    onChange={(e) => onTeeBoxChange?.(e.target.value)}
                    className="text-sm bg-amber-50 border border-amber-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="">Select tee…</option>
                    {availableTees.map((color) => (
                      <option key={color} value={color}>{color}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    autoComplete="off"
                    value={editedTeeBox ?? ""}
                    onChange={(e) => onTeeBoxChange?.(e.target.value)}
                    placeholder="e.g. White"
                    className="text-sm bg-amber-50 border border-amber-200 rounded px-2 py-1 w-28 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                )}
              </div>
            ) : (
              <>
                {round.tee_box && (
                  <div><span className="font-medium">{round.tee_box} tees</span></div>
                )}
                {tee && (
                  <div className="text-xs text-gray-400">
                    {tee.course_rating != null && `Rating ${tee.course_rating}`}
                    {tee.slope_rating != null && ` / Slope ${tee.slope_rating}`}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <NineTable
          round={round}
          holes={front}
          label="OUT"
          editMode={editMode}
          editedScores={editedScores}
          activeTeeBox={activeTeeBox}
          onScoreChange={onScoreChange}
        />
        <div className="border-t-2 border-gray-300" />
        <NineTable
          round={round}
          holes={back}
          label="IN"
          showTotal
          editMode={editMode}
          editedScores={editedScores}
          activeTeeBox={activeTeeBox}
          onScoreChange={onScoreChange}
        />
      </div>
    </div>
  );
}
