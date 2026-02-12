"""
Accuracy tests for LLM scorecard extraction.

Run:  python -m unittest tests.test_llm -v
"""

import unittest
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from models import Course, Hole, HoleScore, Round, Tee
from llm.scorecard_extractor import extract_scorecard, ExtractionResult


# --- Comparison Models ---

@dataclass
class FieldComparison:
    """Result of comparing a single field between expected and extracted."""
    field_name: str
    expected: object
    actual: object
    match: bool
    llm_confidence: Optional[float] = None
    context: Optional[str] = None  # e.g. "Hole 5"

    def __str__(self) -> str:
        status = "PASS" if self.match else "FAIL"
        conf = f" (conf: {self.llm_confidence:.2f})" if self.llm_confidence is not None else ""
        prefix = f"{self.context} " if self.context else ""
        if self.match:
            return f"  [{status}] {prefix}{self.field_name}: {self.expected}{conf}"
        return f"  [{status}] {prefix}{self.field_name}: expected={self.expected}, got={self.actual}{conf}"


@dataclass
class HoleComparison:
    """Comparison results for a single hole."""
    hole_number: int
    fields: List[FieldComparison] = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.fields)

    @property
    def matched(self) -> int:
        return sum(1 for f in self.fields if f.match)

    @property
    def accuracy(self) -> float:
        return self.matched / self.total if self.total else 0.0

    def __str__(self) -> str:
        lines = [f"Hole {self.hole_number}: {self.matched}/{self.total} correct ({self.accuracy:.0%})"]
        for f in self.fields:
            lines.append(str(f))
        return "\n".join(lines)


@dataclass
class ComparisonReport:
    """Full comparison report between expected and extracted rounds."""
    course_fields: List[FieldComparison] = field(default_factory=list)
    tee_fields: List[FieldComparison] = field(default_factory=list)
    round_fields: List[FieldComparison] = field(default_factory=list)
    holes: List[HoleComparison] = field(default_factory=list)

    @property
    def all_comparisons(self) -> List[FieldComparison]:
        all_fields = self.course_fields + self.tee_fields + self.round_fields
        for h in self.holes:
            all_fields.extend(h.fields)
        return all_fields

    @property
    def total(self) -> int:
        return len(self.all_comparisons)

    @property
    def matched(self) -> int:
        return sum(1 for f in self.all_comparisons if f.match)

    @property
    def mismatched(self) -> int:
        return self.total - self.matched

    @property
    def accuracy(self) -> float:
        return self.matched / self.total if self.total else 0.0

    def mismatches_only(self) -> List[FieldComparison]:
        return [f for f in self.all_comparisons if not f.match]

    def __str__(self) -> str:
        lines = [
            "=" * 60,
            "EXTRACTION ACCURACY REPORT",
            "=" * 60,
            "",
            f"Overall: {self.matched}/{self.total} fields correct ({self.accuracy:.0%})",
            "",
        ]

        if self.course_fields:
            course_match = sum(1 for f in self.course_fields if f.match)
            lines.append(f"--- Course ({course_match}/{len(self.course_fields)}) ---")
            for f in self.course_fields:
                lines.append(str(f))
            lines.append("")

        if self.tee_fields:
            tee_match = sum(1 for f in self.tee_fields if f.match)
            lines.append(f"--- Tee ({tee_match}/{len(self.tee_fields)}) ---")
            for f in self.tee_fields:
                lines.append(str(f))
            lines.append("")

        if self.round_fields:
            round_match = sum(1 for f in self.round_fields if f.match)
            lines.append(f"--- Round ({round_match}/{len(self.round_fields)}) ---")
            for f in self.round_fields:
                lines.append(str(f))
            lines.append("")

        lines.append("--- Holes ---")
        for h in self.holes:
            lines.append(str(h))
            lines.append("")

        if self.mismatches_only():
            lines.append("--- MISMATCHES SUMMARY ---")
            for f in self.mismatches_only():
                lines.append(str(f))

        lines.append("=" * 60)
        return "\n".join(lines)


# --- Comparison Logic ---

