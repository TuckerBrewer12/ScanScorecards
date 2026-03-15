-- Migration 004: add external_course_id to courses.courses
--
-- Allows linking a local course row to a provider-specific course ID
-- (e.g., GolfCourseAPI/OSM/etc.) without changing local primary keys.

BEGIN;

ALTER TABLE courses.courses
    ADD COLUMN IF NOT EXISTS external_course_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_courses_external_course_id
    ON courses.courses (external_course_id);

COMMIT;
