"""CRUD operations for users.friendships."""

import asyncpg
from typing import List, Optional
from uuid import UUID

from database.exceptions import DuplicateError


class FriendshipRepositoryDB:
    """Async CRUD for friendship requests and relationships."""

    VALID_STATUSES = {"pending", "accepted", "declined", "blocked"}

    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    async def send_request(self, requester_id: str, addressee_id: str) -> dict:
        """Create or reopen a friendship request."""
        req = UUID(requester_id)
        adr = UUID(addressee_id)
        if req == adr:
            raise ValueError("Cannot friend yourself")

        async with self._pool.acquire() as conn:
            # Check if pair already exists (any direction)
            row = await conn.fetchrow(
                """SELECT * FROM users.friendships
                   WHERE LEAST(requester_id, addressee_id) = LEAST($1, $2)
                     AND GREATEST(requester_id, addressee_id) = GREATEST($1, $2)
                   LIMIT 1""",
                req, adr,
            )
            if row:
                status = row["status"]
                if status == "accepted":
                    raise DuplicateError("Users are already friends")
                if status == "blocked":
                    raise DuplicateError("Friend request blocked for this pair")

                updated = await conn.fetchrow(
                    """UPDATE users.friendships
                       SET requester_id = $1, addressee_id = $2, status = 'pending'
                       WHERE id = $3
                       RETURNING *""",
                    req, adr, row["id"],
                )
                return dict(updated)

            created = await conn.fetchrow(
                """INSERT INTO users.friendships (requester_id, addressee_id, status)
                   VALUES ($1, $2, 'pending')
                   RETURNING *""",
                req, adr,
            )
            return dict(created)

    async def update_status(
        self, friendship_id: str, actor_user_id: str, status: str
    ) -> Optional[dict]:
        """Update friendship status, enforcing actor permissions."""
        if status not in self.VALID_STATUSES:
            raise ValueError(f"Invalid status: {status}")
        fid = UUID(friendship_id)
        actor = UUID(actor_user_id)
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM users.friendships WHERE id = $1",
                fid,
            )
            if not row:
                return None

            # Permission rules:
            # - accepted/declined: only addressee can respond to pending request
            # - blocked: either party can block
            if status in {"accepted", "declined"}:
                if row["status"] != "pending" or row["addressee_id"] != actor:
                    return None
            elif status == "blocked":
                if actor not in (row["requester_id"], row["addressee_id"]):
                    return None

            updated = await conn.fetchrow(
                "UPDATE users.friendships SET status = $2 WHERE id = $1 RETURNING *",
                fid, status,
            )
            return dict(updated) if updated else None

    async def list_for_user(self, user_id: str, status: Optional[str] = None) -> List[dict]:
        """List friendships where user is requester or addressee."""
        uid = UUID(user_id)
        async with self._pool.acquire() as conn:
            if status:
                rows = await conn.fetch(
                    """SELECT f.*,
                              ru.name AS requester_name,
                              ru.email AS requester_email,
                              au.name AS addressee_name,
                              au.email AS addressee_email
                       FROM users.friendships f
                       JOIN users.users ru ON ru.id = f.requester_id
                       JOIN users.users au ON au.id = f.addressee_id
                       WHERE (f.requester_id = $1 OR f.addressee_id = $1)
                         AND f.status = $2
                       ORDER BY f.updated_at DESC""",
                    uid, status,
                )
            else:
                rows = await conn.fetch(
                    """SELECT f.*,
                              ru.name AS requester_name,
                              ru.email AS requester_email,
                              au.name AS addressee_name,
                              au.email AS addressee_email
                       FROM users.friendships f
                       JOIN users.users ru ON ru.id = f.requester_id
                       JOIN users.users au ON au.id = f.addressee_id
                       WHERE f.requester_id = $1 OR f.addressee_id = $1
                       ORDER BY f.updated_at DESC""",
                    uid,
                )
            return [dict(r) for r in rows]
