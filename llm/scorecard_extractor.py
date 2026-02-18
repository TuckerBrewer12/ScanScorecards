import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Type, TypeVar

from pydantic import BaseModel

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
    build_full_extraction_prompt,
    build_scores_only_prompt,
    build_course_identification_prompt,
    RawCourseIdentification,
    RawHoleData,
    RawScoreOnlyHoleData,
    RawScorecardExtraction,
    RawScoresOnlyExtraction,
)
from llm.strategies import (
    CourseRepository,
    ExtractionStrategy,
    NullCourseRepository,
)


# --- Configuration ---

GEMINI_MODEL = "gemini-3-pro-preview"
GEMINI_MODEL_FAST = "gemini-2.5-flash"
MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".pdf": "application/pdf",
}

T = TypeVar("T", bound=BaseModel)


# --- File Loading ---

def _get_mime_type(file_path: Path) -> str:
    suffix = file_path.suffix.lower()
    if suffix not in MIME_TYPES:
        raise ValueError(
            f"Unsupported file type: {suffix}. "
            f"Supported: {', '.join(sorted(MIME_TYPES.keys()))}"
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
    prompt: str,
    response_model: Type[T],
    model: str = GEMINI_MODEL,
) -> T:
    """Generic Gemini call: send prompt + image, parse into response_model."""
    response = client.models.generate_content(
        model=model,
        contents=[file_part, prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_json_schema=response_model.model_json_schema(),
        ),
    )
    return response_model.model_validate_json(response.text)


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

    return Round(
        course=course,
        tee_box=raw.tee_played.value,
        date=_parse_date(raw.date.value),
        hole_scores=hole_scores,
        total_putts=raw.totals.total_putts.value,
        notes=raw.notes.value,
    )


