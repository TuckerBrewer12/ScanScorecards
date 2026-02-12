import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from dotenv import load_dotenv
load_dotenv()

from google import genai
from google.genai import types

from models import Course, Hole, HoleScore, Round, Tee
from models.base import BaseGolfModel
from llm.confidence import (
    ConfidenceLevel,
    CourseConfidence,
    ExtractionConfidence,
    FieldConfidence,
    HoleConfidence,
)
from llm.prompts import (
    build_prompt,
    RawHoleData,
    RawScorecardExtraction,
)


# --- Configuration ---

GEMINI_MODEL = "gemini-3-pro-preview"
SUPPORTED_IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
SUPPORTED_PDF_TYPES = {".pdf"}
MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".pdf": "application/pdf",
}


# --- File Loading ---

def _get_mime_type(file_path: Path) -> str:
    suffix = file_path.suffix.lower()
    if suffix not in MIME_TYPES:
        raise ValueError(
            f"Unsupported file type: {suffix}. "
            f"Supported: {SUPPORTED_IMAGE_TYPES | SUPPORTED_PDF_TYPES}"
        )
    return MIME_TYPES[suffix]


def _load_file_as_part(file_path: Path) -> types.Part:
    mime_type = _get_mime_type(file_path)
    with open(file_path, "rb") as f:
        data = f.read()
    return types.Part.from_bytes(data=data, mime_type=mime_type)


# --- API Interaction ---

def _create_client() -> genai.Client:
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "GOOGLE_API_KEY environment variable is not set. "
            "Get an API key at https://aistudio.google.com/apikey"
        )
    return genai.Client(api_key=api_key)


def _call_gemini(
    client: genai.Client,
    file_part: types.Part,
    user_context: Optional[str] = None,
) -> RawScorecardExtraction:
    prompt = build_prompt(user_context)
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[file_part, prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_json_schema=RawScorecardExtraction.model_json_schema(),
        ),
    )
    return RawScorecardExtraction.model_validate_json(response.text)


# --- Transformation: Raw LLM output -> Domain Models ---

def _build_course(raw: RawScorecardExtraction) -> Course:
    holes = []
    for raw_hole in raw.holes:
        hole = Hole(
            number=raw_hole.hole_number.value,
            par=raw_hole.par.value,
            handicap=raw_hole.handicap.value,
        )
        holes.append(hole)

    tees: List[Tee] = []
    for raw_tee in raw.tees:
        yardages: Dict[int, int] = {}
        for yd_entry in raw_tee.hole_yardages:
            if yd_entry.yardage.value is not None:
                yardages[yd_entry.hole_number] = yd_entry.yardage.value
        tee = Tee(
            color=raw_tee.color.value,
            slope_rating=raw_tee.slope_rating.value,
            course_rating=raw_tee.course_rating.value,
            hole_yardages=yardages,
        )
        tees.append(tee)

    return Course(
        name=raw.course.name.value,
        location=raw.course.location.value,
        par=raw.course.par.value,
        holes=holes,
        tees=tees,
    )


def _build_hole_scores(raw: RawScorecardExtraction) -> List[HoleScore]:
    scores = []
    for raw_hole in raw.holes:
        score = HoleScore(
            hole_number=raw_hole.hole_number.value,
            strokes=raw_hole.strokes.value,
            putts=raw_hole.putts.value,
            fairway_hit=raw_hole.fairway_hit.value,
            green_in_regulation=raw_hole.green_in_regulation.value,
        )
        scores.append(score)
    return scores


def _build_round(raw: RawScorecardExtraction) -> Round:
    course = _build_course(raw)
    hole_scores = _build_hole_scores(raw)

    parsed_date = None
    if raw.date.value:
        try:
            parsed_date = datetime.strptime(raw.date.value, "%Y-%m-%d")
        except ValueError:
            pass

    return Round(
        course=course,
        tee_box=raw.tees[0].color.value if raw.tees else None,
        date=parsed_date,
        hole_scores=hole_scores,
        total_putts=raw.totals.total_putts.value,
        notes=raw.notes.value,
    )


# --- Validation Confidence Scoring ---

