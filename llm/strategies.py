from enum import Enum
from typing import Optional, Protocol

from models import Course


class ExtractionStrategy(str, Enum):
    """Which extraction strategy to use."""
    FULL = "full"                # Extract everything (current behavior)
    SCORES_ONLY = "scores_only"  # Course known; extract only player scores
    SMART = "smart"              # Auto-detect: identify course, then pick strategy


class CourseRepository(Protocol):
    """Interface for course database lookups.

    Implementors provide the actual DB queries.
    Any class with matching method signatures satisfies this protocol.
    """

    def find_course_by_name(
        self, name: str, location: Optional[str] = None
    ) -> Optional[Course]:
        """Look up a course by name (and optionally location).

        Returns a fully-populated Course (with holes and tees) if found, else None.
        Should use fuzzy/case-insensitive matching.
        """
        ...

    def get_course(self, course_id: str) -> Optional[Course]:
        """Look up a course by its ID."""
        ...


class NullCourseRepository:
    """Placeholder that always returns None. Used before DB is wired up."""

    def find_course_by_name(
        self, name: str, location: Optional[str] = None
    ) -> Optional[Course]:
        return None

    def get_course(self, course_id: str) -> Optional[Course]:
        return None
