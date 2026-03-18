import { useMemo } from "react";
import { motion } from "framer-motion";
import { scaleLinear } from "d3-scale";
import type { ScoringByYardageRow } from "@/types/analytics";

interface ApexTracersProps {
  rows: ScoringByYardageRow[];
}

const PAR_COLORS: Record<number, string> = {
  3: "#6366f1",
  4: "#0ea5e9",
  5: "#10b981",
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function ApexTracers({ rows }: ApexTracersProps) {
  const parGroups = useMemo(() => {
    return [3, 4, 5].flatMap((par) => {
      const allScores = rows.filter((r) => r.par === par).flatMap((r) => r.raw_scores);
      if (allScores.length === 0) return [];
      return [{
        par,
        avgYardage: allScores.reduce((s, x) => s + x.yardage, 0) / allScores.length,
        avgToPar:   allScores.reduce((s, x) => s + x.to_par, 0) / allScores.length,
        count: allScores.length,
      }];
    });
  }, [rows]);

  const maxYard = Math.max(...parGroups.map((g) => g.avgYardage), 200);
  const xScale = useMemo(
    () => scaleLinear().domain([0, maxYard * 1.15]).range([48, 616]),
    [maxYard],
  );

  const xAxisLabels = [0, 100, 200, 300, 400, 500].filter((v) => v <= maxYard * 1.15);

  return (
    <div className="select-none">
      <svg viewBox="0 0 640 200" className="w-full" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="groundFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f1f5f9" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>

        {/* Ground rect */}
        <rect x="48" y="165" width="568" height="25" fill="url(#groundFill)" />

        {/* Baseline */}
        <line x1={48} y1={165} x2={616} y2={165} stroke="#e5e7eb" strokeWidth={1} />

        {/* X-axis labels */}
        {xAxisLabels.map((v) => (
          <text
            key={v}
            x={xScale(v)}
            y={185}
            textAnchor="middle"
            fontSize={9}
            fill="#9ca3af"
          >
            {v}y
          </text>
        ))}

        {/* Tracers */}
        {parGroups.map((g, parIdx) => {
          const color = PAR_COLORS[g.par] ?? "#9ca3af";
          const apexH = clamp(20 + g.avgToPar * 22, 8, 110);
          const x0 = xScale(0);
          const x1 = xScale(g.avgYardage);
          const cx = xScale(g.avgYardage / 2);
          const cy = 165 - apexH;
          const d = `M ${x0} 165 Q ${cx} ${cy} ${x1} 165`;

          return (
            <g key={g.par}>
              {/* Arc tracer */}
              <motion.path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ delay: parIdx * 0.3, duration: 1.0, ease: "easeInOut" }}
              />

              {/* Landing dot */}
              <motion.circle
                cx={x1}
                cy={165}
                r={5}
                fill={color}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: parIdx * 0.3 + 1.0, duration: 0.25, ease: "easeOut" }}
              />

              {/* Par label at apex */}
              <motion.text
                x={cx}
                y={cy - 10}
                textAnchor="middle"
                fontSize={10}
                fill={color}
                fontWeight="600"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: parIdx * 0.3 + 0.5, duration: 0.4 }}
              >
                Par {g.par}
              </motion.text>

              {/* Avg to par label near landing */}
              <motion.text
                x={x1 + 6}
                y={162}
                fontSize={9}
                fill={color}
                fontWeight="500"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: parIdx * 0.3 + 1.1, duration: 0.3 }}
              >
                {g.avgToPar > 0 ? "+" : ""}{g.avgToPar.toFixed(2)}
              </motion.text>
            </g>
          );
        })}

        {/* Empty state */}
        {parGroups.length === 0 && (
          <text x={320} y={90} textAnchor="middle" fontSize={12} fill="#9ca3af">
            No yardage data available
          </text>
        )}
      </svg>
    </div>
  );
}
