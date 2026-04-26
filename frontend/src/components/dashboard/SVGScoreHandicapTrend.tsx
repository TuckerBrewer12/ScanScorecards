import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { scaleLinear } from "d3-scale";
import { line, area, curveMonotoneX } from "d3-shape";

interface DualTrendPoint {
  round_index: number;
  total_score: number | null;
  to_par: number | null;
  handicap_index: number | null;
  course_name?: string | null;
  used_in_hi?: boolean | null;
  differential?: number | null;
  hi_threshold?: number | null;
}

interface SVGScoreHandicapTrendProps {
  data: DualTrendPoint[];
  scoreColor: string;
  handicapColor: string;
  gridColor: string;
  height?: number;
}

const W = 560;
const PAD = { top: 12, right: 58, bottom: 28, left: 44 };

function formatHI(hi: number | null | undefined): string {
  if (hi == null) return "—";
  if (hi < 0) return `+${Math.abs(hi).toFixed(1)}`;
  return hi.toFixed(1);
}

function getDotColor(toPar: number | null): string {
  if (toPar == null) return "#9ca3af";
  if (toPar <= -2) return "#b45309";
  if (toPar === -1) return "#059669";
  if (toPar === 0) return "#9ca3af";
  return "#ef4444";
}

function getBarColor(d: DualTrendPoint): string {
  if (d.used_in_hi == null) return "#9ca3af";
  if (d.used_in_hi) return "#059669";
  if (d.hi_threshold != null && d.differential != null && d.differential - d.hi_threshold <= 2) return "#d97706";
  return "#dc2626";
}

