import { Upload, Camera, AlertTriangle, X, Zap, Search, ScanLine, MapPin, CheckCircle, Loader2, PenLine } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import type { ScanState } from "@/types/scan";
import type { CourseSummary } from "@/types/golf";

interface ScanUploadStepProps {
  scanMode: ScanState["scanMode"];
  selectedCourseId: string | null;
  selectedCourseName: string | null;
  scoringFormat: ScanState["scoringFormat"];
  file: File | null;
  preview: string | null;
  error: string | null;
  userContext: string;
  dragOver: boolean;
  // Course search (fast + manual)
  courseQuery: string;
  courseResults: CourseSummary[];
  searching: boolean;
  loadingCourse: boolean;
  // Handlers
  onModeChange: (mode: ScanState["scanMode"]) => void;
  onCourseQuery: (q: string) => void;
  onSelectCourse: (course: CourseSummary) => void;
  onSelectCourseManual: (course: CourseSummary) => void;
  onClearCourse: () => void;
  onScoringFormat: (fmt: "strokes" | "to_par") => void;
  onFile: (f: File) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (over: boolean) => void;
  onUpdate: (patch: Partial<ScanState>) => void;
  onExtract: () => void;
  setCourseQuery: (q: string) => void;
  setCourseResults: (r: CourseSummary[]) => void;
}

export function ScanUploadStep({
  scanMode,
  selectedCourseId,
  selectedCourseName,
  scoringFormat,
  file,
  preview,
  error,
  userContext,
  dragOver,
  courseQuery,
  courseResults,
  searching,
  loadingCourse,
  onModeChange,
  onCourseQuery,
  onSelectCourse,
  onSelectCourseManual,
  onClearCourse,
  onScoringFormat,
  onFile,
  onDrop,
  onDragOver,
  onUpdate,
  onExtract,
  setCourseQuery,
  setCourseResults,
}: ScanUploadStepProps) {
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
          onClick={() => onModeChange("full")}
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
          onClick={() => onModeChange("fast")}
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
          onClick={() => onModeChange("manual")}
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

      {/* Fast scan: course search */}
      {scanMode === "fast" && !selectedCourseId && (
        <div className="mb-6">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={courseQuery}
              onChange={(e) => onCourseQuery(e.target.value)}
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
                    onClick={() => onSelectCourse(c)}
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
            onClick={onClearCourse}
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
              onClick={() => onScoringFormat("strokes")}
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
              onClick={() => onScoringFormat("to_par")}
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
          onDragOver={(e) => { e.preventDefault(); onDragOver(true); }}
          onDragLeave={() => onDragOver(false)}
          onDrop={onDrop}
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
                if (f) onFile(f);
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
                onClick={() => onUpdate({ file: null, preview: null })}
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
                    onChange={(e) => onUpdate({ userContext: e.target.value })}
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
                    onChange={(e) => onUpdate({ userContext: e.target.value })}
                    placeholder='e.g. "My name is Tucker", "I write scores as +1/-1/E (to par)", "No putts recorded", "Only front 9"'
                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                    rows={2}
                  />
                </>
              )}
            </div>
            <button
              onClick={onExtract}
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
