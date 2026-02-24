import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Camera, Loader2, CheckCircle, AlertTriangle, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatToPar } from "@/types/golf";
import type { ScanState, ScanResult, ExtractedHoleScore } from "@/types/scan";
import { initialScanState } from "@/types/scan";

interface ScanPageProps {
  userId: string;
  scanState: ScanState;
  setScanState: React.Dispatch<React.SetStateAction<ScanState>>;
}

export function ScanPage({ userId, scanState, setScanState }: ScanPageProps) {
  const navigate = useNavigate();
  const { step, file, preview, result, editedScores, editedNotes, editedDate, error, userContext } = scanState;
  const update = (patch: Partial<ScanState>) => setScanState(prev => ({ ...prev, ...patch }));

  // Transient UI state — fine to reset on navigation
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((f: File) => {
    update({ file: f, preview: URL.createObjectURL(f), error: null });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleExtract = async () => {
    if (!file) return;
    update({ step: "processing", error: null });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("strategy", "smart");
    if (userContext.trim()) {
      formData.append("user_context", userContext.trim());
    }

    try {
      const res = await fetch("/api/scan/extract", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        let message = `Error ${res.status}`;
        try {
          const errJson = JSON.parse(errText);
          if (errJson.detail) message = errJson.detail;
        } catch {
          if (errText) message = errText;
        }
        throw new Error(message);
      }

      const data: ScanResult = await res.json();
      update({
        result: data,
        editedScores: data.round.hole_scores.map((s) => ({ ...s })),
        editedNotes: data.round.notes ?? "",
        editedDate: data.round.date
          ? data.round.date.substring(0, 10)
          : new Date().toISOString().substring(0, 10),
        step: "review",
      });
    } catch (err) {
      update({ error: err instanceof Error ? err.message : "Extraction failed", step: "upload" });
    }
  };

  const handleScoreChange = (index: number, field: keyof ExtractedHoleScore, value: string) => {
    const next = [...editedScores];
    const parsed = value === "" ? null : parseInt(value);
    if (field === "strokes") next[index] = { ...next[index], strokes: parsed };
    else if (field === "putts") next[index] = { ...next[index], putts: parsed };
    else if (field === "hole_number") next[index] = { ...next[index], hole_number: parsed };
    update({ editedScores: next });
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    update({ error: null });

    try {
      const res = await fetch("/api/scan/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          course_name: result.round.course?.name,
          course_location: result.round.course?.location,
          tee_box: result.round.tee_box,
          date: editedDate,
          notes: editedNotes,
          hole_scores: editedScores,
          // Hole data lets the API auto-create a custom course if not found in DB
          course_holes: result.round.course?.holes?.map((h) => ({
            hole_number: h.number,
            par: h.par,
          })),
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        let message = "Failed to save round";
        try {
          const errJson = JSON.parse(errText);
          if (errJson.detail) message = errJson.detail;
        } catch { if (errText) message = errText; }
        throw new Error(message);
      }

      const saved = await res.json();
      navigate(`/rounds/${saved.id}`);
    } catch (err) {
      update({ error: err instanceof Error ? err.message : "Save failed" });
      setSaving(false);
    }
  };

  // -- Upload Step --
  if (step === "upload") {
    return (
      <div>
        <PageHeader title="Scan Scorecard" subtitle="Upload a photo of your scorecard" />

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        <div
          className={`border-2 border-dashed rounded-xl p-16 text-center transition-colors ${
            dragOver
              ? "border-primary bg-primary-light"
              : "border-gray-300 hover:border-primary"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600 mb-2">Drag and drop your scorecard image here</p>
          <p className="text-sm text-gray-400 mb-4">or</p>
          <label className="inline-block px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-medium cursor-pointer hover:opacity-90 transition-opacity">
            <Camera size={16} className="inline mr-2" />
            Choose File
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>
          <p className="text-xs text-gray-400 mt-4">
            Supports JPG, PNG, WEBP, HEIC, PDF
          </p>
        </div>

        {preview && file && (
          <div className="mt-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">{file.name}</span>
                <button
                  onClick={() => update({ file: null, preview: null })}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              </div>
              <img
                src={preview}
                alt="Scorecard preview"
                className="max-h-64 rounded-lg mx-auto"
              />
              <div className="mt-4">
                <label className="text-sm font-medium text-gray-700">
                  Context for AI
                  <span className="font-normal text-gray-400 ml-1">(optional)</span>
                </label>
                <textarea
                  value={userContext}
                  onChange={(e) => update({ userContext: e.target.value })}
                  placeholder='e.g. "My name is Tucker", "I write scores as +1/-1/E (to par)", "No putts recorded", "Only front 9"'
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                  rows={2}
                />
              </div>
              <button
                onClick={handleExtract}
                className="mt-3 w-full px-5 py-3 bg-primary text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Extract Scorecard
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -- Processing Step --
  if (step === "processing") {
    return (
      <div>
        <PageHeader title="Scan Scorecard" />
        <div className="flex flex-col items-center justify-center h-64">
          <Loader2 size={48} className="text-primary animate-spin mb-4" />
          <p className="text-gray-600 font-medium">Analyzing your scorecard...</p>
          <p className="text-sm text-gray-400 mt-1">This may take 10-20 seconds</p>
        </div>
      </div>
    );
  }

  // -- Review Step --
  if (!result) return null;

  const rd = result.round;
  const coursePar = rd.course?.par ?? null;
  const totalStrokes = editedScores.reduce((s, h) => s + (h.strokes ?? 0), 0);
  const toPar = coursePar ? totalStrokes - coursePar : null;

  // Only strokes fields are actionable in this UI — ignore putts/fairway/gir low confidence
  const strokesReviewFields = result.fields_needing_review.filter(
    (f) => f.toLowerCase().includes("strokes")
  );
  const puttsNotRecorded = result.fields_needing_review.some(
    (f) => f.toLowerCase().includes("putts")
  );

  const confidenceIsOk = strokesReviewFields.length === 0;
  const confidenceBannerClass = confidenceIsOk
    ? "text-green-700 bg-green-50 border border-green-200"
    : "text-amber-700 bg-amber-50 border border-amber-200";

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

  function getFieldConfidence(holeNumber: number | null, index: number, field: string): FieldConfidence | null {
    const num = holeNumber ?? index + 1;
    const hc = result.confidence.hole_scores?.find((h) => h.hole_number === num);
    return hc?.fields?.[field] ?? null;
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

  function renderNine(startIdx: number, label: string, showGrandTotal = false) {
    const slice = editedScores.slice(startIdx, startIdx + 9);
    const ninePar = slice.reduce((s, hs, si) => {
      const holeNum = hs.hole_number ?? startIdx + si + 1;
      return s + (rd.course?.holes.find((h) => h.number === holeNum)?.par ?? 0);
    }, 0);
    const nineScore = slice.reduce((s, hs) => s + (hs.strokes ?? 0), 0);
    const hasScores = slice.some((hs) => hs.strokes != null);
    const nineToPar = hasScores && ninePar > 0 ? nineScore - ninePar : null;

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
          {/* Par */}
          <tr className="border-b border-gray-100 text-xs text-gray-500">
            <td className="px-3 py-1.5 font-medium">Par</td>
            {slice.map((hs, si) => {
              const holeNum = hs.hole_number ?? startIdx + si + 1;
              const par = rd.course?.holes.find((h) => h.number === holeNum)?.par;
              return <td key={si} className="px-1 py-1.5 text-center">{par ?? "-"}</td>;
            })}
            <td className="px-2 py-1.5 text-center bg-gray-50 font-bold">{ninePar || "-"}</td>
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
              return (
                <td key={si} className="px-1 py-1 text-center">
                  <input
                    type="number" min="1" max="15"
                    value={hs.strokes ?? ""}
                    onChange={(e) => handleScoreChange(origIdx, "strokes", e.target.value)}
                    className={`w-9 text-center px-0.5 py-0.5 border rounded text-sm font-semibold ${getScoreColorClass(hs.strokes, par)}`}
                  />
                  {sc && (
                    <div className="text-[9px] text-gray-400 leading-none mt-0.5">
                      {Math.round(sc.final_confidence * 100)}%
                    </div>
                  )}
                </td>
              );
            })}
            <td className="px-2 py-1.5 text-center bg-gray-50 font-bold text-gray-900 text-sm">
              {hasScores ? nineScore : "-"}
            </td>
            {showGrandTotal && (
              <td className="px-2 py-1.5 text-center bg-gray-100 font-bold text-base text-gray-900">
                {totalStrokes || "-"}
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

          {/* Putts — only if recorded on card */}
          {!puttsNotRecorded && (
            <tr className="text-xs text-gray-500">
              <td className="px-3 py-1.5 font-medium">Putts</td>
              {slice.map((hs, si) => {
                const origIdx = startIdx + si;
                const pc = getFieldConfidence(hs.hole_number, origIdx, "putts");
                return (
                  <td key={si} className="px-1 py-1 text-center">
                    <input
                      type="number" min="0" max="10"
                      value={hs.putts ?? ""}
                      onChange={(e) => handleScoreChange(origIdx, "putts", e.target.value)}
                      className="w-9 text-center px-0.5 py-0.5 border border-gray-200 rounded text-sm"
                    />
                    {pc && (
                      <div className="text-[9px] text-gray-400 leading-none mt-0.5">
                        {Math.round(pc.final_confidence * 100)}%
                      </div>
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-1.5 text-center bg-gray-50">
                {slice.reduce((s, hs) => s + (hs.putts ?? 0), 0) || "-"}
              </td>
              {showGrandTotal && (
                <td className="px-2 py-1.5 text-center bg-gray-100">
                  {editedScores.reduce((s, hs) => s + (hs.putts ?? 0), 0) || "-"}
                </td>
              )}
            </tr>
          )}
        </tbody>
      </table>
    );
  }

  const frontNine = editedScores.slice(0, 9).reduce((s, h) => s + (h.strokes ?? 0), 0) || null;
  const backNine = editedScores.slice(9).reduce((s, h) => s + (h.strokes ?? 0), 0) || null;

  return (
    <div>
      <PageHeader
        title={rd.course?.name ?? "Review Extraction"}
        subtitle={rd.course?.location ?? "Verify and edit the extracted data"}
      />

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Confidence banner */}
      <div className={`mb-4 p-3 rounded-lg text-sm font-medium flex items-start gap-2 ${confidenceBannerClass}`}>
        {confidenceIsOk ? <CheckCircle size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
        <div>
          {confidenceIsOk
            ? "Extraction looks good — verify scores below"
            : `${strokesReviewFields.length} score(s) may need review — verify highlighted holes`}
          {puttsNotRecorded && !confidenceIsOk && (
            <div className="font-normal text-xs mt-0.5 opacity-75">Putts not recorded on this scorecard</div>
          )}
        </div>
      </div>

      {/* Stat cards — same layout as rounds page */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
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
          <div className="text-3xl font-bold text-gray-900">{totalStrokes || "-"}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">To Par</div>
          <div className={`text-3xl font-bold ${toPar !== null && toPar < 0 ? "text-green-600" : toPar !== null && toPar > 0 ? "text-red-500" : "text-gray-900"}`}>
            {formatToPar(toPar)}
          </div>
        </div>
      </div>

      {/* Top: image + metadata side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Original Image</h3>
          {preview && <img src={preview} alt="Scorecard" className="w-full rounded-lg" />}
        </div>

        <div className="space-y-4">
          {/* Course info */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="text-lg font-bold text-gray-900">{rd.course?.name ?? "Unknown"}</div>
            {rd.course?.location && <div className="text-sm text-gray-500">{rd.course.location}</div>}
            <div className="flex gap-4 mt-2 text-sm text-gray-600">
              <span>Par: {coursePar ?? "-"}</span>
              <span>Tee: {rd.tee_box ?? "-"}</span>
            </div>
          </div>

          {/* Date + Notes */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Date</label>
                <input type="date" value={editedDate}
                  onChange={(e) => update({ editedDate: e.target.value })}
                  className="w-full mt-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Notes</label>
                <input type="text" value={editedNotes}
                  onChange={(e) => update({ editedNotes: e.target.value })}
                  className="w-full mt-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving}
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
          {renderNine(0, "OUT")}
          <div className="border-t-2 border-gray-300" />
          {renderNine(9, "IN", true)}
        </div>
      </div>
    </div>
  );
}
