import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AnalyticsKPIs } from "@/types/analytics";

function formatHI(hi: number | null | undefined): string {
  if (hi == null) return "—";
  if (hi < 0) return `+${Math.abs(hi).toFixed(1)}`;
  return hi.toFixed(1);
}

interface StatPillProps {
  label: string;
  value: string;
}

function StatPill({ label, value }: StatPillProps) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-bold text-gray-800">{value}</span>
    </div>
  );
}

interface StickyScoreBarProps {
  kpis: AnalyticsKPIs;
  triggerAt?: number;
}

export function StickyScoreBar({ kpis, triggerAt = 300 }: StickyScoreBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > triggerAt);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [triggerAt]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -44 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -44 }}
          transition={{ duration: 0.28, ease: "easeInOut" }}
          className="sticky-score-bar fixed top-0 left-56 right-0 z-40 bg-white/85 backdrop-blur-md border-b border-gray-100 shadow-sm"
        >
          <div className="px-8 py-2.5 flex items-center gap-8">
            <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
              Your Stats
            </span>
            <div className="flex items-center gap-6 divide-x divide-gray-100">
              <StatPill label="HI" value={formatHI(kpis.handicap_index)} />
              <div className="pl-6">
                <StatPill
                  label="Avg"
                  value={kpis.scoring_average != null ? String(kpis.scoring_average) : "—"}
                />
              </div>
              <div className="pl-6">
                <StatPill
                  label="GIR"
                  value={kpis.gir_percentage != null ? `${kpis.gir_percentage}%` : "—"}
                />
              </div>
              <div className="pl-6">
                <StatPill
                  label="Putts/GIR"
                  value={kpis.putts_per_gir != null ? String(kpis.putts_per_gir) : "—"}
                />
              </div>
              <div className="pl-6">
                <StatPill
                  label="Scrambling"
                  value={kpis.scrambling_percentage != null ? `${kpis.scrambling_percentage}%` : "—"}
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
