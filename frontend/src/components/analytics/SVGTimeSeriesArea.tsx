import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { scaleLinear } from "d3-scale";
import { line, area, curveMonotoneX } from "d3-shape";

interface SVGTimeSeriesAreaProps<T extends object> {
  data: T[];
  valueKey: keyof T;
  rollingAvgKey?: keyof T;
  secondaryValueKey?: keyof T;
  secondaryColor?: string;
  indexKey?: keyof T;
  unit?: string;
  color: string;
  gridColor: string;
  yDomain?: [number | "auto", number | "auto"];
  referenceLine?: { y: number; label: string };
  tooltipLabel?: string;
  secondaryTooltipLabel?: string;
  formatTooltipValue?: (v: number, row: T) => string;
  renderTooltipExtra?: (row: T) => React.ReactNode;
  height?: number;
  showDots?: boolean;
  gradientSuffix: string;
  dualTone?: boolean;
}

const W = 560;
const PAD = { top: 12, right: 12, bottom: 28, left: 36 };

export function SVGTimeSeriesArea<T extends object>({
  data,
  valueKey,
  rollingAvgKey,
  secondaryValueKey,
  secondaryColor = "#a855f7",
  indexKey,
  unit = "",
  color,
  gridColor,
  yDomain,
  referenceLine,
  tooltipLabel,
  secondaryTooltipLabel,
  formatTooltipValue,
  renderTooltipExtra,
  height = 200,
  showDots = false,
  gradientSuffix,
  dualTone = false,
}: SVGTimeSeriesAreaProps<T>) {
  const H = height;
  const [hovered, setHovered] = useState<{ row: T; idx: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-sm text-gray-400" style={{ height: H }}>
        Not enough data
      </div>
    );
  }

  const getValue = (row: T): number | null => {
    const v = row[valueKey];
    return typeof v === "number" ? v : null;
  };

  const getRollingAvg = (row: T): number | null => {
    if (!rollingAvgKey) return null;
    const v = row[rollingAvgKey];
    return typeof v === "number" ? v : null;
  };

  const getSecondary = (row: T): number | null => {
    if (!secondaryValueKey) return null;
    const v = row[secondaryValueKey];
    return typeof v === "number" ? v : null;
  };

  const getIndex = (row: T): number | string => {
    if (!indexKey) return 0;
    const v = row[indexKey];
    return typeof v === "number" || typeof v === "string" ? v : 0;
  };

  const validValues = data.map(getValue).filter((v): v is number => v != null);

  if (validValues.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-gray-400" style={{ height: H }}>
        No data
      </div>
    );
  }

  const xScale = scaleLinear()
    .domain([0, data.length - 1])
    .range([PAD.left, W - PAD.right]);

  const minVal = validValues.reduce((a, b) => Math.min(a, b));
  const maxVal = validValues.reduce((a, b) => Math.max(a, b));

  const yMin = yDomain?.[0] === "auto" || yDomain?.[0] == null ? minVal * 0.95 : yDomain[0];
  const yMax = yDomain?.[1] === "auto" || yDomain?.[1] == null ? maxVal * 1.05 : yDomain[1];

  // Ensure reference line is visible in domain
  const domainMin = referenceLine ? Math.min(yMin as number, referenceLine.y - 1) : (yMin as number);
  const domainMax = referenceLine ? Math.max(yMax as number, referenceLine.y + 1) : (yMax as number);

  const yScale = scaleLinear()
    .domain([domainMax, domainMin])
    .range([PAD.top, H - PAD.bottom]);

  const primaryLine = line<T>()
    .defined((d) => getValue(d) != null)
    .x((_, i) => xScale(i))
    .y((d) => yScale(getValue(d)!))
    .curve(curveMonotoneX);

  const primaryArea = area<T>()
    .defined((d) => getValue(d) != null)
    .x((_, i) => xScale(i))
    .y0(H - PAD.bottom)
    .y1((d) => yScale(getValue(d)!))
    .curve(curveMonotoneX);

  const rollingLine = rollingAvgKey
    ? line<T>()
        .defined((d) => getRollingAvg(d) != null)
        .x((_, i) => xScale(i))
        .y((d) => yScale(getRollingAvg(d)!))
        .curve(curveMonotoneX)
    : null;

  const secondaryLine = secondaryValueKey
    ? line<T>()
        .defined((d) => getSecondary(d) != null)
        .x((_, i) => xScale(i))
        .y((d) => yScale(getSecondary(d)!))
        .curve(curveMonotoneX)
    : null;

  const primaryPathD = primaryLine(data) ?? "";
  const primaryAreaD = primaryArea(data) ?? "";
  const rollingPathD = rollingLine ? (rollingLine(data) ?? "") : "";
  const secondaryPathD = secondaryLine ? (secondaryLine(data) ?? "") : "";

  const gridTicks = yScale.ticks(5);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (W / rect.width);
    const idx = Math.round(xScale.invert(svgX));
    const clamped = Math.max(0, Math.min(data.length - 1, idx));
    setHovered({ row: data[clamped], idx: clamped });
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseLeave = () => setHovered(null);

  const gradientId = `areaGrad_${gradientSuffix}`;
  const primaryOpacity = rollingAvgKey ? 0.5 : 1.0;

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
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="13%" stopColor={color} stopOpacity={0.13} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
          {dualTone && referenceLine && (() => {
            const refY = Math.max(PAD.top, Math.min(H - PAD.bottom, yScale(referenceLine.y)));
            const innerW = W - PAD.left - PAD.right;
            return (
              <>
                <linearGradient id={`grad-good-${gradientSuffix}`} x1="0" y1={refY} x2="0" y2={H - PAD.bottom} gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#059669" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id={`grad-warn-${gradientSuffix}`} x1="0" y1={PAD.top} x2="0" y2={refY} gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.02} />
                </linearGradient>
                <clipPath id={`clip-above-${gradientSuffix}`}>
                  <rect x={PAD.left} y={PAD.top} width={innerW} height={Math.max(0, refY - PAD.top)} />
                </clipPath>
                <clipPath id={`clip-below-${gradientSuffix}`}>
                  <rect x={PAD.left} y={refY} width={innerW} height={Math.max(0, H - PAD.bottom - refY)} />
                </clipPath>
              </>
            );
          })()}
        </defs>

        {/* Grid lines */}
        {gridTicks.map((v) => (
          <line
            key={`grid-${v}`}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={yScale(v)}
            y2={yScale(v)}
            stroke={gridColor}
            strokeWidth={1}
          />
        ))}

        {/* Reference line */}
        {referenceLine && (
          <>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yScale(referenceLine.y)}
              y2={yScale(referenceLine.y)}
              stroke="#e5e7eb"
              strokeWidth={1}
              strokeDasharray="4 5"
            />
            <text
              x={W - PAD.right + 4}
              y={yScale(referenceLine.y) + 4}
              fontSize={9}
              fill="#9ca3af"
            >
              {referenceLine.label}
            </text>
          </>
        )}

        {/* Area fill */}
        {dualTone && referenceLine ? (
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.0, ease: "easeInOut" }}
          >
            <path d={primaryAreaD} fill={`url(#grad-warn-${gradientSuffix})`} clipPath={`url(#clip-above-${gradientSuffix})`} stroke="none" />
            <path d={primaryAreaD} fill={`url(#grad-good-${gradientSuffix})`} clipPath={`url(#clip-below-${gradientSuffix})`} stroke="none" />
          </motion.g>
        ) : (
          <motion.path
            d={primaryAreaD}
            fill={`url(#${gradientId})`}
            stroke="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.0, ease: "easeInOut" }}
          />
        )}

        {/* Primary raw line */}
        <motion.path
          d={primaryPathD}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeOpacity={primaryOpacity}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: primaryOpacity }}
          transition={{ duration: 1.2, delay: 0.1, ease: "easeInOut" }}
        />

        {/* Rolling avg line */}
        {rollingLine && rollingPathD && (
          <motion.path
            d={rollingPathD}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.2, delay: 0.2, ease: "easeInOut" }}
          />
        )}

        {/* Secondary line */}
        {secondaryLine && secondaryPathD && (
          <motion.path
            d={secondaryPathD}
            fill="none"
            stroke={secondaryColor}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.2, delay: 0.15, ease: "easeInOut" }}
          />
        )}

        {/* Dots */}
        {showDots && data.map((row, i) => {
          const v = getValue(row);
          if (v == null) return null;
          const isHovered = hovered?.idx === i;
          return (
            <motion.circle
              key={`dot-${i}`}
              cx={xScale(i)}
              cy={yScale(v)}
              r={isHovered ? 5 : 3}
              fill={color}
              stroke="white"
              strokeWidth={1.5}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1.0 + Math.min(i * 0.004, 1.0), duration: 0.5, ease: "easeOut" }}
            />
          );
        })}

        {/* X-axis labels */}
        {data.map((row, i) => {
          // Only show ~6 evenly spaced labels
          const step = Math.max(1, Math.floor(data.length / 6));
          if (i % step !== 0 && i !== data.length - 1) return null;
          return (
            <text
              key={`xl-${i}`}
              x={xScale(i)}
              y={H - PAD.bottom + 14}
              textAnchor="middle"
              fontSize={9}
              fill="#9ca3af"
            >
              {getIndex(row)}
            </text>
          );
        })}

        {/* Y-axis labels */}
        {gridTicks.map((v) => (
          <text
            key={`yl-${v}`}
            x={PAD.left - 6}
            y={yScale(v) + 4}
            textAnchor="end"
            fontSize={9}
            fill="#9ca3af"
          >
            {v}{unit}
          </text>
        ))}

        {/* Crosshair */}
        {hovered && getValue(hovered.row) != null && (
          <line
            x1={xScale(hovered.idx)}
            x2={xScale(hovered.idx)}
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
        {hovered && getValue(hovered.row) != null && (
          <motion.div
            key={hovered.idx}
            className="absolute pointer-events-none z-10 rounded-xl border shadow-xl px-3 py-2.5 text-xs min-w-[120px]"
            style={{
              left: tooltipPos.x + (tooltipPos.x > W * 0.65 ? -160 : 14),
              top: tooltipPos.y - 10,
              background: "rgba(15,20,18,0.92)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              borderColor: "rgba(255,255,255,0.08)",
            }}
            initial={{ opacity: 0, scale: 0.92, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 4 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
              <span className="font-semibold text-gray-300 text-[11px]">
                Round {getIndex(hovered.row)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">{tooltipLabel ?? String(valueKey)}</span>
              <span className="font-bold text-white">
                {formatTooltipValue
                  ? formatTooltipValue(getValue(hovered.row)!, hovered.row)
                  : `${getValue(hovered.row)}${unit}`}
              </span>
            </div>
            {rollingAvgKey && getRollingAvg(hovered.row) != null && (
              <div className="flex items-center justify-between gap-3 mt-0.5">
                <span className="text-gray-400">5-Round Avg</span>
                <span className="font-bold text-white">{getRollingAvg(hovered.row)}{unit}</span>
              </div>
            )}
            {secondaryValueKey && getSecondary(hovered.row) != null && (
              <div className="flex items-center justify-between gap-3 mt-0.5">
                <span style={{ color: secondaryColor }}>{secondaryTooltipLabel ?? String(secondaryValueKey)}</span>
                <span className="font-bold" style={{ color: secondaryColor }}>
                  {getSecondary(hovered.row)}{unit}
                </span>
              </div>
            )}
            {renderTooltipExtra?.(hovered.row)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
