"""Scorecard scan/upload API endpoints."""

import hashlib
import math
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
import numpy as np
from pydantic import BaseModel
from PIL import Image, ImageOps, ImageEnhance

logger = logging.getLogger("uvicorn.error")

from database.db_manager import DatabaseManager
from api.dependencies import get_current_user, get_db
from api.request_models import SaveRoundRequest
from models import User
from services.mistral_ocr_service import MistralOCRService
from services.mistral_scorecard_parser import ParsedScorecardRows, parse_mistral_scorecard_rows
from services.scan_service import ScanService

router = APIRouter()

OCR_LONG_EDGE_TARGET = 1800
OCR_JPEG_QUALITY = 75
BW_FALLBACK_TRIGGER = 0.65
BW_FALLBACK_MIN_IMPROVEMENT = 0.03
PREPROCESS_CACHE_VERSION = "v1"
PREPROCESS_CACHE_DIR = Path(tempfile.gettempdir()) / "scanscore_ocr_cache"
MISTRAL_OCR_MODEL = os.environ.get("MISTRAL_OCR_MODEL") or "mistral-ocr-latest"


class ScanResponse(BaseModel):
    """Response from scorecard extraction."""
    round: dict
    confidence: dict
    fields_needing_review: list


def _confidence_level(score: float) -> str:
    if score >= 0.85:
        return "high"
    if score >= 0.65:
        return "medium"
    if score >= 0.4:
        return "low"
    return "very_low"


def _build_confidence_payload(
    hole_scores: List[Dict],
    fields_needing_review: List[str],
) -> Dict:
    hole_conf = []
    present = 0
    for hs in hole_scores:
        hole_num = hs.get("hole_number")
        strokes = hs.get("strokes")
        putts = hs.get("putts")
        gir = hs.get("green_in_regulation")
        strokes_conf = 0.9 if strokes is not None else 0.2
        putts_conf = 0.85 if putts is not None else 0.25
        gir_conf = 0.8 if gir is not None else 0.3
        overall = min(strokes_conf, putts_conf)
        if strokes is not None:
            present += 1
        hole_conf.append(
            {
                "hole_number": hole_num,
                "fields": {
                    "strokes": {
                        "final_confidence": strokes_conf,
                        "level": _confidence_level(strokes_conf),
                        "validation_flags": [],
                    },
                    "putts": {
                        "final_confidence": putts_conf,
                        "level": _confidence_level(putts_conf),
                        "validation_flags": [],
                    },
                    "green_in_regulation": {
                        "final_confidence": gir_conf,
                        "level": _confidence_level(gir_conf),
                        "validation_flags": [],
                    },
                },
                "overall": overall,
                "level": _confidence_level(overall),
            }
        )

    overall = present / len(hole_scores) if hole_scores else 0.0
    # Penalize by unresolved warnings.
    overall = max(0.0, overall - min(0.5, len(fields_needing_review) * 0.02))
    return {
        "overall": overall,
        "level": _confidence_level(overall),
        "hole_scores": hole_conf,
    }


