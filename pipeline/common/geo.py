# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Longitude wrapping and latitude/longitude <-> MOON_ME vectors.

docs/spec/03_datos_y_fuentes.md §3.4 and docs/spec/00_indice.md §3.
Latitude is planetocentric (north positive), longitude is east positive.
All functions are vectorised with NumPy and work in float64.
"""

from __future__ import annotations

import numpy as np

from pipeline.common.constants import R_MOON_KM


def _scalar_or_array(x):
    return float(x) if np.ndim(x) == 0 else x


def wrap360(lon_deg):
    """Longitude in [0, 360). Internal convention for SLDEM2015 tiles and crops."""
    r = np.mod(np.asarray(lon_deg, dtype=np.float64), 360.0)
    r = np.where(r >= 360.0, 0.0, r)  # np.mod(-1e-17, 360) rounds to 360.0
    return _scalar_or_array(r)


def wrap180(lon_deg):
    """Longitude in (-180, 180]. Convention of every contract file and of the UI."""
    r = np.asarray(wrap360(lon_deg), dtype=np.float64)
    r = np.where(r > 180.0, r - 360.0, r)
    return _scalar_or_array(r)


def unit_vector(lat_deg, lon_deg) -> np.ndarray:
    """Unit vector(s) in MOON_ME, shape [..., 3]."""
    lat = np.radians(np.asarray(lat_deg, dtype=np.float64))
    lon = np.radians(np.asarray(lon_deg, dtype=np.float64))
    cos_lat = np.cos(lat)
    return np.stack([cos_lat * np.cos(lon), cos_lat * np.sin(lon), np.sin(lat)], axis=-1)


def latlon_of_unit(u):
    """(lat_deg, lon_deg) of vector(s) [..., 3]; longitude in (-180, 180]. The norm is ignored."""
    u = np.asarray(u, dtype=np.float64)
    x, y, z = u[..., 0], u[..., 1], u[..., 2]
    lat = np.degrees(np.arctan2(z, np.hypot(x, y)))
    lon = wrap180(np.degrees(np.arctan2(y, x)))
    return _scalar_or_array(lat), lon


def site_position_km(lat_deg, lon_deg, h_m=0.0) -> np.ndarray:
    """Position in MOON_ME, km, of a point at height ``h_m`` (metres) above the reference sphere."""
    r = R_MOON_KM + np.asarray(h_m, dtype=np.float64) / 1000.0
    return np.asarray(r)[..., None] * unit_vector(lat_deg, lon_deg)


def latlon_height_of_position_km(p):
    """Inverse of :func:`site_position_km`: (lat_deg, lon_deg, h_m)."""
    p = np.asarray(p, dtype=np.float64)
    lat, lon = latlon_of_unit(p)
    h_m = (np.linalg.norm(p, axis=-1) - R_MOON_KM) * 1000.0
    return lat, lon, _scalar_or_array(h_m)
