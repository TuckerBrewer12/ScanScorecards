from __future__ import annotations

import argparse
import asyncio
from pathlib import Path
from typing import List

from analytics.visualizations import (
    plot_gir_per_round,
    plot_putts_per_round,
    plot_scoring_by_par,
    plot_score_trend,
    plot_score_type_distribution_per_round,
    plot_scoring_vs_handicap,
    plot_three_putts_per_round,
)
from database.connection import DatabasePool
from database.db_manager import DatabaseManager
from models.round import Round


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate analytics charts for a player from PostgreSQL data."
    )
    parser.add_argument("--email", required=True, help="Player email in users.users")
    parser.add_argument(
        "--outdir",
        default="analytics/output",
        help="Directory where chart PNGs are written",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=200,
        help="Max rounds to load for the player",
    )
    parser.add_argument(
        "--dsn",
        default=None,
        help="Optional PostgreSQL DSN. If omitted, uses connection defaults.",
    )
    return parser.parse_args()


def _has_putt_data(rounds: List[Round]) -> bool:
    for round_obj in rounds:
        for score in round_obj.hole_scores:
            if score.putts is not None:
                return True
    return False


def _has_gir_data(rounds: List[Round]) -> bool:
    for round_obj in rounds:
        for score in round_obj.hole_scores:
            if score.green_in_regulation is not None:
                return True
    return False


def _has_handicap_scoring_data(rounds: List[Round]) -> bool:
    for round_obj in rounds:
        if not round_obj.course:
            continue
        for score in round_obj.hole_scores:
            if score.hole_number is None or score.strokes is None:
                continue
            hole = round_obj.course.get_hole(score.hole_number)
            if hole and hole.par is not None and hole.handicap is not None:
                return True
    return False


def _has_par_scoring_data(rounds: List[Round]) -> bool:
    for round_obj in rounds:
        if not round_obj.course:
            continue
        for score in round_obj.hole_scores:
            if score.hole_number is None or score.strokes is None:
                continue
            hole = round_obj.course.get_hole(score.hole_number)
            if hole and hole.par in (3, 4, 5):
                return True
    return False


async def _load_rounds(email: str, dsn: str | None, limit: int) -> tuple[str, List[Round]]:
    pool = DatabasePool()
    await pool.initialize(dsn=dsn)
    db = DatabaseManager(pool.pool)
    try:
        user = await db.users.get_user_by_email(email)
        if not user:
            raise RuntimeError(f"No user found for email: {email}")
        rounds = await db.rounds.get_rounds_for_user(user.id, limit=limit)
        if not rounds:
            raise RuntimeError(f"No rounds found for user: {email}")
        rounds.sort(key=lambda r: r.date or 0)
        return user.name or email, rounds
    finally:
        await pool.close()


async def main_async() -> None:
    args = _parse_args()
    player_label, rounds = await _load_rounds(args.email, args.dsn, args.limit)

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    written: list[Path] = []

    fig, _ = plot_score_trend(rounds)
    score_path = outdir / "score_trend.png"
    fig.savefig(score_path, dpi=150)
    written.append(score_path)

    if _has_handicap_scoring_data(rounds):
        fig, _ = plot_scoring_vs_handicap(rounds)
        svh_path = outdir / "scoring_vs_handicap.png"
        fig.savefig(svh_path, dpi=150)
        written.append(svh_path)
    else:
        print("Skipping score-vs-handicap chart: missing par/handicap or strokes data.")

    if _has_par_scoring_data(rounds):
        fig, _ = plot_scoring_by_par(rounds)
        sbp_path = outdir / "scoring_by_par.png"
        fig.savefig(sbp_path, dpi=150)
        written.append(sbp_path)
    else:
        print("Skipping scoring-by-par chart: missing par or strokes data.")

    if _has_par_scoring_data(rounds):
        fig, _ = plot_score_type_distribution_per_round(rounds)
        std_path = outdir / "score_type_distribution_per_round.png"
        fig.savefig(std_path, dpi=150)
        written.append(std_path)
    else:
        print("Skipping score-type distribution chart: missing par or strokes data.")

    if _has_putt_data(rounds):
        fig, _ = plot_putts_per_round(rounds)
        putts_path = outdir / "putts_per_round.png"
        fig.savefig(putts_path, dpi=150)
        written.append(putts_path)

        fig, _, _ = plot_three_putts_per_round(rounds)
        three_putts_path = outdir / "three_putts_per_round.png"
        fig.savefig(three_putts_path, dpi=150)
        written.append(three_putts_path)
    else:
        print("Skipping putts chart: no putt values found.")

    if _has_gir_data(rounds):
        fig, _ = plot_gir_per_round(rounds)
        gir_path = outdir / "gir_per_round.png"
        fig.savefig(gir_path, dpi=150)
        written.append(gir_path)
    else:
        print("Skipping GIR chart: no GIR values found.")

    print(f"Generated {len(written)} chart(s) for {player_label}:")
    for path in written:
        print(path.resolve())


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
