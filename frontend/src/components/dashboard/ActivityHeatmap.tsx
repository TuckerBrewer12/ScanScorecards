import { useMemo } from "react";
import type { RoundSummary } from "@/types/golf";

interface ActivityHeatmapProps {
  rounds?: RoundSummary[];
}

export function ActivityHeatmap({ rounds = [] }: ActivityHeatmapProps) {
  const layout = useMemo(() => {
    const formatDate = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const today = new Date();
    today.setHours(12, 0, 0, 0);

    const counts = new Map<string, number>();
    const parseLocalDate = (dateStr: string) => {
      let clean = dateStr;
      if (clean.includes("T")) clean = clean.split("T")[0];
      clean = clean.replace(/\//g, "-").replace(/ /g, "-");
      const parts = clean.split("-");
      if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12);
      }
      return new Date(dateStr);
    };

    for (const r of rounds) {
      if (!r.date) continue;
      const d = parseLocalDate(r.date);
      if (!isNaN(d.getTime())) {
        const dateStr = formatDate(d);
        counts.set(dateStr, (counts.get(dateStr) ?? 0) + 1);
      }
    }

    const dayOfWeek = today.getDay(); // 0 is Sunday, 6 is Saturday
    const offset = 6 - dayOfWeek;
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + offset);

    const daysOfHistory = 5 * 7; 
    let currentDay = new Date(endDate);
    currentDay.setDate(currentDay.getDate() - daysOfHistory + 1);
    currentDay.setHours(12, 0, 0, 0);

    const days = [];
    for (let i = 0; i < daysOfHistory; i++) {
        const dateStr = formatDate(currentDay);
        days.push({
          date: dateStr,
          dayNum: currentDay.getDate(),
          count: counts.get(dateStr) ?? 0,
          inFuture: currentDay.getTime() > today.getTime(),
        });
        currentDay.setDate(currentDay.getDate() + 1);
    }
    return days;
  }, [rounds]);

  return (
    <div className="flex flex-col items-center w-full px-2">
      <div className="grid grid-cols-7 gap-1.5 justify-items-center w-full max-w-[280px]">
        {/* Calendar Header */}
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-[10px] font-bold text-gray-400 mb-1">
            {d}
          </div>
        ))}

        {/* Calendar Days */}
        {layout.map((day, i) => {
          const isActive = day.count > 0;
          return (
            <div
              key={i}
              title={day.inFuture ? "" : `${day.count} rounds on ${day.date}`}
              className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-semibold transition-all ${
                isActive
                  ? "bg-[#059669] text-white shadow-sm transform hover:scale-105 cursor-default ring-1 ring-[#059669]/50"
                  : day.inFuture
                  ? "bg-transparent text-transparent"
                  : "bg-gray-50 text-gray-400 dark:bg-[#1f2022] dark:text-gray-500"
              }`}
            >
              {!day.inFuture && day.dayNum}
            </div>
          );
        })}
      </div>
      
      {/* Legend */}
      <div className="flex w-full items-center justify-center gap-4 mt-4 text-[11px] text-gray-400 font-medium">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-100 dark:bg-[#1f2022]" />
          <span>No Round</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#059669]" />
          <span>Played</span>
        </div>
      </div>
    </div>
  );
}
