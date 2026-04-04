import type { AnalyticsFilters } from "@/types/analytics";

const LIMIT_OPTIONS = [
  { value: 10, label: "10" },
  { value: 20, label: "20" },
  { value: 50, label: "50" },
  { value: 500, label: "All" },
] as const;

const TIMEFRAME_OPTIONS = [
  { value: "all" as const, label: "All Time" },
  { value: "ytd" as const, label: "YTD" },
  { value: "1y" as const, label: "12 Mo" },
];

interface AnalyticsFilterBarProps {
  filters: AnalyticsFilters;
  onChange: (f: AnalyticsFilters) => void;
  playedCourses: { id: string; name: string | null; location: string | null }[];
  hasHomeCourse: boolean;
}

export function AnalyticsFilterBar({
  filters,
  onChange,
  playedCourses,
  hasHomeCourse,
}: AnalyticsFilterBarProps) {
  const pillBase = "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all";
  const pillActive = "bg-white shadow-sm text-gray-900 dark:bg-slate-900 dark:text-slate-100";
  const pillInactive = "text-gray-500 hover:text-gray-700 dark:text-slate-300 dark:hover:text-slate-100";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Rounds count */}
      <div className="flex items-center bg-gray-100/80 dark:bg-slate-800/90 p-1 rounded-xl gap-0.5 border border-transparent dark:border-slate-700">
        {LIMIT_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onChange({ ...filters, limit: value })}
            className={`${pillBase} ${filters.limit === value ? pillActive : pillInactive}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Timeframe */}
      <div className="flex items-center bg-gray-100/80 dark:bg-slate-800/90 p-1 rounded-xl gap-0.5 border border-transparent dark:border-slate-700">
        {TIMEFRAME_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onChange({ ...filters, timeframe: value })}
            className={`${pillBase} ${filters.timeframe === value ? pillActive : pillInactive}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Course selector */}
      <div className="flex items-center gap-1.5">
        <select
          value={filters.courseId}
          onChange={(e) => onChange({ ...filters, courseId: e.target.value })}
          className="text-xs font-semibold text-gray-700 dark:text-slate-100 bg-gray-100/80 dark:bg-slate-800/90 border border-transparent dark:border-slate-700 rounded-xl px-3 py-2 pr-7 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All Courses</option>
          {hasHomeCourse && <option value="home">Home Course</option>}
          {playedCourses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name ?? "Unnamed Course"}
            </option>
          ))}
        </select>
        {filters.courseId !== "all" && (
          <button
            onClick={() => onChange({ ...filters, courseId: "all" })}
            className="w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-500 hover:text-gray-700 dark:text-slate-200 dark:hover:text-white flex items-center justify-center text-xs font-bold transition-colors"
            aria-label="Clear course filter"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
