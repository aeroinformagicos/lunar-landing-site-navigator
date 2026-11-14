# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Reference azimuth and elevation of the Sun and the Earth with SPICE (05_efemerides.md §3).

This is the function that is compared with JPL Horizons. The observer is fixed on the Moon at the
site position, so light time, stellar aberration and the parallax between the centre of the Moon
and the surface are all included. The kernels must be loaded first
(:func:`pipeline.ephem.kernels.load_kernels`).
"""

from __future__ import annotations

import spiceypy

from pipeline.common.constants import ABCORR, FRAME
from pipeline.common.geo import azel_from_vector, enu_basis, site_position_km

TARGETS = ("SUN", "EARTH")


def azel_spice(
    target: str, et: float, lat_deg: float, lon_deg: float, h_m: float
) -> tuple[float, float, float]:
    """Azimuth (deg), elevation (deg) and distance (km) of ``target`` from a site on the Moon.

    ``target`` is ``'SUN'`` or ``'EARTH'``; ``et`` is ephemeris time (see ``timeutil``); ``h_m`` is
    the total height of the observer above the reference sphere, in metres (terrain height plus
    observer height). With ``refloc = 'OBSERVER'`` the frame is evaluated at ``et``.
    """
    if target not in TARGETS:
        raise ValueError(f"Unknown target: {target}. Use 'SUN' or 'EARTH'.")
    pos = site_position_km(lat_deg, lon_deg, h_m)
    state, _lt = spiceypy.spkcpo(target, et, FRAME, "OBSERVER", ABCORR, pos, "MOON", FRAME)
    east, north, up = enu_basis(lat_deg, lon_deg)
    return azel_from_vector(state[0:3], east, north, up)
