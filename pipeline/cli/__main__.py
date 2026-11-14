# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Pipeline command line: ``python -m pipeline.cli <subcommand>``.

Each task card adds its subcommand (docs/spec/02_arquitectura.md §4.2). All of
them accept ``--data-dir`` (default: $LLSN_DATA_DIR, else ./data) and
``--out-dir``, print a short summary and return a non-zero code on failure.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
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
    mask = sub.add_parser(
        "site-mask", help="horizon/<site>.json and profile/<site>.bin.gz of one site into <out>/light"
    )
    mask.add_argument("--site", required=True, help="site id of contract/sites.catalog.json")
    pcsv = sub.add_parser(
        "profile-csv", help="every unreduced sample of some rays of a site, as CSV (case A5)"
    )
    pcsv.add_argument("--site", required=True, help="site id of contract/sites.catalog.json")
    pcsv.add_argument(
        "--az", type=float, action="append", required=True, help="azimuth in degrees (repeatable)"
    )
    sites = sub.add_parser(
        "sites", help="every site in batch order into <out>/light, publishing after each (04 §6)"
    )
    sites.add_argument("--sites", default=None, help="comma-separated ids: compute only these")
    sites.add_argument("--force", action="store_true", help="recompute sites whose files already exist")
    sites.add_argument("--no-publish", action="store_true", help="do not copy to web/public/data")
    sites.add_argument("--web-dir", type=Path, default=None, help="default: web/public/data")
    sub.add_parser("regions", help="map/regions.json from the catalog into <out>/heavy/map")
    layers = sub.add_parser(
        "layers", help="visibility layers and map/grid.json from the cube into <out>/heavy (resumable, 08 §5)"
    )
    layers.add_argument(
        "--source",
        choices=("computed", "nasa_avgvisib"),
        default="computed",
        help="computed (from the cube) or nasa_avgvisib (plan B-4 of 08 §9: the NASA maps on the mesh)",
    )
    layers.add_argument(
        "--device", choices=("auto", "cuda", "cpu", "numpy"), default=None,
        help="default: $LLSN_DEVICE or auto (PyTorch if installed, GPU if any); numpy forces the reference",
    )
    layers.add_argument("--batch-chunks", type=int, default=None, help="cube chunks per batch (default 64)")
    layers.add_argument("--block-steps", type=int, default=None, help="hourly steps per block (default 512)")
    layers.add_argument("--force", action="store_true", help="recompute every chunk, not only the new ones")
    layers.add_argument("--web-dir", type=Path, default=None, help="ephemeris; default: web/public/data")
    sub.add_parser("hillshade", help="map/hillshade_250m.png and map/dem_500m.bin.gz from P2 (08 §6)")
    sub.add_parser(
        "compare-nasa", help="mean186_any vs the NASA AVGVISIB maps: case B7 and its two figures (08 §8)"
    )
    demo = sub.add_parser(
        "pick-demo", help="candidate demo pairs from the monthly layers into <out>/demo_candidates.json"
    )
    demo.add_argument("--web-dir", type=Path, default=None, help="ephemeris, masks; default: web/public/data")
    pub = sub.add_parser("publish", help="copy <out>/light to web/public/data and write manifest.json")
    pub.add_argument("--web-dir", type=Path, default=None, help="default: web/public/data")
    vec = sub.add_parser(
        "core-vectors", help="tests/golden/core_vectors.json: shared Python -> TypeScript vectors (07 §12.3)"
    )
    vec.add_argument("--web-dir", type=Path, default=None, help="light data; default: web/public/data")
    vec.add_argument("--out", type=Path, default=None, help="default: tests/golden/core_vectors.json")
    rep = sub.add_parser(
        "report", help="validation_report.json from <out>/test_results and docs/manual_checks.json (11 §7.1)"
    )
    rep.add_argument("--web-dir", type=Path, default=None, help="default: web/public/data")
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


def _catalog_site(site_id: str) -> dict | None:
    from pipeline.common.catalog import default_catalog, sites_by_id

    site = sites_by_id(default_catalog()).get(site_id)
    if site is None:
        print(f"Unknown site {site_id!r}: it is not in contract/sites.catalog.json")
    return site


