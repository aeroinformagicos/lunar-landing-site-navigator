# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Case A6: the best lit cell near Shackleton crater against Mazarico et al. (2011).

11_validacion.md §4, A6; 08_mapa_polar.md §11. Among the mesh cells whose centre is less than 15 km
from the centre of Shackleton (−89.67°, 129.78°), the one with the largest ``sun`` value of
``mean186``; with its cube mask and the centre criterion (observer at 2 m), every hour of 2026–2030:

- the longest run of continuous light (published: of the order of 240 days);
- the longest night (published: of the order of 1.5 days).

«Same order» = within a factor 3. The test computes and records the two figures with status
``manual``: the verdict is A1's (08 §11). Hourly steps (the nodes of the table, as the layers), so
each run is known to ± 1 h; a run cut by the ends of 2026–2030 is counted up to the end and said so.

Marker ``slow``: needs the cube, the layers and the real ephemeris table (seconds once they exist).
"""

from __future__ import annotations

import json

import numpy as np
import pytest

from pipeline.common.constants import OBSERVER_HEIGHT_M
from pipeline.dem.stack import polar_xy_m
from pipeline.horizon import cube
from pipeline.horizon.law import AZ_STEP_DEG, N_AZ
from pipeline.layers import layers as lay
from pipeline.tests.conftest import data_dir

SOURCE = {"label": "Mazarico et al. (2011), Icarus 211", "url": "https://doi.org/10.1016/j.icarus.2010.10.030"}

# 08 §11 and 11 §4, A6.
SHACKLETON = (-89.67, 129.78)
RADIUS_M = 15_000.0
PUBLISHED_LIGHT_D = 240.0
PUBLISHED_NIGHT_D = 1.5
FACTOR = 3.0
N_STEPS = lay.MONTH_STEPS_TOTAL  # every hour of 2026-01-01 … 2030-12-31


# ------------------------------------------------------------------------------- helpers


def cells_near(x0: float, y0: float, radius_m: float = RADIUS_M) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(i, j, distance) of the mesh cells whose centre is less than ``radius_m`` from (x0, y0)."""
    i, j = np.meshgrid(np.arange(cube.NX), np.arange(cube.NY))
    x, y = cube.cell_centre_xy(i, j)
    d = np.hypot(x - x0, y - y0)
    near = d < radius_m
    return i[near], j[near], d[near]


def best_cell(sun_units: np.ndarray, i: np.ndarray, j: np.ndarray, d: np.ndarray) -> tuple[int, int]:
    """The cell with the largest ``sun`` value (255 = not computed is left out); nearest on a tie."""
    v = sun_units[j, i].astype(np.int64)
    ok = v != lay.NODATA
    if not ok.any():
        raise ValueError("No computed cell near the point")
    order = np.lexsort((i[ok], j[ok], d[ok], -v[ok]))  # largest value, then distance, then j, then i
    k = order[0]
    return int(i[ok][k]), int(j[ok][k])


def longest_runs(series: np.ndarray, value: bool) -> tuple[int, bool]:
    """Length of the longest run of ``value`` in a bool series, and whether it touches an end."""
    s = np.asarray(series, dtype=bool) == value
    if not s.any():
        return 0, False
    padded = np.concatenate([[False], s, [False]]).astype(np.int8)
    edges = np.flatnonzero(np.diff(padded))
    starts, ends = edges[0::2], edges[1::2]
    lengths = ends - starts
    k = int(np.argmax(lengths))
    return int(lengths[k]), bool(starts[k] == 0 or ends[k] == s.size)


def sun_series(points: lay.Points, steps: lay.Steps) -> np.ndarray:
    """bool [K]: centre of the Sun above the horizon of the single point, at each step (07 §2, §3)."""
    p = points.pos_km[0]
    v = steps.sun - p
    e, n, u = v @ points.east[0], v @ points.north[0], v @ points.up[0]
    az = np.rad2deg(np.arctan2(e, n))
    el = np.rad2deg(np.arctan2(u, np.hypot(e, n)))
    x = np.remainder(az, 360.0) / AZ_STEP_DEG
    j0 = np.floor(x)
    f = x - j0
    j0 = j0.astype(np.int64) % N_AZ
    m = points.el_deg[0]
    horizon = (1 - f) * m[j0] + f * m[(j0 + 1) % N_AZ]
    return el > horizon


# ------------------------------------------------------------------------------- fast tests


def test_shackleton_cell_and_neighbourhood():
    x0, y0 = polar_xy_m(*SHACKLETON)
    assert round(x0) == 7690 and round(y0) == -6403  # 08 §11
    i, j, d = cells_near(x0, y0)
    assert (415, 380) in set(zip(i.tolist(), j.tolist(), strict=True))  # 08 §11
    assert (d < RADIUS_M).all()
    # About π·15²/0.25 = 2827 cells.
    assert 2700 < i.size < 2950


def test_best_cell_takes_the_largest_then_the_nearest():
    sun = np.full((cube.NY, cube.NX), lay.NODATA, dtype=np.uint8)
    i, j, d = np.array([1, 2, 3, 4]), np.array([0, 0, 0, 0]), np.array([10.0, 5.0, 1.0, 2.0])
    sun[0, 1], sun[0, 2], sun[0, 3] = 200, 230, 100  # cell 4 not computed
    assert best_cell(sun, i, j, d) == (2, 0)
    sun[0, 1] = 230  # tie: the nearest wins
    assert best_cell(sun, i, j, d) == (2, 0)
    with pytest.raises(ValueError):
        best_cell(np.full_like(sun, lay.NODATA), i, j, d)


