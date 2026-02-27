from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from models.round import Round

SCORE_TYPE_ORDER = [
    "eagle",
    "birdie",
    "par",
    "bogey",
    "double_bogey",
    "triple_bogey",
    "quad_bogey",
]


def _valid_hole_scores(round_obj: Round):
    return [score for score in round_obj.hole_scores if score.hole_number is not None]


def _resolve_round_index(rows: List[Dict[str, Any]], round_index: Optional[int]) -> int:
    if not rows:
        raise ValueError("At least one round is required")
    if round_index is None:
        return len(rows) - 1
    if round_index < 0:
        round_index = len(rows) + round_index
    if round_index < 0 or round_index >= len(rows):
        raise IndexError("round_index out of range")
    return round_index


def _average_non_null(values: List[Optional[float]]) -> Optional[float]:
    filtered = [value for value in values if value is not None]
    if not filtered:
        return None
    return sum(filtered) / len(filtered)


def _score_type_from_to_par(to_par: int) -> str:
    if to_par <= -2:
        return "eagle"
    if to_par == -1:
        return "birdie"
    if to_par == 0:
        return "par"
    if to_par == 1:
        return "bogey"
    if to_par == 2:
        return "double_bogey"
    if to_par == 3:
        return "triple_bogey"
    return "quad_bogey"


def round_summary(round_obj: Round) -> Dict[str, Optional[float]]:
    """Compute summary metrics for a single round."""
    hole_scores = _valid_hole_scores(round_obj)
    holes_played = len(hole_scores)
    total_putts = round_obj.get_total_putts()
    total_gir = round_obj.get_total_gir()
    total_strokes = round_obj.calculate_total_score()

    gir_percentage: Optional[float] = None
    putts_per_hole: Optional[float] = None
    if holes_played:
        gir_percentage = (total_gir / holes_played) * 100 if total_gir is not None else None
        putts_per_hole = total_putts / holes_played if total_putts is not None else None

    return {
        "holes_played": float(holes_played),
        "total_strokes": float(total_strokes) if total_strokes is not None else None,
        "total_putts": float(total_putts) if total_putts is not None else None,
        "total_gir": float(total_gir) if total_gir is not None else None,
        "gir_percentage": gir_percentage,
        "putts_per_hole": putts_per_hole,
    }


def metric_comparison_snapshot(
    rows: List[Dict[str, Any]],
    *,
    primary_key: str,
    secondary_key: Optional[str] = None,
    round_index: Optional[int] = None,
    windows: tuple[int, ...] = (5, 10, 20),
    selected_label: str = "Selected Round",
) -> List[Dict[str, Any]]:
    """
    Compare one round against trailing average windows ending at that round.

    The selected round defaults to the most recent row. If a round_index is
    supplied, the trailing averages are computed using rows up to that round.
    """
    target_index = _resolve_round_index(rows, round_index)
    history = rows[: target_index + 1]
    target_row = history[-1]

    result_rows: List[Dict[str, Any]] = [
        {
            "label": selected_label,
            "sample_size": 1,
            "round_id": target_row.get("round_id"),
            "primary_value": target_row.get(primary_key),
            "secondary_value": target_row.get(secondary_key) if secondary_key else None,
        }
    ]

    for window in windows:
        window_rows = history[-window:]
        primary_avg = _average_non_null([row.get(primary_key) for row in window_rows])
        secondary_avg = (
            _average_non_null([row.get(secondary_key) for row in window_rows])
            if secondary_key
            else None
        )
        result_rows.append(
            {
                "label": f"Last {window} Avg",
                "sample_size": len(window_rows),
                "round_id": None,
                "primary_value": primary_avg,
                "secondary_value": secondary_avg,
            }
        )

    return result_rows


def putts_per_round(rounds: Iterable[Round]) -> List[Dict[str, Any]]:
    """Return putt totals by round for plotting/reporting."""
    results: List[Dict[str, Any]] = []
    for index, round_obj in enumerate(rounds, start=1):
        results.append(
            {
                "round_index": index,
                "round_id": round_obj.id,
                "total_putts": round_obj.get_total_putts(),
                "holes_played": len(_valid_hole_scores(round_obj)),
            }
        )
    return results


def score_comparison(rounds: Iterable[Round], round_index: Optional[int] = None) -> List[Dict[str, Any]]:
    """Selected round score vs trailing averages."""
    return metric_comparison_snapshot(
        score_trend(list(rounds)),
        primary_key="total_score",
        secondary_key="to_par",
        round_index=round_index,
        selected_label="Selected Round",
    )


