import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from database.repositories.course_repo import CourseRepositoryDB
from database.repositories.round_repo import RoundRepositoryDB
from database.repositories.user_tee_repo import UserTeeRepositoryDB
from database.converters import (
    hole_score_from_row,
    hole_score_to_row,
    round_from_rows,
    round_to_row,
    user_tee_from_row,
)
from models import Course, Hole, Tee, Round, HoleScore, UserTee


# ================================================================
# Fixtures
# ================================================================

@pytest.fixture
def mock_pool():
    pool = MagicMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__.return_value = conn
    return pool, conn


def _round_row(round_id, *, course_id=None, course_name_played=None, tee_box_played=None, total_score=80):
    """Helper: minimal users.rounds row dict."""
    return {
        "id": round_id,
        "user_id": uuid4(),
        "course_id": course_id,
        "tee_id": None,
        "round_date": None,
        "total_score": total_score,
        "adjusted_gross_score": None,
        "score_differential": None,
        "is_complete": True,
        "holes_played": 18,
        "weather_conditions": None,
        "notes": None,
        "course_name_played": course_name_played,
        "tee_box_played": tee_box_played,
        "user_tee_id": None,
    }


def _hole_score_row(*, hole_number=1, strokes=5, par_played=4, handicap_played=7):
    """Helper: minimal users.hole_scores row dict."""
    return {
        "hole_number": hole_number,
        "strokes": strokes,
        "net_score": None,
        "putts": 2,
        "shots_to_green": 3,
        "fairway_hit": True,
        "green_in_regulation": False,
        "par_played": par_played,
        "handicap_played": handicap_played,
    }


# ================================================================
# converters.py — pure function tests (no mocks needed)
# ================================================================

def test_hole_score_converter_maps_par_played():
    """hole_score_from_row correctly maps par_played and handicap_played."""
    row = _hole_score_row(strokes=5, par_played=4, handicap_played=7)
    hs = hole_score_from_row(row)

    assert hs.par_played == 4
    assert hs.handicap_played == 7
    assert hs.to_par() == 1          # 5 - 4, using par_played fallback
    assert hs.get_score_type() == "bogey"


def test_hole_score_converter_null_par_played():
    """hole_score_from_row handles NULL par_played gracefully."""
    row = _hole_score_row(par_played=None, handicap_played=None)
    hs = hole_score_from_row(row)
    assert hs.par_played is None
    assert hs.to_par() is None


def test_hole_score_to_row_includes_par_played():
    """hole_score_to_row produces an 11-element tuple with par_played at index 9."""
    hs = HoleScore(hole_number=1, strokes=5, par_played=4, handicap_played=7)
    rid = uuid4()
    row = hole_score_to_row(hs, rid, None)

    assert len(row) == 11
    assert row[0] == rid           # round_id
    assert row[1] is None          # hole_id (nullable)
    assert row[2] == 1             # hole_number
    assert row[3] == 5             # strokes
    assert row[9] == 4             # par_played
    assert row[10] == 7            # handicap_played


def test_hole_score_to_row_null_hole_id():
    """hole_score_to_row accepts None hole_id for rounds without a master course."""
    hs = HoleScore(hole_number=3, strokes=4, par_played=3)
    row = hole_score_to_row(hs, uuid4(), None)
    assert row[1] is None


def test_round_converter_maps_course_name_played():
    """round_from_rows correctly maps course_name_played."""
    rid = uuid4()
    row = _round_row(rid, course_name_played="Eagle Vines Golf Club")
    r = round_from_rows(row, [], None)

    assert r.id == str(rid)
    assert r.course_name_played == "Eagle Vines Golf Club"
    assert r.course is None


def test_round_converter_hole_scores_sorted():
    """round_from_rows sorts hole scores by hole_number."""
    rid = uuid4()
    row = _round_row(rid)
    score_rows = [
        _hole_score_row(hole_number=3, strokes=4, par_played=4),
        _hole_score_row(hole_number=1, strokes=5, par_played=4),
        _hole_score_row(hole_number=2, strokes=3, par_played=3),
    ]
    r = round_from_rows(row, score_rows, None)

    assert [hs.hole_number for hs in r.hole_scores] == [1, 2, 3]