def test_longest_runs():
    s = np.array([1, 1, 0, 1, 1, 1, 0, 0, 1], dtype=bool)
    assert longest_runs(s, True) == (3, False)
    assert longest_runs(s, False) == (2, False)
    assert longest_runs(np.ones(5, dtype=bool), True) == (5, True)
    assert longest_runs(np.ones(5, dtype=bool), False) == (0, False)


def test_sun_series_matches_the_layer_counts(example_table):
    """The hourly series of A6 counts the same steps as the layers (08 §5.2) for the same mask."""
    steps = lay.table_steps(example_table, 3000)
    frames = cube.frames_of_xy(*cube.cell_centre_xy(np.array([415]), np.array([380])))
    el = (0.3 + 0.7 * np.cos(np.radians(np.arange(N_AZ) * AZ_STEP_DEG * 2)))[None, :]
    pts = lay.points_of(frames, [1200.0], el)
    series = sun_series(pts, steps)
    counts = lay.count_visibility(pts, steps)
    assert int(series.sum()) == int(counts.centre[0, 0, lay.MEAN_COL])
    assert 0 < series.sum() < series.size


# ------------------------------------------------------------------------------- the case (slow)


@pytest.mark.slow
def test_a6_longest_light_and_night_near_shackleton(real_table, record_case):
    root = data_dir()
    cube_dir = cube.cube_dir_of(root / "out")
    layers_dir = lay.layers_dir_of(root / "out" / "heavy")
    if not (cube_dir / "done.bin").is_file():
        pytest.skip(f"no horizon cube in {cube_dir}: run make cube")
    doc_path = layers_dir / "layers.json"
    if not doc_path.is_file():
        pytest.skip(f"no layers in {layers_dir}: run make layers")
    if json.loads(doc_path.read_text(encoding="utf-8")).get("source") != lay.SOURCE_COMPUTED:
        pytest.skip("layers.json comes from the NASA maps (plan B-4): no cube values to rank")
    mean = lay.read_layer(layers_dir / f"{lay.MEAN_ID}.bin.gz", len(lay.BANDS))
    x0, y0 = polar_xy_m(*SHACKLETON)
    ci, cj, cd = cells_near(x0, y0)
    i, j = best_cell(mean[0], ci, cj, cd)
    dist_km = float(cd[(ci == i) & (cj == j)][0]) / 1000.0
    row, col, p = (int(v) for v in cube.chunk_of_cell(i, j))
    chunk = cube.read_chunk(cube_dir, row, col)
    assert chunk.computed[p]
    assert chunk.observer_height_m == OBSERVER_HEIGHT_M
    frames = cube.frames_of_xy(*cube.cell_centre_xy(np.array([i]), np.array([j])))
    pts = lay.points_of(frames, chunk.height_m[p : p + 1], chunk.el_deg[p : p + 1], chunk.observer_height_m)
    steps = lay.table_steps(real_table, N_STEPS)
    series = sun_series(pts, steps)
    light_h, light_cut = longest_runs(series, True)
    night_h, night_cut = longest_runs(series, False)
    light_d, night_d = light_h / 24.0, night_h / 24.0
    n_cells = int((mean[0][cj, ci] != lay.NODATA).sum())

    def within(value: float, published: float) -> bool:
        return published / FACTOR <= value <= published * FACTOR

    lat, lon = float(frames.lat_deg[0]), float(frames.lon_deg[0])
    details = [
        {"label": "Longest continuous light, 2026-2030" + (" (cut by the period)" if light_cut else ""),
         "expected": f"about {PUBLISHED_LIGHT_D:g} days", "obtained": round(light_d, 1),
         "abs_err": round(abs(light_d - PUBLISHED_LIGHT_D), 1), "unit": "days",
         "ok": within(light_d, PUBLISHED_LIGHT_D)},
        {"label": "Longest night, 2026-2030" + (" (cut by the period)" if night_cut else ""),
         "expected": f"about {PUBLISHED_NIGHT_D:g} days", "obtained": round(night_d, 2),
         "abs_err": round(abs(night_d - PUBLISHED_NIGHT_D), 2), "unit": "days",
         "ok": within(night_d, PUBLISHED_NIGHT_D)},
    ]
    record_case(
        "A6", "manual", "Continuous light of about 240 days; longest night about 1.5 days",
        f"Longest continuous light {light_d:.1f} days; longest night {night_d:.2f} days",
        "Same order (factor 3)", SOURCE, details,
        f"Best of {n_cells} computed cells within {RADIUS_M / 1000:g} km of the centre of Shackleton: cell "
        f"({i}, {j}) at {lat:.4f}, {lon:.3f} ({dist_km:.1f} km away), mean Sun "
        f"{mean[0, j, i] * lay.PCT_PER_UNIT:.1f} % over 18.6 years, terrain {chunk.height_m[p]} m, "
        f"observer at {chunk.observer_height_m:g} m, centre of the disc, hourly steps "
        f"({series.size} hours of 2026-2030). Verdict by A1 (factor 3 marked in the details). "
        "The published point and height are not verified yet.")
    print(f"\nA6: cell ({i}, {j}) {lat:.4f}, {lon:.3f}, {dist_km:.1f} km from the centre, "
          f"mean Sun {mean[0, j, i] * lay.PCT_PER_UNIT:.1f} %; longest light {light_d:.1f} d"
          f"{' (cut)' if light_cut else ''}, longest night {night_d:.2f} d{' (cut)' if night_cut else ''}; "
          f"{int(series.sum())} of {series.size} hours lit")
    assert 0 < series.sum() < series.size or light_h == series.size
