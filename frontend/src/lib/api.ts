import type { DashboardData, RoundSummary, Round, CourseSummary, Course, User, Milestone, Friendship } from "@/types/golf";
import type { AnalyticsData, AnalyticsFilters, CourseAnalyticsData, RoundComparison, GoalReport } from "@/types/analytics";
import { apiUrl } from "@/lib/apiBase";
import { withAuthHeaders } from "@/lib/sessionToken";

async function parseJSONBody<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (/^\s*</.test(text)) {
      throw new Error("API returned HTML instead of JSON. Check VITE_API_BASE_URL points to your backend (include https://).");
    }
    throw new Error("API returned an invalid JSON payload.");
  }
}

async function parseErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  const fallback = `API error: ${res.status}`;
  if (!text) return fallback;
  try {
    return JSON.parse(text).detail ?? fallback;
  } catch {
    if (/^\s*</.test(text)) {
      return "API returned HTML instead of JSON. Check VITE_API_BASE_URL points to your backend (include https://).";
    }
    return text;
  }
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(`/api${path}`), {
    credentials: "include",
    headers: withAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return parseJSONBody<T>(res);
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(`/api${path}`), {
    method: "POST",
    credentials: "include",
    headers: withAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return parseJSONBody<T>(res);
}

async function putJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(`/api${path}`), {
    method: "PUT",
    credentials: "include",
    headers: withAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return parseJSONBody<T>(res);
}

async function patchJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(`/api${path}`), {
    method: "PATCH",
    credentials: "include",
    headers: withAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return parseJSONBody<T>(res);
}

export const api = {
  getDashboard: (userId: string) =>
    fetchJSON<DashboardData>(`/stats/dashboard/${userId}`),

  getRoundsForUser: (userId: string, limit = 100, offset = 0) =>
    fetchJSON<RoundSummary[]>(`/rounds/user/${userId}?limit=${limit}&offset=${offset}`),

  getRound: (roundId: string) =>
    fetchJSON<Round>(`/rounds/${roundId}`),

  updateRound: (
    roundId: string,
    body: {
      hole_scores?: { hole_number: number; strokes?: number | null; putts?: number | null; fairway_hit?: boolean | null; green_in_regulation?: boolean | null }[];
      tee_box?: string | null;
      notes?: string;
      weather_conditions?: string;
      course_name_played?: string | null;
    }
  ) => putJSON<Round>(`/rounds/${roundId}`, body),

  linkCourse: (roundId: string, courseId: string) =>
    postJSON<RoundSummary>(`/rounds/${roundId}/link-course`, { course_id: courseId }),

  deleteRound: (roundId: string) =>
    fetch(apiUrl(`/api/rounds/${roundId}`), {
      method: "DELETE",
      credentials: "include",
      headers: withAuthHeaders(),
    }).then((res) => {
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    }),

  getCourses: (userId?: string, limit = 50, offset = 0) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (userId) params.set("user_id", userId);
    return fetchJSON<CourseSummary[]>(`/courses?${params}`);
  },

  searchCourses: (query: string, userId?: string, includeExternal = false) => {
    const params = new URLSearchParams({ q: query });
    if (userId) params.set("user_id", userId);
    if (includeExternal) params.set("include_external", "true");
    return fetchJSON<CourseSummary[]>(`/courses/search?${params}`);
  },

  getCourse: (courseId: string) =>
    fetchJSON<Course>(`/courses/${courseId}`),

  getUser: (userId: string) =>
    fetchJSON<User>(`/users/${userId}`),

  updateUser: (userId: string, body: { home_course_id?: string | null; handicap?: number | null; scoring_goal?: number | null }) =>
    patchJSON<User>(`/users/${userId}`, body),

  getGoalReport: (userId: string, limit = 50) =>
    fetchJSON<GoalReport>(`/stats/${userId}/goal-report?limit=${limit}`),

  cloneCourse: (courseId: string, userId: string) =>
    postJSON<CourseSummary>(`/courses/${courseId}/clone?user_id=${encodeURIComponent(userId)}`, {}),

  getUserHandicap: (userId: string) =>
    fetchJSON<{ handicap_index: number | null }>(`/users/${userId}/handicap`),

  getAnalytics: (userId: string, filters: AnalyticsFilters | number = 50) => {
    const f: AnalyticsFilters = typeof filters === "number"
      ? { limit: filters, timeframe: "all", courseId: "all" }
      : filters;
    const p = new URLSearchParams({ limit: String(f.limit) });
    if (f.timeframe !== "all") p.set("timeframe", f.timeframe);
    if (f.courseId !== "all") p.set("course_id", f.courseId);
    return fetchJSON<AnalyticsData>(`/stats/analytics/${userId}?${p}`);
  },

  getPlayedCourses: (userId: string) =>
    fetchJSON<{ id: string; name: string | null; location: string | null }[]>(
      `/stats/${userId}/played-courses`
    ),

  getRoundComparison: (userId: string, roundId: string) =>
    fetchJSON<RoundComparison>(`/stats/compare/${userId}/${roundId}`),

  getCourseAnalytics: (userId: string, courseId: string) =>
    fetchJSON<CourseAnalyticsData>(`/stats/course-analytics/${userId}/${courseId}`),

  getMilestones: (userId: string, limit = 12) =>
    fetchJSON<{ milestones: Milestone[] }>(`/stats/milestones/${userId}?limit=${limit}`),

  getAISuggestions: (userId: string, limit = 50, targetHandicap?: number | null) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (targetHandicap != null) params.set("target_handicap", String(targetHandicap));
    return fetchJSON<import("@/types/suggestions").AISuggestionsResponse>(
      `/ai-insights/${userId}?${params}`
    );
  },

  getFriendships: (status?: "pending" | "accepted" | "declined" | "blocked") => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return fetchJSON<Friendship[]>(`/users/me/friends${suffix}`);
  },

  sendFriendRequest: (addresseeFriendCode: string) =>
    postJSON<Friendship>(`/users/me/friends`, { addressee_friend_code: addresseeFriendCode }),

  updateFriendshipStatus: (
    friendshipId: string,
    status: "accepted" | "declined" | "blocked",
  ) => patchJSON<Friendship>(`/users/me/friends/${friendshipId}`, { status }),
};