def cmd_site_mask(args: argparse.Namespace) -> int:
    """Mask and profile of one site into <out>/light (06 §5); does not touch sites.json."""
    from pipeline.horizon import site_mask

    site = _catalog_site(args.site)
    if site is None:
        return 2
    light = site_mask.light_dir_of(out_dir(args))
    t0 = time.perf_counter()
    mask, reason = site_mask.compute_site(site, site_mask.default_stack_factory(args.data_dir))
    if mask is None:
        print(f"{args.site}: no mask, smooth Moon ({reason})")
        return 0 if site["relief"] == "smooth" else 1
    seconds = time.perf_counter() - t0
    json_path, profile_path = site_mask.write_site_outputs(light, site, mask)
    s = mask.stats
    print(f"{args.site}: {mask.relief_label} ({' + '.join(mask.dem_stack)}), law {mask.law}")
    h_min, h_max = s['min_el_deg'], s['max_el_deg']
    print(f"  site height {mask.site_height_m:.1f} m; horizon {h_min:.4f}..{h_max:.4f} deg")
    print(
        f"  truncated az {s['truncated_az']} (min cut {s['min_truncation_dist_m']}), "
        f"empty az {s['empty_az']}, "
        f"nodata samples {s['nodata_samples']}, warning {s['warning']}"
    )
    print("  grid usage: " + ", ".join(f"{k} {v:.4f}" for k, v in s["grid_usage"].items()))
    print(f"  {seconds:.2f} s -> {json_path} ({json_path.stat().st_size} B), {profile_path.name} "
          f"({profile_path.stat().st_size} B)")
    return 0


def cmd_profile_csv(args: argparse.Namespace) -> int:
    """Unreduced samples of some rays of a site (06 §8, case A5) into <out>/profile_csv."""
    import csv
    import io

    from pipeline.dem.stack import DemDataMissing
    from pipeline.horizon import site_mask
    from pipeline.horizon.engine_ref import SiteOutsideRelief

    site = _catalog_site(args.site)
    if site is None:
        return 2
    try:
        stack = site_mask.default_stack_factory(args.data_dir)(site)
    except DemDataMissing as exc:
        print(f"{args.site}: relief data missing: {exc}")
        return 1
    if stack is None:
        print(f"{args.site}: smooth Moon, no terrain samples")
        return 1
    target = out_dir(args) / "profile_csv"
    target.mkdir(parents=True, exist_ok=True)
    for az in args.az:
        try:
            text = site_mask.profile_csv_text(site, stack, az)
        except SiteOutsideRelief as exc:
            print(exc)
            return 1
        path = target / f"{args.site}_az{site_mask.csv_az_label(az)}.csv"
        path.write_text(text, encoding="utf-8", newline="")
        rows = [r for r in csv.DictReader(io.StringIO(text)) if r["el_deg"]]
        best = max(rows, key=lambda r: float(r["el_deg"])) if rows else None
        summary = (
            f"max el {float(best['el_deg']):.4f} deg at i {best['i']}, {float(best['dist_m']):.0f} m, "
            f"height {float(best['height_m']):.1f} m" if best else "no valid sample"
        )
        print(f"az {az:g} deg: {len(rows)} valid samples; {summary} -> {path}")
    return 0


def cmd_sites(args: argparse.Namespace) -> int:
    """The site batch (04 §6): masks into <out>/light, sites.json, and publish after each site."""
    from pipeline.common.catalog import default_catalog
    from pipeline.horizon import site_mask

    catalog = default_catalog()
    light = site_mask.light_dir_of(out_dir(args))
    web = args.web_dir if args.web_dir is not None else site_mask.WEB_DATA_DIR
    log = open_log(args, "sites")
    only = [s.strip() for s in args.sites.split(",") if s.strip()] if args.sites else None

    def after(_result) -> None:
        if not args.no_publish:
            site_mask.publish(light, web)

    log(f"sites: {len(catalog['sites'])} in the catalog -> {light}" + ("" if args.no_publish else f", {web}"))
    t0 = time.perf_counter()
    try:
        results = site_mask.run_batch(
            catalog,
            light,
            site_mask.default_stack_factory(args.data_dir),
            only=only,
            force=args.force,
            after_site=after,
            progress=log,
        )
    except (KeyError, RuntimeError, site_mask.PublishError) as exc:
        log(f"sites: {exc}")
        return 1
    masks = sum(r.has_mask for r in results.values())
    log(f"sites: {masks} with mask, {len(catalog['sites']) - masks} smooth Moon, "
        f"{time.perf_counter() - t0:.1f} s")
    if args.no_publish:
        return 0
    from pipeline.cli import contract_check

    return contract_check.main([web])


