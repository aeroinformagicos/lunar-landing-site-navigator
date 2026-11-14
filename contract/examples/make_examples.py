# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Synthetic example data set that follows the contract (docs/spec/09_contrato_datos.md §13).

No SPICE and no DEM: every value comes from a formula, so the web can be built before the
pipeline produces real files. The output is deterministic (fixed timestamps, gzip without time),
so running it twice gives the same bytes and a test can check that the committed copy is current.

    python contract/examples/make_examples.py            # contract/examples/data + web/public
    python contract/examples/make_examples.py --out DIR  # only DIR (used by the tests)

Example data are shown by the web with the band "Example data — not for use"
(``manifest.ephemeris.synthetic = true``). Formulas and their parameters: 09 §13 and
docs/decisions.md D-56.
"""

from __future__ import annotations

import argparse
import calendar
import io
import json
import math
import shutil
import struct
import sys
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from pipeline.common.constants import R_MOON_M  # noqa: E402
from pipeline.common.geo import enu_basis, latlon_of_unit, unit_vector  # noqa: E402
from pipeline.dem.stack import lola_polar_plan, polar_xy_m  # noqa: E402
from pipeline.horizon import cube  # noqa: E402
from pipeline.horizon.law import AZ_STEP_DEG, N_AZ, law_distance, law_distances, law_n_samples  # noqa: E402
from pipeline.horizon.profile import PROFILE_BINS, encode_profile, reduce_profile  # noqa: E402

CONTRACT_VERSION = (REPO_ROOT / "contract" / "VERSION").read_text(encoding="ascii").strip()
GENERATED_UTC = "2026-11-14T00:00:00Z"  # fixed: the examples must be reproducible byte for byte
GIT_COMMIT = "example"
DAY_S = 86_400.0

# --- Ephemeris table (05_efemerides.md §4.2: segments; 09 §13: synthetic motion) ---
SEGMENTS = (
    # id, t0_utc, t0_unix, n, valid_from_utc, valid_to_utc
    ("main", "2023-12-31T23:00:00Z", 1_704_063_600, 184_107, "2024-01-01T00:00:00Z", "2045-01-01T00:00:00Z"),
    ("apollo", "1968-12-31T23:00:00Z", -31_539_600, 35_067, "1969-01-01T00:00:00Z", "1973-01-01T00:00:00Z"),
)
STEP_S = 3600
EPHEMERIS_BYTES = 5_260_176
SUN_DIST_KM = 1.496e8
SUN_PERIOD_D = 29.53  # synodic: one turn of the Sun around the lunar sky
SUN_Z_AMP_DEG = 1.54
SUN_Z_PERIOD_D = 346.6
EARTH_DIST_KM = 384_400.0
EARTH_LON_AMP_DEG, EARTH_LON_PERIOD_D = 7.9, 27.55
EARTH_LAT_AMP_DEG, EARTH_LAT_PERIOD_D = 6.7, 27.21

# --- Sites (09 §13; coordinates of blue-ghost-1 and apollo-11 from 04_catalogo_sitios.md §2) ---
EXAMPLE_NOTE = "Example data: formula horizon, not real terrain."
SYNTHETIC_SOURCE = {"label": "Synthetic example data (task T-02)", "url": ""}
NSSDCA_SOURCE = {
    "label": "NSSDCA, Table of Anthropogenic Impacts and Spacecraft on the Moon",
    "url": "https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html",
}
SMOOTH_LABEL = "Smooth Moon (no terrain)"
BLOCK_DIST_M = law_distance("full", 999)  # 20 000 m: the horizon of the example masks sits there
OBSERVER_M = 2.0

# --- Candidate regions for map/regions.json (04_catalogo_sitios.md §3) ---
REGION_NAMES = {
    "de-gerlache-rim-2": "de Gerlache Rim 2",
    "haworth": "Haworth",
    "malapert-massif": "Malapert Massif",
    "mons-mouton": "Mons Mouton",
    "mons-mouton-plateau": "Mons Mouton Plateau",
    "nobile-rim-1": "Nobile Rim 1",
    "nobile-rim-2": "Nobile Rim 2",
    "peak-near-cabeus-b": "Peak near Cabeus B",
    "slater-plain": "Slater Plain",
}
REGION_SOURCE = {
    "label": "NASA (2024); centre via USGS record 671a6fa8d34efed5620f89f8",
    "url": "https://www.nasanow.org/artemis",
}

# --- Heavy origin ---
HILLSHADE_PX = (1504, 1344)  # 250 m/px over the mesh (09 §8.3)
COMPACT_MAGIC = b"LLSNCMP1"
COMPACT_HEADER = struct.Struct("<8s2HIHHfH6x")  # 32 bytes (09 §11)
COMPACT_N_AZ = 180
COMPACT_SIDE = 8  # 8 x 8 = 64 example points (09 §13)
LAYERS_MONTHS = [(y, m) for y in range(2026, 2031) for m in range(1, 13)]
MEAN186 = ("mean186", "18.6-year mean", "2026-01-01T00:00:00Z", "2044-08-12T00:00:00Z", 163_152)


# ---------------------------------------------------------------------------------------------
# Writers
# ---------------------------------------------------------------------------------------------


def write_json(path: Path, doc: dict, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(doc, separators=(",", ":")) if compact else json.dumps(doc, indent=2)
    path.write_bytes((text + "\n").encode("utf-8"))


def write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


# ---------------------------------------------------------------------------------------------
# Ephemeris
# ---------------------------------------------------------------------------------------------


def synthetic_vectors(t_unix: np.ndarray) -> np.ndarray:
    """[n, 6] float64: Moon -> Sun and Moon -> Earth in km (09 §13, D-56). t = 0 at the Unix epoch."""
    t_d = t_unix / DAY_S
    # The Sun turns westwards in the lunar sky (the Moon rotates eastwards), with a small tilt.
    sun_lon = -2.0 * math.pi * t_d / SUN_PERIOD_D
    sun_lat = np.radians(SUN_Z_AMP_DEG) * np.sin(2.0 * math.pi * t_d / SUN_Z_PERIOD_D)
    earth_lon = np.radians(EARTH_LON_AMP_DEG) * np.sin(2.0 * math.pi * t_d / EARTH_LON_PERIOD_D)
    earth_lat = np.radians(EARTH_LAT_AMP_DEG) * np.sin(2.0 * math.pi * t_d / EARTH_LAT_PERIOD_D)
    sun = SUN_DIST_KM * unit_vector(np.degrees(sun_lat), np.degrees(sun_lon))
    earth = EARTH_DIST_KM * unit_vector(np.degrees(earth_lat), np.degrees(earth_lon))
    return np.concatenate([sun, earth], axis=-1)


def make_ephemeris(out: Path) -> None:
    parts, segments, offset = [], [], 0
    for seg_id, t0_utc, t0_unix, n, valid_from, valid_to in SEGMENTS:
        t = t0_unix + STEP_S * np.arange(n, dtype=np.float64)
        parts.append(synthetic_vectors(t).astype("<f4").tobytes())
        segments.append({
            "id": seg_id, "t0_utc": t0_utc, "t0_unix": t0_unix, "n": n, "byte_offset": offset,
            "valid_from_utc": valid_from, "valid_to_utc": valid_to,
        })
        offset += 24 * n
    data = b"".join(parts)
    assert len(data) == EPHEMERIS_BYTES
    write_bytes(out / "ephemeris.bin", data)
    write_json(out / "ephemeris.meta.json", {
        "contract_version": CONTRACT_VERSION,
        "frame": "MOON_ME",
        "frame_spice": "MOON_ME_DE440_ME421",
        "center": "MOON",
        "abcorr": "LT+S",
        "units": "km",
        "dtype": "float32",
        "byte_order": "little",
        "record_fields": ["sun_x", "sun_y", "sun_z", "earth_x", "earth_y", "earth_z"],
        "record_bytes": 24,
        "step_s": STEP_S,
        "interpolation": "lagrange4",
        "segments": segments,
        "kernels": ["naif0012.tls", "de440.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"],
        "constants": {"r_moon_km": 1737.4, "r_sun_km": 695700.0, "r_earth_km": 6378.137},
        "synthetic": True,
    })


# ---------------------------------------------------------------------------------------------
# Sites, horizon masks and profile
# ---------------------------------------------------------------------------------------------


def _site(site_id, name, short, kind, lat, lon, relief, *, height=None, mission=None, operator=None,
          landing_utc=None, landing_date=None, has_mask=False, has_profile=False, source=SYNTHETIC_SOURCE,
          note=""):
    label = lola_polar_plan(lat, lon)[1] if relief == "lola_polar" else SMOOTH_LABEL
    return {
        "id": site_id, "name": name, "short_name": short, "type": kind, "lat_deg": lat, "lon_deg": lon,
        "height_m": height, "mission": mission, "operator": operator, "landing_utc": landing_utc,
        "landing_date": landing_date, "relief": relief, "relief_label": label, "has_mask": has_mask,
        "has_profile": has_profile, "observer_heights_m": [2], "replan_candidate": False,
        "region_id": None, "source": source, "note": note,
    }


SITES = [
    _site("demo-a", "Demo site A (example data)", "Demo A", "demo", -88.8, 123.4, "lola_polar",
          height=0.0, has_mask=True, has_profile=True, note=EXAMPLE_NOTE),
    _site("demo-b", "Demo site B (example data)", "Demo B", "demo", -89.67, 129.78, "lola_polar",
          height=0.0, has_mask=True, note=EXAMPLE_NOTE),
    _site("blue-ghost-1", "Blue Ghost Mission 1", "Blue Ghost 1", "landing", 18.562, 61.81, "smooth",
          mission="Blue Ghost Mission 1", operator="Firefly Aerospace (NASA CLPS)",
          landing_utc="2025-03-02T08:34:00Z", landing_date="2025-03-02", source=NSSDCA_SOURCE),
    _site("apollo-11", "Apollo 11", "Apollo 11", "landing", 0.67416, 23.47314, "smooth",
          mission="Apollo 11", operator="NASA", landing_date="1969-07-20", source=NSSDCA_SOURCE),
]

# Formula masks of 09 §13 (azimuth in degrees).
MASK_FORMULAS = {
    "demo-a": lambda az: 0.4 + 0.6 * np.sin(np.radians(3.0 * az)),
    "demo-b": lambda az: 12.0 + 3.0 * np.sin(np.radians(2.0 * az)),
}


def azimuths_deg() -> np.ndarray:
    return np.arange(N_AZ) * AZ_STEP_DEG


def ray_points(lat: float, lon: float, dist_m: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Point at ``dist_m[j, …]`` along the great circle leaving the site at azimuth 0.5·j (06 §4.1)."""
    east, north, _ = enu_basis(lat, lon)
    u0 = unit_vector(lat, lon)
    a = np.radians(azimuths_deg()).reshape((N_AZ,) + (1,) * (dist_m.ndim - 1))
    theta = (dist_m / R_MOON_M)[..., None]
    t = np.cos(a)[..., None] * north + np.sin(a)[..., None] * east
    p = np.cos(theta) * u0 + np.sin(theta) * t
    return latlon_of_unit(p)


