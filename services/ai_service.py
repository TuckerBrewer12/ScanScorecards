"""Rule-based AI insight engine for golf performance suggestions."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from analytics import handicap as hcap
from analytics import stats as analytics
from api.schemas import AIComparisonItem, AIInsightItem, AIStrengthItem, AISuggestionsResponse
from database.db_manager import DatabaseManager

# ─── Benchmark table ──────────────────────────────────────────────────────────

_TARGET_LABELS: Dict[float, str] = {
    0.0:  "Scratch",
    5.0:  "Breaks 80",
    10.0: "Breaks 85",
    15.0: "Breaks 90",
    20.0: "Breaks 95",
    28.0: "Breaks 100",
}

_BENCHMARK_RANGES = [
    (0, 5, "0–5 HCP"),
    (5, 10, "5–10 HCP"),
    (10, 15, "10–15 HCP"),
    (15, 20, "15–20 HCP"),
    (20, 28, "20–28 HCP"),
    (28, 54, "28–54 HCP"),
]

_BENCHMARKS: Dict[tuple, Dict[str, float]] = {
    (0, 5): {
        "gir_pct": 65.0, "putts_per_gir": 1.75, "scrambling_pct": 60.0,
        "par3_avg_to_par": 0.15, "par4_avg_to_par": 0.60, "par5_avg_to_par": 0.10,
        "three_putts_per_round": 1.0, "putts_per_round": 29.5, "scoring_avg_to_par": 3.0,
    },
    (5, 10): {
        "gir_pct": 45.0, "putts_per_gir": 1.82, "scrambling_pct": 45.0,
        "par3_avg_to_par": 0.50, "par4_avg_to_par": 1.00, "par5_avg_to_par": 0.50,
        "three_putts_per_round": 2.0, "putts_per_round": 31.0, "scoring_avg_to_par": 7.5,
    },
    (10, 15): {
        "gir_pct": 33.0, "putts_per_gir": 1.88, "scrambling_pct": 35.0,
        "par3_avg_to_par": 0.80, "par4_avg_to_par": 1.30, "par5_avg_to_par": 0.75,
        "three_putts_per_round": 2.5, "putts_per_round": 32.0, "scoring_avg_to_par": 12.0,
    },
    (15, 20): {
        "gir_pct": 22.0, "putts_per_gir": 1.92, "scrambling_pct": 25.0,
        "par3_avg_to_par": 1.10, "par4_avg_to_par": 1.60, "par5_avg_to_par": 1.00,
        "three_putts_per_round": 3.0, "putts_per_round": 33.0, "scoring_avg_to_par": 17.5,
    },
    (20, 28): {
        "gir_pct": 14.0, "putts_per_gir": 1.98, "scrambling_pct": 18.0,
        "par3_avg_to_par": 1.40, "par4_avg_to_par": 1.90, "par5_avg_to_par": 1.30,
        "three_putts_per_round": 3.5, "putts_per_round": 34.0, "scoring_avg_to_par": 24.0,
    },
    (28, 54): {
        "gir_pct": 7.0, "putts_per_gir": 2.05, "scrambling_pct": 10.0,
        "par3_avg_to_par": 1.80, "par4_avg_to_par": 2.30, "par5_avg_to_par": 1.70,
        "three_putts_per_round": 4.5, "putts_per_round": 36.0, "scoring_avg_to_par": 36.0,
    },
}


def _get_benchmark(hi: Optional[float]) -> tuple[Dict[str, float], str]:
    if hi is None:
        return _BENCHMARKS[(20, 28)], "Unrated"
    for lo, hi_bound, label in _BENCHMARK_RANGES:
        if lo <= hi < hi_bound:
            return _BENCHMARKS[(lo, hi_bound)], label
    return _BENCHMARKS[(28, 54)], "28–54 HCP"


def _trend_direction(
    values: List[Optional[float]],
    lower_is_better: bool = True,
    threshold: float = 0.1,
) -> str:
    valid = [v for v in values if v is not None]
    if len(valid) < 4:
        return "stable"
    mid = len(valid) // 2
    first_avg = sum(valid[:mid]) / mid
    second_avg = sum(valid[mid:]) / (len(valid) - mid)
    delta = second_avg - first_avg
    if abs(delta) < threshold:
        return "stable"
    if lower_is_better:
        return "improving" if delta < 0 else "declining"
    return "improving" if delta > 0 else "declining"


# ─── Service ──────────────────────────────────────────────────────────────────

class AIService:
    def __init__(self, db: DatabaseManager) -> None:
        self._db = db

    async def generate_suggestions(
        self, user_id: str, limit: int = 50, target_handicap: Optional[float] = None
    ) -> AISuggestionsResponse:
        user = await self._db.users.get_user(user_id)
        rounds_desc = await self._db.rounds.get_rounds_for_user(
            user_id, limit=limit, offset=0
        )
        rounds = list(reversed(rounds_desc))  # chronological order

        hi = hcap.handicap_index(
            rounds,
            seed_handicap=(user.handicap if user else None),
            seed_set_at=(user.last_handicap_update if user else None),
        )
        if target_handicap is not None:
            benchmark, _ = _get_benchmark(target_handicap)
            hi_label = _TARGET_LABELS.get(target_handicap, _get_benchmark(target_handicap)[1])
        else:
            benchmark, hi_label = _get_benchmark(hi)

        if not rounds:
            return AISuggestionsResponse(
                user_id=user_id,
                handicap_index=hi,
                handicap_range_label=hi_label,
                insights=[],
                strengths=[],
                rounds_analyzed=0,
                generated_at=datetime.now(timezone.utc).isoformat(),
            )

        raw = self._compute_raw(rounds)

        insight_fns = [
            self._insight_par_performance,
            self._insight_gir,
            self._insight_scrambling,
            self._insight_three_putts,
            self._insight_putting_quality,
        ]

        insights: List[AIInsightItem] = []
        for fn in insight_fns:
            item = fn(raw, benchmark)
            if item is not None:
                insights.append(item)

        # Sort: highest priority first; tie-break declining before stable/improving
        insights.sort(
            key=lambda x: (-x.priority_score, 0 if x.trend_direction == "declining" else 1)
        )
        insights = insights[:7]

        strengths = self._compute_strengths(raw, benchmark)

        comparisons = self._build_comparisons(raw, benchmark)

        return AISuggestionsResponse(
            user_id=user_id,
            handicap_index=hi,
            handicap_range_label=hi_label,
            insights=insights,
            strengths=strengths,
            comparisons=comparisons,
            rounds_analyzed=len(rounds),
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    # ── Raw data pipeline ─────────────────────────────────────────────────────

    def _compute_raw(self, rounds: list) -> Dict[str, Any]:
        gir_data = analytics.overall_gir_percentage(rounds)
        gir_pct = gir_data.get("gir_percentage")

        putts_gir_data = analytics.overall_putts_per_gir(rounds)
        putts_per_gir = putts_gir_data.get("putts_per_gir")

        scrambling_rows = analytics.scrambling_per_round(rounds)
        scrambling_vals = [
            r["scrambling_percentage"]
            for r in scrambling_rows
            if r.get("scramble_opportunities", 0) > 0
        ]
        avg_scrambling = sum(scrambling_vals) / len(scrambling_vals) if scrambling_vals else None

        three_putt_rows = analytics.three_putts_per_round(rounds)
        three_putt_counts = [
            r["three_putt_count"]
            for r in three_putt_rows
            if r.get("holes_with_putt_data", 0) > 0
        ]
        avg_three_putts = (
            sum(three_putt_counts) / len(three_putt_counts) if three_putt_counts else None
        )

        par_avgs, par_counts = self._par_stats(rounds)
        par_avgs_trend = self._par_stats_per_round(rounds)

        putts_rows = analytics.putts_per_round(rounds)
        putts_vals = [r["total_putts"] for r in putts_rows if r.get("total_putts") is not None]
        avg_putts_per_round = sum(putts_vals) / len(putts_vals) if putts_vals else None

        score_trend_rows = analytics.score_trend(rounds)
        to_par_vals = [r["to_par"] for r in score_trend_rows if r.get("to_par") is not None]
        avg_to_par = sum(to_par_vals) / len(to_par_vals) if to_par_vals else None

        gir_per_round_rows = analytics.gir_per_round(rounds)
        gir_values = [row.get("gir_percentage") for row in gir_per_round_rows]

        three_putt_trend = [r["three_putt_count"] for r in three_putt_rows]
        putts_per_gir_trend = self._putts_per_gir_per_round(rounds)

        return {
            "gir_pct": gir_pct,
            "putts_per_gir": putts_per_gir,
            "avg_scrambling": avg_scrambling,
            "avg_three_putts": avg_three_putts,
            "avg_putts_per_round": avg_putts_per_round,
            "avg_to_par": avg_to_par,
            "par_avgs": par_avgs,
            "par_counts": par_counts,
            "par_avgs_trend": par_avgs_trend,
            "gir_values": gir_values,
            "three_putt_trend": three_putt_trend,
            "putts_per_gir_trend": putts_per_gir_trend,
            "scrambling_rounds_with_data": len(scrambling_vals),
            "num_rounds": len(rounds),
        }

    @staticmethod
    def _par_stats_per_round(rounds: list) -> Dict[int, List[Optional[float]]]:
        """Per-round avg to par by par type — used for trend detection."""
        result: Dict[int, List[Optional[float]]] = {3: [], 4: [], 5: []}
        for r in rounds:
            by_par: Dict[int, List[float]] = {}
            for hs in r.hole_scores:
                if hs.strokes is None:
                    continue
                par: Optional[int] = None
                if r.course and hs.hole_number:
                    hole = r.course.get_hole(hs.hole_number)
                    if hole and hole.par:
                        par = hole.par
                if par is None:
                    par = hs.par_played
                if par not in (3, 4, 5):
                    continue
                by_par.setdefault(par, []).append(float(hs.strokes - par))
            for p in (3, 4, 5):
                vals = by_par.get(p, [])
                result[p].append(sum(vals) / len(vals) if vals else None)
        return result

    @staticmethod
    def _par_stats(rounds: list) -> tuple[Dict[int, float], Dict[int, int]]:
        """Single-pass: returns (avg_to_par_by_par, hole_count_by_par)."""
        by_par: Dict[int, List[float]] = {}
        for r in rounds:
            for hs in r.hole_scores:
                if hs.strokes is None:
                    continue
                par: Optional[int] = None
                if r.course and hs.hole_number:
                    hole = r.course.get_hole(hs.hole_number)
                    if hole and hole.par:
                        par = hole.par
                if par is None:
                    par = hs.par_played
                if par not in (3, 4, 5):
                    continue
                by_par.setdefault(par, []).append(float(hs.strokes - par))
        avgs = {p: sum(vals) / len(vals) for p, vals in by_par.items() if vals}
        counts = {p: len(vals) for p, vals in by_par.items() if vals}
        return avgs, counts

    @staticmethod
    def _putts_per_gir_per_round(rounds: list) -> List[Optional[float]]:
        results: List[Optional[float]] = []
        for r in rounds:
            gir_scores = [
                hs for hs in r.hole_scores
                if hs.green_in_regulation is True and hs.putts is not None
            ]
            results.append(
                sum(hs.putts for hs in gir_scores) / len(gir_scores) if gir_scores else None
            )
        return results

    # ── Insight generators ────────────────────────────────────────────────────

    def _insight_par_performance(
        self, raw: Dict[str, Any], benchmark: Dict[str, float]
    ) -> Optional[AIInsightItem]:
        par_avgs: Dict[int, float] = raw.get("par_avgs", {})
        if not par_avgs:
            return None

        bench_map = {
            3: benchmark["par3_avg_to_par"],
            4: benchmark["par4_avg_to_par"],
            5: benchmark["par5_avg_to_par"],
        }
        par_labels = {3: "Par 3s", 4: "Par 4s", 5: "Par 5s"}

        worst_par: Optional[int] = None
        worst_gap = -999.0
        for par in (3, 4, 5):
            if par not in par_avgs:
                continue
            gap = par_avgs[par] - bench_map[par]
            if gap > worst_gap:
                worst_gap = gap
                worst_par = par

        if worst_par is None or worst_gap <= 0:
            return None

        avg = par_avgs[worst_par]
        bench = bench_map[worst_par]
        priority = min(10.0, worst_gap * 4.0)
        par_avgs_trend: Dict[int, List[Optional[float]]] = raw.get("par_avgs_trend", {})
        trend = _trend_direction(par_avgs_trend.get(worst_par, []))

        hole_count = raw.get("par_counts", {}).get(worst_par, 0)
        num_rounds = raw.get("num_rounds", 1)
        avg_holes_per_round = (hole_count / num_rounds) if num_rounds else 4.0

        what_if = (
            f"Closing the gap on {par_labels[worst_par]} saves "
            f"~{round(worst_gap * avg_holes_per_round, 1)} strokes/round"
        )

        drill_tips_map = {
            3: [
                "Aim for the fat part of the green — avoid short-siding yourself",
                "Practice 50–100 yard shots: they're the most common par 3 approach",
                "Choose a club that takes the front hazard out of play",
            ],
            4: [
                "Prioritize fairways over distance — short iron from fairway beats rough",
                "Practice 100–150 yard approaches, your most common par 4 second shot",
                "Work on lag putting to eliminate 3-putts after missed greens",
            ],
            5: [
                "Lay up to your favorite yardage rather than forcing a long second",
                "Build a reliable bump-and-run when short of the green in three",
                "Track scrambling on par 5s specifically — it drives your par 5 score",
            ],
        }

        return AIInsightItem(
            category=par_labels[worst_par],
            category_group="Ball Striking",
            title=f"Improve Your {par_labels[worst_par]}",
            description=(
                f"You average {round(avg, 2):+.2f} to par on {par_labels[worst_par]}, "
                f"{round(worst_gap, 2)} strokes above peer benchmark."
            ),
            priority_score=round(priority, 2),
            key_metric=round(avg, 2),
            metric_label=f"Avg to par ({par_labels[worst_par]})",
            benchmark=round(bench, 2),
            trend_direction=trend,
            drill_tips=drill_tips_map[worst_par],
            what_if=what_if,
        )

    def _insight_gir(
        self, raw: Dict[str, Any], benchmark: Dict[str, float]
    ) -> Optional[AIInsightItem]:
        gir_pct = raw.get("gir_pct")
        if gir_pct is None:
            return None

        bench = benchmark["gir_pct"]
        gap = bench - gir_pct
        if gap <= 0:
            return None

        priority = min(10.0, gap * 0.25)
        trend = _trend_direction(raw.get("gir_values", []), lower_is_better=False)

        return AIInsightItem(
            category="Greens in Regulation",
            category_group="Ball Striking",
            title="Hit More Greens",
            description=(
                f"Your GIR rate is {round(gir_pct, 1)}% vs the "
                f"{round(bench, 0):.0f}% benchmark for your handicap range."
            ),
            priority_score=round(priority, 2),
            key_metric=round(gir_pct, 1),
            metric_label="GIR %",
            benchmark=round(bench, 1),
            trend_direction=trend,
            drill_tips=[
                "Practice from your average GIR miss distance",
                "Distance control first — most missed greens come from poor yardage management",
                "Pre-shot check: front, middle, and back of green yardage",
            ],
            what_if="Each 5% GIR improvement saves approximately 1 stroke per round",
        )

    def _insight_scrambling(
        self, raw: Dict[str, Any], benchmark: Dict[str, float]
    ) -> Optional[AIInsightItem]:
        avg_scrambling = raw.get("avg_scrambling")
        scrambling_rounds = raw.get("scrambling_rounds_with_data", 0)
        if avg_scrambling is None or scrambling_rounds < 5:
            return None

        bench = benchmark["scrambling_pct"]
        gap = bench - avg_scrambling
        if gap <= 0:
            return None

        priority = min(10.0, gap * 0.15)

        return AIInsightItem(
            category="Up & Down",
            category_group="Short Game",
            title="Build Your Short Game",
            description=(
                f"You get up and down {round(avg_scrambling, 1)}% of the time vs "
                f"the {round(bench, 0):.0f}% benchmark."
            ),
            priority_score=round(priority, 2),
            key_metric=round(avg_scrambling, 1),
            metric_label="Up & Down %",
            benchmark=round(bench, 1),
            trend_direction="stable",
            drill_tips=[
                "Chip from 20 different lies — focus on landing spot, not the hole",
                "Develop a bump-and-run for tight lies: more consistent than a flop",
                "20 bunker shots per session targeting your landing zone",
            ],
            what_if="Improving up & down rate by 10% saves roughly 1–1.5 strokes per round",
        )

    def _insight_three_putts(
        self, raw: Dict[str, Any], benchmark: Dict[str, float]
    ) -> Optional[AIInsightItem]:
        avg_three_putts = raw.get("avg_three_putts")
        if avg_three_putts is None:
            return None

        bench = benchmark["three_putts_per_round"]
        gap = avg_three_putts - bench
        if gap <= 0:
            return None

        priority = min(10.0, gap * 2.5)
        trend = _trend_direction(raw.get("three_putt_trend", []))

        return AIInsightItem(
            category="3-Putts",
            category_group="Putting",
            title="Eliminate 3-Putts",
            description=(
                f"You average {round(avg_three_putts, 1)} three-putts per round "
                f"vs the {round(bench, 1)} benchmark."
            ),
            priority_score=round(priority, 2),
            key_metric=round(avg_three_putts, 1),
            metric_label="3-Putts / Round",
            benchmark=round(bench, 1),
            trend_direction=trend,
            drill_tips=[
                "Lag putting: from 30–50 feet, leave every putt within 3 feet",
                "Clock drill — 4 putts at 3, 6, 9, 12 o'clock from 6 feet",
                "Walk off lag putt distance before addressing the ball",
            ],
            what_if=(
                f"Each 3-putt eliminated saves 1 stroke — "
                f"cutting by {round(gap, 1)} saves {round(gap, 1)} strokes/round"
            ),
        )

    def _insight_putting_quality(
        self, raw: Dict[str, Any], benchmark: Dict[str, float]
    ) -> Optional[AIInsightItem]:
        putts_per_gir = raw.get("putts_per_gir")
        if putts_per_gir is None:
            return None

        bench = benchmark["putts_per_gir"]
        gap = putts_per_gir - bench
        if gap <= 0:
            return None

        priority = min(10.0, gap * 12.0)
        trend = _trend_direction(raw.get("putts_per_gir_trend", []))

        return AIInsightItem(
            category="Putting Quality",
            category_group="Putting",
            title="Improve Putts per GIR",
            description=(
                f"You average {round(putts_per_gir, 2)} putts per GIR "
                f"vs the {round(bench, 2)} benchmark."
            ),
            priority_score=round(priority, 2),
            key_metric=round(putts_per_gir, 2),
            metric_label="Putts / GIR",
            benchmark=round(bench, 2),
            trend_direction=trend,
            drill_tips=[
                "Focus on 6–10 foot putts — these are make-or-miss for scoring",
                "Read putts from behind the hole, not just behind the ball",
                "Speed control drill: putt to the fringe from 20 feet — pace, not hole",
            ],
            what_if=(
                f"Reducing putts per GIR to {round(bench, 2)} "
                f"saves ~{round(gap * 8, 1)} strokes/round"
            ),
        )

    # ── Comparisons ───────────────────────────────────────────────────────────

    def _build_comparisons(
        self, raw: Dict[str, Any], benchmark: Dict[str, float]
    ) -> List[AIComparisonItem]:
        par_avgs: Dict[int, float] = raw.get("par_avgs", {})

        def _item(
            metric: str,
            category: str,
            player_val: Optional[float],
            bench_key: str,
            unit: str,
            lower_is_better: bool,
        ) -> AIComparisonItem:
            bv = benchmark[bench_key]
            pv = round(player_val, 2) if player_val is not None else None
            return AIComparisonItem(
                metric=metric,
                category=category,
                player_value=pv,
                benchmark_value=bv,
                unit=unit,
                lower_is_better=lower_is_better,
                has_data=player_val is not None,
            )

        avg_to_par = raw.get("avg_to_par")

        return [
            _item("Scoring Avg (to par)", "Ball Striking", avg_to_par, "scoring_avg_to_par", " strokes", True),
            _item("GIR %", "Ball Striking", raw.get("gir_pct"), "gir_pct", "%", False),
            _item("Par 3 Avg to Par", "Ball Striking", par_avgs.get(3), "par3_avg_to_par", " strokes", True),
            _item("Par 4 Avg to Par", "Ball Striking", par_avgs.get(4), "par4_avg_to_par", " strokes", True),
            _item("Par 5 Avg to Par", "Ball Striking", par_avgs.get(5), "par5_avg_to_par", " strokes", True),
            _item("Up & Down %", "Short Game", raw.get("avg_scrambling"), "scrambling_pct", "%", False),
            _item("Putts per Round", "Putting", raw.get("avg_putts_per_round"), "putts_per_round", " putts", True),
            _item("Putts per GIR", "Putting", raw.get("putts_per_gir"), "putts_per_gir", " putts", True),
            _item("3-Putts per Round", "Putting", raw.get("avg_three_putts"), "three_putts_per_round", " putts", True),
        ]

    # ── Strengths ─────────────────────────────────────────────────────────────

    def _compute_strengths(
        self, raw: Dict[str, Any], benchmark: Dict[str, float]
    ) -> List[AIStrengthItem]:
        strengths: List[AIStrengthItem] = []
        threshold = 0.20

        gir_pct = raw.get("gir_pct")
        if gir_pct is not None:
            bench = benchmark["gir_pct"]
            if bench > 0 and gir_pct >= bench * (1 + threshold):
                strengths.append(AIStrengthItem(
                    category="Greens in Regulation",
                    title="Strong Ball Striking",
                    metric_label="GIR %",
                    player_value=round(gir_pct, 1),
                    benchmark_value=round(bench, 1),
                    margin_description=f"{round(gir_pct - bench, 1)}% above benchmark",
                ))

        avg_scrambling = raw.get("avg_scrambling")
        if avg_scrambling is not None:
            bench = benchmark["scrambling_pct"]
            if bench > 0 and avg_scrambling >= bench * (1 + threshold):
                strengths.append(AIStrengthItem(
                    category="Up & Down",
                    title="Excellent Short Game",
                    metric_label="Up & Down %",
                    player_value=round(avg_scrambling, 1),
                    benchmark_value=round(bench, 1),
                    margin_description=f"{round(avg_scrambling - bench, 1)}% above benchmark",
                ))

        putts_per_gir = raw.get("putts_per_gir")
        if putts_per_gir is not None:
            bench = benchmark["putts_per_gir"]
            if bench > 0 and putts_per_gir <= bench * (1 - threshold):
                strengths.append(AIStrengthItem(
                    category="Putting Quality",
                    title="Great on the Greens",
                    metric_label="Putts / GIR",
                    player_value=round(putts_per_gir, 2),
                    benchmark_value=round(bench, 2),
                    margin_description=f"{round(bench - putts_per_gir, 2)} fewer putts than benchmark",
                ))

        par_meta = {
            3: ("par3_avg_to_par", "Par 3s", "Par 3 Specialist"),
            4: ("par4_avg_to_par", "Par 4s", "Par 4 Expert"),
            5: ("par5_avg_to_par", "Par 5s", "Par 5 Scorer"),
        }
        par_avgs: Dict[int, float] = raw.get("par_avgs", {})
        for par, (bench_key, label, title) in par_meta.items():
            if par in par_avgs:
                player_val = par_avgs[par]
                bench = benchmark[bench_key]
                margin_needed = abs(bench) * threshold if bench != 0 else 0.2
                if player_val < bench - margin_needed:
                    strengths.append(AIStrengthItem(
                        category=label,
                        title=title,
                        metric_label=f"Avg to par ({label})",
                        player_value=round(player_val, 2),
                        benchmark_value=round(bench, 2),
                        margin_description=f"{round(bench - player_val, 2)} strokes better than benchmark",
                    ))

        return strengths[:3]