def test_user_tee_converter_roundtrip():
    """user_tee_from_row correctly maps all fields including JSONB hole_yardages."""
    tid = uuid4()
    row = {
        "id": tid,
        "user_id": uuid4(),
        "course_id": None,
        "name": "My Tee",
        "slope_rating": 120,
        "course_rating": 72.0,
        "hole_yardages": {"1": 400, "9": 350},  # JSONB keys are strings
        "created_at": None,
    }
    ut = user_tee_from_row(row)

    assert ut.id == str(tid)
    assert ut.name == "My Tee"
    assert ut.slope_rating == 120.0
    assert ut.hole_yardages == {1: 400, 9: 350}   # keys converted to int


# ================================================================
# CourseRepositoryDB
# ================================================================

@pytest.mark.asyncio
async def test_course_repo_get_course(mock_pool):
    pool, conn = mock_pool
    repo = CourseRepositoryDB(pool)

    course_id = uuid4()
    conn.fetchrow.return_value = {
        "id": course_id, "name": "Test", "location": "Loc",
        "par": 72, "total_holes": 18, "metadata": "{}", "user_id": None,
    }
    conn.fetch.side_effect = [
        [],  # holes
        [],  # tees
    ]

    c = await repo.get_course(str(course_id))
    assert c is not None
    assert c.name == "Test"
    assert c.user_id is None


@pytest.mark.asyncio
async def test_course_repo_get_course_not_found(mock_pool):
    pool, conn = mock_pool
    repo = CourseRepositoryDB(pool)
    conn.fetchrow.return_value = None

    c = await repo.get_course(str(uuid4()))
    assert c is None


@pytest.mark.asyncio
async def test_course_repo_create_course(mock_pool):
    pool, conn = mock_pool
    repo = CourseRepositoryDB(pool)

    conn.transaction = MagicMock()
    conn.transaction.return_value.__aenter__.return_value = AsyncMock()

    course_id = uuid4()
    tee_id = uuid4()
    conn.fetchrow.side_effect = [
        {"id": course_id, "name": "New Course", "location": "Loc",
         "par": 72, "total_holes": 18, "metadata": "{}", "user_id": None},
        {"id": tee_id},
    ]
    conn.fetch.side_effect = [
        [],  # holes (assembly)
        [],  # tees  (assembly)
    ]

    course = Course(name="New Course", location="Loc",
                    holes=[Hole(number=1, par=4)], tees=[Tee(color="Red")])
    saved = await repo.create_course(course)

    assert saved.name == "New Course"
    # Verify holes were inserted via executemany
    conn.executemany.assert_called()


# ================================================================
# RoundRepositoryDB
# ================================================================

@pytest.mark.asyncio
async def test_round_repo_get_round(mock_pool):
    pool, conn = mock_pool
    repo = RoundRepositoryDB(pool, course_repo=AsyncMock())

    round_id = uuid4()
    conn.fetchrow.return_value = _round_row(round_id, course_name_played="Test Name")
    conn.fetch.return_value = []

    r = await repo.get_round(str(round_id))
    assert r is not None
    assert r.course_name_played == "Test Name"


@pytest.mark.asyncio
async def test_round_repo_get_round_not_found(mock_pool):
    pool, conn = mock_pool
    repo = RoundRepositoryDB(pool, course_repo=AsyncMock())
    conn.fetchrow.return_value = None

    r = await repo.get_round(str(uuid4()))
    assert r is None


@pytest.mark.asyncio
async def test_round_repo_create_round_no_course(mock_pool):
    """create_round with no course: hole_id=None, par_played from HoleScore preserved."""
    pool, conn = mock_pool
    repo = RoundRepositoryDB(pool, course_repo=AsyncMock())

    conn.transaction = MagicMock()
    conn.transaction.return_value.__aenter__.return_value = AsyncMock()

    round_id = uuid4()
    row = _round_row(round_id, course_name_played="New Round")
    # fetchrow called twice: INSERT round, then SELECT in get_round
    conn.fetchrow.side_effect = [row, row]
    conn.fetch.return_value = []  # hole_scores in _assemble_round

    r = Round(
        hole_scores=[HoleScore(hole_number=1, strokes=4, par_played=4)],
        course_name_played="New Round",
    )
    saved = await repo.create_round(r, user_id=str(uuid4()))

    assert saved is not None
    assert saved.course_name_played == "New Round"

    # Verify the hole score INSERT included par_played (11 columns, $10 = par_played)
    conn.executemany.assert_called_once()
    sql, tuples = conn.executemany.call_args[0]
    assert "par_played" in sql
    assert len(tuples) == 1
    assert tuples[0][1] is None   # hole_id is NULL (no master course)
    assert tuples[0][9] == 4      # par_played preserved from HoleScore


