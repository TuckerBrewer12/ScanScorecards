import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { api } from "@/lib/api";
import { applyTheme, getStoredTheme, setStoredTheme } from "@/lib/theme";
import type { AppTheme } from "@/lib/theme";
import type { CourseSummary } from "@/types/golf";

const UPDATES_PREF_KEY = "settings_get_updates";
const COLORBLIND_PREF_KEY = "settings_colorblind_mode";
type ColorBlindMode = "none" | "protanopia" | "deuteranopia" | "tritanopia";
const COLORBLIND_MODES: Array<{ key: ColorBlindMode; label: string }> = [
  { key: "none", label: "No Filter" },
  { key: "protanopia", label: "Protanopia" },
  { key: "deuteranopia", label: "Deuteranopia" },
  { key: "tritanopia", label: "Tritanopia" },
];

function getStoredColorBlindMode(): ColorBlindMode {
  const value = localStorage.getItem(COLORBLIND_PREF_KEY);
  if (value === "protanopia" || value === "deuteranopia" || value === "tritanopia") {
    return value;
  }
  return "none";
}

export function SettingsPage({ userId }: { userId: string }) {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [homeCourseQuery, setHomeCourseQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<CourseSummary[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [homeCourseId, setHomeCourseId] = useState<string>("");
  const [handicapInput, setHandicapInput] = useState<string>("");
  const [friendCode, setFriendCode] = useState<string>("");
  const [getUpdates, setGetUpdates] = useState<boolean>(true);
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme());
  const [colorBlindMode, setColorBlindMode] = useState<ColorBlindMode>(() => getStoredColorBlindMode());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let isMounted = true;
    const savedUpdates = localStorage.getItem(UPDATES_PREF_KEY);
    if (savedUpdates !== null) {
      setGetUpdates(savedUpdates === "true");
    }

    (async () => {
      try {
        const [user, globalCoursesResult, userCoursesResult] = await Promise.all([
          api.getUser(userId),
          api.getCourses(undefined, 200, 0).catch(() => [] as CourseSummary[]),
          api.getCourses(userId, 200, 0).catch(() => [] as CourseSummary[]),
        ]);

        if (!isMounted) return;

        const merged = [...globalCoursesResult, ...userCoursesResult];
        const byId = new Map<string, CourseSummary>();
        for (const course of merged) {
          byId.set(course.id, course);
        }
        const allCourses = Array.from(byId.values());
        setCourses(allCourses);

        setHomeCourseId(user.home_course_id ?? "");
        setHandicapInput(user.handicap != null ? String(user.handicap) : "");
        setFriendCode(user.friend_code ?? "");

        if (user.home_course_id) {
          const selected = allCourses.find((course) => course.id === user.home_course_id);
          if (selected?.name) {
            setHomeCourseQuery(selected.name);
          } else {
            const courseFromId = await api.getCourse(user.home_course_id).catch(() => null);
            if (!isMounted) return;
            setHomeCourseQuery(courseFromId?.name ?? "");
          }
        } else {
          setHomeCourseQuery("");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

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

  const setThemePreference = (nextTheme: AppTheme) => {
    setTheme(nextTheme);
    setStoredTheme(nextTheme);
    applyTheme(nextTheme);
  };

  const setColorBlindPreference = (mode: ColorBlindMode) => {
    setColorBlindMode(mode);
    localStorage.setItem(COLORBLIND_PREF_KEY, mode);
  };

  const colorBlindIndex = COLORBLIND_MODES.findIndex((m) => m.key === colorBlindMode);
  const colorBlindDisplay = COLORBLIND_MODES[colorBlindIndex]?.label ?? "No Filter";

  const stepColorBlindMode = (direction: -1 | 1) => {
    const next = (colorBlindIndex + direction + COLORBLIND_MODES.length) % COLORBLIND_MODES.length;
    setColorBlindPreference(COLORBLIND_MODES[next].key);
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage("");
    try {
      let selectedHomeCourseId = homeCourseId;
      const normalizedQuery = homeCourseQuery.trim().toLowerCase();
      if (normalizedQuery !== "" && !selectedHomeCourseId) {
        const exact = courses.find((course) => (course.name ?? "").trim().toLowerCase() === normalizedQuery);
        if (exact) {
          selectedHomeCourseId = exact.id;
        } else {
          setMessage("Select a home course from the suggestions, or clear it.");
          setSaving(false);
          return;
        }
      }

      const trimmed = handicapInput.trim();
      let handicap: number | null | undefined = undefined;
      if (trimmed === "") {
        handicap = null;
      } else {
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < -10 || parsed > 54) {
          setMessage("Handicap must be a number between +10 and 54.");
          setSaving(false);
          return;
        }
        handicap = Math.round(parsed * 10) / 10;
      }

      await api.updateUser(userId, {
        home_course_id: selectedHomeCourseId || null,
        handicap,
      });
      const refreshedUser = await api.getUser(userId);

      setHomeCourseId(refreshedUser.home_course_id ?? "");
      setHandicapInput(refreshedUser.handicap != null ? String(refreshedUser.handicap) : "");
      setFriendCode(refreshedUser.friend_code ?? "");
      if (refreshedUser.home_course_id) {
        const selected = courses.find((course) => course.id === refreshedUser.home_course_id);
        setHomeCourseQuery(selected?.name ?? homeCourseQuery);
      } else {
        setHomeCourseQuery("");
      }
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
          <h2 className="text-sm font-semibold text-gray-700">Friend Code</h2>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={friendCode || "Unavailable"}
              readOnly
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50"
            />
            <button
              type="button"
              onClick={async () => {
                if (!friendCode) return;
                try {
                  await navigator.clipboard.writeText(friendCode);
                  setMessage("Friend code copied.");
                } catch {
                  setMessage("Could not copy friend code.");
                }
              }}
              className="rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Share this code so other users can send you a friend request.
          </p>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Preferences</h2>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
            <span className="text-sm text-gray-700">Theme</span>
            <div className="inline-flex items-center rounded-lg border border-gray-300 overflow-hidden">
              <button
                type="button"
                onClick={() => setThemePreference("light")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs ${
                  theme === "light" ? "bg-[#eef7f0] text-primary font-semibold" : "bg-white text-gray-600"
                }`}
              >
                <Sun size={14} />
                Light
              </button>
              <button
                type="button"
                onClick={() => setThemePreference("dark")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs ${
                  theme === "dark" ? "bg-[#eef7f0] text-primary font-semibold" : "bg-white text-gray-600"
                }`}
              >
                <Moon size={14} />
                Dark
              </button>
            </div>
          </label>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
            <span className="text-sm text-gray-700">Get updates</span>
            <input
              type="checkbox"
              checked={getUpdates}
              onChange={(event) => setGetUpdates(event.target.checked)}
              className="h-4 w-4"
            />
          </label>

          <div className="space-y-2">
            <div className="rounded-xl border border-gray-300 overflow-hidden">
              <div className="grid grid-cols-[1.4fr_auto_1fr_auto] items-stretch">
                <div className="px-3 py-2.5 text-xs font-bold tracking-wider uppercase text-gray-700 bg-gray-50 border-r border-gray-300">
                  Color Blind Mode
                </div>
                <button
                  type="button"
                  onClick={() => stepColorBlindMode(-1)}
                  aria-label="Previous color blind mode"
                  className="px-3 py-2.5 text-gray-600 bg-white border-r border-gray-300 hover:bg-gray-50"
                >
                  ‹
                </button>
                <div className="px-3 py-2.5 bg-white border-r border-gray-300">
                  <div className="text-sm font-semibold text-gray-900">{colorBlindDisplay}</div>
                  <div className="mt-1 flex gap-1">
                    {COLORBLIND_MODES.map((m, i) => (
                      <span
                        key={m.key}
                        className={`h-1.5 flex-1 rounded-sm ${
                          i === colorBlindIndex ? "bg-primary" : "bg-gray-300"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => stepColorBlindMode(1)}
                  aria-label="Next color blind mode"
                  className="px-3 py-2.5 text-gray-600 bg-white hover:bg-gray-50"
                >
                  ›
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Preview modes now; chart color remapping will be applied in the next step.
            </p>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Home Course</h2>
          <div className="relative">
            <input
              type="text"
              value={homeCourseQuery}
              onChange={(event) => {
                setHomeCourseQuery(event.target.value);
                setHomeCourseId("");
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
            Leave blank to clear handicap. Allowed range: +10 to 54.
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