def _get_hole_confidence(result: ExtractionResult, hole_number: int, field_name: str) -> Optional[float]:
    """Look up the LLM confidence for a specific hole field from the extraction result."""
    for hc in result.confidence.hole_scores:
        if hc.hole_number == hole_number:
            fc = hc.fields.get(field_name)
            return fc.llm_confidence if fc else None
    return None


def _get_course_confidence(result: ExtractionResult, field_name: str) -> Optional[float]:
    if result.confidence.course:
        fc = result.confidence.course.fields.get(field_name)
        return fc.llm_confidence if fc else None
    return None


def _get_round_confidence(result: ExtractionResult, field_name: str) -> Optional[float]:
    fc = result.confidence.round_fields.get(field_name)
    return fc.llm_confidence if fc else None


def _compare_field(
    field_name: str,
    expected: object,
    actual: object,
    confidence: Optional[float] = None,
) -> FieldComparison:
    """Compare a single field, treating None == None as a match."""
    if expected is None and actual is None:
        match = True
    elif isinstance(expected, str) and isinstance(actual, str):
        match = expected.strip().lower() == actual.strip().lower()
    elif isinstance(expected, float) and isinstance(actual, float):
        match = abs(expected - actual) < 0.1
    else:
        match = expected == actual

    return FieldComparison(
        field_name=field_name,
        expected=expected,
        actual=actual,
        match=match,
        llm_confidence=confidence,
    )


def compare_extraction(expected: Round, result: ExtractionResult) -> ComparisonReport:
    """Compare an extraction result against a ground truth Round, field by field.

    Args:
        expected: Manually created Round with known-correct data.
        result: The ExtractionResult returned by extract_scorecard().

    Returns:
        ComparisonReport with per-field, per-hole, and overall accuracy.
    """
    actual = result.round
    report = ComparisonReport()

    # --- Course fields ---
    if expected.course and actual.course:
        ec, ac = expected.course, actual.course
        for fname in ["name", "location"]:
            report.course_fields.append(_compare_field(
                fname, getattr(ec, fname), getattr(ac, fname),
                _get_course_confidence(result, fname),
            ))
        report.course_fields.append(_compare_field(
            "par", ec.get_par(), ac.get_par(),
            _get_course_confidence(result, "par"),
        ))

    # --- Tee fields ---
    if expected.course and actual.course:
        e_tee = expected.course.get_tee(expected.tee_box) if expected.tee_box else None
        a_tee = actual.course.get_tee(actual.tee_box) if actual.tee_box else None

        report.tee_fields.append(_compare_field(
            "color", expected.tee_box, actual.tee_box,
            _get_course_confidence(result, "color"),
        ))

        if e_tee and a_tee:
            for fname in ["slope_rating", "course_rating"]:
                report.tee_fields.append(_compare_field(
                    fname, getattr(e_tee, fname), getattr(a_tee, fname),
                    _get_course_confidence(result, fname),
                ))

            # Per-hole yardages
            for hole_num in sorted(e_tee.hole_yardages.keys()):
                e_yd = e_tee.hole_yardages.get(hole_num)
                a_yd = a_tee.hole_yardages.get(hole_num)
                report.tee_fields.append(_compare_field(
                    f"hole_{hole_num}_yardage", e_yd, a_yd,
                    _get_hole_confidence(result, hole_num, "yardage"),
                ))

    # --- Round-level fields ---
    if expected.date and actual.date:
        report.round_fields.append(_compare_field(
            "date", expected.date.date(), actual.date.date(),
            _get_round_confidence(result, "date"),
        ))
    report.round_fields.append(_compare_field(
        "total_putts", expected.total_putts, actual.total_putts,
        _get_round_confidence(result, "total_putts"),
    ))

    # --- Per-hole score comparisons ---
    for i, e_score in enumerate(expected.hole_scores):
        hole_num = i + 1
        a_score = actual.get_hole_score(hole_num)
        hc = HoleComparison(hole_number=hole_num)

        hole_ctx = f"Hole {hole_num}"

        if a_score is None:
            # LLM missed this hole entirely
            for fname in ["strokes", "putts", "fairway_hit", "green_in_regulation"]:
                val = getattr(e_score, fname)
                if val is not None:
                    hc.fields.append(FieldComparison(
                        field_name=fname, expected=val, actual=None, match=False,
                        context=hole_ctx,
                    ))
        else:
            for fname in ["strokes", "putts", "fairway_hit", "green_in_regulation"]:
                e_val = getattr(e_score, fname)
                a_val = getattr(a_score, fname)
                if e_val is not None:
                    fc = _compare_field(
                        fname, e_val, a_val,
                        _get_hole_confidence(result, hole_num, fname),
                    )
                    fc.context = hole_ctx
                    hc.fields.append(fc)

        # Also compare hole par and handicap from course
        if expected.course and actual.course:
            e_hole = expected.course.get_hole(hole_num)
            a_hole = actual.course.get_hole(hole_num)
            if e_hole and a_hole:
                for fname in ["par", "handicap"]:
                    e_val = getattr(e_hole, fname)
                    a_val = getattr(a_hole, fname)
                    if e_val is not None:
                        fc = _compare_field(
                            fname, e_val, a_val,
                            _get_hole_confidence(result, hole_num, fname),
                        )
                        fc.context = hole_ctx
                        hc.fields.append(fc)

        report.holes.append(hc)

    return report


