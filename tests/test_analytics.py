from datetime import datetime

import pytest

from analytics.stats import gir_per_round, putts_per_round, round_summary, scoring_vs_hole_handicap
from models.course import Course
from models.hole import Hole
from models.hole_score import HoleScore
from models.round import Round


def _build_course() -> Course:
    holes = [
        Hole(number=i, par=4, handicap=i)
        for i in range(1, 19)
    ]
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


def test_scoring_vs_hole_handicap():
    rounds = _build_rounds()
    rows = scoring_vs_hole_handicap(rounds)

    assert len(rows) == 18
    assert rows[0]["handicap"] == 1
    assert rows[0]["average_to_par"] == pytest.approx(0.5)
    assert rows[0]["sample_size"] == 2

    assert rows[1]["handicap"] == 2
    assert rows[1]["average_to_par"] == pytest.approx(0.0)
    assert rows[1]["sample_size"] == 2
