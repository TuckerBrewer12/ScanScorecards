"""CRUD operations for user-owned tee configurations."""

import json
import asyncpg
from typing import List, Optional
from uuid import UUID

from models import UserTee
from database.converters import user_tee_from_row, user_tee_to_row
from database.exceptions import DuplicateError, NotFoundError


class UserTeeRepositoryDB:
    """Async CRUD for users.user_tees."""

    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    async def get_user_tees(
        self, user_id: str, *, course_id: Optional[str] = None
    ) -> List[UserTee]:
        """List a user's custom tees, optionally filtered by course."""
        async with self._pool.acquire() as conn:
            if course_id:
                rows = await conn.fetch(
                    """SELECT * FROM users.user_tees
                       WHERE user_id = $1 AND course_id = $2
                       ORDER BY name""",
                    UUID(user_id), UUID(course_id),
                )
            else:
                rows = await conn.fetch(
                    """SELECT * FROM users.user_tees
                       WHERE user_id = $1 ORDER BY name""",
                    UUID(user_id),
                )
            return [user_tee_from_row(r) for r in rows]

    async def get_user_tee(self, tee_id: str) -> Optional[UserTee]:
        """Get a single user tee by ID."""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM users.user_tees WHERE id = $1", UUID(tee_id)
            )
            return user_tee_from_row(row) if row else None

    async def create_user_tee(self, user_tee: UserTee) -> UserTee:
        """Create a user tee configuration."""
        row_data = user_tee_to_row(user_tee)
        try:
            async with self._pool.acquire() as conn:
                row = await conn.fetchrow(
                    """INSERT INTO users.user_tees
                       (user_id, course_id, name, slope_rating, course_rating, hole_yardages)
                       VALUES ($1, $2, $3, $4, $5, $6)
                       RETURNING *""",
                    row_data["user_id"], row_data["course_id"],
                    row_data["name"], row_data["slope_rating"],
                    row_data["course_rating"], json.dumps(row_data["hole_yardages"]),
                )
                return user_tee_from_row(row)
        except asyncpg.UniqueViolationError as e:
            raise DuplicateError(str(e)) from e

    async def update_user_tee(self, tee_id: str, **fields) -> Optional[UserTee]:
        """Update a user tee configuration."""
        allowed = {"name", "slope_rating", "course_rating", "hole_yardages"}
        updates = {k: v for k, v in fields.items() if k in allowed}
        if not updates:
            return await self.get_user_tee(tee_id)

        # Serialize hole_yardages to JSON string for asyncpg
        if "hole_yardages" in updates and updates["hole_yardages"] is not None:
            updates["hole_yardages"] = json.dumps(
                {str(k): v for k, v in updates["hole_yardages"].items()}
            )

        set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
        values = [UUID(tee_id)] + list(updates.values())

        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                f"UPDATE users.user_tees SET {set_clause} WHERE id = $1 RETURNING *",
                *values,
            )
            if not row:
                raise NotFoundError(f"UserTee {tee_id} not found")
            return user_tee_from_row(row)

    async def delete_user_tee(self, tee_id: str) -> bool:
        """Delete a user tee. Returns True if deleted."""
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM users.user_tees WHERE id = $1", UUID(tee_id)
            )
            return result == "DELETE 1"