def _validate_hole_score(raw_hole: RawHoleData, hole_index: int) -> Dict[str, Tuple[float, List[str]]]:
    """Run domain validation checks on a single hole's extracted data.

    Returns dict of field_name -> (validation_confidence, [flag_messages]).
    """
    results: Dict[str, Tuple[float, List[str]]] = {}

    # Strokes
    strokes_flags: List[str] = []
    strokes_val_conf = 1.0
    if raw_hole.strokes.value is not None:
        s = raw_hole.strokes.value
        if s < 1 or s > 15:
            strokes_flags.append(f"Strokes {s} outside valid range 1-15")
            strokes_val_conf = 0.0
        elif s > 10:
            strokes_flags.append(f"Strokes {s} is unusually high")
            strokes_val_conf = 0.7
    results["strokes"] = (strokes_val_conf, strokes_flags)

    # Putts
    putts_flags: List[str] = []
    putts_val_conf = 1.0
    if raw_hole.putts.value is not None:
        p = raw_hole.putts.value
        if p < 0 or p > 10:
            putts_flags.append(f"Putts {p} outside valid range 0-10")
            putts_val_conf = 0.0
        elif p > 4:
            putts_flags.append(f"Putts {p} is unusually high")
            putts_val_conf = 0.8
    results["putts"] = (putts_val_conf, putts_flags)

    # Cross-field: putts <= strokes
    if raw_hole.putts.value is not None and raw_hole.strokes.value is not None:
        if raw_hole.putts.value > raw_hole.strokes.value:
            msg = f"Putts ({raw_hole.putts.value}) > strokes ({raw_hole.strokes.value})"
            _, p_flags = results["putts"]
            results["putts"] = (0.0, p_flags + [msg])
            s_conf, s_flags = results["strokes"]
            results["strokes"] = (min(s_conf, 0.3), s_flags + [msg])

    # Par
    par_flags: List[str] = []
    par_val_conf = 1.0
    if raw_hole.par.value is not None:
        par = raw_hole.par.value
        if par < 3 or par > 6:
            par_flags.append(f"Par {par} outside valid range 3-6")
            par_val_conf = 0.0
    results["par"] = (par_val_conf, par_flags)

    # Handicap
    hc_flags: List[str] = []
    hc_val_conf = 1.0
    if raw_hole.handicap.value is not None:
        hc = raw_hole.handicap.value
        if hc < 1 or hc > 18:
            hc_flags.append(f"Handicap {hc} outside valid range 1-18")
            hc_val_conf = 0.0
    results["handicap"] = (hc_val_conf, hc_flags)

    # Hole number sequence
    hn_flags: List[str] = []
    hn_val_conf = 1.0
    expected = hole_index + 1
    if raw_hole.hole_number.value is not None:
        if raw_hole.hole_number.value != expected:
            hn_flags.append(f"Expected hole {expected}, got {raw_hole.hole_number.value}")
            hn_val_conf = 0.3
    results["hole_number"] = (hn_val_conf, hn_flags)

    # GIR cross-check
    gir_flags: List[str] = []
    gir_val_conf = 1.0
    if (raw_hole.green_in_regulation.value is not None
            and raw_hole.strokes.value is not None
            and raw_hole.putts.value is not None
            and raw_hole.par.value is not None):
        shots_to_green = raw_hole.strokes.value - raw_hole.putts.value
        expected_gir = shots_to_green <= (raw_hole.par.value - 2)
        if raw_hole.green_in_regulation.value != expected_gir:
            gir_flags.append(
                f"GIR={raw_hole.green_in_regulation.value} inconsistent with "
                f"{shots_to_green} shots to green on par {raw_hole.par.value}"
            )
            gir_val_conf = 0.5
    results["green_in_regulation"] = (gir_val_conf, gir_flags)

    # Fairway hit -- no cross-validation possible
    results["fairway_hit"] = (1.0, [])

    return results


