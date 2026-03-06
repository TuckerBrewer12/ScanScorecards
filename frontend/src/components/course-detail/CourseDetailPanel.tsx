import { useEffect, useState } from "react";
import { ArrowLeft, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import type { Course, Tee } from "@/types/golf";

interface CourseDetailPanelProps {
  courseId: string;
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

export function CourseDetailPanel({ courseId, onBack }: CourseDetailPanelProps) {
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTeeColor, setSelectedTeeColor] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.getCourse(courseId).then((c) => {
      setCourse(c);
      const longest = c.tees.reduce<Tee | null>((best, t) => {
        const yards = t.total_yardage ?? Object.values(t.hole_yardages).reduce((s, y) => s + y, 0);
        const bestYards = best
          ? (best.total_yardage ?? Object.values(best.hole_yardages).reduce((s, y) => s + y, 0))
          : -1;
        return yards > bestYards ? t : best;
      }, null);
      setSelectedTeeColor(longest?.color ?? null);
      setLoading(false);
    });
  }, [courseId]);

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
    </div>
  );
}
