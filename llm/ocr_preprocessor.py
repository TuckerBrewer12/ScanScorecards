"""Scorecard transcription (Pass 1) and pure-Python table parser.

Flow:
  image → Gemini Flash (transcribe only, copy text verbatim) → plain-text table
        → parse_transcription_to_scores() → RawFastScanExtraction

No second AI call is made. Python does all the structuring.
Flash is used here (not Pro) — it only needs to copy visible text, not reason.
"""

import re
import logging
from typing import Dict, List, Optional, Tuple

from google import genai
from google.genai import types

from llm.prompts import RawFastScanExtraction, RawFastScanHole

logger = logging.getLogger(__name__)

TRANSCRIPTION_PROMPT = """\
Transcribe this golf scorecard image as a plain-text table.

Rules:
- Use | to separate columns, one row per line
- Include every row you can see: hole numbers, par, yardage rows, all player score rows
- Copy every number EXACTLY as it appears — do not calculate, convert, or interpret anything
- If a cell is blank or empty, write -
- If a cell is unreadable or ambiguous, write ?
- Do NOT output JSON, markdown code fences, explanations, or any commentary
- Return ONLY the raw table text
"""

# Row labels that are not player score rows
_SKIP_LABELS = {
    "hole", "par", "hcp", "hdcp", "handicap",
    "yds", "yardage", "yards", "distance",
    "rating", "slope", "cr", "sr",
    "out", "in", "total", "tot",
    "#", "no", "number", "index",
    "net", "gross", "adjusted", "adj",
    "score", "strokes",
}


class TranscriptionError(Exception):
    """Raised when the transcription is unusable."""
    pass


# ── Gemini transcription call ────────────────────────────────────────────────

def transcribe_scorecard(client: genai.Client, file_part: types.Part) -> str:
    """Call Gemini Pro to transcribe the scorecard image to plain text.

    Returns:
        Pipe-separated text table of the scorecard.

    Raises:
        TranscriptionError: If the response is empty.
    """
    logger.info("[Pass 1] Calling Gemini Flash for transcription...")
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[file_part, TRANSCRIPTION_PROMPT],
    )
    text = (response.text or "").strip()
    if not text:
        raise TranscriptionError("Transcription returned empty response")
    logger.info("[Pass 1] Transcription complete (%d chars)", len(text))
    logger.debug("[Pass 1] Full transcription:\n%s", text)
    return text


def check_transcription_quality(text: str) -> bool:
    """Return True if the transcription looks usable for parsing."""
    n_pipes = text.count("|")
    n_digits = len(re.findall(r"\d", text))
    n_chars = len(text.strip())

    logger.info(
        "[Pass 1] Quality check — chars=%d  pipes=%d  digits=%d",
        n_chars, n_pipes, n_digits,
    )

    if n_chars < 30:
        logger.warning("[Pass 1] FAIL quality gate: transcription too short")
        return False
    if n_pipes < 8:
        logger.warning("[Pass 1] FAIL quality gate: too few pipe separators (%d)", n_pipes)
        return False
    if n_digits < 10:
        logger.warning("[Pass 1] FAIL quality gate: too few digits (%d)", n_digits)
        return False

    logger.info("[Pass 1] Quality gate passed")
    return True


# ── Pure-Python table parser ─────────────────────────────────────────────────

def _split_row(line: str) -> List[str]:
    """Split a pipe-delimited row into stripped cells."""
    parts = line.split("|")
    if parts and not parts[0].strip():
        parts = parts[1:]
    if parts and not parts[-1].strip():
        parts = parts[:-1]
    return [p.strip() for p in parts]


def _find_hole_columns(rows: List[List[str]]) -> Optional[Dict[int, int]]:
    """Find the header row and return {col_index: hole_number}.

    A valid header row has at least 9 cells containing sequential integers in 1–18.
    """
    for i, row in enumerate(rows):
        col_to_hole: Dict[int, int] = {}
        for ci, cell in enumerate(row):
            try:
                n = int(cell)
                if 1 <= n <= 18:
                    col_to_hole[ci] = n
            except ValueError:
                pass
        holes = set(col_to_hole.values())
        if len(holes) >= 9 and (1 in holes or 10 in holes):
            logger.info(
                "[Pass 2] Hole header found at row %d: %s",
                i, sorted(holes),
            )
            logger.debug("[Pass 2] col→hole mapping: %s", dict(sorted(col_to_hole.items())))
            return col_to_hole

    logger.warning("[Pass 2] Could not find hole header row in any of %d rows", len(rows))
    for i, row in enumerate(rows):
        logger.debug("[Pass 2] Row %d: %s", i, row)
    return None


