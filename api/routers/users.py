"""User API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from database.db_manager import DatabaseManager
from database.exceptions import DuplicateError, NotFoundError
from api.dependencies import get_db
from models import UserTee

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


# ================================================================
# User tees
# ================================================================

@router.get("/{user_id}/tees", response_model=List[UserTee])
async def get_user_tees(
    user_id: str,
    course_id: Optional[str] = Query(None),
    db: DatabaseManager = Depends(get_db),
):
    """List a user's custom tee configurations."""
    return await db.user_tees.get_user_tees(user_id, course_id=course_id)


@router.post("/{user_id}/tees", response_model=UserTee, status_code=201)
async def create_user_tee(
    user_id: str,
    req: CreateUserTeeRequest,
    db: DatabaseManager = Depends(get_db),
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
):
    """Delete a user tee configuration."""
    deleted = await db.user_tees.delete_user_tee(tee_id)
    if not deleted:
        raise HTTPException(404, "User tee not found")
