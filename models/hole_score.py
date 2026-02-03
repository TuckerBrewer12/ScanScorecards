from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from typing import Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from .hole import Hole


class HoleScore(BaseModel):
    """Represents a player's score on a single hole."""
    model_config = ConfigDict(validate_assignment=True)

    hole_number: Optional[int] = Field(None, ge=1, le=18)
    strokes: Optional[int] = Field(None, ge=1, le=15)
    putts: Optional[int] = Field(None, ge=0, le=10)
    fairway_hit: Optional[bool] = None
    green_in_regulation: Optional[bool] = None
    penalties: int = Field(0, ge=0, le=5)
    hole: Optional[Hole] = None

    @model_validator(mode='after')
    def validate_score_consistency(self):
        # Putts cannot exceed strokes
        if self.putts is not None and self.strokes is not None:
            if self.putts > self.strokes:
                raise ValueError(f"Putts ({self.putts}) cannot exceed strokes ({self.strokes})")

        # Fairway hit must be None for par 3s
        if self.hole and self.hole.par == 3 and self.fairway_hit is not None:
            raise ValueError("Fairway hit should be None for par 3 holes")

        return self

    def to_par(self) -> Optional[int]:
        """Calculate score relative to par (+2, -1, etc.)."""
        if self.strokes is None or self.hole is None or self.hole.par is None:
            return None
        return self.strokes - self.hole.par

    def is_valid(self) -> bool:
        """Check if all required fields are present and valid."""
        if self.hole_number is None or self.strokes is None:
            return False
        if self.hole is None or self.hole.par is None:
            return False
        return True

    def get_score_type(self) -> Optional[str]:
        """Get the name for this score (eagle, birdie, par, bogey, etc.)."""
        relative = self.to_par()
        if relative is None:
            return None

        score_names = {
            -3: "albatross",
            -2: "eagle",
            -1: "birdie",
            0: "par",
            1: "bogey",
            2: "double bogey",
            3: "triple bogey",
            4: "quadruple bogey",

        }
        if relative <= -3:
            return "albatross"
        if relative >= 5:
            return "quintuple+"
        return score_names.get(relative)

    def update_field(self, field_name: str, value: Any) -> Optional[str]:
        """Update a field with user correction. Returns error message if validation fails."""
        try:
            setattr(self, field_name, value)
            return None
        except ValidationError as e:
            return e.errors()[0]['msg']