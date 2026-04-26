import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { formatCourseName } from "@/lib/courseName";
import { PageHeader } from "@/components/layout/PageHeader";
import { CourseDetailPanel } from "@/components/course-detail/CourseDetailPanel";
import { ScrollSection } from "@/components/analytics/ScrollSection";
import { GooeyInput } from "@/components/ui/gooey-input";

const cardVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const, delay: i * 0.05 },
  }),
};

function isApiTestCourse(name: string | null | undefined): boolean {
  if (!name) return false;
  const normalized = name.trim().toLowerCase();
  return normalized === "api test course" || normalized.startsWith("api test course ");
}

export function CoursesPage({ userId }: { userId: string }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); }, []);

  const { data: courses = [], isLoading: loading } = useQuery({
    queryKey: ["courses", userId, debouncedSearch],
    queryFn: () => debouncedSearch
      ? api.searchCourses(debouncedSearch, userId)
      : api.getCourses(userId),
  });
  const visibleCourses = courses.filter((c) => !isApiTestCourse(c.name));

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(value), 300);
  }, []);

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
        subtitle={`${visibleCourses.length} courses`}
        scrollThreshold={100}
      />

      <ScrollSection>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-5">Courses</h1>
        {/* Search */}
        <div className="mb-6">
          <GooeyInput
            placeholder="Search courses..."
            value={search}
            onValueChange={handleSearchChange}
            collapsedWidth={200}
            expandedWidth={280}
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-gray-400 text-sm">Loading courses...</div>
          </div>
        ) : visibleCourses.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-gray-400 text-sm">No courses found.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleCourses.map((c, i) => {
              const displayName = formatCourseName(c.name);
              return (
                <motion.div
                  key={c.id}
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover={{ y: -3, boxShadow: "0 12px 36px rgba(0,0,0,0.10)" }}
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedCourseId(c.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedCourseId(c.id); } }}
                  aria-label={`View ${displayName} details`}
                  className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 p-5 shadow-sm cursor-pointer hover:border-primary/30 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <h3 className="font-semibold text-gray-900 mb-1 truncate">
                    {displayName}
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
              );
            })}
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
