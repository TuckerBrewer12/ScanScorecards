from .golfcourse_api_service import GolfCourseAPIService
from .mistral_scorecard_parser import ParsedScorecardRows, ParsedTeeRow, parse_mistral_scorecard_rows

__all__ = [
    "GolfCourseAPIService",
    "MistralOCRService",
    "ParsedScorecardRows",
    "ParsedTeeRow",
    "parse_mistral_scorecard_rows",
]


def __getattr__(name: str):
    if name == "MistralOCRService":
        from .mistral_ocr_service import MistralOCRService

        return MistralOCRService
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
