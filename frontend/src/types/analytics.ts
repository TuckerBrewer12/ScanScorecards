export interface AnalyticsFilters {
  limit: number;
  timeframe: "all" | "ytd" | "1y";
  courseId: "all" | "home" | string;
}

export interface AnalyticsKPIs {
  scoring_average: number | null;
  gir_percentage: number | null;
  putts_per_gir: number | null;
  scrambling_percentage: number | null;
  up_and_down_percentage: number | null;
  handicap_index: number | null;
  total_rounds: number;
}

export interface HandicapTrendRow {
  round_index: number;
  round_id: string | null;
  handicap_index: number | null;
}

export interface ScoreDifferentialRow {
  round_index: number;
  round_id: string | null;
  score: number | null;
  course_rating: number | null;
  slope_rating: number | null;
  differential: number | null;
}

export interface ScoreTrendRow {
  round_index: number;
  round_id: string | null;
  total_score: number | null;
  to_par: number | null;
  course_name: string | null;
}

export interface GIRTrendRow {
  round_index: number;
  round_id: string | null;
  total_gir: number | null;
  holes_played: number;
  gir_percentage: number | null;
}

export interface PuttsTrendRow {
  round_index: number;
  round_id: string | null;
  total_putts: number | null;
  holes_played: number;
}

export interface ThreePuttRow {
  round_index: number;
  round_id: string | null;
  three_putt_count: number;
  three_putt_percentage: number;
}

export interface ScramblingRow {
  round_index: number;
  round_id: string | null;
  scramble_opportunities: number;
  scramble_successes: number;
  scrambling_percentage: number;
}

export interface UpAndDownRow {
  round_index: number;
  round_id: string | null;
  opportunities: number;
  successes: number;
  percentage: number;
}

export interface ScoreTypeRow {
  round_index: number;
  round_id: string | null;
  holes_counted: number;
  eagle: number;
  birdie: number;
  par: number;
  bogey: number;
  double_bogey: number;
  triple_bogey: number;
  quad_bogey: number;
}

export interface ScoringByParRow {
  par: number;
  average_to_par: number;
  average_strokes: number;
  sample_size: number;
}

export interface ScoringByHandicapRow {
  handicap: number;
  average_to_par: number;
  sample_size: number;
}

export interface ScoringByYardageRow {
  par: number;
  bucket_label: string;
  bucket_order: number;
  average_to_par: number;
  gir_percentage: number | null;
  sample_size: number;
  raw_scores: { to_par: number; yardage: number }[];
}

export interface GIRvsNonGIRRow {
  bucket: "GIR" | "No GIR";
  holes_counted: number;
  eagle: number;
  birdie: number;
  par: number;
  bogey: number;
  double_bogey: number;
  triple_bogey: number;
  quad_bogey: number;
}

export interface NotableAchievements {
  scoring_records: {
    lifetime: Record<string, number | null>;
    one_year: Record<string, number | null>;
  };
  scoring_records_events: {
    lifetime: Record<string, { date: string; course: string } | null>;
    one_year: Record<string, { date: string; course: string } | null>;
  };
  career_totals: {
    lifetime: Record<string, number>;
    one_year: Record<string, number>;
  };
  best_performance_streaks: {
    lifetime: Record<string, number>;
    one_year: Record<string, number>;
  };
  best_performance_streaks_events: {
    lifetime: Record<string, { date: string; course: string } | null>;
    one_year: Record<string, { date: string; course: string } | null>;
  };
  home_course_records: {
    lifetime: { home_course_name: string | null; lowest_score_on_home_course: number | null; most_rounds_played_at_home_course: number };
    one_year: { home_course_name: string | null; lowest_score_on_home_course: number | null };
  };
  home_course_records_events: {
    lifetime: { lowest_score_on_home_course: { date: string; course: string } | null };
    one_year: { lowest_score_on_home_course: { date: string; course: string } | null };
  };
  putting_milestones: {
    lifetime: {
      fewest_putts_in_round: number | null;
      most_1_putts_in_round: number | null;
      most_3_putts_in_round: number | null;
      putt_breaks: Array<{
        threshold: number;
        achievement: {
          date: string;
          course: string;
        } | null;
      }>;
    };
    one_year: {
      fewest_putts_in_round: number | null;
      most_1_putts_in_round: number | null;
      most_3_putts_in_round: number | null;
      putting_milestones_achieved_from_lifetime_set: number;
    };
  };
  putting_milestones_events: {
    lifetime: {
      fewest_putts_in_round: { date: string; course: string } | null;
      most_1_putts_in_round: { date: string; course: string } | null;
      most_3_putts_in_round: { date: string; course: string } | null;
    };
    one_year: {
      fewest_putts_in_round: { date: string; course: string } | null;
      most_1_putts_in_round: { date: string; course: string } | null;
      most_3_putts_in_round: { date: string; course: string } | null;
    };
  };
  gir_milestones: {
    lifetime: {
      gir_breaks: Array<{
        threshold: number;
        achievement: {
          date: string;
          course: string;
        } | null;
      }>;
      highest_gir_percentage_in_round: number | null;
      most_gir_in_round: number | null;
    };
    one_year: {
      best_gir_round: {
        date: string;
        course: string;
      } | null;
      best_gir_in_round: number | null;
      highest_gir_percentage: number | null;
      gir_milestones_achieved_from_lifetime_set: number;
    };
  };
  gir_milestones_events: {
    lifetime: {
      highest_gir_percentage_in_round: { date: string; course: string } | null;
      most_gir_in_round: { date: string; course: string } | null;
    };
    one_year: {
      best_gir_round: { date: string; course: string } | null;
      highest_gir_percentage: { date: string; course: string } | null;
    };
  };
  round_milestones: {
    lifetime: {
      score_breaks: Array<{
        threshold: number;
        achievement: {
          date: string;
          course: string;
        } | null;
      }>;
      first_round_under_par: {
        score: number;
        date: string;
        course: string;
      } | null;
      first_eagle: {
        date: string;
        course: string;
      } | null;
      first_hole_in_one: {
        date: string;
        course: string;
      } | null;
    };
    one_year: {
      new_personal_records_achieved_count: number;
      new_personal_records_achieved: string[];
    };
  };
  window_days: number;
}