def _validate_totals(raw: RawScorecardExtraction) -> Dict[str, Tuple[float, List[str]]]:
    """Validate extracted totals against sum of hole scores."""
    results: Dict[str, Tuple[float, List[str]]] = {}

    # Total score
    ts_flags: List[str] = []
    ts_val_conf = 1.0
    if raw.totals.total_score.value is not None:
        hole_strokes = [h.strokes.value for h in raw.holes if h.strokes.value is not None]
        if hole_strokes:
            calculated = sum(hole_strokes)
            if calculated != raw.totals.total_score.value:
                ts_flags.append(
                    f"Total score {raw.totals.total_score.value} != sum of hole strokes {calculated}"
                )
                ts_val_conf = 0.2
    results["total_score"] = (ts_val_conf, ts_flags)

    # Front nine
    fn_flags: List[str] = []
    fn_val_conf = 1.0
    if raw.totals.front_nine_score.value is not None:
        front = [h.strokes.value for h in raw.holes[:9] if h.strokes.value is not None]
        if front:
            calc_front = sum(front)
            if calc_front != raw.totals.front_nine_score.value:
                fn_flags.append(
                    f"Front nine {raw.totals.front_nine_score.value} != sum of holes 1-9: {calc_front}"
                )
                fn_val_conf = 0.2
    results["front_nine_score"] = (fn_val_conf, fn_flags)

    # Back nine
    bn_flags: List[str] = []
    bn_val_conf = 1.0
    if raw.totals.back_nine_score.value is not None:
        back = [h.strokes.value for h in raw.holes[9:18] if h.strokes.value is not None]
        if back:
            calc_back = sum(back)
            if calc_back != raw.totals.back_nine_score.value:
                bn_flags.append(
                    f"Back nine {raw.totals.back_nine_score.value} != sum of holes 10-18: {calc_back}"
                )
                bn_val_conf = 0.2
    results["back_nine_score"] = (bn_val_conf, bn_flags)

    # Front + back = total cross-check
    if (raw.totals.front_nine_score.value is not None
            and raw.totals.back_nine_score.value is not None
            and raw.totals.total_score.value is not None):
        sum_halves = raw.totals.front_nine_score.value + raw.totals.back_nine_score.value
        if sum_halves != raw.totals.total_score.value:
            msg = (
                f"Front ({raw.totals.front_nine_score.value}) + "
                f"Back ({raw.totals.back_nine_score.value}) = {sum_halves} != "
                f"Total ({raw.totals.total_score.value})"
            )
            for key in ["total_score", "front_nine_score", "back_nine_score"]:
                conf, flags = results[key]
                results[key] = (min(conf, 0.3), flags + [msg])

    # Total putts
    tp_flags: List[str] = []
    tp_val_conf = 1.0
    if raw.totals.total_putts.value is not None:
        hole_putts = [h.putts.value for h in raw.holes if h.putts.value is not None]
        if hole_putts:
            calc_putts = sum(hole_putts)
            if calc_putts != raw.totals.total_putts.value:
                tp_flags.append(
                    f"Total putts {raw.totals.total_putts.value} != sum of hole putts {calc_putts}"
                )
                tp_val_conf = 0.2
    results["total_putts"] = (tp_val_conf, tp_flags)

    return results


def _validate_course_fields(raw: RawScorecardExtraction) -> Dict[str, Tuple[float, List[str]]]:
    """Validate course-level fields."""
    results: Dict[str, Tuple[float, List[str]]] = {}

    # Course par vs sum of hole pars
    cp_flags: List[str] = []
    cp_val_conf = 1.0
    if raw.course.par.value is not None:
        hole_pars = [h.par.value for h in raw.holes if h.par.value is not None]
        if hole_pars:
            calc_par = sum(hole_pars)
            if calc_par != raw.course.par.value:
                cp_flags.append(f"Course par {raw.course.par.value} != sum of hole pars {calc_par}")
                cp_val_conf = 0.3
        if raw.course.par.value < 54 or raw.course.par.value > 80:
            cp_flags.append(f"Course par {raw.course.par.value} outside 54-80")
            cp_val_conf = 0.0
    results["par"] = (cp_val_conf, cp_flags)

    # Validate all tees
    for i, raw_tee in enumerate(raw.tees):
        tee_label = raw_tee.color.value or f"tee_{i}"

        sr_flags: List[str] = []
        sr_val_conf = 1.0
        if raw_tee.slope_rating.value is not None:
            sr = raw_tee.slope_rating.value
            if sr < 55 or sr > 155:
                sr_flags.append(f"{tee_label} slope {sr} outside valid range 55-155")
                sr_val_conf = 0.0
        results[f"{tee_label}_slope_rating"] = (sr_val_conf, sr_flags)

        cr_flags: List[str] = []
        cr_val_conf = 1.0
        if raw_tee.course_rating.value is not None:
            cr = raw_tee.course_rating.value
            if cr < 55.0 or cr > 85.0:
                cr_flags.append(f"{tee_label} course rating {cr} outside valid range 55.0-85.0")
                cr_val_conf = 0.0
        results[f"{tee_label}_course_rating"] = (cr_val_conf, cr_flags)

        results[f"{tee_label}_color"] = (1.0, [])

        # Validate yardages for this tee
        for yd_entry in raw_tee.hole_yardages:
            yd_flags: List[str] = []
            yd_val_conf = 1.0
            if yd_entry.yardage.value is not None:
                yd = yd_entry.yardage.value
                if yd < 50 or yd > 700:
                    yd_flags.append(f"Yardage {yd} outside plausible range 50-700")
                    yd_val_conf = 0.0
            results[f"{tee_label}_hole_{yd_entry.hole_number}_yardage"] = (yd_val_conf, yd_flags)

    # Name, location: no domain validation
    results["name"] = (1.0, [])
    results["location"] = (1.0, [])

    return results


