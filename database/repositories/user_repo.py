"""CRUD operations for the users.users table."""

import asyncpg
import secrets
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from models import User
from database.converters import user_from_row, user_to_row
from database.exceptions import DuplicateError, NotFoundError


class UserRepositoryDB:
    """Async CRUD for users."""

    FRIEND_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    FRIEND_CODE_LEN = 8

    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    @staticmethod
    def _normalize_email(email: str) -> str:
        return email.strip().lower()

    def _generate_friend_code(self) -> str:
        return "GC" + "".join(
            secrets.choice(self.FRIEND_CODE_ALPHABET) for _ in range(self.FRIEND_CODE_LEN)
        )

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
        normalized = self._normalize_email(email)
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM users.users WHERE LOWER(email) = $1", normalized
            )
            return user_from_row(row) if row else None

    async def get_user_by_friend_code(self, friend_code: str) -> Optional[User]:
        """Get user by friend code."""
        normalized = friend_code.strip().upper()
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM users.users WHERE friend_code = $1", normalized
            )
            return user_from_row(row) if row else None

    # ================================================================
    # Create
    # ================================================================

    async def get_password_hash(self, email: str) -> Optional[str]:
        """Return only the password_hash for the given email (for auth use only)."""
        normalized = self._normalize_email(email)
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT password_hash FROM users.users WHERE LOWER(email) = $1", normalized
            )
            return row["password_hash"] if row else None

    async def get_auth_user_by_email(self, email: str) -> Optional[dict]:
        """Return auth fields for a user by email."""
        normalized = self._normalize_email(email)
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT id, name, email, password_hash, email_verified
                   FROM users.users
                   WHERE LOWER(email) = $1""",
                normalized,
            )
            if not row:
                return None
            return {
                "id": str(row["id"]),
                "name": row["name"],
                "email": row["email"],
                "password_hash": row["password_hash"],
                "email_verified": bool(row["email_verified"]),
            }

    async def create_user(self, user: User, *, password_hash: Optional[str] = None) -> User:
        """Create a new user. Returns User with DB-generated id."""
        data = user_to_row(user)
        normalized_email = self._normalize_email(data["email"])
        async with self._pool.acquire() as conn:
            for _ in range(10):
                friend_code = data["friend_code"] or self._generate_friend_code()
                try:
                    row = await conn.fetchrow(
                        """INSERT INTO users.users
                           (friend_code, name, email, handicap_index, home_course_id, password_hash,
                            email_verified, email_verified_at, last_handicap_update)
                           VALUES ($1, $2, $3, $4, $5, $6,
                                   COALESCE($7, FALSE),
                                   CASE WHEN COALESCE($7, FALSE) THEN NOW() ELSE NULL END,
                                   CASE WHEN $4 IS NULL THEN NULL ELSE NOW() END)
                           RETURNING *""",
                        friend_code,
                        data["name"],
                        normalized_email,
                        data["handicap_index"],
                        data["home_course_id"],
                        password_hash,
                        user.email_verified,
                    )
                    return user_from_row(row)
                except asyncpg.UniqueViolationError as e:
                    # Retry for friend_code collisions; fail fast for email collisions.
                    if e.constraint_name in {"users_users_email_key", "idx_users_email"}:
                        raise DuplicateError(f"Email already in use: {e}") from e
                    if e.constraint_name in {"users_users_friend_code_key", "idx_users_friend_code"}:
                        data["friend_code"] = None
                        continue
                    raise
            raise DuplicateError("Could not allocate a unique friend code")

    # ================================================================
    # Update
    # ================================================================

    async def update_user(self, user_id: str, **fields) -> Optional[User]:
        """Update user fields (name, email, handicap_index, home_course_id, preferences)."""
        allowed = {"name", "email", "handicap_index", "home_course_id", "preferences", "scoring_goal"}
        updates = {k: v for k, v in fields.items() if k in allowed}
        if not updates:
            return await self.get_user(user_id)
        if "handicap_index" in updates:
            updates["last_handicap_update"] = "NOW()"

        # Convert home_course_id string to UUID if present
        if "home_course_id" in updates and updates["home_course_id"] is not None:
            updates["home_course_id"] = UUID(updates["home_course_id"])

        set_parts = []
        values = [UUID(user_id)]
        for k, v in updates.items():
            if isinstance(v, str) and v == "NOW()" and k == "last_handicap_update":
                set_parts.append(f"{k} = NOW()")
            else:
                values.append(v)
                set_parts.append(f"{k} = ${len(values)}")
        set_clause = ", ".join(set_parts)

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

    async def set_password_hash(self, user_id: str, password_hash: str) -> None:
        """Set a new password hash for the user."""
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                "UPDATE users.users SET password_hash = $2 WHERE id = $1",
                UUID(user_id),
                password_hash,
            )
            if result == "UPDATE 0":
                raise NotFoundError(f"User {user_id} not found")

    async def mark_email_verified(self, user_id: str) -> None:
        """Mark email as verified."""
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                """UPDATE users.users
                   SET email_verified = TRUE, email_verified_at = NOW()
                   WHERE id = $1""",
                UUID(user_id),
            )
            if result == "UPDATE 0":
                raise NotFoundError(f"User {user_id} not found")

    async def create_auth_token(
        self,
        user_id: str,
        token_type: str,
        token_hash: str,
        expires_at: datetime,
    ) -> None:
        """Insert one-time auth token hash and invalidate older active tokens of the same type."""
        if expires_at.tzinfo is not None:
            expires_at = expires_at.astimezone(timezone.utc).replace(tzinfo=None)
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    """UPDATE users.auth_tokens
                       SET used_at = NOW()
                       WHERE user_id = $1
                         AND token_type = $2
                         AND used_at IS NULL""",
                    UUID(user_id),
                    token_type,
                )
                await conn.execute(
                    """INSERT INTO users.auth_tokens (user_id, token_type, token_hash, expires_at)
                       VALUES ($1, $2, $3, $4)""",
                    UUID(user_id),
                    token_type,
                    token_hash,
                    expires_at,
                )

    async def consume_auth_token(self, token_type: str, token_hash: str) -> Optional[str]:
        """Consume token if valid (not expired, not previously used) and return user_id."""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """WITH token_row AS (
                       SELECT id, user_id
                       FROM users.auth_tokens
                       WHERE token_type = $1
                         AND token_hash = $2
                         AND used_at IS NULL
                         AND expires_at > NOW()
                       ORDER BY created_at DESC
                       LIMIT 1
                   )
                   UPDATE users.auth_tokens t
                   SET used_at = NOW()
                   FROM token_row
                   WHERE t.id = token_row.id
                   RETURNING token_row.user_id AS user_id""",
                token_type,
                token_hash,
            )
            if not row:
                return None
            return str(row["user_id"])

    async def has_recent_auth_token(
        self,
        user_id: str,
        token_type: str,
        min_created_at: datetime,
    ) -> bool:
        """Check for recent token issuance to reduce spammy resends."""
        if min_created_at.tzinfo is not None:
            min_created_at = min_created_at.astimezone(timezone.utc).replace(tzinfo=None)
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT id
                   FROM users.auth_tokens
                   WHERE user_id = $1
                     AND token_type = $2
                     AND created_at >= $3
                   ORDER BY created_at DESC
                   LIMIT 1""",
                UUID(user_id),
                token_type,
                min_created_at,
            )
            return bool(row)

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
