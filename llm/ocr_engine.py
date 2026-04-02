"""Local OCR engine for scorecard score extraction.

Uses EasyOCR to detect text with bounding boxes, then spatially matches
score detections to hole columns by X-coordinate proximity.

No LLM call. No pipe-table reconstruction. No cell-index alignment.
"""

import logging
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from llm.prompts import RawFastScanExtraction, RawFastScanHole

logger = logging.getLogger(__name__)

# EasyOCR Detection = (bbox, text, confidence)
# bbox = [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]
Detection = Tuple  # (bbox, str, float)

_reader = None


def _get_reader():
    global _reader
    if _reader is None:
        import easyocr
        logger.info("[OCR] Initialising EasyOCR reader (first call downloads models ~100MB)...")
        _reader = easyocr.Reader(["en"], gpu=False)
        logger.info("[OCR] EasyOCR ready")
    return _reader


# ── Bounding-box geometry helpers ────────────────────────────────────────────

def _cx(bbox) -> float:
    return sum(pt[0] for pt in bbox) / 4

def _cy(bbox) -> float:
    return sum(pt[1] for pt in bbox) / 4

def _height(bbox) -> float:
    ys = [pt[1] for pt in bbox]
    return max(ys) - min(ys)


# ── Number parsing helpers ────────────────────────────────────────────────────

def _parse_hole_num(text: str) -> Optional[int]:
    """Return an integer 1-18 if text is a bare hole number, else None."""
    t = text.strip()
    try:
        n = int(t)
        if 1 <= n <= 18:
            return n
    except ValueError:
        pass
    return None


def _parse_score(text: str, to_par_scoring: bool) -> Optional[Tuple[int, float]]:
    """Return (score, confidence) if text looks like a player score, else None.

    For total-strokes mode: positive integers roughly 1-15.
    For to-par mode: signed integers roughly -5..+8, or 'E'/'e'.
    """
    t = text.strip()

    if to_par_scoring:
        if t.lower() in ("e", "even"):
            return (0, 1.0)
        try:
            v = int(t.lstrip("+"))
            if -6 <= v <= 10:
                return (v, 1.0)
        except ValueError:
            pass
        m = re.match(r"^([+-]?\d+)$", t)
        if m:
            v = int(m.group(1))
            if -6 <= v <= 10:
                return (v, 0.7)
    else:
        try:
            v = int(t)
            if 1 <= v <= 15:
                return (v, 1.0)
        except ValueError:
            pass
        m = re.search(r"^\d+$", t)
        if m:
            v = int(m.group())
            if 1 <= v <= 15:
                return (v, 0.7)

    return None


# ── Row clustering ────────────────────────────────────────────────────────────

