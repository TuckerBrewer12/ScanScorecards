from pydantic import Field
from typing import List, Optional

from .base import BaseGolfModel
from .hole import Hole
from .tee import Tee


class Course(BaseGolfModel):
    """Represents a golf course with its holes and tee options.

    user_id IS None  => master/global course (read-only for regular users)
    user_id IS set   => custom course owned by that user
    """
    id: Optional[str] = None
    name: Optional[str] = None
    location: Optional[str] = None
    par: Optional[int] = Field(None, ge=27, le=80)  # 27 for 9-hole, 80 for 18-hole
    holes: List[Hole] = Field(default_factory=list)
    tees: List[Tee] = Field(default_factory=list)
    user_id: Optional[str] = None  # None = master course; set = user-owned custom course

    def get_tee(self, color: str) -> Optional[Tee]:
        """Get a tee by its color."""
        for tee in self.tees:
            if tee.color and tee.color.lower() == color.lower():
                return tee
        return None

    def get_hole(self, number: int) -> Optional[Hole]:
        """Get a hole by its number (1-18)."""
        if 1 <= number <= len(self.holes):
            return self.holes[number - 1]
        return None

    def get_par(self) -> Optional[int]:
        """Get par - uses provided value or calculates from holes."""
        if self.par is not None:
            return self.par
        return self.calculated_par

    @property
    def calculated_par(self) -> Optional[int]:
        """Calculate total par from holes."""
        if len(self.holes) != 18 or any(h.par is None for h in self.holes):
            return None
        return sum(h.par for h in self.holes)

    @property
    def front_nine_par(self) -> Optional[int]:
        """Calculate par for holes 1-9."""
        front = self.holes[:9]
        if len(front) < 9 or any(h.par is None for h in front):
            return None
        return sum(h.par for h in front)

    @property
    def back_nine_par(self) -> Optional[int]:
        """Calculate par for holes 10-18."""
        back = self.holes[9:18]
        if len(back) < 9 or any(h.par is None for h in back):
            return None
        return sum(h.par for h in back)