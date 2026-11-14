# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Case B6: the horizon cube and the map layers against the per-site path at 10 mesh cells.

11_validacion.md §5, B6. Ten cells of the mesh, drawn with seed 7 among the computed ones:

1. **Mask.** The cube mask of the cell (``engine_torch``, float32, stored every 0.01°) against the
   ``site-mask`` engine (``engine_ref.horizon_mask``, NumPy float64) at the cell centre, with the
   same law, the same observer height and the same DEM stack as the cube (``cube.json``).
   Tolerance: |difference| ≤ ``B6_el_deg`` in 99 % of the 720 azimuths and ≤ 2 × ``B6_el_deg`` in all.
2. **Layer.** The values of ``mean186`` (Sun, Earth, both; centre criterion) and ``mean186_any``
   (Sun, Earth; «any part») of the cell against the same percentages computed from the site mask
   over the 163 152 hourly steps of 08 §5.2. Tolerance: ``B6_pct`` points.

Marker ``slow``: needs the cube, the layers, LOLA P1 and P2 and the real ephemeris table. The 10 site
masks take a few minutes. The functions that compare are checked first on synthetic inputs.
"""

from __future__ import annotations

import json

import numpy as np
import pytest

from pipeline.horizon import cube
from pipeline.horizon.engine_ref import horizon_mask
from pipeline.horizon.law import N_AZ
from pipeline.layers import layers as lay
from pipeline.tests.conftest import REPO_ROOT, data_dir

TOL = json.loads((REPO_ROOT / "tests" / "golden" / "tolerances.json").read_text(encoding="utf-8"))
SOURCE = {"label": "Two independent computation paths", "url": ""}

# 11 §5, B6.
SEED = 7
N_CELLS = 10
SHARE_WITHIN = 0.99  # 99 % of the azimuths within B6_el_deg
ALL_FACTOR = 2.0  # every azimuth within 2 × B6_el_deg (0.02°)
BAND_LABELS = ("Sun", "Earth", "Sun and Earth", "Sun, any part", "Earth, any part")


# ------------------------------------------------------------------------------- helpers


def pick_cells(computed: np.ndarray, n: int = N_CELLS, seed: int = SEED) -> list[tuple[int, int]]:
    """``n`` cells (i, j) drawn without replacement among the computed ones (bool [NY, NX]).

    Candidates in row-major order (j, then i); ``np.random.default_rng(seed).choice`` (decision D-113).
    """
    flat = np.flatnonzero(np.asarray(computed, dtype=bool).ravel())
    if flat.size < n:
        raise ValueError(f"Only {flat.size} computed cells, {n} needed")
    picked = np.random.default_rng(seed).choice(flat, size=n, replace=False)
    return [(int(k % cube.NX), int(k // cube.NX)) for k in picked]


def compare_masks(cube_el: np.ndarray, site_el: np.ndarray, tol_deg: float) -> dict:
    """Largest |difference|, share of azimuths within ``tol_deg`` and the B6 verdict for one cell."""
    d = np.abs(np.asarray(cube_el, dtype=np.float64) - np.asarray(site_el, dtype=np.float64))
    if d.shape != (N_AZ,):
        raise ValueError(f"Masks of shape {d.shape}, expected ({N_AZ},)")
    share = float((d <= tol_deg).mean())
    worst = float(d.max())
    return {"max_deg": worst, "share_within": share, "worst_az_deg": 0.5 * int(d.argmax()),
            "ok": share >= SHARE_WITHIN and worst <= ALL_FACTOR * tol_deg}


def site_percentages(counts: lay.Counts, steps: lay.Steps) -> np.ndarray:
    """float64 [P, 5]: Sun, Earth, both (mean186) and Sun, Earth «any part», in % of the steps."""
    n = lay.period_steps(steps)[lay.MEAN_COL]
    centre = 100.0 * counts.centre[:, :, lay.MEAN_COL].T / n
    any_ = 100.0 * counts.any.T / counts.n_any
    return np.concatenate([centre, any_], axis=1)


def layer_percentages(mean: np.ndarray, mean_any: np.ndarray, i: int, j: int) -> np.ndarray:
    """float64 [5] of the published layers at cell (i, j); NaN where the value is 255."""
    v = np.concatenate([mean[:, j, i], mean_any[:, j, i]]).astype(np.float64)
    return np.where(v == lay.NODATA, np.nan, v * lay.PCT_PER_UNIT)


# ------------------------------------------------------------------------------- fast tests


def test_pick_cells_is_reproducible_and_only_computed():
    computed = np.zeros((cube.NY, cube.NX), dtype=bool)
    computed[100:110, 200:230] = True
    a, b = pick_cells(computed), pick_cells(computed)
    assert a == b and len(set(a)) == N_CELLS
    assert all(computed[j, i] for i, j in a)
    assert pick_cells(computed, seed=8) != a
    with pytest.raises(ValueError):
        pick_cells(np.zeros((cube.NY, cube.NX), dtype=bool))


def test_compare_masks_limits():
    tol = TOL["B6_el_deg"]
    base = np.linspace(-1, 3, N_AZ)
    assert compare_masks(base + 0.005, base, tol)["ok"]
    seven = base.copy()
    seven[:7] += 0.019  # 7 azimuths (< 1 %) between 0.01° and 0.02°: still within B6
    assert compare_masks(seven, base, tol)["ok"]
    eight = base.copy()
    eight[:8] += 0.015  # 8 azimuths (> 1 %) beyond 0.01°
    assert not compare_masks(eight, base, tol)["ok"]
    spike = base.copy()
    spike[300] += 0.03  # one azimuth beyond 0.02°
    r = compare_masks(spike, base, tol)
    assert not r["ok"] and r["worst_az_deg"] == 150.0 and r["max_deg"] == pytest.approx(0.03)


def test_site_percentages_and_layer_values_agree_on_a_synthetic_cell(example_table):
    """The two readings of B6 part 2 give the same numbers when they start from the same mask."""
    steps = lay.table_steps(example_table, 2000)
    i, j = 415, 380
    frames = cube.frames_of_xy(*cube.cell_centre_xy(np.array([i]), np.array([j])))
    el = (0.4 + 0.8 * np.sin(np.radians(np.arange(N_AZ) * 0.5 * 3)))[None, :]
    counts = lay.count_visibility(lay.points_of(frames, [-2000.0], el), steps)
    pct = site_percentages(counts, steps)[0]
    v, v_any = lay.layer_units(counts, steps)
    mean = np.full((3, cube.NY, cube.NX), lay.NODATA, dtype=np.uint8)
    mean_any = np.full((2, cube.NY, cube.NX), lay.NODATA, dtype=np.uint8)
    mean[:, j, i] = v[lay.MEAN_COL, :, 0]
    mean_any[:, j, i] = v_any[:, 0]
    got = layer_percentages(mean, mean_any, i, j)
    assert np.all(np.abs(got - pct) <= lay.PCT_PER_UNIT / 2 + 1e-9)  # only the rounding of 09 §9.2
    assert np.isnan(layer_percentages(mean, mean_any, 0, 0)).all()


# ------------------------------------------------------------------------------- the case (slow)


def heavy_inputs():
    """Cube folder, layers folder and the DEM stack of the cube, or skip."""
    root = data_dir()
    heavy = root / "out" / "heavy"
    cube_dir, layers_dir = cube.cube_dir_of(root / "out"), lay.layers_dir_of(heavy)
    meta = cube.read_cube_json(cube_dir)
    if meta is None or not (cube_dir / "done.bin").is_file():
        pytest.skip(f"no horizon cube in {cube_dir}: run make cube")
    doc_path = layers_dir / "layers.json"
    if not doc_path.is_file():
        pytest.skip(f"no layers in {layers_dir}: run make layers")
    doc = json.loads(doc_path.read_text(encoding="utf-8"))
    if doc.get("source") != lay.SOURCE_COMPUTED:
        pytest.skip(f"layers.json has source {doc.get('source')!r} (plan B-4): nothing of ours to compare")
    from pipeline.dem.stack import DemDataMissing, lola_polar_stack

    try:
        # Without coordinates: the stack of the map mesh, the one the cube used.
        stack = lola_polar_stack(root, in_memory=True)
    except DemDataMissing as exc:
        pytest.skip(str(exc))
    names = [g.name for g in stack.grids]
    assert meta.get("dem_stack", names) == names, (meta.get("dem_stack"), names)
    return cube_dir, layers_dir, stack, doc


@pytest.mark.slow
def test_b6_cube_and_layers_against_the_site_path(real_table, record_case):
    cube_dir, layers_dir, stack, doc = heavy_inputs()
    mean = lay.read_layer(layers_dir / f"{lay.MEAN_ID}.bin.gz", len(lay.BANDS))
    mean_any = lay.read_layer(layers_dir / "mean186_any.bin.gz", len(lay.ANY_BANDS))
    cells = pick_cells(mean[0] != lay.NODATA)
    tol_el, tol_pct = TOL["B6_el_deg"], TOL["B6_pct"]
    steps = lay.table_steps(real_table)

    masks, heights, cube_masks, laws, observers = [], [], [], set(), set()
    for i, j in cells:
        row, col, p = (int(v) for v in cube.chunk_of_cell(i, j))
        chunk = cube.read_chunk(cube_dir, row, col)
        assert chunk.computed[p], f"cell ({i}, {j}) has layer values but no horizon in the cube"
        laws.add(chunk.law)
        observers.add(chunk.observer_height_m)
        frames = cube.frames_of_xy(*cube.cell_centre_xy(i, j))
        site = horizon_mask(float(frames.lat_deg[0]), float(frames.lon_deg[0]), stack,
                            [chunk.observer_height_m], law=chunk.law)
        masks.append(site.masks[0].el_deg)
        heights.append(site.site_height_m)
        cube_masks.append(chunk.el_deg[p])
    assert len(laws) == 1 and len(observers) == 1, (laws, observers)
    observer = observers.pop()
    assert observer == doc["observer_height_m"]

    # Part 2: the layers against the percentages of the site masks.
    i_arr, j_arr = np.array([c[0] for c in cells]), np.array([c[1] for c in cells])
    frames = cube.frames_of_xy(*cube.cell_centre_xy(i_arr, j_arr))
    counts = lay.count_visibility(lay.points_of(frames, heights, np.stack(masks), observer), steps)
    site_pct = site_percentages(counts, steps)

    details, lines, ok_all = [], [], True
    for k, (i, j) in enumerate(cells):
        m = compare_masks(cube_masks[k], masks[k], tol_el)
        layer_pct = layer_percentages(mean, mean_any, i, j)
        d_pct = np.abs(layer_pct - site_pct[k])
        ok_pct = bool(np.all(d_pct <= tol_pct))
        ok_all &= m["ok"] and ok_pct
        lat, lon = float(frames.lat_deg[k]), float(frames.lon_deg[k])
        where = f"cell ({i}, {j}), {lat:.3f}, {lon:.3f}"
        details.append({"label": f"Mask, {where}: largest difference ({100 * m['share_within']:.1f} % of "
                                 f"azimuths within {tol_el} deg)",
                        "expected": f"<= {ALL_FACTOR * tol_el:g} deg, "
                                    f"{100 * SHARE_WITHIN:g} % within {tol_el} deg",
                        "obtained": round(m["max_deg"], 4), "abs_err": round(m["max_deg"], 4), "unit": "deg",
                        "ok": m["ok"]})
        worst = int(np.nanargmax(d_pct))
        details.append({"label": f"Layer, {where}: largest difference ({BAND_LABELS[worst]})",
                        "expected": f"<= {tol_pct} points",
                        "obtained": round(float(d_pct[worst]), 3), "abs_err": round(float(d_pct[worst]), 3),
                        "unit": "points", "ok": ok_pct})
        lines.append(f"{where}: mask max {m['max_deg']:.4f} deg at az {m['worst_az_deg']:.1f}, "
                     f"{100 * m['share_within']:.2f} % within {tol_el}; layer "
                     + ", ".join(f"{b} {lp:.1f}/{sp:.2f}" for b, lp, sp in
                                 zip(("sun", "earth", "both", "sun_any", "earth_any"), layer_pct, site_pct[k],
                                     strict=True)))
    worst_mask = max(d["obtained"] for d in details[0::2])
    worst_pct = max(d["obtained"] for d in details[1::2])
    record_case(
        "B6", "pass" if ok_all else "fail", "Same masks and same percentages",
        f"{N_CELLS} cells: largest mask difference {worst_mask:.4f} deg, largest layer difference "
        f"{worst_pct:.2f} points",
        f"{tol_el} deg (99 % of azimuths; {ALL_FACTOR * tol_el:g} deg in all) and {tol_pct} points", SOURCE,
        details,
        f"Cells drawn with seed {SEED} among the computed ones. Law {laws.pop()}, "
        f"observer at {observer:g} m, "
        f"terrain {' + '.join(g.name for g in stack.grids)}; {steps.n} hourly steps from 2026-01-01.")
    print("\nB6:\n  " + "\n  ".join(lines))
    assert ok_all, [d for d in details if not d["ok"]]
