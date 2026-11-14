# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Case A2: rise and set of the centre of the Sun in March 2025 against JPL Horizons.

Specification: 11_validacion.md §2.4 and §4.

Reference: the 0° crossings of tests/golden/horizons_sun_series.csv (1-minute series downloaded by
``make golden``), by linear interpolation between the two rows of different sign. Ours: ``find_crossings``
on a smooth Moon with the observer at 0 m (mask ``flat:0``), over the ephemeris table. The comparison
is activated by T-10, which writes ``pipeline/vis/events.py``; until then only the file is checked.
"""

from __future__ import annotations

import csv
import importlib.util
import json
import sys
from collections import defaultdict

import pytest

from pipeline.common.timeutil import iso_to_unix, unix_to_iso
from pipeline.ephem.interp import load_table, site_frame, sky_at
from pipeline.tests.conftest import REPO_ROOT

GOLDEN = REPO_ROOT / "tests" / "golden"
SERIES_CSV = GOLDEN / "horizons_sun_series.csv"
RAW = GOLDEN / "raw"
WEB_DATA = REPO_ROOT / "web" / "public" / "data"
TOL = json.loads((GOLDEN / "tolerances.json").read_text(encoding="utf-8"))

# 11 §2.4: sites and number of crossings expected in March 2025.
A2_SITES = {
    "apollo-11": ((0.67416, 23.47314), 2),
    "blue-ghost-1": ((18.562, 61.81), 3),
    "change-3": ((44.1214, -19.5117), 2),
}
MARCH_START, MARCH_END = "2025-03-01T00:00:00Z", "2025-04-01T00:00:00Z"
# 05 §8.3 and 11 §2.4: smooth-Moon sunset of the centre of the Sun at Blue Ghost 1 (to the second).
BG1_SUNSET = "2025-03-16T20:10:39Z"
BG1_SUNSET_TOL_S = 1.0
# 11 §2.4: Blue Ghost 1 landed on 2025-03-02 at 08:34 UTC, after the first sunrise of the month.
BG1_LANDING = "2025-03-02T08:34:00Z"
# 11 §2.4: a 1-minute series from 60 min before to 60 min after the hour before the crossing.
FINE_ROWS = 121
# 07 §6.2: coarse step of find_crossings, seconds; 11 §4, A2: expected agreement (reported).
STEP_S = 600
A2_EXPECTED_MAX_S = 15

needs_series = pytest.mark.skipif(not SERIES_CSV.is_file(),
                                  reason="horizons_sun_series.csv missing: make golden")


def _load_fetcher():
    spec = importlib.util.spec_from_file_location("fetch_golden", REPO_ROOT / "ops" / "fetch_golden.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod  # dataclasses look the module up while it loads
    spec.loader.exec_module(mod)
    return mod


fg = _load_fetcher()


def _series() -> dict[tuple[str, str], list[dict[str, str]]]:
    """Rows grouped by (site, first utc of the series): one group per fine query."""
    with open(SERIES_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    groups: dict[tuple[str, int], list[dict[str, str]]] = defaultdict(list)
    n = 0
    for i, r in enumerate(rows):
        if i and (r["site_id"] != rows[i - 1]["site_id"]
                  or iso_to_unix(r["utc"]) - iso_to_unix(rows[i - 1]["utc"]) != 60.0):
            n += 1
        groups[(r["site_id"], n)].append(r)
    return {(k[0], v[0]["utc"]): v for k, v in groups.items()}


def reference_crossings() -> dict[str, list[tuple[float, bool]]]:
    """Horizons crossings per site: (Unix time, rising), sorted."""
    out: dict[str, list[tuple[float, bool]]] = defaultdict(list)
    for (site, _), rows in _series().items():
        changes = fg.sign_changes(rows)
        assert len(changes) == 1, (site, rows[0]["utc"], changes)
        i, event = changes[0]
        assert event == rows[0]["event"]
        out[site].append((fg.crossing_utc(rows, i), event == "sunrise"))
    return {k: sorted(v) for k, v in out.items()}


@needs_series
def test_series_file_has_the_crossings_of_march_2025():
    with open(SERIES_CSV, newline="", encoding="utf-8") as f:
        header = next(csv.reader(f))
    assert header == fg.SERIES_COLUMNS
    series = _series()
    for (site, _), rows in series.items():
        assert len(rows) == FINE_ROWS
        (lat, lon), _n = A2_SITES[site]
        for r in rows:
            assert r["case"] == "A2" and float(r["alt_km"]) == 0.0
            assert (float(r["lat_deg"]), float(r["lon_deg"])) == (lat, lon)
    ref = reference_crossings()
    assert {s: len(v) for s, v in ref.items()} == {s: n for s, (_, n) in A2_SITES.items()}
    for site, crossings in ref.items():
        assert all(iso_to_unix(MARCH_START) < t < iso_to_unix(MARCH_END) for t, _ in crossings)
        # Rises and sets alternate.
        assert all(a[1] != b[1] for a, b in zip(crossings, crossings[1:], strict=False)), site


@needs_series
def test_blue_ghost_crossings_match_the_specification():
    rises, sets = [], []
    for t, rising in reference_crossings()["blue-ghost-1"]:
        (rises if rising else sets).append(t)
    assert len(rises) == 2 and len(sets) == 1
    assert abs(sets[0] - iso_to_unix(BG1_SUNSET)) <= BG1_SUNSET_TOL_S, unix_to_iso(sets[0])
    assert rises[0] < iso_to_unix(BG1_LANDING) < sets[0] < rises[1]


@needs_series
def test_raw_responses_have_the_horizons_header():
    names = sorted(p.name for p in RAW.glob("A2_*.txt"))
    assert len(names) == len(A2_SITES) + sum(n for _, n in A2_SITES.values())
    for name in names:
        site_id = name[3:].split("_sun_")[0]
        (lat, lon), _ = A2_SITES[site_id]
        text = (RAW / name).read_text(encoding="utf-8")
        assert fg.check_header(text, fg.Site(site_id, lat, lon)) == []


# ---------------------------------------------------------------- A2 proper (activated by T-10)


@needs_series
def test_a2_rise_and_set_against_horizons():
    try:
        from pipeline.vis.events import find_crossings
    except ImportError:
        pytest.skip("activated by T-10 (pipeline/vis/events.py: find_crossings)")
    meta = WEB_DATA / "ephemeris.meta.json"
    if not meta.is_file() or json.loads(meta.read_text(encoding="utf-8")).get("synthetic") is not False:
        pytest.skip("real table not published: make ephem")
    table = load_table(WEB_DATA)
    tol_s = 60.0 * TOL["A2_min"]
    worst = 0.0
    for site, crossings in reference_crossings().items():
        (lat, lon), _ = A2_SITES[site]
        frame = site_frame(lat, lon, 0.0)

        # Smooth Moon, observer at 0 m (mask flat:0): the margin is the elevation of the centre.
        def margin(t, frame=frame):
            return sky_at(table, frame, t)["sun"]["el_deg"]

        ours, _ = find_crossings(margin, iso_to_unix(MARCH_START), iso_to_unix(MARCH_END), STEP_S)
        for t_ref, rising in crossings:
            same = [c["t"] for c in ours if c["rising"] == rising]
            assert same, (site, rising)
            t = min(same, key=lambda x: abs(x - t_ref))
            d = abs(t - t_ref)
            assert d < tol_s, (site, rising, unix_to_iso(t_ref), unix_to_iso(t))
            worst = max(worst, d)
    print(f"\nA2: max |d t| = {worst:.1f} s (tolerance {tol_s:.0f} s, expected < {A2_EXPECTED_MAX_S} s)")
