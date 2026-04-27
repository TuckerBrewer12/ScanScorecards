import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AnalyticsFilters, AnalyticsKPIs } from "@/types/analytics";

const LIMIT_OPTIONS = [
  { value: 10,  label: "10"  },
  { value: 20,  label: "20"  },
  { value: 50,  label: "50"  },
  { value: 500, label: "All" },
] as const;

const TIMEFRAME_OPTIONS = [
  { value: "all" as const, label: "All Time" },
  { value: "ytd" as const, label: "YTD"      },
  { value: "1y"  as const, label: "12 Mo"    },
];

function formatHI(hi: number | null | undefined): string {
  if (hi == null) return "—";
  if (hi < 0) return `+${Math.abs(hi).toFixed(1)}`;
  return hi.toFixed(1);
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-bold text-gray-800">{value}</span>
    </div>
  );
}

interface AnalyticsCommandCenterProps {
  filters: AnalyticsFilters;
  onChange: (f: AnalyticsFilters) => void;
  playedCourses: { id: string; name: string | null; location: string | null }[];
  hasHomeCourse: boolean;
  kpis: AnalyticsKPIs | null;
}

export function AnalyticsCommandCenter({
  filters,
  onChange,
  playedCourses,
  hasHomeCourse,
  kpis,
}: AnalyticsCommandCenterProps) {
  const [showKpis, setShowKpis] = useState(false);

  useEffect(() => {
    function onScroll() { setShowKpis(window.scrollY > 280); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const pillBase    = "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all";
  const pillActive  = "bg-white shadow-sm text-gray-900";
  const pillInactive = "text-gray-500 hover:text-gray-700";

  return (
    <div className="sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-gray-100/80 shadow-sm mb-4 -mx-6 px-6 py-2.5">
      {/* Row A — filter controls (always visible) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center bg-gray-100/80 p-1 rounded-xl gap-0.5">
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

        <div className="flex items-center bg-gray-100/80 p-1 rounded-xl gap-0.5">
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

        <div className="flex items-center gap-1.5">
          <select
            value={filters.courseId}
            onChange={(e) => onChange({ ...filters, courseId: e.target.value })}
            className="text-xs font-semibold text-gray-700 bg-gray-100/80 rounded-xl px-3 py-2 pr-7 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 border border-transparent"
          >
            <option value="all">All Courses</option>
            {hasHomeCourse && <option value="home">Home Course</option>}
            {playedCourses.map((c) => (
              <option key={c.id} value={c.id}>{c.name ?? "Unnamed Course"}</option>
            ))}
          </select>
          {filters.courseId !== "all" && (
            <button
              onClick={() => onChange({ ...filters, courseId: "all" })}
              className="w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-500 hover:text-gray-700 flex items-center justify-center text-xs font-bold transition-colors"
              aria-label="Clear course filter"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Row B — KPI pills (scroll-triggered) */}
      <AnimatePresence>
        {showKpis && kpis && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-4 md:gap-6 pt-2.5 divide-x divide-gray-100 overflow-x-auto">
              <StatPill label="HI"  value={formatHI(kpis.handicap_index)} />
              <div className="pl-4 md:pl-6">
                <StatPill label="Avg" value={kpis.scoring_average != null ? String(kpis.scoring_average) : "—"} />
              </div>
              <div className="pl-4 md:pl-6">
                <StatPill label="GIR" value={kpis.gir_percentage != null ? `${kpis.gir_percentage}%` : "—"} />
              </div>
              <div className="pl-4 md:pl-6 hidden sm:block">
                <StatPill label="Putts/GIR" value={kpis.putts_per_gir != null ? String(kpis.putts_per_gir) : "—"} />
              </div>
              <div className="pl-4 md:pl-6 hidden sm:block">
                <StatPill label="Scrambling" value={kpis.scrambling_percentage != null ? `${kpis.scrambling_percentage}%` : "—"} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
