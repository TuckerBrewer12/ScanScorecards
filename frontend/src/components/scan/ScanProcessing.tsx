import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import type { ScanState } from "@/types/scan";

const PHASES_FULL = [
  { label: "Reading course details…", sub: "Identifying name, location & tee boxes" },
  { label: "Extracting hole scores…", sub: "Parsing your scorecard row by row" },
  { label: "Verifying yardages & par…", sub: "Cross-checking hole data" },
  { label: "Calculating confidence…", sub: "Flagging fields that may need review" },
];

export function ScanProcessing({ scanMode }: { scanMode: ScanState["scanMode"] }) {
  const phases = PHASES_FULL;
  const [phaseIdx, setPhaseIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhaseIdx((i) => Math.min(i + 1, phases.length - 1));
    }, 3500);
    return () => clearInterval(interval);
  }, [phases.length, scanMode]);

  return (
    <div>
      <PageHeader title="Scan Scorecard" />
      <div className="flex flex-col items-center justify-center min-h-[62vh]">

        {/* Animated scorecard card */}
        <div className="relative mb-12">
          <motion.div
            className="relative w-64 h-40 rounded-2xl border-2 border-primary/20 overflow-hidden"
            style={{ background: "linear-gradient(135deg, #ffffff 0%, #f0f7f1 100%)" }}
            animate={{
              boxShadow: [
                "0 8px 32px rgba(45,122,58,0.08)",
                "0 20px 60px rgba(45,122,58,0.22)",
                "0 8px 32px rgba(45,122,58,0.08)",
              ],
            }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* Fake scorecard grid */}
            <div className="absolute inset-0 p-4 pt-5 flex flex-col gap-2 select-none pointer-events-none">
              <div className="flex gap-1 items-center">
                <div className="h-1.5 w-10 rounded-full bg-gray-300/60" />
                {[...Array(9)].map((_, j) => (
                  <div key={j} className="h-1.5 w-[18px] rounded-full bg-gray-200/80 flex-shrink-0" />
                ))}
              </div>
              {["bg-gray-300/50", "bg-primary/25", "bg-gray-300/50", "bg-gray-200/40"].map((color, i) => (
                <div key={i} className="flex gap-1 items-center">
                  <div className={`h-1.5 w-10 rounded-full ${color}`} />
                  {[...Array(9)].map((_, j) => (
                    <div key={j} className={`h-1.5 w-[18px] rounded-full ${color} flex-shrink-0`} />
                  ))}
                </div>
              ))}
            </div>

            {/* Moving scan line */}
            <motion.div
              className="absolute left-0 right-0 h-px pointer-events-none"
              style={{
                background: "linear-gradient(90deg, transparent 0%, #2d7a3a 35%, #2d7a3a 65%, transparent 100%)",
                boxShadow: "0 0 16px 5px rgba(45,122,58,0.45)",
              }}
              animate={{ top: ["8%", "92%"] }}
              transition={{ duration: 1.6, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
            />

            {/* Scan highlight band */}
            <motion.div
              className="absolute left-0 right-0 h-12 pointer-events-none"
              style={{
                background: "linear-gradient(180deg, rgba(45,122,58,0.10) 0%, transparent 100%)",
              }}
              animate={{ top: ["-10%", "70%"] }}
              transition={{ duration: 1.6, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
            />
          </motion.div>

          {/* Corner bracket markers */}
          {(["tl", "tr", "bl", "br"] as const).map((corner, i) => (
            <motion.div
              key={corner}
              className="absolute w-4 h-4 border-primary"
              style={{
                top: corner.startsWith("t") ? -7 : undefined,
                bottom: corner.startsWith("b") ? -7 : undefined,
                left: corner.endsWith("l") ? -7 : undefined,
                right: corner.endsWith("r") ? -7 : undefined,
                borderTopWidth: corner.startsWith("t") ? 2 : 0,
                borderBottomWidth: corner.startsWith("b") ? 2 : 0,
                borderLeftWidth: corner.endsWith("l") ? 2 : 0,
                borderRightWidth: corner.endsWith("r") ? 2 : 0,
              }}
              animate={{ opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.45, ease: "easeInOut" }}
            />
          ))}
        </div>

        {/* Cycling phase label */}
        <AnimatePresence mode="wait">
          <motion.div
            key={phaseIdx}
            className="text-center px-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.32 }}
          >
            <p className="text-lg font-semibold text-gray-800 mb-1">{phases[phaseIdx].label}</p>
            <p className="text-sm text-gray-400">{phases[phaseIdx].sub}</p>
          </motion.div>
        </AnimatePresence>

        {/* Progress pills */}
        <div className="flex items-center gap-2 mt-8">
          {phases.map((_, i) => (
            <motion.div
              key={i}
              className="h-1.5 rounded-full bg-primary"
              animate={{
                width: i < phaseIdx ? 18 : i === phaseIdx ? 32 : 6,
                opacity: i <= phaseIdx ? 1 : 0.18,
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
