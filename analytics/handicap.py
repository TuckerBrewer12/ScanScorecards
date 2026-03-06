"""World Handicap System (WHS) handicap index calculation."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from models.round import Round

# WHS reduction table: number of differentials available → (count_to_use, adjustment)
# Requires at least 3 rounds with valid course rating + slope to produce a handicap.
_WHS_TABLE: List[tuple[int, float]] = [
    (1, -2.0),   # 3 rounds
    (1, -1.0),   # 4
    (1, 0.0),    # 5
    (2, -1.0),   # 6
    (2, 0.0),    # 7
    (2, 0.0),    # 8
    (3, 0.0),    # 9
    (3, 0.0),    # 10
    (4, 0.0),    # 11
    (4, 0.0),    # 12
    (5, 0.0),    # 13
    (5, 0.0),    # 14
    (6, 0.0),    # 15
    (6, 0.0),    # 16
    (6, 0.0),    # 17
    (7, 0.0),    # 18
    (7, 0.0),    # 19
    (8, 0.0),    # 20+
]


def score_differential(score: int, course_rating: float, slope_rating: float) -> float:
    """WHS score differential = (Score - Course Rating) × 113 / Slope Rating."""
    return (score - course_rating) * 113.0 / slope_rating


def _get_differential_for_round(round_obj: Round) -> Optional[float]:
    """Return the score differential for a round, or None if data is unavailable."""
    total = round_obj.calculate_total_score()
    if total is None:
        return None

    tee = round_obj.get_tee()
    if tee is None or tee.course_rating is None or tee.slope_rating is None:
        return None

    return score_differential(total, tee.course_rating, tee.slope_rating)


def score_differentials_per_round(rounds: Iterable[Round]) -> List[Dict[str, Any]]:
    """Return per-round differentials (oldest-first list of rounds)."""
    results: List[Dict[str, Any]] = []
    for index, round_obj in enumerate(rounds, start=1):
        diff = _get_differential_for_round(round_obj)
        tee = round_obj.get_tee()
        results.append(
            {
                "round_index": index,
                "round_id": round_obj.id,
                "score": round_obj.calculate_total_score(),
                "course_rating": tee.course_rating if tee else None,
                "slope_rating": tee.slope_rating if tee else None,
                "differential": round(diff, 1) if diff is not None else None,
            }
        )
    return results


def handicap_index(rounds: Iterable[Round], use_last_n: int = 20) -> Optional[float]:
    """
    Calculate the current WHS Handicap Index.

    Uses the last `use_last_n` rounds with valid differentials. Applies the
    WHS reduction table when fewer than 20 valid rounds are available. Returns
    None if fewer than 3 valid rounds exist.
    """
    all_rounds = list(rounds)
    # Take only last N
    recent = all_rounds[-use_last_n:]

    diffs = [_get_differential_for_round(r) for r in recent]
    valid = sorted(d for d in diffs if d is not None)

    n = len(valid)
    if n < 3:
        return None

    # WHS table is indexed by (n - 3) capped at 17 (for 20+)
    table_idx = min(n - 3, len(_WHS_TABLE) - 1)
    count, adjustment = _WHS_TABLE[table_idx]

    best = valid[:count]
    hi = (sum(best) / len(best)) * 0.96 + adjustment

    # WHS caps index at 54.0
    hi = min(hi, 54.0)
    return round(hi, 1)


def handicap_trend(rounds: Iterable[Round]) -> List[Dict[str, Any]]:
    """
    Rolling handicap index after each round (oldest-first).

    Each entry shows what the handicap index would have been after that round
    was played. Returns None for rounds where not enough history exists.
    """
    all_rounds = list(rounds)
    results: List[Dict[str, Any]] = []

    for i, round_obj in enumerate(all_rounds, start=1):
        # Use all rounds up to and including this one
        hi = handicap_index(all_rounds[:i])
        results.append(
            {
                "round_index": i,
                "round_id": round_obj.id,
                "handicap_index": hi,
            }
        )

    return results
