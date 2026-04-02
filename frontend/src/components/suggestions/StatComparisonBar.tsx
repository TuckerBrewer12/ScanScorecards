import { motion } from "framer-motion";
import type { AIComparisonItem } from "@/types/suggestions";

function fmt(v: number, unit: string): string {
  if (unit === "%") return v.toFixed(1) + "%";
  if (unit === " strokes") return (v >= 0 ? "+" : "") + v.toFixed(2);
  return v.toFixed(1);
}

function fmtDiff(v: number, unit: string): string {
  const sign = v >= 0 ? "+" : "";
  if (unit === "%") return sign + v.toFixed(1) + "%";
  if (unit === " strokes") return sign + v.toFixed(2);
  return sign + v.toFixed(1);
}

interface StatComparisonBarProps {
  item: AIComparisonItem;
  benchmarkLabel: string;
  index: number;
  goodColor?: string;
  badColor?: string;
  benchmarkColor?: string;
}

function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function StatComparisonBar({
  item,
  benchmarkLabel,
  index,
  goodColor = "#10b981",
  badColor = "#f87171",
  benchmarkColor = "#e5e7eb",
}: StatComparisonBarProps) {
  const hasPdata = item.has_data && item.player_value != null;
  const pVal = item.player_value ?? 0;
  const bVal = item.benchmark_value;

  // Scale bars relative to the larger absolute value, with 20% headroom
  const scale = Math.max(Math.abs(pVal), Math.abs(bVal), 0.01) * 1.25;
  const pPct = Math.min(100, (Math.abs(pVal) / scale) * 100);
  const bPct = Math.min(100, (Math.abs(bVal) / scale) * 100);

  const playerIsGood =
    hasPdata && (item.lower_is_better ? pVal <= bVal : pVal >= bVal);

  const diff = hasPdata ? pVal - bVal : null;
  const diffGood = diff != null && (item.lower_is_better ? diff < 0 : diff > 0);

  const diffLabel = diff != null ? fmtDiff(diff, item.unit) : null;

  const delay = index * 0.04;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="space-y-1"
    >
      {/* Metric name + delta */}
      <div className="flex items-center justify-between min-h-[20px]">
        <span className="text-[13px] font-semibold text-gray-700">{item.metric}</span>
        {diffLabel ? (
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: withAlpha(diffGood ? goodColor : badColor, 0.18),
              color: diffGood ? goodColor : badColor,
            }}
          >
            {diffLabel}
          </span>
        ) : (
          <span className="text-[11px] text-gray-300 italic">no data</span>
        )}
      </div>

      {/* You row */}
      <div className="flex items-center gap-2.5">
        <span className="text-[11px] text-gray-400 w-[52px] shrink-0 text-right">You</span>
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          {hasPdata ? (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pPct}%` }}
              transition={{ duration: 0.65, ease: "easeOut", delay: delay + 0.15 }}
              className="h-full rounded-full"
              style={{ backgroundColor: playerIsGood ? goodColor : badColor }}
            />
          ) : (
            <div className="h-full w-1/4 bg-gray-200 rounded-full opacity-50" />
          )}
        </div>
        <span
          className={`text-[12px] font-bold w-11 text-right shrink-0 ${
            !hasPdata
              ? "text-gray-300"
              : playerIsGood
              ? ""
              : ""
          }`}
          style={hasPdata ? { color: playerIsGood ? goodColor : badColor } : undefined}
        >
          {hasPdata ? fmt(pVal, item.unit) : "—"}
        </span>
      </div>

      {/* Benchmark row */}
      <div className="flex items-center gap-2.5">
        <span className="text-[11px] text-gray-400 w-[52px] shrink-0 text-right truncate">
          {benchmarkLabel}
        </span>
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${bPct}%` }}
            transition={{ duration: 0.65, ease: "easeOut", delay: delay + 0.28 }}
            className="h-full rounded-full"
            style={{ backgroundColor: benchmarkColor }}
          />
        </div>
        <span className="text-[12px] font-bold text-gray-400 w-11 text-right shrink-0">
          {fmt(bVal, item.unit)}
        </span>
      </div>
    </motion.div>
  );
}
