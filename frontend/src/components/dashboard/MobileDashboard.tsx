import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { scaleLinear } from "d3-scale";
import { line, area, curveMonotoneX } from "d3-shape";
import { TrendingUp, TrendingDown, ChevronRight, X } from "lucide-react";
import type { DashboardData } from "@/types/golf";
import type { AnalyticsData, GoalReport } from "@/types/analytics";
import { formatCourseName } from "@/lib/courseName";
import { formatToPar } from "@/types/golf";
import { trendDelta } from "@/lib/stats";

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

interface ScoreDistItem {
  name: string;
  label: string;
  value: number;
  color: string;
}

export interface MobileDashboardProps {
  data: DashboardData;
  trends: AnalyticsData | null;
  user: { name?: string | null; scoring_goal?: number | null } | null;
  goalReport: GoalReport | null;
  dualData: DualTrendPoint[];
  recentMilestones: { type: string; label: string; date: string; course: string }[];
  last20ScoringAvg: number | null;
  girPct: number;
  recentDistribution: ScoreDistItem[];
  scramblingPct: number | null;
  upAndDownPct: number | null;
  putts: number;
  scoreLineColor: string;
  handicapLineColor: string;
  girColor: string;
  mutedFill: string;
}

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

// ─── Mini sparkline for header ────────────────────────────────────────────────
function MiniSparkline({ data }: { data: DualTrendPoint[] }) {
  const valid = data.filter((d) => d.total_score != null);
  if (valid.length < 3) return null;

  const W = 88;
  const H = 40;
  const PAD = 5;
  const scores = valid.map((d) => d.total_score!);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = Math.max(max - min, 1);
  const xs = valid.map((_, i) => PAD + (i / (valid.length - 1)) * (W - PAD * 2));
  const ys = scores.map((s) => H - PAD - ((s - min) / range) * (H - PAD * 2));
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(" ");

  // improving = most recent score lower than earliest in this window
  const improving = scores[scores.length - 1] <= scores[0];
  const trendColor = improving ? "#059669" : "#ef4444";

  return (
    <div className="flex flex-col items-end gap-1">
      <svg width={W} height={H} overflow="visible">
        <polyline
          points={pts}
          fill="none"
          stroke={trendColor}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.85}
        />
        {valid.map((_, i) => (
          <circle
            key={i}
            cx={xs[i]}
            cy={ys[i]}
            r={i === valid.length - 1 ? 3.5 : 2}
            fill={i === valid.length - 1 ? trendColor : "white"}
            stroke={trendColor}
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <div
        className="text-[10px] font-bold uppercase tracking-wide"
        style={{ color: trendColor }}
      >
        {improving ? "↓ trending down" : "↑ trending up"}
      </div>
    </div>
  );
}

// ─── Compact stat cell ────────────────────────────────────────────────────────
function StatCell({
  label,
  value,
  sub,
  onClick,
}: {
  label: string;
  value: string | number | null;
  sub?: string | null;
  onClick?: () => void;
}) {
  return (
    <div
      className={`bg-gray-50 rounded-xl px-3 py-2.5 ${onClick ? "cursor-pointer active:bg-gray-100 transition-colors" : ""}`}
      onClick={onClick}
    >
      <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">
        {label}
      </div>
      <div className="text-2xl font-bold tracking-tight text-gray-900 leading-none tabular-nums">
        {value ?? "—"}
      </div>
      {sub && (
        <div className="text-[10px] text-gray-400 mt-1 truncate leading-tight">{sub}</div>
      )}
    </div>
  );
}

// ─── Short game progress row ──────────────────────────────────────────────────
function ShortGameRow({
  label,
  value,
  delta,
}: {
  label: string;
  value: number | null;
  delta: number | null;
}) {
  if (value == null) return null;
  const significant = delta != null && Math.abs(delta) > 0.5;
  const DeltaIcon = significant ? (delta! > 0 ? TrendingUp : TrendingDown) : null;
  const deltaColor = significant
    ? delta! > 0
      ? "text-emerald-500"
      : "text-red-400"
    : "text-gray-300";

  return (
    <div className="flex items-center gap-3">
      <div className="text-sm text-gray-500 w-24 shrink-0">{label}</div>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-sm font-semibold text-gray-900 tabular-nums">
          {value.toFixed(0)}%
        </span>
        {DeltaIcon && <DeltaIcon size={11} className={deltaColor} />}
        {significant && (
          <span className={`text-[10px] font-semibold ${deltaColor}`}>
            {delta! > 0 ? "+" : ""}
            {delta!.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Interactive score / HCP trend chart ─────────────────────────────────────
function MobileScoreTrend({
  dualData,
  scoreColor,
  handicapColor,
}: {
  dualData: DualTrendPoint[];
  scoreColor: string;
  handicapColor: string;
}) {
  const [view, setView] = useState<"score" | "hcp">("score");
  const [selected, setSelected] = useState<{ point: DualTrendPoint; idx: number } | null>(null);

  const W = 320;
  const H = 210;
  const PAD = { top: 14, right: 14, bottom: 32, left: 44 };
  const color = view === "score" ? scoreColor : handicapColor;

  const valid = dualData.filter((d) =>
    view === "score" ? d.total_score != null : d.handicap_index != null,
  );

  if (valid.length < 2) {
    return (
      <div className="flex items-center justify-center text-sm text-gray-400 py-12">
        Not enough data yet
      </div>
    );
  }

  const xScale = scaleLinear()
    .domain([0, dualData.length - 1])
    .range([PAD.left, W - PAD.right]);

  const nums = valid.map((d) =>
    view === "score" ? d.total_score! : d.handicap_index!,
  );
  const minV = Math.min(...nums);
  const maxV = Math.max(...nums);
  const yScale = scaleLinear()
    .domain([minV - 5, maxV + 5])
    .range([H - PAD.bottom, PAD.top]);

  const getValue = (d: DualTrendPoint) =>
    view === "score" ? d.total_score : d.handicap_index;

  const lineFn = line<DualTrendPoint>()
    .defined((d) => getValue(d) != null)
    .x((_, i) => xScale(i))
    .y((d) => yScale(getValue(d)!))
    .curve(curveMonotoneX);

  const areaFn = area<DualTrendPoint>()
    .defined((d) => getValue(d) != null)
    .x((_, i) => xScale(i))
    .y0(H - PAD.bottom)
    .y1((d) => yScale(getValue(d)!))
    .curve(curveMonotoneX);

  const pathD = lineFn(dualData) ?? "";
  const areaD = areaFn(dualData) ?? "";
  const gradId = `mobileAreaGrad_${view}`;

  const yTicks = yScale.ticks(5);
  const step = Math.max(1, Math.floor((dualData.length - 1) / 4));
  const xTickIdxs = Array.from(
    { length: Math.ceil(dualData.length / step) },
    (_, i) => i * step,
  ).filter((i) => i < dualData.length);
  const barW = Math.max(4, Math.min(14, (W - PAD.left - PAD.right) / dualData.length - 2));
  const baseline = H - PAD.bottom;

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (W / rect.width);
    const idx = Math.max(
      0,
      Math.min(dualData.length - 1, Math.round(xScale.invert(svgX))),
    );
    const point = dualData[idx];
    if (point) setSelected({ point, idx });
  };

  const selValue = selected ? getValue(selected.point) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-gray-800">Score History</div>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {(["score", "hcp"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => { setView(v); setSelected(null); }}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${
                view === v ? "bg-white text-gray-800 shadow-sm" : "text-gray-400"
              }`}
            >
              {v === "score" ? "Score" : "HCP"}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selected && selValue != null && (
          <motion.div
            key={selected.idx}
            className="mb-3 px-3 py-2.5 bg-gray-50 rounded-xl text-xs flex items-start justify-between gap-2"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900">
                Round {selected.point.round_index}
              </div>
              {selected.point.course_name && (
                <div className="text-gray-400 truncate mt-0.5">
                  {selected.point.course_name}
                </div>
              )}
            </div>
            <div className="flex items-start gap-3 shrink-0">
              <div className="text-right">
                {view === "score" && (
                  <>
                    <div className="font-bold text-gray-900 text-sm tabular-nums">{selValue}</div>
                    {selected.point.to_par != null && (
                      <div className="text-[11px] font-semibold" style={{ color: getDotColor(selected.point.to_par) }}>
                        {selected.point.to_par > 0 ? `+${selected.point.to_par}` : selected.point.to_par}
                      </div>
                    )}
                  </>
                )}
                {view === "hcp" && (
                  <div className="font-bold text-sm tabular-nums" style={{ color }}>
                    {formatHI(selValue)}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-gray-300 hover:text-gray-500 mt-0.5"
                aria-label="Dismiss"
              >
                <X size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="select-none">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          overflow="visible"
          onPointerDown={handlePointerDown}
          style={{ touchAction: "pan-y", userSelect: "none" }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.12} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={yScale(v)} y2={yScale(v)} stroke="#d1d5db" strokeWidth={1} />
              <text x={PAD.left - 7} y={yScale(v) + 4} textAnchor="end" fontSize={11} fontWeight="bold" fill="#6b7280"
                paintOrder="stroke" stroke="white" strokeWidth={4} strokeLinejoin="round">
                {view === "hcp" ? formatHI(v) : v}
              </text>
            </g>
          ))}

          <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#d1d5db" strokeWidth={1} />

          {xTickIdxs.map((i) => (
            <text key={i} x={xScale(i)} y={H - PAD.bottom + 16} textAnchor="middle" fontSize={11} fontWeight="bold" fill="#6b7280">
              {i + 1}
            </text>
          ))}

          {/* Bars: baseline → data point (score view only) */}
          {view === "score" && dualData.map((d, i) => {
            if (d.total_score == null) return null;
            const barTop = yScale(d.total_score);
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

          {selected && (
            <line
              x1={xScale(selected.idx)} x2={xScale(selected.idx)}
              y1={PAD.top} y2={H - PAD.bottom}
              stroke="#e5e7eb" strokeWidth={1} strokeDasharray="3 3"
            />
          )}

          {/* Area fill */}
          <motion.path
            key={`area-${view}`}
            d={areaD}
            fill={`url(#${gradId})`}
            stroke="none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          />

          {/* Line */}
          <motion.path
            key={`line-${view}`}
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
          />

          {dualData.map((d, i) => {
            const val = getValue(d);
            if (val == null) return null;
            const cx = xScale(i);
            const cy = yScale(val);
            const isSel = selected?.idx === i;
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={18} fill="transparent" />
                <motion.circle
                  cx={cx} cy={cy}
                  r={isSel ? 5.5 : 3.5}
                  fill={view === "score" ? getDotColor(d.to_par) : color}
                  stroke="white"
                  strokeWidth={isSel ? 2 : 1.5}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.9 + Math.min(i * 0.04, 0.8), duration: 0.25, ease: "backOut" }}
                />
              </g>
            );
          })}

        </svg>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function MobileDashboard({
  data,
  trends,
  user,
  goalReport,
  dualData,
  last20ScoringAvg,
  scramblingPct,
  upAndDownPct,
  putts,
  scoreLineColor,
  handicapLineColor,
}: MobileDashboardProps) {
  const navigate = useNavigate();
  const firstName = user?.name?.split(" ")[0] ?? "Golfer";

  const scramblingDelta = trendDelta(trends?.scrambling_trend ?? [], (r) => r.scrambling_percentage);
  const upDownDelta = trendDelta(trends?.up_and_down_trend ?? [], (r) => r.percentage);

  const lastRound = data.recent_rounds[0] ?? null;
  const recentRounds = data.recent_rounds.slice(0, 3);
  const sparklineData = dualData.slice(-7);

  function roundAccentColor(toPar: number | null): string {
    if (toPar == null) return "bg-gray-200";
    if (toPar <= -1) return "bg-emerald-400";
    if (toPar >= 4) return "bg-red-300";
    if (toPar >= 2) return "bg-orange-300";
    return "bg-gray-200";
  }

  return (
    <div className="space-y-4">

      {/* ── Hero header ─────────────────────────────────────────────────────── */}
      <div
        className="-mx-4 px-4 pt-3 pb-7"
        style={{
          background: "linear-gradient(175deg, rgba(238,247,240,0.75) 0%, transparent 90%)",
        }}
      >
        {/* Top row */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              Welcome back
            </div>
            <div className="text-xl font-extrabold tracking-tight text-gray-900 leading-tight">
              Hello, {firstName}
            </div>
          </div>
          {data.handicap_index != null && (
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
                Handicap
              </span>
              <span className="text-2xl font-bold text-gray-900 tabular-nums leading-tight">
                {formatHI(data.handicap_index)}
              </span>
            </div>
          )}
        </div>

        {/* Scoring avg + sparkline */}
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-primary/60 mb-1.5">
              Scoring Avg · Last 20
            </div>
            <div className="text-6xl font-black tracking-tighter text-gray-900 leading-none tabular-nums">
              {last20ScoringAvg != null ? last20ScoringAvg.toFixed(1) : "—"}
            </div>
          </div>
          <MiniSparkline data={sparklineData} />
        </div>
      </div>

      {/* ── Your Game compact 2×2 ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-sm font-semibold text-gray-800">Your Game</div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
            All time
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatCell
            label="Last Round"
            value={lastRound?.total_score ?? null}
            sub={lastRound?.course_name ? formatCourseName(lastRound.course_name) : null}
            onClick={lastRound ? () => navigate(`/rounds/${lastRound.id}`) : undefined}
          />
          <StatCell label="Best Round" value={data.best_round ?? null} />
          <StatCell
            label="Total Rounds"
            value={data.total_rounds}
          />
          <StatCell
            label="Avg Putts"
            value={putts > 0 ? putts.toFixed(1) : null}
            sub="per round"
          />
        </div>
      </div>

      {/* ── Goal progress ──────────────────────────────────────────────────── */}
      {user?.scoring_goal && goalReport && (
        <button
          type="button"
          onClick={() => navigate("/the-lab")}
          className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 text-left active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-gray-800">Scoring Goal</div>
            <div className="flex items-center gap-0.5 text-xs font-semibold text-primary">
              Break {user.scoring_goal + 1}
              <ChevronRight size={13} />
            </div>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: goalReport.on_track
                  ? "#059669"
                  : "linear-gradient(90deg, #2d7a3a, #9ca3af)",
              }}
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min(100, Math.max(5,
                  goalReport.on_track ? 100
                  : goalReport.gap == null ? 5
                  : (1 - goalReport.gap / Math.max(goalReport.scoring_average ?? 1, 1)) * 100,
                ))}%`,
              }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-2">
            <span>Avg {goalReport.scoring_average?.toFixed(1)}</span>
            {goalReport.savers[0] && (
              <span className="text-primary font-semibold truncate ml-2 max-w-[180px]">
                {goalReport.savers[0].headline}
              </span>
            )}
          </div>
        </button>
      )}

      {/* ── Score trend ────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border border-gray-100 shadow-sm p-4"
        style={{ background: "linear-gradient(180deg, rgba(238,247,240,0.4) 0%, white 50%)" }}
      >
        <MobileScoreTrend
          dualData={dualData}
          scoreColor={scoreLineColor}
          handicapColor={handicapLineColor}
        />
      </div>

      {/* ── Short game ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <div className="text-sm font-semibold text-gray-800 mb-4">Short Game</div>
        <div className="space-y-4">
          <ShortGameRow label="Scrambling" value={scramblingPct} delta={scramblingDelta} />
          <ShortGameRow label="Up & Down" value={upAndDownPct} delta={upDownDelta} />
        </div>
      </div>

      {/* ── Recent Rounds ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="text-sm font-semibold text-gray-800">Recent Rounds</div>
          <Link
            to="/rounds"
            className="text-xs font-semibold text-primary flex items-center gap-0.5"
          >
            View all <ChevronRight size={12} />
          </Link>
        </div>
        <div className="divide-y divide-gray-50">
          {recentRounds.length === 0 && (
            <div className="px-5 py-4 text-sm text-gray-400">No rounds yet</div>
          )}
          {recentRounds.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => navigate(`/rounds/${r.id}`)}
              className="w-full flex items-center gap-3 px-5 py-3.5 text-left active:bg-gray-50 transition-colors"
            >
              {/* Accent bar */}
              <div className={`w-1 h-9 rounded-full shrink-0 ${roundAccentColor(r.to_par)}`} />
              {/* Score */}
              <div className="text-2xl font-black text-gray-900 tabular-nums w-10 shrink-0 leading-none">
                {r.total_score ?? "—"}
              </div>
              {/* Course + date */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-800 truncate leading-tight">
                  {r.course_name ? formatCourseName(r.course_name) : "Unknown course"}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {r.date
                    ? new Date(r.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </div>
              </div>
              {/* To par badge */}
              {r.to_par != null && (
                <div
                  className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${
                    r.to_par < 0
                      ? "bg-emerald-100 text-emerald-700"
                      : r.to_par > 0
                      ? "bg-red-100 text-red-600"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {formatToPar(r.to_par)}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