def putts_comparison(rounds: Iterable[Round], round_index: Optional[int] = None) -> List[Dict[str, Any]]:
    """Selected round putts vs trailing averages."""
    return metric_comparison_snapshot(
        putts_per_round(list(rounds)),
        primary_key="total_putts",
        round_index=round_index,
        selected_label="Selected Round",
    )


def three_putts_per_round(rounds: Iterable[Round]) -> List[Dict[str, Any]]:
    """
    Return 3-putt count and percentage for each round.

    3-putt percentage is based on holes with a non-null putts value.
    """
    results: List[Dict[str, Any]] = []
    for index, round_obj in enumerate(rounds, start=1):
        scores_with_putts = [
            score for score in _valid_hole_scores(round_obj) if score.putts is not None
        ]
        three_putt_count = sum(1 for score in scores_with_putts if score.putts >= 3)
        holes_with_putt_data = len(scores_with_putts)
        three_putt_percentage = (
            (three_putt_count / holes_with_putt_data) * 100.0
            if holes_with_putt_data
            else 0.0
        )

        results.append(
            {
                "round_index": index,
                "round_id": round_obj.id,
                "three_putt_count": three_putt_count,
                "holes_with_putt_data": holes_with_putt_data,
                "three_putt_percentage": three_putt_percentage,
            }
        )
    return results


def three_putts_comparison(rounds: Iterable[Round], round_index: Optional[int] = None) -> List[Dict[str, Any]]:
    """Selected round 3-putts vs trailing averages."""
    return metric_comparison_snapshot(
        three_putts_per_round(list(rounds)),
        primary_key="three_putt_count",
        secondary_key="three_putt_percentage",
        round_index=round_index,
        selected_label="Selected Round",
    )


def scrambling_per_round(rounds: Iterable[Round]) -> List[Dict[str, Any]]:
    """
    Scrambling by round using the user's rule:
    - Opportunity: hole where GIR is False
    - Success: opportunity hole where strokes == par
    """
    results: List[Dict[str, Any]] = []
    for index, round_obj in enumerate(rounds, start=1):
        opportunities = 0
        successes = 0

        if round_obj.course:
            for score in _valid_hole_scores(round_obj):
                if (
                    score.hole_number is None
                    or score.green_in_regulation is None
                    or score.strokes is None
                ):
                    continue
                hole = round_obj.course.get_hole(score.hole_number)
                if not hole or hole.par is None:
                    continue

                if score.green_in_regulation is False:
                    opportunities += 1
                    if score.strokes == hole.par:
                        successes += 1

        percentage = (successes / opportunities * 100.0) if opportunities else 0.0
        results.append(
            {
                "round_index": index,
                "round_id": round_obj.id,
                "scramble_opportunities": opportunities,
                "scramble_successes": successes,
                "scramble_failures": opportunities - successes,
                "scrambling_percentage": percentage,
            }
        )
    return results


def scrambling_comparison(rounds: Iterable[Round], round_index: Optional[int] = None) -> List[Dict[str, Any]]:
    """Selected round scrambling vs trailing averages."""
    return metric_comparison_snapshot(
        scrambling_per_round(list(rounds)),
        primary_key="scramble_successes",
        secondary_key="scrambling_percentage",
        round_index=round_index,
        selected_label="Selected Round",
    )


def score_trend(rounds: Iterable[Round]) -> List[Dict[str, Any]]:
    """Return total score trend data by round."""
    results: List[Dict[str, Any]] = []
    for index, round_obj in enumerate(rounds, start=1):
        total_score = round_obj.calculate_total_score()
        total_to_par = round_obj.total_to_par()
        results.append(
            {
                "round_index": index,
                "round_id": round_obj.id,
                "total_score": total_score,
                "to_par": total_to_par,
            }
        )
    return results


def gir_per_round(rounds: Iterable[Round]) -> List[Dict[str, Any]]:
    """Return GIR totals and percentage by round."""
    results: List[Dict[str, Any]] = []
    for index, round_obj in enumerate(rounds, start=1):
        holes_played = len(_valid_hole_scores(round_obj))
        total_gir = round_obj.get_total_gir()
        gir_percentage: Optional[float] = None
        if holes_played and total_gir is not None:
            gir_percentage = (total_gir / holes_played) * 100

        results.append(
            {
                "round_index": index,
                "round_id": round_obj.id,
                "total_gir": total_gir,
                "holes_played": holes_played,
                "gir_percentage": gir_percentage,
            }
        )
    return results


