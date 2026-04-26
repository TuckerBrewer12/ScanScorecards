"""Stats/dashboard API endpoints."""

from datetime import date, datetime, timedelta
from typing import Literal, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from database.db_manager import DatabaseManager
from api.dependencies import get_current_user, get_db
from api.input_validation import ensure_uuid_str
from models import User
from api.schemas import DashboardResponse, RoundSummaryResponse
from analytics import stats as analytics
from analytics import handicap as hcap

router = APIRouter()


@router.get("/dashboard/{user_id}", response_model=DashboardResponse)
async def get_dashboard(
    user_id: UUID,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if str(current_user.id) != str(user_id):
        raise HTTPException(403, "Forbidden")
    user = await db.users.get_user(str(user_id))
    if not user:
        raise HTTPException(404, "User not found")

    # Single aggregate query for all summary stats (no hole_score fetches)
    summaries = await db.rounds.get_round_summaries_for_user(str(user_id), limit=500, offset=0)

    scores = [r["total_score"] for r in summaries if r["total_score"] is not None]
    putts = [r["total_putts"] for r in summaries if r["total_putts"] is not None]
    girs = [r["total_gir"] for r in summaries if r["total_gir"] is not None]

    best_score = min(scores) if scores else None
    best_round_id = None
    best_course = None
    if best_score is not None:
        for r in summaries:
            if r["total_score"] == best_score:
                best_round_id = str(r["id"])
                best_course = r["course_name"]
                break

    # Build recent_rounds response objects from summaries (first 5)
    def _summary_to_response(row: dict) -> RoundSummaryResponse:
        return RoundSummaryResponse(
            id=str(row["id"]),
            course_id=str(row["course_id"]) if row["course_id"] else None,
            course_name=row["course_name"],
            course_location=row["course_location"],
            course_par=row["course_par"],
            tee_box=row["tee_box"],
            date=row["round_date"],
            total_score=row["total_score"],
            to_par=(
                (row["total_score"] - row["course_par"])
                if row["total_score"] is not None and row["course_par"] is not None
                else None
            ),
            front_nine=row["front_nine"],
            back_nine=row["back_nine"],
            total_putts=row["total_putts"],
            total_gir=row["total_gir"],
            fairways_hit=row["fairways_hit"],
            notes=row["notes"],
        )

    recent_rounds = [_summary_to_response(r) for r in summaries[:5]]

    # Handicap index only needs the last 20 rounds (full model required for differentials)
    hi_rounds_desc = await db.rounds.get_rounds_for_user(str(user_id), limit=20, offset=0)
    rounds_chrono = list(reversed(hi_rounds_desc))
    calculated_hi = hcap.handicap_index(rounds_chrono)

    return DashboardResponse(
        total_rounds=len(summaries),
        scoring_average=round(sum(scores) / len(scores), 1) if scores else None,
        best_round=best_score,
        best_round_id=best_round_id,
        best_round_course=best_course,
        handicap_index=calculated_hi,
        recent_rounds=recent_rounds,
        average_putts=round(sum(putts) / len(putts), 1) if putts else None,
        average_gir=round(sum(girs) / len(girs), 1) if girs else None,
    )


def _build_handicap_trend(hi_rounds, display_rounds):
    """Compute rolling HI trend from hi_rounds, slice to display window, then annotate
    used_in_hi based only on the displayed rounds so green count matches WHS best-N."""
    full = hcap.handicap_trend(hi_rounds)
    sliced = full[-len(display_rounds):]
    hcap.annotate_used_in_hi(sliced)
    return sliced


@router.get("/analytics/{user_id}")
async def get_analytics(
    user_id: UUID,
    limit: int = Query(default=50, ge=1, le=500),
    course_id: Optional[str] = Query(default=None),
    timeframe: Optional[Literal["ytd", "1y"]] = Query(default=None),
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    viewer_id = str(current_user.id)
    target_user_id = str(user_id)
    can_view = viewer_id == target_user_id or await db.friendships.are_friends(viewer_id, target_user_id)
    if not can_view:
        raise HTTPException(403, "Forbidden")
    user = await db.users.get_user(target_user_id)
    if not user:
        raise HTTPException(404, "User not found")

    # Resolve course_id filter
    resolved_course_id: Optional[str] = None
    if course_id and course_id not in ("all", ""):
        if course_id == "home":
            resolved_course_id = str(user.home_course_id) if user.home_course_id else None
        else:
            try:
                resolved_course_id = ensure_uuid_str(course_id, "course_id")
            except ValueError as exc:
                raise HTTPException(422, str(exc))

    # Resolve date_from filter
    date_from: Optional[date] = None
    today = date.today()
    if timeframe == "ytd":
        date_from = date(today.year, 1, 1)
    elif timeframe == "1y":
        date_from = today - timedelta(days=365)

    # DB returns newest-first; reverse for chronological trend ordering
    rounds_desc = await db.rounds.get_rounds_for_user(
        target_user_id, limit=limit, offset=0,
        course_id=resolved_course_id,
        date_from=date_from,
    )
    rounds = list(reversed(rounds_desc))

    # Fetch up to 19 extra rounds so handicap_trend uses a true rolling 20-round window
    hi_rounds_desc = await db.rounds.get_rounds_for_user(
        target_user_id, limit=limit + 19, offset=0,
        course_id=resolved_course_id,
        date_from=date_from,
    )
    hi_rounds = list(reversed(hi_rounds_desc))

    if not rounds:
        return {
            "kpis": {
                "scoring_average": None,
                "gir_percentage": None,
                "putts_per_gir": None,
                "scrambling_percentage": None,
                "up_and_down_percentage": None,
                "handicap_index": None,
                "total_rounds": 0,
            },
            "score_trend": [],
            "net_score_trend": [],
            "gir_trend": [],
            "putts_trend": [],
            "three_putts_trend": [],
            "scrambling_trend": [],
            "up_and_down_trend": [],
            "score_type_distribution": [],
            "scoring_by_par": [],
            "scoring_by_handicap": [],
            "gir_vs_non_gir": [],
            "handicap_trend": [],
            "score_differentials": [],
            "notable_achievements": {
                "scoring_records": {
                    "lifetime": {},
                    "one_year": {},
                },
                "scoring_records_events": {
                    "lifetime": {},
                    "one_year": {},
                },
                "career_totals": {
                    "lifetime": {},
                    "one_year": {},
                },
                "best_performance_streaks": {
                    "lifetime": {},
                    "one_year": {},
                },
                "best_performance_streaks_events": {
                    "lifetime": {},
                    "one_year": {},
                },
                "home_course_records": {
                    "lifetime": {
                        "home_course_name": None,
                        "lowest_score_on_home_course": None,
                        "most_rounds_played_at_home_course": 0,
                    },
                    "one_year": {
                        "home_course_name": None,
                        "lowest_score_on_home_course": None,
                    },
                },
                "home_course_records_events": {
                    "lifetime": {
                        "lowest_score_on_home_course": None,
                    },
                    "one_year": {
                        "lowest_score_on_home_course": None,
                    },
                },
                "putting_milestones": {
                    "lifetime": {
                        "fewest_putts_in_round": None,
                        "most_1_putts_in_round": None,
                        "most_3_putts_in_round": None,
                        "putt_breaks": [
                            {"threshold": 45, "achievement": None},
                            {"threshold": 42, "achievement": None},
                            {"threshold": 39, "achievement": None},
                            {"threshold": 36, "achievement": None},
                            {"threshold": 33, "achievement": None},
                            {"threshold": 30, "achievement": None},
                            {"threshold": 27, "achievement": None},
                            {"threshold": 24, "achievement": None},
                            {"threshold": 21, "achievement": None},
                        ],
                    },
                    "one_year": {
                        "fewest_putts_in_round": None,
                        "most_1_putts_in_round": None,
                        "most_3_putts_in_round": None,
                        "putting_milestones_achieved_from_lifetime_set": 0,
                    },
                },
                "putting_milestones_events": {
                    "lifetime": {
                        "fewest_putts_in_round": None,
                        "most_1_putts_in_round": None,
                        "most_3_putts_in_round": None,
                    },
                    "one_year": {
                        "fewest_putts_in_round": None,
                        "most_1_putts_in_round": None,
                        "most_3_putts_in_round": None,
                    },
                },
                "gir_milestones": {
                    "lifetime": {
                        "gir_breaks": [
                            {"threshold": 3, "achievement": None},
                            {"threshold": 6, "achievement": None},
                            {"threshold": 9, "achievement": None},
                            {"threshold": 12, "achievement": None},
                            {"threshold": 15, "achievement": None},
                            {"threshold": 18, "achievement": None},
                        ],
                        "highest_gir_percentage_in_round": None,
                        "most_gir_in_round": None,
                    },
                    "one_year": {
                        "best_gir_round": None,
                        "best_gir_in_round": None,
                        "highest_gir_percentage": None,
                        "gir_milestones_achieved_from_lifetime_set": 0,
                    },
                },
                "gir_milestones_events": {
                    "lifetime": {
                        "highest_gir_percentage_in_round": None,
                        "most_gir_in_round": None,
                    },
                    "one_year": {
                        "best_gir_round": None,
                        "highest_gir_percentage": None,
                    },
                },
                "round_milestones": {
                    "lifetime": {
                        "score_breaks": [
                            {"threshold": 120, "achievement": None},
                            {"threshold": 110, "achievement": None},
                            {"threshold": 100, "achievement": None},
                            {"threshold": 95, "achievement": None},
                            {"threshold": 90, "achievement": None},
                            {"threshold": 85, "achievement": None},
                            {"threshold": 80, "achievement": None},
                            {"threshold": 75, "achievement": None},
                            {"threshold": 70, "achievement": None},
                            {"threshold": 65, "achievement": None},
                            {"threshold": 60, "achievement": None},
                        ],
                        "first_round_under_par": None,
                        "first_eagle": None,
                        "first_hole_in_one": None,
                    },
                    "one_year": {
                        "new_personal_records_achieved_count": 0,
                        "new_personal_records_achieved": [],
                    },
                },
                "window_days": 365,
            },
        }

    scores = [r.calculate_total_score() for r in rounds if r.calculate_total_score() is not None]
    gir_data = analytics.overall_gir_percentage(rounds)
    putts_gir_data = analytics.overall_putts_per_gir(rounds)
    scrambling_rows = analytics.scrambling_per_round(rounds)
    scrambling_vals = [r["scrambling_percentage"] for r in scrambling_rows if r["scrambling_percentage"] is not None]
    avg_scrambling = sum(scrambling_vals) / len(scrambling_vals) if scrambling_vals else None
    ud_rows = analytics.up_and_down_trend(rounds)
    ud_vals = [r["percentage"] for r in ud_rows if r["opportunities"] > 0]
    avg_up_and_down = sum(ud_vals) / len(ud_vals) if ud_vals else None

    current_hi = hcap.handicap_index(hi_rounds)

    return {
        "kpis": {
            "scoring_average": round(sum(scores) / len(scores), 1) if scores else None,
            "gir_percentage": (
                round(gir_data["gir_percentage"], 1)
                if gir_data["gir_percentage"] is not None
                else None
            ),
            "putts_per_gir": (
                round(putts_gir_data["putts_per_gir"], 2)
                if putts_gir_data["putts_per_gir"] is not None
                else None
            ),
            "scrambling_percentage": round(avg_scrambling, 1) if avg_scrambling is not None else None,
            "up_and_down_percentage": round(avg_up_and_down, 1) if avg_up_and_down is not None else None,
            "handicap_index": current_hi,
            "total_rounds": len(rounds),
        },
        "score_trend": analytics.score_trend(rounds),
        "net_score_trend": analytics.net_score_trend(rounds, current_hi),
        "gir_trend": analytics.gir_per_round(rounds),
        "putts_trend": analytics.putts_per_round(rounds),
        "three_putts_trend": analytics.three_putts_per_round(rounds),
        "scrambling_trend": scrambling_rows,
        "up_and_down_trend": ud_rows,
        "score_type_distribution": analytics.score_type_distribution_per_round(rounds),
        "scoring_by_par": analytics.scoring_by_par(rounds),
        "scoring_by_yardage": analytics.scoring_by_yardage_buckets(rounds),
        "scoring_by_handicap": analytics.scoring_vs_hole_handicap(rounds),
        "gir_vs_non_gir": analytics.gir_vs_non_gir_score_distribution(rounds),
        "handicap_trend": _build_handicap_trend(hi_rounds, rounds),
        "score_differentials": hcap.score_differentials_per_round(rounds),
        "notable_achievements": analytics.notable_achievements(
            rounds,
            home_course_id=user.home_course_id,
        ),
    }


@router.get("/{user_id}/played-courses")
async def get_played_courses(
    user_id: UUID,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return distinct courses the user has rounds linked to."""
    if str(current_user.id) != str(user_id):
        raise HTTPException(403, "Forbidden")
    return await db.rounds.get_played_courses_for_user(str(user_id))


@router.get("/{user_id}/goal-report")
async def get_goal_report(
    user_id: UUID,
    limit: int = Query(default=50, ge=1, le=500),
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if str(current_user.id) != str(user_id):
        raise HTTPException(403, "Forbidden")
    user = await db.users.get_user(str(user_id))
    if not user or not user.scoring_goal:
        raise HTTPException(400, "No scoring goal set")

    rounds_desc = await db.rounds.get_rounds_for_user(str(user_id), limit=limit)
    rounds = list(reversed(rounds_desc))

    home_course_rounds = None
    if user.home_course_id:
        home_rounds_desc = await db.rounds.get_rounds_for_user(
            str(user_id), limit=500, course_id=str(user.home_course_id)
        )
        if home_rounds_desc:
            home_course_rounds = list(reversed(home_rounds_desc))

    from analytics.goals import goal_report
    return goal_report(rounds, user.scoring_goal, home_course_rounds)


@router.get("/compare/{user_id}/{round_id}")
async def get_round_comparison(
    user_id: UUID,
    round_id: UUID,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if str(current_user.id) != str(user_id):
        raise HTTPException(403, "Forbidden")
    rounds_desc = await db.rounds.get_rounds_for_user(str(user_id), limit=200, offset=0)
    rounds = list(reversed(rounds_desc))  # chronological order

    if not rounds:
        raise HTTPException(404, "No rounds found")

    round_index = next((i for i, r in enumerate(rounds) if str(r.id) == str(round_id)), None)
    if round_index is None:
        raise HTTPException(404, "Round not found in user history")

    return {
        "score": analytics.score_comparison(rounds, round_index=round_index),
        "putts": analytics.putts_comparison(rounds, round_index=round_index),
        "gir": analytics.gir_comparison(rounds, round_index=round_index),
        "three_putts": analytics.three_putts_comparison(rounds, round_index=round_index),
        "putts_per_gir": analytics.putts_per_gir_comparison(rounds, round_index=round_index),
        "scrambling": analytics.scrambling_comparison(rounds, round_index=round_index),
    }


@router.get("/milestones/{user_id}")
async def get_milestones(
    user_id: UUID,
    limit: int = Query(default=12, ge=1, le=50),
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a flat, sorted list of lifetime milestone events for the user."""
    if str(current_user.id) != str(user_id):
        raise HTTPException(403, "Forbidden")
    user = await db.users.get_user(str(user_id))
    if not user:
        raise HTTPException(404, "User not found")

    all_rounds = await db.rounds.get_rounds_for_user(str(user_id), limit=500, offset=0)
    rounds_chrono = list(reversed(all_rounds))

    if not rounds_chrono:
        return {"milestones": []}

    achievements = analytics.notable_achievements(rounds_chrono, home_course_id=user.home_course_id)

    def _parse_date(d: str) -> datetime:
        try:
            return datetime.strptime(d, "%Y/%m/%d")
        except Exception:
            return datetime.min

    milestones = []

    # Score breaks (break 120, 110, 100, 95, 90, 85, 80, 75, 70 …)
    for item in achievements["round_milestones"]["lifetime"]["score_breaks"]:
        a = item["achievement"]
        if a:
            milestones.append({
                "type": "score_break",
                "label": f"First to break {item['threshold']}",
                "date": a["date"],
                "course": a["course"],
                "round_id": a.get("round_id"),
            })

    # First round under par
    under_par = achievements["round_milestones"]["lifetime"]["first_round_under_par"]
    if under_par:
        milestones.append({
            "type": "under_par",
            "label": "First round under par",
            "date": under_par["date"],
            "course": under_par["course"],
            "round_id": under_par.get("round_id"),
        })

    # First eagle
    eagle = achievements["round_milestones"]["lifetime"]["first_eagle"]
    if eagle:
        milestones.append({
            "type": "eagle",
            "label": "First eagle",
            "date": eagle["date"],
            "course": eagle["course"],
            "round_id": eagle.get("round_id"),
        })

    # Hole in one
    hio = achievements["round_milestones"]["lifetime"]["first_hole_in_one"]
    if hio:
        milestones.append({
            "type": "hole_in_one",
            "label": "Hole in one",
            "date": hio["date"],
            "course": hio["course"],
            "round_id": hio.get("round_id"),
        })

    # GIR breaks (first 3, 6, 9, 12, 15, 18 GIR in a round)
    for item in achievements["gir_milestones"]["lifetime"]["gir_breaks"]:
        a = item["achievement"]
        if a:
            pct = round(item["threshold"] / 18 * 100)
            milestones.append({
                "type": "gir_break",
                "label": f"First {item['threshold']} GIR in a round ({pct}%)",
                "date": a["date"],
                "course": a["course"],
                "round_id": a.get("round_id"),
            })

    # Putt breaks (first round under 45, 42, 39, 36, 33, 30 … putts)
    for item in achievements["putting_milestones"]["lifetime"]["putt_breaks"]:
        a = item["achievement"]
        if a:
            milestones.append({
                "type": "putt_break",
                "label": f"First round under {item['threshold']} putts",
                "date": a["date"],
                "course": a["course"],
                "round_id": a.get("round_id"),
            })

    milestones.sort(key=lambda m: _parse_date(m["date"]), reverse=True)
    return {"milestones": milestones[:limit]}


@router.get("/course-analytics/{user_id}/{course_id}")
async def get_course_analytics(
    user_id: UUID,
    course_id: UUID,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if str(current_user.id) != str(user_id):
        raise HTTPException(403, "Forbidden")
    user = await db.users.get_user(str(user_id))
    if not user:
        raise HTTPException(404, "User not found")

    rounds_desc = await db.rounds.get_rounds_for_user(str(user_id), limit=500, offset=0, course_id=str(course_id))
    course_rounds = list(reversed(rounds_desc))

    return {
        "course_id": str(course_id),
        "rounds_played": len(course_rounds),
        "score_trend_on_course": analytics.score_trend_on_this_course(course_rounds),
        "average_score_relative_to_par_by_hole": analytics.average_score_relative_to_par_by_hole(course_rounds),
        "gir_percentage_by_hole": analytics.gir_percentage_by_hole(course_rounds),
        "average_putts_by_hole": analytics.average_putts_by_hole(course_rounds),
        "score_type_distribution_by_hole": analytics.score_type_distribution_by_hole(course_rounds),
        "course_difficulty_profile_by_hole": analytics.course_difficulty_profile_by_hole(course_rounds),
        "average_score_when_gir_vs_missed": analytics.average_score_when_gir_vs_missed(course_rounds),
        "score_variance_by_hole": analytics.score_variance_by_hole(course_rounds),
    }
