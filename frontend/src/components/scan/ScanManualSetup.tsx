import { Search, MapPin, Loader2, CheckCircle, X } from "lucide-react";
import type { ScanState, ManualTee } from "@/types/scan";
import type { CourseSummary } from "@/types/golf";

interface ScanManualSetupProps {
  selectedCourseId: string | null;
  selectedCourseName: string | null;
  manualCourseTees: ManualTee[];
  courseQuery: string;
  courseResults: CourseSummary[];
  searching: boolean;
  loadingCourse: boolean;
  manualDate: string;
  manualTeeBox: string;
  onCourseQuery: (q: string) => void;
  onSelectCourseManual: (course: CourseSummary) => void;
  onClearCourse: () => void;
  onSetManualDate: (d: string) => void;
  onSetManualTeeBox: (t: string) => void;
  onStartEntry: () => void;
  onUpdate: (patch: Partial<ScanState>) => void;
  setCourseQuery: (q: string) => void;
  setCourseResults: (r: CourseSummary[]) => void;
}

export function ScanManualSetup({
  selectedCourseId,
  selectedCourseName,
  manualCourseTees,
  courseQuery,
  courseResults,
  searching,
  loadingCourse,
  manualDate,
  manualTeeBox,
  onCourseQuery,
  onSelectCourseManual,
  onClearCourse,
  onSetManualDate,
  onSetManualTeeBox,
  onStartEntry,
  onUpdate,
  setCourseQuery,
  setCourseResults,
}: ScanManualSetupProps) {
  return (
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
              onChange={(e) => onCourseQuery(e.target.value)}
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
                    onClick={() => onSelectCourseManual(c)}
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
                  onUpdate({ selectedCourseName: courseQuery.trim() });
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
            onClick={onClearCourse}
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
            onChange={(e) => onSetManualTeeBox(e.target.value)}
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
          onChange={(e) => onSetManualDate(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>

      <button
        onClick={onStartEntry}
        className="w-full px-5 py-3 bg-primary text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
      >
        Start Entering Scores
      </button>
    </div>
  );
}
