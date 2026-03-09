"""Typed Pydantic request/input models shared across API routers."""

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class HoleScoreInput(BaseModel):
    hole_number: int
    strokes: Optional[int] = None
    putts: Optional[int] = None
    net_score: Optional[int] = None
    shots_to_green: Optional[int] = None
    fairway_hit: Optional[bool] = None
    green_in_regulation: Optional[bool] = None
    par_played: Optional[int] = None
    handicap_played: Optional[int] = None


class TeeInput(BaseModel):
    color: str
    slope_rating: Optional[float] = None
    course_rating: Optional[float] = None
    hole_yardages: Dict[str, Optional[int]] = Field(default_factory=dict)


class CourseHoleInput(BaseModel):
    hole_number: int
    par: Optional[int] = None
    handicap: Optional[int] = None


class SaveRoundRequest(BaseModel):
    """Request to save a reviewed/edited round."""
    user_id: str = ""  # populated from JWT by the endpoint; ignored if sent by client
    course_name: Optional[str] = None
    course_location: Optional[str] = None
    tee_box: Optional[str] = None
    tee_slope_rating: Optional[float] = None
    tee_course_rating: Optional[float] = None
    tee_yardages: Optional[Dict[str, Optional[int]]] = None
    all_tees: Optional[List[TeeInput]] = None
    hole_scores: List[HoleScoreInput]
    course_holes: Optional[List[CourseHoleInput]] = None
    date: Optional[str] = None
    notes: Optional[str] = None
