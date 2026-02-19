"""CRUD operations for the courses schema (courses, holes, tees, tee_yardages)."""

import asyncpg
from typing import Dict, List, Optional
from uuid import UUID

from models import Course, Hole, Tee
from database.converters import course_from_rows, course_to_row, tee_yardages_to_rows
from database.exceptions import DuplicateError, IntegrityError, NotFoundError


class CourseRepositoryDB:
    """Async CRUD for courses and their child tables."""

    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    # ================================================================
    # Private helpers
    # ================================================================

    async def _load_children(self, conn, course_id: UUID) -> tuple:
        """Load holes, tees, and yardages for a course.

        Returns (hole_rows, tee_rows, yardage_map).
        """
        hole_rows = await conn.fetch(
            "SELECT * FROM courses.holes WHERE course_id = $1 ORDER BY hole_number",
            course_id,
        )
        tee_rows = await conn.fetch(
            "SELECT * FROM courses.tees WHERE course_id = $1",
            course_id,
        )
        # Batch-load all yardages for all tees at once (avoid N+1)
        tee_ids = [r["id"] for r in tee_rows]
        if tee_ids:
            yardage_rows = await conn.fetch(
                "SELECT * FROM courses.tee_yardages WHERE tee_id = ANY($1::uuid[]) ORDER BY hole_number",
                tee_ids,
            )
        else:
            yardage_rows = []

        yardage_map: Dict[UUID, list] = {}
        for yr in yardage_rows:
            yardage_map.setdefault(yr["tee_id"], []).append(yr)

        return hole_rows, tee_rows, yardage_map

    async def _assemble(self, conn, course_row) -> Course:
        """Build a full Course model from a course row + children."""
        hole_rows, tee_rows, yardage_map = await self._load_children(
            conn, course_row["id"]
        )
        return course_from_rows(course_row, hole_rows, tee_rows, yardage_map)

    # ================================================================
    # Read
    # ================================================================

    async def get_course(self, course_id: str) -> Optional[Course]:
        """Get a fully-populated Course by ID."""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM courses.courses WHERE id = $1",
                UUID(course_id),
            )
            if not row:
                return None
            return await self._assemble(conn, row)

    async def find_course_by_name(
        self, name: str, location: Optional[str] = None
    ) -> Optional[Course]:
        """Fuzzy/case-insensitive course lookup.

        Search tiers:
        1. Exact case-insensitive match
        2. ILIKE partial match
        3. Trigram similarity (requires pg_trgm extension)
        """
        async with self._pool.acquire() as conn:
            # Tier 1: exact (case-insensitive)
            if location:
                row = await conn.fetchrow(
                    """SELECT * FROM courses.courses
                       WHERE LOWER(name) = LOWER($1)
                         AND LOWER(location) = LOWER($2)""",
                    name, location,
                )
            else:
                row = await conn.fetchrow(
                    "SELECT * FROM courses.courses WHERE LOWER(name) = LOWER($1)",
                    name,
                )

            # Tier 2: ILIKE partial
            if not row:
                if location:
                    row = await conn.fetchrow(
                        """SELECT * FROM courses.courses
                           WHERE name ILIKE $1 AND location ILIKE $2
                           LIMIT 1""",
                        f"%{name}%", f"%{location}%",
                    )
                else:
                    row = await conn.fetchrow(
                        "SELECT * FROM courses.courses WHERE name ILIKE $1 LIMIT 1",
                        f"%{name}%",
                    )

            # Tier 3: trigram similarity (0.4 threshold to avoid false positives)
            if not row:
                row = await conn.fetchrow(
                    """SELECT *, similarity(name, $1) AS sim
                       FROM courses.courses
                       WHERE similarity(name, $1) > 0.4
                       ORDER BY sim DESC LIMIT 1""",
                    name,
                )

            if not row:
                return None
            return await self._assemble(conn, row)

    async def list_courses(
        self, *, limit: int = 50, offset: int = 0
    ) -> List[Course]:
        """List courses with pagination (fully populated)."""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM courses.courses ORDER BY name LIMIT $1 OFFSET $2",
                limit, offset,
            )
            return [await self._assemble(conn, r) for r in rows]

    async def search_courses(self, query: str) -> List[Course]:
        """Search courses by name or location substring."""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT * FROM courses.courses
                   WHERE name ILIKE $1 OR location ILIKE $1
                   ORDER BY name LIMIT 20""",
                f"%{query}%",
            )
            return [await self._assemble(conn, r) for r in rows]

    # ================================================================
    # Create
    # ================================================================

    async def create_course(self, course: Course) -> Course:
        """Insert a full Course with holes, tees, and yardages in one transaction."""
        try:
            async with self._pool.acquire() as conn:
                async with conn.transaction():
                    row_data = course_to_row(course)
                    course_row = await conn.fetchrow(
                        """INSERT INTO courses.courses (name, location, par, total_holes)
                           VALUES ($1, $2, $3, $4) RETURNING *""",
                        row_data["name"], row_data["location"],
                        row_data["par"], row_data["total_holes"],
                    )
                    course_id = course_row["id"]

                    # Batch insert holes
                    if course.holes:
                        await conn.executemany(
                            """INSERT INTO courses.holes
                               (course_id, hole_number, par, handicap)
                               VALUES ($1, $2, $3, $4)""",
                            [(course_id, h.number, h.par, h.handicap) for h in course.holes],
                        )

                    # Insert tees + yardages
                    for tee in course.tees:
                        tee_row = await conn.fetchrow(
                            """INSERT INTO courses.tees
                               (course_id, color, slope_rating, course_rating)
                               VALUES ($1, $2, $3, $4) RETURNING id""",
                            course_id, tee.color, tee.slope_rating, tee.course_rating,
                        )
                        tee_id = tee_row["id"]

                        yardage_tuples = tee_yardages_to_rows(tee, tee_id)
                        if yardage_tuples:
                            await conn.executemany(
                                """INSERT INTO courses.tee_yardages
                                   (tee_id, hole_number, yardage)
                                   VALUES ($1, $2, $3)""",
                                yardage_tuples,
                            )

                    return await self._assemble(conn, course_row)
        except asyncpg.UniqueViolationError as e:
            raise DuplicateError(f"Course already exists: {e}") from e
        except asyncpg.ForeignKeyViolationError as e:
            raise IntegrityError(str(e)) from e

    # ================================================================
    # Update
    # ================================================================

    async def update_course(self, course_id: str, **fields) -> Optional[Course]:
        """Update top-level course fields (name, location, par, total_holes, metadata).

        For updating holes/tees, use upsert_hole/upsert_tee.
        """
        allowed = {"name", "location", "par", "total_holes", "metadata"}
        updates = {k: v for k, v in fields.items() if k in allowed}
        if not updates:
            return await self.get_course(course_id)

        set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
        values = [UUID(course_id)] + list(updates.values())

        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                f"UPDATE courses.courses SET {set_clause} WHERE id = $1 RETURNING *",
                *values,
            )
            if not row:
                return None
            return await self._assemble(conn, row)

    async def upsert_hole(self, course_id: str, hole: Hole) -> None:
        """Insert or update a single hole on a course."""
        async with self._pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO courses.holes (course_id, hole_number, par, handicap)
                   VALUES ($1, $2, $3, $4)
                   ON CONFLICT (course_id, hole_number)
                   DO UPDATE SET par = EXCLUDED.par, handicap = EXCLUDED.handicap""",
                UUID(course_id), hole.number, hole.par, hole.handicap,
            )

    async def upsert_tee(self, course_id: str, tee: Tee) -> None:
        """Insert or update a tee and its yardages."""
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                tee_row = await conn.fetchrow(
                    """INSERT INTO courses.tees
                       (course_id, color, slope_rating, course_rating)
                       VALUES ($1, $2, $3, $4)
                       ON CONFLICT (course_id, color)
                       DO UPDATE SET slope_rating = EXCLUDED.slope_rating,
                                     course_rating = EXCLUDED.course_rating
                       RETURNING id""",
                    UUID(course_id), tee.color, tee.slope_rating, tee.course_rating,
                )
                tee_id = tee_row["id"]

                # Replace all yardages for this tee
                await conn.execute(
                    "DELETE FROM courses.tee_yardages WHERE tee_id = $1", tee_id
                )
                yardage_tuples = tee_yardages_to_rows(tee, tee_id)
                if yardage_tuples:
                    await conn.executemany(
                        """INSERT INTO courses.tee_yardages
                           (tee_id, hole_number, yardage)
                           VALUES ($1, $2, $3)""",
                        yardage_tuples,
                    )

    # ================================================================
    # Delete
    # ================================================================

    async def delete_course(self, course_id: str) -> bool:
        """Delete a course and all children (CASCADE). Returns True if deleted."""
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM courses.courses WHERE id = $1", UUID(course_id)
            )
            return result == "DELETE 1"
