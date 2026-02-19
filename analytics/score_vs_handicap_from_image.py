from __future__ import annotations

from pathlib import Path

from analytics.stats import scoring_vs_hole_handicap
from analytics.visualizations import plot_scoring_vs_handicap
from llm.scorecard_extractor import extract_scorecard
from llm.strategies import ExtractionStrategy


DEFAULT_IMAGE = Path("tests/test_scorecards/eaglevins_90.jpg")
DEFAULT_OUTPUT = Path("analytics/output/score_vs_handicap_from_image.png")


def main() -> None:
    image_path = DEFAULT_IMAGE
    if not image_path.exists():
        raise FileNotFoundError(f"Scorecard image not found: {image_path}")

    result = extract_scorecard(
        image_path,
        strategy=ExtractionStrategy.FULL,
        include_raw_response=False,
    )

    rows = scoring_vs_hole_handicap([result.round])
    if not rows:
        raise RuntimeError(
            "No score-vs-handicap data could be computed from the extracted round."
        )

    output_path = DEFAULT_OUTPUT
    output_path.parent.mkdir(parents=True, exist_ok=True)

    fig, _ = plot_scoring_vs_handicap([result.round])
    fig.savefig(output_path, dpi=150)

    print(f"Saved: {output_path.resolve()}")
    print("Handicap, AvgToPar, SampleSize")
    for row in rows:
        print(f"{row['handicap']},{row['average_to_par']:.2f},{row['sample_size']}")


if __name__ == "__main__":
    main()
