# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Solar eclipses seen from the Moon (07_visibilidad.md §9, F13).

From the site, the Earth covers the Sun when the angular separation of their centres is smaller
than the sum of their radii. It does not depend on the terrain, and the Earth has no atmosphere
here (disc of 6,378.137 km), like the reference figures of the plan. Same algorithm and the same
operations, in the same order, as web/src/core/eclipse.ts (07 §12).
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass

from pipeline.ephem.interp import EphemerisTable, SiteFrame, sky_at

# Radians per degree, written as in the web core so that both languages round the same way.
DEG = math.pi / 180

KINDS = ("none", "partial", "total")


@dataclass(frozen=True)
class EclipseState:
    kind: str  # 'none' | 'partial' | 'total'
    covered: float  # share of the solar disc covered by the Earth, [0, 1]
    sep_deg: float  # angular separation of the two centres


def angular_sep(az1: float, el1: float, az2: float, el2: float) -> float:
    """Angular separation of two directions, degrees (haversine formula)."""
    d_az = (az2 - az1) * DEG
    a1 = el1 * DEG
    a2 = el2 * DEG
    h = math.sin((a2 - a1) / 2) ** 2 + math.cos(a1) * math.cos(a2) * math.sin(d_az / 2) ** 2
    return (2 * math.asin(min(1.0, math.sqrt(h)))) / DEG


def covered_share(s: float, a: float, b: float) -> tuple[str, float]:
    """Overlap of two discs of radii ``a`` (Sun) and ``b`` (Earth, always b > a) at separation ``s``.

    Returns the kind and the overlap as a share of the solar disc.
    """
    if s >= a + b:
        return "none", 0.0
    if s <= b - a:
        return "total", 1.0
    area = (
        a * a * math.acos((s * s + a * a - b * b) / (2 * s * a))
        + b * b * math.acos((s * s + b * b - a * a) / (2 * s * b))
        - 0.5 * math.sqrt((-s + a + b) * (s + a - b) * (s - a + b) * (s + a + b))
    )
    return "partial", area / (math.pi * a * a)


def eclipse_state(sky: dict) -> EclipseState:
    """``eclipse_state(sky)`` of 07 §9; ``sky`` is the result of ``sky_at`` (05 §4.6)."""
    sun, earth = sky["sun"], sky["earth"]
    s = angular_sep(sun["az_deg"], sun["el_deg"], earth["az_deg"], earth["el_deg"])
    kind, covered = covered_share(s, sun["radius_deg"], earth["radius_deg"])
    return EclipseState(kind, covered, s)


def eclipse_margin_fns(
    table: EphemerisTable, frame: SiteFrame
) -> tuple[Callable[[float], float], Callable[[float], float]]:
    """Margins of the eclipse events (07 §6.2), positive while the condition holds.

    Returns ``(eclipse, totality)``: ``(sun.radius + earth.radius) − sep`` and
    ``(earth.radius − sun.radius) − sep``.
    """

    def sep(t: float) -> tuple[float, float, float]:
        sky = sky_at(table, frame, t)
        sun, earth = sky["sun"], sky["earth"]
        s = angular_sep(sun["az_deg"], sun["el_deg"], earth["az_deg"], earth["el_deg"])
        return s, sun["radius_deg"], earth["radius_deg"]

    def eclipse(t: float) -> float:
        s, a, b = sep(t)
        return a + b - s

    def totality(t: float) -> float:
        s, a, b = sep(t)
        return b - a - s

    return eclipse, totality
