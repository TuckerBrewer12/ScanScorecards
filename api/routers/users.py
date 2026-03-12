"""User API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from database.db_manager import DatabaseManager
from database.exceptions import DuplicateError, NotFoundError
from api.dependencies import get_current_user, get_db
from models import User, UserTee
from analytics import handicap as hcap

router = APIRouter()


class CreateUserTeeRequest(BaseModel):
    course_id: Optional[str] = None
    name: str
    slope_rating: Optional[float] = None
    course_rating: Optional[float] = None
    hole_yardages: Optional[dict] = None


class UpdateUserTeeRequest(BaseModel):
    name: Optional[str] = None
    slope_rating: Optional[float] = None
    course_rating: Optional[float] = None
    hole_yardages: Optional[dict] = None


class UpdateUserRequest(BaseModel):
    home_course_id: Optional[str] = None
    handicap: Optional[float] = Field(default=None, ge=-10, le=54)


@router.get("/by-email/{email}")
async def get_user_by_email(email: str, db: DatabaseManager = Depends(get_db)):
    user = await db.users.get_user_by_email(email)
    if not user:
        raise HTTPException(404, "User not found")
    return user


@router.get("/{user_id}")
async def get_user(user_id: str, db: DatabaseManager = Depends(get_db)):
    user = await db.users.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return user


@router.patch("/{user_id}")
async def update_user(
    user_id: str,
    req: UpdateUserRequest,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if str(current_user.id) != str(user_id):
        raise HTTPException(403, "Forbidden")

    updates = req.model_dump(exclude_unset=True)
    if "handicap" in updates:
        updates["handicap_index"] = updates.pop("handicap")
    user = await db.users.update_user(user_id, **updates)
    if not user:
        raise HTTPException(404, "User not found")
    return user


@router.get("/{user_id}/handicap")
async def get_user_handicap(
    user_id: str,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the user's current WHS Handicap Index."""
    rounds = await db.rounds.get_rounds_for_user(user_id)
    rounds_chrono = list(reversed(rounds))
    hi = hcap.handicap_index(rounds_chrono)
    return {"handicap_index": hi}


# ================================================================
# User tees
# ================================================================

@router.get("/{user_id}/tees", response_model=List[UserTee])
async def get_user_tees(
    user_id: str,
    course_id: Optional[str] = Query(None),
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List a user's custom tee configurations."""
    return await db.user_tees.get_user_tees(user_id, course_id=course_id)


@router.post("/{user_id}/tees", response_model=UserTee, status_code=201)
async def create_user_tee(
    user_id: str,
    req: CreateUserTeeRequest,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a user tee configuration."""
    tee = UserTee(
        user_id=user_id,
        course_id=req.course_id,
        name=req.name,
        slope_rating=req.slope_rating,
        course_rating=req.course_rating,
        hole_yardages={int(k): v for k, v in (req.hole_yardages or {}).items()},
    )
    try:
        return await db.user_tees.create_user_tee(tee)
    except DuplicateError:
        raise HTTPException(409, f"User tee '{req.name}' already exists for this course")


@router.put("/{user_id}/tees/{tee_id}", response_model=UserTee)
async def update_user_tee(
    user_id: str,
    tee_id: str,
    req: UpdateUserTeeRequest,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a user tee configuration."""
    updates = req.model_dump(exclude_none=True)
    if "hole_yardages" in updates and updates["hole_yardages"] is not None:
        updates["hole_yardages"] = {int(k): v for k, v in updates["hole_yardages"].items()}
    try:
        return await db.user_tees.update_user_tee(tee_id, **updates)
    except NotFoundError:
        raise HTTPException(404, "User tee not found")


@router.delete("/{user_id}/tees/{tee_id}", status_code=204)
async def delete_user_tee(
    user_id: str,
    tee_id: str,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a user tee configuration."""
    deleted = await db.user_tees.delete_user_tee(tee_id)
    if not deleted:
        raise HTTPException(404, "User tee not found")
