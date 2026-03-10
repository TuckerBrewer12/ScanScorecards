import type { Round } from "@/types/golf";
import { getScoreColor } from "@/types/golf";
import { ScoreCell } from "./ScoreCell";

type EditedScores = Record<number, { strokes: number | null; putts: number | null; gir?: boolean | null }>;

interface ScorecardGridProps {
  round: Round;
  editMode?: boolean;
  editedScores?: EditedScores;
  editedTeeBox?: string;
  availableTees?: string[];
  onScoreChange?: (holeNumber: number, field: "strokes" | "putts", value: number | null) => void;
  onTeeBoxChange?: (teeBox: string) => void;
  onGirChange?: (holeNumber: number, value: boolean | null) => void;
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

function resolveGir(
  holeNum: number,
  editedScores: EditedScores | undefined,
  fallback: boolean | null | undefined
): boolean | null {
  if (editedScores && holeNum in editedScores && editedScores[holeNum].gir !== undefined) {
    return editedScores[holeNum].gir ?? null;
  }
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
  if (diff < 0) return "text-birdie font-semibold";
  if (diff > 0) return "text-bogey";
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
  onGirChange,
}: {
  round: Round;
  holes: number[];
  label: string;
  showTotal?: boolean;
  editMode?: boolean;
  editedScores?: EditedScores;
  activeTeeBox?: string | null;
  onScoreChange?: (holeNumber: number, field: "strokes" | "putts", value: number | null) => void;
  onGirChange?: (holeNumber: number, value: boolean | null) => void;
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

  const outYards = data.reduce((s, d) => s + (d.yardage ?? 0), 0) || null;
  const totalYards = showTotal
    ? allHoles.reduce((s, n) => s + (getHoleData(round, n, activeTeeBox).yardage ?? 0), 0) || null
    : null;

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

  const girCount = editMode
    ? holes.filter((n, i) => resolveGir(n, editedScores, data[i].score?.green_in_regulation) === true).length
    : data.filter((d) => d.score?.green_in_regulation === true).length;
  const totalGirCount = showTotal
    ? allHoles.filter((n) => {
        const d = getHoleData(round, n);
        return editMode
          ? resolveGir(n, editedScores, d.score?.green_in_regulation) === true
          : d.score?.green_in_regulation === true;
      }).length
    : null;

  const editRowClass = editMode ? "bg-amber-50/40" : "";

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-gray-50/80 text-xs font-bold text-gray-500 uppercase border-b border-gray-100">
          <th className="px-3 py-2 text-left w-20">Hole</th>
          {holes.map((n) => (
            <th key={n} className="px-2 py-2 text-center w-10">{n}</th>
          ))}
          <th className="px-2 py-2 text-center w-12 text-gray-600">{label}</th>
          {showTotal && <th className="px-2 py-2 text-center w-12 text-gray-600">TOT</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {/* Tee/yards row — secondary */}
        <tr className="text-xs text-gray-400">
          <td className="px-3 py-2 font-bold text-gray-500 capitalize">{activeTeeBox ?? "Yards"}</td>
          {data.map((d, i) => (
            <td key={holes[i]} className="px-2 py-2 text-center">{d.yardage ?? "-"}</td>
          ))}
          <td className="px-2 py-2 text-center text-gray-500 font-semibold">{outYards ?? "-"}</td>
          {showTotal && (
            <td className="px-2 py-2 text-center font-bold text-gray-600">{totalYards ?? "-"}</td>
          )}
        </tr>

        {/* Hcp row — secondary */}
        <tr className="text-xs text-gray-400">
          <td className="px-3 py-2 font-bold text-gray-500">Hcp</td>
          {data.map((d, i) => (
            <td key={holes[i]} className="px-2 py-2 text-center">
              {d.hole?.handicap ?? d.score?.handicap_played ?? "-"}
            </td>
          ))}
          <td className="px-2 py-2" />
          {showTotal && <td className="px-2 py-2" />}
        </tr>

        {/* Par row — primary */}
        <tr className="text-sm font-medium text-gray-700">
          <td className="px-3 py-2 font-bold text-gray-600">Par</td>
          {data.map((d, i) => (
            <td key={holes[i]} className="px-2 py-2 text-center">{d.effectivePar ?? "-"}</td>
          ))}
          <td className="px-2 py-2 text-center font-bold text-gray-700">{outPar ?? "-"}</td>
          {showTotal && (
            <td className="px-2 py-2 text-center font-bold text-gray-700">{totalPar ?? "-"}</td>
          )}
        </tr>

        {/* Score row — primary */}
        <tr className={`text-sm ${editRowClass}`}>
          <td className="px-3 py-2 font-bold text-gray-800">Score</td>
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
            const isOverPar = diff !== null && diff >= 1;
            const shapeClass = isOverPar ? "rounded-sm" : "rounded-full";
            const ringClass =
              diff === -1 ? "ring-2 ring-birdie/50" : diff !== null && diff >= 1 ? "ring-1 ring-bogey/40" : "";
            return (
              <td key={n} className="px-1 py-1 text-center">
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
                  className={`w-7 h-7 text-center text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40 ${shapeClass} ${colorClass} ${ringClass}`}
                />
              </td>
            );
          })}
          <td className="px-2 py-1 text-center font-bold text-gray-900">{outScore ?? "-"}</td>
          {showTotal && (
            <td className="px-2 py-1 text-center font-bold text-lg text-gray-900">{totalScore ?? "-"}</td>
          )}
        </tr>

        {/* To Par row */}
        <tr className="text-xs">
          <td className="px-3 py-2 font-bold text-gray-600">To Par</td>
          {holes.map((n, i) => {
            const diff =
              effectiveStrokes[i] != null && data[i].effectivePar != null
                ? effectiveStrokes[i]! - data[i].effectivePar!
                : null;
            return (
              <td key={n} className={`px-2 py-2 text-center ${toParColorClass(diff)}`}>
                {formatToPar(diff)}
              </td>
            );
          })}
          <td className={`px-2 py-2 text-center font-bold ${toParColorClass(outToPar)}`}>
            {formatToPar(outToPar)}
          </td>
          {showTotal && (
            <td className={`px-2 py-2 text-center font-bold text-sm ${toParColorClass(totalToPar)}`}>
              {formatToPar(totalToPar)}
            </td>
          )}
        </tr>

        {/* Putts row — secondary */}
        <tr className={`text-xs text-gray-400 ${editRowClass}`}>
          <td className="px-3 py-2 font-bold text-gray-500">Putts</td>
          {holes.map((n, i) =>
            editMode ? (
              <td key={n} className="px-1 py-2 text-center">
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
              <td
                key={n}
                className={`px-2 py-2 text-center ${
                  (data[i].score?.putts ?? 0) >= 3 ? "text-red-500 font-bold" : ""
                }`}
              >
                {data[i].score?.putts ?? "-"}
              </td>
            )
          )}
          <td className="px-2 py-2 text-center text-gray-500 font-semibold">{sumValues(effectivePutts) ?? "-"}</td>
          {showTotal && (
            <td className="px-2 py-2 text-center font-bold text-gray-600">
              {sumValues(
                allHoles.map((n) => {
                  const d = getHoleData(round, n);
                  return editMode
                    ? resolveEdited(n, "putts", editedScores, d.score?.putts)
                    : (d.score?.putts ?? null);
                })
              ) ?? "-"}
            </td>
          )}
        </tr>

        {/* GIR row */}
        <tr className="text-xs">
          <td className="px-3 py-2 font-bold text-green-700">GIR</td>
          {holes.map((n, i) => {
            const gir = editMode
              ? resolveGir(n, editedScores, data[i].score?.green_in_regulation)
              : (data[i].score?.green_in_regulation ?? null);
            if (editMode) {
              return (
                <td key={n} className="px-1 py-1 text-center">
                  <button
                    onClick={() => {
                      const next = gir === null ? true : gir === true ? false : null;
                      onGirChange?.(n, next);
                    }}
                    className="w-7 h-7 flex items-center justify-center mx-auto rounded-full hover:bg-gray-100 focus:outline-none"
                    title={gir === true ? "GIR hit — click to mark missed" : gir === false ? "GIR missed — click to clear" : "GIR unknown — click to mark hit"}
                  >
                    <span className={gir === true ? "text-green-600" : "text-gray-400"}>
                      {gir === true ? "●" : gir === false ? "○" : "–"}
                    </span>
                  </button>
                </td>
              );
            }
            return (
              <td key={n} className="px-2 py-2 text-center">
                <span className={gir === true ? "text-green-600" : "text-gray-400"}>
                  {gir === true ? "●" : gir === false ? "○" : "-"}
                </span>
              </td>
            );
          })}
          <td className="px-2 py-2 text-center text-green-700 font-semibold">
            {girCount || "-"}
          </td>
          {showTotal && (
            <td className="px-2 py-2 text-center text-green-700 font-semibold">
              {totalGirCount || "-"}
            </td>
          )}
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
  onGirChange,
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
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between header-gradient rounded-t-xl">
          <div>
            <div className="font-bold text-white text-base">
              {round.course?.name ?? round.course_name_played ?? "Unknown Course"}
            </div>
            {round.course?.location && (
              <div className="text-xs text-white/50">{round.course.location}</div>
            )}
          </div>
          <div className="text-right text-sm text-white/80 space-y-0.5">
            {editMode ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/60">Tee:</span>
                {availableTees && availableTees.length > 0 ? (
                  <select
                    value={editedTeeBox ?? ""}
                    onChange={(e) => onTeeBoxChange?.(e.target.value)}
                    className="text-sm text-gray-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50"
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
                    className="text-sm text-gray-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 w-28 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                )}
              </div>
            ) : (
              <>
                {round.tee_box && (
                  <div><span className="font-medium text-white">{round.tee_box} tees</span></div>
                )}
                {tee && (
                  <div className="text-xs text-white/50">
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
          onGirChange={onGirChange}
        />
        <div className="flex items-center gap-3 px-4 py-1.5 bg-gray-50/60 border-y border-gray-100">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs font-semibold text-gray-400 tracking-widest uppercase">Back Nine</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
        <NineTable
          round={round}
          holes={back}
          label="IN"
          showTotal
          editMode={editMode}
          editedScores={editedScores}
          activeTeeBox={activeTeeBox}
          onScoreChange={onScoreChange}
          onGirChange={onGirChange}
        />
      </div>
    </div>
  );
}
