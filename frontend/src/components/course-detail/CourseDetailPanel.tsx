import { useEffect, useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fmt = (v: any, name: any, props: any) => any;
import { ArrowLeft, MapPin } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import type { Course, Tee } from "@/types/golf";
import type { CourseAnalyticsData } from "@/types/analytics";

interface CourseDetailPanelProps {
  courseId: string;
  userId: string;
  onBack: () => void;
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

function sumYardages(tee: Tee, holes: number[]): number {
  return holes.reduce((sum, n) => sum + (tee.hole_yardages[n] ?? 0), 0);
}

function NineTable({
  course,
  holes,
  label,
  showTotal,
  selectedTee,
}: {
  course: Course;
  holes: number[];
  label: string;
  showTotal?: boolean;
  selectedTee: Tee | null;
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
        <tr className="border-b border-gray-100 text-xs text-gray-400">
          <td className="px-3 py-1.5 font-medium">Hdcp</td>
          {hdcpRow.map((h, i) => (
            <td key={holes[i]} className="px-2 py-1.5 text-center">{h ?? "-"}</td>
          ))}
          <td className="px-2 py-1.5 bg-gray-50" />
          {showTotal && <td className="px-2 py-1.5 bg-gray-100" />}
        </tr>
      </tbody>
    </table>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="text-sm font-semibold text-gray-700 mb-4">{title}</div>
      {children}
    </div>
  );
}

export function CourseDetailPanel({ courseId, userId, onBack }: CourseDetailPanelProps) {
  const [course, setCourse] = useState<Course | null>(null);
  const [analytics, setAnalytics] = useState<CourseAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTeeColor, setSelectedTeeColor] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    Promise.all([api.getCourse(courseId), api.getCourseAnalytics(userId, courseId)])
      .then(([c, a]) => {
        if (!isMounted) return;
        setCourse(c);
        setAnalytics(a);
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
                <span className={`inline-block w-3 h-3 rounded-full flex-shrink-0 ${teeBadgeClass(tee.color)}`} />
                <span className="font-semibold capitalize">{tee.color}</span>
                {tee.course_rating != null && <span className="text-gray-400">Rating {tee.course_rating}</span>}
                {tee.slope_rating != null && <span className="text-gray-400">/ Slope {tee.slope_rating}</span>}
                {tee.total_yardage != null && <span className="text-gray-400">/ {tee.total_yardage} yds</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Scorecard */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <div className="min-w-[700px]">
          <NineTable course={course} holes={front} label="OUT" selectedTee={selectedTee} />
          <div className="border-t-2 border-gray-300" />
          <NineTable course={course} holes={back} label="IN" showTotal selectedTee={selectedTee} />
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Course Performance Analytics</h3>
        <div className="text-sm text-gray-500 mb-4">
          {analytics?.rounds_played ?? 0} round{(analytics?.rounds_played ?? 0) === 1 ? "" : "s"} played on this course
        </div>

        {!analytics || analytics.rounds_played === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 text-gray-500">
            No rounds on this course yet for analytics.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCard title="Score Trend On This Course">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={analytics.score_trend_on_course} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => (typeof v === "string" ? v.slice(5, 10) : "")}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="total_score" stroke="#0f172a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Average Score To Par By Hole">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={analytics.average_score_relative_to_par_by_hole} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="hole_number" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={((v: number) => [Number(v ?? 0).toFixed(2), "Avg to Par"]) as Fmt} />
                  <ReferenceLine y={0} stroke="#d1d5db" />
                  <Bar dataKey="average_to_par">
                    {analytics.average_score_relative_to_par_by_hole.map((row) => (
                      <Cell key={row.hole_number} fill={row.average_to_par <= 0 ? "#059669" : "#f87171"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="GIR Percentage By Hole">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={analytics.gir_percentage_by_hole} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="hole_number" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={((v: number) => [`${Number(v ?? 0).toFixed(1)}%`, "GIR %"]) as Fmt} />
                  <Bar dataKey="gir_percentage" fill="#16a34a" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Average Putts By Hole">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={analytics.average_putts_by_hole} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="hole_number" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={((v: number) => [Number(v ?? 0).toFixed(2), "Avg putts"]) as Fmt} />
                  <Bar dataKey="average_putts" fill="#6b7280" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Score Type Distribution By Hole">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={analytics.score_type_distribution_by_hole} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="hole_number" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <Tooltip
                    labelFormatter={(_label, payload) => payload?.[0]?.payload?.sample_size != null ? `${payload[0].payload.sample_size} rounds` : ""}
                    formatter={((v: number) => [`${Number(v ?? 0).toFixed(1)}%`, ""]) as Fmt}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="eagle" stackId="a" fill="#b45309" name="Eagle+" />
                  <Bar dataKey="birdie" stackId="a" fill="#059669" name="Birdie" />
                  <Bar dataKey="par" stackId="a" fill="#9ca3af" name="Par" />
                  <Bar dataKey="bogey" stackId="a" fill="#f87171" name="Bogey" />
                  <Bar dataKey="double_bogey" stackId="a" fill="#60a5fa" name="Double" />
                  <Bar dataKey="triple_bogey" stackId="a" fill="#a78bfa" name="Triple" />
                  <Bar dataKey="quad_bogey" stackId="a" fill="#6d28d9" name="Quad+" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Course Difficulty Profile (Hardest To Easiest)">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={analytics.course_difficulty_profile_by_hole.map((row) => ({ ...row, label: `H${row.hole_number}` }))}
                  margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={((v: number) => [Number(v ?? 0).toFixed(2), "Avg to Par"]) as Fmt} />
                  <ReferenceLine y={0} stroke="#d1d5db" />
                  <Bar dataKey="average_to_par">
                    {analytics.course_difficulty_profile_by_hole.map((row) => (
                      <Cell key={row.hole_number} fill={row.average_to_par <= 0 ? "#059669" : "#f87171"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Average Score When GIR Is Hit vs Missed">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={analytics.average_score_when_gir_vs_missed} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={((v: number) => [Number(v ?? 0).toFixed(2), "Avg score"]) as Fmt} />
                  <Bar dataKey="average_score">
                    <Cell fill="#16a34a" />
                    <Cell fill="#ef4444" />
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={((v: number) => [Number(v ?? 0).toFixed(2), "Std dev"]) as Fmt} />
                  <Bar dataKey="score_std_dev" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        )}
      </div>
    </div>
  );
}
