import { useEffect, useMemo, useState, type CSSProperties } from "react";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fmt = (v: any, name: any, props: any) => any;
import { ArrowLeft, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { scaleLinear } from "d3-scale";
import { line, area, curveMonotoneX } from "d3-shape";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { getStoredColorBlindMode } from "@/lib/accessibility";
import { getColorBlindPalette, type ChartPalette } from "@/lib/chartPalettes";
import type { Course, Tee } from "@/types/golf";
import type { CourseAnalyticsData } from "@/types/analytics";
import { ScrollSection } from "@/components/analytics/ScrollSection";

interface CourseDetailPanelProps {
  courseId: string;
  userId: string;
  onBack: () => void;
}

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 12,
  border: "1px solid #f1f5f9",
  boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
  background: "rgba(255,255,255,0.97)",
};

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="h-px w-8 bg-primary/30 rounded-full" />
      <span className="text-[11px] font-bold text-primary/50 uppercase tracking-[0.18em]">
        {children}
      </span>
    </div>
  );
}

const TEE_COLORS: Record<string, string> = {
  black: "bg-gray-900 text-white",
  blue: "bg-blue-600 text-white",
  white: "bg-gray-100 text-gray-800 border border-gray-300",
  gold: "bg-yellow-400 text-gray-900",
  yellow: "bg-yellow-300 text-gray-900",
  red: "bg-red-500 text-white",
  green: "bg-green-600 text-white",
  silver: "bg-gray-400 text-white",
};

function teeBadgeClass(color: string | null): string {
  if (!color) return "bg-gray-200 text-gray-700";
  return TEE_COLORS[color.toLowerCase()] ?? "bg-gray-200 text-gray-700";
}

function teeBadgeStyle(color: string | null, palette: ChartPalette | null): CSSProperties | undefined {
  if (!palette) return undefined;
  const c = color?.toLowerCase() ?? "";
  const mapped = c === "blue"
    ? palette.trend.primary
    : c === "green"
    ? palette.score.birdie
    : c === "red"
    ? palette.score.bogey
    : c === "yellow" || c === "gold"
    ? palette.ui.warning
    : c === "black"
    ? "#111827"
    : c === "silver"
    ? palette.ui.neutral
    : c === "white"
    ? "#e5e7eb"
    : palette.ui.neutral;
  return {
    backgroundColor: mapped,
    color: c === "white" || c === "yellow" || c === "gold" ? "#111827" : "#ffffff",
    border: c === "white" ? "1px solid #9ca3af" : "none",
  };
}

function sumYardages(tee: Tee, holes: number[]): number {
  return holes.reduce((sum, n) => sum + (tee.hole_yardages[n] ?? 0), 0);
}

