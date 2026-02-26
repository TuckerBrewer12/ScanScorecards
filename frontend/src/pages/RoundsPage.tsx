import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import type { RoundSummary } from "@/types/golf";
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

  useEffect(() => {
    api.getRoundsForUser(userId, 200).then((r) => {
      setRounds(r);
      setLoading(false);
    });
  }, [userId]);

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
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-sm text-gray-600">
                  {r.date
                    ? new Date(r.date).toLocaleDateString()
                    : "-"}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  <Link
                    to={`/rounds/${r.id}`}
                    className="hover:text-primary"
                  >
                    {r.course_name ?? "-"}
                  </Link>
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
                        ? "bg-green-100 text-green-700"
                        : r.to_par !== null && r.to_par > 0
                        ? "bg-red-100 text-red-600"
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
