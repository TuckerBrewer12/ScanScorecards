"""Row-oriented parser adapter for Mistral OCR scorecard output."""

from __future__ import annotations

import logging
import re
from typing import Callable, Dict, List, Optional, Tuple

from pydantic import Field

from models.base import BaseGolfModel

logger = logging.getLogger(__name__)


class ParsedTeeRow(BaseGolfModel):
    """A detected tee/yardage row."""

    label: str
    yardages: List[Optional[int]] = Field(default_factory=list)


class ParsedScorecardRows(BaseGolfModel):
    """Structured row extraction from raw OCR markdown/text."""

    course_name: Optional[str] = None
    hole_numbers: List[int] = Field(default_factory=list)
    tee_rows: List[ParsedTeeRow] = Field(default_factory=list)
    par_row: List[Optional[int]] = Field(default_factory=list)
    handicap_row: List[Optional[int]] = Field(default_factory=list)
    player_name: Optional[str] = None
    score_to_par_hint: Optional[bool] = None
    shots_to_green_row: List[Optional[int]] = Field(default_factory=list)
    score_row: List[Optional[int]] = Field(default_factory=list)
    putts_row: List[Optional[int]] = Field(default_factory=list)
    gir_row: List[Optional[bool]] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    markdown: str = ""
    extraction_mode: str = "positional"


_INT_RE = re.compile(r"(?<!\d)-?\d{1,4}(?!\d)")
_ROMAN_RE = re.compile(r"^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)$", re.IGNORECASE)
_COURSE_RE = re.compile(r"^[A-Z0-9 '&.-]{3,}$")
_NAME_RE = re.compile(r"\bmy name is\s+([a-z0-9][a-z0-9 '.\-]{0,40})\b", re.IGNORECASE)
_ROW_NAME_RE = re.compile(r"\b(?:scan|read|use)\s+([a-z0-9][a-z0-9 '\-]{1,40})\s+row\b", re.IGNORECASE)
_TO_PAR_TOKEN_RE = re.compile(r"[+\-−]?\d+|[①②③④⑤⑥⑦⑧⑨❶❷❸❹❺❻❼❽❾➀➁➂➃➄➅➆➇➈⓿⓪]|[eE]")
_NAME_ON_ROW_RE = re.compile(r"name on (shots?(?: to green)?|putts?|score)\s+row", re.IGNORECASE)
_SIMPLE_ROW_ORDER_RE = re.compile(r"row order:\s*([a-z ,]+?)(?:\.|$)", re.IGNORECASE)

_CIRCLED_TO_DIGIT = {
    # Standard circled ①-⑨
    "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5",
    "⑥": "6", "⑦": "7", "⑧": "8", "⑨": "9",
    # Bold/negative circled ❶-❾
    "❶": "1", "❷": "2", "❸": "3", "❹": "4", "❺": "5",
    "❻": "6", "❼": "7", "❽": "8", "❾": "9",
    # Dingbat circled ➀-➈
    "➀": "1", "➁": "2", "➂": "3", "➃": "4", "➄": "5",
    "➅": "6", "➆": "7", "➇": "8", "➈": "9",
    # Zero variants
    "⓪": "0", "⓿": "0",
}