export interface NetScoreTrendRow {
  round_index: number;
  round_id: string | null;
  gross_score: number | null;
  course_handicap: number | null;
  net_score: number | null;
  course_name: string | null;
  to_par: number | null;
}

export interface AnalyticsData {
  kpis: AnalyticsKPIs;
  score_trend: ScoreTrendRow[];
  net_score_trend: NetScoreTrendRow[];
  gir_trend: GIRTrendRow[];
  putts_trend: PuttsTrendRow[];
  three_putts_trend: ThreePuttRow[];
  scrambling_trend: ScramblingRow[];
  up_and_down_trend: UpAndDownRow[];
  score_type_distribution: ScoreTypeRow[];
  scoring_by_par: ScoringByParRow[];
  scoring_by_yardage: ScoringByYardageRow[];
  scoring_by_handicap: ScoringByHandicapRow[];
  gir_vs_non_gir: GIRvsNonGIRRow[];
  handicap_trend: HandicapTrendRow[];
  score_differentials: ScoreDifferentialRow[];
  notable_achievements: NotableAchievements;
}

export interface ComparisonRow {
  label: string;
  sample_size: number;
  round_id: string | null;
  primary_value: number | null;
  secondary_value: number | null;
}

export interface RoundComparison {
  score: ComparisonRow[];
  putts: ComparisonRow[];
  gir: ComparisonRow[];
  three_putts: ComparisonRow[];
  putts_per_gir: ComparisonRow[];
  scrambling: ComparisonRow[];
}

export interface CourseScoreTrendRow {
  round_index: number;
  round_id: string | null;
  date: string | null;
  total_score: number | null;
  to_par: number | null;
}

export interface CourseAverageToParByHoleRow {
  hole_number: number;
  par: number;
  average_score: number;
  average_to_par: number;
  sample_size: number;
}

export interface CourseGIRByHoleRow {
  hole_number: number;
  par: number;
  gir_hits: number;
  sample_size: number;
  gir_percentage: number;
}

export interface CoursePuttsByHoleRow {
  hole_number: number;
  par: number;
  average_putts: number;
  sample_size: number;
}

export interface CourseScoreTypeByHoleRow {
  hole_number: number;
  sample_size: number;
  eagle: number;
  birdie: number;
  par: number;
  bogey: number;
  double_bogey: number;
  triple_bogey: number;
  quad_bogey: number;
}

export interface CourseDifficultyProfileRow {
  hole_number: number;
  par: number;
  average_score: number;
  average_to_par: number;
  sample_size: number;
  difficulty_rank: number;
}

export interface CourseGIRImpactRow {
  bucket: "GIR" | "No GIR";
  holes_counted: number;
  average_score: number | null;
  average_to_par: number | null;
}

export interface CourseScoreVarianceRow {
  hole_number: number;
  par: number;
  sample_size: number;
  average_score: number | null;
  score_variance: number | null;
  score_std_dev: number | null;
  variance_rank: number;
}

export interface GoalSaver {
  type: "three_putt_bleed" | "blowup_holes" | "achilles_heel" | "home_course_demon" | "gir_opportunity" | "scrambling_opportunity" | "par5_opportunity";
  strokes_saved: number;
  percentage_of_gap: number;
  headline: string;
  detail: string;
  data: Record<string, unknown>;
}

export interface GoalReport {
  scoring_average: number | null;
  best_score: number | null;
  scoring_goal: number;
  gap: number | null;
  on_track: boolean;
  savers: GoalSaver[];
}

export interface CourseAnalyticsData {
  course_id: string;
  rounds_played: number;
  score_trend_on_course: CourseScoreTrendRow[];
  average_score_relative_to_par_by_hole: CourseAverageToParByHoleRow[];
  gir_percentage_by_hole: CourseGIRByHoleRow[];
  average_putts_by_hole: CoursePuttsByHoleRow[];
  score_type_distribution_by_hole: CourseScoreTypeByHoleRow[];
  course_difficulty_profile_by_hole: CourseDifficultyProfileRow[];
  average_score_when_gir_vs_missed: CourseGIRImpactRow[];
  score_variance_by_hole: CourseScoreVarianceRow[];
}
