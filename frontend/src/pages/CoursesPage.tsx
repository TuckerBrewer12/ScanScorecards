import { useEffect, useState, useCallback } from "react";
import { MapPin, Search } from "lucide-react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { CourseSummary } from "@/types/golf";
import { PageHeader } from "@/components/layout/PageHeader";
import { CourseDetailPanel } from "@/components/course-detail/CourseDetailPanel";
import { ScrollSection } from "@/components/analytics/ScrollSection";

const cardVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const, delay: i * 0.05 },
  }),
};

export function CoursesPage({ userId }: { userId: string }) {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    const data = search
      ? await api.searchCourses(search, userId)
      : await api.getCourses(userId);
    setCourses(data);
    setLoading(false);
  }, [search, userId]);

  useEffect(() => {
    const timer = setTimeout(loadCourses, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadCourses, search]);

  if (selectedCourseId) {
    return (
      <CourseDetailPanel
        courseId={selectedCourseId}
        userId={userId}
        onBack={() => setSelectedCourseId(null)}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Courses"
        subtitle={`${courses.length} courses`}
      />

      <ScrollSection>
        {/* Search */}
        <div className="mb-6 relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search courses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary shadow-sm"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-gray-400 text-sm">Loading courses...</div>
          </div>
        ) : courses.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-gray-400 text-sm">No courses found.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((c, i) => (
              <motion.div
                key={c.id}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                whileHover={{ y: -3, boxShadow: "0 12px 36px rgba(0,0,0,0.10)" }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                onClick={() => setSelectedCourseId(c.id)}
                className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 p-5 shadow-sm cursor-pointer hover:border-primary/30 transition-colors duration-150"
              >
                <h3 className="font-semibold text-gray-900 mb-1 truncate">
                  {c.name ?? "Unknown"}
                </h3>
                {c.location && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
                    <MapPin size={12} className="shrink-0" />
                    <span className="truncate">{c.location}</span>
                  </div>
                )}
                <div className="flex gap-4 mt-auto pt-1">
                  <Stat label="Par" value={c.par ?? "—"} />
                  <Stat label="Holes" value={c.total_holes} />
                  <Stat label="Tees" value={c.tee_count} />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </ScrollSection>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="text-xs">
      <span className="text-gray-400">{label} </span>
      <span className="font-semibold text-gray-700">{value ?? "—"}</span>
    </div>
  );
}
