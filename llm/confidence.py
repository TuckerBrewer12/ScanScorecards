from enum import Enum
from pydantic import Field
from typing import Dict, List, Optional

from models.base import BaseGolfModel


class ConfidenceLevel(str, Enum):
    """Human-readable confidence buckets."""
    HIGH = "high"          # >= 0.85
    MEDIUM = "medium"      # >= 0.60
    LOW = "low"            # >= 0.30
    VERY_LOW = "very_low"  # < 0.30


class FieldConfidence(BaseGolfModel):
    """Confidence assessment for a single extracted field."""
    field_name: str
    llm_confidence: float = Field(..., ge=0.0, le=1.0)
    validation_confidence: float = Field(1.0, ge=0.0, le=1.0)
    validation_flags: List[str] = Field(default_factory=list)
    final_confidence: float = Field(..., ge=0.0, le=1.0)
    level: ConfidenceLevel

    @staticmethod
    def compute_final(llm_conf: float, val_conf: float) -> float:
        """Combine LLM and validation confidence.

        Validation acts as a ceiling: final = llm_conf * val_conf.
        If validation fails (0.0), final is 0 regardless of LLM confidence.
        """
        return round(llm_conf * val_conf, 4)

    @staticmethod
    def to_level(score: float) -> ConfidenceLevel:
        if score >= 0.85:
            return ConfidenceLevel.HIGH
        elif score >= 0.60:
            return ConfidenceLevel.MEDIUM
        elif score >= 0.30:
            return ConfidenceLevel.LOW
        return ConfidenceLevel.VERY_LOW


class HoleConfidence(BaseGolfModel):
    """Confidence for all fields extracted for a single hole."""
    hole_number: int = Field(..., ge=1, le=18)
    fields: Dict[str, FieldConfidence] = Field(default_factory=dict)
    overall: float = Field(..., ge=0.0, le=1.0)
    level: ConfidenceLevel


class CourseConfidence(BaseGolfModel):
    """Confidence for course-level fields."""
    fields: Dict[str, FieldConfidence] = Field(default_factory=dict)
    overall: float = Field(..., ge=0.0, le=1.0)
    level: ConfidenceLevel


class ExtractionConfidence(BaseGolfModel):
    """Top-level confidence report for the entire extraction."""
    hole_scores: List[HoleConfidence] = Field(default_factory=list)
    course: Optional[CourseConfidence] = None
    round_fields: Dict[str, FieldConfidence] = Field(default_factory=dict)
    overall: float = Field(..., ge=0.0, le=1.0)
    level: ConfidenceLevel
    total_fields_extracted: int = 0
    fields_needing_review: List[str] = Field(default_factory=list)