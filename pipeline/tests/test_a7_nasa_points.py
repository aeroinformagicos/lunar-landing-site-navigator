# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Case A7: mean Sun and Earth visibility at 20 random south pole points against the NASA maps.

11_validacion.md §4, A7; 08_mapa_polar.md §8. Twenty map points with x, y uniform and r ≤ 150 km
(seed 42), each with its own site mask (``engine_ref.horizon_mask`` with the ``lola_polar`` stack of
a catalog site, law ``full``, observer at 2 m). For each point, the share of the 18.6-year steps
with the Sun and with the Earth visible with the «any part of the disc» criterion, computed with the
code of the layers (``count_visibility``: one hourly step in three from 2026-01-01, 08 §5.2), is set
against ``AVGVISIB_85S_060M_201608`` and ``…_EARTH`` (mean of the 3 × 3 pixels around the point,
``compare_nasa``). Threshold, for each body: Pearson r > ``A7_r_min`` and mean |difference| <
``A7_mae_pct_max`` points (tests/golden/tolerances.json).

A7 does not need the cube. Marker ``slow``: 20 site masks, a few minutes.
"""

from __future__ import annotations

import json

import numpy as np
import pytest

from pipeline.cli.report import PGDA
from pipeline.horizon import cube
from pipeline.layers import compare_nasa as cn
from pipeline.layers import layers as lay
from pipeline.tests.conftest import REPO_ROOT, data_dir

TOL = json.loads((REPO_ROOT / "tests" / "golden" / "tolerances.json").read_text(encoding="utf-8"))

# 08 §8.3 and 11 §4, A7.
SEED = 42
N_POINTS = 20
R_MAX_M = 150_000.0
LAW = "full"
OBSERVER_HEIGHT_M = 2.0


def random_points(n: int = N_POINTS, seed: int = SEED, r_max_m: float = R_MAX_M) -> np.ndarray:
    """float64 [n, 2]: map points (x, y) uniform in the disc r ≤ ``r_max_m`` (decision D-110).

    Pairs ``rng.uniform(−r_max, r_max, 2)`` of ``np.random.default_rng(seed)``, drawn one after the
    other; a pair with r > r_max is dropped.
    """
    rng = np.random.default_rng(seed)
    out = []
    while len(out) < n:
        x, y = rng.uniform(-r_max_m, r_max_m, 2)
        if np.hypot(x, y) <= r_max_m:
            out.append((float(x), float(y)))
    return np.array(out)


def verdict(m: dict) -> bool:
    return (m["r"] is not None and m["r"] > TOL["A7_r_min"]
            and m["mae_pts"] is not None and m["mae_pts"] < TOL["A7_mae_pct_max"])


# ------------------------------------------------------------------------------- fast tests


def test_random_points_are_reproducible_and_inside_the_disc():
    a, b = random_points(), random_points()
    np.testing.assert_array_equal(a, b)
    assert a.shape == (N_POINTS, 2)
    r = np.hypot(a[:, 0], a[:, 1])
    assert (r <= R_MAX_M).all() and r.max() > 0.5 * R_MAX_M  # spread over the disc
    # Inside the N1/N2 square and the map mesh, and never on the pole itself (08 §1.2).
    assert (np.abs(a) <= cn.INNER_HALF_M).all() and (r > 0).all()
    i, j = cube.cell_of_xy(a[:, 0], a[:, 1])
    assert ((i >= 0) & (i < cube.NX) & (j >= 0) & (j < cube.NY)).all()


def test_verdict_uses_both_limits():
    assert verdict({"r": 0.95, "mae_pts": 5.0})
    assert not verdict({"r": 0.85, "mae_pts": 5.0})
    assert not verdict({"r": 0.95, "mae_pts": 12.0})
    assert not verdict({"r": None, "mae_pts": None})


# ------------------------------------------------------------------------------- the case (slow)


@pytest.mark.slow
def test_a7_twenty_points_against_the_nasa_maps(real_table, record_case):
    from pipeline.dem.pds_label import LabelError
    from pipeline.dem.stack import DemDataMissing, lola_polar_plan, lola_polar_stack
    from pipeline.horizon.engine_ref import horizon_mask

    root = data_dir()
    try:
        products = cn.open_products(root)
    except (cn.NasaDataMissing, LabelError) as exc:
        pytest.skip(str(exc))
    pts = random_points()
    x, y = pts[:, 0], pts[:, 1]
    frames = cube.frames_of_xy(x, y)
    masks, heights, labels, stacks = [], [], set(), {}
    for k in range(N_POINTS):
        lat, lon = float(frames.lat_deg[k]), float(frames.lon_deg[k])
        plan = lola_polar_plan(lat, lon)  # the stack of a catalog site (03 §7); loaded once per plan
        if plan not in stacks:
            try:
                stacks[plan] = lola_polar_stack(root, lat, lon, in_memory=True)
            except DemDataMissing as exc:
                pytest.skip(str(exc))
        stack = stacks[plan]
        site = horizon_mask(lat, lon, stack, [OBSERVER_HEIGHT_M], law=LAW)
        masks.append(site.masks[0].el_deg)
        heights.append(site.site_height_m)
        labels.add(site.relief_label)

    steps = lay.table_steps(real_table)
    counts = lay.count_visibility(lay.points_of(frames, heights, np.stack(masks), OBSERVER_HEIGHT_M), steps)
    ours = 100.0 * counts.any / counts.n_any  # [2, P]: Sun, Earth
    nasa = cn.mesh_dn_sums(products, x, y)
    assert nasa.inner.all() and nasa.valid.all(), "every A7 point must have a valid 3 x 3 window in N1/N2"
    theirs = nasa.pct()

    details, ok_all, lines = [], True, []
    results = {}
    for b, body in enumerate(cn.BODIES):
        m = cn.metrics(ours[b], theirs[b])
        results[body] = m
        ok = verdict(m)
        ok_all &= ok
        name = body.capitalize()
        details.append({"label": f"{name}, Pearson r ({N_POINTS} points)",
                        "expected": f"> {TOL['A7_r_min']:g}",
                        "obtained": None if m["r"] is None else round(m["r"], 4),
                        "abs_err": None, "unit": "", "ok": m["r"] is not None and m["r"] > TOL["A7_r_min"]})
        details.append({"label": f"{name}, mean |ours - NASA|", "expected": f"< {TOL['A7_mae_pct_max']:g}",
                        "obtained": round(m["mae_pts"], 2), "abs_err": round(m["mae_pts"], 2),
                        "unit": "points", "ok": m["mae_pts"] < TOL["A7_mae_pct_max"]})
    for k in range(N_POINTS):
        lines.append(f"({x[k] / 1000:+8.2f}, {y[k] / 1000:+8.2f}) km, {float(frames.lat_deg[k]):.3f}, "
                     f"{float(frames.lon_deg[k]):.2f}: Sun {ours[0, k]:5.1f} vs {theirs[0, k]:5.1f} %, "
                     f"Earth {ours[1, k]:5.1f} vs {theirs[1, k]:5.1f} %")
    s, e = results["sun"], results["earth"]
    record_case(
        "A7", "pass" if ok_all else "fail", "NASA AVGVISIB maps at the same points",
        f"Sun r {s['r']:.3f}, mean |diff| {s['mae_pts']:.1f} points; "
        f"Earth r {e['r']:.3f}, mean |diff| {e['mae_pts']:.1f} points",
        f"r > {TOL['A7_r_min']:g} and mean |diff| < {TOL['A7_mae_pct_max']:g} points", PGDA, details,
        f"{N_POINTS} points with x, y uniform and r <= {R_MAX_M / 1000:g} km (seed {SEED}), each with "
        f"its own horizon ({', '.join(sorted(labels))}, observer at {OBSERVER_HEIGHT_M:g} m); "
        "'any part of the disc', "
        f"{counts.n_any} hourly steps (one in three) from 2026-01-01 over 18.6 years. NASA: mean of 3 x 3 "
        "pixels of the 60 m maps (terrain up to 2013, surface observer); bias Sun "
        f"{s['bias_pts']:+.1f}, Earth {e['bias_pts']:+.1f} points.")
    print("\nA7:\n  " + "\n  ".join(lines))
    print(f"  Sun: {s}\n  Earth: {e}")
    assert ok_all, details
