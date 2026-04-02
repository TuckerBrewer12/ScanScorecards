import { motion } from "framer-motion";

export function ProgressRing({ gap, onTrack }: { gap: number; onTrack: boolean }) {
  const r = 54; const strokeW = 9; const size = 148; const c = size / 2;
  const circ = 2 * Math.PI * r;
  const progress = onTrack ? 1 : Math.max(0.04, 1 - gap / 16);
  const offset = circ * (1 - progress);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeW} />
      <motion.circle
        cx={c} cy={c} r={r} fill="none"
        stroke={onTrack ? "#059669" : "#2d7a3a"}
        strokeWidth={strokeW} strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: "easeOut", delay: 0.15 }}
        transform={`rotate(-90 ${c} ${c})`}
      />
    </svg>
  );
}
