# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Case A1: azimuth and elevation of the Sun and the Earth against JPL Horizons (11_validacion.md §2.3, §4).

Expected values come from tests/golden/horizons_azel.csv (downloaded by ``make golden``, reviewed by
A1); the tolerance from tests/golden/tolerances.json. Also tests the parser of ops/fetch_golden.py
(§2.2): the three date variants, the header checks and the raw responses kept in tests/golden/raw/.
"""

from __future__ import annotations

import csv
import importlib.util
import json
import math
import re
import sys

import pytest

from pipeline.common.timeutil import iso_to_unix, unix_to_et
from pipeline.ephem.interp import load_table, site_frame, sky_at
from pipeline.ephem.kernels import load_kernels
from pipeline.ephem.spice_ref import azel_spice
from pipeline.tests.conftest import KERNELS_SKIP_MSG, REPO_ROOT, kernels_present

GOLDEN = REPO_ROOT / "tests" / "golden"
AZEL_CSV = GOLDEN / "horizons_azel.csv"
RAW = GOLDEN / "raw"
WEB_DATA = REPO_ROOT / "web" / "public" / "data"
TOL = json.loads((GOLDEN / "tolerances.json").read_text(encoding="utf-8"))

# 11 §2.3: sites (lat, east lon) and instants of case A1.
A1_SITES = {
    "apollo-11": (0.67416, 23.47314),
    "blue-ghost-1": (18.562, 61.81),
    "chandrayaan-3": (-69.3741, 32.32),
    "im-2": (-84.7906, 29.1957),
    "change-7-candidate": (-88.8, 123.4),
    "val-899s": (-89.9, 0.0),
    "change-4": (-45.4561, 177.5885),
    "change-6": (-41.6385, -153.9852),
}
A1_INSTANTS = [
    "2025-03-14T06:00:00Z", "2025-09-07T18:00:00Z", "2026-06-15T12:00:00Z", "2027-01-01T00:00:00Z",
    "2027-10-20T03:30:00Z", "2028-02-29T12:00:00Z", "2029-06-26T03:00:00Z", "2030-12-31T23:00:00Z",
]
# 11 §4, A1: expected maximum error of the SPICE reference (reported, not the pass criterion).
A1_EXPECTED_MAX_DEG = 0.001


def _load_fetcher():
    spec = importlib.util.spec_from_file_location("fetch_golden", REPO_ROOT / "ops" / "fetch_golden.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod  # dataclasses look the module up while it loads
    spec.loader.exec_module(mod)
    return mod


fg = _load_fetcher()

needs_azel = pytest.mark.skipif(not AZEL_CSV.is_file(), reason="horizons_azel.csv missing: make golden")


def _rows() -> list[dict[str, str]]:
    with open(AZEL_CSV, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _errors(r: dict[str, str], az: float, el: float) -> tuple[float, float]:
    """Azimuth error weighted by cos(elevation) and elevation error, degrees (11 §4, A1)."""
    daz = abs((az - float(r["az_deg"]) + 540.0) % 360.0 - 180.0)
    return daz * math.cos(math.radians(float(r["el_deg"]))), abs(el - float(r["el_deg"]))


# ---------------------------------------------------------------- parser (11 §2.2), no network


@pytest.mark.parametrize(("text", "iso"), [
    ("2025-Mar-14 06:00:00.000", "2025-03-14T06:00:00Z"),
    ("2025-Mar-14 00:00:00", "2025-03-14T00:00:00Z"),
    ("2025-Mar-16 18:15", "2025-03-16T18:15:00Z"),
    ("2028-Feb-29 12:00:00.500", "2028-02-29T12:00:00.5Z"),
    (" 2030-Dec-31 23:00:00.000", "2030-12-31T23:00:00Z"),
])
def test_parser_reads_the_three_date_variants(text, iso):
    assert fg.parse_date(text) == iso
    iso_to_unix(iso)  # and the rest of the pipeline accepts it


@pytest.mark.parametrize("bad", ["2027-Feb-29 12:00", "2025-Xyz-14 06:00", "2025-03-14 06:00", ""])
def test_parser_rejects_other_dates(bad):
    with pytest.raises(fg.HorizonsError):
        fg.parse_date(bad)


SAMPLE = """API VERSION: 1.2
API SOURCE: NASA/JPL Horizons API

Center geodetic : 206.0148, -41.6385, 0.0         {E-lon(deg),Lat(deg),Alt(km)}
Center pole/equ : MEAN_ME (high precision)        {East-longitude positive}
Center radii    : 1737.4, 1737.4, 1737.4 km       {Equator_a, b, pole_c}
Atmos refraction: NO (AIRLESS)
$$SOE
 2025-Mar-14 06:00:00.000, , ,  147.837992634,     -43.502151352,  1924.476,  1.4913039991E+08,  0.5003209,
 2028-Feb-29 12:00:00.000,*, ,  279.807752258,       9.408025277,  1940.100,  1.4792945361E+08,  1.0750016,
