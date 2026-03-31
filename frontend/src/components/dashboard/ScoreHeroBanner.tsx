import { useMemo } from "react";
import { motion } from "framer-motion";
import { scaleLinear } from "d3-scale";
import { line, area, curveMonotoneX } from "d3-shape";
import { TrendingDown, TrendingUp } from "lucide-react";

interface ScorePoint {
  round_index: number;
  total_score: number | null;
  to_par: number | null;
  course_name?: string | null;
}

interface ScoreHeroBannerProps {
  scoreTrend: ScorePoint[];
  scoringAverage: number | null;
  totalRounds?: number;
  bestScore?: number | null;
}

const W = 700;
const H = 180;
const PAD = { top: 52, right: 24, bottom: 32, left: 16 };

export function ScoreHeroBanner({
  scoreTrend,
  scoringAverage,
  totalRounds,
  bestScore,
}: ScoreHeroBannerProps) {
  const validPoints = useMemo(
    () => scoreTrend.filter((p) => p.total_score != null),
    [scoreTrend],
  );

  const chartData = useMemo(() => {
    if (validPoints.length < 3) return null;

    const scores = validPoints.map((p) => p.total_score!);
    const scoreMin = Math.min(...scores);
    const scoreMax = Math.max(...scores);
    const margin = Math.max(2, (scoreMax - scoreMin) * 0.15);

    const xSc = scaleLinear()
      .domain([0, validPoints.length - 1])
      .range([PAD.left, W - PAD.right]);

    // Normal: lower score at bottom, higher score at top
    const ySc = scaleLinear()
      .domain([scoreMin - margin, scoreMax + margin])
      .range([H - PAD.bottom, PAD.top]);

    const lineFn = line<ScorePoint>()
      .x((_, i) => xSc(i))
      .y((d) => ySc(d.total_score!))
      .curve(curveMonotoneX);

    const areaFn = area<ScorePoint>()
      .x((_, i) => xSc(i))
      .y0(H - PAD.bottom)
      .y1((d) => ySc(d.total_score!))
      .curve(curveMonotoneX);

    const pathD = lineFn(validPoints) ?? "";
    const areaD = areaFn(validPoints) ?? "";

    const bestIdx = scores.indexOf(scoreMin);
    const lastIdx = validPoints.length - 1;

    const milestones: {
      x: number; y: number; val: number;
      label: string; anchor: "start" | "middle" | "end";
      color: string; size: number;
    }[] = [];

    // Round 1
    milestones.push({
      x: xSc(0), y: ySc(validPoints[0].total_score!),
      val: validPoints[0].total_score!,
      label: "Round 1",
      anchor: "start", color: "#9ca3af", size: 4,
    });

    // Personal best (if not same as first or last)
    if (bestIdx !== 0 && bestIdx !== lastIdx) {
      milestones.push({
        x: xSc(bestIdx), y: ySc(scoreMin),
        val: scoreMin,
        label: `Best  ${scoreMin}`,
        anchor: "middle", color: "#059669", size: 5.5,
      });
    } else if (bestIdx === lastIdx) {
      // Personal best IS the current round — label it specially
      milestones.push({
        x: xSc(lastIdx), y: ySc(scoreMin),
        val: scoreMin,
        label: `Personal best`,
        anchor: "end", color: "#059669", size: 6,
      });
    }

    // Now (only add if not already labeled as personal best at last idx)
    const lastAlreadyLabeled = bestIdx === lastIdx;
    if (!lastAlreadyLabeled) {
      milestones.push({
        x: xSc(lastIdx), y: ySc(validPoints[lastIdx].total_score!),
        val: validPoints[lastIdx].total_score!,
        label: "Now",
        anchor: "end", color: "#2d7a3a", size: 4,
      });
    }

    const dots = validPoints.map((p, i) => ({
      cx: xSc(i),
      cy: ySc(p.total_score!),
    }));

    return { pathD, areaD, milestones, dots };
  }, [validPoints]);

  // Trend: compare first half avg vs second half avg
  const trendDiff = useMemo(() => {
    if (validPoints.length < 6) return null;
    const half = Math.floor(validPoints.length / 2);
    const firstHalf = validPoints.slice(0, half).map((p) => p.total_score!);
    const secondHalf = validPoints.slice(-half).map((p) => p.total_score!);
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    return firstAvg - secondAvg; // positive = improved (scores went down)
  }, [validPoints]);

  const trendDir =
    trendDiff == null ? null
    : trendDiff > 0.5 ? "down"   // improving
    : trendDiff < -0.5 ? "up"    // getting worse
    : "flat";

  return (
    <div
      className="-mx-6 mb-6 relative overflow-hidden border-b border-gray-100"
      style={{ background: "linear-gradient(160deg, #f8faf8 0%, #f0f7f1 50%, #f8faf8 100%)" }}
    >
      <div className="relative flex items-stretch gap-0 px-8 pt-8 pb-0">

        {/* ── Left: dominant scoring average + secondary stats ── */}
        <div className="flex-shrink-0 flex flex-col justify-between pb-8" style={{ width: 220 }}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gray-400 mb-1">
              Scoring Average
            </p>

            <motion.div
              className="font-black leading-none tracking-tighter"
              style={{ fontSize: 96, color: "#2d7a3a" }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              {scoringAverage != null ? scoringAverage.toFixed(1) : "—"}
            </motion.div>

            {trendDir && trendDir !== "flat" && trendDiff != null && (
              <motion.div
                className={`flex items-center gap-1.5 mt-2 text-[11px] font-semibold ${
                  trendDir === "down" ? "text-emerald-600" : "text-red-500"
                }`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                {trendDir === "down" ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                {Math.abs(trendDiff).toFixed(1)} strokes{" "}
                {trendDir === "down" ? "improved" : "higher"}
              </motion.div>
            )}
          </div>

          <div className="flex gap-5 pt-4 border-t border-gray-200/60">
            {totalRounds != null && (
              <div>
                <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-0.5">Rounds</p>
                <p className="text-lg font-bold text-gray-800 leading-none">{totalRounds}</p>
              </div>
            )}
            {bestScore != null && (
              <div>
                <p className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-0.5">Best</p>
                <p className="text-lg font-bold text-gray-800 leading-none">{bestScore}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: SVG score trend ── */}
        <div className="flex-1 min-w-0 self-end">
          {chartData ? (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width="100%"
              height={H}
              style={{ overflow: "visible", display: "block" }}
            >
              <defs>
                <linearGradient id="score_hero_area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2d7a3a" stopOpacity="0.10" />
                  <stop offset="100%" stopColor="#2d7a3a" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              <motion.path
                d={chartData.areaD}
                fill="url(#score_hero_area)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.2, delay: 0.3 }}
              />

              <motion.path
                d={chartData.pathD}
                fill="none"
                stroke="#2d7a3a"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={0.7}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.8, ease: "easeInOut" }}
              />

              {/* Per-round dots */}
              {chartData.dots.map((d, i) => (
                <motion.circle
                  key={`dot-${i}`}
                  cx={d.cx}
                  cy={d.cy}
                  r={3}
                  fill="white"
                  stroke="#2d7a3a"
                  strokeWidth={1.5}
                  strokeOpacity={0.55}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 1.0 + i * 0.03, duration: 0.2 }}
                />
              ))}

              {/* Milestone markers */}
              {chartData.milestones.map((m, i) => (
                <g key={i}>
                  <motion.line
                    x1={m.x} y1={m.y - 7}
                    x2={m.x} y2={m.y - 22}
                    stroke={m.color}
                    strokeWidth={1.5}
                    strokeOpacity={0.45}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.5 + i * 0.15 }}
                  />
                  <motion.circle
                    cx={m.x} cy={m.y}
                    r={m.size}
                    fill={m.color === "#059669" ? "#059669" : "white"}
                    stroke={m.color}
                    strokeWidth={2}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 1.4 + i * 0.15, duration: 0.3, ease: "backOut" }}
                  />
                  <motion.text
                    x={m.x}
                    y={m.y - 26}
                    textAnchor={m.anchor}
                    fontSize={9}
                    fontWeight="600"
                    fill={m.color}
                    fillOpacity={0.85}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.7 + i * 0.15 }}
                  >
                    {m.label}
                  </motion.text>
                </g>
              ))}
            </svg>
          ) : (
            <div className="flex items-end justify-center h-full min-h-[120px] pb-8">
              <p className="text-gray-300 text-sm">Play more rounds to see your trend</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
