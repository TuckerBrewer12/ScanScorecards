"""Sync wrapper for async CourseRepositoryDB.

Satisfies the sync CourseRepository protocol used by scorecard_extractor.py
so it can do real DB lookups without being refactored to async.
"""

import asyncio
import concurrent.futures
from typing import Optional

from models import Course
from database.repositories.course_repo import CourseRepositoryDB


class SyncCourseRepositoryAdapter:
    """Wraps async CourseRepositoryDB to satisfy the sync CourseRepository protocol.

    Usage:
        async_repo = CourseRepositoryDB(pool)
        sync_repo = SyncCourseRepositoryAdapter(async_repo)
        result = extract_scorecard(
            "card.jpg",
            strategy=ExtractionStrategy.SMART,
            course_repo=sync_repo,
        )
    """

    def __init__(self, async_repo: CourseRepositoryDB):
        self._async_repo = async_repo

    def _run(self, coro):
        """Run an async coroutine synchronously."""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            # Inside an async context (e.g., FastAPI) — use a thread
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(asyncio.run, coro)
                return future.result()
        else:
            return asyncio.run(coro)

    def find_course_by_name(
        self, name: str, location: Optional[str] = None
    ) -> Optional[Course]:
        return self._run(self._async_repo.find_course_by_name(name, location))

    def get_course(self, course_id: str) -> Optional[Course]:
        return self._run(self._async_repo.get_course(course_id))
