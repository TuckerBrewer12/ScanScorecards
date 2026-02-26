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
from api.dependencies import get_db
from llm.scorecard_extractor import extract_scorecard, ExtractionResult
from llm.strategies import ExtractionStrategy
from models import Course, Hole, HoleScore, Round, Tee, UserTee

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
    tee_slope_rating: Optional[float] = None
    tee_course_rating: Optional[float] = None
    tee_yardages: Optional[dict] = None  # {hole_number_str: yardage} from extracted tee
    date: Optional[str] = None
    notes: Optional[str] = None
    hole_scores: list
    course_holes: Optional[list] = None


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

    Course resolution (4-tier):
      1. Master exists → use it
      2. No master, user has it → fill gaps from scan, use it
      3. No master, another user has it → fill gaps, promote to master, use it
      4. Nobody has it → create user-owned course, use it
    par_played on each HoleScore is populated from the resolved course + scan data.
    """
    try:
        # ── 4-tier course resolution ──────────────────────────────────────────
        # 1. Master exists → use it (authoritative, no writes needed)
        # 2. No master, current user has a course → fill gaps from scan, use it
        # 3. No master, another user has a course → fill gaps, promote to master
        # 4. Nobody has it → create a new user-owned course from scan data
        course = None
        course_id = None

        if req.course_name:
            # Tier 1: master only (no user_id → masters only)
            course = await db.courses.find_course_by_name(req.course_name, req.course_location)

            if not course:
                scan_holes = [
                    dict(h) if isinstance(h, dict) else h
                    for h in (req.course_holes or [])
                ]

                # Tier 2: current user's own courses
                course = await db.courses.find_user_course_by_name(
                    req.course_name, req.course_location, req.user_id
                )
                if course:
                    await db.courses.fill_course_gaps(
                        str(course.id), scan_holes,
                        req.tee_box, req.tee_slope_rating, req.tee_course_rating, req.tee_yardages,
                    )
                else:
                    # Tier 3: any other user's course → merge + promote to master
                    course = await db.courses.find_any_user_course_by_name(
                        req.course_name, req.course_location
                    )
                    if course:
                        await db.courses.fill_course_gaps(
                            str(course.id), scan_holes,
                            req.tee_box, req.tee_slope_rating, req.tee_course_rating, req.tee_yardages,
                        )
                        course = await db.courses.promote_to_master(str(course.id))
                    else:
                        # Tier 4: create new user-owned course from scan data
                        holes = [
                            Hole(
                                number=h.get("hole_number"),
                                par=h.get("par"),
                                handicap=h.get("handicap"),
                            )
                            for h in scan_holes if h.get("hole_number") is not None
                        ]
                        tees = []
                        if req.tee_box:
                            tee_yardages_int = {
                                int(k): v for k, v in (req.tee_yardages or {}).items() if v is not None
                            }
                            tees = [Tee(
                                color=req.tee_box,
                                slope_rating=req.tee_slope_rating,
                                course_rating=req.tee_course_rating,
                                hole_yardages=tee_yardages_int,
                            )]
                        new_course = Course(
                            name=req.course_name,
                            location=req.course_location,
                            holes=holes,
                            tees=tees,
                        )
                        course = await db.courses.create_course(new_course, user_id=req.user_id)

            if course:
                course_id = course.id

        # Build par/handicap lookup: layer course holes (authoritative) then fill
        # any remaining gaps from the current scan's course_holes.
        par_by_hole: dict = {}
        handicap_by_hole: dict = {}
        if course and course.holes:
            for hole in course.holes:
                if hole.number is not None:
                    if hole.par is not None:
                        par_by_hole[hole.number] = hole.par
                    if hole.handicap is not None:
                        handicap_by_hole[hole.number] = hole.handicap
        if req.course_holes:
            for h in req.course_holes:
                hole_num = h.get("hole_number") if isinstance(h, dict) else getattr(h, "hole_number", None)
                par = h.get("par") if isinstance(h, dict) else getattr(h, "par", None)
                handicap = h.get("handicap") if isinstance(h, dict) else getattr(h, "handicap", None)
                if hole_num is not None:
                    if par is not None and hole_num not in par_by_hole:
                        par_by_hole[hole_num] = par
                    if handicap is not None and hole_num not in handicap_by_hole:
                        handicap_by_hole[hole_num] = handicap

        # Build hole scores with par_played populated
        hole_scores = []
        for hs_data in req.hole_scores:
            hs_dict = dict(hs_data) if isinstance(hs_data, dict) else hs_data
            hole_num = hs_dict.get("hole_number")
            if hole_num is not None:
                if not hs_dict.get("par_played"):
                    hs_dict["par_played"] = par_by_hole.get(hole_num)
                if not hs_dict.get("handicap_played"):
                    hs_dict["handicap_played"] = handicap_by_hole.get(hole_num)
            hole_scores.append(HoleScore(**hs_dict))

        # Build round — store course_name_played when no master course found
        round_ = Round(
            course=course,
            tee_box=req.tee_box,
            date=req.date,
            hole_scores=hole_scores,
            notes=req.notes,
            course_name_played=req.course_name if not course else None,
        )

        # Auto-create user_tee from extracted tee data when no master tee is available
        user_tee_id = None
        if req.tee_box and req.tee_yardages and not course_id:
            user_tee = UserTee(
                user_id=req.user_id,
                name=req.tee_box,
                slope_rating=req.tee_slope_rating,
                course_rating=req.tee_course_rating,
                hole_yardages={int(k): v for k, v in req.tee_yardages.items() if v is not None},
            )
            created_tee = await db.user_tees.create_user_tee(user_tee)
            user_tee_id = created_tee.id

        saved = await db.rounds.create_round(round_, req.user_id, course_id=course_id, user_tee_id=user_tee_id)

        return {"id": saved.id, "total_score": saved.calculate_total_score()}

    except Exception as e:
        import traceback
        print(f"Save round error: {traceback.format_exc()}")
        raise HTTPException(500, f"Save failed: {type(e).__name__}: {str(e)}")
