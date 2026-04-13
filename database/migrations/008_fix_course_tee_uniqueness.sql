-- Migration 008: tighten uniqueness semantics for course identity and tee color
-- 1) Treat NULL location as empty for uniqueness, so duplicate unnamed-location
--    entries can't be created.
-- 2) Enforce case-insensitive uniqueness for tee colors within a course.

BEGIN;

DROP INDEX IF EXISTS idx_courses_unique_master;
CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_unique_master
    ON courses.courses (LOWER(name), COALESCE(LOWER(location), ''))
    WHERE user_id IS NULL;

DROP INDEX IF EXISTS idx_courses_unique_user;
CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_unique_user
    ON courses.courses (LOWER(name), COALESCE(LOWER(location), ''), user_id)
    WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tees_unique_course_color_ci
    ON courses.tees (course_id, LOWER(color));

COMMIT;
