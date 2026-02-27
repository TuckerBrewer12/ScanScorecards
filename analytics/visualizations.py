from __future__ import annotations

from datetime import datetime
from typing import Iterable, Optional, Sequence

from models.round import Round

from .stats import (
    gir_per_round,
    overall_gir_percentage,
    overall_putts_per_gir,
    gir_vs_non_gir_score_distribution,
    gir_comparison,
    putts_per_gir,
    putts_per_gir_comparison,
    putts_per_round,
    putts_comparison,
    scrambling_per_round,
    scrambling_comparison,
    score_comparison,
    score_trend,
    score_type_distribution_per_round,
    scoring_by_par,
    scoring_vs_hole_handicap,
    three_putts_comparison,
    three_putts_per_round,
)


def _load_plt():
    try:
        import matplotlib.pyplot as plt  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "matplotlib is required for visualizations. Install it with: pip install matplotlib"
        ) from exc
    return plt


def _default_labels(rounds: Sequence[Round]) -> list[str]:
    labels: list[str] = []
    for index, round_obj in enumerate(rounds, start=1):
        if isinstance(round_obj.date, datetime):
            labels.append(round_obj.date.strftime("%Y-%m-%d"))
        elif round_obj.date:
            labels.append(str(round_obj.date))
        else:
            labels.append(f"R{index}")
    return labels


def _apply_sparse_xticks(ax, labels: Sequence[str], max_labels: int = 12) -> None:
    """
    Keep x-axis readable when there are many rounds.

    Shows at most `max_labels` ticks while preserving order.
    """
    count = len(labels)
    if count <= max_labels:
        ax.set_xticks(range(count))
        ax.set_xticklabels(labels, rotation=45, ha="right")
        return

    step = max(1, count // max_labels)
    tick_positions = list(range(0, count, step))
    if tick_positions[-1] != count - 1:
        tick_positions.append(count - 1)

    tick_labels = [labels[i] for i in tick_positions]
    ax.set_xticks(tick_positions)
    ax.set_xticklabels(tick_labels, rotation=45, ha="right")


def _plot_single_axis_comparison_bars(
    title: str,
    rows: Sequence[dict],
    *,
    primary_label: str,
):
    plt = _load_plt()
    labels = [row["label"] for row in rows]
    x = list(range(len(labels)))
    primary_values = [row["primary_value"] or 0 for row in rows]

    fig, ax1 = plt.subplots(figsize=(10, 5))
    ax1.bar(x, primary_values, alpha=0.85, label=primary_label)
    ax1.set_title(title)
    ax1.set_xlabel("Comparison Window")
    ax1.set_ylabel(primary_label)
    ax1.set_xticks(x)
    ax1.set_xticklabels(labels)
    ax1.grid(axis="y", alpha=0.2)

    fig.tight_layout()
    return fig, ax1


def _plot_dual_axis_comparison_bars(
    title: str,
    rows: Sequence[dict],
    *,
    primary_label: str,
    secondary_label: str,
    secondary_limit: Optional[float] = None,
):
    plt = _load_plt()
    labels = [row["label"] for row in rows]
    x = list(range(len(labels)))
    primary_values = [row["primary_value"] or 0 for row in rows]
    secondary_values = [row["secondary_value"] or 0 for row in rows]

    fig, ax1 = plt.subplots(figsize=(10, 5))
    ax1.bar(x, primary_values, alpha=0.85, label=primary_label)
    ax1.set_title(title)
    ax1.set_xlabel("Comparison Window")
    ax1.set_ylabel(primary_label)
    ax1.set_xticks(x)
    ax1.set_xticklabels(labels)
    ax1.grid(axis="y", alpha=0.2)

    ax2 = ax1.twinx()
    ax2.plot(x, secondary_values, color="black", marker="o", linewidth=1.5, label=secondary_label)
    ax2.set_ylabel(secondary_label)
    if secondary_limit is not None:
        ax2.set_ylim(0, secondary_limit)

    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc="upper left")

    fig.tight_layout()
    return fig, ax1, ax2


