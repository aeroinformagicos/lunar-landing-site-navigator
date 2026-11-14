# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Crossings, windows and events (07_visibilidad.md §6, §10 and §13.3).

The smooth-Moon instants are those of JPL Horizons (05_efemerides.md §8.3, 07 §13.3); the synthetic
cases use functions whose crossings are known by construction.
"""

from __future__ import annotations

import math

import pytest

from pipeline.common.timeutil import iso_to_unix, unix_to_iso
from pipeline.ephem.interp import OutOfRange, site_frame
from pipeline.vis.events import (
    EVENT_KINDS,
    SCAN_STEP_S,
    Window,
    complement_windows,
    earth_margin_fn,
    find_crossings,
    find_events,
    intersect_windows,
    longest_hours,
    sun_margin_fn,
    window_hours,
    windows_from,
)
from pipeline.vis.sky import formula_mask, frame_for, smooth_mask

# 07 §13.3 (JPL Horizons, 05 §8.3): smooth Moon, observer at 0 m, site height 0, mask flat:0.
BG1 = (18.56, 61.81)
IM2_PLANNED = (-84.78, 29.13)
BG1_SUNSET = ("2025-03-16T20:10:39Z", 10)  # expected instant, tolerance in seconds
IM2_SUNRISE = ("2025-03-04T09:14:10Z", 20)
# 07 §13.3: observer at 2 m (smooth horizon at −0.0869°): 0.0869°/(0.007997°/min) = 10.9 min later.
BG1_SUNSET_2M = ("2025-03-16T20:21:31Z", 15)
# 11 §2.4: Blue Ghost 1 landed after the first sunrise of March 2025 and saw one sunset that month.
BG1_LANDING = "2025-03-02T08:34:00Z"
# 07 §13.6: at (−89.9°, 0°) the Earth stays within ±7.5° of the horizon, so it rises and sets.
NEAR_POLE = (-89.9, 0.0)


def U(iso: str) -> float:
    return iso_to_unix(iso)


# ---------------------------------------------------------------- find_crossings (07 §6.1)


def test_scan_step_and_event_kinds_of_the_specification():
    assert SCAN_STEP_S == 600
    assert EVENT_KINDS == ("sunrise", "sunset", "earthrise", "earthset",
                           "eclipse_start", "eclipse_end", "totality_start", "totality_end")


def test_finds_a_sign_change_to_the_second_with_its_direction():
    crossings, initial = find_crossings(lambda t: t - 12345.4, 0, 100_000)
    assert initial is False
    assert len(crossings) == 1 and crossings[0]["rising"] is True
    assert isinstance(crossings[0]["t"], int) and abs(crossings[0]["t"] - 12345.4) <= 1
    crossings, initial = find_crossings(lambda t: 54321.7 - t, 0, 100_000)
    assert initial is True
    assert [c["rising"] for c in crossings] == [False] and abs(crossings[0]["t"] - 54321.7) <= 1


def test_finds_every_crossing_in_time_order():
    day = 86_400

    def f(t):
        return math.sin(2 * math.pi * t / day)  # positive in the first half of each day

    crossings, initial = find_crossings(f, 1000, 3 * day - 1000)
    assert initial is True
    expected = [(day // 2, False), (day, True), (3 * day // 2, False), (2 * day, True), (5 * day // 2, False)]
    assert [c["rising"] for c in crossings] == [r for _, r in expected]
    for c, (t, _) in zip(crossings, expected, strict=True):
        assert abs(c["t"] - t) <= 1


def test_margin_of_exactly_zero_does_not_hold():
    # 07 §3: margin exactly 0 = not visible.
    assert find_crossings(lambda t: 0.0, 0, 10_000) == ([], False)
    crossings, initial = find_crossings(lambda t: max(0.0, t - 5000.0), 0, 10_000)
    assert initial is False
    assert len(crossings) == 1 and crossings[0]["rising"] and abs(crossings[0]["t"] - 5000) <= 1


def test_windows_shorter_than_the_step_are_ignored_on_purpose():
    # 9 minutes of «Sun» between two scan points (600 and 1200 s): not detected (07 §6.1).
    assert find_crossings(lambda t: 1.0 if 630 < t < 1170 else -1.0, 0, 6000) == ([], False)
    # 11 minutes always contain a scan point: detected.
    crossings, _ = find_crossings(lambda t: 1.0 if 570 < t < 1230 else -1.0, 0, 6000)
    assert [c["rising"] for c in crossings] == [True, False]
    assert abs(crossings[0]["t"] - 570) <= 1 and abs(crossings[1]["t"] - 1230) <= 1


def test_last_partial_step_empty_interval_and_custom_step():
    seen = []

    def f(t):
        seen.append(t)
        return t - 900.0

    crossings, initial = find_crossings(f, 0, 1000)  # steps 0–600 and 600–1000
    assert initial is False and len(crossings) == 1 and abs(crossings[0]["t"] - 900) <= 1
    assert min(seen) == 0 and max(seen) == 1000  # never evaluated outside the interval
    assert find_crossings(lambda t: 1.0, 500, 500) == ([], True)
    # With a 60 s step the 9-minute window is found.
    crossings, _ = find_crossings(lambda t: 1.0 if 630 < t < 1170 else -1.0, 0, 6000, 60)
    assert [c["rising"] for c in crossings] == [True, False]


# ---------------------------------------------------------------- windows (07 §6.3)


def test_windows_from_crossings():
    crossings = [{"t": 100, "rising": False}, {"t": 200, "rising": True}, {"t": 300, "rising": False}]
    two = [Window(0, 100, True, False), Window(200, 300, False, False)]
    assert windows_from(crossings, True, 0, 400) == two
    assert windows_from([{"t": 100, "rising": True}], False, 0, 400) == [Window(100, 400, False, True)]
    assert windows_from(crossings[1:], False, 0, 400) == [Window(200, 300, False, False)]


def test_no_crossings_all_or_nothing():
    # 07 §10: the Sun does not set, or does not rise, in the interval.
    assert windows_from([], True, 0, 400) == [Window(0, 400, True, True)]
    assert windows_from([], False, 0, 400) == []


def test_intersection_of_windows():
    sun = [Window(0, 100, True, False), Window(200, 300, False, False)]
    earth = [Window(50, 250, False, False)]
    both = [Window(50, 100, False, False), Window(200, 250, False, False)]
    assert intersect_windows(sun, earth) == both
    assert intersect_windows(earth, sun) == both
    assert intersect_windows(sun, []) == []
    # An end is open only if every window that sets it is open there.
    whole = [Window(0, 400, True, True)]
    assert intersect_windows(whole, whole) == whole
    assert intersect_windows(whole, [Window(100, 400, False, True)]) == [Window(100, 400, False, True)]
    assert intersect_windows(whole, [Window(0, 300, True, False)]) == [Window(0, 300, True, False)]
    # Touching windows do not intersect.
    assert intersect_windows([Window(0, 100, True, False)], [Window(100, 200, False, False)]) == []


def test_complement_of_windows_gives_the_nights():
    sun = [Window(0, 100, True, False), Window(200, 300, False, False)]
    nights = complement_windows(sun, 0, 400)
    assert nights == [Window(100, 200, False, False), Window(300, 400, False, True)]
    assert complement_windows([], 0, 400) == [Window(0, 400, True, True)]  # night all along
    assert complement_windows([Window(0, 400, True, True)], 0, 400) == []
    assert complement_windows([Window(100, 400, False, True)], 0, 400) == [Window(0, 100, True, False)]
    assert window_hours(sun) + window_hours(nights) == pytest.approx(400 / 3600, abs=1e-12)


def test_hours():
    ws = [Window(0, 3600, True, False), Window(7200, 16200, False, False)]
    assert window_hours(ws) == 3.5 and longest_hours(ws) == 2.5
    assert window_hours([]) == 0.0 and longest_hours([]) == 0.0


# ---------------------------------------------------------------- 07 §13.3: smooth Moon against Horizons


def _only_crossing(table, site, mask, day: str, rising: bool) -> int:
    frame = frame_for(*site, mask)
    t_a = U(f"{day}T00:00:00Z")
    crossings, initial = find_crossings(sun_margin_fn(table, frame, mask), t_a, t_a + 86_400)
    assert len(crossings) == 1 and crossings[0]["rising"] is rising and initial is not rising
    return crossings[0]["t"]


def test_blue_ghost_smooth_sunset(real_table):
    expected, tol = BG1_SUNSET
    t = _only_crossing(real_table, BG1, formula_mask("flat:0"), "2025-03-16", rising=False)
    print(f"\nBlue Ghost 1 smooth sunset: {unix_to_iso(t)} (expected {expected} ± {tol} s)")
    assert abs(t - U(expected)) <= tol


def test_im2_planned_site_smooth_sunrise(real_table):
    expected, tol = IM2_SUNRISE
    t = _only_crossing(real_table, IM2_PLANNED, formula_mask("flat:0"), "2025-03-04", rising=True)
    print(f"\nIM-2 planned site smooth sunrise: {unix_to_iso(t)} (expected {expected} ± {tol} s)")
    assert abs(t - U(expected)) <= tol


def test_blue_ghost_smooth_sunset_with_the_observer_at_2_m(real_table):
    expected, tol = BG1_SUNSET_2M
    t = _only_crossing(real_table, BG1, smooth_mask(2.0), "2025-03-16", rising=False)
    print(f"\nBlue Ghost 1 smooth sunset at 2 m: {unix_to_iso(t)} (expected {expected} ± {tol} s)")
    assert abs(t - U(expected)) <= tol
    # A mast never brings the sunset forward.
    assert t > _only_crossing(real_table, BG1, formula_mask("flat:0"), "2025-03-16", rising=False)


# ---------------------------------------------------------------- windows and events on the table


def test_blue_ghost_march_2025_windows_and_nights(real_table):
    flat = formula_mask("flat:0")
    frame = frame_for(*BG1, flat)
    t_a, t_b = U("2025-03-01T00:00:00Z"), U("2025-04-01T00:00:00Z")
    crossings, initial = find_crossings(sun_margin_fn(real_table, frame, flat), t_a, t_b)
    days = windows_from(crossings, initial, t_a, t_b)
    nights = complement_windows(days, t_a, t_b)
    # 11 §2.4: sunrise, sunset and sunrise in March; the month starts and ends as described there.
    assert [c["rising"] for c in crossings] == [True, False, True] and initial is False
    assert [(w.open_start, w.open_end) for w in days] == [(False, False), (False, True)]
    assert [(w.open_start, w.open_end) for w in nights] == [(True, False), (False, False)]
    assert days[0].start_unix < U(BG1_LANDING) < days[0].end_unix
    assert abs(days[0].end_unix - U(BG1_SUNSET[0])) <= BG1_SUNSET[1]
    # Windows are sorted and do not overlap; Sun hours + night hours = the whole interval (07 §13.8).
    spans = sorted(days + nights, key=lambda w: w.start_unix)
    assert all(a.end_unix == b.start_unix for a, b in zip(spans, spans[1:], strict=False))
    assert window_hours(days) + window_hours(nights) == pytest.approx((t_b - t_a) / 3600, abs=0.001)
    # A lunar day at 18.6° N lasts about half a synodic month (29.53 d): 14.77 d.
    assert window_hours([days[0]]) / 24 == pytest.approx(14.77, abs=0.1)


def test_interval_without_events(real_table):
    # 07 §10: the Sun does not set (or does not rise) in the interval.
    flat = formula_mask("flat:0")
    frame = frame_for(*BG1, flat)
    f = sun_margin_fn(real_table, frame, flat)
    t_a, t_b = U("2025-03-04T00:00:00Z"), U("2025-03-10T00:00:00Z")  # lunar day
    assert find_crossings(f, t_a, t_b) == ([], True)
    assert find_events(real_table, frame, flat, t_a, t_b) == []  # the Earth never sets at Blue Ghost 1
    t_a, t_b = U("2025-03-19T00:00:00Z"), U("2025-03-25T00:00:00Z")  # lunar night
    crossings, initial = find_crossings(f, t_a, t_b)
    assert (crossings, initial) == ([], False)
    night = complement_windows(windows_from(crossings, initial, t_a, t_b), t_a, t_b)
    assert night == [Window(t_a, t_b, True, True)] and longest_hours(night) == 144.0


def test_find_events_sorts_sun_earth_and_eclipse_events(real_table):
    flat = formula_mask("flat:0")
    frame = frame_for(*NEAR_POLE, flat)
    t_a, t_b = U("2025-03-01T00:00:00Z"), U("2025-03-31T00:00:00Z")
    events = find_events(real_table, frame, flat, t_a, t_b)
    assert [e.t_unix for e in events] == sorted(e.t_unix for e in events)
    assert all(e.kind in EVENT_KINDS and t_a < e.t_unix < t_b for e in events)
    by_kind = {k: [e.t_unix for e in events if e.kind == k] for k in EVENT_KINDS}
    # In 30 days the Earth sets and rises at the pole (07 §13.6), and the eclipse of 14 March is seen.
    assert by_kind["earthrise"] and by_kind["earthset"]
    assert len(by_kind["eclipse_start"]) == 1 and len(by_kind["eclipse_end"]) == 1
    start, end = by_kind["eclipse_start"][0], by_kind["eclipse_end"][0]
    assert U("2025-03-14T04:00:00Z") < start < end < U("2025-03-14T11:00:00Z")
    # Every event is a real sign change of its margin, to the second.
    margin = {"sun": sun_margin_fn(real_table, frame, flat),
              "earth": earth_margin_fn(real_table, frame, flat)}
    for kind, body, rising in [("sunrise", "sun", True), ("sunset", "sun", False),
                               ("earthrise", "earth", True), ("earthset", "earth", False)]:
        for t in by_kind[kind]:
            before, after = margin[body](t - 2) > 0, margin[body](t + 2) > 0
            assert (before, after) == (not rising, rising), (kind, unix_to_iso(t))
    # Rises and sets of each body alternate.
    for up, down in (("sunrise", "sunset"), ("earthrise", "earthset")):
        seq = [e.kind for e in events if e.kind in (up, down)]
        assert all(a != b for a, b in zip(seq, seq[1:], strict=False))


def test_date_outside_the_table_raises(real_table):
    # 07 §10: «Date outside the table → OutOfRange»; nothing is computed.
    flat = formula_mask("flat:0")
    frame = site_frame(*BG1, 0.0)
    with pytest.raises(OutOfRange):
        find_events(real_table, frame, flat, U("1980-01-01T00:00:00Z"), U("1980-01-02T00:00:00Z"))
