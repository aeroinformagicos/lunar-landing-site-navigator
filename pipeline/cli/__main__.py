# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Pipeline command line: ``python -m pipeline.cli <subcommand>``.

Each task card adds its subcommand (docs/spec/02_arquitectura.md §4.2). All of
them accept ``--data-dir`` (default: $LLSN_DATA_DIR, else ./data) and
``--out-dir``, print a short summary and return a non-zero code on failure.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path


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
    bench = sub.add_parser("bench-sampler", help="measure the speed of bilinear DEM sampling")
    bench.add_argument("--samples", type=int, default=2_000_000, help="samples per measurement")
    bench.add_argument(
        "--in-memory", action="store_true", help="load P1 and P2 whole instead of mapping them"
    )
    return parser


def cmd_info(args: argparse.Namespace) -> int:
    root = args.data_dir
    print(f"data dir: {root.resolve()}")
    for name in ("kernels", "raw/lola", "raw/sldem2015", "raw/nasa_illum", "crops", "out"):
        path = root / name
        count = sum(1 for p in path.iterdir() if p.is_file()) if path.is_dir() else 0
        print(f"  {name:<16} {'present' if path.is_dir() else 'missing'} ({count} files)")
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


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    handlers = {"info": cmd_info, "bench-sampler": cmd_bench_sampler}
    return handlers[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