def height_for_elevation(el_deg, d_m, h_site_m: float, h_obs_m: float):
    """Terrain height (m) that a sample at distance ``d_m`` needs to be seen at ``el_deg`` (06 §4.3)."""
    theta = np.asarray(d_m, dtype=np.float64) / R_MOON_M
    r_o = R_MOON_M + h_site_m + h_obs_m
    r_t = r_o / (np.cos(theta) - np.sin(theta) * np.tan(np.radians(el_deg)))
    return r_t - R_MOON_M


def horizon_doc(site: dict) -> dict:
    lat, lon, h_site = site["lat_deg"], site["lon_deg"], site["height_m"]
    el = np.round(MASK_FORMULAS[site["id"]](azimuths_deg()), 4)
    dist = np.full(N_AZ, BLOCK_DIST_M)
    blk_lat, blk_lon = ray_points(lat, lon, dist)
    blk_h = height_for_elevation(el, dist, h_site, OBSERVER_M)
    smooth_dip = -math.degrees(math.acos(R_MOON_M / (R_MOON_M + OBSERVER_M)))
    return {
        "contract_version": CONTRACT_VERSION,
        "site_id": site["id"],
        "lat_deg": lat,
        "lon_deg": lon,
        "site_height_m": h_site,
        "relief": site["relief"],
        "relief_label": site["relief_label"],
        "dem_stack": [],
        "az_step_deg": AZ_STEP_DEG,
        "n_az": N_AZ,
        "law": "full",
        "max_dist_m": round(float(law_distances("full")[-1])),
        "masks": [{
            "observer_height_m": int(OBSERVER_M),
            "el_deg": [round(float(v), 4) for v in el],
            "dist_m": [int(v) for v in dist],
            "blk_lat_deg": [round(float(v), 5) for v in blk_lat],
            "blk_lon_deg": [round(float(v), 5) for v in blk_lon],
            "blk_height_m": [round(float(v), 1) for v in blk_h],
        }],
        "smooth_el_deg": {"2": round(smooth_dip, 4)},
        "stats": {
            "truncated_az": 0, "min_truncation_dist_m": None, "nodata_samples": 0, "empty_az": 0,
            "grid_usage": {}, "min_el_deg": round(float(el.min()), 4), "max_el_deg": round(float(el.max()), 4),
            "warning": EXAMPLE_NOTE,
        },
        "profile": (
            {"file": f"profile/{site['id']}.bin.gz", "n_bins": PROFILE_BINS, "observer_height_m": 2}
            if site["has_profile"] else None
        ),
    }


