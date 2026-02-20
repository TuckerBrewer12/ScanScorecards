"""Round API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List
from database.db_manager import DatabaseManager
from api.dependencies import get_db
from api.schemas import RoundSummaryResponse

router = APIRouter()


def summarize_round(r) -> RoundSummaryResponse:
    """Project a full Round model into a lightweight summary."""
    fairways = [s.fairway_hit for s in r.hole_scores if s.fairway_hit is not None]
    return RoundSummaryResponse(
        id=r.id,
        course_name=r.course.name if r.course else None,
        course_location=r.course.location if r.course else None,
        course_par=r.course.get_par() if r.course else None,
        tee_box=r.tee_box,
        date=r.date,
        total_score=r.calculate_total_score(),
        to_par=r.total_to_par(),
        front_nine=r.calculate_front_nine(),
        back_nine=r.calculate_back_nine(),
        total_putts=r.get_total_putts(),
        total_gir=r.get_total_gir(),
        fairways_hit=sum(1 for f in fairways if f) if fairways else None,
        notes=r.notes,
    )


@router.get("/user/{user_id}", response_model=List[RoundSummaryResponse])
async def get_rounds_for_user(
    user_id: str,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: DatabaseManager = Depends(get_db),
):
    rounds = await db.rounds.get_rounds_for_user(user_id, limit=limit, offset=offset)
    return [summarize_round(r) for r in rounds]


@router.get("/{round_id}")
async def get_round(round_id: str, db: DatabaseManager = Depends(get_db)):
    round_ = await db.rounds.get_round(round_id)
    if not round_:
        raise HTTPException(404, "Round not found")
    return round_
