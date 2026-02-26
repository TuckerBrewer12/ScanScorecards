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
        self,
        name: str,
        location: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> Optional[Course]:
        """Fuzzy/case-insensitive course lookup.

        Searches both master courses (user_id IS NULL) and the user's own
        custom courses when user_id is provided.

        Search tiers:
        1. Exact case-insensitive match
        2. ILIKE partial match
        3. Trigram similarity (requires pg_trgm extension)
        """
        async with self._pool.acquire() as conn:
            # Build the user filter clause
            if user_id:
                uid = UUID(user_id)
                user_filter = "(c.user_id IS NULL OR c.user_id = $3)"
            else:
                uid = None
                user_filter = "c.user_id IS NULL"

            def make_query(where_name: str, where_loc: str = "") -> str:
                loc_part = f" AND {where_loc}" if where_loc else ""
                user_part = f" AND {user_filter}"
                return f"SELECT * FROM courses.courses c WHERE {where_name}{loc_part}{user_part}"

            # Tier 1: exact (case-insensitive)
            if location and user_id:
                row = await conn.fetchrow(
                    """SELECT * FROM courses.courses c
                       WHERE LOWER(c.name) = LOWER($1) AND LOWER(c.location) = LOWER($2)
                         AND (c.user_id IS NULL OR c.user_id = $3)""",
                    name, location, uid,
                )
            elif location:
                row = await conn.fetchrow(
                    """SELECT * FROM courses.courses c
                       WHERE LOWER(c.name) = LOWER($1) AND LOWER(c.location) = LOWER($2)
                         AND c.user_id IS NULL""",
                    name, location,
                )
            elif user_id:
                row = await conn.fetchrow(
                    """SELECT * FROM courses.courses c
                       WHERE LOWER(c.name) = LOWER($1)
                         AND (c.user_id IS NULL OR c.user_id = $2)""",
                    name, uid,
                )
            else:
                row = await conn.fetchrow(
                    """SELECT * FROM courses.courses c
                       WHERE LOWER(c.name) = LOWER($1) AND c.user_id IS NULL""",
                    name,
                )

            # Tier 2: ILIKE partial
            if not row:
                if location and user_id:
                    row = await conn.fetchrow(
                        """SELECT * FROM courses.courses c
                           WHERE c.name ILIKE $1 AND c.location ILIKE $2
                             AND (c.user_id IS NULL OR c.user_id = $3)
                           LIMIT 1""",
                        f"%{name}%", f"%{location}%", uid,
                    )
                elif location:
                    row = await conn.fetchrow(
                        """SELECT * FROM courses.courses c
                           WHERE c.name ILIKE $1 AND c.location ILIKE $2
                             AND c.user_id IS NULL LIMIT 1""",
                        f"%{name}%", f"%{location}%",
                    )
                elif user_id:
                    row = await conn.fetchrow(
                        """SELECT * FROM courses.courses c
                           WHERE c.name ILIKE $1
                             AND (c.user_id IS NULL OR c.user_id = $2)
                           LIMIT 1""",
                        f"%{name}%", uid,
                    )
                else:
                    row = await conn.fetchrow(
                        """SELECT * FROM courses.courses c
                           WHERE c.name ILIKE $1 AND c.user_id IS NULL LIMIT 1""",
                        f"%{name}%",
                    )

            # Tier 3: trigram similarity (0.4 threshold to avoid false positives)
            if not row:
                if user_id:
                    row = await conn.fetchrow(
                        """SELECT *, similarity(name, $1) AS sim
                           FROM courses.courses
                           WHERE similarity(name, $1) > 0.4
                             AND (user_id IS NULL OR user_id = $2)
                           ORDER BY sim DESC LIMIT 1""",
                        name, uid,
                    )
                else:
                    row = await conn.fetchrow(
                        """SELECT *, similarity(name, $1) AS sim
                           FROM courses.courses
                           WHERE similarity(name, $1) > 0.4 AND user_id IS NULL
                           ORDER BY sim DESC LIMIT 1""",
                        name,
                    )

            if not row:
                return None
            return await self._assemble(conn, row)

    async def find_user_course_by_name(
        self,
        name: str,
        location: Optional[str] = None,
        user_id: str = None,
    ) -> Optional[Course]:
        """Find a course owned by this specific user (excludes masters)."""
        uid = UUID(user_id)
        async with self._pool.acquire() as conn:
            # Tier 1: exact
            if location:
                row = await conn.fetchrow(
                    """SELECT * FROM courses.courses
                       WHERE LOWER(name) = LOWER($1) AND LOWER(location) = LOWER($2)
                         AND user_id = $3""",
                    name, location, uid,
                )
            else:
                row = await conn.fetchrow(
                    """SELECT * FROM courses.courses
                       WHERE LOWER(name) = LOWER($1) AND user_id = $2""",
                    name, uid,
                )
            # Tier 2: ILIKE
            if not row:
                if location:
                    row = await conn.fetchrow(
                        """SELECT * FROM courses.courses
                           WHERE name ILIKE $1 AND location ILIKE $2
                             AND user_id = $3 LIMIT 1""",
                        f"%{name}%", f"%{location}%", uid,
                    )
                else:
                    row = await conn.fetchrow(
                        """SELECT * FROM courses.courses
                           WHERE name ILIKE $1 AND user_id = $2 LIMIT 1""",
                        f"%{name}%", uid,
                    )
            # Tier 3: trigram
            if not row:
                row = await conn.fetchrow(
                    """SELECT *, similarity(name, $1) AS sim
                       FROM courses.courses
                       WHERE similarity(name, $1) > 0.4 AND user_id = $2
                       ORDER BY sim DESC LIMIT 1""",
                    name, uid,
                )
            if not row:
                return None
            return await self._assemble(conn, row)

    async def find_any_user_course_by_name(
        self,
        name: str,
        location: Optional[str] = None,
    ) -> Optional[Course]:
        """Find a course owned by any user (excludes masters). Used for cross-user discovery."""
        async with self._pool.acquire() as conn:
            # Tier 1: exact
            if location:
                row = await conn.fetchrow(
                    """SELECT * FROM courses.courses
                       WHERE LOWER(name) = LOWER($1) AND LOWER(location) = LOWER($2)
                         AND user_id IS NOT NULL LIMIT 1""",
                    name, location,
                )
            else:
                row = await conn.fetchrow(
                    """SELECT * FROM courses.courses
                       WHERE LOWER(name) = LOWER($1) AND user_id IS NOT NULL LIMIT 1""",
                    name,
                )
            # Tier 2: ILIKE
            if not row:
                if location:
                    row = await conn.fetchrow(
                        """SELECT * FROM courses.courses
                           WHERE name ILIKE $1 AND location ILIKE $2
                             AND user_id IS NOT NULL LIMIT 1""",
                        f"%{name}%", f"%{location}%",
                    )
                else:
                    row = await conn.fetchrow(
                        """SELECT * FROM courses.courses
                           WHERE name ILIKE $1 AND user_id IS NOT NULL LIMIT 1""",
                        f"%{name}%",
                    )
            # Tier 3: trigram
            if not row:
                row = await conn.fetchrow(
                    """SELECT *, similarity(name, $1) AS sim
                       FROM courses.courses
                       WHERE similarity(name, $1) > 0.4 AND user_id IS NOT NULL
                       ORDER BY sim DESC LIMIT 1""",
                    name,
                )
            if not row:
                return None
            return await self._assemble(conn, row)

    async def fill_course_gaps(
        self,
        course_id: str,
        holes: list,
        tee_color: Optional[str] = None,
        slope_rating: Optional[float] = None,
        course_rating: Optional[float] = None,
        yardages: Optional[dict] = None,
    ) -> None:
        """Fill null fields on an existing course from new scan data.

        Never overwrites existing values — only patches holes where data is missing.
        holes: list of dicts with hole_number, par, handicap keys.
        yardages: {hole_number_str: yardage} dict from scan.
        """
        cid = UUID(course_id)
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                # Fill hole par/handicap where NULL (or insert if hole row missing)
                for hole in holes:
                    h = hole if isinstance(hole, dict) else hole.__dict__
                    hole_num = h.get("hole_number")
                    par = h.get("par")
                    handicap = h.get("handicap")
                    if hole_num is None:
                        continue
                    await conn.execute(
                        """INSERT INTO courses.holes (course_id, hole_number, par, handicap)
                           VALUES ($1, $2, $3, $4)
                           ON CONFLICT (course_id, hole_number) DO UPDATE SET
                               par = CASE WHEN courses.holes.par IS NULL
                                         THEN EXCLUDED.par ELSE courses.holes.par END,
                               handicap = CASE WHEN courses.holes.handicap IS NULL
                                              THEN EXCLUDED.handicap ELSE courses.holes.handicap END""",
                        cid, hole_num, par, handicap,
                    )

                # Fill tee rating gaps and insert missing yardages
                if tee_color:
                    tee_row = await conn.fetchrow(
                        """INSERT INTO courses.tees (course_id, color, slope_rating, course_rating)
                           VALUES ($1, $2, $3, $4)
                           ON CONFLICT (course_id, color) DO UPDATE SET
                               slope_rating = CASE WHEN courses.tees.slope_rating IS NULL
                                                   THEN EXCLUDED.slope_rating ELSE courses.tees.slope_rating END,
                               course_rating = CASE WHEN courses.tees.course_rating IS NULL
                                                    THEN EXCLUDED.course_rating ELSE courses.tees.course_rating END
                           RETURNING id""",
                        cid, tee_color, slope_rating, course_rating,
                    )
                    tee_id = tee_row["id"]
                    if yardages:
                        for hole_num_str, yardage in yardages.items():
                            if yardage is not None:
                                await conn.execute(
                                    """INSERT INTO courses.tee_yardages (tee_id, hole_number, yardage)
                                       VALUES ($1, $2, $3)
                                       ON CONFLICT (tee_id, hole_number) DO NOTHING""",
                                    tee_id, int(hole_num_str), yardage,
                                )

    async def promote_to_master(self, course_id: str) -> Course:
        """Promote a user-owned course to master by setting user_id = NULL.

        If a master with the same name already exists (race condition), returns the
        course as-is rather than raising.
        """
        cid = UUID(course_id)
        async with self._pool.acquire() as conn:
            try:
                row = await conn.fetchrow(
                    "UPDATE courses.courses SET user_id = NULL WHERE id = $1 RETURNING *",
                    cid,
                )
                if not row:
                    raise NotFoundError(f"Course {course_id} not found")
                return await self._assemble(conn, row)
            except asyncpg.UniqueViolationError:
                # Race condition: another master with this name now exists
                row = await conn.fetchrow(
                    "SELECT * FROM courses.courses WHERE id = $1", cid
                )
                return await self._assemble(conn, row)

    async def list_courses(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        user_id: Optional[str] = None,
    ) -> List[Course]:
        """List courses with pagination (fully populated).

        Returns master courses plus the user's custom courses when user_id provided.
        """
        async with self._pool.acquire() as conn:
            if user_id:
                rows = await conn.fetch(
                    """SELECT * FROM courses.courses
                       WHERE user_id IS NULL OR user_id = $3
                       ORDER BY name LIMIT $1 OFFSET $2""",
                    limit, offset, UUID(user_id),
                )
            else:
                rows = await conn.fetch(
                    """SELECT * FROM courses.courses WHERE user_id IS NULL
                       ORDER BY name LIMIT $1 OFFSET $2""",
                    limit, offset,
                )
            return [await self._assemble(conn, r) for r in rows]

    async def search_courses(
        self, query: str, *, user_id: Optional[str] = None
    ) -> List[Course]:
        """Search courses by name or location substring."""
        async with self._pool.acquire() as conn:
            if user_id:
                rows = await conn.fetch(
                    """SELECT * FROM courses.courses
                       WHERE (name ILIKE $1 OR location ILIKE $1)
                         AND (user_id IS NULL OR user_id = $2)
                       ORDER BY name LIMIT 20""",
                    f"%{query}%", UUID(user_id),
                )
            else:
                rows = await conn.fetch(
                    """SELECT * FROM courses.courses
                       WHERE (name ILIKE $1 OR location ILIKE $1)
                         AND user_id IS NULL
                       ORDER BY name LIMIT 20""",
                    f"%{query}%",
                )
            return [await self._assemble(conn, r) for r in rows]

    # ================================================================
    # Create
    # ================================================================

    async def create_course(
        self, course: Course, *, user_id: Optional[str] = None
    ) -> Course:
        """Insert a full Course with holes, tees, and yardages in one transaction.

        user_id=None creates a master/global course.
        user_id=<uuid> creates a custom course owned by that user.
        """
        try:
            uid = UUID(user_id) if user_id else None
            async with self._pool.acquire() as conn:
                async with conn.transaction():
                    row_data = course_to_row(course, user_id=uid)
                    course_row = await conn.fetchrow(
                        """INSERT INTO courses.courses (name, location, par, total_holes, user_id)
                           VALUES ($1, $2, $3, $4, $5) RETURNING *""",
                        row_data["name"], row_data["location"],
                        row_data["par"], row_data["total_holes"], row_data["user_id"],
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

    async def clone_course(self, course_id: str, user_id: str) -> Course:
        """Clone a master course as a custom course for a user.

        Copies the course, all its holes, all its tees, and all tee yardages.
        Returns the newly created custom Course.
        """
        uid = UUID(user_id)
        async with self._pool.acquire() as conn:
            # Load the source course
            source_row = await conn.fetchrow(
                "SELECT * FROM courses.courses WHERE id = $1", UUID(course_id)
            )
            if not source_row:
                raise NotFoundError(f"Course {course_id} not found")

            hole_rows, tee_rows, yardage_map = await self._load_children(
                conn, source_row["id"]
            )

        # Build a Course model and create it for the user
        # (uses a fresh connection to avoid nested acquire)
        source = course_from_rows(source_row, hole_rows, tee_rows, yardage_map)
        # Clear id so create_course generates a new one
        source.id = None
        try:
            return await self.create_course(source, user_id=user_id)
        except DuplicateError:
            # User already has a custom course with this name — return it
            existing = await self.find_course_by_name(
                source.name, source.location, user_id=user_id
            )
            if existing and existing.user_id == user_id:
                return existing
            raise

    # ================================================================
    # Update
    # ================================================================

    async def update_course(
        self, course_id: str, *, user_id: Optional[str] = None, **fields
    ) -> Optional[Course]:
        """Update top-level course fields.

        When user_id is provided, enforces that the course is owned by that user
        (returns None if it's a master course or belongs to another user).
        """
        allowed = {"name", "location", "par", "total_holes", "metadata"}
        updates = {k: v for k, v in fields.items() if k in allowed}
        if not updates:
            return await self.get_course(course_id)

        async with self._pool.acquire() as conn:
            # Ownership check for user-scoped updates
            if user_id:
                row = await conn.fetchrow(
                    "SELECT user_id FROM courses.courses WHERE id = $1",
                    UUID(course_id),
                )
                if not row or str(row["user_id"]) != user_id:
                    return None  # Not found or not owned by this user

            set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
            values = [UUID(course_id)] + list(updates.values())

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

    async def delete_course(
        self, course_id: str, *, user_id: Optional[str] = None
    ) -> bool:
        """Delete a course and all children (CASCADE). Returns True if deleted.

        When user_id is provided, only deletes if the course is owned by that user.
        """
        async with self._pool.acquire() as conn:
            if user_id:
                result = await conn.execute(
                    "DELETE FROM courses.courses WHERE id = $1 AND user_id = $2",
                    UUID(course_id), UUID(user_id),
                )
            else:
                result = await conn.execute(
                    "DELETE FROM courses.courses WHERE id = $1", UUID(course_id)
                )
            return result == "DELETE 1"
