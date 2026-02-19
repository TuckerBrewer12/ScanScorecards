from __future__ import annotations

from datetime import datetime
from typing import Iterable, Optional, Sequence

from models.round import Round

from .stats import (
    gir_per_round,
    putts_per_round,
    score_trend,
    score_type_distribution_per_round,
    scoring_by_par,
    scoring_vs_hole_handicap,
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


def plot_gir_per_round(rounds: Sequence[Round], labels: Optional[Sequence[str]] = None):
    """Bar chart: GIR percentage per round."""
    plt = _load_plt()
    rows = gir_per_round(rounds)
    x_labels = list(labels) if labels is not None else _default_labels(rounds)
    values = [row["gir_percentage"] or 0 for row in rows]

    fig, ax = plt.subplots(figsize=(10, 5))
    x = list(range(len(x_labels)))
    ax.bar(x, values)
    ax.set_title("GIR Percentage Per Round")
    ax.set_xlabel("Round")
    ax.set_ylabel("GIR %")
    ax.set_ylim(0, 100)
    _apply_sparse_xticks(ax, x_labels)
    ax.grid(axis="y", alpha=0.2)
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
