# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""The site catalog ``contract/sites.catalog.json`` and the order of the site batch.

docs/spec/04_catalogo_sitios.md. A2 keeps the catalog; the pipeline turns it into ``sites.json``
(09_contrato_datos.md §4) by adding ``height_m``, ``relief_label``, ``has_mask`` and
``has_profile``. Besides ``defaults`` and ``sites``, the catalog has a ``regions`` list (side and
status of each candidate region, decision D-84): ``python -m pipeline.cli regions`` and the cube
plan read the boxes from it, so the table of 04 §3 lives in one place only (decision D-52).
"""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = REPO_ROOT / "contract" / "sites.catalog.json"

# Fields of a catalog site, in the order of sites.json (09 §4); the pipeline adds the other four.
CATALOG_FIELDS = (
    "id", "name", "short_name", "type", "lat_deg", "lon_deg", "mission", "operator", "landing_utc",
    "landing_date", "relief", "observer_heights_m", "replan_candidate", "region_id", "source", "note",
)
PIPELINE_FIELDS = ("height_m", "relief_label", "has_mask", "has_profile")
SITE_FIELDS = (
    "id", "name", "short_name", "type", "lat_deg", "lon_deg", "height_m", "mission", "operator",
    "landing_utc", "landing_date", "relief", "relief_label", "has_mask", "has_profile",
    "observer_heights_m", "replan_candidate", "region_id", "source", "note",
)

# Batch order (04 §6). Group 1 starts with every candidate region, in catalog order.
FIRST_BATCH = ("im-2", "change-7-candidate", "shackleton-floor", "blue-ghost-1", "apollo-11")
SECOND_BATCH = ("val-899s", "im-2-planned", "demo-a", "demo-b")
THIRD_BATCH = ("apollo-17", "slim", "chandrayaan-3", "change-4", "change-6", "im-1")


def load_catalog(path: str | Path | None = None) -> dict:
    """The catalog as a dict. Raises ValueError if a site lacks a field or repeats an id."""
    path = Path(path) if path is not None else CATALOG_PATH
    catalog = json.loads(path.read_text(encoding="utf-8"))
    ids = set()
    for site in catalog["sites"]:
        missing = [f for f in CATALOG_FIELDS if f not in site]
        extra = [f for f in site if f not in CATALOG_FIELDS]
        if missing or extra:
            raise ValueError(f"Catalog site {site.get('id')!r}: missing {missing}, unexpected {extra}")
        if site["id"] in ids:
            raise ValueError(f"Catalog site id {site['id']!r} is repeated")
        ids.add(site["id"])
    return catalog


@cache
def default_catalog() -> dict:
    return load_catalog(CATALOG_PATH)


def sites_by_id(catalog: dict) -> dict[str, dict]:
    return {s["id"]: s for s in catalog["sites"]}


def batch_order(catalog: dict) -> list[str]:
    """Site ids in the order of ``make sites`` (04 §6).

    1. The candidate regions, ``im-2``, ``change-7-candidate``, ``shackleton-floor``,
       ``blue-ghost-1``, ``apollo-11``. 2. ``val-899s``, ``im-2-planned``, ``demo-a``, ``demo-b``.
    3. ``apollo-17``, ``slim``, ``chandrayaan-3``, ``change-4``, ``change-6``, ``im-1``, then the
    other landings by date. Last, any other site of the catalog, in catalog order. Ids that are not
    in the catalog (``demo-a`` before it exists) are left out.
    """
    sites = catalog["sites"]
    known = {s["id"] for s in sites}
    order: list[str] = []

    def add(ids):
        for site_id in ids:
            if site_id in known and site_id not in order:
                order.append(site_id)

    add(s["id"] for s in sites if s["type"] == "candidate_region")
    add(FIRST_BATCH)
    add(SECOND_BATCH)
    add(THIRD_BATCH)
    landings = [s for s in sites if s["type"] == "landing"]
    add(s["id"] for s in sorted(landings, key=lambda s: s["landing_date"] or ""))  # stable: ties keep order
    add(s["id"] for s in sites)
    return order


def catalog_regions(catalog: dict) -> tuple[tuple[str, float, float, float], ...]:
    """``(region_id, lat_deg, lon_deg, size_km)`` of each region; the point is that of its site."""
    by_id = sites_by_id(catalog)
    out = []
    for region in catalog["regions"]:
        site = by_id[region["site_id"]]
        if site["region_id"] != region["id"]:
            raise ValueError(f"Region {region['id']!r} and site {site['id']!r} do not point to each other")
        out.append((region["id"], float(site["lat_deg"]), float(site["lon_deg"]), float(region["size_km"])))
    return tuple(out)
