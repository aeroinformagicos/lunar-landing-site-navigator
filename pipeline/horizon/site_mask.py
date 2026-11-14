# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Site masks on disk: ``horizon/<site>.json``, ``profile/<site>.bin.gz``, ``sites.json``,
``map/regions.json`` and ``manifest.json``.

docs/spec/06_horizonte.md §5, §8 and §9; 09_contrato_datos.md §3.1, §4-§6 and §8.2;
04_catalogo_sitios.md §6. Where the files go (decision D-84):

- ``site-mask`` and ``sites`` write the light outputs to ``<out>/light/`` (same paths as the
  contract); ``publish`` copies them to ``web/public/data/``, writes ``manifest.json`` and checks
  the result with ``check-contract``. ``sites`` publishes after every site (04 §6).
- ``regions`` writes ``<out>/heavy/map/regions.json`` (heavy origin, 09 §2).

Every file is deterministic: the same inputs give the same bytes (06 §10.8).
"""

from __future__ import annotations

import csv
import io
import json
import math
import subprocess
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from pipeline.common.catalog import SITE_FIELDS, batch_order, catalog_regions, sites_by_id
from pipeline.common.geo import latlon_of_unit
from pipeline.dem.stack import LABEL_SMOOTH, DemDataMissing, DemStack, polar_xy_m, stack_for_site
from pipeline.horizon.engine_ref import (
    PROFILE_OBSERVER_HEIGHT_M,
    HorizonMask,
    SiteOutsideRelief,
    horizon_mask,
    ray_samples,
    smooth_horizon,
)
from pipeline.horizon.law import AZ_STEP_DEG, N_AZ
from pipeline.horizon.profile import PROFILE_BINS, encode_profile

REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACT_VERSION = (REPO_ROOT / "contract" / "VERSION").read_text(encoding="ascii").strip()
WEB_DATA_DIR = REPO_ROOT / "web" / "public" / "data"
DEFAULT_LAW = "full"  # 06 §1
EPHEMERIS_BYTES = 5_260_176  # 09 §3.1

# Precision written to horizon/<site>.json (06 §5, 09 §5).
EL_DECIMALS = 4
LATLON_DECIMALS = 5
HEIGHT_DECIMALS = 1
USAGE_DECIMALS = 6  # grid_usage fractions (09 §5 does not fix it; decision D-84)


StackFactory = Callable[[dict], DemStack | None]


def light_dir_of(out_dir: str | Path) -> Path:
    """Light outputs before ``publish``: ``<out>/light`` (decision D-84)."""
    return Path(out_dir) / "light"


def heavy_dir_of(out_dir: str | Path) -> Path:
    return Path(out_dir) / "heavy"


# ---------------------------------------------------------------------------------------------
# Rounding and writing
# ---------------------------------------------------------------------------------------------


def _num(v: float, decimals: int) -> float:
    """Round for the file; ``+ 0.0`` turns −0.0 into 0.0."""
    return round(float(v), decimals) + 0.0


def _lon(v: float) -> float:
    """Longitude rounded to 5 decimals, kept in (−180, 180] after rounding."""
    r = _num(v, LATLON_DECIMALS)
    return r + 360.0 if r <= -180.0 else r


def _height_key(h: float) -> int | float:
    return int(h) if float(h).is_integer() else float(h)


def json_bytes(doc: dict, compact: bool = False) -> bytes:
    if compact:
        text = json.dumps(doc, separators=(",", ":"))
    else:
        text = json.dumps(doc, indent=2, ensure_ascii=False)
    return (text + "\n").encode("utf-8")


def write_if_changed(path: Path, data: bytes) -> bool:
    """Write ``data`` unless the file already holds exactly those bytes. Returns True if written."""
    if path.is_file() and path.read_bytes() == data:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)
    return True


def gzip_bytes(data: bytes) -> bytes:
    from pipeline.horizon.cube import gzip_bytes as _gzip  # one-member gzip, mtime 0

    return _gzip(data)


# ---------------------------------------------------------------------------------------------
# One site
# ---------------------------------------------------------------------------------------------


def observer_heights(site: dict) -> list[float]:
    """Observer heights of the site with 2 m first (``masks[0]`` is always 2 m, 09 §5)."""
    heights = sorted({float(h) for h in site["observer_heights_m"]})
    if PROFILE_OBSERVER_HEIGHT_M not in heights:
        raise ValueError(f"Site {site['id']}: observer_heights_m must include 2 (masks[0] is 2 m)")
    heights.remove(PROFILE_OBSERVER_HEIGHT_M)
    return [PROFILE_OBSERVER_HEIGHT_M, *heights]


def horizon_doc(site: dict, mask: HorizonMask) -> dict:
    """Contents of ``horizon/<site>.json`` (09 §5) with the rounding of 06 §5."""
    if mask.law is None or mask.profile is None:
        raise ValueError("The smooth Moon has no horizon file (09 §5): the web builds it")
    stats = mask.stats
    return {
        "contract_version": CONTRACT_VERSION,
        "site_id": site["id"],
        "lat_deg": site["lat_deg"],
        "lon_deg": site["lon_deg"],
        "site_height_m": _num(mask.site_height_m, HEIGHT_DECIMALS),
        "relief": site["relief"],
        "relief_label": mask.relief_label,
        "dem_stack": list(mask.dem_stack),
        "az_step_deg": AZ_STEP_DEG,
        "n_az": N_AZ,
        "law": mask.law,
        "max_dist_m": round(mask.max_dist_m),
        "masks": [
            {
                "observer_height_m": _height_key(m.observer_height_m),
                "el_deg": [_num(v, EL_DECIMALS) for v in m.el_deg],
                "dist_m": [round(float(v)) for v in m.dist_m],
                "blk_lat_deg": [_num(v, LATLON_DECIMALS) for v in m.blk_lat_deg],
                "blk_lon_deg": [_lon(v) for v in m.blk_lon_deg],
                "blk_height_m": [_num(v, HEIGHT_DECIMALS) for v in m.blk_height_m],
            }
            for m in mask.masks
        ],
        "smooth_el_deg": {
            str(_height_key(m.observer_height_m)): _num(smooth_horizon(m.observer_height_m)[0], EL_DECIMALS)
            for m in mask.masks
        },
        "stats": {
            "truncated_az": int(stats["truncated_az"]),
            "min_truncation_dist_m": (
                None if stats["min_truncation_dist_m"] is None else round(stats["min_truncation_dist_m"])
            ),
            "nodata_samples": int(stats["nodata_samples"]),
            "empty_az": int(stats["empty_az"]),
            "grid_usage": {k: _num(v, USAGE_DECIMALS) for k, v in stats["grid_usage"].items()},
            "min_el_deg": _num(stats["min_el_deg"], EL_DECIMALS),
            "max_el_deg": _num(stats["max_el_deg"], EL_DECIMALS),
            "warning": stats["warning"],
        },
        "profile": {
            "file": f"profile/{site['id']}.bin.gz",
            "n_bins": PROFILE_BINS,
            "observer_height_m": _height_key(mask.profile_observer_height_m),
        },
    }


def profile_bytes(mask: HorizonMask) -> bytes:
    """Compressed ``profile/<site>.bin.gz`` (09 §6)."""
    data = encode_profile(mask.law, mask.site_height_m, mask.profile_observer_height_m, mask.profile)
    return gzip_bytes(data)


def default_stack_factory(data_dir: str | Path, in_memory: bool = False) -> StackFactory:
    """Stack of a site from its ``relief`` (03 §7); None for ``smooth``."""

    def factory(site: dict) -> DemStack | None:
        return stack_for_site(
            site["relief"], site["id"], site["lat_deg"], site["lon_deg"], data_dir, in_memory=in_memory
        )

    return factory


@dataclass
class SiteResult:
    """What ``sites.json`` says about a site after the pipeline (09 §4)."""

    site_id: str
    relief: str  # the catalog relief, or "smooth" when the data were missing
    relief_label: str
    height_m: float | None
    has_mask: bool
    has_profile: bool
    status: str  # "computed", "kept" (already on disk), "smooth" (no relief), "smooth_fallback"
    message: str = ""
    seconds: float = 0.0
    stats: dict | None = None


def smooth_result(site: dict, status: str, message: str = "") -> SiteResult:
    return SiteResult(site["id"], "smooth", LABEL_SMOOTH, None, False, False, status, message)


def compute_site(
    site: dict, stack_factory: StackFactory, law: str = DEFAULT_LAW
) -> tuple[HorizonMask | None, str]:
    """The mask of a catalog site, or ``(None, reason)`` if it must be published as smooth Moon."""
    if site["relief"] == "smooth":
        return None, "relief smooth in the catalog"
    try:
        stack = stack_factory(site)
    except DemDataMissing as exc:
        return None, f"relief data missing: {exc}"
    if stack is None:
        return None, "no relief stack"
    try:
        mask = horizon_mask(site["lat_deg"], site["lon_deg"], stack, observer_heights(site), law)
    except SiteOutsideRelief as exc:
        return None, str(exc)
    return mask, ""


def site_paths(light_dir: Path, site_id: str) -> tuple[Path, Path]:
    return light_dir / "horizon" / f"{site_id}.json", light_dir / "profile" / f"{site_id}.bin.gz"


def remove_site_outputs(light_dir: Path, site_id: str) -> None:
    for path in site_paths(light_dir, site_id):
        path.unlink(missing_ok=True)


def write_site_outputs(light_dir: Path, site: dict, mask: HorizonMask) -> tuple[Path, Path]:
    """Write ``horizon/<id>.json`` (compact JSON) and ``profile/<id>.bin.gz``. Returns both paths."""
    json_path, profile_path = site_paths(light_dir, site["id"])
    # Profile first: a horizon file on disk always has its profile (the batch skips on the JSON).
    write_if_changed(profile_path, profile_bytes(mask))
    write_if_changed(json_path, json_bytes(horizon_doc(site, mask), compact=True))
    return json_path, profile_path


def run_site(
    site: dict, light_dir: Path, stack_factory: StackFactory, law: str = DEFAULT_LAW
) -> SiteResult:
    """Compute and write one site. A site without relief data gets no files (smooth Moon, 04 §6)."""
    t0 = time.perf_counter()
    mask, reason = compute_site(site, stack_factory, law)
    if mask is None:
        remove_site_outputs(light_dir, site["id"])
        status = "smooth" if site["relief"] == "smooth" else "smooth_fallback"
        return smooth_result(site, status, reason)
    write_site_outputs(light_dir, site, mask)
    return SiteResult(
        site["id"], site["relief"], mask.relief_label, _num(mask.site_height_m, HEIGHT_DECIMALS), True, True,
        "computed", seconds=time.perf_counter() - t0, stats=mask.stats,
    )


def existing_result(site: dict, light_dir: Path) -> SiteResult | None:
    """The result of a site already on disk, if its files match the catalog entry; else None."""
    json_path, profile_path = site_paths(light_dir, site["id"])
    if not json_path.is_file():
        return None
    try:
        doc = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    same = (
        doc.get("site_id") == site["id"]
        and str(doc.get("contract_version", "")).split(".")[0] == CONTRACT_VERSION.split(".")[0]
        and doc.get("lat_deg") == site["lat_deg"]
        and doc.get("lon_deg") == site["lon_deg"]
        and doc.get("relief") == site["relief"]
        and [m.get("observer_height_m") for m in doc.get("masks", [])]
        == [_height_key(h) for h in observer_heights(site)]
    )
    has_profile = doc.get("profile") is not None
    if not same or (has_profile and not profile_path.is_file()):
        return None
    return SiteResult(
        site["id"], site["relief"], doc["relief_label"], doc["site_height_m"], True, has_profile, "kept",
        stats=doc.get("stats"),
    )


def site_entry(site: dict, result: SiteResult) -> dict:
    """The ``sites.json`` entry of a catalog site (09 §4), fields in contract order."""
    full = dict(site)
    full.update(
        relief=result.relief,
        relief_label=result.relief_label,
        height_m=result.height_m,
        has_mask=result.has_mask,
        has_profile=result.has_profile,
    )
    return {k: full[k] for k in SITE_FIELDS}


def sites_doc(catalog: dict, results: dict[str, SiteResult]) -> dict:
    """``sites.json``: every catalog site in catalog order; a site without result is smooth Moon."""
    entries = []
    for site in catalog["sites"]:
        result = results.get(site["id"]) or smooth_result(site, "smooth_fallback", "not computed")
        entries.append(site_entry(site, result))
    return {"contract_version": CONTRACT_VERSION, "defaults": dict(catalog["defaults"]), "sites": entries}


# ---------------------------------------------------------------------------------------------
# Batch
# ---------------------------------------------------------------------------------------------


def run_batch(
    catalog: dict,
    light_dir: Path,
    stack_factory: StackFactory,
    *,
    only: list[str] | None = None,
    force: bool = False,
    law: str = DEFAULT_LAW,
    after_site: Callable[[SiteResult], None] | None = None,
    progress: Callable[[str], None] = print,
) -> dict[str, SiteResult]:
    """Every site in batch order (04 §6); ``sites.json`` is rewritten after each one.

    A site whose files already match the catalog is kept unless ``force``. ``only`` limits the
    computed sites (the others keep what is on disk, or are smooth Moon). ``after_site`` runs after
    each site (the CLI publishes there). An unexpected error in one site is reported and the batch
    goes on; it is raised again at the end.
    """
    by_id = sites_by_id(catalog)
    order = batch_order(catalog)
    if only is not None:
        unknown = [s for s in only if s not in by_id]
        if unknown:
            raise KeyError(f"Unknown site ids: {', '.join(unknown)}")
    results = {sid: r for sid in order if (r := existing_result(by_id[sid], light_dir)) is not None}
    failures = []
    for n, site_id in enumerate(order, 1):
        site = by_id[site_id]
        if only is not None and site_id not in only:
            continue
        if not force and site_id in results:
            result = results[site_id]
            progress(f"[{n}/{len(order)}] {site_id}: kept ({result.relief_label}, files already on disk)")
        else:
            try:
                result = run_site(site, light_dir, stack_factory, law)
            except Exception as exc:  # noqa: BLE001 - one bad site must not stop the batch
                failures.append((site_id, exc))
                progress(f"[{n}/{len(order)}] {site_id}: FAILED: {exc!r}")
                continue
            results[site_id] = result
            progress(f"[{n}/{len(order)}] {site_id}: {describe(result)}")
        write_if_changed(light_dir / "sites.json", json_bytes(sites_doc(catalog, results)))
        if after_site is not None:
            after_site(result)
    write_if_changed(light_dir / "sites.json", json_bytes(sites_doc(catalog, results)))
    if failures:
        raise RuntimeError(f"{len(failures)} site(s) failed: {', '.join(s for s, _ in failures)}")
    return results


def describe(result: SiteResult) -> str:
    if not result.has_mask:
        return f"smooth Moon ({result.message})"
    s = result.stats or {}
    return (
        f"{result.relief_label}, site height {result.height_m} m, horizon "
        f"{s.get('min_el_deg', float('nan')):.4f}..{s.get('max_el_deg', float('nan')):.4f} deg, "
        f"truncated az {s.get('truncated_az')}, empty az {s.get('empty_az')}, "
        f"warning {s.get('warning')}, {result.seconds:.1f} s"
    )


# ---------------------------------------------------------------------------------------------
# profile-csv (06 §8, case A5)
# ---------------------------------------------------------------------------------------------

CSV_COLUMNS = ("i", "dist_m", "lat_deg", "lon_deg", "height_m", "el_deg", "grid")


def profile_csv_text(site: dict, stack: DemStack, az_deg: float, law: str = DEFAULT_LAW) -> str:
    """Every unreduced sample of one ray, seen by the 2 m observer (06 §8).

    Invalid samples (outside every DEM, or no data) keep their row with empty height, elevation
    and grid, so the row index is the sample index of the law.
    """
    rays = ray_samples(site["lat_deg"], site["lon_deg"], stack, [az_deg], PROFILE_OBSERVER_HEIGHT_M, law)
    lat, lon = latlon_of_unit(rays.points[0])
    names = [g.name for g in stack.grids]
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(CSV_COLUMNS)
    for i, d in enumerate(rays.dist_m):
        ok = bool(rays.valid[0, i])
        w.writerow([
            i,
            f"{d:.3f}",
            f"{lat[i]:.7f}",
            f"{lon[i]:.7f}",
            f"{rays.height_m[0, i]:.3f}" if ok else "",
            f"{math.degrees(rays.el_rad[0, i]):.6f}" if ok else "",
            names[rays.grid_index[0, i]] if ok else "",
        ])
    return buf.getvalue()


def csv_az_label(az_deg: float) -> str:
    return f"{az_deg:g}".replace(".", "p").replace("-", "m")


# ---------------------------------------------------------------------------------------------
# regions (09 §8.2) and publish (09 §3.1)
# ---------------------------------------------------------------------------------------------


def regions_doc(catalog: dict) -> dict:
    """``map/regions.json`` from the catalog: x, y and box with 0.1 m (04 §3, D-28)."""
    from pipeline.horizon.cube import region_boxes_of

    by_id = sites_by_id(catalog)
    regions = catalog_regions(catalog)
    boxes = region_boxes_of(regions)
    out = []
    for entry, (region_id, lat, lon, _size_km) in zip(catalog["regions"], regions, strict=True):
        site = by_id[entry["site_id"]]
        x, y = polar_xy_m(lat, lon)
        out.append({
            "id": region_id,
            "name": site["name"],
            "lat_deg": site["lat_deg"],
            "lon_deg": site["lon_deg"],
            "x_m": round(x, 1),
            "y_m": round(y, 1),
            "size_km": entry["size_km"],
            "box_m": [round(v, 1) for v in boxes[region_id]],
            "site_id": site["id"],
            "status": entry["status"],
            "source": dict(site["source"]),
        })
    return {"contract_version": CONTRACT_VERSION, "regions": out}


def git_commit_short() -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], cwd=REPO_ROOT, capture_output=True, text=True, check=True
        )
        return out.stdout.strip() or "unknown"
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def utc_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class PublishError(RuntimeError):
    pass


def publish(
    light_dir: Path, web_dir: Path, *, git_commit: str | None = None, generated_utc: str | None = None
) -> dict:
    """Copy the light outputs to ``web_dir`` and write ``manifest.json`` (09 §3.1).

    Copies ``sites.json`` and the horizon and profile files that it references; removes from
    ``web_dir`` the horizon and profile files of sites it no longer references (the example
    ``demo-a``, ``demo-b``). The ephemeris must already be there (``make ephem``). Returns the
    manifest written.
    """
    sites_path = light_dir / "sites.json"
    if not sites_path.is_file():
        raise PublishError(f"Nothing to publish: {sites_path} does not exist (run sites or site-mask first)")
    eph = web_dir / "ephemeris.bin"
    meta_path = web_dir / "ephemeris.meta.json"
    if not eph.is_file() or eph.stat().st_size != EPHEMERIS_BYTES or not meta_path.is_file():
        raise PublishError(f"{web_dir} has no complete ephemeris table: run make ephem first")
    synthetic = bool(json.loads(meta_path.read_text(encoding="utf-8")).get("synthetic", False))
    sites = json.loads(sites_path.read_text(encoding="utf-8"))
    wanted = set()
    for s in sites["sites"]:
        json_path, profile_path = site_paths(light_dir, s["id"])
        if s["has_mask"]:
            wanted.add(f"horizon/{s['id']}.json")
            if not json_path.is_file():
                raise PublishError(f"{s['id']}: has_mask but {json_path} is missing")
        if s["has_profile"]:
            wanted.add(f"profile/{s['id']}.bin.gz")
            if not profile_path.is_file():
                raise PublishError(f"{s['id']}: has_profile but {profile_path} is missing")
    for rel in sorted(wanted):
        write_if_changed(web_dir / rel, (light_dir / rel).read_bytes())
    for pattern in ("horizon/*.json", "profile/*.bin.gz"):
        for path in web_dir.glob(pattern):
            if path.relative_to(web_dir).as_posix() not in wanted:
                path.unlink()
    write_if_changed(web_dir / "sites.json", sites_path.read_bytes())
    manifest = {
        "contract_version": CONTRACT_VERSION,
        "generated_utc": generated_utc or utc_now(),
        "git_commit": git_commit or git_commit_short(),
        "sites": len(sites["sites"]),
        "ephemeris": {"file": "ephemeris.bin", "bytes": EPHEMERIS_BYTES, "synthetic": synthetic},
        "has_validation_report": (web_dir / "validation_report.json").is_file(),
    }
    write_if_changed(web_dir / "manifest.json", json_bytes(manifest))
    return manifest
