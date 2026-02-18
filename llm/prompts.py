from pydantic import BaseModel, Field
from typing import List, Optional

from models import Course


# ================================================================
# Shared prompt fragments
# ================================================================

_PREAMBLE = "You are an expert golf scorecard reader."

_SCORING_FORMAT_INSTRUCTIONS = """
SCORING FORMAT:
Golfers record scores in different ways. Unless the user specifies otherwise, assume scores are written as TOTAL STROKES (e.g., "5" on a par 4 means 5 strokes). Other common formats:
- Score to par: Written as +1, -1, E (even), etc. relative to the hole's par. Convert these to total strokes using the hole's par (e.g., "+1" on a par 4 = 5 strokes).
- Net score: Score after handicap adjustment. The user will specify if this is the case.
- Circles/squares: Some golfers circle birdies or better, square bogeys or worse. The number inside is still the stroke count.

ALWAYS output the "strokes" field as TOTAL STROKES regardless of how the score was written on the card. If the user says they write score-to-par, you must convert: par + written_value = total strokes."""

_PLAYER_INSTRUCTIONS = """
MULTIPLE PLAYERS:
Scorecards often have rows for multiple players. If the user specifies their name, extract only that player's scores. If not specified and there are multiple players, extract the first/top row of scores."""

_CONFIDENCE_INSTRUCTIONS = """
CONFIDENCE:
For EVERY field you extract, provide both the value and your confidence (0.0 to 1.0) that you read it correctly.
- 1.0 = absolutely certain, clearly printed/written
- 0.7-0.9 = fairly confident, minor ambiguity
- 0.4-0.6 = uncertain, handwriting is messy or partially obscured
- 0.0-0.3 = guessing, very hard to read"""

_JSON_PREAMBLE = """
Return a JSON object with this exact structure. Use null for any field you cannot read at all.
Do NOT guess values you cannot see -- use null instead."""

_EXTRACTION_RULES = """
Important rules:
1. Include entries for all 18 holes (or 9 if it's a 9-hole card). Use null values for holes not present.
2. hole_number should always be sequential (1-18) with confidence 1.0.
3. For handwritten scores, report lower confidence if the digit is ambiguous (e.g., a 4 that might be a 9).
4. If the scorecard has front/back nine subtotals, extract those into totals.
5. Par values are typically printed, so they should have high confidence unless obscured.
6. Strokes and putts are typically handwritten, so be especially careful with confidence.
7. If scores are written in score-to-par format, your confidence for strokes should reflect BOTH your confidence reading the written value AND your confidence in the par used to convert."""

# --- JSON schema fragments ---

_COURSE_JSON_SCHEMA = """
  "course": {
    "name": {"value": "string or null", "confidence": 0.0},
    "location": {"value": "string or null", "confidence": 0.0},
    "par": {"value": "int or null", "confidence": 0.0}
  },
  "tees": [
    {
      "color": {"value": "string or null", "confidence": 0.0},
      "slope_rating": {"value": "float or null", "confidence": 0.0},
      "course_rating": {"value": "float or null", "confidence": 0.0},
      "hole_yardages": [
        {"hole_number": 1, "yardage": {"value": "int or null", "confidence": 0.0}}
      ]
    }
  ],"""

_FULL_HOLES_JSON_SCHEMA = """
    {
      "hole_number": {"value": 1, "confidence": 1.0},
      "par": {"value": "int or null", "confidence": 0.0},
      "handicap": {"value": "int or null", "confidence": 0.0},
      "strokes": {"value": "int or null", "confidence": 0.0},
      "putts": {"value": "int or null", "confidence": 0.0},
      "fairway_hit": {"value": "bool or null", "confidence": 0.0},
      "green_in_regulation": {"value": "bool or null", "confidence": 0.0}
    }"""

_SCORES_ONLY_HOLES_JSON_SCHEMA = """
    {
      "hole_number": {"value": 1, "confidence": 1.0},
      "score": {"value": "int or null", "confidence": 0.0},
      "putts": {"value": "int or null", "confidence": 0.0}
    }"""

_TOTALS_JSON_SCHEMA = """
  "totals": {
    "total_score": {"value": "int or null", "confidence": 0.0},
    "front_nine_score": {"value": "int or null", "confidence": 0.0},
    "back_nine_score": {"value": "int or null", "confidence": 0.0},
    "total_putts": {"value": "int or null", "confidence": 0.0}
  },
  "notes": {"value": "string or null", "confidence": 0.0}"""


def _append_user_context(prompt: str, user_context: Optional[str]) -> str:
    """Append user context to a prompt if provided."""
    if not user_context:
        return prompt
    return prompt + "\nADDITIONAL CONTEXT FROM THE USER:\n" + user_context + "\n"


# ================================================================
# Strategy 1: Full extraction prompt
# ================================================================