def plot_putts_per_round(rounds: Sequence[Round], labels: Optional[Sequence[str]] = None):
    """Bar chart: total putts per round."""
    plt = _load_plt()
    rows = putts_per_round(rounds)
    x_labels = list(labels) if labels is not None else _default_labels(rounds)
    values = [row["total_putts"] or 0 for row in rows]

    fig, ax = plt.subplots(figsize=(10, 5))
    x = list(range(len(x_labels)))
    ax.bar(x, values)
    ax.set_title("Putts Per Round")
    ax.set_xlabel("Round")
    ax.set_ylabel("Total Putts")
    _apply_sparse_xticks(ax, x_labels)
    ax.grid(axis="y", alpha=0.2)
    fig.tight_layout()
    return fig, ax


def plot_score_comparison(rounds: Sequence[Round], round_index: Optional[int] = None):
    """Selected round score vs recent average windows."""
    rows = score_comparison(rounds, round_index=round_index)
    return _plot_dual_axis_comparison_bars(
        "Score vs Recent Averages",
        rows,
        primary_label="Total Score",
        secondary_label="To Par",
    )


def plot_putts_comparison(rounds: Sequence[Round], round_index: Optional[int] = None):
    """Selected round putts vs recent average windows."""
    rows = putts_comparison(rounds, round_index=round_index)
    return _plot_single_axis_comparison_bars(
        "Putts vs Recent Averages",
        rows,
        primary_label="Total Putts",
    )


def plot_gir_per_round(rounds: Sequence[Round], labels: Optional[Sequence[str]] = None):
    """Line chart: GIR percentage per round."""
    plt = _load_plt()
    rows = gir_per_round(rounds)
    x_labels = list(labels) if labels is not None else _default_labels(rounds)
    x = list(range(len(x_labels)))
    percentages = [row["gir_percentage"] or 0 for row in rows]

    fig, ax = plt.subplots(figsize=(11, 5))
    ax.plot(x, percentages, color="black", marker="o", linewidth=1.5)
    ax.set_title("GIR Percentage Per Round")
    ax.set_xlabel("Round")
    ax.set_ylabel("GIR %")
    ax.set_ylim(0, 100)
    _apply_sparse_xticks(ax, x_labels)
    ax.grid(axis="y", alpha=0.2)

    fig.tight_layout()
    return fig, ax


def plot_gir_comparison(rounds: Sequence[Round], round_index: Optional[int] = None):
    """Selected round GIR vs recent average windows."""
    rows = gir_comparison(rounds, round_index=round_index)
    return _plot_dual_axis_comparison_bars(
        "GIR vs Recent Averages",
        rows,
        primary_label="GIR Count",
        secondary_label="GIR %",
        secondary_limit=100,
    )


def plot_putts_per_gir(rounds: Sequence[Round], labels: Optional[Sequence[str]] = None):
    """Bar chart: total putts taken on GIR holes by round."""
    plt = _load_plt()
    rows = putts_per_gir(rounds)
    x_labels = list(labels) if labels is not None else _default_labels(rounds)
    x = list(range(len(x_labels)))
    putts_on_gir = [row["putts_on_gir"] for row in rows]

    fig, ax = plt.subplots(figsize=(11, 5))
    ax.bar(x, putts_on_gir, alpha=0.8)
    ax.set_title("Putts On GIR Per Round")
    ax.set_xlabel("Round")
    ax.set_ylabel("Putts On GIR")
    _apply_sparse_xticks(ax, x_labels)
    ax.grid(axis="y", alpha=0.2)

    fig.tight_layout()
    return fig, ax


