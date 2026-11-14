# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""The shared vectors file tests/golden/core_vectors.json (07_visibilidad.md §12.3).

Checks that every block of §12.3 is there with its number of cases, that the validation scenarios B1
and B2 are in it, and that the Python reference still gives the same values for a sample of every
block (the file is not stale). The TypeScript side is web/src/core/__tests__/vectors.test.ts.
"""

from __future__ import annotations

import json

import pytest

from pipeline.ephem.interp import site_frame, sky_at
from pipeline.tests.conftest import REPO_ROOT, WEB_DATA
from pipeline.vis.discs import disc_fraction
from pipeline.vis.eclipse import eclipse_state
from pipeline.vis.events import find_events
from pipeline.vis.requirements import DEFAULT_REQUIREMENTS, Requirements, assess_scenario, replan_row
from pipeline.vis.sky import evaluate, horizon_at
from pipeline.vis.vectors import Context, metrics_case, unix

VECTORS = REPO_ROOT / "tests" / "golden" / "core_vectors.json"
# Blocks and number of cases of 07 §12.3.
SPEC_COUNTS = {
    "sky": 200, "horizon_at": 50, "disc_fraction": 100, "evaluate": 100, "events": 20,
    "metrics": 20, "assess": 30, "replan_row": 6, "rank": 4, "eclipse": 30,
}
# Fields of each block read by vectors.test.ts (D-65, D-82 g) and b1.spec.ts (D-90 a).
FIELDS = {
    "sky": {"lat_deg", "lon_deg", "height_m", "t_unix", "sun", "earth"},
    "horizon_at": {"mask", "az_deg", "el_deg"},
    "disc_fraction": {"mask", "az_c", "el_c", "rho", "fraction"},
    "evaluate": {"site_id", "t_unix", "observer_height_m", "sun", "earth", "both"},
    "events": {"site_id", "observer_height_m", "t_a", "t_b", "events"},
    "metrics": {"site_id", "observer_height_m", "landing_unix", "mission_days", "cursor_unix", "sun_hours",
                "earth_hours", "both_hours", "longest_night_h", "longest_link_gap_h", "sun_el_max_deg",
                "sun_el_min_deg", "sun_el_deg", "sun_margin_deg", "sun_disc_pct", "earth_el_deg",
                "earth_margin_deg", "sun_pct", "earth_pct", "next_sun_event", "next_earth_event"},
    "assess": {"site_id", "observer_height_m", "landing_unix", "mission_days", "status", "reasons"},
    "replan_row": {"site_id", "observer_height_m", "t0", "delta_s", "mission_days", "statuses"},
    "rank": {"landing_unix", "mission_days", "site_ids"},
    "eclipse": {"site_id", "observer_height_m", "t_unix", "kind", "covered", "sep_deg"},
}


@pytest.fixture(scope="module")
def vectors() -> dict:
    return json.loads(VECTORS.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def ctx(real_table):
    return Context(WEB_DATA)


def test_every_block_with_its_cases(vectors):
    for name, n in SPEC_COUNTS.items():
        assert len(vectors[name]) == n, name
        for case in vectors[name]:
            assert FIELDS[name] <= set(case), (name, FIELDS[name] - set(case))


def test_b1_scenarios_are_in_the_metrics_block(vectors):
    # 11_validacion.md, B1: five scenarios, cursor at landing + 1 d, observer at 2 m (D-90 a).
    sites = json.loads((WEB_DATA / "sites.json").read_text(encoding="utf-8"))["defaults"]
    expected = [
        ("blue-ghost-1", unix("2025-03-02T08:34:00Z"), 14),
        ("im-2", unix("2025-03-06T17:30:00Z"), 10),
        ("region-malapert-massif", unix("2027-08-01T00:00:00Z"), 14),
        ("apollo-11", unix("1969-07-20T20:00:00Z"), 3),
        (sites["demo_pair"][0], unix(sites["demo_landing_utc"]), sites["demo_mission_days"]),
    ]
    got = {(c["site_id"], c["landing_unix"], c["mission_days"]): c for c in vectors["metrics"]}
    for key in expected:
        c = got[key]
        assert c["observer_height_m"] == 2 and c["cursor_unix"] == key[1] + 86_400


def test_b2_cases_are_in_the_assess_block(vectors):
    base = unix("2025-03-02T08:34:00Z")
    expected = {base: ("go", []), base + 14 * 86_400: ("no_go", ["night_too_long"]),
                base + int(29.5 * 86_400): ("go", [])}
    got = {c["landing_unix"]: (c["status"], c["reasons"]) for c in vectors["assess"]
           if c["site_id"] == "blue-ghost-1" and c["mission_days"] == 14 and "requirements" not in c}
    for t, exp in expected.items():
        assert got[t] == exp


def test_every_reason_code_appears(vectors):
    reasons = {r for c in vectors["assess"] for r in c["reasons"]}
    assert reasons == {"no_sun_at_landing", "no_earth_at_landing", "night_too_long",
                       "sun_partly_hidden", "earth_low", "night_near_limit"}
    assert {c["status"] for c in vectors["assess"]} == {"go", "marginal", "no_go"}
    assert {c["kind"] for c in vectors["eclipse"]} == {"none", "partial", "total"}
    assert {c["delta_s"] for c in vectors["replan_row"]} == {21_600, 43_200, 86_400, 172_800}


# ---- The reference still gives the file's values (a sample of the slow blocks, all of the fast ones)
# Compared with the tolerances of 07 §12 (4): the file is written on one machine and checked on others,
# and libm may differ in the last bit between platforms.
TOL_DEG = 1e-6
TOL_FRAC = 1e-6
TOL_KM = 1e-3
TOL_S = 1
TOL_H = 0.001


def _tol(key: str) -> float:
    if key.endswith("_km"):
        return TOL_KM
    if key.endswith(("_hours", "_h")):
        return TOL_H
    if key.endswith("_unix") or key in ("t_a", "t_b", "t0"):
        return TOL_S
    return TOL_DEG if key.endswith("_deg") else TOL_FRAC


def assert_close(got, exp, key: str = "") -> None:
    """Same structure; numbers within the §12 tolerance of their field; everything else identical."""
    if isinstance(exp, dict):
        assert isinstance(got, dict) and set(got) == set(exp), (key, got, exp)
        for k in exp:
            assert_close(got[k], exp[k], k)
    elif isinstance(exp, (list, tuple)):
        assert isinstance(got, (list, tuple)) and len(got) == len(exp), (key, got, exp)
        for g, e in zip(got, exp, strict=True):
            assert_close(g, e, key)
    elif isinstance(exp, bool) or exp is None or isinstance(exp, str):
        assert got == exp, (key, got, exp)
    elif isinstance(exp, (int, float)):
        d = abs(got - exp)
        if key.startswith("az"):
            d = min(d, 360 - d)
        assert d <= _tol(key), (key, got, exp)
    else:
        assert got == exp, (key, got, exp)


def test_fast_blocks_reproduce(vectors, ctx):
    for c in vectors["horizon_at"]:
        assert_close(horizon_at(ctx.mask(c["mask"]).el, c["az_deg"]), c["el_deg"], "el_deg")
    for c in vectors["disc_fraction"]:
        f = disc_fraction(ctx.mask(c["mask"]), c["az_c"], c["el_c"], c["rho"])
        assert_close(f, c["fraction"], "fraction")
    for c in vectors["sky"]:
        s = sky_at(ctx.table, site_frame(c["lat_deg"], c["lon_deg"], c["height_m"]), c["t_unix"])
        for body in ("sun", "earth"):
            assert_close(s[body], c[body], body)
    for c in vectors["evaluate"]:
        m, f = ctx.site_mask_frame(c["site_id"], c["observer_height_m"])
        s = evaluate(ctx.table, f, m, c["t_unix"])
        assert_close({"sun_margin_deg": s.sun.margin_deg, "sun_fraction": s.sun.disc_fraction,
                      "earth_margin_deg": s.earth.margin_deg, "both": s.both},
                     {"sun_margin_deg": c["sun"]["margin_deg"], "sun_fraction": c["sun"]["disc_fraction"],
                      "earth_margin_deg": c["earth"]["margin_deg"], "both": c["both"]})
    for c in vectors["eclipse"]:
        _, f = ctx.site_mask_frame(c["site_id"], c["observer_height_m"])
        e = eclipse_state(sky_at(ctx.table, f, c["t_unix"]))
        assert e.kind == c["kind"]
        assert_close({"covered": e.covered, "sep_deg": e.sep_deg},
                     {"covered": c["covered"], "sep_deg": c["sep_deg"]})


def test_slow_blocks_reproduce_a_sample(vectors, ctx):
    c = min(vectors["events"], key=lambda x: x["t_b"] - x["t_a"])
    m, f = ctx.site_mask_frame(c["site_id"], c["observer_height_m"])
    got = find_events(ctx.table, f, m, c["t_a"], c["t_b"])
    assert_close([{"t_unix": e.t_unix, "kind": e.kind} for e in got], c["events"])

    c = min(vectors["metrics"], key=lambda x: x["mission_days"])
    keys = ("site_id", "observer_height_m", "landing_unix", "mission_days", "cursor_unix")
    assert_close(metrics_case(ctx, *(c[k] for k in keys)), c)

    c = next(x for x in vectors["assess"] if "requirements" in x and x["mission_days"] <= 7)
    m, f = ctx.site_mask_frame(c["site_id"], c["observer_height_m"])
    req = Requirements(**c["requirements"])
    a, _ = assess_scenario(ctx.table, f, m, c["landing_unix"], c["mission_days"], req)
    assert (a.status, a.reasons) == (c["status"], c["reasons"])

    c = vectors["replan_row"][0]
    m, f = ctx.site_mask_frame(c["site_id"], c["observer_height_m"])
    row = replan_row(ctx.table, f, m, c["t0"], c["delta_s"], c["mission_days"], DEFAULT_REQUIREMENTS)
    assert [x.status for x in row] == c["statuses"]