# --- Confidence Assembly ---

def _build_field_confidence(
    field_name: str,
    llm_confidence: float,
    val_conf: float,
    val_flags: List[str],
) -> FieldConfidence:
    final = FieldConfidence.compute_final(llm_confidence, val_conf)
    return FieldConfidence(
        field_name=field_name,
        llm_confidence=llm_confidence,
        validation_confidence=val_conf,
        validation_flags=val_flags,
        final_confidence=final,
        level=FieldConfidence.to_level(final),
    )


def _build_extraction_confidence(raw: RawScorecardExtraction) -> ExtractionConfidence:
    """Build the complete confidence report from raw extraction data."""

    # Per-hole confidence
    hole_confidences: List[HoleConfidence] = []
    for i, raw_hole in enumerate(raw.holes):
        val_results = _validate_hole_score(raw_hole, i)
        fields: Dict[str, FieldConfidence] = {}

        field_map = {
            "hole_number": raw_hole.hole_number.confidence,
            "par": raw_hole.par.confidence,
            "handicap": raw_hole.handicap.confidence,
            "strokes": raw_hole.strokes.confidence,
            "putts": raw_hole.putts.confidence,
            "fairway_hit": raw_hole.fairway_hit.confidence,
            "green_in_regulation": raw_hole.green_in_regulation.confidence,
        }

        for fname, llm_conf in field_map.items():
            v_conf, v_flags = val_results.get(fname, (1.0, []))
            fields[fname] = _build_field_confidence(fname, llm_conf, v_conf, v_flags)

        # Hole overall = min of confidences for fields that have values
        non_null_finals = []
        for fc in fields.values():
            raw_field = getattr(raw_hole, fc.field_name, None)
            if raw_field is not None and getattr(raw_field, "value", None) is not None:
                non_null_finals.append(fc.final_confidence)
        hole_overall = min(non_null_finals) if non_null_finals else 0.0

        hole_confidences.append(HoleConfidence(
            hole_number=i + 1,
            fields=fields,
            overall=hole_overall,
            level=FieldConfidence.to_level(hole_overall),
        ))

    # Course confidence
    course_val = _validate_course_fields(raw)
    course_fields: Dict[str, FieldConfidence] = {}
    course_llm_map: Dict[str, float] = {
        "name": raw.course.name.confidence,
        "location": raw.course.location.confidence,
        "par": raw.course.par.confidence,
    }
    # Add per-tee fields
    for i, raw_tee in enumerate(raw.tees):
        tee_label = raw_tee.color.value or f"tee_{i}"
        course_llm_map[f"{tee_label}_color"] = raw_tee.color.confidence
        course_llm_map[f"{tee_label}_slope_rating"] = raw_tee.slope_rating.confidence
        course_llm_map[f"{tee_label}_course_rating"] = raw_tee.course_rating.confidence
        for yd_entry in raw_tee.hole_yardages:
            course_llm_map[f"{tee_label}_hole_{yd_entry.hole_number}_yardage"] = yd_entry.yardage.confidence

    for fname, llm_conf in course_llm_map.items():
        v_conf, v_flags = course_val.get(fname, (1.0, []))
        course_fields[fname] = _build_field_confidence(fname, llm_conf, v_conf, v_flags)

    course_non_null = [fc.final_confidence for fc in course_fields.values()]
    course_overall = min(course_non_null) if course_non_null else 0.0

    course_confidence = CourseConfidence(
        fields=course_fields,
        overall=course_overall,
        level=FieldConfidence.to_level(course_overall),
    )

    # Round-level field confidence
    round_fields: Dict[str, FieldConfidence] = {}
    round_fields["date"] = _build_field_confidence("date", raw.date.confidence, 1.0, [])
    round_fields["player_name"] = _build_field_confidence("player_name", raw.player_name.confidence, 1.0, [])
    round_fields["notes"] = _build_field_confidence("notes", raw.notes.confidence, 1.0, [])

    totals_val = _validate_totals(raw)
    for fname in ["total_score", "front_nine_score", "back_nine_score", "total_putts"]:
        llm_conf = getattr(raw.totals, fname).confidence
        v_conf, v_flags = totals_val.get(fname, (1.0, []))
        round_fields[fname] = _build_field_confidence(fname, llm_conf, v_conf, v_flags)

    # Overall confidence
    all_finals = (
        [hc.overall for hc in hole_confidences]
        + [course_confidence.overall]
        + [fc.final_confidence for fc in round_fields.values()]
    )
    overall = min(all_finals) if all_finals else 0.0

    # Fields needing review
    fields_needing_review: List[str] = []
    for hc in hole_confidences:
        for fname, fc in hc.fields.items():
            if fc.level in (ConfidenceLevel.LOW, ConfidenceLevel.VERY_LOW):
                detail = ", ".join(fc.validation_flags) if fc.validation_flags else "low LLM confidence"
                fields_needing_review.append(
                    f"Hole {hc.hole_number} {fname}: {fc.final_confidence:.2f} ({detail})"
                )
    for fname, fc in course_fields.items():
        if fc.level in (ConfidenceLevel.LOW, ConfidenceLevel.VERY_LOW):
            detail = ", ".join(fc.validation_flags) if fc.validation_flags else "low LLM confidence"
            fields_needing_review.append(f"Course {fname}: {fc.final_confidence:.2f} ({detail})")
    for fname, fc in round_fields.items():
        if fc.level in (ConfidenceLevel.LOW, ConfidenceLevel.VERY_LOW):
            fields_needing_review.append(f"{fname}: {fc.final_confidence:.2f}")

    total_fields = sum(len(hc.fields) for hc in hole_confidences) + len(course_fields) + len(round_fields)

    return ExtractionConfidence(
        hole_scores=hole_confidences,
        course=course_confidence,
        round_fields=round_fields,
        overall=overall,
        level=FieldConfidence.to_level(overall),
        total_fields_extracted=total_fields,
        fields_needing_review=fields_needing_review,
    )


