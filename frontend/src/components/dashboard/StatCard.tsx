import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number | null;
  icon: LucideIcon;
  subtitle?: string;
  highlight?: boolean;
}

export function StatCard({ label, value, icon: Icon, subtitle, highlight }: StatCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.025, boxShadow: "0 10px 32px rgba(0,0,0,0.10)" }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className={`relative overflow-hidden rounded-2xl border p-5 shadow-sm ${
        highlight
          ? "bg-primary border-primary text-white"
          : "bg-white/80 backdrop-blur-sm border-gray-100"
      }`}
    >
      {highlight && (
        <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/5 blur-2xl pointer-events-none" />
      )}
      <div className="relative flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold uppercase tracking-widest ${highlight ? "text-white/50" : "text-gray-400"}`}>
          {label}
        </span>
        <div className={`p-1.5 rounded-lg ${highlight ? "bg-white/10" : "bg-primary/8"}`}>
          <Icon size={15} className={highlight ? "text-white/70" : "text-primary"} />
        </div>
      </div>
      <div className={`text-2xl font-bold ${highlight ? "text-white" : "text-gray-900"}`}>
        {value ?? "—"}
      </div>
      {subtitle && (
        <p className={`text-xs mt-1 truncate ${highlight ? "text-white/50" : "text-gray-400"}`}>
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}