def _find_player_row(rows: List[List[str]], player_name: Optional[str]) -> Optional[List[str]]:
    """Find the row that contains the player's scores.

    Skips known metadata rows (Par, Hdcp, Yds, etc.).
    If player_name is given, prefers the row whose label matches it.
    Falls back to the first non-metadata row.
    """
    candidates = []
    for row in rows:
        if not row:
            continue
        label = row[0].lower().strip()
        if not label or label in _SKIP_LABELS:
            logger.debug("[Pass 2] Skipping metadata row: %r", row[0])
            continue
        candidates.append(row)
        logger.debug("[Pass 2] Candidate player row: label=%r  cells=%s", row[0], row[1:])

    logger.info("[Pass 2] Found %d candidate player row(s)", len(candidates))

    if not candidates:
        logger.warning("[Pass 2] No candidate player rows — all rows were metadata")
        return None

    if player_name:
        name_lower = player_name.lower().strip()
        for row in candidates:
            if name_lower in row[0].lower():
                logger.info(
                    "[Pass 2] Matched player row by name %r → label=%r",
                    player_name, row[0],
                )
                return row
        logger.info(
            "[Pass 2] Player name %r not matched — falling back to first candidate: label=%r",
            player_name, candidates[0][0],
        )
    else:
        logger.info(
            "[Pass 2] No player name given — using first candidate: label=%r",
            candidates[0][0],
        )

    return candidates[0]


def _parse_cell(cell: str, to_par_scoring: bool) -> Tuple[Optional[int], float]:
    """Parse a single score cell into (value, confidence)."""
    cell = cell.strip()

    if not cell or cell == "-":
        return None, 1.0

    if cell == "?":
        return None, 0.1

    if to_par_scoring and cell.lower() in ("e", "even"):
        return 0, 1.0

    try:
        return int(cell.lstrip("+")), 1.0
    except ValueError:
        pass

    match = re.search(r"-?\d+", cell)
    if match:
        return int(match.group()), 0.6

    return None, 0.2


def parse_transcription_to_scores(
    transcription: str,
    player_name: Optional[str],
    to_par_scoring: bool,
    hole_pars: Dict[int, int],
) -> RawFastScanExtraction:
    """Parse a plain-text scorecard table into structured hole scores.

    No AI involved — pure Python string parsing.
    """
    logger.info(
        "[Pass 2] Parsing transcription — player=%r  to_par=%s  known_pars=%s",
        player_name, to_par_scoring, sorted(hole_pars.keys()),
    )

    lines = [l for l in transcription.splitlines() if "|" in l]
    rows = [_split_row(l) for l in lines]
    rows = [r for r in rows if len(r) >= 5]

    logger.info("[Pass 2] Table rows after filtering (≥5 cells): %d", len(rows))
    for i, row in enumerate(rows):
        logger.debug("[Pass 2] Row %d: %s", i, row)

    col_to_hole = _find_hole_columns(rows)
    if not col_to_hole:
        raise TranscriptionError("Could not identify hole number columns in transcription")

    player_row = _find_player_row(rows, player_name)
    if not player_row:
        raise TranscriptionError("Could not identify player score row in transcription")

    max_hole = max(col_to_hole.values())
    n_holes = 9 if max_hole <= 9 else 18
    logger.info("[Pass 2] Extracting %d holes (max hole found: %d)", n_holes, max_hole)

    scores: List[RawFastScanHole] = []
    for hole_num in range(1, n_holes + 1):
        col_idx = next((ci for ci, h in col_to_hole.items() if h == hole_num), None)

        if col_idx is None or col_idx >= len(player_row):
            logger.debug("[Pass 2] Hole %d: col_idx=%s  → score=None (missing)", hole_num, col_idx)
            scores.append(RawFastScanHole(score=None, confidence=1.0))
            continue

        raw_cell = player_row[col_idx]
        value, conf = _parse_cell(raw_cell, to_par_scoring)
        logger.debug(
            "[Pass 2] Hole %d: col=%d  raw=%r  → score=%s  conf=%.2f",
            hole_num, col_idx, raw_cell, value, conf,
        )
        scores.append(RawFastScanHole(score=value, confidence=conf))

    parsed_summary = [(s.score, round(s.confidence, 2)) for s in scores]
    logger.info("[Pass 2] Final scores: %s", parsed_summary)
    return RawFastScanExtraction(scores=scores)
