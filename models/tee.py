from pydantic import Field, field_validator
from typing import Dict, Optional

from .base import BaseGolfModel


class Tee(BaseGolfModel):
    """Represents a tee box option with its ratings and hole yardages."""
    color: Optional[str] = None
    total_yardage: Optional[int] = Field(None, ge=0)
    hole_yardages: Dict[int, int] = Field(default_factory=dict)
    slope_rating: Optional[float] = Field(None, ge=55, le=155)
    course_rating: Optional[float] = Field(None, ge=55.0, le=85.0)

    @field_validator('hole_yardages')
    @classmethod
    def validate_hole_yardages(cls, v):
        for hole_num, yardage in v.items():
            if not 1 <= hole_num <= 18:
                raise ValueError(f"Hole number {hole_num} must be 1-18")
            if yardage < 0:
                raise ValueError(f"Yardage for hole {hole_num} cannot be negative")
            if yardage > 700:
                raise ValueError(f"Yardage {yardage} for hole {hole_num} seems too high")
        return v

    def get_hole_yardage(self, hole_number: int) -> Optional[int]:
        """Get yardage for a specific hole."""
        return self.hole_yardages.get(hole_number)

    def get_total_yardage(self) -> Optional[int]:
        """Get total yardage - uses provided value or calculates from holes."""
        if self.total_yardage is not None:
            return self.total_yardage
        if not self.hole_yardages:
            return None
        return sum(self.hole_yardages.values())