def cmd_regions(args: argparse.Namespace) -> int:
    """map/regions.json from the catalog (09 §8.2) into <out>/heavy/map."""
    from pipeline.common.catalog import default_catalog
    from pipeline.horizon import site_mask

    path = site_mask.heavy_dir_of(out_dir(args)) / "map" / "regions.json"
    doc = site_mask.regions_doc(default_catalog())
    site_mask.write_if_changed(path, site_mask.json_bytes(doc))
    print(f"{len(doc['regions'])} regions written to {path}")
    return 0


def cmd_layers(args: argparse.Namespace) -> int:
    """Layers of 08 §5 from the cube (resumable), or the NASA layers of plan B-4 (08 §9)."""
    from pipeline.horizon import cube
    from pipeline.horizon.site_mask import heavy_dir_of
    from pipeline.layers import layers as lay

    heavy = heavy_dir_of(out_dir(args))
    log = open_log(args, "layers")
    t0 = time.perf_counter()
    if args.source == lay.SOURCE_NASA:
        from pipeline.dem.pds_label import LabelError
        from pipeline.layers import compare_nasa

        try:
            products = compare_nasa.open_products(args.data_dir)
        except (compare_nasa.NasaDataMissing, LabelError) as exc:
            log(f"layers: {exc}")
            return 1
        files, n_points = lay.write_nasa_layers(heavy, products)
        log(f"layers (plan B-4, source nasa_avgvisib): {n_points} cells with NASA values, {len(files)} files "
            f"in {heavy} ({time.perf_counter() - t0:.1f} s)")
        return 0
    for name, value in (("--batch-chunks", args.batch_chunks), ("--block-steps", args.block_steps)):
        if value is not None and value < 1:
            print(f"{name} must be at least 1")
            return 2
    from pipeline.ephem.interp import load_table

    web = args.web_dir if args.web_dir is not None else WEB_DATA_DIR
    try:
        table = load_table(web)
        steps = lay.table_steps(table)
        bk = lay.pick_backend(args.device)
    except (OSError, ValueError, RuntimeError) as exc:
        log(f"layers: {exc}")
        return 1
    cube_dir = cube.cube_dir_of(out_dir(args))
    if not (cube_dir / "done.bin").is_file():
        log(f"layers: {cube_dir / 'done.bin'} does not exist: run make cube first")
        return 1
    try:
        summary = lay.run_layers(
            cube_dir, heavy, lay.partial_dir_of(out_dir(args)), steps, bk,
            batch_chunks=args.batch_chunks or lay.DEFAULT_BATCH_CHUNKS,
            block_steps=args.block_steps or lay.DEFAULT_BLOCK_STEPS,
            force=args.force, progress=log,
        )
    except KeyboardInterrupt:
        log("interrupted: run the same command again to resume (finished chunks are kept)")
        return 130
    log(
        f"layers: {len(summary.computed)} chunks computed, {len(summary.skipped)} kept, {len(summary.bad)} "
        f"unreadable; {summary.computed_points}/{cube.POINTS_TOTAL} points; {len(summary.files)} files in "
        f"{heavy} in {cube.format_duration(summary.seconds)}"
    )
    return 1 if summary.bad else 0


