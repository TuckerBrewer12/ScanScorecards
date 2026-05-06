"""Scorecard scan/upload API endpoints."""

import contextlib
import hashlib
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

from database.db_manager import DatabaseManager
from api.dependencies import get_current_user, get_optional_current_user, get_db
from api.input_validation import ensure_uuid_str, normalize_course_display_name, sanitize_ocr_text, sanitize_user_text
from api.request_models import SaveRoundRequest
from models import User
from services.gemini_table_merger import merge_split_tables
from services.mistral_ocr_service import MistralOCRService
from services.mistral_scorecard_parser import ParsedScorecardRows, parse_mistral_scorecard_rows
from services.scan_service import ScanService

router = APIRouter()

OCR_LONG_EDGE_TARGET = 1800
OCR_JPEG_QUALITY = 75
PREPROCESS_CACHE_VERSION = "v2"
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
MAX_OCR_TEXT_CHARS = 300_000
MAX_USER_CONTEXT_CHARS = 1_500
MAX_IMAGE_PIXELS = 40_000_000
MAX_IMAGE_SIDE = 12_000
PREPROCESS_CACHE_DIR = Path(tempfile.gettempdir()) / "scanscore_ocr_cache"
PREPROCESS_CACHE_ENABLED = False
MISTRAL_OCR_MODEL = os.environ.get("MISTRAL_OCR_MODEL") or "mistral-ocr-latest"


def _initialize_heic_decoder() -> bool:
    try:
        from pillow_heif import register_heif_opener

        register_heif_opener()
    except Exception as exc:  # noqa: BLE001
        logger.warning("HEIC/HEIF decoder initialization failed: %s", exc)
        return False

    registered_extensions = Image.registered_extensions()
    return ".heic" in registered_extensions or ".heif" in registered_extensions


HEIC_DECODE_AVAILABLE = _initialize_heic_decoder()
BASE_UPLOAD_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
ALLOWED_UPLOAD_SUFFIXES = set(BASE_UPLOAD_SUFFIXES)
if HEIC_DECODE_AVAILABLE:
    ALLOWED_UPLOAD_SUFFIXES.add(".heic")

ALLOWED_UPLOAD_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
}
if HEIC_DECODE_AVAILABLE:
    ALLOWED_UPLOAD_MIME_TYPES.update(
        {
            "image/heic",
            "image/heif",
            "application/octet-stream",  # some mobile clients use this for HEIC
        }
    )

ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
if HEIC_DECODE_AVAILABLE:
    ALLOWED_IMAGE_FORMATS.update({"HEIC", "HEIF"})


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


# Disabled by default to avoid leaking OCR/user content into aggregated logs.
LOG_SENSITIVE_OCR_DEBUG = _env_bool("LOG_SENSITIVE_OCR_DEBUG", False)


class ScanResponse(BaseModel):
    """Response from scorecard extraction."""
    round: dict
    confidence: dict
    fields_needing_review: list


def _extract_upload_suffix(file: UploadFile) -> str:
    filename = (file.filename or "").strip()
    if not filename:
        raise HTTPException(400, "Filename is required.")
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_UPLOAD_SUFFIXES:
        if suffix == ".heic" and not HEIC_DECODE_AVAILABLE:
            raise HTTPException(
                400,
                "HEIC uploads are temporarily unavailable on this server. Please convert to JPG/PNG and retry.",
            )
        raise HTTPException(400, f"Unsupported file type: {suffix}. Allowed: {', '.join(sorted(ALLOWED_UPLOAD_SUFFIXES))}")
    content_type = (file.content_type or "").lower().strip()
    if content_type and content_type not in ALLOWED_UPLOAD_MIME_TYPES:
        raise HTTPException(400, f"Unsupported upload content type: {content_type}")
    return suffix


