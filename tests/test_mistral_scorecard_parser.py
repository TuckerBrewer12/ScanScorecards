from services.mistral_scorecard_parser import parse_mistral_scorecard_rows


SAMPLE = """
HOLE 1 2 3 4 5 6 7 8 9 OUT 10 11 12 13 14 15 16 17 18 IN TOT
MEN'S HCP 10 8 18 2 12 4 16 6 14 1 13 9 5 17 15 11 3 7
Tucker 1 1 0 0 0 3 2 0 1 8 1 1 -1 2 2 1 2 1 1 10 18
R 1 2 1 1 0 3 0 2 1 11 2 3 2 1 1 1 0 2 1 13 24
PAR 5 3 4 4 3 5 4 4 5 37 4 5 4 4 3 4 3 4 4 35 72
""".strip()


def test_single_row_hint_keeps_score_row_and_skips_putts_row() -> None:
    parsed = parse_mistral_scorecard_rows(
        SAMPLE,
        user_context="scan tucker row only, final scores which are scored to par",
    )

    assert parsed.score_to_par_hint is True
    assert parsed.putts_row == []
    assert parsed.score_row[:9] == [1, 1, 0, 0, 0, 3, 2, 0, 1]
    assert parsed.score_row[9:18] == [1, 1, -1, 2, 2, 1, 2, 1, 1]


def test_extracts_par_row_with_out_in_tot_columns() -> None:
    parsed = parse_mistral_scorecard_rows(SAMPLE, user_context="scan tucker row only")
    assert parsed.par_row[:9] == [5, 3, 4, 4, 3, 5, 4, 4, 5]
    assert parsed.par_row[9:18] == [4, 5, 4, 4, 3, 4, 3, 4, 4]


def test_no_putting_or_gir_hint_suppresses_extra_rows() -> None:
    parsed = parse_mistral_scorecard_rows(
        SAMPLE,
        user_context="scan tucker final scores to par, no putting or GIR",
    )
    assert parsed.score_to_par_hint is True
    assert parsed.score_row[:9] == [1, 1, 0, 0, 0, 3, 2, 0, 1]
    assert parsed.putts_row == []
    assert parsed.gir_row == []
