from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from typing import Any, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from .course import Course
    from .hole_score import HoleScore
    from .tee import Tee


class Round(BaseModel):
    """Represents a round of golf played by a user."""
    model_config = ConfigDict(validate_assignment=True)

    id: Optional[str] = None
    user_id: Optional[str] = None
    course: Optional[Course] = None
    tee_color: Optional[str] = None
    date: Optional[datetime] = None
    hole_scores: List[HoleScore] = Field(default_factory=list)
    weather_conditions: Optional[str] = None
    notes: Optional[str] = None

    # Optional summary totals - can be provided directly or calculated
    total_putts: Optional[int] = None
    total_gir: Optional[int] = None

    def get_tee(self) -> Optional["Tee"]:
        """Get the tee used for this round."""
        if self.course and self.tee_color:
            return self.course.get_tee(self.tee_color)
        return None

    def get_total_putts(self) -> Optional[int]:
        """Get total putts - uses provided value or calculates from holes."""
        if self.total_putts is not None:
            return self.total_putts
        putts = [s.putts for s in self.hole_scores if s.putts is not None]
        return sum(putts) if putts else None

    def get_total_gir(self) -> Optional[int]:
        """Get total GIR - uses provided value or calculates from holes."""
        if self.total_gir is not None:
            return self.total_gir
        girs = [s.green_in_regulation for s in self.hole_scores
                if s.green_in_regulation is not None]
        return sum(girs) if girs else None

    def calculate_total_score(self) -> Optional[int]:
        """Calculate total strokes for the round."""
        strokes = [s.strokes for s in self.hole_scores if s.strokes is not None]
        return sum(strokes) if strokes else None

    def calculate_front_nine(self) -> Optional[int]:
        """Calculate total strokes for holes 1-9."""
        front = [s.strokes for s in self.hole_scores
                 if s.hole_number and 1 <= s.hole_number <= 9 and s.strokes is not None]
        return sum(front) if front else None

    def calculate_back_nine(self) -> Optional[int]:
        """Calculate total strokes for holes 10-18."""
        back = [s.strokes for s in self.hole_scores
                if s.hole_number and 10 <= s.hole_number <= 18 and s.strokes is not None]
        return sum(back) if back else None

    def is_complete(self) -> bool:
        """Check if all holes have scores."""
        if not self.hole_scores:
            return False
        expected = 18 if len(self.hole_scores) > 9 else 9
        valid_scores = [s for s in self.hole_scores if s.strokes is not None]
        return len(valid_scores) == expected

    def update_field(self, field_name: str, value: Any) -> Optional[str]:
        """Update a field with user correction. Returns error message if validation fails."""
        try:
            setattr(self, field_name, value)
            return None
        except ValidationError as e:
            return e.errors()[0]['msg']

    def get_hole_score(self, hole_number: int) -> Optional["HoleScore"]:
        """Get score for a specific hole."""
        for score in self.hole_scores:
            if score.hole_number == hole_number:
                return score
        return None