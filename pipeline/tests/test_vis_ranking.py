# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Ranking of candidate sites (07_visibilidad.md §8.5): order, rounding and stability."""

from __future__ import annotations

import itertools
import random

from pipeline.vis.ranking import RankRow, best_alternative, rank_candidates
from pipeline.vis.requirements import Assessment, Checks


def row(site_id: str, status: str, both: float, night: float, sun: float) -> RankRow:
    a = Assessment(status, Checks(True, True, True), night, both, [])
    return RankRow(site_id, site_id.upper(), a, sun, 50.0)


ROWS = [
    row("e", "no_go", 99.0, 0.0, 99.0),
    row("d", "marginal", 10.0, 0.0, 10.0),
    row("c", "go", 50.04, 5.0, 60.0),  # both_pct 50.0 after rounding: tie with b and a
    row("b", "go", 49.96, 5.04, 70.0),  # night 5.0 after rounding: tie with c
    row("a", "go", 50.0, 4.94, 10.0),  # night 4.9: first of the three
    row("f", "go", 50.0, 5.0, 70.0),  # same as b after rounding: site_id breaks the tie
    row("g", "go", 80.0, 30.0, 0.0),
]
EXPECTED = ["g", "a", "b", "f", "c", "d", "e"]


def test_order_status_both_night_sun_id():
    assert [r.site_id for r in rank_candidates(ROWS)] == EXPECTED


def test_order_does_not_depend_on_the_input_order():
    for perm in itertools.islice(itertools.permutations(ROWS), 0, 5040, 37):
        assert [r.site_id for r in rank_candidates(list(perm))] == EXPECTED
    rng = random.Random(8)
    for _ in range(50):
        rows = ROWS[:]
        rng.shuffle(rows)
        assert [r.site_id for r in rank_candidates(rows)] == EXPECTED


def test_rounding_is_half_up_to_a_tenth():
    # 07 §8.5 and §12.7: floor(x·10 + 0.5)/10, so 33.25 and 33.29 tie at 33.3 and 33.24 is 33.2.
    rows = [row("x", "go", 33.25, 0, 1), row("y", "go", 33.29, 0, 2), row("z", "go", 33.24, 0, 3)]
    assert [r.site_id for r in rank_candidates(rows)] == ["y", "x", "z"]


def test_ranking_returns_a_new_list():
    rows = ROWS[:]
    rank_candidates(rows)
    assert rows == ROWS


def test_best_alternative():
    ranked = rank_candidates(ROWS)
    assert best_alternative(ranked, "g").site_id == "a"
    assert best_alternative(ranked, "a").site_id == "g"
    only = rank_candidates([row("d", "marginal", 1, 0, 1), row("e", "no_go", 1, 0, 1),
                            row("h", "go", 1, 0, 1)])
    assert best_alternative(only, "h").site_id == "d"  # no other `go`: the first `marginal`
    assert best_alternative([row("e", "no_go", 1, 0, 1)], "x") is None
