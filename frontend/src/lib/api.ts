import type { DashboardData, RoundSummary, Round, CourseSummary, Course, User } from "@/types/golf";

const BASE_URL = "/api";

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
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

  getCourses: (limit = 50, offset = 0) =>
    fetchJSON<CourseSummary[]>(`/courses?limit=${limit}&offset=${offset}`),

  searchCourses: (query: string) =>
    fetchJSON<CourseSummary[]>(`/courses/search?q=${encodeURIComponent(query)}`),

  getCourse: (courseId: string) =>
    fetchJSON<Course>(`/courses/${courseId}`),

  getUserByEmail: (email: string) =>
    fetchJSON<User>(`/users/by-email/${encodeURIComponent(email)}`),
};
