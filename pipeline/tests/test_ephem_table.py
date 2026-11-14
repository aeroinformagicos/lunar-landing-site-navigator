# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""The hourly ephemeris table and its interpolation (05_efemerides.md §4, §5, §8.4 and §8.7).

Expected values come from the specification and from tests/golden/ (JPL Horizons rows and the
spkpos samples of ephem_sample.json). Tests against SPICE need the four kernels (marker
``kernels``); the others read the published table in web/public/data.
"""

from __future__ import annotations

import csv
import json
import math

import numpy as np
import pytest

from pipeline.common.constants import OBSERVER_HEIGHT_M
from pipeline.common.timeutil import iso_to_unix, unix_to_et
from pipeline.ephem import table as tbl
from pipeline.ephem.interp import (
    OUT_OF_RANGE_MSG,
    OutOfRange,
    body_vectors_at,
    build_table,
    lagrange_weights,
    load_table,
    site_frame,
    sky_at,
)
from pipeline.ephem.kernels import load_kernels
from pipeline.ephem.spice_ref import azel_spice
from pipeline.tests.conftest import KERNELS_SKIP_MSG, REPO_ROOT, kernels_present

WEB_DATA = REPO_ROOT / "web" / "public" / "data"
SMOKE_CSV = REPO_ROOT / "tests" / "golden" / "horizons_smoke.csv"
SAMPLE_JSON = REPO_ROOT / "tests" / "golden" / "ephem_sample.json"

# 05 §4.2 and §8.7.
EPHEMERIS_BYTES = 5_260_176
APOLLO_OFFSET = 4_418_568
# 05 §8.3: tolerance of the table (sky_at) against Horizons; 05 §8.4: table against spkcpo.
TABLE_TOL_DEG = 0.001
# 05 §8.4 on the hourly grid, raised from 0.00002° by decision D-74: stellar aberration is applied
# at the Moon's centre and carried to the site with V − p, which leaves up to ~0.000028° for the Earth.
GRID_TOL_DEG = 0.00003
# 05 §8.7: bounds of the moduli, km; libration bound, degrees; relative error of sample k = 1.
SUN_KM = (1.45e8, 1.53e8)
EARTH_KM = (3.5e5, 4.1e5)
LIBRATION_MAX_DEG = 12.0
SAMPLE_REL_TOL = 1e-7
# 05 §5: apparent radii, degrees, inside the moduli bounds.
SUN_RADIUS_DEG = (0.26, 0.28)
EARTH_RADIUS_DEG = (0.89, 1.05)
# Horizons gives the angular diameter to 0.001″; the table works on float32 positions.
DIAM_TOL_ARCSEC = 0.05
# 05 §8.4: 2,000 random (site, instant) pairs with a fixed seed, and 200 instants on the grid.
N_RANDOM = 2000
N_GRID = 200
SEED = 84


def _real_table_present() -> bool:
    meta = WEB_DATA / "ephemeris.meta.json"
    return meta.is_file() and json.loads(meta.read_text(encoding="utf-8")).get("synthetic") is False


needs_real = pytest.mark.skipif(not _real_table_present(), reason="real table not published: make ephem")


@pytest.fixture(scope="module")
def real():
    if not _real_table_present():
        pytest.skip("real table not published: make ephem")
    return load_table(WEB_DATA)


@pytest.fixture(scope="module")
def kernels(kernels_dir):
    if not kernels_present():
        pytest.skip(KERNELS_SKIP_MSG)
    load_kernels(kernels_dir)


def _toy_table(n: int, f) -> object:
    """One-segment table starting at t = 0 whose six components are ``f(t)`` at every sample."""
    t = 3600.0 * np.arange(n)
    rec = np.array([f(x) for x in t], dtype="<f4")
    raw = rec.tobytes() + bytes(EPHEMERIS_BYTES - rec.nbytes)
    meta = {"step_s": 3600, "segments": [{"id": "toy", "t0_unix": 0, "n": n, "byte_offset": 0}]}
    return build_table(meta, raw)


def _daz(a: float, b: float) -> float:
    return abs((a - b + 540.0) % 360.0 - 180.0)


# ---- Interpolation, no data needed (05 §4.5) ------------------------------------------------


@pytest.mark.parametrize("u", [0.0, 0.25, 0.5, 0.731, 1.0])
def test_weights_sum_to_one(u):
    assert sum(lagrange_weights(u)) == pytest.approx(1.0, abs=1e-15)


def test_weights_at_nodes():
    assert lagrange_weights(0.0) == (0.0, 1.0, 0.0, 0.0)
    assert lagrange_weights(1.0) == (0.0, 0.0, 1.0, 0.0)


def test_cubic_is_reproduced_exactly():
    cubic = lambda t: [1e-12 * t**3 - 2e-6 * t**2 + 0.5 * t + 7.0] * 6  # noqa: E731
    toy = _toy_table(12, cubic)
    for t in (3600.0, 5000.0, 12345.6, 3600.0 * 9):
        sun, earth = body_vectors_at(toy, t)
        expected = cubic(t)[0]
        assert sun[0] == pytest.approx(expected, rel=1e-6) and earth[2] == pytest.approx(expected, rel=1e-6)


def test_nodes_return_the_sample():
    toy = _toy_table(8, lambda t: [t / 3600.0 + c for c in range(6)])
    for k in range(1, 7):
        sun, earth = body_vectors_at(toy, 3600.0 * k)
        assert list(sun) + list(earth) == [k + c for c in range(6)]


def test_valid_to_uses_last_interval_with_u_one():
    toy = _toy_table(8, lambda t: [t / 3600.0] * 6)
    sun, _ = body_vectors_at(toy, 3600.0 * 6)  # valid_to = t0 + 3600 (n - 2)
    assert sun[0] == 6.0


@pytest.mark.parametrize("t", [3599.0, 3600.0 * 6 + 1, float("nan"), float("inf"), -float("inf")])
def test_out_of_range(t):
    toy = _toy_table(8, lambda t: [1.0] * 6)
    with pytest.raises(OutOfRange, match=r"^Date outside the supported range \(1969–1972 and 2024–2044\)\.$"):
        body_vectors_at(toy, t)
    assert OUT_OF_RANGE_MSG.startswith("Date outside")


def test_wrong_size_is_rejected():
    meta = tbl.meta_doc()
    with pytest.raises(ValueError, match="corrupt or incomplete"):
        build_table(meta, bytes(EPHEMERIS_BYTES - 24))


# ---- Format of the published table (05 §8.7, 09 §3.1-§3.2) ---------------------------------


@needs_real
def test_size_meta_and_manifest():
    assert (WEB_DATA / "ephemeris.bin").stat().st_size == EPHEMERIS_BYTES
    meta = json.loads((WEB_DATA / "ephemeris.meta.json").read_text(encoding="utf-8"))
    assert meta == tbl.meta_doc()
    assert meta["segments"][1]["byte_offset"] == APOLLO_OFFSET
    assert [s["n"] for s in meta["segments"]] == [184_107, 35_067]
    manifest = json.loads((WEB_DATA / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["ephemeris"] == {"file": "ephemeris.bin", "bytes": EPHEMERIS_BYTES, "synthetic": False}


@needs_real
def test_segment_bounds_are_whole_hours():
    for seg in load_table(WEB_DATA).segments:
        spec = next(s for s in tbl.SEGMENTS if s.id == seg.id)
        assert seg.valid_from_unix == iso_to_unix(spec.valid_from_utc)
        assert seg.valid_to_unix == iso_to_unix(spec.valid_to_utc)
        assert seg.t0_unix == iso_to_unix(spec.t0_utc)


def test_moduli_and_libration(real):
    rec = real.data.astype(np.float64)
    sun = np.linalg.norm(rec[:, :3], axis=1)
    earth = np.linalg.norm(rec[:, 3:], axis=1)
    assert np.isfinite(rec).all()
    assert SUN_KM[0] < sun.min() and sun.max() < SUN_KM[1]
    assert EARTH_KM[0] < earth.min() and earth.max() < EARTH_KM[1]
    assert np.degrees(np.arccos(rec[:, 3] / earth)).max() < LIBRATION_MAX_DEG


def test_apparent_radii(real):
    frame = site_frame(0.0, 0.0, 0.0)
    for iso in ("2024-01-01T00:00:00Z", "2030-06-15T12:00:00Z", "1969-07-20T20:17:00Z"):
        sky = sky_at(real, frame, iso_to_unix(iso))
        assert SUN_RADIUS_DEG[0] < sky["sun"]["radius_deg"] < SUN_RADIUS_DEG[1]
        assert EARTH_RADIUS_DEG[0] < sky["earth"]["radius_deg"] < EARTH_RADIUS_DEG[1]


def test_sample_json_matches_the_table(real):
    """The float32 records hold the spkpos values of tests/golden/ephem_sample.json."""
    samples = json.loads(SAMPLE_JSON.read_text(encoding="utf-8"))
    assert len(samples) == tbl.SAMPLE_COUNT
    segs = {s.id: s for s in real.segments}
    for s in samples:
        rec = real.data[segs[s["segment"]].byte_offset // 24 + s["k"]].astype(np.float64)
        np.testing.assert_allclose(rec, s["values"], rtol=SAMPLE_REL_TOL, atol=0)


# ---- Against SPICE (05 §8.4, §8.7) ----------------------------------------------------------


@pytest.mark.kernels
def test_first_valid_sample_matches_spkpos(real, kernels):
    t = iso_to_unix("2024-01-01T00:00:00Z")
    assert t == real.segments[0].t0_unix + 3600
    expected = tbl.body_vectors_spice(unix_to_et(t))
    np.testing.assert_allclose(real.data[1].astype(np.float64), expected, rtol=SAMPLE_REL_TOL, atol=0)


def _random_cases(real, rng, n):
    lat = np.degrees(np.arcsin(rng.uniform(-1.0, 1.0, n)))
    lon = rng.uniform(-180.0, 180.0, n)
    segs = [real.segments[i % len(real.segments)] for i in range(n)]
    return lat, lon, segs


def _worst_vs_spkcpo(real, lat, lon, times):
    worst = 0.0
    for la, lo, t in zip(lat, lon, times, strict=True):
        frame = site_frame(la, lo, OBSERVER_HEIGHT_M)
        sky = sky_at(real, frame, t)
        et = unix_to_et(t)
        for body, target in (("sun", "SUN"), ("earth", "EARTH")):
            az, el, _ = azel_spice(target, et, la, lo, OBSERVER_HEIGHT_M)
            got = sky[body]
            worst = max(
                worst,
                _daz(got["az_deg"], az) * math.cos(math.radians(el)),
                abs(got["el_deg"] - el),
            )
    return worst


@pytest.mark.kernels
def test_table_against_spkcpo_random(real, kernels):
    rng = np.random.default_rng(SEED)
    lat, lon, segs = _random_cases(real, rng, N_RANDOM)
    times = [rng.uniform(s.valid_from_unix, s.valid_to_unix) for s in segs]
    assert _worst_vs_spkcpo(real, lat, lon, times) < TABLE_TOL_DEG


@pytest.mark.kernels
def test_table_against_spkcpo_on_the_grid(real, kernels):
    rng = np.random.default_rng(SEED + 1)
    lat, lon, segs = _random_cases(real, rng, N_GRID)
    times = [
        float(s.t0_unix + 3600 * int(rng.integers(1, s.n - 1))) for s in segs
    ]  # sample k in [1, n - 2]
    assert _worst_vs_spkcpo(real, lat, lon, times) < GRID_TOL_DEG


# ---- Against JPL Horizons (05 §8.3) ---------------------------------------------------------


def test_horizons_smoke_rows_with_the_table(real):
    with open(SMOKE_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 15
    for r in rows:
        frame = site_frame(float(r["lat_deg"]), float(r["lon_deg"]), 1000.0 * float(r["alt_km"]))
        got = sky_at(real, frame, iso_to_unix(r["utc"]))[r["target"]]
        assert _daz(got["az_deg"], float(r["az_deg"])) < TABLE_TOL_DEG, r
        assert abs(got["el_deg"] - float(r["el_deg"])) < TABLE_TOL_DEG, r
        if r["ang_diam_arcsec"]:
            assert abs(2 * got["radius_deg"] * 3600 - float(r["ang_diam_arcsec"])) < DIAM_TOL_ARCSEC, r
