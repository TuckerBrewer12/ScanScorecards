"""Row-oriented parser adapter for Mistral OCR scorecard output."""

from __future__ import annotations

import re
from typing import List, Optional, Tuple

from pydantic import Field

from models.base import BaseGolfModel


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


_INT_RE = re.compile(r"(?<!\d)-?\d{1,4}(?!\d)")
_ROMAN_RE = re.compile(r"^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)$", re.IGNORECASE)
_COURSE_RE = re.compile(r"^[A-Z0-9 '&.-]{3,}$")
_NAME_RE = re.compile(r"\bmy name is\s+([a-z][a-z '\-]{1,40})\b", re.IGNORECASE)
_ROW_NAME_RE = re.compile(r"\b(?:scan|read|use)\s+([a-z][a-z '\-]{1,40})\s+row\b", re.IGNORECASE)
_TO_PAR_TOKEN_RE = re.compile(r"[+\-−]?\d+|[①❶➀⓿⓪]|[eE]")

_CIRCLED_TO_DIGIT = {
    "⓪": "0",
    "①": "1",
    "❶": "1",
    "➀": "1",
    "⓿": "0",
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


def _extract_player_name_hint(user_context: Optional[str]) -> Optional[str]:
    ctx = (user_context or "").strip()
    if not ctx:
        return None
    m = _NAME_RE.search(ctx)
    if not m:
        m = _ROW_NAME_RE.search(ctx)
    if not m:
        return None
    return " ".join(w.capitalize() for w in m.group(1).split())


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
    return {
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
    replaced = line
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
    if preferred_name:
        for i in range(start, len(lines)):
            line = lines[i]
            if preferred_name in line.lower():
                nums = _line_ints(line, max_abs=15)
                normalized = _normalize_hole_values(nums)
                if len(normalized) >= 9:
                    return i, normalized[:18]

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
        if tok in {"①", "❶", "➀"}:
            vals.append(-1)
            continue
        if tok in {"⓿", "⓪", "E", "e"}:
            vals.append(0)
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

    if len(values) >= 19:
        candidate = values[:9] + values[10:19]
        if len(candidate) == 18:
            return candidate

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
