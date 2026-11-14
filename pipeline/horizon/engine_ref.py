# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Reference horizon engine (NumPy, float64).

docs/spec/06_horizonte.md §4-§7 and §9. For a site and an observer height, the mask gives the
elevation of the real horizon in each of the 720 azimuths and the terrain point that fixes it.
It does not depend on the date.

Geometry: every ray follows the great circle that leaves the site with the given azimuth
(unit vectors in MOON_ME, so the pole and the ±180° meridian need no special case); each
sample takes its height from the DEM stack and its elevation is computed in 3D with curvature.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from pipeline.common.constants import R_MOON_M
from pipeline.common.geo import enu_basis, latlon_of_unit, unit_vector, wrap180
from pipeline.dem.stack import LABEL_SMOOTH, DemStack
from pipeline.horizon.law import AZ_STEP_DEG, N_AZ, law_distances, law_params
from pipeline.horizon.profile import PROFILE_BINS, reduce_profile

DEFAULT_OBSERVER_HEIGHTS_M = (2.0, 10.0)  # masks[0] and masks[1] (06 §7)
PROFILE_OBSERVER_HEIGHT_M = 2.0  # the profile is always seen by the 2 m observer (06 §8)
AZ_BLOCK = 90  # azimuths computed at a time, to bound the memory (06 §5)
NODATA_WARNING_FRACTION = 0.01  # stats.warning = "nodata" above 1 % of the samples (06 §6)


class SiteOutsideRelief(ValueError):
    """The site has no height in any DEM of the stack (06 §6)."""

    def __init__(self, lat_deg: float, lon_deg: float):
        super().__init__(f"Site ({lat_deg}, {lon_deg}) is outside every DEM of the relief stack")
        self.lat_deg = lat_deg
        self.lon_deg = lon_deg


@dataclass
class ObserverMask:
    """Mask for one observer height: five arrays of 720 values, index j = azimuth 0.5°·j."""

    observer_height_m: float
    el_deg: np.ndarray  # elevation of the horizon (may be negative)
    dist_m: np.ndarray  # distance on the reference sphere to the blocking point
    blk_lat_deg: np.ndarray
    blk_lon_deg: np.ndarray  # (-180, 180]
    blk_height_m: np.ndarray


@dataclass
class HorizonMask:
    lat_deg: float
    lon_deg: float  # (-180, 180]
    site_height_m: float
    relief_label: str
    dem_stack: list[str]  # names of the grids, in priority order
    law: str | None  # None for the smooth Moon (nothing is sampled)
    max_dist_m: float | None  # last distance of the law
    masks: list[ObserverMask]  # same order as the observer heights asked
    stats: dict
    profile: np.ndarray | None  # int16 [720, 512] (06 §8); None for the smooth Moon
    profile_observer_height_m: float = PROFILE_OBSERVER_HEIGHT_M


@dataclass
class RaySamples:
    """Unreduced samples of some rays (for ``profile-csv`` and for the tests)."""

    az_deg: np.ndarray  # [n_az]
    dist_m: np.ndarray  # [N_S]
    points: np.ndarray  # unit vectors in MOON_ME, [n_az, N_S, 3]
    height_m: np.ndarray  # [n_az, N_S], NaN where not valid
    valid: np.ndarray  # [n_az, N_S]
    grid_index: np.ndarray  # [n_az, N_S], -1 where not valid
    el_rad: np.ndarray  # [n_az, N_S], closed form; meaningless where not valid
    site_height_m: float
    observer_height_m: float


def azimuths_deg() -> np.ndarray:
    """The 720 azimuths of a mask, degrees from north towards east."""
    return np.arange(N_AZ) * AZ_STEP_DEG


def ray_points(u0, east, north, az_rad, theta) -> np.ndarray:
    """Unit vectors ``P(a, i) = cos θ_i · u0 + sin θ_i · t(a)``, shape [n_az, N_S, 3] (06 §4.1)."""
    az_rad = np.atleast_1d(np.asarray(az_rad, dtype=np.float64))
    theta = np.atleast_1d(np.asarray(theta, dtype=np.float64))
    tangent = np.cos(az_rad)[:, None] * north + np.sin(az_rad)[:, None] * east  # [n_az, 3]
    return np.cos(theta)[None, :, None] * u0 + np.sin(theta)[None, :, None] * tangent[:, None, :]


def elevation_rad(h, h_site: float, h_obs: float, theta):
    """Elevation of terrain samples seen from the observer, radians (06 §4.3).

    ``h`` is the terrain height at central angle ``theta`` from the site. The vertical offset
    is written so that it does not subtract two numbers of ~1.7e6 m.
    """
    r_t = R_MOON_M + h
    vertical = (h - h_site - h_obs) - 2.0 * r_t * np.sin(theta / 2.0) ** 2
    return np.arctan2(vertical, r_t * np.sin(theta))


