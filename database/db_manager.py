from __future__ import annotations

import json
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Literal, Optional, Sequence


class DatabaseError(RuntimeError):
    """Raised when database setup or operations fail."""


class DatabaseManager:
    """
    Lightweight PostgreSQL data-access layer.

    Notes:
    - This class intentionally uses raw SQL (no ORM) to keep behavior explicit.
    - It works with either `psycopg` (v3) or `psycopg2`.
    """

    def __init__(
        self,
        dsn: Optional[str] = None,
        schema_path: Optional[str] = None,
    ) -> None:
        self.dsn = dsn or self._build_dsn_from_env()
        self.schema_path = Path(
            schema_path or Path(__file__).with_name("schema.sql")
        ).resolve()
        self._conn: Any = None
        self._driver: Optional[str] = None
        self._tx_depth: int = 0

    @staticmethod
    def _build_dsn_from_env() -> str:
        host = os.getenv("PGHOST", "localhost")
        port = os.getenv("PGPORT", "5432")
        dbname = os.getenv("PGDATABASE", "golf_scorecard")
        user = os.getenv("PGUSER", "postgres")
        password = os.getenv("PGPASSWORD", "")

        if password:
            return f"host={host} port={port} dbname={dbname} user={user} password={password}"
        return f"host={host} port={port} dbname={dbname} user={user}"

    def connect(self) -> None:
        """Open a database connection if one is not already open."""
        if self._conn is not None:
            return

        try:
            import psycopg  # type: ignore

            self._conn = psycopg.connect(self.dsn)
            self._driver = "psycopg"
            return
        except Exception:
            pass

        try:
            import psycopg2  # type: ignore

            self._conn = psycopg2.connect(self.dsn)
            self._driver = "psycopg2"
        except Exception as exc:
            raise DatabaseError(
                "Could not connect to PostgreSQL. Install `psycopg` or `psycopg2-binary` "
                "and verify PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD."
            ) from exc

    def close(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    def __enter__(self) -> "DatabaseManager":
        self.connect()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    @contextmanager
    def transaction(self) -> Iterator[None]:
        """
        Transaction context manager.

        Rolls back on error and re-raises the exception.
        """
        self.connect()
        if self._conn is None:
            raise DatabaseError("Database connection is not available.")

        self._tx_depth += 1
        try:
            yield
            if self._tx_depth == 1:
                self._conn.commit()
        except Exception:
            if self._tx_depth == 1:
                self._conn.rollback()
            raise
        finally:
            self._tx_depth -= 1

    def execute(
        self,
        query: str,
        params: Optional[Sequence[Any]] = None,
        fetch: Optional[Literal["one", "all"]] = None,
        commit: bool = False,
    ) -> Optional[Any]:
        """
        Execute SQL and optionally fetch results.
        """
        self.connect()
        if self._conn is None:
            raise DatabaseError("Database connection is not available.")

        with self._conn.cursor() as cur:
            cur.execute(query, params or ())
            if fetch == "one":
                result = cur.fetchone()
                if commit and self._tx_depth == 0:
                    self._conn.commit()
                return result
            if fetch == "all":
                result = cur.fetchall()
                if commit and self._tx_depth == 0:
                    self._conn.commit()
                return result
        if commit and self._tx_depth == 0:
            self._conn.commit()
        return None

    def initialize_schema(self) -> None:
        """Create schemas/tables defined in `database/schema.sql`."""
        if not self.schema_path.exists():
            raise DatabaseError(f"Schema file not found: {self.schema_path}")

        sql_text = self.schema_path.read_text(encoding="utf-8")
        self.connect()
        if self._conn is None:
            raise DatabaseError("Database connection is not available.")

        with self.transaction():
            with self._conn.cursor() as cur:
                cur.execute(sql_text)

    def run_sql_file(self, sql_file_path: str) -> None:
        """Execute any SQL file in a transaction."""
        path = Path(sql_file_path).resolve()
        if not path.exists():
            raise DatabaseError(f"SQL file not found: {path}")

        sql_text = path.read_text(encoding="utf-8")
        self.connect()
        if self._conn is None:
            raise DatabaseError("Database connection is not available.")

        with self.transaction():
            with self._conn.cursor() as cur:
                cur.execute(sql_text)

    def create_user(
        self,
        name: str,
        email: str,
        handicap_index: Optional[float] = None,
        home_course_id: Optional[str] = None,
    ) -> str:
        query = """
            INSERT INTO users.users (name, email, handicap_index, home_course_id)
            VALUES (%s, %s, %s, %s)
            RETURNING id
        """
        row = self.execute(
            query,
            (name, email, handicap_index, home_course_id),
            fetch="one",
            commit=True,
        )
        return str(row[0])

    def create_round(
        self,
        user_id: str,
        course_id: str,
        tee_id: str,
        round_date: Optional[str] = None,
        total_score: Optional[int] = None,
        holes_played: Optional[int] = None,
        is_complete: bool = False,
        weather_conditions: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> str:
        query = """
            INSERT INTO users.rounds (
                user_id, course_id, tee_id, round_date, total_score,
                holes_played, is_complete, weather_conditions, notes
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """
        row = self.execute(
            query,
            (
                user_id,
                course_id,
                tee_id,
                round_date,
                total_score,
                holes_played,
                is_complete,
                weather_conditions,
                notes,
            ),
            fetch="one",
            commit=True,
        )
        return str(row[0])

    def add_round_player(
        self,
        round_id: str,
        name: str,
        user_id: Optional[str] = None,
    ) -> str:
        query = """
            INSERT INTO users.round_players (round_id, name, user_id)
            VALUES (%s, %s, %s)
            ON CONFLICT (round_id, name)
            DO UPDATE SET user_id = COALESCE(EXCLUDED.user_id, users.round_players.user_id)
            RETURNING id
        """
        row = self.execute(
            query,
            (round_id, name, user_id),
            fetch="one",
            commit=True,
        )
        return str(row[0])

    def add_hole_score(
        self,
        round_id: str,
        hole_id: str,
        hole_number: int,
        strokes: Optional[int] = None,
        round_player_id: Optional[str] = None,
        net_score: Optional[int] = None,
        putts: Optional[int] = None,
        shots_to_green: Optional[int] = None,
        fairway_hit: Optional[bool] = None,
        green_in_regulation: Optional[bool] = None,
        penalties: int = 0,
    ) -> str:
        if not round_player_id:
            raise DatabaseError(
                "round_player_id is required when inserting hole scores."
            )

        query = """
            INSERT INTO users.hole_scores (
                round_id, round_player_id, hole_id, hole_number,
                strokes, net_score, putts, shots_to_green,
                fairway_hit, green_in_regulation, penalties
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """
        row = self.execute(
            query,
            (
                round_id,
                round_player_id,
                hole_id,
                hole_number,
                strokes,
                net_score,
                putts,
                shots_to_green,
                fairway_hit,
                green_in_regulation,
                penalties,
            ),
            fetch="one",
            commit=True,
        )
        return str(row[0])

    def save_scorecard_scan(
        self,
        round_id: Optional[str],
        image_path: Optional[str],
        llm_model: Optional[str],
        llm_raw_json: Optional[Dict[str, Any]],
    ) -> str:
        # Use explicit JSON cast so this works consistently across drivers.
        query = """
            INSERT INTO users.scorecard_scans (round_id, image_path, llm_model, llm_raw_json)
            VALUES (%s, %s, %s, %s::jsonb)
            RETURNING id
        """
        json_payload = json.dumps(llm_raw_json) if llm_raw_json is not None else None
        row = self.execute(
            query,
            (round_id, image_path, llm_model, json_payload),
            fetch="one",
            commit=True,
        )
        return str(row[0])

    def get_course_holes(self, course_id: str) -> List[Dict[str, Any]]:
        query = """
            SELECT id, hole_number, par, handicap
            FROM courses.holes
            WHERE course_id = %s
            ORDER BY hole_number
        """
        rows = self.execute(query, (course_id,), fetch="all") or []
        return [
            {
                "id": str(row[0]),
                "hole_number": row[1],
                "par": row[2],
                "handicap": row[3],
            }
            for row in rows
        ]

    def insert_hole_scores_for_player(
        self,
        round_id: str,
        round_player_id: Optional[str],
        course_id: str,
        scores: Iterable[Dict[str, Any]],
    ) -> None:
        """
        Convenience helper for bulk-like insert from parsed LLM data.

        Expected score dict keys:
        - hole_number (required)
        - strokes, net_score, putts, shots_to_green, fairway_hit, green_in_regulation, penalties
        """
        if not round_player_id:
            raise DatabaseError(
                "round_player_id is required when inserting hole scores for a player."
            )

        holes = {
            row["hole_number"]: row["id"]
            for row in self.get_course_holes(course_id)
        }

        with self.transaction():
            for score in scores:
                hole_number = int(score["hole_number"])
                hole_id = holes.get(hole_number)
                if not hole_id:
                    raise DatabaseError(
                        f"Cannot insert score: hole {hole_number} not found for course {course_id}"
                    )

                self.add_hole_score(
                    round_id=round_id,
                    round_player_id=round_player_id,
                    hole_id=hole_id,
                    hole_number=hole_number,
                    strokes=score.get("strokes"),
                    net_score=score.get("net_score"),
                    putts=score.get("putts"),
                    shots_to_green=score.get("shots_to_green"),
                    fairway_hit=score.get("fairway_hit"),
                    green_in_regulation=score.get("green_in_regulation"),
                    penalties=score.get("penalties", 0),
                )
