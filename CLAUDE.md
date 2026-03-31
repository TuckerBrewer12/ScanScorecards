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
- **User** — golfer: handicap (-10 to 54), `scoring_goal` (optional integer target score), contains Rounds

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
- `routers/users.py` — user management + user tee CRUD (`/api/users/{id}/tees`); `UpdateUserRequest` accepts `scoring_goal`
- `routers/stats.py` — player analytics endpoints; includes `GET /{user_id}/goal-report`
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
- `GET /api/stats/{user_id}/goal-report?limit=` — goal gap analysis + ranked savers

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
**Migrations:** `database/migrations/` (incremental SQL files; 001, 002, 003 applied)
- 001: `user_id` on `courses.courses`
- 002: `par_played`, `handicap_played`, `course_name_played`, `user_tee_id`, nullable `hole_id`
- 003: `scoring_goal SMALLINT` on `users.users`

**Custom course design:**
- `user_id IS NULL` = master/global course (read-only for regular users)
- `user_id IS NOT NULL` = custom course owned by that user
- Partial unique indexes replace old `UNIQUE(name, location)`:
  - `idx_courses_unique_master`: `(lower(name), location) WHERE user_id IS NULL`
  - `idx_courses_unique_user`: `(lower(name), location, user_id) WHERE user_id IS NOT NULL`

### `frontend/` — React + TypeScript + Vite

---

## UI Design System

### Philosophy
Clean, minimal, data-first. Premium/professional feel — refined spacing, subtle motion, semantic color. Not flashy; every visual element earns its place.

### Color Palette

**Primary:** `#2d7a3a` (forest green) — used for primary buttons, accents, section tints.

**Score type colors** (semantic across all charts + components):
- Eagle+: `#f59e0b` (amber)
- Birdie: `#059669` (emerald)
- Par: `#9ca3af` (gray)
- Bogey: `#ef4444` (red)
- Double: `#60a5fa` (blue)
- Triple: `#a78bfa` (purple)
- Quad+: `#6d28d9` (deep purple)

**UI semantic colors:**
- Success/GIR: `#059669`
- Danger: `#ef4444` / `#f87171`
- Neutral/grid: `#e5e7eb`
- Muted fill: `#e5e7eb`

**Backgrounds:**
- Page: `#f8faf8` (off-white)
- Card: `white` with `border-gray-100`
- Scoring section: `bg-gradient-to-b from-[#eef7f0]/70 to-[#f8faf8]`
- Putting section: `bg-gradient-to-b from-[#f0f5ff]/50 to-[#f8faf8]`
- Short game section: `bg-gradient-to-b from-[#fdf4ff]/50 to-[#f8faf8]`
- Sidebar: `linear-gradient(180deg, #1e3d25 0%, #152d1b 100%)`

**Par badge colors** (used in distance zone lists, pills):
- Par 3: bg `#ede9fe` / text `#6d28d9`
- Par 4: bg `#e0f2fe` / text `#0369a1`
- Par 5: bg `#dcfce7` / text `#15803d`

### Typography

Font: `"Inter", system-ui, -apple-system, sans-serif` with `-webkit-font-smoothing: antialiased`.

| Role | Classes |
|---|---|
| Page title | `text-3xl font-extrabold tracking-tight text-gray-900` |
| Section label | `text-[11px] font-bold text-primary/50 uppercase tracking-[0.18em]` |
| Card title | `text-sm font-semibold text-gray-800` |
| Subsection label | `text-xs font-medium text-gray-500 uppercase tracking-wide` |
| Body | `text-sm text-gray-600` |
| Caption / axis | `text-[10px] text-gray-400` |
| Hero stat | `text-2xl font-bold` (cards) / `text-6xl font-black` (best round) |

### Cards & Containers

**Standard chart card:**
```tsx
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
```

**Glassmorphic card / HUD:**
```tsx
<div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm">
```

**Tooltip:**
```tsx
<div className="bg-white/95 backdrop-blur-sm rounded-xl border border-gray-100 shadow-lg px-3 py-2.5 text-xs">
```

Rules: `rounded-2xl` for cards, `rounded-xl` for tooltips/small elements. Border always `border-gray-100`. Shadow always `shadow-sm` (heavier only on hover). Divide lists with `divide-y divide-gray-50`.

### Layout

- Analytics sections bleed to full width with `-mx-8 px-8 py-10` + colored `bg-gradient-to-b` backgrounds.
- Chart grids: `grid grid-cols-1 lg:grid-cols-2 gap-5`.
- Insight rows: `grid grid-cols-1 md:grid-cols-2 gap-3`.
- Stat row: `grid grid-cols-2 lg:grid-cols-5 gap-4`.
- Page-level padding: `p-5` cards, `p-6` chart cards, `px-4 py-3` list rows.

### Motion & Animation

All animation via `framer-motion`. Principles: fast enough to feel snappy, slow enough to register. Spring physics on hover; eased transitions for entrances.

**Scroll entrance (ScrollSection):**
```tsx
initial={{ opacity: 0, y: 36 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
```

