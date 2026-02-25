from datetime import datetime
from pydantic import Field
from typing import List, Optional

from .base import BaseGolfModel
from .course import Course
from .hole_score import HoleScore
from .tee import Tee


class Round(BaseGolfModel):
    """Represents a round of golf played by a user."""
    id: Optional[str] = None
    course: Optional[Course] = None
    tee_box: Optional[str] = None
    date: Optional[datetime] = None
    hole_scores: List[HoleScore] = Field(default_factory=list)
    weather_conditions: Optional[str] = None
    notes: Optional[str] = None
    course_name_played: Optional[str] = None  # denormalized name when no master course

    # Optional summary totals - can be provided directly or calculated
    total_putts: Optional[int] = None
    total_gir: Optional[int] = None

    def get_tee(self) -> Optional[Tee]:
        """Get the tee used for this round."""
        if self.course and self.tee_box:
            return self.course.get_tee(self.tee_box)
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
        """Calculate total strokes for holes 1-9. Assumes hole_scores in order."""
        front = self.hole_scores[:9]
        strokes = [s.strokes for s in front if s.strokes is not None]
        return sum(strokes) if strokes else None

    def calculate_back_nine(self) -> Optional[int]:
        """Calculate total strokes for holes 10-18. Assumes hole_scores in order."""
        back = self.hole_scores[9:18]
        strokes = [s.strokes for s in back if s.strokes is not None]
        return sum(strokes) if strokes else None

    def is_complete(self) -> bool:
        """Check if all holes have scores."""
        if not self.hole_scores:
            return False
        expected = 18 if len(self.hole_scores) > 9 else 9
        valid_scores = [s for s in self.hole_scores if s.strokes is not None]
        return len(valid_scores) == expected

    def get_hole_score(self, hole_number: int) -> Optional[HoleScore]:
        """Get score for a specific hole. Assumes hole_scores in order."""
        if 1 <= hole_number <= len(self.hole_scores):
            return self.hole_scores[hole_number - 1]
        return None

    def get_hole_par(self, hole_number: int) -> Optional[int]:
        """Get par for a specific hole — from course, or par_played on the hole score."""
        if self.course:
            hole = self.course.get_hole(hole_number)
            return hole.par if hole else None
        score = self.get_hole_score(hole_number)
        return score.par_played if score else None

    def get_par(self) -> Optional[int]:
        """Get course par — from course, or calculated from par_played on hole scores."""
        if self.course:
            return self.course.get_par()
        pars = [hs.par_played for hs in self.hole_scores if hs.par_played is not None]
        return sum(pars) if pars else None

    def score_to_par(self, hole_number: int) -> Optional[int]:
        """Get score relative to par for a specific hole."""
        score = self.get_hole_score(hole_number)
        par = self.get_hole_par(hole_number)
        if score and par:
            return score.to_par(par)
        return None

    def get_score_type(self, hole_number: int) -> Optional[str]:
        """Get score name (eagle, birdie, par, bogey, etc.) for a hole."""
        score = self.get_hole_score(hole_number)
        par = self.get_hole_par(hole_number)
        if score and par:
            return score.get_score_type(par)
        return None

    def total_to_par(self) -> Optional[int]:
        """Get total score relative to course par (uses par_played when no course attached)."""
        total = self.calculate_total_score()
        if total is None:
            return None
        course_par = self.get_par()
        if course_par is None:
            return None
        return total - course_par