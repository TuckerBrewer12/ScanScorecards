import { motion } from "framer-motion";
import { AnimatedNumber } from "./AnimatedNumber";

type Accent = "green" | "amber" | "blue" | "gray" | "red" | "purple";

interface MetricCardProps {
  label: string;
  value: number | string | null | undefined;
  decimals?: number;
  suffix?: string;
  accent?: Accent;
  size?: "normal" | "large";
  sublabel?: string;
}

const accentConfig: Record<Accent, { border: string; glow: string; bg: string }> = {
  green:  { border: "border-l-emerald-500", glow: "shadow-emerald-50",  bg: "from-emerald-50/60" },
  amber:  { border: "border-l-amber-400",   glow: "shadow-amber-50",    bg: "from-amber-50/60" },
  blue:   { border: "border-l-blue-400",    glow: "shadow-blue-50",     bg: "from-blue-50/60" },
  gray:   { border: "border-l-gray-300",    glow: "shadow-gray-50",     bg: "from-gray-50/60" },
  red:    { border: "border-l-red-400",     glow: "shadow-red-50",      bg: "from-red-50/60" },
  purple: { border: "border-l-purple-400",  glow: "shadow-purple-50",   bg: "from-purple-50/60" },
};

export function MetricCard({
  label,
  value,
  decimals = 1,
  suffix = "",
  accent = "green",
  size = "normal",
  sublabel,
}: MetricCardProps) {
  const ac = accentConfig[accent];

  return (
    <motion.div
      whileHover={{ scale: 1.025, boxShadow: "0 12px 40px rgba(0,0,0,0.10)" }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className={`relative overflow-hidden bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 border-l-4 ${ac.border} p-5 shadow-sm`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${ac.bg} to-transparent pointer-events-none`} />
      <div className="relative">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          {label}
        </div>
        <div className={`font-bold text-gray-900 ${size === "large" ? "text-5xl" : "text-3xl"}`}>
          <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
        </div>
        {sublabel && (
          <div className="text-xs text-gray-400 mt-1.5">{sublabel}</div>
        )}
      </div>
    </motion.div>
  );
}
