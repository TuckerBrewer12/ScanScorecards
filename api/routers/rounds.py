"""Round API endpoints."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from typing import List, Optional
from database.db_manager import DatabaseManager
from database.exceptions import NotFoundError
from api.dependencies import get_current_user, get_db
from api.input_validation import sanitize_user_text
from api.schemas import RoundSummaryResponse
from models import HoleScore, User

logger = logging.getLogger(__name__)

router = APIRouter()


class HoleScoreUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hole_number: int = Field(..., ge=1, le=18)
    strokes: Optional[int] = Field(default=None, ge=1, le=15)
    putts: Optional[int] = Field(default=None, ge=0, le=10)
    fairway_hit: Optional[bool] = None
    green_in_regulation: Optional[bool] = None
    net_score: Optional[int] = None
    shots_to_green: Optional[int] = Field(default=None, ge=1, le=10)
    par_played: Optional[int] = Field(default=None, ge=3, le=6)
    handicap_played: Optional[int] = Field(default=None, ge=1, le=18)

    @model_validator(mode="after")
    def _validate_putts_vs_strokes(self):
        if self.putts is not None and self.strokes is not None and self.putts > self.strokes:
            raise ValueError("putts cannot exceed strokes.")
        return self


class UpdateRoundRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    hole_scores: Optional[List[HoleScoreUpdate]] = Field(default=None, max_length=18)
    notes: Optional[str] = None
    weather_conditions: Optional[str] = None
    tee_box: Optional[str] = None

    @field_validator("notes")
    @classmethod
    def _validate_notes(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_user_text(v, field_name="notes", max_length=2_000, allow_newlines=True)

    @field_validator("weather_conditions")
    @classmethod
    def _validate_weather(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_user_text(v, field_name="weather_conditions", max_length=200)

    @field_validator("tee_box")
    @classmethod
    def _validate_tee_box(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_user_text(v, field_name="tee_box", max_length=40)

    @model_validator(mode="after")
    def _validate_unique_holes(self):
        if self.hole_scores:
            holes = [h.hole_number for h in self.hole_scores]
            if len(set(holes)) != len(holes):
                raise ValueError("hole_scores cannot contain duplicate hole_number values.")
        return self


class LinkCourseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    course_id: UUID


def summarize_round(r) -> RoundSummaryResponse:
    """Project a full Round model into a lightweight summary."""
    fairways = [s.fairway_hit for s in r.hole_scores if s.fairway_hit is not None]
    return RoundSummaryResponse(
        id=r.id,
        course_id=str(r.course.id) if r.course and r.course.id else None,
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
    user_id: UUID,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if str(current_user.id) != str(user_id):
        raise HTTPException(403, "Forbidden")
    rows = await db.rounds.get_round_summaries_for_user(str(user_id), limit=limit, offset=offset)
    return [
        RoundSummaryResponse(
            id=str(row["id"]),
            course_id=str(row["course_id"]) if row["course_id"] else None,
            course_name=row["course_name"],
            course_location=row["course_location"],
            course_par=row["course_par"],
            tee_box=row["tee_box"],
            date=row["round_date"],
            total_score=row["total_score"],
            to_par=(
                (row["total_score"] - row["course_par"])
                if row["total_score"] is not None and row["course_par"] is not None
                else None
            ),
            front_nine=row["front_nine"],
            back_nine=row["back_nine"],
            total_putts=row["total_putts"],
            total_gir=row["total_gir"],
            fairways_hit=row["fairways_hit"],
            notes=row["notes"],
        )
        for row in rows
    ]


async def _check_round_ownership(round_id: UUID, current_user: User, db: DatabaseManager):
    owner_id = await db.rounds.get_round_owner_id(str(round_id))
    if owner_id is None:
        raise HTTPException(404, "Round not found")
    if owner_id != str(current_user.id):
        raise HTTPException(403, "Forbidden")


async def _check_course_access(course_id: UUID, current_user: User, db: DatabaseManager):
    course = await db.courses.get_course(str(course_id))
    if not course:
        raise HTTPException(404, "Course not found")
    if course.user_id and str(course.user_id) != str(current_user.id):
        raise HTTPException(403, "Forbidden")
    return course


@router.get("/{round_id}")
async def get_round(
    round_id: UUID,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _check_round_ownership(round_id, current_user, db)
    round_ = await db.rounds.get_round(str(round_id))
    if not round_:
        raise HTTPException(404, "Round not found")
    return round_


@router.put("/{round_id}")
async def update_round(
    round_id: UUID,
    req: UpdateRoundRequest,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit an existing round's scores and/or metadata."""
    await _check_round_ownership(round_id, current_user, db)
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
            updated = await db.rounds.update_hole_scores(
                str(round_id),
                hole_score_models,
                user_id=str(current_user.id),
            )
        else:
            updated = await db.rounds.get_round(str(round_id))

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
            updated = await db.rounds.update_round(
                str(round_id),
                user_id=str(current_user.id),
                **meta_updates,
            )

        return updated

    except NotFoundError:
        raise HTTPException(404, "Round not found")
    except Exception:
        logger.exception("Update round error")
        raise HTTPException(500, "Update failed. Please try again.")


@router.post("/{round_id}/link-course", response_model=RoundSummaryResponse)
async def link_course_to_round(
    round_id: UUID,
    req: LinkCourseRequest,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Link an unlinked round to an existing course.

    Backfills par_played/handicap_played on hole_scores from the course,
    and fills course holes from any par_played already on the round.
    """
    await _check_round_ownership(round_id, current_user, db)
    try:
        await _check_course_access(req.course_id, current_user, db)

        # Fill course gaps from the round's par_played values
        round_ = await db.rounds.get_round(str(round_id))
        if not round_:
            raise HTTPException(404, "Round not found")

        scan_holes = [
            {"hole_number": hs.hole_number, "par": hs.par_played, "handicap": hs.handicap_played}
            for hs in round_.hole_scores
            if hs.hole_number is not None and hs.par_played is not None
        ]
        if scan_holes:
            await db.courses.fill_course_gaps(str(req.course_id), scan_holes)

        updated = await db.rounds.link_course_to_round(
            str(round_id),
            str(req.course_id),
            user_id=str(current_user.id),
        )
        if not updated:
            raise HTTPException(404, "Round not found")
        return summarize_round(updated)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Link course error")
        raise HTTPException(500, "Link failed. Please try again.")


@router.delete("/{round_id}", status_code=204)
async def delete_round(
    round_id: UUID,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _check_round_ownership(round_id, current_user, db)
    await db.rounds.delete_round(str(round_id), user_id=str(current_user.id))
