-- PostgreSQL schema aligned with Pydantic domain models

BEGIN;

-- Schemas
CREATE SCHEMA IF NOT EXISTS courses;
CREATE SCHEMA IF NOT EXISTS users;

-- Extensions (for UUIDs)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============
-- Auto-update updated_at on row modification
-- =============
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============
-- courses.courses
-- =============
CREATE TABLE IF NOT EXISTS courses.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    par INTEGER CHECK (par BETWEEN 27 AND 80),
    total_holes INTEGER CHECK (total_holes IN (9, 18)),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB,
    UNIQUE (name, location)
);

CREATE INDEX IF NOT EXISTS idx_courses_location ON courses.courses (location);
CREATE INDEX IF NOT EXISTS idx_courses_name ON courses.courses (name);

CREATE TRIGGER trg_courses_updated_at
    BEFORE UPDATE ON courses.courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============
-- courses.holes
-- Par and handicap are properties of the hole itself (same regardless of tee).
-- Yardage varies by tee and lives in courses.tee_yardages.
-- =============
CREATE TABLE IF NOT EXISTS courses.holes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses.courses(id) ON DELETE CASCADE,
    hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
    par INTEGER CHECK (par BETWEEN 3 AND 6),
    handicap INTEGER CHECK (handicap BETWEEN 1 AND 18),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (course_id, hole_number),
    UNIQUE (course_id, handicap)
);

CREATE INDEX IF NOT EXISTS idx_holes_course_id ON courses.holes (course_id);
CREATE INDEX IF NOT EXISTS idx_holes_number ON courses.holes (hole_number);

-- =============
-- courses.tees
-- =============
CREATE TABLE IF NOT EXISTS courses.tees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses.courses(id) ON DELETE CASCADE,
    color VARCHAR(50) NOT NULL,
    slope_rating NUMERIC(4,1) CHECK (slope_rating BETWEEN 55 AND 155),
    course_rating NUMERIC(4,1) CHECK (course_rating BETWEEN 55 AND 85),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (course_id, color)
);

CREATE INDEX IF NOT EXISTS idx_tees_course_id ON courses.tees (course_id);
CREATE INDEX IF NOT EXISTS idx_tees_color ON courses.tees (color);

-- =============
-- courses.tee_yardages
-- Per-hole yardage for each tee box. Mirrors Tee.hole_yardages dict.
-- =============
CREATE TABLE IF NOT EXISTS courses.tee_yardages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tee_id UUID NOT NULL REFERENCES courses.tees(id) ON DELETE CASCADE,
    hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
    yardage INTEGER NOT NULL CHECK (yardage BETWEEN 50 AND 700),
    UNIQUE (tee_id, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_tee_yardages_tee_id ON courses.tee_yardages (tee_id);

-- =============
-- users.users
-- =============
CREATE TABLE IF NOT EXISTS users.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    handicap_index NUMERIC(4,1),
    home_course_id UUID REFERENCES courses.courses(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_handicap_update TIMESTAMP,
    preferences JSONB
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users.users (email);
CREATE INDEX IF NOT EXISTS idx_users_home_course ON users.users (home_course_id);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============
-- users.rounds
-- =============
CREATE TABLE IF NOT EXISTS users.rounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses.courses(id) ON DELETE RESTRICT,
    tee_id UUID REFERENCES courses.tees(id) ON DELETE RESTRICT,
    round_date DATE,
    total_score INTEGER CHECK (total_score BETWEEN 18 AND 200),
    adjusted_gross_score INTEGER CHECK (adjusted_gross_score BETWEEN 18 AND 200),
    score_differential NUMERIC(4,1),
    is_complete BOOLEAN DEFAULT FALSE,
    holes_played INTEGER CHECK (holes_played BETWEEN 1 AND 18),
    weather_conditions VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rounds_user_id ON users.rounds (user_id);
CREATE INDEX IF NOT EXISTS idx_rounds_course_id ON users.rounds (course_id);
CREATE INDEX IF NOT EXISTS idx_rounds_date ON users.rounds (round_date);
CREATE INDEX IF NOT EXISTS idx_rounds_user_date ON users.rounds (user_id, round_date DESC);
CREATE INDEX IF NOT EXISTS idx_rounds_differential ON users.rounds (score_differential)
    WHERE score_differential IS NOT NULL;

CREATE TRIGGER trg_rounds_updated_at
    BEFORE UPDATE ON users.rounds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============
-- users.hole_scores
-- =============
CREATE TABLE IF NOT EXISTS users.hole_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID NOT NULL REFERENCES users.rounds(id) ON DELETE CASCADE,
    hole_id UUID NOT NULL REFERENCES courses.holes(id) ON DELETE RESTRICT,
    hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
    strokes INTEGER CHECK (strokes BETWEEN 1 AND 15),
    net_score INTEGER CHECK (net_score BETWEEN -3 AND 15),
    putts INTEGER CHECK (putts BETWEEN 0 AND 10),
    shots_to_green INTEGER CHECK (shots_to_green BETWEEN 1 AND 10),
    fairway_hit BOOLEAN,
    green_in_regulation BOOLEAN,
    penalties INTEGER DEFAULT 0 CHECK (penalties BETWEEN 0 AND 5),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (round_id, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_hole_scores_round_id ON users.hole_scores (round_id);
CREATE INDEX IF NOT EXISTS idx_hole_scores_hole_id ON users.hole_scores (hole_id);
CREATE INDEX IF NOT EXISTS idx_hole_scores_gir ON users.hole_scores (green_in_regulation)
    WHERE green_in_regulation IS NOT NULL;

-- =============
-- users.scorecard_scans (raw LLM output)
-- =============
CREATE TABLE IF NOT EXISTS users.scorecard_scans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID REFERENCES users.rounds(id) ON DELETE SET NULL,
    image_path TEXT,
    llm_model TEXT,
    llm_raw_json JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

COMMIT;
