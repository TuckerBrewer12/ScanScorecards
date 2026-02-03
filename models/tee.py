from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from typing import Any, Dict, Optional


class Tee(BaseModel):
    """Represents a tee box option with its ratings and hole yardages."""
    model_config = ConfigDict(validate_assignment=True)

    color: Optional[str] = None  # "white", "blue", "black", "red", "gold"
    total_yardage: Optional[int] = Field(None, ge=0)
    slope_rating: Optional[float] = Field(None, ge=55, le=155)
    course_rating: Optional[float] = Field(None, ge=55.0, le=85.0)
    course_id: Optional[str] = None
    hole_yardages: Dict[int, int] = Field(default_factory=dict)  # {1: 385, 2: 452, ...}

    @field_validator('hole_yardages')
    @classmethod
    def validate_hole_yardages(cls, v):
        for hole_num, yardage in v.items():
            if not 1 <= hole_num <= 18:
                raise ValueError(f"Hole number {hole_num} must be 1-18")
            if yardage < 0:
                raise ValueError(f"Yardage for hole {hole_num} cannot be negative")
            if yardage > 700:
                raise ValueError(f"Yardage {yardage} for hole {hole_num} seems too high. Please verify.")
        return v

    def calculate_total_yardage(self) -> Optional[int]:
        """Calculate total yardage from hole yardages."""
        if not self.hole_yardages:
            return None
        return sum(self.hole_yardages.values())

    def get_hole_yardage(self, hole_number: int) -> Optional[int]:
        """Get yardage for a specific hole."""
        return self.hole_yardages.get(hole_number)

    def update_field(self, field_name: str, value: Any) -> Optional[str]:
        """Update a field with user correction. Returns error message if validation fails."""
        try:
            setattr(self, field_name, value)
            return None
        except ValidationError as e:
            return e.errors()[0]['msg']

    def update_hole_yardage(self, hole_number: int, yardage: int) -> Optional[str]:
        """Update yardage for a specific hole."""
        new_yardages = {**self.hole_yardages, hole_number: yardage}
        return self.update_field('hole_yardages', new_yardages)