"""Authentication endpoints: register, login, me."""

from fastapi import APIRouter, Depends, HTTPException

from api.auth_schemas import LoginRequest, RegisterRequest, TokenResponse
from api.auth_utils import create_access_token, hash_password, verify_password
from api.dependencies import get_current_user, get_db
from database.db_manager import DatabaseManager
from database.exceptions import DuplicateError
from models import User

router = APIRouter()


@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, db: DatabaseManager = Depends(get_db)):
    existing = await db.users.get_user_by_email(req.email)
    if existing:
        raise HTTPException(409, "An account with this email already exists")

    if req.home_course_id:
        course = await db.courses.get_course(req.home_course_id)
        if not course:
            raise HTTPException(400, "Selected home course was not found")

    password_hash = hash_password(req.password)
    try:
        user = await db.users.create_user(
            User(
                name=req.name,
                email=req.email,
                handicap=req.handicap,
                home_course_id=req.home_course_id,
            ),
            password_hash=password_hash,
        )
    except DuplicateError:
        raise HTTPException(409, "An account with this email already exists")

    token = create_access_token(str(user.id))
    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        name=user.name or "",
        email=user.email or "",
    )


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: DatabaseManager = Depends(get_db)):
    user = await db.users.get_user_by_email(req.email)
    pw_hash = await db.users.get_password_hash(req.email) if user else None

    if not user or not pw_hash:
        raise HTTPException(401, "Invalid email or password")

    if not verify_password(req.password, pw_hash):
        raise HTTPException(401, "Invalid email or password")

    token = create_access_token(str(user.id))
    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        name=user.name or "",
        email=user.email or "",
    )


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return {
        "user_id": str(current_user.id),
        "friend_code": current_user.friend_code,
        "name": current_user.name,
        "email": current_user.email,
    }
