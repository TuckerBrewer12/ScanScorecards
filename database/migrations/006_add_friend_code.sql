-- Migration 006: add users.friend_code for friend invites without exposing UUIDs

BEGIN;

ALTER TABLE users.users
    ADD COLUMN IF NOT EXISTS friend_code VARCHAR(12);

-- Backfill existing users with a deterministic, unique code based on UUID.
UPDATE users.users
SET friend_code = 'GC' || UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 10))
WHERE friend_code IS NULL OR friend_code = '';

ALTER TABLE users.users
    ALTER COLUMN friend_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_friend_code
    ON users.users (friend_code);

COMMIT;