**Hover spring (cards, stat pills):**
```tsx
whileHover={{ scale: 1.025, boxShadow: "0 10px 32px rgba(0,0,0,0.10)" }}
transition={{ type: "spring", stiffness: 360, damping: 28 }}
```

**Tooltip fade:**
```tsx
initial={{ opacity: 0, scale: 0.92, y: 4 }}
animate={{ opacity: 1, scale: 1, y: 0 }}
transition={{ duration: 0.15 }}
```

**SVG path draw (tracers, timeline):**
```tsx
initial={{ pathLength: 0, opacity: 0 }}
animate={{ pathLength: 1, opacity: 1 }}
transition={{ duration: 1.0–1.4, ease: "easeInOut" }}
```

**Staggered dot entrance:**
```tsx
transition={{ delay: Math.min(i * 0.004, 1.0), duration: 0.5, ease: "easeOut" }}
```

### SVG / Data Viz

Golf-native visualizations preferred over generic chart types where possible (see Range View). SVG components use `viewBox` with `overflow: visible`. D3 scales (`d3-scale`, `d3-shape`) for math; framer-motion for animation. Recharts used for trend/bar/area charts.

Common SVG patterns:
- Dashed reference lines: `strokeDasharray="4 5"`, `stroke="#e5e7eb"`
- Glow filter on positive outliers: `feGaussianBlur stdDeviation="2"` + feMerge
- Ground/fill gradients: `from #f1f5f9 to transparent`
- Chart tooltip: nearest-point detection on `onMouseMove`, dismissed on `onMouseLeave`

### Buttons

```tsx
// Primary (selected/active)
"bg-primary text-white shadow-sm"

// Default
"bg-white border border-gray-200 text-gray-600 hover:border-gray-300"

// Both
"px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
```

### Dark Mode

Implemented via `:root.dark` in `index.css`. Card bg: `#18191A`, borders: `#2a2d30`, text: `#f1f5f9` → `#9aa4b2`. Color-blind palette support via `getStoredColorBlindMode()` / `getColorBlindPalette()` in `src/lib/accessibility.ts` — always use `colorBlindPalette` overrides when rendering score colors in charts.

---

Key files:
- `src/App.tsx` — routing + scan state (lifted here to persist across navigation)
- `src/lib/api.ts` — API client (`updateRound`, `cloneCourse`, `getCourses`, `searchCourses`, `getGoalReport`, `updateUser` with `scoring_goal`, etc.)
- `src/types/scan.ts` — shared scan types/constants (kept out of ScanPage to avoid Fast Refresh warning)
- `src/types/analytics.ts` — analytics types including `GoalReport` and `GoalSaver`
- `src/pages/ScanPage.tsx` — upload → process → review scan flow; passes `result.round.course?.holes` as `course_holes` on save
- `src/pages/RoundDetailPage.tsx` — round detail view with editing
- `src/pages/CoursesPage.tsx` — course browser with clone/edit
- `src/pages/SuggestionsPage.tsx` — Peer Comparison page; hosts Goal Selector (7 thresholds: 100/95/90/85/80/75/72), GoalReportSection (saver bento grid), and peer comparison stats. Goals section is below the comparison UI.
- `src/pages/DashboardPage.tsx` — dashboard bento grid; includes goal widget (`lg:col-span-2`) showing progress bar + top saver insight
- `src/components/round-detail/ScorecardGrid.tsx` — horizontal scorecard with To Par row; uses `effectivePar = hole?.par ?? score?.par_played`
- `src/components/goals/GoalSaverCard.tsx` — bento card for a single goal saver (icon, stroke savings, gap%, headline, detail)

**Confidence display:** only `strokes` fields count as actionable review items (not putts/fairway/gir). Null putts shows N/A when putts weren't recorded on the card.

**Goal Engine design:**
- `scoring_goal` is stored as the threshold value (e.g. `89` means "break 90")
- "Achieved" = any single round with score ≤ `scoring_goal` (not average-based)
- `goal_report` returns `gap` (avg - goal), `on_track` bool, and ranked `savers[]`
- Each saver has: `type`, `strokes_saved`, `percentage_of_gap`, `headline`, `detail`, `data`

### `analytics/` — Player stats and visualizations

Implemented. Exposes per-player analytics via `api/routers/stats.py`.

- `analytics/stats.py` — all per-player stat functions (GIR, putting, scrambling, yardage buckets, score type distribution, course difficulty profile, etc.)
- `analytics/goals.py` — `goal_report(rounds, scoring_goal, home_course_rounds)` — computes gap to goal and ranks highest-ROI improvement areas ("savers"): three-putt bleed, blowup holes, achilles heel yardage zone, home course demon hole, GIR opportunity, scrambling opportunity, par 5 opportunity

## Imports

```python
from models import Course, Hole, Tee, HoleScore, Round, User, UserTee
from database import DatabaseManager, DatabasePool, SyncCourseRepositoryAdapter
from llm import extract_scorecard, ExtractionStrategy, CourseRepository
from services.scan_service import resolve_course, build_hole_scores
```
