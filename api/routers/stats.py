"""Stats/dashboard API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from database.db_manager import DatabaseManager
from api.dependencies import get_db
from api.schemas import DashboardResponse
from api.routers.rounds import summarize_round
from analytics import stats as analytics

router = APIRouter()


@router.get("/dashboard/{user_id}", response_model=DashboardResponse)
async def get_dashboard(user_id: str, db: DatabaseManager = Depends(get_db)):
    user = await db.users.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")

    all_rounds = await db.rounds.get_rounds_for_user(user_id, limit=500, offset=0)

    scores = [r.calculate_total_score() for r in all_rounds if r.calculate_total_score()]
    putts = [r.get_total_putts() for r in all_rounds if r.get_total_putts()]
    girs = [r.get_total_gir() for r in all_rounds if r.get_total_gir() is not None]

    best_score = min(scores) if scores else None
    best_round_id = None
    best_course = None
    if best_score:
        for r in all_rounds:
            if r.calculate_total_score() == best_score:
                best_round_id = r.id
                best_course = r.course.name if r.course else None
                break

    recent = all_rounds[:5]

    return DashboardResponse(
        total_rounds=len(all_rounds),
        scoring_average=round(sum(scores) / len(scores), 1) if scores else None,
        best_round=best_score,
        best_round_id=best_round_id,
        best_round_course=best_course,
        handicap=user.handicap,
        recent_rounds=[summarize_round(r) for r in recent],
        average_putts=round(sum(putts) / len(putts), 1) if putts else None,
        average_gir=round(sum(girs) / len(girs), 1) if girs else None,
    )


@router.get("/analytics/{user_id}")
async def get_analytics(
    user_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: DatabaseManager = Depends(get_db),
):
    user = await db.users.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")

    # DB returns newest-first; reverse for chronological trend ordering
    rounds_desc = await db.rounds.get_rounds_for_user(user_id, limit=limit, offset=0)
    rounds = list(reversed(rounds_desc))

    if not rounds:
        return {
            "kpis": {
                "scoring_average": None,
                "gir_percentage": None,
                "putts_per_gir": None,
                "scrambling_percentage": None,
                "total_rounds": 0,
            },
            "score_trend": [],
            "gir_trend": [],
            "putts_trend": [],
            "three_putts_trend": [],
            "scrambling_trend": [],
            "score_type_distribution": [],
            "scoring_by_par": [],
            "scoring_by_handicap": [],
            "gir_vs_non_gir": [],
        }

    scores = [r.calculate_total_score() for r in rounds if r.calculate_total_score() is not None]
    gir_data = analytics.overall_gir_percentage(rounds)
    putts_gir_data = analytics.overall_putts_per_gir(rounds)
    scrambling_rows = analytics.scrambling_per_round(rounds)
    scrambling_vals = [r["scrambling_percentage"] for r in scrambling_rows if r["scrambling_percentage"] is not None]
    avg_scrambling = sum(scrambling_vals) / len(scrambling_vals) if scrambling_vals else None

    return {
        "kpis": {
            "scoring_average": round(sum(scores) / len(scores), 1) if scores else None,
            "gir_percentage": round(gir_data["gir_percentage"], 1) if gir_data["gir_percentage"] else None,
            "putts_per_gir": round(putts_gir_data["putts_per_gir"], 2) if putts_gir_data["putts_per_gir"] else None,
            "scrambling_percentage": round(avg_scrambling, 1) if avg_scrambling is not None else None,
            "total_rounds": len(rounds),
        },
        "score_trend": analytics.score_trend(rounds),
        "gir_trend": analytics.gir_per_round(rounds),
        "putts_trend": analytics.putts_per_round(rounds),
        "three_putts_trend": analytics.three_putts_per_round(rounds),
        "scrambling_trend": analytics.scrambling_per_round(rounds),
        "score_type_distribution": analytics.score_type_distribution_per_round(rounds),
        "scoring_by_par": analytics.scoring_by_par(rounds),
        "scoring_by_handicap": analytics.scoring_vs_hole_handicap(rounds),
        "gir_vs_non_gir": analytics.gir_vs_non_gir_score_distribution(rounds),
    }


@router.get("/compare/{user_id}/{round_id}")
async def get_round_comparison(
    user_id: str,
    round_id: str,
    db: DatabaseManager = Depends(get_db),
):
    rounds_desc = await db.rounds.get_rounds_for_user(user_id, limit=200, offset=0)
    rounds = list(reversed(rounds_desc))  # chronological order

    if not rounds:
        raise HTTPException(404, "No rounds found")

    round_index = next((i for i, r in enumerate(rounds) if str(r.id) == round_id), None)
    if round_index is None:
        raise HTTPException(404, "Round not found in user history")

    score_rows = analytics.score_trend(rounds)
    putts_rows = analytics.putts_per_round(rounds)
    gir_rows = analytics.gir_per_round(rounds)

    return {
        "score": analytics.metric_comparison_snapshot(
            score_rows, primary_key="total_score", secondary_key="to_par", round_index=round_index
        ),
        "putts": analytics.metric_comparison_snapshot(
            putts_rows, primary_key="total_putts", round_index=round_index
        ),
        "gir": analytics.metric_comparison_snapshot(
            gir_rows, primary_key="total_gir", secondary_key="gir_percentage", round_index=round_index
        ),
    }
