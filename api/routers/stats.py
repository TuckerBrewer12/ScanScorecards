"""Stats/dashboard API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from database.db_manager import DatabaseManager
from api.dependencies import get_db
from api.schemas import DashboardResponse
from api.routers.rounds import summarize_round

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
