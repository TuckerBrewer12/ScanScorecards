"""AI Suggestions router."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from database.db_manager import DatabaseManager
from api.dependencies import get_current_user, get_db
from models import User
from api.schemas import AISuggestionsResponse
from services.ai_service import AIService

router = APIRouter()


@router.get("/{user_id}", response_model=AISuggestionsResponse)
async def get_ai_suggestions(
    user_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    target_handicap: Optional[float] = Query(default=None),
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if str(current_user.id) != user_id:
        raise HTTPException(403, "Forbidden")
    user = await db.users.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")

    service = AIService(db)
    return await service.generate_suggestions(user_id, limit=limit, target_handicap=target_handicap)
