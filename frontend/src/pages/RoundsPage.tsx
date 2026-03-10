import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Link2 } from "lucide-react";
import { CourseLinkSearch } from "@/components/CourseLinkSearch";
import { api } from "@/lib/api";
import type { RoundSummary, CourseSummary } from "@/types/golf";
import { formatToPar } from "@/types/golf";
import { PageHeader } from "@/components/layout/PageHeader";

interface RoundsPageProps {
  userId: string;
}

type SortKey = "date" | "total_score" | "to_par" | "course_name";

export function RoundsPage({ userId }: RoundsPageProps) {
  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);

  // Link-course state
  const [linkingRoundId, setLinkingRoundId] = useState<string | null>(null);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<CourseSummary[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const linkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.getRoundsForUser(userId, 200).then((r) => {
      setRounds(r);
      setLoading(false);
    });
  }, [userId]);

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
      setRounds((prev) => prev.map((r) => r.id === roundId ? updated : r));
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
    let result = rounds;
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

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "course_name");
    }
  }

  function SortHeader({ label, field }: { label: string; field: SortKey }) {
    return (
      <th
        className="px-4 py-3 cursor-pointer hover:text-gray-700 select-none"
        onClick={() => handleSort(field)}
      >
        {label}
        {sortKey === field && (
          <span className="ml-1">{sortAsc ? "↑" : "↓"}</span>
        )}
      </th>
    );
  }

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

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by course or tournament..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <SortHeader label="Date" field="date" />
              <SortHeader label="Course" field="course_name" />
              <th className="px-4 py-3 text-center">Front</th>
              <th className="px-4 py-3 text-center">Back</th>
              <SortHeader label="Score" field="total_score" />
              <SortHeader label="To Par" field="to_par" />
              <th className="px-4 py-3 text-center">Putts</th>
              <th className="px-4 py-3">Tournament</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((r) => (
              <>
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-600">
                    {r.date
                      ? new Date(r.date).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/rounds/${r.id}`}
                        className="hover:text-primary transition-colors"
                      >
                        {r.course_name ?? "-"}
                      </Link>
                      {!r.course_id && (
                        <button
                          onClick={() => linkingRoundId === r.id ? closeLink() : openLink(r.id)}
                          title="Link to a saved course"
                          className="text-gray-400 hover:text-primary transition-colors shrink-0"
                        >
                          <Link2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-gray-600">
                    {r.front_nine ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-gray-600">
                    {r.back_nine ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-center font-semibold">
                    {r.total_score ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        r.to_par !== null && r.to_par < 0
                          ? "bg-birdie/10 text-birdie"
                          : r.to_par !== null && r.to_par > 0
                          ? "bg-bogey/10 text-bogey"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {formatToPar(r.to_par)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-gray-600">
                    {r.total_putts ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {r.notes ?? "-"}
                  </td>
                </tr>

                {/* Inline link-course panel */}
                {linkingRoundId === r.id && (
                  <tr key={`${r.id}-link`}>
                    <td colSpan={8} className="px-4 py-3 bg-blue-50 border-b border-blue-100">
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
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
