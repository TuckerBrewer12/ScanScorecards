"""Course API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from database.db_manager import DatabaseManager
from database.exceptions import DuplicateError, IntegrityError, NotFoundError
from api.dependencies import get_db
from api.schemas import CourseSummaryResponse
from models import Course, Hole, Tee

router = APIRouter()


class HoleInput(BaseModel):
    number: int
    par: Optional[int] = None
    handicap: Optional[int] = None


class TeeInput(BaseModel):
    color: str
    slope_rating: Optional[float] = None
    course_rating: Optional[float] = None
    hole_yardages: dict = {}


class CreateCourseRequest(BaseModel):
    name: str
    location: Optional[str] = None
    holes: List[HoleInput] = []
    tees: List[TeeInput] = []


class UpdateCourseRequest(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    par: Optional[int] = None


def _summarize_course(c) -> CourseSummaryResponse:
    return CourseSummaryResponse(
        id=c.id,
        name=c.name,
        location=c.location,
        par=c.get_par(),
        total_holes=len(c.holes),
        tee_count=len(c.tees),
    )


@router.get("", response_model=List[CourseSummaryResponse])
async def list_courses(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: Optional[str] = Query(None),
    db: DatabaseManager = Depends(get_db),
):
    courses = await db.courses.list_courses(limit=limit, offset=offset, user_id=user_id)
    return [_summarize_course(c) for c in courses]


@router.get("/search", response_model=List[CourseSummaryResponse])
async def search_courses(
    q: str = Query(..., min_length=1),
    user_id: Optional[str] = Query(None),
    db: DatabaseManager = Depends(get_db),
):
    courses = await db.courses.search_courses(q, user_id=user_id)
    return [_summarize_course(c) for c in courses]


@router.get("/{course_id}")
async def get_course(course_id: str, db: DatabaseManager = Depends(get_db)):
    course = await db.courses.get_course(course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    return course


@router.post("", status_code=201)
async def create_course(
    req: CreateCourseRequest,
    user_id: str = Query(..., description="Owner user ID for the custom course"),
    db: DatabaseManager = Depends(get_db),
):
    """Create a custom course for a user."""
    holes = [Hole(number=h.number, par=h.par, handicap=h.handicap) for h in req.holes]
    tees = [
        Tee(
            color=t.color,
            slope_rating=t.slope_rating,
            course_rating=t.course_rating,
            hole_yardages=t.hole_yardages,
        )
        for t in req.tees
    ]
    course = Course(name=req.name, location=req.location, holes=holes, tees=tees)
    try:
        created = await db.courses.create_course(course, user_id=user_id)
        return _summarize_course(created)
    except DuplicateError:
        raise HTTPException(409, "A course with that name already exists for this user")
    except IntegrityError as e:
        raise HTTPException(400, str(e))


@router.put("/{course_id}")
async def update_course(
    course_id: str,
    req: UpdateCourseRequest,
    user_id: str = Query(..., description="Must be the owner of this custom course"),
    db: DatabaseManager = Depends(get_db),
):
    """Update a custom course. Only the owner can edit; master courses are protected."""
    # Verify ownership
    existing = await db.courses.get_course(course_id)
    if not existing:
        raise HTTPException(404, "Course not found")
    if existing.user_id != user_id:
        raise HTTPException(403, "Cannot edit a master course. Clone it first.")

    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    updated = await db.courses.update_course(course_id, user_id=user_id, **updates)
    if not updated:
        raise HTTPException(404, "Course not found or not owned by user")
    return _summarize_course(updated)


@router.post("/{course_id}/clone", status_code=201)
async def clone_course(
    course_id: str,
    user_id: str = Query(..., description="User ID to clone the course for"),
    db: DatabaseManager = Depends(get_db),
):
    """Clone a master course as a user-owned custom course."""
    try:
        cloned = await db.courses.clone_course(course_id, user_id)
        return _summarize_course(cloned)
    except NotFoundError:
        raise HTTPException(404, "Source course not found")
    except DuplicateError:
        raise HTTPException(409, "You already have a custom copy of this course")
