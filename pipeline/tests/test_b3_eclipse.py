# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Case B3: the eclipse of 14 March 2025 seen by Blue Ghost 1 (07_visibilidad.md §13.4; 11_validacion.md §4).

Site 18.562° N, 61.810° E, height 0. Expected: the check figures of the plan (SPICE), with a
regression tolerance of ± 60 s, and the times published by Firefly Aerospace
(tests/golden/events_published.csv), with the tolerance ``B3_min`` of tests/golden/tolerances.json.
The reference works on the ephemeris table (07 §12.2); the last test repeats the search with SPICE
alone (marker ``kernels``), without the table.
"""

from __future__ import annotations

import csv
import json
import math

import pytest

from pipeline.cli.report import FIREFLY
from pipeline.common.constants import R_EARTH_KM, R_SUN_KM
from pipeline.common.timeutil import iso_to_unix, unix_to_et, unix_to_iso
from pipeline.ephem.interp import site_frame
from pipeline.ephem.kernels import load_kernels
from pipeline.ephem.spice_ref import azel_spice
from pipeline.tests.conftest import KERNELS_SKIP_MSG, REPO_ROOT, kernels_present
from pipeline.vis.eclipse import angular_sep
from pipeline.vis.events import Window, eclipse_timeline, find_crossings, find_events
from pipeline.vis.sky import evaluate, formula_mask

GOLDEN = REPO_ROOT / "tests" / "golden"
TOL = json.loads((GOLDEN / "tolerances.json").read_text(encoding="utf-8"))

# 07 §13.4: site of case B3.
SITE = (18.562, 61.810)
# 07 §13.4: check figures of the plan (SPICE) and their regression tolerance.
PLAN = {
    "eclipse_start": "2025-03-14T05:01:00Z",
    "totality_start": "2025-03-14T06:17:30Z",
    "totality_end": "2025-03-14T08:34:00Z",
    "eclipse_end": "2025-03-14T09:51:00Z",
}
PLAN_TOL_S = 60
# 07 §13.4: the Sun is fully covered at this instant.
MID_TOTALITY = "2025-03-14T07:30:00Z"
# Interval searched: the day of the eclipse.
T_A, T_B = "2025-03-14T00:00:00Z", "2025-03-15T00:00:00Z"
KINDS = list(PLAN)


def U(iso: str) -> float:
    return iso_to_unix(iso)


def firefly_times() -> dict[str, float]:
    with open(GOLDEN / "events_published.csv", newline="", encoding="utf-8") as f:
        return {r["event"]: U(r["utc"]) for r in csv.DictReader(f) if r["case"] == "B3"}


@pytest.fixture(scope="module")
def timeline(real_table):
    return eclipse_timeline(real_table, site_frame(*SITE, 0.0), U(T_A), U(T_B))


def _report(label: str, times: dict[str, float]) -> None:
    worst = max(abs(times[k] - U(PLAN[k])) for k in KINDS)
    listing = ", ".join(f"{k} {unix_to_iso(times[k])[11:19]}" for k in KINDS)
    print(f"\nB3 ({label}): {listing}; max |d t| against the plan = {worst:.0f} s (tolerance {PLAN_TOL_S} s)")


def test_b3_events_against_the_plan_figures(timeline):
    assert [e.kind for e in timeline.events] == KINDS  # the four events, in this order
    times = {e.kind: e.t_unix for e in timeline.events}
    _report("table", times)
    for kind, expected in PLAN.items():
        assert abs(times[kind] - U(expected)) <= PLAN_TOL_S, (kind, unix_to_iso(times[kind]))


# 09 §7: the labels of the headline rows of B3.
B3_LABELS = {"eclipse_start": "Eclipse starts", "totality_start": "Totality starts",
             "totality_end": "Totality ends", "eclipse_end": "Eclipse ends"}


def test_b3_events_against_firefly(timeline, record_case):
    published = firefly_times()
    assert sorted(published) == sorted(KINDS)
    tol_s = 60.0 * TOL["B3_min"]
    worst = 0.0
    details = []
    for e in timeline.events:
        d = abs(e.t_unix - published[e.kind])
        details.append({"label": B3_LABELS[e.kind], "expected": unix_to_iso(published[e.kind]),
                        "obtained": unix_to_iso(e.t_unix), "abs_err": round(d / 60.0, 2), "unit": "min",
                        "ok": d <= tol_s})
        worst = max(worst, d)
    ok = len(details) == len(KINDS) and all(x["ok"] for x in details)
    record_case("B3", "pass" if ok else "fail", "Partial 05:00-09:52 UTC, total 06:18-08:34 UTC",
                ", ".join(f"{x['label']} {x['obtained'][11:19]} UTC" for x in details),
                f"{TOL['B3_min']} min", FIREFLY, details,
                f"Largest difference {worst / 60.0:.1f} min. Observer at 0 m; the eclipse does not depend "
                "on the terrain.")
    for e in timeline.events:
        assert abs(e.t_unix - published[e.kind]) <= tol_s, (e.kind, unix_to_iso(e.t_unix))
    print(f"\nB3 against Firefly: max |d t| = {worst:.0f} s (tolerance {tol_s:.0f} s)")


def test_b3_windows_match_the_events(timeline):
    t = {e.kind: e.t_unix for e in timeline.events}
    assert timeline.windows == [Window(t["eclipse_start"], t["eclipse_end"], False, False)]
    assert timeline.totality == [Window(t["totality_start"], t["totality_end"], False, False)]


def test_b3_totality_at_0730_and_the_partial_phases(real_table, timeline):
    frame = site_frame(*SITE, 0.0)
    flat = formula_mask("flat:0")
    mid = evaluate(real_table, frame, flat, U(MID_TOTALITY))
    assert (mid.eclipse.kind, mid.eclipse.covered) == ("total", 1.0)
    # The Sun is above the smooth horizon, but no light arrives (07 §4.3).
    assert mid.sun.visible and mid.sun.disc_fraction == 1.0 and mid.sun.lit_fraction == 0.0
    t = {e.kind: e.t_unix for e in timeline.events}

    def covered(at: float) -> float:
        return evaluate(real_table, frame, flat, at).eclipse.covered

    assert covered(t["eclipse_start"] - 60) == 0.0 and covered(t["eclipse_end"] + 60) == 0.0
    assert covered(t["totality_start"] + 60) == 1.0 and covered(t["totality_end"] - 60) == 1.0
    # The covered share grows during the ingress and shrinks during the egress.
    ingress = [covered(t["eclipse_start"] + 60 + i * 300) for i in range(15)]
    egress = [covered(t["totality_end"] + 60 + i * 300) for i in range(15)]
    assert all(0.0 < x < y < 1.0 for x, y in zip(ingress, ingress[1:], strict=False))
    assert all(1.0 > x > y > 0.0 for x, y in zip(egress, egress[1:], strict=False))


def test_b3_does_not_depend_on_the_terrain(real_table, timeline):
    # 07 §9 and §10: the eclipse is reported even with the Sun below the horizon.
    frame = site_frame(*SITE, 0.0)
    wall = formula_mask("flat:40")  # the Sun is at about 29° of elevation
    state = evaluate(real_table, frame, wall, U(MID_TOTALITY))
    assert not state.sun.visible and state.sun.disc_fraction == 0.0
    assert (state.eclipse.kind, state.eclipse.covered) == ("total", 1.0)
    events = find_events(real_table, frame, wall, U(T_A), U(T_B))
    assert events == timeline.events  # no sunrise or sunset that day behind the wall: only the eclipse


# ---------------------------------------------------------------- with SPICE alone, without the table


@pytest.fixture(scope="module")
def kernels(kernels_dir):
    if not kernels_present():
        pytest.skip(KERNELS_SKIP_MSG)
    load_kernels(kernels_dir)


@pytest.mark.kernels
def test_b3_with_spice_alone(kernels, timeline):
    lat, lon = SITE

    def geometry(t: float) -> tuple[float, float, float]:
        et = unix_to_et(t)
        sun_az, sun_el, sun_km = azel_spice("SUN", et, lat, lon, 0.0)
        earth_az, earth_el, earth_km = azel_spice("EARTH", et, lat, lon, 0.0)
        a = math.degrees(math.asin(R_SUN_KM / sun_km))
        b = math.degrees(math.asin(R_EARTH_KM / earth_km))
        return angular_sep(sun_az, sun_el, earth_az, earth_el), a, b

    def f_eclipse(t: float) -> float:
        s, a, b = geometry(t)
        return a + b - s

    def f_totality(t: float) -> float:
        s, a, b = geometry(t)
        return b - a - s

    partial, _ = find_crossings(f_eclipse, U(T_A), U(T_B))
    total, _ = find_crossings(f_totality, U(T_A), U(T_B))
    assert [c["rising"] for c in partial] == [True, False] and [c["rising"] for c in total] == [True, False]
    times = {"eclipse_start": partial[0]["t"], "totality_start": total[0]["t"],
             "totality_end": total[1]["t"], "eclipse_end": partial[1]["t"]}
    _report("SPICE", times)
    for kind, expected in PLAN.items():
        assert abs(times[kind] - U(expected)) <= PLAN_TOL_S, (kind, unix_to_iso(times[kind]))
    # The table reproduces SPICE: reported, and held to the same regression tolerance.
    table_times = {e.kind: e.t_unix for e in timeline.events}
    worst = max(abs(table_times[k] - times[k]) for k in KINDS)
    print(f"B3: table against SPICE, max |d t| = {worst:.0f} s")
    assert worst <= PLAN_TOL_S
