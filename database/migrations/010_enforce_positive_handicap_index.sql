-- Migration 010: enforce positive-only handicap index values
-- Rule: handicap_index must be NULL or in (0, 54]

BEGIN;

-- Preserve existing intent for plus-handicap style inputs by flipping negatives.
UPDATE users.users
SET handicap_index = ABS(handicap_index)
WHERE handicap_index < 0;

-- Zero is not allowed under the new rule; clear it.
UPDATE users.users
SET handicap_index = NULL
WHERE handicap_index = 0;

ALTER TABLE users.users
DROP CONSTRAINT IF EXISTS chk_users_handicap_index_positive;

ALTER TABLE users.users
ADD CONSTRAINT chk_users_handicap_index_positive
CHECK (handicap_index IS NULL OR (handicap_index > 0 AND handicap_index <= 54));

COMMIT;
