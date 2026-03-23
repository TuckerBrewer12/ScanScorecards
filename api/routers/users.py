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


class SendFriendRequest(BaseModel):
    addressee_user_id: Optional[str] = None
    addressee_friend_code: Optional[str] = None


class FriendshipStatusRequest(BaseModel):
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
    user = await db.users.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    rounds = await db.rounds.get_rounds_for_user(user_id)
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
    addressee_user_id: Optional[str] = req.addressee_user_id
    addressee_friend_code = (req.addressee_friend_code or "").strip().upper()

    if addressee_user_id and addressee_friend_code:
        raise HTTPException(400, "Provide either addressee_user_id or addressee_friend_code, not both")
    if not addressee_user_id and not addressee_friend_code:
        raise HTTPException(400, "Provide addressee_friend_code")

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
    friendship_id: str,
    req: FriendshipStatusRequest,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Accept/decline/block a friendship request."""
    try:
        updated = await db.friendships.update_status(
            friendship_id, str(current_user.id), req.status
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