def plot_putts_per_gir_rate_per_round(
    rounds: Sequence[Round], labels: Optional[Sequence[str]] = None
):
    """Line chart: putts per GIR by round."""
    plt = _load_plt()
    rows = putts_per_gir(rounds)
    x_labels = list(labels) if labels is not None else _default_labels(rounds)
    x = list(range(len(x_labels)))
    rates = [row["putts_per_gir"] or 0 for row in rows]

    fig, ax = plt.subplots(figsize=(11, 5))
    ax.plot(x, rates, color="black", marker="o", linewidth=1.5)
    ax.set_title("Putts Per GIR By Round")
    ax.set_xlabel("Round")
    ax.set_ylabel("Putts Per GIR")
    ax.set_ylim(0, max(3.0, max(rates, default=0) + 0.25))
    _apply_sparse_xticks(ax, x_labels)
    ax.grid(axis="y", alpha=0.2)

    fig.tight_layout()
    return fig, ax


def plot_putts_per_gir_comparison(rounds: Sequence[Round], round_index: Optional[int] = None):
    """Selected round putts-per-GIR vs recent average windows."""
    rows = putts_per_gir_comparison(rounds, round_index=round_index)
    return _plot_dual_axis_comparison_bars(
        "Putts Per GIR vs Recent Averages",
        rows,
        primary_label="Putts Per GIR",
        secondary_label="Putts On GIR",
    )


def plot_gir_vs_non_gir_score_distribution(rounds: Iterable[Round]):
    """
    Stacked bar chart of score-type percentages for GIR vs non-GIR holes.
    """
    plt = _load_plt()
    rows = gir_vs_non_gir_score_distribution(rounds)
    x_labels = [row["bucket"] for row in rows]
    x = list(range(len(x_labels)))

    categories = [
        ("eagle", "Eagle"),
        ("birdie", "Birdie"),
        ("par", "Par"),
        ("bogey", "Bogey"),
        ("double_bogey", "Double"),
        ("triple_bogey", "Triple"),
        ("quad_bogey", "Quad+"),
    ]

    fig, ax = plt.subplots(figsize=(9, 6))
    bottom = [0.0] * len(rows)
    for key, label in categories:
        values = [row[key] for row in rows]
        ax.bar(x, values, bottom=bottom, label=label)
        bottom = [b + v for b, v in zip(bottom, values)]

    ax.set_title("Score Type Distribution: GIR vs No GIR")
    ax.set_xlabel("Bucket")
    ax.set_ylabel("Percent Of Holes")
    ax.set_xticks(x)
    ax.set_xticklabels(x_labels)
    ax.set_ylim(0, 100)
    ax.legend(loc="upper right", ncols=4, fontsize=8)
    ax.grid(axis="y", alpha=0.2)
    fig.tight_layout()
    return fig, ax


def plot_overall_putts_per_gir(rounds: Iterable[Round]):
    """Single-bar chart for aggregate putts per GIR across all rounds."""
    plt = _load_plt()
    summary = overall_putts_per_gir(rounds)
    value = summary["putts_per_gir"] or 0

    fig, ax = plt.subplots(figsize=(6, 5))
    ax.bar(["All Rounds"], [value], color="#1f2937", alpha=0.85)
    ax.set_title("Overall Putts Per GIR")
    ax.set_ylabel("Putts Per GIR")
    ax.set_ylim(0, max(3.0, value + 0.25))
    ax.grid(axis="y", alpha=0.2)

    fig.tight_layout()
    return fig, ax


def plot_overall_gir_percentage(rounds: Iterable[Round]):
    """Single stacked bar for aggregate GIR makes vs misses across all rounds."""
    plt = _load_plt()
    summary = overall_gir_percentage(rounds)
    makes = summary["total_gir"] or 0
    misses = summary["total_missed_gir"] or 0
    percentage = summary["gir_percentage"] or 0

    fig, ax = plt.subplots(figsize=(6, 5))
    ax.bar(["All Rounds"], [makes], color="#22c55e", alpha=0.85, label="GIR")
    ax.bar(["All Rounds"], [misses], bottom=[makes], color="#e5e7eb", alpha=0.95, label="Missed GIR")
    ax.set_title(f"Overall GIR Percentage ({percentage:.1f}%)")
    ax.set_ylabel("Holes")
    ax.grid(axis="y", alpha=0.2)
    ax.legend(loc="upper right")

    fig.tight_layout()
    return fig, ax


