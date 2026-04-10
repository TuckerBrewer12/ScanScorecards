export interface ExtractedHoleScore {
  hole_number: number | null;
  strokes: number | null;
  putts: number | null;
  shots_to_green: number | null;
  fairway_hit: boolean | null;
  green_in_regulation: boolean | null;
}

export interface ScoreMetadata {
  putts_estimated: boolean;
  gir_calculated: boolean;
}

export function defaultMetadata(): ScoreMetadata {
  return { putts_estimated: false, gir_calculated: false };
}

export interface ExtractedRound {
  course: {
    name: string | null;
    location: string | null;
    par: number | null;
    holes: { number: number | null; par: number | null }[];
    tees: { color: string | null; slope_rating: number | null; course_rating: number | null; hole_yardages: Record<string, number> }[];
  } | null;
  tee_box: string | null;
  date: string | null;
  hole_scores: ExtractedHoleScore[];
  notes: string | null;
}

export interface FieldConfidence {
  final_confidence: number;
  level: string;
  validation_flags: string[];
}

interface HoleConfidence {
  hole_number: number;
  fields: Partial<Record<string, FieldConfidence>>;
  overall: number;
  level: string;
}

export interface ScanResult {
  round: ExtractedRound;
  confidence: {
    overall: number;
    level: string;
    hole_scores: HoleConfidence[];
  };
  fields_needing_review: string[];
}

type Step = "upload" | "processing" | "review";

export interface ManualTee {
  color: string | null;
  slope_rating: number | null;
  course_rating: number | null;
  hole_yardages: Record<string, number>;
}

export interface ScanState {
  step: Step;
  scanMode: "full" | "manual";
  selectedCourseId: string | null;
  selectedCourseName: string | null;
  file: File | null;
  preview: string | null;
  result: ScanResult | null;
  editedScores: ExtractedHoleScore[];
  scoreMetadata: ScoreMetadata[];
  editedDate: string;
  editedTeeBox: string | null;
  error: string | null;
  userContext: string;
  prefetchedOcrText: string | null;
  // Review step: user-selected course override
  reviewCourseId: string | null;
  reviewExternalCourseId: string | null;
  reviewCourseName: string | null;
  // Manual entry: fetched course data
  manualCourseHoles: { number: number | null; par: number | null }[];
  manualCourseTees: ManualTee[];
}

export const initialScanState: ScanState = {
  step: "upload",
  scanMode: "full",
  selectedCourseId: null,
  selectedCourseName: null,
  file: null,
  preview: null,
  result: null,
  editedScores: [],
  scoreMetadata: [],
  editedDate: "",
  editedTeeBox: null,
  error: null,
  userContext: "",
  prefetchedOcrText: null,
  reviewCourseId: null,
  reviewExternalCourseId: null,
  reviewCourseName: null,
  manualCourseHoles: [],
  manualCourseTees: [],
};