def _build_full_json_schema() -> str:
    return (
        "{\n"
        + _COURSE_JSON_SCHEMA + "\n"
        + '  "tee_played": {"value": "string or null", "confidence": 0.0},\n'
        + '  "date": {"value": "YYYY-MM-DD or null", "confidence": 0.0},\n'
        + '  "player_name": {"value": "string or null", "confidence": 0.0},\n'
        + '  "holes": [\n' + _FULL_HOLES_JSON_SCHEMA + "\n  ],\n"
        + _TOTALS_JSON_SCHEMA + "\n"
        + "}"
    )


def build_full_extraction_prompt(user_context: Optional[str] = None) -> str:
    """Build prompt for Strategy 1: extract everything from scratch."""
    prompt = (
        _PREAMBLE
        + " Extract all visible data from this golf scorecard image/document."
        + _SCORING_FORMAT_INSTRUCTIONS
        + _PLAYER_INSTRUCTIONS
        + _CONFIDENCE_INSTRUCTIONS
        + _JSON_PREAMBLE
        + "\nExtract ALL tee boxes visible on the scorecard (e.g., blue, white, red) "
        + "as separate entries in the tees array, each with their own yardages per hole.\n"
        + "Identify which tee the player played from (tee_played). This is usually "
        + "the tee row that aligns with the player's score row, or may be indicated by "
        + "a mark/circle on the card. If the user specifies their tee, use that over anything else.\n"
        + _build_full_json_schema()
        + _EXTRACTION_RULES
    )
    return _append_user_context(prompt, user_context)


# ================================================================
# Strategy 2: Scores-only prompt (course already known)
# ================================================================

def _format_course_context(course: Course) -> str:
    """Format a Course model into readable text for prompt injection."""
    lines = ["KNOWN COURSE DATA (authoritative -- do NOT re-extract from image):"]

    if course.name:
        lines.append(f"Course: {course.name}")
    if course.location:
        lines.append(f"Location: {course.location}")

    par = course.get_par()
    if par is not None:
        lines.append(f"Total Par: {par}")

    if course.holes:
        lines.append("")
        lines.append("Hole Details:")
        lines.append(f"{'Hole':<6}{'Par':<6}{'Handicap':<10}")
        for hole in course.holes:
            h_num = hole.number if hole.number is not None else "?"
            h_par = hole.par if hole.par is not None else "?"
            h_hcp = hole.handicap if hole.handicap is not None else "?"
            lines.append(f"{h_num:<6}{h_par:<6}{h_hcp:<10}")

    if course.tees:
        lines.append("")
        lines.append("Available Tees:")
        for tee in course.tees:
            parts = [f"- {tee.color or '?'}:"]
            if tee.slope_rating is not None:
                parts.append(f"slope {tee.slope_rating}")
            if tee.course_rating is not None:
                parts.append(f"rating {tee.course_rating}")
            lines.append(" ".join(parts))

    return "\n".join(lines)


def _build_scores_only_json_schema() -> str:
    return (
        "{\n"
        + '  "to_par_scoring": {"value": "bool", "confidence": 0.0},\n'
        + '  "date": {"value": "YYYY-MM-DD or null", "confidence": 0.0},\n'
        + '  "player_name": {"value": "string or null", "confidence": 0.0},\n'
        + '  "holes": [\n' + _SCORES_ONLY_HOLES_JSON_SCHEMA + "\n  ]\n"
        + "}"
    )


def build_scores_only_prompt(
    course: Course, user_context: Optional[str] = None
) -> str:
    """Build prompt for Strategy 2: extract only player scores.

    The LLM reads raw numbers from the card. Python handles all calculations.
    """
    course_context = _format_course_context(course)

    prompt = (
        _PREAMBLE
        + " Read ONLY the player's scores from this golf scorecard image/document.\n\n"
        + course_context + "\n"
        + "\nThe course data above is authoritative. Do NOT read course info from the card."
        + "\n\nYOUR JOB: Read the raw numbers written on the scorecard for each hole."
        + "\n- Set to_par_scoring to TRUE if scores are written as relative to par "
        + "(e.g., +1, -1, 0, E). Set to FALSE if scores are total strokes (e.g., 4, 5, 6)."
        + "\n- Report the score EXACTLY as written. Do NOT convert between formats. "
        + "If they wrote +1, report 1. If they wrote -1, report -1. If they wrote 5, report 5."
        + "\n- Report putts if visible, otherwise null."
        + "\n- Do NOT calculate totals. Just read hole-by-hole."
        + _PLAYER_INSTRUCTIONS
        + _CONFIDENCE_INSTRUCTIONS
        + _JSON_PREAMBLE + "\n"
        + _build_scores_only_json_schema()
        + "\n\nImportant rules:"
        + "\n1. Include entries for all 18 holes (or 9 if it's a 9-hole card). Use null for holes not present."
        + "\n2. hole_number should always be sequential (1-18) with confidence 1.0."
        + "\n3. For handwritten scores, report lower confidence if the digit is ambiguous."
        + "\n4. Report the score EXACTLY as you see it on the card. We will handle conversion."
    )
    return _append_user_context(prompt, user_context)


