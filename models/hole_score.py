from pydantic import Field, model_validator
from typing import Optional

from .base import BaseGolfModel


class HoleScore(BaseGolfModel):
    """Represents a player's score on a single hole (raw scanned data)."""
    hole_number: Optional[int] = Field(None, ge=1, le=18)
    strokes: Optional[int] = Field(None, ge=1, le=15)
    net_score: Optional[int] = Field(None, ge=-3, le=15)
    putts: Optional[int] = Field(None, ge=0, le=10)
    shots_to_green: Optional[int] = Field(None, ge=1, le=10)
    fairway_hit: Optional[bool] = None
    green_in_regulation: Optional[bool] = None

    @model_validator(mode='after')
    def validate_score_consistency(self):
        if self.putts is not None and self.strokes is not None:
            if self.putts > self.strokes:
                raise ValueError(f"Putts ({self.putts}) cannot exceed strokes ({self.strokes})")
        return self

    def to_par(self, par: int) -> Optional[int]:
        """Calculate score relative to par."""
        if self.strokes is None:
            return None
        return self.strokes - par

    def get_score_type(self, par: int) -> Optional[str]:
        """Get score name (eagle, birdie, par, bogey, etc.)."""
        relative = self.to_par(par)
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
            return "5+ over"
        return score_names.get(relative)