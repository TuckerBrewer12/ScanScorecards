"""User API endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from typing import List, Optional
from database.db_manager import DatabaseManager
from database.exceptions import DuplicateError, NotFoundError
from api.dependencies import get_current_user, get_db
from api.input_validation import normalize_email, normalize_handicap_value, sanitize_user_text
from models import User, UserTee
from analytics import handicap as hcap

router = APIRouter()


def _validate_hole_yardages_dict(value: Optional[dict]) -> Optional[dict]:
    if value is None:
        return None
    out = {}
    for raw_k, raw_v in value.items():
        try:
            hole_num = int(raw_k)
        except Exception as exc:  # noqa: BLE001
            raise ValueError("hole_yardages keys must be numeric hole numbers.") from exc
        if not (1 <= hole_num <= 18):
            raise ValueError("hole_yardages hole number must be between 1 and 18.")
        if raw_v is not None and not (50 <= int(raw_v) <= 900):
            raise ValueError("hole_yardages value must be between 50 and 900.")
        out[hole_num] = int(raw_v) if raw_v is not None else None
    return out


class CreateUserTeeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    course_id: Optional[UUID] = None
    name: str = Field(..., min_length=1, max_length=60)
    slope_rating: Optional[float] = Field(default=None, ge=55, le=155)
    course_rating: Optional[float] = Field(default=None, ge=55, le=85)
    hole_yardages: Optional[dict] = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, v: str) -> str:
        return sanitize_user_text(v, field_name="name", max_length=60)

    @field_validator("hole_yardages")
    @classmethod
    def _validate_hole_yardages(cls, value: Optional[dict]) -> Optional[dict]:
        return _validate_hole_yardages_dict(value)


class UpdateUserTeeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: Optional[str] = None
    slope_rating: Optional[float] = Field(default=None, ge=55, le=155)
    course_rating: Optional[float] = Field(default=None, ge=55, le=85)
    hole_yardages: Optional[dict] = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_user_text(v, field_name="name", max_length=60)

    @field_validator("hole_yardages")
    @classmethod
    def _validate_hole_yardages(cls, value: Optional[dict]) -> Optional[dict]:
        return _validate_hole_yardages_dict(value)


class UpdateUserRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    home_course_id: Optional[UUID] = None
    handicap: Optional[float] = Field(default=None, ge=-10, le=54)
    scoring_goal: Optional[int] = Field(default=None, ge=50, le=150)

    @field_validator("handicap", mode="before")
    @classmethod
    def _normalize_handicap(cls, v: object) -> object:
        return normalize_handicap_value(v)


class SendFriendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    addressee_user_id: Optional[UUID] = None
    addressee_friend_code: Optional[str] = Field(default=None, min_length=4, max_length=24)

    @field_validator("addressee_friend_code")
    @classmethod
    def _validate_friend_code(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        code = sanitize_user_text(v, field_name="addressee_friend_code", max_length=24).upper()
        if not code.replace("-", "").isalnum():
            raise ValueError("addressee_friend_code must be alphanumeric.")
        return code

    @model_validator(mode="after")
    def _validate_target_selector(self):
        if self.addressee_user_id and self.addressee_friend_code:
            raise ValueError("Provide either addressee_user_id or addressee_friend_code, not both.")
        if not self.addressee_user_id and not self.addressee_friend_code:
            raise ValueError("Provide addressee_friend_code or addressee_user_id.")
        return self


class FriendshipStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str = Field(..., pattern="^(accepted|declined|blocked)$")


class FriendshipResponse(BaseModel):
    id: str
    requester_id: str
    addressee_id: str
    status: str
    created_at: str
    updated_at: str
    requester_name: Optional[str] = None
    requester_email: Optional[str] = None
    addressee_name: Optional[str] = None
    addressee_email: Optional[str] = None


def _friendship_row_to_response(row: dict) -> FriendshipResponse:
    return FriendshipResponse(
        id=str(row["id"]),
        requester_id=str(row["requester_id"]),
        addressee_id=str(row["addressee_id"]),
        status=row["status"],
        created_at=row["created_at"].isoformat() if row.get("created_at") else "",
        updated_at=row["updated_at"].isoformat() if row.get("updated_at") else "",
        requester_name=row.get("requester_name"),
        requester_email=row.get("requester_email"),
        addressee_name=row.get("addressee_name"),
        addressee_email=row.get("addressee_email"),
    )


@router.get("/by-email/{email}")
async def get_user_by_email(
    email: str,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        normalized_email = normalize_email(email)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    if normalized_email != (current_user.email or "").lower():
        raise HTTPException(403, "Forbidden")
    user = await db.users.get_user_by_email(normalized_email)
    if not user:
        raise HTTPException(404, "User not found")
    return user


@router.get("/{user_id}")
async def get_user(
    user_id: UUID,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if str(current_user.id) != str(user_id):
        raise HTTPException(403, "Forbidden")
    user = await db.users.get_user(str(user_id))
    if not user:
        raise HTTPException(404, "User not found")
    return user


@router.patch("/{user_id}")
async def update_user(
    user_id: UUID,
    req: UpdateUserRequest,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if str(current_user.id) != str(user_id):
        raise HTTPException(403, "Forbidden")

    updates = req.model_dump(exclude_unset=True)
    if "home_course_id" in updates and updates["home_course_id"] is not None:
        home_course_id = str(updates["home_course_id"])
        course = await db.courses.get_course(home_course_id)
        if not course:
            raise HTTPException(400, "Selected home course was not found")
        if course.user_id and str(course.user_id) != str(current_user.id):
            raise HTTPException(403, "Forbidden")
        updates["home_course_id"] = home_course_id
    if "handicap" in updates:
        updates["handicap_index"] = updates.pop("handicap")
    user = await db.users.update_user(str(user_id), **updates)
    if not user:
        raise HTTPException(404, "User not found")
    return user


@router.get("/{user_id}/handicap")
async def get_user_handicap(
    user_id: UUID,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the user's current WHS Handicap Index."""
    if str(current_user.id) != str(user_id):
        raise HTTPException(403, "Forbidden")
    user = await db.users.get_user(str(user_id))
    if not user:
        raise HTTPException(404, "User not found")
    rounds = await db.rounds.get_rounds_for_user(str(user_id))
    rounds_chrono = list(reversed(rounds))
    hi = hcap.handicap_index(
        rounds_chrono,
        seed_handicap=user.handicap,
        seed_set_at=user.last_handicap_update,
    )
    return {"handicap_index": hi}