def parse_mistral_scorecard_rows(
    markdown_text: str,
    *,
    user_context: Optional[str] = None,
) -> ParsedScorecardRows:
    """Parse row-level scorecard data from Mistral OCR markdown/text.

    This parser is intentionally conservative and best-effort:
    - Detects hole header row (1..18)
    - Detects tee/yardage rows (roman/tee labels + large numbers)
    - Detects handicap row
    - Detects player's score row (+ next two rows for putts/GIR when available)
    """
    text = (markdown_text or "").strip()



    # 2D pre-pass: extract by column map for precise hole-number alignment.
    raw_lines = text.splitlines()
    row_hints_2d = _extract_row_hints(user_context)
    player_name_2d = _extract_player_name_hint(user_context)

    logger.info(
        "Parser: user_context=%r player_name=%r name_on_row=%r row_order=%r",
        (user_context or "")[:120],
        player_name_2d,
        row_hints_2d.get("name_on_row"),
        row_hints_2d.get("row_order"),
    )

    split_maps = _find_split_col_maps(raw_lines)
    if split_maps is not None:
        (front_lines, front_map, front_hdr_idx), (back_lines, back_map, back_hdr_idx) = split_maps

        # Use require_name_match when a player name is given so we don't accidentally
        # pick up a different player's row as the anchor (e.g. G's row for player T).
        front_result, front_anchor_idx = _extract_2d_from_raw_lines(
            front_lines, front_map, player_name_2d, row_hints_2d, min_scores=4,
            require_name_match=bool(player_name_2d),
        )
        if front_result is not None and front_anchor_idx >= 0:
            # Reuse the same row offset in the back-9 block.
            # front_anchor_idx is absolute to front_lines. back_lines starts dynamically at its header.
            # So offset = absolute - header.
            header_offset = front_anchor_idx - front_hdr_idx

            back_result, _ = _extract_2d_from_raw_lines(
                back_lines, back_map, player_name_2d, row_hints_2d,
                min_scores=4, forced_anchor_line_idx=header_offset,
            )
            if back_result is not None:
                merged = _merge_parsed_halves(front_result, back_result)
                merged.markdown = text
                _apply_field_suppression(merged, row_hints_2d)
                return merged

        # Second-pass: player's 18-hole section is entirely within back_lines.
        # This happens when multiple scorecards share one page — the second player's
        # front nine appears in the back section using front_map column alignment.
        if player_name_2d and front_result is None:
            front_in_back, back_front_anchor = _extract_2d_from_raw_lines(
                back_lines, front_map, player_name_2d, row_hints_2d, min_scores=4,
                require_name_match=True,
            )
            if front_in_back is not None and back_front_anchor >= 0:
                # Found player's front nine in back_lines. Now find their back nine
                # which occupies a sub-section with a different (unlabeled) col_map.
                unlabeled = _find_unlabeled_section_col_map(
                    back_lines, start_after_idx=back_front_anchor + 2, start_hole=10
                )
                if unlabeled is not None:
                    back_nine_col_map, par_row_idx = unlabeled
                    # Score row is typically 1-2 rows after the par row (skip blank).
                    back_nine_score_approx = par_row_idx + 2
                    back_in_back, _ = _extract_2d_from_raw_lines(
                        back_lines, back_nine_col_map, player_name_2d, row_hints_2d,
                        min_scores=4, forced_anchor_line_idx=back_nine_score_approx,
                    )
                    if back_in_back is not None:
                        merged = _merge_parsed_halves(front_in_back, back_in_back)
                        merged.markdown = text
                        _apply_field_suppression(merged, row_hints_2d)
                        return merged

    # Single full-table path.
    col_map = _find_hole_column_map(raw_lines)
    if col_map is not None:
        result_2d, _ = _extract_2d_from_raw_lines(raw_lines, col_map, player_name_2d, row_hints_2d)
        if result_2d is not None:
            result_2d.markdown = text
            _apply_field_suppression(result_2d, row_hints_2d)
            return result_2d

    lines = _normalize_lines(text)
    parsed = ParsedScorecardRows(markdown=text)
    if not lines:
        parsed.warnings.append("No OCR text lines found")
        return parsed

    row_hints = _extract_row_hints(user_context)
    parsed.player_name = _extract_player_name_hint(user_context)
    parsed.score_to_par_hint = row_hints["score_to_par"]
    parsed.course_name = _extract_course_name(lines)
    parsed.hole_numbers = _extract_hole_numbers(lines)
    if len(parsed.hole_numbers) < 9:
        parsed.warnings.append("Could not confidently detect hole header row")
    par_vals = _extract_par_row(lines)
    if par_vals:
        parsed.par_row = _coerce_18_ints(par_vals, max_abs=10)

    handicap_idx, handicap_vals = _extract_handicap_row(lines)
    if handicap_vals:
        parsed.handicap_row = _coerce_18_ints(handicap_vals)

    tee_rows = _extract_tee_rows(lines)
    parsed.tee_rows = [ParsedTeeRow(label=label, yardages=_coerce_18_ints(vals)) for label, vals in tee_rows]

    anchor_idx, anchor_vals = _extract_score_row(lines, parsed.player_name, tee_rows, handicap_idx)
    if anchor_idx is None:
        parsed.warnings.append("Could not detect player score row")
        _apply_field_suppression(parsed, row_hints)
        return parsed

    # Name-based row mapping: user told us which data row their name appears on.
    # This takes priority — we know exactly which OCR line is which.
    name_on_row = _parse_name_on_row(user_context or "")
    simple_row_order = _parse_simple_row_order(user_context or "")
    if name_on_row and simple_row_order:
        _apply_name_based_mapping(parsed, lines, anchor_idx, name_on_row, simple_row_order, row_hints)
        _apply_field_suppression(parsed, row_hints)
        return parsed

    # Context-aware row mapping:
    # e.g. "first row shots onto green, second row putts, third row final score (to par)"
    if row_hints["row_order_explicit"]:
        parsed.shots_to_green_row = _coerce_18_ints(anchor_vals, max_abs=10)
        putts_vals = _extract_next_small_int_row(lines, anchor_idx + 1, max_abs=6)
        if row_hints["score_to_par"]:
            score_vals = _extract_next_to_par_row(lines, anchor_idx + 2)
        else:
            score_vals = _extract_next_small_int_row(lines, anchor_idx + 2, max_abs=15)
        if putts_vals:
            parsed.putts_row = _coerce_18_ints(putts_vals, max_abs=6)
        if score_vals:
            parsed.score_row = _coerce_18_ints(score_vals, max_abs=15)
        else:
            parsed.warnings.append("Could not detect final score row at expected third row")
        # Try to derive GIR from shots-to-green when hole pars are known later.
        _apply_field_suppression(parsed, row_hints)
        return parsed

    # Explicit single-row score card hint: treat anchor as score only.
    if row_hints["single_score_row"]:
        parsed.score_row = _coerce_18_ints(anchor_vals, max_abs=15)
        _apply_field_suppression(parsed, row_hints)
        return parsed

    # Default mapping: anchor row is score.
    # 0 or negative can't be total strokes. Re-extract with the to-par parser so circled
    # symbols get correct signs (① = -1, not 1 — _line_ints always returns positive face value).
    if any(v <= 0 for v in anchor_vals):
        to_par_vals = _extract_to_par_at(lines, anchor_idx)
        parsed.score_row = _coerce_18_ints(to_par_vals or anchor_vals, max_abs=9)
        parsed.score_to_par_hint = True
    else:
        parsed.score_row = _coerce_18_ints(anchor_vals, max_abs=15)
    if not row_hints["suppress_putts"]:
        putts_vals = _extract_next_small_int_row(lines, anchor_idx + 1, max_abs=6)
        if putts_vals:
            parsed.putts_row = _coerce_18_ints(putts_vals, max_abs=6)
    if not row_hints["suppress_gir"]:
        gir_vals = _extract_next_gir_like_row(lines, anchor_idx + 2)
        if gir_vals:
            parsed.gir_row = _coerce_18_bools(gir_vals)

    # Heuristic correction: if anchor looks like shots-to-green and third row looks like to-par scores,
    # remap to [shots, putts, score].
    if _looks_like_shots_row(parsed.score_row) and not parsed.gir_row:
        alt_putts = _extract_next_small_int_row(lines, anchor_idx + 1, max_abs=6)
        alt_score = _extract_next_small_int_row(lines, anchor_idx + 2, max_abs=6)
        if alt_putts and alt_score and _looks_like_to_par_row(_coerce_18_ints(alt_score, max_abs=6)):
            parsed.shots_to_green_row = parsed.score_row
            parsed.putts_row = _coerce_18_ints(alt_putts, max_abs=6)
            parsed.score_row = _coerce_18_ints(alt_score, max_abs=6)
            parsed.score_to_par_hint = True
            parsed.warnings.append("Row remap applied: interpreted third row as to-par scores")

    _apply_field_suppression(parsed, row_hints)
    return parsed


