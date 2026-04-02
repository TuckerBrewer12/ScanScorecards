"""CRUD operations for rounds, hole_scores, and scorecard_scans."""

import asyncpg
import json
from collections import defaultdict
from datetime import date
from typing import List, Optional
from uuid import UUID

from models import HoleScore, Round
from database.converters import round_from_rows, round_to_row, hole_score_to_row, user_tee_from_row, course_from_rows
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

    async def _get_rounds_bulk(self, conn, round_rows) -> List[Round]:
        """Assemble N rounds in O(6) queries instead of O(N*4)."""
        if not round_rows:
            return []

        round_ids  = [r["id"] for r in round_rows]
        course_ids = list({r["course_id"] for r in round_rows if r["course_id"]})
        ut_ids     = list({r["user_tee_id"] for r in round_rows if r["user_tee_id"]})
        tee_id_lookup = list({r["tee_id"] for r in round_rows if not r["tee_box_played"] and r["tee_id"]})

        # Query 1: all hole scores
        score_rows = await conn.fetch(
            "SELECT * FROM users.hole_scores WHERE round_id = ANY($1::uuid[]) ORDER BY hole_number",
            round_ids,
        )
        scores_by_round: dict = defaultdict(list)
        for s in score_rows:
            scores_by_round[str(s["round_id"])].append(s)

        # Queries 2–5: courses (deduplicated)
        courses_by_id: dict = {}
        if course_ids:
            c_rows = await conn.fetch("SELECT * FROM courses.courses WHERE id = ANY($1::uuid[])", course_ids)
            h_rows = await conn.fetch(
                "SELECT * FROM courses.holes WHERE course_id = ANY($1::uuid[]) ORDER BY hole_number", course_ids
            )
            t_rows = await conn.fetch("SELECT * FROM courses.tees WHERE course_id = ANY($1::uuid[])", course_ids)
            tee_ids = [t["id"] for t in t_rows]
            y_rows = await conn.fetch(
                "SELECT * FROM courses.tee_yardages WHERE tee_id = ANY($1::uuid[])", tee_ids
            ) if tee_ids else []

            holes_by_course: dict = defaultdict(list)
            for h in h_rows:
                holes_by_course[str(h["course_id"])].append(h)
            tees_by_course: dict = defaultdict(list)
            for t in t_rows:
                tees_by_course[str(t["course_id"])].append(t)
            yardages_by_tee: dict = defaultdict(list)
            for y in y_rows:
                yardages_by_tee[str(y["tee_id"])].append(y)

            for c_row in c_rows:
                cid = str(c_row["id"])
                ctees = tees_by_course[cid]
                courses_by_id[cid] = course_from_rows(
                    c_row,
                    holes_by_course[cid],
                    ctees,
                    {t["id"]: yardages_by_tee[str(t["id"])] for t in ctees},
                )

        # Query 6: user_tees
        user_tees_by_id: dict = {}
        if ut_ids:
            ut_rows = await conn.fetch("SELECT * FROM users.user_tees WHERE id = ANY($1::uuid[])", ut_ids)
            for r in ut_rows:
                user_tees_by_id[str(r["id"])] = user_tee_from_row(r)

        # Query 7 (conditional): batch-resolve missing tee colors
        tee_colors_by_id: dict = {}
        if tee_id_lookup:
            tc_rows = await conn.fetch(
                "SELECT id, color FROM courses.tees WHERE id = ANY($1::uuid[])", tee_id_lookup
            )
            tee_colors_by_id = {str(r["id"]): r["color"] for r in tc_rows}

        # Assemble in memory
        rounds = []
        for row in round_rows:
            rid = str(row["id"])
            cid = str(row["course_id"]) if row["course_id"] else None
            tee_color = row["tee_box_played"] or (
                tee_colors_by_id.get(str(row["tee_id"])) if row["tee_id"] else None
            )
            user_tee = user_tees_by_id.get(str(row["user_tee_id"])) if row["user_tee_id"] else None
            rounds.append(round_from_rows(row, scores_by_round[rid], courses_by_id.get(cid), tee_color, user_tee))

        return rounds

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

    async def get_round_summaries_for_user(
        self, user_id: str, *, limit: int = 100, offset: int = 0
    ) -> list[dict]:
        """Single aggregate query — avoids N+1 hole_score fetches for list views."""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """SELECT
                    r.id, r.course_id, r.tee_box_played AS tee_box,
                    r.round_date, r.notes, r.course_name_played,
                    COALESCE(c.name, r.course_name_played) AS course_name,
                    c.location AS course_location,
                    c.par AS course_par,
                    SUM(hs.strokes)  AS total_score,
                    CASE WHEN COUNT(CASE WHEN hs.strokes IS NOT NULL AND hs.putts IS NULL THEN 1 END) = 0
                              AND COUNT(CASE WHEN hs.putts IS NOT NULL THEN 1 END) > 0
                         THEN SUM(hs.putts)
                         ELSE NULL END AS total_putts,
                    SUM(CASE WHEN hs.green_in_regulation THEN 1 ELSE 0 END) AS total_gir,
                    SUM(CASE WHEN hs.fairway_hit         THEN 1 ELSE 0 END) AS fairways_hit,
                    CASE WHEN COUNT(CASE WHEN hs.hole_number <= 9 AND hs.strokes IS NOT NULL THEN 1 END) = 9
                         THEN SUM(CASE WHEN hs.hole_number <= 9 THEN hs.strokes ELSE 0 END)
                         ELSE NULL END AS front_nine,
                    CASE WHEN COUNT(CASE WHEN hs.hole_number >= 10 AND hs.strokes IS NOT NULL THEN 1 END) = 9
                         THEN SUM(CASE WHEN hs.hole_number >= 10 THEN hs.strokes ELSE 0 END)
                         ELSE NULL END AS back_nine
                FROM users.rounds r
                LEFT JOIN courses.courses c ON r.course_id = c.id
                LEFT JOIN users.hole_scores hs ON hs.round_id = r.id
                WHERE r.user_id = $1
                GROUP BY r.id, c.name, c.location, c.par
                ORDER BY r.round_date DESC NULLS LAST
                LIMIT $2 OFFSET $3""",
                UUID(user_id), limit, offset,
            )
            return [dict(r) for r in rows]

    async def get_rounds_for_user(
        self, user_id: str, *, limit: int = 20, offset: int = 0,
        course_id: Optional[str] = None,
        date_from: Optional[date] = None,
    ) -> List[Round]:
        """Get a user's rounds ordered by date DESC."""
        conditions = ["user_id = $1"]
        params: list = [UUID(user_id)]
        n = 2
        if course_id is not None:
            conditions.append(f"course_id = ${n}")
            params.append(UUID(course_id))
            n += 1
        if date_from is not None:
            conditions.append(f"round_date >= ${n}")
            params.append(date_from)
            n += 1
        where = " AND ".join(conditions)
        params += [limit, offset]
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                f"""SELECT * FROM users.rounds
                   WHERE {where}
                   ORDER BY round_date DESC NULLS LAST
                   LIMIT ${n} OFFSET ${n + 1}""",
                *params,
            )
            return await self._get_rounds_bulk(conn, rows)

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

    async def link_course_to_round(self, round_id: str, course_id: str) -> Optional[Round]:
        """Link an unlinked round to an existing course.

        - Sets course_id / tee_id on the round, clears course_name_played
        - Backfills hole_id, par_played, handicap_played on each hole_score (fill-only, no overwrites)
        """
        async with self._pool.acquire() as conn:
            course_hole_rows = await conn.fetch(
                "SELECT id, hole_number, par, handicap FROM courses.holes WHERE course_id = $1",
                UUID(course_id),
            )
            hole_id_map = {r["hole_number"]: r["id"] for r in course_hole_rows}
            par_by_hole = {r["hole_number"]: r["par"] for r in course_hole_rows if r["par"] is not None}
            hcp_by_hole = {r["hole_number"]: r["handicap"] for r in course_hole_rows if r["handicap"] is not None}

            # Resolve tee_id from stored tee_box_played
            round_row = await conn.fetchrow(
                "SELECT tee_box_played FROM users.rounds WHERE id = $1", UUID(round_id)
            )
            tee_color = round_row["tee_box_played"] if round_row else None
            tee_id = None
            if tee_color:
                tee_id = await self._resolve_tee_id(conn, UUID(course_id), tee_color)

            async with conn.transaction():
                await conn.execute(
                    """UPDATE users.rounds
                       SET course_id = $2, tee_id = $3, course_name_played = NULL
                       WHERE id = $1""",
                    UUID(round_id), UUID(course_id), tee_id,
                )
                for hole_num, hole_id in hole_id_map.items():
                    await conn.execute(
                        """UPDATE users.hole_scores
                           SET hole_id = $3,
                               par_played = COALESCE(par_played, $4),
                               handicap_played = COALESCE(handicap_played, $5)
                           WHERE round_id = $1 AND hole_number = $2""",
                        UUID(round_id), hole_num, hole_id,
                        par_by_hole.get(hole_num), hcp_by_hole.get(hole_num),
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
