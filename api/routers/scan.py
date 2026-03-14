"""Scorecard scan/upload API endpoints."""

import asyncio
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

logger = logging.getLogger(__name__)

from database.db_manager import DatabaseManager
from database.sync_adapter import SyncCourseRepositoryAdapter
from api.dependencies import get_current_user, get_db
from api.request_models import SaveRoundRequest
from models import User
from llm.scorecard_extractor import extract_scorecard, ExtractionResult
from llm.strategies import ExtractionStrategy
from services.scan_service import ScanService

router = APIRouter()


class ScanResponse(BaseModel):
    """Response from scorecard extraction."""
    round: dict
    confidence: dict
    fields_needing_review: list


@router.post("/extract")
async def extract_scan(
    file: UploadFile = File(...),
    user_context: Optional[str] = Form(None),
    strategy: str = Form("smart"),
    course_id: Optional[str] = Form(None),
    scoring_format: Optional[str] = Form(None),  # "to_par" | "strokes" | None (auto-detect)
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a scorecard image, run LLM extraction, return results for review."""
    logger.info(
        "Scan extract request received: filename=%s strategy=%s course_id=%s scoring_format=%s user_id=%s",
        file.filename,
        strategy,
        course_id,
        scoring_format,
        current_user.id,
    )
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
        # Resolve scoring format flag: "to_par" → True, "strokes" → False, else None
        to_par_scoring: Optional[bool] = None
        if scoring_format == "to_par":
            to_par_scoring = True
        elif scoring_format == "strokes":
            to_par_scoring = False

        # Fast scan: course pre-selected by user — use SCORES_ONLY with Flash
        course_model = None
        if course_id:
            course_model = await db.courses.get_course(course_id)
            if course_model is None:
                raise HTTPException(404, f"Course {course_id} not found")
            strat = ExtractionStrategy.SCORES_ONLY
        else:
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
                course=course_model,
                course_repo=course_repo,
                to_par_scoring=to_par_scoring,
                player_name=user_context or None,
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
        logger.exception("Scan extraction error")
        raise HTTPException(500, f"Extraction failed: {type(e).__name__}: {str(e) or repr(e)}")
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@router.post("/save")
async def save_round(
    req: SaveRoundRequest,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save a reviewed/edited round to the database."""
    try:
        req.user_id = str(current_user.id)
        service = ScanService(db)
        saved = await service.save_reviewed_scan(req)
        return {"id": saved.id, "total_score": saved.calculate_total_score()}
    except Exception as e:
        logger.exception("Save round error")
        raise HTTPException(500, f"Save failed: {type(e).__name__}: {str(e)}")
