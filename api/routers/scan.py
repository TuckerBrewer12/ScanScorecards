"""Scorecard scan/upload API endpoints."""

import asyncio
import math
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
import numpy as np
from pydantic import BaseModel
from PIL import Image, ImageOps, ImageEnhance

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

OCR_LONG_EDGE_TARGET = 1800
OCR_JPEG_QUALITY = 75
BW_FALLBACK_TRIGGER = 0.65
BW_FALLBACK_MIN_IMPROVEMENT = 0.03


class ScanResponse(BaseModel):
    """Response from scorecard extraction."""
    round: dict
    confidence: dict
    fields_needing_review: list


def _normalize_angle_deg(angle: float) -> float:
    """Normalize angle to [-90, 90)."""
    while angle >= 90.0:
        angle -= 180.0
    while angle < -90.0:
        angle += 180.0
    return angle


def _deskew_scorecard(img: Image.Image) -> tuple[Image.Image, bool, float]:
    """
    Conservative deskew using dominant edge orientation.

    Only applies small-angle correction and falls back safely if confidence is low.
    """
    gray = np.asarray(img.convert("L"), dtype=np.float32)
    if gray.shape[0] < 60 or gray.shape[1] < 60:
        return img, False, 0.0

    gy, gx = np.gradient(gray)
    mag = np.hypot(gx, gy)
    thresh = np.percentile(mag, 90)
    edge_mask = mag > thresh
    ys, xs = np.where(edge_mask)
    if ys.size < 500:
        return img, False, 0.0

    pts = np.stack([xs.astype(np.float64), ys.astype(np.float64)], axis=1)
    pts -= pts.mean(axis=0, keepdims=True)

    cov = np.cov(pts, rowvar=False)
    eigvals, eigvecs = np.linalg.eigh(cov)
    major = eigvecs[:, int(np.argmax(eigvals))]
    angle = math.degrees(math.atan2(float(major[1]), float(major[0])))
    angle = _normalize_angle_deg(angle)

    # Snap to nearest cardinal axis and correct only small skew deltas.
    nearest_axis = round(angle / 90.0) * 90.0
    delta = _normalize_angle_deg(angle - nearest_axis)
    if abs(delta) < 0.8 or abs(delta) > 12.0:
        return img, False, 0.0

    bg = tuple(int(x) for x in np.median(np.asarray(img).reshape(-1, 3), axis=0))
    rotated = img.rotate(-delta, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=bg)
    return rotated, True, float(delta)


def _crop_to_scorecard_region(img: Image.Image) -> tuple[Image.Image, bool]:
    """
    Conservative background crop:
    - Estimate background from border pixels.
    - Find foreground bbox by color distance.
    - Apply only when crop looks safe; otherwise keep full image.
    """
    arr = np.asarray(img)
    if arr.ndim != 3 or arr.shape[0] < 50 or arr.shape[1] < 50:
        return img, False

    h, w, _ = arr.shape
    border = max(4, int(min(h, w) * 0.03))
    top = arr[:border, :, :]
    bottom = arr[h - border :, :, :]
    left = arr[:, :border, :]
    right = arr[:, w - border :, :]
    border_pixels = np.concatenate(
        [top.reshape(-1, 3), bottom.reshape(-1, 3), left.reshape(-1, 3), right.reshape(-1, 3)],
        axis=0,
    )
    bg = np.median(border_pixels, axis=0)

    # Manhattan distance from estimated background color.
    dist = np.abs(arr.astype(np.int16) - bg.astype(np.int16)).sum(axis=2)
    mask = dist > 25
    ys, xs = np.where(mask)
    if ys.size == 0 or xs.size == 0:
        return img, False

    x1, x2 = int(xs.min()), int(xs.max())
    y1, y2 = int(ys.min()), int(ys.max())

    # Add small padding to avoid clipping edges/text near the border.
    pad_x = max(8, int(w * 0.04))
    pad_y = max(8, int(h * 0.04))
    x1 = max(0, x1 - pad_x)
    y1 = max(0, y1 - pad_y)
    x2 = min(w - 1, x2 + pad_x)
    y2 = min(h - 1, y2 + pad_y)

    crop_w = x2 - x1 + 1
    crop_h = y2 - y1 + 1
    area_ratio = (crop_w * crop_h) / float(w * h)

    # Safety gates: only keep moderate crops; skip extreme/low-confidence crops.
    if area_ratio < 0.45 or area_ratio > 0.98:
        return img, False
    if crop_w < int(w * 0.6) or crop_h < int(h * 0.6):
        return img, False

    return img.crop((x1, y1, x2 + 1, y2 + 1)), True


