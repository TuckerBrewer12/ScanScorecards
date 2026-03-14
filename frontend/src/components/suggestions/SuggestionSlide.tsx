import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Dumbbell, Target, Pin } from "lucide-react";
import type { AIInsightItem } from "@/types/suggestions";

const GROUP_ICONS: Record<string, React.ElementType> = {
  "Ball Striking": Target,
  "Short Game": Dumbbell,
  "Putting": Pin,
};

const GROUP_COLORS: Record<string, string> = {
  "Ball Striking": "bg-blue-100 text-blue-700",
  "Short Game": "bg-amber-100 text-amber-700",
  "Putting": "bg-emerald-100 text-emerald-700",
};

const TREND_COLORS: Record<string, string> = {
  improving: "text-emerald-600",
  declining: "text-red-500",
  stable: "text-gray-400",
};

const TREND_LABELS: Record<string, string> = {
  improving: "↑ Improving",
  declining: "↓ Declining",
  stable: "→ Stable",
};

function MetricBar({
  value,
  benchmark,
  lowerIsBetter = false,
}: {
  value: number | null;
  benchmark: number | null;
  lowerIsBetter?: boolean;
}) {
  if (value == null || benchmark == null || benchmark === 0) return null;

  const ratio = value / benchmark;
  const pct = Math.min(100, Math.max(0, ratio * 100));

  let barColor = "bg-red-400";
  if (lowerIsBetter) {
    if (ratio <= 0.9) barColor = "bg-emerald-400";
    else if (ratio <= 1.1) barColor = "bg-amber-400";
  } else {
    if (ratio >= 1.1) barColor = "bg-emerald-400";
    else if (ratio >= 0.9) barColor = "bg-amber-400";
  }

  return (
    <div className="mt-4">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>You: {value}</span>
        <span>Benchmark: {benchmark}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

interface SuggestionSlideProps {
  insight: AIInsightItem;
  isActive: boolean;
  userId: string;
}

export function SuggestionSlide({ insight, isActive, userId }: SuggestionSlideProps) {
  const [tipsOpen, setTipsOpen] = useState(false);
  const [pinned, setPinned] = useState(
    () => localStorage.getItem(`goal_${userId}`) === insight.title
  );

  const Icon = GROUP_ICONS[insight.category_group] ?? Target;
  const pillClass = GROUP_COLORS[insight.category_group] ?? "bg-gray-100 text-gray-600";

  const lowerIsBetter = ["Putts / GIR", "3-Putts / Round", "Score Std Dev"].includes(
    insight.metric_label
  );

  function handlePin() {
    if (pinned) {
      localStorage.removeItem(`goal_${userId}`);
      setPinned(false);
    } else {
      localStorage.setItem(`goal_${userId}`, insight.title);
      setPinned(true);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 36 }}
      animate={{ opacity: isActive ? 1 : 0.6, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      whileHover={{ scale: 1.012 }}
      className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-100 p-6 h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl ${pillClass.replace("text-", "bg-").replace("-700", "-100").replace("-600", "-100")}`}>
            <Icon size={16} className={pillClass.split(" ")[1]} />
          </div>
          <div>
            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${pillClass}`}>
              {insight.category_group}
            </span>
            <p className="text-[11px] text-gray-400 mt-0.5">{insight.category}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-semibold ${TREND_COLORS[insight.trend_direction]}`}>
            {TREND_LABELS[insight.trend_direction]}
          </span>
          <div className="text-xs font-bold text-white bg-primary rounded-full w-7 h-7 flex items-center justify-center shadow-sm">
            {Math.round(insight.priority_score)}
          </div>
        </div>
      </div>

      {/* Title + description */}
      <h3 className="text-xl font-bold text-gray-900 leading-tight mb-2">{insight.title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{insight.description}</p>

      {/* Metric bar */}
      {insight.key_metric != null && (
        <MetricBar
          value={insight.key_metric}
          benchmark={insight.benchmark}
          lowerIsBetter={lowerIsBetter}
        />
      )}

      {/* What-if */}
      {insight.what_if && (
        <div className="mt-4 bg-[#eef7f0] rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-primary leading-snug">{insight.what_if}</p>
        </div>
      )}

      {/* Drill tips accordion */}
      <div className="mt-4 border-t border-gray-50 pt-4">
        <button
          onClick={() => setTipsOpen((v) => !v)}
          className="flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors w-full"
        >
          <Dumbbell size={13} />
          Practice Drills
          <motion.div
            animate={{ rotate: tipsOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="ml-auto"
          >
            <ChevronDown size={14} />
          </motion.div>
        </button>
        <AnimatePresence>
          {tipsOpen && (
            <motion.ul
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden mt-3 space-y-2"
            >
              {insight.drill_tips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-xs text-gray-600">
                  <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                  {tip}
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      {/* Pin as goal */}
      <div className="mt-auto pt-4">
        <button
          onClick={handlePin}
          className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${
            pinned ? "text-primary" : "text-gray-400 hover:text-primary"
          }`}
        >
          <Pin size={12} className={pinned ? "fill-primary" : ""} />
          {pinned ? "Pinned as Goal" : "Pin as Goal"}
        </button>
      </div>
    </motion.div>
  );
}
