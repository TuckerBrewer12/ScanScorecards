"""Course API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List
from database.db_manager import DatabaseManager
from api.dependencies import get_db
from api.schemas import CourseSummaryResponse

router = APIRouter()


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
    db: DatabaseManager = Depends(get_db),
):
    courses = await db.courses.list_courses(limit=limit, offset=offset)
    return [_summarize_course(c) for c in courses]


@router.get("/search", response_model=List[CourseSummaryResponse])
async def search_courses(
    q: str = Query(..., min_length=1),
    db: DatabaseManager = Depends(get_db),
):
    courses = await db.courses.search_courses(q)
    return [_summarize_course(c) for c in courses]


@router.get("/{course_id}")
async def get_course(course_id: str, db: DatabaseManager = Depends(get_db)):
    course = await db.courses.get_course(course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    return course
