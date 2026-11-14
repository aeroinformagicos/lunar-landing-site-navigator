# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""T-25 fast tests: running the cube by levels and shards, resuming, the night chain, deploy-heavy.

docs/spec/08_mapa_polar.md §2 (shards: ``index mod n == k``; resumable; atomic writes),
docs/spec/02_arquitectura.md §4.1, §6.2 and §9, and docs/tasks/T-25.md. The tests that compute chunks
need PyTorch and are skipped where it is not installed; the ones that call ``node ops/tasks.mjs`` are
skipped where Node is not on the PATH.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest

from pipeline.dem.grids import PolarSouthGrid
from pipeline.dem.stack import DemStack
from pipeline.horizon import cube

REPO_ROOT = Path(__file__).resolve().parents[2]
CHUNKS_TOTAL = 1974  # 47 x 42 chunks (08 §2)


# ---------------------------------------------------------------------------------------------
# Levels and shards (no PyTorch)
# ---------------------------------------------------------------------------------------------


def test_parse_levels_and_shard():
    assert cube.parse_levels(None) == (1, 2, 3, 4) and cube.parse_levels("") == (1, 2, 3, 4)
    assert cube.parse_levels("1") == (1,)
    assert cube.parse_levels("4,2, 3") == (2, 3, 4)
    for bad in ("0", "5", "1;2", "a", ","):
        with pytest.raises(ValueError):
            cube.parse_levels(bad)
    assert cube.parse_shard(None) == (0, 1) and cube.parse_shard("1/2") == (1, 2)
    for bad in ("2/2", "-1/2", "0/0", "1", "a/b", "1/2/3"):
        with pytest.raises(ValueError):
            cube.parse_shard(bad)


def test_default_law_is_full():
    assert cube.DEFAULT_LAW == "full"  # decision D-59


@pytest.mark.parametrize("levels", [(1, 2, 3, 4), (2, 3, 4), (1,)])
@pytest.mark.parametrize("n", [2, 3])
def test_shards_cover_every_chunk_once(levels, n):
    plan = cube.build_plan()
    wanted = [(e.row, e.col) for e in plan if e.level in levels]
    shards = [[(e.row, e.col) for e in cube.select_plan(plan, levels, (k, n))] for k in range(n)]
    together = [c for s in shards for c in s]
    assert len(together) == len(set(together))  # no chunk in two shards
    assert sorted(together) == sorted(wanted)  # every chunk of those levels in some shard
    # Each shard keeps the priority order of the plan and uses the index of the whole list (08 §2).
    for k in range(n):
        entries = cube.select_plan(plan, levels, (k, n))
        assert [e.index for e in entries] == sorted(e.index for e in entries)
        assert all(e.index % n == k for e in entries)
    if levels == (1, 2, 3, 4):
        assert len(together) == CHUNKS_TOTAL


def test_shard_is_the_same_whatever_the_levels():
    plan = cube.build_plan()
    all_levels = {(e.row, e.col) for e in cube.select_plan(plan, (1, 2, 3, 4), (1, 2))}
    night = {(e.row, e.col) for e in cube.select_plan(plan, (2, 3, 4), (1, 2))}
    assert night <= all_levels


def test_cube_folder_is_in_the_heavy_origin(tmp_path):
    assert cube.cube_dir_of(tmp_path) == tmp_path / "heavy" / "cube"  # 02 §9, 09 §10


# ---------------------------------------------------------------------------------------------
# Resuming (PyTorch, CPU)
# ---------------------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def engine():
    pytest.importorskip("torch", reason="PyTorch not installed: pip install torch==2.15.0 or make setup-gpu")
    from pipeline.horizon import engine_torch

    return engine_torch


def _flat_grid(name: str, n: int, scale_m: float) -> PolarSouthGrid:
    return PolarSouthGrid(name, n, scale_m, data=np.zeros((n, n), dtype=np.int16), to_m=0.5)


@pytest.fixture(scope="module")
def tstack(engine):
    """Flat relief at 40 m (±12 km) and 120 m (±36 km) on the CPU."""
    dem = DemStack([_flat_grid("Z40", 600, 40.0), _flat_grid("Z120", 600, 120.0)], "test")
    return engine.TorchStack.from_dem_stack(dem, "cpu")


# Four chunks next to the pole (inside the relief) and one far away (no relief: not computed).
SMALL_PLAN = [
    cube.PlanEntry(0, 23, 25, 1),
    cube.PlanEntry(1, 22, 24, 1),
    cube.PlanEntry(2, 23, 24, 2),
    cube.PlanEntry(3, 22, 25, 4),
    cube.PlanEntry(4, 0, 0, 4),
]
RUN = dict(law="fast", plan=SMALL_PLAN, points=[0, 255])  # two points per chunk keep the tests fast


def _tree(folder: Path) -> dict[str, bytes]:
    return {p.name: p.read_bytes() for p in sorted(folder.iterdir())}