# --- Result Model ---

class ExtractionResult(BaseGolfModel):
    """Complete result of a scorecard extraction."""
    round: Round
    confidence: ExtractionConfidence
    raw_response: Optional[dict] = None


# --- Public API ---

def extract_scorecard(
    file_path: str | Path,
    *,
    user_context: Optional[str] = None,
    include_raw_response: bool = False,
) -> ExtractionResult:
    """Extract scorecard data from an image or PDF file.

    Args:
        file_path: Path to a JPG, PNG, PDF, or other supported file.
        user_context: Optional free-text instructions, e.g.:
            - "My name is Tucker"
            - "I write my scores as score to par (+1, -1, E)"
            - "My name is Tucker. I record score to par. I played from the blue tees."
        include_raw_response: If True, includes the raw LLM JSON in the result.

    Returns:
        ExtractionResult containing the Round model and confidence scores.

    Raises:
        FileNotFoundError: If the file doesn't exist.
        ValueError: If the file type is unsupported.
        EnvironmentError: If GOOGLE_API_KEY is not set.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    file_part = _load_file_as_part(path)
    client = _create_client()
    raw_extraction = _call_gemini(client, file_part, user_context)

    round_data = _build_round(raw_extraction)
    confidence = _build_extraction_confidence(raw_extraction)

    return ExtractionResult(
        round=round_data,
        confidence=confidence,
        raw_response=raw_extraction.model_dump() if include_raw_response else None,
    )
