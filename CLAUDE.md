# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack golf scorecard app. Scans physical scorecards via LLM and tracks rounds, courses, and player statistics.

- **Backend**: FastAPI + asyncpg + Google Gemini (Python)
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **DB**: PostgreSQL with schemas `courses` and `users`

## Setup & Dependencies

```bash
# Backend
pip install -r requirements.txt   # pydantic, google-genai, python-dotenv, asyncpg, fastapi, uvicorn
pip freeze > requirements.txt     # run before pushing new dependencies

# Frontend
cd frontend && npm install
```

Requires a `.env` file with `GOOGLE_API_KEY` for LLM extraction.

## Running

```bash
# Backend (port 8000)
source .venv/bin/activate && uvicorn api.main:app --reload

# Frontend (port 5173)
cd frontend && npm run dev
```

DB default: `host=localhost port=5432 database=golf_scorecard` (no DATABASE_URL in .env)

## Running Tests

```bash
python -m unittest tests.test_llm.TestScorecardExtraction.test_example_scorecard      # full extraction
python -m unittest tests.test_llm.TestScorecardExtraction.test_scores_only_extraction  # scores-only
python -m unittest tests.test_llm.TestScorecardExtraction.test_smart_with_null_repo    # SMART strategy
```

## Architecture

### `models/` — Pydantic v2 domain models

All models inherit from `BaseGolfModel` (in `base.py`), which provides `validate_assignment=True` and an `update_field()` method for safe field updates with error messages.

**Composition chain:** `User` → `Round` → `HoleScore` (scores) + `Course` → `Hole` + `Tee`

- **Hole** — single hole: par (3-6), handicap (1-18)
- **Tee** — tee box: color, slope/course ratings, per-hole yardages dict with validation
- **Course** — full course: contains ordered lists of Holes and Tees. Has `get_par()`/`get_tee()`/`get_hole()` accessors and front/back nine par properties
- **HoleScore** — one player's score on a hole: strokes, putts, fairway/GIR stats. Validates putts ≤ strokes. Has `to_par(par=None)` and `get_score_type()` — both fall back to `self.par_played` when no par is passed
- **Round** — complete round: references an optional Course + tee_box color string. Contains ordered HoleScores. Has `get_par()` (sums `par_played` when no course), `get_hole_par(n)`, `total_to_par()`, and score-type calculation methods
- **UserTee** — user-owned tee config linked to an optional master course (`models/user_tee.py`)
- **User** — golfer: handicap (-10 to 54), contains Rounds

**Key design decisions:**
- All fields are `Optional` to handle incomplete/partial scanned data
- Lists (holes, tees, hole_scores) are stored sorted by hole number
- "Get or calculate" pattern: methods like `get_par()`, `get_total_putts()` return the stored value if set, otherwise calculate from child objects
- `hole_id` on `hole_scores` is NULLABLE — rounds can exist without a linked course row
- `par_played` / `handicap_played` stored directly on each `hole_score` (self-contained round)
- `course_name_played` stored on `rounds` for display when `course_id IS NULL`

### `llm/` — Scorecard extraction via Google Gemini

Three extraction strategies (`llm/strategies.py`):
- **FULL** (default) — extracts everything from a scorecard image (course, tees, holes, scores)
- **SCORES_ONLY** — extracts only player scores when course is already known
- **SMART** — identifies course name first (using fast Flash model), looks up in DB, then uses SCORES_ONLY if found, else falls back to FULL

Key files:
- `scorecard_extractor.py` — `extract_scorecard()` public API, Gemini calls, model building
- `prompts.py` — prompt templates + Pydantic models for raw LLM JSON responses
- `strategies.py` — `ExtractionStrategy` enum, `CourseRepository` protocol
- `confidence.py` — per-field confidence scoring from LLM extraction

### `services/` — Business logic layer

- `scan_service.py` — course resolution, par lookup, hole score building, user tee creation extracted from `api/routers/scan.py`. LLM-extracted values are clamped to valid ranges before constructing Hole/Tee/UserTee to prevent Pydantic validation errors on bad scan data.

### `api/` — FastAPI routers

