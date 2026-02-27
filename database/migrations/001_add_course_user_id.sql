-- Migration 001: Add user_id to courses.courses for custom/user-owned courses
--
-- Master courses:  user_id IS NULL  (global, read-only by users)
-- Custom courses:  user_id IS NOT NULL  (owned by a specific user, editable)
--
-- Run this against an existing database. schema.sql handles fresh installs.

BEGIN;

-- 1. Add user_id column (nullable = master course by default)
ALTER TABLE courses.courses
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users.users(id) ON DELETE CASCADE;

-- 2. Drop the old UNIQUE (name, location) table constraint
--    (PostgreSQL auto-names it <table>_<col>_<col>_key)
ALTER TABLE courses.courses
    DROP CONSTRAINT IF EXISTS courses_name_location_key;

-- 3. Add index on user_id
CREATE INDEX IF NOT EXISTS idx_courses_user_id ON courses.courses (user_id);

-- 4. Replace table-level UNIQUE with partial unique indexes
--    Master courses: unique by (name, location) where user_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_unique_master
    ON courses.courses (LOWER(name), location) WHERE user_id IS NULL;

--    User courses: unique by (name, location, user_id) where user_id IS NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_unique_user
    ON courses.courses (LOWER(name), location, user_id) WHERE user_id IS NOT NULL;

COMMIT;