def ramp_profile(site: dict) -> np.ndarray:
    """int16 [720, 512] profile coherent with the formula mask (09 §13: terrain as a ramp).

    Along each azimuth the elevation of the terrain seen from the observer rises linearly to the
    mask value at 20 km and then falls 0.5° every 20 km, so the highest sample is the blocking
    point of the mask. Heights come from that elevation; the reduction is the real one (06 §8).
    """
    el_mask = np.round(MASK_FORMULAS[site["id"]](azimuths_deg()), 4)[:, None]
    d = law_distances("full")[None, :]
    el = np.where(d <= BLOCK_DIST_M, el_mask * d / BLOCK_DIST_M, el_mask - 0.5 * (d - BLOCK_DIST_M) / BLOCK_DIST_M)
    h = height_for_elevation(el, d, site["height_m"], OBSERVER_M)
    return reduce_profile(h, el, np.ones_like(h, dtype=bool))


def make_sites(out: Path) -> None:
    write_json(out / "sites.json", {
        "contract_version": CONTRACT_VERSION,
        "defaults": {"demo_pair": ["demo-a", "demo-b"], "demo_landing_utc": "2027-08-01T00:00:00Z",
                     "demo_mission_days": 14},
        "sites": SITES,
    })
    for site in SITES:
        if site["has_mask"]:
            write_json(out / "horizon" / f"{site['id']}.json", horizon_doc(site), compact=True)
        if site["has_profile"]:
            data = encode_profile("full", site["height_m"], OBSERVER_M, ramp_profile(site))
            write_bytes(out / "profile" / f"{site['id']}.bin.gz", cube.gzip_bytes(data))


