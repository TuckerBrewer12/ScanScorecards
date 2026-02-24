export interface ExtractedHoleScore {
  hole_number: number | null;
  strokes: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  green_in_regulation: boolean | null;
}

export interface ExtractedRound {
  course: {
    name: string | null;
    location: string | null;
    par: number | null;
    holes: { number: number | null; par: number | null }[];
  } | null;
  tee_box: string | null;
  date: string | null;
  hole_scores: ExtractedHoleScore[];
  notes: string | null;
}

interface FieldConfidence {
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

export interface ScanState {
  step: Step;
  file: File | null;
  preview: string | null;
  result: ScanResult | null;
  editedScores: ExtractedHoleScore[];
  editedNotes: string;
  editedDate: string;
  error: string | null;
  userContext: string;
}

export const initialScanState: ScanState = {
  step: "upload",
  file: null,
  preview: null,
  result: null,
  editedScores: [],
  editedNotes: "",
  editedDate: "",
  error: null,
  userContext: "",
};
