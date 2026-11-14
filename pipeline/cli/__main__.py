# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Pipeline command line: ``python -m pipeline.cli <subcommand>``.

Each task card adds its subcommand (docs/spec/02_arquitectura.md §4.2). All of
them accept ``--data-dir`` (default: $LLSN_DATA_DIR, else ./data) and
``--out-dir``, print a short summary and return a non-zero code on failure.
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
# Where `make ephem` publishes the table (02_arquitectura.md §4.1): the light data of the web.
WEB_DATA_DIR = REPO_ROOT / "web" / "public" / "data"
EPHEM_SAMPLE = REPO_ROOT / "tests" / "golden" / "ephem_sample.json"


def default_data_dir() -> Path:
    env = os.environ.get("LLSN_DATA_DIR")
    return Path(env) if env else Path("data")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m pipeline.cli", description="Lunar Landing Site Navigator pipeline"
    )
    parser.add_argument("--data-dir", type=Path, default=default_data_dir())
    parser.add_argument("--out-dir", type=Path, default=None)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("info", help="print the data directory and what it contains")
    ephem = sub.add_parser(
        "ephem", help="hourly ephemeris table ephemeris.bin + meta (default --out-dir web/public/data)"
    )
    ephem.add_argument(
        "--write-sample",
        action="store_true",
        help="also write tests/golden/ephem_sample.json (50 samples with their spkpos values)",
    )
    bench = sub.add_parser("bench-sampler", help="measure the speed of bilinear DEM sampling")
    bench.add_argument("--samples", type=int, default=2_000_000, help="samples per measurement")
    bench.add_argument(
        "--in-memory", action="store_true", help="load P1 and P2 whole instead of mapping them"
    )
    sub.add_parser("cube-plan", help="write the priority list of the cube chunks (out/cube/plan.json)")
    cube = sub.add_parser(
        "cube", help="horizon cube by chunks into out/heavy/cube (resumable); --bench measures its cost"
    )
    cube.add_argument("--bench", action="store_true", help="measure the cost and write out/cube/bench.json")
    cube.add_argument(
        "--law",
        choices=("both", "full", "fast"),
        default=None,
        help="cube law (default full, decision D-59); with --bench, the laws to measure (default both)",
    )
    cube.add_argument(
        "--levels", default=None, help="levels of the plan to compute, e.g. 1 or 2,3,4 (default all)"
    )
    cube.add_argument(
        "--shard", default=None, help="k/n: only the chunks whose plan index mod n is k (default 0/1)"
    )
    cube.add_argument(
        "--device", choices=("auto", "cuda", "cpu"), default=None, help="default: $LLSN_DEVICE or auto"
    )
    cube.add_argument("--pts-batch", type=int, default=None, help="points per batch")
    cube.add_argument("--ring", type=int, default=None, help="samples per block")
    cube.add_argument(
        "--points", type=int, default=None, help="quick check: only the first N points of each chunk"
    )
    check = sub.add_parser("check-contract", help="validate data directories against the contract (09)")
    check.add_argument(
        "dirs", nargs="*", type=Path, help="default: contract/examples/data and web/public/data"
    )
    return parser


def out_dir(args: argparse.Namespace) -> Path:
    """Root of the derived outputs: --out-dir, else <data dir>/out (decision D-44)."""
    return args.out_dir if args.out_dir is not None else args.data_dir / "out"


def cmd_info(args: argparse.Namespace) -> int:
    root = args.data_dir
    print(f"data dir: {root.resolve()}")
    for name in ("kernels", "raw/lola", "raw/sldem2015", "raw/nasa_illum", "crops", "out"):
        path = root / name
        count = sum(1 for p in path.iterdir() if p.is_file()) if path.is_dir() else 0
        print(f"  {name:<16} {'present' if path.is_dir() else 'missing'} ({count} files)")
    return 0


def cmd_ephem(args: argparse.Namespace) -> int:
    """ephemeris.bin and ephemeris.meta.json (05_efemerides.md §4.4); SPICE errors get a prefix (§6)."""
    import numpy as np
    from spiceypy.utils.exceptions import SpiceyError

    from pipeline.ephem import table
    from pipeline.ephem.kernels import KernelMissing

    target = args.out_dir if args.out_dir is not None else WEB_DATA_DIR
    kdir = args.data_dir / "kernels"
    t0 = time.perf_counter()
    try:
        records = table.build_table(kdir, progress=print)
        path = table.write_table(target, records)
        if args.write_sample:
            sample = table.write_sample(EPHEM_SAMPLE, kdir)
            print(f"{table.SAMPLE_COUNT} samples written to {sample}")
    except KernelMissing as exc:
        print(exc)
        return 1
    except SpiceyError as exc:
        print(f"SPICE error: {exc}")
        return 1
    sun = np.linalg.norm(records[:, :3], axis=1)
    earth = np.linalg.norm(records[:, 3:], axis=1)
    print(
        f"{len(records)} records, {path.stat().st_size} B -> {path} in {time.perf_counter() - t0:.1f} s; "
        f"|sun| {sun.min():.4e}-{sun.max():.4e} km, |earth| {earth.min():.1f}-{earth.max():.1f} km"
    )
    return 0


