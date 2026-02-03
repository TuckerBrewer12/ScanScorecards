from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
from typing import Any, Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from .hole import Hole


class Tee(BaseModel):
    """Tee box option at a course."""
    color: Optional[str] = None
    name: Optional[str] = None
    total_yardage: Optional[int] = Field(None, ge=0)


class Course(BaseModel):
    """Golf course with its holes and tee options."""
    model_config = ConfigDict(validate_assignment=True)

    id: Optional[str] = None
    name: Optional[str] = None
    location: Optional[str] = None
    slope_rating: Dict[str, float] = Field(default_factory=dict)
    course_rating: Dict[str, float] = Field(default_factory=dict)
    par: Optional[int] = Field(None, ge=54, le=80)
    holes: List["Hole"] = Field(default_factory=list)
    tees: List[Tee] = Field(default_factory=list)

    @field_validator('slope_rating')
    @classmethod
    def validate_slope_values(cls, v):
        for tee_color, slope in v.items():
            if slope is not None and not 55 <= slope <= 155:
                raise ValueError(f"Slope {slope} for '{tee_color}' outside USGA range (55-155)")
        return v

    @field_validator('course_rating')
    @classmethod
    def validate_course_rating_values(cls, v):
        for tee_color, rating in v.items():
            if rating is not None and not 55.0 <= rating <= 85.0:
                raise ValueError(f"Course rating {rating} for '{tee_color}' outside range (55-85)")
        return v

    @model_validator(mode='after')
    def validate_tee_rating_consistency(self):
        """Ensure each tee has corresponding slope and course ratings."""
        for tee in self.tees:
            if tee.color:
                if tee.color not in self.slope_rating:
                    raise ValueError(f"Tee '{tee.color}' missing slope rating")
                if tee.color not in self.course_rating:
                    raise ValueError(f"Tee '{tee.color}' missing course rating")
        return self

    def update_field(self, field_name: str, value: Any) -> Optional[str]:
        """
        Update a field with user correction.
        Returns error message if validation fails, None if successful.
        """
        try:
            setattr(self, field_name, value)
            return None
        except ValidationError as e:
            return e.errors()[0]['msg']

    def update_slope_rating(self, tee_color: str, slope: float) -> Optional[str]:
        """Update slope rating for a specific tee color."""
        new_ratings = {**self.slope_rating, tee_color: slope}
        return self.update_field('slope_rating', new_ratings)

    def update_course_rating(self, tee_color: str, rating: float) -> Optional[str]:
        """Update course rating for a specific tee color."""
        new_ratings = {**self.course_rating, tee_color: rating}
        return self.update_field('course_rating', new_ratings)

    def get_tee(self, color: str) -> Optional[Tee]:
        """Get a tee by its color."""
        for tee in self.tees:
            if tee.color and tee.color.lower() == color.lower():
                return tee
        return None

    def get_hole(self, number: int) -> Optional["Hole"]:
        """Get a hole by its number (1-18)."""
        if 1 <= number <= len(self.holes):
            return self.holes[number - 1]
        return None

    @property
    def front_nine_par(self) -> Optional[int]:
        """Calculate par for holes 1-9."""
        front = [h for h in self.holes if h.number and 1 <= h.number <= 9]
        if not front or any(h.par is None for h in front):
            return None
        return sum(h.par for h in front)

    @property
    def back_nine_par(self) -> Optional[int]:
        """Calculate par for holes 10-18."""
        back = [h for h in self.holes if h.number and 10 <= h.number <= 18]
        if not back or any(h.par is None for h in back):
            return None
        return sum(h.par for h in back)
