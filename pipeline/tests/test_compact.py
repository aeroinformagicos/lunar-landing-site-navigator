# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""T-34: compact masks ``compact/regions.bin.gz`` and ``compact/overview.bin.gz``.

docs/spec/09_contrato_datos.md §11 and docs/tasks/T-34.md: size ``32 + 368·n``; each compact value
is at least the five full values of its ±1° window (it is their maximum); 10 252 points with the
boxes of the catalog (04 §3). The cubes here are synthetic chunks written with ``cube.encode_chunk``.
"""

import gzip

import numpy as np
import pytest

from pipeline.cli import contract_check
from pipeline.cli.__main__ import main as cli_main
from pipeline.horizon import compact, cube

N_FULL = 720  # 09 §10.2
N_COMPACT = 180  # 09 §11
REGION_POINTS = 10_252  # 09 §11, with the boxes of 04 §3
OVERVIEW_POINTS = 188 * 168  # 31 584 (09 §11)


def size_of(n: int) -> int:
    return 32 + 8 * n + 360 * n  # 09 §11


def random_q(rng, n: int) -> np.ndarray:
    return rng.integers(-9000, 9000, size=(n, N_FULL)).astype(np.int16)


# ---------------------------------------------------------------------------------------------
# Compaction
# ---------------------------------------------------------------------------------------------


def test_compact_value_is_the_maximum_of_its_five_full_values():
    q = random_q(np.random.default_rng(34), 50)
    c = compact.compact_q(q)
    assert c.shape == (50, N_COMPACT) and c.dtype == np.int16
    for b in range(N_COMPACT):
        window = q[:, [(4 * b + m) % N_FULL for m in (-2, -1, 0, 1, 2)]]
        assert (c[:, b][:, None] >= window).all()  # conservative: never below the full mask
        assert (c[:, b] == window.max(axis=1)).all()


def test_compact_window_wraps_around_north():
    q = np.zeros(N_FULL, dtype=np.int16)
    q[718] = 500  # azimuth 359.0°: inside the window of bin 0 (±1° around 0°)
    q[3] = 700  # azimuth 1.5°: outside bin 0, inside bin 1 (around 2°)
    c = compact.compact_q(q)
    assert c[0] == 500 and c[1] == 700 and c[179] == 500  # bin 179 = 358°, window 357°…359°
    assert c[2:179].max() == 0


def test_compact_rejects_a_mask_with_the_wrong_azimuths():
    with pytest.raises(ValueError):
        compact.compact_q(np.zeros((3, 360), dtype=np.int16))


# ---------------------------------------------------------------------------------------------
# Point sets
# ---------------------------------------------------------------------------------------------


def test_region_points_with_the_catalog_boxes():
    pts = compact.region_points()
    assert pts.i.size == REGION_POINTS
    assert (pts.region != 255).all() and set(pts.region.tolist()) == set(range(len(cube.region_boxes())))
    # Each point's centre lies in the box of its region.
    boxes = list(cube.region_boxes().values())
    x, y = cube.cell_centre_xy(pts.i, pts.j)
    for k, (x0, y0, x1, y1) in enumerate(boxes):
        sel = pts.region == k
        assert ((x[sel] >= x0) & (x[sel] <= x1) & (y[sel] >= y0) & (y[sel] <= y1)).all()
    # Mesh order: j, then i.
    key = pts.j * cube.NX + pts.i
    assert (np.diff(key) > 0).all()


def test_overview_points():
    pts = compact.overview_points()
    assert pts.i.size == OVERVIEW_POINTS
    assert set(np.unique(pts.i % 4)) == {0} and set(np.unique(pts.j % 4)) == {0}
    assert pts.i.max() < cube.NX and pts.j.max() < cube.NY
    # Overview points inside a region box carry its index; the rest 255.
    grid = compact.region_index_grid(cube.region_boxes())
    assert (pts.region == grid[pts.j, pts.i]).all() and (pts.region != 255).any()


def test_overlapping_boxes_are_refused():
    box = (-10_000.0, -10_000.0, 10_000.0, 10_000.0)
    with pytest.raises(ValueError):
        compact.region_index_grid({"a": box, "b": box})


# ---------------------------------------------------------------------------------------------
# Building and writing from a synthetic cube
# ---------------------------------------------------------------------------------------------

# A small box over chunk (20, 23) and its right neighbour (20, 24): cells i = 380…387, j = 322…323.
SMALL_BOXES = {"one": (-10_000.0, 22_000.0, -6_000.0, 23_000.0)}


@pytest.fixture
def small_cube(tmp_path):
    rng = np.random.default_rng(7)
    cube_dir = tmp_path / "heavy" / "cube"
    done = np.zeros((cube.N_CHUNK_ROWS, cube.N_CHUNK_COLS), dtype=np.uint8)
    full = {}
    pts = compact.region_points(SMALL_BOXES)
    for row, col in sorted(set(zip(*cube.chunk_of_cell(pts.i, pts.j)[:2], strict=True))):
        q = random_q(rng, cube.POINTS_PER_CHUNK)
        height = rng.integers(-5000, 5000, size=cube.POINTS_PER_CHUNK)
        cube.write_chunk(
            cube_dir, int(row), int(col),
            cube.encode_chunk(int(row), int(col), "full", height, q * 0.01, np.full((256, N_FULL), 1000.0)),
        )
        done[row, col] = 1
        full[(int(row), int(col))] = (q, height)
    cube.write_index(cube_dir, done, "full", ["synthetic"])
    return tmp_path, cube_dir, pts, full


def test_build_from_cube_follows_09_11(small_cube):
    tmp_path, cube_dir, pts, full = small_cube
    assert len(full) == 2  # the box crosses a chunk border
    path, r = compact.run_compact(cube_dir, tmp_path / "heavy" / "compact", "regions", SMALL_BOXES)
    data = gzip.decompress(path.read_bytes())
    n = pts.i.size
    assert r.n_points == n and r.n_missing == 0 and r.law == "full"
    assert len(data) == size_of(n) == 32 + 368 * n
    magic, major, minor, n_hdr, n_az, step, el_scale, law_id = compact.HEADER.unpack_from(data)
    assert (magic, major, n_hdr, n_az, step, law_id) == (b"LLSNCMP1", 1, n, 180, 200, 1)
    assert el_scale == pytest.approx(0.01) and data[26:32] == bytes(6)
    i = np.frombuffer(data, "<u2", n, 32)
    j = np.frombuffer(data, "<u2", n, 32 + 2 * n)
    h = np.frombuffer(data, "<i2", n, 32 + 4 * n)
    reg = np.frombuffer(data, np.uint8, n, 32 + 6 * n)
    assert data[32 + 7 * n : 32 + 8 * n] == bytes(n)
    el = np.frombuffer(data, "<i2", n * N_COMPACT, 32 + 8 * n).reshape(n, N_COMPACT)
    assert (i == pts.i).all() and (j == pts.j).all() and (reg == 0).all()
    rows, cols, p = cube.chunk_of_cell(i, j)
    for k in range(n):
        q, height = full[(int(rows[k]), int(cols[k]))]
        assert h[k] == height[p[k]]
        for b in range(N_COMPACT):
            window = [q[p[k], (4 * b + m) % N_FULL] for m in (-2, -1, 0, 1, 2)]
            assert el[k, b] >= max(window) and el[k, b] == max(window)


def test_written_file_passes_the_contract_check(small_cube):
    tmp_path, cube_dir, _, _ = small_cube
    out = tmp_path / "heavy" / "compact"
    compact.run_compact(cube_dir, out, "regions", SMALL_BOXES)
    checker = contract_check.Checker(tmp_path / "heavy")
    checker.check_compact("compact/regions.bin.gz")
    assert not checker.errors


def test_regions_must_be_complete_but_overview_not(small_cube):
    tmp_path, cube_dir, pts, _ = small_cube
    done = cube.read_done(cube_dir)
    done[20, 24] = 0  # one of the two chunks is "not computed"
    cube.write_index(cube_dir, done, "full", ["synthetic"])
    with pytest.raises(compact.MissingPoints, match="c_20_24"):
        compact.run_compact(cube_dir, tmp_path / "c", "regions", SMALL_BOXES)
    # Not required: the missing points are left out and n_points says so.
    r = compact.build_compact(pts, compact.cube_reader(cube_dir), require_all=False)
    assert 0 < r.n_points < pts.i.size and r.n_points + r.n_missing == pts.i.size
    assert len(r.data) == size_of(r.n_points)


def test_mixed_laws_are_refused(small_cube):
    _, cube_dir, pts, full = small_cube
    (row, col), (q, height) = next(iter(full.items()))
    cube.write_chunk(
        cube_dir, row, col,
        cube.encode_chunk(row, col, "fast", height, q * 0.01, np.full((256, N_FULL), 1000.0)),
    )
    with pytest.raises(ValueError, match="mixes laws"):
        compact.build_compact(pts, compact.cube_reader(cube_dir))


def test_compact_is_deterministic(small_cube):
    tmp_path, cube_dir, _, _ = small_cube
    a, _ = compact.run_compact(cube_dir, tmp_path / "a", "regions", SMALL_BOXES)
    b, _ = compact.run_compact(cube_dir, tmp_path / "b", "regions", SMALL_BOXES)
    assert a.read_bytes() == b.read_bytes()


def test_cli_without_cube_fails_cleanly(tmp_path, capsys):
    assert cli_main(["--out-dir", str(tmp_path), "compact"]) == 1
    assert "make cube" in capsys.readouterr().out


def test_unknown_source_is_refused(tmp_path):
    with pytest.raises(ValueError):
        compact.run_compact(tmp_path, tmp_path, "everything")