def _cluster_rows(detections: List[Detection], gap_fraction: float = 0.8) -> List[List[Detection]]:
    """Group detections into rows by Y centre proximity.

    gap_fraction: gap threshold as a multiple of the median detection height.
    """
    if not detections:
        return []

    heights = [_height(d[0]) for d in detections if _height(d[0]) > 0]
    median_h = sorted(heights)[len(heights) // 2] if heights else 14.0
    row_gap = max(median_h * gap_fraction, 6.0)

    sorted_dets = sorted(detections, key=lambda d: _cy(d[0]))
    rows: List[List[Detection]] = []
    current: List[Detection] = [sorted_dets[0]]
    current_y = _cy(sorted_dets[0][0])

    for det in sorted_dets[1:]:
        y = _cy(det[0])
        if abs(y - current_y) <= row_gap:
            current.append(det)
            current_y = (current_y * len(current) + y) / (len(current) + 1)
        else:
            rows.append(sorted(current, key=lambda d: _cx(d[0])))
            current = [det]
            current_y = y

    rows.append(sorted(current, key=lambda d: _cx(d[0])))
    return rows


# ── Hole-column discovery ─────────────────────────────────────────────────────

def _find_hole_x_positions(rows: List[List[Detection]]) -> Dict[int, float]:
    """Find hole numbers 1-18 in the image and return {hole_num: center_x}.

    Searches every row; accumulates numbers in range 1-18.
    Handles front/back split (holes 1-9 on one row, 10-18 on another).
    """
    # Collect all detections that parse as hole numbers, per row
    hole_x: Dict[int, float] = {}

    for i, row in enumerate(rows):
        row_holes: Dict[int, float] = {}
        for bbox, text, conf in row:
            n = _parse_hole_num(text)
            if n is not None:
                row_holes[n] = _cx(bbox)

        holes_found = set(row_holes.keys())
        # Accept rows that look like a hole-number header:
        #   front 9 (contains 1..9), back 9 (contains 10..18), or full 18
        has_front = len(holes_found & set(range(1, 10))) >= 6
        has_back = len(holes_found & set(range(10, 19))) >= 6

        if has_front or has_back:
            logger.info(
                "[OCR] Hole header row %d: holes=%s",
                i, sorted(row_holes.keys()),
            )
            hole_x.update(row_holes)

    return hole_x


# ── Column boundary helper ────────────────────────────────────────────────────

def _assign_hole_by_x(x: float, hole_x: Dict[int, float]) -> Optional[int]:
    """Return the hole number whose column centre is nearest to x."""
    if not hole_x:
        return None
    return min(hole_x, key=lambda h: abs(hole_x[h] - x))


# ── Player score row detection ────────────────────────────────────────────────

def _score_fraction(row: List[Detection], to_par_scoring: bool) -> float:
    """Fraction of non-label detections in the row that parse as valid scores."""
    if len(row) < 3:
        return 0.0
    # Skip the first cell (likely a name/label)
    numeric = sum(1 for _, text, _ in row[1:] if _parse_score(text, to_par_scoring))
    return numeric / max(len(row) - 1, 1)


# ── Pipe-table output (for LLM interpretation) ───────────────────────────────

def ocr_to_pipe_table(image_path: str) -> str:
    """Run EasyOCR and return a numbered pipe-delimited table.

    Each line is prefixed with its row index so the LLM can reason about
    which row is which (e.g. 'Row 3 looks like the player score row').

    Returns:
        Multi-line string ready to embed in an LLM prompt.

    Raises:
        RuntimeError: If EasyOCR returns no detections.
    """
    reader = _get_reader()
    logger.info("[OCR] Reading image for pipe table: %s", image_path)
    detections = reader.readtext(image_path)
    logger.info("[OCR] Raw detections: %d", len(detections))

    if not detections:
        raise RuntimeError("EasyOCR returned no text detections")

    rows = _cluster_rows(detections)
    logger.info("[OCR] Clustered into %d rows", len(rows))

    lines = []
    for i, row in enumerate(rows):
        cells = [text for _, text, _ in row]
        lines.append(f"Row {i}: {' | '.join(cells)}")
        logger.debug("[OCR] %s", lines[-1])

    table = "\n".join(lines)
    logger.info("[OCR] Pipe table ready (%d chars, %d rows)", len(table), len(rows))
    return table


# ── Main extraction function ──────────────────────────────────────────────────

def extract_scores_from_image(
    image_path: str,
    player_name: Optional[str],
    to_par_scoring: bool,
    n_holes: int = 18,
) -> RawFastScanExtraction:
    """Extract player scores from a scorecard image using EasyOCR.

    Matches score detections to holes by X-coordinate proximity.
    No LLM involved.

    Args:
        image_path:    Path to the preprocessed scorecard image.
        player_name:   Hint for identifying the player row (may be OCR-mangled).
        to_par_scoring: True if scores are to-par (±), False for total strokes.
        n_holes:       Expected number of holes (9 or 18).

    Returns:
        RawFastScanExtraction with scores for each hole.

    Raises:
        RuntimeError: If hole columns cannot be found.
    """
    reader = _get_reader()
    logger.info("[OCR] Reading image: %s", image_path)
    detections = reader.readtext(image_path)
    logger.info("[OCR] Raw detections: %d", len(detections))

    rows = _cluster_rows(detections)
    logger.info("[OCR] Rows after clustering: %d", len(rows))
    for i, row in enumerate(rows):
        logger.debug("[OCR] Row %d (y≈%.0f): %s", i, _cy(row[0][0]), [t for _, t, _ in row])

    # ── Step 1: Locate hole columns by X position ────────────────────────────
    hole_x = _find_hole_x_positions(rows)
    if len(hole_x) < 6:
        raise RuntimeError(
            f"Could not find enough hole numbers in image (found {sorted(hole_x.keys())})"
        )
    logger.info("[OCR] Hole X positions: %s", {h: round(x) for h, x in sorted(hole_x.items())})

    # Determine column width tolerance: half the median gap between adjacent columns
    sorted_holes = sorted(hole_x.items())
    if len(sorted_holes) >= 2:
        gaps = [sorted_holes[i+1][1] - sorted_holes[i][1] for i in range(len(sorted_holes)-1)]
        col_tolerance = max(sorted(gaps)[len(gaps)//2] * 0.6, 20.0)
    else:
        col_tolerance = 40.0
    logger.info("[OCR] Column snap tolerance: %.0fpx", col_tolerance)

    # ── Step 2: Accumulate scores across all rows by X proximity ────────────
    # hole_candidates[hole_num] = list of (score, confidence)
    hole_candidates: Dict[int, List[Tuple[int, float]]] = {h: [] for h in range(1, n_holes + 1)}

    # Rows that look like hole-number headers — skip them for score matching
    header_row_indices = set()
    for i, row in enumerate(rows):
        row_holes = sum(1 for _, t, _ in row if _parse_hole_num(t) is not None)
        if row_holes >= 6:
            header_row_indices.add(i)

    # Optionally favour rows near a player name match
    name_row_y: Optional[float] = None
    if player_name:
        name_lower = player_name.lower()
        for row in rows:
            for _, text, _ in row:
                if name_lower[:3] in text.lower():
                    name_row_y = _cy(row[0][0])
                    logger.info("[OCR] Player name hint matched near y=%.0f", name_row_y)
                    break

    for i, row in enumerate(rows):
        if i in header_row_indices:
            continue

        row_y = _cy(row[0][0])
        score_frac = _score_fraction(row, to_par_scoring)
        if score_frac < 0.3:
            logger.debug("[OCR] Row %d skipped (score_frac=%.2f)", i, score_frac)
            continue

        logger.debug("[OCR] Row %d candidate (y≈%.0f, score_frac=%.2f)", i, row_y, score_frac)

        for bbox, text, ocr_conf in row:
            result = _parse_score(text, to_par_scoring)
            if result is None:
                continue
            score_val, parse_conf = result
            x = _cx(bbox)
            nearest_hole = _assign_hole_by_x(x, hole_x)
            if nearest_hole is None:
                continue
            dist = abs(hole_x[nearest_hole] - x)
            if dist > col_tolerance:
                logger.debug(
                    "[OCR] Score %r at x=%.0f skipped — dist=%.0f > tol=%.0f (nearest hole %d)",
                    text, x, dist, col_tolerance, nearest_hole,
                )
                continue

            # Weight by OCR confidence and name-row proximity
            confidence = parse_conf * ocr_conf
            if name_row_y is not None:
                proximity_bonus = max(0.0, 1.0 - abs(row_y - name_row_y) / 200.0)
                confidence *= (0.7 + 0.3 * proximity_bonus)

            if 1 <= nearest_hole <= n_holes:
                hole_candidates[nearest_hole].append((score_val, confidence))
                logger.debug(
                    "[OCR] Hole %d ← %r  x=%.0f  dist=%.0f  conf=%.2f",
                    nearest_hole, text, x, dist, confidence,
                )

    # ── Step 3: Pick best score per hole ────────────────────────────────────
    scores: List[RawFastScanHole] = []
    for hole_num in range(1, n_holes + 1):
        candidates = hole_candidates[hole_num]
        if not candidates:
            logger.debug("[OCR] Hole %d: no candidates → None", hole_num)
            scores.append(RawFastScanHole(score=None, confidence=0.5))
        else:
            # Pick highest-confidence candidate
            best_score, best_conf = max(candidates, key=lambda c: c[1])
            logger.debug(
                "[OCR] Hole %d: best=%s conf=%.2f  (from %d candidates)",
                hole_num, best_score, best_conf, len(candidates),
            )
            scores.append(RawFastScanHole(score=best_score, confidence=best_conf))

    filled = sum(1 for s in scores if s.score is not None)
    logger.info(
        "[OCR] Extraction complete: %d/%d holes filled — %s",
        filled, n_holes, [(s.score, round(s.confidence, 2)) for s in scores],
    )
    return RawFastScanExtraction(scores=scores)
