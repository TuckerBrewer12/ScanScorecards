import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Link2, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CourseLinkSearch } from "@/components/CourseLinkSearch";
import { api } from "@/lib/api";
import { getStoredColorBlindMode } from "@/lib/accessibility";
import { getColorBlindPalette } from "@/lib/chartPalettes";
import type { RoundSummary, CourseSummary } from "@/types/golf";
import { formatToPar } from "@/types/golf";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScrollSection } from "@/components/analytics/ScrollSection";

interface RoundsPageProps {
  userId: string;
}

type SortKey = "date" | "total_score" | "to_par" | "course_name";

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const rowVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const, delay: i * 0.03 },
  }),
};

function SortHeader({
  label,
  field,
  sortKey,
  sortAsc,
  onSort,
}: {
  label: string;
  field: SortKey;
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === field;
  return (
    <th
      className={`px-6 py-3 cursor-pointer select-none transition-colors ${
        active ? "text-primary" : "text-gray-400 hover:text-gray-600"
      }`}
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        <span className={`text-[10px] transition-opacity ${active ? "opacity-100" : "opacity-0"}`}>
          {sortAsc ? "↑" : "↓"}
        </span>
      </span>
    </th>
  );
}

export function RoundsPage({ userId }: RoundsPageProps) {
  const queryClient = useQueryClient();
  const { data: rounds = [], isLoading: loading } = useQuery({
    queryKey: ["rounds", userId],
    queryFn: () => api.getRoundsForUser(userId, 100),
  });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);

  // Link-course state
  const [linkingRoundId, setLinkingRoundId] = useState<string | null>(null);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<CourseSummary[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const linkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colorBlindMode = useMemo(() => getStoredColorBlindMode(), []);
  const colorBlindPalette = useMemo(() => getColorBlindPalette(colorBlindMode), [colorBlindMode]);

  const handleLinkQuery = useCallback((q: string) => {
    setLinkQuery(q);
    if (linkTimer.current) clearTimeout(linkTimer.current);
    if (q.trim().length < 2) { setLinkResults([]); return; }
    linkTimer.current = setTimeout(async () => {
      setLinkSearching(true);
      try {
        const results = await api.searchCourses(q.trim(), userId);
        setLinkResults(results);
      } catch { setLinkResults([]); }
      finally { setLinkSearching(false); }
    }, 300);
  }, [userId]);

  const handleSelectCourse = useCallback(async (roundId: string, course: CourseSummary) => {
    setLinking(true);
    try {
      const updated = await api.linkCourse(roundId, course.id);
      queryClient.setQueryData<RoundSummary[]>(["rounds", userId], (prev) =>
        prev ? prev.map((r) => r.id === roundId ? updated : r) : [updated]
      );
      setLinkingRoundId(null);
      setLinkQuery("");
      setLinkResults([]);
    } catch (err) {
      console.error("Link failed:", err);
    } finally {
      setLinking(false);
    }
  }, []);

  const openLink = useCallback((roundId: string) => {
    setLinkingRoundId(roundId);
    setLinkQuery("");
    setLinkResults([]);
  }, []);

  const closeLink = useCallback(() => {
    setLinkingRoundId(null);
    setLinkQuery("");
    setLinkResults([]);
  }, []);

  const filtered = useMemo(() => {
    let result = [...rounds];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.course_name?.toLowerCase().includes(q) ||
          r.notes?.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      let av: number | string | null, bv: number | string | null;
      switch (sortKey) {
        case "date":
          av = a.date ?? "";
          bv = b.date ?? "";
          break;
        case "total_score":
          av = a.total_score;
          bv = b.total_score;
          break;
        case "to_par":
          av = a.to_par;
          bv = b.to_par;
          break;
        case "course_name":
          av = a.course_name ?? "";
          bv = b.course_name ?? "";
          break;
      }
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
    return result;
  }, [rounds, search, sortKey, sortAsc]);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(key === "course_name");
    }
  }, [sortKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading rounds...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Rounds"
        subtitle={`${rounds.length} rounds played`}
      />

      <ScrollSection>
        {/* Search bar */}
        <div className="mb-5 relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by course or tournament..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary shadow-sm"
          />
        </div>

        {/* Table */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">
              {filtered.length} {filtered.length === 1 ? "round" : "rounds"}
              {search ? ` matching "${search}"` : ""}
            </span>
          </div>

          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/60 text-left text-[10px] font-bold uppercase tracking-widest">
                <SortHeader label="Date" field="date" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <SortHeader label="Course" field="course_name" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Front</th>
                <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Back</th>
                <SortHeader label="Score" field="total_score" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <SortHeader label="To Par" field="to_par" sortKey={sortKey} sortAsc={sortAsc} onSort={handleSort} />
                <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Putts</th>
                <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tournament</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.slice(0, visibleCount).map((r, i) => (
                <AnimatePresence key={r.id} mode="wait">
                  <motion.tr
                    key={r.id}
                    custom={i}
                    variants={rowVariants}
                    initial="hidden"
                    animate="visible"
                    className="cursor-pointer hover:bg-emerald-50/40 border-l-2 border-transparent hover:border-primary/30 transition-all duration-150 group"
                    onClick={() => {
                      if (linkingRoundId === r.id) return;
                    }}
                  >
                    <td className="px-6 py-3.5 text-sm text-gray-400">
                      {r.date
                        ? new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "—"}
                    </td>
                    <td className="px-6 py-3.5 text-sm font-semibold text-gray-900">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/rounds/${r.id}`}
                          className="hover:text-primary transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {r.course_name ?? "—"}
                        </Link>
                        {!r.course_id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              linkingRoundId === r.id ? closeLink() : openLink(r.id);
                            }}
                            title="Link to a saved course"
                            className="text-gray-300 hover:text-primary transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                          >
                            <Link2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-center text-gray-500">
                      {r.front_nine ?? "—"}
                    </td>
                    <td className="px-6 py-3.5 text-sm text-center text-gray-500">
                      {r.back_nine ?? "—"}
                    </td>
                    <td className="px-6 py-3.5 text-sm text-center font-bold text-gray-900">
                      {r.total_score ?? "—"}
                    </td>
                    <td className="px-6 py-3.5 text-sm text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                          !colorBlindPalette
                            ? r.to_par !== null && r.to_par < 0
                              ? "bg-birdie/10 text-birdie"
                              : r.to_par !== null && r.to_par > 0
                              ? "bg-bogey/10 text-bogey"
                              : "bg-gray-100 text-gray-500"
                            : r.to_par === null
                            ? "bg-gray-100 text-gray-500"
                            : ""
                        }`}
                        style={
                          colorBlindPalette && r.to_par !== null && r.to_par < 0
                            ? {
                                color: colorBlindPalette?.score.birdie ?? undefined,
                                backgroundColor: colorBlindPalette?.score.birdie
                                  ? withAlpha(colorBlindPalette.score.birdie, 0.14)
                                  : undefined,
                              }
                            : colorBlindPalette && r.to_par !== null && r.to_par > 0
                            ? {
                                color: colorBlindPalette?.score.bogey ?? undefined,
                                backgroundColor: colorBlindPalette?.score.bogey
                                  ? withAlpha(colorBlindPalette.score.bogey, 0.14)
                                  : undefined,
                              }
                            : undefined
                        }
                      >
                        {formatToPar(r.to_par)}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-center text-gray-400">
                      {r.total_putts ?? "—"}
                    </td>
                    <td className="px-6 py-3.5 text-sm text-gray-400">
                      {r.notes ?? "—"}
                    </td>
                  </motion.tr>

                  {/* Inline link-course panel */}
                  {linkingRoundId === r.id && (
                    <motion.tr
                      key={`${r.id}-link`}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <td colSpan={8} className="px-6 py-4 bg-blue-50/60 border-b border-blue-100">
                        <CourseLinkSearch
                          title={`Link "${r.course_name ?? "this round"}" to a saved course`}
                          query={linkQuery}
                          results={linkResults}
                          searching={linkSearching}
                          linking={linking}
                          onQueryChange={handleLinkQuery}
                          onSelectCourse={(c) => handleSelectCourse(r.id, c)}
                          onClose={closeLink}
                        />
                      </td>
                    </motion.tr>
                  )}
                </AnimatePresence>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              No rounds found.
            </div>
          )}
        </div>

        {visibleCount < filtered.length && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => setVisibleCount((n) => n + 50)}
              className="px-5 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
            >
              Load more ({filtered.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </ScrollSection>
    </div>
  );
}
