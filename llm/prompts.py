from pydantic import BaseModel, Field
from typing import List, Optional


# --- Prompt template---

SCORECARD_EXTRACTION_PROMPT = """You are an expert golf scorecard reader. Extract all visible data from this golf scorecard image/document.

SCORING FORMAT:
Golfers record scores in different ways. Unless the user specifies otherwise, assume scores are written as TOTAL STROKES (e.g., "5" on a par 4 means 5 strokes). Other common formats:
- Score to par: Written as +1, -1, E (even), etc. relative to the hole's par. Convert these to total strokes using the hole's par (e.g., "+1" on a par 4 = 5 strokes).
- Net score: Score after handicap adjustment. The user will specify if this is the case.
- Circles/squares: Some golfers circle birdies or better, square bogeys or worse. The number inside is still the stroke count.

ALWAYS output the "strokes" field as TOTAL STROKES regardless of how the score was written on the card. If the user says they write score-to-par, you must convert: par + written_value = total strokes.

MULTIPLE PLAYERS:
Scorecards often have rows for multiple players. If the user specifies their name, extract only that player's scores. If not specified and there are multiple players, extract the first/top row of scores.

CONFIDENCE:
For EVERY field you extract, provide both the value and your confidence (0.0 to 1.0) that you read it correctly.
- 1.0 = absolutely certain, clearly printed/written
- 0.7-0.9 = fairly confident, minor ambiguity
- 0.4-0.6 = uncertain, handwriting is messy or partially obscured
- 0.0-0.3 = guessing, very hard to read

Return a JSON object with this exact structure. Use null for any field you cannot read at all.
Extract ALL tee boxes visible on the scorecard (e.g., blue, white, red) as separate entries in the tees array, each with their own yardages per hole.
Do NOT guess values you cannot see -- use null instead.

{
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
  ],
  "date": {"value": "YYYY-MM-DD or null", "confidence": 0.0},
  "player_name": {"value": "string or null", "confidence": 0.0},
  "holes": [
    {
      "hole_number": {"value": 1, "confidence": 1.0},
      "par": {"value": "int or null", "confidence": 0.0},
      "handicap": {"value": "int or null", "confidence": 0.0},
      "strokes": {"value": "int or null", "confidence": 0.0},
      "putts": {"value": "int or null", "confidence": 0.0},
      "fairway_hit": {"value": "bool or null", "confidence": 0.0},
      "green_in_regulation": {"value": "bool or null", "confidence": 0.0}
    }
  ],
  "totals": {
    "total_score": {"value": "int or null", "confidence": 0.0},
    "front_nine_score": {"value": "int or null", "confidence": 0.0},
    "back_nine_score": {"value": "int or null", "confidence": 0.0},
    "total_putts": {"value": "int or null", "confidence": 0.0}
  },
  "notes": {"value": "string or null", "confidence": 0.0}
}

Important rules:
1. Include entries for all 18 holes (or 9 if it's a 9-hole card). Use null values for holes not present.
2. hole_number should always be sequential (1-18) with confidence 1.0.
3. For handwritten scores, report lower confidence if the digit is ambiguous (e.g., a 4 that might be a 9).
4. If the scorecard has front/back nine subtotals, extract those into totals.
5. Par values are typically printed, so they should have high confidence unless obscured.
6. Strokes and putts are typically handwritten, so be especially careful with confidence.
7. If scores are written in score-to-par format, your confidence for strokes should reflect BOTH your confidence reading the written value AND your confidence in the par used to convert.
"""


def build_prompt(user_context: Optional[str] = None) -> str:
    """Build the final extraction prompt, appending optional user context.

    Args:
        user_context: Free-text instructions from the user, e.g.:
            - "My name is Tucker"
            - "I write my scores as score to par (+1, -1, E)"
            - "My name is Tucker. I record score to par. I played from the blue tees."

    Returns:
        The complete prompt string to send to Gemini.
    """
    if not user_context:
        return SCORECARD_EXTRACTION_PROMPT

    return (
        SCORECARD_EXTRACTION_PROMPT
        + "\nADDITIONAL CONTEXT FROM THE USER:\n"
        + user_context
        + "\n"
    )


# --- Pydantic models for parsing the raw LLM JSON response ---

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
    date: AnnotatedStringField = AnnotatedStringField()
    player_name: AnnotatedStringField = AnnotatedStringField()
    holes: List[RawHoleData] = Field(default_factory=list)
    totals: RawTotalsData = RawTotalsData()
    notes: AnnotatedStringField = AnnotatedStringField()