import { useId, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

interface YardageTargetScatterProps {
  rawScores: { to_par: number; yardage: number }[];
  bucketLabel: string;
}

const RINGS = [
  { label: "Triple+", rInner: 74.7, rOuter: 90,   fill: "#a78bfa", stroke: "#8b5cf6" },
  { label: "Double",  rInner: 63.0, rOuter: 74.7,  fill: "#60a5fa", stroke: "#3b82f6" },
  { label: "Bogey",   rInner: 49.5, rOuter: 63.0,  fill: "#ef4444", stroke: "#dc2626" },
  { label: "Par",     rInner: 31.5, rOuter: 49.5,  fill: "#9ca3af", stroke: "#6b7280" },
  { label: "Birdie",  rInner: 16.2, rOuter: 31.5,  fill: "#059669", stroke: "#047857" },
  { label: "Eagle+",  rInner: 0,    rOuter: 16.2,  fill: "#f59e0b", stroke: "#d97706" },
];

function annularPath(cx: number, cy: number, rInner: number, rOuter: number): string {
  if (rInner === 0) {
    return `M ${cx + rOuter} ${cy} A ${rOuter} ${rOuter} 0 1 0 ${cx - rOuter} ${cy} A ${rOuter} ${rOuter} 0 1 0 ${cx + rOuter} ${cy} Z`;
  }
  return [
    `M ${cx + rOuter} ${cy}`,
    `A ${rOuter} ${rOuter} 0 1 0 ${cx - rOuter} ${cy}`,
    `A ${rOuter} ${rOuter} 0 1 0 ${cx + rOuter} ${cy} Z`,
    `M ${cx + rInner} ${cy}`,
    `A ${rInner} ${rInner} 0 1 1 ${cx - rInner} ${cy}`,
    `A ${rInner} ${rInner} 0 1 1 ${cx + rInner} ${cy} Z`,
  ].join(" ");
}

function getRingRange(toPar: number): [number, number] {
  if (toPar <= -2) return [0, 16.2];
  if (toPar === -1) return [16.2, 31.5];
  if (toPar === 0)  return [31.5, 49.5];
  if (toPar === 1)  return [49.5, 63.0];
  if (toPar === 2)  return [63.0, 74.7];
  return [74.7, 90.0];
}

function getDotColor(toPar: number): string {
  if (toPar <= -2) return "#f59e0b";
  if (toPar === -1) return "#059669";
  if (toPar === 0)  return "#9ca3af";
  if (toPar === 1)  return "#ef4444";
  if (toPar === 2)  return "#60a5fa";
  if (toPar === 3)  return "#a78bfa";
  return "#6d28d9";
}

function getScoreLabel(toPar: number): string {
  if (toPar <= -2) return "Eagle+";
  if (toPar === -1) return "Birdie";
  if (toPar === 0)  return "Par";
  if (toPar === 1)  return "Bogey";
  if (toPar === 2)  return "Double";
  if (toPar === 3)  return "Triple";
  return "Quad+";
}

export function YardageTargetScatter({ rawScores, bucketLabel }: YardageTargetScatterProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const filterId = useId().replace(/:/g, "");
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; toPar: number; yardage: number; visible: boolean;
  }>({ x: 0, y: 0, toPar: 0, yardage: 0, visible: false });

  const dots = useMemo(() => {
    return rawScores.map((score, idx) => {
      const [rMin, rMax] = getRingRange(score.to_par);
      const radialFrac = ((idx * 1234567891) % 1000) / 1000;
      const r = rMin + radialFrac * (rMax - rMin);
      const theta = ((idx * 2654435761) % 1000) / 1000 * Math.PI * 2;
      return {
        cx: 100 + r * Math.cos(theta),
        cy: 100 + r * Math.sin(theta),
        to_par: score.to_par,
        yardage: score.yardage,
        delay: Math.min(idx * 0.015, 0.8),
        id: idx,
      };
    });
  }, [rawScores]);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || dots.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = 200 / rect.width;
    const scaleY = 200 / rect.height;
    const svgX = (e.clientX - rect.left) * scaleX;
    const svgY = (e.clientY - rect.top) * scaleY;

    let nearest = dots[0];
    let minDist = Infinity;
    for (const d of dots) {
      const dist = Math.hypot(d.cx - svgX, d.cy - svgY);
      if (dist < minDist) { minDist = dist; nearest = d; }
    }

    if (minDist < 10) {
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        toPar: nearest.to_par,
        yardage: nearest.yardage,
        visible: true,
      });
    } else {
      setTooltip(t => ({ ...t, visible: false }));
    }
  }

  const isEmpty = rawScores.length === 0;
  const toParSign = (n: number) => n > 0 ? `+${n}` : n === 0 ? "E" : `${n}`;

  return (
    <div className="relative w-full max-w-[320px] mx-auto aspect-square">
      <svg
        ref={svgRef}
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid meet"
        className="block w-full h-full"
        style={{ overflow: "visible" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(t => ({ ...t, visible: false }))}
      >
        <defs>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Rings — each an annular path with evenodd, drawn outer→inner */}
        {RINGS.map((ring) => (
          <path
            key={ring.label}
            d={annularPath(100, 100, ring.rInner, ring.rOuter)}
            fillRule="evenodd"
            fill={ring.fill}
            fillOpacity={0.38}
            stroke={ring.stroke}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        ))}

        {isEmpty ? (
          <text x={100} y={105} textAnchor="middle" fontSize={11} fill="#9ca3af">
            No data
          </text>
        ) : (
          dots.map((dot) => (
            <motion.circle
              key={dot.id}
              r={3.5}
              fill={getDotColor(dot.to_par)}
              fillOpacity={1}
              stroke="white"
              strokeWidth={1}
              filter={dot.to_par <= -1 ? `url(#${filterId})` : undefined}
              initial={{ cx: 100, cy: 100, opacity: 0 }}
              animate={{ cx: dot.cx, cy: dot.cy, opacity: 1 }}
              transition={{ delay: dot.delay, duration: 0.5, ease: "easeOut" }}
            />
          ))
        )}
      </svg>

      {tooltip.visible && (
        <div
          className="absolute pointer-events-none z-10 bg-white/95 backdrop-blur-sm rounded-xl border border-gray-100 shadow-lg px-3 py-2.5 text-xs"
          style={{
            left: tooltip.x + (tooltip.x > 130 ? -130 : 12),
            top: tooltip.y - 36,
          }}
        >
          <div className="font-semibold text-gray-800">{bucketLabel}</div>
          <div className="text-gray-500">{tooltip.yardage} yds · {getScoreLabel(tooltip.toPar)}</div>
          <div style={{ color: getDotColor(tooltip.toPar) }} className="font-bold">
            {toParSign(tooltip.toPar)}
          </div>
        </div>
      )}
    </div>
  );
}
