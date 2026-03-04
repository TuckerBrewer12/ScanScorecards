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
from api.dependencies import get_db
from api.request_models import SaveRoundRequest
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
        logger.exception("Scan extraction error")
        raise HTTPException(500, f"Extraction failed: {type(e).__name__}: {str(e) or repr(e)}")
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@router.post("/save")
async def save_round(
    req: SaveRoundRequest,
    db: DatabaseManager = Depends(get_db),
):
    """Save a reviewed/edited round to the database."""
    try:
        service = ScanService(db)
        saved = await service.save_reviewed_scan(req)
        return {"id": saved.id, "total_score": saved.calculate_total_score()}
    except Exception as e:
        logger.exception("Save round error")
        raise HTTPException(500, f"Save failed: {type(e).__name__}: {str(e)}")