def _parse_name_on_row(ctx: str) -> Optional[str]:
    """Return which row type the player's name appears on ('score', 'putts', 'shots')."""
    m = _NAME_ON_ROW_RE.search(ctx)
    if not m:
        return None
    raw = m.group(1).lower()
    if "shot" in raw or "green" in raw:
        return "shots"
    if "putt" in raw:
        return "putts"
    return "score"


def _parse_simple_row_order(ctx: str) -> List[str]:
    """Parse 'row order: shots to green, putts, score' into ['shots', 'putts', 'score']."""
    m = _SIMPLE_ROW_ORDER_RE.search(ctx)
    if not m:
        return []
    result = []
    for part in m.group(1).split(","):
        p = part.strip().lower()
        if "shot" in p or "green" in p:
            result.append("shots")
        elif "putt" in p:
            result.append("putts")
        elif "score" in p:
            result.append("score")
    return result


def _extract_row_at(lines: List[str], line_idx: int, *, max_abs: int) -> List[int]:
    """Extract integers from the line at line_idx, searching ±1 lines for OCR jitter."""
    for delta in (0, 1, -1, 2, -2):
        i = line_idx + delta
        if 0 <= i < len(lines):
            nums = _line_ints(lines[i], max_abs=max_abs)
            normalized = _normalize_hole_values(nums)
            if len(normalized) >= 9:
                return normalized[:18]
    return []


def _extract_to_par_at(lines: List[str], line_idx: int) -> List[int]:
    """Extract to-par values from the line at line_idx, searching ±1 lines."""
    for delta in (0, 1, -1, 2, -2):
        i = line_idx + delta
        if 0 <= i < len(lines):
            vals = _line_to_par_values(lines[i])
            normalized = _normalize_hole_values(vals)
            if len(normalized) >= 9:
                return normalized[:18]
    return []


def _apply_name_based_mapping(
    parsed: "ParsedScorecardRows",
    lines: List[str],
    name_line_idx: int,
    name_on_row: str,
    row_order: List[str],
    row_hints: dict,
) -> None:
    """Map OCR lines to data rows using the player name line as a positional anchor.

    name_line_idx: the OCR line index that contains the player's name text.
    name_on_row:   which data type that line holds ('score', 'putts', 'shots').
    row_order:     ordered list of data types top-to-bottom, e.g. ['shots', 'putts', 'score'].
    """
    if name_on_row not in row_order:
        parsed.warnings.append(f"Name row type '{name_on_row}' missing from row order {row_order}")
        return

    name_pos = row_order.index(name_on_row)

    def line_for(row_type: str) -> Optional[int]:
        if row_type not in row_order:
            return None
        return name_line_idx + (row_order.index(row_type) - name_pos)

    score_line = line_for("score")
    putts_line = line_for("putts")
    shots_line = line_for("shots")

    if score_line is not None:
        if row_hints.get("score_to_par"):
            vals = _extract_to_par_at(lines, score_line)
        else:
            vals = _extract_row_at(lines, score_line, max_abs=15)
        if vals:
            parsed.score_row = _coerce_18_ints(vals, max_abs=15)
            if row_hints.get("score_to_par"):
                parsed.score_to_par_hint = True
        else:
            parsed.warnings.append(f"Could not extract score row at expected OCR line {score_line}")

    if putts_line is not None and not row_hints.get("suppress_putts"):
        vals = _extract_row_at(lines, putts_line, max_abs=6)
        if vals:
            parsed.putts_row = _coerce_18_ints(vals, max_abs=6)

    if shots_line is not None:
        vals = _extract_row_at(lines, shots_line, max_abs=10)
        if vals:
            parsed.shots_to_green_row = _coerce_18_ints(vals, max_abs=10)