def _normalize_upload_for_ocr(path: Path) -> Path:
    """
    Normalize uploaded images to JPEG for faster, consistent OCR payloads.

    Notes:
    - PDF: attempts to render page 1 to JPEG, then applies the same preprocessing.
      Falls back to original PDF if rendering is unavailable.
    - If normalization fails (e.g., unsupported HEIC decoder), fall back to original.
    """
    is_pdf = path.suffix.lower() == ".pdf"
    try:
        with Image.open(path) as img:
            if is_pdf:
                # First page only for scorecard PDFs.
                try:
                    img.seek(0)
                except Exception:
                    pass
            # Honor EXIF orientation before re-encoding.
            img = ImageOps.exif_transpose(img)
            if img.mode != "RGB":
                img = img.convert("RGB")
            original_size = img.size
            img, cropped = _crop_to_scorecard_region(img)
            img, deskewed, deskew_angle = _deskew_scorecard(img)
            if deskewed:
                img, _ = _crop_to_scorecard_region(img)
            # Resize large images before OCR (keep aspect ratio, do not upscale).
            width, height = img.size
            long_edge = max(width, height)
            if long_edge > OCR_LONG_EDGE_TARGET:
                scale = OCR_LONG_EDGE_TARGET / float(long_edge)
                new_size = (max(1, int(width * scale)), max(1, int(height * scale)))
                img = img.resize(new_size, Image.Resampling.LANCZOS)
            # Adaptive contrast normalization (conservative):
            # grayscale -> autocontrast -> mild contrast boost.
            gray = img.convert("L")
            gray = ImageOps.autocontrast(gray, cutoff=1)
            gray = ImageEnhance.Contrast(gray).enhance(1.15)
            img = gray.convert("RGB")
            # Explicitly strip metadata by creating a fresh pixel-only image.
            # This prevents EXIF/ICC/comment payloads from carrying into OCR input.
            stripped = Image.new("RGB", img.size)
            stripped.paste(img)

            with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as out:
                normalized_path = Path(out.name)
            stripped.save(
                normalized_path,
                format="JPEG",
                quality=OCR_JPEG_QUALITY,
                optimize=True,
                progressive=True,
                exif=b"",
                icc_profile=None,
            )
            logger.info(
                "OCR preprocess image: source=%s original=%sx%s cropped=%s deskewed=%s angle=%.2f resized_to=%sx%s",
                "pdf" if is_pdf else "image",
                original_size[0],
                original_size[1],
                cropped,
                deskewed,
                deskew_angle,
                stripped.size[0],
                stripped.size[1],
            )
            return normalized_path
    except Exception as e:
        logger.warning(
            "Image normalization failed; using original upload. file=%s source=%s err=%s",
            path.name,
            "pdf" if is_pdf else "image",
            e,
        )
        return path


def _build_bw_fallback_variant(path: Path) -> Optional[Path]:
    """
    Build a high-contrast B/W variant for low-confidence retry.

    Returns None if variant generation fails.
    """
    if path.suffix.lower() == ".pdf":
        return None

    try:
        with Image.open(path) as img:
            gray = img.convert("L")
            gray = ImageOps.autocontrast(gray, cutoff=1)
            arr = np.asarray(gray, dtype=np.uint8)
            # Simple dynamic threshold around mean intensity.
            thr = int(np.clip(arr.mean(), 100, 180))
            bw = gray.point(lambda p: 255 if p >= thr else 0, mode="1").convert("RGB")

            with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as out:
                out_path = Path(out.name)
            bw.save(
                out_path,
                format="JPEG",
                quality=OCR_JPEG_QUALITY,
                optimize=True,
                progressive=True,
                exif=b"",
                icc_profile=None,
            )
            return out_path
    except Exception as e:
        logger.warning("B/W fallback generation failed; skipping. file=%s err=%s", path.name, e)
        return None


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
        original_tmp_path = Path(tmp.name)

    ocr_path = _normalize_upload_for_ocr(original_tmp_path)
    logger.info(
        "Scan preprocessing complete: original=%s ocr_input=%s normalized=%s",
        original_tmp_path.name,
        ocr_path.name,
        ocr_path != original_tmp_path,
    )

    bw_fallback_path: Optional[Path] = None
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
        def run_extract(input_path: Path) -> ExtractionResult:
            return extract_scorecard(
                str(input_path),
                user_context=user_context,
                include_raw_response=False,
                strategy=strat,
                course=course_model,
                course_repo=course_repo,
                to_par_scoring=to_par_scoring,
                player_name=user_context or None,
            )

        result: ExtractionResult = await loop.run_in_executor(None, lambda: run_extract(ocr_path))

        # Conditional B/W fallback retry only for low-confidence results.
        if result.confidence.overall < BW_FALLBACK_TRIGGER:
            bw_fallback_path = _build_bw_fallback_variant(ocr_path)
            if bw_fallback_path is not None:
                logger.info(
                    "Low confidence %.2f; retrying with B/W fallback image.",
                    result.confidence.overall,
                )
                fallback_result: ExtractionResult = await loop.run_in_executor(
                    None,
                    lambda: run_extract(bw_fallback_path),  # type: ignore[arg-type]
                )
                improvement = fallback_result.confidence.overall - result.confidence.overall
                if improvement >= BW_FALLBACK_MIN_IMPROVEMENT:
                    logger.info(
                        "B/W fallback selected: confidence improved by %.2f (%.2f -> %.2f).",
                        improvement,
                        result.confidence.overall,
                        fallback_result.confidence.overall,
                    )
                    result = fallback_result
                else:
                    logger.info(
                        "B/W fallback discarded: improvement %.2f below threshold %.2f.",
                        improvement,
                        BW_FALLBACK_MIN_IMPROVEMENT,
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
        if bw_fallback_path is not None:
            bw_fallback_path.unlink(missing_ok=True)
        ocr_path.unlink(missing_ok=True)
        if ocr_path != original_tmp_path:
            original_tmp_path.unlink(missing_ok=True)


@router.post("/save")
async def save_round(
    req: SaveRoundRequest,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save a reviewed/edited round to the database."""
    try:
        req.user_id = str(current_user.id)
        logger.info(
            "Scan save request received: user_id=%s course_id=%s external_course_id=%s course_name=%s",
            req.user_id,
            req.course_id,
            req.external_course_id,
            req.course_name,
        )
        service = ScanService(db)
        saved = await service.save_reviewed_scan(req)
        return {"id": saved.id, "total_score": saved.calculate_total_score()}
    except Exception as e:
        logger.exception("Save round error")
        raise HTTPException(500, f"Save failed: {type(e).__name__}: {str(e)}")
