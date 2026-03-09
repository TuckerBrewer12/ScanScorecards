import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { api } from "@/lib/api";
import type { CourseSummary } from "@/types/golf";

const UPDATES_PREF_KEY = "settings_get_updates";

export function SettingsPage({ userId }: { userId: string }) {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [homeCourseId, setHomeCourseId] = useState<string>("");
  const [getUpdates, setGetUpdates] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const savedUpdates = localStorage.getItem(UPDATES_PREF_KEY);
    if (savedUpdates !== null) {
      setGetUpdates(savedUpdates === "true");
    }

    Promise.all([api.getCourses(userId, 200, 0), api.getUser(userId)])
      .then(([courseRows, user]) => {
        setCourses(courseRows);
        setHomeCourseId(user.home_course_id ?? "");
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const saveSettings = async () => {
    setSaving(true);
    setMessage("");
    try {
      await api.updateUser(userId, { home_course_id: homeCourseId || null });
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
          <select
            value={homeCourseId}
            onChange={(event) => setHomeCourseId(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">No home course</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name ?? "Unnamed Course"}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            This controls home-course records in your achievements analytics.
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