- `routers/scan.py` — `POST /api/scan/extract` and `POST /api/scan/save`. Save flow: looks up existing course; if not found, saves round without a course (no auto-creation). Populates `par_played` from `course_holes` param.
- `routers/courses.py` — GET/POST/PUT + clone endpoint. `user_id IS NULL` = master/global course; `user_id IS NOT NULL` = user-owned custom course.
- `routers/rounds.py` — GET/PUT/DELETE for rounds and hole scores
- `routers/users.py` — user management + user tee CRUD (`/api/users/{id}/tees`)
- `routers/stats.py` — player analytics endpoints
- `api/request_models.py` — shared Pydantic request/response models

**API endpoints:**
- `POST /api/scan/extract` — run LLM extraction on uploaded image
- `POST /api/scan/save` — save extracted round (accepts `course_holes: [{hole_number, par}]`)
- `GET/POST /api/courses` — list/create courses (`?user_id=` for custom)
- `PUT /api/courses/{id}` — update course (403 on master courses)
- `POST /api/courses/{id}/clone` — clone master to user-owned copy
- `GET/PUT/DELETE /api/rounds/{id}` — round CRUD; PUT recalculates `total_score`
- `GET/POST /api/users/{id}/tees` — list/create user tees
- `PUT/DELETE /api/users/{id}/tees/{tee_id}` — update/delete user tees

### `database/` — Async PostgreSQL layer (asyncpg)

Two DB schemas: `courses` (courses, holes, tees, tee_yardages) and `users` (users, rounds, hole_scores, scorecard_scans, user_tees).

- `connection.py` — `DatabasePool` singleton for pool lifecycle
- `converters.py` — all row↔model conversion between DB rows and Pydantic objects
- `db_manager.py` — `DatabaseManager` facade composing repositories
- `sync_adapter.py` — `SyncCourseRepositoryAdapter` wraps async repo for sync `CourseRepository` protocol (uses `run_coroutine_threadsafe`; `loop` must be obtained BEFORE constructing the adapter)
- `repositories/course_repo.py` — CRUD for courses + fuzzy name search (pg_trgm) + `clone_course`; user_id-aware search/create
- `repositories/user_repo.py` — CRUD for users
- `repositories/round_repo.py` — CRUD for rounds, hole_scores, scorecard_scans; includes `update_hole_scores`
- `repositories/user_tee_repo.py` — CRUD for `users.user_tees`

**Schema source of truth:** `database/schema.sql`
**Migrations:** `database/migrations/` (incremental SQL files; 001 and 002 applied)

**Custom course design:**
- `user_id IS NULL` = master/global course (read-only for regular users)
- `user_id IS NOT NULL` = custom course owned by that user
- Partial unique indexes replace old `UNIQUE(name, location)`:
  - `idx_courses_unique_master`: `(lower(name), location) WHERE user_id IS NULL`
  - `idx_courses_unique_user`: `(lower(name), location, user_id) WHERE user_id IS NOT NULL`

### `frontend/` — React + TypeScript + Vite

Key files:
- `src/App.tsx` — routing + scan state (lifted here to persist across navigation)
- `src/lib/api.ts` — API client (`updateRound`, `cloneCourse`, `getCourses`, `searchCourses`, etc.)
- `src/types/scan.ts` — shared scan types/constants (kept out of ScanPage to avoid Fast Refresh warning)
- `src/pages/ScanPage.tsx` — upload → process → review scan flow; passes `result.round.course?.holes` as `course_holes` on save
- `src/pages/RoundDetailPage.tsx` — round detail view with editing
- `src/pages/CoursesPage.tsx` — course browser with clone/edit
- `src/components/round-detail/ScorecardGrid.tsx` — horizontal scorecard with To Par row; uses `effectivePar = hole?.par ?? score?.par_played`

**Confidence display:** only `strokes` fields count as actionable review items (not putts/fairway/gir). Null putts shows N/A when putts weren't recorded on the card.

### `analytics/` — Player stats and visualizations

Implemented. Exposes per-player analytics via `api/routers/stats.py`.

## Imports

```python
from models import Course, Hole, Tee, HoleScore, Round, User, UserTee
from database import DatabaseManager, DatabasePool, SyncCourseRepositoryAdapter
from llm import extract_scorecard, ExtractionStrategy, CourseRepository
from services.scan_service import resolve_course, build_hole_scores
```
