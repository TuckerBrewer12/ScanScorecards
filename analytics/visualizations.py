from __future__ import annotations

from typing import Iterable, Optional, Sequence

from models.round import Round

from .stats import gir_per_round, putts_per_round, scoring_vs_hole_handicap


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
        labels.append(round_obj.id or f"Round {index}")
    return labels


def plot_putts_per_round(rounds: Sequence[Round], labels: Optional[Sequence[str]] = None):
    """Bar chart: total putts per round."""
    plt = _load_plt()
    rows = putts_per_round(rounds)
    x_labels = list(labels) if labels is not None else _default_labels(rounds)
    values = [row["total_putts"] or 0 for row in rows]

    fig, ax = plt.subplots(figsize=(10, 5))
    ax.bar(x_labels, values)
    ax.set_title("Putts Per Round")
    ax.set_xlabel("Round")
    ax.set_ylabel("Total Putts")
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
    ax.bar(x_labels, values)
    ax.set_title("GIR Percentage Per Round")
    ax.set_xlabel("Round")
    ax.set_ylabel("GIR %")
    ax.set_ylim(0, 100)
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
