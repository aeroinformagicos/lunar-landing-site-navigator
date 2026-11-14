# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""T-28 fast tests: visibility layers of the map (08_mapa_polar.md §5, §9; 09_contrato_datos.md §8.1, §9).

The table of 08 §5.3 (all rows; B6 with synthetic masks against the Python reference of 07, the
real-cube version of B6 is T-36), the encoding of 09 §9.2, the resumable run over a cube folder and
plan B-4 (``source = nasa_avgvisib``). Expected values come from the specification or from the
visibility reference (``pipeline.vis``), never from the layer code. NumPy back end; the PyTorch one
is compared with it where PyTorch is installed.
"""

import gzip
import json
import math

import numpy as np
import pytest

from pipeline.cli.contract_check import check_dir
from pipeline.common.timeutil import iso_to_unix
from pipeline.ephem.interp import sky_at
from pipeline.horizon import cube
from pipeline.layers import compare_nasa
from pipeline.layers import layers as lay
from pipeline.vis.discs import disc_any
from pipeline.vis.sky import frame_for, horizon_at, make_mask

MEAN_STEPS = 163_152  # 08 §5.1 (D-22)
MONTH_STEPS = 43_824  # 08 §5.3
FEB_2028_STEPS = 696  # 08 §5.3
SMOOTH_EL_DEG = -0.0869  # smooth Moon from 2 m (06 §9)
POLE_CELLS = ((399, 367), (400, 367), (399, 368), (400, 368))  # around the pole (08 §1.2)
NY, NX = 672, 752  # 09 §8.1
LAYER_BYTES = 1_516_032  # 09 §9.2
LAYER_ANY_BYTES = 1_010_688


def cell_points(cells, heights, el_deg):
    i = np.array([c[0] for c in cells])
    j = np.array([c[1] for c in cells])
    return lay.points_of(cube.frames_of_xy(*cube.cell_centre_xy(i, j)), heights, el_deg)


def flat_masks(values):
    return np.repeat(np.asarray(values, dtype=np.float64)[:, None], 720, axis=1)


def formula_mask(a, b, k, phase=0.0):
    """Horizon a + b·sin(k·az + phase) every 0.5°, rounded to the 0.01° of the cube."""
    az = np.radians(np.arange(720) * 0.5)
    return np.round((a + b * np.sin(k * az + phase)) / 0.01) * 0.01


@pytest.fixture(scope="module")
def steps(real_table):
    return lay.table_steps(real_table)


# ---------------------------------------------------------------------------------------------
# Periods (08 §5.1, §5.3; 09 §9.1)
# ---------------------------------------------------------------------------------------------


def test_months_add_up():
    ps = lay.periods()
    assert len(ps) == 61 and ps[0].id == "mean186" and [p.id for p in ps[1:3]] == ["2026-01", "2026-02"]
    assert ps[0].n_steps == MEAN_STEPS and ps[0].end_utc == "2044-08-12T00:00:00Z"
    months = ps[1:]
    assert months[-1].id == "2030-12" and months[-1].end_utc == "2031-01-01T00:00:00Z"
    assert sum(p.n_steps for p in months) == MONTH_STEPS
    assert next(p for p in months if p.id == "2028-02").n_steps == FEB_2028_STEPS
    assert next(p for p in months if p.id == "2026-01").label == "Jan 2026"
    for p in months:  # n_steps = hours between start and end
        assert p.n_steps * 3600 == iso_to_unix(p.end_utc) - iso_to_unix(p.start_utc)
    month = lay.month_of_step()
    assert month.size == MEAN_STEPS and (month[:MONTH_STEPS] >= 0).all() and (month[MONTH_STEPS:] == -1).all()
    assert np.bincount(month[:MONTH_STEPS]).tolist() == [p.n_steps for p in months]


def test_table_steps_are_the_hourly_nodes_from_2026(example_table):
    from pipeline.ephem.interp import body_vectors_at

    s = lay.table_steps(example_table)
    assert s.n == MEAN_STEPS and int(s.any_step.sum()) == MEAN_STEPS // 3  # one in three (08 §5.2)
    assert s.any_step[0] and not s.any_step[1] and s.any_step[3]
    t0 = iso_to_unix("2026-01-01T00:00:00Z")
    for k in (0, 1, 744, MEAN_STEPS - 1):  # a node of the table: the interpolation gives the sample
        sun, earth = body_vectors_at(example_table, t0 + 3600 * k)
        np.testing.assert_allclose(s.sun[k], sun, rtol=1e-12)
        np.testing.assert_allclose(s.earth[k], earth, rtol=1e-12)
    by_col = sorted(lay.periods(), key=lambda p: p.col)
    np.testing.assert_array_equal(lay.period_steps(s), [p.n_steps for p in by_col])
    with pytest.raises(ValueError):
        lay.table_steps(example_table, MEAN_STEPS + 1)


def test_units_round_half_up_in_integers():
    # v = round(pct / 0.4), pct = 100·count/n (09 §9.2); a value exactly halfway rounds up (D-98).
    n = 744
    assert lay.units_of_counts([0, n, n // 2], n).tolist() == [0, 250, 125]
    assert lay.units_of_counts([1], 500).tolist() == [1]  # 0.2 % = 0.5 units -> 1
    assert lay.units_of_counts([3], 500).tolist() == [2]  # 0.6 % = 1.5 units -> 2
    counts = np.arange(n + 1)
    expected = np.floor(100.0 * counts / n / 0.4 + 0.5 + 1e-9).astype(int)
    np.testing.assert_array_equal(lay.units_of_counts(counts, n), expected)


# ---------------------------------------------------------------------------------------------
# 08 §5.3
# ---------------------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def flat_units(steps):
    """Masks of −90° and +90° at two cells, and the smooth Moon at the four cells around the pole."""
    cells = [(100, 200), (600, 500), *POLE_CELLS]
    el = flat_masks([-90.0, 90.0] + [SMOOTH_EL_DEG] * 4)
    return lay.layer_units(lay.count_visibility(cell_points(cells, np.zeros(6), el), steps), steps)


def test_mask_of_minus_90_sees_everything(flat_units):
    v, v_any = flat_units
    assert (v[:, :, 0] == 250).all()  # 100 % in the three bands of the 61 periods
    assert (v_any[:, 0] == 250).all()


def test_mask_of_plus_90_sees_nothing(flat_units):
    v, v_any = flat_units
    assert (v[:, :, 1] == 0).all() and (v_any[:, 1] == 0).all()


def test_smooth_moon_next_to_the_pole(flat_units):
    v, _ = flat_units
    pct = v[lay.MEAN_COL, :, 2:] * 0.4  # [band, point]
    sun, earth, both = pct
    assert ((sun >= 45) & (sun <= 60)).all(), sun
    assert ((earth >= 40) & (earth <= 60)).all(), earth
    assert (both <= np.minimum(sun, earth)).all()


def test_coherence_of_the_three_bands(steps):
    rng = np.random.default_rng(28)
    cells = list(zip(rng.integers(0, NX, 8).tolist(), rng.integers(0, NY, 8).tolist(), strict=True))
    el = np.stack([formula_mask(rng.uniform(-0.5, 2), rng.uniform(0, 3), int(rng.integers(1, 5)),
                                rng.uniform(0, 6)) for _ in cells])
    pts = cell_points(cells, rng.uniform(-3000, 2000, 8), el)
    v, _ = lay.layer_units(lay.count_visibility(pts, steps), steps)
    sun, earth, both = (v[:, b, :].astype(int) for b in range(3))  # units of 0.4 %, every period
    assert (both <= np.minimum(sun, earth)).all()
    assert (both >= sun + earth - 250 - 1).all()  # both ≥ sun + earth − 100 (± 0.4)
    assert (sun.max() > 0) and (earth.max() > 0) and (sun.min() < 250)  # not a degenerate case


def test_layer_equals_the_site_reference_step_by_step(real_table):
    """B6 with synthetic masks: same counts as the Python reference of 07 at each hourly step."""
    n = 744 + 672 + 744  # January to March 2026
    s = lay.table_steps(real_table, n)
    cells = [(415, 380), (300, 250), (650, 420)]  # Shackleton (08 §11), and two more
    heights = np.array([-4100.0, 850.0, -1500.0])
    el = np.stack([formula_mask(0.6, 1.2, 3), formula_mask(1.5, 2.5, 2, 1.0),
                   formula_mask(-0.2, 0.4, 5, 2.0)])
    counts = lay.count_visibility(cell_points(cells, heights, el), s)
    i, j = np.array([c[0] for c in cells]), np.array([c[1] for c in cells])
    frames = cube.frames_of_xy(*cube.cell_centre_xy(i, j))
    t0 = iso_to_unix("2026-01-01T00:00:00Z")
    nan = np.full(720, np.nan)
    for p in range(len(cells)):
        mask = make_mask(2.0, heights[p], el[p], np.zeros(720), nan, nan, nan)
        frame = frame_for(frames.lat_deg[p], frames.lon_deg[p], mask)
        ref = np.zeros((3, 3), dtype=int)  # band x month (Jan, Feb, Mar)
        ref_any = [0, 0]

        def hor(az, el_mask=mask.el):
            return horizon_at(el_mask, az)

        for k in range(n):
            sky = sky_at(real_table, frame, t0 + 3600 * k)
            vis = [sky[b]["el_deg"] > horizon_at(mask.el, sky[b]["az_deg"]) for b in ("sun", "earth")]
            month = 0 if k < 744 else (1 if k < 744 + 672 else 2)
            ref[:, month] += [vis[0], vis[1], vis[0] and vis[1]]
            if k % 3 == 0:
                for b, body in enumerate(("sun", "earth")):
                    ref_any[b] += disc_any(hor, sky[body]["az_deg"],
                                           sky[body]["el_deg"], sky[body]["radius_deg"])
        np.testing.assert_array_equal(counts.centre[:, p, 0:3], ref)
        assert counts.centre[:, p, lay.MEAN_COL].tolist() == ref.sum(axis=1).tolist()
        assert counts.any[:, p].tolist() == ref_any
        assert ref.min() > 0 or p == 1  # the masks leave some visibility to count
    assert counts.n_any == n // 3 + (n % 3 > 0)


def test_torch_back_end_matches_numpy(real_table):
    pytest.importorskip("torch", reason="PyTorch not installed")
    s = lay.table_steps(real_table, 2000)
    rng = np.random.default_rng(5)
    cells = list(zip(rng.integers(0, NX, 64).tolist(), rng.integers(0, NY, 64).tolist(), strict=True))
    el = np.stack([formula_mask(rng.uniform(-0.5, 2), rng.uniform(0, 3), int(rng.integers(1, 5)))
                   for _ in cells])
    pts = cell_points(cells, rng.uniform(-3000, 2000, 64), el)
    ref = lay.count_visibility(pts, s)
    got = lay.count_visibility(pts, s, lay.TorchBackend("cpu"), block_steps=300)
    # float32 against float64: a step may flip only where the margin is below ~1e-5°.
    assert np.abs(got.centre - ref.centre).max() <= 2 and np.abs(got.any - ref.any).max() <= 2
    assert (got.centre != ref.centre).mean() < 0.01


def test_block_size_does_not_change_the_counts(real_table):
    s = lay.table_steps(real_table, 1500)
    pts = cell_points([(415, 380), (10, 10)], [0.0, 0.0], np.stack([formula_mask(0.5, 1, 3)] * 2))
    a = lay.count_visibility(pts, s, block_steps=512)
    b = lay.count_visibility(pts, s, block_steps=7)
    np.testing.assert_array_equal(a.centre, b.centre)
    np.testing.assert_array_equal(a.any, b.any)


# ---------------------------------------------------------------------------------------------
# The run over a cube folder (resumable, 08 §5.2) and the files (09 §9)
# ---------------------------------------------------------------------------------------------

CHUNKS = ((23, 25), (22, 24))  # level 1 of the plan, near Shackleton (08 §2)
KEEP = (0, 17, 255)  # computed points of each test chunk
ORDER = [(e.row, e.col) for e in cube.build_plan() if (e.row, e.col) in CHUNKS]  # plan order (08 §2)


def write_test_chunk(cube_dir, row, col, a=0.5):
    el = np.zeros((256, 720))
    computed = np.zeros(256, dtype=bool)
    for k, p in enumerate(KEEP):
        computed[p] = True
        el[p] = formula_mask(a + 0.3 * k, 1.0, 2 + k)
    height, dist = np.full(256, -2000.0), np.full((256, 720), 5000.0)
    data = cube.encode_chunk(row, col, "full", height, el, dist, computed)
    cube.write_chunk(cube_dir, row, col, data)
    return el


def make_cube(root, chunks=CHUNKS):
    cube_dir = cube.cube_dir_of(root)
    for row, col in chunks:
        write_test_chunk(cube_dir, row, col)
    done = np.zeros((42, 47), dtype=np.uint8)
    for row, col in chunks:
        done[row, col] = 1
    cube.write_index(cube_dir, done, "full", ["LDEM_80S_40M", "LDEM_75S_120M"])
    return cube_dir


def run(root, steps, **kw):
    heavy = root / "heavy"
    return lay.run_layers(cube.cube_dir_of(root), heavy, lay.partial_dir_of(root), steps, lay.NumpyBackend(),
                          progress=lambda _l: None, **kw)


def snapshot(heavy):
    return {p.relative_to(heavy).as_posix(): p.read_bytes() for p in sorted(heavy.rglob("*"))
            if p.is_file() and p.parts[-2] in ("layers", "map")}


def test_run_writes_the_contract_files_and_resumes(tmp_path, example_table):
    steps = lay.table_steps(example_table)
    make_cube(tmp_path)
    first = run(tmp_path, steps)
    assert first.computed == ORDER and first.skipped == [] and first.bad == []
    assert first.computed_points == len(CHUNKS) * len(KEEP)
    heavy = tmp_path / "heavy"
    n_files, errors = check_dir(heavy)
    assert errors == [] and n_files > 62
    doc = json.loads((heavy / "layers" / "layers.json").read_text(encoding="utf-8"))
    assert doc["source"] == "computed" and doc["criterion"] == "center" and doc["observer_height_m"] == 2
    assert [p["id"] for p in doc["periods"]][:2] == ["mean186", "2026-01"] and len(doc["periods"]) == 61
    assert doc["coverage"] == {"computed_points": 6, "total_points": 505_344}
    grid = json.loads((heavy / "map" / "grid.json").read_text(encoding="utf-8"))
    assert (grid["nx"], grid["ny"], grid["x_min_m"], grid["y_max_m"]) == (752, 672, -200_000, 184_000)

    # The values of the computed cells are those of the same points counted directly; the rest is 255.
    mean = gzip.decompress((heavy / "layers" / "mean186.bin.gz").read_bytes())
    assert len(mean) == LAYER_BYTES
    mean = np.frombuffer(mean, np.uint8).reshape(3, NY, NX)
    any_ = np.frombuffer(gzip.decompress((heavy / "layers" / "mean186_any.bin.gz").read_bytes()), np.uint8)
    assert any_.size == LAYER_ANY_BYTES
    any_ = any_.reshape(2, NY, NX)
    chunk = cube.read_chunk(cube.cube_dir_of(tmp_path), *CHUNKS[0])
    v, v_any = lay.layer_units(lay.count_visibility(lay.chunk_points(chunk), steps), steps)
    i, j = cube.chunk_cells(*CHUNKS[0])
    np.testing.assert_array_equal(mean[:, j[list(KEEP)], i[list(KEEP)]], v[lay.MEAN_COL])
    np.testing.assert_array_equal(any_[:, j[list(KEEP)], i[list(KEEP)]], v_any)
    assert (mean != 255).sum() == 3 * 6 and (any_ != 255).sum() == 2 * 6

    # Second run: nothing to compute, the same bytes.
    before = snapshot(heavy)
    again = run(tmp_path, steps)
    assert again.computed == [] and again.skipped == ORDER
    assert snapshot(heavy) == before

    # A chunk recomputed in the cube is recomputed here, and only that one.
    write_test_chunk(cube.cube_dir_of(tmp_path), *CHUNKS[1], a=1.5)
    third = run(tmp_path, steps)
    assert third.computed == [CHUNKS[1]] and third.skipped == [CHUNKS[0]]
    assert snapshot(heavy) != before
    assert run(tmp_path, steps, force=True).computed == ORDER


def test_run_with_half_a_cube_and_unreadable_chunks(tmp_path, example_table):
    steps = lay.table_steps(example_table, 744)
    cube_dir = make_cube(tmp_path, CHUNKS[:1])
    done = cube.read_done(cube_dir)
    done[5, 5] = 1  # marked done but its file is missing
    cube.write_index(cube_dir, done, "full", ["LDEM_80S_40M", "LDEM_75S_120M"])
    s = run(tmp_path, steps)
    assert s.computed == [CHUNKS[0]] and s.bad == [(5, 5)] and s.computed_points == 3
    doc = json.loads((tmp_path / "heavy" / "layers" / "layers.json").read_text(encoding="utf-8"))
    assert doc["coverage"]["computed_points"] == 3


def test_partial_file_with_another_key_is_ignored(tmp_path):
    path = tmp_path / "c_01_02.npz"
    v = np.zeros((61, 3, 256), np.uint8)
    va = np.zeros((2, 256), np.uint8)
    lay.write_partial(path, "key-a", v, va, np.ones(256, bool))
    assert lay.read_partial(path, "key-a") is not None
    assert lay.read_partial(path, "key-b") is None
    assert lay.read_partial(tmp_path / "missing.npz", "key-a") is None
    path.write_bytes(b"not a zip")
    assert lay.read_partial(path, "key-a") is None


# ---------------------------------------------------------------------------------------------
# Plan B-4: the NASA layers on the mesh (08 §9)
# ---------------------------------------------------------------------------------------------


def synthetic_products():
    """N1/N2 at 1 km (±155 km) and N3/N4 at 2 km (±500 km) with DN linear in the pixel indices.

    The mean of a 3 × 3 window of a linear function is its value at the centre pixel.
    """
    from pipeline.dem.grids import PolarSouthGrid

    def grid(name, n, s, base, ds, dl):
        l, c = np.mgrid[0:n, 0:n]
        return PolarSouthGrid(name, n, s, data=(base + ds * c + dl * l).astype("<i2"), to_m=0.00004)

    inner = {"sun": grid("n1", 310, 1000.0, 2000, 40, 20), "earth": grid("n2", 310, 1000.0, 20000, -30, -10)}
    outer = {"sun": grid("n3", 500, 2000.0, 1000, 20, 15), "earth": grid("n4", 500, 2000.0, 24000, -20, -20)}
    return compare_nasa.NasaProducts(inner, outer)


def expected_dn(products, body, x, y):
    inner = abs(x) <= 151_500 and abs(y) <= 151_500
    g = (products.inner if inner else products.outer)[body]
    s = math.floor(x / g.S + g.N / 2)  # pixel that contains the point (08 §8.2)
    l = math.floor(g.N / 2 - y / g.S)
    return int(g.data[l, s])


def test_plan_b_writes_valid_nasa_layers(tmp_path):
    products = synthetic_products()
    heavy = tmp_path / "heavy"
    (heavy / "layers").mkdir(parents=True)
    (heavy / "layers" / "2026-01.bin.gz").write_bytes(b"stale")  # from an earlier computed run
    files, n_points = lay.write_nasa_layers(heavy, products)
    assert n_points == 505_344
    assert check_dir(heavy)[1] == []
    assert not (heavy / "layers" / "2026-01.bin.gz").exists()
    doc = json.loads((heavy / "layers" / "layers.json").read_text(encoding="utf-8"))
    assert doc["source"] == "nasa_avgvisib" and [p["id"] for p in doc["periods"]] == ["mean186"]
    assert doc["criterion"] == "any" and doc["observer_height_m"] == 0
    mean = np.frombuffer(gzip.decompress((heavy / "layers" / "mean186.bin.gz").read_bytes()), np.uint8)
    mean = mean.reshape(3, NY, NX)
    assert (mean[2] == 255).all()  # no band «both» (09 §9.1)
    for i, j in ((0, 0), (400, 367), (751, 671), (100, 600)):
        x, y = cube.cell_centre_xy(i, j)
        for b, body in enumerate(("sun", "earth")):
            pct = expected_dn(products, body, float(x), float(y)) * 0.00004 * 100
            assert mean[b, j, i] == math.floor(pct / 0.4 + 0.5)


# ---------------------------------------------------------------------------------------------
# Command line (02_arquitectura.md §4.2)
# ---------------------------------------------------------------------------------------------


def cli(tmp_path, *args):
    from pipeline.cli.__main__ import main

    return main(["--data-dir", str(tmp_path / "data"), "--out-dir", str(tmp_path / "out"), *args])


def test_cli_without_inputs_fails_cleanly(tmp_path, capsys):
    assert cli(tmp_path, "layers", "--device", "numpy") == 1
    assert "done.bin" in capsys.readouterr().out
    assert cli(tmp_path, "layers", "--source", "nasa_avgvisib") == 1
    assert "AVGVISIB" in capsys.readouterr().out
    assert cli(tmp_path, "hillshade") == 1
    assert "LDEM_75S_120M" in capsys.readouterr().out
    assert cli(tmp_path, "compare-nasa") == 1
    assert "make layers" in capsys.readouterr().out
    assert cli(tmp_path, "layers", "--batch-chunks", "0") == 2


def test_cli_layers_on_a_small_cube(tmp_path, capsys):
    from pipeline.tests.conftest import real_table_present

    if not real_table_present():
        pytest.skip("real table not published: make ephem")
    make_cube(tmp_path / "out", CHUNKS[:1])
    assert cli(tmp_path, "layers", "--device", "numpy", "--batch-chunks", "1") == 0
    out = capsys.readouterr().out
    assert "1 chunks computed" in out and "3/505344 points" in out
    assert (tmp_path / "out" / "heavy" / "layers" / "layers.json").is_file()
    assert (tmp_path / "out" / "layers" / "partial" / "c_23_25.npz").is_file()
    assert "layers:" in (tmp_path / "out" / "logs" / "layers.log").read_text(encoding="utf-8")
    assert cli(tmp_path, "layers", "--device", "numpy") == 0
    assert "0 chunks computed, 1 kept" in capsys.readouterr().out
