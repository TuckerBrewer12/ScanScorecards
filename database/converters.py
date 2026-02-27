"""Conversion between asyncpg database rows and Pydantic domain models.

Centralizes all mapping logic between the normalized DB schema
and the nested Pydantic models.
"""

from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID

from models import Course, Hole, Tee, HoleScore, Round, User, UserTee


# ================================================================
# Row -> Model (reads)
# ================================================================

def hole_from_row(row) -> Hole:
    """courses.holes row -> Hole model."""
    return Hole(
        number=row["hole_number"],
        par=row["par"],
        handicap=row["handicap"],
    )


def tee_from_row(tee_row, yardage_rows: list) -> Tee:
    """courses.tees row + courses.tee_yardages rows -> Tee model."""
    hole_yardages = {r["hole_number"]: r["yardage"] for r in yardage_rows}
    return Tee(
        color=tee_row["color"],
        slope_rating=float(tee_row["slope_rating"]) if tee_row["slope_rating"] else None,
        course_rating=float(tee_row["course_rating"]) if tee_row["course_rating"] else None,
        hole_yardages=hole_yardages,
    )


def course_from_rows(
    course_row,
    hole_rows: list,
    tee_rows: list,
    yardage_rows_by_tee: Dict[UUID, list],
) -> Course:
    """Assemble a full Course from DB rows across 4 tables."""
    holes = sorted(
        [hole_from_row(r) for r in hole_rows],
        key=lambda h: h.number or 0,
    )
    tees = [
        tee_from_row(tr, yardage_rows_by_tee.get(tr["id"], []))
        for tr in tee_rows
    ]
    return Course(
        id=str(course_row["id"]),
        name=course_row["name"],
        location=course_row["location"],
        par=course_row["par"],
        holes=holes,
        tees=tees,
        user_id=str(course_row["user_id"]) if course_row["user_id"] else None,
    )


def hole_score_from_row(row) -> HoleScore:
    """users.hole_scores row -> HoleScore model."""
    return HoleScore(
        hole_number=row["hole_number"],
        strokes=row["strokes"],
        net_score=row["net_score"],
        putts=row["putts"],
        shots_to_green=row["shots_to_green"],
        fairway_hit=row["fairway_hit"],
        green_in_regulation=row["green_in_regulation"],
        par_played=row["par_played"],
        handicap_played=row["handicap_played"],
    )


def round_from_rows(
    round_row,
    hole_score_rows: list,
    course: Optional[Course],
    tee_color: Optional[str] = None,
    user_tee: Optional["UserTee"] = None,
) -> Round:
    """Assemble a Round from DB rows + pre-loaded Course."""
    hole_scores = sorted(
        [hole_score_from_row(r) for r in hole_score_rows],
        key=lambda hs: hs.hole_number or 0,
    )
    return Round(
        id=str(round_row["id"]),
        course=course,
        tee_box=tee_color,
        date=round_row["round_date"],
        hole_scores=hole_scores,
        weather_conditions=round_row["weather_conditions"],
        notes=round_row["notes"],
        course_name_played=round_row["course_name_played"],
        user_tee=user_tee,
    )


def user_from_row(user_row, rounds: Optional[List[Round]] = None) -> User:
    """users.users row -> User model."""
    return User(
        id=str(user_row["id"]),
        name=user_row["name"],
        email=user_row["email"],
        home_course_id=str(user_row["home_course_id"]) if user_row["home_course_id"] else None,
        handicap=float(user_row["handicap_index"]) if user_row["handicap_index"] else None,
        rounds=rounds or [],
        created_at=user_row["created_at"],
    )


# ================================================================
# Model -> Row dict (writes)
# ================================================================

def course_to_row(course: Course, user_id: Optional[UUID] = None) -> dict:
    """Course -> dict for courses.courses INSERT."""
    return {
        "name": course.name,
        "location": course.location,
        "par": course.get_par(),
        "total_holes": len(course.holes) if course.holes else None,
        "user_id": user_id,
    }


def hole_to_row(hole: Hole, course_id: UUID) -> tuple:
    """Hole -> tuple for courses.holes INSERT (for executemany)."""
    return (course_id, hole.number, hole.par, hole.handicap)


def tee_to_row(tee: Tee, course_id: UUID) -> tuple:
    """Tee -> tuple for courses.tees INSERT."""
    return (course_id, tee.color, tee.slope_rating, tee.course_rating)


def tee_yardages_to_rows(tee: Tee, tee_id: UUID) -> list:
    """Tee.hole_yardages -> list of tuples for courses.tee_yardages INSERT."""
    return [
        (tee_id, hole_num, yardage)
        for hole_num, yardage in sorted(tee.hole_yardages.items())
    ]


def hole_score_to_row(hs: HoleScore, round_id: UUID, hole_id: Optional[UUID]) -> tuple:
    """HoleScore -> tuple for users.hole_scores INSERT (hole_id may be None)."""
    return (
        round_id, hole_id, hs.hole_number,
        hs.strokes, hs.net_score, hs.putts, hs.shots_to_green,
        hs.fairway_hit, hs.green_in_regulation,
        hs.par_played, hs.handicap_played,
    )


def round_to_row(
    round_: Round,
    user_id: UUID,
    course_id: Optional[UUID] = None,
    tee_id: Optional[UUID] = None,
) -> dict:
    """Round -> dict for users.rounds INSERT."""
    return {
        "user_id": user_id,
        "course_id": course_id,
        "tee_id": tee_id,
        "round_date": round_.date.date() if isinstance(round_.date, datetime) else round_.date,
        "total_score": round_.calculate_total_score(),
        "is_complete": round_.is_complete(),
        "holes_played": len([s for s in round_.hole_scores if s.strokes is not None]),
        "weather_conditions": round_.weather_conditions,
        "notes": round_.notes,
        "course_name_played": round_.course_name_played,
        "tee_box_played": round_.tee_box,
    }


def user_to_row(user: User) -> dict:
    """User -> dict for users.users INSERT."""
    return {
        "name": user.name,
        "email": user.email,
        "handicap_index": user.handicap,
        "home_course_id": UUID(user.home_course_id) if user.home_course_id else None,
    }


def user_tee_from_row(row) -> UserTee:
    """users.user_tees row -> UserTee model."""
    import json as _json
    hole_yardages = row["hole_yardages"] or {}
    if isinstance(hole_yardages, str):
        hole_yardages = _json.loads(hole_yardages)
    # Keys come back as strings from JSONB; convert to int
    return UserTee(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        course_id=str(row["course_id"]) if row["course_id"] else None,
        name=row["name"],
        slope_rating=float(row["slope_rating"]) if row["slope_rating"] else None,
        course_rating=float(row["course_rating"]) if row["course_rating"] else None,
        hole_yardages={int(k): v for k, v in hole_yardages.items()},
        created_at=row["created_at"],
    )


def user_tee_to_row(ut: UserTee) -> dict:
    """UserTee -> dict for users.user_tees INSERT."""
    return {
        "user_id": UUID(ut.user_id),
        "course_id": UUID(ut.course_id) if ut.course_id else None,
        "name": ut.name,
        "slope_rating": ut.slope_rating,
        "course_rating": ut.course_rating,
        "hole_yardages": {str(k): v for k, v in (ut.hole_yardages or {}).items()},
    }
