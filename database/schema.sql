-- PostgreSQL schema aligned with Issue #3 (Databases)
-- Includes multi-player scorecards via users.round_players.

BEGIN;

-- Schemas
CREATE SCHEMA IF NOT EXISTS courses;
CREATE SCHEMA IF NOT EXISTS users;

-- Extensions (for UUIDs)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============
-- courses.courses
-- =============
CREATE TABLE IF NOT EXISTS courses.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    par INTEGER NOT NULL CHECK (par BETWEEN 60 AND 80),
    total_holes INTEGER NOT NULL CHECK (total_holes IN (9, 18)),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB,
    UNIQUE (name, location)
);

CREATE INDEX IF NOT EXISTS idx_courses_location ON courses.courses (location);
CREATE INDEX IF NOT EXISTS idx_courses_name ON courses.courses (name);

-- =============
-- courses.tees
-- =============
CREATE TABLE IF NOT EXISTS courses.tees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses.courses(id) ON DELETE CASCADE,
    color VARCHAR(50) NOT NULL,
    total_yardage INTEGER NOT NULL CHECK (total_yardage BETWEEN 4000 AND 8000),
    slope_rating NUMERIC(4,1) NOT NULL CHECK (slope_rating BETWEEN 55 AND 155),
    course_rating NUMERIC(4,1) NOT NULL CHECK (course_rating BETWEEN 60 AND 80),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (course_id, color)
);

CREATE INDEX IF NOT EXISTS idx_tees_course_id ON courses.tees (course_id);
CREATE INDEX IF NOT EXISTS idx_tees_color ON courses.tees (color);

-- =============
-- courses.holes
-- =============
CREATE TABLE IF NOT EXISTS courses.holes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tee_id UUID NOT NULL REFERENCES courses.tees(id) ON DELETE CASCADE,
    hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
    par INTEGER NOT NULL CHECK (par BETWEEN 3 AND 6),
    handicap INTEGER NOT NULL CHECK (handicap BETWEEN 1 AND 18),
    yardage INTEGER NOT NULL CHECK (yardage BETWEEN 100 AND 650),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (tee_id, hole_number),
    UNIQUE (tee_id, handicap)
);

CREATE INDEX IF NOT EXISTS idx_holes_tee_id ON courses.holes (tee_id);
CREATE INDEX IF NOT EXISTS idx_holes_number ON courses.holes (hole_number);

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

-- =============
-- users.rounds
-- =============
CREATE TABLE IF NOT EXISTS users.rounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses.courses(id) ON DELETE RESTRICT,
    tee_id UUID NOT NULL REFERENCES courses.tees(id) ON DELETE RESTRICT,
    round_date DATE NOT NULL,
    total_score INTEGER NOT NULL CHECK (total_score BETWEEN 50 AND 200),
    adjusted_gross_score INTEGER CHECK (adjusted_gross_score BETWEEN 50 AND 200),
    score_differential NUMERIC(4,1),
    is_complete BOOLEAN DEFAULT FALSE,
    holes_played INTEGER NOT NULL CHECK (holes_played BETWEEN 1 AND 18),
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

-- =============
-- users.round_players (multi-player scorecards)
-- =============
CREATE TABLE IF NOT EXISTS users.round_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID NOT NULL REFERENCES users.rounds(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (round_id, name)
);

CREATE INDEX IF NOT EXISTS idx_round_players_round_id ON users.round_players (round_id);
CREATE INDEX IF NOT EXISTS idx_round_players_user_id ON users.round_players (user_id);

-- =============
-- users.hole_scores
-- =============
CREATE TABLE IF NOT EXISTS users.hole_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID NOT NULL REFERENCES users.rounds(id) ON DELETE CASCADE,
    round_player_id UUID REFERENCES users.round_players(id) ON DELETE CASCADE,
    hole_id UUID NOT NULL REFERENCES courses.holes(id) ON DELETE RESTRICT,
    hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
    strokes INTEGER NOT NULL CHECK (strokes BETWEEN 1 AND 15),
    putts INTEGER CHECK (putts BETWEEN 0 AND 10),
    fairway_hit BOOLEAN,
    green_in_regulation BOOLEAN,
    penalties INTEGER DEFAULT 0 CHECK (penalties BETWEEN 0 AND 5),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (round_id, round_player_id, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_hole_scores_round_id ON users.hole_scores (round_id);
CREATE INDEX IF NOT EXISTS idx_hole_scores_hole_id ON users.hole_scores (hole_id);
CREATE INDEX IF NOT EXISTS idx_hole_scores_gir ON users.hole_scores (green_in_regulation)
    WHERE green_in_regulation IS NOT NULL;

-- =============
-- users.scorecard_scans (optional raw LLM output)
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