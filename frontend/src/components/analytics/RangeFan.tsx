import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { scaleLinear } from "d3-scale";
import type { ScoringByYardageRow } from "@/types/analytics";

interface RangeFanProps {
  rows: ScoringByYardageRow[];
}

interface FanDot {
  id: string;
  cx: number;
  cy: number;
  to_par: number;
  yardage: number;
  par: number;
  bucket_label: string;
  delay: number;
}

function getDotColor(toPar: number): string {
  if (toPar <= -2) return "#f59e0b";
  if (toPar === -1) return "#059669";
  if (toPar === 0) return "#9ca3af";
  return "#ef4444";
}

function getScoreLabel(toPar: number): string {
  if (toPar <= -2) return "Eagle+";
  if (toPar === -1) return "Birdie";
  if (toPar === 0) return "Par";
  if (toPar === 1) return "Bogey";
  if (toPar === 2) return "Double";
  return "Triple+";
}

const LEGEND = [
  { label: "Eagle+", color: "#f59e0b" },
  { label: "Birdie",  color: "#059669" },
  { label: "Par",     color: "#9ca3af" },
  { label: "Bogey+",  color: "#ef4444" },
];

export function RangeFan({ rows }: RangeFanProps) {
  const [tooltip, setTooltip] = useState<{ dot: FanDot; x: number; y: number } | null>(null);

  const allScores = useMemo(
    () => rows.flatMap((r) => r.raw_scores.map((s) => ({ ...s, par: r.par, bucket_label: r.bucket_label }))),
    [rows],
  );

  const maxYardage = useMemo(
    () => Math.max(...allScores.map((s) => s.yardage), 250),
    [allScores],
  );

  const rScale = useMemo(
    () => scaleLinear().domain([0, maxYardage]).range([0, 280]),
    [maxYardage],
  );

  const dots = useMemo<FanDot[]>(() => {
    const result: FanDot[] = [];
    let globalIdx = 0;
    for (const row of rows) {
      for (let i = 0; i < row.raw_scores.length; i++) {
        const score = row.raw_scores[i];
        const jitter = ((globalIdx * 2654435761) % 1000) / 1000;
        const theta = -Math.PI / 2 + (jitter - 0.5) * Math.PI * 1.1;
        const r = rScale(score.yardage);
        result.push({
          id: `${row.par}-${row.bucket_label}-${i}`,
          cx: 280 + r * Math.cos(theta),
          cy: 320 + r * Math.sin(theta),
          to_par: score.to_par,
          yardage: score.yardage,
          par: row.par,
          bucket_label: row.bucket_label,
          delay: Math.min(globalIdx * 0.004, 1.0),
        });
        globalIdx++;
      }
    }
    return result;
  }, [rows, rScale]);

  const ringYardages = useMemo(() => {
    const rings: number[] = [];
    for (const y of [100, 150, 200, 250, 300, 350, 400, 500]) {
      if (y <= maxYardage) rings.push(y);
    }
    return rings;
  }, [maxYardage]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (560 / rect.width);
    const svgY = (e.clientY - rect.top) * (340 / rect.height);

    let nearest: FanDot | null = null;
    let nearestDist = 14;
    for (const dot of dots) {
      const dist = Math.sqrt((dot.cx - svgX) ** 2 + (dot.cy - svgY) ** 2);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = dot;
      }
    }
    if (nearest) {
      setTooltip({ dot: nearest, x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      setTooltip(null);
    }
  };

  return (
    <div className="relative select-none">
      <svg
        viewBox="0 0 560 340"
        className="w-full"
        style={{ overflow: "visible" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <filter id="rangeFanGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="groundGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f1f5f9" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>

        {/* Ground fill below baseline */}
        <rect x="0" y="320" width="560" height="20" fill="url(#groundGrad)" />

        {/* Yardage rings */}
        {ringYardages.map((y) => {
          const r = rScale(y);
          return (
            <g key={y}>
              <path
                d={`M ${280 - r} 320 A ${r} ${r} 0 0 1 ${280 + r} 320`}
                fill="none"
                stroke="#e5e7eb"
                strokeWidth={1}
                strokeDasharray="4 5"
              />
              <text x={280 + r + 4} y={323} fontSize={9} fill="#9ca3af">{y}y</text>
            </g>
          );
        })}

        {/* Tee marker */}
        <circle cx={280} cy={320} r={5} fill="#374151" />
        <text x={280} y={334} textAnchor="middle" fontSize={9} fill="#6b7280">Tee</text>

        {/* Dots */}
        {dots.map((dot) => {
          const isGood = dot.to_par <= -1;
          return (
            <motion.circle
              key={dot.id}
              r={3.5}
              fill={getDotColor(dot.to_par)}
              filter={isGood ? "url(#rangeFanGlow)" : undefined}
              initial={{ cx: 280, cy: 320, opacity: 0 }}
              animate={{ cx: dot.cx, cy: dot.cy, opacity: 0.8 }}
              transition={{ delay: dot.delay, duration: 0.5, ease: "easeOut" }}
            />
          );
        })}

        {/* Legend */}
        {LEGEND.map((item, i) => (
          <g key={item.label} transform={`translate(${100 + i * 95}, 12)`}>
            <circle cx={5} cy={5} r={4} fill={item.color} />
            <text x={13} y={9} fontSize={9} fill="#6b7280">{item.label}</text>
          </g>
        ))}
      </svg>

      {tooltip && (
        <div
          className="absolute pointer-events-none z-10 bg-white/95 backdrop-blur-sm rounded-xl border border-gray-100 shadow-lg px-3 py-2 text-xs"
          style={{
            left: tooltip.x + (tooltip.x > 400 ? -150 : 12),
            top: tooltip.y - 10,
          }}
        >
          <div className="font-bold text-gray-900 mb-0.5">
            {tooltip.dot.yardage}y · Par {tooltip.dot.par}
          </div>
          <div style={{ color: getDotColor(tooltip.dot.to_par) }} className="font-semibold">
            {getScoreLabel(tooltip.dot.to_par)}
          </div>
          <div className="text-gray-400 mt-0.5">
            {tooltip.dot.to_par > 0 ? "+" : ""}{tooltip.dot.to_par} to par
          </div>
        </div>
      )}
    </div>
  );
}
