"""Course API endpoints."""

import logging
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from database.db_manager import DatabaseManager
from database.exceptions import DuplicateError, IntegrityError, NotFoundError
from api.dependencies import get_db, get_optional_current_user, get_current_user
from api.schemas import CourseSummaryResponse
from models import Course, Hole, Tee, User
from services import GolfCourseAPIService

router = APIRouter()
logger = logging.getLogger(__name__)


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
    external_course_id: Optional[str] = None
    location: Optional[str] = None
    holes: List[HoleInput] = []
    tees: List[TeeInput] = []


class UpdateCourseRequest(BaseModel):
    name: Optional[str] = None
    external_course_id: Optional[str] = None
    location: Optional[str] = None
    par: Optional[int] = None


def _summarize_course(c) -> CourseSummaryResponse:
    return CourseSummaryResponse(
        id=c.id,
        name=c.name,
        external_course_id=getattr(c, "external_course_id", None),
        source="local",
        location=c.location,
        par=c.get_par(),
        total_holes=len(c.holes),
        tee_count=len(c.tees),
    )


def _summarize_external_course(item: dict) -> CourseSummaryResponse:
    external_id = item.get("external_course_id")
    name = item.get("name")
    city = item.get("city")
    state = item.get("state")
    location = ", ".join([p for p in [city, state] if p]) or None
    fallback_id = (name or "unknown").strip().lower().replace(" ", "-")
    return CourseSummaryResponse(
        id=f"external:{external_id or fallback_id}",
        name=name,
        external_course_id=external_id,
        source="external",
        location=location,
        par=None,
        total_holes=0,
        tee_count=0,
    )


def _norm_name(value: Optional[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()
    base = re.sub(
        r"\b(golf|course|club|country|links|gc|cc)\b",
        " ",
        base,
    )
    return " ".join(base.split())


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
    include_external: bool = Query(
        False,
        description="When true, include GolfCourseAPI fallback results after local search.",
    ),
    db: DatabaseManager = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    effective_user_id = user_id or (str(current_user.id) if current_user else None)
    courses = await db.courses.search_courses(q, user_id=effective_user_id)
    out = [_summarize_course(c) for c in courses]
    if not include_external:
        return out

    # Enrich with external fallback without breaking existing local-first behavior.
    try:
        ext_items = await GolfCourseAPIService().search_external_courses(q, limit=20)
    except Exception as exc:  # noqa: BLE001
        logger.warning("GolfCourseAPI fallback failed for query='%s': %s", q, exc)
        return out

    seen_local_keys = {
        ((c.name or "").strip().lower(), (c.location or "").strip().lower())
        for c in out
    }
    local_index_by_key = {
        ((c.name or "").strip().lower(), (c.location or "").strip().lower()): i
        for i, c in enumerate(out)
    }
    local_indices_by_name = {}
    local_indices_by_norm_name = {}
    for i, c in enumerate(out):
        name_key = (c.name or "").strip().lower()
        local_indices_by_name.setdefault(name_key, []).append(i)
        norm_name_key = _norm_name(c.name)
        local_indices_by_norm_name.setdefault(norm_name_key, []).append(i)
    seen_local_external_ids = {
        (c.external_course_id or "").strip()
        for c in out
        if c.external_course_id
    }

    for item in ext_items:
        ext_summary = _summarize_external_course(item)
        # External selections must carry a stable provider ID.
        if not ext_summary.external_course_id:
            continue
        ext_key = (
            (ext_summary.name or "").strip().lower(),
            (ext_summary.location or "").strip().lower(),
        )
        ext_name_key = (ext_summary.name or "").strip().lower()
        ext_norm_name = _norm_name(ext_summary.name)
        if ext_summary.external_course_id and ext_summary.external_course_id in seen_local_external_ids:
            continue
        if ext_key in seen_local_keys:
            # Enrich existing local hit with provider ID when missing.
            idx = local_index_by_key.get(ext_key)
            if idx is not None and not out[idx].external_course_id:
                out[idx].external_course_id = ext_summary.external_course_id
                seen_local_external_ids.add(ext_summary.external_course_id)
            continue
        # Fallback: when locations differ/missing, match by name-only to backfill local rows.
        if ext_name_key in local_indices_by_name:
            for idx in local_indices_by_name[ext_name_key]:
                if not out[idx].external_course_id:
                    out[idx].external_course_id = ext_summary.external_course_id
                    seen_local_external_ids.add(ext_summary.external_course_id)
                    break
            continue
        # Fallback: normalized name similarity for slight naming differences.
        if ext_norm_name:
            matched = False
            if ext_norm_name in local_indices_by_norm_name:
                for idx in local_indices_by_norm_name[ext_norm_name]:
                    if not out[idx].external_course_id:
                        out[idx].external_course_id = ext_summary.external_course_id
                        seen_local_external_ids.add(ext_summary.external_course_id)
                        matched = True
                        break
            if not matched:
                for local_norm, indices in local_indices_by_norm_name.items():
                    if not local_norm:
                        continue
                    if local_norm in ext_norm_name or ext_norm_name in local_norm:
                        for idx in indices:
                            if not out[idx].external_course_id:
                                out[idx].external_course_id = ext_summary.external_course_id
                                seen_local_external_ids.add(ext_summary.external_course_id)
                                matched = True
                                break
                    if matched:
                        break
            if matched:
                continue
        out.append(ext_summary)

    return out[:20]


@router.get("/{course_id}")
async def get_course(course_id: str, db: DatabaseManager = Depends(get_db)):
    course = await db.courses.get_course(course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    return course


@router.post("", status_code=201)
async def create_course(
    req: CreateCourseRequest,
    user_id: Optional[str] = Query(None, description="Owner user ID for the custom course"),
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    effective_user_id = user_id or str(current_user.id)

    course = Course(
        name=req.name,
        external_course_id=req.external_course_id,
        location=req.location,
        holes=holes,
        tees=tees,
    )
    try:
        created = await db.courses.create_course(course, user_id=effective_user_id)
        return _summarize_course(created)
    except DuplicateError:
        raise HTTPException(409, "A course with that name already exists for this user")
    except IntegrityError as e:
        raise HTTPException(400, str(e))


@router.put("/{course_id}")
async def update_course(
    course_id: str,
    req: UpdateCourseRequest,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a custom course. Only the owner can edit; master courses are protected."""
    existing = await db.courses.get_course(course_id)
    if not existing:
        raise HTTPException(404, "Course not found")
    if existing.user_id != str(current_user.id):
        raise HTTPException(403, "Cannot edit a master course. Clone it first.")

    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    updated = await db.courses.update_course(course_id, user_id=str(current_user.id), **updates)
    if not updated:
        raise HTTPException(404, "Course not found or not owned by user")
    return _summarize_course(updated)


@router.post("/{course_id}/clone", status_code=201)
async def clone_course(
    course_id: str,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clone a master course as a user-owned custom course."""
    try:
        cloned = await db.courses.clone_course(course_id, str(current_user.id))
        return _summarize_course(cloned)
    except NotFoundError:
        raise HTTPException(404, "Source course not found")
    except DuplicateError:
        raise HTTPException(409, "You already have a custom copy of this course")
