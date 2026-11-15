# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Choice of the demo pair (04_catalogo_sitios.md §5.1, case A11): ``python -m pipeline.cli pick-demo``.

1. Pairs of mesh cells (A, B) of the same candidate region, at most 1000 m apart, for every month
   2027-01 … 2028-12, scored ``both(A, M) − both(B, M)`` with ``both(A, M) ≥ 60 %`` and
   ``both(B, M) ≤ 10 %``, from the monthly layers (08 §5).
2. The 5 best pairs, from distinct regions where possible, get a full site mask (law ``full``, 2 m
   and 10 m, profile), like any catalog site.
3. For each pair, a landing time ``t`` in month M, every 6 h, with ``assess(A, t) = go``,
   ``assess(B, t) = no_go``, ``assess(A, t + 12 d) = no_go`` and another candidate region ``go`` at
   ``t + 12 d``: 14-day mission, default requirements (07 §8).
4. If no pair meets step 3, the relaxations, in this order and cumulative: delay 10 to 16 days
   instead of 12; ``marginal`` counts as valid; A and B up to 2000 m apart.

Output: ``<out>/demo_candidates.json`` (not part of the contract: A1 reads it and picks one pair,
A2 copies it into the catalog as ``demo-a`` and ``demo-b``). Decision D-108 fixes what 04 §5.1
leaves open.
"""

from __future__ import annotations

import json
import math
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from pipeline.common.catalog import catalog_regions
from pipeline.common.timeutil import iso_to_unix, unix_to_iso
from pipeline.ephem.interp import EphemerisTable, OutOfRange
from pipeline.horizon import cube
from pipeline.layers import layers as lay
from pipeline.vis.metrics import DAY_S
from pipeline.vis.requirements import DEFAULT_REQUIREMENTS, Assessment, Requirements, assess_scenario
from pipeline.vis.sky import Mask, blocker_at, evaluate, frame_for, horizon_at, load_mask, mask_from_file

# --- 04 §5.1 ---
FIRST_MONTH = (2027, 1)
LAST_MONTH = (2028, 12)
MIN_BOTH_A_PCT = 60.0
MAX_BOTH_B_PCT = 10.0
MAX_PAIR_DIST_M = 1000.0  # «a 1.000 m o menos (2 celdas)»
RELAXED_PAIR_DIST_M = 2000.0
N_PAIRS = 5
SEARCH_STEP_S = 6 * 3600
DELAY_DAYS = 12.0
RELAXED_DELAY_DAYS = (10.0, 16.0)
MISSION_DAYS = 14.0
OBSERVER_HEIGHTS_M = (2, 10)  # «máscara de sitio completa (ley full, 2 m y 10 m, perfil)»
ASSESS_HEIGHT_M = 2  # observer of `assess` (CLAUDE.md §2: 2 m by default)
LAW = "full"
PAIR_RELIEF = "lola_polar"  # the relief of the candidate regions in the catalog (04 §3)

# Relaxation levels (cumulative): 0 strict; 1 delay 10-16 d; 2 + `marginal` valid; 3 + up to 2000 m.
RELAXATIONS = (
    "none",
    "delay 10-16 d",
    "delay 10-16 d; marginal counts as valid",
    "delay 10-16 d; marginal counts as valid; A-B up to 2000 m",
)
# Precision written to the file (D-108): coordinates like horizon/<site>.json (06 §5).
LATLON_DECIMALS = 5

FORMAT = "llsn-demo-candidates-1"


# ---------------------------------------------------------------------------------------------
# Step 1: pairs from the monthly layers
# ---------------------------------------------------------------------------------------------


def month_ids(first: tuple[int, int] = FIRST_MONTH, last: tuple[int, int] = LAST_MONTH) -> list[str]:
    """``YYYY-MM`` from ``first`` to ``last``, both included."""
    out = []
    y, m = first
    while (y, m) <= last:
        out.append(f"{y}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


@dataclass(frozen=True)
class Pair:
    region_id: str
    month: str  # YYYY-MM
    a: tuple[int, int]  # cell (i, j) of the map mesh
    b: tuple[int, int]
    both_a_pct: float
    both_b_pct: float
    score_pct: float
    distance_m: float


def pair_offsets(max_dist_m: float) -> list[tuple[int, int]]:
    """Cell offsets (di, dj) ≠ (0, 0) whose centres are at most ``max_dist_m`` apart."""
    n = int(max_dist_m // cube.CELL_M)
    return [
        (di, dj)
        for dj in range(-n, n + 1)
        for di in range(-n, n + 1)
        if (di, dj) != (0, 0) and cube.CELL_M * math.hypot(di, dj) <= max_dist_m + 1e-9
    ]


def box_cells(box: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    """Cells whose centre lies in ``box = (x0, y0, x1, y1)``: ``(i0, i1, j0, j1)``, ends included.

    May be empty (i0 > i1 or j0 > j1) if the box is outside the mesh.
    """
    x0, y0, x1, y1 = box
    i0 = max(0, math.ceil((x0 - cube.X_MIN_M) / cube.CELL_M - 0.5))
    i1 = min(cube.NX - 1, math.floor((x1 - cube.X_MIN_M) / cube.CELL_M - 0.5))
    j0 = max(0, math.ceil((cube.Y_MAX_M - y1) / cube.CELL_M - 0.5))
    j1 = min(cube.NY - 1, math.floor((cube.Y_MAX_M - y0) / cube.CELL_M - 0.5))
    return i0, i1, j0, j1


def find_pairs(
    both_units: np.ndarray,
    months: Sequence[str],
    boxes: dict[str, tuple[float, float, float, float]],
    max_dist_m: float = MAX_PAIR_DIST_M,
) -> list[Pair]:
    """Every qualifying pair, best month only, sorted by score (04 §5.1 step 2).

    ``both_units``: uint8 [months, NY, NX], the ``both`` band of the monthly layers (0.4 % units,
    255 = no data). A pair (A, B) appears once, with its best month (the earliest on a tie) and the
    first region (catalog order) whose box holds both cells. Order: score down, then month, region,
    A and B, so the result does not depend on how the arrays were walked.
    """
    if both_units.shape != (len(months), cube.NY, cube.NX):
        expected = (len(months), cube.NY, cube.NX)
        raise ValueError(f"both_units has shape {both_units.shape}, expected {expected}")
    u = both_units.astype(np.int16)
    best: dict[tuple[tuple[int, int], tuple[int, int]], Pair] = {}
    for region_id, box in boxes.items():
        i0, i1, j0, j1 = box_cells(box)
        if i0 > i1 or j0 > j1:
            continue
        sub = u[:, j0 : j1 + 1, i0 : i1 + 1]
        ny, nx = sub.shape[1:]
        for di, dj in pair_offsets(max_dist_m):
            # A at (ia, ja) and B at (ia + di, ja + dj), both inside the box.
            ia0, ia1 = max(0, -di), min(nx, nx - di)
            ja0, ja1 = max(0, -dj), min(ny, ny - dj)
            if ia0 >= ia1 or ja0 >= ja1:
                continue
            va = sub[:, ja0:ja1, ia0:ia1]
            vb = sub[:, ja0 + dj : ja1 + dj, ia0 + di : ia1 + di]
            ok = (
                (va != lay.NODATA)
                & (vb != lay.NODATA)
                & (va * lay.PCT_PER_UNIT >= MIN_BOTH_A_PCT - 1e-9)
                & (vb * lay.PCT_PER_UNIT <= MAX_BOTH_B_PCT + 1e-9)
            )
            for k, jj, ii in zip(*np.nonzero(ok), strict=True):
                a = (int(i0 + ia0 + ii), int(j0 + ja0 + jj))
                b = (a[0] + di, a[1] + dj)
                ua, ub = int(va[k, jj, ii]), int(vb[k, jj, ii])
                pair = Pair(
                    region_id, months[k], a, b,
                    round(ua * lay.PCT_PER_UNIT, 1), round(ub * lay.PCT_PER_UNIT, 1),
                    round((ua - ub) * lay.PCT_PER_UNIT, 1), cube.CELL_M * math.hypot(di, dj),
                )
                old = best.get((a, b))
                if old is None or pair.score_pct > old.score_pct:  # months go up: a tie keeps the earliest
                    best[(a, b)] = pair
    return sorted(best.values(), key=lambda p: (-p.score_pct, p.month, p.region_id, p.a, p.b))


def select_pairs(pairs: Sequence[Pair], n: int = N_PAIRS) -> list[Pair]:
    """The ``n`` best pairs, from distinct regions where possible (04 §5.1 step 3).

    First the best pair of each region, by score; if there are fewer than ``n`` regions, the rest
    are the next best pairs overall. The result is ordered by score like the input.
    """
    chosen: list[Pair] = []
    regions: set[str] = set()
    for p in pairs:
        if len(chosen) == n:
            break
        if p.region_id not in regions:
            chosen.append(p)
            regions.add(p.region_id)
    for p in pairs:
        if len(chosen) == n:
            break
        if p not in chosen:
            chosen.append(p)
    order = {id(p): k for k, p in enumerate(pairs)}
    return sorted(chosen, key=lambda p: order[id(p)])


# ---------------------------------------------------------------------------------------------
# Step 4: the landing date
# ---------------------------------------------------------------------------------------------


StatusFn = Callable[[str, float], str | None]  # (site key, landing unix) -> go / marginal / no_go / None


@dataclass(frozen=True)
class Landing:
    t_unix: float
    delay_s: float
    alternative: str  # site key of the other region
    level: int


def delays_s(level: int) -> list[float]:
    """Delays of the replanning landing: 12 d, or every 6 h from 10 to 16 d nearest to 12 d first."""
    if level < 1:
        return [DELAY_DAYS * DAY_S]
    lo, hi = (d * DAY_S for d in RELAXED_DELAY_DAYS)
    n = int(round((hi - lo) / SEARCH_STEP_S))
    out = [lo + k * SEARCH_STEP_S for k in range(n + 1)]
    return sorted(out, key=lambda d: (abs(d - DELAY_DAYS * DAY_S), d))


def valid_statuses(level: int) -> tuple[str, ...]:
    return ("go",) if level < 2 else ("go", "marginal")


def search_times(month: str) -> list[float]:
    """Landing times of month ``YYYY-MM`` every 6 h, from day 1 at 00:00Z to the end, excluded."""
    y, m = int(month[:4]), int(month[5:7])
    ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
    t0 = iso_to_unix(f"{y}-{m:02d}-01T00:00:00Z")
    t1 = iso_to_unix(f"{ny}-{nm:02d}-01T00:00:00Z")
    return [t0 + k * SEARCH_STEP_S for k in range(int((t1 - t0) // SEARCH_STEP_S))]


def find_landing(
    status: StatusFn, a: str, b: str, alternatives: Sequence[str], times: Iterable[float], level: int
) -> Landing | None:
    """The first ``t`` (then the delay nearest to 12 d, then the alternative in catalog order) that
    meets 04 §5.1 step 4 at relaxation ``level`` (0, 1 or 2). B must always be ``no_go``.
    """
    ok = valid_statuses(level)
    delays = delays_s(level)
    for t in times:
        if status(a, t) not in ok or status(b, t) != "no_go":
            continue
        for d in delays:
            if status(a, t + d) != "no_go":
                continue
            for alt in alternatives:
                if status(alt, t + d) in ok:
                    return Landing(t, d, alt, level)
    return None


# ---------------------------------------------------------------------------------------------
# Sites and their assessment
# ---------------------------------------------------------------------------------------------


@dataclass
class SiteModel:
    """A site with the mask used by ``assess`` (observer at 2 m)."""

    key: str
    lat_deg: float
    lon_deg: float
    mask: Mask
    relief_label: str
    frame: object = field(init=False)

    def __post_init__(self) -> None:
        self.frame = frame_for(self.lat_deg, self.lon_deg, self.mask)


class Assessor:
    """``assess`` of 07 §8.2 with a cache, and a fast `no_go` when a body is hidden at landing.

    The fast path gives the same status as ``assess_scenario``: a failed landing check is `no_go`
    whatever the night length (07 §8.2).
    """

    def __init__(
        self, table: EphemerisTable, sites: dict[str, SiteModel], mission_days: float = MISSION_DAYS,
        req: Requirements = DEFAULT_REQUIREMENTS,
    ) -> None:
        self.table, self.sites, self.mission_days, self.req = table, sites, mission_days, req
        self._status: dict[tuple[str, float], str | None] = {}
        self.full_calls = 0

    def status(self, key: str, t: float) -> str | None:
        k = (key, t)
        if k not in self._status:
            self._status[k] = self._compute(key, t)
        return self._status[k]

    def _compute(self, key: str, t: float) -> str | None:
        s = self.sites[key]
        try:
            at = evaluate(self.table, s.frame, s.mask, t)
        except OutOfRange:
            return None
        if (self.req.need_sun_at_landing and not at.sun.visible) or (
            self.req.need_earth_at_landing and not at.earth.visible
        ):
            return "no_go"
        return self.full(key, t)[0].status

    def full(self, key: str, t: float):
        """``(Assessment, Metrics)`` of a landing; None if outside the table."""
        s = self.sites[key]
        self.full_calls += 1
        try:
            return assess_scenario(self.table, s.frame, s.mask, t, self.mission_days, self.req)
        except OutOfRange:
            return None


def cell_site(i: int, j: int) -> tuple[float, float, float, float]:
    """``(lat, lon, x, y)`` of a cell centre; lat/lon rounded like horizon/<site>.json."""
    x, y = cube.cell_centre_xy(i, j)
    f = cube.frames_of_xy(x, y)
    lon = round(float(f.lon_deg[0]), LATLON_DECIMALS) + 0.0
    if lon <= -180.0:
        lon += 360.0
    return round(float(f.lat_deg[0]), LATLON_DECIMALS) + 0.0, lon, float(x), float(y)


def candidate_site(key: str, cell: tuple[int, int]) -> dict:
    """A catalog-like site for a cell (what A2 would add as ``demo-a`` / ``demo-b``)."""
    lat, lon, _, _ = cell_site(*cell)
    return {"id": key, "lat_deg": lat, "lon_deg": lon, "relief": PAIR_RELIEF,
            "observer_heights_m": list(OBSERVER_HEIGHTS_M)}


# ---------------------------------------------------------------------------------------------
# What blocks B, and the sentence
# ---------------------------------------------------------------------------------------------


def _summary(a: Assessment | None) -> dict | None:
    if a is None:
        return None
    return {"status": a.status, "reasons": list(a.reasons), "longest_night_h": round(a.longest_night_h, 2),
            "both_pct": round(a.both_pct, 1)}


def blocking_point(table: EphemerisTable, a: SiteModel, b: SiteModel, t: float, b_full) -> dict:
    """The body B misses and the terrain sample that hides it (07 §2 ``blocker_at``).

    The Sun if B has no Sun at landing, else the Earth if it has no Earth; if B only fails the
    night limit, the Sun in the middle of B's longest night.
    """
    assessment, metrics = b_full
    reasons = assessment.reasons
    if "no_sun_at_landing" in reasons:
        body, tb = "sun", t
    elif "no_earth_at_landing" in reasons:
        body, tb = "earth", t
    else:
        nights = metrics.windows.nights
        w = max(nights, key=lambda n: n.end_unix - n.start_unix) if nights else None
        body, tb = "sun", (w.start_unix + w.end_unix) / 2 if w else t
    sb = evaluate(table, b.frame, b.mask, tb)
    sa = evaluate(table, a.frame, a.mask, tb)
    st_b = sb.sun if body == "sun" else sb.earth
    st_a = sa.sun if body == "sun" else sa.earth
    blk = blocker_at(b.mask, st_b.az_deg)
    return {
        "body": body,
        "t_utc": unix_to_iso(tb)[:19] + "Z",
        "az_deg": round(st_b.az_deg, 2),
        "body_el_deg": round(st_b.el_deg, 3),
        "horizon_a_deg": round(horizon_at(a.mask.el, st_a.az_deg), 3),
        "visible_a": bool(st_a.visible),
        "horizon_b_deg": round(st_b.horizon_deg, 3),
        "visible_b": bool(st_b.visible),
        "blocker": {"az_deg": blk.az_deg, "el_deg": blk.el_deg, "dist_m": round(blk.dist_m),
                    "lat_deg": blk.lat_deg, "lon_deg": blk.lon_deg, "height_m": blk.height_m},
    }


def _distance(m: float) -> str:
    return f"{m:.0f} m" if m < 1000 else f"{m / 1000:.1f} km"


def cause_sentence(bp: dict, distance_m: float) -> str:
    """One English sentence with the cause, for A1 and the demo script."""
    name = "Sun" if bp["body"] == "sun" else "Earth"
    blk = bp["blocker"]
    return (
        f"At {bp['t_utc']} the {name} is {bp['body_el_deg']:.2f} deg high at azimuth {bp['az_deg']:.1f} deg. "
        f"Site A's horizon there is {bp['horizon_a_deg']:.2f} deg, so A "
        f"{'sees' if bp['visible_a'] else 'does not see'} it; site B, {distance_m:.0f} m away, has a "
        f"{bp['horizon_b_deg']:.2f} deg horizon set by terrain {_distance(blk['dist_m'])} away at "
        f"{blk['lat_deg']:.4f} deg, {blk['lon_deg']:.4f} deg ({blk['height_m']:.0f} m), so B "
        f"{'sees' if bp['visible_b'] else 'does not see'} it."
    )


# ---------------------------------------------------------------------------------------------
# The whole run
# ---------------------------------------------------------------------------------------------


def read_both_band(layers_dir: str | Path, months: Sequence[str]) -> np.ndarray:
    """uint8 [months, NY, NX]: the ``both`` band of ``layers/<YYYY-MM>.bin.gz``.

    Refuses the plan B-4 layers (``source = nasa_avgvisib``): they have no ``both`` band.
    """
    layers_dir = Path(layers_dir)
    meta = json.loads((layers_dir / "layers.json").read_text(encoding="utf-8"))
    if meta.get("source") != lay.SOURCE_COMPUTED:
        source = meta.get("source")
        raise ValueError(f"layers.json has source {source!r}: pick-demo needs the computed layers")
    out = np.empty((len(months), cube.NY, cube.NX), dtype=np.uint8)
    band = lay.BANDS.index("both")
    for k, mid in enumerate(months):
        path = layers_dir / f"{mid}.bin.gz"
        if not path.is_file():
            raise FileNotFoundError(f"Monthly layer {path} is missing: run make layers")
        out[k] = lay.read_layer(path, len(lay.BANDS))[band]
    return out


def region_alternatives(catalog: dict, light_dirs: Sequence[Path], log: Callable[[str], None]) -> list[dict]:
    """Candidate-region sites with a relief mask on disk, in catalog order (smooth ones are left out).

    Only sites of a region with a box (``region_id``): the points of the 2022 list (T-91, D-122) have
    none and are not alternatives for the demo pair.
    """
    out = []
    for s in catalog["sites"]:
        if s.get("type") != "candidate_region" or not s.get("region_id") or s.get("relief") == "smooth":
            continue
        for d in light_dirs:
            path = Path(d) / "horizon" / f"{s['id']}.json"
            if path.is_file():
                doc = json.loads(path.read_text(encoding="utf-8"))
                out.append({"site": s, "mask": load_mask(d, s["id"], ASSESS_HEIGHT_M),
                            "relief_label": doc["relief_label"], "dir": str(d)})
                break
        else:
            log(f"pick-demo: {s['id']} has no horizon file in {', '.join(map(str, light_dirs))}: left out")
    return out


MaskFn = Callable[[dict], tuple[dict | None, str]]  # site -> (horizon/<site>.json document, reason)


def pick_demo(
    both_units: np.ndarray,
    months: Sequence[str],
    catalog: dict,
    table: EphemerisTable,
    mask_fn: MaskFn,
    alternatives: Sequence[dict],
    log: Callable[[str], None] = print,
    profile_fn: Callable[[dict, float], str | None] | None = None,
) -> dict:
    """04 §5.1 steps 2 to 5. Returns the document of ``demo_candidates.json``.

    ``mask_fn(site)`` gives the horizon document of a candidate cell (law full, 2 and 10 m);
    ``alternatives`` come from :func:`region_alternatives`; ``profile_fn(site, az)`` may write a
    profile CSV for A11 and return its path.
    """
    regions = catalog_regions(catalog)
    boxes = cube.region_boxes_of(regions)
    alt_keys = [a["site"]["id"] for a in alternatives]
    sites: dict[str, SiteModel] = {
        a["site"]["id"]: SiteModel(a["site"]["id"], a["site"]["lat_deg"], a["site"]["lon_deg"], a["mask"],
                                   a["relief_label"])
        for a in alternatives
    }
    assessor = Assessor(table, sites)
    region_of_alt = {a["site"]["id"]: a["site"].get("region_id") for a in alternatives}

    candidates: list[dict] = []
    stages = [(MAX_PAIR_DIST_M, (0, 1, 2)), (RELAXED_PAIR_DIST_M, (3,))]
    n_pairs_found = {}
    for max_dist, levels in stages:
        pairs = find_pairs(both_units, months, boxes, max_dist)
        n_pairs_found[f"{max_dist:.0f}"] = len(pairs)
        chosen = select_pairs(pairs)
        log(f"pick-demo: {len(pairs)} pairs at <= {max_dist:.0f} m; best {len(chosen)}: "
            + "; ".join(f"{p.region_id} {p.month} {p.score_pct:.1f}" for p in chosen))
        for p in chosen:
            n = len(candidates) + 1
            cand = describe_pair(p, n, max_dist)
            ka, kb = f"cand{n}-a", f"cand{n}-b"
            models = {}
            for key, cell, role in ((ka, p.a, "a"), (kb, p.b, "b")):
                site = candidate_site(key, cell)
                doc, reason = mask_fn(site)
                if doc is None:
                    cand["error"] = f"no mask for {role.upper()}: {reason}"
                    break
                m = mask_from_file(doc, ASSESS_HEIGHT_M)
                models[key] = SiteModel(key, site["lat_deg"], site["lon_deg"], m, doc["relief_label"])
                cand[role].update(height_m=doc["site_height_m"], relief_label=doc["relief_label"],
                                  dem_stack=doc["dem_stack"], law=doc["law"])
            if "error" in cand:
                log(f"pick-demo: candidate {n}: {cand['error']}")
                candidates.append(cand)
                continue
            sites.update(models)
            alts = [k for k in alt_keys if region_of_alt[k] != p.region_id]
            times = search_times(p.month)
            landing = None
            for level in levels:
                landing = find_landing(assessor.status, ka, kb, alts, times, level)
                if landing is not None:
                    break
            if landing is None:
                cand["relaxation"] = None
                log(f"pick-demo: candidate {n} ({p.region_id}, {p.month}): no landing time meets step 4")
            else:
                fill_landing(cand, landing, assessor, table, models[ka], models[kb], p, profile_fn)
                log(f"pick-demo: candidate {n} ({p.region_id}, {p.month}): landing {cand['landing_utc']}, "
                    f"relaxation {landing.level}, alternative {landing.alternative}")
            candidates.append(cand)
        if any(c.get("landing_utc") for c in candidates):
            break
    found = [c for c in candidates if c.get("landing_utc")]
    level = min((c["relaxation"]["level"] for c in found), default=None)
    return {
        "format": FORMAT,
        "spec": "04_catalogo_sitios.md §5.1",
        "months": [months[0], months[-1]],
        "mission_days": MISSION_DAYS,
        "requirements": "default (07 §8.1)",
        "observer_height_m": ASSESS_HEIGHT_M,
        "search_step_h": SEARCH_STEP_S // 3600,
        "thresholds": {"min_both_a_pct": MIN_BOTH_A_PCT, "max_both_b_pct": MAX_BOTH_B_PCT},
        "pairs_found": n_pairs_found,
        "alternatives": [{"site_id": a["site"]["id"], "region_id": a["site"].get("region_id"),
                          "relief_label": a["relief_label"]} for a in alternatives],
        "relaxation_level": level,
        "relaxation": None if level is None else RELAXATIONS[level],
        "assess_calls": assessor.full_calls,
        "candidates": candidates,
    }


def describe_pair(p: Pair, n: int, max_dist_m: float) -> dict:
    def end(cell):
        lat, lon, x, y = cell_site(*cell)
        return {"cell": list(cell), "lat_deg": lat, "lon_deg": lon, "x_m": x, "y_m": y}

    return {
        "rank": n,
        "region_id": p.region_id,
        "month": p.month,
        "score_pct": p.score_pct,
        "both_a_pct": p.both_a_pct,
        "both_b_pct": p.both_b_pct,
        "distance_m": round(p.distance_m, 1),
        "max_pair_dist_m": max_dist_m,
        "a": end(p.a),
        "b": end(p.b),
        "landing_utc": None,
    }


def fill_landing(
    cand: dict, landing: Landing, assessor: Assessor, table: EphemerisTable, a: SiteModel, b: SiteModel,
    p: Pair, profile_fn,
) -> None:
    t, d = landing.t_unix, landing.delay_s
    a_t, b_t, a_d = assessor.full(a.key, t), assessor.full(b.key, t), assessor.full(a.key, t + d)
    alt_d = assessor.full(landing.alternative, t + d)
    bp = blocking_point(table, a, b, t, b_t)
    cand.update(
        landing_utc=unix_to_iso(t)[:19] + "Z",
        replan_utc=unix_to_iso(t + d)[:19] + "Z",
        delay_days=d / DAY_S,
        relaxation={"level": landing.level, "text": RELAXATIONS[landing.level]},
        assess={
            "a_at_landing": _summary(a_t[0]),
            "b_at_landing": _summary(b_t[0]),
            "a_at_replan": _summary(a_d[0]),
            "alternative_at_replan": {"site_id": landing.alternative, **(_summary(alt_d[0]) or {})},
        },
        blocking=bp,
        cause=cause_sentence(bp, p.distance_m),
    )
    if profile_fn is not None:
        cand["profile_csv"] = {
            "a": profile_fn(candidate_site(f"demo-cand{cand['rank']}-a", p.a), bp["blocker"]["az_deg"]),
            "b": profile_fn(candidate_site(f"demo-cand{cand['rank']}-b", p.b), bp["blocker"]["az_deg"]),
        }


def summary_lines(doc: dict) -> list[str]:
    """A short table for the terminal."""
    lines = [f"relaxation: {doc['relaxation'] or 'no pair found'}"]
    for c in doc["candidates"]:
        a, b = c["a"], c["b"]
        head = (f"#{c['rank']} {c['region_id']} {c['month']}: A {a['lat_deg']:.5f}, {a['lon_deg']:.5f} "
                f"(both {c['both_a_pct']:.1f} %), B {b['lat_deg']:.5f}, {b['lon_deg']:.5f} "
                f"(both {c['both_b_pct']:.1f} %), {c['distance_m']:.0f} m")
        lines.append(head)
        if c.get("error"):
            lines.append(f"    {c['error']}")
        elif c.get("landing_utc"):
            lines.append(f"    landing {c['landing_utc']} UTC, replan {c['replan_utc']} UTC -> "
                         f"{c['assess']['alternative_at_replan']['site_id']}; {c['cause']}")
        else:
            lines.append("    no landing time meets step 4")
    return lines