def _parse_date(date_str: Optional[str]) -> Optional[datetime]:
    """Parse a YYYY-MM-DD date string, returning None on failure."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return None


def _convert_score_to_strokes(
    raw_score: Optional[int],
    par: Optional[int],
    to_par_scoring: bool,
) -> Optional[int]:
    """Convert a raw score value to total strokes.

    If to_par_scoring is True, raw_score is relative to par (e.g., +1 = 1, -1 = -1, 0 = par).
    If False, raw_score is already total strokes.
    """
    if raw_score is None:
        return None
    if to_par_scoring and par is not None:
        return par + raw_score
    return raw_score


def _build_round_from_scores(
    raw: RawScoresOnlyExtraction, course: Course,
) -> Round:
    """Build a Round from scores-only extraction + known course data.

    The LLM returns raw numbers as written on the card. This function:
    1. Detects scoring format (to-par vs total strokes)
    2. Converts to total strokes using known par values
    3. Calculates totals in Python (no LLM needed)
    """
    to_par = (raw.to_par_scoring.value is True)

    hole_scores = []
    for raw_hole in raw.holes:
        hole_num = raw_hole.hole_number.value
        known_hole = course.get_hole(hole_num) if hole_num else None
        known_par = known_hole.par if known_hole else None

        strokes = _convert_score_to_strokes(
            raw_hole.score.value, known_par, to_par,
        )

        hole_scores.append(HoleScore(
            hole_number=hole_num,
            strokes=strokes,
            putts=raw_hole.putts.value,
        ))

    # Calculate totals in Python
    all_putts = [s.putts for s in hole_scores if s.putts is not None]
    total_putts = sum(all_putts) if all_putts else None

    return Round(
        course=course,
        tee_box=None,  # user specifies via user_context
        date=_parse_date(raw.date.value),
        hole_scores=hole_scores,
        total_putts=total_putts,
    )


# --- Validation Confidence Scoring ---

def _validate_strokes_putts(
    strokes_value: Optional[int],
    putts_value: Optional[int],
) -> Dict[str, Tuple[float, List[str]]]:
    """Shared strokes/putts validation for both full and scores-only."""
    results: Dict[str, Tuple[float, List[str]]] = {}

    # Strokes
    strokes_flags: List[str] = []
    strokes_val_conf = 1.0
    if strokes_value is not None:
        if strokes_value < 1 or strokes_value > 15:
            strokes_flags.append(f"Strokes {strokes_value} outside valid range 1-15")
            strokes_val_conf = 0.0
        elif strokes_value > 10:
            strokes_flags.append(f"Strokes {strokes_value} is unusually high")
            strokes_val_conf = 0.7
    results["strokes"] = (strokes_val_conf, strokes_flags)

    # Putts
    putts_flags: List[str] = []
    putts_val_conf = 1.0
    if putts_value is not None:
        if putts_value < 0 or putts_value > 10:
            putts_flags.append(f"Putts {putts_value} outside valid range 0-10")
            putts_val_conf = 0.0
        elif putts_value > 4:
            putts_flags.append(f"Putts {putts_value} is unusually high")
            putts_val_conf = 0.8
    results["putts"] = (putts_val_conf, putts_flags)

    # Cross-field: putts <= strokes
    if putts_value is not None and strokes_value is not None:
        if putts_value > strokes_value:
            msg = f"Putts ({putts_value}) > strokes ({strokes_value})"
            _, p_flags = results["putts"]
            results["putts"] = (0.0, p_flags + [msg])
            s_conf, s_flags = results["strokes"]
            results["strokes"] = (min(s_conf, 0.3), s_flags + [msg])

    return results


def _validate_gir(
    gir_value: Optional[bool],
    strokes_value: Optional[int],
    putts_value: Optional[int],
    par_value: Optional[int],
) -> Tuple[float, List[str]]:
    """Shared GIR cross-check using par (from LLM or DB)."""
    gir_flags: List[str] = []
    gir_val_conf = 1.0
    if (gir_value is not None
            and strokes_value is not None
            and putts_value is not None
            and par_value is not None):
        shots_to_green = strokes_value - putts_value
        expected_gir = shots_to_green <= (par_value - 2)
        if gir_value != expected_gir:
            gir_flags.append(
                f"GIR={gir_value} inconsistent with "
                f"{shots_to_green} shots to green on par {par_value}"
            )
            gir_val_conf = 0.5
    return (gir_val_conf, gir_flags)


def _validate_hole_score(
    raw_hole: RawHoleData, hole_index: int,
) -> Dict[str, Tuple[float, List[str]]]:
    """Validate a single hole from full extraction."""
    results = _validate_strokes_putts(
        raw_hole.strokes.value, raw_hole.putts.value,
    )

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

    # GIR cross-check (using par from LLM)
    results["green_in_regulation"] = _validate_gir(
        raw_hole.green_in_regulation.value,
        raw_hole.strokes.value,
        raw_hole.putts.value,
        raw_hole.par.value,
    )

    # Fairway hit -- no cross-validation possible
    results["fairway_hit"] = (1.0, [])

    return results


def _validate_score_only_hole(
    raw_hole: RawScoreOnlyHoleData,
    hole_index: int,
    to_par_scoring: bool,
    known_hole: Optional[Hole],
) -> Dict[str, Tuple[float, List[str]]]:
    """Validate a single hole from scores-only extraction.

    Validates the raw score value based on scoring format.
    """
    results: Dict[str, Tuple[float, List[str]]] = {}

    # Score validation
    score_flags: List[str] = []
    score_val_conf = 1.0
    if raw_hole.score.value is not None:
        s = raw_hole.score.value
        if to_par_scoring:
            # to-par scores typically range from -3 (albatross) to +8
            if s < -4 or s > 10:
                score_flags.append(f"Score-to-par {s} outside plausible range -4 to +10")
                score_val_conf = 0.0
        else:
            # total strokes typically 1-15
            if s < 1 or s > 15:
                score_flags.append(f"Strokes {s} outside valid range 1-15")
                score_val_conf = 0.0
            elif s > 10:
                score_flags.append(f"Strokes {s} is unusually high")
                score_val_conf = 0.7
    results["score"] = (score_val_conf, score_flags)

    # Putts validation
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

    # Cross-check: after conversion, putts should not exceed strokes
    if raw_hole.score.value is not None and raw_hole.putts.value is not None:
        known_par = known_hole.par if known_hole else None
        total_strokes = _convert_score_to_strokes(
            raw_hole.score.value, known_par, to_par_scoring,
        )
        if total_strokes is not None and raw_hole.putts.value > total_strokes:
            msg = f"Putts ({raw_hole.putts.value}) > converted strokes ({total_strokes})"
            _, p_flags = results["putts"]
            results["putts"] = (0.0, p_flags + [msg])
            s_conf, s_flags = results["score"]
            results["score"] = (min(s_conf, 0.3), s_flags + [msg])

    # Hole number sequence
    hn_flags: List[str] = []
    hn_val_conf = 1.0
    expected = hole_index + 1
    if raw_hole.hole_number.value is not None:
        if raw_hole.hole_number.value != expected:
            hn_flags.append(f"Expected hole {expected}, got {raw_hole.hole_number.value}")
            hn_val_conf = 0.3
    results["hole_number"] = (hn_val_conf, hn_flags)

    return results


def _validate_totals(
    totals, holes_list,
) -> Dict[str, Tuple[float, List[str]]]:
    """Validate extracted totals against sum of hole scores.

    Works for both RawScorecardExtraction and RawScoresOnlyExtraction
    since both have .totals and .holes with .strokes/.putts attributes.
    """
    results: Dict[str, Tuple[float, List[str]]] = {}

    # Total score
    ts_flags: List[str] = []
    ts_val_conf = 1.0
    if totals.total_score.value is not None:
        hole_strokes = [h.strokes.value for h in holes_list if h.strokes.value is not None]
        if hole_strokes:
            calculated = sum(hole_strokes)
            if calculated != totals.total_score.value:
                ts_flags.append(
                    f"Total score {totals.total_score.value} != sum of hole strokes {calculated}"
                )
                ts_val_conf = 0.2
    results["total_score"] = (ts_val_conf, ts_flags)

    # Front nine
    fn_flags: List[str] = []
    fn_val_conf = 1.0
    if totals.front_nine_score.value is not None:
        front = [h.strokes.value for h in holes_list[:9] if h.strokes.value is not None]
        if front:
            calc_front = sum(front)
            if calc_front != totals.front_nine_score.value:
                fn_flags.append(
                    f"Front nine {totals.front_nine_score.value} != sum of holes 1-9: {calc_front}"
                )
                fn_val_conf = 0.2
    results["front_nine_score"] = (fn_val_conf, fn_flags)

    # Back nine
    bn_flags: List[str] = []
    bn_val_conf = 1.0
    if totals.back_nine_score.value is not None:
        back = [h.strokes.value for h in holes_list[9:18] if h.strokes.value is not None]
        if back:
            calc_back = sum(back)
            if calc_back != totals.back_nine_score.value:
                bn_flags.append(
                    f"Back nine {totals.back_nine_score.value} != sum of holes 10-18: {calc_back}"
                )
                bn_val_conf = 0.2
    results["back_nine_score"] = (bn_val_conf, bn_flags)

    # Front + back = total cross-check
    if (totals.front_nine_score.value is not None
            and totals.back_nine_score.value is not None
            and totals.total_score.value is not None):
        sum_halves = totals.front_nine_score.value + totals.back_nine_score.value
        if sum_halves != totals.total_score.value:
            msg = (
                f"Front ({totals.front_nine_score.value}) + "
                f"Back ({totals.back_nine_score.value}) = {sum_halves} != "
                f"Total ({totals.total_score.value})"
            )
            for key in ["total_score", "front_nine_score", "back_nine_score"]:
                conf, flags = results[key]
                results[key] = (min(conf, 0.3), flags + [msg])

    # Total putts
    tp_flags: List[str] = []
    tp_val_conf = 1.0
    if totals.total_putts.value is not None:
        hole_putts = [h.putts.value for h in holes_list if h.putts.value is not None]
        if hole_putts:
            calc_putts = sum(hole_putts)
            if calc_putts != totals.total_putts.value:
                tp_flags.append(
                    f"Total putts {totals.total_putts.value} != sum of hole putts {calc_putts}"
                )
                tp_val_conf = 0.2
    results["total_putts"] = (tp_val_conf, tp_flags)

    return results


def _validate_course_fields(raw: RawScorecardExtraction) -> Dict[str, Tuple[float, List[str]]]:
    """Validate course-level fields (full extraction only)."""
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
    source: str = "llm",
) -> FieldConfidence:
    final = FieldConfidence.compute_final(llm_confidence, val_conf)
    return FieldConfidence(
        field_name=field_name,
        llm_confidence=llm_confidence,
        validation_confidence=val_conf,
        validation_flags=val_flags,
        final_confidence=final,
        level=FieldConfidence.to_level(final),
        source=source,
    )


def _build_hole_confidence(
    hole_index: int,
    raw_hole,
    field_map: Dict[str, float],
    val_results: Dict[str, Tuple[float, List[str]]],
) -> HoleConfidence:
    """Build confidence for a single hole from field_map + validation results."""
    fields: Dict[str, FieldConfidence] = {}
    for fname, llm_conf in field_map.items():
        v_conf, v_flags = val_results.get(fname, (1.0, []))
        fields[fname] = _build_field_confidence(fname, llm_conf, v_conf, v_flags)

    non_null_finals = []
    for fc in fields.values():
        raw_field = getattr(raw_hole, fc.field_name, None)
        if raw_field is not None and getattr(raw_field, "value", None) is not None:
            non_null_finals.append(fc.final_confidence)
    hole_overall = min(non_null_finals) if non_null_finals else 0.0

    return HoleConfidence(
        hole_number=hole_index + 1,
        fields=fields,
        overall=hole_overall,
        level=FieldConfidence.to_level(hole_overall),
    )


def _assemble_extraction_confidence(
    hole_confidences: List[HoleConfidence],
    course_confidence: CourseConfidence,
    round_fields: Dict[str, FieldConfidence],
) -> ExtractionConfidence:
    """Assemble the final ExtractionConfidence from pre-built components."""
    all_finals = (
        [hc.overall for hc in hole_confidences]
        + [course_confidence.overall]
        + [fc.final_confidence for fc in round_fields.values()]
    )
    overall = min(all_finals) if all_finals else 0.0

    fields_needing_review = _collect_fields_needing_review(
        hole_confidences, course_confidence.fields, round_fields,
    )
    total_fields = (
        sum(len(hc.fields) for hc in hole_confidences)
        + len(course_confidence.fields)
        + len(round_fields)
    )

    return ExtractionConfidence(
        hole_scores=hole_confidences,
        course=course_confidence,
        round_fields=round_fields,
        overall=overall,
        level=FieldConfidence.to_level(overall),
        total_fields_extracted=total_fields,
        fields_needing_review=fields_needing_review,
    )


def _build_extraction_confidence(raw: RawScorecardExtraction) -> ExtractionConfidence:
    """Build the complete confidence report from full extraction data."""
    hole_confidences = []
    for i, raw_hole in enumerate(raw.holes):
        val_results = _validate_hole_score(raw_hole, i)
        field_map = {
            "hole_number": raw_hole.hole_number.confidence,
            "par": raw_hole.par.confidence,
            "handicap": raw_hole.handicap.confidence,
            "strokes": raw_hole.strokes.confidence,
            "putts": raw_hole.putts.confidence,
            "fairway_hit": raw_hole.fairway_hit.confidence,
            "green_in_regulation": raw_hole.green_in_regulation.confidence,
        }
        hole_confidences.append(_build_hole_confidence(i, raw_hole, field_map, val_results))

    # Course confidence
    course_val = _validate_course_fields(raw)
    course_llm_map: Dict[str, float] = {
        "name": raw.course.name.confidence,
        "location": raw.course.location.confidence,
        "par": raw.course.par.confidence,
    }
    for i, raw_tee in enumerate(raw.tees):
        tee_label = raw_tee.color.value or f"tee_{i}"
        course_llm_map[f"{tee_label}_color"] = raw_tee.color.confidence
        course_llm_map[f"{tee_label}_slope_rating"] = raw_tee.slope_rating.confidence
        course_llm_map[f"{tee_label}_course_rating"] = raw_tee.course_rating.confidence
        for yd_entry in raw_tee.hole_yardages:
            course_llm_map[f"{tee_label}_hole_{yd_entry.hole_number}_yardage"] = yd_entry.yardage.confidence

    course_fields: Dict[str, FieldConfidence] = {}
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

    # Round-level fields
    round_fields: Dict[str, FieldConfidence] = {}
    round_fields["date"] = _build_field_confidence("date", raw.date.confidence, 1.0, [])
    round_fields["player_name"] = _build_field_confidence("player_name", raw.player_name.confidence, 1.0, [])
    round_fields["notes"] = _build_field_confidence("notes", raw.notes.confidence, 1.0, [])
    totals_val = _validate_totals(raw.totals, raw.holes)
    for fname in ["total_score", "front_nine_score", "back_nine_score", "total_putts"]:
        llm_conf = getattr(raw.totals, fname).confidence
        v_conf, v_flags = totals_val.get(fname, (1.0, []))
        round_fields[fname] = _build_field_confidence(fname, llm_conf, v_conf, v_flags)

    return _assemble_extraction_confidence(hole_confidences, course_confidence, round_fields)


def _build_scores_only_confidence(
    raw: RawScoresOnlyExtraction, course: Course,
) -> ExtractionConfidence:
    """Build confidence report when course came from DB."""
    to_par = (raw.to_par_scoring.value is True)

    hole_confidences = []
    for i, raw_hole in enumerate(raw.holes):
        known_hole = course.get_hole(i + 1)
        val_results = _validate_score_only_hole(raw_hole, i, to_par, known_hole)
        field_map = {
            "hole_number": raw_hole.hole_number.confidence,
            "score": raw_hole.score.confidence,
            "putts": raw_hole.putts.confidence,
        }
        hole_confidences.append(_build_hole_confidence(i, raw_hole, field_map, val_results))

    course_confidence = CourseConfidence(
        fields={"source": _build_field_confidence("source", 1.0, 1.0, [], source="database")},
        overall=1.0,
        level=ConfidenceLevel.HIGH,
    )

    round_fields: Dict[str, FieldConfidence] = {}
    round_fields["date"] = _build_field_confidence("date", raw.date.confidence, 1.0, [])
    round_fields["player_name"] = _build_field_confidence("player_name", raw.player_name.confidence, 1.0, [])
    round_fields["to_par_scoring"] = _build_field_confidence(
        "to_par_scoring", raw.to_par_scoring.confidence, 1.0, [],
    )

    return _assemble_extraction_confidence(hole_confidences, course_confidence, round_fields)


def _collect_fields_needing_review(
    hole_confidences: List[HoleConfidence],
    course_fields: Dict[str, FieldConfidence],
    round_fields: Dict[str, FieldConfidence],
) -> List[str]:
    """Collect all fields at LOW or VERY_LOW confidence."""
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
    return fields_needing_review


# --- Result Model ---

class ExtractionResult(BaseGolfModel):
    """Complete result of a scorecard extraction."""
    round: Round
    confidence: ExtractionConfidence
    raw_response: Optional[dict] = None


# --- Strategy Orchestration ---

def _extract_full(
    client: genai.Client,
    file_part: types.Part,
    user_context: Optional[str],
    include_raw_response: bool,
) -> ExtractionResult:
    """Strategy 1: Full extraction (course + scores)."""
    prompt = build_full_extraction_prompt(user_context)
    raw = _call_gemini(client, file_part, prompt, RawScorecardExtraction)
    round_data = _build_round(raw)
    confidence = _build_extraction_confidence(raw)
    return ExtractionResult(
        round=round_data,
        confidence=confidence,
        raw_response=raw.model_dump() if include_raw_response else None,
    )


def _extract_scores_only(
    client: genai.Client,
    file_part: types.Part,
    course: Course,
    user_context: Optional[str],
    include_raw_response: bool,
) -> ExtractionResult:
    """Strategy 2: Scores-only extraction with known course."""
    prompt = build_scores_only_prompt(course, user_context)
    raw = _call_gemini(client, file_part, prompt, RawScoresOnlyExtraction)
    round_data = _build_round_from_scores(raw, course)
    confidence = _build_scores_only_confidence(raw, course)
    return ExtractionResult(
        round=round_data,
        confidence=confidence,
        raw_response=raw.model_dump() if include_raw_response else None,
    )


def _extract_smart(
    client: genai.Client,
    file_part: types.Part,
    course_repo: CourseRepository,
    user_context: Optional[str],
    include_raw_response: bool,
) -> ExtractionResult:
    """Strategy 3: Identify course first, then pick full or scores-only."""
    # Step 1: Lightweight course identification (Flash for speed)
    prompt = build_course_identification_prompt()
    course_id_raw = _call_gemini(
        client, file_part, prompt, RawCourseIdentification,
        model=GEMINI_MODEL_FAST,
    )

    # Step 2: Try to find course in DB
    course_name = course_id_raw.course_name.value
    course_location = course_id_raw.course_location.value
    found_course = None
    if course_name:
        found_course = course_repo.find_course_by_name(course_name, course_location)

    # Step 3: Dispatch to appropriate strategy
    if found_course is not None:
        return _extract_scores_only(
            client, file_part, found_course, user_context, include_raw_response,
        )
    else:
        return _extract_full(
            client, file_part, user_context, include_raw_response,
        )


# --- Public API ---

def extract_scorecard(
    file_path: str | Path,
    *,
    user_context: Optional[str] = None,
    include_raw_response: bool = False,
    strategy: ExtractionStrategy = ExtractionStrategy.FULL,
    course: Optional[Course] = None,
    course_repo: Optional[CourseRepository] = None,
) -> ExtractionResult:
    """Extract scorecard data from an image or PDF file.

    Args:
        file_path: Path to a JPG, PNG, PDF, or other supported file.
        user_context: Optional free-text instructions, e.g.:
            - "My name is Tucker"
            - "I write my scores as score to par (+1, -1, E)"
        include_raw_response: If True, includes the raw LLM JSON in the result.
        strategy: Which extraction strategy to use:
            - FULL: Extract everything from scratch (default, backward-compatible)
            - SCORES_ONLY: Course known; only extract player scores.
              Requires `course` parameter.
            - SMART: Auto-detect course, use scores-only if found in DB.
              Uses `course_repo` for lookups (defaults to NullCourseRepository).
        course: Required for SCORES_ONLY strategy. The known Course model.
        course_repo: Used by SMART strategy. Implements CourseRepository protocol.

    Returns:
        ExtractionResult containing the Round model and confidence scores.

    Raises:
        FileNotFoundError: If the file doesn't exist.
        ValueError: If the file type is unsupported, or required params missing.
        EnvironmentError: If GOOGLE_API_KEY is not set.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    file_part = _load_file_as_part(path)
    client = _create_client()

    if strategy == ExtractionStrategy.FULL:
        return _extract_full(client, file_part, user_context, include_raw_response)

    elif strategy == ExtractionStrategy.SCORES_ONLY:
        if course is None:
            raise ValueError(
                "SCORES_ONLY strategy requires the `course` parameter. "
                "Pass the known Course model from your database."
            )
        return _extract_scores_only(
            client, file_part, course, user_context, include_raw_response,
        )

    elif strategy == ExtractionStrategy.SMART:
        repo = course_repo or NullCourseRepository()
        return _extract_smart(
            client, file_part, repo, user_context, include_raw_response,
        )

    else:
        raise ValueError(f"Unknown strategy: {strategy}")