# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Horizon masks, visibility criteria and the state of the sky at one instant.

Specification: 07_visibilidad.md §1 (types), §2 (horizon at any azimuth), §3 (criteria) and §5
(``evaluate``); 06_horizonte.md §9 (smooth Moon). This is the Python reference of the visibility
core: same algorithm and the same operations, in the same order, as web/src/core/horizon.ts and
web/src/core/visibility.ts (07 §12). It reads the ephemeris table, never SPICE (07 §12.2).

«There is Sun» and «there is a link» mean that the centre of the disc is above the real horizon:
margin > 0, and a margin of exactly 0 is not visible (07 §3).
"""

from __future__ import annotations

import json
import math
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple

import numpy as np

from pipeline.ephem.interp import EphemerisTable, SiteFrame, site_frame, sky_at
from pipeline.horizon.engine_ref import smooth_horizon
from pipeline.horizon.engine_ref import smooth_mask as engine_smooth_mask
from pipeline.horizon.law import AZ_STEP_DEG, N_AZ
from pipeline.vis.discs import disc_fraction
from pipeline.vis.eclipse import DEG, EclipseState, eclipse_state

# ------------------------------------------------------------------------------------- masks


@dataclass(frozen=True)
class Mask:
    """One observer height of ``horizon/<site>.json`` (07 §1), plus the site height (D-64)."""

    observer_height_m: float
    site_height_m: float  # terrain height at the site; 0 on a smooth Moon
    el_deg: np.ndarray  # float64 [720]: horizon elevation every 0.5° of azimuth
    dist_m: np.ndarray
    blk_lat_deg: np.ndarray
    blk_lon_deg: np.ndarray
    blk_height_m: np.ndarray
    min_el_deg: float
    max_el_deg: float
    el: tuple[float, ...]  # the values of ``el_deg`` as Python floats, for the scalar code


@dataclass(frozen=True)
class Blocker:
    """The mask sample that sets the horizon in one azimuth (07 §2)."""

    az_deg: float
    el_deg: float
    dist_m: float
    lat_deg: float
    lon_deg: float
    height_m: float


def _vector(values, name: str) -> np.ndarray:
    a = np.array(values, dtype=np.float64)
    if a.shape != (N_AZ,):
        raise ValueError(f"A mask needs {N_AZ} values of {name}, got shape {a.shape}")
    a.setflags(write=False)
    return a


def make_mask(
    observer_height_m: float, site_height_m: float, el_deg, dist_m, blk_lat_deg, blk_lon_deg, blk_height_m
) -> Mask:
    """Mask from five 720-value vectors; the minimum and maximum elevation are computed here."""
    el = _vector(el_deg, "el_deg")
    values = tuple(el.tolist())
    return Mask(
        observer_height_m=float(observer_height_m),
        site_height_m=float(site_height_m),
        el_deg=el,
        dist_m=_vector(dist_m, "dist_m"),
        blk_lat_deg=_vector(blk_lat_deg, "blk_lat_deg"),
        blk_lon_deg=_vector(blk_lon_deg, "blk_lon_deg"),
        blk_height_m=_vector(blk_height_m, "blk_height_m"),
        min_el_deg=min(values),
        max_el_deg=max(values),
        el=values,
    )


def mask_from_file(doc: dict, observer_height_m: float) -> Mask:
    """Mask of a ``horizon/<site>.json`` document for one observer height.

    The values are the published ones, with the rounding of the contract, like the web reads them
    (07 §12.2).
    """
    for m in doc["masks"]:
        if m["observer_height_m"] == observer_height_m:
            return make_mask(
                observer_height_m, doc["site_height_m"],
                m["el_deg"], m["dist_m"], m["blk_lat_deg"], m["blk_lon_deg"], m["blk_height_m"],
            )
    heights = [m["observer_height_m"] for m in doc["masks"]]
    raise ValueError(f"No mask for an observer at {observer_height_m} m in {doc.get('site_id')}: {heights}")


def load_mask(data_dir: Path | str, site_id: str, observer_height_m: float) -> Mask:
    """Read ``horizon/<site_id>.json`` from a light-origin folder (for example ``web/public/data``)."""
    path = Path(data_dir) / "horizon" / f"{site_id}.json"
    return mask_from_file(json.loads(path.read_text(encoding="utf-8")), observer_height_m)


def smooth_mask(observer_height_m: float, lat_deg: float | None = None, lon_deg: float | None = None) -> Mask:
    """Smooth-Moon mask (06 §9): the same dip in every azimuth, site height 0.

    The blocking points need the site; without it they are NaN and only the elevations are
    meaningful (decision D-64 c).
    """
    if lat_deg is not None and lon_deg is not None:
        m = engine_smooth_mask(lat_deg, lon_deg, [observer_height_m]).masks[0]
        return make_mask(
            observer_height_m, 0.0, m.el_deg, m.dist_m, m.blk_lat_deg, m.blk_lon_deg, m.blk_height_m
        )
    el_deg, dist_m = smooth_horizon(observer_height_m)
    nan = np.full(N_AZ, np.nan)
    el, dist = np.full(N_AZ, el_deg), np.full(N_AZ, dist_m)
    return make_mask(observer_height_m, 0.0, el, dist, nan, nan, np.zeros(N_AZ))


# Formula masks of 07 §12.3: kind -> number of arguments.
FORMULA_ARGS = {"flat": 1, "tilt": 1, "sine": 2}


def formula_mask(mask_id: str) -> Mask:
    """Synthetic masks of the shared vectors (07 §12.3), from their identifier.

    ``flat:<deg>``; ``tilt:<deg>`` = deg·(az − 180)/180; ``sine:<amp>,<k>`` = amp·sin(k·az).
    Observer at 0 m, site height 0, no blocking points (NaN).
    """
    kind, _, args = mask_id.partition(":")
    if kind not in FORMULA_ARGS:
        raise ValueError(f"Unknown formula mask {mask_id}")
    try:
        p = [float(x) for x in args.split(",")]
    except ValueError:
        raise ValueError(f"Bad formula mask {mask_id}") from None
    if len(p) != FORMULA_ARGS[kind] or not all(math.isfinite(x) for x in p):
        raise ValueError(f"Bad formula mask {mask_id}")
    el = []
    for j in range(N_AZ):
        az = AZ_STEP_DEG * j
        if kind == "flat":
            el.append(p[0])
        elif kind == "tilt":
            el.append((p[0] * (az - 180)) / 180)
        else:
            el.append(p[0] * math.sin(p[1] * az * DEG))
    nan = np.full(N_AZ, np.nan)
    return make_mask(0.0, 0.0, el, nan, nan, nan, nan)


# ------------------------------------------------------------------- horizon at any azimuth


def wrap_az(az_deg: float) -> float:
    """Azimuth reduced to [0, 360) the way 07 §2 writes it: ((az mod 360) + 360) mod 360.

    ``mod`` is the remainder with the sign of the dividend (``math.fmod``, the ``%`` of JavaScript),
    not Python's ``%``: only so do both languages give the same bits.
    """
    return math.fmod(math.fmod(az_deg, 360.0) + 360.0, 360.0)


def horizon_at(el: Sequence[float], az_deg: float) -> float:
    """Periodic linear interpolation between the two neighbouring mask samples (07 §2)."""
    x = wrap_az(az_deg) / AZ_STEP_DEG
    j = math.floor(x)
    f = x - j
    return (1 - f) * el[j % N_AZ] + f * el[(j + 1) % N_AZ]


def blocker_at(mask: Mask, az_deg: float) -> Blocker:
    """Nearest mask sample, not interpolated (07 §2). Rounding is half up: floor(x + 0.5)."""
    j = math.floor(wrap_az(az_deg) / AZ_STEP_DEG + 0.5) % N_AZ
    return Blocker(
        az_deg=AZ_STEP_DEG * j,
        el_deg=float(mask.el_deg[j]),
        dist_m=float(mask.dist_m[j]),
        lat_deg=float(mask.blk_lat_deg[j]),
        lon_deg=float(mask.blk_lon_deg[j]),
        height_m=float(mask.blk_height_m[j]),
    )


# ------------------------------------------------------------------ state of the sky (07 §5)


@dataclass(frozen=True)
class BodyState:
    """``BodySky`` of 05 §4.6 plus the horizon in its azimuth (07 §1)."""

    az_deg: float
    el_deg: float
    range_km: float
    radius_deg: float
    horizon_deg: float
    margin_deg: float
    visible: bool


@dataclass(frozen=True)
class SunState(BodyState):
    disc_fraction: float  # share of the disc above the horizon
    lit_fraction: float  # disc_fraction · (1 − eclipse.covered) (07 §4.3)


@dataclass(frozen=True)
class SkyState:
    t_unix: float
    sun: SunState
    earth: BodyState
    both: bool
    eclipse: EclipseState


class Margins(NamedTuple):
    sun: float
    earth: float
    sun_el: float


def frame_for(lat_deg: float, lon_deg: float, mask: Mask) -> SiteFrame:
    """Frame of a site for a mask: height = terrain at the site + observer height (07 §5)."""
    return site_frame(lat_deg, lon_deg, mask.site_height_m + mask.observer_height_m)


def evaluate(table: EphemerisTable, frame: SiteFrame, mask: Mask, t: float) -> SkyState:
    """State of the sky at Unix time ``t`` (07 §5). ``frame`` comes from :func:`frame_for`."""
    sky = sky_at(table, frame, t)
    s, e = sky["sun"], sky["earth"]
    sun_horizon = horizon_at(mask.el, s["az_deg"])
    sun_margin = s["el_deg"] - sun_horizon
    earth_horizon = horizon_at(mask.el, e["az_deg"])
    earth_margin = e["el_deg"] - earth_horizon
    disc = disc_fraction(mask, s["az_deg"], s["el_deg"], s["radius_deg"])
    eclipse = eclipse_state(sky)
    return SkyState(
        t_unix=t,
        sun=SunState(
            az_deg=s["az_deg"], el_deg=s["el_deg"], range_km=s["range_km"], radius_deg=s["radius_deg"],
            horizon_deg=sun_horizon, margin_deg=sun_margin, visible=sun_margin > 0,
            disc_fraction=disc, lit_fraction=disc * (1 - eclipse.covered),
        ),
        earth=BodyState(
            az_deg=e["az_deg"], el_deg=e["el_deg"], range_km=e["range_km"], radius_deg=e["radius_deg"],
            horizon_deg=earth_horizon, margin_deg=earth_margin, visible=earth_margin > 0,
        ),
        both=sun_margin > 0 and earth_margin > 0,
        eclipse=eclipse,
    )


def margins(table: EphemerisTable, frame: SiteFrame, mask: Mask, t: float) -> Margins:
    """Margins only (no disc fraction): the cheap function that the event search evaluates."""
    sky = sky_at(table, frame, t)
    s, e = sky["sun"], sky["earth"]
    return Margins(
        sun=s["el_deg"] - horizon_at(mask.el, s["az_deg"]),
        earth=e["el_deg"] - horizon_at(mask.el, e["az_deg"]),
        sun_el=s["el_deg"],
    )
