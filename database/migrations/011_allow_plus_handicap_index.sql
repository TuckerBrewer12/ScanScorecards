-- Migration 011: allow plus handicaps and scratch (range: [-10, 54])

BEGIN;

-- Remove any previous handicap-only check constraints (legacy names included).
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE n.nspname = 'users'
          AND t.relname = 'users'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%handicap_index%'
    LOOP
        EXECUTE format('ALTER TABLE users.users DROP CONSTRAINT %I', rec.conname);
    END LOOP;
END
$$;

ALTER TABLE users.users
ADD CONSTRAINT chk_users_handicap_index_range
CHECK (handicap_index IS NULL OR (handicap_index >= -10 AND handicap_index <= 54));

COMMIT;
