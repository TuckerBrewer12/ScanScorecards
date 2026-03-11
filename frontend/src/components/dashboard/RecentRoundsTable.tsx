import { useNavigate } from "react-router-dom";
import type { RoundSummary } from "@/types/golf";
import { formatToPar } from "@/types/golf";

interface RecentRoundsTableProps {
  rounds: RoundSummary[];
}

export function RecentRoundsTable({ rounds }: RecentRoundsTableProps) {
  const navigate = useNavigate();

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">Recent Rounds</h2>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50/60 text-left">
            <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</th>
            <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Course</th>
            <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Score</th>
            <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">To Par</th>
            <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Putts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rounds.map((r) => (
            <tr
              key={r.id}
              onClick={() => navigate(`/rounds/${r.id}`)}
              className="cursor-pointer hover:bg-emerald-50/40 border-l-2 border-transparent hover:border-primary/30 transition-all duration-150"
            >
              <td className="px-6 py-3.5 text-sm text-gray-400">
                {r.date
                  ? new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  : "—"}
              </td>
              <td className="px-6 py-3.5 text-sm font-semibold text-gray-900">
                {r.course_name ?? "—"}
              </td>
              <td className="px-6 py-3.5 text-sm text-center font-bold text-gray-900">
                {r.total_score ?? "—"}
              </td>
              <td className="px-6 py-3.5 text-sm text-center">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                    r.to_par !== null && r.to_par < 0
                      ? "bg-birdie/10 text-birdie"
                      : r.to_par !== null && r.to_par > 0
                      ? "bg-bogey/10 text-bogey"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {formatToPar(r.to_par)}
                </span>
              </td>
              <td className="px-6 py-3.5 text-sm text-center text-gray-400">
                {r.total_putts ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
