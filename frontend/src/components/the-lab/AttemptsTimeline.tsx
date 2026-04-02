import { motion } from "framer-motion";

export function AttemptsTimeline({
  scores,
  goal,
}: {
  scores: { total_score: number | null; round_index: number }[];
  goal: number;
}) {
  const valid = scores.filter((r) => r.total_score != null).slice(-24);
  if (valid.length < 3) return null;
  const W = 560; const H = 96; const PX = 8; const PY = 14;
  const vals = valid.map((r) => r.total_score!);
  const minV = Math.min(...vals, goal) - 4;
  const maxV = Math.max(...vals, goal) + 4;
  const toX = (i: number) => PX + (i / (valid.length - 1)) * (W - PX * 2);
  const toY = (v: number) => PY + ((v - minV) / (maxV - minV)) * (H - PY * 2);
  const goalY = toY(goal);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} overflow="visible">
      <line x1={PX} y1={goalY} x2={W - PX - 28} y2={goalY}
        stroke="#2d7a3a" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.4} />
      <text x={W - PX - 24} y={goalY + 4} fontSize={9} fill="#2d7a3a" opacity={0.55} fontWeight="600">Goal</text>
      <polyline
        points={valid.map((r, i) => `${toX(i)},${toY(r.total_score!)}`).join(" ")}
        fill="none" stroke="#e5e7eb" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
      />
      {valid.map((r, i) => {
        const beat = r.total_score! <= goal;
        return (
          <motion.circle key={i} cx={toX(i)} cy={toY(r.total_score!)}
            r={beat ? 5.5 : 4}
            fill={beat ? "#059669" : "#f3f4f6"}
            stroke={beat ? "#059669" : "#d1d5db"}
            strokeWidth={beat ? 0 : 1.5}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.025, duration: 0.3, ease: "easeOut" }}
          />
        );
      })}
    </svg>
  );
}
