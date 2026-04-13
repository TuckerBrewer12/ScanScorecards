"""Course API endpoints."""

import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import List, Optional
from database.db_manager import DatabaseManager
from database.exceptions import DuplicateError, IntegrityError, NotFoundError
from api.dependencies import get_db, get_optional_current_user, get_current_user
from api.input_validation import normalize_course_display_name, sanitize_search_query, sanitize_user_text
from api.schemas import CourseSummaryResponse
from models import Course, Hole, Tee, User
from services import GolfCourseAPIService
from services.golfcourse_api_service import _normalize_course_name

router = APIRouter()
logger = logging.getLogger(__name__)


class HoleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    number: int = Field(..., ge=1, le=18)
    par: Optional[int] = Field(default=None, ge=3, le=6)
    handicap: Optional[int] = Field(default=None, ge=1, le=18)


class TeeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    color: str = Field(..., min_length=1, max_length=40)
    slope_rating: Optional[float] = Field(default=None, ge=55, le=155)
    course_rating: Optional[float] = Field(default=None, ge=55, le=85)
    hole_yardages: dict = Field(default_factory=dict)

    @field_validator("color")
    @classmethod
    def _validate_color(cls, v: str) -> str:
        return sanitize_user_text(v, field_name="tee color", max_length=40)


class CreateCourseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=140)
    external_course_id: Optional[str] = Field(default=None, max_length=100)
    location: Optional[str] = None
    holes: List[HoleInput] = Field(default_factory=list, max_length=18)
    tees: List[TeeInput] = Field(default_factory=list, max_length=12)

    @field_validator("name")
    @classmethod
    def _validate_name(cls, v: str) -> str:
        sanitized = sanitize_user_text(v, field_name="name", max_length=140)
        return normalize_course_display_name(sanitized)

    @field_validator("external_course_id")
    @classmethod
    def _validate_external_course_id(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_user_text(v, field_name="external_course_id", max_length=100)

    @field_validator("location")
    @classmethod
    def _validate_location(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_user_text(v, field_name="location", max_length=140)


class UpdateCourseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: Optional[str] = None
    external_course_id: Optional[str] = None
    location: Optional[str] = None
    par: Optional[int] = Field(default=None, ge=54, le=90)

    @field_validator("name")
    @classmethod
    def _validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        sanitized = sanitize_user_text(v, field_name="name", max_length=140)
        return normalize_course_display_name(sanitized)

    @field_validator("external_course_id")
    @classmethod
    def _validate_external_course_id(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_user_text(v, field_name="external_course_id", max_length=100)

    @field_validator("location")
    @classmethod
    def _validate_location(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_user_text(v, field_name="location", max_length=140)


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



@router.get("", response_model=List[CourseSummaryResponse])
async def list_courses(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: Optional[UUID] = Query(None),
    db: DatabaseManager = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    if user_id:
        if not current_user or str(current_user.id) != str(user_id):
            raise HTTPException(403, "Forbidden")
    courses = await db.courses.list_courses(limit=limit, offset=offset, user_id=str(user_id) if user_id else None)
    return [_summarize_course(c) for c in courses]


@router.get("/search", response_model=List[CourseSummaryResponse])
async def search_courses(
    q: str = Query(..., min_length=1, max_length=120),
    user_id: Optional[UUID] = Query(None),
    include_external: bool = Query(
        False,
        description="When true, include GolfCourseAPI fallback results after local search.",
    ),
    db: DatabaseManager = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    try:
        q = sanitize_search_query(q, max_length=120)
    except ValueError as exc:
        raise HTTPException(422, str(exc))

    if user_id:
        if not current_user or str(current_user.id) != str(user_id):
            raise HTTPException(403, "Forbidden")
    if include_external and not current_user:
        raise HTTPException(401, "Authentication required for external course lookup")
    effective_user_id = str(user_id) if user_id else (str(current_user.id) if current_user else None)
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
        norm_name_key = _normalize_course_name(c.name)
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
        ext_norm_name = _normalize_course_name(ext_summary.name)
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
async def get_course(
    course_id: UUID,
    db: DatabaseManager = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    course = await db.courses.get_course(str(course_id))
    if not course:
        raise HTTPException(404, "Course not found")
    if course.user_id and (not current_user or str(current_user.id) != str(course.user_id)):
        raise HTTPException(403, "Forbidden")
    return course


@router.post("", status_code=201)
async def create_course(
    req: CreateCourseRequest,
    user_id: Optional[UUID] = Query(None, description="Owner user ID for the custom course"),
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
    effective_user_id = str(user_id) if user_id else str(current_user.id)
    if user_id and str(user_id) != str(current_user.id):
        raise HTTPException(403, "Forbidden")

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
    course_id: UUID,
    req: UpdateCourseRequest,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a custom course. Only the owner can edit; master courses are protected."""
    existing = await db.courses.get_course(str(course_id))
    if not existing:
        raise HTTPException(404, "Course not found")
    if existing.user_id != str(current_user.id):
        raise HTTPException(403, "Cannot edit a master course. Clone it first.")

    updates = req.model_dump(exclude_unset=True)
    updated = await db.courses.update_course(str(course_id), user_id=str(current_user.id), **updates)
    if not updated:
        raise HTTPException(404, "Course not found or not owned by user")
    return _summarize_course(updated)


@router.post("/{course_id}/clone", status_code=201)
async def clone_course(
    course_id: UUID,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clone a master course as a user-owned custom course."""
    try:
        source = await db.courses.get_course(str(course_id))
        if not source:
            raise HTTPException(404, "Source course not found")
        if source.user_id and str(source.user_id) != str(current_user.id):
            raise HTTPException(403, "Forbidden")
        cloned = await db.courses.clone_course(str(course_id), str(current_user.id))
        return _summarize_course(cloned)
    except NotFoundError:
        raise HTTPException(404, "Source course not found")
    except DuplicateError:
        raise HTTPException(409, "You already have a custom copy of this course")
