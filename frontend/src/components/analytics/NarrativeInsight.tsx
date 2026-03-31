import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface NarrativeInsightProps {
  text: string;
  trend?: "up" | "down" | "flat";
  /** Is the "up" direction a good thing? (default true) */
  positiveUp?: boolean;
}

export function NarrativeInsight({ text, trend, positiveUp = true }: NarrativeInsightProps) {
  const Icon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  const isGood =
    trend === "flat"
      ? false
      : trend === "up"
      ? positiveUp
      : !positiveUp;

  const iconColor =
    trend === "flat"
      ? "text-gray-400"
      : isGood
      ? "text-emerald-500"
      : "text-red-400";

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="analytics-insight-card flex items-start gap-3 py-2 px-3 rounded-xl bg-primary/5 border border-transparent"
    >
      {trend && <Icon size={15} className={`mt-0.5 shrink-0 ${iconColor}`} />}
      <p className="analytics-insight-text text-sm text-gray-600 leading-relaxed">{text}</p>
    </motion.div>
  );
}