def gir_comparison(rounds: Iterable[Round], round_index: Optional[int] = None) -> List[Dict[str, Any]]:
    """Selected round GIR vs trailing averages."""
    return metric_comparison_snapshot(
        gir_per_round(list(rounds)),
        primary_key="total_gir",
        secondary_key="gir_percentage",
        round_index=round_index,
        selected_label="Selected Round",
    )


def putts_per_gir(rounds: Iterable[Round]) -> List[Dict[str, Any]]:
    """
    Return putts-per-GIR by round.

    Formula:
    - putts_on_gir: sum(putts on holes where GIR is True)
    - putts_per_gir: putts_on_gir / GIR count
    """
    results: List[Dict[str, Any]] = []
    for index, round_obj in enumerate(rounds, start=1):
        gir_scores = [
            score for score in _valid_hole_scores(round_obj)
            if score.green_in_regulation is True
        ]
        gir_count = len(gir_scores)
        putts_on_gir = sum(score.putts for score in gir_scores if score.putts is not None)
        gir_with_putt_data = sum(1 for score in gir_scores if score.putts is not None)
        metric = (putts_on_gir / gir_count) if gir_count else None

        results.append(
            {
                "round_index": index,
                "round_id": round_obj.id,
                "putts_on_gir": putts_on_gir,
                "gir_count": gir_count,
                "gir_with_putt_data": gir_with_putt_data,
                "putts_per_gir": metric,
            }
        )
    return results


def putts_per_gir_comparison(rounds: Iterable[Round], round_index: Optional[int] = None) -> List[Dict[str, Any]]:
    """Selected round putts-per-GIR vs trailing averages."""
    return metric_comparison_snapshot(
        putts_per_gir(list(rounds)),
        primary_key="putts_per_gir",
        secondary_key="putts_on_gir",
        round_index=round_index,
        selected_label="Selected Round",
    )


def overall_putts_per_gir(rounds: Iterable[Round]) -> Dict[str, Optional[float]]:
    """Aggregate putts-on-GIR and putts-per-GIR across all rounds."""
    total_putts_on_gir = 0
    total_gir = 0
    rounds_with_data = 0

    for round_obj in rounds:
        gir_scores = [
            score for score in _valid_hole_scores(round_obj)
            if score.green_in_regulation is True
        ]
        gir_count = len(gir_scores)
        if gir_count:
            rounds_with_data += 1

        total_gir += gir_count
        total_putts_on_gir += sum(score.putts for score in gir_scores if score.putts is not None)

    return {
        "rounds_with_data": float(rounds_with_data),
        "total_gir": float(total_gir),
        "total_putts_on_gir": float(total_putts_on_gir),
        "putts_per_gir": (total_putts_on_gir / total_gir) if total_gir else None,
    }


def overall_gir_percentage(rounds: Iterable[Round]) -> Dict[str, Optional[float]]:
    """Aggregate GIR percentage across all rounds."""
    total_holes = 0
    total_gir = 0
    rounds_with_data = 0

    for round_obj in rounds:
        hole_scores = _valid_hole_scores(round_obj)
        holes_played = len(hole_scores)
        gir = round_obj.get_total_gir()
        if holes_played:
            total_holes += holes_played
            if gir is not None:
                total_gir += gir
                rounds_with_data += 1

    misses = total_holes - total_gir
    return {
        "rounds_with_data": float(rounds_with_data),
        "holes_played": float(total_holes),
        "total_gir": float(total_gir),
        "total_missed_gir": float(misses),
        "gir_percentage": (total_gir / total_holes) * 100 if total_holes else None,
    }