def _build_round_from_parsed_rows(
    parsed: ParsedScorecardRows,
    *,
    course_model: Optional[object],
    to_par_scoring: Optional[bool],
) -> tuple[Dict, List[str]]:
    fields_needing_review: List[str] = list(parsed.warnings)

    known_course = course_model is not None
    hole_count = 18

    # Known-course metadata from DB (local course object).
    course_name = None
    course_location = None
    course_par = None
    course_holes: List[Dict] = []
    course_tees: List[Dict] = []
    hole_par_lookup: Dict[int, Optional[int]] = {}

    if known_course:
        course_name = getattr(course_model, "name", None)
        course_location = getattr(course_model, "location", None)
        course_par = getattr(course_model, "par", None)
        model_holes = getattr(course_model, "holes", []) or []
        if model_holes:
            hole_count = min(18, len(model_holes))
        for i in range(1, hole_count + 1):
            hole_obj = next((h for h in model_holes if getattr(h, "number", None) == i), None)
            p = getattr(hole_obj, "par", None) if hole_obj is not None else None
            hcp = getattr(hole_obj, "handicap", None) if hole_obj is not None else None
            hole_par_lookup[i] = p
            course_holes.append({"number": i, "par": p})
            if hcp is not None:
                course_holes[-1]["handicap"] = hcp
        for tee in (getattr(course_model, "tees", []) or []):
            yardages = getattr(tee, "hole_yardages", {}) or {}
            course_tees.append(
                {
                    "color": getattr(tee, "color", None),
                    "slope_rating": getattr(tee, "slope_rating", None),
                    "course_rating": getattr(tee, "course_rating", None),
                    "hole_yardages": {str(k): v for k, v in yardages.items() if v is not None},
                }
            )
    else:
        # Unknown-course path uses parsed OCR rows.
        course_name = parsed.course_name
        for i in range(1, hole_count + 1):
            handicap = parsed.handicap_row[i - 1] if i - 1 < len(parsed.handicap_row) else None
            course_holes.append({"number": i, "par": None, "handicap": handicap})
            hole_par_lookup[i] = None
        for tr in parsed.tee_rows:
            yardage_map = {
                str(i + 1): y
                for i, y in enumerate(tr.yardages[:hole_count])
                if y is not None
            }
            course_tees.append(
                {
                    "color": tr.label,
                    "slope_rating": None,
                    "course_rating": None,
                    "hole_yardages": yardage_map,
                }
            )

    score_vals = list(parsed.score_row[:hole_count])
    while len(score_vals) < hole_count:
        score_vals.append(None)
    putt_vals = list(parsed.putts_row[:hole_count])
    while len(putt_vals) < hole_count:
        putt_vals.append(None)
    gir_vals = list(parsed.gir_row[:hole_count])
    while len(gir_vals) < hole_count:
        gir_vals.append(None)
    shots_vals = list(parsed.shots_to_green_row[:hole_count])
    while len(shots_vals) < hole_count:
        shots_vals.append(None)

    effective_to_par = to_par_scoring if to_par_scoring is not None else (parsed.score_to_par_hint is True)

    hole_scores: List[Dict] = []
    for i in range(1, hole_count + 1):
        raw_score = score_vals[i - 1]
        if (
            effective_to_par is True
            and raw_score == 1
            and shots_vals[i - 1] is not None
            and putt_vals[i - 1] is not None
            and hole_par_lookup.get(i) is not None
        ):
            # OCR can miss the minus sign and read "-1" as "1".
            # Use shots+putts vs par to disambiguate when possible.
            est = (shots_vals[i - 1] + putt_vals[i - 1]) - hole_par_lookup[i]  # type: ignore[index]
            if est in (-1, 1):
                if est != raw_score:
                    fields_needing_review.append(
                        f"Hole {i} adjusted to-par sign using shots+putts consistency"
                    )
                raw_score = est

        strokes: Optional[int]
        if raw_score is None:
            strokes = None
            fields_needing_review.append(f"Hole {i} strokes missing")
        elif effective_to_par is True:
            par_i = hole_par_lookup.get(i)
            if par_i is None:
                strokes = None
                fields_needing_review.append(
                    f"Hole {i} cannot convert to-par score without known par"
                )
            else:
                converted = par_i + raw_score
                strokes = converted if 1 <= converted <= 15 else None
        else:
            strokes = raw_score if 1 <= raw_score <= 15 else None

        putts = putt_vals[i - 1]
        if putts is not None and not (0 <= putts <= 10):
            putts = None
            fields_needing_review.append(f"Hole {i} putts out of range")
        if putts is not None and strokes is not None and putts > strokes:
            putts = None
            fields_needing_review.append(f"Hole {i} putts exceed strokes")

        gir_val = gir_vals[i - 1]
        if gir_val is None and shots_vals[i - 1] is not None and hole_par_lookup.get(i) is not None:
            # Derive GIR from shots-to-green row when present:
            # GIR if reached green in <= par-2 strokes.
            par_i = hole_par_lookup[i]  # guarded above
            if par_i is not None:
                gir_val = shots_vals[i - 1] <= max(1, par_i - 2)

        hole_scores.append(
            {
                "hole_number": i,
                "strokes": strokes,
                "putts": putts,
                "fairway_hit": None,
                "green_in_regulation": gir_val,
            }
        )

    round_payload = {
        "course": {
            "name": course_name,
            "location": course_location,
            "par": course_par,
            "holes": course_holes,
            "tees": course_tees,
        },
        "tee_box": None,
        "date": None,
        "hole_scores": hole_scores,
        "notes": None,
    }
    return round_payload, fields_needing_review


def _normalize_angle_deg(angle: float) -> float:
    """Normalize angle to [-90, 90)."""
    while angle >= 90.0:
        angle -= 180.0
    while angle < -90.0:
        angle += 180.0
    return angle


def _get_preprocess_cache_path(upload_digest: str) -> Path:
    PREPROCESS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    key = f"{PREPROCESS_CACHE_VERSION}_le{OCR_LONG_EDGE_TARGET}_q{OCR_JPEG_QUALITY}_{upload_digest}"
    return PREPROCESS_CACHE_DIR / f"{key}.jpg"


