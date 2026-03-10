import { Search, Loader2, MapPin, X, CheckCircle } from "lucide-react";
import type { CourseSummary } from "@/types/golf";

interface CourseLinkSearchProps {
  /** Current text query */
  query: string;
  /** Search results */
  results: CourseSummary[];
  /** True while an async search is in-flight */
  searching: boolean;
  /** Called when the input value changes */
  onQueryChange: (q: string) => void;
  /** Called when user clicks a result */
  onSelectCourse: (course: CourseSummary) => void;
  /** Called when the close/X button is clicked */
  onClose: () => void;
  /** Optional — when provided the panel is wrapped in a blue callout card with a title */
  title?: string;
  /** Whether a link action is in-progress (disables result buttons) */
  linking?: boolean;
  /** Optional — when true the "No courses found" fallback uses the review-step variant */
  reviewVariant?: boolean;
  /** Called when user clicks "Use '…'" in the no-match fallback (review variant only) */
  onUseCustomName?: (name: string) => void;
}

/**
 * Reusable course-link search panel.
 * Renders a search input + results dropdown and optionally a blue card wrapper.
 */
export function CourseLinkSearch({
  query,
  results,
  searching,
  onQueryChange,
  onSelectCourse,
  onClose,
  title,
  linking = false,
  reviewVariant = false,
  onUseCustomName,
}: CourseLinkSearchProps) {
  const input = (
    <div className="relative max-w-sm">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search courses…"
        className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />
      {searching && (
        <Loader2 size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
      )}
    </div>
  );

  const resultsList = results.length > 0 && (
    <ul className="mt-1 max-w-sm bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden divide-y divide-gray-100">
      {results.map((c) => (
        <li key={c.id}>
          <button
            disabled={linking}
            onClick={() => onSelectCourse(c)}
            className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <MapPin size={13} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-medium text-gray-800">{c.name}</div>
              {c.location && <div className="text-xs text-gray-500">{c.location}</div>}
            </div>
            {linking && <Loader2 size={12} className="ml-auto mt-1 animate-spin text-gray-400" />}
          </button>
        </li>
      ))}
    </ul>
  );

  const noMatch = query.trim().length >= 2 && !searching && results.length === 0 && (
    reviewVariant && onUseCustomName ? (
      <div className="mt-1 flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
        <span className="text-xs text-gray-500">No match — save as new course</span>
        <button
          onClick={() => onUseCustomName(query.trim())}
          className="text-xs font-medium text-primary hover:underline"
        >
          Use "{query.trim()}"
        </button>
      </div>
    ) : (
      <p className="mt-1.5 text-xs text-gray-400">No courses found</p>
    )
  );

  if (title) {
    return (
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-blue-700">{title}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
        {input}
        {resultsList}
        {noMatch}
      </div>
    );
  }

  return (
    <>
      {input}
      {resultsList}
      {noMatch}
    </>
  );
}

/** Chip displayed once a course is linked (review step). */
export function CourseLinkChip({
  name,
  onClear,
}: {
  name: string;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
      <CheckCircle size={14} className="text-green-600 shrink-0" />
      <span className="text-sm font-medium text-green-800 flex-1">Linked: {name}</span>
      <button onClick={onClear} className="text-green-600 hover:text-green-800">
        <X size={14} />
      </button>
    </div>
  );
}