def _normalize_lines(text: str) -> List[str]:
    out: List[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        # Convert markdown table separators and normalize spacing.
        if line.startswith("|") and line.endswith("|"):
            line = line.strip("|").replace("|", " ")
        line = re.sub(r"\s+", " ", line).strip()
        if line and not set(line).issubset({"-", ":", " "}):
            out.append(line)
    return out


# ================================================================
# 2D column-aligned extraction helpers
# ================================================================

def _split_pipe_row(line: str) -> List[str]:
    """Split a markdown pipe-delimited row into trimmed cell strings."""
    s = line.strip()
    if "|" not in s:
        return []
    s = s.strip("|")
    return [c.strip() for c in s.split("|")]


def _find_col_map_in_lines(lines: List[str], *, min_holes: int = 9) -> Optional[Dict[int, int]]:
    """Scan lines for a pipe row containing sequential hole numbers.

    Unlike _find_hole_column_map, holes need not start at 1 — this handles
    back-9 tables where the header is '10 | 11 | ... | 18'.
    Returns {hole_number: col_index} or None.
    """
    for line in lines:
        cells = _split_pipe_row(line)
        if len(cells) < min_holes + 1:
            continue
        col_map: Dict[int, int] = {}
        for col_idx, cell in enumerate(cells):
            try:
                n = int(cell)
            except ValueError:
                continue
            if 1 <= n <= 18:
                col_map[n] = col_idx
        if len(col_map) < min_holes:
            continue
        sorted_holes = sorted(col_map.keys())
        # Must be contiguous sequential holes.
        if sorted_holes != list(range(sorted_holes[0], sorted_holes[0] + len(sorted_holes))):
            continue
        # Column indices must be monotonically increasing.
        if any(col_map[sorted_holes[i + 1]] <= col_map[sorted_holes[i]] for i in range(len(sorted_holes) - 1)):
            continue
        return col_map
    return None


def _find_hole_column_map(raw_lines: List[str]) -> Optional[Dict[int, int]]:
    """Find the hole-number header row for a full or front-9 table (starts at 1)."""
    col_map = _find_col_map_in_lines(raw_lines)
    if col_map is None:
        return None
    if min(col_map.keys()) != 1:
        return None
    return col_map


def _find_split_col_maps(
    raw_lines: List[str],
) -> Optional[Tuple[Tuple[List[str], Dict[int, int], int], Tuple[List[str], Dict[int, int], int]]]:
    """Detect the classic golf-scorecard split: front-9 table + back-9 table.

    Scorecards often have an empty pipe row (|  |  |  |) linking both halves,
    so we can't split by blank lines. Instead, scan for two distinct hole-header
    rows: one starting at hole 1, one starting at hole 10.

    Returns ((front_lines, front_map), (back_lines, back_map)) if found, else None.
    Front lines = all raw_lines up to (not including) the back header row.
    Back lines  = all raw_lines from the back header row onward.
    """
    front_header_idx: Optional[int] = None
    back_header_idx: Optional[int] = None
    front_map: Optional[Dict[int, int]] = None
    back_map: Optional[Dict[int, int]] = None

    for i, line in enumerate(raw_lines):
        col_map = _find_col_map_in_lines([line], min_holes=9)
        if col_map is None:
            continue
        holes = sorted(col_map.keys())
        if holes[0] == 1 and holes[-1] <= 9 and front_header_idx is None:
            front_header_idx = i
            front_map = col_map
        elif holes[0] >= 10 and holes[-1] <= 18 and back_header_idx is None:
            back_header_idx = i
            back_map = col_map
        if front_header_idx is not None and back_header_idx is not None:
            break

    if front_header_idx is None or back_header_idx is None:
        return None

    front_lines = raw_lines[:back_header_idx]
    back_lines = raw_lines[back_header_idx:]
    return (front_lines, front_map, front_header_idx), (back_lines, back_map, back_header_idx)  # type: ignore[return-value]


def _find_unlabeled_section_col_map(
    lines: List[str],
    start_after_idx: int,
    *,
    start_hole: int = 10,
) -> Optional[Tuple[Dict[int, int], int]]:
    """Find a 9-hole col_map from an unlabeled par row (no text label in col0).

    Used to locate a player's back-nine section when the OCR renders it as a
    separate mini-table without a P|10-18 hole-number header.

    Returns (col_map, row_idx_in_lines) or None.
    col_map maps {10:0, 11:1, ..., 18:8} (col0 = first data column).
    """
    for i, line in enumerate(lines):
        if i <= start_after_idx:
            continue
        cells = _split_pipe_row(line)
        if len(cells) < 9:
            continue
        # col0 must be a number, not a text label
        try:
            first_val = int(cells[0].strip())
        except ValueError:
            continue
        # First 9 cells must all be valid par values (3-6)
        try:
            par_vals = [int(cells[j].strip()) for j in range(9)]
        except (ValueError, IndexError):
            continue
        if all(3 <= v <= 6 for v in par_vals) and 25 <= sum(par_vals) <= 45:
            col_map = {start_hole + j: j for j in range(9)}
            return col_map, i
    return None


def _merge_parsed_halves(
    front: "ParsedScorecardRows",
    back: "ParsedScorecardRows",
) -> "ParsedScorecardRows":
    """Merge two 9-hole ParsedScorecardRows (front/back) into one 18-hole result."""

    def _merge_lists(a: list, b: list) -> list:
        # Front half: holes 1-9 → indices 0-8 of a.
        a9 = (list(a) + [None] * 9)[:9]
        # Back half: _col_map_to_18_list places holes 10-18 at indices 9-17 of b.
        b_padded = list(b) + [None] * 18
        b9 = b_padded[9:18]
        return a9 + b9

    merged = ParsedScorecardRows(extraction_mode="2d_column_split")
    merged.course_name = front.course_name or back.course_name
    merged.player_name = front.player_name or back.player_name
    merged.score_to_par_hint = front.score_to_par_hint or back.score_to_par_hint
    merged.warnings = front.warnings + back.warnings
    merged.markdown = front.markdown

    merged.par_row = _merge_lists(front.par_row, back.par_row)
    merged.handicap_row = _merge_lists(front.handicap_row, back.handicap_row)
    merged.score_row = _merge_lists(front.score_row, back.score_row)
    merged.putts_row = _merge_lists(front.putts_row, back.putts_row)
    merged.gir_row = _merge_lists(front.gir_row, back.gir_row)
    merged.shots_to_green_row = _merge_lists(front.shots_to_green_row, back.shots_to_green_row)

    # Merge tee rows by label.
    tee_dict: Dict[str, "ParsedTeeRow"] = {}
    for tr in front.tee_rows:
        tee_dict[tr.label] = ParsedTeeRow(label=tr.label, yardages=_merge_lists(tr.yardages, []))
    for tr in back.tee_rows:
        if tr.label in tee_dict:
            tee_dict[tr.label].yardages = _merge_lists(tee_dict[tr.label].yardages[:9], tr.yardages)
        else:
            tee_dict[tr.label] = ParsedTeeRow(label=tr.label, yardages=_merge_lists([], tr.yardages))
    merged.tee_rows = list(tee_dict.values())

    return merged


def _parse_int_cell(cell: str, *, max_abs: Optional[int] = None) -> Optional[int]:
    """Extract the first integer from a single cell string."""
    normalized = cell.replace("−", "-")
    for k, v in _CIRCLED_TO_DIGIT.items():
        normalized = normalized.replace(k, v)
    m = _INT_RE.search(normalized)
    if m is None:
        return None
    n = int(m.group())
    if max_abs is not None and abs(n) > max_abs:
        return None
    return n


def _parse_to_par_cell(cell: str) -> Optional[int]:
    """Extract a to-par value from a single cell (circled digits → negative)."""
    normalized = cell.replace("−", "-")
    tokens = _TO_PAR_TOKEN_RE.findall(normalized)
    for tok in tokens:
        if tok in _CIRCLED_TO_DIGIT:
            digit = int(_CIRCLED_TO_DIGIT[tok])
            return -digit if digit > 0 else 0
        if tok in {"E", "e"}:
            return 0
        try:
            n = int(tok)
            if -9 <= n <= 9:
                return n
        except ValueError:
            continue
    return None


def _extract_values_by_col_map(
    row_cells: List[str],
    col_map: Dict[int, int],
    *,
    parse_fn: Callable[[str], Optional[int]],
) -> Dict[int, Optional[int]]:
    """Extract one value per hole using the column map."""
    result: Dict[int, Optional[int]] = {}
    for hole_num, col_idx in col_map.items():
        if col_idx >= len(row_cells):
            result[hole_num] = None
        else:
            result[hole_num] = parse_fn(row_cells[col_idx])
    return result


def _col_map_to_18_list(d: Dict[int, Optional[int]]) -> List[Optional[int]]:
    """Convert hole-number-keyed dict to an 18-item positional list."""
    out: List[Optional[int]] = [None] * 18
    for hole_num, val in d.items():
        if 1 <= hole_num <= 18:
            out[hole_num - 1] = val
    return out


def _identify_row_label(cells: List[str]) -> str:
    """Classify a pipe row by its label cell (cells[0])."""
    if not cells:
        return "unknown"
    label = cells[0].lower().strip()
    # A true separator row has only dashes/colons/spaces in the label cell (e.g. `---`).
    # An *empty* label cell is a nameless data row — treat as score_candidate, not separator.
    if label and set(label).issubset({"-", ":", " "}):
        return "separator"
    if "hole" in label:
        return "hole"
    if "par" in label:
        return "par"
    if "handicap" in label or "hdcp" in label or "hcp" in label:
        return "handicap"
    if _ROMAN_RE.match(label) or label in {"blue", "white", "gold", "red", "black", "green", "combo"}:
        return "tee"
    return "score_candidate"


def _extract_2d_from_raw_lines(
    raw_lines: List[str],
    col_map: Dict[int, int],
    player_name: Optional[str],
    row_hints: dict,
    *,
    min_scores: int = 9,
    forced_anchor_line_idx: Optional[int] = None,
    require_name_match: bool = False,
) -> Tuple[Optional[ParsedScorecardRows], int]:
    """Extract all scorecard data using hole-column alignment.

    Returns (result, anchor_line_idx). anchor_line_idx is the index within
    raw_lines of the score anchor row (-1 if not found). The caller can pass
    this value back as forced_anchor_line_idx to extract a second half-table
    at the same row offset, skipping the anchor search entirely.

    When require_name_match=True and a player_name is given, the fallback
    (first score_candidate after handicap) is disabled — returns (None, -1)
    if the name is not found. This prevents wrong-player anchor selection.

    Returns (None, -1) if fewer than min_scores values could be extracted.
    """
    parsed = ParsedScorecardRows(extraction_mode="2d_column")
    preferred_name = (player_name or "").lower().strip()

    classified: List[Tuple[str, List[str], int]] = []  # (label, cells, raw_line_idx)
    for i, line in enumerate(raw_lines):
        cells = _split_pipe_row(line)
        if len(cells) < 2:
            continue
        label = _identify_row_label(cells)
        classified.append((label, cells, i))

    # Par row
    for label, cells, _ in classified:
        if label == "par":
            d = _extract_values_by_col_map(cells, col_map, parse_fn=lambda c: _parse_int_cell(c, max_abs=10))
            vals = _col_map_to_18_list(d)
            valid = [v for v in vals if v is not None and 3 <= v <= 6]
            if len(valid) >= (min_scores // 2 + 1):
                parsed.par_row = vals
            break

    # Handicap row
    for label, cells, _ in classified:
        if label == "handicap":
            d = _extract_values_by_col_map(cells, col_map, parse_fn=lambda c: _parse_int_cell(c, max_abs=18))
            parsed.handicap_row = _col_map_to_18_list(d)
            break

    # Tee rows
    for label, cells, _ in classified:
        if label == "tee":
            tee_label = cells[0].upper().strip()
            d = _extract_values_by_col_map(cells, col_map, parse_fn=lambda c: _parse_int_cell(c))
            yardages = _col_map_to_18_list(d)
            large = [v for v in yardages if v is not None and v >= 80]
            if len(large) >= min_scores // 2:
                parsed.tee_rows.append(ParsedTeeRow(label=tee_label, yardages=yardages))

    # ------------------------------------------------------------------
    # Anchor selection: the row we treat as the player's score row.
    # ------------------------------------------------------------------
    anchor_classified_idx: Optional[int] = None
    anchor_cells: Optional[List[str]] = None
    anchor_raw_line_idx: int = -1

    # Hint path: caller supplies an approximate anchor line index (split-table merge).
    # OCR multi-line cells and differing row counts between front/back can shift rows
    # by up to ±4, so we search that window and pick the candidate with the most
    # parseable score values. Par-subtotal rows (cells[0] contains "/", e.g. "35/34")
    # are skipped so the actual score row wins over the par row.
    if forced_anchor_line_idx is not None and forced_anchor_line_idx >= 0:
        best_cls_i: Optional[int] = None
        best_count: int = 0
        window = range(max(0, forced_anchor_line_idx - 4), forced_anchor_line_idx + 5)
        for cls_i, (label, cells, raw_idx) in enumerate(classified):
            if raw_idx not in window:
                continue
            if label in ("separator", "hole", "par", "handicap", "tee"):
                continue
            if "/" in cells[0]:  # skip par-subtotal rows like "35/34"
                continue
            d = _extract_values_by_col_map(cells, col_map, parse_fn=lambda c: _parse_int_cell(c, max_abs=15))
            cnt = sum(1 for v in d.values() if v is not None)
            if cnt > best_count:
                best_count = cnt
                best_cls_i = cls_i
        if best_cls_i is not None and best_count >= min_scores:
            anchor_classified_idx = best_cls_i
            anchor_cells = classified[best_cls_i][1]
            anchor_raw_line_idx = classified[best_cls_i][2]

    if anchor_cells is None:
        # Find handicap row index in classified list (bounds anchor search below it)
        handicap_classified_idx = next(
            (i for i, (lbl, _, _) in enumerate(classified) if lbl == "handicap"), -1
        )

        if preferred_name:
            for i, (label, cells, _) in enumerate(classified):
                # Require an exact-token match in cells[0] to avoid e.g. "t" matching
                # "White M: 69.1/123". We check cells[0] stripped, and also accept
                # cells[0] as a prefix like "Tucker (index)".
                label_cell = cells[0].strip().lower()
                pref_lower = preferred_name.lower()
                name_matched = (
                    label_cell == pref_lower
                    or label_cell.startswith(pref_lower + " ")
                    or label_cell.startswith(pref_lower + "(")
                    or label_cell.endswith(" " + pref_lower)
                    or f" {pref_lower} " in label_cell
                )
                if not name_matched:
                    continue
                # Validate: row must have at least a few parseable score-range values.
                d = _extract_values_by_col_map(
                    cells, col_map, parse_fn=lambda c: _parse_int_cell(c, max_abs=15)
                )
                if sum(1 for v in d.values() if v is not None) >= max(2, min_scores // 2):
                    anchor_classified_idx = i
                    anchor_cells = cells
                    break

        if anchor_cells is None and require_name_match and preferred_name:
            logger.info("2D extract: require_name_match=True but name not found — returning None")
            return None, -1

        if anchor_cells is None:
            for i, (label, cells, raw_idx) in enumerate(classified):
                if i <= handicap_classified_idx:
                    continue
                if label != "score_candidate":
                    continue
                d = _extract_values_by_col_map(cells, col_map, parse_fn=lambda c: _parse_int_cell(c, max_abs=15))
                if sum(1 for v in d.values() if v is not None) >= min_scores:
                    anchor_classified_idx = i
                    anchor_cells = cells
                    break

        if anchor_cells is not None and anchor_classified_idx is not None:
            anchor_raw_line_idx = classified[anchor_classified_idx][2]

    if anchor_cells is None:
        logger.info("2D extract: no anchor found — returning None")
        return None, -1

    logger.info(
        "2D extract: anchor at classified_idx=%s raw_line=%s cells=%s",
        anchor_classified_idx, anchor_raw_line_idx, anchor_cells,
    )

    # Extract score row values
    if row_hints.get("score_to_par"):
        score_parse_fn: Callable[[str], Optional[int]] = _parse_to_par_cell
        parsed.score_to_par_hint = True
    else:
        score_parse_fn = lambda c: _parse_int_cell(c, max_abs=15)

    score_dict = _extract_values_by_col_map(anchor_cells, col_map, parse_fn=score_parse_fn)

    # Auto-detect to-par: if any extracted value ≤ 0, re-extract with to-par parser
    raw_score_vals = list(score_dict.values())
    if not row_hints.get("score_to_par") and any(v is not None and v <= 0 for v in raw_score_vals):
        score_dict = _extract_values_by_col_map(anchor_cells, col_map, parse_fn=_parse_to_par_cell)
        parsed.score_to_par_hint = True

    parsed.score_row = _col_map_to_18_list(score_dict)

    # ------------------------------------------------------------------
    # Row-order-aware extraction of putts/shots relative to anchor.
    # The user specifies which row their name appears on and the row order,
    # so we use those offsets exactly rather than guessing +1/+2.
    # ------------------------------------------------------------------
    name_on_row: Optional[str] = row_hints.get("name_on_row")
    row_order: List[str] = row_hints.get("row_order") or []

    logger.info(
        "2D extract: row_order=%s name_on_row=%s anchor_is_score_offset=0",
        row_order, name_on_row,
    )

    def _classified_at_offset(offset: int) -> Optional[List[str]]:
        if anchor_classified_idx is None:
            return None
        idx = anchor_classified_idx + offset
        if 0 <= idx < len(classified):
            return classified[idx][1]
        return None

    if name_on_row and row_order and name_on_row in row_order:
        name_pos = row_order.index(name_on_row)

        def _offset_for(row_type: str) -> Optional[int]:
            return row_order.index(row_type) - name_pos if row_type in row_order else None

        score_offset = _offset_for("score")
        putts_offset = _offset_for("putts")
        shots_offset = _offset_for("shots")

        logger.info(
            "2D extract: name_pos=%d score_offset=%s putts_offset=%s shots_offset=%s",
            name_pos, score_offset, putts_offset, shots_offset,
        )

        # Re-extract score from the correct offset (anchor may be putts or shots row)
        if score_offset is not None:
            score_cells = _classified_at_offset(score_offset)
            logger.info("2D extract: score_offset=%d cells=%s", score_offset, score_cells)
            if score_cells is not None:
                if row_hints.get("score_to_par"):
                    sd = _extract_values_by_col_map(score_cells, col_map, parse_fn=_parse_to_par_cell)
                else:
                    sd = _extract_values_by_col_map(score_cells, col_map, parse_fn=lambda c: _parse_int_cell(c, max_abs=15))
                raw_sd = list(sd.values())
                if not row_hints.get("score_to_par") and any(v is not None and v <= 0 for v in raw_sd):
                    sd = _extract_values_by_col_map(score_cells, col_map, parse_fn=_parse_to_par_cell)
                    parsed.score_to_par_hint = True
                parsed.score_row = _col_map_to_18_list(sd)

        if putts_offset is not None and not row_hints.get("suppress_putts"):
            putts_cells = _classified_at_offset(putts_offset)
            logger.info("2D extract: putts_offset=%d cells=%s", putts_offset, putts_cells)
            if putts_cells is not None:
                d = _extract_values_by_col_map(putts_cells, col_map, parse_fn=lambda c: _parse_int_cell(c, max_abs=6))
                parsed.putts_row = _col_map_to_18_list(d)
                logger.info("2D extract: putts_row=%s", parsed.putts_row)

        if shots_offset is not None:
            shots_cells = _classified_at_offset(shots_offset)
            logger.info("2D extract: shots_offset=%d cells=%s", shots_offset, shots_cells)
            if shots_cells is not None:
                d = _extract_values_by_col_map(shots_cells, col_map, parse_fn=lambda c: _parse_int_cell(c, max_abs=10))
                parsed.shots_to_green_row = _col_map_to_18_list(d)
                logger.info("2D extract: shots_row=%s", parsed.shots_to_green_row)

    else:
        logger.info("2D extract: no row_order/name_on_row — using default putts=anchor+1 scan")
        # Default: anchor is score row, putts is the next candidate row below it.
        if not row_hints.get("suppress_putts") and anchor_classified_idx is not None:
            for label, cells, _ in classified[anchor_classified_idx + 1:anchor_classified_idx + 6]:
                if label in ("separator", "hole", "par", "handicap", "tee"):
                    continue
                d = _extract_values_by_col_map(cells, col_map, parse_fn=lambda c: _parse_int_cell(c, max_abs=6))
                vals = _col_map_to_18_list(d)
                if sum(1 for v in vals if v is not None) >= min_scores // 2:
                    parsed.putts_row = vals
                    logger.info("2D extract: putts found via scan cells=%s", cells)
                    break

    if sum(1 for v in parsed.score_row if v is not None) < min_scores:
        logger.info("2D extract: score row ultimately has too few values (%d < %d) after offsets", sum(v is not None for v in parsed.score_row), min_scores)
        return None, -1

    logger.info(
        "2D extract: final score=%s putts=%s shots=%s",
        [v for v in parsed.score_row if v is not None],
        [v for v in parsed.putts_row if v is not None],
        [v for v in parsed.shots_to_green_row if v is not None],
    )

    return parsed, anchor_raw_line_idx


# ================================================================

def _extract_player_name_hint(user_context: Optional[str]) -> Optional[str]:
    ctx = (user_context or "").strip()
    if not ctx:
        return None
    m = _NAME_RE.search(ctx)
    if not m:
        m = _ROW_NAME_RE.search(ctx)
    if not m:
        return None
    name = m.group(1).strip()
    # Truncate at the first sentence-ending period so "T. scores written…"
    # yields "T" rather than "T. Scores Written To Par…".
    if "." in name:
        name = name[: name.index(".")].strip()
    return " ".join(w.capitalize() for w in name.split()) or None


def _extract_row_hints(user_context: Optional[str]) -> dict:
    ctx = (user_context or "").lower()
    single_score_row = any(
        phrase in ctx
        for phrase in (
            "only one row",
            "one row only",
            "single row",
            "row only",
            "final score only",
            "only final score",
            "final scores only",
        )
    )
    name_on_row = _parse_name_on_row(user_context or "")
    row_order = _parse_simple_row_order(user_context or "")
    return {
        "name_on_row": name_on_row,
        "row_order": row_order,
        "row_order_explicit": (
            not single_score_row
            and
            ("first row" in ctx or "first is" in ctx)
            and ("second row" in ctx or "second is" in ctx)
            and ("third row" in ctx or "third is" in ctx)
            and ("shots onto green" in ctx or "shots to green" in ctx)
            and ("putts" in ctx)
            and ("score" in ctx or "final score" in ctx)
        ),
        "score_to_par": ("to par" in ctx) or ("scored to par" in ctx) or ("score-to-par" in ctx),
        "single_score_row": single_score_row,
        "suppress_putts": any(
            phrase in ctx
            for phrase in (
                "no putting",
                "no putts",
                "without putting",
                "without putts",
                "no putt data",
            )
        ),
        "suppress_gir": any(
            phrase in ctx
            for phrase in (
                "no gir",
                "without gir",
                "no g.i.r",
                "without g.i.r",
                "no greens in regulation",
                "without greens in regulation",
            )
        ),
    }


def _apply_field_suppression(parsed: ParsedScorecardRows, row_hints: dict) -> None:
    if row_hints.get("suppress_putts"):
        parsed.putts_row = []
    if row_hints.get("suppress_gir"):
        parsed.gir_row = []


def _extract_course_name(lines: List[str]) -> Optional[str]:
    for line in lines[:12]:
        # Example: "FALLS Hole Location Hole Assignment ..."
        first = line.split(" ", 1)[0].strip(":")
        if _COURSE_RE.match(first) and first.lower() not in {"hole", "out", "in", "tot"}:
            return first.title()
    return None


def _line_ints(line: str, *, max_abs: Optional[int] = None) -> List[int]:
    replaced = line.replace("−", "-")  # normalize Unicode minus sign
    for k, v in _CIRCLED_TO_DIGIT.items():
        replaced = replaced.replace(k, v)
    nums = [int(x) for x in _INT_RE.findall(replaced)]
    if max_abs is not None:
        nums = [n for n in nums if abs(n) <= max_abs]
    return nums


def _extract_hole_numbers(lines: List[str]) -> List[int]:
    best: List[int] = []
    for line in lines:
        if "hole" not in line.lower():
            continue
        nums = _line_ints(line, max_abs=30)
        seq = [n for n in nums if 1 <= n <= 18]
        if len(seq) > len(best):
            best = seq
    # prefer unique ordered 1..18-ish sequence
    dedup: List[int] = []
    seen = set()
    for n in best:
        if n not in seen:
            dedup.append(n)
            seen.add(n)
    return dedup[:18]


def _extract_par_row(lines: List[str]) -> List[int]:
    for line in lines:
        lower = line.lower()
        if "par" not in lower:
            continue
        nums = _line_ints(line, max_abs=15)
        normalized = _normalize_hole_values(nums)
        # Hole pars should be mostly 3/4/5.
        hole_like = [n for n in normalized if 3 <= n <= 6]
        if len(hole_like) >= 9:
            return normalized[:18]
    return []


def _extract_handicap_row(lines: List[str]) -> Tuple[Optional[int], List[int]]:
    for i, line in enumerate(lines):
        if "handicap" in line.lower() or "hdcp" in line.lower():
            nums = [n for n in _line_ints(line, max_abs=18) if 1 <= n <= 18]
            return i, nums
    return None, []


def _extract_tee_rows(lines: List[str]) -> List[Tuple[str, List[int]]]:
    rows: List[Tuple[str, List[int]]] = []
    for line in lines:
        lower = line.lower()
        if "handicap" in lower or "hole" in lower:
            continue
        parts = line.split()
        if not parts:
            continue
        label = parts[0]
        nums = _line_ints(line)
        nums = _normalize_hole_values(nums)
        large = [n for n in nums if n >= 80]
        label_is_tee = _ROMAN_RE.match(label) is not None or "combo" in lower or label.lower() in {
            "blue",
            "white",
            "gold",
            "red",
            "black",
            "green",
        }
        if label_is_tee and len(large) >= 9:
            rows.append((label.upper(), large[:18]))
    return rows


def _extract_score_row(
    lines: List[str],
    player_name: Optional[str],
    tee_rows: List[Tuple[str, List[int]]],
    handicap_idx: Optional[int],
) -> Tuple[Optional[int], List[int]]:
    tee_labels = {label.lower() for label, _ in tee_rows}
    start = (handicap_idx + 1) if handicap_idx is not None else 0
    preferred_name = (player_name or "").lower().strip()

    # Pass 1: row containing player name hint.
    # Search ±2 lines around the named line in case OCR splits name from scores.
    if preferred_name:
        for i in range(len(lines)):
            if preferred_name not in lines[i].lower():
                continue
            for delta in (0, 1, -1, 2, -2):
                j = i + delta
                if j < start or j >= len(lines):
                    continue
                nums = _line_ints(lines[j], max_abs=15)
                normalized = _normalize_hole_values(nums)
                if len(normalized) >= 9:
                    return j, normalized[:18]

    # Pass 2: first small-number row after handicap that doesn't look like tee row.
    for i in range(start, len(lines)):
        line = lines[i]
        lower = line.lower()
        first = lower.split(" ", 1)[0]
        if first in tee_labels:
            continue
        if "handicap" in lower or "hdcp" in lower or "hcp" in lower or "hole" in lower or "par" in lower:
            continue
        nums = _line_ints(line, max_abs=15)
        normalized = _normalize_hole_values(nums)
        if len(normalized) >= 9:
            return i, normalized[:18]
    return None, []


def _extract_next_small_int_row(lines: List[str], start_idx: int, *, max_abs: int) -> List[int]:
    for i in range(max(0, start_idx), min(len(lines), start_idx + 6)):
        nums = _line_ints(lines[i], max_abs=max_abs)
        normalized = _normalize_hole_values(nums)
        if len(normalized) >= 9:
            return normalized[:18]
    return []


def _extract_next_to_par_row(lines: List[str], start_idx: int) -> List[int]:
    for i in range(max(0, start_idx), min(len(lines), start_idx + 6)):
        vals = _line_to_par_values(lines[i])
        normalized = _normalize_hole_values(vals)
        if len(normalized) >= 9:
            return normalized[:18]
    return []


def _extract_next_gir_like_row(lines: List[str], start_idx: int) -> List[Optional[bool]]:
    for i in range(max(0, start_idx), min(len(lines), start_idx + 8)):
        line = lines[i]
        # Convert common circle markers to digits first.
        normalized = line
        for k, v in _CIRCLED_TO_DIGIT.items():
            normalized = normalized.replace(k, v)
        # Keep only explicit 0/1 tokens.
        tokens = re.findall(r"(?<!\d)[01](?!\d)", normalized)
        if len(tokens) >= 9:
            return [t == "1" for t in tokens[:18]]
    return []


def _coerce_18_ints(values: List[int], *, max_abs: Optional[int] = None) -> List[Optional[int]]:
    out: List[Optional[int]] = []
    for n in values[:18]:
        if max_abs is not None and abs(n) > max_abs:
            out.append(None)
        else:
            out.append(n)
    while len(out) < 18:
        out.append(None)
    return out


def _coerce_18_bools(values: List[Optional[bool]]) -> List[Optional[bool]]:
    out = list(values[:18])
    while len(out) < 18:
        out.append(None)
    return out


def _line_to_par_values(line: str) -> List[int]:
    """Parse a score-to-par row while preserving signs and circled symbols.

    Rules:
    - Circled 1 variants are treated as -1 (common birdie notation on cards).
    - Circled 0 / E are treated as 0.
    - Signed ints are preserved.
    """
    raw = line.replace("−", "-")
    tokens = _TO_PAR_TOKEN_RE.findall(raw)
    vals: List[int] = []
    for tok in tokens:
        # Circled digit on a to-par card = negative (① = -1 birdie, ② = -2 eagle, ⓪ = 0 par)
        if tok in _CIRCLED_TO_DIGIT:
            digit = int(_CIRCLED_TO_DIGIT[tok])
            vals.append(-digit if digit > 0 else 0)
            continue
        try:
            n = int(tok)
        except ValueError:
            continue
        if -9 <= n <= 9:
            vals.append(n)
    return vals


def _normalize_hole_values(values: List[int]) -> List[int]:
    """Best-effort normalize a row to 18 hole cells, dropping subtotal columns.

    Common table layout in OCR:
    [h1..h9, OUT, h10..h18, IN, TOT]
    """
    if len(values) <= 18:
        return values

    def looks_like_front_subtotal(subtotal: int, front_nine: List[int]) -> bool:
        if not front_nine:
            return False
        expected = sum(front_nine)
        if abs(subtotal - expected) <= 2:
            return True
        max_hole = max(abs(v) for v in front_nine)
        return abs(subtotal) >= max_hole + 3

    if len(values) >= 20:
        candidate = values[:9] + values[10:19]
        if len(candidate) == 18:
            return candidate
        return values[:18]

    if len(values) == 19:
        if looks_like_front_subtotal(values[9], values[:9]):
            candidate = values[:9] + values[10:19]
            if len(candidate) == 18:
                return candidate
        # Likely [h1..h18, TOT] (or similar trailing aggregate) — keep first 18 holes.
        return values[:18]

    return values[:18]


def _looks_like_to_par_row(values: List[Optional[int]]) -> bool:
    nums = [v for v in values if v is not None]
    if len(nums) < 9:
        return False
    in_range = [v for v in nums if -4 <= v <= 4]
    if len(in_range) < int(0.9 * len(nums)):
        return False
    zeros_ones = [v for v in nums if v in {0, 1, -1}]
    return len(zeros_ones) >= int(0.6 * len(nums))


def _looks_like_shots_row(values: List[Optional[int]]) -> bool:
    nums = [v for v in values if v is not None]
    if len(nums) < 9:
        return False
    return all(1 <= v <= 6 for v in nums) and (sum(nums) / len(nums) <= 3.5)
