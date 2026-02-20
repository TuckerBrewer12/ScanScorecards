"""API-specific response models for list views and aggregated data."""

from datetime import datetime
from pydantic import BaseModel
from typing import List, Optional


class RoundSummaryResponse(BaseModel):
    """Lightweight round for list views."""
    id: str
    course_name: Optional[str] = None
    course_location: Optional[str] = None
    course_par: Optional[int] = None
    tee_box: Optional[str] = None
    date: Optional[datetime] = None
    total_score: Optional[int] = None
    to_par: Optional[int] = None
    front_nine: Optional[int] = None
    back_nine: Optional[int] = None
    total_putts: Optional[int] = None
    total_gir: Optional[int] = None
    fairways_hit: Optional[int] = None
    notes: Optional[str] = None


class DashboardResponse(BaseModel):
    """Aggregated stats for the dashboard page."""
    total_rounds: int
    scoring_average: Optional[float] = None
    best_round: Optional[int] = None
    best_round_id: Optional[str] = None
    best_round_course: Optional[str] = None
    handicap: Optional[float] = None
    recent_rounds: List[RoundSummaryResponse]
    average_putts: Optional[float] = None
    average_gir: Optional[float] = None


class CourseSummaryResponse(BaseModel):
    """Course for card/list views."""
    id: str
    name: Optional[str] = None
    location: Optional[str] = None
    par: Optional[int] = None
    total_holes: int = 0
    tee_count: int = 0
