"""Sync wrapper for async CourseRepositoryDB.

Satisfies the sync CourseRepository protocol used by scorecard_extractor.py
so it can do real DB lookups without being refactored to async.
"""

import asyncio
from typing import Optional

from models import Course
from database.repositories.course_repo import CourseRepositoryDB


class SyncCourseRepositoryAdapter:
    """Wraps async CourseRepositoryDB to satisfy the sync CourseRepository protocol.

    Pass the running event loop so DB coroutines are scheduled on it (and use
    its asyncpg pool) rather than on a new loop created by asyncio.run().

    Usage:
        loop = asyncio.get_event_loop()
        sync_repo = SyncCourseRepositoryAdapter(db.courses, loop)
        result = extract_scorecard(
            "card.jpg",
            strategy=ExtractionStrategy.SMART,
            course_repo=sync_repo,
        )
    """

    def __init__(self, async_repo: CourseRepositoryDB, main_loop: asyncio.AbstractEventLoop = None):
        self._async_repo = async_repo
        self._main_loop = main_loop

    def _run(self, coro):
        """Run an async coroutine synchronously."""
        if self._main_loop and self._main_loop.is_running():
            # Schedule on the existing loop (which owns the asyncpg pool)
            future = asyncio.run_coroutine_threadsafe(coro, self._main_loop)
            return future.result()
        else:
            return asyncio.run(coro)

    def find_course_by_name(
        self, name: str, location: Optional[str] = None
    ) -> Optional[Course]:
        return self._run(self._async_repo.find_course_by_name(name, location))

    def get_course(self, course_id: str) -> Optional[Course]:
        return self._run(self._async_repo.get_course(course_id))
