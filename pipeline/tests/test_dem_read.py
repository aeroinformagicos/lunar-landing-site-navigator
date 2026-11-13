# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""T-07 reading checks with the real DEMs (marked ``data``: ``make test-all``, not ``make test``).

docs/spec/03_datos_y_fuentes.md §4.3, §4.4 and §5.4. Each test is skipped if its files are
not in the data directory. Expected values come from the labels, from published figures
(Gazetteer of Planetary Nomenclature, Zuber et al. 2012, LROC) and from the specification.
Measured values are printed (run with ``-s``) and noted in docs/constants.md.
"""

import json
import time

import numpy as np
import pytest

from pipeline.common.geo import unit_vector
from pipeline.dem.crop import build_crop, load_crop
from pipeline.dem.grids import read_pds_image
from pipeline.dem.pds_label import parse_label
from pipeline.dem.stack import (
    LABEL_LOLA_120,
    LABEL_LOLA_POLAR_40_120,
    LABEL_SLDEM2015,
    stack_for_site,
)

pytestmark = pytest.mark.data

# 03 §4.1: product -> (N, file size in bytes, DERIVED_MINIMUM, DERIVED_MAXIMUM in DN)
LOLA = {
    "LDEM_80S_40M": (15200, 462_080_000, -14593, 14054),
    "LDEM_75S_120M": (7624, 116_250_752, -15526, 14050),
    "LDEM_60S_120M": (15520, 481_740_800, -18255, 14050),
}
# Shackleton: centre from the Gazetteer of Planetary Nomenclature, feature 5450 (03 §4.4).
SHACKLETON = (-89.67, 129.78)
# SLIM lander: LROC, "JAXA SLIM Landing" (03 §5.4): 13.3160° S, 25.2510° E, −912 m elevation.
SLIM = (-13.3160, 25.2510, -912.0)
BLUE_GHOST = (18.562, 61.810)  # 04 §2


def _lola(require_data, name):
    require_data(f"raw/lola/{name}.IMG")
    return read_pds_image(require_data(f"raw/lola/{name}.LBL"))


@pytest.mark.parametrize("name", LOLA)
def test_lola_size_and_extremes(require_data, name):
    # §4.3 checks 1 and 2: exact file size; minimum and maximum of the whole matrix equal the label's.
    n, size, dn_min, dn_max = LOLA[name]
    assert require_data(f"raw/lola/{name}.IMG").stat().st_size == size
    grid = _lola(require_data, name)
    assert grid.data.shape == (n, n) and grid.data.dtype == np.dtype("<i2")
    lo = min(int(grid.data[i : i + 1024].min()) for i in range(0, n, 1024))
    hi = max(int(grid.data[i : i + 1024].max()) for i in range(0, n, 1024))
    print(f"\n{name}: DN min {lo}, max {hi} ({lo * grid.to_m} m, {hi * grid.to_m} m)")
    assert (lo, hi) == (dn_min, dn_max)
    assert (lo, hi) == (grid.label.minimum, grid.label.maximum)


def test_p1_p2_coherence(require_data):
    # §4.3 check 3: 1000 random points with |x|, |y| < 150 km; median |P1 − P2| < 5 m.
    p1 = _lola(require_data, "LDEM_80S_40M")
    p2 = _lola(require_data, "LDEM_75S_120M")
    rng = np.random.default_rng(20261114)
    x = rng.uniform(-150_000, 150_000, 1000)
    y = rng.uniform(-150_000, 150_000, 1000)
    h1, ok1 = p1.sample_pixels(*p1.pixel_of_xy(x, y))
    h2, ok2 = p2.sample_pixels(*p2.pixel_of_xy(x, y))
    assert ok1.all() and ok2.all()
    diff = np.abs(h1 - h2)
    print(
        f"\n|P1 - P2|: median {np.median(diff):.2f} m, p95 {np.percentile(diff, 95):.2f} m, "
        f"max {diff.max():.1f} m"
    )
    assert np.median(diff) < 5.0


def test_shackleton_depth_and_orientation(require_data):
    # §4.4. Expected 1: rim (highest point within 12 km of the centre) minus the centre is between
    # 3500 and 4700 m (Zuber et al. 2012: 4.1 ± 0.05 km). Expected 2: the centre is at least 2000 m
    # lower than its mirror point (−89.67°, −129.78°), which lies outside the crater.
    p1 = _lola(require_data, "LDEM_80S_40M")
    lat, lon = SHACKLETON
    h_centre, ok = p1.height_m(unit_vector(lat, lon))
    h_mirror, ok_mirror = p1.height_m(unit_vector(lat, -lon))
    assert ok and ok_mirror
    s_c, l_c = p1.pixel_of_latlon(lat, lon)
    half = int(12_000 / p1.S) + 2
    s0, l0 = int(round(float(s_c))) - half, int(round(float(l_c))) - half
    window = np.asarray(p1.data[l0 : l0 + 2 * half + 1, s0 : s0 + 2 * half + 1]) * p1.to_m
    ll, ss = np.mgrid[l0 : l0 + 2 * half + 1, s0 : s0 + 2 * half + 1]
    x, y = p1.xy_of_pixel(ss, ll)
    x_c, y_c = p1.xy_of_pixel(s_c, l_c)
    rim = window[np.hypot(x - x_c, y - y_c) < 12_000].max()
    print(
        f"\nShackleton: centre {h_centre:.1f} m, rim max {rim:.1f} m, depth {rim - h_centre:.1f} m, "
        f"mirror point {h_mirror:.1f} m"
    )
    assert 3500.0 < rim - h_centre < 4700.0
    assert h_mirror - h_centre >= 2000.0


def test_lola_stacks_on_real_sites(llsn_data_dir, require_data):
    for name in LOLA:
        require_data(f"raw/lola/{name}.IMG")
    # shackleton-floor: P1 + P2, no P3. The site height is the P1 value.
    stack = stack_for_site("lola_polar", "shackleton-floor", *SHACKLETON, llsn_data_dir)
    assert [g.name for g in stack.grids] == ["LDEM_80S_40M", "LDEM_75S_120M"]
    assert stack.label == LABEL_LOLA_POLAR_40_120
    h, valid, index = stack.height_m(unit_vector(*SHACKLETON))
    assert (
        valid
        and index == 0
        and h == pytest.approx(float(stack.grids[0].height_m(unit_vector(*SHACKLETON))[0]))
    )
    # A point 400 km from the pole is outside P1 and inside P2; one 600 km away is outside both.
    r_deg = np.degrees(np.array([400_000.0, 600_000.0]) / 1_737_400.0)
    _, valid, index = stack.height_m(unit_vector(-90 + r_deg, [0.0, 0.0]))
    assert index.tolist() == [1, -1] and valid.tolist() == [True, False]
    # im-1 (04 §2): inside P1, its 300 km circle leaves P2 -> P3 joins the stack.
    stack = stack_for_site("lola_polar", "im-1", -80.13, 1.44, llsn_data_dir)
    assert [g.name for g in stack.grids] == ["LDEM_80S_40M", "LDEM_75S_120M", "LDEM_60S_120M"]
    _, valid, index = stack.height_m(unit_vector(-90 + r_deg, [0.0, 0.0]))
    assert index.tolist() == [1, 2] and valid.all()
    # chandrayaan-3 (04 §2): P3 alone.
    stack = stack_for_site("lola_60s", "chandrayaan-3", -69.3741, 32.32, llsn_data_dir)
    assert [g.name for g in stack.grids] == ["LDEM_60S_120M"] and stack.label == LABEL_LOLA_120
    h, valid, _ = stack.height_m(unit_vector(-69.3741, 32.32))
    print(f"\nchandrayaan-3 site height (P3): {h:.1f} m")
    assert valid and -9200 < h < 7100


def _local_tile(require_data, tile):
    require_data(f"raw/sldem2015/SLDEM2015_512_{tile}_FLOAT.LBL")
    path = require_data(f"raw/sldem2015/SLDEM2015_512_{tile}_FLOAT.IMG")
    if path.stat().st_size != 1_415_577_600:
        pytest.skip(f"tile {tile} is incomplete; resume its download")
    return path


def _crop_from_local_tiles(data_dir, site_id, lat, lon):
    # Tests never download: the tiles are checked before, so build_crop reads them from disk.
    t0 = time.perf_counter()
    result = build_crop(site_id, lat, lon, data_dir, base_url="http://127.0.0.1:9", log=print)
    if not result.skipped:
        print(f"\ncrop {site_id}: built in {time.perf_counter() - t0:.1f} s from {result.sources}")
        assert set(result.sources.values()) == {"local"}
    return result


def test_blue_ghost_crop(llsn_data_dir, require_data):
    # §5.3 and §5.4: aligned window, no resampling, values inside the tile's range.
    tile_path = _local_tile(require_data, "00N_30N_045_090")
    label = parse_label(tile_path.with_suffix(".LBL"))
    result = _crop_from_local_tiles(llsn_data_dir, "blue-ghost-1", *BLUE_GHOST)
    meta = json.loads(result.json_path.read_text(encoding="utf-8"))
    assert (meta["lat_max_deg"] * 512).is_integer() and (meta["lon_west_deg360"] * 512).is_integer()
    assert (meta["nrows"], meta["ncols"], meta["ppd"], meta["scaling_m"]) == (10241, 10796, 512, 0.5)
    assert meta["source_tiles"] == ["SLDEM2015_512_00N_30N_045_090_FLOAT"]
    if not result.skipped:
        assert result.bytes_read == {"SLDEM2015_512_00N_30N_045_090_FLOAT": 10241 * 92160}  # §5.4.1
    grid = load_crop(llsn_data_dir, "blue-ghost-1")
    tile = np.memmap(tile_path, dtype="<f4", mode="r", shape=(15360, 23040))
    # Crop (r, c) is tile row (LATMAX_T − lat_max)·512 + r and column (lon_w − LONW_T)·512 + c.
    l0 = round((30.0 - meta["lat_max_deg"]) * 512)
    c0 = round((meta["lon_west_deg360"] - 45.0) * 512)
    assert (l0, c0) == (736, 3209)
    for r, c in ((0, 0), (5000, 5000), (10240, 10795)):
        assert grid.data[r, c] == round(float(tile[l0 + r, c0 + c]) * 2000.0)
    lo = min(int(grid.data[i : i + 1024].min()) for i in range(0, grid.nrows, 1024))
    hi = max(int(grid.data[i : i + 1024].max()) for i in range(0, grid.nrows, 1024))
    assert label.minimum * 2000 - 1 <= lo and hi <= label.maximum * 2000 + 1  # §5.4.2
    stack = stack_for_site("sldem2015", "blue-ghost-1", *BLUE_GHOST, llsn_data_dir)
    assert stack.label == LABEL_SLDEM2015
    h, valid, index = stack.height_m(unit_vector(*BLUE_GHOST))
    print(f"\nblue-ghost-1: crop min {lo * 0.5} m, max {hi * 0.5} m, site height {h:.1f} m")
    assert valid and index == 0
    # The same point read straight from the tile gives the same height.
    full = read_pds_image(tile_path.with_suffix(".LBL"))
    h_tile, ok = full.height_m(unit_vector(*BLUE_GHOST))
    assert ok and h == pytest.approx(float(h_tile), abs=0.26)  # crop rounds to 0.5 m
    del tile, grid, full, stack


def test_slim_known_height(llsn_data_dir, require_data):
    # §5.4 check 4: interpolated height at the SLIM site against the LROC elevation, ±50 m.
    _local_tile(require_data, "30S_00S_000_045")
    lat, lon, published = SLIM
    _crop_from_local_tiles(llsn_data_dir, "slim", lat, lon)
    stack = stack_for_site("sldem2015", "slim", lat, lon, llsn_data_dir)
    h, valid, _ = stack.height_m(unit_vector(lat, lon))
    print(f"\nslim: site height {h:.1f} m (LROC: {published:.0f} m, difference {h - published:+.1f} m)")
    assert valid and abs(h - published) <= 50.0
    del stack


def test_tile_seams_are_continuous(require_data):
    # §5.4 check 3: mean difference across the seam between neighbouring tiles below 20 m.
    west = np.memmap(
        _local_tile(require_data, "00N_30N_000_045"), dtype="<f4", mode="r", shape=(15360, 23040)
    )
    east = np.memmap(
        _local_tile(require_data, "00N_30N_045_090"), dtype="<f4", mode="r", shape=(15360, 23040)
    )
    south = np.memmap(
        _local_tile(require_data, "30S_00S_000_045"), dtype="<f4", mode="r", shape=(15360, 23040)
    )
    lon_seam = (
        np.abs(np.asarray(east[:, 0], dtype=np.float64) - np.asarray(west[:, -1], dtype=np.float64)) * 1000
    )
    lat_seam = (
        np.abs(np.asarray(south[0, :], dtype=np.float64) - np.asarray(west[-1, :], dtype=np.float64)) * 1000
    )
    print(
        f"\nseams: mean |step| {lon_seam.mean():.2f} m across 45 E, "
        f"{lat_seam.mean():.2f} m across the equator"
    )
    assert lon_seam.mean() < 20.0 and lat_seam.mean() < 20.0
    del west, east, south
