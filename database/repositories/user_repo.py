"""CRUD operations for the users.users table."""

import asyncpg
from typing import Optional
from uuid import UUID

from models import User
from database.converters import user_from_row, user_to_row
from database.exceptions import DuplicateError, NotFoundError


class UserRepositoryDB:
    """Async CRUD for users."""

    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    # ================================================================
    # Read
    # ================================================================

    async def get_user(self, user_id: str) -> Optional[User]:
        """Get user by ID (without rounds)."""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM users.users WHERE id = $1", UUID(user_id)
            )
            return user_from_row(row) if row else None

    async def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM users.users WHERE email = $1", email
            )
            return user_from_row(row) if row else None

    # ================================================================
    # Create
    # ================================================================

    async def create_user(self, user: User) -> User:
        """Create a new user. Returns User with DB-generated id."""
        data = user_to_row(user)
        try:
            async with self._pool.acquire() as conn:
                row = await conn.fetchrow(
                    """INSERT INTO users.users (name, email, handicap_index, home_course_id)
                       VALUES ($1, $2, $3, $4) RETURNING *""",
                    data["name"], data["email"],
                    data["handicap_index"], data["home_course_id"],
                )
                return user_from_row(row)
        except asyncpg.UniqueViolationError as e:
            raise DuplicateError(f"Email already in use: {e}") from e

    # ================================================================
    # Update
    # ================================================================

    async def update_user(self, user_id: str, **fields) -> Optional[User]:
        """Update user fields (name, email, handicap_index, home_course_id, preferences)."""
        allowed = {"name", "email", "handicap_index", "home_course_id", "preferences"}
        updates = {k: v for k, v in fields.items() if k in allowed}
        if not updates:
            return await self.get_user(user_id)

        # Convert home_course_id string to UUID if present
        if "home_course_id" in updates and updates["home_course_id"] is not None:
            updates["home_course_id"] = UUID(updates["home_course_id"])

        set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
        values = [UUID(user_id)] + list(updates.values())

        try:
            async with self._pool.acquire() as conn:
                row = await conn.fetchrow(
                    f"UPDATE users.users SET {set_clause} WHERE id = $1 RETURNING *",
                    *values,
                )
                return user_from_row(row) if row else None
        except asyncpg.UniqueViolationError as e:
            raise DuplicateError(f"Email already in use: {e}") from e

    async def update_handicap(self, user_id: str, handicap: float) -> None:
        """Update handicap and set last_handicap_update to NOW()."""
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                """UPDATE users.users
                   SET handicap_index = $2, last_handicap_update = NOW()
                   WHERE id = $1""",
                UUID(user_id), handicap,
            )
            if result == "UPDATE 0":
                raise NotFoundError(f"User {user_id} not found")

    # ================================================================
    # Delete
    # ================================================================

    async def delete_user(self, user_id: str) -> bool:
        """Delete user and all their rounds (CASCADE). Returns True if deleted."""
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM users.users WHERE id = $1", UUID(user_id)
            )
            return result == "DELETE 1"
