import { useEffect, useState, useCallback } from "react";
import { MapPin } from "lucide-react";
import { api } from "@/lib/api";
import type { CourseSummary } from "@/types/golf";
import { PageHeader } from "@/components/layout/PageHeader";

export function CoursesPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadCourses = useCallback(async () => {
    setLoading(true);
    const data = search
      ? await api.searchCourses(search)
      : await api.getCourses();
    setCourses(data);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(loadCourses, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadCourses, search]);

  return (
    <div>
      <PageHeader
        title="Courses"
        subtitle={`${courses.length} courses`}
      />

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search courses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-400">Loading courses...</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <h3 className="font-semibold text-gray-900 mb-1">
                {c.name ?? "Unknown"}
              </h3>
              {c.location && (
                <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
                  <MapPin size={14} />
                  {c.location}
                </div>
              )}
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Par</span>{" "}
                  <span className="font-semibold text-gray-700">
                    {c.par ?? "-"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Holes</span>{" "}
                  <span className="font-semibold text-gray-700">
                    {c.total_holes}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Tees</span>{" "}
                  <span className="font-semibold text-gray-700">
                    {c.tee_count}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
