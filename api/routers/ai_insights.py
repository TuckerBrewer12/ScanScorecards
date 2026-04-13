"""AI Suggestions router."""

import logging
from hashlib import sha256
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from database.db_manager import DatabaseManager
from api.dependencies import client_ip, get_current_user, get_db
from models import User
from api.schemas import AISuggestionsResponse
from api.security import SlidingWindowRateLimiter, env_int
from services.ai_service import AIService

router = APIRouter()
logger = logging.getLogger(__name__)
ai_rate_limiter = SlidingWindowRateLimiter()



@router.get("/{user_id}", response_model=AISuggestionsResponse)
async def get_ai_suggestions(
    user_id: UUID,
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    target_handicap: Optional[float] = Query(default=None, ge=-10, le=54),
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id_str = str(user_id)
    if str(current_user.id) != user_id_str:
        raise HTTPException(403, "Forbidden")
    ip = client_ip(request)
    allowed, retry_after = ai_rate_limiter.check(
        key=f"ai:ip:{ip}",
        limit=env_int("AI_RATE_LIMIT_MAX_REQUESTS", 12),
        window_seconds=env_int("AI_RATE_LIMIT_WINDOW_SECONDS", 3600),
    )
    if not allowed:
        logger.warning("AI endpoint rate-limited: ip=%s user_id=%s retry_after=%s", ip, user_id_str, retry_after)
        raise HTTPException(
            status_code=429,
            detail="Too many AI insight requests. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    allowed_user, retry_after_user = ai_rate_limiter.check(
        key=f"ai:user:{sha256(user_id_str.encode('utf-8')).hexdigest()[:12]}",
        limit=env_int("AI_RATE_LIMIT_PER_USER_MAX_REQUESTS", 20),
        window_seconds=env_int("AI_RATE_LIMIT_PER_USER_WINDOW_SECONDS", 3600),
    )
    if not allowed_user:
        logger.warning("AI endpoint user-rate-limited: user_id=%s retry_after=%s", user_id_str, retry_after_user)
        raise HTTPException(
            status_code=429,
            detail="Too many AI insight requests for this account. Please try again later.",
            headers={"Retry-After": str(retry_after_user)},
        )

    user = await db.users.get_user(user_id_str)
    if not user:
        raise HTTPException(404, "User not found")

    service = AIService(db)
    return await service.generate_suggestions(user_id_str, limit=limit, target_handicap=target_handicap)
