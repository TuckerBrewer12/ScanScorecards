import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { scaleLinear } from "d3-scale";
import { line, area, curveMonotoneX } from "d3-shape";
import type { HandicapTrendRow } from "@/types/analytics";

interface SVGHandicapTrendProps {
  data: HandicapTrendRow[];
  color: string;
  gridColor: string;
  height?: number;
}

const W = 720;
const PAD = { top: 20, right: 16, bottom: 28, left: 42 };

function formatHI(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v < 0) return `+${Math.abs(v).toFixed(1)}`;
  return v.toFixed(1);
}

function getDotColor(hi: number, prev: number | null): string {
  if (prev == null) return "#9ca3af";
  const delta = hi - prev;
  if (delta < -0.1) return "#059669"; // improved
  if (delta > 0.1) return "#ef4444";  // worsened
  return "#9ca3af";                   // flat
}

export function SVGHandicapTrend({ data, color, gridColor, height = 240 }: SVGHandicapTrendProps) {
  const H = height;
  const [hovered, setHovered] = useState<{ row: HandicapTrendRow; idx: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const valid = data.filter((d) => d.handicap_index != null);
  if (valid.length < 2) {
    return (
      <div className="flex items-center justify-center text-sm text-gray-400" style={{ height: H }}>
        Not enough data
      </div>
    );
  }

  const values = valid.map((d) => d.handicap_index!);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const pad = Math.max(1.5, (maxVal - minVal) * 0.3);

  const xScale = scaleLinear().domain([0, data.length - 1]).range([PAD.left, W - PAD.right]);
  // Lower HI = lower on chart (improving = line goes down)
  const yScale = scaleLinear()
    .domain([minVal - pad, maxVal + pad])
    .range([H - PAD.bottom, PAD.top]);

  const linePath = line<HandicapTrendRow>()
    .defined((d) => d.handicap_index != null)
    .x((_, i) => xScale(i))
    .y((d) => yScale(d.handicap_index!))
    .curve(curveMonotoneX);

  const areaPath = area<HandicapTrendRow>()
    .defined((d) => d.handicap_index != null)
    .x((_, i) => xScale(i))
    .y0(H - PAD.bottom)
    .y1((d) => yScale(d.handicap_index!))
    .curve(curveMonotoneX);

  const lineD = linePath(data) ?? "";
  const areaD = areaPath(data) ?? "";

  const gridTicks = yScale.ticks(5);

  // Best HI (lowest value = best) reference
  const bestHI = minVal;
  const bestY = yScale(bestHI);

  // Scratch (0) reference if it falls within the visible domain
  const showScratch = minVal - pad <= 0 && 0 <= maxVal + pad;

  // Net change: first valid → last valid
  const firstHI = valid[0].handicap_index!;
  const lastHI = valid[valid.length - 1].handicap_index!;
  const netChange = lastHI - firstHI;
  const isImproving = netChange < -0.1;
  const isWorsening = netChange > 0.1;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (W / rect.width);
    const idx = Math.round(xScale.invert(svgX));
    const clamped = Math.max(0, Math.min(data.length - 1, idx));
    setHovered({ row: data[clamped], idx: clamped });
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseLeave = () => setHovered(null);

  return (
    <div className="relative select-none">
      {/* Net change badge */}
      <div className="absolute top-0 right-0 flex items-center gap-1.5 z-10">
        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
          {data.length} rounds
        </span>
        {(isImproving || isWorsening) && (
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{
              background: isImproving ? "#dcfce7" : "#fee2e2",
              color: isImproving ? "#15803d" : "#dc2626",
            }}
          >
            {isImproving ? "▼" : "▲"} {Math.abs(netChange).toFixed(1)}
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ overflow: "visible" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id="hiTrendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.15} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridTicks.map((v) => (
          <line
            key={`g-${v}`}
            x1={PAD.left} x2={W - PAD.right}
            y1={yScale(v)} y2={yScale(v)}
            stroke={gridColor} strokeWidth={1}
          />
        ))}

        {/* Y-axis labels */}
        {gridTicks.map((v) => (
          <text
            key={`yl-${v}`}
            x={PAD.left - 8} y={yScale(v) + 4}
            textAnchor="end" fontSize={9} fill="#9ca3af"
          >
            {formatHI(v)}
          </text>
        ))}

        {/* Scratch (0) reference */}
        {showScratch && (
          <>
            <line
              x1={PAD.left} x2={W - PAD.right}
              y1={yScale(0)} y2={yScale(0)}
              stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 5"
            />
            <text x={W - PAD.right + 4} y={yScale(0) + 4} fontSize={9} fill="#9ca3af">
              Scratch
            </text>
          </>
        )}

        {/* Best HI reference — only if it's not also the scratch line */}
        {!(showScratch && Math.abs(bestHI) < 0.05) && (
          <>
            <line
              x1={PAD.left} x2={W - PAD.right}
              y1={bestY} y2={bestY}
              stroke="#059669" strokeWidth={1} strokeDasharray="3 4" strokeOpacity={0.5}
            />
            <text x={W - PAD.right + 4} y={bestY + 4} fontSize={9} fill="#059669" fillOpacity={0.7}>
              Best {formatHI(bestHI)}
            </text>
          </>
        )}

        {/* Area fill */}
        <motion.path
          d={areaD}
          fill="url(#hiTrendGrad)"
          stroke="none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        />

        {/* Main line */}
        <motion.path
          d={lineD}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease: "easeInOut" }}
        />

        {/* Dots */}
        {data.map((d, i) => {
          if (d.handicap_index == null) return null;
          const prev = data.slice(0, i).reverse().find((r) => r.handicap_index != null)?.handicap_index ?? null;
          const dotColor = getDotColor(d.handicap_index, prev);
          const isHov = hovered?.idx === i;
          return (
            <motion.circle
              key={i}
              cx={xScale(i)}
              cy={yScale(d.handicap_index)}
              r={isHov ? 6 : 3.5}
              fill={dotColor}
              stroke="white"
              strokeWidth={1.5}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1.2 + i * 0.012, duration: 0.25, ease: "backOut" }}
            />
          );
        })}

        {/* Crosshair */}
        {hovered && hovered.row.handicap_index != null && (
          <line
            x1={xScale(hovered.idx)} x2={xScale(hovered.idx)}
            y1={PAD.top} y2={H - PAD.bottom}
            stroke="#e5e7eb" strokeWidth={1} strokeDasharray="3 3"
          />
        )}

        {/* X-axis labels */}
        {data.map((d, i) => {
          const step = Math.max(1, Math.floor(data.length / 8));
          if (i % step !== 0 && i !== data.length - 1) return null;
          return (
            <text
              key={`xl-${i}`}
              x={xScale(i)} y={H - PAD.bottom + 14}
              textAnchor="middle" fontSize={9} fill="#9ca3af"
            >
              {d.round_index}
            </text>
          );
        })}
      </svg>

      {/* Tooltip */}
      <AnimatePresence>
        {hovered && hovered.row.handicap_index != null && (
          <motion.div
            key={hovered.idx}
            className="absolute pointer-events-none z-10 bg-white/95 backdrop-blur-sm rounded-xl border border-gray-100 shadow-lg px-3 py-2.5 text-xs min-w-[140px]"
            style={{
              left: tooltipPos.x + (tooltipPos.x > W * 0.72 ? -160 : 14),
              top: tooltipPos.y - 10,
            }}
            initial={{ opacity: 0, scale: 0.92, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 4 }}
            transition={{ duration: 0.15 }}
          >
            <div className="font-bold text-gray-900 text-sm mb-1.5">
              Round {hovered.row.round_index}
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-500">HI</span>
              <span className="font-bold text-gray-900 text-sm">{formatHI(hovered.row.handicap_index)}</span>
            </div>
            {(() => {
              const prev = data.slice(0, hovered.idx).reverse().find((r) => r.handicap_index != null)?.handicap_index ?? null;
              if (prev == null) return null;
              const delta = hovered.row.handicap_index - prev;
              const improved = delta < -0.05;
              const worsened = delta > 0.05;
              if (!improved && !worsened) return null;
              return (
                <div className="flex items-center justify-between gap-4 mt-0.5">
                  <span className="text-gray-500">Change</span>
                  <span
                    className="font-semibold"
                    style={{ color: improved ? "#059669" : "#ef4444" }}
                  >
                    {improved ? "▼" : "▲"} {Math.abs(delta).toFixed(1)}
                  </span>
                </div>
              );
            })()}
            <div className="flex items-center justify-between gap-4 mt-0.5">
              <span className="text-gray-500">Best ever</span>
              <span className="font-semibold text-emerald-600">{formatHI(bestHI)}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
