-- Migration 009: auth hardening (verification/reset tokens + user verification state)
BEGIN;

ALTER TABLE users.users
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

-- Backfill existing accounts to avoid locking out already-created users.
UPDATE users.users
SET email_verified = TRUE,
    email_verified_at = COALESCE(email_verified_at, created_at)
WHERE email_verified = FALSE;

CREATE INDEX IF NOT EXISTS idx_users_email_verified
    ON users.users (email_verified);

CREATE TABLE IF NOT EXISTS users.auth_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
    token_type VARCHAR(32) NOT NULL CHECK (token_type IN ('email_verify', 'password_reset')),
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    meta JSONB
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash
    ON users.auth_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_type
    ON users.auth_tokens (user_id, token_type);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires_at
    ON users.auth_tokens (expires_at);

COMMIT;
