# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Golf scorecard app that scans physical scorecards (via LLM) and tracks rounds, courses, and player statistics. Python project using Pydantic v2 for data modeling, asyncpg for database access, and Google Gemini for scorecard OCR.

## Setup & Dependencies

```bash
pip install -r requirements.txt   # pydantic, google-genai, python-dotenv, asyncpg
pip freeze > requirements.txt     # run before pushing new dependencies
```

Requires a `.env` file with `GOOGLE_API_KEY` for LLM extraction.

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
- **HoleScore** — one player's score on a hole: strokes, putts, fairway/GIR stats. Validates putts ≤ strokes. Has `to_par(par)` and `get_score_type(par)` (needs par passed from Round)
- **Round** — complete round: references a Course + tee_box color string. Contains ordered HoleScores. Calculation methods for totals, front/back nine, score-to-par, score types
- **User** — golfer: handicap (-10 to 54), contains Rounds

**Key design decisions:**
- All fields are `Optional` to handle incomplete/partial scanned data
- Lists (holes, tees, hole_scores) are stored sorted by hole number
- "Get or calculate" pattern: methods like `get_par()`, `get_total_putts()` return the stored value if set, otherwise calculate from child objects
- Round connects to Course for par-based calculations — `HoleScore.get_score_type()` requires par passed in

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

### `database/` — Async PostgreSQL layer (asyncpg)

Two DB schemas: `courses` (courses, holes, tees, tee_yardages) and `users` (users, rounds, hole_scores, scorecard_scans).

- `connection.py` — `DatabasePool` singleton for pool lifecycle
- `converters.py` — all row↔model conversion between DB rows and Pydantic objects
- `db_manager.py` — `DatabaseManager` facade composing three repositories
- `sync_adapter.py` — `SyncCourseRepositoryAdapter` wraps async repo for sync `CourseRepository` protocol
- `repositories/course_repo.py` — CRUD for courses + fuzzy name search (pg_trgm)
- `repositories/user_repo.py` — CRUD for users
- `repositories/round_repo.py` — CRUD for rounds, hole_scores, scorecard_scans

### Not yet implemented

- `analytics/` — stats and visualizations
- `data/` — sample course data

## Imports

```python
from models import Course, Hole, Tee, HoleScore, Round, User
from database import DatabaseManager, DatabasePool, SyncCourseRepositoryAdapter
from llm import extract_scorecard, ExtractionStrategy, CourseRepository
```
