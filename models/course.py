from pydantic import BaseModel, ConfigDict, Field, ValidationError
from typing import Any, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from .hole import Hole
    from .tee import Tee


class Course(BaseModel):
    """Represents a golf course with its holes and tee options."""
    model_config = ConfigDict(validate_assignment=True)

    id: Optional[str] = None
    name: Optional[str] = None
    location: Optional[str] = None
    par: Optional[int] = Field(None, ge=54, le=80)
    holes: List["Hole"] = Field(default_factory=list)
    tees: List["Tee"] = Field(default_factory=list)

    def get_tee(self, color: str) -> Optional["Tee"]:
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

    def update_field(self, field_name: str, value: Any) -> Optional[str]:
        """Update a field with user correction. Returns error message if validation fails."""
        try:
            setattr(self, field_name, value)
            return None
        except ValidationError as e:
            return e.errors()[0]['msg']

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