import type { DashboardData, RoundSummary, Round, CourseSummary, Course, User, Milestone } from "@/types/golf";
import type { AnalyticsData, CourseAnalyticsData, RoundComparison } from "@/types/analytics";
import { getToken } from "@/lib/auth";

const BASE_URL = "/api";

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `API error: ${res.status}`;
    try { msg = JSON.parse(text).detail ?? msg; } catch { if (text) msg = text; }
    throw new Error(msg);
  }
  return res.json();
}

async function putJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `API error: ${res.status}`;
    try { msg = JSON.parse(text).detail ?? msg; } catch { if (text) msg = text; }
    throw new Error(msg);
  }
  return res.json();
}

async function patchJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `API error: ${res.status}`;
    try { msg = JSON.parse(text).detail ?? msg; } catch { if (text) msg = text; }
    throw new Error(msg);
  }
  return res.json();
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
    }
  ) => putJSON<Round>(`/rounds/${roundId}`, body),

  linkCourse: (roundId: string, courseId: string) =>
    postJSON<RoundSummary>(`/rounds/${roundId}/link-course`, { course_id: courseId }),

  deleteRound: (roundId: string) =>
    fetch(`${BASE_URL}/rounds/${roundId}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).then((res) => {
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    }),

  getCourses: (userId?: string, limit = 50, offset = 0) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (userId) params.set("user_id", userId);
    return fetchJSON<CourseSummary[]>(`/courses?${params}`);
  },

  searchCourses: (query: string, userId?: string) => {
    const params = new URLSearchParams({ q: query });
    if (userId) params.set("user_id", userId);
    return fetchJSON<CourseSummary[]>(`/courses/search?${params}`);
  },

  getCourse: (courseId: string) =>
    fetchJSON<Course>(`/courses/${courseId}`),

  getUser: (userId: string) =>
    fetchJSON<User>(`/users/${userId}`),

  updateUser: (userId: string, body: { home_course_id?: string | null }) =>
    patchJSON<User>(`/users/${userId}`, body),

  cloneCourse: (courseId: string, userId: string) =>
    postJSON<CourseSummary>(`/courses/${courseId}/clone?user_id=${encodeURIComponent(userId)}`, {}),

  getUserHandicap: (userId: string) =>
    fetchJSON<{ handicap_index: number | null }>(`/users/${userId}/handicap`),

  getAnalytics: (userId: string, limit = 50) =>
    fetchJSON<AnalyticsData>(`/stats/analytics/${userId}?limit=${limit}`),

  getRoundComparison: (userId: string, roundId: string) =>
    fetchJSON<RoundComparison>(`/stats/compare/${userId}/${roundId}`),

  getCourseAnalytics: (userId: string, courseId: string) =>
    fetchJSON<CourseAnalyticsData>(`/stats/course-analytics/${userId}/${courseId}`),

  getMilestones: (userId: string, limit = 12) =>
    fetchJSON<{ milestones: Milestone[] }>(`/stats/milestones/${userId}?limit=${limit}`),
};