@pytest.mark.asyncio
async def test_round_repo_create_round_populates_par_from_course(mock_pool):
    """create_round populates par_played from course.holes when par_played is None."""
    pool, conn = mock_pool
    course_repo_mock = AsyncMock()
    repo = RoundRepositoryDB(pool, course_repo=course_repo_mock)

    conn.transaction = MagicMock()
    conn.transaction.return_value.__aenter__.return_value = AsyncMock()

    round_id = uuid4()
    hole_id = uuid4()
    course_id = uuid4()

    row = _round_row(round_id, course_id=course_id)
    conn.fetchrow.side_effect = [row, row]
    conn.fetch.side_effect = [
        [{"id": hole_id, "hole_number": 1}],  # _load_hole_id_map
        [],                                     # hole_scores in _assemble_round
    ]

    course = Course(id=str(course_id), name="Test", holes=[Hole(number=1, par=4)])
    # get_round (called after insert) assembles a Round via course_repo.get_course;
    # return None so it doesn't try to validate an AsyncMock as a Course.
    course_repo_mock.get_course = AsyncMock(return_value=None)

    r = Round(
        course=course,
        hole_scores=[HoleScore(hole_number=1, strokes=4, par_played=None)],
    )
    saved = await repo.create_round(r, user_id=str(uuid4()), course_id=str(course_id))

    assert saved is not None
    sql, tuples = conn.executemany.call_args[0]
    assert tuples[0][1] == hole_id  # hole_id resolved from map
    assert tuples[0][9] == 4        # par_played populated from course.holes


# ================================================================
# UserTeeRepositoryDB
# ================================================================

@pytest.mark.asyncio
async def test_user_tee_repo_get(mock_pool):
    pool, conn = mock_pool
    repo = UserTeeRepositoryDB(pool)

    tee_id = uuid4()
    conn.fetchrow.return_value = {
        "id": tee_id, "user_id": uuid4(), "course_id": None,
        "name": "My Tee", "slope_rating": 120, "course_rating": 72.0,
        "hole_yardages": {"1": 400}, "created_at": None,
    }

    t = await repo.get_user_tee(str(tee_id))
    assert t.name == "My Tee"
    assert t.hole_yardages == {1: 400}


@pytest.mark.asyncio
async def test_user_tee_repo_get_not_found(mock_pool):
    pool, conn = mock_pool
    repo = UserTeeRepositoryDB(pool)
    conn.fetchrow.return_value = None

    t = await repo.get_user_tee(str(uuid4()))
    assert t is None


@pytest.mark.asyncio
async def test_user_tee_repo_create(mock_pool):
    pool, conn = mock_pool
    repo = UserTeeRepositoryDB(pool)

    tee_id = uuid4()
    user_id = uuid4()
    conn.fetchrow.return_value = {
        "id": tee_id, "user_id": user_id, "course_id": None,
        "name": "White", "slope_rating": 113, "course_rating": 70.5,
        "hole_yardages": {}, "created_at": None,
    }

    ut = UserTee(user_id=str(user_id), name="White", slope_rating=113, course_rating=70.5)
    created = await repo.create_user_tee(ut)

    assert created.name == "White"
    assert created.slope_rating == 113.0
    # Verify INSERT was called
    conn.fetchrow.assert_called_once()
    sql = conn.fetchrow.call_args[0][0]
    assert "INSERT INTO users.user_tees" in sql


@pytest.mark.asyncio
async def test_user_tee_repo_delete(mock_pool):
    pool, conn = mock_pool
    repo = UserTeeRepositoryDB(pool)

    conn.execute.return_value = "DELETE 1"
    deleted = await repo.delete_user_tee(str(uuid4()))
    assert deleted is True

    conn.execute.return_value = "DELETE 0"
    deleted = await repo.delete_user_tee(str(uuid4()))
    assert deleted is False