def _save_jpeg(path: Path, img: Image.Image) -> None:
    img.save(
        path,
        format="JPEG",
        quality=OCR_JPEG_QUALITY,
        optimize=True,
        progressive=True,
        exif=b"",
        icc_profile=None,
    )


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


def _normalize_upload_for_ocr(path: Path, upload_digest: str) -> tuple[Path, bool]:
    """
    Normalize uploaded images to JPEG for faster, consistent OCR payloads.

    Notes:
    - PDF: attempts to render page 1 to JPEG, then applies the same preprocessing.
      Falls back to original PDF if rendering is unavailable.
    - If normalization fails (e.g., unsupported HEIC decoder), fall back to original.
    """
    cache_path = _get_preprocess_cache_path(upload_digest)
    if cache_path.exists():
        logger.info(
            "OCR preprocess cache hit: path=%s size_bytes=%s",
            cache_path.name,
            cache_path.stat().st_size if cache_path.exists() else None,
        )
        return cache_path, True

    is_pdf = path.suffix.lower() == ".pdf"
    t0 = time.perf_counter()
    try:
        with Image.open(path) as img:
            t_open = time.perf_counter()
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
            t_orient = time.perf_counter()
            original_size = img.size
            img, cropped = _crop_to_scorecard_region(img)
            t_crop1 = time.perf_counter()
            img, deskewed, deskew_angle = _deskew_scorecard(img)
            if deskewed:
                img, _ = _crop_to_scorecard_region(img)
            t_deskew = time.perf_counter()
            # Resize large images before OCR (keep aspect ratio, do not upscale).
            width, height = img.size
            long_edge = max(width, height)
            if long_edge > OCR_LONG_EDGE_TARGET:
                scale = OCR_LONG_EDGE_TARGET / float(long_edge)
                new_size = (max(1, int(width * scale)), max(1, int(height * scale)))
                img = img.resize(new_size, Image.Resampling.LANCZOS)
            t_resize = time.perf_counter()
            # Adaptive contrast normalization (conservative):
            # grayscale -> autocontrast -> mild contrast boost.
            gray = img.convert("L")
            gray = ImageOps.autocontrast(gray, cutoff=1)
            gray = ImageEnhance.Contrast(gray).enhance(1.15)
            img = gray.convert("RGB")
            t_contrast = time.perf_counter()
            # Explicitly strip metadata by creating a fresh pixel-only image.
            # This prevents EXIF/ICC/comment payloads from carrying into OCR input.
            stripped = Image.new("RGB", img.size)
            stripped.paste(img)

            # Save into cache atomically.
            with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg", dir=PREPROCESS_CACHE_DIR) as out:
                temp_cache_path = Path(out.name)
            _save_jpeg(temp_cache_path, stripped)
            os.replace(temp_cache_path, cache_path)
            t_save = time.perf_counter()
            logger.info(
                "OCR preprocess image: source=%s original=%sx%s cropped=%s deskewed=%s angle=%.2f resized_to=%sx%s in_bytes=%s out_bytes=%s timing_ms(open=%.1f orient=%.1f crop=%.1f deskew=%.1f resize=%.1f contrast=%.1f save=%.1f total=%.1f)",
                "pdf" if is_pdf else "image",
                original_size[0],
                original_size[1],
                cropped,
                deskewed,
                deskew_angle,
                stripped.size[0],
                stripped.size[1],
                path.stat().st_size if path.exists() else None,
                cache_path.stat().st_size if cache_path.exists() else None,
                (t_open - t0) * 1000.0,
                (t_orient - t_open) * 1000.0,
                (t_crop1 - t_orient) * 1000.0,
                (t_deskew - t_crop1) * 1000.0,
                (t_resize - t_deskew) * 1000.0,
                (t_contrast - t_resize) * 1000.0,
                (t_save - t_contrast) * 1000.0,
                (t_save - t0) * 1000.0,
            )
            return cache_path, False
    except Exception as e:
        logger.warning(
            "Image normalization failed; using original upload. file=%s source=%s err=%s",
            path.name,
            "pdf" if is_pdf else "image",
            e,
        )
        return path, False


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
    strategy: str = Form("full"),
    course_id: Optional[str] = Form(None),
    scoring_format: Optional[str] = Form(None),  # "to_par" | "strokes" | None (auto-detect)
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a scorecard image, run OCR extraction, return results for review."""
    request_t0 = time.perf_counter()
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
        hasher = hashlib.sha256()
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            tmp.write(chunk)
            hasher.update(chunk)
        original_tmp_path = Path(tmp.name)
    upload_digest = hasher.hexdigest()

    t_pre_start = time.perf_counter()
    ocr_path, cache_hit = _normalize_upload_for_ocr(original_tmp_path, upload_digest)
    t_pre_end = time.perf_counter()
    logger.info(
        "Scan preprocessing complete: original=%s ocr_input=%s normalized=%s cache_hit=%s pre_ms=%.1f",
        original_tmp_path.name,
        ocr_path.name,
        ocr_path != original_tmp_path,
        cache_hit,
        (t_pre_end - t_pre_start) * 1000.0,
    )

    try:
        # Resolve scoring format flag: "to_par" → True, "strokes" → False, else None
        to_par_scoring: Optional[bool] = None
        if scoring_format == "to_par":
            to_par_scoring = True
        elif scoring_format == "strokes":
            to_par_scoring = False

        # Strategy routing:
        # - scores_only requires a selected course_id (fast scan path)
        # - full can run with or without course_id
        course_model = None
        t_course_lookup_start = time.perf_counter()
        if course_id:
            course_model = await db.courses.get_course(course_id)
            if course_model is None:
                raise HTTPException(404, f"Course {course_id} not found")
        t_course_lookup_end = time.perf_counter()
        logger.info(
            "Scan stage complete: stage=course_lookup has_course_id=%s found=%s lookup_ms=%.1f",
            bool(course_id),
            course_model is not None,
            (t_course_lookup_end - t_course_lookup_start) * 1000.0,
        )
        if strategy == "scores_only" and course_model is None:
            raise HTTPException(400, "scores_only strategy requires course_id")

        ocr_client = MistralOCRService(model=MISTRAL_OCR_MODEL)
        t_extract_start = time.perf_counter()
        ocr_response = await ocr_client.ocr_file(ocr_path)
        t_extract_end = time.perf_counter()
        logger.info(
            "Scan extraction primary call complete: provider=mistral model=%s extract_ms=%.1f",
            MISTRAL_OCR_MODEL,
            (t_extract_end - t_extract_start) * 1000.0,
        )

        t_parse_start = time.perf_counter()
        markdown_text = MistralOCRService.extract_markdown_text(ocr_response)
        parsed_rows = parse_mistral_scorecard_rows(markdown_text, user_context=user_context)
        round_data, fields_needing_review = _build_round_from_parsed_rows(
            parsed_rows,
            course_model=course_model,
            to_par_scoring=to_par_scoring,
        )
        confidence_data = _build_confidence_payload(round_data.get("hole_scores", []), fields_needing_review)
        t_parse_end = time.perf_counter()
        logger.info(
            "Scan stage complete: stage=mistral_parse parse_ms=%.1f score_cells=%d putt_cells=%d gir_cells=%d shots_cells=%d to_par_hint=%s warnings=%d",
            (t_parse_end - t_parse_start) * 1000.0,
            len([h for h in round_data.get("hole_scores", []) if h.get("strokes") is not None]),
            len([h for h in round_data.get("hole_scores", []) if h.get("putts") is not None]),
            len([h for h in round_data.get("hole_scores", []) if h.get("green_in_regulation") is not None]),
            len([v for v in parsed_rows.shots_to_green_row if v is not None]),
            parsed_rows.score_to_par_hint is True,
            len(fields_needing_review),
        )

        # Serialize the round and confidence for the frontend
        t_serialize_start = time.perf_counter()
        t_serialize_end = time.perf_counter()
        logger.info(
            "Scan stage complete: stage=serialize_response serialize_ms=%.1f fields_to_review=%d",
            (t_serialize_end - t_serialize_start) * 1000.0,
            len(fields_needing_review),
        )

        return ScanResponse(
            round=round_data,
            confidence=confidence_data,
            fields_needing_review=fields_needing_review,
        )

    except FileNotFoundError:
        raise HTTPException(400, "Uploaded file could not be processed")
    except EnvironmentError as e:
        raise HTTPException(500, str(e))
    except Exception as e:
        logger.exception("Scan extraction error")
        raise HTTPException(500, f"Extraction failed: {type(e).__name__}: {str(e) or repr(e)}")
    finally:
        logger.info(
            "Scan extract request complete: total_ms=%.1f",
            (time.perf_counter() - request_t0) * 1000.0,
        )
        # Keep cached normalized artifacts; remove ephemeral files only.
        if not cache_hit and ocr_path != original_tmp_path:
            ocr_path.unlink(missing_ok=True)
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