@pytest.fixture(scope="module")
def reference(tstack, tmp_path_factory):
    """Files of the small plan computed in one uninterrupted run."""
    clean = tmp_path_factory.mktemp("clean")
    full = cube.run_cube(tstack, clean, **RUN)
    assert full.computed == [(e.row, e.col) for e in SMALL_PLAN]
    tree = _tree(clean)
    assert len(tree) == len(SMALL_PLAN) + 2  # the chunks, done.bin and cube.json; no .tmp
    return tree


def test_resume_after_interruption_is_byte_identical(engine, tstack, reference, tmp_path, monkeypatch):
    run = RUN

    # Interrupted run: the third chunk is stopped while it is being computed (Ctrl+C).
    broken = tmp_path / "broken"
    real = engine.compute_chunk
    calls = []

    def stop_at_third(*a, **k):
        calls.append(a[1:3])
        if len(calls) == 3:
            raise KeyboardInterrupt
        return real(*a, **k)

    monkeypatch.setattr(engine, "compute_chunk", stop_at_third)
    with pytest.raises(KeyboardInterrupt):
        cube.run_cube(tstack, broken, **run)
    monkeypatch.setattr(engine, "compute_chunk", real)
    assert sorted(p.name for p in broken.glob("c_*.bin.gz")) == ["c_22_24.bin.gz", "c_23_25.bin.gz"]
    assert cube.read_cube_json(broken)["chunks_done"] == 2  # a cube stopped half way is usable
    # A write cut in the middle leaves a .tmp file; a damaged chunk file must be recomputed.
    (broken / "c_23_24.bin.gz.tmp").write_bytes(b"half written")
    damaged = reference["c_22_25.bin.gz"]
    (broken / "c_22_25.bin.gz").write_bytes(damaged[: len(damaged) // 2])

    resumed = cube.run_cube(tstack, broken, **run)
    assert resumed.skipped == [(23, 25), (22, 24)]
    assert resumed.computed == [(23, 24), (22, 25), (0, 0)]
    assert _tree(broken) == reference  # same names, same bytes; the .tmp is gone

    # A third run computes nothing and changes nothing.
    again = cube.run_cube(tstack, broken, **run)
    assert again.computed == [] and _tree(broken) == reference


def test_levels_then_rest_equals_one_run(engine, tstack, reference, tmp_path):
    """`make cube LEVELS=1` and then `make night` (levels 2 to 4) leave the cube of a single run."""
    run = RUN
    two = tmp_path / "two"
    first = cube.run_cube(tstack, two, levels=(1,), **run)
    assert first.computed == [(23, 25), (22, 24)]
    assert cube.read_cube_json(two)["chunks_done"] == 2
    rest = cube.run_cube(tstack, two, levels=(2, 3, 4), **run)
    assert rest.computed == [(23, 24), (22, 25), (0, 0)] and rest.skipped == []
    assert _tree(two) == reference


def test_shards_on_two_machines_merge_into_one_cube(engine, tstack, reference, tmp_path):
    """ops/cloud/README.md §5: copy the chunks of the other shard, then run every level, no shard."""
    run = RUN
    laptop, cloud = tmp_path / "laptop", tmp_path / "cloud"
    a = cube.run_cube(tstack, laptop, shard=(0, 2), **run)
    b = cube.run_cube(tstack, cloud, shard=(1, 2), **run)
    assert set(a.computed).isdisjoint(b.computed)
    assert len(a.computed) + len(b.computed) == len(SMALL_PLAN)
    for path in cloud.glob("c_*.bin.gz"):
        shutil.copyfile(path, laptop / path.name)
    merge = cube.run_cube(tstack, laptop, **run)
    assert merge.computed == [] and len(merge.skipped) == len(SMALL_PLAN)
    assert _tree(laptop) == reference


def test_cli_cube_run(engine, tmp_path, monkeypatch, capsys):
    from pipeline.cli.__main__ import main
    from pipeline.dem import stack as dem_stack

    flat = DemStack([_flat_grid("Z40", 600, 40.0), _flat_grid("Z120", 600, 120.0)], "test")
    monkeypatch.setattr(dem_stack, "lola_polar_stack", lambda data_dir, in_memory=False: flat)
    # Chunks far from this small relief: every point is "not computed", so the run is quick.
    plan = [cube.PlanEntry(0, 0, 0, 1), cube.PlanEntry(1, 0, 1, 1), cube.PlanEntry(2, 41, 46, 2)]
    monkeypatch.setattr(cube, "build_plan", lambda: plan)
    out = tmp_path / "out"
    base = ["--data-dir", str(tmp_path), "--out-dir", str(out), "cube", "--device", "cpu"]

    assert main([*base, "--levels", "1", "--shard", "0/2"]) == 0
    text = capsys.readouterr().out
    assert "law full, levels 1, shard 0/2: 1 chunks (256 points)" in text  # default law: full (D-59)
    cube_dir = out / "heavy" / "cube"
    assert sorted(p.name for p in cube_dir.iterdir()) == ["c_00_00.bin.gz", "cube.json", "done.bin"]
    doc = json.loads((cube_dir / "cube.json").read_text(encoding="utf-8"))
    assert doc["law"] == "full" and doc["chunks_done"] == 1
    assert "1/1974 chunks done" in (out / "logs" / "cube.log").read_text(encoding="utf-8")

    # The rest, resuming: only the missing chunks are computed.
    assert main(base) == 0
    assert "computed 2 chunks, skipped 1 already done" in capsys.readouterr().out
    assert json.loads((cube_dir / "cube.json").read_text(encoding="utf-8"))["chunks_done"] == 3

    # One cube never mixes two laws; wrong arguments return 2.
    assert main([*base, "--law", "fast"]) == 1
    assert "never mixes two laws" in capsys.readouterr().out
    for bad in (["--levels", "5"], ["--shard", "2/2"], ["--law", "both"], ["--points", "3"]):
        assert main([*base, *bad]) == 2
    assert main([*base[:-2], "--bench", "--levels", "1"]) == 2


# ---------------------------------------------------------------------------------------------
# ops/tasks.mjs: deploy-heavy (dry run) and the night chain
# ---------------------------------------------------------------------------------------------

NODE = shutil.which("node")
needs_node = pytest.mark.skipif(NODE is None, reason="Node is not on the PATH")


def _tasks(task: str, data_dir: Path, **env) -> subprocess.CompletedProcess:
    full_env = {**os.environ, "LLSN_DATA_DIR": str(data_dir), **env}
    for name in ("DRY_RUN", "HEAVY_BASE_URL", "LEVELS", "SHARD", "LAW"):
        if name not in env:
            full_env.pop(name, None)
    return subprocess.run(
        [NODE, str(REPO_ROOT / "ops" / "tasks.mjs"), task],
        cwd=REPO_ROOT,
        env=full_env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=120,
    )


def _heavy_tree(data_dir: Path) -> Path:
    heavy = data_dir / "out" / "heavy"
    (heavy / "cube").mkdir(parents=True)
    (heavy / "layers").mkdir()
    (heavy / "cube" / "c_23_25.bin.gz").write_bytes(b"x" * 1000)
    (heavy / "cube" / "done.bin").write_bytes(bytes(CHUNKS_TOTAL))
    (heavy / "cube" / "cube.json").write_text("{}\n", encoding="utf-8")
    (heavy / "layers" / "mean186.bin.gz").write_bytes(b"y" * 10)
    return heavy


@needs_node
def test_deploy_heavy_dry_run_lists_files_and_headers_and_uploads_nothing(tmp_path):
    heavy = _heavy_tree(tmp_path)
    config = REPO_ROOT / "web" / "public" / "config.json"
    before = config.read_bytes()
    res = _tasks("deploy-heavy", tmp_path, DRY_RUN="1", HEAVY_BASE_URL="https://example.invalid")
    assert res.returncode == 0, res.stdout + res.stderr
    out = res.stdout
    listed = ["cube/c_23_25.bin.gz  1000 B", "cube/done.bin  1974 B", "cube/cube.json"]
    listed.append("layers/mean186.bin.gz")
    for name in listed:
        assert name in out
    assert "4 files" in out
    assert "/*" in out and "Access-Control-Allow-Origin: *" in out  # the _headers file (02 §6.2)
    assert "heavy_base_url = https://example.invalid" in out
    assert "DRY_RUN=1: nothing uploaded" in out and "wrangler" not in out
    assert not (heavy / "_headers").exists()  # nothing written
    assert config.read_bytes() == before


@needs_node
def test_deploy_heavy_refuses_unfinished_or_too_big_files(tmp_path):
    heavy = _heavy_tree(tmp_path)
    (heavy / "cube" / "c_23_24.bin.gz.tmp").write_bytes(b"half")
    res = _tasks("deploy-heavy", tmp_path, DRY_RUN="1")
    assert res.returncode == 1 and ".tmp" in res.stderr
    (heavy / "cube" / "c_23_24.bin.gz.tmp").unlink()
    with open(heavy / "layers" / "big.bin", "wb") as f:
        f.truncate(25 * 1024 * 1024 + 1)  # one byte over the Cloudflare Pages limit (02 §6.2)
    res = _tasks("deploy-heavy", tmp_path, DRY_RUN="1")
    assert res.returncode == 1 and "layers/big.bin" in res.stderr and "25 MiB" in res.stderr


@needs_node
def test_deploy_heavy_without_heavy_folder_fails(tmp_path):
    res = _tasks("deploy-heavy", tmp_path, DRY_RUN="1")
    assert res.returncode == 1 and "Nothing to publish" in res.stderr


@needs_node
def test_night_stops_at_the_first_failure_and_logs_each_step(tmp_path):
    # No DEMs in this data folder: the first step (cube, levels 2 to 4) fails and nothing else runs.
    res = _tasks("night", tmp_path)
    assert res.returncode != 0
    logs = tmp_path / "out" / "logs"
    summary = list(logs.glob("night-*Z.log"))
    assert len(summary) == 1
    text = summary[0].read_text(encoding="utf-8")
    assert "step 1-cube: LEVELS=2,3,4 make cube" in text
    assert "step 1-cube FAILED" in text and "chain stopped" in text
    assert "step 2-layers" not in text
    step_logs = sorted(p.name for p in logs.glob("night-*-1-cube.log"))
    assert len(step_logs) == 1 and not list(logs.glob("night-*-2-layers.log"))
