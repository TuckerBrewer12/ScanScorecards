import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { scaleLinear } from "d3-scale";
import { line, curveMonotoneX } from "d3-shape";
import type { Round } from "@/types/golf";

interface HolePoint {
  hole: number;
  to_par: number;
  strokes: number;
  par: number;
  putts: number | null;
  gir: boolean | null;
  fairway: boolean | null;
}

interface RoundFlowTimelineProps {
  round: Round;
}

const W = 720;
const H = 220;
const PAD = { top: 28, right: 16, bottom: 36, left: 40 };

function getScoreLabel(toPar: number): string {
  if (toPar <= -3) return "Albatross";
  if (toPar === -2) return "Eagle";
  if (toPar === -1) return "Birdie";
  if (toPar === 0) return "Par";
  if (toPar === 1) return "Bogey";
  if (toPar === 2) return "Double";
  if (toPar === 3) return "Triple";
  return `+${toPar}`;
}

function getDotColor(toPar: number): string {
  if (toPar <= -2) return "#f59e0b";
  if (toPar === -1) return "#059669";
  if (toPar === 0) return "#9ca3af";
  return "#ef4444";
}

function getYAxisColor(v: number): string {
  if (v < 0) return "#059669";
  if (v > 0) return "#ef4444";
  return "#6b7280";
}

export function RoundFlowTimeline({ round }: RoundFlowTimelineProps) {
  const [hovered, setHovered] = useState<HolePoint | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const points: HolePoint[] = round.hole_scores
    .filter((s) => s.hole_number != null && s.strokes != null)
    .map((s) => {
      const courseHole = round.course?.holes.find((h) => h.number === s.hole_number);
      const par = courseHole?.par ?? s.par_played ?? 4;
      return {
        hole: s.hole_number!,
        strokes: s.strokes!,
        par,
        to_par: s.strokes! - par,
        putts: s.putts,
        gir: s.green_in_regulation,
        fairway: s.fairway_hit,
      };
    })
    .sort((a, b) => a.hole - b.hole);

  if (points.length < 3) return null;

  const holeNumbers = points.map((p) => p.hole);
  const minHole = Math.min(...holeNumbers);
  const maxHole = Math.max(...holeNumbers);

  const xScale = scaleLinear()
    .domain([minHole, maxHole])
    .range([PAD.left, W - PAD.right]);

  // Cap domain at ±5 so one blow-up hole doesn't compress the whole chart.
  // Points beyond ±5 are clamped to the boundary for rendering.
  const yExtent = 5;
  const clamp = (v: number) => Math.max(-yExtent, Math.min(yExtent, v));

  // Inverted: bogey+ (positive) at top, birdie- (negative) at bottom
  const yScale = scaleLinear()
    .domain([-yExtent, yExtent])
    .range([H - PAD.bottom, PAD.top]);

  const pathGen = line<HolePoint>()
    .x((d) => xScale(d.hole))
    .y((d) => yScale(clamp(d.to_par)))
    .curve(curveMonotoneX);

  const pathD = pathGen(points) ?? "";

  const yTicks = [-3, -2, -1, 0, 1, 2, 3];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (W / rect.width);
    const holeIdx = Math.round(xScale.invert(svgX));
    const clamped = Math.max(minHole, Math.min(maxHole, holeIdx));
    const pt = points.find((p) => p.hole === clamped) ?? null;
    setHovered(pt);
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseLeave = () => setHovered(null);

  return (
    <div className="relative select-none">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ overflow: "visible" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Subtle par (zero) reference line only */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={yScale(0)}
          y2={yScale(0)}
          stroke="#e5e7eb"
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />

        {/* Front/back nine divider */}
        {maxHole > 9 && minHole <= 9 && (
          <line
            x1={xScale(9.5)}
            x2={xScale(9.5)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="#f3f4f6"
            strokeWidth={1}
          />
        )}

        {/* Main line — solid gray */}
        <motion.path
          d={pathD}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease: "easeInOut" }}
        />

        {/* Score dots */}
        {points.map((p, i) => (
          <motion.circle
            key={p.hole}
            cx={xScale(p.hole)}
            cy={yScale(clamp(p.to_par))}
            r={hovered?.hole === p.hole ? 6 : 4}
            fill={getDotColor(p.to_par)}
            stroke="white"
            strokeWidth={1.5}
            style={{ cursor: "crosshair" }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.2 + i * 0.04, duration: 0.25, ease: "backOut" }}
          />
        ))}

        {/* Hover crosshair */}
        {hovered && (
          <line
            x1={xScale(hovered.hole)}
            x2={xScale(hovered.hole)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="#e5e7eb"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        {/* X-axis hole labels */}
        {points.map((p) => (
          <text
            key={`label-${p.hole}`}
            x={xScale(p.hole)}
            y={H - PAD.bottom + 14}
            textAnchor="middle"
            fontSize={10}
            fill={hovered?.hole === p.hole ? "#374151" : "#9ca3af"}
            fontWeight={hovered?.hole === p.hole ? "600" : "400"}
          >
            {p.hole}
          </text>
        ))}

        {/* Y-axis labels — negative = green, positive = red, 0 = gray */}
        {yTicks.map((v) => (
          <text
            key={`y-${v}`}
            x={PAD.left - 8}
            y={yScale(v) + 4}
            textAnchor="end"
            fontSize={9}
            fill={getYAxisColor(v)}
            fontWeight={v === 0 ? "600" : "500"}
          >
            {v === 0 ? "E" : v > 0 ? `+${v}` : `${v}`}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            key={hovered.hole}
            className="absolute pointer-events-none z-10 bg-white/95 backdrop-blur-sm rounded-xl border border-gray-100 shadow-lg px-3 py-2.5 text-xs min-w-[130px]"
            style={{
              left: tooltipPos.x + (tooltipPos.x > W * 0.65 ? -150 : 14),
              top: tooltipPos.y - 10,
            }}
            initial={{ opacity: 0, scale: 0.92, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 4 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="font-bold text-gray-900 text-sm">Hole {hovered.hole}</span>
              <span
                className="font-semibold text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  background: getDotColor(hovered.to_par) + "22",
                  color: getDotColor(hovered.to_par),
                }}
              >
                {getScoreLabel(hovered.to_par)}
              </span>
            </div>
            <div className="text-gray-700 font-medium mb-1">
              {hovered.strokes} strokes
              <span className="text-gray-400 font-normal ml-1">
                ({hovered.to_par > 0 ? "+" : ""}{hovered.to_par}) · Par {hovered.par}
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <span>{hovered.putts != null ? `${hovered.putts} putts` : "Putts N/A"}</span>
              {hovered.gir != null && (
                <span className={hovered.gir ? "text-emerald-500" : "text-gray-400"}>
                  {hovered.gir ? "GIR ✓" : "No GIR"}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
