# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Requirements, replanning matrix and next valid window (07_visibilidad.md §8; case B2 of §13.7).

Expected values come from the specification: the rules of §8.2, the 31 columns of §8.3, the window of
§8.4 and the table of §13.7. Never from the code under test.
"""

from __future__ import annotations

import pytest

from pipeline.tests.conftest import WEB_DATA
from pipeline.vis.eclipse import EclipseState
from pipeline.vis.requirements import (
    DEFAULT_REQUIREMENTS,
    Grid,
    Requirements,
    assess,
    assess_scenario,
    longest_night_in,
    next_valid_landing,
    replan_row,
)
from pipeline.vis.sky import BodyState, SkyState, SunState, formula_mask, frame_for, load_mask, smooth_mask
from pipeline.vis.vectors import unix

DAY = 86_400


def sky(sun_margin: float = 5.0, earth_margin: float = 5.0, disc: float = 1.0) -> SkyState:
    """A state at landing with the given margins and Sun disc fraction (everything else irrelevant)."""
    sun = SunState(0.0, sun_margin, 1.5e8, 0.265, 0.0, sun_margin, sun_margin > 0, disc, disc)
    earth = BodyState(0.0, earth_margin, 3.8e5, 0.95, 0.0, earth_margin, earth_margin > 0)
    return SkyState(0.0, sun, earth, sun.visible and earth.visible, EclipseState("none", 0.0, 90.0))


# ------------------------------------------------------------------------------- 8.1 and 8.2


def test_default_requirements_are_the_plan():
    r = DEFAULT_REQUIREMENTS
    assert (r.need_sun_at_landing, r.need_earth_at_landing, r.max_night_hours) == (True, True, 24)
    assert (r.marginal_earth_margin_deg, r.marginal_sun_fraction) == (1.0, 1.0)


def test_go_when_every_check_holds_with_margin():
    a = assess(sky(), 0.0, 100.0, DEFAULT_REQUIREMENTS)
    assert (a.status, a.reasons) == ("go", [])
    assert (a.checks.sun_at_landing, a.checks.earth_at_landing, a.checks.night_ok) == (True, True, True)
    assert (a.longest_night_h, a.both_pct) == (0.0, 100.0)


def test_no_go_lists_every_failed_check_in_order():
    a = assess(sky(-1.0, -1.0), 30.0, 0.0, DEFAULT_REQUIREMENTS)
    assert a.status == "no_go"
    assert a.reasons == ["no_sun_at_landing", "no_earth_at_landing", "night_too_long"]


def test_a_margin_of_exactly_zero_is_not_visible():
    assert assess(sky(0.0), 0.0, 0.0, DEFAULT_REQUIREMENTS).reasons == ["no_sun_at_landing"]
    assert assess(sky(5.0, 0.0), 0.0, 0.0, DEFAULT_REQUIREMENTS).reasons == ["no_earth_at_landing"]


def test_the_night_limit_is_inclusive():
    assert assess(sky(), 24.0, 0.0, DEFAULT_REQUIREMENTS).checks.night_ok
    assert assess(sky(), 24.001, 0.0, DEFAULT_REQUIREMENTS).reasons == ["night_too_long"]


def test_marginal_reasons():
    req = DEFAULT_REQUIREMENTS
    assert assess(sky(disc=0.9), 0.0, 0.0, req).reasons == ["sun_partly_hidden"]
    assert assess(sky(disc=1 - 1e-10), 0.0, 0.0, req).status == "go"  # within the 1e-9 of §8.2
    assert assess(sky(earth_margin=0.99), 0.0, 0.0, req).reasons == ["earth_low"]
    assert assess(sky(earth_margin=1.0), 0.0, 0.0, req).status == "go"  # «< 1°», not «≤»
    assert assess(sky(), 18.0, 0.0, req).status == "go"  # 0.75 · 24 = 18 is not above
    assert assess(sky(), 18.5, 0.0, req).reasons == ["night_near_limit"]
    a = assess(sky(earth_margin=0.5, disc=0.5), 20.0, 0.0, req)
    assert (a.status, a.reasons) == ("marginal", ["sun_partly_hidden", "earth_low", "night_near_limit"])


def test_requirements_that_are_switched_off():
    req = Requirements(need_sun_at_landing=False, need_earth_at_landing=False)
    a = assess(sky(-3.0, -3.0, 0.0), 0.0, 0.0, req)
    assert (a.status, a.reasons) == ("go", [])
    assert (a.checks.sun_at_landing, a.checks.earth_at_landing) == (True, True)
    # A night limit of 0 h fails as soon as there is any night.
    assert assess(sky(), 0.5, 0.0, Requirements(max_night_hours=0.0)).reasons == ["night_too_long"]


# ------------------------------------------------------------------------------------ 8.3


def test_longest_night_counts_samples_with_both_ends_included():
    # Decision D-82 a: a run of k samples without Sun counts as k × 10 min, clipped to [i0, i1].
    g = Grid(0.0, [], [], [(2, 5), (8, 20)])
    assert longest_night_in(g, 0, 30) == pytest.approx(13 / 6)
    assert longest_night_in(g, 3, 10) == pytest.approx(0.5)  # (2, 5) → 3 samples, (8, 20) → 3 samples
    assert longest_night_in(g, 6, 7) == 0.0


@pytest.mark.parametrize("delta_s", [6 * 3600, 12 * 3600, DAY, 2 * DAY])
def test_replan_row_has_31_landings_every_delta(real_table, delta_s):
    t0 = unix("2027-08-01T00:00:00Z")
    always = formula_mask("flat:-90")
    row = replan_row(real_table, frame_for(0.0, 0.0, always), always, t0, delta_s, 1)
    assert [c.landing_unix for c in row] == [t0 + k * delta_s for k in range(31)]
    assert {c.status for c in row} == {"go"}


def test_replan_row_never_visible(real_table):
    never = formula_mask("flat:90")
    row = replan_row(real_table, frame_for(0.0, 0.0, never), never, unix("2030-01-01T00:00:00Z"), DAY, 2)
    assert {c.status for c in row} == {"no_go"}
    assert row[0].reasons == ["no_sun_at_landing", "no_earth_at_landing", "night_too_long"]
    assert row[0].longest_night_h == pytest.approx(48 + 1 / 6)  # 289 samples, both ends included


def test_replan_cells_past_the_table_have_no_status(real_table):
    end = next(s for s in real_table.segments if s.id == "main").valid_to_unix
    always = formula_mask("flat:-90")
    row = replan_row(real_table, frame_for(0.0, 0.0, always), always, end - 10 * DAY, DAY, 3)
    assert [c.status for c in row[:8]] == ["go"] * 8  # landing + 3 d ≤ end of the table
    assert {c.status for c in row[8:]} == {None}


# ------------------------------------------------------------------------------------ 8.4


def test_next_valid_landing_synthetic(real_table):
    t0 = unix("2030-01-01T00:00:00Z")
    always = formula_mask("flat:-90")
    w = next_valid_landing(real_table, frame_for(0.0, 0.0, always), always, t0, 14)
    assert (w.start_unix, w.end_unix, w.status_at_start) == (t0, t0 + 90 * DAY, "go")
    never = formula_mask("flat:90")
    assert next_valid_landing(real_table, frame_for(0.0, 0.0, never), never, t0, 14) is None


# --------------------------------------------------------------------------- B2 (07 §13.7)

B2_SITE = (18.562, 61.81)
B2_BASE = unix("2025-03-02T08:34:00Z")
B2_EXPECTED = {0: ("go", []), 14: ("no_go", ["night_too_long"]), 29.5: ("go", [])}


def b2_mask(kind: str):
    if kind == "smooth":
        return smooth_mask(2, *B2_SITE)
    path = WEB_DATA / "horizon" / "blue-ghost-1.json"
    if not path.is_file():
        pytest.skip("blue-ghost-1 mask not published (T-21)")
    return load_mask(WEB_DATA, "blue-ghost-1", 2)


@pytest.fixture(scope="module")
def b2_results(real_table):
    out = {}
    for kind in ("smooth", "sldem2015"):
        m = b2_mask(kind)
        frame = frame_for(*B2_SITE, m)
        for delay in B2_EXPECTED:
            out[kind, delay] = assess_scenario(real_table, frame, m, B2_BASE + delay * DAY, 14)
    return out


@pytest.mark.parametrize("kind", ["smooth", "sldem2015"])
@pytest.mark.parametrize("delay", list(B2_EXPECTED))
def test_b2_blue_ghost_replanning(b2_results, kind, delay):
    a, m = b2_results[kind, delay]
    assert (a.status, a.reasons) == B2_EXPECTED[delay]
    if delay == 14:
        # The Sun is up at landing and sets the same day; the night fills the rest of the mission.
        assert a.checks.sun_at_landing and a.checks.earth_at_landing
        sunset = next(e for e in m.events if e.kind == "sunset")
        assert unix("2025-03-16T18:00:00Z") <= sunset.t_unix <= unix("2025-03-16T20:30:00Z")
        assert m.longest_night_h > 13 * 24


def test_b2_record(b2_results, record_case):
    rows = []
    for (kind, delay), (a, _m) in b2_results.items():
        exp = B2_EXPECTED[delay]
        rows.append({"label": f"{kind}, +{delay} d", "expected": " ".join([exp[0], *exp[1]]),
                     "obtained": " ".join([a.status, *a.reasons]), "abs_err": None, "unit": "",
                     "ok": (a.status, a.reasons) == exp})
    ok = all(r["ok"] for r in rows)
    record_case("B2", "pass" if ok else "fail", "+14 d: no go; +29.5 d: go",
                "; ".join(f"{r['label']}: {r['obtained']}" for r in rows), "Correct traffic light",
                {"label": "Lunar synodic period", "url": ""}, rows,
                "Python reference (07 §13.7), smooth Moon and SLDEM2015 mask, observer at 2 m.",
                part="reference")
    assert ok
