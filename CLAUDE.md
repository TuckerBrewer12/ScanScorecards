# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Golf scorecard app that scans physical scorecards (via LLM) and tracks rounds, courses, and player statistics. Python project using Pydantic v2 for data modeling and validation.

## Setup & Dependencies

```bash
pip install -r requirements.txt   # currently just pydantic>=2.0
pip freeze > requirements.txt     # run before pushing new dependencies
```

No test framework, linter, or build system is configured yet. Test files exist as empty placeholders in `tests/`.

## Architecture

### Core: `models/` — Pydantic v2 domain models

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

### Placeholder modules (not yet implemented)

- `database/` — DB manager and schema
- `llm/` — LLM-based scorecard extraction from images
- `analytics/` — stats and visualizations
- `data/` — sample course data

## Imports

```python
from models import Course, Hole, Tee, HoleScore, Round, User
```