# ============================================================
# Test Cases
# ============================================================

class TestScorecardExtraction(unittest.TestCase):
    """Base class for scorecard extraction accuracy tests.

    To add a new test scorecard:
        1. Add the image/PDF to data/
        2. Create a new test method
        3. Build your ground truth Round with the correct data
        4. Call self.run_extraction_test()
    """

    def run_extraction_test(
        self,
        scorecard_path: str,
        ground_truth: Round,
        user_context: Optional[str] = None,
        min_accuracy: float = 0.90,
    ):
        """Extract a scorecard and compare against ground truth.

        Args:
            scorecard_path: Path to the scorecard image/PDF.
            ground_truth: Manually created Round with correct data.
            user_context: Optional user instructions for the LLM.
            min_accuracy: Minimum overall accuracy to pass (0.0-1.0).
        """
        path = Path(scorecard_path)
        self.assertTrue(path.exists(), f"Scorecard file not found: {path}")

        result = extract_scorecard(path, user_context=user_context, include_raw_response=True)
        report = compare_extraction(ground_truth, result)

        # Print extracted tee box yardages for easy copy-paste
        if result.round.course and result.round.course.tees:
            print("\n--- Extracted Tee Yardages (copy-paste ready) ---")
            for tee in result.round.course.tees:
                print(f"\nTee: {tee.color}")
                if tee.hole_yardages:
                    print(f"  hole_yardages={dict(sorted(tee.hole_yardages.items()))},")
                if tee.slope_rating:
                    print(f"  slope_rating={tee.slope_rating},")
                if tee.course_rating:
                    print(f"  course_rating={tee.course_rating},")

        # Print the full report for visibility
        print(f"\n{report}")

        # Assert minimum accuracy
        self.assertGreaterEqual(
            report.accuracy,
            min_accuracy,
            f"Extraction accuracy {report.accuracy:.0%} below minimum {min_accuracy:.0%}.\n"
            f"Mismatches:\n" + "\n".join(str(m) for m in report.mismatches_only()),
        )

    # --------------------------------------------------------
    # Add your test scorecards below
    # --------------------------------------------------------
    def test_example_scorecard(self):
        """Eagle Vines, scoring to par, no putts included"""

        # -- Course info --
        holes = [
            Hole(number=1, par=5, handicap=10),
            Hole(number=2, par=3, handicap=8),
            Hole(number=3, par=4, handicap=18),
            Hole(number=4, par=4, handicap=2),
            Hole(number=5, par=3, handicap=12),
            Hole(number=6, par=5, handicap=4),
            Hole(number=7, par=4, handicap=16),
            Hole(number=8, par=4, handicap=6),
            Hole(number=9, par=5, handicap=14),
            Hole(number=10, par=4, handicap=1),
            Hole(number=11, par=5, handicap=13),
            Hole(number=12, par=4, handicap=9),
            Hole(number=13, par=4, handicap=5),
            Hole(number=14, par=3, handicap=17),
            Hole(number=15, par=4, handicap=15),
            Hole(number=16, par=3, handicap=11),
            Hole(number=17, par=4, handicap=3),
            Hole(number=18, par=4, handicap=7),
        ]

        white = Tee(
            color="white",
            slope_rating=127,
            course_rating=71.2,
            hole_yardages={1: 511, 2: 161, 3: 337, 4: 427, 5: 151, 6: 536, 
                           7: 354, 8: 395, 9: 449, 10: 423, 11: 491, 12: 326, 
                           13: 361, 14: 150, 15: 370, 16: 170, 17: 371, 18: 388},
        )
        black = Tee(
            color="black",
            slope_rating=138,
            course_rating=75.4,
            hole_yardages={1: 523, 2: 200, 3: 394, 4: 472, 5: 211, 6: 598, 
                           7: 392, 8: 455, 9: 509, 10: 499, 11: 528, 12: 361, 
                           13: 447, 14: 165, 15: 396, 16: 198, 17: 454, 18: 445},
        )
        blue = Tee(
            color="blue",
            slope_rating=135,
            course_rating=73.7,
            hole_yardages={},
        )
        member = Tee(
            color="member",
            slope_rating=132,
            course_rating=72.5,
            hole_yardages={1: 535, 2: 178, 3: 394, 4: 427, 5: 182, 6: 565, 
                           7: 373, 8: 395, 9: 480, 10: 423, 11: 510, 12: 361, 
                           13: 361, 14: 150, 15: 370, 16: 170, 17: 371, 18: 388},
        )
        gold = Tee(
            color="gold",
            slope_rating=122,
            course_rating=69.1,
             hole_yardages={1: 499, 2: 135, 3: 309, 4: 375, 5: 146, 6: 442, 
                            7: 344, 8: 355, 9: 443, 10: 378, 11: 477, 12: 319, 
                            13: 342, 14: 139, 15: 336, 16: 160, 17: 342, 18: 381},
        )
        red = Tee(
            color="red",
            slope_rating=118,
            course_rating=67.8,
            hole_yardages={1: 480, 2: 128, 3: 306, 4: 371, 5: 116, 6: 438, 
                           7: 295, 8: 351, 9: 395, 10: 371, 11: 471, 12: 305, 
                           13: 333, 14: 108, 15: 282, 16: 144, 17: 339, 18: 354},
        )

        course = Course(
            name="Eagle Vines Vineyards & Golf Club",
            location="Napa, CA",
            par=72,
            holes=holes,
            tees=[black, blue, member, white, gold, red],
        )

        # -- Scores --
        hole_scores = [
            HoleScore(hole_number=1, strokes=6, putts=None),
            HoleScore(hole_number=2, strokes=4, putts=None),
            HoleScore(hole_number=3, strokes=4, putts=None),
            HoleScore(hole_number=4, strokes=4, putts=None),
            HoleScore(hole_number=5, strokes=3, putts=None),
            HoleScore(hole_number=6, strokes=6, putts=None),
            HoleScore(hole_number=7, strokes=6, putts=None),
            HoleScore(hole_number=8, strokes=4, putts=None),
            HoleScore(hole_number=9, strokes=6, putts=None),
            HoleScore(hole_number=10, strokes=5, putts=None),
            HoleScore(hole_number=11, strokes=6, putts=None),
            HoleScore(hole_number=12, strokes=5, putts=None),
            HoleScore(hole_number=13, strokes=6, putts=None),
            HoleScore(hole_number=14, strokes=5, putts=None),
            HoleScore(hole_number=15, strokes=5, putts=None),
            HoleScore(hole_number=16, strokes=5, putts=None),
            HoleScore(hole_number=17, strokes=5, putts=None),
            HoleScore(hole_number=18, strokes=5, putts=None),
        ]

        ground_truth = Round(
            course=course,
            tee_box="white",
            date=datetime(2026, 2, 10),
            hole_scores=hole_scores,
            total_putts=None,
        )

        self.run_extraction_test(
            scorecard_path="tests/test_scorecards/eaglevins_90.jpg",
            ground_truth=ground_truth,
            user_context="My name is Tucker, I played from the whites, scoring is to par, so -1 means birdie, +1 is bogey, 0 is par",
            min_accuracy=0.90,
        )


if __name__ == "__main__":
    unittest.main()