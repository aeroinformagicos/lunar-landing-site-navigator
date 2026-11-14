# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Case A3: the sunset seen by Blue Ghost 1 on 16 March 2025 (11_validacion.md §4, A3).

Site ``blue-ghost-1`` (18.562° N, 61.810° E), SLDEM2015 mask, observer at 2 m. Expected: the centre of
the Sun sets between 18:00 and 18:15 UTC (Firefly: final data around 23:15 UTC, «5 hours into the lunar
night»; tests/golden/events_published.csv). Tolerance ``A3_min`` of tests/golden/tolerances.json: the
case passes if the sunset falls between 17:30 and 18:45 UTC.

The report also gives the instant the disc disappears completely (fraction 0), the instant half of it
is gone (fraction 0.5), the horizon at azimuth 269.7° and the smooth-Moon sunset (20:10:39 UTC, centre,
0 m), as 11 §4 asks for the review of a failure. Marker ``data``: it needs the relief (11 §1).
"""

from __future__ import annotations

import csv
import json

import pytest

from pipeline.cli.report import FIREFLY_END, iso_z
from pipeline.common.timeutil import iso_to_unix
from pipeline.common.timeutil import unix_to_iso as _unix_to_iso
from pipeline.tests.conftest import REPO_ROOT, WEB_DATA
from pipeline.vis.events import find_crossings, sun_margin_fn
from pipeline.vis.sky import evaluate, frame_for, horizon_at, load_mask, smooth_mask

GOLDEN = REPO_ROOT / "tests" / "golden"
TOL = json.loads((GOLDEN / "tolerances.json").read_text(encoding="utf-8"))

SITE_ID = "blue-ghost-1"
SITE = (18.562, 61.810)  # 11 §4, A3
OBSERVER_M = 2  # 11 §4, A3
# 11 §4, A3: the sunset window (its end is the «sunset_latest» row of events_published.csv).
WINDOW_START = "2025-03-16T18:00:00Z"
# 11 §4, A3: the horizon that the window implies at the azimuth of the setting Sun, and that azimuth.
EXPECTED_HORIZON_DEG = 0.9
SUNSET_AZ_DEG = 269.7
# 05 §8.3: Horizons, Sun from Blue Ghost 1 at 0 m: elevation at 18:15 UTC and smooth-Moon sunset.
HORIZONS_EL_1815 = 0.924849952
SMOOTH_SUNSET = "2025-03-16T20:10:39Z"
# Interval searched: the day of the sunset.
T_A, T_B = "2025-03-16T00:00:00Z", "2025-03-17T00:00:00Z"


def unix_to_iso(t: float) -> str:
    return iso_z(_unix_to_iso(t))


def published() -> dict[str, str]:
    with open(GOLDEN / "events_published.csv", newline="", encoding="utf-8") as f:
        return {r["event"]: r["utc"] for r in csv.DictReader(f) if r["case"] == "A3"}


def outside_window_min(t: float, a: float, b: float) -> float:
    """Minutes from ``t`` to the window [a, b]; 0 inside it."""
    return max(a - t, t - b, 0.0) / 60.0


def test_outside_window_min():
    assert outside_window_min(5.0, 0.0, 600.0) == 0.0
    assert outside_window_min(660.0, 0.0, 600.0) == 1.0
    assert outside_window_min(-120.0, 0.0, 600.0) == 2.0


@pytest.fixture(scope="module")
def mask():
    doc = json.loads((WEB_DATA / "horizon" / f"{SITE_ID}.json").read_text(encoding="utf-8"))
    if doc["relief"] != "sldem2015":
        pytest.skip(f"{SITE_ID} has no SLDEM2015 mask (relief {doc['relief']}): make sites")
    return load_mask(WEB_DATA, SITE_ID, OBSERVER_M), doc["relief_label"]


@pytest.mark.data
def test_a3_blue_ghost_sunset(real_table, mask, record_case):
    m, relief_label = mask
    frame = frame_for(*SITE, m)
    a, b = iso_to_unix(T_A), iso_to_unix(T_B)
    events = published()
    w_a, w_b = iso_to_unix(WINDOW_START), iso_to_unix(events["sunset_latest"])
    tol_min = TOL["A3_min"]

    # Sunset of the centre (07 §3): the one sunset of the day.
    crossings, initially_up = find_crossings(sun_margin_fn(real_table, frame, m), a, b)
    assert initially_up and [c["rising"] for c in crossings] == [False], crossings
    sunset = crossings[0]["t"]

    def fraction_fn(level: float):
        return lambda t: evaluate(real_table, frame, m, t).sun.disc_fraction - level

    half = find_crossings(fraction_fn(0.5), a, b)[0]
    gone = find_crossings(fraction_fn(0.0), a, b)[0]
    assert [c["rising"] for c in half] == [False] and [c["rising"] for c in gone] == [False]
    horizon_az = horizon_at(m.el, SUNSET_AZ_DEG)
    el_1815 = evaluate(real_table, frame, m, w_b).sun.el_deg

    flat = smooth_mask(0)
    smooth = find_crossings(sun_margin_fn(real_table, frame_for(*SITE, flat), flat), a, b)[0]
    assert [c["rising"] for c in smooth] == [False]
    smooth_t = smooth[0]["t"]

    off = outside_window_min(sunset, w_a, w_b)
    ok = off <= tol_min
    window = f"{WINDOW_START}/{events['sunset_latest']}"
    details = [
        {"label": "Sunset", "expected": window, "obtained": unix_to_iso(sunset),
         "abs_err": round(off, 2), "unit": "min", "ok": ok},
        {"label": "Half of the disc set (fraction 0.5)", "expected": None,
         "obtained": unix_to_iso(half[0]["t"]), "abs_err": None, "unit": "UTC", "ok": None},
        {"label": "Disc fully set (fraction 0)", "expected": None,
         "obtained": unix_to_iso(gone[0]["t"]), "abs_err": None, "unit": "UTC", "ok": None},
        {"label": f"Horizon at azimuth {SUNSET_AZ_DEG} deg", "expected": EXPECTED_HORIZON_DEG,
         "obtained": round(horizon_az, 4), "abs_err": round(abs(horizon_az - EXPECTED_HORIZON_DEG), 4),
         "unit": "deg", "ok": None},
        {"label": f"Sun elevation at {events['sunset_latest'][11:16]} UTC (observer at {OBSERVER_M} m)",
         "expected": HORIZONS_EL_1815, "obtained": round(el_1815, 6),
         "abs_err": round(abs(el_1815 - HORIZONS_EL_1815), 6), "unit": "deg", "ok": None},
        {"label": "Smooth-Moon sunset, observer at 0 m", "expected": SMOOTH_SUNSET,
         "obtained": unix_to_iso(smooth_t), "abs_err": abs(smooth_t - iso_to_unix(SMOOTH_SUNSET)),
         "unit": "s", "ok": abs(smooth_t - iso_to_unix(SMOOTH_SUNSET)) <= 1},
    ]
    clock = unix_to_iso(sunset)[11:19]
    if ok:
        note = (f"Relief {relief_label}, observer at {OBSERVER_M} m. Sunset of the centre of the Sun at "
                f"{clock} UTC.")
    else:
        late = "after the end" if sunset > w_b else "before the start"
        note = (f"Our sunset of the centre of the Sun, with the {relief_label} horizon and the observer at "
                f"{OBSERVER_M} m, is at {clock} UTC: {off:.0f} min {late} of the 18:00-18:15 UTC window "
                f"inferred from Firefly's account, beyond the {tol_min} min tolerance. Our horizon toward "
                f"the setting Sun (azimuth {SUNSET_AZ_DEG} deg) is {horizon_az:.2f} deg; the window implies "
                f"about {EXPECTED_HORIZON_DEG} deg. Under review: the terrain crop, what Firefly calls "
                "sunset, and the observer height.")
    record_case("A3", "pass" if ok else "fail",
                "Sunset of the centre of the Sun between 18:00 and 18:15 UTC (Firefly: last data "
                "around 23:15 UTC, 5 hours into the lunar night)",
                f"Sunset {clock} UTC ({relief_label}, observer {OBSERVER_M} m); disc fully set "
                f"{unix_to_iso(gone[0]['t'])[11:19]} UTC",
                f"{tol_min} min", FIREFLY_END, details, note)
    print(f"\nA3: sunset {unix_to_iso(sunset)}, half {unix_to_iso(half[0]['t'])}, "
          f"gone {unix_to_iso(gone[0]['t'])}, "
          f"horizon({SUNSET_AZ_DEG}) = {horizon_az:.4f} deg, el(18:15) = {el_1815:.4f} deg, "
          f"smooth 0 m {unix_to_iso(smooth_t)}; {off:.1f} min outside the window (tolerance {tol_min} min)")
    assert ok, note