def cmd_hillshade(args: argparse.Namespace) -> int:
    """Hillshade and 500 m heights of the map background from P2 (08 §6), plus map/grid.json."""
    from pipeline.dem.grids import read_pds_image
    from pipeline.dem.stack import P2_NAME
    from pipeline.horizon.site_mask import heavy_dir_of
    from pipeline.layers import hillshade
    from pipeline.layers import layers as lay

    lbl = args.data_dir / "raw" / "lola" / f"{P2_NAME}.LBL"
    if not lbl.is_file() or not lbl.with_suffix(".IMG").is_file():
        print(f"hillshade: missing {P2_NAME}.IMG or its .LBL in {lbl.parent}; run make data-fetch")
        return 1
    t0 = time.perf_counter()
    heavy = heavy_dir_of(out_dir(args))
    png, dem, s = hillshade.write_background(heavy, read_pds_image(lbl))
    lay.write_grid(heavy)
    print(f"{png} ({png.stat().st_size} B), {dem} ({dem.stat().st_size} B); heights {s['dem_min_m']}.."
          f"{s['dem_max_m']} m, {s['dem_nodata']} cells without data; {time.perf_counter() - t0:.1f} s")
    return 0


def cmd_compare_nasa(args: argparse.Namespace) -> int:
    """mean186_any against the NASA AVGVISIB maps (08 §8.2): records case B7 and writes its figures."""
    from pipeline.cli.report import write_case
    from pipeline.dem.pds_label import LabelError
    from pipeline.horizon.site_mask import heavy_dir_of
    from pipeline.layers import compare_nasa
    from pipeline.layers import layers as lay

    t0 = time.perf_counter()
    try:
        ours = compare_nasa.read_any_layer(lay.layers_dir_of(heavy_dir_of(out_dir(args))))
        products = compare_nasa.open_products(args.data_dir)
    except (OSError, ValueError, LabelError) as exc:
        print(f"compare-nasa: {exc}")
        return 1
    comp = compare_nasa.compare(ours, compare_nasa.mesh_dn_sums(products))
    results = out_dir(args) / "test_results"
    figures = compare_nasa.write_figures(results, comp)
    case = compare_nasa.case_b7(comp)
    path = write_case(results, **case)
    for line in compare_nasa.summary_lines(comp):
        print(line)
    print(f"B7: {case['status']} (r > {compare_nasa.r_min():g} for Sun and Earth over the 85° S maps) "
          f"-> {path}")
    print(f"figures: {', '.join(f'{p.name} ({p.stat().st_size} B)' for p in figures)}; "
          f"{time.perf_counter() - t0:.1f} s. Then: make report")
    return 0


def cmd_pick_demo(args: argparse.Namespace) -> int:
    """Candidate demo pairs (04 §5.1, case A11) into <out>/demo_candidates.json; A1 picks one."""
    from pipeline.common.catalog import default_catalog
    from pipeline.dem.stack import DemDataMissing
    from pipeline.ephem.interp import load_table
    from pipeline.horizon import site_mask
    from pipeline.layers.layers import layers_dir_of
    from pipeline.vis import demo

    out = out_dir(args)
    web = args.web_dir if args.web_dir is not None else WEB_DATA_DIR
    log = open_log(args, "pick-demo")
    months = demo.month_ids()
    t0 = time.perf_counter()
    try:
        both = demo.read_both_band(layers_dir_of(site_mask.heavy_dir_of(out)), months)
        table = load_table(web)
    except (OSError, ValueError) as exc:
        log(f"pick-demo: {exc}")
        return 1
    catalog = default_catalog()
    alternatives = demo.region_alternatives(catalog, [site_mask.light_dir_of(out), web], log)
    factory = site_mask.default_stack_factory(args.data_dir)

    def mask_fn(site: dict):
        mask, reason = site_mask.compute_site(site, factory, demo.LAW)
        if mask is None:
            return None, reason
        return site_mask.horizon_doc(site, mask), ""

    csv_dir = out / "profile_csv"

    def profile_fn(site: dict, az: float) -> str | None:
        try:
            text = site_mask.profile_csv_text(site, factory(site), az)
        except (DemDataMissing, ValueError) as exc:
            log(f"pick-demo: no profile CSV for {site['id']}: {exc}")
            return None
        csv_dir.mkdir(parents=True, exist_ok=True)
        path = csv_dir / f"{site['id']}_az{site_mask.csv_az_label(az)}.csv"
        path.write_text(text, encoding="utf-8", newline="")
        return path.relative_to(out).as_posix()

    doc = demo.pick_demo(both, months, catalog, table, mask_fn, alternatives, log, profile_fn)
    doc["generated_utc"] = site_mask.utc_now()
    doc["git_commit"] = site_mask.git_commit_short()
    path = out / "demo_candidates.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for line in demo.summary_lines(doc):
        log(line)
    log(f"pick-demo: {path} in {time.perf_counter() - t0:.1f} s")
    return 0 if doc["relaxation_level"] is not None else 1


