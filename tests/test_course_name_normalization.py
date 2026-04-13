from api.input_validation import normalize_course_display_name
from api.request_models import SaveRoundRequest


def test_normalize_course_display_name_title_cases_words():
    assert normalize_course_display_name("half moon BAY golf links") == "Half Moon Bay Golf Links"


def test_save_round_request_normalizes_course_name():
    req = SaveRoundRequest(
        hole_scores=[{"hole_number": 1, "strokes": 4}],
        course_name="half moon bay golf links",
    )
    assert req.course_name == "Half Moon Bay Golf Links"
