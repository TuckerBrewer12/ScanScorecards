"""Scorecard scan/upload API endpoints."""

import asyncio
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from database.db_manager import DatabaseManager
from database.sync_adapter import SyncCourseRepositoryAdapter
from database.exceptions import DuplicateError
from api.dependencies import get_db
from llm.scorecard_extractor import extract_scorecard, ExtractionResult
from llm.strategies import ExtractionStrategy
from models import Course, Hole, Tee, HoleScore, Round

router = APIRouter()


class ScanResponse(BaseModel):
    """Response from scorecard extraction."""
    round: dict
    confidence: dict
    fields_needing_review: list


class CourseHoleInput(BaseModel):
    """Hole data for auto-creating a custom course."""
    hole_number: int
    par: Optional[int] = None
    handicap: Optional[int] = None


class SaveRoundRequest(BaseModel):
    """Request to save a reviewed/edited round."""
    user_id: str
    course_name: Optional[str] = None
    course_location: Optional[str] = None
    tee_box: Optional[str] = None
    date: Optional[str] = None
    notes: Optional[str] = None
    hole_scores: list  # List of {hole_number, strokes, putts, fairway_hit, green_in_regulation}
    # Hole data from extraction — used to auto-create a custom course if not found in DB
    course_holes: Optional[list] = None  # List of CourseHoleInput dicts


@router.post("/extract")
async def extract_scan(
    file: UploadFile = File(...),
    user_context: Optional[str] = Form(None),
    strategy: str = Form("smart"),
    db: DatabaseManager = Depends(get_db),
):
    """Upload a scorecard image, run LLM extraction, return results for review."""
    # Validate file type
    suffix = Path(file.filename or "upload.jpg").suffix.lower()
    allowed = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".pdf"}
    if suffix not in allowed:
        raise HTTPException(400, f"Unsupported file type: {suffix}. Allowed: {', '.join(allowed)}")

    # Save upload to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        # Map strategy string to enum
        strat = ExtractionStrategy(strategy) if strategy in ("full", "scores_only", "smart") else ExtractionStrategy.FULL

        # Run sync extraction in thread pool to avoid blocking
        loop = asyncio.get_event_loop()

        # Build course repo for SMART strategy — pass the running loop so DB
        # calls from the extractor thread are scheduled on it (uses its pool)
        course_repo = SyncCourseRepositoryAdapter(db.courses, loop)
        result: ExtractionResult = await loop.run_in_executor(
            None,
            lambda: extract_scorecard(
                tmp_path,
                user_context=user_context,
                include_raw_response=False,
                strategy=strat,
                course_repo=course_repo,
            ),
        )

        # Serialize the round and confidence for the frontend
        round_data = result.round.model_dump(mode="json")
        confidence_data = result.confidence.model_dump(mode="json")

        return ScanResponse(
            round=round_data,
            confidence=confidence_data,
            fields_needing_review=result.confidence.fields_needing_review,
        )

    except FileNotFoundError:
        raise HTTPException(400, "Uploaded file could not be processed")
    except EnvironmentError as e:
        raise HTTPException(500, str(e))
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"Scan extraction error: {tb}")
        raise HTTPException(500, f"Extraction failed: {type(e).__name__}: {str(e) or repr(e)}")
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@router.post("/save")
async def save_round(
    req: SaveRoundRequest,
    db: DatabaseManager = Depends(get_db),
):
    """Save a reviewed/edited round to the database.

    If the course is not found in the DB and course_holes are provided,
    a custom course is automatically created for the user.
    """
    try:
        # Find or create course
        course = None
        course_id = None

        if req.course_name:
            course = await db.courses.find_course_by_name(
                req.course_name, req.course_location, user_id=req.user_id
            )
            if course:
                course_id = course.id
            elif req.course_holes:
                # Auto-create a custom course from the extracted hole data
                holes = [
                    Hole(
                        number=h["hole_number"],
                        par=h.get("par"),
                        handicap=h.get("handicap"),
                    )
                    for h in req.course_holes
                    if h.get("hole_number") is not None
                ]
                tees = [Tee(color=req.tee_box)] if req.tee_box else []
                new_course = Course(
                    name=req.course_name,
                    location=req.course_location,
                    holes=holes,
                    tees=tees,
                )
                try:
                    course = await db.courses.create_course(new_course, user_id=req.user_id)
                    course_id = course.id
                except DuplicateError:
                    # User already has a custom course with this name (e.g. duplicate scan)
                    course = await db.courses.find_course_by_name(
                        req.course_name, req.course_location, user_id=req.user_id
                    )
                    if course:
                        course_id = course.id

        # Build hole scores
        hole_scores = [HoleScore(**hs) for hs in req.hole_scores]

        # Build round
        round_ = Round(
            course=course,
            tee_box=req.tee_box,
            date=req.date,
            hole_scores=hole_scores,
            notes=req.notes,
        )

        # Save to database
        saved = await db.rounds.create_round(round_, req.user_id, course_id=course_id)

        return {"id": saved.id, "total_score": saved.calculate_total_score()}

    except Exception as e:
        import traceback
        print(f"Save round error: {traceback.format_exc()}")
        raise HTTPException(500, f"Save failed: {type(e).__name__}: {str(e)}")
