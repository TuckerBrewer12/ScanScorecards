"""User API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from database.db_manager import DatabaseManager
from api.dependencies import get_db

router = APIRouter()


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
