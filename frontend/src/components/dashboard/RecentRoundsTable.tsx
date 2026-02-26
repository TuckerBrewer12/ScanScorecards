import { Link } from "react-router-dom";
import type { RoundSummary } from "@/types/golf";
import { formatToPar } from "@/types/golf";

interface RecentRoundsTableProps {
  rounds: RoundSummary[];
}

export function RecentRoundsTable({ rounds }: RecentRoundsTableProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">Recent Rounds</h2>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <th className="px-5 py-3">Date</th>
            <th className="px-5 py-3">Course</th>
            <th className="px-5 py-3 text-center">Score</th>
            <th className="px-5 py-3 text-center">To Par</th>
            <th className="px-5 py-3">Tournament</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rounds.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-5 py-3 text-sm text-gray-600">
                {r.date ? new Date(r.date).toLocaleDateString() : "-"}
              </td>
              <td className="px-5 py-3 text-sm font-medium text-gray-900">
                <Link to={`/rounds/${r.id}`} className="hover:text-primary">
                  {r.course_name ?? "-"}
                </Link>
              </td>
              <td className="px-5 py-3 text-sm text-center font-semibold">
                {r.total_score ?? "-"}
              </td>
              <td className="px-5 py-3 text-sm text-center">
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
              <td className="px-5 py-3 text-sm text-gray-500">
                {r.notes ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