def cmd_publish(args: argparse.Namespace) -> int:
    """Copy <out>/light to web/public/data, write manifest.json and check the contract (09 §3.1)."""
    from pipeline.cli import contract_check
    from pipeline.horizon import site_mask

    web = args.web_dir if args.web_dir is not None else site_mask.WEB_DATA_DIR
    try:
        manifest = site_mask.publish(site_mask.light_dir_of(out_dir(args)), web)
    except site_mask.PublishError as exc:
        print(exc)
        return 1
    print(f"published {manifest['sites']} sites to {web} (commit {manifest['git_commit']})")
    return contract_check.main([web])


def cmd_core_vectors(args: argparse.Namespace) -> int:
    """Shared vectors written by the Python reference (07_visibilidad.md §12.3)."""
    from pipeline.vis import vectors

    web = args.web_dir if args.web_dir is not None else WEB_DATA_DIR
    out = args.out if args.out is not None else REPO_ROOT / "tests" / "golden" / "core_vectors.json"
    t0 = time.perf_counter()
    try:
        doc = vectors.build_vectors(web)
    except (OSError, ValueError, KeyError) as exc:
        print(f"core-vectors: {exc}")
        return 1
    path = vectors.write_vectors(doc, out)
    n = sum(len(v) for k, v in doc.items() if isinstance(v, list))
    print(f"{n} cases in {len(vectors.BLOCKS)} blocks written to {path} ({path.stat().st_size / 1e6:.2f} MB, "
          f"{time.perf_counter() - t0:.0f} s)")
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    """Gather the recorded cases into validation_report.json and check the contract (09 §7)."""
    from pipeline.cli import contract_check, report

    web = args.web_dir if args.web_dir is not None else report.WEB_DATA_DIR
    results = out_dir(args) / "test_results"
    try:
        doc = report.build_report(results, report.MANUAL_CHECKS, web)
    except (ValueError, KeyError, json.JSONDecodeError) as exc:
        print(f"report: {exc}")
        return 1
    path = report.write_report(doc, web)
    s = doc["summary"]
    print(f"{s['total']} cases from {results}: {s['passed']} pass, {s['failed']} fail, {s['manual']} manual, "
          f"{s['skipped']} skipped; Horizons: {s['horizons_comparisons']} values, "
          f"max |error| {s['horizons_max_abs_err_deg']} deg")
    for h in doc["headline"]:
        rows = "; ".join(f"{r['label']} {r['predicted']} vs {r['observed']}" for r in h["rows"])
        print(f"  headline {h['id']}: {h['status']}" + (f" ({rows})" if rows else ""))
    for c in doc["cases"]:
        if c["status"] == "fail":
            print(f"  FAIL {c['id']}: {c['obtained']}")
    print(f"written to {path}")
    report.mark_in_manifest(web)
    return contract_check.main([web])


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
        "site-mask": cmd_site_mask,
        "profile-csv": cmd_profile_csv,
        "sites": cmd_sites,
        "regions": cmd_regions,
        "layers": cmd_layers,
        "hillshade": cmd_hillshade,
        "compare-nasa": cmd_compare_nasa,
        "pick-demo": cmd_pick_demo,
        "publish": cmd_publish,
        "core-vectors": cmd_core_vectors,
        "report": cmd_report,
        "check-contract": cmd_check_contract,
    }
    return handlers[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