function NineTable({
  course,
  holes,
  label,
  showTotal,
  selectedTee,
  personalParByHole,
}: {
  course: Course;
  holes: number[];
  label: string;
  showTotal?: boolean;
  selectedTee: Tee | null;
  personalParByHole?: Record<number, number>;
}) {
  const allHoles = Array.from({ length: 18 }, (_, i) => i + 1);

  const parRow = holes.map((n) => course.holes.find((h) => h.number === n)?.par ?? null);
  const hdcpRow = holes.map((n) => course.holes.find((h) => h.number === n)?.handicap ?? null);

  const outPar = parRow.every((p) => p != null)
    ? parRow.reduce((s, p) => s + p!, 0)
    : null;
  const totalPar = showTotal
    ? allHoles.every((n) => course.holes.find((h) => h.number === n)?.par != null)
      ? allHoles.reduce((s, n) => s + (course.holes.find((h) => h.number === n)?.par ?? 0), 0)
      : null
    : null;

  const nineYards = selectedTee ? sumYardages(selectedTee, holes) : null;
  const totalYards = selectedTee && showTotal ? sumYardages(selectedTee, allHoles) : null;

  // Personal par sums for OUT/IN/TOT cells
  const ninePersonalAvg = personalParByHole
    ? holes.reduce((s, n) => s + (personalParByHole[n] ?? 0), 0)
    : null;
  const totalPersonalAvg = personalParByHole && showTotal
    ? allHoles.reduce((s, n) => s + (personalParByHole[n] ?? 0), 0)
    : null;

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase">
          <th className="px-3 py-2 text-left w-24">Hole</th>
          {holes.map((n) => (
            <th key={n} className="px-2 py-2 text-center w-10">{n}</th>
          ))}
          <th className="px-2 py-2 text-center w-12 bg-gray-100">{label}</th>
          {showTotal && <th className="px-2 py-2 text-center w-14 bg-gray-200">TOT</th>}
        </tr>
      </thead>
      <tbody>
        {/* Yardage — only shown when a tee is selected */}
        {selectedTee && (
          <tr className="border-b border-gray-100 text-xs text-gray-500">
            <td className="px-3 py-1.5 font-medium">
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${teeBadgeClass(selectedTee.color)}`}>
                {selectedTee.color ?? "?"}
              </span>
            </td>
            {holes.map((n) => (
              <td key={n} className="px-2 py-1.5 text-center">
                {selectedTee.hole_yardages[n] ?? "-"}
              </td>
            ))}
            <td className="px-2 py-1.5 text-center bg-gray-50 font-semibold">
              {nineYards || "-"}
            </td>
            {showTotal && (
              <td className="px-2 py-1.5 text-center bg-gray-100 font-semibold">
                {totalYards || "-"}
              </td>
            )}
          </tr>
        )}

        {/* Par */}
        <tr className="border-b border-gray-200 font-semibold text-gray-700">
          <td className="px-3 py-2">Par</td>
          {parRow.map((p, i) => (
            <td key={holes[i]} className="px-2 py-2 text-center">{p ?? "-"}</td>
          ))}
          <td className="px-2 py-2 text-center bg-gray-50 font-bold">{outPar ?? "-"}</td>
          {showTotal && (
            <td className="px-2 py-2 text-center bg-gray-100 font-bold">{totalPar ?? "-"}</td>
          )}
        </tr>

        {/* Handicap */}
        <tr className={`border-b border-gray-100 text-xs text-gray-400 ${personalParByHole ? "" : ""}`}>
          <td className="px-3 py-1.5 font-medium">Hdcp</td>
          {hdcpRow.map((h, i) => (
            <td key={holes[i]} className="px-2 py-1.5 text-center">{h ?? "-"}</td>
          ))}
          <td className="px-2 py-1.5 bg-gray-50" />
          {showTotal && <td className="px-2 py-1.5 bg-gray-100" />}
        </tr>

        {/* My Avg — only shown when personalParByHole is provided */}
        {personalParByHole && (
          <tr className="border-b border-gray-100 text-xs font-semibold" style={{ color: "#2d7a3a" }}>
            <td className="px-3 py-1.5 font-medium">My Avg</td>
            {holes.map((n) => (
              <td key={n} className="px-2 py-1.5 text-center">
                {personalParByHole[n] != null ? personalParByHole[n].toFixed(1) : "-"}
              </td>
            ))}
            <td className="px-2 py-1.5 text-center bg-gray-50 font-bold">
              {ninePersonalAvg != null ? ninePersonalAvg.toFixed(1) : "-"}
            </td>
            {showTotal && (
              <td className="px-2 py-1.5 text-center bg-gray-100 font-bold">
                {totalPersonalAvg != null ? totalPersonalAvg.toFixed(1) : "-"}
              </td>
            )}
          </tr>
        )}
      </tbody>
    </table>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-gray-200/50">
      <div className="text-sm font-semibold text-gray-800 mb-4">{title}</div>
      {children}
    </div>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatToPar(toPar: number | null): string {
  if (toPar == null) return "-";
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

type TrendPoint = { round_index: number; total_score: number | null; to_par: number | null; date: string | null };

function getDotColor(toPar: number | null): string {
  if (toPar == null) return "#9ca3af";
  if (toPar <= -2) return "#f59e0b";
  if (toPar === -1) return "#059669";
  if (toPar === 0)  return "#9ca3af";
  return "#ef4444";
}

function CourseScoreTrendSVG({ data, strokeColor }: { data: TrendPoint[]; strokeColor: string }) {
  const [hovered, setHovered] = useState<TrendPoint | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const valid = data.filter(d => d.total_score != null);
  if (valid.length < 2) {
    return <div className="text-sm text-gray-400 text-center py-8">Not enough data</div>;
  }

  const W = 560; const H = 180;
  const PAD = { top: 16, right: 16, bottom: 28, left: 36 };
  const scores = valid.map(d => d.total_score!);
  const scoreMin = Math.min(...scores);
  const scoreMax = Math.max(...scores);

  const xSc = scaleLinear().domain([0, valid.length - 1]).range([PAD.left, W - PAD.right]);
  const ySc = scaleLinear().domain([scoreMin - 3, scoreMax + 3]).range([H - PAD.bottom, PAD.top]);

  const lineFn = line<TrendPoint>().x((_, i) => xSc(i)).y(d => ySc(d.total_score!)).curve(curveMonotoneX);
  const areaFn = area<TrendPoint>().x((_, i) => xSc(i)).y0(H - PAD.bottom).y1(d => ySc(d.total_score!)).curve(curveMonotoneX);

  const pathD = lineFn(valid) ?? "";
  const areaD = areaFn(valid) ?? "";
  const gridTicks = ySc.ticks(5);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (W / rect.width);
    const idx = Math.max(0, Math.min(valid.length - 1, Math.round(xSc.invert(svgX))));
    setHovered(valid[idx]);
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div className="relative select-none">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setHovered(null)}>
        <defs>
          <linearGradient id="course_svg_area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={strokeColor} stopOpacity={0.12} />
            <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
          </linearGradient>
        </defs>

        {gridTicks.map(v => (
          <line key={v} x1={PAD.left} x2={W - PAD.right} y1={ySc(v)} y2={ySc(v)} stroke="#f1f5f9" strokeWidth={1} />
        ))}
        {gridTicks.map(v => (
          <text key={`l${v}`} x={PAD.left - 6} y={ySc(v) + 4} textAnchor="end" fontSize={9} fill="#9ca3af">{v}</text>
        ))}

        <motion.path d={areaD} fill="url(#course_svg_area)"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2, delay: 0.2 }} />

        <motion.path d={pathD} fill="none" stroke={strokeColor} strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease: "easeInOut" }} />

        {valid.map((d, i) => (
          <motion.circle key={i} cx={xSc(i)} cy={ySc(d.total_score!)}
            r={hovered === d ? 6 : 4}
            fill={getDotColor(d.to_par)} stroke="white" strokeWidth={1.5}
            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.0 + i * 0.06, duration: 0.25, ease: "backOut" }} />
        ))}

        {hovered && hovered.total_score != null && (
          <line x1={xSc(valid.indexOf(hovered))} x2={xSc(valid.indexOf(hovered))}
            y1={PAD.top} y2={H - PAD.bottom} stroke="#e5e7eb" strokeWidth={1} strokeDasharray="3 3" />
        )}

        {valid.length <= 12 && valid.map((d, i) => d.date ? (
          <text key={`x${i}`} x={xSc(i)} y={H - PAD.bottom + 14} textAnchor="middle" fontSize={9} fill="#9ca3af">
            {d.date.slice(5, 10)}
          </text>
        ) : null)}
      </svg>

      <AnimatePresence>
        {hovered && hovered.total_score != null && (
          <motion.div key={hovered.round_index}
            className="absolute pointer-events-none z-10 bg-white/95 backdrop-blur-sm rounded-xl border border-gray-100 shadow-lg px-3 py-2.5 text-xs min-w-[120px]"
            style={{ left: tooltipPos.x + (tooltipPos.x > 380 ? -145 : 14), top: tooltipPos.y - 10 }}
            initial={{ opacity: 0, scale: 0.92, y: 4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 4 }} transition={{ duration: 0.15 }}>
            {hovered.date && (
              <div className="text-gray-400 text-[10px] mb-1">
                {new Date(hovered.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            )}
            <div className="font-bold text-gray-900 text-sm">{hovered.total_score}</div>
            {hovered.to_par != null && (
              <div className="text-xs mt-0.5 font-semibold" style={{ color: getDotColor(hovered.to_par) }}>
                {formatToPar(hovered.to_par)}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function CourseDetailPanel({ courseId, userId, onBack }: CourseDetailPanelProps) {
  const [course, setCourse] = useState<Course | null>(null);
  const [analytics, setAnalytics] = useState<CourseAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTeeColor, setSelectedTeeColor] = useState<string | null>(null);
  const [handicapIndex, setHandicapIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"course" | "performance">("course");
  const colorBlindMode = useMemo(() => getStoredColorBlindMode(), []);
  const colorBlindPalette = useMemo(() => getColorBlindPalette(colorBlindMode), [colorBlindMode]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    Promise.all([
      api.getCourse(courseId),
      api.getCourseAnalytics(userId, courseId),
      api.getUserHandicap(userId).catch(() => ({ handicap_index: null })),
    ])
      .then(([c, a, h]) => {
        if (!isMounted) return;
        setCourse(c);
        setAnalytics(a);
        setHandicapIndex(h.handicap_index);
        const longest = c.tees.reduce<Tee | null>((best, t) => {
          const yards = t.total_yardage ?? Object.values(t.hole_yardages).reduce((s, y) => s + y, 0);
          const bestYards = best
            ? (best.total_yardage ?? Object.values(best.hole_yardages).reduce((s, y) => s + y, 0))
            : -1;
          return yards > bestYards ? t : best;
        }, null);
        setSelectedTeeColor(longest?.color ?? null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [courseId, userId]);

  // Build personal par map from analytics
  const personalParByHole = useMemo<Record<number, number> | undefined>(() => {
    if (!analytics || analytics.rounds_played === 0) return undefined;
    const result: Record<number, number> = {};
    for (const row of analytics.average_score_relative_to_par_by_hole) {
      result[row.hole_number] = row.average_score;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }, [analytics]);

  // Score trend stats for hero row
  const scoreTrendScores = useMemo(() => {
    if (!analytics) return [];
    return analytics.score_trend_on_course.map((r) => r.total_score).filter((s): s is number => s != null);
  }, [analytics]);

  const scoringAvg = useMemo(() => {
    if (scoreTrendScores.length === 0) return null;
    return scoreTrendScores.reduce((s, v) => s + v, 0) / scoreTrendScores.length;
  }, [scoreTrendScores]);

  const bestRound = useMemo(() => (scoreTrendScores.length ? Math.min(...scoreTrendScores) : null), [scoreTrendScores]);
  const worstRound = useMemo(() => (scoreTrendScores.length ? Math.max(...scoreTrendScores) : null), [scoreTrendScores]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        Loading course...
      </div>
    );
  }

  if (!course) {
    return <div className="text-gray-500">Course not found.</div>;
  }

  const front = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const back = [10, 11, 12, 13, 14, 15, 16, 17, 18];

  const selectedTee = course.tees.find(
    (t) => t.color?.toLowerCase() === selectedTeeColor?.toLowerCase()
  ) ?? null;
  const scoreTrendStroke = colorBlindPalette?.trend.primary ?? "#2d7a3a";
  const gridLineColor = colorBlindPalette?.ui.grid ?? "#d1d5db";
  const successColor = colorBlindPalette?.ui.success ?? "#059669";
  const dangerColor = colorBlindPalette?.ui.danger ?? "#f87171";
  const girGradTop = colorBlindPalette?.trend.tertiary ?? "#4ade80";
  const girGradBottom = colorBlindPalette?.trend.primary ?? "#16a34a";
  const puttsGradTop = colorBlindPalette?.ui.mutedFill ?? "#d1d5db";
  const puttsGradBottom = colorBlindPalette?.ui.neutral ?? "#6b7280";
  const varianceGradTop = colorBlindPalette?.ui.warning ?? "#fcd34d";
  const varianceGradBottom = colorBlindPalette?.score.bogey ?? "#d97706";
  const coursePar = course.par;

  function courseHandicap(tee: Tee): number | null {
    if (handicapIndex == null || tee.slope_rating == null || tee.course_rating == null || coursePar == null) return null;
    return Math.round(handicapIndex * (tee.slope_rating / 113) + (tee.course_rating - coursePar));
  }

  const hasPerformance = analytics != null && analytics.rounds_played > 0;

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to courses
      </button>

      {/* Course header */}
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-900">{course.name ?? "Unknown Course"}</h2>
        {course.location && (
          <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
            <MapPin size={14} />
            {course.location}
          </div>
        )}
        <div className="flex gap-4 mt-2 text-sm text-gray-600">
          <span><span className="text-gray-400">Par</span> <span className="font-semibold">{course.par ?? "-"}</span></span>
          <span><span className="text-gray-400">Holes</span> <span className="font-semibold">{course.holes.length}</span></span>
          <span><span className="text-gray-400">Tees</span> <span className="font-semibold">{course.tees.length}</span></span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("course")}
          className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "course"
              ? "bg-primary text-white"
              : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
          }`}
        >
          Course
        </button>
        {hasPerformance && (
          <button
            onClick={() => setActiveTab("performance")}
            className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "performance"
                ? "bg-primary text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
          >
            My Performance
          </button>
        )}
      </div>

      {/* Course tab */}
      {activeTab === "course" && (
        <>
          {/* Tee selector */}
          {course.tees.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-5">
              {[...course.tees].sort((a, b) => {
                const yards = (t: Tee) => t.total_yardage ?? Object.values(t.hole_yardages).reduce((s, y) => s + y, 0);
                return yards(b) - yards(a);
              }).map((tee) => {
                const isSelected = tee.color?.toLowerCase() === selectedTeeColor?.toLowerCase();
                return (
                  <button
                    key={tee.color}
                    onClick={() => setSelectedTeeColor(isSelected ? null : (tee.color ?? null))}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-gray-600 border transition-all ${
                      isSelected
                        ? "bg-white border-primary shadow-md ring-2 ring-primary/30"
                        : "bg-white border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block w-3 h-3 rounded-full flex-shrink-0 ${teeBadgeClass(tee.color)}`}
                      style={teeBadgeStyle(tee.color, colorBlindPalette)}
                    />
                    <span className="font-semibold capitalize">{tee.color}</span>
                    {tee.course_rating != null && <span className="text-gray-400">Rating {tee.course_rating}</span>}
                    {tee.slope_rating != null && <span className="text-gray-400">/ Slope {tee.slope_rating}</span>}
                    {tee.total_yardage != null && <span className="text-gray-400">/ {tee.total_yardage} yds</span>}
                    {courseHandicap(tee) != null && (
                      <span className="ml-1 px-1.5 py-0.5 bg-primary/10 text-primary rounded font-semibold text-[10px]">
                        CH {courseHandicap(tee)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Scorecard */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            <div className="min-w-[700px]">
              <NineTable
                course={course}
                holes={front}
                label="OUT"
                selectedTee={selectedTee}
                personalParByHole={personalParByHole}
              />
              <div className="border-t-2 border-gray-300" />
              <NineTable
                course={course}
                holes={back}
                label="IN"
                showTotal
                selectedTee={selectedTee}
                personalParByHole={personalParByHole}
              />
            </div>
          </div>
        </>
      )}

      {/* My Performance tab */}
      {activeTab === "performance" && analytics && hasPerformance && (
        <ScrollSection>
          <div className="space-y-8">
            {/* A. Hero stat row */}
            <div className="flex flex-wrap gap-3">
              <div className="px-4 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm flex-1 min-w-[110px]">
                <div className="text-2xl font-bold text-gray-900">{analytics.rounds_played}</div>
                <div className="text-xs text-gray-500 mt-0.5">Rounds Played</div>
              </div>
              <div className="px-4 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm flex-1 min-w-[110px]">
                <div className="text-2xl font-bold text-gray-900">
                  {scoringAvg != null ? scoringAvg.toFixed(1) : "-"}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Scoring Avg</div>
              </div>
              <div className="px-4 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm flex-1 min-w-[110px]">
                <div className="text-2xl font-bold text-gray-900">
                  {bestRound ?? "-"}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Best Round</div>
              </div>
              <div className="px-4 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm flex-1 min-w-[110px]">
                <div className="text-2xl font-bold text-gray-900">
                  {worstRound ?? "-"}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Worst Round</div>
              </div>
            </div>

            {/* B. Score trend chart */}
            <div>
              <SectionLabel>Score Trend</SectionLabel>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <CourseScoreTrendSVG data={analytics.score_trend_on_course} strokeColor={scoreTrendStroke} />
              </div>
            </div>

            {/* D. Round history list */}
            <div>
              <SectionLabel>Round History</SectionLabel>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {[...analytics.score_trend_on_course]
                    .slice()
                    .reverse()
                    .map((row, i) => {
                      const inner = (
                        <div className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                          <span className="text-sm text-gray-500">{formatDate(row.date)}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-gray-900">{row.total_score ?? "-"}</span>
                            <span
                              className="text-xs font-semibold px-1.5 py-0.5 rounded"
                              style={{
                                color: row.to_par == null ? "#9ca3af" : row.to_par < 0 ? "#059669" : row.to_par === 0 ? "#6b7280" : "#ef4444",
                                background: row.to_par == null ? "#f3f4f6" : row.to_par < 0 ? "#ecfdf5" : row.to_par === 0 ? "#f3f4f6" : "#fef2f2",
                              }}
                            >
                              {formatToPar(row.to_par)}
                            </span>
                          </div>
                        </div>
                      );
                      return row.round_id ? (
                        <Link key={i} to={`/rounds/${row.round_id}`} className="block">
                          {inner}
                        </Link>
                      ) : (
                        <div key={i}>{inner}</div>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* E. Remaining charts grid */}
            <div>
              <SectionLabel>Hole-by-Hole Breakdown</SectionLabel>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <ChartCard title="Average Score To Par By Hole">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={analytics.average_score_relative_to_par_by_hole} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <XAxis dataKey="hole_number" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={((v: number) => [Number(v ?? 0).toFixed(2), "Avg to Par"]) as Fmt} />
                      <ReferenceLine y={0} stroke={gridLineColor} />
                      <Bar dataKey="average_to_par" radius={[6, 6, 0, 0]}>
                        {analytics.average_score_relative_to_par_by_hole.map((row) => (
                          <Cell key={row.hole_number} fill={row.average_to_par <= 0 ? successColor : dangerColor} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="GIR Percentage By Hole">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={analytics.gir_percentage_by_hole} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="girBarGradPerf" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={girGradTop} stopOpacity={1} />
                          <stop offset="100%" stopColor={girGradBottom} stopOpacity={1} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="hole_number" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={((v: number) => [`${Number(v ?? 0).toFixed(1)}%`, "GIR %"]) as Fmt} />
                      <Bar dataKey="gir_percentage" fill="url(#girBarGradPerf)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Average Putts By Hole">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={analytics.average_putts_by_hole} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="puttsBarGradPerf" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={puttsGradTop} stopOpacity={1} />
                          <stop offset="100%" stopColor={puttsGradBottom} stopOpacity={1} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="hole_number" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={((v: number) => [Number(v ?? 0).toFixed(2), "Avg putts"]) as Fmt} />
                      <Bar dataKey="average_putts" fill="url(#puttsBarGradPerf)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Score Type Distribution By Hole">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={analytics.score_type_distribution_by_hole} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <XAxis dataKey="hole_number" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        labelFormatter={(_label, payload) => payload?.[0]?.payload?.sample_size != null ? `${payload[0].payload.sample_size} rounds` : ""}
                        formatter={((v: number) => [`${Number(v ?? 0).toFixed(1)}%`, ""]) as Fmt}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="eagle" stackId="a" fill={colorBlindPalette?.score.eagle ?? "#b45309"} name="Eagle+" />
                      <Bar dataKey="birdie" stackId="a" fill={colorBlindPalette?.score.birdie ?? "#059669"} name="Birdie" />
                      <Bar dataKey="par" stackId="a" fill={colorBlindPalette?.score.par ?? "#9ca3af"} name="Par" />
                      <Bar dataKey="bogey" stackId="a" fill={colorBlindPalette?.score.bogey ?? "#f87171"} name="Bogey" />
                      <Bar dataKey="double_bogey" stackId="a" fill={colorBlindPalette?.score.double_bogey ?? "#60a5fa"} name="Double" />
                      <Bar dataKey="triple_bogey" stackId="a" fill={colorBlindPalette?.score.triple_bogey ?? "#a78bfa"} name="Triple" />
                      <Bar dataKey="quad_bogey" stackId="a" fill={colorBlindPalette?.score.quad_bogey ?? "#6d28d9"} name="Quad+" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Course Difficulty Profile (Hardest To Easiest)">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={analytics.course_difficulty_profile_by_hole.map((row) => ({ ...row, label: `H${row.hole_number}` }))}
                      margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                    >
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={((v: number) => [Number(v ?? 0).toFixed(2), "Avg to Par"]) as Fmt} />
                      <ReferenceLine y={0} stroke={gridLineColor} />
                      <Bar dataKey="average_to_par" radius={[6, 6, 0, 0]}>
                        {analytics.course_difficulty_profile_by_hole.map((row) => (
                          <Cell key={row.hole_number} fill={row.average_to_par <= 0 ? successColor : dangerColor} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Score Variance By Hole (Std Dev)">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={analytics.score_variance_by_hole.map((row) => ({ ...row, label: `H${row.hole_number}` }))}
                      margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="varianceBarGradPerf" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={varianceGradTop} stopOpacity={1} />
                          <stop offset="100%" stopColor={varianceGradBottom} stopOpacity={1} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={((v: number) => [Number(v ?? 0).toFixed(2), "Std dev"]) as Fmt} />
                      <Bar dataKey="score_std_dev" fill="url(#varianceBarGradPerf)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            </div>
          </div>
        </ScrollSection>
      )}
    </div>
  );
}