def cmd_bench_sampler(args: argparse.Namespace) -> int:
    """Samples per second of ``height_m`` (03_datos_y_fuentes.md §12). Prints one line per case."""
    import numpy as np

    from pipeline.common.constants import R_MOON_M
    from pipeline.common.geo import unit_vector
    from pipeline.dem.grids import PolarSouthGrid
    from pipeline.dem.stack import DemDataMissing, lola_polar_stack

    n = max(1000, args.samples)
    rng = np.random.default_rng(1)

    def rate(label: str, sample) -> None:
        t0 = time.perf_counter()
        valid_fraction = sample()
        dt = time.perf_counter() - t0
        print(
            f"{label}: {n} samples in {dt:.2f} s = {n / dt / 1e6:.1f} M samples/s "
            f"(valid {valid_fraction:.3f})"
        )

    # 1. Synthetic int16 grid in memory (no data needed): random pixels, then unit vectors.
    size = 4096
    grid = PolarSouthGrid(
        "synthetic", size, 40.0, to_m=0.5, data=rng.integers(-4000, 4000, (size, size)).astype("<i2")
    )
    s = rng.uniform(0, size - 1.001, n)
    l = rng.uniform(0, size - 1.001, n)
    u = grid.unit_of_pixel(s, l)
    rate("in-memory grid, random pixels (bilinear only)", lambda: grid.sample_pixels(s, l)[1].mean())
    rate("in-memory grid, unit vectors (projection + bilinear)", lambda: grid.height_m(u)[1].mean())

    # 2. Real polar stack P1 + P2 along rays, as the horizon engine samples it.
    try:
        t0 = time.perf_counter()
        stack = lola_polar_stack(args.data_dir, in_memory=args.in_memory)
        how = "loaded in memory" if args.in_memory else "memory-mapped"
        print(f"P1 + P2 {how} in {time.perf_counter() - t0:.2f} s")
    except DemDataMissing as exc:
        print(f"real DEMs skipped: {exc}")
        return 0
    n_az = 720
    n_d = n // n_az
    n = n_az * n_d
    az = np.radians(np.arange(n_az) * 0.5)[:, None]
    theta = np.linspace(20.0, 300_000.0, n_d)[None, :] / R_MOON_M
    # Rays from the south pole: colatitude theta along the meridian of each azimuth.
    rays = unit_vector(-90.0 + np.degrees(theta) + 0 * az, np.degrees(az) + 0 * theta)
    rate("P1 + P2 stack, rays from the pole, first pass", lambda: stack.height_m(rays)[1].mean())
    rate("P1 + P2 stack, rays from the pole, second pass", lambda: stack.height_m(rays)[1].mean())
    return 0


def cmd_cube_plan(args: argparse.Namespace) -> int:
    """Priority list of the 1974 chunks (08_mapa_polar.md §2)."""
    from pipeline.horizon import cube

    path = out_dir(args) / "cube" / "plan.json"
    plan = cube.write_plan(path)
    for lv in cube.plan_levels(plan):
        print(f"level {lv['level']}: {lv['chunks']} chunks, {lv['points']} points")
    print(f"{len(plan)} chunks written to {path}")
    return 0


def open_log(args: argparse.Namespace, name: str):
    """Print a line and append it, with its UTC time, to ``<out>/logs/<name>.log`` (02 §9)."""
    path = out_dir(args) / "logs" / f"{name}.log"
    path.parent.mkdir(parents=True, exist_ok=True)

    def log(line: str) -> None:
        print(line, flush=True)
        stamp = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"{stamp} {line}\n")

    return log