def gir_vs_non_gir_score_distribution(rounds: Iterable[Round]) -> List[Dict[str, Any]]:
    """
    Aggregate score-type percentages for GIR holes vs non-GIR holes.

    Returns two rows:
    - GIR
    - No GIR
    """
    buckets = {
        "GIR": {name: 0 for name in SCORE_TYPE_ORDER},
        "No GIR": {name: 0 for name in SCORE_TYPE_ORDER},
    }
    totals = {"GIR": 0, "No GIR": 0}

    for round_obj in rounds:
        if not round_obj.course:
            continue

        for hole_score in _valid_hole_scores(round_obj):
            if (
                hole_score.hole_number is None
                or hole_score.strokes is None
                or hole_score.green_in_regulation is None
            ):
                continue

            hole = round_obj.course.get_hole(hole_score.hole_number)
            if not hole or hole.par is None:
                continue

            bucket = "GIR" if hole_score.green_in_regulation else "No GIR"
            score_type = _score_type_from_to_par(hole_score.strokes - hole.par)
            buckets[bucket][score_type] += 1
            totals[bucket] += 1

    results: List[Dict[str, Any]] = []
    for bucket in ("GIR", "No GIR"):
        row: Dict[str, Any] = {
            "bucket": bucket,
            "holes_counted": totals[bucket],
        }
        for name in SCORE_TYPE_ORDER:
            row[name] = (buckets[bucket][name] / totals[bucket] * 100.0) if totals[bucket] else 0.0
        results.append(row)

    return results


def scoring_vs_hole_handicap(rounds: Iterable[Round]) -> List[Dict[str, Any]]:
    """
    Aggregate average score-to-par by hole handicap.

    Output rows:
    - handicap: 1-18
    - average_to_par: mean(strokes - par)
    - sample_size: number of scored holes used
    """
    by_handicap: Dict[int, List[int]] = {}

    for round_obj in rounds:
        if not round_obj.course:
            continue

        for hole_score in _valid_hole_scores(round_obj):
            if hole_score.hole_number is None or hole_score.strokes is None:
                continue

            hole = round_obj.course.get_hole(hole_score.hole_number)
            if not hole or hole.par is None or hole.handicap is None:
                continue

            to_par = hole_score.strokes - hole.par
            by_handicap.setdefault(hole.handicap, []).append(to_par)

    results: List[Dict[str, Any]] = []
    for handicap in sorted(by_handicap):
        values = by_handicap[handicap]
        results.append(
            {
                "handicap": handicap,
                "average_to_par": sum(values) / len(values),
                "sample_size": len(values),
            }
        )

    return results


def scoring_by_par(rounds: Iterable[Round]) -> List[Dict[str, Any]]:
    """
    Aggregate scoring performance by hole par (3, 4, 5).

    Output rows:
    - par: 3, 4, or 5
    - average_to_par: mean(strokes - par)
    - average_strokes: mean(strokes)
    - sample_size: number of holes included
    """
    by_par: Dict[int, List[int]] = {}

    for round_obj in rounds:
        if not round_obj.course:
            continue

        for hole_score in _valid_hole_scores(round_obj):
            if hole_score.hole_number is None or hole_score.strokes is None:
                continue

            hole = round_obj.course.get_hole(hole_score.hole_number)
            if not hole or hole.par is None:
                continue
            if hole.par not in (3, 4, 5):
                continue

            by_par.setdefault(hole.par, []).append(hole_score.strokes)

    results: List[Dict[str, Any]] = []
    for par in sorted(by_par):
        strokes = by_par[par]
        avg_strokes = sum(strokes) / len(strokes)
        results.append(
            {
                "par": par,
                "average_to_par": avg_strokes - par,
                "average_strokes": avg_strokes,
                "sample_size": len(strokes),
            }
        )
    return results


def score_type_distribution_per_round(rounds: Iterable[Round]) -> List[Dict[str, Any]]:
    """
    Percentage of holes by score type for each round.

    Categories:
    - eagle (includes eagle or better)
    - birdie, par, bogey, double_bogey, triple_bogey, quad_bogey

    Anything worse than quad bogey is counted as quad_bogey.
    """
    results: List[Dict[str, Any]] = []

    for index, round_obj in enumerate(rounds, start=1):
        counts = {name: 0 for name in SCORE_TYPE_ORDER}
        total = 0

        if round_obj.course:
            for hole_score in _valid_hole_scores(round_obj):
                if hole_score.hole_number is None or hole_score.strokes is None:
                    continue
                hole = round_obj.course.get_hole(hole_score.hole_number)
                if not hole or hole.par is None:
                    continue

                score_type = _score_type_from_to_par(hole_score.strokes - hole.par)
                counts[score_type] += 1
                total += 1

        row: Dict[str, Any] = {
            "round_index": index,
            "round_id": round_obj.id,
            "holes_counted": total,
        }
        for name in SCORE_TYPE_ORDER:
            row[name] = (counts[name] / total * 100.0) if total else 0.0
        results.append(row)

    return results