$$EOE
"""
CHANGE6 = fg.Site("change-6", -41.6385, -153.9852)


def test_parser_reads_rows_and_ignores_the_solar_mark():
    assert fg.check_header(SAMPLE, CHANGE6) == []
    rows = fg.parse_rows(SAMPLE)
    assert rows == [
        {"utc": "2025-03-14T06:00:00Z", "az_deg": "147.837992634", "el_deg": "-43.502151352",
         "ang_diam_arcsec": "1924.476", "range_km": "149130399.91"},
        {"utc": "2028-02-29T12:00:00Z", "az_deg": "279.807752258", "el_deg": "9.408025277",
         "ang_diam_arcsec": "1940.100", "range_km": "147929453.61"},
    ]


@pytest.mark.parametrize(("old", "new", "shown"), [
    ("MEAN_ME (high precision)", "UNKNOWN_FRAME", "Center pole/equ : UNKNOWN_FRAME"),
    ("1737.4, 1737.4, 1737.4 km", "1738.1, 1738.1, 1736.0 km", "Center radii    : 1738.1"),
    ("NO (AIRLESS)", "YES (EARTH)", "Atmos refraction: YES (EARTH)"),
    ("206.0148, -41.6385", "153.9852, -41.6385", "Center geodetic : 153.9852"),
    ("API VERSION: 1.2", "Error: bad request", "Error: bad request"),
])
def test_wrong_header_is_rejected(old, new, shown):
    with pytest.raises(fg.HorizonsError, match="^" + re.escape("Unexpected Horizons header: " + shown)):
        fg.check_header(SAMPLE.replace(old, new), CHANGE6)


def test_geodetic_line_in_exponent_notation_is_accepted():
    # Real header of A1_apollo-11: latitude without a leading zero and a height of -4.3e-13 km.
    text = SAMPLE.replace("206.0148, -41.6385, 0.0", "23.47314, .67416, -4.31358E-13")
    assert fg.check_header(text, fg.Site("apollo-11", 0.67416, 23.47314)) == []


def test_api_version_change_only_warns():
    warnings = fg.check_header(SAMPLE.replace("API VERSION: 1.2", "API VERSION: 1.3"), CHANGE6)
    assert len(warnings) == 1 and "1.3" in warnings[0]


def test_site_coord_is_the_text_of_the_specification():
    assert [s.site_coord for s in fg.A1_SITES] == [
        "23.47314,0.67416,0", "61.81,18.562,0", "32.32,-69.3741,0", "29.1957,-84.7906,0",
        "123.4,-88.8,0", "0,-89.9,0", "177.5885,-45.4561,0", "-153.9852,-41.6385,0",
    ]


# ---------------------------------------------------------------- the downloaded file (11 §2.3, §3)


@needs_azel
def test_a1_file_has_the_128_rows_of_the_specification():
    rows = _rows()
    assert list(rows[0].keys()) == fg.AZEL_COLUMNS
    assert len(rows) == 128
    got = {(r["site_id"], r["target"], r["utc"]) for r in rows}
    assert got == {(s, t, u) for s in A1_SITES for t in ("sun", "earth") for u in A1_INSTANTS}
    for r in rows:
        assert r["case"] == "A1" and float(r["alt_km"]) == 0.0
        assert (float(r["lat_deg"]), float(r["lon_deg"])) == A1_SITES[r["site_id"]]
        assert 0.0 <= float(r["az_deg"]) < 360.0 and -90.0 <= float(r["el_deg"]) <= 90.0
        assert float(r["range_km"]) > 0 and float(r["ang_diam_arcsec"]) > 0


@needs_azel
def test_raw_responses_have_the_horizons_header_and_match_the_csv():
    rows = _rows()
    for site in fg.A1_SITES:
        for target in ("sun", "earth"):
            text = (RAW / f"A1_{site.site_id}_{target}.txt").read_text(encoding="utf-8")
            assert fg.check_header(text, site) == []
            assert f"Target body name: {'Sun (10)' if target == 'sun' else 'Earth (399)'}" in text
            parsed = fg.parse_rows(text)
            mine = [{k: r[k] for k in parsed[0]} for r in rows
                    if r["site_id"] == site.site_id and r["target"] == target]
            assert mine == parsed


# ---------------------------------------------------------------- A1 (11 §4), with kernels


@pytest.fixture(scope="module")
def kernels(kernels_dir):
    if not kernels_present():
        pytest.skip(KERNELS_SKIP_MSG)
    load_kernels(kernels_dir)


@needs_azel
@pytest.mark.kernels
def test_a1_spice_reference_against_horizons(kernels):
    worst_az = worst_el = 0.0
    for r in _rows():
        az, el, _ = azel_spice(r["target"].upper(), unix_to_et(iso_to_unix(r["utc"])),
                               float(r["lat_deg"]), float(r["lon_deg"]), 0.0)
        e_az, e_el = _errors(r, az, el)
        assert e_az < TOL["A1_deg"] and e_el < TOL["A1_deg"], (r, az, el)
        worst_az, worst_el = max(worst_az, e_az), max(worst_el, e_el)
    print(f"\nA1 azel_spice: 128 rows, max |d az|*cos(el) = {worst_az:.2e} deg, "
          f"max |d el| = {worst_el:.2e} deg (tolerance {TOL['A1_deg']} deg, "
          f"expected < {A1_EXPECTED_MAX_DEG} deg)")


def _real_table():
    meta = WEB_DATA / "ephemeris.meta.json"
    if not meta.is_file() or json.loads(meta.read_text(encoding="utf-8")).get("synthetic") is not False:
        pytest.skip("real table not published: make ephem")
    return load_table(WEB_DATA)


@needs_azel
def test_a1_table_against_horizons():
    table = _real_table()
    worst_az = worst_el = 0.0
    for r in _rows():
        sky = sky_at(table, site_frame(float(r["lat_deg"]), float(r["lon_deg"]), 0.0), iso_to_unix(r["utc"]))
        got = sky[r["target"]]
        e_az, e_el = _errors(r, got["az_deg"], got["el_deg"])
        assert e_az < TOL["A1_deg"] and e_el < TOL["A1_deg"], (r, got)
        worst_az, worst_el = max(worst_az, e_az), max(worst_el, e_el)
    print(f"\nA1 table (sky_at): 128 rows, max |d az|*cos(el) = {worst_az:.2e} deg, "
          f"max |d el| = {worst_el:.2e} deg (tolerance {TOL['A1_deg']} deg)")
