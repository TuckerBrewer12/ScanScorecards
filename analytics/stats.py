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
