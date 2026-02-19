from __future__ import annotations

from datetime import datetime
from pathlib import Path

from models.course import Course
from models.hole import Hole
from models.hole_score import HoleScore
from models.round import Round

from .visualizations import (
    plot_gir_per_round,
    plot_putts_per_round,
    plot_score_trend,
    plot_scoring_vs_handicap,
)


def _build_demo_course() -> Course:
    holes = [Hole(number=i, par=4, handicap=i) for i in range(1, 19)]
    return Course(id="demo-course", name="Demo Course", par=72, holes=holes)


def _build_demo_rounds() -> list[Round]:
    course = _build_demo_course()

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
    round_3_scores = [
        HoleScore(
            hole_number=i,
            strokes=(4 if i % 3 else 5),
            putts=(1 if i % 4 else 2),
            green_in_regulation=(i % 3 != 0),
        )
        for i in range(1, 19)
    ]

    return [
        Round(id="R1", course=course, date=datetime(2026, 2, 1), hole_scores=round_1_scores),
        Round(id="R2", course=course, date=datetime(2026, 2, 8), hole_scores=round_2_scores),
        Round(id="R3", course=course, date=datetime(2026, 2, 15), hole_scores=round_3_scores),
    ]


def main() -> None:
    rounds = _build_demo_rounds()
    output_dir = Path("analytics/output")
    output_dir.mkdir(parents=True, exist_ok=True)

    fig1, _ = plot_putts_per_round(rounds)
    fig1.savefig(output_dir / "putts_per_round.png", dpi=150)

    fig2, _ = plot_gir_per_round(rounds)
    fig2.savefig(output_dir / "gir_per_round.png", dpi=150)

    fig3, _ = plot_score_trend(rounds)
    fig3.savefig(output_dir / "score_trend.png", dpi=150)

    fig4, _ = plot_scoring_vs_handicap(rounds)
    fig4.savefig(output_dir / "scoring_vs_handicap.png", dpi=150)

    print(f"Saved charts to: {output_dir.resolve()}")


if __name__ == "__main__":
    main()
