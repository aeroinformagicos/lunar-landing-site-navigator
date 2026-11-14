# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""T-28 fast tests: background of the map (08_mapa_polar.md §6; 09_contrato_datos.md §8.3).

Hillshade formula with hand values, the sign of the y slope (y upwards, rows downwards), one-sided
differences on the border, and the two files from a synthetic polar grid.
"""

import gzip
import math

import numpy as np
import pytest

from pipeline.cli.contract_check import check_dir
from pipeline.dem.grids import PolarSouthGrid
from pipeline.layers import hillshade as hs
from pipeline.layers import layers as lay

# 08 §6: value of flat ground: n = (0, 0, 1), n·L = sin 30° = 0.5 -> round(255·(0.35 + 0.65·0.5)).
FLAT_VALUE = 172  # 255 · 0.675 = 172.125
L = (-math.cos(math.radians(30)) * math.sin(math.radians(45)),
     math.cos(math.radians(30)) * math.cos(math.radians(45)), math.sin(math.radians(30)))


def by_hand(dzdx, dzdy, k=2.0):
    n = (-dzdx * k, -dzdy * k, 1.0)
    norm = math.sqrt(sum(c * c for c in n))
    dot = sum(a * b for a, b in zip(n, L, strict=True)) / norm
    return math.floor(255 * min(max(0.35 + 0.65 * dot, 0.0), 1.0) + 0.5)


def test_image_sizes_cover_the_mesh():
    assert (hs.HILL_W, hs.HILL_H) == (1504, 1344)  # 09 §8.3
    np.testing.assert_allclose(hs.light_vector(), L)
    x, y = hs.pixel_centres(250.0, hs.HILL_W, hs.HILL_H)
    assert (x[0, 0], y[0, 0]) == (-199_875.0, 183_875.0)
    assert (x[-1, -1], y[-1, -1]) == (175_875.0, -151_875.0)  # mesh: x ≤ 176 km, y ≥ −152 km


def test_flat_ground():
    assert (hs.shade(np.full((5, 6), -1234.0)) == FLAT_VALUE).all()
    assert by_hand(0.0, 0.0) == FLAT_VALUE


def test_planes_by_hand_and_the_sign_of_y():
    rows, cols, step = 6, 7, 250.0
    f, c = np.mgrid[0:rows, 0:cols]
    for a, b in ((0.1, 0.0), (0.0, 0.1), (-0.05, 0.2), (0.3, -0.3)):
        # z = a·x + b·y with x = c·step to the right and y = −f·step upwards.
        z = a * c * step + b * (-f * step)
        dx, dy = hs.slopes(z, step)
        np.testing.assert_allclose(dx, a, atol=1e-12)
        np.testing.assert_allclose(dy, b, atol=1e-12)
        assert (hs.shade(z, step) == by_hand(a, b)).all()
    # Ground that goes down towards the light (top left) faces it: brighter than flat; the other way, darker.
    towards = hs.shade(0.2 * c * step - 0.2 * (-f * step), step)
    away = hs.shade(-0.2 * c * step + 0.2 * (-f * step), step)
    assert (towards > FLAT_VALUE).all() and (away < FLAT_VALUE).all()


def test_central_inside_one_sided_on_the_border():
    z = np.array([[0.0, 1.0, 4.0, 9.0], [0.0, 1.0, 4.0, 9.0], [10.0, 11.0, 14.0, 19.0]])
    dx, dy = hs.slopes(z, 1.0)
    np.testing.assert_allclose(dx[0], [1.0, 2.0, 4.0, 5.0])  # (1−0), (4−0)/2, (9−1)/2, (9−4)
    np.testing.assert_allclose(dy[:, 0], [0.0, -5.0, -10.0])  # (Z[0]−Z[1]), (Z[0]−Z[2])/2, (Z[1]−Z[2])


def bowl_grid(n=500, scale=1000.0):
    """Synthetic polar grid (±250 km) in units of 0.5 m: a bowl 3 km deep at the pole."""
    l, s = np.mgrid[0:n, 0:n]
    x = (s - n / 2 + 0.5) * scale
    y = (n / 2 - 0.5 - l) * scale
    h = -3000.0 + 1e-8 * (x * x + y * y)
    return PolarSouthGrid("bowl", n, scale, data=np.rint(h / 0.5).astype("<i2"), to_m=0.5)


def test_background_files_from_a_polar_grid(tmp_path):
    from PIL import Image

    grid = bowl_grid()
    png, dem_path, summary = hs.write_background(tmp_path, grid)
    lay.write_grid(tmp_path)
    assert check_dir(tmp_path)[1] == []
    with Image.open(png) as im:
        assert (im.format, im.size, im.mode) == ("PNG", (1504, 1344), "L")
        shade = np.asarray(im)
    assert shade.min() > 0 and abs(int(shade[672, 800]) - FLAT_VALUE) <= 2  # almost flat at the pole
    dem = np.frombuffer(gzip.decompress(dem_path.read_bytes()), "<i2").reshape(672, 752)
    assert summary["dem_nodata"] == 0
    for i, j in ((0, 0), (400, 368), (751, 671)):
        x, y = -200_000 + (i + 0.5) * 500, 184_000 - (j + 0.5) * 500
        h, ok = hs.sample_xy(grid, np.array([x]), np.array([y]))
        assert ok[0] and dem[j, i] == math.floor(h[0] + 0.5)
    assert dem[368, 400] == pytest.approx(-3000, abs=1)


def test_dem_without_data_is_nodata():
    small = bowl_grid(n=100, scale=1000.0)  # ±50 km only
    dem = hs.dem_500m(small)
    assert dem[0, 0] == -32768 and dem[368, 400] != -32768