def plot_score_trend(rounds: Sequence[Round], labels: Optional[Sequence[str]] = None):
    """Line chart: total score trend by round."""
    plt = _load_plt()
    rows = score_trend(rounds)
    x_labels = list(labels) if labels is not None else _default_labels(rounds)
    values = [row["total_score"] or 0 for row in rows]
    x = list(range(len(x_labels)))

    fig, ax = plt.subplots(figsize=(10, 5))
    ax.plot(x, values, marker="o")
    ax.set_title("Score Trend")
    ax.set_xlabel("Round")
    ax.set_ylabel("Total Score")
    _apply_sparse_xticks(ax, x_labels)
    ax.grid(axis="y", alpha=0.2)
    fig.tight_layout()
    return fig, ax


def plot_scoring_vs_handicap(rounds: Iterable[Round]):
    """Bar chart: average to-par by hole handicap (1 hardest, 18 easiest)."""
    plt = _load_plt()
    rows = scoring_vs_hole_handicap(rounds)
    handicaps = [str(row["handicap"]) for row in rows]
    avg_to_par = [row["average_to_par"] for row in rows]

    fig, ax = plt.subplots(figsize=(11, 5))
    ax.bar(handicaps, avg_to_par)
    ax.set_title("Average Score To Par By Hole Handicap")
    ax.set_xlabel("Hole Handicap")
    ax.set_ylabel("Average To Par")
    ax.axhline(0, color="black", linewidth=1, alpha=0.6)
    ax.grid(axis="y", alpha=0.2)
    fig.tight_layout()
    return fig, ax


def plot_scoring_by_par(rounds: Iterable[Round]):
    """Bar chart: average to-par grouped by par 3 / par 4 / par 5."""
    plt = _load_plt()
    rows = scoring_by_par(rounds)
    pars = [f"Par {row['par']}" for row in rows]
    avg_to_par = [row["average_to_par"] for row in rows]

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.bar(pars, avg_to_par)
    ax.set_title("Average Score To Par By Hole Par")
    ax.set_xlabel("Hole Type")
    ax.set_ylabel("Average To Par")
    ax.axhline(0, color="black", linewidth=1, alpha=0.6)
    ax.grid(axis="y", alpha=0.2)
    fig.tight_layout()
    return fig, ax


def plot_score_type_distribution_per_round(
    rounds: Sequence[Round], labels: Optional[Sequence[str]] = None
):
    """
    Stacked bar chart of score-type percentages per round.
    """
    plt = _load_plt()
    rows = score_type_distribution_per_round(rounds)
    x_labels = list(labels) if labels is not None else _default_labels(rounds)
    x = list(range(len(x_labels)))

    categories = [
        ("eagle", "Eagle"),
        ("birdie", "Birdie"),
        ("par", "Par"),
        ("bogey", "Bogey"),
        ("double_bogey", "Double"),
        ("triple_bogey", "Triple"),
        ("quad_bogey", "Quad+"),
    ]

    fig, ax = plt.subplots(figsize=(12, 6))
    bottom = [0.0] * len(rows)
    for key, label in categories:
        values = [row[key] for row in rows]
        ax.bar(x, values, bottom=bottom, label=label)
        bottom = [b + v for b, v in zip(bottom, values)]

    ax.set_title("Score Type Distribution Per Round")
    ax.set_xlabel("Round")
    ax.set_ylabel("Percent Of Holes")
    ax.set_ylim(0, 100)
    _apply_sparse_xticks(ax, x_labels)
    ax.legend(loc="upper right", ncols=4, fontsize=8)
    ax.grid(axis="y", alpha=0.2)
    fig.tight_layout()
    return fig, ax


