import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Camera, Loader2, CheckCircle, AlertTriangle, X, Zap, Search, ScanLine, MapPin, PenLine } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatToPar, calcCourseHandicap, calcNetScore } from "@/types/golf";
import type { CourseSummary } from "@/types/golf";
import type { ScanState, ScanResult, ExtractedHoleScore, FieldConfidence, ManualTee } from "@/types/scan";
import { initialScanState } from "@/types/scan";
import { api } from "@/lib/api";
import { getToken } from "@/context/AuthContext";

interface ScanPageProps {
  userId: string;
  scanState: ScanState;
  setScanState: React.Dispatch<React.SetStateAction<ScanState>>;
}

export function ScanPage({ userId, scanState, setScanState }: ScanPageProps) {
  const navigate = useNavigate();
  const { step, scanMode, selectedCourseId, selectedCourseName, scoringFormat, file, preview, result, editedScores, editedNotes, editedDate, editedTeeBox, error, userContext, reviewCourseId, reviewCourseName, manualCourseHoles, manualCourseTees } = scanState;
  const update = (patch: Partial<ScanState>) => setScanState(prev => ({ ...prev, ...patch }));

  // Transient UI state — fine to reset on navigation
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [handicapIndex, setHandicapIndex] = useState<number | null>(null);
  // Manual entry transient state
  const [manualDate, setManualDate] = useState(new Date().toISOString().substring(0, 10));
  const [manualTeeBox, setManualTeeBox] = useState("");
  const [loadingCourse, setLoadingCourse] = useState(false);

  useEffect(() => {
    if (step === "review") {
      api.getUserHandicap(userId).then((r) => setHandicapIndex(r.handicap_index)).catch(() => {});
    }
  }, [step, userId]);

  // Review step: course search state
  const [reviewCourseQuery, setReviewCourseQuery] = useState("");
  const [reviewCourseResults, setReviewCourseResults] = useState<CourseSummary[]>([]);
  const [reviewSearching, setReviewSearching] = useState(false);
  const reviewSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleReviewCourseQuery = useCallback((q: string) => {
    setReviewCourseQuery(q);
    if (reviewSearchTimer.current) clearTimeout(reviewSearchTimer.current);
    if (q.trim().length < 2) { setReviewCourseResults([]); return; }
    reviewSearchTimer.current = setTimeout(async () => {
      setReviewSearching(true);
      try {
        const results = await api.searchCourses(q.trim(), userId);
        setReviewCourseResults(results);
      } catch { setReviewCourseResults([]); }
      finally { setReviewSearching(false); }
    }, 300);
  }, [userId]);

  const selectReviewCourse = useCallback((course: CourseSummary) => {
    update({ reviewCourseId: course.id, reviewCourseName: course.name ?? course.id });
    setReviewCourseQuery("");
    setReviewCourseResults([]);
  }, []);

  // Course search state (fast scan)
  const [courseQuery, setCourseQuery] = useState("");
  const [courseResults, setCourseResults] = useState<CourseSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCourseQuery = useCallback((q: string) => {
    setCourseQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) { setCourseResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await api.searchCourses(q.trim(), userId);
        setCourseResults(results);
      } catch { setCourseResults([]); }
      finally { setSearching(false); }
    }, 300);
  }, [userId]);

  const selectCourse = useCallback((course: CourseSummary) => {
    update({ selectedCourseId: course.id, selectedCourseName: course.name ?? course.id });
    setCourseQuery("");
    setCourseResults([]);
  }, []);

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
    if (scanMode === "fast" && selectedCourseId) {
      formData.append("course_id", selectedCourseId);
      if (scoringFormat) formData.append("scoring_format", scoringFormat);
    } else {
      formData.append("strategy", "smart");
    }
    if (userContext.trim()) {
      formData.append("user_context", userContext.trim());
    }

    try {
      const token = getToken();
      const res = await fetch("/api/scan/extract", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
        editedTeeBox: data.round.tee_box ?? null,
        reviewCourseId: null,
        reviewCourseName: data.round.course?.name ?? null,
        step: "review",
      });
      // Pre-fill the review search box with whatever the LLM extracted
      setReviewCourseQuery(data.round.course?.name ?? "");
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

  const handleGirChange = (index: number, value: boolean | null) => {
    const next = [...editedScores];
    next[index] = { ...next[index], green_in_regulation: value };
    update({ editedScores: next });
  };

  const selectCourseManual = useCallback(async (course: CourseSummary) => {
    update({ selectedCourseId: course.id, selectedCourseName: course.name ?? course.id });
    setCourseQuery("");
    setCourseResults([]);
    setLoadingCourse(true);
    try {
      const full = await api.getCourse(course.id);
      const tees: ManualTee[] = full.tees.map((t) => ({
        color: t.color,
        slope_rating: t.slope_rating,
        course_rating: t.course_rating,
        hole_yardages: Object.fromEntries(
          Object.entries(t.hole_yardages).map(([k, v]) => [String(k), v as number])
        ),
      }));
      update({
        manualCourseHoles: full.holes.map((h) => ({ number: h.number, par: h.par })),
        manualCourseTees: tees,
      });
    } catch { /* holes/tees stay empty — user can still enter scores */ }
    finally { setLoadingCourse(false); }
  }, []);

  const handleStartEntry = () => {
    const holes18 = manualCourseHoles.length > 0
      ? manualCourseHoles
      : Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: null }));

    const emptyScores: ExtractedHoleScore[] = holes18.map((h) => ({
      hole_number: h.number,
      strokes: null,
      putts: null,
      fairway_hit: null,
      green_in_regulation: null,
    }));

    const syntheticResult: ScanResult = {
      round: {
        course: selectedCourseId || selectedCourseName ? {
          name: selectedCourseName,
          location: null,
          par: holes18.reduce((s, h) => s + (h.par ?? 0), 0) || null,
          holes: holes18,
          tees: manualCourseTees,
        } : null,
        tee_box: manualTeeBox || null,
        date: manualDate,
        hole_scores: emptyScores,
        notes: null,
      },
      confidence: { overall: 1, level: "high", hole_scores: [] },
      fields_needing_review: [],
    };

    update({
      result: syntheticResult,
      editedScores: emptyScores,
      editedNotes: "",
      editedDate: manualDate,
      editedTeeBox: manualTeeBox || null,
      reviewCourseId: selectedCourseId,
      reviewCourseName: selectedCourseName,
      step: "review",
    });
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    update({ error: null });

    try {
      const saveToken = getToken();
      const res = await fetch("/api/scan/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(saveToken ? { Authorization: `Bearer ${saveToken}` } : {}) },
        body: JSON.stringify({
          user_id: userId,
          ...(reviewCourseId
            ? { course_id: reviewCourseId }
            : { course_name: reviewCourseName ?? result.round.course?.name }),
          course_location: result.round.course?.location,
          tee_box: editedTeeBox,
          ...(() => {
            const tee = editedTeeBox
              ? result.round.course?.tees?.find(
                  (t) => t.color?.toLowerCase() === editedTeeBox.toLowerCase()
                )
              : null;
            return tee
              ? {
                  tee_slope_rating: tee.slope_rating,
                  tee_course_rating: tee.course_rating,
                  tee_yardages: Object.keys(tee.hole_yardages).length > 0
                    ? tee.hole_yardages
                    : undefined,
                }
              : {};
          })(),
          date: editedDate,
          notes: editedNotes,
          hole_scores: editedScores,
          course_holes: result.round.course?.holes?.map((h) => ({
            hole_number: h.number,
            par: h.par,
          })),
          all_tees: result.round.course?.tees
            ?.filter((t) => t.color)
            .map((t) => ({
              color: t.color,
              slope_rating: t.slope_rating,
              course_rating: t.course_rating,
              hole_yardages: t.hole_yardages ?? {},
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
      setScanState(initialScanState);
      navigate(`/rounds/${saved.id}`);
    } catch (err) {
      update({ error: err instanceof Error ? err.message : "Save failed" });
      setSaving(false);
    }
  };

  // -- Upload Step --
  if (step === "upload") {
    const showUploadArea = scanMode === "full" || (scanMode === "fast" && !!selectedCourseId && !!scoringFormat);

    return (
      <div>
        <PageHeader title="Scan Scorecard" subtitle="Choose how to process your scorecard" />

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {/* Mode selector */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <button
            onClick={() => update({ scanMode: "full", selectedCourseId: null, selectedCourseName: null, scoringFormat: null, file: null, preview: null, manualCourseHoles: [], manualCourseTees: [] })}
            className={`flex flex-col items-center justify-center gap-3 p-4 rounded-xl border-2 text-center transition-all ${
              scanMode === "full"
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <ScanLine size={28} className={scanMode === "full" ? "text-primary" : "text-gray-400"} />
            <div>
              <div className={`font-semibold text-sm ${scanMode === "full" ? "text-primary" : "text-gray-700"}`}>
                Capture Card
              </div>
              <div className="text-xs text-gray-500 mt-1">Extracts course, tees &amp; scores</div>
              <div className="text-xs text-gray-400 mt-0.5">~1–2 minutes</div>
            </div>
          </button>

          <button
            onClick={() => update({ scanMode: "fast", selectedCourseId: null, selectedCourseName: null, scoringFormat: null, file: null, preview: null, manualCourseHoles: [], manualCourseTees: [] })}
            className={`flex flex-col items-center justify-center gap-3 p-4 rounded-xl border-2 text-center transition-all ${
              scanMode === "fast"
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <Zap size={28} className={scanMode === "fast" ? "text-primary" : "text-gray-400"} />
            <div>
              <div className={`font-semibold text-sm ${scanMode === "fast" ? "text-primary" : "text-gray-700"}`}>
                Fast Scan
              </div>
              <div className="text-xs text-gray-500 mt-1">Select a saved course, scores only</div>
              <div className="text-xs text-gray-400 mt-0.5">~10 seconds</div>
            </div>
          </button>

          <button
            onClick={() => update({ scanMode: "manual", selectedCourseId: null, selectedCourseName: null, scoringFormat: null, file: null, preview: null, manualCourseHoles: [], manualCourseTees: [] })}
            className={`flex flex-col items-center justify-center gap-3 p-4 rounded-xl border-2 text-center transition-all ${
              scanMode === "manual"
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <PenLine size={28} className={scanMode === "manual" ? "text-primary" : "text-gray-400"} />
            <div>
              <div className={`font-semibold text-sm ${scanMode === "manual" ? "text-primary" : "text-gray-700"}`}>
                Manual Entry
              </div>
              <div className="text-xs text-gray-500 mt-1">Enter scores by hand</div>
              <div className="text-xs text-gray-400 mt-0.5">No image needed</div>
            </div>
          </button>
        </div>

        {/* Manual entry setup */}
        {scanMode === "manual" && (
          <div className="space-y-4">
            {/* Course search */}
            {!selectedCourseId ? (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Course <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={courseQuery}
                    onChange={(e) => handleCourseQuery(e.target.value)}
                    placeholder="Search for a course by name..."
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    autoFocus
                  />
                  {(searching || loadingCourse) && (
                    <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
                  )}
                </div>
                {courseResults.length > 0 && (
                  <ul className="mt-1 bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden divide-y divide-gray-100">
                    {courseResults.map((c) => (
                      <li key={c.id}>
                        <button
                          onClick={() => selectCourseManual(c)}
                          className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                        >
                          <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-sm font-medium text-gray-800">{c.name}</div>
                            {c.location && <div className="text-xs text-gray-500">{c.location}</div>}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {courseQuery.trim().length >= 2 && !searching && courseResults.length === 0 && (
                  <div className="mt-2 flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-sm text-gray-400">No courses found</span>
                    <button
                      onClick={() => {
                        update({ selectedCourseName: courseQuery.trim() });
                        setCourseQuery("");
                        setCourseResults([]);
                      }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Use "{courseQuery.trim()}"
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle size={16} className="text-green-600 shrink-0" />
                <span className="text-sm font-semibold text-green-800 flex-1">{selectedCourseName}</span>
                <button
                  onClick={() => update({ selectedCourseId: null, selectedCourseName: null, manualCourseHoles: [], manualCourseTees: [] })}
                  className="text-green-600 hover:text-green-800"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Tee selector — only when course selected and has tees */}
            {manualCourseTees.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Tee Box</label>
                <select
                  value={manualTeeBox}
                  onChange={(e) => setManualTeeBox(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  <option value="">— select tee —</option>
                  {manualCourseTees.map((t, i) => (
                    <option key={i} value={t.color ?? ""}>{t.color ?? "Unknown"}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Date */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Date Played</label>
              <input
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            <button
              onClick={handleStartEntry}
              className="w-full px-5 py-3 bg-primary text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Start Entering Scores
            </button>
          </div>
        )}

        {/* Fast scan: course search */}
        {scanMode === "fast" && !selectedCourseId && (
          <div className="mb-6">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={courseQuery}
                onChange={(e) => handleCourseQuery(e.target.value)}
                placeholder="Search for a course by name..."
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                autoFocus
              />
              {searching && (
                <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
              )}
            </div>
            {courseResults.length > 0 && (
              <ul className="mt-1 bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden divide-y divide-gray-100">
                {courseResults.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => selectCourse(c)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-gray-800">{c.name}</div>
                        {c.location && <div className="text-xs text-gray-500">{c.location}</div>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {courseQuery.trim().length >= 2 && !searching && courseResults.length === 0 && (
              <p className="mt-2 text-sm text-gray-400 text-center">No courses found — try a different name</p>
            )}
          </div>
        )}

        {/* Selected course chip */}
        {scanMode === "fast" && selectedCourseId && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle size={16} className="text-green-600 shrink-0" />
            <span className="text-sm font-semibold text-green-800 flex-1">{selectedCourseName}</span>
            <button
              onClick={() => update({ selectedCourseId: null, selectedCourseName: null, scoringFormat: null, file: null, preview: null })}
              className="text-green-600 hover:text-green-800"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Scoring format toggle — fast scan only, after course selected */}
        {scanMode === "fast" && selectedCourseId && (
          <div className="mb-5">
            <p className="text-sm font-medium text-gray-700 mb-2">How are scores written on this card?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => update({ scoringFormat: "strokes" })}
                className={`px-4 py-3 rounded-xl border-2 text-left transition-all ${
                  scoringFormat === "strokes"
                    ? "border-primary bg-primary/5"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className={`text-sm font-semibold ${scoringFormat === "strokes" ? "text-primary" : "text-gray-700"}`}>
                  Total Strokes
                </div>
                <div className="text-xs text-gray-400 mt-0.5">e.g. 4, 5, 6</div>
              </button>
              <button
                onClick={() => update({ scoringFormat: "to_par" })}
                className={`px-4 py-3 rounded-xl border-2 text-left transition-all ${
                  scoringFormat === "to_par"
                    ? "border-primary bg-primary/5"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className={`text-sm font-semibold ${scoringFormat === "to_par" ? "text-primary" : "text-gray-700"}`}>
                  Score to Par
                </div>
                <div className="text-xs text-gray-400 mt-0.5">e.g. +1, −1, E</div>
              </button>
            </div>
          </div>
        )}

        {/* File upload drop zone */}
        {showUploadArea && (
          <div
            className={`border-2 border-dashed rounded-xl p-16 text-center transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-gray-300 hover:border-primary"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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
        )}

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
                {scanMode === "fast" ? (
                  <>
                    <label className="text-sm font-medium text-gray-700">
                      Your name on the card
                      <span className="font-normal text-gray-400 ml-1">(optional — helps pick the right row)</span>
                    </label>
                    <input
                      type="text"
                      value={userContext}
                      onChange={(e) => update({ userContext: e.target.value })}
                      placeholder='e.g. "Tucker"'
                      className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>
              <button
                onClick={handleExtract}
                className="mt-3 w-full px-5 py-3 bg-primary text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                {scanMode === "fast" ? "Fast Scan" : "Extract Scorecard"}
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
          <p className="text-sm text-gray-400 mt-1">
            {scanMode === "fast" ? "Fast scan — usually under 10 seconds" : "This may take 1–2 minutes"}
          </p>
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
    const hc = result?.confidence.hole_scores?.find((h) => h.hole_number === num);
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
              <td className="px-2 py-1.5 text-center bg-gray-50 font-bold">{nineYardage || "-"}</td>
              {showGrandTotal && <td className="px-2 py-1.5 text-center bg-gray-100 font-bold">{totalYardage || "-"}</td>}
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

          {/* Putts — always in manual mode, otherwise only if recorded on card */}
          {(!puttsNotRecorded || isManual) && (
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

          {/* GIR — manual entry only */}
          {isManual && (
            <tr className="text-xs">
              <td className="px-3 py-1.5 font-bold text-green-700">GIR</td>
              {slice.map((hs, si) => {
                const origIdx = startIdx + si;
                const gir = hs.green_in_regulation;
                return (
                  <td key={si} className="px-1 py-1 text-center">
                    <button
                      onClick={() => handleGirChange(origIdx, gir === true ? false : gir === false ? null : true)}
                      className={`w-9 h-7 rounded border text-xs font-medium transition-colors ${
                        gir === true
                          ? "border-green-400 bg-green-50 text-green-700"
                          : gir === false
                          ? "border-red-200 bg-red-50 text-red-500"
                          : "border-gray-200 bg-white text-gray-400"
                      }`}
                    >
                      {gir === true ? "Y" : gir === false ? "N" : "–"}
                    </button>
                  </td>
                );
              })}
              <td className="px-2 py-1.5 text-center text-green-700 font-semibold bg-gray-50">
                {slice.filter((hs) => hs.green_in_regulation === true).length || "-"}
              </td>
              {showGrandTotal && (
                <td className="px-2 py-1.5 text-center text-green-700 font-semibold bg-gray-100">
                  {editedScores.filter((hs) => hs.green_in_regulation === true).length || "-"}
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
        title={reviewCourseName ?? rd.course?.name ?? "Review Extraction"}
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
            ? scanMode === "manual"
              ? "Enter your scores hole by hole below"
              : "Extraction looks good — verify scores below"
            : `${strokesReviewFields.length} score(s) may need review — verify highlighted holes`}
          {puttsNotRecorded && !confidenceIsOk && (
            <div className="font-normal text-xs mt-0.5 opacity-75">Putts not recorded on this scorecard</div>
          )}
        </div>
      </div>

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
              <div className="text-3xl font-bold text-gray-900">{totalStrokes || "-"}</div>
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
              {reviewCourseId ? reviewCourseName : reviewCourseName ?? "Unknown Course"}
            </div>
            {rd.course?.location && <div className="text-sm text-gray-500">{rd.course.location}</div>}
            <div className="flex gap-4 mt-2 text-sm text-gray-600">
              <span>Par: {coursePar ?? "-"}</span>
            </div>

            {/* Course link / search */}
            <div className="mt-3">
              {reviewCourseId ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle size={14} className="text-green-600 shrink-0" />
                  <span className="text-sm font-medium text-green-800 flex-1">Linked: {reviewCourseName}</span>
                  <button
                    onClick={() => {
                      update({ reviewCourseId: null });
                      setReviewCourseQuery(reviewCourseName ?? "");
                    }}
                    className="text-green-600 hover:text-green-800"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Link to saved course or enter name</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={reviewCourseQuery}
                      onChange={(e) => handleReviewCourseQuery(e.target.value)}
                      placeholder="Search courses…"
                      className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    {reviewSearching && (
                      <Loader2 size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
                    )}
                  </div>
                  {reviewCourseResults.length > 0 && (
                    <ul className="mt-1 bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden divide-y divide-gray-100">
                      {reviewCourseResults.map((c) => (
                        <li key={c.id}>
                          <button
                            onClick={() => selectReviewCourse(c)}
                            className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                          >
                            <MapPin size={13} className="text-gray-400 mt-0.5 shrink-0" />
                            <div>
                              <div className="text-sm font-medium text-gray-800">{c.name}</div>
                              {c.location && <div className="text-xs text-gray-500">{c.location}</div>}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {reviewCourseQuery.trim().length >= 2 && !reviewSearching && reviewCourseResults.length === 0 && (
                    <div className="mt-1 flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                      <span className="text-xs text-gray-500">No match — save as new course</span>
                      <button
                        onClick={() => {
                          update({ reviewCourseName: reviewCourseQuery.trim(), reviewCourseId: null });
                          setReviewCourseResults([]);
                        }}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Use "{reviewCourseQuery.trim()}"
                      </button>
                    </div>
                  )}
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
                    onChange={(e) => update({ editedTeeBox: e.target.value || null })}
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
          {renderNine(0, "OUT", false, scanMode === "manual")}
          <div className="border-t-2 border-gray-300" />
          {renderNine(9, "IN", true, scanMode === "manual")}
        </div>
      </div>
    </div>
  );
}