# ---------------------------------------------------------------------------------------------
# Manifest and validation report
# ---------------------------------------------------------------------------------------------


def make_manifest(out: Path) -> None:
    write_json(out / "manifest.json", {
        "contract_version": CONTRACT_VERSION,
        "generated_utc": GENERATED_UTC,
        "git_commit": GIT_COMMIT,
        "sites": len(SITES),
        "ephemeris": {"file": "ephemeris.bin", "bytes": EPHEMERIS_BYTES, "synthetic": True},
        "has_validation_report": True,
    })


def make_validation_report(out: Path) -> None:
    firefly = {"label": "Firefly Aerospace, Blue Ghost Mission 1 updates", "url": "https://fireflyspace.com/?p=3379"}
    horizons = {"label": "JPL Horizons", "url": "https://ssd.jpl.nasa.gov/horizons/"}
    sample = "Example report (synthetic values)."
    # 09 §7: A1 (Horizons), B3 and A7B7. Values of the A1 rows: Earth from Blue Ghost 1, 05 §8.3.
    headline = [
        {
            "id": "A1", "title": "Sun and Earth positions vs JPL Horizons (8 sites, 8 dates)",
            "rows": [
                {"label": "Earth azimuth, Blue Ghost 1, 2025-03-14 06:00 UTC", "predicted": "258.6490°",
                 "observed": "258.6490°", "ok": True},
                {"label": "Earth elevation, Blue Ghost 1, 2025-03-14 06:00 UTC", "predicted": "28.9167°",
                 "observed": "28.9167°", "ok": True},
            ],
            "tolerance": "0.02 deg", "source": horizons,
            "note": "256 values: Sun and Earth, azimuth and elevation, 8 sites x 8 dates. " + sample,
            "status": "pass",
        },
        {
            "id": "B3", "title": "Total solar eclipse seen by Blue Ghost 1 (14 March 2025)",
            "rows": [
                {"label": "Eclipse starts", "predicted": "05:01 UTC", "observed": "05:00 UTC", "ok": True},
                {"label": "Totality starts", "predicted": "06:17 UTC", "observed": "06:18 UTC", "ok": True},
                {"label": "Totality ends", "predicted": "08:34 UTC", "observed": "08:34 UTC", "ok": True},
                {"label": "Eclipse ends", "predicted": "09:51 UTC", "observed": "09:52 UTC", "ok": True},
            ],
            "tolerance": "5 min", "source": firefly,
            "note": "Firefly gives the times as CST; they match UTC-5 (CDT). " + sample, "status": "pass",
        },
        {
            "id": "A7B7", "title": "Our south pole maps vs NASA illumination and Earth visibility maps",
            "rows": [], "tolerance": "—",
            "source": {"label": "NASA PGDA, south pole illumination products", "url": ""},
            "note": "Computed tonight: this comparison needs the full south pole terrain run. " + sample,
            "status": "skipped",
        },
    ]
    cases = [
        {"id": "A1", "group": "A", "title": "Sun and Earth azimuth and elevation vs JPL Horizons", "status": "pass",
         "expected": "JPL Horizons, observer on the lunar surface",
         "obtained": "max |error| 0.00004 deg over 256 comparisons", "tolerance": "0.02 deg", "source": horizons,
         "details": [{"label": "apollo-11 sun el 2025-03-14T06:00Z", "expected": 12.345678,
                      "obtained": 12.345671, "abs_err": 0.000007, "unit": "deg", "ok": True}],
         "note": sample},
        {"id": "A4", "group": "A", "title": "Smooth sphere and synthetic hill", "status": "pass",
         "expected": "-0.087, -0.615, -1.943 and 2.606 deg", "obtained": "all within 0.001 deg",
         "tolerance": "0.005 deg", "source": {"label": "Hand calculation, R = 1737.4 km", "url": ""},
         "details": [], "note": sample},
        {"id": "A5", "group": "A", "title": "Terrain section vs QGIS profile", "status": "manual",
         "expected": "Same blocking point", "obtained": "Signed off by A1", "tolerance": "—",
         "source": {"label": "QGIS", "url": ""}, "details": [], "note": sample},
        {"id": "B1", "group": "B", "title": "Sunrise and sunset in the web vs Python", "status": "skipped",
         "expected": "—", "obtained": "—", "tolerance": "1 min", "source": {"label": "Python reference", "url": ""},
         "details": [], "note": "Not run in the example data. " + sample},
    ]
    statuses = [c["status"] for c in cases]
    write_json(out / "validation_report.json", {
        "contract_version": CONTRACT_VERSION,
        "generated_utc": GENERATED_UTC,
        "git_commit": GIT_COMMIT,
        "summary": {
            "total": len(cases), "passed": statuses.count("pass"), "failed": statuses.count("fail"),
            "manual": statuses.count("manual"), "skipped": statuses.count("skipped"),
            "horizons_comparisons": 256, "horizons_max_abs_err_deg": 0.00004,
        },
        "headline": headline,
        "cases": cases,
    })


