import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import type { RoundSummary } from "@/types/golf";
import { formatToPar } from "@/types/golf";
import { formatCourseName } from "@/lib/courseName";

interface RecentRoundsTableProps {
  rounds: RoundSummary[];
}

const rowSpring = { type: "spring" as const, stiffness: 400, damping: 17 };

export function RecentRoundsTable({ rounds }: RecentRoundsTableProps) {
  const navigate = useNavigate();

  return (
    <div>
      <table className="w-full table-fixed">
        <colgroup>
          <col className="w-[50%]" />
          <col className="w-[25%]" />
          <col className="w-[25%]" />
        </colgroup>
        <thead>
          <tr className="bg-gray-50/60 text-left">
            <th className="pl-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Course</th>
            <th className="py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Total</th>
            <th className="pr-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">To Par</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rounds.map((r) => {
            return (
              <motion.tr
                key={r.id}
                onClick={() => navigate(`/rounds/${r.id}`)}
                className="cursor-pointer"
                whileHover={{ scale: 1.01, backgroundColor: "rgba(249,250,251,1)" }}
                whileTap={{ scale: 0.99 }}
                transition={rowSpring}
              >
                <td className="pl-3 py-3.5 text-sm font-semibold text-gray-900 truncate pr-2">
                  {r.course_name ? formatCourseName(r.course_name) : "—"}
                </td>
                <td className="py-3.5 text-sm text-center font-bold text-gray-900">
                  {r.total_score ?? "—"}
                </td>
                <td className="pr-3 py-3.5 text-sm text-center">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded-full text-[11px] font-semibold ${
                      r.to_par !== null && r.to_par < 0
                        ? "bg-emerald-100 text-emerald-700"
                        : r.to_par !== null && r.to_par > 0
                        ? "bg-red-100 text-red-600"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {formatToPar(r.to_par)}
                  </span>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
