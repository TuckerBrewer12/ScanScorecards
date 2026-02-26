import pytest
from datetime import datetime
from pydantic import ValidationError

from models import Course, Hole, Tee, HoleScore, Round, User, UserTee


# ================================================================
# Hole
# ================================================================

def test_hole_validation():
    h = Hole(number=1, par=4, handicap=18)
    assert h.number == 1
    assert h.par == 4

    with pytest.raises(ValidationError):
        Hole(number=1, par=7)          # par > 6

    with pytest.raises(ValidationError):
        Hole(number=1, handicap=19)    # handicap > 18


# ================================================================
# Tee
# ================================================================

def test_tee_validation_and_calculations():
    tee = Tee(
        color="Blue",
        slope_rating=115,
        course_rating=70.0,
        hole_yardages={1: 400, 2: 350}
    )
    assert tee.get_total_yardage() == 750
    assert tee.get_hole_yardage(1) == 400
    assert tee.get_hole_yardage(3) is None

    with pytest.raises(ValidationError):
        Tee(hole_yardages={19: 400})   # hole > 18

    with pytest.raises(ValidationError):
        Tee(hole_yardages={1: -50})    # negative yardage

    with pytest.raises(ValidationError):
        Tee(hole_yardages={1: 800})    # yardage > 700


def test_tee_empty_yardages():
    tee = Tee(color="Red")
    assert tee.get_total_yardage() is None   # returns None, not 0, when no yardages
    assert tee.get_hole_yardage(1) is None


# ================================================================
# Course
# ================================================================

def test_course_par_calculations():
    holes = [Hole(number=i, par=4, handicap=i) for i in range(1, 19)]
    course = Course(name="Test Course", holes=holes)

    assert course.calculated_par == 72
    assert course.front_nine_par == 36
    assert course.back_nine_par == 36
    assert course.get_par() == 72

    # Missing par on a hole makes calculated_par None
    holes[0].par = None
    assert course.calculated_par is None
    assert course.front_nine_par is None

    # Explicit par field overrides calculated
    course.par = 71
    assert course.get_par() == 71


def test_course_lookups():
    holes = [Hole(number=1, par=4)]
    tees = [Tee(color="White"), Tee(color="Blue")]
    course = Course(holes=holes, tees=tees)

    assert course.get_hole(1).par == 4
    assert course.get_hole(2) is None

    assert course.get_tee("blue").color == "Blue"  # case-insensitive
    assert course.get_tee("Red") is None


# ================================================================
# HoleScore
# ================================================================

def test_hole_score_validation_and_logic():
    with pytest.raises(ValidationError):
        HoleScore(strokes=4, putts=5)  # putts > strokes

    hs = HoleScore(hole_number=1, strokes=5, putts=2, par_played=4)
    assert hs.to_par() == 1
    assert hs.get_score_type() == "bogey"

    # Explicit par arg overrides par_played
    assert hs.to_par(par=5) == 0
    assert hs.get_score_type(par=5) == "par"

    # Common score types via par_played
    assert HoleScore(strokes=3, par_played=5).get_score_type() == "eagle"
    assert HoleScore(strokes=3, par_played=4).get_score_type() == "birdie"
    assert HoleScore(strokes=6, par_played=4).get_score_type() == "double bogey"
    assert HoleScore(strokes=7, par_played=4).get_score_type() == "triple bogey"

    # None strokes → always None
    assert HoleScore(strokes=None, par_played=4).to_par() is None
    assert HoleScore(strokes=None, par_played=None).get_score_type() is None


def test_hole_score_par_played_validation():
    # Boundary values
    assert HoleScore(strokes=3, par_played=3).par_played == 3
    assert HoleScore(strokes=6, par_played=6).par_played == 6

    with pytest.raises(ValidationError):
        HoleScore(strokes=3, par_played=2)   # par < 3

    with pytest.raises(ValidationError):
        HoleScore(strokes=3, par_played=7)   # par > 6

    with pytest.raises(ValidationError):
        HoleScore(strokes=3, handicap_played=0)   # handicap < 1

    with pytest.raises(ValidationError):
        HoleScore(strokes=3, handicap_played=19)  # handicap > 18


def test_hole_score_to_par_no_par_data():
    """to_par and get_score_type return None when neither par arg nor par_played is set."""
    hs = HoleScore(strokes=5)  # no par_played
    assert hs.to_par() is None
    assert hs.get_score_type() is None


