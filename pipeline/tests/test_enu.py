# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Local East-North-Up basis and azimuth/elevation, against values worked out by hand.

docs/spec/05_efemerides.md §8.2 (table) and §3 (conventions); 03_datos_y_fuentes.md §3.4.
No SPICE and no data files are needed. Expected values come from the specification.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from pipeline.common.constants import (
    ABCORR,
    FRAME,
    OBSERVER_HEIGHT_M,
    R_EARTH_KM,
    R_MOON_KM,
    R_SUN_KM,
    STEP_S,
    ZENITH_REL,
)
from pipeline.common.geo import azel_from_vector, enu_basis, site_position_km

# Tolerances of 05 §8.2.
TOL_DEG = 1e-9
TOL_KM = 1e-6

S = math.sqrt(0.5)  # 0.70711 in the table

# (lat, lon, h_m), Moon -> body vector V (km), expected (az, el, range); None = not given in the table.
ENU_TABLE = [
    ((0.0, 0.0, 0.0), (2737.4, 1000.0, 0.0), (90.0, 45.0, 1414.2136)),
    ((0.0, 0.0, 0.0), (1737.4, 0.0, 1000.0), (0.0, 0.0, None)),
    ((-90.0, 0.0, 0.0), (5000.0, 0.0, -1737.4), (0.0, 0.0, None)),
    ((-90.0, 0.0, 0.0), (0.0, 5000.0, -1737.4), (90.0, 0.0, None)),
    ((-90.0, 0.0, 0.0), (0.0, 0.0, -2737.4), (0.0, 90.0, None)),  # zenith convention
]


def test_constants_of_the_specification():
    # 05 §1.
    assert R_MOON_KM == 1737.4
    assert R_SUN_KM == 695700.0
    assert R_EARTH_KM == 6378.137
    assert FRAME == "MOON_ME"
    assert ABCORR == "LT+S"
    assert STEP_S == 3600
    assert OBSERVER_HEIGHT_M == 2.0
    assert ZENITH_REL == 1e-12  # decision D-62


@pytest.mark.parametrize(("site", "v_moon", "expected"), ENU_TABLE)
def test_enu_table_by_hand(site, v_moon, expected):
    lat, lon, h_m = site
    east, north, up = enu_basis(lat, lon)
    v = np.array(v_moon) - site_position_km(lat, lon, h_m)
    az, el, rng = azel_from_vector(v, east, north, up)
    exp_az, exp_el, exp_rng = expected
    assert az == pytest.approx(exp_az, abs=TOL_DEG)
    assert el == pytest.approx(exp_el, abs=TOL_DEG)
    if exp_rng is not None:
        # The table gives 1414.2136 km (7 figures); the exact value is 1000·sqrt(2).
        assert rng == pytest.approx(1000.0 * math.sqrt(2.0), abs=TOL_KM)
        assert rng == pytest.approx(exp_rng, abs=5e-5)


def test_enu_first_row_vectors():
    east, north, up = enu_basis(0.0, 0.0)
    np.testing.assert_allclose(east, (0, 1, 0), atol=1e-15)
    np.testing.assert_allclose(north, (0, 0, 1), atol=1e-15)
    np.testing.assert_allclose(up, (1, 0, 0), atol=1e-15)
    v = np.array((2737.4, 1000.0, 0.0)) - site_position_km(0.0, 0.0, 0.0)
    np.testing.assert_allclose(v, (1000.0, 1000.0, 0.0), atol=1e-9)


def test_enu_south_pole_follows_the_longitude_given():
    # 05 §3: with lat = −90°, lon = 0°, N = (1, 0, 0) (towards the prime meridian), E = (0, 1, 0).
    east, north, up = enu_basis(-90.0, 0.0)
    np.testing.assert_allclose(east, (0, 1, 0), atol=1e-15)
    np.testing.assert_allclose(north, (1, 0, 0), atol=1e-15)
    np.testing.assert_allclose(up, (0, 0, -1), atol=1e-15)


def test_zenith_at_45n_90e():
    # Last row of the table: V = p + 100·U with U = (0, 0.70711, 0.70711) -> el = 90°.
    east, north, up = enu_basis(45.0, 90.0)
    np.testing.assert_allclose(up, (0.0, S, S), atol=1e-15)
    az, el, rng = azel_from_vector(100.0 * up, east, north, up)
    assert el == pytest.approx(90.0, abs=TOL_DEG)
    assert az == 0.0  # zenith convention
    assert rng == pytest.approx(100.0, abs=TOL_KM)


def test_nadir_and_exact_zero_vector_components():
    east, north, up = enu_basis(0.0, 0.0)
    az, el, _ = azel_from_vector(-50.0 * up, east, north, up)
    assert (az, el) == (0.0, pytest.approx(-90.0, abs=TOL_DEG))
    # e = n = 0 exactly: atan2(0, 0) = 0.
    az, el, rng = azel_from_vector((3.0, 0.0, 0.0), east, north, up)
    assert (az, el, rng) == (0.0, 90.0, 3.0)


def test_azimuth_runs_from_north_through_east():
    east, north, up = enu_basis(10.0, 20.0)
    for exp_az, v in ((0.0, north), (90.0, east), (180.0, -north), (270.0, -east)):
        az, el, rng = azel_from_vector(7.0 * v, east, north, up)
        assert az == pytest.approx(exp_az, abs=TOL_DEG)
        assert el == pytest.approx(0.0, abs=TOL_DEG)
        assert rng == pytest.approx(7.0, abs=TOL_KM)


def test_azimuth_range_and_vectorised_form():
    rng_ = np.random.default_rng(4)
    east, north, up = enu_basis(-33.0, 151.0)
    v = rng_.normal(size=(500, 3)) * 1000.0
    az, el, dist = azel_from_vector(v, east, north, up)
    assert az.shape == el.shape == dist.shape == (500,)
    assert np.all((az >= 0.0) & (az < 360.0))
    assert np.all(np.abs(el) <= 90.0)
    for i in (0, 17, 499):
        a, e, d = azel_from_vector(v[i], east, north, up)
        assert (a, e, d) == (az[i], el[i], dist[i])
    # Rebuild the vector from azimuth, elevation and distance.
    c = np.cos(np.radians(el))
    back = dist[:, None] * (
        (c * np.sin(np.radians(az)))[:, None] * east
        + (c * np.cos(np.radians(az)))[:, None] * north
        + np.sin(np.radians(el))[:, None] * up
    )
    np.testing.assert_allclose(back, v, atol=1e-9)


def test_site_position_blue_ghost_by_hand():
    # 03 §3.4: Blue Ghost 1 (18.56° N, 61.81° E, h = 0) -> (778.06, 1451.68, 553.01) km;
    # Horizons gives Dxy = 1647.03931 km and Dz = 553.01019 km for that site.
    p = site_position_km(18.56, 61.81, 0.0)
    np.testing.assert_allclose(p, (778.06, 1451.68, 553.01), atol=0.005)
    assert math.hypot(p[0], p[1]) == pytest.approx(1647.03931, abs=5e-6)
    assert p[2] == pytest.approx(553.01019, abs=5e-6)
    assert np.linalg.norm(site_position_km(18.56, 61.81, 2100.0)) == pytest.approx(1739.5, abs=1e-9)