# ---------------------------------------------------------------------------------------------
# Heavy origin: map, layers, cube, compact masks
# ---------------------------------------------------------------------------------------------


def make_map(out: Path) -> None:
    from PIL import Image

    write_json(out / "map" / "grid.json", {
        "contract_version": CONTRACT_VERSION,
        "projection": "polar_stereographic_south",
        "radius_m": int(R_MOON_M),
        "cell_m": int(cube.CELL_M),
        "nx": cube.NX, "ny": cube.NY,
        "x_min_m": int(cube.X_MIN_M), "y_max_m": int(cube.Y_MAX_M),
        "chunk": cube.CHUNK, "n_chunk_cols": cube.N_CHUNK_COLS, "n_chunk_rows": cube.N_CHUNK_ROWS,
    })
    boxes = cube.region_boxes()
    regions = []
    for region_id, lat, lon, size_km in cube.REGIONS:
        x, y = polar_xy_m(lat, lon)
        regions.append({
            "id": region_id, "name": REGION_NAMES[region_id], "lat_deg": lat, "lon_deg": lon,
            "x_m": round(x, 1), "y_m": round(y, 1), "size_km": size_km,
            "box_m": [round(v, 1) for v in boxes[region_id]],
            "site_id": f"region-{region_id}", "status": "candidate_2024", "source": REGION_SOURCE,
        })
    write_json(out / "map" / "regions.json", {"contract_version": CONTRACT_VERSION, "regions": regions})

    # Hillshade: a diagonal grey gradient. DEM: a smooth bowl, deepest at the pole.
    w, h = HILLSHADE_PX
    xx, yy = np.meshgrid(np.arange(w), np.arange(h))
    shade = (60 + 140 * (xx + yy) / (w + h - 2)).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(shade, mode="L").save(buf, format="PNG", optimize=False)
    write_bytes(out / "map" / "hillshade_250m.png", buf.getvalue())
    x, y = cube.cell_centre_xy(*np.meshgrid(np.arange(cube.NX), np.arange(cube.NY)))
    dem = np.rint(-3000.0 + 0.012 * np.hypot(x, y)).astype("<i2")
    write_bytes(out / "map" / "dem_500m.bin.gz", cube.gzip_bytes(dem.tobytes()))


