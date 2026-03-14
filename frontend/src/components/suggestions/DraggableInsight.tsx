import type { RefObject } from "react";
import { motion } from "framer-motion";
import { Target, Dumbbell, Pin } from "lucide-react";
import type { AIInsightItem } from "@/types/suggestions";

const GROUP_ICONS: Record<string, React.ElementType> = {
  "Ball Striking": Target,
  "Short Game": Dumbbell,
  "Putting": Pin,
};

const GROUP_COLORS: Record<string, string> = {
  "Ball Striking": "text-blue-600",
  "Short Game": "text-amber-600",
  "Putting": "text-emerald-600",
};

const GROUP_BG: Record<string, string> = {
  "Ball Striking": "bg-blue-50",
  "Short Game": "bg-amber-50",
  "Putting": "bg-emerald-50",
};

interface DraggableInsightProps {
  insight: AIInsightItem;
  index: number;
  constraintsRef: RefObject<HTMLDivElement>;
}

export function DraggableInsight({ insight, constraintsRef }: DraggableInsightProps) {
  const Icon = GROUP_ICONS[insight.category_group] ?? Target;
  const iconColor = GROUP_COLORS[insight.category_group] ?? "text-gray-500";
  const iconBg = GROUP_BG[insight.category_group] ?? "bg-gray-50";

  return (
    <motion.div
      drag
      dragConstraints={constraintsRef}
      dragElastic={0.1}
      dragMomentum={false}
      whileDrag={{ scale: 1.05, zIndex: 50, cursor: "grabbing" }}
      whileHover={{ scale: 1.03 }}
      transition={{ type: "spring", stiffness: 350, damping: 28 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 cursor-grab select-none"
    >
      <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center mb-3`}>
        <Icon size={16} className={iconColor} />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
        {insight.category_group}
      </p>
      <p className="text-sm font-bold text-gray-900 leading-tight mb-2">{insight.title}</p>
      {insight.key_metric != null && (
        <p className="text-xl font-black text-gray-900 leading-none">
          {insight.key_metric}
          <span className="text-xs font-normal text-gray-400 ml-1">{insight.metric_label}</span>
        </p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-gray-400">Priority</span>
        <span className="text-xs font-bold text-primary bg-[#eef7f0] px-2 py-0.5 rounded-full">
          {Math.round(insight.priority_score)}/10
        </span>
      </div>
    </motion.div>
  );
}
