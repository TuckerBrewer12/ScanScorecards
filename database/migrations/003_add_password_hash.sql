-- Migration 003: Add password_hash column for email/password auth
BEGIN;
ALTER TABLE users.users
    ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
COMMIT;
