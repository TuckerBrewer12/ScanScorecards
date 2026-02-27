from datetime import datetime

import pytest

from analytics.stats import (
    gir_comparison,
    gir_per_round,
    gir_vs_non_gir_score_distribution,
    overall_gir_percentage,
    overall_putts_per_gir,
    putts_comparison,
    putts_per_gir,
    putts_per_gir_comparison,
    putts_per_round,
    round_summary,
    scrambling_comparison,
    score_comparison,
    scrambling_per_round,
    score_trend,
    score_type_distribution_per_round,
    scoring_by_par,
    scoring_vs_hole_handicap,
    three_putts_comparison,
    three_putts_per_round,
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


def test_putts_per_gir():
    rounds = _build_rounds()
    rows = putts_per_gir(rounds)

    assert rows[0]["gir_count"] == 10
    assert rows[0]["putts_on_gir"] == 20
    assert rows[0]["putts_per_gir"] == pytest.approx(2.0)

    assert rows[1]["gir_count"] == 9
    assert rows[1]["putts_on_gir"] == 9
    assert rows[1]["putts_per_gir"] == pytest.approx(1.0)


def test_overall_putts_per_gir_and_gir_percentage():
    rounds = _build_rounds()

    overall_ppg = overall_putts_per_gir(rounds)
    assert overall_ppg["total_gir"] == 19
    assert overall_ppg["total_putts_on_gir"] == 29
    assert overall_ppg["putts_per_gir"] == pytest.approx(29 / 19)

    overall_gir = overall_gir_percentage(rounds)
    assert overall_gir["holes_played"] == 36
    assert overall_gir["total_gir"] == 19
    assert overall_gir["total_missed_gir"] == 17
    assert overall_gir["gir_percentage"] == pytest.approx((19 / 36) * 100)


def test_recent_comparison_snapshots():
    rounds = _build_rounds()

    putts_rows = putts_comparison(rounds)
    assert putts_rows[0]["label"] == "Selected Round"
    assert putts_rows[0]["primary_value"] == 27
    assert putts_rows[1]["label"] == "Last 5 Avg"
    assert putts_rows[1]["primary_value"] == pytest.approx((36 + 27) / 2)
    assert putts_rows[3]["label"] == "Last 20 Avg"
    assert putts_rows[3]["sample_size"] == 2

    gir_rows = gir_comparison(rounds)
    assert gir_rows[0]["primary_value"] == 9
    assert gir_rows[0]["secondary_value"] == 50.0
    assert gir_rows[1]["primary_value"] == pytest.approx((10 + 9) / 2)

    score_rows = score_comparison(rounds)
    assert score_rows[0]["primary_value"] == 81
    assert score_rows[0]["secondary_value"] == 9
    assert score_rows[1]["primary_value"] == pytest.approx((72 + 81) / 2)
    assert score_rows[1]["secondary_value"] == pytest.approx((0 + 9) / 2)

    three_putt_rows = three_putts_comparison(rounds)
    assert three_putt_rows[0]["primary_value"] == 0
    assert three_putt_rows[0]["secondary_value"] == 0.0

    scrambling_rows = scrambling_comparison(rounds)
    assert scrambling_rows[0]["primary_value"] == 2
    assert scrambling_rows[0]["secondary_value"] == pytest.approx((2 / 9) * 100)

    ppg_rows = putts_per_gir_comparison(rounds)
    assert ppg_rows[0]["primary_value"] == pytest.approx(1.0)
    assert ppg_rows[0]["secondary_value"] == 9


def test_gir_vs_non_gir_score_distribution():
    rounds = _build_rounds()
    rows = gir_vs_non_gir_score_distribution(rounds)
    by_bucket = {row["bucket"]: row for row in rows}

    assert by_bucket["GIR"]["holes_counted"] == 19
    assert by_bucket["No GIR"]["holes_counted"] == 17

    assert by_bucket["GIR"]["bogey"] == pytest.approx((6 / 19) * 100)
    assert by_bucket["GIR"]["par"] == pytest.approx((11 / 19) * 100)
    assert by_bucket["GIR"]["birdie"] == pytest.approx((2 / 19) * 100)

    assert by_bucket["No GIR"]["double_bogey"] == pytest.approx((2 / 17) * 100)
    assert by_bucket["No GIR"]["bogey"] == pytest.approx((5 / 17) * 100)
    assert by_bucket["No GIR"]["par"] == pytest.approx((6 / 17) * 100)
    assert by_bucket["No GIR"]["birdie"] == pytest.approx((4 / 17) * 100)

    for row in rows:
        total_pct = sum(row[name] for name in (
            "eagle",
            "birdie",
            "par",
            "bogey",
            "double_bogey",
            "triple_bogey",
            "quad_bogey",
        ))
        assert total_pct == pytest.approx(100.0)


def test_three_putts_per_round():
    rounds = _build_rounds()
    rows = three_putts_per_round(rounds)

    # In round 1, all holes are 2-putts.
    assert rows[0]["three_putt_count"] == 0
    assert rows[0]["holes_with_putt_data"] == 18
    assert rows[0]["three_putt_percentage"] == 0.0

    # In round 2, odd holes are 2-putts and even holes are 1-putts.
    assert rows[1]["three_putt_count"] == 0
    assert rows[1]["holes_with_putt_data"] == 18
    assert rows[1]["three_putt_percentage"] == 0.0


def test_scrambling_per_round():
    rounds = _build_rounds()
    rows = scrambling_per_round(rounds)

    # Round 1: holes 11-18 are missed GIRs; par4 on 11-14 are 4 (success),
    # par5 on 15-18 are 4 (not par, no success).
    assert rows[0]["scramble_opportunities"] == 8
    assert rows[0]["scramble_successes"] == 4
    assert rows[0]["scrambling_percentage"] == 50.0

    # Round 2: missed GIR on odd holes only (9 opps), all odd scores are 5.
    # Success only on odd par5 holes (15,17): 2 successes.
    assert rows[1]["scramble_opportunities"] == 9
    assert rows[1]["scramble_successes"] == 2
    assert rows[1]["scrambling_percentage"] == pytest.approx((2 / 9) * 100)


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