def _validate_upload_payload(path: Path, suffix: str) -> None:
    if suffix == ".pdf":
        with open(path, "rb") as fh:
            header = fh.read(5)
        if header != b"%PDF-":
            raise HTTPException(400, "Invalid PDF upload.")
        return

    try:
        with Image.open(path) as img:
            img.verify()
        with Image.open(path) as img:
            fmt = (img.format or "").upper()
            if fmt not in ALLOWED_IMAGE_FORMATS:
                raise HTTPException(400, f"Unsupported image format: {fmt or 'unknown'}")
            width, height = img.size
            if width <= 0 or height <= 0:
                raise HTTPException(400, "Invalid image dimensions.")
            if width > MAX_IMAGE_SIDE or height > MAX_IMAGE_SIDE:
                raise HTTPException(400, "Image dimensions exceed allowed size.")
            if width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(400, "Image pixel count exceeds allowed size.")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        if suffix == ".heic" and not HEIC_DECODE_AVAILABLE:
            raise HTTPException(
                400,
                "HEIC uploads are temporarily unavailable on this server. Please convert to JPG/PNG and retry.",
            ) from exc
        raise HTTPException(400, "Invalid or unreadable image upload.") from exc


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
    def _safe_list_attr(name: str):
        value = getattr(parsed, name, [])
        return value if isinstance(value, list) else []

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
        course_name = normalize_course_display_name(parsed.course_name) if parsed.course_name else None
        parsed_pars = list(_safe_list_attr("par_row")[:hole_count])
        while len(parsed_pars) < hole_count:
            parsed_pars.append(None)
        for i in range(1, hole_count + 1):
            handicap_row = _safe_list_attr("handicap_row")
            handicap = handicap_row[i - 1] if i - 1 < len(handicap_row) else None
            par_i = parsed_pars[i - 1]
            if par_i is not None and not (3 <= par_i <= 6):
                par_i = None
            course_holes.append({"number": i, "par": par_i, "handicap": handicap})
            hole_par_lookup[i] = par_i
        par_vals = [p for p in parsed_pars if p is not None]
        if len(par_vals) >= 9:
            course_par = sum(par_vals)
        for tr in _safe_list_attr("tee_rows"):
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

    score_vals = list(_safe_list_attr("score_row")[:hole_count])
    while len(score_vals) < hole_count:
        score_vals.append(None)
    putt_vals = list(_safe_list_attr("putts_row")[:hole_count])
    while len(putt_vals) < hole_count:
        putt_vals.append(None)
    raw_putt_vals = list(_safe_list_attr("raw_putts_row")[:hole_count])
    while len(raw_putt_vals) < hole_count:
        raw_putt_vals.append(None)
    gir_vals = list(_safe_list_attr("gir_row")[:hole_count])
    while len(gir_vals) < hole_count:
        gir_vals.append(None)
    shots_vals = list(_safe_list_attr("shots_to_green_row")[:hole_count])
    while len(shots_vals) < hole_count:
        shots_vals.append(None)
    raw_shots_vals = list(_safe_list_attr("raw_shots_to_green_row")[:hole_count])
    while len(raw_shots_vals) < hole_count:
        raw_shots_vals.append(None)

    effective_to_par = to_par_scoring if to_par_scoring is not None else (parsed.score_to_par_hint is True)

    hole_scores: List[Dict] = []
    for i in range(1, hole_count + 1):
        raw_score = score_vals[i - 1]
        sign_putts = raw_putt_vals[i - 1] if raw_putt_vals[i - 1] is not None else putt_vals[i - 1]
        sign_shots = raw_shots_vals[i - 1] if raw_shots_vals[i - 1] is not None else shots_vals[i - 1]
        if (
            effective_to_par is True
            and raw_score == 1
            and sign_shots is not None
            and sign_putts is not None
            and 1 <= sign_shots <= 10
            and 0 <= sign_putts <= 6
            and hole_par_lookup.get(i) is not None
        ):
            # OCR can miss the minus sign and read "-1" as "1".
            # Use shots+putts vs par to disambiguate when possible.
            est = (sign_shots + sign_putts) - hole_par_lookup[i]  # type: ignore[index]
            if est in (-1, 1):
                if est != raw_score:
                    fields_needing_review.append(
                        f"Hole {i} score sign corrected (birdie vs bogey disambiguated)"
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

        shots_val = shots_vals[i - 1]
        if shots_val is not None and not (1 <= shots_val <= 10):
            shots_val = None

        hole_scores.append(
            {
                "hole_number": i,
                "strokes": strokes,
                "putts": putts,
                "shots_to_green": shots_val,
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


def _save_upload_to_temp(file: UploadFile, suffix: str) -> tuple[Path, str]:
    """Stream upload to a temp file enforcing max size. Returns (path, sha256_hex)."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        hasher = hashlib.sha256()
        total_bytes = 0
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            total_bytes += len(chunk)
            if total_bytes > MAX_UPLOAD_BYTES:
                Path(tmp.name).unlink(missing_ok=True)
                raise HTTPException(413, "File too large. Maximum size is 20 MB.")
            tmp.write(chunk)
            hasher.update(chunk)
        return Path(tmp.name), hasher.hexdigest()


async def _run_ocr_pipeline(ocr_path: Path) -> str:
    """Mistral OCR → Gemini merge → raw markdown string."""
    svc = MistralOCRService()
    ocr_resp = await svc.ocr_file(ocr_path)

    pages = ocr_resp.get("pages")
    if LOG_SENSITIVE_OCR_DEBUG and isinstance(pages, list):
        for page_idx, page in enumerate(pages):
            if not isinstance(page, dict):
                continue
            tables = page.get("tables") or []
            if not isinstance(tables, list):
                continue
            for table_idx, table in enumerate(tables):
                if not isinstance(table, dict):
                    continue
                html_table = table.get("content")
                if isinstance(html_table, str) and html_table.strip():
                    logger.debug(
                        "Mistral HTML table page=%d table=%d:\n%s",
                        page_idx,
                        table_idx,
                        html_table,
                    )

    raw_markdown = MistralOCRService.extract_markdown_text(ocr_resp)
    if LOG_SENSITIVE_OCR_DEBUG:
        logger.debug("Mistral raw markdown:\n%s", raw_markdown)
    else:
        logger.info("Mistral OCR produced markdown chars=%d", len(raw_markdown))
    return await merge_split_tables(raw_markdown)


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


def _normalize_upload_for_ocr(path: Path, upload_digest: str) -> tuple[Path, bool]:
    """
    Normalize uploaded images to JPEG for faster, consistent OCR payloads.

    Notes:
    - PDF: attempts to render page 1 to JPEG, then applies the same preprocessing.
      Falls back to original PDF if rendering is unavailable.
    - If normalization fails (e.g., unsupported HEIC decoder), fall back to original.
    """
    cache_path = _get_preprocess_cache_path(upload_digest) if PREPROCESS_CACHE_ENABLED else None
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

            # Resize large images before OCR (keep aspect ratio, do not upscale).
            width, height = img.size
            long_edge = max(width, height)
            if long_edge > OCR_LONG_EDGE_TARGET:
                scale = OCR_LONG_EDGE_TARGET / float(long_edge)
                new_size = (max(1, int(width * scale)), max(1, int(height * scale)))
                img = img.resize(new_size, Image.Resampling.LANCZOS)
            t_resize = time.perf_counter()

            # Explicitly strip metadata by creating a fresh pixel-only image.
            # This prevents EXIF/ICC/comment payloads from carrying into OCR input.
            stripped = Image.new("RGB", img.size)
            stripped.paste(img)

            if PREPROCESS_CACHE_ENABLED and cache_path is not None:
                # Save into cache atomically.
                with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg", dir=PREPROCESS_CACHE_DIR) as out:
                    temp_cache_path = Path(out.name)
                _save_jpeg(temp_cache_path, stripped)
                os.replace(temp_cache_path, cache_path)
                output_path = cache_path
            else:
                with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as out:
                    output_path = Path(out.name)
                _save_jpeg(output_path, stripped)
            t_save = time.perf_counter()
            logger.info(
                "OCR preprocess image: source=%s cache_enabled=%s original=%sx%s resized_to=%sx%s in_bytes=%s out_bytes=%s timing_ms(open=%.1f orient=%.1f resize=%.1f save=%.1f total=%.1f)",
                "pdf" if is_pdf else "image",
                PREPROCESS_CACHE_ENABLED,
                original_size[0],
                original_size[1],
                stripped.size[0],
                stripped.size[1],
                path.stat().st_size if path.exists() else None,
                output_path.stat().st_size if output_path.exists() else None,
                (t_open - t0) * 1000.0,
                (t_orient - t_open) * 1000.0,
                (t_resize - t_orient) * 1000.0,
                (t_save - t_resize) * 1000.0,
                (t_save - t0) * 1000.0,
            )
            return output_path, False
    except Exception as e:
        logger.warning(
            "Image normalization failed; using original upload. file=%s source=%s err=%s",
            path.name,
            "pdf" if is_pdf else "image",
            e,
        )
        return path, False


@router.post("/ocr")
async def prefetch_ocr(
    file: UploadFile = File(...),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Run OCR on an uploaded image and return the raw markdown text.

    Called immediately on file selection so the slow OCR step is already
    complete by the time the user clicks Extract.
    """
    suffix = _extract_upload_suffix(file)
    original_tmp_path, upload_digest = _save_upload_to_temp(file, suffix)

    ocr_path = original_tmp_path
    cache_hit = False
    try:
        _validate_upload_payload(original_tmp_path, suffix)
        ocr_path, cache_hit = _normalize_upload_for_ocr(original_tmp_path, upload_digest)
        markdown_text = await _run_ocr_pipeline(ocr_path)
        logger.info("Prefetch OCR complete: user=%s chars=%d", getattr(current_user, "id", "anonymous"), len(markdown_text))
        return {"ocr_text": markdown_text}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Prefetch OCR failed")
        raise HTTPException(500, "OCR failed. Please try again.")
    finally:
        if ocr_path != original_tmp_path and (not PREPROCESS_CACHE_ENABLED or not cache_hit):
            with contextlib.suppress(OSError):
                ocr_path.unlink()
        with contextlib.suppress(OSError):
            original_tmp_path.unlink()


@router.post("/extract")
async def extract_scan(
    file: UploadFile = File(...),
    user_context: Optional[str] = Form(None),
    course_id: Optional[str] = Form(None),
    ocr_text: Optional[str] = Form(None),
    db: DatabaseManager = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """Upload a scorecard image, run OCR extraction, return results for review."""
    request_t0 = time.perf_counter()
    logger.info(
        "Scan extract request received: filename=%s course_id=%s user_id=%s",
        file.filename,
        course_id,
        getattr(current_user, "id", "anonymous"),
    )
    # Validate file type + metadata.
    suffix = _extract_upload_suffix(file)
    if user_context is not None:
        try:
            user_context = sanitize_user_text(
                user_context,
                field_name="user_context",
                max_length=MAX_USER_CONTEXT_CHARS,
                allow_newlines=True,
                allow_empty=True,
            )
        except ValueError as exc:
            raise HTTPException(422, str(exc))
    if course_id is not None and course_id.strip():
        try:
            course_id = ensure_uuid_str(course_id, "course_id")
        except ValueError as exc:
            raise HTTPException(422, str(exc))
    elif course_id is not None:
        course_id = None
    if ocr_text is not None:
        try:
            ocr_text = sanitize_ocr_text(ocr_text, max_length=MAX_OCR_TEXT_CHARS)
        except ValueError as exc:
            raise HTTPException(422, str(exc))

    original_tmp_path, upload_digest = _save_upload_to_temp(file, suffix)

    ocr_path = original_tmp_path
    cache_hit = False

    try:
        _validate_upload_payload(original_tmp_path, suffix)

        t_pre_start = time.perf_counter()
        ocr_path, cache_hit = _normalize_upload_for_ocr(original_tmp_path, upload_digest)
        t_pre_end = time.perf_counter()
        logger.info(
            "Scan preprocessing complete: original=%s ocr_input=%s normalized=%s cache_enabled=%s cache_hit=%s pre_ms=%.1f",
            original_tmp_path.name,
            ocr_path.name,
            ocr_path != original_tmp_path,
            PREPROCESS_CACHE_ENABLED,
            cache_hit,
            (t_pre_end - t_pre_start) * 1000.0,
        )

        # Scoring format is inferred from row parser + user_context hints.
        to_par_scoring: Optional[bool] = None

        # Optional known course preload; extraction is always full Mistral parse.
        course_model = None
        t_course_lookup_start = time.perf_counter()
        if course_id:
            course_model = await db.courses.get_course(course_id)
            if course_model is None:
                raise HTTPException(404, f"Course {course_id} not found")
            if course_model.user_id and (current_user is None or str(course_model.user_id) != str(current_user.id)):
                raise HTTPException(403, "Forbidden")
        t_course_lookup_end = time.perf_counter()
        logger.info(
            "Scan stage complete: stage=course_lookup has_course_id=%s found=%s lookup_ms=%.1f",
            bool(course_id),
            course_model is not None,
            (t_course_lookup_end - t_course_lookup_start) * 1000.0,
        )
        t_extract_start = time.perf_counter()
        if ocr_text:
            # Prefetch already ran OCR + Gemini merge — use it directly.
            markdown_text = ocr_text
            logger.info("Scan using prefetched OCR text: chars=%d", len(markdown_text))
        else:
            markdown_text = await _run_ocr_pipeline(ocr_path)
            logger.info(
                "Scan OCR+merge complete: extract_ms=%.1f chars=%d",
                (time.perf_counter() - t_extract_start) * 1000.0,
                len(markdown_text),
            )

        if LOG_SENSITIVE_OCR_DEBUG:
            logger.debug("Merged markdown:\n%s", markdown_text)
        else:
            logger.info("Merged OCR markdown chars=%d", len(markdown_text))

        t_parse_start = time.perf_counter()
        parsed_rows = parse_mistral_scorecard_rows(markdown_text, user_context=user_context)
        round_data, fields_needing_review = _build_round_from_parsed_rows(
            parsed_rows,
            course_model=course_model,
            to_par_scoring=to_par_scoring,
        )

        present_strokes = len(
            [h for h in round_data.get("hole_scores", []) if h.get("strokes") is not None]
        )
        if present_strokes == 0:
            if parsed_rows.player_name:
                raise HTTPException(
                    422,
                    "Name is unclear in the scorecard image. Please upload a cleaner image with clearer handwriting and try again.",
                )
            raise HTTPException(
                422,
                "Unable to clearly read the score rows from this image. Please upload a cleaner image with clearer handwriting and better lighting, then try again.",
            )

        confidence_data = _build_confidence_payload(round_data.get("hole_scores", []), fields_needing_review)
        t_parse_end = time.perf_counter()
        logger.info(
            "Scan stage complete: stage=mistral_parse extraction_mode=%s parse_ms=%.1f score_cells=%d putt_cells=%d gir_cells=%d shots_cells=%d to_par_hint=%s warnings=%d",
            parsed_rows.extraction_mode,
            (t_parse_end - t_parse_start) * 1000.0,
            len([h for h in round_data.get("hole_scores", []) if h.get("strokes") is not None]),
            len([h for h in round_data.get("hole_scores", []) if h.get("putts") is not None]),
            len([h for h in round_data.get("hole_scores", []) if h.get("green_in_regulation") is not None]),
            len([v for v in parsed_rows.shots_to_green_row if v is not None]),
            parsed_rows.score_to_par_hint is True,
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
    except HTTPException:
        raise
    except Exception:
        logger.exception("Scan extraction error")
        raise HTTPException(500, "Extraction failed. Please try again.")
    finally:
        logger.info(
            "Scan extract request complete: total_ms=%.1f",
            (time.perf_counter() - request_t0) * 1000.0,
        )
        # Cache is disabled by default; remove generated OCR preprocess artifact.
        if ocr_path != original_tmp_path and (not PREPROCESS_CACHE_ENABLED or not cache_hit):
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
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        logger.exception("Save round error")
        raise HTTPException(500, "Save failed. Please try again.")
