import type { DashboardData, RoundSummary, Round, CourseSummary, Course, User } from "@/types/golf";

const BASE_URL = "/api";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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

  deleteRound: (roundId: string) =>
    fetch(`${BASE_URL}/rounds/${roundId}`, { method: "DELETE" }).then((res) => {
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

  cloneCourse: (courseId: string, userId: string) =>
    postJSON<CourseSummary>(`/courses/${courseId}/clone?user_id=${encodeURIComponent(userId)}`, {}),

  getUserByEmail: (email: string) =>
    fetchJSON<User>(`/users/by-email/${encodeURIComponent(email)}`),
};
