export interface AnalyticsKPIs {
  scoring_average: number | null;
  gir_percentage: number | null;
  putts_per_gir: number | null;
  scrambling_percentage: number | null;
  total_rounds: number;
}

export interface ScoreTrendRow {
  round_index: number;
  round_id: string | null;
  total_score: number | null;
  to_par: number | null;
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

export interface AnalyticsData {
  kpis: AnalyticsKPIs;
  score_trend: ScoreTrendRow[];
  gir_trend: GIRTrendRow[];
  putts_trend: PuttsTrendRow[];
  three_putts_trend: ThreePuttRow[];
  scrambling_trend: ScramblingRow[];
  score_type_distribution: ScoreTypeRow[];
  scoring_by_par: ScoringByParRow[];
  scoring_by_handicap: ScoringByHandicapRow[];
  gir_vs_non_gir: GIRvsNonGIRRow[];
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
}