def plot_three_putts_per_round(
    rounds: Sequence[Round], labels: Optional[Sequence[str]] = None
):
    """
    Bar chart: number of 3-putts per round.
    """
    plt = _load_plt()
    rows = three_putts_per_round(rounds)
    x_labels = list(labels) if labels is not None else _default_labels(rounds)
    x = list(range(len(x_labels)))
    counts = [row["three_putt_count"] for row in rows]

    fig, ax = plt.subplots(figsize=(11, 5))
    ax.bar(x, counts, alpha=0.8)
    ax.set_title("3-Putts Per Round")
    ax.set_xlabel("Round")
    ax.set_ylabel("3-Putt Count")
    _apply_sparse_xticks(ax, x_labels)
    ax.grid(axis="y", alpha=0.2)

    fig.tight_layout()
    return fig, ax


def plot_three_putt_percentage_per_round(
    rounds: Sequence[Round], labels: Optional[Sequence[str]] = None
):
    """Line chart: 3-putt percentage per round."""
    plt = _load_plt()
    rows = three_putts_per_round(rounds)
    x_labels = list(labels) if labels is not None else _default_labels(rounds)
    x = list(range(len(x_labels)))
    percentages = [row["three_putt_percentage"] for row in rows]

    fig, ax = plt.subplots(figsize=(11, 5))
    ax.plot(x, percentages, color="black", marker="o", linewidth=1.5)
    ax.set_title("3-Putt Percentage Per Round")
    ax.set_xlabel("Round")
    ax.set_ylabel("3-Putt %")
    ax.set_ylim(0, 100)
    _apply_sparse_xticks(ax, x_labels)
    ax.grid(axis="y", alpha=0.2)

    fig.tight_layout()
    return fig, ax


def plot_three_putts_comparison(rounds: Sequence[Round], round_index: Optional[int] = None):
    """Selected round 3-putts vs recent average windows."""
    rows = three_putts_comparison(rounds, round_index=round_index)
    return _plot_dual_axis_comparison_bars(
        "3-Putts vs Recent Averages",
        rows,
        primary_label="3-Putt Count",
        secondary_label="3-Putt %",
        secondary_limit=100,
    )


def plot_scrambling_per_round(
    rounds: Sequence[Round], labels: Optional[Sequence[str]] = None
):
    """
    Stacked bar chart:
    - green: scramble successes
    - red: scramble failures
    Total bar height equals scramble opportunities.
    """
    plt = _load_plt()
    rows = scrambling_per_round(rounds)
    x_labels = list(labels) if labels is not None else _default_labels(rounds)
    x = list(range(len(x_labels)))
    successes = [row["scramble_successes"] for row in rows]
    failures = [row["scramble_failures"] for row in rows]

    fig, ax = plt.subplots(figsize=(11, 5))
    ax.bar(x, successes, color="#22c55e", alpha=0.85, label="Successful Up-and-Downs")
    ax.bar(x, failures, bottom=successes, color="#ef4444", alpha=0.85, label="Missed Chances")
    ax.set_title("Scrambling Opportunities Per Round")
    ax.set_xlabel("Round")
    ax.set_ylabel("Scramble Opportunities")
    _apply_sparse_xticks(ax, x_labels)
    ax.grid(axis="y", alpha=0.2)
    ax.legend(loc="upper left")

    fig.tight_layout()
    return fig, ax


def plot_scrambling_comparison(rounds: Sequence[Round], round_index: Optional[int] = None):
    """Selected round scrambling vs recent average windows."""
    rows = scrambling_comparison(rounds, round_index=round_index)
    return _plot_dual_axis_comparison_bars(
        "Scrambling vs Recent Averages",
        rows,
        primary_label="Scramble Successes",
        secondary_label="Scrambling %",
        secondary_limit=100,
    )
