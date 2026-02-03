from datetime import datetime
from pydantic import Field
from typing import List, Optional, TYPE_CHECKING

from .base import BaseGolfModel

if TYPE_CHECKING:
    from .round import Round

class User(BaseGolfModel):
    """Golfer with their rounds and handicap."""
    id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    home_course_id: Optional[str] = None
    handicap: Optional[float] = Field(None, ge=-10, le=54)
    rounds: List["Round"] = Field(default_factory=list)
    created_at: Optional[datetime] = None