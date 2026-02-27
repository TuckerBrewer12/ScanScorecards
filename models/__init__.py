from .base import BaseGolfModel
from .course import Course
from .hole import Hole
from .hole_score import HoleScore
from .round import Round
from .tee import Tee
from .user import User
from .user_tee import UserTee

# Resolve forward refs like User.rounds -> Round once at import time.
User.model_rebuild()

__all__ = ["BaseGolfModel", "Course", "Hole", "HoleScore", "Round", "Tee", "User"]
__all__ = ["BaseGolfModel", "Course", "Hole", "HoleScore", "Round", "Tee", "User", "UserTee"]