# ================================================================
# User tees
# ================================================================

@router.get("/{user_id}/tees", response_model=List[UserTee])
async def get_user_tees(
    user_id: UUID,
    course_id: Optional[UUID] = Query(None),
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List a user's custom tee configurations."""
    if str(current_user.id) != str(user_id):
        raise HTTPException(403, "Forbidden")
    return await db.user_tees.get_user_tees(str(user_id), course_id=str(course_id) if course_id else None)


@router.post("/{user_id}/tees", response_model=UserTee, status_code=201)
async def create_user_tee(
    user_id: UUID,
    req: CreateUserTeeRequest,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a user tee configuration."""
    if str(current_user.id) != str(user_id):
        raise HTTPException(403, "Forbidden")
    tee = UserTee(
        user_id=str(user_id),
        course_id=str(req.course_id) if req.course_id else None,
        name=req.name,
        slope_rating=req.slope_rating,
        course_rating=req.course_rating,
        hole_yardages=(req.hole_yardages or {}),
    )
    try:
        return await db.user_tees.create_user_tee(tee)
    except DuplicateError:
        raise HTTPException(409, f"User tee '{req.name}' already exists for this course")


@router.put("/{user_id}/tees/{tee_id}", response_model=UserTee)
async def update_user_tee(
    user_id: UUID,
    tee_id: UUID,
    req: UpdateUserTeeRequest,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a user tee configuration."""
    if str(current_user.id) != str(user_id):
        raise HTTPException(403, "Forbidden")
    updates = req.model_dump(exclude_none=True)
    try:
        return await db.user_tees.update_user_tee(str(tee_id), user_id=str(user_id), **updates)
    except NotFoundError:
        raise HTTPException(404, "User tee not found")


@router.delete("/{user_id}/tees/{tee_id}", status_code=204)
async def delete_user_tee(
    user_id: UUID,
    tee_id: UUID,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a user tee configuration."""
    if str(current_user.id) != str(user_id):
        raise HTTPException(403, "Forbidden")
    deleted = await db.user_tees.delete_user_tee(str(tee_id), user_id=str(user_id))
    if not deleted:
        raise HTTPException(404, "User tee not found")


# ================================================================
# Friendships
# ================================================================

@router.post("/me/friends", response_model=FriendshipResponse, status_code=201)
async def send_friend_request(
    req: SendFriendRequest,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send (or re-open) a friend request to another user."""
    addressee_user_id: Optional[str] = str(req.addressee_user_id) if req.addressee_user_id else None
    addressee_friend_code = (req.addressee_friend_code or "").strip().upper()

    if addressee_friend_code:
        target_user = await db.users.get_user_by_friend_code(addressee_friend_code)
        if not target_user or not target_user.id:
            raise HTTPException(404, "Friend code not found")
        addressee_user_id = str(target_user.id)

    try:
        row = await db.friendships.send_request(str(current_user.id), str(addressee_user_id))
        rows = await db.friendships.list_for_user(str(current_user.id))
        match = next((r for r in rows if str(r["id"]) == str(row["id"])), row)
        return _friendship_row_to_response(match)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except DuplicateError as e:
        raise HTTPException(409, str(e))


@router.patch("/me/friends/{friendship_id}", response_model=FriendshipResponse)
async def update_friendship_status(
    friendship_id: UUID,
    req: FriendshipStatusRequest,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Accept/decline/block a friendship request."""
    try:
        updated = await db.friendships.update_status(
            str(friendship_id), str(current_user.id), req.status
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not updated:
        raise HTTPException(404, "Friendship not found or action not permitted")

    rows = await db.friendships.list_for_user(str(current_user.id))
    match = next((r for r in rows if str(r["id"]) == str(updated["id"])), updated)
    return _friendship_row_to_response(match)


@router.get("/me/friends", response_model=List[FriendshipResponse])
async def list_friendships(
    status: Optional[str] = Query(None, pattern="^(pending|accepted|declined|blocked)$"),
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List friendships for the current user."""
    rows = await db.friendships.list_for_user(str(current_user.id), status=status)
    return [_friendship_row_to_response(r) for r in rows]
