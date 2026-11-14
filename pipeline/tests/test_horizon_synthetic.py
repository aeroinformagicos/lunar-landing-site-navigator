# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""T-08 fast tests: reference horizon engine on synthetic terrain (validation cases A4 and A9).

The terrain is a ``SyntheticGrid`` whose height is an analytic function of the position, so
every expected value comes from a hand calculation in docs/spec/06_horizonte.md §9 and §10
(or from 05_efemerides.md §8.2 for the local basis), never from the code under test.
"""

import functools
import math

import numpy as np
import pytest

from pipeline.common.constants import R_MOON_M
from pipeline.common.geo import enu_basis, unit_vector
from pipeline.dem.grids import SyntheticGrid
from pipeline.dem.stack import LABEL_SMOOTH, DemStack
from pipeline.horizon.engine_ref import (
    HorizonMask,
    SiteOutsideRelief,
    elevation_cartesian,
    horizon_mask,
    ray_samples,
    smooth_horizon,
    smooth_mask,
)

R = 1_737_400.0  # reference sphere, metres (06 §2)
D50_DEG = 1.64890  # 50 km of arc = 50 000 / 1 737 400 rad (06 §10.4)
# Closed form against literal 3D geometry (06 §10.5, decision D-51): 1e-9° from 100 m on. Nearer,
# the float64 rounding of the unit vector of the sample (~3e-10 m) is seen from 20-80 m: 5e-9°.
CARTESIAN_TOL_DEG = 1e-9
CARTESIAN_TOL_NEAR_DEG = 5e-9
CARTESIAN_NEAR_M = 100.0


def arc_m(u, centre):
    """Distance on the reference sphere between unit vectors ``u[..., 3]`` and ``centre``, metres."""
    return R * np.arctan2(np.linalg.norm(np.cross(u, centre), axis=-1), u @ centre)


def stack_of(height_fn, valid_fn=None) -> DemStack:
    return DemStack([SyntheticGrid(height_fn, valid_fn)], "Synthetic")


def mountain(centre, height_m=3000.0, sigma_m=500.0):
    """Gaussian mountain: h = height · exp(−ρ² / (2σ²)), ρ = distance on the sphere to ``centre``."""
    return lambda u: height_m * np.exp(-(arc_m(u, centre) ** 2) / (2.0 * sigma_m**2))


def along_azimuth(lat_deg, lon_deg, az_deg, dist_m):
    """Point at ``dist_m`` from the site along the great circle of initial azimuth ``az_deg``.

    Written here with the formulas of the specification (05 §3 and 06 §4.1), not with the
    functions of the pipeline.
    """
    phi, lam, a, theta = math.radians(lat_deg), math.radians(lon_deg), math.radians(az_deg), dist_m / R
    u0 = np.array([math.cos(phi) * math.cos(lam), math.cos(phi) * math.sin(lam), math.sin(phi)])
    east = np.array([-math.sin(lam), math.cos(lam), 0.0])
    north = np.array([-math.sin(phi) * math.cos(lam), -math.sin(phi) * math.sin(lam), math.cos(phi)])
    return math.cos(theta) * u0 + math.sin(theta) * (math.cos(a) * north + math.sin(a) * east)


def check_shape(mask: HorizonMask, n_heights: int):
    assert len(mask.masks) == n_heights
    for m in mask.masks:
        for arr in (m.el_deg, m.dist_m, m.blk_lat_deg, m.blk_lon_deg, m.blk_height_m):
            assert arr.shape == (720,) and arr.dtype == np.float64
            assert np.all(np.isfinite(arr))
        assert np.all((m.blk_lon_deg > -180.0) & (m.blk_lon_deg <= 180.0))
        assert np.all(np.abs(m.blk_lat_deg) <= 90.0)


# ---------------------------------------------------------------- local basis (05 §8.2)


def test_r_moon_is_the_reference_sphere():
    assert R_MOON_M == R


def test_enu_basis_hand_values():
    cases = [
        ((0.0, 0.0), (0, 1, 0), (0, 0, 1), (1, 0, 0)),
        ((-90.0, 0.0), (0, 1, 0), (1, 0, 0), (0, 0, -1)),  # exact pole: N towards the prime meridian
        ((45.0, 90.0), (-1, 0, 0), (0, -0.70711, 0.70711), (0, 0.70711, 0.70711)),
    ]
    for (lat, lon), e, n, u in cases:
        east, north, up = enu_basis(lat, lon)
        np.testing.assert_allclose(east, e, atol=5e-6)
        np.testing.assert_allclose(north, n, atol=5e-6)
        np.testing.assert_allclose(up, u, atol=5e-6)
    rng = np.random.default_rng(3)
    for lat, lon in zip(rng.uniform(-90, 90, 20), rng.uniform(-180, 180, 20), strict=True):
        east, north, up = enu_basis(lat, lon)
        basis = np.stack([east, north, up])
        np.testing.assert_allclose(basis @ basis.T, np.eye(3), atol=1e-15)
        np.testing.assert_allclose(np.cross(east, north), up, atol=1e-15)  # right-handed
        np.testing.assert_allclose(up, unit_vector(lat, lon), atol=1e-15)


# ---------------------------------------------------------------- 06 §9: smooth Moon


def test_smooth_horizon_values():
    # 2 m: −0.0869° and 2636 m (06 §9). 10 m: −0.1944° (09 §5). 0 m: 0° and 0 m.
    el, dist = smooth_horizon(2.0)
    assert el == pytest.approx(-0.0869, abs=0.00005)
    assert dist == pytest.approx(2636.0, abs=0.5)
    assert smooth_horizon(10.0)[0] == pytest.approx(-0.1944, abs=0.00005)
    el0, dist0 = smooth_horizon(0.0)
    assert el0 == 0.0 and dist0 == 0.0
    assert math.copysign(1.0, el0) == 1.0  # not a negative zero


def test_smooth_mask_and_stack_none():
    mask = horizon_mask(-30.0, 100.0, None)  # default observer heights: 2 m and 10 m
    check_shape(mask, 2)
    assert [m.observer_height_m for m in mask.masks] == [2.0, 10.0]
    assert mask.relief_label == LABEL_SMOOTH == "Smooth Moon (no terrain)"
    assert mask.site_height_m == 0.0
    assert mask.profile is None and mask.dem_stack == []
    m2, m10 = mask.masks
    np.testing.assert_allclose(m2.el_deg, -0.0869, atol=0.00005)
    np.testing.assert_allclose(m10.el_deg, -0.1944, atol=0.00005)
    np.testing.assert_allclose(m2.dist_m, 2636.0, atol=0.5)
    assert np.all(m2.blk_height_m == 0.0)
    # The blocking point is at dist_m along each azimuth (j = 0 north, 180 east, 360 south).
    for j in (0, 180, 360, 540, 77):
        expected = along_azimuth(-30.0, 100.0, 0.5 * j, 2636.0)
        got = unit_vector(m2.blk_lat_deg[j], m2.blk_lon_deg[j])
        assert R * np.linalg.norm(got - expected) < 0.5
    assert m2.blk_lat_deg[0] > -30.0 > m2.blk_lat_deg[360]
    assert m2.blk_lon_deg[180] > 100.0 > m2.blk_lon_deg[540]
    assert mask.stats == {
        "truncated_az": 0,
        "min_truncation_dist_m": None,
        "nodata_samples": 0,
        "empty_az": 0,
        "grid_usage": {},
        "min_el_deg": m2.el_deg[0],
        "max_el_deg": m2.el_deg[0],
        "warning": None,
    }
    same = smooth_mask(-30.0, 100.0, [2.0, 10.0])
    np.testing.assert_array_equal(same.masks[1].blk_lon_deg, m10.blk_lon_deg)
    with pytest.raises(ValueError):
        smooth_mask(0.0, 0.0, [-1.0])
    with pytest.raises(ValueError):
        horizon_mask(0.0, 0.0, None, [])


# ---------------------------------------------------------------- 06 §10.1: smooth sphere (A4)


def test_flat_sphere_dip_of_the_horizon():
    # h_obs: (expected elevation, distance to the tangent point, sampling step there).
    expected = {
        2.0: (-0.0869, 2636.0, 20.0),
        100.0: (-0.6147, 18_640.0, 20.0),
        1000.0: (-1.9435, 58_933.0, 59.0),
    }
    mask = horizon_mask(0.0, 0.0, stack_of(lambda u: 0.0), list(expected))
    check_shape(mask, 3)
    assert mask.site_height_m == 0.0
    assert mask.law == "full" and mask.max_dist_m == pytest.approx(299_878.0, abs=5.0)
    for m in mask.masks:
        el, dist, step = expected[m.observer_height_m]
        np.testing.assert_allclose(m.el_deg, el, atol=0.0005)  # all 720 azimuths
        np.testing.assert_allclose(m.dist_m, dist, atol=2 * step)
        assert np.all(m.blk_height_m == 0.0)
    assert mask.stats["truncated_az"] == 0 and mask.stats["empty_az"] == 0
    assert mask.stats["nodata_samples"] == 0 and mask.stats["warning"] is None
    assert mask.stats["min_truncation_dist_m"] is None
    assert mask.stats["grid_usage"] == {"synthetic": 1.0}
    assert mask.stats["max_el_deg"] == pytest.approx(-0.0869, abs=0.0005)  # stats of masks[0]
    assert mask.profile.shape == (720, 512) and np.all(mask.profile == 0)


def test_flat_sphere_fast_law_gives_the_same_dip():
    mask = horizon_mask(0.0, 0.0, stack_of(lambda u: 0.0), [2.0, 100.0], law="fast")
    assert mask.law == "fast" and mask.max_dist_m == pytest.approx(299_772.0, abs=5.0)
    np.testing.assert_allclose(mask.masks[0].el_deg, -0.0869, atol=0.0005)
    np.testing.assert_allclose(mask.masks[0].dist_m, 2636.0, atol=80.0)
    np.testing.assert_allclose(mask.masks[1].el_deg, -0.6147, atol=0.0005)


# ---------------------------------------------------------------- 06 §10.2: 3 km mountain at 50 km (A4)


def test_mountain_of_3_km_at_50_km():
    peak = unit_vector(0.0, math.degrees(50_000.0 / R))  # 50 000 m east of the site, on the equator
    mask = horizon_mask(0.0, 0.0, stack_of(mountain(peak)), [0.0, 2.0])
    check_shape(mask, 2)
    m0, m2 = mask.masks
    # Azimuth 90° (j = 180): 2.606° from 0 m and 2.604° from 2 m; without curvature it would be 3.434°.
    assert m0.el_deg[180] == pytest.approx(2.606, abs=0.005)
    assert m2.el_deg[180] == pytest.approx(2.604, abs=0.005)
    assert m2.el_deg[180] < m0.el_deg[180]
    for m in (m0, m2):
        assert m.dist_m[180] == pytest.approx(50_012.6, abs=51.0)
        assert m.blk_height_m[180] == pytest.approx(2999.0, abs=1.0)
        assert m.blk_lat_deg[180] == pytest.approx(0.0, abs=1e-9)
        assert m.blk_lon_deg[180] == pytest.approx(D50_DEG, abs=0.002)
        assert int(np.argmax(m.el_deg)) == 180
    # Azimuth 80° (j = 160): the mountain is not there, only the dip of the smooth sphere.
    assert m2.el_deg[160] == pytest.approx(-0.0869, abs=0.0005)
    assert m0.el_deg[160] == pytest.approx(0.0, abs=0.0005)
    # The profile of azimuth 90° reaches the summit; the one of azimuth 80° stays flat.
    assert 2990 <= int(mask.profile[180].max()) <= 3000
    assert np.all(mask.profile[160] == 0)


# ---------------------------------------------------------------- 06 §10.3: circular depression


def test_site_at_the_centre_of_a_circular_depression():
    site = unit_vector(0.0, 0.0)
    # Height 0 within 9 990 m of the site, 500 m beyond: the rim sits between samples 498 and 499.
    mask = horizon_mask(0.0, 0.0, stack_of(lambda u: np.where(arc_m(u, site) < 9990.0, 0.0, 500.0)), [2.0])
    check_shape(mask, 1)
    m = mask.masks[0]
    np.testing.assert_allclose(m.el_deg, 2.6857, atol=0.001)  # all 720 azimuths
    assert np.all(m.dist_m == 10_000.0)  # sample i = 499 of the full law
    assert np.all(m.blk_height_m == 500.0)
    # The blocking points lie on the circle of 10 000 m around the site.
    np.testing.assert_allclose(arc_m(unit_vector(m.blk_lat_deg, m.blk_lon_deg), site), 10_000.0, atol=0.01)
    assert mask.stats["min_el_deg"] == pytest.approx(2.6857, abs=0.001)
    assert mask.stats["max_el_deg"] == pytest.approx(2.6857, abs=0.001)
    # Profile: bins up to 9 980 m hold the floor, the rest the plateau (bin 68 = samples 493..499).
    assert np.all(mask.profile[:, :68] == 0)
    assert np.all(mask.profile[:, 68:] == 500)


# ---------------------------------------------------------------- 06 §10.4: azimuth, pole, antimeridian

AZIMUTH_CASES = [
    # site (lat, lon), mountain position, expected index of the maximum
    ("north", (10.0, 20.0), unit_vector(10.0 + D50_DEG, 20.0), 0),
    ("east", (10.0, 20.0), along_azimuth(10.0, 20.0, 90.0, 50_000.0), 180),
    ("south", (10.0, 20.0), unit_vector(10.0 - D50_DEG, 20.0), 360),
    ("west", (10.0, 20.0), along_azimuth(10.0, 20.0, 270.0, 50_000.0), 540),
    ("pole, 90 E", (-90.0, 0.0), unit_vector(-88.35110, 90.0), 180),
    ("pole, 0 E", (-90.0, 0.0), unit_vector(-88.35110, 0.0), 0),
    ("antimeridian", (0.0, 179.9), unit_vector(0.0, -179.9), 180),  # 6065 m to the east
]


@pytest.mark.parametrize(("name", "site", "peak", "j_max"), AZIMUTH_CASES, ids=[c[0] for c in AZIMUTH_CASES])
def test_azimuth_convention_pole_and_antimeridian(name, site, peak, j_max):
    mask = horizon_mask(site[0], site[1], stack_of(mountain(peak)), [2.0], law="fast")
    check_shape(mask, 1)
    m = mask.masks[0]
    assert int(np.argmax(m.el_deg)) == j_max
    assert m.el_deg[j_max] > 2.0
    # Symmetry about the direction of the mountain; for j = 0 it goes through 0°/360° (06 §6).
    assert abs(m.el_deg[(j_max - 1) % 720] - m.el_deg[(j_max + 1) % 720]) < 1e-9
    # The blocking point is the mountain itself.
    blk = unit_vector(m.blk_lat_deg[j_max], m.blk_lon_deg[j_max])
    assert arc_m(blk, peak) < 300.0
    assert m.blk_height_m[j_max] > 2900.0
    if name == "antimeridian":
        assert m.dist_m[j_max] == pytest.approx(6065.0, abs=80.0)
        assert m.blk_lon_deg[j_max] == pytest.approx(-179.9, abs=0.003)  # written in (−180, 180]
        assert m.blk_lon_deg[540] > 179.0  # towards the west the rays stay on the 179.x side
    else:
        assert m.dist_m[j_max] == pytest.approx(50_000.0, abs=150.0)


def test_ray_through_the_pole_and_site_longitude_at_180():
    # Site 30 km from the south pole on the 0° meridian, mountain 30 km beyond the pole (lon 180).
    lat = -90.0 + math.degrees(30_000.0 / R)
    peak = unit_vector(lat, 180.0)
    m = horizon_mask(lat, 0.0, stack_of(mountain(peak)), [2.0], law="fast").masks[0]
    assert int(np.argmax(m.el_deg)) == 360  # due south, across the pole
    assert m.dist_m[360] == pytest.approx(60_000.0, abs=150.0)
    assert m.blk_lon_deg[360] == pytest.approx(180.0, abs=1e-6)  # +180, never −180
    assert m.blk_lat_deg[360] == pytest.approx(lat, abs=0.01)


# ---------------------------------------------------------------- 06 §10.5: invariants (A9)

N_TERRAINS = 20
N_GAUSSIANS = 30
RAYS_EVERY = 8  # rays checked sample by sample: one azimuth in 8 (90 rays), shifted with the seed
N_FULL_LONGITUDE_CHECKS = 2  # terrains whose whole mask is recomputed with lon + 360 and lon − 360


def random_terrain(seed: int):
    """Site and terrain: sum of 30 gaussians, heights −2000…+4000 m, σ 0.5…20 km (fixed seed)."""
    rng = np.random.default_rng(seed)
    # Coordinates that are multiples of 1/8°: lon ± 360 is then an exact float.
    lat = float(np.round(rng.uniform(-85.0, 85.0) * 8) / 8)
    lon = float(np.round(rng.uniform(-179.0, 179.0) * 8) / 8)
    centres = np.stack(
        [
            along_azimuth(lat, lon, az, d)
            for az, d in zip(
                rng.uniform(0.0, 360.0, N_GAUSSIANS), rng.uniform(0.0, 150_000.0, N_GAUSSIANS), strict=True
            )
        ]
    )
    amplitude = rng.uniform(-2000.0, 4000.0, N_GAUSSIANS)
    sigma = rng.uniform(500.0, 20_000.0, N_GAUSSIANS)
    k = R * R / sigma**2
    scaled = np.ascontiguousarray((centres * k[:, None]).T)  # [3, 30]

    def height(u):
        # Σ A·exp(−c² / (2σ²)), with c² = 2R²(1 − u·centre) the squared straight-line distance:
        # the exponent is k·(u·centre − 1), k = R²/σ². In-place operations keep the test fast.
        m = u @ scaled  # [..., 30]
        m -= k
        np.maximum(m, -700.0, out=m)  # exp underflows more slowly than it computes; e^-700 is 0 m
        np.exp(m, out=m)
        return m @ amplitude

    return lat, lon, stack_of(height)


@functools.cache
def invariant_run(seed: int) -> dict:
    """Mask (fast law, 2 m and 10 m) and 90 unreduced rays (full law) of one random terrain."""
    lat, lon, stack = random_terrain(seed)
    js = np.arange(seed % RAYS_EVERY, 720, RAYS_EVERY)
    return {
        "lat": lat,
        "lon": lon,
        "stack": stack,
        "mask": horizon_mask(lat, lon, stack, [2.0, 10.0], law="fast"),
        "js": js,
        "rays": ray_samples(lat, lon, stack, 0.5 * js, observer_height_m=2.0, law="full"),
    }


@pytest.mark.parametrize("seed", range(N_TERRAINS))
def test_taller_mast_never_raises_the_horizon(seed):
    mask = invariant_run(seed)["mask"]
    check_shape(mask, 2)
    m2, m10 = mask.masks
    assert (m2.observer_height_m, m10.observer_height_m) == (2.0, 10.0)
    assert np.all(m10.el_deg <= m2.el_deg + 1e-9)  # every azimuth (06 §7)
    assert np.any(m10.el_deg < m2.el_deg - 1e-6)  # and it does lower it somewhere


@pytest.mark.parametrize("seed", range(N_TERRAINS))
def test_closed_form_equals_literal_3d_geometry(seed):
    run = invariant_run(seed)
    rays = run["rays"]
    assert rays.valid.all() and rays.el_rad.shape == (90, 3709)
    u0 = unit_vector(run["lat"], run["lon"])
    el_3d = elevation_cartesian(u0, u0, rays.points, R + rays.site_height_m + 2.0, R + rays.height_m)
    diff_deg = np.abs(np.degrees(el_3d - rays.el_rad))
    # 1e-9° from 100 m on; 5e-9° for the four samples nearer than that (decision D-51).
    near = rays.dist_m < CARTESIAN_NEAR_M
    assert int(near.sum()) == 4
    assert diff_deg[:, ~near].max() < CARTESIAN_TOL_DEG
    assert diff_deg[:, near].max() < CARTESIAN_TOL_NEAR_DEG


@pytest.mark.parametrize("seed", range(N_TERRAINS))
def test_rays_do_not_change_with_longitude_plus_or_minus_360(seed):
    run = invariant_run(seed)
    rays = run["rays"]
    shift = 360.0 if seed % 2 == 0 else -360.0
    other = ray_samples(run["lat"], run["lon"] + shift, run["stack"], 0.5 * run["js"], 2.0, law="full")
    assert other.site_height_m == rays.site_height_m
    np.testing.assert_array_equal(other.points, rays.points)
    np.testing.assert_array_equal(other.height_m, rays.height_m)
    np.testing.assert_array_equal(other.el_rad, rays.el_rad)


@pytest.mark.parametrize("seed", range(N_FULL_LONGITUDE_CHECKS))
def test_mask_does_not_change_with_longitude_plus_or_minus_360(seed):
    run = invariant_run(seed)
    mask = run["mask"]
    for other_lon in (run["lon"] + 360.0, run["lon"] - 360.0):
        other = horizon_mask(run["lat"], other_lon, run["stack"], [2.0, 10.0], law="fast")
        assert other.lon_deg == mask.lon_deg == run["lon"]
        for a, b in zip(mask.masks, other.masks, strict=True):
            np.testing.assert_allclose(b.el_deg, a.el_deg, rtol=0, atol=1e-9)
            np.testing.assert_array_equal(b.dist_m, a.dist_m)
            np.testing.assert_allclose(b.blk_lat_deg, a.blk_lat_deg, rtol=0, atol=1e-9)
            np.testing.assert_allclose(b.blk_lon_deg, a.blk_lon_deg, rtol=0, atol=1e-9)
            np.testing.assert_allclose(b.blk_height_m, a.blk_height_m, rtol=0, atol=1e-6)
        np.testing.assert_array_equal(other.profile, mask.profile)
        assert other.stats == mask.stats


def test_mask_is_the_maximum_of_the_unreduced_samples():
    # ray_samples (what profile-csv will write) and the mask describe the same rays.
    run = invariant_run(5)
    lat, lon, stack, mask = run["lat"], run["lon"], run["stack"], run["mask"]
    js = np.array([0, 1, 179, 360, 541, 719])
    for m in mask.masks:
        rays = ray_samples(lat, lon, stack, 0.5 * js, observer_height_m=m.observer_height_m, law="fast")
        i_star = np.argmax(rays.el_rad, axis=1)
        np.testing.assert_array_equal(m.el_deg[js], np.degrees(rays.el_rad[np.arange(js.size), i_star]))
        np.testing.assert_array_equal(m.dist_m[js], rays.dist_m[i_star])
        np.testing.assert_array_equal(m.blk_height_m[js], rays.height_m[np.arange(js.size), i_star])
    assert rays.points.shape == (6, 1855, 3) and rays.grid_index.max() == 0
    assert mask.site_height_m == rays.site_height_m == stack.height_m(unit_vector(lat, lon))[0]


# ---------------------------------------------------------------- 06 §10.6: edges and holes


def test_grid_valid_only_within_100_km():
    site = unit_vector(-20.0, 45.0)
    stack = stack_of(lambda u: 100.0, valid_fn=lambda u: arc_m(u, site) < 100_000.0)
    mask = horizon_mask(-20.0, 45.0, stack, [2.0, 10.0])  # no exception
    check_shape(mask, 2)
    assert mask.stats["truncated_az"] == 720
    assert 99_900.0 <= mask.stats["min_truncation_dist_m"] <= 100_100.0
    assert mask.stats["empty_az"] == 0 and mask.stats["nodata_samples"] == 0
    assert mask.stats["warning"] is None
    # 100 km falls at sample 2610 of 3709 (20 000 · 1.001^1610 = 99 990 m): 2610 valid samples per ray.
    assert mask.stats["grid_usage"]["synthetic"] == pytest.approx(2610 / 3709, abs=2 / 3709)
    assert np.all(mask.masks[0].dist_m < 100_000.0)
    assert np.all(mask.profile[:, -1] == -32768) and np.all(mask.profile[:, 0] == 100)


def test_grid_with_5_percent_of_holes():
    site = unit_vector(5.0, -120.0)
    rng = np.random.default_rng(6)

    def valid(u):  # 5 % of the samples have no data; the site itself always has
        return (rng.random(u.shape[:-1]) >= 0.05) | (arc_m(u, site) < 1.0)

    mask = horizon_mask(5.0, -120.0, stack_of(lambda u: 0.0, valid_fn=valid), [2.0])  # no exception
    check_shape(mask, 1)
    assert mask.stats["warning"] == "nodata"
    total = 720 * 3709
    assert 0.04 * total < mask.stats["nodata_samples"] < 0.06 * total
    assert mask.stats["empty_az"] == 0
    assert mask.stats["grid_usage"]["synthetic"] == pytest.approx(0.95, abs=0.005)
    # Flat terrain: the horizon is still the dip, from the valid sample nearest to the tangent point.
    np.testing.assert_allclose(mask.masks[0].el_deg, -0.0869, atol=0.0005)


def test_few_holes_do_not_raise_the_warning():
    site = unit_vector(0.0, 0.0)
    # Fast law (40 m steps near the site). A hole 2 km wide across every ray: 50 of 1855 samples,
    # above 1 %; 400 m wide: 10 samples, below.
    for width_m, warning in ((2000.0, "nodata"), (400.0, None)):
        stack = stack_of(lambda u: 0.0, valid_fn=lambda u, w=width_m: np.abs(arc_m(u, site) - 8000.0) > w / 2)
        mask = horizon_mask(0.0, 0.0, stack, [2.0], law="fast")
        assert mask.stats["warning"] == warning
        assert mask.stats["nodata_samples"] == pytest.approx(720 * width_m / 40.0, abs=720 * 2)
        assert mask.stats["truncated_az"] == 0 and mask.stats["min_truncation_dist_m"] is None


def test_site_outside_the_relief():
    centre = unit_vector(0.0, 0.0)
    stack = stack_of(lambda u: 0.0, valid_fn=lambda u: arc_m(u, centre) < 100_000.0)
    with pytest.raises(SiteOutsideRelief) as exc:
        horizon_mask(0.0, 10.0, stack)  # 303 km away from the centre of the grid
    assert (exc.value.lat_deg, exc.value.lon_deg) == (0.0, 10.0)
    with pytest.raises(SiteOutsideRelief):
        ray_samples(0.0, 10.0, stack, [0.0])
    with pytest.raises(SiteOutsideRelief):
        horizon_mask(0.0, 0.0, stack_of(lambda u: np.nan))  # a hole exactly at the site


def test_site_at_the_edge_azimuths_without_samples_take_the_smooth_value():
    # Grid that only exists east of the meridian of the site: every ray towards the west is empty.
    east = np.array([0.0, 1.0, 0.0])  # east direction at (0°, 0°) (05 §8.2)
    stack = stack_of(lambda u: 250.0, valid_fn=lambda u: u @ east > -1e-12)
    mask = horizon_mask(0.0, 0.0, stack, [2.0, 10.0])
    check_shape(mask, 2)
    assert mask.site_height_m == 250.0
    assert mask.stats["empty_az"] == 359  # j = 361 … 719
    assert mask.stats["truncated_az"] == 359 and mask.stats["min_truncation_dist_m"] == 0.0
    assert mask.stats["nodata_samples"] == 0
    assert mask.stats["grid_usage"]["synthetic"] == pytest.approx(361 / 720, abs=1e-12)
    for m, el, dist in zip(mask.masks, (-0.0869, -0.1944), (2636.0, 5894.8), strict=True):
        np.testing.assert_allclose(m.el_deg[361:], el, atol=0.00005)  # smooth Moon values (06 §9)
        np.testing.assert_allclose(m.dist_m[361:], dist, atol=0.5)
        assert np.all(m.blk_height_m[361:] == 0.0)
        assert np.all(m.blk_lon_deg[361:] < 0.0)
        np.testing.assert_allclose(m.el_deg[:361], el, atol=0.0005)  # flat plateau: the same dip
        assert np.all(m.blk_height_m[:361] == 250.0)
    assert np.all(mask.profile[361:] == -32768) and np.all(mask.profile[:361] == 250)


def test_argument_checks():
    stack = stack_of(lambda u: 0.0)
    with pytest.raises(ValueError, match="Unknown sampling law"):
        horizon_mask(0.0, 0.0, stack, law="slow")
    with pytest.raises(ValueError, match="Latitude"):
        horizon_mask(91.0, 0.0, stack)
    with pytest.raises(ValueError, match="Observer heights"):
        horizon_mask(0.0, 0.0, stack, [2.0, -0.5])