def layer_bands() -> np.ndarray:
    """uint8 [3, 672, 752]: sun grows to the right, earth downwards, both = min of the two."""
    i = np.arange(cube.NX)[None, :]
    j = np.arange(cube.NY)[:, None]
    sun = np.broadcast_to(np.rint(250 * i / (cube.NX - 1)), (cube.NY, cube.NX))
    earth = np.broadcast_to(np.rint(250 * j / (cube.NY - 1)), (cube.NY, cube.NX))
    return np.stack([sun, earth, np.minimum(sun, earth)]).astype(np.uint8)


def make_layers(out: Path) -> None:
    bands = layer_bands()
    payload = cube.gzip_bytes(bands.tobytes())
    periods = [{"id": MEAN186[0], "label": MEAN186[1], "start_utc": MEAN186[2], "end_utc": MEAN186[3],
                "n_steps": MEAN186[4], "file": f"layers/{MEAN186[0]}.bin.gz"}]
    for y, m in LAYERS_MONTHS:
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        periods.append({
            "id": f"{y}-{m:02d}", "label": f"{calendar.month_abbr[m]} {y}",
            "start_utc": f"{y}-{m:02d}-01T00:00:00Z", "end_utc": f"{ny}-{nm:02d}-01T00:00:00Z",
            "n_steps": 24 * calendar.monthrange(y, m)[1], "file": f"layers/{y}-{m:02d}.bin.gz",
        })
    for p in periods:
        write_bytes(out / p["file"], payload)
    write_bytes(out / "layers" / "mean186_any.bin.gz", cube.gzip_bytes(bands[:2].tobytes()))
    write_json(out / "layers" / "layers.json", {
        "contract_version": CONTRACT_VERSION,
        "source": "computed",
        "criterion": "center",
        "observer_height_m": 2,
        "time_step_s": 3600,
        "encoding": {"dtype": "uint8", "pct_per_unit": 0.4, "nodata": 255, "bands": ["sun", "earth", "both"],
                     "layout": "band,row,col"},
        "periods": periods,
        "validation": {"file": "layers/mean186_any.bin.gz", "bands": ["sun_any", "earth_any"],
                       "criterion": "any", "observer_height_m": 2},
        "coverage": {"computed_points": cube.POINTS_TOTAL, "total_points": cube.POINTS_TOTAL},
    })


def example_chunks() -> list[tuple[int, int]]:
    """The chunk that holds demo-a and its three neighbours to the right and below."""
    i, j = cube.cell_of_xy(*polar_xy_m(-88.8, 123.4))
    row, col, _ = cube.chunk_of_cell(i, j)
    row, col = int(row), int(col)
    return [(row, col), (row, col + 1), (row + 1, col), (row + 1, col + 1)]


