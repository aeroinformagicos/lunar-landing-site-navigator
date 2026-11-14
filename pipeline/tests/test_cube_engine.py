# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""T-24 fast tests: cube engine (PyTorch) against the reference engine, chunk encoding, resuming.

docs/spec/08_mapa_polar.md §3.5 (all rows but the one with real data), §1.2, §2 and §11, and
docs/spec/09_contrato_datos.md §10. Expected values come from those sections or from the
reference engine of T-08, never from the code under test. The tests that need PyTorch are
skipped where it is not installed (it is not in ``requirements.txt``).
"""

import gzip
import json
import math
import struct

import numpy as np
import pytest

from pipeline.common.geo import enu_basis, unit_vector
from pipeline.dem.grids import PolarSouthGrid
from pipeline.dem.stack import DemStack, polar_xy_m
from pipeline.horizon import cube
from pipeline.horizon.engine_ref import ray_samples
from pipeline.horizon.law import law_distances

R = 1_737_400.0  # reference sphere, metres
EL_TOL_DEG = 0.002  # cube engine against the reference engine (08 §3.3, §3.5)
SMOOTH_EL_DEG = -0.0869  # smooth Moon seen from 2 m (06 §9, 08 §3.5)
SMOOTH_DIST_M = 2636.0  # distance to the tangent point from 2 m (06 §9)
CHUNK_BYTES = 553_504  # 09 §10.2

# 08 §1.1: centre of each candidate region in map coordinates (km, rounded to 10 m).
REGION_XY_KM = {
    "de-gerlache-rim-2": (-49.31, 23.41),
    "haworth": (-37.61, 89.48),
    "malapert-massif": (-0.42, 121.34),
    "mons-mouton": (73.33, 118.74),
    "mons-mouton-plateau": (88.06, 148.90),
    "nobile-rim-1": (84.57, 111.02),
    "nobile-rim-2": (155.77, 94.34),
    "peak-near-cabeus-b": (-181.00, 70.57),
    "slater-plain": (69.14, -49.31),
}


# ---------------------------------------------------------------------------------------------
# Synthetic terrain on two polar grids in memory
# ---------------------------------------------------------------------------------------------


def _peaks():
    rng = np.random.default_rng(24)
    peaks = [
        (xc, yc, amp, sigma)
        for xc, yc, amp, sigma in zip(
            rng.uniform(-60e3, 60e3, 12),
            rng.uniform(-60e3, 60e3, 12),
            rng.uniform(-2000.0, 4000.0, 12),
            rng.uniform(500.0, 15e3, 12),
            strict=True,
        )
    ]
    # Steep relief next to the test points, so that the nearest samples fix some horizons.
    peaks += [
        (2000.0, 1000.0, 1500.0, 600.0),
        (-5000.0, -4000.0, -1200.0, 800.0),
        (9000.0, 9500.0, 2500.0, 1500.0),
    ]
    return peaks


def terrain_m(x, y):
    h = 300.0 * np.sin(x / 7000.0) * np.cos(y / 9000.0)
    for xc, yc, amp, sigma in _peaks():
        h = h + amp * np.exp(-((x - xc) ** 2 + (y - yc) ** 2) / (2.0 * sigma**2))
    return h


def polar_grid(name: str, n: int, scale_m: float, height_fn) -> PolarSouthGrid:
    """South polar raster in memory, int16 in units of 0.5 m, like the LOLA products (03 §4.1)."""
    c = (np.arange(n, dtype=np.float32) - n / 2 + 0.5) * scale_m
    h = height_fn(c[None, :], -c[:, None])  # x grows with the column, y decreases with the row
    data = np.rint(np.broadcast_to(h, (n, n)) / 0.5).astype(np.int16)
    return PolarSouthGrid(name, n, scale_m, data=data, to_m=0.5)


def latlon_of_xy(x, y):
    """Latitude and longitude of a map point (03 §3.1), independent of the code under test."""
    rho = math.hypot(x, y)
    return -90.0 + math.degrees(2.0 * math.atan(rho / (2.0 * R))), math.degrees(math.atan2(x, y))


# 16 points (map metres): flat and steep places, the edge of the 40 m grid and one outside it.
POINTS_XY = [
    (300.0, -200.0), (2600.0, 1000.0), (2000.0, 1700.0), (1500.0, 600.0),
    (-5000.0, -3200.0), (-4300.0, -4000.0), (9000.0, 8000.0), (10500.0, 9500.0),
    (-12000.0, 7000.0), (15000.0, -15000.0), (19900.0, 100.0), (-19950.0, -19950.0),
    (0.0, 19970.0), (-7000.0, 12000.0), (4000.0, -17000.0), (25000.0, -3000.0),
]  # fmt: skip
REF_AZ_INDEX = np.arange(0, 720, 10)  # azimuths compared with the reference engine


@pytest.fixture(scope="module")
def engine():
    """The cube engine module, on the CPU. Skips the test if PyTorch is not installed."""
    pytest.importorskip("torch", reason="PyTorch not installed: pip install torch==2.15.0 or make setup-gpu")
    from pipeline.horizon import engine_torch

    return engine_torch


@pytest.fixture(scope="module")
def terrain_stack():
    """Same terrain sampled at 40 m (±20 km) and at 120 m (±132 km): the rays change grid and end."""
    return DemStack(
        [polar_grid("T40", 1000, 40.0, terrain_m), polar_grid("T120", 2200, 120.0, terrain_m)], "test"
    )


@pytest.fixture(scope="module")
def flat_stack():
    """Height 0 everywhere: 40 m (±12 km) and 120 m (±36 km)."""
    zero = lambda x, y: np.zeros((), dtype=np.float32)  # noqa: E731
    return DemStack([polar_grid("Z40", 600, 40.0, zero), polar_grid("Z120", 600, 120.0, zero)], "test")


def _frames(points_xy):
    latlon = [latlon_of_xy(x, y) for x, y in points_xy]
    u0 = np.array([unit_vector(lat, lon) for lat, lon in latlon])
    basis = [enu_basis(lat, lon) for lat, lon in latlon]
    return latlon, u0, np.array([b[0] for b in basis]), np.array([b[1] for b in basis])


def _reference(stack, latlon, law):
    """Reference horizon on the azimuths of REF_AZ_INDEX: elevation, sample i* and all elevations."""
    el_deg, i_star, el_all = [], [], []
    for lat, lon in latlon:
        rs = ray_samples(lat, lon, stack, 0.5 * REF_AZ_INDEX, observer_height_m=2.0, law=law)
        el = np.where(rs.valid, np.degrees(rs.el_rad), -np.inf)
        i = np.argmax(el, axis=1)  # first maximum: the nearest sample on a tie
        el_deg.append(el[np.arange(len(i)), i])
        i_star.append(i)
        el_all.append(el)
    return np.array(el_deg), np.array(i_star), el_all


@pytest.mark.parametrize(("law", "n_points"), [("full", 16), ("fast", 6)])
def test_engine_matches_reference_on_synthetic_terrain(engine, terrain_stack, law, n_points):
    points = POINTS_XY[:n_points] if law == "full" else POINTS_XY[::3][:n_points]
    latlon, u0, east, north = _frames(points)
    tstack = engine.TorchStack.from_dem_stack(terrain_stack, "cpu")
    got = engine.horizon_points(tstack, u0, east, north, law, 2.0)
    ref_el, ref_i, ref_all = _reference(terrain_stack, latlon, law)

    assert got.valid.all()
    assert got.n_samples == len(points) * 720 * len(law_distances(law))
    el = got.el_deg[:, REF_AZ_INDEX]
    assert np.isfinite(ref_el).all() and np.isfinite(el).all()
    assert np.abs(el - ref_el).max() < EL_TOL_DEG

    # Same sample, except where two samples tie within the tolerance.
    i_got = got.sample_index[:, REF_AZ_INDEX]
    differ = i_got != ref_i
    for p, a in zip(*np.nonzero(differ), strict=True):
        assert ref_el[p, a] - ref_all[p][a, i_got[p, a]] < EL_TOL_DEG
    assert differ.mean() < 0.05
    same = ~differ
    assert np.array_equal(got.dist_m[:, REF_AZ_INDEX][same], law_distances(law)[ref_i][same])
    # The terrain is not trivial: horizons from below zero to tens of degrees, near and far.
    assert ref_el.min() < 0.0 and ref_el.max() > 20.0
    assert ref_i.min() == 0 and ref_i.max() > 1000


def test_site_height_is_the_bilinear_height_of_the_reference(engine, terrain_stack):
    latlon, u0, east, north = _frames(POINTS_XY)
    tstack = engine.TorchStack.from_dem_stack(terrain_stack, "cpu")
    got = engine.horizon_points(tstack, u0[:0], east[:0], north[:0], "fast")
    assert got.el_deg.shape == (0, 720)
    x = np.array([p[0] for p in POINTS_XY])
    y = np.array([p[1] for p in POINTS_XY])
    h, valid = tstack.site_heights(x, y)
    h_ref, valid_ref, _ = terrain_stack.height_m(u0)
    assert valid.all() and valid_ref.all()
    assert np.abs(h - h_ref).max() < 1e-6


def test_smooth_sphere_chunk(engine, flat_stack):
    tstack = engine.TorchStack.from_dem_stack(flat_stack, "cpu")
    points = [0, 15, 17, 34, 51, 68, 85, 102, 119, 136, 153, 170, 187, 204, 240, 255]
    res = engine.compute_chunk(tstack, 23, 25, "full", points=points)
    assert res.computed.sum() == 16 and res.computed[points].all()
    assert np.array_equal(res.height_m[points], np.zeros(16))
    assert np.abs(res.el_deg[points] - SMOOTH_EL_DEG).max() < 0.0005
    assert np.abs(res.dist_m[points] - SMOOTH_DIST_M).max() <= 2 * 20.0  # two sampling steps (06 §10.1)
    assert np.isnan(res.el_deg[~res.computed]).all()

    data = cube.encode_chunk(23, 25, "full", res.height_m, res.el_deg, res.dist_m, res.computed)
    chunk = cube.decode_chunk(data)
    assert np.all(chunk.el_q[points] == -9)
    assert np.array_equal(chunk.computed, res.computed)
    assert np.all(chunk.height_m[points] == 0) and np.all(chunk.height_m[~res.computed] == -32768)


def test_ray_without_valid_samples_takes_the_smooth_moon(engine):
    # One 40 m cell around the pole: with the law `fast` the first sample (40 m) is already outside.
    tiny = DemStack(
        [PolarSouthGrid("tiny", 2, 40.0, data=np.zeros((2, 2), dtype=np.int16), to_m=0.5)], "test"
    )
    tstack = engine.TorchStack.from_dem_stack(tiny, "cpu")
    east, north, up = enu_basis(-90.0, 0.0)
    got = engine.horizon_points(tstack, up[None, :], east[None, :], north[None, :], "fast", 2.0)
    assert got.valid.all() and got.height_m[0] == 0.0
    assert np.all(got.sample_index == -1)
    assert np.abs(got.el_deg - SMOOTH_EL_DEG).max() < 0.00005
    assert np.abs(got.dist_m - SMOOTH_DIST_M).max() < 1.0


def test_point_outside_the_relief_is_not_computed(engine, flat_stack):
    tstack = engine.TorchStack.from_dem_stack(flat_stack, "cpu")
    res = engine.compute_chunk(tstack, 41, 0, "fast", points=[0, 100, 255])  # the corner, 200 km away
    assert not res.computed.any() and res.n_samples == 0
    chunk = cube.decode_chunk(
        cube.encode_chunk(41, 0, "fast", res.height_m, res.el_deg, res.dist_m, res.computed)
    )
    assert chunk.n_computed == 0 and np.all(chunk.height_m == -32768)
    assert not chunk.el_q.any() and not chunk.dist_code.any()


def test_stack_rejects_grids_the_engine_cannot_use(engine):
    floats = DemStack([PolarSouthGrid("f", 4, 40.0, data=np.zeros((4, 4), dtype=np.float32))], "test")
    with pytest.raises(ValueError):
        engine.TorchStack.from_dem_stack(floats, "cpu")
    with pytest.raises(ValueError):
        engine.pick_device("gpu0")


def test_cuda_matches_cpu(engine, terrain_stack):
    import torch

    if not torch.cuda.is_available():
        pytest.skip("no CUDA device")
    _, u0, east, north = _frames(POINTS_XY[:4])
    cpu = engine.horizon_points(
        engine.TorchStack.from_dem_stack(terrain_stack, "cpu"), u0, east, north, "fast"
    )
    gpu = engine.horizon_points(
        engine.TorchStack.from_dem_stack(terrain_stack, "cuda"), u0, east, north, "fast"
    )
    assert np.abs(cpu.el_deg - gpu.el_deg).max() < EL_TOL_DEG
    assert np.array_equal(cpu.height_m, gpu.height_m)
    assert (cpu.sample_index == gpu.sample_index).mean() > 0.99


# ---------------------------------------------------------------------------------------------
# Resuming and index files
# ---------------------------------------------------------------------------------------------


def test_resume_computes_nothing_and_files_are_identical(engine, flat_stack, tmp_path, monkeypatch):
    tstack = engine.TorchStack.from_dem_stack(flat_stack, "cpu")
    chunks = [(23, 25), (22, 24)]
    cube_dir = tmp_path / "cube"
    first = cube.run_chunks(tstack, chunks, "fast", cube_dir, points=[0, 37, 255])
    assert first.computed == chunks and first.skipped == []
    names = sorted(p.name for p in cube_dir.iterdir())
    assert names == ["c_22_24.bin.gz", "c_23_25.bin.gz", "cube.json", "done.bin"]  # no .tmp left
    before = {name: (cube_dir / name).read_bytes() for name in names}

    calls = []
    real = engine.compute_chunk
    monkeypatch.setattr(engine, "compute_chunk", lambda *a, **k: calls.append(a) or real(*a, **k))
    second = cube.run_chunks(tstack, chunks, "fast", cube_dir, points=[0, 37, 255])
    assert calls == [] and second.computed == [] and second.skipped == chunks
    assert {name: (cube_dir / name).read_bytes() for name in names} == before

    # Index files (09 §10.1).
    done = np.frombuffer(before["done.bin"], dtype=np.uint8).reshape(42, 47)
    assert done.sum() == 2 and done[23, 25] == 1 and done[22, 24] == 1
    assert json.loads(before["cube.json"]) == {
        "contract_version": "1.1.0",
        "grid": "map/grid.json",
        "law": "fast",
        "observer_height_m": 2,
        "dem_stack": ["Z40", "Z120"],
        "el_scale_deg": 0.01,
        "dist_code": {"base_m": 20, "ratio": 1.04},
        "chunks_done": 2,
        "chunks_total": 1974,
        "done": "cube/done.bin",
    }
    # Each file is one gzip member of 553 504 B with the header of 09 §10.2.
    raw = gzip.decompress(before["c_23_25.bin.gz"])
    assert len(raw) == CHUNK_BYTES
    assert struct.unpack_from("<8s8HfI", raw) == (
        b"LLSNCUB1",
        1,
        0,
        23,
        25,
        16,
        720,
        2,
        200,
        np.float32(0.01),
        3,
    )

    # A damaged chunk is computed again, and only that one; another law is refused.
    (cube_dir / "c_22_24.bin.gz").write_bytes(before["c_22_24.bin.gz"][:-20])
    third = cube.run_chunks(tstack, chunks, "fast", cube_dir, points=[0, 37, 255])
    assert third.computed == [(22, 24)] and third.skipped == [(23, 25)]
    assert (cube_dir / "c_22_24.bin.gz").read_bytes() == before["c_22_24.bin.gz"]
    with pytest.raises(ValueError, match="law"):
        cube.run_chunks(tstack, chunks, "full", cube_dir, points=[0])


def test_bench_structure(engine, flat_stack):
    tstack = engine.TorchStack.from_dem_stack(flat_stack, "cpu")
    bench = cube.run_bench(
        tstack, laws=("fast",), points=[0, 255], chunks=((23, 25), (22, 24)), sweep_rings=(64, 16)
    )
    assert [r["ring"] for r in bench["ring_sweep"]] == [64, 16]
    fast = bench["laws"]["fast"]
    assert fast["points"] == 4 and fast["samples"] == 4 * 720 * 1855
    assert fast["samples_per_s"] > 0 and bench["complete"] is False
    ex = bench["extrapolation"]["fast"]
    total_samples = 505_344 * 720 * 1855  # 08 §4
    assert ex["total_s"] == pytest.approx(total_samples * fast["seconds"] / fast["samples"])
    assert ex["total_s"] == pytest.approx(sum(ex[f"level_{k}_s"] for k in (1, 2, 3, 4)))
    assert any("PARTIAL" in line for line in cube.bench_summary_lines(bench))
    json.dumps(bench)


# ---------------------------------------------------------------------------------------------
# Encoding (09 §10.2), without PyTorch
# ---------------------------------------------------------------------------------------------


def test_encode_decode_chunk():
    rng = np.random.default_rng(5)
    height = rng.uniform(-4000.0, 6000.0, 256)
    el = rng.uniform(-5.0, 40.0, (256, 720))
    dist = np.exp(rng.uniform(math.log(20.0), math.log(300_000.0), (256, 720)))
    computed = np.ones(256, dtype=bool)
    computed[[3, 200]] = False
    data = cube.encode_chunk(7, 31, "full", height, el, dist, computed)

    # Layout of 09 §10.2, read with the offsets of the table.
    assert len(data) == CHUNK_BYTES
    assert data[:8] == b"LLSNCUB1"
    assert struct.unpack_from("<8H", data, 8) == (1, 0, 7, 31, 16, 720, 1, 200)
    assert struct.unpack_from("<f", data, 24)[0] == np.float32(0.01)
    assert struct.unpack_from("<I", data, 28)[0] == 254
    h_file = np.frombuffer(data, dtype="<i2", count=256, offset=32)
    delta = np.frombuffer(data, dtype="<i2", count=256 * 720, offset=544).reshape(256, 720)
    code = np.frombuffer(data, dtype=np.uint8, count=256 * 720, offset=369_184).reshape(256, 720)
    assert np.all(h_file[[3, 200]] == -32768) and not delta[[3, 200]].any() and not code[[3, 200]].any()
    assert np.abs(h_file[computed] - height[computed]).max() <= 0.5

    chunk = cube.decode_chunk(data)
    assert (chunk.row, chunk.col, chunk.law, chunk.observer_height_m, chunk.n_computed) == (
        7,
        31,
        "full",
        2.0,
        254,
    )
    assert np.abs(chunk.el_deg[computed] - el[computed]).max() <= 0.005 + 1e-9
    assert np.abs(chunk.dist_m[computed] / dist[computed] - 1.0).max() <= 0.02
    # The same decoding, written as the web does it: running sum that wraps like an Int16Array.
    acc = 0
    for j in range(720):
        acc = (acc + int(delta[0, j]) + 32768) % 65536 - 32768
        assert acc == chunk.el_q[0, j] == round(el[0, j] / 0.01)

    assert cube.chunk_file_name(7, 31) == "c_07_31.bin.gz"
    assert gzip.decompress(cube.gzip_bytes(data)) == data
    assert cube.gzip_bytes(data) == cube.gzip_bytes(data)
    with pytest.raises(ValueError):
        cube.decode_chunk(data[:-1])
    with pytest.raises(ValueError):
        cube.decode_chunk(b"LLSNCUB2" + data[8:])


def test_el_delta_wraps_and_is_recovered_exactly():
    el = np.array([300.0, -300.0, 300.0, 0.0, 327.67, -327.67, 12.345, 400.0, -400.0])
    q = cube.quantize_el(el)
    assert q.tolist() == [30000, -30000, 30000, 0, 32767, -32767, 1234, 32767, -32767]
    delta = cube.el_delta_of_q(q)
    assert delta.dtype == np.int16
    assert delta[0] == 30000
    assert delta[1] == -60000 + 65536  # the difference of -60 000 overflows int16
    assert np.array_equal(cube.q_of_el_delta(delta), q)


def test_quantisation_values():
    assert cube.quantize_el(SMOOTH_EL_DEG) == -9
    assert cube.dist_code_of_m(300_000.0) == 245  # 09 §10.2: 300 km -> code 245
    assert cube.dist_code_of_m(20.0) == 0 and cube.dist_code_of_m(1.0) == 0
    assert cube.dist_code_of_m(1e9) == 255
    assert cube.dist_m_of_code(0) == 20.0
    assert cube.dist_m_of_code(245) == pytest.approx(20.0 * 1.04**245)


# ---------------------------------------------------------------------------------------------
# Mesh (08 §1.2, §11) and priority plan (08 §2)
# ---------------------------------------------------------------------------------------------


def test_mesh_constants_and_shackleton():
    assert (cube.NX, cube.NY, cube.NX * cube.NY) == (752, 672, 505_344)
    assert (cube.N_CHUNK_COLS, cube.N_CHUNK_ROWS, cube.CHUNKS_TOTAL) == (47, 42, 1974)
    assert cube.CHUNK_BYTES == CHUNK_BYTES
    # Shackleton centre (08 §11): x = 7690 m, y = -6403 m -> cell (415, 380), chunk (23, 25).
    x, y = polar_xy_m(-89.67, 129.78)
    assert abs(x - 7690.0) < 1.0 and abs(y + 6403.0) < 1.0
    i, j = cube.cell_of_xy(x, y)
    assert (int(i), int(j)) == (415, 380)
    row, col, p = cube.chunk_of_cell(i, j)
    assert (int(row), int(col), int(p)) == (23, 25, 16 * 12 + 15)
    # The pole is the common corner of cells (399, 367) and (400, 368).
    assert cube.cell_centre_xy(399, 367) == (-250.0, 250.0)
    assert cube.cell_centre_xy(400, 368) == (250.0, -250.0)
    # Farthest corner: 271.8 km from the pole, latitude -81.05° (08 §1.2 truncates -81.056°).
    assert math.hypot(200_000.0, 184_000.0) == pytest.approx(271_800.0, abs=50.0)
    assert latlon_of_xy(-200_000.0, 184_000.0)[0] == pytest.approx(-81.05, abs=0.01)


def test_frames_follow_the_spec_and_the_site_basis():
    # Check of 08 §1.2 on the prime meridian: north is up on the map and east to the right.
    rho = 50_000.0
    c = 2.0 * math.atan(rho / (2.0 * R))
    f = cube.frames_of_xy(0.0, rho)
    assert np.allclose(f.u0[0], [math.sin(c), 0.0, -math.cos(c)], atol=1e-15)
    assert np.allclose(f.east[0], [0.0, 1.0, 0.0], atol=1e-15)
    assert np.allclose(f.north[0], [math.cos(c), 0.0, math.sin(c)], atol=1e-15)
    assert f.lat_deg[0] == pytest.approx(-90.0 + math.degrees(c)) and f.lon_deg[0] == 0.0

    for row, col in ((23, 25), (0, 0), (41, 46), (4, 36)):
        f = cube.chunk_frames(row, col)
        assert f.u0.shape == (256, 3)
        for p in (0, 15, 100, 255):
            east, north, up = enu_basis(f.lat_deg[p], f.lon_deg[p])
            assert np.allclose(f.u0[p], up, atol=1e-12)
            assert np.allclose(f.east[p], east, atol=1e-12)
            assert np.allclose(f.north[p], north, atol=1e-12)
    # p = 16·r + c: the first point is the top left cell of the chunk.
    i, j = cube.chunk_cells(23, 25)
    assert (i[0], j[0], i[17], j[17], i[255], j[255]) == (400, 368, 401, 369, 415, 383)


def test_mesh_round_trip_for_every_cell():
    jj, ii = np.meshgrid(np.arange(cube.NY), np.arange(cube.NX), indexing="ij")
    x, y = cube.cell_centre_xy(ii.ravel(), jj.ravel())
    f = cube.frames_of_xy(x, y)
    assert f.lat_deg.max() == pytest.approx(-81.05, abs=0.02) and f.lat_deg.min() < -89.98
    assert f.lon_deg.min() > -180.0 and f.lon_deg.max() <= 180.0
    rho = 2.0 * R * np.tan(np.radians(90.0 + f.lat_deg) / 2.0)
    i, j = cube.cell_of_xy(rho * np.sin(np.radians(f.lon_deg)), rho * np.cos(np.radians(f.lon_deg)))
    assert np.array_equal(i, ii.ravel()) and np.array_equal(j, jj.ravel())


def test_region_boxes_match_the_spec_table():
    boxes = cube.region_boxes()
    assert set(boxes) == set(REGION_XY_KM) and len(boxes) == 9
    for region_id, (x_km, y_km) in REGION_XY_KM.items():
        x0, y0, x1, y1 = boxes[region_id]
        assert abs((x0 + x1) / 2.0 - x_km * 1000.0) <= 10.0
        assert abs((y0 + y1) / 2.0 - y_km * 1000.0) <= 10.0
    x0, y0, x1, y1 = boxes["mons-mouton-plateau"]
    assert x1 - x0 == pytest.approx(38_000.0) and y1 - y0 == pytest.approx(38_000.0)
    assert y1 == pytest.approx(167_900.0, abs=10.0)  # 08 §1.1: "llega a y = 167,9"


def test_plan_orders_every_chunk_by_priority(tmp_path):
    plan = cube.build_plan()
    assert len(plan) == 1974 and [e.index for e in plan] == list(range(1974))
    assert len({(e.row, e.col) for e in plan}) == 1974
    level_of = {(e.row, e.col): e.level for e in plan}
    levels = [e.level for e in plan]
    assert levels == sorted(levels)

    def centre_dist(e):
        return math.hypot(-200_000.0 + (e.col + 0.5) * 8000.0, 184_000.0 - (e.row + 0.5) * 8000.0)

    for level in (1, 2, 3, 4):
        d = [centre_dist(e) for e in plan if e.level == level]
        assert d == sorted(d)

    # The four chunks of the cost measurement (08 §4).
    assert cube.BENCH_CHUNKS == ((23, 25), (4, 36), (14, 2), (41, 0))
    assert [level_of[c] for c in cube.BENCH_CHUNKS] == [2, 1, 1, 4]
    # Level 1 holds every chunk that touches a region box (here: its centre and its corners).
    for x_km, y_km in REGION_XY_KM.values():
        i, j = cube.cell_of_xy(x_km * 1000.0, y_km * 1000.0)
        assert level_of[(int(j) // 16, int(i) // 16)] == 1
    for x0, y0, x1, y1 in cube.region_boxes().values():
        for x, y in ((x0, y0), (x0, y1), (x1, y0), (x1, y1)):
            i, j = cube.cell_of_xy(x, y)
            assert level_of[(int(j) // 16, int(i) // 16)] == 1
    # Levels 2 and 3 by latitude of the cell centres; level 4 has none at or below -85°.
    rho88 = 2.0 * R * math.tan(math.radians(2.0) / 2.0)
    rho85 = 2.0 * R * math.tan(math.radians(5.0) / 2.0)
    for e in plan:
        rho_min = np.hypot(*cube.cell_centre_xy(*cube.chunk_cells(e.row, e.col))).min()
        if e.level == 2:
            assert rho_min <= rho88
        elif e.level == 3:
            assert rho88 < rho_min <= rho85
        elif e.level == 4:
            assert rho_min > rho85
    # Sizes of the levels: about 90, 180, 900 and 800 chunks (08 §2).
    counts = {lv["level"]: lv["chunks"] for lv in cube.plan_levels(plan)}
    assert sum(counts.values()) == 1974
    assert 60 <= counts[1] <= 130 and 120 <= counts[2] <= 240
    assert 700 <= counts[3] <= 1100 and 600 <= counts[4] <= 1000

    written = cube.write_plan(tmp_path / "cube" / "plan.json")
    doc = json.loads((tmp_path / "cube" / "plan.json").read_text(encoding="ascii"))
    assert written == plan and doc["chunks_total"] == 1974
    assert doc["chunks"][0] == {"index": 0, "row": plan[0].row, "col": plan[0].col, "level": 1}
    assert [lv["chunks"] for lv in doc["levels"]] == [counts[k] for k in (1, 2, 3, 4)]


# ---------------------------------------------------------------------------------------------
# Command line
# ---------------------------------------------------------------------------------------------


def test_cli_cube_plan_and_bench(engine, flat_stack, tmp_path, monkeypatch, capsys):
    from pipeline.cli.__main__ import main
    from pipeline.dem import stack as dem_stack

    out = tmp_path / "out"
    assert main(["--data-dir", str(tmp_path), "--out-dir", str(out), "cube-plan"]) == 0
    assert json.loads((out / "cube" / "plan.json").read_text(encoding="ascii"))["chunks_total"] == 1974
    # The cube run (T-25) without the DEMs says so and fails.
    assert main(["--data-dir", str(tmp_path), "--out-dir", str(out), "cube"]) == 1
    assert "cannot compute the cube" in capsys.readouterr().out
    # Without the DEMs the measurement says so and fails.
    assert main(["--data-dir", str(tmp_path), "--out-dir", str(out), "cube", "--bench"]) == 1
    assert "cannot measure" in capsys.readouterr().out

    monkeypatch.setattr(dem_stack, "lola_polar_stack", lambda data_dir, in_memory=False: flat_stack)
    args = ["--data-dir", str(tmp_path), "--out-dir", str(out), "cube", "--bench"]
    assert main([*args, "--points", "2", "--law", "fast", "--device", "cpu", "--ring", "64"]) == 0
    text = capsys.readouterr().out
    assert "extrapolation fast" in text and "PARTIAL RUN" in text
    # A partial run is kept apart: bench.json is only the complete measurement.
    assert not (out / "cube" / "bench.json").exists()
    bench = json.loads((out / "cube" / "bench_partial.json").read_text(encoding="utf-8"))
    assert bench["device"] == "cpu" and bench["ring"] == 64 and bench["complete"] is False
    assert bench["laws"]["fast"]["points"] == 2  # only the chunk of Shackleton is inside this relief
    assert bench["generated_utc"].endswith("Z") and bench["load_s"] >= 0.0
