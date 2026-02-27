"""Round API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from database.db_manager import DatabaseManager
from database.exceptions import NotFoundError
from api.dependencies import get_db
from api.schemas import RoundSummaryResponse
from models import HoleScore

router = APIRouter()


class HoleScoreUpdate(BaseModel):
    hole_number: int
    strokes: Optional[int] = None
    putts: Optional[int] = None
    fairway_hit: Optional[bool] = None
    green_in_regulation: Optional[bool] = None
    net_score: Optional[int] = None
    shots_to_green: Optional[int] = None
    par_played: Optional[int] = None
    handicap_played: Optional[int] = None


class UpdateRoundRequest(BaseModel):
    hole_scores: Optional[List[HoleScoreUpdate]] = None
    notes: Optional[str] = None
    weather_conditions: Optional[str] = None
    tee_box: Optional[str] = None


def summarize_round(r) -> RoundSummaryResponse:
    """Project a full Round model into a lightweight summary."""
    fairways = [s.fairway_hit for s in r.hole_scores if s.fairway_hit is not None]
    return RoundSummaryResponse(
        id=r.id,
        course_name=r.course.name if r.course else r.course_name_played,
        course_location=r.course.location if r.course else None,
        course_par=r.get_par(),
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


@router.put("/{round_id}")
async def update_round(
    round_id: str,
    req: UpdateRoundRequest,
    db: DatabaseManager = Depends(get_db),
):
    """Edit an existing round's scores and/or metadata."""
    try:
        # Update hole scores if provided
        if req.hole_scores:
            hole_score_models = [
                HoleScore(
                    hole_number=hs.hole_number,
                    strokes=hs.strokes,
                    putts=hs.putts,
                    fairway_hit=hs.fairway_hit,
                    green_in_regulation=hs.green_in_regulation,
                    net_score=hs.net_score,
                    shots_to_green=hs.shots_to_green,
                    par_played=hs.par_played,
                    handicap_played=hs.handicap_played,
                )
                for hs in req.hole_scores
            ]
            updated = await db.rounds.update_hole_scores(round_id, hole_score_models)
        else:
            updated = await db.rounds.get_round(round_id)

        if not updated:
            raise HTTPException(404, "Round not found")

        # Update metadata fields
        meta_updates = {}
        if req.notes is not None:
            meta_updates["notes"] = req.notes
        if req.weather_conditions is not None:
            meta_updates["weather_conditions"] = req.weather_conditions
        if req.tee_box is not None:
            meta_updates["tee_box_played"] = req.tee_box

        if meta_updates:
            updated = await db.rounds.update_round(round_id, **meta_updates)

        return updated

    except NotFoundError:
        raise HTTPException(404, "Round not found")
    except Exception as e:
        import traceback
        print(f"Update round error: {traceback.format_exc()}")
        raise HTTPException(500, f"Update failed: {type(e).__name__}: {str(e)}")


@router.delete("/{round_id}", status_code=204)
async def delete_round(round_id: str, db: DatabaseManager = Depends(get_db)):
    deleted = await db.rounds.delete_round(round_id)
    if not deleted:
        raise HTTPException(404, "Round not found")
