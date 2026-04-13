import type { ExtractedHoleScore, ScoreMetadata } from "@/types/scan";
import { defaultMetadata } from "@/types/scan";

/**
 * Counts holes with missing strokes, excluding trailing nulls after the last played hole.
 * e.g. if player played 13 holes, holes 14-18 being null are not counted.
 */
export function countBadScanNulls(scores: ExtractedHoleScore[]): number {
  const lastNonNullIdx = scores.reduce((last, s, i) => (s.strokes !== null ? i : last), -1);
  if (lastNonNullIdx === -1) return 0;
  return scores.slice(0, lastNonNullIdx + 1).filter((s) => s.strokes === null).length;
}

/**
 * Auto-fills putts = 2 for holes that have a stroke score but no putts,
 * when at least some holes already have putts recorded.
 */
export function applyAutoFillPutts(
  scores: ExtractedHoleScore[],
  metadata: ScoreMetadata[],
  puttsNotRecorded: boolean
): { scores: ExtractedHoleScore[]; metadata: ScoreMetadata[] } {
  if (puttsNotRecorded) return { scores, metadata };
  const anyPutts = scores.some((s) => s.putts !== null);
  if (!anyPutts) return { scores, metadata };

  const nextScores = scores.map((s) => ({ ...s }));
  const nextMeta = metadata.map((m) => ({ ...m }));

  for (let i = 0; i < nextScores.length; i++) {
    if (nextScores[i].strokes !== null && nextScores[i].putts === null) {
      nextScores[i].putts = 2;
      nextMeta[i].putts_estimated = true;
    }
  }
  return { scores: nextScores, metadata: nextMeta };
}

/**
 * Auto-calculates GIR from strokes and putts when shots_to_green and gir are both unknown.
 * Formula: hit GIR if (strokes - putts) <= (par - 2)
 */
export function applyAutoCalcGir(
  scores: ExtractedHoleScore[],
  metadata: ScoreMetadata[],
  holeParMap: Map<number, number>
): { scores: ExtractedHoleScore[]; metadata: ScoreMetadata[] } {
  if (holeParMap.size === 0) return { scores, metadata };

  const nextScores = scores.map((s) => ({ ...s }));
  const nextMeta = metadata.map((m) => ({ ...m }));

  for (let i = 0; i < nextScores.length; i++) {
    const s = nextScores[i];
    if (
      s.green_in_regulation !== null ||
      s.shots_to_green !== null ||
      s.strokes === null ||
      s.putts === null
    ) continue;

    const holeNum = s.hole_number ?? i + 1;
    const par = holeParMap.get(holeNum);
    if (par == null) continue;

    nextScores[i].green_in_regulation = (s.strokes - s.putts) <= (par - 2);
    nextMeta[i].gir_calculated = true;
  }
  return { scores: nextScores, metadata: nextMeta };
}

/**
 * Builds initial scoreMetadata and applies auto-fill/auto-calc transformations.
 */
export function initializeScores(
  holeScores: ExtractedHoleScore[],
  fieldsNeedingReview: string[],
  courseHoles: { number: number | null; par: number | null }[]
): { editedScores: ExtractedHoleScore[]; scoreMetadata: ScoreMetadata[] } {
  const puttsNotRecorded = fieldsNeedingReview.some((f) => f.toLowerCase().includes("putts"));

  let scores = holeScores.map((s) => ({ ...s }));
  let metadata: ScoreMetadata[] = scores.map(() => defaultMetadata());

  const result1 = applyAutoFillPutts(scores, metadata, puttsNotRecorded);
  scores = result1.scores;
  metadata = result1.metadata;

  const holeParMap = new Map<number, number>();
  for (const h of courseHoles) {
    if (h.number != null && h.par != null) holeParMap.set(h.number, h.par);
  }

  const result2 = applyAutoCalcGir(scores, metadata, holeParMap);
  scores = result2.scores;
  metadata = result2.metadata;

  return { editedScores: scores, scoreMetadata: metadata };
}
