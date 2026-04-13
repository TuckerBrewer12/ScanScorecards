import { useState } from "react";
import { CheckCircle, AlertTriangle, Loader2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { CourseLinkSearch, CourseLinkChip } from "@/components/CourseLinkSearch";
import { formatToPar, calcCourseHandicap, calcNetScore } from "@/types/golf";
import type { CourseSummary } from "@/types/golf";
import type { ScanState, ScanResult, ExtractedHoleScore, FieldConfidence, ScoreMetadata } from "@/types/scan";
import { initialScanState } from "@/types/scan";
import { formatCourseName } from "@/lib/courseName";

interface ScanReviewStepProps {
  result: ScanResult;
  scanMode: ScanState["scanMode"];
  editedScores: ExtractedHoleScore[];
  editedDate: string;
  editedTeeBox: string | null;
  error: string | null;
  preview: string | null;
  reviewCourseId: string | null;
  reviewExternalCourseId: string | null;
  reviewCourseName: string | null;
  saving: boolean;
  handicapIndex: number | null;

  // Review course search
  reviewCourseQuery: string;
  reviewCourseResults: CourseSummary[];
  reviewSearching: boolean;
  onReviewCourseQuery: (q: string) => void;
  onSelectReviewCourse: (course: CourseSummary) => void;

  scoreMetadata: ScoreMetadata[];
  badScanNullCount: number;

  // Callbacks
  onUpdate: (patch: Partial<ScanState>) => void;
  onScoreChange: (index: number, field: "strokes" | "putts" | "hole_number", value: string) => void;
  onGirChange: (index: number, value: boolean | null) => void;
  onSave: () => void;
  setReviewCourseQuery: (q: string) => void;
  setReviewCourseResults: (r: CourseSummary[]) => void;
  setScanState: React.Dispatch<React.SetStateAction<ScanState>>;
}

function getScoreColorClass(strokes: number | null, par: number | null): string {
  if (strokes === null || par === null) return "border-gray-200";
  const diff = strokes - par;
  if (diff <= -2) return "border-yellow-500 bg-yellow-50 text-yellow-900";
  if (diff === -1) return "border-green-500 bg-green-50 text-green-900";
  if (diff === 0)  return "border-gray-300 bg-white text-gray-800";
  if (diff === 1)  return "border-red-300 bg-red-50 text-red-800";
  if (diff === 2)  return "border-orange-400 bg-orange-100 text-orange-900";
  if (diff === 3)  return "border-rose-400 bg-rose-100 text-rose-900";
  return "border-red-600 bg-red-200 text-red-950";
}

function toParStr(strokes: number | null, par: number | null): string {
  if (strokes === null || par === null) return "-";
  const d = strokes - par;
  return d === 0 ? "E" : d > 0 ? `+${d}` : `${d}`;
}

function toParCls(strokes: number | null, par: number | null): string {
  if (strokes === null || par === null) return "text-gray-400";
  const d = strokes - par;
  if (d < 0) return "text-green-600 font-semibold";
  if (d > 0) return "text-red-500";
  return "text-gray-600";
}

export function ScanReviewStep({
  result,
  scanMode,
  editedScores,
  scoreMetadata,
  badScanNullCount,
  editedDate,
  editedTeeBox,
  error,
  preview,
  reviewCourseId,
  reviewExternalCourseId,
  reviewCourseName,
  saving,
  handicapIndex,
  reviewCourseQuery,
  reviewCourseResults,
  reviewSearching,
  onReviewCourseQuery,
  onSelectReviewCourse,
  onUpdate,
  onScoreChange,
  onGirChange,
  onSave,
  setReviewCourseQuery,
  setReviewCourseResults,
  setScanState,
}: ScanReviewStepProps) {
  const [badScanDismissed, setBadScanDismissed] = useState(false);
  const rd = result.round;
  const coursePar = rd.course?.par ?? null;
  const totalStrokes = editedScores.reduce((s, h) => s + (h.strokes ?? 0), 0);
  const toPar = coursePar ? totalStrokes - coursePar : null;

  const strokesReviewFields = result.fields_needing_review.filter(
    (f) => f.toLowerCase().includes("strokes")
  );
  const puttsNotRecorded = result.fields_needing_review.some(
    (f) => f.toLowerCase().includes("putts")
  );

  const confidenceIsOk = strokesReviewFields.length === 0;
  const confidenceBannerClass = confidenceIsOk
    ? "text-white bg-[#2d7a3a] border border-[#2d7a3a]"
    : "text-white bg-amber-500 border border-amber-500";

  function getFieldConfidence(holeNumber: number | null, index: number, field: string): FieldConfidence | null {
    const num = holeNumber ?? index + 1;
    const hc = result?.confidence.hole_scores?.find((h) => h.hole_number === num);
    return hc?.fields?.[field] ?? null;
  }

  const frontNine = editedScores.slice(0, 9).reduce((s, h) => s + (h.strokes ?? 0), 0) || null;
  const backNine = editedScores.slice(9).reduce((s, h) => s + (h.strokes ?? 0), 0) || null;

  function renderNine(startIdx: number, label: string, showGrandTotal = false, isManual = false) {
    const slice = editedScores.slice(startIdx, startIdx + 9);
    const ninePar = slice.reduce((s, hs, si) => {
      const holeNum = hs.hole_number ?? startIdx + si + 1;
      return s + (rd.course?.holes.find((h) => h.number === holeNum)?.par ?? 0);
    }, 0);
    const nineScore = slice.reduce((s, hs) => s + (hs.strokes ?? 0), 0);
    const hasScores = slice.some((hs) => hs.strokes != null);
    const nineToPar = hasScores && ninePar > 0 ? nineScore - ninePar : null;

    const selectedTee = editedTeeBox
      ? (rd.course?.tees ?? []).find((t) => t.color?.toLowerCase() === editedTeeBox.toLowerCase()) ?? null
      : null;
    const nineYardage = selectedTee
      ? slice.reduce((sum, hs, si) => {
          const holeNum = hs.hole_number ?? startIdx + si + 1;
          return sum + (selectedTee.hole_yardages[String(holeNum)] ?? 0);
        }, 0)
      : null;
    const totalYardage = selectedTee
      ? editedScores.reduce((sum, hs, i) => {
          const holeNum = hs.hole_number ?? i + 1;
          return sum + (selectedTee.hole_yardages[String(holeNum)] ?? 0);
        }, 0)
      : null;

    return (
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase">
            <th className="px-3 py-2 text-left w-16">Hole</th>
            {slice.map((hs, si) => (
              <th key={si} className="px-1 py-2 text-center min-w-[2.25rem]">
                {hs.hole_number ?? startIdx + si + 1}
              </th>
            ))}
            <th className="px-2 py-2 text-center w-12 bg-gray-100">{label}</th>
            {showGrandTotal && <th className="px-2 py-2 text-center w-12 bg-gray-200">TOT</th>}
          </tr>
        </thead>
        <tbody>
          {/* Yardage — only when a tee with yardage data is selected */}
          {selectedTee && Object.keys(selectedTee.hole_yardages).length > 0 && (
            <tr className="border-b border-gray-100 text-xs text-gray-400">
              <td className="px-3 py-1.5 font-medium">Yds</td>
              {slice.map((hs, si) => {
                const holeNum = hs.hole_number ?? startIdx + si + 1;
                const yds = selectedTee.hole_yardages[String(holeNum)];
                return <td key={si} className="px-1 py-1.5 text-center">{yds ?? "-"}</td>;
              })}
              <td className="px-2 py-1.5 text-center bg-gray-50 font-bold">{nineYardage ?? "-"}</td>
              {showGrandTotal && <td className="px-2 py-1.5 text-center bg-gray-100 font-bold">{totalYardage ?? "-"}</td>}
            </tr>
          )}
          {/* Par */}
          <tr className="border-b border-gray-100 text-xs text-gray-500">
            <td className="px-3 py-1.5 font-medium">Par</td>
            {slice.map((hs, si) => {
              const holeNum = hs.hole_number ?? startIdx + si + 1;
              const par = rd.course?.holes.find((h) => h.number === holeNum)?.par;
              return <td key={si} className="px-1 py-1.5 text-center">{par ?? "-"}</td>;
            })}
            <td className="px-2 py-1.5 text-center bg-gray-50 font-bold">{ninePar ?? "-"}</td>
            {showGrandTotal && <td className="px-2 py-1.5 text-center bg-gray-100 font-bold">{coursePar ?? "-"}</td>}
          </tr>

          {/* Score */}
          <tr className="border-b border-gray-100">
            <td className="px-3 py-1.5 font-semibold text-gray-900 text-sm">Score</td>
            {slice.map((hs, si) => {
              const origIdx = startIdx + si;
              const holeNum = hs.hole_number ?? startIdx + si + 1;
              const par = rd.course?.holes.find((h) => h.number === holeNum)?.par ?? null;
              const sc = getFieldConfidence(hs.hole_number, origIdx, "strokes");
              const isLowConf = sc !== null && (sc.level === "low" || sc.final_confidence < 0.7);
              return (
                <td key={si} className="px-1 py-1 text-center">
                  <div className="relative inline-block">
                    <input
                      type="number" min="1" max="15"
                      value={hs.strokes ?? ""}
                      onChange={(e) => onScoreChange(origIdx, "strokes", e.target.value)}
                      className={`w-9 text-center px-0.5 py-0.5 border rounded text-sm font-semibold relative z-10 ${
                        isLowConf ? "border-amber-400 bg-amber-50 text-amber-900" : getScoreColorClass(hs.strokes, par)
                      }`}
                    />
                    {isLowConf && (
                      <motion.div
                        className="absolute inset-0 rounded border-2 border-amber-400 pointer-events-none"
                        animate={{ opacity: [1, 0.2, 1] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                      />
                    )}
                  </div>
                  {isLowConf && (
                    <div className="text-[8px] font-bold text-amber-500 leading-none mt-0.5 uppercase tracking-wide">check</div>
                  )}
                </td>
              );
            })}
            <td className="px-2 py-1.5 text-center bg-gray-50 font-bold text-gray-900 text-sm">
              {hasScores ? nineScore : "-"}
            </td>
            {showGrandTotal && (
              <td className="px-2 py-1.5 text-center bg-gray-100 font-bold text-base text-gray-900">
                {totalStrokes ?? "-"}
              </td>
            )}
          </tr>

          {/* To Par */}
          <tr className={`text-xs ${!puttsNotRecorded ? "border-b border-gray-100" : ""}`}>
            <td className="px-3 py-1.5 text-gray-500 font-medium">To Par</td>
            {slice.map((hs, si) => {
              const holeNum = hs.hole_number ?? startIdx + si + 1;
              const par = rd.course?.holes.find((h) => h.number === holeNum)?.par ?? null;
              return (
                <td key={si} className={`px-1 py-1.5 text-center ${toParCls(hs.strokes, par)}`}>
                  {toParStr(hs.strokes, par)}
                </td>
              );
            })}
            <td className={`px-2 py-1.5 text-center bg-gray-50 font-bold ${nineToPar === null ? "text-gray-400" : nineToPar < 0 ? "text-green-600" : nineToPar > 0 ? "text-red-500" : "text-gray-600"}`}>
              {nineToPar === null ? "-" : nineToPar === 0 ? "E" : nineToPar > 0 ? `+${nineToPar}` : nineToPar}
            </td>
            {showGrandTotal && (
              <td className={`px-2 py-1.5 text-center bg-gray-100 font-bold text-sm ${toPar === null ? "text-gray-400" : toPar < 0 ? "text-green-600" : toPar > 0 ? "text-red-500" : "text-gray-600"}`}>
                {formatToPar(toPar)}
              </td>
            )}
          </tr>

          {/* Putts — always in manual mode, otherwise only if recorded on card */}
          {(!puttsNotRecorded || isManual) && (
            <tr className="text-xs text-gray-500">
              <td className="px-3 py-1.5 font-medium">Putts</td>
              {slice.map((hs, si) => {
                const origIdx = startIdx + si;
                const isEstimated = scoreMetadata[origIdx]?.putts_estimated === true;
                return (
                  <td key={si} className="px-1 py-1 text-center">
                    <input
                      type="number" min="0" max="10"
                      value={hs.putts ?? ""}
                      onChange={(e) => onScoreChange(origIdx, "putts", e.target.value)}
                      title={isEstimated ? "Estimated (2-putt default)" : undefined}
                      className={`w-9 text-center px-0.5 py-0.5 border rounded text-sm ${
                        isEstimated
                          ? "border-dashed border-amber-400 bg-amber-50/50 text-amber-700"
                          : "border-gray-200"
                      }`}
                    />
                  </td>
                );
              })}
              <td className="px-2 py-1.5 text-center bg-gray-50">
                {slice.reduce((s, hs) => s + (hs.putts ?? 0), 0)}
              </td>
              {showGrandTotal && (
                <td className="px-2 py-1.5 text-center bg-gray-100">
                  {editedScores.reduce((s, hs) => s + (hs.putts ?? 0), 0)}
                </td>
              )}
            </tr>
          )}

          {/* GIR — manual entry, or when any GIR data present (including auto-calculated) */}
          {(isManual || slice.some((hs) => hs.green_in_regulation !== null)) && (
            <tr className="text-xs">
              <td className="px-3 py-1.5 font-bold text-green-700">GIR</td>
              {slice.map((hs, si) => {
                const origIdx = startIdx + si;
                const gir = hs.green_in_regulation;
                const isCalcGir = scoreMetadata[origIdx]?.gir_calculated === true;
                return (
                  <td key={si} className="px-1 py-1 text-center">
                    <button
                      onClick={() => onGirChange(origIdx, gir === true ? false : gir === false ? null : true)}
                      className="w-7 h-7 flex items-center justify-center mx-auto rounded-full hover:bg-gray-100 focus:outline-none"
                      style={isCalcGir ? { outline: "1px dashed #9ca3af", outlineOffset: "1px" } : undefined}
                      title={
                        isCalcGir
                          ? "Auto-calculated from strokes and putts — click to override"
                          : gir === true
                            ? "GIR hit — click to mark missed"
                            : gir === false
                              ? "GIR missed — click to clear"
                              : "GIR unknown — click to mark hit"
                      }
                    >
                      <span style={{ color: gir === true ? "#16a34a" : "#9ca3af" }}>
                        {gir === true ? "●" : gir === false ? "○" : "–"}
                      </span>
                    </button>
                  </td>
                );
              })}
              <td className="px-2 py-1.5 text-center text-green-700 font-semibold bg-gray-50">
                {slice.filter((hs) => hs.green_in_regulation === true).length}
              </td>
              {showGrandTotal && (
                <td className="px-2 py-1.5 text-center text-green-700 font-semibold bg-gray-100">
                  {editedScores.filter((hs) => hs.green_in_regulation === true).length}
                </td>
              )}
            </tr>
          )}
        </tbody>
      </table>
    );
  }

  return (
    <div>
      <PageHeader
        title={formatCourseName(reviewCourseName ?? rd.course?.name ?? "Review Extraction")}
        subtitle={rd.course?.location ?? "Verify and edit the extracted data"}
      />

      {error && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Confidence banner */}
      <div className={`mb-4 p-3 rounded-lg text-sm font-medium flex items-start gap-2 ${confidenceBannerClass}`}>
        {confidenceIsOk ? <CheckCircle size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
        <div>
          {confidenceIsOk
            ? scanMode === "manual"
              ? "Enter your scores hole by hole below"
              : "Extraction looks good — verify scores below"
            : `${strokesReviewFields.length} score(s) may need review — verify highlighted holes`}
          {puttsNotRecorded && !confidenceIsOk && (
            <div className="font-normal text-xs mt-0.5 opacity-75">Putts not recorded on this scorecard</div>
          )}
        </div>
      </div>

      {/* Bad scan warning */}
      <AnimatePresence>
        {badScanNullCount > 5 && !badScanDismissed && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800 flex items-start gap-2"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
            <div className="flex-1">
              <span className="font-semibold">Scan may be incomplete</span>
              {" — "}{badScanNullCount} holes appear to be missing scores. Check the original image and fill in any gaps.
            </div>
            <button
              onClick={() => setBadScanDismissed(true)}
              className="ml-2 text-amber-400 hover:text-amber-700 focus:outline-none shrink-0"
              aria-label="Dismiss warning"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stat cards */}
      {(() => {
        const selectedTee = editedTeeBox
          ? rd.course?.tees?.find((t) => t.color?.toLowerCase() === editedTeeBox.toLowerCase()) ?? null
          : null;
        const courseHandicap =
          handicapIndex != null &&
          selectedTee?.slope_rating != null &&
          selectedTee?.course_rating != null &&
          coursePar != null
            ? calcCourseHandicap(handicapIndex, selectedTee.slope_rating, selectedTee.course_rating, coursePar)
            : null;
        const netScore = courseHandicap != null && totalStrokes > 0
          ? calcNetScore(totalStrokes, courseHandicap)
          : null;

        return (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">Front 9</div>
              <div className="text-3xl font-bold text-gray-900">{frontNine ?? "-"}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">Back 9</div>
              <div className="text-3xl font-bold text-gray-900">{backNine ?? "-"}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">Total</div>
              <div className="text-3xl font-bold text-gray-900">{totalStrokes ?? "-"}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">To Par</div>
              <div className={`text-3xl font-bold ${toPar !== null && toPar < 0 ? "text-green-600" : toPar !== null && toPar > 0 ? "text-red-500" : "text-gray-900"}`}>
                {formatToPar(toPar)}
              </div>
            </div>
            <div className={`bg-white rounded-xl border border-gray-200 border-l-4 p-4 text-center ${netScore != null && coursePar != null ? netScore <= coursePar ? "border-l-birdie" : "border-l-bogey" : "border-l-gray-300"}`}>
              <div className="text-xs text-gray-500 mb-1">Net Score</div>
              <div className={`text-3xl font-bold ${netScore != null && coursePar != null ? netScore <= coursePar ? "text-birdie" : "text-bogey" : "text-gray-900"}`}>{netScore ?? "-"}</div>
              {courseHandicap != null && (
                <div className="text-xs text-gray-400 mt-0.5">HCP {courseHandicap < 0 ? `+${Math.abs(courseHandicap)}` : courseHandicap}</div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Top: image + metadata side by side */}
      <div className={`grid grid-cols-1 gap-6 mb-6 ${scanMode !== "manual" ? "lg:grid-cols-2" : ""}`}>
        {scanMode !== "manual" && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Original Image</h3>
            {preview && <img src={preview} alt="Scorecard" className="w-full rounded-lg" />}
          </div>
        )}

        <div className="space-y-4">
          {/* Course info */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="text-lg font-bold text-gray-900">
              {formatCourseName(reviewCourseId ? reviewCourseName : reviewCourseName ?? "Unknown Course")}
            </div>
            {rd.course?.location && <div className="text-sm text-gray-500">{rd.course.location}</div>}
            <div className="flex gap-4 mt-2 text-sm text-gray-600">
              <span>Par: {coursePar ?? "-"}</span>
            </div>

            {/* Course link / search */}
            <div className="mt-3">
              {reviewCourseId || reviewExternalCourseId ? (
                <CourseLinkChip
                  name={formatCourseName(reviewCourseName ?? "")}
                  onClear={() => {
                    onUpdate({ reviewCourseId: null, reviewExternalCourseId: null });
                    setReviewCourseQuery(reviewCourseName ?? "");
                  }}
                />
              ) : (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Link to saved course or enter name</label>
                  <CourseLinkSearch
                    query={reviewCourseQuery}
                    results={reviewCourseResults}
                    searching={reviewSearching}
                    onQueryChange={onReviewCourseQuery}
                    onSelectCourse={onSelectReviewCourse}
                    onClose={() => { setReviewCourseQuery(""); setReviewCourseResults([]); }}
                    reviewVariant
                    onUseCustomName={(name) => {
                      onUpdate({
                        reviewCourseName: name,
                        reviewCourseId: null,
                        reviewExternalCourseId: null,
                      });
                      setReviewCourseResults([]);
                    }}
                  />
                </div>
              )}
            </div>
            {/* Tee selector — only when matched course has tee data */}
            {rd.course?.tees && rd.course.tees.length > 0 ? (() => {
              const selectedTee = rd.course!.tees.find(
                (t) => t.color?.toLowerCase() === editedTeeBox?.toLowerCase()
              ) ?? null;
              return (
                <div className="mt-3">
                  <label className="text-xs text-gray-500 block mb-1">Tee Played</label>
                  <select
                    value={editedTeeBox ?? ""}
                    onChange={(e) => onUpdate({ editedTeeBox: e.target.value || null })}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  >
                    <option value="">— select tee —</option>
                    {rd.course!.tees.map((t, i) => (
                      <option key={i} value={t.color ?? ""}>{t.color ?? "Unknown"}</option>
                    ))}
                  </select>
                  {selectedTee && (selectedTee.slope_rating != null || selectedTee.course_rating != null) && (
                    <div className="mt-1.5 flex gap-3 text-xs text-gray-500">
                      {selectedTee.slope_rating != null && <span>Slope {selectedTee.slope_rating}</span>}
                      {selectedTee.course_rating != null && <span>Rating {selectedTee.course_rating}</span>}
                    </div>
                  )}
                </div>
              );
            })() : (
              <div className="mt-2 text-sm text-gray-600">
                Tee: {editedTeeBox ?? "-"}
              </div>
            )}
          </div>

          {/* Date */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <label className="text-xs text-gray-500">Date</label>
            <input type="date" value={editedDate}
              onChange={(e) => onUpdate({ editedDate: e.target.value })}
              max={new Date().toISOString().substring(0, 10)}
              className="w-full mt-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={onSave} disabled={saving}
              className="flex-1 px-5 py-3 bg-primary text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />Saving...
                </span>
              ) : "Save Round"}
            </button>
            <button onClick={() => setScanState(initialScanState)}
              className="px-5 py-3 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors">
              Start Over
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal scorecard */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <div className="min-w-[680px]">
          {renderNine(0, "OUT", false, scanMode === "manual")}
          <div className="border-t-2 border-gray-300" />
          {renderNine(9, "IN", true, scanMode === "manual")}
        </div>
      </div>
    </div>
  );
}
