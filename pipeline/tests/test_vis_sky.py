# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Masks, horizon at any azimuth, criteria and ``evaluate`` (07_visibilidad.md §1–§3, §5, §10, §13.1).

Expected values come from the specification (07 §13.1, 06 §9, 05 §8.3: JPL Horizons rows), never
from the code under test.
"""

from __future__ import annotations

import json
import math

import numpy as np
import pytest

from pipeline.common.timeutil import iso_to_unix
from pipeline.ephem.interp import site_frame, sky_at
from pipeline.horizon.engine_ref import smooth_mask as engine_smooth_mask
from pipeline.horizon.law import N_AZ
from pipeline.tests.conftest import EXAMPLE_DATA
from pipeline.vis.sky import (
    blocker_at,
    evaluate,
    formula_mask,
    frame_for,
    horizon_at,
    load_mask,
    make_mask,
    margins,
    mask_from_file,
    smooth_mask,
    wrap_az,
)

# 06 §9: smooth-Moon horizon for an observer at 2 m: dip and distance to the tangent point.
SMOOTH_2M_EL_DEG = -0.0869
SMOOTH_2M_DIST_M = 2636.0
# 05 §8.3 (JPL Horizons, observer at 0 km): Blue Ghost 1 (18.56° N, 61.81° E).
BG1 = (18.56, 61.81)
BG1_ROWS = [
    # utc, sun az, sun el
    ("2025-03-16T18:15:00Z", 269.672560245, 0.924849952),
    ("2025-03-16T20:10:00Z", 269.983676648, 0.005209174),
    ("2025-03-16T20:11:00Z", 269.986381754, -0.002787844),
]
BG1_EARTH_1815 = (263.611890974, 27.158986435)  # azimuth, elevation at 18:15
# 05 §8.3: tolerance of the table (sky_at) against Horizons.
TABLE_TOL_DEG = 0.001
# 07 §13.2: tolerance of the 32-strip disc fraction against the exact circular segment.
DISC_TOL = 0.003


def _ramp_mask():
    """Mask of 07 §13.1: el[j] = j. The other vectors carry recognisable values."""
    j = np.arange(N_AZ, dtype=np.float64)
    return make_mask(2.0, 100.0, j, 1000.0 + j, -80.0 - j / 1000.0, j / 10.0, 50.0 + j)


# ---------------------------------------------------------------- 07 §2 and §13.1


@pytest.mark.parametrize(
    ("az", "expected"),
    [
        (0.25, 0.5),
        (359.75, 359.5),  # mean of el[719] = 719 and el[0] = 0
        (360.0, 0.0),
        (0.0, 0.0),
        (-0.5, 719.0),
    ],
)
def test_horizon_at_table(az, expected):
    assert horizon_at(_ramp_mask().el, az) == expected


def test_horizon_at_is_periodic_and_hits_the_samples():
    el = formula_mask("sine:1,3").el
    for j in (0, 1, 359, 360, 719):
        assert horizon_at(el, 0.5 * j) == el[j]
    for az in (0.1, 12.34, 179.9, 359.99):
        assert horizon_at(el, az + 360.0) == pytest.approx(horizon_at(el, az), abs=1e-12)
        assert horizon_at(el, az - 720.0) == pytest.approx(horizon_at(el, az), abs=1e-12)


def test_wrap_az_is_the_double_remainder_of_the_specification():
    # ((az mod 360) + 360) mod 360 with the remainder of the dividend's sign: always in [0, 360).
    assert wrap_az(-0.5) == 359.5
    assert wrap_az(725.25) == 5.25
    assert wrap_az(-1e-17) == 0.0  # Python's own % would give 360.0 here
    assert wrap_az(360.0) == 0.0
    for az in (-1e-9, -359.999999, 359.9999999999999, 1e6 + 0.25, -1e6 - 0.25):
        assert 0.0 <= wrap_az(az) < 360.0


def test_blocker_at_takes_the_nearest_sample_rounding_half_up():
    mask = _ramp_mask()
    b = blocker_at(mask, 10.2)  # 20.4 -> sample 20
    assert (b.az_deg, b.el_deg, b.dist_m, b.height_m) == (10.0, 20.0, 1020.0, 70.0)
    assert (b.lat_deg, b.lon_deg) == (-80.02, 2.0)
    assert blocker_at(mask, 0.24).az_deg == 0.0
    assert blocker_at(mask, 0.25).az_deg == 0.5  # half up: floor(0.5 + 0.5)
    assert blocker_at(mask, 359.8).az_deg == 0.0  # wraps to the first sample
    assert blocker_at(mask, -0.5).el_deg == 719.0


# ---------------------------------------------------------------- masks


def test_make_mask_computes_the_extremes_and_checks_the_length():
    mask = _ramp_mask()
    assert (mask.min_el_deg, mask.max_el_deg) == (0.0, 719.0)
    assert (mask.observer_height_m, mask.site_height_m) == (2.0, 100.0)
    assert mask.el == tuple(float(j) for j in range(N_AZ))
    assert not mask.el_deg.flags.writeable
    with pytest.raises(ValueError, match="720 values of el_deg"):
        make_mask(2.0, 0.0, [0.0] * 719, [0.0] * N_AZ, [0.0] * N_AZ, [0.0] * N_AZ, [0.0] * N_AZ)


def test_formula_masks():
    # 07 §12.3: flat:<deg>; tilt:<deg> = deg·(az − 180)/180; sine:<amp>,<k> = amp·sin(k·az).
    flat = formula_mask("flat:0.5")
    assert set(flat.el) == {0.5} and (flat.min_el_deg, flat.max_el_deg) == (0.5, 0.5)
    assert (flat.observer_height_m, flat.site_height_m) == (0.0, 0.0)
    tilt = formula_mask("tilt:0.3")
    assert tilt.el[0] == pytest.approx(-0.3, abs=1e-15)
    assert tilt.el[360] == 0.0  # azimuth 180°
    assert tilt.el[540] == pytest.approx(0.15, abs=1e-15)  # azimuth 270°
    sine = formula_mask("sine:1,3")
    assert sine.el[0] == 0.0
    assert sine.el[60] == pytest.approx(1.0, abs=1e-12)  # azimuth 30°: sin(90°)
    assert sine.el[180] == pytest.approx(-1.0, abs=1e-12)  # azimuth 90°: sin(270°)
    assert (sine.min_el_deg, sine.max_el_deg) == pytest.approx((-1.0, 1.0), abs=1e-12)
    assert np.isnan(sine.dist_m).all()


@pytest.mark.parametrize(
    "bad", ["ramp:1", "flat", "flat:", "flat:x", "flat:1,2", "sine:1", "tilt:nan", "flat:inf"]
)
def test_formula_mask_rejects_bad_identifiers(bad):
    with pytest.raises(ValueError, match="formula mask"):
        formula_mask(bad)


def test_smooth_mask_dip():
    zero = smooth_mask(0.0)
    assert set(zero.el) == {0.0} and math.copysign(1.0, zero.el[0]) == 1.0  # no negative zero
    two = smooth_mask(2.0)
    assert two.el[0] == pytest.approx(SMOOTH_2M_EL_DEG, abs=0.00005)
    assert float(two.dist_m[0]) == pytest.approx(SMOOTH_2M_DIST_M, abs=1.0)
    assert len(set(two.el)) == 1 and two.site_height_m == 0.0 and two.observer_height_m == 2.0
    assert np.isnan(two.blk_lat_deg).all() and not two.blk_height_m.any()
    # A higher observer sees a lower horizon.
    assert smooth_mask(10.0).el[0] < two.el[0] < 0.0


def test_smooth_mask_with_the_site_has_the_blocking_points_of_the_engine():
    ours = smooth_mask(2.0, -89.9, 0.0)
    ref = engine_smooth_mask(-89.9, 0.0, [2.0]).masks[0]
    np.testing.assert_array_equal(ours.el_deg, ref.el_deg)
    np.testing.assert_array_equal(ours.blk_lat_deg, ref.blk_lat_deg)
    np.testing.assert_array_equal(ours.blk_lon_deg, ref.blk_lon_deg)
    assert ours.el == smooth_mask(2.0).el


def test_mask_from_file_reads_each_observer_height_of_the_example():
    doc = json.loads((EXAMPLE_DATA / "horizon" / "demo-a.json").read_text(encoding="utf-8"))
    for entry in doc["masks"]:
        mask = mask_from_file(doc, entry["observer_height_m"])
        assert mask.observer_height_m == entry["observer_height_m"]
        assert mask.site_height_m == doc["site_height_m"]
        assert list(mask.el) == entry["el_deg"]
        assert mask.min_el_deg == min(entry["el_deg"]) and mask.max_el_deg == max(entry["el_deg"])
        assert mask.dist_m.tolist() == entry["dist_m"]
    assert load_mask(EXAMPLE_DATA, "demo-a", 2).el == mask_from_file(doc, 2).el
    with pytest.raises(ValueError, match="No mask for an observer at 7 m in demo-a"):
        mask_from_file(doc, 7)


def test_frame_for_adds_site_and_observer_heights():
    mask = _ramp_mask()  # site at 100 m, observer at 2 m
    ours, ref = frame_for(-84.78, 29.13, mask), site_frame(-84.78, 29.13, 102.0)
    np.testing.assert_array_equal(ours.p, ref.p)
    np.testing.assert_array_equal(ours.u, ref.u)


# ---------------------------------------------------------------- evaluate (07 §3, §5)


def test_evaluate_blue_ghost_against_horizons(real_table):
    frame = site_frame(*BG1, 0.0)
    flat = formula_mask("flat:0")
    for utc, az, el in BG1_ROWS:
        s = evaluate(real_table, frame, flat, iso_to_unix(utc))
        assert s.t_unix == iso_to_unix(utc)
        assert s.sun.az_deg == pytest.approx(az, abs=TABLE_TOL_DEG)
        assert s.sun.el_deg == pytest.approx(el, abs=TABLE_TOL_DEG)
        # Smooth Moon at 0 m: the horizon is 0° and the margin is the elevation of the centre.
        assert s.sun.horizon_deg == 0.0 and s.sun.margin_deg == s.sun.el_deg
        assert s.sun.visible == (el > 0)
        # 07 §4.1: with a flat horizon the fraction is that of the circular segment.
        d = (0.0 - el) / s.sun.radius_deg
        exact = (math.acos(d) - d * math.sqrt(1 - d * d)) / math.pi if abs(d) < 1 else float(d < 0)
        assert s.sun.disc_fraction == pytest.approx(exact, abs=DISC_TOL)
        assert s.earth.visible and s.both == s.sun.visible
        assert s.eclipse.kind == "none" and s.eclipse.covered == 0.0
        assert s.sun.lit_fraction == s.sun.disc_fraction
    s = evaluate(real_table, frame, flat, iso_to_unix("2025-03-16T18:15:00Z"))
    assert (s.earth.az_deg, s.earth.el_deg) == pytest.approx(BG1_EARTH_1815, abs=TABLE_TOL_DEG)
    assert s.sun.disc_fraction == 1.0  # 0.92° up, radius 0.27°: whole disc above the horizon
    # The same instant behind a 1° wall: the centre is hidden, and so is the whole disc.
    wall = evaluate(real_table, frame, formula_mask("flat:1"), iso_to_unix("2025-03-16T18:15:00Z"))
    assert wall.sun.horizon_deg == 1.0 and not wall.sun.visible and not wall.both
    assert wall.sun.margin_deg == pytest.approx(0.924849952 - 1.0, abs=TABLE_TOL_DEG)
    assert 0.0 < wall.sun.disc_fraction < 0.5 and wall.earth.visible


def test_margin_of_exactly_zero_is_not_visible(example_table):
    # 07 §3: «margin exactly 0 = not visible». The horizon is put exactly at the centre of the Sun.
    frame = site_frame(-85.0, 30.0, 0.0)
    t = float(example_table.segments[0].valid_from_unix + 123456)
    el = sky_at(example_table, frame, t)["sun"]["el_deg"]
    s = evaluate(example_table, frame, formula_mask(f"flat:{el!r}"), t)
    assert s.sun.margin_deg == 0.0 and not s.sun.visible and not s.both
    assert s.sun.disc_fraction == pytest.approx(0.5, abs=1e-12)  # horizon through the centre


@pytest.mark.parametrize("mask_id", ["sine:1,3", "demo-a"])
def test_evaluate_invariants_on_random_instants(example_table, mask_id):
    mask = formula_mask(mask_id) if ":" in mask_id else load_mask(EXAMPLE_DATA, mask_id, 2)
    frame = frame_for(-89.0, 45.0, mask)
    seg = example_table.segments[0]
    rng = np.random.default_rng(10)
    partial = 0
    for t in rng.uniform(seg.valid_from_unix, seg.valid_to_unix, 300):
        s = evaluate(example_table, frame, mask, float(t))
        for body in (s.sun, s.earth):
            assert body.horizon_deg == horizon_at(mask.el, body.az_deg)
            assert body.margin_deg == body.el_deg - body.horizon_deg
            assert body.visible == (body.margin_deg > 0)
            assert mask.min_el_deg - 1e-12 <= body.horizon_deg <= mask.max_el_deg + 1e-12
        assert s.both == (s.sun.visible and s.earth.visible)
        assert 0.0 <= s.sun.disc_fraction <= 1.0 and 0.0 <= s.eclipse.covered <= 1.0
        assert s.sun.lit_fraction == s.sun.disc_fraction * (1 - s.eclipse.covered)
        m = margins(example_table, frame, mask, float(t))
        assert m == (s.sun.margin_deg, s.earth.margin_deg, s.sun.el_deg)
        partial += 0.0 < s.sun.disc_fraction < 1.0
    assert partial > 5  # near the pole the Sun grazes the horizon: the strip path is exercised
