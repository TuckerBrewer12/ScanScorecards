export interface AIComparisonItem {
  metric: string;
  category: string;
  player_value: number | null;
  benchmark_value: number;
  unit: string;
  lower_is_better: boolean;
  has_data: boolean;
}

export interface AIInsightItem {
  category: string;
  category_group: "Ball Striking" | "Short Game" | "Putting";
  title: string;
  description: string;
  priority_score: number;
  key_metric: number | null;
  metric_label: string;
  benchmark: number | null;
  trend_direction: "improving" | "declining" | "stable";
  drill_tips: string[];
  what_if: string | null;
}

export interface AIStrengthItem {
  category: string;
  title: string;
  metric_label: string;
  player_value: number;
  benchmark_value: number;
  margin_description: string;
}

export interface AISuggestionsResponse {
  user_id: string;
  handicap_index: number | null;
  handicap_range_label: string;
  insights: AIInsightItem[];
  strengths: AIStrengthItem[];
  comparisons: AIComparisonItem[];
  rounds_analyzed: number;
  generated_at: string;
}
