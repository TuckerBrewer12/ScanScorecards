import { useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { CourseSummary } from "@/types/golf";
import type { ScanState, ScanResult, ExtractedHoleScore, ManualTee } from "@/types/scan";
import { initialScanState } from "@/types/scan";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";

function normalizeCourseQueryForSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

const CLIENT_UPLOAD_LONG_EDGE = 2000;
const CLIENT_UPLOAD_QUALITY = 0.8;

async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif") return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to decode image"));
      el.src = objectUrl;
    });

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return file;

    const longEdge = Math.max(srcW, srcH);
    const scale = longEdge > CLIENT_UPLOAD_LONG_EDGE ? CLIENT_UPLOAD_LONG_EDGE / longEdge : 1;
    const outW = Math.max(1, Math.round(srcW * scale));
    const outH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, outW, outH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", CLIENT_UPLOAD_QUALITY)
    );
    if (!blob) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "upload";
    return new File([blob], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function useScan(
  userId: string,
  scanState: ScanState,
  setScanState: React.Dispatch<React.SetStateAction<ScanState>>
) {
  const navigate = useNavigate();
  const { step, scanMode, selectedCourseId, selectedCourseName, file, result, editedScores, editedDate, editedTeeBox, userContext, prefetchedOcrText, reviewCourseId, reviewExternalCourseId, reviewCourseName, manualCourseHoles, manualCourseTees } = scanState;

  const update = useCallback(
    (patch: Partial<ScanState>) => setScanState((prev) => ({ ...prev, ...patch })),
    [setScanState]
  );

  // Transient UI state — fine to reset on navigation
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Manual entry transient state
  const [manualDate, setManualDate] = useState(new Date().toISOString().substring(0, 10));
  const [manualTeeBox, setManualTeeBox] = useState("");
  const [loadingCourse, setLoadingCourse] = useState(false);

  const { data: handicapData } = useQuery({
    queryKey: ["handicap", userId],
    queryFn: () => api.getUserHandicap(userId),
    enabled: step === "review",
  });
  const handicapIndex = handicapData?.handicap_index ?? null;

  // Review step: course search state
  const [reviewCourseQuery, setReviewCourseQuery] = useState("");
  const [reviewCourseResults, setReviewCourseResults] = useState<CourseSummary[]>([]);
  const [reviewSearching, setReviewSearching] = useState(false);
  const reviewSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleReviewCourseQuery = useCallback((q: string) => {
    setReviewCourseQuery(q);
    if (reviewSearchTimer.current) clearTimeout(reviewSearchTimer.current);
    const normalized = normalizeCourseQueryForSearch(q);
    if (!userId || normalized.length < 2) { setReviewCourseResults([]); return; }
    reviewSearchTimer.current = setTimeout(async () => {
      setReviewSearching(true);
      try {
        const results = await api.searchCourses(normalized, userId, true);
        setReviewCourseResults(results);
      } catch { setReviewCourseResults([]); }
      finally { setReviewSearching(false); }
    }, 300);
  }, [userId]);

  const selectReviewCourse = useCallback((course: CourseSummary) => {
    const isExternal = course.source === "external" || course.id.startsWith("external:");
    if (isExternal && !course.external_course_id) {
      update({ error: "External course result is missing provider ID. Please choose another match or enter a custom name." });
      return;
    }
    update({
      reviewCourseId: isExternal ? null : course.id,
      reviewExternalCourseId: course.external_course_id ?? null,
      reviewCourseName: course.name ?? course.id,
      error: null,
    });
    setReviewCourseQuery("");
    setReviewCourseResults([]);
  }, [update]);

  // Course search state (upload/manual)
  const [courseQuery, setCourseQuery] = useState("");
  const [courseResults, setCourseResults] = useState<CourseSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCourseQuery = useCallback((q: string) => {
    setCourseQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const normalized = normalizeCourseQueryForSearch(q);
    if (!userId || normalized.length < 2) { setCourseResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await api.searchCourses(normalized, userId);
        setCourseResults(results);
      } catch { setCourseResults([]); }
      finally { setSearching(false); }
    }, 300);
  }, [userId]);

  const selectCourse = useCallback((course: CourseSummary) => {
    update({ selectedCourseId: course.id, selectedCourseName: course.name ?? course.id });
    setCourseQuery("");
    setCourseResults([]);
  }, [update]);

  const activePrefetch = useRef<string | null>(null);

  const handleFile = useCallback((f: File) => {
    const fileId = `${f.name}-${f.size}-${Date.now()}`;
    activePrefetch.current = fileId;

    void (async () => {
      const t0 = performance.now();
      const processed = await compressImageForUpload(f);
      const t1 = performance.now();
      console.info(
        "[scan] upload preprocess: name=%s in=%d out=%d type_in=%s type_out=%s ms=%.1f",
        f.name,
        f.size,
        processed.size,
        f.type || "unknown",
        processed.type || "unknown",
        t1 - t0,
      );
      
      // Only proceed if this is still the active file
      if (activePrefetch.current !== fileId) return;

      update({ file: processed, preview: URL.createObjectURL(processed), error: null, prefetchedOcrText: null });

      // Kick off OCR immediately in the background so it's ready when user hits Extract
      void (async () => {
        try {
          const token = getToken();
          const ocrForm = new FormData();
          ocrForm.append("file", processed);
          const res = await fetch("/api/scan/ocr", {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: ocrForm,
          });
          if (res.ok) {
            const { ocr_text } = await res.json() as { ocr_text: string };
            // Ensure we don't set state if the user discarded this file or uploaded a new one
            if (activePrefetch.current === fileId) {
                update({ prefetchedOcrText: ocr_text });
                console.info("[scan] OCR prefetch complete: chars=%d", ocr_text.length);
            }
          }
        } catch {
          // Prefetch failed silently — extract will fall back to running OCR itself
          console.info("[scan] OCR prefetch failed, will retry on extract");
        }
      })();
    })();
  }, [update]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleExtract = useCallback(async () => {
    if (!file) return;
    update({ step: "processing", error: null });

    const formData = new FormData();
    formData.append("file", file);
    if (selectedCourseId) {
      formData.append("course_id", selectedCourseId);
    }
    if (userContext.trim()) {
      formData.append("user_context", userContext.trim());
    }
    if (prefetchedOcrText) {
      formData.append("ocr_text", prefetchedOcrText);
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
        editedDate: data.round.date
          ? data.round.date.substring(0, 10)
          : new Date().toISOString().substring(0, 10),
        editedTeeBox: data.round.tee_box ?? null,
        reviewCourseId: null,
        reviewExternalCourseId: null,
        reviewCourseName: data.round.course?.name ?? null,
        step: "review",
      });
      // For new-course full scans (no preselected course), keep review course search empty.
      // OCR course names are often noisy and should not auto-populate the search box.
      const shouldPrefillReviewSearch = Boolean(selectedCourseId);
      if (shouldPrefillReviewSearch) {
        const extractedCourseName = normalizeCourseQueryForSearch(data.round.course?.name ?? "");
        setReviewCourseQuery(extractedCourseName);
        if (extractedCourseName.length >= 2) {
          handleReviewCourseQuery(extractedCourseName);
        }
      } else {
        setReviewCourseQuery("");
        setReviewCourseResults([]);
      }
    } catch (err) {
      update({ error: err instanceof Error ? err.message : "Extraction failed", step: "upload" });
    }
  }, [file, selectedCourseId, userContext, prefetchedOcrText, update, userId, handleReviewCourseQuery]);

  const handleScoreChange = useCallback((index: number, field: keyof ExtractedHoleScore, value: string) => {
    const next = [...editedScores];
    const parsed = value === "" ? null : parseInt(value);
    if (field === "strokes") next[index] = { ...next[index], strokes: parsed };
    else if (field === "putts") next[index] = { ...next[index], putts: parsed };
    else if (field === "hole_number") next[index] = { ...next[index], hole_number: parsed };
    update({ editedScores: next });
  }, [update, editedScores]);

  const handleGirChange = useCallback((index: number, value: boolean | null) => {
    const next = [...editedScores];
    next[index] = { ...next[index], green_in_regulation: value };
    update({ editedScores: next });
  }, [update, editedScores]);

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
  }, [update]);

  const handleStartEntry = useCallback(() => {
    const holes18 = manualCourseHoles.length > 0
      ? manualCourseHoles
      : Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: null }));

    const emptyScores: ExtractedHoleScore[] = holes18.map((h) => ({
      hole_number: h.number,
      strokes: null,
      putts: null,
      shots_to_green: null,
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
      editedDate: manualDate,
      editedTeeBox: manualTeeBox || null,
      reviewCourseId: selectedCourseId,
      reviewExternalCourseId: null,
      reviewCourseName: selectedCourseName,
      step: "review",
    });
  }, [manualCourseHoles, manualCourseTees, selectedCourseId, selectedCourseName, manualTeeBox, manualDate, update]);

  const handleSave = useCallback(async () => {
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
            ? {
                course_id: reviewCourseId,
                ...(reviewExternalCourseId ? { external_course_id: reviewExternalCourseId } : {}),
              }
            : reviewExternalCourseId
            ? {
                external_course_id: reviewExternalCourseId,
                course_name: reviewCourseName ?? result.round.course?.name,
              }
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
  }, [result, userId, reviewCourseId, reviewExternalCourseId, reviewCourseName, editedTeeBox, editedDate, editedScores, update, setScanState, navigate]);

  return {
    // Derived state from scanState
    step,
    scanMode,
    selectedCourseId,
    selectedCourseName,
    file,
    result,
    editedScores,
    editedDate,
    editedTeeBox,
    userContext,
    reviewCourseId,
    reviewExternalCourseId,
    reviewCourseName,
    manualCourseHoles,
    manualCourseTees,
    error: scanState.error,
    preview: scanState.preview,

    // update helper
    update,
    setScanState,

    // Transient state
    saving,
    dragOver,
    setDragOver,
    handicapIndex,
    manualDate,
    setManualDate,
    manualTeeBox,
    setManualTeeBox,
    loadingCourse,

    // Review course search
    reviewCourseQuery,
    setReviewCourseQuery,
    reviewCourseResults,
    setReviewCourseResults,
    reviewSearching,
    handleReviewCourseQuery,
    selectReviewCourse,

    // Upload course search
    courseQuery,
    setCourseQuery,
    courseResults,
    setCourseResults,
    searching,
    handleCourseQuery,
    selectCourse,

    // Handlers
    handleFile,
    handleDrop,
    handleExtract,
    handleScoreChange,
    handleGirChange,
    selectCourseManual,
    handleStartEntry,
    handleSave,
  };
}
