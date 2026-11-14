# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Metrics of a scenario (07_visibilidad.md §7, §10, §13.6, §13.8).

Expected values come from the specification (edge cases of §10, the smooth-Moon sunset of §13.3,
the polar bounds of §13.6 and the invariants of §13.8), never from the code under test.
"""

from __future__ import annotations

import math

import pytest

from pipeline.ephem.interp import OutOfRange
from pipeline.tests.conftest import WEB_DATA
from pipeline.vis.metrics import (
    NEXT_EVENT_HORIZON_S,
    TRUNCATED_WARNING,
    curves,
    mission_interval,
    mission_metrics,
    terrain_effect,
)
from pipeline.vis.sky import formula_mask, frame_for, load_mask, smooth_mask
from pipeline.vis.vectors import unix

DAY = 86_400
BG1 = (18.562, 61.81)


def test_truncation_text_is_the_specified_one():
    assert TRUNCATED_WARNING == "Mission extends beyond available ephemeris; results truncated."
    assert NEXT_EVENT_HORIZON_S == 60 * DAY


def test_mission_interval_is_clipped_to_the_table(real_table):
    end = next(s for s in real_table.segments if s.id == "main").valid_to_unix
    assert mission_interval(real_table, end - 10 * DAY, 3.5) == (end - 10 * DAY, end - 6.5 * DAY, False)
    assert mission_interval(real_table, end - 2 * DAY, 14) == (end - 2 * DAY, end, True)
    with pytest.raises(OutOfRange):
        mission_interval(real_table, unix("2050-01-01T00:00:00Z"), 14)


@pytest.mark.parametrize("mask_id, sun, night", [("flat:-90", True, 0.0), ("flat:90", False, 72.0)])
def test_sun_that_never_sets_or_never_rises(real_table, mask_id, sun, night):
    # 07 §10: no events, sun_hours = D or 0, longest night 0 or D·24, open windows.
    m = formula_mask(mask_id)
    t_a = unix("2030-03-01T00:00:00Z")
    r = mission_metrics(real_table, frame_for(0.0, 0.0, m), m, t_a, 3, t_a)
    assert r.sun_hours == (72.0 if sun else 0.0) and r.earth_hours == r.sun_hours
    assert r.longest_night_h == night and r.longest_link_gap_h == night
    assert r.sun_pct == (100.0 if sun else 0.0) and r.both_pct == r.sun_pct
    assert [e for e in r.events if e.kind in ("sunrise", "sunset", "earthrise", "earthset")] == []
    w = (r.windows.sun if sun else r.windows.nights)[0]
    assert (w.open_start, w.open_end) == (True, True)
    # No event in 60 days: the expected kind with no time (`No sunset in the next 60 days`).
    assert (r.next_sun_event.kind, r.next_sun_event.t_unix) == ("sunset" if sun else "sunrise", None)
    assert (r.next_earth_event.kind, r.next_earth_event.t_unix) == ("earthset" if sun else "earthrise", None)


def test_next_sunset_is_the_smooth_moon_sunset_of_blue_ghost(real_table):
    # 07 §13.3: smooth Moon, observer at 0 m: sunset 2025-03-16 20:10:39 UTC ± 10 s.
    flat = formula_mask("flat:0")
    frame = frame_for(*BG1, flat)
    cursor = unix("2025-03-10T00:00:00Z")
    r = mission_metrics(real_table, frame, flat, unix("2025-03-04T00:00:00Z"), 14, cursor)
    assert r.next_sun_event.kind == "sunset"
    assert abs(r.next_sun_event.t_unix - unix("2025-03-16T20:10:39Z")) <= 10
    sunsets = [e.t_unix for e in r.events if e.kind == "sunset"]
    assert len(sunsets) == 1 and abs(sunsets[0] - unix("2025-03-16T20:10:39Z")) <= 10
    # Blue Ghost 1 sees the Earth all the time (near side), and the B3 eclipse is inside the mission.
    assert r.earth_hours == pytest.approx(14 * 24) and r.longest_link_gap_h == 0.0
    assert [e.kind for e in r.events if e.kind.startswith(("eclipse", "totality"))] == [
        "eclipse_start", "totality_start", "totality_end", "eclipse_end"]


def test_south_pole_sun_elevation_extremes(real_table):
    # 07 §13.6: at (−90°, 0°), |sun.el| < 1.6° always.
    flat = formula_mask("flat:0")
    t_a = unix("2031-02-01T00:00:00Z")
    r = mission_metrics(real_table, frame_for(-90.0, 0.0, flat), flat, t_a, 30, t_a)
    assert -1.6 < r.sun_el_min_deg <= r.sun_el_max_deg < 1.6


@pytest.mark.parametrize("site, lat, lon, landing, days", [
    ("blue-ghost-1", *BG1, "2025-03-10T00:00:00Z", 14),
    ("shackleton-floor", -89.67, 129.78, "2027-08-01T00:00:00Z", 14),
    ("im-2", -84.7906, 29.1957, "2025-03-06T17:30:00Z", 10.5),
])
def test_invariants_a9(real_table, site, lat, lon, landing, days):
    # 07 §13.8: sun hours + night hours = D·24 (< 0.001 h); windows sorted and disjoint; a 10 m mast
    # sees at least as much as a 2 m one (minus 0.02 h for the bisection).
    if not (WEB_DATA / "horizon" / f"{site}.json").is_file():
        pytest.skip(f"{site} mask not published")
    t = unix(landing)
    res = {}
    for h in (2, 10):
        m = load_mask(WEB_DATA, site, h)
        res[h] = r = mission_metrics(real_table, frame_for(lat, lon, m), m, t, days, t)
        nights = sum(w.end_unix - w.start_unix for w in r.windows.nights) / 3600
        assert abs(r.sun_hours + nights - days * 24) < 0.001
        for ws in (r.windows.sun, r.windows.earth, r.windows.both, r.windows.nights):
            for a, b in zip(ws, ws[1:], strict=False):
                assert a.end_unix <= b.start_unix
        assert r.both_hours <= min(r.sun_hours, r.earth_hours) + 1e-9
        assert r.sun_pct == pytest.approx(r.sun_hours / (days * 24) * 100)
    assert res[10].sun_hours >= res[2].sun_hours - 0.02
    assert res[10].earth_hours >= res[2].earth_hours - 0.02


def test_terrain_effect_at_blue_ghost(real_table):
    # The SLDEM2015 horizon of Blue Ghost 1 is above the smooth one in every azimuth (min 0.13° vs
    # −0.087°), so the real Sun sets earlier and shines fewer hours.
    if not (WEB_DATA / "horizon" / "blue-ghost-1.json").is_file():
        pytest.skip("blue-ghost-1 mask not published")
    real = load_mask(WEB_DATA, "blue-ghost-1", 2)
    smooth = smooth_mask(2, *BG1)
    frame = frame_for(*BG1, real)
    t = unix("2025-03-10T00:00:00Z")
    e = terrain_effect(mission_metrics(real_table, frame, real, t, 10, t),
                       mission_metrics(real_table, frame, smooth, t, 10, t))
    assert e.d_sun_hours < 0 and e.first_sun_event_shift_s < 0
    assert e.d_earth_hours == pytest.approx(0.0)


def test_curves_grid_and_gaps(real_table):
    flat = formula_mask("flat:0.5")
    end = next(s for s in real_table.segments if s.id == "main").valid_to_unix
    c = curves(real_table, frame_for(*BG1, flat), flat, end - 3000, end + 1500)
    assert len(c.t) == math.ceil(4500 / 600) + 1 and c.t[-1] == end + 1500
    assert all(h == 0.5 for h in c.sun_horizon_deg[:6])
    assert math.isnan(c.sun_el_deg[-1]) and not math.isnan(c.sun_el_deg[5])