def elevation_cartesian(u0, up, p, r_o, r_t):
    """Literal 3D form of :func:`elevation_rad`, radians. Tests only (06 §4.3)."""
    v = np.asarray(r_t)[..., None] * p - r_o * u0
    v_up = v @ up
    return np.arctan2(v_up, np.sqrt(np.sum(v * v, axis=-1) - v_up**2))


def smooth_horizon(observer_height_m: float) -> tuple[float, float]:
    """Horizon of the smooth Moon: (elevation in degrees, distance to the tangent point in metres)."""
    dip = math.acos(R_MOON_M / (R_MOON_M + observer_height_m))
    return -math.degrees(dip) + 0.0, R_MOON_M * dip  # "+ 0.0": no negative zero at 0 m


def _check_heights(observer_heights_m: Sequence[float]) -> list[float]:
    heights = [float(h) for h in observer_heights_m]
    if not heights or any(not math.isfinite(h) or h < 0 for h in heights):
        raise ValueError(f"Observer heights must be a non-empty list of values >= 0 m, got {heights}")
    return heights


def _check_site(lat_deg: float, lon_deg: float) -> tuple[float, float]:
    lat_deg = float(lat_deg)
    if not -90.0 <= lat_deg <= 90.0:
        raise ValueError(f"Latitude {lat_deg} outside [-90, 90]")
    return lat_deg, float(wrap180(lon_deg))


def _smooth_observer_mask(u0, east, north, ho: float) -> ObserverMask:
    el_deg, dist_m = smooth_horizon(ho)
    points = ray_points(u0, east, north, np.radians(azimuths_deg()), dist_m / R_MOON_M)[:, 0, :]
    blk_lat, blk_lon = latlon_of_unit(points)
    return ObserverMask(
        observer_height_m=ho,
        el_deg=np.full(N_AZ, el_deg),
        dist_m=np.full(N_AZ, dist_m),
        blk_lat_deg=np.asarray(blk_lat, dtype=np.float64),
        blk_lon_deg=np.asarray(blk_lon, dtype=np.float64),
        blk_height_m=np.zeros(N_AZ),
    )


def smooth_mask(
    lat_deg: float, lon_deg: float, observer_heights_m: Sequence[float] = DEFAULT_OBSERVER_HEIGHTS_M
) -> HorizonMask:
    """Mask of the smooth Moon: the same dip in every azimuth (06 §9)."""
    heights = _check_heights(observer_heights_m)
    lat_deg, lon_deg = _check_site(lat_deg, lon_deg)
    u0 = unit_vector(lat_deg, lon_deg)
    east, north, _ = enu_basis(lat_deg, lon_deg)
    masks = [_smooth_observer_mask(u0, east, north, ho) for ho in heights]
    el0 = float(masks[0].el_deg[0])
    stats = {
        "truncated_az": 0,
        "min_truncation_dist_m": None,
        "nodata_samples": 0,
        "empty_az": 0,
        "grid_usage": {},
        "min_el_deg": el0,
        "max_el_deg": el0,
        "warning": None,
    }
    return HorizonMask(
        lat_deg=lat_deg,
        lon_deg=lon_deg,
        site_height_m=0.0,
        relief_label=LABEL_SMOOTH,
        dem_stack=[],
        law=None,
        max_dist_m=None,
        masks=masks,
        stats=stats,
        profile=None,
    )


def _site_height(stack: DemStack, u0, lat_deg: float, lon_deg: float) -> float:
    h_site, ok, _ = stack.height_m(u0)
    if not ok:
        raise SiteOutsideRelief(lat_deg, lon_deg)
    return float(h_site)


def ray_samples(
    lat_deg: float,
    lon_deg: float,
    stack: DemStack,
    az_deg,
    observer_height_m: float = PROFILE_OBSERVER_HEIGHT_M,
    law: str = "full",
) -> RaySamples:
    """Every sample of the rays of the given azimuths, without reducing (06 §8, ``profile-csv``)."""
    lat_deg, lon_deg = _check_site(lat_deg, lon_deg)
    (ho,) = _check_heights([observer_height_m])
    u0 = unit_vector(lat_deg, lon_deg)
    east, north, _ = enu_basis(lat_deg, lon_deg)
    h_site = _site_height(stack, u0, lat_deg, lon_deg)
    dist = law_distances(law)
    theta = dist / R_MOON_M
    az = np.atleast_1d(np.asarray(az_deg, dtype=np.float64))
    points = ray_points(u0, east, north, np.radians(az), theta)
    h, valid, grid_index = stack.height_m(points)
    return RaySamples(
        az_deg=az,
        dist_m=dist,
        points=points,
        height_m=h,
        valid=valid,
        grid_index=grid_index,
        el_rad=elevation_rad(h, h_site, ho, theta),
        site_height_m=h_site,
        observer_height_m=ho,
    )


