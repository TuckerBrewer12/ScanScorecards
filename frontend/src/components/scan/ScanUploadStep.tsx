import { Camera, AlertTriangle, X, Search, ScanLine, MapPin, CheckCircle, Loader2, PenLine } from "lucide-react";
import { ScorecardLayoutPicker } from "./ScorecardLayoutPicker";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import type { ScanState } from "@/types/scan";
import type { CourseSummary } from "@/types/golf";

interface ScanUploadStepProps {
  scanMode: ScanState["scanMode"];
  selectedCourseId: string | null;
  selectedCourseName: string | null;
  file: File | null;
  preview: string | null;
  error: string | null;
  dragOver: boolean;
  courseQuery: string;
  courseResults: CourseSummary[];
  searching: boolean;
  loadingCourse: boolean;
  onModeChange: (mode: ScanState["scanMode"]) => void;
  onCourseQuery: (q: string) => void;
  onSelectCourse: (course: CourseSummary) => void;
  onSelectCourseManual: (course: CourseSummary) => void;
  onClearCourse: () => void;
  onFile: (f: File) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (over: boolean) => void;
  onUpdate: (patch: Partial<ScanState>) => void;
  onExtract: () => void;
}

export function ScanUploadStep({
  scanMode,
  selectedCourseId,
  selectedCourseName,
  file,
  preview,
  error,
  dragOver,
  courseQuery,
  courseResults,
  searching,
  onModeChange,
  onCourseQuery,
  onSelectCourse,
  onClearCourse,
  onFile,
  onDrop,
  onDragOver,
  onUpdate,
  onExtract,
}: ScanUploadStepProps) {
  const showUploadArea = scanMode === "full";
  const showCourseSearch = scanMode === "full";
  const hasFile = !!preview && !!file;

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
      <div className="grid grid-cols-2 gap-3 mb-6">
        {([
          { mode: "full" as const, icon: ScanLine, label: "Capture Card", sub: "Extracts course, tees & scores", time: "~1–2 min" },
          { mode: "manual" as const, icon: PenLine, label: "Manual Entry", sub: "Enter scores by hand",          time: "No image" },
        ] as const).map(({ mode, icon: Icon, label, sub, time }) => (
          <button
            key={mode}
            onClick={() => onModeChange(mode)}
            className={`flex flex-col items-center justify-center gap-3 p-4 rounded-xl border-2 text-center transition-all ${
              scanMode === mode
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <Icon size={26} className={scanMode === mode ? "text-primary" : "text-gray-400"} />
            <div>
              <div className={`font-semibold text-sm ${scanMode === mode ? "text-primary" : "text-gray-700"}`}>{label}</div>
              <div className="text-xs text-gray-500 mt-1">{sub}</div>
              <div className="text-xs text-gray-400 mt-0.5">{time}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Course search */}
      {showCourseSearch && !selectedCourseId && (
        <div className="mb-6">
          {scanMode === "full" && (
            <p className="text-sm text-gray-500 mb-2">Optional: pre-select a course to speed up extraction.</p>
          )}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={courseQuery}
              onChange={(e) => onCourseQuery(e.target.value)}
              placeholder={scanMode === "full" ? "Optional: search course…" : "Search for a course by name…"}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              autoFocus
            />
            {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
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
            <p className="mt-2 text-sm text-gray-400 text-center">No courses found</p>
          )}
        </div>
      )}

      {/* Selected course chip */}
      {showCourseSearch && selectedCourseId && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-[#2d7a3a] border border-[#2d7a3a] rounded-lg">
          <CheckCircle size={16} className="text-white shrink-0" />
          <span className="text-sm font-semibold text-white flex-1">
            {selectedCourseName}
            {scanMode === "full" ? " (preselected)" : ""}
          </span>
          <button onClick={onClearCourse} className="text-white/70 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Drop zone — hidden once a file is selected */}
      {showUploadArea && !hasFile && (
        <motion.div
          className="relative border-2 border-dashed rounded-2xl overflow-hidden cursor-pointer"
          style={{ minHeight: 260 }}
          animate={{
            borderColor: dragOver ? "#2d7a3a" : "#d1d5db",
            backgroundColor: dragOver ? "rgba(45,122,58,0.03)" : "rgba(249,250,249,0.6)",
            scale: dragOver ? 1.008 : 1,
          }}
          transition={{ duration: 0.18 }}
          onDragOver={(e) => { e.preventDefault(); onDragOver(true); }}
          onDragLeave={() => onDragOver(false)}
          onDrop={(e) => { onDragOver(false); onDrop(e); }}
        >
          {/* Radial glow on drag */}
          <AnimatePresence>
            {dragOver && (
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(45,122,58,0.09) 0%, transparent 68%)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            )}
          </AnimatePresence>

          <div className="flex flex-col items-center justify-center h-full py-14 px-8 text-center">
            {/* Icon */}
            <motion.div
              animate={{ y: dragOver ? -8 : 0 }}
              transition={{ type: "spring", stiffness: 340, damping: 22 }}
              className="mb-6"
            >
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto transition-colors duration-200"
                style={{
                  background: dragOver ? "rgba(45,122,58,0.08)" : "#f3f4f6",
                  border: `1.5px solid ${dragOver ? "rgba(45,122,58,0.3)" : "#e5e7eb"}`,
                }}
              >
                <ScanLine size={36} className="transition-colors duration-200" style={{ color: dragOver ? "#2d7a3a" : "#9ca3af" }} />
              </div>
            </motion.div>

            <p className={`text-base font-semibold mb-1 transition-colors duration-200 ${dragOver ? "text-primary" : "text-gray-700"}`}>
              {dragOver ? "Drop to scan" : "Drop your scorecard here"}
            </p>
            <p className="text-sm text-gray-400 mb-6">or browse to upload</p>

            <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity shadow-sm">
              <Camera size={16} />
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

            <p className="text-xs text-gray-400 mt-5">JPG, PNG, WEBP, HEIC, PDF</p>
          </div>
        </motion.div>
      )}

      {/* File preview — full-width premium card */}
      <AnimatePresence>
        {hasFile && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="bg-white rounded-2xl border border-gray-100 shadow-md overflow-hidden"
          >
            {/* Image */}
            <div className="relative bg-gray-50">
              <img src={preview!} alt="Scorecard preview" className="w-full max-h-[420px] object-contain" />
              <button
                onClick={() => onUpdate({ file: null, preview: null })}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-white transition-colors"
              >
                <X size={15} />
              </button>
              <div className="absolute bottom-3 left-3 bg-black/35 backdrop-blur-sm rounded-lg px-3 py-1">
                <span className="text-white text-xs font-medium">{file!.name}</span>
              </div>
            </div>

            {/* Card layout + extract */}
            <div className="p-5">
              <p className="text-sm font-medium text-gray-700 mb-3">
                What's on your card?
              </p>
              <ScorecardLayoutPicker
                onContextChange={(ctx) => onUpdate({ userContext: ctx })}
              />

              <button
                onClick={onExtract}
                className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-primary text-white rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-sm"
              >
                <><ScanLine size={17} />Extract Scorecard</>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
