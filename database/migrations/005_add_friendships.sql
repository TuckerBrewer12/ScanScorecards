-- Migration 005: add users.friendships for friend requests + accepted connections

BEGIN;

CREATE TABLE IF NOT EXISTS users.friendships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CHECK (requester_id <> addressee_id)
);

-- One friendship row max per user-pair regardless of direction.
CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_unique_pair
    ON users.friendships (
        LEAST(requester_id, addressee_id),
        GREATEST(requester_id, addressee_id)
    );
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON users.friendships (requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON users.friendships (addressee_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON users.friendships (status);

DROP TRIGGER IF EXISTS trg_friendships_updated_at ON users.friendships;
CREATE TRIGGER trg_friendships_updated_at
    BEFORE UPDATE ON users.friendships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
