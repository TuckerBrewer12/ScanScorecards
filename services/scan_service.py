"""Scan save service — orchestrates course resolution, par lookup, and round creation."""

import logging
import re
from datetime import datetime
from typing import List, Optional, Tuple

from api.request_models import CourseHoleInput, SaveRoundRequest, TeeInput
from database.db_manager import DatabaseManager
from models import Course, Hole, HoleScore, Round, Tee, UserTee
from services.golfcourse_api_service import GolfCourseAPIService

logger = logging.getLogger(__name__)


class ScanService:
    def __init__(self, db: DatabaseManager, course_api: Optional[GolfCourseAPIService] = None) -> None:
        self._db = db
        self._course_api = course_api or GolfCourseAPIService()

    async def save_reviewed_scan(self, req: SaveRoundRequest) -> Round:
        """Top-level orchestrator: resolve course, build scores, create round."""
        course, course_id = await self._resolve_course(req)
        par_by_hole, handicap_by_hole = self._build_par_lookup(req, course)
        hole_scores = self._build_hole_scores(req, par_by_hole, handicap_by_hole)
        parsed_date: Optional[datetime] = None
        if req.date:
            try:
                parsed_date = datetime.fromisoformat(req.date)
            except ValueError:
                pass
        round_ = Round(
            course=course,
            tee_box=req.tee_box,
            date=parsed_date,
            hole_scores=hole_scores,
            notes=req.notes,
            course_name_played=req.course_name if not course else None,
        )
        user_tee_id = await self._maybe_create_user_tee(req, course_id)
        return await self._db.rounds.create_round(
            round_, req.user_id, course_id=course_id, user_tee_id=user_tee_id
        )

    async def _resolve_course(
        self, req: SaveRoundRequest
    ) -> Tuple[Optional[Course], Optional[str]]:
        """5-tier course resolution. Returns (course, course_id_str)."""
        await self._maybe_lookup_external_id_from_name(req)
        tees = self._build_tees(req)
        scan_holes = req.course_holes or []

        # Tier 0: explicit course_id (user selected from DB — skip fuzzy match)
        if req.course_id:
            course = await self._db.courses.get_course(req.course_id)
            if course:
                course = await self._maybe_backfill_external_id(course, req)
                await self._fill_gaps(str(course.id), scan_holes, tees)
                return course, str(course.id)

        # Tier 0.5: confirmed external match from UI
        # Create local row keyed by external_course_id if missing.
        if req.external_course_id:
            course = await self._db.courses.find_course_by_external_id(
                req.external_course_id,
                user_id=req.user_id,
            )
            if course:
                course = await self._maybe_backfill_external_id(course, req)
                await self._fill_gaps(str(course.id), scan_holes, tees)
                return course, str(course.id)

            # If provider ID is new but a local course already exists by name,
            # backfill that row instead of creating a duplicate.
            if req.course_name:
                existing_by_name = await self._db.courses.find_course_by_name(
                    req.course_name, req.course_location, req.user_id
                )
                if existing_by_name:
                    course = await self._maybe_backfill_external_id(existing_by_name, req)
                    await self._fill_gaps(str(course.id), scan_holes, tees)
                    return course, str(course.id)

        if not req.course_name:
            return None, None

        # Tier 1: master exists
        course = await self._db.courses.find_course_by_name(req.course_name, req.course_location)
        if course:
            course = await self._maybe_backfill_external_id(course, req)
            await self._fill_gaps(str(course.id), scan_holes, tees)
            return course, str(course.id)

        # Tier 2: current user's own course
        course = await self._db.courses.find_user_course_by_name(
            req.course_name, req.course_location, req.user_id
        )
        if course:
            course = await self._maybe_backfill_external_id(course, req)
            await self._fill_gaps(str(course.id), scan_holes, tees)
            return course, str(course.id)

        # Tier 3: another user's course → fill gaps + promote to master
        course = await self._db.courses.find_any_user_course_by_name(
            req.course_name, req.course_location
        )
        if course:
            course = await self._maybe_backfill_external_id(course, req)
            await self._fill_gaps(str(course.id), scan_holes, tees)
            course = await self._db.courses.promote_to_master(str(course.id))
            return course, str(course.id)

        # Tier 4: nobody has it → create user-owned course from scan data
        holes = [
            Hole(
                number=h.hole_number,
                par=h.par if h.par is not None and 3 <= h.par <= 6 else None,
                handicap=h.handicap if h.handicap is not None and 1 <= h.handicap <= 18 else None,
            )
            for h in scan_holes if h.hole_number is not None
        ]
        model_tees = []
        for t in tees:
            yardages = {int(k): v for k, v in t.hole_yardages.items() if v is not None}
            slope = t.slope_rating if t.slope_rating is not None and 55 <= t.slope_rating <= 155 else None
            rating = t.course_rating if t.course_rating is not None and 55.0 <= t.course_rating <= 85.0 else None
            model_tees.append(Tee(
                color=t.color,
                slope_rating=slope,
                course_rating=rating,
                total_yardage=None,
                hole_yardages=yardages,
            ))
        new_course = Course(
            name=req.course_name,
            external_course_id=req.external_course_id,
            location=req.course_location,
            par=None,
            holes=holes,
            tees=model_tees,
        )
        course = await self._db.courses.create_course(new_course, user_id=req.user_id)
        return course, str(course.id) if course else None

    async def _maybe_lookup_external_id_from_name(self, req: SaveRoundRequest) -> None:
        """Best-effort provider lookup when UI did not send external_course_id."""
        if req.external_course_id or not req.course_name:
            return
        try:
            rows = await self._course_api.search_external_courses(req.course_name, limit=8)
        except Exception as exc:  # noqa: BLE001
            logger.info("External lookup skipped for '%s': %s", req.course_name, exc)
            return
        if not rows:
            return

        target = self._normalize_name(req.course_name)

        # Prefer exact-ish normalized name match; fallback to first row with an ID.
        chosen = None
        for row in rows:
            external_id = row.get("external_course_id")
            if not external_id:
                continue
            name = row.get("name") or ""
            norm = self._normalize_name(name)
            if norm == target or target in norm or norm in target:
                chosen = row
                break
            if chosen is None:
                chosen = row

        if chosen and chosen.get("external_course_id"):
            req.external_course_id = chosen["external_course_id"]
            if not req.course_location:
                city = chosen.get("city")
                state = chosen.get("state")
                req.course_location = ", ".join([p for p in [city, state] if p]) or None
            logger.info(
                "External lookup resolved for '%s': external_course_id=%s",
                req.course_name,
                req.external_course_id,
            )

    @staticmethod
    def _normalize_name(value: str) -> str:
        base = re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()
        base = re.sub(
            r"\b(golf|course|club|country|links|gc|cc)\b",
            " ",
            base,
        )
        return " ".join(base.split())

    async def _maybe_backfill_external_id(
        self,
        course: Course,
        req: SaveRoundRequest,
    ) -> Course:
        """Fill external_course_id on an existing local course when available."""
        if (
            req.external_course_id
            and course.id
            and not course.external_course_id
        ):
            updated = await self._db.courses.update_course(
                str(course.id),
                external_course_id=req.external_course_id,
            )
            if updated:
                return updated
        return course

    def _build_tees(self, req: SaveRoundRequest) -> List[TeeInput]:
        """Normalised tee list: all_tees preferred, single played tee as fallback."""
        if req.all_tees:
            return [t for t in req.all_tees if t.color]
        if req.tee_box:
            return [TeeInput(
                color=req.tee_box,
                slope_rating=req.tee_slope_rating,
                course_rating=req.tee_course_rating,
                hole_yardages=req.tee_yardages or {},
            )]
        return []

    async def _fill_gaps(
        self,
        course_id: str,
        scan_holes: List[CourseHoleInput],
        tees: List[TeeInput],
    ) -> None:
        """Fill null fields on an existing course from scan data (fill-only, never overwrites)."""
        for t in tees:
            await self._db.courses.fill_course_gaps(
                course_id, scan_holes,
                t.color, t.slope_rating, t.course_rating, t.hole_yardages,
            )

    def _build_par_lookup(
        self, req: SaveRoundRequest, course: Optional[Course]
    ) -> Tuple[dict, dict]:
        """Build hole→par and hole→handicap dicts.

        Course holes are authoritative; scan holes fill any remaining gaps.
        """
        par_by_hole: dict = {}
        handicap_by_hole: dict = {}
        if course and course.holes:
            for hole in course.holes:
                if hole.number is not None:
                    if hole.par is not None:
                        par_by_hole[hole.number] = hole.par
                    if hole.handicap is not None:
                        handicap_by_hole[hole.number] = hole.handicap
        for h in req.course_holes or []:
            if h.hole_number is not None:
                if h.par is not None and h.hole_number not in par_by_hole:
                    par_by_hole[h.hole_number] = h.par
                if h.handicap is not None and h.hole_number not in handicap_by_hole:
                    handicap_by_hole[h.hole_number] = h.handicap
        return par_by_hole, handicap_by_hole

    def _build_hole_scores(
        self,
        req: SaveRoundRequest,
        par_by_hole: dict,
        handicap_by_hole: dict,
    ) -> List[HoleScore]:
        """Build HoleScore list with par_played/handicap_played populated from lookup."""
        hole_scores = []
        for hs in req.hole_scores:
            hs_dict = hs.model_dump()
            hole_num = hs_dict.get("hole_number")
            if hole_num is not None:
                if not hs_dict.get("par_played"):
                    hs_dict["par_played"] = par_by_hole.get(hole_num)
                if not hs_dict.get("handicap_played"):
                    hs_dict["handicap_played"] = handicap_by_hole.get(hole_num)
            # Guard against putts > strokes (can occur when score row is to-par
            # and the to-par→absolute conversion didn't happen at extract time).
            strokes = hs_dict.get("strokes")
            putts = hs_dict.get("putts")
            if strokes is not None and putts is not None and putts > strokes:
                par_played = hs_dict.get("par_played")
                if par_played is not None:
                    # Try interpreting strokes as a to-par value and convert.
                    absolute = par_played + strokes
                    if 1 <= absolute <= 15 and putts <= absolute:
                        hs_dict["strokes"] = absolute
                    else:
                        hs_dict["putts"] = None
                else:
                    hs_dict["putts"] = None
            hole_scores.append(HoleScore(**hs_dict))
        return hole_scores

    async def _maybe_create_user_tee(
        self, req: SaveRoundRequest, course_id: Optional[str]
    ) -> Optional[str]:
        """Create a user_tee when tee data was scanned but no master course exists."""
        if req.tee_box and req.tee_yardages and not course_id:
            slope = req.tee_slope_rating if req.tee_slope_rating is not None and 55 <= req.tee_slope_rating <= 155 else None
            rating = req.tee_course_rating if req.tee_course_rating is not None and 55.0 <= req.tee_course_rating <= 85.0 else None
            user_tee = UserTee(
                user_id=req.user_id,
                name=req.tee_box,
                slope_rating=slope,
                course_rating=rating,
                hole_yardages={int(k): v for k, v in req.tee_yardages.items() if v is not None},
            )
            created = await self._db.user_tees.create_user_tee(user_tee)
            return created.id
        return None
