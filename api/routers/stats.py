"""Stats/dashboard API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from database.db_manager import DatabaseManager
from api.dependencies import get_current_user, get_db
from models import User
from api.schemas import DashboardResponse
from api.routers.rounds import summarize_round
from analytics import stats as analytics
from analytics import handicap as hcap

router = APIRouter()


@router.get("/dashboard/{user_id}", response_model=DashboardResponse)
async def get_dashboard(
    user_id: str,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = await db.users.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")

    all_rounds = await db.rounds.get_rounds_for_user(user_id, limit=500, offset=0)

    scores = [r.calculate_total_score() for r in all_rounds if r.calculate_total_score()]
    putts = [r.get_total_putts() for r in all_rounds if r.get_total_putts()]
    girs = [r.get_total_gir() for r in all_rounds if r.get_total_gir() is not None]

    best_score = min(scores) if scores else None
    best_round_id = None
    best_course = None
    if best_score:
        for r in all_rounds:
            if r.calculate_total_score() == best_score:
                best_round_id = r.id
                best_course = r.course.name if r.course else None
                break

    recent = all_rounds[:5]

    # Use chronological order for handicap calc (DB returns newest-first)
    rounds_chrono = list(reversed(all_rounds))
    calculated_hi = hcap.handicap_index(rounds_chrono)

    return DashboardResponse(
        total_rounds=len(all_rounds),
        scoring_average=round(sum(scores) / len(scores), 1) if scores else None,
        best_round=best_score,
        best_round_id=best_round_id,
        best_round_course=best_course,
        handicap_index=calculated_hi,
        recent_rounds=[summarize_round(r) for r in recent],
        average_putts=round(sum(putts) / len(putts), 1) if putts else None,
        average_gir=round(sum(girs) / len(girs), 1) if girs else None,
    )


@router.get("/analytics/{user_id}")
async def get_analytics(
    user_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = await db.users.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")

    # DB returns newest-first; reverse for chronological trend ordering
    rounds_desc = await db.rounds.get_rounds_for_user(user_id, limit=limit, offset=0)
    rounds = list(reversed(rounds_desc))

    if not rounds:
        return {
            "kpis": {
                "scoring_average": None,
                "gir_percentage": None,
                "putts_per_gir": None,
                "scrambling_percentage": None,
                "handicap_index": None,
                "total_rounds": 0,
            },
            "score_trend": [],
            "net_score_trend": [],
            "gir_trend": [],
            "putts_trend": [],
            "three_putts_trend": [],
            "scrambling_trend": [],
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

    current_hi = hcap.handicap_index(rounds)

    return {
        "kpis": {
            "scoring_average": round(sum(scores) / len(scores), 1) if scores else None,
            "gir_percentage": round(gir_data["gir_percentage"], 1) if gir_data["gir_percentage"] else None,
            "putts_per_gir": round(putts_gir_data["putts_per_gir"], 2) if putts_gir_data["putts_per_gir"] else None,
            "scrambling_percentage": round(avg_scrambling, 1) if avg_scrambling is not None else None,
            "handicap_index": current_hi,
            "total_rounds": len(rounds),
        },
        "score_trend": analytics.score_trend(rounds),
        "net_score_trend": analytics.net_score_trend(rounds, current_hi),
        "gir_trend": analytics.gir_per_round(rounds),
        "putts_trend": analytics.putts_per_round(rounds),
        "three_putts_trend": analytics.three_putts_per_round(rounds),
        "scrambling_trend": analytics.scrambling_per_round(rounds),
        "score_type_distribution": analytics.score_type_distribution_per_round(rounds),
        "scoring_by_par": analytics.scoring_by_par(rounds),
        "scoring_by_handicap": analytics.scoring_vs_hole_handicap(rounds),
        "gir_vs_non_gir": analytics.gir_vs_non_gir_score_distribution(rounds),
        "handicap_trend": hcap.handicap_trend(rounds),
        "score_differentials": hcap.score_differentials_per_round(rounds),
        "notable_achievements": analytics.notable_achievements(
            rounds,
            home_course_id=user.home_course_id,
        ),
    }


@router.get("/compare/{user_id}/{round_id}")
async def get_round_comparison(
    user_id: str,
    round_id: str,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rounds_desc = await db.rounds.get_rounds_for_user(user_id, limit=200, offset=0)
    rounds = list(reversed(rounds_desc))  # chronological order

    if not rounds:
        raise HTTPException(404, "No rounds found")

    round_index = next((i for i, r in enumerate(rounds) if str(r.id) == round_id), None)
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


@router.get("/course-analytics/{user_id}/{course_id}")
async def get_course_analytics(
    user_id: str,
    course_id: str,
    db: DatabaseManager = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = await db.users.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")

    rounds_desc = await db.rounds.get_rounds_for_user(user_id, limit=500, offset=0)
    rounds = list(reversed(rounds_desc))  # chronological order
    course_rounds = [r for r in rounds if r.course and str(r.course.id) == course_id]

    return {
        "course_id": course_id,
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