# ================================================================
# Strategy 3: Course identification prompt (lightweight first call)
# ================================================================

_COURSE_ID_JSON_SCHEMA = """{
  "course_name": {"value": "string or null", "confidence": 0.0},
  "course_location": {"value": "string or null", "confidence": 0.0}
}"""


def build_course_identification_prompt() -> str:
    """Build a lightweight prompt to extract just the course name and location."""
    return (
        _PREAMBLE
        + " Look at this golf scorecard and identify ONLY the course name and location. "
        + "Do not extract any scores, tee data, or other information.\n\n"
        + "Return a JSON object:\n"
        + _COURSE_ID_JSON_SCHEMA + "\n\n"
        + "Confidence: 1.0 if clearly printed, lower if obscured or ambiguous. "
        + "Use null if you cannot determine the value."
    )


# ================================================================
# Pydantic models for parsing raw LLM JSON responses
# ================================================================

# --- Annotated field wrappers ---

class AnnotatedStringField(BaseModel):
    value: Optional[str] = None
    confidence: float = Field(0.0, ge=0.0, le=1.0)


class AnnotatedIntField(BaseModel):
    value: Optional[int] = None
    confidence: float = Field(0.0, ge=0.0, le=1.0)


class AnnotatedFloatField(BaseModel):
    value: Optional[float] = None
    confidence: float = Field(0.0, ge=0.0, le=1.0)


class AnnotatedBoolField(BaseModel):
    value: Optional[bool] = None
    confidence: float = Field(0.0, ge=0.0, le=1.0)


# --- Full extraction models (Strategy 1) ---

class RawCourseData(BaseModel):
    name: AnnotatedStringField = AnnotatedStringField()
    location: AnnotatedStringField = AnnotatedStringField()
    par: AnnotatedIntField = AnnotatedIntField()


class RawTeeYardage(BaseModel):
    hole_number: int
    yardage: AnnotatedIntField = AnnotatedIntField()


class RawTeeData(BaseModel):
    color: AnnotatedStringField = AnnotatedStringField()
    slope_rating: AnnotatedFloatField = AnnotatedFloatField()
    course_rating: AnnotatedFloatField = AnnotatedFloatField()
    hole_yardages: List[RawTeeYardage] = Field(default_factory=list)


class RawHoleData(BaseModel):
    hole_number: AnnotatedIntField = AnnotatedIntField()
    par: AnnotatedIntField = AnnotatedIntField()
    handicap: AnnotatedIntField = AnnotatedIntField()
    strokes: AnnotatedIntField = AnnotatedIntField()
    putts: AnnotatedIntField = AnnotatedIntField()
    fairway_hit: AnnotatedBoolField = AnnotatedBoolField()
    green_in_regulation: AnnotatedBoolField = AnnotatedBoolField()


class RawTotalsData(BaseModel):
    total_score: AnnotatedIntField = AnnotatedIntField()
    front_nine_score: AnnotatedIntField = AnnotatedIntField()
    back_nine_score: AnnotatedIntField = AnnotatedIntField()
    total_putts: AnnotatedIntField = AnnotatedIntField()


class RawScorecardExtraction(BaseModel):
    """Complete raw extraction from the LLM, before domain model conversion."""
    course: RawCourseData = RawCourseData()
    tees: List[RawTeeData] = Field(default_factory=list)
    tee_played: AnnotatedStringField = AnnotatedStringField()
    date: AnnotatedStringField = AnnotatedStringField()
    player_name: AnnotatedStringField = AnnotatedStringField()
    holes: List[RawHoleData] = Field(default_factory=list)
    totals: RawTotalsData = RawTotalsData()
    notes: AnnotatedStringField = AnnotatedStringField()


# --- Scores-only models (Strategy 2) ---

class RawScoreOnlyHoleData(BaseModel):
    """Minimal hole data: just the raw score as written + putts."""
    hole_number: AnnotatedIntField = AnnotatedIntField()
    score: AnnotatedIntField = AnnotatedIntField()  # raw value as written on card
    putts: AnnotatedIntField = AnnotatedIntField()


class RawScoresOnlyExtraction(BaseModel):
    """Minimal extraction: LLM reads raw numbers, Python does the math."""
    to_par_scoring: AnnotatedBoolField = AnnotatedBoolField()  # True if scores are +1/-1/0 format
    date: AnnotatedStringField = AnnotatedStringField()
    player_name: AnnotatedStringField = AnnotatedStringField()
    holes: List[RawScoreOnlyHoleData] = Field(default_factory=list)


# --- Course identification model (Strategy 3 first call) ---

class RawCourseIdentification(BaseModel):
    """Lightweight response for course-name-only extraction."""
    course_name: AnnotatedStringField = AnnotatedStringField()
    course_location: AnnotatedStringField = AnnotatedStringField()