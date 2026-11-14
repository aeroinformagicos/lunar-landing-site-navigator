# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Visible fraction of a disc above a horizon mask (07_visibilidad.md §4).

Same algorithm and the same operations, in the same order, as ``discFraction`` and ``discAny`` in
web/src/core/visibility.ts (07 §12). Plain ``math`` on Python floats: no NumPy arithmetic here, so
that both languages round the same way.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import TYPE_CHECKING

from pipeline.horizon.law import AZ_STEP_DEG, N_AZ

if TYPE_CHECKING:
    from pipeline.vis.sky import Mask

# Number of vertical strips of the disc (07 §4.1).
DISC_STRIPS = 32
# Floor of cos(el) when a horizontal arc is converted into an azimuth difference (07 §4.1, §4.2).
MIN_COS_EL = 0.05
# Columns of the «any part of the disc» criterion, in disc radii (07 §4.2).
ANY_COLUMNS = (-0.8, -0.4, 0.0, 0.4, 0.8)


def disc_fraction(mask: Mask, az_c: float, el_c: float, rho: float, k_strips: int = DISC_STRIPS) -> float:
    """Visible fraction, in [0, 1], of a disc of angular radius ``rho`` centred at (``az_c``, ``el_c``).

    The disc is cut into ``k_strips`` vertical strips of equal width; each one is compared with the
    horizon at the azimuth of its centre. Degrees throughout.
    """
    if el_c - rho >= mask.max_el_deg:
        return 1.0  # the whole disc is above every horizon
    if el_c + rho <= mask.min_el_deg:
        return 0.0
    cos_el = max(math.cos(math.radians(el_c)), MIN_COS_EL)
    el = mask.el
    vis = 0.0
    tot = 0.0
    for k in range(k_strips):
        x = rho * (-1 + (2 * k + 1) / k_strips)  # horizontal offset, degrees of arc
        c = math.sqrt(rho * rho - x * x)  # vertical half chord
        # horizon_at(el, az_c + x / cos_el) written out, like the web does (decision D-66).
        az = az_c + x / cos_el
        xa = math.fmod(math.fmod(az, 360.0) + 360.0, 360.0) / AZ_STEP_DEG
        j = math.floor(xa)
        f = xa - j
        h = (1 - f) * el[j] + f * el[0 if j == N_AZ - 1 else j + 1]
        vis += min(max(el_c + c - max(el_c - c, h), 0.0), 2 * c)
        tot += 2 * c
    return vis / tot


def disc_any(el_hor_fn: Callable[[float], float], az_c: float, el_c: float, rho: float) -> bool:
    """«Any part of the disc» criterion with five columns (07 §4.2).

    Only for comparisons with NASA products and with the Horizons label (07 §3, decision D-21):
    «there is Sun» and «there is a link» always follow the centre of the disc.
    """
    cos_el = max(math.cos(math.radians(el_c)), MIN_COS_EL)
    for q in ANY_COLUMNS:
        if el_c + rho * math.sqrt(1 - q * q) > el_hor_fn(az_c + (q * rho) / cos_el):
            return True
    return False
