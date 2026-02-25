from datetime import datetime
from pydantic import Field
from typing import Dict, Optional

from .base import BaseGolfModel


class UserTee(BaseGolfModel):
    """A user-owned tee configuration, optionally linked to a master course."""
    id: Optional[str] = None
    user_id: str
    course_id: Optional[str] = None
    name: str
    slope_rating: Optional[float] = Field(None, ge=55, le=155)
    course_rating: Optional[float] = Field(None, ge=55, le=85)
    hole_yardages: Dict[int, int] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
