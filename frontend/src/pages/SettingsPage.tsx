import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Moon, Sun } from "lucide-react";
import { useBeforeUnload, useLocation } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { api } from "@/lib/api";
import { applyTheme, getStoredTheme, setStoredTheme } from "@/lib/theme";
import { getStoredColorBlindMode, setStoredColorBlindMode } from "@/lib/accessibility";
import type { AppTheme } from "@/lib/theme";
import type { ColorBlindMode } from "@/lib/accessibility";
import type { CourseSummary } from "@/types/golf";

const UPDATES_PREF_KEY = "settings_get_updates";
const COLORBLIND_MODES: Array<{ key: ColorBlindMode; label: string }> = [
  { key: "none", label: "No Filter" },
  { key: "protanopia", label: "Protanopia" },
  { key: "deuteranopia", label: "Deuteranopia" },
  { key: "tritanopia", label: "Tritanopia" },
];

export function SettingsPage({ userId }: { userId: string }) {
  const location = useLocation();
  const [homeCourseQuery, setHomeCourseQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<CourseSummary[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [homeCourseId, setHomeCourseId] = useState<string>("");
  const [handicapInput, setHandicapInput] = useState<string>("");
  const [friendCode, setFriendCode] = useState<string>("");
  const [getUpdates, setGetUpdates] = useState<boolean>(true);
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme());
  const [colorBlindMode, setColorBlindMode] = useState<ColorBlindMode>(() => getStoredColorBlindMode());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const initializedRef = useRef(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);
  const bypassGuardRef = useRef(false);
  const baselineRef = useRef<{
    homeCourseId: string;
    homeCourseQuery: string;
    handicapInput: string;
    getUpdates: boolean;
    theme: AppTheme;
    colorBlindMode: ColorBlindMode;
  } | null>(null);

  const { data: settingsData, isLoading: loading } = useQuery({
    queryKey: ["settings", userId],
    queryFn: async () => {
      const [user, globalCoursesResult, userCoursesResult] = await Promise.all([
        api.getUser(userId),
        api.getCourses(undefined, 200, 0).catch(() => [] as CourseSummary[]),
        api.getCourses(userId, 200, 0).catch(() => [] as CourseSummary[]),
      ]);
      const merged = [...globalCoursesResult, ...userCoursesResult];
      const byId = new Map<string, CourseSummary>();
      for (const course of merged) byId.set(course.id, course);
      const allCourses = Array.from(byId.values());
      let homeCourseQueryDefault = "";
      if (user.home_course_id) {
        const selected = allCourses.find((c) => c.id === user.home_course_id);
        if (selected?.name) {
          homeCourseQueryDefault = selected.name;
        } else {
          const courseFromId = await api.getCourse(user.home_course_id).catch(() => null);
          homeCourseQueryDefault = courseFromId?.name ?? "";
        }
      }
      return { user, allCourses, homeCourseQueryDefault };
    },
  });

  // Initialize form state once when data first loads
  useEffect(() => {
    if (!settingsData || initializedRef.current) return;
    initializedRef.current = true;
    const savedUpdates = localStorage.getItem(UPDATES_PREF_KEY);
    const updatesPref = savedUpdates !== null ? savedUpdates === "true" : true;
    const initialHomeCourseId = settingsData.user.home_course_id ?? "";
    const initialHandicap = settingsData.user.handicap != null ? String(settingsData.user.handicap) : "";
    const initialTheme = getStoredTheme();
    const initialColorBlind = getStoredColorBlindMode();
    setGetUpdates(updatesPref);
    setHomeCourseId(initialHomeCourseId);
    setHandicapInput(initialHandicap);
    setFriendCode(settingsData.user.friend_code ?? "");
    setHomeCourseQuery(settingsData.homeCourseQueryDefault);
    setTheme(initialTheme);
    setColorBlindMode(initialColorBlind);
    baselineRef.current = {
      homeCourseId: initialHomeCourseId,
      homeCourseQuery: settingsData.homeCourseQueryDefault,
      handicapInput: initialHandicap,
      getUpdates: updatesPref,
      theme: initialTheme,
      colorBlindMode: initialColorBlind,
    };
  }, [settingsData]);

  const hasUnsavedChanges = (() => {
    const baseline = baselineRef.current;
    if (!baseline) return false;
    return (
      baseline.homeCourseId !== homeCourseId ||
      baseline.homeCourseQuery !== homeCourseQuery ||
      baseline.handicapInput !== handicapInput ||
      baseline.getUpdates !== getUpdates ||
      baseline.theme !== theme ||
      baseline.colorBlindMode !== colorBlindMode
    );
  })();

  useBeforeUnload((event) => {
    if (!hasUnsavedChanges) return;
    event.preventDefault();
    event.returnValue = "";
  });

  // In-app navigation guard (works with BrowserRouter + NavLink)
  useEffect(() => {
    const onClickCapture = (event: MouseEvent) => {
      if (!hasUnsavedChanges || bypassGuardRef.current) return;
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as Element | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;

      let nextPath = "";
      try {
        const url = new URL(anchor.href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        nextPath = `${url.pathname}${url.search}${url.hash}`;
      } catch {
        return;
      }

      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      if (!nextPath || nextPath === currentPath) return;

      event.preventDefault();
      event.stopPropagation();
      setShowUnsavedModal(true);
    };

    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [hasUnsavedChanges, location.pathname, location.search, location.hash]);

  // Browser Back/Forward guard
  useEffect(() => {
    const onPopState = () => {
      if (!hasUnsavedChanges || bypassGuardRef.current) return;
      const nextPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      if (nextPath === currentPath) return;

      // Restore current URL immediately, then ask for confirmation.
      window.history.pushState(null, "", currentPath);
      setShowUnsavedModal(true);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [hasUnsavedChanges, location.pathname, location.search, location.hash]);

  const handleHomeCourseQueryChange = (value: string) => {
    setHomeCourseQuery(value);
    setHomeCourseId("");
    setShowResults(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = value.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(() => {
      api.searchCourses(q, userId).then(setSearchResults).catch(() => setSearchResults([]));
    }, 250);
  };

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
    applyTheme(nextTheme); // live preview without persisting until Save
  };

  const setColorBlindPreference = (mode: ColorBlindMode) => {
    setColorBlindMode(mode);
  };

  const colorBlindIndex = COLORBLIND_MODES.findIndex((m) => m.key === colorBlindMode);
  const colorBlindDisplay = COLORBLIND_MODES[colorBlindIndex]?.label ?? "No Filter";

  const stepColorBlindMode = (direction: -1 | 1) => {
    const next = (colorBlindIndex + direction + COLORBLIND_MODES.length) % COLORBLIND_MODES.length;
    setColorBlindPreference(COLORBLIND_MODES[next].key);
  };

  const persistSettings = async (): Promise<boolean> => {
    const courses = settingsData?.allCourses ?? [];
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
          return false;
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
          return false;
        }
        handicap = Math.round(parsed * 10) / 10;
      }

      await api.updateUser(userId, {
        home_course_id: selectedHomeCourseId || null,
        handicap,
      });
      setStoredTheme(theme);
      setStoredColorBlindMode(colorBlindMode);
      applyTheme(theme);
      const refreshedUser = await api.getUser(userId);

      setHomeCourseId(refreshedUser.home_course_id ?? "");
      setHandicapInput(refreshedUser.handicap != null ? String(refreshedUser.handicap) : "");
      setFriendCode(refreshedUser.friend_code ?? "");
      if (refreshedUser.home_course_id) {
        const selected = (settingsData?.allCourses ?? []).find((course) => course.id === refreshedUser.home_course_id);
        setHomeCourseQuery(selected?.name ?? homeCourseQuery);
      } else {
        setHomeCourseQuery("");
      }
      localStorage.setItem(UPDATES_PREF_KEY, String(getUpdates));
      baselineRef.current = {
        homeCourseId: refreshedUser.home_course_id ?? "",
        homeCourseQuery: refreshedUser.home_course_id
          ? ((settingsData?.allCourses ?? []).find((course) => course.id === refreshedUser.home_course_id)?.name ?? homeCourseQuery)
          : "",
        handicapInput: refreshedUser.handicap != null ? String(refreshedUser.handicap) : "",
        getUpdates,
        theme,
        colorBlindMode,
      };
      setMessage("Settings saved.");
      return true;
    } catch (error) {
      const text = error instanceof Error ? error.message : "Failed to save settings.";
      setMessage(text);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async () => {
    await persistSettings();
  };

  const resetToBaseline = () => {
    const baseline = baselineRef.current;
    if (!baseline) return;
    setHomeCourseId(baseline.homeCourseId);
    setHomeCourseQuery(baseline.homeCourseQuery);
    setHandicapInput(baseline.handicapInput);
    setGetUpdates(baseline.getUpdates);
    setTheme(baseline.theme);
    setColorBlindMode(baseline.colorBlindMode);
    applyTheme(baseline.theme);
    setSearchResults([]);
    setShowResults(false);
  };

  const handleConfirmAndSave = async () => {
    const ok = await persistSettings();
    if (ok) {
      setShowUnsavedModal(false);
    }
  };

  const handleDiscardAndLeave = () => {
    resetToBaseline();
    setShowUnsavedModal(false);
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
      <PageHeader title="Settings" subtitle="Manage account preferences" scrollThreshold={100} />
      <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-5">Settings</h1>
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
              onChange={(event) => handleHomeCourseQueryChange(event.target.value)}
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
                Selected: {(settingsData?.allCourses ?? []).find((course) => course.id === homeCourseId)?.name ?? homeCourseQuery}
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

      {showUnsavedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl p-5">
            <h3 className="text-base font-semibold text-gray-900">Unsaved changes detected</h3>
            <p className="mt-2 text-sm text-gray-600">
              There are unsaved changes made in Settings. Do you want to confirm these changes before leaving this page?
              If you choose not to confirm, your pending edits will be discarded.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleConfirmAndSave}
                disabled={saving}
                className="rounded-lg bg-gray-900 text-white px-3.5 py-2 text-sm font-medium disabled:opacity-60"
              >
                {saving ? "Saving..." : "Yes, confirm changes"}
              </button>
              <button
                type="button"
                onClick={handleDiscardAndLeave}
                className="rounded-lg border border-gray-300 bg-white text-gray-700 px-3.5 py-2 text-sm font-medium hover:bg-gray-50"
              >
                No, don&apos;t confirm changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