def test_score_type_extremes():
    # Albatross: ≤ −3
    assert HoleScore(strokes=2, par_played=5).get_score_type() == "albatross"
    assert HoleScore(strokes=3, par_played=6).get_score_type() == "albatross"

    # 5+ over
    assert HoleScore(strokes=9, par_played=4).get_score_type() == "5+ over"
    assert HoleScore(strokes=10, par_played=4).get_score_type() == "5+ over"


# ================================================================
# Round
# ================================================================

def test_round_property_aggregations():
    scores = [
        HoleScore(hole_number=1, strokes=4, putts=2, green_in_regulation=True,  par_played=4),
        HoleScore(hole_number=2, strokes=5, putts=1, green_in_regulation=False, par_played=4),
    ]
    r = Round(hole_scores=scores)
    assert r.calculate_total_score() == 9
    assert r.get_total_putts() == 3
    assert r.get_total_gir() == 1
    assert not r.is_complete()


def test_round_nine_hole_calculations():
    # 9-hole round
    scores = [HoleScore(hole_number=i, strokes=4) for i in range(1, 10)]
    r = Round(hole_scores=scores)

    assert r.calculate_front_nine() == 36
    assert r.calculate_back_nine() is None
    assert r.is_complete()

    # 18-hole round
    scores_18 = [HoleScore(hole_number=i, strokes=i % 2 + 4) for i in range(1, 19)]
    r18 = Round(hole_scores=scores_18)
    assert r18.calculate_front_nine() == sum(i % 2 + 4 for i in range(1, 10))
    assert r18.calculate_back_nine() == sum(i % 2 + 4 for i in range(10, 19))
    assert r18.is_complete()


def test_round_to_par_with_course():
    holes = [Hole(number=i, par=4) for i in range(1, 19)]
    course = Course(holes=holes)
    scores = [HoleScore(hole_number=i, strokes=5) for i in range(1, 19)]  # +1 each

    r = Round(course=course, hole_scores=scores)
    assert r.get_hole_par(1) == 4
    assert r.get_par() == 72
    assert r.score_to_par(1) == 1
    assert r.total_to_par() == 18


def test_round_to_par_without_course_fallback():
    """par_played on hole scores is used when no course is attached."""
    scores = [HoleScore(hole_number=i, strokes=5, par_played=4) for i in range(1, 19)]

    r = Round(hole_scores=scores)  # no course
    assert r.get_hole_par(1) == 4
    assert r.get_par() == 72
    assert r.score_to_par(1) == 1
    assert r.total_to_par() == 18


def test_round_total_to_par_no_par_data():
    """total_to_par returns None when no course and no par_played on scores."""
    scores = [HoleScore(hole_number=i, strokes=5) for i in range(1, 19)]
    r = Round(hole_scores=scores)
    assert r.get_par() is None
    assert r.total_to_par() is None


def test_round_score_to_par_no_par_data():
    """score_to_par returns None for a specific hole when no par data available."""
    r = Round(hole_scores=[HoleScore(hole_number=1, strokes=5)])
    assert r.score_to_par(1) is None  # no par source → None


def test_round_gets_correct_tee():
    course = Course(tees=[Tee(color="White")])
    r = Round(course=course, tee_box="white")
    assert r.get_tee() is not None
    assert r.get_tee().color == "White"


def test_round_get_tee_returns_none_without_course():
    r = Round(tee_box="White")  # no course attached
    assert r.get_tee() is None


def test_round_get_hole_score_out_of_range():
    r = Round(hole_scores=[HoleScore(hole_number=1, strokes=4)])
    assert r.get_hole_score(0) is None   # below range
    assert r.get_hole_score(2) is None   # beyond available scores


def test_round_course_name_played():
    r = Round(course_name_played="Eagle Vines Golf Club")
    assert r.course_name_played == "Eagle Vines Golf Club"
    # No par data → total_to_par is still None
    assert r.get_par() is None
    assert r.total_to_par() is None


# ================================================================
# UserTee
# ================================================================

def test_user_tee_validation():
    ut = UserTee(user_id="user1", name="Custom Tee", slope_rating=120, course_rating=72.0)
    assert ut.slope_rating == 120

    with pytest.raises(ValidationError):
        UserTee(user_id="user1", name="t", slope_rating=50)   # slope < 55

    with pytest.raises(ValidationError):
        UserTee(user_id="user1", name="t", slope_rating=156)  # slope > 155

    with pytest.raises(ValidationError):
        UserTee(user_id="user1", name="t", course_rating=90)  # rating > 85