def cmd_cube(args: argparse.Namespace) -> int:
    """The cube by levels and shards (08 §2, T-25) or, with --bench, its cost (08 §4)."""
    if not args.bench:
        return cmd_cube_run(args)
    if args.levels is not None or args.shard is not None:
        print("--levels and --shard are for the cube run, not for --bench")
        return 2
    try:
        import torch  # noqa: F401
    except ImportError:
        print("PyTorch is not installed: run make setup-gpu (CUDA) or pip install torch==2.15.0 (CPU).")
        return 1
    from pipeline.dem.stack import DemDataMissing, lola_polar_stack
    from pipeline.horizon import cube, engine_torch

    if args.points is not None and not 1 <= args.points <= cube.POINTS_PER_CHUNK:
        print(f"--points must be between 1 and {cube.POINTS_PER_CHUNK}")
        return 2
    device = engine_torch.pick_device(args.device)
    t0 = time.perf_counter()
    try:
        dem = lola_polar_stack(args.data_dir, in_memory=True)
    except DemDataMissing as exc:
        print(f"cannot measure: {exc}")
        return 1
    stack = engine_torch.TorchStack.from_dem_stack(dem, device)
    load_s = time.perf_counter() - t0
    print(f"{' + '.join(stack.names)} loaded on {device.type} in {load_s:.1f} s")
    bench = cube.run_bench(
        stack,
        laws=cube.BENCH_LAWS if args.law in (None, "both") else (args.law,),
        pts_batch=args.pts_batch,
        ring=args.ring,
        points=None if args.points is None else list(range(args.points)),
        progress=print,
    )
    bench["load_s"] = load_s
    # A partial run never replaces the measurement the decision rule uses.
    path = out_dir(args) / "cube" / ("bench.json" if bench["complete"] else "bench_partial.json")
    cube.write_bench(path, bench)
    for line in cube.bench_summary_lines(bench):
        print(line)
    print(f"written to {path}")
    return 0


def cmd_cube_run(args: argparse.Namespace) -> int:
    """Compute the chunks of the selected levels and shard into out/heavy/cube (resumable, 08 §2)."""
    from pipeline.horizon import cube

    if args.points is not None:
        print("--points is only for --bench: a cube chunk always has its 256 points")
        return 2
    law = args.law or cube.DEFAULT_LAW
    if law == "both":
        print("A cube has a single law: --law full or --law fast")
        return 2
    try:
        levels = cube.parse_levels(args.levels)
        shard = cube.parse_shard(args.shard)
    except ValueError as exc:
        print(exc)
        return 2
    cube_dir = cube.cube_dir_of(out_dir(args))
    previous = cube.read_cube_json(cube_dir)
    if previous is not None and previous.get("law") != law:
        print(
            f"{cube_dir} holds a cube with law {previous.get('law')!r}; asked {law!r}. "
            "One cube never mixes two laws: use the same LAW, or move that folder away."
        )
        return 1
    plan = cube.build_plan()
    selected = cube.select_plan(plan, levels, shard)
    log = open_log(args, "cube")
    log(
        f"cube: law {law}, levels {','.join(map(str, levels))}, shard {shard[0]}/{shard[1]}: "
        f"{len(selected)} chunks ({len(selected) * cube.POINTS_PER_CHUNK} points) -> {cube_dir}"
    )
    if importlib.util.find_spec("torch") is None:
        log("PyTorch is not installed: run make setup-gpu (CUDA) or pip install torch==2.15.0 (CPU).")
        return 1
    from pipeline.dem.stack import DemDataMissing, lola_polar_stack

    t0 = time.perf_counter()
    try:
        dem = lola_polar_stack(args.data_dir, in_memory=True)  # before importing PyTorch: fails fast
        from pipeline.horizon import engine_torch

        device = engine_torch.pick_device(args.device)
        stack = engine_torch.TorchStack.from_dem_stack(dem, device)
    except (DemDataMissing, RuntimeError, ValueError) as exc:
        log(f"cannot compute the cube: {exc}")
        return 1
    log(f"{' + '.join(stack.names)} loaded on {device.type} in {time.perf_counter() - t0:.1f} s")
    try:
        summary = cube.run_cube(
            stack,
            cube_dir,
            law=law,
            levels=levels,
            shard=shard,
            plan=plan,
            pts_batch=args.pts_batch,
            ring=args.ring,
            progress=log,
        )
    except KeyboardInterrupt:
        log("interrupted: run the same command again to resume (finished chunks are kept)")
        return 130
    rate = summary.samples / summary.seconds if summary.seconds > 0 else 0.0
    done = cube.read_cube_json(cube_dir) or {}
    log(
        f"computed {len(summary.computed)} chunks, skipped {len(summary.skipped)} already done, "
        f"in {cube.format_duration(summary.seconds)} ({rate:.3e} samples/s); "
        f"cube.json: {done.get('chunks_done', 0)}/{cube.CHUNKS_TOTAL} chunks done"
    )
    return 0


def cmd_check_contract(args: argparse.Namespace) -> int:
    """Schemas, sizes, headers and cross references of the contract files (09_contrato_datos.md)."""
    from pipeline.cli import contract_check

    return contract_check.main(args.dirs)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    handlers = {
        "info": cmd_info,
        "ephem": cmd_ephem,
        "bench-sampler": cmd_bench_sampler,
        "cube-plan": cmd_cube_plan,
        "cube": cmd_cube,
        "check-contract": cmd_check_contract,
    }
    return handlers[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
