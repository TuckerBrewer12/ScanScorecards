from datetime import datetime

import pytest

from analytics.stats import (
    gir_per_round,
    putts_per_round,
    round_summary,
    score_trend,
    score_type_distribution_per_round,
    scoring_by_par,
    scoring_vs_hole_handicap,
)
from models.course import Course
from models.hole import Hole
from models.hole_score import HoleScore
from models.round import Round


def _build_course() -> Course:
    holes = []
    for i in range(1, 19):
        if i <= 4:
            par = 3
        elif i <= 14:
            par = 4
        else:
            par = 5
        holes.append(Hole(number=i, par=par, handicap=i))
    return Course(id="course-1", name="Demo Course", par=72, holes=holes)


def _build_rounds():
    course = _build_course()

    round_1_scores = [
        HoleScore(
            hole_number=i,
            strokes=4,
            putts=2,
            green_in_regulation=(i <= 10),
        )
        for i in range(1, 19)
    ]
    round_2_scores = [
        HoleScore(
            hole_number=i,
            strokes=(5 if i % 2 == 1 else 4),
            putts=(2 if i % 2 == 1 else 1),
            green_in_regulation=(i % 2 == 0),
        )
        for i in range(1, 19)
    ]

    round_1 = Round(id="r1", course=course, date=datetime(2026, 2, 1), hole_scores=round_1_scores)
    round_2 = Round(id="r2", course=course, date=datetime(2026, 2, 2), hole_scores=round_2_scores)
    return [round_1, round_2]


def test_round_summary():
    rounds = _build_rounds()
    summary = round_summary(rounds[0])

    assert summary["holes_played"] == 18
    assert summary["total_putts"] == 36
    assert summary["total_gir"] == 10
    assert summary["gir_percentage"] == pytest.approx(55.5555, rel=1e-3)
    assert summary["putts_per_hole"] == 2


def test_putts_and_gir_per_round():
    rounds = _build_rounds()

    putts_rows = putts_per_round(rounds)
    gir_rows = gir_per_round(rounds)

    assert [row["total_putts"] for row in putts_rows] == [36, 27]
    assert [row["total_gir"] for row in gir_rows] == [10, 9]
    assert gir_rows[0]["gir_percentage"] == pytest.approx(55.5555, rel=1e-3)
    assert gir_rows[1]["gir_percentage"] == 50.0


def test_score_trend():
    rounds = _build_rounds()
    rows = score_trend(rounds)

    assert [row["total_score"] for row in rows] == [72, 81]
    assert [row["to_par"] for row in rows] == [0, 9]


def test_scoring_by_par():
    rounds = _build_rounds()
    rows = scoring_by_par(rounds)
    by_par = {row["par"]: row for row in rows}

    assert set(by_par.keys()) == {3, 4, 5}
    assert by_par[3]["sample_size"] == 8
    assert by_par[4]["sample_size"] == 20
    assert by_par[5]["sample_size"] == 8

    assert by_par[3]["average_to_par"] == pytest.approx(1.25)
    assert by_par[4]["average_to_par"] == pytest.approx(0.25)
    assert by_par[5]["average_to_par"] == pytest.approx(-0.75)


def test_score_type_distribution_per_round():
    rounds = _build_rounds()
    rows = score_type_distribution_per_round(rounds)

    # Round 1: all holes are +1 on this synthetic dataset.
    assert rows[0]["bogey"] == pytest.approx(100.0)
    assert rows[0]["birdie"] == 0.0
    assert rows[0]["par"] == 0.0

    # Round 2 on this synthetic dataset:
    # holes 1-4 (par3): +2 on odd, +1 on even -> 2 double, 2 bogey
    # holes 5-14 (par4): +1 on odd, 0 on even -> 5 bogey, 5 par
    # holes 15-18 (par5): 0 on odd, -1 on even -> 2 par, 2 birdie
    assert rows[1]["double_bogey"] == pytest.approx((2 / 18) * 100)
    assert rows[1]["bogey"] == pytest.approx((7 / 18) * 100)
    assert rows[1]["par"] == pytest.approx((7 / 18) * 100)
    assert rows[1]["birdie"] == pytest.approx((2 / 18) * 100)

    total_pct = (
        rows[1]["eagle"]
        + rows[1]["birdie"]
        + rows[1]["par"]
        + rows[1]["bogey"]
        + rows[1]["double_bogey"]
        + rows[1]["triple_bogey"]
        + rows[1]["quad_bogey"]
    )
    assert total_pct == pytest.approx(100.0)


def test_scoring_vs_hole_handicap():
    rounds = _build_rounds()
    rows = scoring_vs_hole_handicap(rounds)

    assert len(rows) == 18
    assert rows[0]["handicap"] == 1
    assert rows[0]["average_to_par"] == pytest.approx(1.5)
    assert rows[0]["sample_size"] == 2

    assert rows[1]["handicap"] == 2
    assert rows[1]["average_to_par"] == pytest.approx(1.0)
    assert rows[1]["sample_size"] == 2