def make_cube(out: Path) -> None:
    cube_dir = out / "cube"
    az = azimuths_deg()[None, :]
    p = np.arange(cube.POINTS_PER_CHUNK)[:, None]
    done = np.zeros((cube.N_CHUNK_ROWS, cube.N_CHUNK_COLS), dtype=np.uint8)
    for k, (row, col) in enumerate(example_chunks()):
        el = 0.5 + 1.5 * np.sin(np.radians(2.0 * az + 7.0 * p + 45.0 * k))
        dist = np.broadcast_to(BLOCK_DIST_M + 100.0 * p, el.shape)
        height = 100.0 * k + p[:, 0]
        cube.write_chunk(cube_dir, row, col, cube.encode_chunk(row, col, "full", height, el, dist))
        done[row, col] = 1
    cube.write_index(cube_dir, done, "full", ["synthetic"])


def make_compact(out: Path) -> None:
    """64 points (8 x 8 cells) at the centre of the first region of map/regions.json (09 §11)."""
    _, lat, lon, _ = cube.REGIONS[0]
    ci, cj = cube.cell_of_xy(*polar_xy_m(lat, lon))
    jj, ii = np.meshgrid(np.arange(COMPACT_SIDE), np.arange(COMPACT_SIDE), indexing="ij")
    i = (int(ci) - COMPACT_SIDE // 2 + ii).ravel().astype("<u2")
    j = (int(cj) - COMPACT_SIDE // 2 + jj).ravel().astype("<u2")
    n = i.size
    height = np.rint(-1000.0 + 10.0 * np.arange(n)).astype("<i2")
    region = np.zeros(n, dtype=np.uint8)  # index 0 = first region of map/regions.json
    b = np.arange(COMPACT_N_AZ)[None, :]
    el_q = np.rint((1.0 + 2.0 * np.sin(np.radians(4.0 * b + 11.0 * np.arange(n)[:, None]))) / 0.01).astype("<i2")
    header = COMPACT_HEADER.pack(COMPACT_MAGIC, 1, 0, n, COMPACT_N_AZ, 200, 0.01, 1)
    data = header + i.tobytes() + j.tobytes() + height.tobytes() + region.tobytes() + bytes(n) + el_q.tobytes()
    assert len(data) == 32 + 8 * n + 360 * n
    write_bytes(out / "compact" / "regions.bin.gz", cube.gzip_bytes(data))


# ---------------------------------------------------------------------------------------------


def make_all(out: Path) -> None:
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    make_ephemeris(out)
    make_sites(out)
    make_manifest(out)
    make_validation_report(out)
    make_map(out)
    make_layers(out)
    make_cube(out)
    make_compact(out)


def holds_real_data(data_dir: Path) -> bool:
    """True if ``data_dir/manifest.json`` says the ephemeris is real (``synthetic: false``, 09 §3.1)."""
    manifest = data_dir / "manifest.json"
    if not manifest.is_file():
        return False
    try:
        doc = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    return isinstance(doc, dict) and doc.get("ephemeris", {}).get("synthetic") is False


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=None, help="write only here (default: both copies)")
    args = parser.parse_args(argv)
    if args.out is not None:
        make_all(args.out)
        print(f"example data written to {args.out}")
        return 0
    examples = REPO_ROOT / "contract" / "examples" / "data"
    web_public = REPO_ROOT / "web" / "public"
    make_all(examples)
    if holds_real_data(web_public / "data"):
        print(
            f"example data written to {examples}; {web_public / 'data'} NOT overwritten: its manifest.json "
            "has ephemeris.synthetic = false (real data, decision D-77). Move it away first if you "
            "really want the example copy there."
        )
        return 1
    shutil.rmtree(web_public / "data", ignore_errors=True)
    shutil.copytree(examples, web_public / "data")
    write_json(web_public / "config.json", {"data_base_url": "data", "heavy_base_url": "data"})
    n = sum(1 for p in examples.rglob("*") if p.is_file())
    print(f"{n} example files written to {examples} and copied to {web_public / 'data'}")
    print(f"law full: {law_n_samples('full')} samples, horizon at {BLOCK_DIST_M:.0f} m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
