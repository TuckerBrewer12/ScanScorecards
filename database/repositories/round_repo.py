"""CRUD operations for rounds, hole_scores, and scorecard_scans."""

import asyncpg
import json
from typing import List, Optional
from uuid import UUID

from models import HoleScore, Round
from database.converters import round_from_rows, round_to_row, hole_score_to_row, user_tee_from_row
from database.exceptions import DuplicateError, IntegrityError, NotFoundError
from database.repositories.course_repo import CourseRepositoryDB


class RoundRepositoryDB:
    """Async CRUD for rounds and their child tables."""

    def __init__(self, pool: asyncpg.Pool, course_repo: CourseRepositoryDB):
        self._pool = pool
        self._course_repo = course_repo

    # ================================================================
    # Private helpers
    # ================================================================

    async def _resolve_tee_color(self, conn, tee_id: UUID) -> Optional[str]:
        """Look up tee color from tee_id."""
        if not tee_id:
            return None
        row = await conn.fetchrow(
            "SELECT color FROM courses.tees WHERE id = $1", tee_id
        )
        return row["color"] if row else None

    async def _resolve_tee_id(
        self, conn, course_id: UUID, tee_color: str
    ) -> Optional[UUID]:
        """Look up tee_id from course + color."""
        row = await conn.fetchrow(
            """SELECT id FROM courses.tees
               WHERE course_id = $1 AND LOWER(color) = LOWER($2)""",
            course_id, tee_color,
        )
        return row["id"] if row else None

    async def _load_hole_id_map(self, conn, course_id: UUID) -> dict:
        """Map hole_number -> hole UUID for a course."""
        rows = await conn.fetch(
            "SELECT id, hole_number FROM courses.holes WHERE course_id = $1",
            course_id,
        )
        return {r["hole_number"]: r["id"] for r in rows}

    async def _assemble_round(self, conn, round_row) -> Round:
        """Build a full Round model from a round row."""
        # Load hole scores
        score_rows = await conn.fetch(
            """SELECT * FROM users.hole_scores
               WHERE round_id = $1 ORDER BY hole_number""",
            round_row["id"],
        )

        # Load course if available
        course = None
        if round_row["course_id"]:
            course = await self._course_repo.get_course(str(round_row["course_id"]))

        # Resolve tee color — prefer the stored text (editable), fall back to FK lookup
        tee_color = round_row["tee_box_played"]
        if not tee_color:
            tee_color = await self._resolve_tee_color(conn, round_row["tee_id"])

        # Load user_tee if present
        user_tee = None
        if round_row["user_tee_id"]:
            ut_row = await conn.fetchrow(
                "SELECT * FROM users.user_tees WHERE id = $1",
                round_row["user_tee_id"],
            )
            if ut_row:
                user_tee = user_tee_from_row(ut_row)

        return round_from_rows(round_row, score_rows, course, tee_color, user_tee)

    # ================================================================
    # Read
    # ================================================================

    async def get_round(self, round_id: str) -> Optional[Round]:
        """Get a round with hole_scores and course data."""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM users.rounds WHERE id = $1", UUID(round_id)
            )
            if not row:
                return None
            return await self._assemble_round(conn, row)

    async def get_rounds_for_user(
        self, user_id: str, *, limit: int = 20, offset: int = 0
    ) -> List[Round]:
        """Get a user's rounds ordered by date DESC."""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT * FROM users.rounds
                   WHERE user_id = $1
                   ORDER BY round_date DESC NULLS LAST
                   LIMIT $2 OFFSET $3""",
                UUID(user_id), limit, offset,
            )
            return [await self._assemble_round(conn, r) for r in rows]

    # ================================================================
    # Create
    # ================================================================

    async def create_round(
        self,
        round_: Round,
        user_id: str,
        *,
        course_id: Optional[str] = None,
        tee_id: Optional[str] = None,
        user_tee_id: Optional[str] = None,
    ) -> Round:
        """Create a round with all hole_scores in a transaction.

        Resolves course_id from round_.course.id if not provided.
        Resolves tee_id from round_.tee_box + course if not provided.
        """
        try:
            new_round_id: UUID
            async with self._pool.acquire() as conn:
                async with conn.transaction():
                    # Resolve IDs
                    resolved_course_id = (
                        UUID(course_id) if course_id
                        else UUID(round_.course.id) if round_.course and round_.course.id
                        else None
                    )
                    resolved_tee_id = UUID(tee_id) if tee_id else None

                    if not resolved_tee_id and resolved_course_id and round_.tee_box:
                        resolved_tee_id = await self._resolve_tee_id(
                            conn, resolved_course_id, round_.tee_box
                        )

                    # Insert round
                    row_data = round_to_row(
                        round_, UUID(user_id), resolved_course_id, resolved_tee_id
                    )
                    resolved_user_tee_id = UUID(user_tee_id) if user_tee_id else None
                    round_row = await conn.fetchrow(
                        """INSERT INTO users.rounds
                           (user_id, course_id, tee_id, user_tee_id, round_date, total_score,
                            is_complete, holes_played, weather_conditions, notes,
                            course_name_played, tee_box_played)
                           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                           RETURNING *""",
                        row_data["user_id"], row_data["course_id"], row_data["tee_id"],
                        resolved_user_tee_id,
                        row_data["round_date"], row_data["total_score"],
                        row_data["is_complete"], row_data["holes_played"],
                        row_data["weather_conditions"], row_data["notes"],
                        row_data["course_name_played"], row_data["tee_box_played"],
                    )
                    new_round_id = round_row["id"]

                    # Map hole_number -> hole_id for FK resolution
                    hole_id_map = {}
                    if resolved_course_id:
                        hole_id_map = await self._load_hole_id_map(
                            conn, resolved_course_id
                        )

                    # Build par_by_hole from course holes for populating par_played
                    par_by_hole = {}
                    if round_.course and round_.course.holes:
                        for h in round_.course.holes:
                            if h.number is not None and h.par is not None:
                                par_by_hole[h.number] = h.par

                    # Batch insert hole scores
                    if round_.hole_scores:
                        score_tuples = []
                        for hs in round_.hole_scores:
                            hole_id = hole_id_map.get(hs.hole_number)
                            # Populate par_played from course if available, else keep existing
                            if hs.hole_number in par_by_hole and hs.par_played is None:
                                from models import HoleScore as _HS
                                hs = _HS(
                                    **{**hs.model_dump(), "par_played": par_by_hole[hs.hole_number]}
                                )
                            score_tuples.append(hole_score_to_row(
                                hs, new_round_id, hole_id
                            ))
                        if score_tuples:
                            await conn.executemany(
                                """INSERT INTO users.hole_scores
                                   (round_id, hole_id, hole_number, strokes,
                                    net_score, putts, shots_to_green,
                                    fairway_hit, green_in_regulation,
                                    par_played, handicap_played)
                                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)""",
                                score_tuples,
                            )
            # Transaction committed and connection released — now read back with a
            # fresh connection so _assemble_round's get_course() doesn't compete
            # for the same pool slot and deadlock.
            return await self.get_round(str(new_round_id))
        except asyncpg.UniqueViolationError as e:
            raise DuplicateError(str(e)) from e
        except asyncpg.ForeignKeyViolationError as e:
            raise IntegrityError(str(e)) from e

    # ================================================================
    # Update
    # ================================================================

    async def update_round(self, round_id: str, **fields) -> Optional[Round]:
        """Update round-level fields."""
        allowed = {
            "round_date", "total_score", "adjusted_gross_score",
            "score_differential", "is_complete", "holes_played",
            "weather_conditions", "notes", "course_name_played", "tee_box_played",
        }
        updates = {k: v for k, v in fields.items() if k in allowed}
        if not updates:
            return await self.get_round(round_id)

        set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
        values = [UUID(round_id)] + list(updates.values())

        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                f"UPDATE users.rounds SET {set_clause} WHERE id = $1 RETURNING *",
                *values,
            )
            if not row:
                return None
            return await self._assemble_round(conn, row)

    async def upsert_hole_score(
        self, round_id: str, hole_score: HoleScore
    ) -> None:
        """Insert or update a single hole score."""
        async with self._pool.acquire() as conn:
            # Resolve hole_id from round's course
            round_row = await conn.fetchrow(
                "SELECT course_id FROM users.rounds WHERE id = $1",
                UUID(round_id),
            )
            if not round_row:
                raise NotFoundError(f"Round {round_id} not found")

            hole_id = None
            if round_row["course_id"]:
                hole_row = await conn.fetchrow(
                    """SELECT id FROM courses.holes
                       WHERE course_id = $1 AND hole_number = $2""",
                    round_row["course_id"], hole_score.hole_number,
                )
                hole_id = hole_row["id"] if hole_row else None

            await conn.execute(
                """INSERT INTO users.hole_scores
                   (round_id, hole_id, hole_number, strokes, net_score,
                    putts, shots_to_green, fairway_hit, green_in_regulation,
                    par_played, handicap_played)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                   ON CONFLICT (round_id, hole_number)
                   DO UPDATE SET strokes = EXCLUDED.strokes,
                                 net_score = EXCLUDED.net_score,
                                 putts = EXCLUDED.putts,
                                 shots_to_green = EXCLUDED.shots_to_green,
                                 fairway_hit = EXCLUDED.fairway_hit,
                                 green_in_regulation = EXCLUDED.green_in_regulation,
                                 par_played = COALESCE(EXCLUDED.par_played, users.hole_scores.par_played),
                                 handicap_played = COALESCE(EXCLUDED.handicap_played, users.hole_scores.handicap_played)""",
                UUID(round_id), hole_id, hole_score.hole_number,
                hole_score.strokes, hole_score.net_score,
                hole_score.putts, hole_score.shots_to_green,
                hole_score.fairway_hit, hole_score.green_in_regulation,
                hole_score.par_played, hole_score.handicap_played,
            )

    async def update_hole_scores(
        self, round_id: str, hole_scores: list
    ) -> Optional[Round]:
        """Batch-upsert hole scores and recalculate round totals.

        hole_scores: list of HoleScore objects.
        Returns the updated Round.
        """
        async with self._pool.acquire() as conn:
            round_row = await conn.fetchrow(
                "SELECT * FROM users.rounds WHERE id = $1", UUID(round_id)
            )
            if not round_row:
                raise NotFoundError(f"Round {round_id} not found")

            course_id = round_row["course_id"]
            hole_id_map = {}
            if course_id:
                hole_id_map = await self._load_hole_id_map(conn, course_id)

            async with conn.transaction():
                for hs in hole_scores:
                    hole_id = hole_id_map.get(hs.hole_number)
                    await conn.execute(
                        """INSERT INTO users.hole_scores
                           (round_id, hole_id, hole_number, strokes, net_score,
                            putts, shots_to_green, fairway_hit, green_in_regulation,
                            par_played, handicap_played)
                           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                           ON CONFLICT (round_id, hole_number)
                           DO UPDATE SET
                               strokes = EXCLUDED.strokes,
                               net_score = EXCLUDED.net_score,
                               putts = EXCLUDED.putts,
                               shots_to_green = EXCLUDED.shots_to_green,
                               fairway_hit = EXCLUDED.fairway_hit,
                               green_in_regulation = EXCLUDED.green_in_regulation,
                               par_played = COALESCE(EXCLUDED.par_played, users.hole_scores.par_played),
                               handicap_played = COALESCE(EXCLUDED.handicap_played, users.hole_scores.handicap_played)""",
                        UUID(round_id), hole_id, hs.hole_number,
                        hs.strokes, hs.net_score,
                        hs.putts, hs.shots_to_green,
                        hs.fairway_hit, hs.green_in_regulation,
                        hs.par_played, hs.handicap_played,
                    )

                # Recalculate totals
                score_rows = await conn.fetch(
                    "SELECT strokes FROM users.hole_scores WHERE round_id = $1",
                    UUID(round_id),
                )
                valid_strokes = [r["strokes"] for r in score_rows if r["strokes"] is not None]
                new_total = sum(valid_strokes) if valid_strokes else None
                holes_played = len(valid_strokes)
                is_complete = holes_played == 18

                await conn.execute(
                    """UPDATE users.rounds
                       SET total_score = $2, holes_played = $3, is_complete = $4
                       WHERE id = $1""",
                    UUID(round_id), new_total, holes_played, is_complete,
                )

        return await self.get_round(round_id)

    # ================================================================
    # Delete
    # ================================================================

    async def delete_round(self, round_id: str) -> bool:
        """Delete round and its hole_scores (CASCADE). Returns True if deleted."""
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM users.rounds WHERE id = $1", UUID(round_id)
            )
            return result == "DELETE 1"

    # ================================================================
    # Scorecard Scans
    # ================================================================

    async def save_scan(
        self,
        *,
        round_id: Optional[str] = None,
        image_path: str,
        llm_model: str,
        llm_raw_json: dict,
    ) -> str:
        """Save a scorecard scan record. Returns the scan ID."""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """INSERT INTO users.scorecard_scans
                   (round_id, image_path, llm_model, llm_raw_json)
                   VALUES ($1, $2, $3, $4) RETURNING id""",
                UUID(round_id) if round_id else None,
                image_path, llm_model, json.dumps(llm_raw_json),
            )
            return str(row["id"])

    async def get_scans_for_round(self, round_id: str) -> list:
        """Get all scans associated with a round."""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT * FROM users.scorecard_scans
                   WHERE round_id = $1 ORDER BY created_at""",
                UUID(round_id),
            )
            return [dict(r) for r in rows]
