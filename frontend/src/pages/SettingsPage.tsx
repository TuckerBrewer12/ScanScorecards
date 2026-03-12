import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { api } from "@/lib/api";
import type { CourseSummary } from "@/types/golf";

const UPDATES_PREF_KEY = "settings_get_updates";

export function SettingsPage({ userId }: { userId: string }) {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [homeCourseQuery, setHomeCourseQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<CourseSummary[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [homeCourseId, setHomeCourseId] = useState<string>("");
  const [handicapInput, setHandicapInput] = useState<string>("");
  const [getUpdates, setGetUpdates] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const savedUpdates = localStorage.getItem(UPDATES_PREF_KEY);
    if (savedUpdates !== null) {
      setGetUpdates(savedUpdates === "true");
    }

    Promise.all([
      api.getCourses(undefined, 200, 0),
      api.getCourses(userId, 200, 0),
      api.getUser(userId),
    ])
      .then(([globalCourses, userCourses, user]) => {
        const merged = [...globalCourses, ...userCourses];
        const byId = new Map<string, CourseSummary>();
        for (const course of merged) {
          byId.set(course.id, course);
        }
        const allCourses = Array.from(byId.values());
        setCourses(allCourses);
        setHomeCourseId(user.home_course_id ?? "");
        setHandicapInput(user.handicap != null ? String(user.handicap) : "");
        if (user.home_course_id) {
          const selected = allCourses.find((course) => course.id === user.home_course_id);
          if (selected) setHomeCourseQuery(selected.name ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    const q = homeCourseQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    const handle = window.setTimeout(() => {
      api.searchCourses(q, userId)
        .then((rows) => {
          setSearchResults(rows);
        })
        .catch(() => {
          setSearchResults([]);
        });
    }, 250);

    return () => window.clearTimeout(handle);
  }, [homeCourseQuery, userId]);

  const selectHomeCourse = (course: CourseSummary) => {
    setHomeCourseId(course.id);
    setHomeCourseQuery(course.name ?? "");
    setShowResults(false);
  };

  const clearHomeCourse = () => {
    setHomeCourseId("");
    setHomeCourseQuery("");
    setSearchResults([]);
    setShowResults(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage("");
    try {
      const trimmed = handicapInput.trim();
      let handicap: number | null | undefined = undefined;
      if (trimmed === "") {
        handicap = null;
      } else {
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < -10 || parsed > 54) {
          setMessage("Handicap must be a number between -10 and 54.");
          setSaving(false);
          return;
        }
        handicap = Math.round(parsed * 10) / 10;
      }

      await api.updateUser(userId, {
        home_course_id: homeCourseId || null,
        handicap,
      });
      localStorage.setItem(UPDATES_PREF_KEY, String(getUpdates));
      setMessage("Settings saved.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Failed to save settings.";
      setMessage(text);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading settings...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage account preferences" />
      <div className="max-w-3xl space-y-5">
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Preferences</h2>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
            <span className="text-sm text-gray-700">Get updates</span>
            <input
              type="checkbox"
              checked={getUpdates}
              onChange={(event) => setGetUpdates(event.target.checked)}
              className="h-4 w-4"
            />
          </label>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Home Course</h2>
          <div className="relative">
            <input
              type="text"
              value={homeCourseQuery}
              onChange={(event) => {
                setHomeCourseQuery(event.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              placeholder="Type course name..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            {showResults && searchResults.length > 0 ? (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-56 overflow-auto">
                {searchResults.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    onMouseDown={() => selectHomeCourse(course)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <div className="text-gray-900">{course.name ?? "Unnamed Course"}</div>
                    {course.location ? <div className="text-xs text-gray-500">{course.location}</div> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearHomeCourse}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              Set No Home Course
            </button>
            {homeCourseId ? (
              <span className="text-xs text-gray-600">
                Selected: {courses.find((course) => course.id === homeCourseId)?.name ?? homeCourseQuery}
              </span>
            ) : (
              <span className="text-xs text-gray-500">No home course selected.</span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            This controls home-course records in your achievements analytics.
          </p>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Handicap</h2>
          <label className="block text-sm text-gray-700" htmlFor="settings-handicap">
            Manual Handicap Index
          </label>
          <input
            id="settings-handicap"
            type="number"
            step="0.1"
            min={-10}
            max={54}
            value={handicapInput}
            onChange={(event) => setHandicapInput(event.target.value)}
            placeholder="e.g. 12.4"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-500">
            Leave blank to clear handicap. Allowed range: -10 to 54.
          </p>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={saveSettings}
            disabled={saving}
            className="rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
          {message ? <span className="text-sm text-gray-600">{message}</span> : null}
        </div>
      </div>
    </div>
  );
}