def horizon_mask(
    lat_deg: float,
    lon_deg: float,
    stack: DemStack | None,
    observer_heights_m: Sequence[float] = DEFAULT_OBSERVER_HEIGHTS_M,
    law: str = "full",
) -> HorizonMask:
    """Horizon mask of a site (06 §5). ``stack=None`` gives the smooth Moon.

    Raises :class:`SiteOutsideRelief` if the stack has no height at the site.
    """
    if stack is None:
        return smooth_mask(lat_deg, lon_deg, observer_heights_m)
    heights = _check_heights(observer_heights_m)
    lat_deg, lon_deg = _check_site(lat_deg, lon_deg)
    n_s = law_params(law).n_samples
    u0 = unit_vector(lat_deg, lon_deg)
    east, north, _ = enu_basis(lat_deg, lon_deg)
    h_site = _site_height(stack, u0, lat_deg, lon_deg)
    dist = law_distances(law)
    theta = dist / R_MOON_M

    out = [{k: np.empty(N_AZ) for k in ("el", "dist", "lat", "lon", "h")} for _ in heights]
    profile = np.empty((N_AZ, PROFILE_BINS), dtype=np.int16)
    truncated_az = 0
    min_truncation = math.inf
    nodata_samples = 0
    empty_az = 0
    grid_counts = np.zeros(len(stack.grids), dtype=np.int64)

    for j0 in range(0, N_AZ, AZ_BLOCK):
        rows = slice(j0, min(j0 + AZ_BLOCK, N_AZ))
        n_rows = rows.stop - rows.start
        az_rad = np.radians(AZ_STEP_DEG * np.arange(rows.start, rows.stop))
        points = ray_points(u0, east, north, az_rad, theta)  # [n_rows, N_S, 3]
        h, valid, grid_index = stack.height_m(points)  # [n_rows, N_S]

        # Statistics (06 §6). A ray is "truncated" when its last samples are not valid (it left
        # every DEM); invalid samples before the last valid one are holes ("nodata").
        any_valid = valid.any(axis=1)
        last_valid = n_s - 1 - np.argmax(valid[:, ::-1], axis=1)  # only meaningful where any_valid
        truncated = ~valid[:, -1]
        if truncated.any():
            truncated_az += int(truncated.sum())
            cut = np.where(any_valid, dist[last_valid], 0.0)[truncated]
            min_truncation = min(min_truncation, float(cut.min()))
        nodata_samples += int(((last_valid + 1 - valid.sum(axis=1))[any_valid]).sum())
        empty_az += int((~any_valid).sum())
        grid_counts += np.bincount(grid_index[valid], minlength=len(stack.grids))

        ar = np.arange(n_rows)
        el_profile = None
        for store, ho in zip(out, heights, strict=True):
            el = elevation_rad(h, h_site, ho, theta)
            el[~valid] = -np.inf
            if ho == PROFILE_OBSERVER_HEIGHT_M:
                el_profile = el
            i_star = np.argmax(el, axis=1)  # first maximum: the nearest sample on a tie
            store["el"][rows] = np.degrees(el[ar, i_star])
            store["dist"][rows] = dist[i_star]
            store["h"][rows] = h[ar, i_star]
            blk_lat, blk_lon = latlon_of_unit(points[ar, i_star])
            store["lat"][rows] = blk_lat
            store["lon"][rows] = blk_lon
            if not any_valid.all():
                # No valid sample in the azimuth: smooth Moon values (06 §6).
                smooth = _smooth_observer_mask(u0, east, north, ho)
                js = np.arange(rows.start, rows.stop)[~any_valid]
                store["el"][js] = smooth.el_deg[js]
                store["dist"][js] = smooth.dist_m[js]
                store["h"][js] = smooth.blk_height_m[js]
                store["lat"][js] = smooth.blk_lat_deg[js]
                store["lon"][js] = smooth.blk_lon_deg[js]
        if el_profile is None:
            el_profile = elevation_rad(h, h_site, PROFILE_OBSERVER_HEIGHT_M, theta)
        profile[rows] = reduce_profile(h, el_profile, valid)

    masks = [
        ObserverMask(
            observer_height_m=ho,
            el_deg=store["el"],
            dist_m=store["dist"],
            blk_lat_deg=store["lat"],
            blk_lon_deg=store["lon"],
            blk_height_m=store["h"],
        )
        for store, ho in zip(out, heights, strict=True)
    ]
    total = N_AZ * n_s
    stats = {
        "truncated_az": truncated_az,
        "min_truncation_dist_m": min_truncation if truncated_az else None,
        "nodata_samples": nodata_samples,
        "empty_az": empty_az,
        "grid_usage": {g.name: float(c) / total for g, c in zip(stack.grids, grid_counts, strict=True)},
        "min_el_deg": float(masks[0].el_deg.min()),
        "max_el_deg": float(masks[0].el_deg.max()),
        "warning": "nodata" if nodata_samples > NODATA_WARNING_FRACTION * total else None,
    }
    return HorizonMask(
        lat_deg=lat_deg,
        lon_deg=lon_deg,
        site_height_m=h_site,
        relief_label=stack.label,
        dem_stack=[g.name for g in stack.grids],
        law=law,
        max_dist_m=float(dist[-1]),
        masks=masks,
        stats=stats,
        profile=profile,
    )
