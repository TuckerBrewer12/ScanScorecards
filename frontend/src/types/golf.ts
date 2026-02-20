export interface Hole {
  number: number | null;
  par: number | null;
  handicap: number | null;
}

export interface Tee {
  color: string | null;
  total_yardage: number | null;
  hole_yardages: Record<number, number>;
  slope_rating: number | null;
  course_rating: number | null;
}

export interface Course {
  id: string | null;
  name: string | null;
  location: string | null;
  par: number | null;
  holes: Hole[];
  tees: Tee[];
}

export interface HoleScore {
  hole_number: number | null;
  strokes: number | null;
  net_score: number | null;
  putts: number | null;
  shots_to_green: number | null;
  fairway_hit: boolean | null;
  green_in_regulation: boolean | null;
}

export interface Round {
  id: string | null;
  course: Course | null;
  tee_box: string | null;
  date: string | null;
  hole_scores: HoleScore[];
  weather_conditions: string | null;
  notes: string | null;
  total_putts: number | null;
  total_gir: number | null;
}

export interface RoundSummary {
  id: string;
  course_name: string | null;
  course_location: string | null;
  course_par: number | null;
  tee_box: string | null;
  date: string | null;
  total_score: number | null;
  to_par: number | null;
  front_nine: number | null;
  back_nine: number | null;
  total_putts: number | null;
  total_gir: number | null;
  fairways_hit: number | null;
  notes: string | null;
}

export interface DashboardData {
  total_rounds: number;
  scoring_average: number | null;
  best_round: number | null;
  best_round_id: string | null;
  best_round_course: string | null;
  handicap: number | null;
  recent_rounds: RoundSummary[];
  average_putts: number | null;
  average_gir: number | null;
}

export interface CourseSummary {
  id: string;
  name: string | null;
  location: string | null;
  par: number | null;
  total_holes: number;
  tee_count: number;
}

export interface User {
  id: string | null;
  name: string | null;
  email: string | null;
  handicap: number | null;
  created_at: string | null;
}

export type ScoreType = "eagle" | "birdie" | "par" | "bogey" | "double-bogey" | "worse";

export function getScoreType(strokes: number, par: number): ScoreType {
  const diff = strokes - par;
  if (diff <= -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  if (diff === 2) return "double-bogey";
  return "worse";
}

export function getScoreColor(strokes: number, par: number): string {
  const diff = strokes - par;
  if (diff <= -2) return "bg-eagle text-white";
  if (diff === -1) return "bg-birdie text-white";
  if (diff === 0) return "";
  if (diff === 1) return "bg-amber-100 text-amber-800";
  if (diff === 2) return "bg-red-100 text-red-700";
  return "bg-red-300 text-red-900";
}

export function formatToPar(toPar: number | null): string {
  if (toPar === null) return "-";
  if (toPar === 0) return "E";
  if (toPar > 0) return `+${toPar}`;
  return `${toPar}`;
}
