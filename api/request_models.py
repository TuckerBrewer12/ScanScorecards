"""Typed Pydantic request/input models shared across API routers."""

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from api.input_validation import ensure_uuid_str, normalize_course_display_name, sanitize_user_text


class HoleScoreInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hole_number: int = Field(..., ge=1, le=18)
    strokes: Optional[int] = Field(default=None, ge=1, le=15)
    putts: Optional[int] = Field(default=None, ge=0, le=10)
    net_score: Optional[int] = None
    shots_to_green: Optional[int] = Field(default=None, ge=1, le=10)
    fairway_hit: Optional[bool] = None
    green_in_regulation: Optional[bool] = None
    par_played: Optional[int] = Field(default=None, ge=3, le=6)
    handicap_played: Optional[int] = Field(default=None, ge=1, le=18)

    @model_validator(mode="after")
    def _validate_putts_vs_strokes(self):
        if self.putts is not None and self.strokes is not None and self.putts > self.strokes:
            raise ValueError("putts cannot exceed strokes.")
        return self


class TeeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    color: str = Field(..., min_length=1, max_length=40)
    slope_rating: Optional[float] = Field(default=None, ge=55, le=155)
    course_rating: Optional[float] = Field(default=None, ge=55, le=85)
    hole_yardages: Dict[str, Optional[int]] = Field(default_factory=dict)

    @field_validator("color")
    @classmethod
    def _validate_color(cls, v: str) -> str:
        return sanitize_user_text(v, field_name="tee color", max_length=40)

    @field_validator("hole_yardages")
    @classmethod
    def _validate_hole_yardages(cls, value: Dict[str, Optional[int]]) -> Dict[str, Optional[int]]:
        out: Dict[str, Optional[int]] = {}
        for raw_k, raw_v in (value or {}).items():
            try:
                hole_num = int(raw_k)
            except Exception as exc:  # noqa: BLE001
                raise ValueError("hole_yardages keys must be hole numbers (1-18).") from exc
            if not (1 <= hole_num <= 18):
                raise ValueError("hole_yardages hole number must be between 1 and 18.")
            if raw_v is not None and not (50 <= int(raw_v) <= 900):
                raise ValueError("hole_yardages value must be between 50 and 900.")
            out[str(hole_num)] = int(raw_v) if raw_v is not None else None
        return out


class CourseHoleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hole_number: int = Field(..., ge=1, le=18)
    par: Optional[int] = Field(default=None, ge=3, le=6)
    handicap: Optional[int] = Field(default=None, ge=1, le=18)


class SaveRoundRequest(BaseModel):
    """Request to save a reviewed/edited round."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    user_id: str = ""  # populated from JWT by the endpoint; ignored if sent by client
    course_id: Optional[str] = None   # explicit DB course id — skips fuzzy match when provided
    external_course_id: Optional[str] = Field(default=None, max_length=100)
    course_name: Optional[str] = None
    course_location: Optional[str] = None
    tee_box: Optional[str] = None
    tee_slope_rating: Optional[float] = Field(default=None, ge=55, le=155)
    tee_course_rating: Optional[float] = Field(default=None, ge=55, le=85)
    tee_yardages: Optional[Dict[str, Optional[int]]] = None
    all_tees: Optional[List[TeeInput]] = None
    hole_scores: List[HoleScoreInput] = Field(..., min_length=1, max_length=18)
    course_holes: Optional[List[CourseHoleInput]] = None
    date: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("course_id")
    @classmethod
    def _validate_course_id(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return ensure_uuid_str(v, "course_id")

    @field_validator("external_course_id")
    @classmethod
    def _validate_external_course_id(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_user_text(
            v, field_name="external_course_id", max_length=100, allow_newlines=False
        )

    @field_validator("course_name")
    @classmethod
    def _validate_course_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        sanitized = sanitize_user_text(v, field_name="course_name", max_length=140)
        return normalize_course_display_name(sanitized)

    @field_validator("course_location")
    @classmethod
    def _validate_course_location(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_user_text(v, field_name="course_location", max_length=140)

    @field_validator("tee_box")
    @classmethod
    def _validate_tee_box(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_user_text(v, field_name="tee_box", max_length=40)

    @field_validator("date")
    @classmethod
    def _validate_date(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        try:
            datetime.fromisoformat(v)
        except ValueError as exc:
            raise ValueError("date must be a valid ISO-8601 datetime/date string.") from exc
        return v

    @field_validator("notes")
    @classmethod
    def _validate_notes(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_user_text(v, field_name="notes", max_length=2_000, allow_newlines=True)

    @model_validator(mode="after")
    def _validate_hole_rows(self):
        hole_nums = [h.hole_number for h in self.hole_scores]
        if len(set(hole_nums)) != len(hole_nums):
            raise ValueError("hole_scores cannot contain duplicate hole_number values.")
        if self.course_holes:
            course_hole_nums = [h.hole_number for h in self.course_holes]
            if len(set(course_hole_nums)) != len(course_hole_nums):
                raise ValueError("course_holes cannot contain duplicate hole_number values.")
        return self