export function SVGScoreHandicapTrend({
  data,
  scoreColor,
  handicapColor,
  gridColor,
  height = 200,
}: SVGScoreHandicapTrendProps) {
  const H = height;
  const [hovered, setHovered] = useState<DualTrendPoint | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  if (data.length < 2) {
    return <div className="h-full flex items-center justify-center text-sm text-gray-400">Not enough data</div>;
  }

  const validScores = data.filter((d) => d.total_score != null);
  const validHI = data.filter((d) => d.handicap_index != null);

  if (validScores.length === 0) {
    return <div className="h-full flex items-center justify-center text-sm text-gray-400">No score data</div>;
  }

  const xScale = scaleLinear()
    .domain([0, data.length - 1])
    .range([PAD.left, W - PAD.right]);

  const scoreMin = Math.min(...validScores.map((d) => d.total_score!));
  const scoreMax = Math.max(...validScores.map((d) => d.total_score!));
  const yScoreScale = scaleLinear()
    .domain([scoreMin - 5, scoreMax + 5])
    .range([H - PAD.bottom, PAD.top]);

  const hiMin = validHI.length ? Math.min(...validHI.map((d) => d.handicap_index!)) : 0;
  const hiMax = validHI.length ? Math.max(...validHI.map((d) => d.handicap_index!)) : 10;
  const yHIScale = scaleLinear()
    .domain([hiMin - 0.5, hiMax + 0.5])
    .range([H - PAD.bottom, PAD.top]);

  const scoreLine = line<DualTrendPoint>()
    .defined((d) => d.total_score != null)
    .x((_, i) => xScale(i))
    .y((d) => yScoreScale(d.total_score!))
    .curve(curveMonotoneX);

  const hiLine = line<DualTrendPoint>()
    .defined((d) => d.handicap_index != null)
    .x((_, i) => xScale(i))
    .y((d) => yHIScale(d.handicap_index!))
    .curve(curveMonotoneX);

  const hiArea = area<DualTrendPoint>()
    .defined((d) => d.handicap_index != null)
    .x((_, i) => xScale(i))
    .y0(H - PAD.bottom)
    .y1((d) => yHIScale(d.handicap_index!))
    .curve(curveMonotoneX);

  const scorePathD = scoreLine(data) ?? "";
  const hiLineD = hiLine(data) ?? "";
  const hiAreaD = hiArea(data) ?? "";

  const gridTicks = yScoreScale.ticks(5);
  const hiTicks = yHIScale.ticks(4);
  const barW = Math.max(4, Math.min(14, (W - PAD.left - PAD.right) / data.length - 2));
  const baseline = H - PAD.bottom;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (W / rect.width);
    const idx = Math.round(xScale.invert(svgX));
    const clamped = Math.max(0, Math.min(data.length - 1, idx));
    setHovered(data[clamped] ?? null);
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseLeave = () => setHovered(null);

  const showLabels = data.length <= 15;

  return (
    <div className="relative select-none">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ overflow: "visible" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id="scoreGrad_dashboard" x1="0" y1="0" x2="0" y2="1">
            <stop offset="14%" stopColor={scoreColor} stopOpacity={0.14} />
            <stop offset="100%" stopColor={scoreColor} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="hiGrad_dashboard" x1="0" y1="0" x2="0" y2="1">
            <stop offset="10%" stopColor={handicapColor} stopOpacity={0.1} />
            <stop offset="100%" stopColor={handicapColor} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridTicks.map((v) => (
          <line
            key={`grid-${v}`}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={yScoreScale(v)}
            y2={yScoreScale(v)}
            stroke={gridColor}
            strokeWidth={1}
          />
        ))}

        {/* Left Y-axis labels (score) */}
        {gridTicks.map((v) => (
          <text
            key={`yl-${v}`}
            x={PAD.left - 7}
            y={yScoreScale(v) + 4}
            textAnchor="end"
            fontSize={11}
            fontWeight="bold"
            fill="#4b5563"
          >
            {v}
          </text>
        ))}

        {/* Right Y-axis labels (HI) */}
        {validHI.length > 0 && hiTicks.map((v) => (
          <text
            key={`yr-${v}`}
            x={W - PAD.right + 7}
            y={yHIScale(v) + 4}
            textAnchor="start"
            fontSize={11}
            fontWeight="bold"
            fill={handicapColor}
          >
            {formatHI(v)}
          </text>
        ))}

        {/* Bars: baseline → data point, drawn before line so line sits on top */}
        {data.map((d, i) => {
          if (d.total_score == null) return null;
          const barTop = yScoreScale(d.total_score);
          const barHeight = baseline - barTop;
          if (barHeight <= 0) return null;
          return (
            <rect
              key={`bar-${i}`}
              x={xScale(i) - barW / 2}
              y={barTop}
              width={barW}
              height={barHeight}
              fill={getBarColor(d)}
              fillOpacity={0.6}
              rx={2}
            />
          );
        })}

        {/* HI area */}
        {validHI.length > 0 && (
          <motion.path
            d={hiAreaD}
            fill="url(#hiGrad_dashboard)"
            stroke="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.4, ease: "easeInOut" }}
          />
        )}

        {/* HI line */}
        {validHI.length > 0 && (
          <motion.path
            d={hiLineD}
            fill="none"
            stroke={handicapColor}
            strokeWidth={1.5}
            strokeOpacity={0.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.4, ease: "easeInOut" }}
          />
        )}

        {/* Score line */}
        <motion.path
          d={scorePathD}
          fill="none"
          stroke={scoreColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
        />

        {/* Score dots */}
        {data.map((d, i) => {
          if (d.total_score == null) return null;
          const cx = xScale(i);
          const cy = yScoreScale(d.total_score);
          const isHovered = hovered?.round_index === d.round_index;
          return (
            <motion.circle
              key={`dot-${i}`}
              cx={cx}
              cy={cy}
              r={isHovered ? 6 : 3.5}
              fill={getDotColor(d.to_par)}
              stroke="white"
              strokeWidth={1.5}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1.0 + i * 0.04, duration: 0.25, ease: "backOut" }}
            />
          );
        })}

        {/* Score labels above dots */}
        {showLabels && data.map((d, i) => {
          if (d.total_score == null) return null;
          const cx = xScale(i);
          const cy = yScoreScale(d.total_score);
          return (
            <text
              key={`lbl-${i}`}
              x={cx}
              y={cy - 8}
              textAnchor="middle"
              fontSize={9}
              fill="#9ca3af"
              fontWeight="600"
            >
              {d.total_score}
            </text>
          );
        })}

        {/* Crosshair */}
        {hovered && hovered.total_score != null && (
          <line
            x1={xScale(data.indexOf(hovered))}
            x2={xScale(data.indexOf(hovered))}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="#e5e7eb"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
      </svg>

      {/* Tooltip */}
      <AnimatePresence>
        {hovered && hovered.total_score != null && (
          <motion.div
            key={hovered.round_index}
            className="absolute pointer-events-none z-10 bg-white/95 backdrop-blur-sm rounded-xl border border-gray-100 shadow-lg px-3 py-2.5 text-xs min-w-[130px]"
            style={{
              left: tooltipPos.x + (tooltipPos.x > (W * 0.65) ? -150 : 14),
              top: tooltipPos.y - 10,
            }}
            initial={{ opacity: 0, scale: 0.92, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 4 }}
            transition={{ duration: 0.15 }}
          >
            <div className="font-bold text-gray-900 text-sm mb-1">Round {hovered.round_index}</div>
            {hovered.course_name && (
              <div className="text-[11px] text-gray-400 mb-1.5 truncate max-w-[160px]">{hovered.course_name}</div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-500">Score</span>
              <span className="font-semibold text-gray-800">{hovered.total_score}</span>
            </div>
            {hovered.handicap_index != null && (
              <div className="flex items-center justify-between gap-3 mt-0.5">
                <span className="text-gray-500">HI</span>
                <span className="font-semibold" style={{ color: handicapColor }}>{formatHI(hovered.handicap_index)}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
