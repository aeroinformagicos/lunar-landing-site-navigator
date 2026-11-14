# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Reference interpolation of the ephemeris table (05_efemerides.md §4.5 and §4.6).

Four-point Lagrange, component by component, in float64 over the float32 samples. Same algorithm
and the same operations, in the same order, as ``bodyVectorsInto`` in web/src/core/ephemeris.ts and
``skyAt`` in web/src/core/frames.ts (07_visibilidad.md §12). No SPICE here: the Python visibility
reference reads the table, like the web.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from pipeline.common.constants import R_EARTH_KM, R_SUN_KM
from pipeline.common.geo import azel_from_vector, enu_basis, site_position_km
from pipeline.ephem.table import EPHEMERIS_BYTES, RECORD_BYTES, RECORD_FLOATS

# Text of the interface (05 §4.5, §6).
OUT_OF_RANGE_MSG = "Date outside the supported range (1969–1972 and 2024–2044)."
CORRUPT_MSG = "Ephemeris file is corrupt or incomplete. Reload the page."


class OutOfRange(ValueError):
    """The instant is outside every segment of the table, or it is not finite."""


@dataclass(frozen=True)
class Segment:
    id: str
    t0_unix: int
    n: int
    byte_offset: int
    valid_from_unix: int
    valid_to_unix: int


@dataclass(frozen=True)
class EphemerisTable:
    step_s: int
    segments: tuple[Segment, ...]
    data: np.ndarray  # float32 [records, 6]: sun_x, sun_y, sun_z, earth_x, earth_y, earth_z (km)


def build_table(meta: dict, raw: bytes) -> EphemerisTable:
    """Table from the metadata and the bytes of ephemeris.bin."""
    if len(raw) != EPHEMERIS_BYTES:
        raise ValueError(CORRUPT_MSG)
    step = int(meta["step_s"])
    data = np.frombuffer(raw, dtype="<f4").reshape(-1, RECORD_FLOATS)
    segments = []
    for s in meta["segments"]:
        n, off, t0 = int(s["n"]), int(s["byte_offset"]), int(s["t0_unix"])
        if off % RECORD_BYTES != 0 or off + n * RECORD_BYTES > len(raw):
            raise ValueError(CORRUPT_MSG)
        segments.append(Segment(s["id"], t0, n, off, t0 + step, t0 + step * (n - 2)))
    return EphemerisTable(step, tuple(segments), data)


def load_table(data_dir: Path | str) -> EphemerisTable:
    """Read ``ephemeris.meta.json`` and ``ephemeris.bin`` from ``data_dir``."""
    root = Path(data_dir)
    meta = json.loads((root / "ephemeris.meta.json").read_text(encoding="utf-8"))
    return build_table(meta, (root / "ephemeris.bin").read_bytes())


def lagrange_weights(u: float) -> tuple[float, float, float, float]:
    """Weights of samples k−1, k, k+1, k+2 at u ∈ [0, 1] (05 §4.5)."""
    return (
        (-u * (u - 1) * (u - 2)) / 6,
        ((u + 1) * (u - 1) * (u - 2)) / 2,
        (-(u + 1) * u * (u - 2)) / 2,
        ((u + 1) * u * (u - 1)) / 6,
    )


def find_segment(table: EphemerisTable, t: float) -> Segment | None:
    for seg in table.segments:
        if seg.valid_from_unix <= t <= seg.valid_to_unix:
            return seg
    return None


def body_vectors_at(table: EphemerisTable, t: float) -> tuple[np.ndarray, np.ndarray]:
    """Moon centre -> Sun and Moon centre -> Earth in MOON_ME, km, float64, at Unix time ``t``."""
    t = float(t)
    seg = find_segment(table, t) if math.isfinite(t) else None
    if seg is None:
        raise OutOfRange(OUT_OF_RANGE_MSG)
    x = (t - seg.t0_unix) / table.step_s
    k = math.floor(x)
    if k < 1:
        k = 1
    if k > seg.n - 3:
        k = seg.n - 3  # only at t = valid_to
    u = x - k
    w0, w1, w2, w3 = lagrange_weights(u)
    i0 = seg.byte_offset // RECORD_BYTES + k - 1
    s = table.data[i0 : i0 + 4].astype(np.float64)
    out = w0 * s[0] + w1 * s[1] + w2 * s[2] + w3 * s[3]
    return out[0:3], out[3:6]


@dataclass(frozen=True)
class SiteFrame:
    p: np.ndarray  # site position in MOON_ME, km
    e: np.ndarray
    n: np.ndarray
    u: np.ndarray


def site_frame(lat_deg: float, lon_deg: float, h_m: float) -> SiteFrame:
    """Computed once per site; ``h_m`` = terrain height + observer height, metres (05 §4.6)."""
    east, north, up = enu_basis(lat_deg, lon_deg)
    return SiteFrame(site_position_km(lat_deg, lon_deg, h_m), east, north, up)


def angular_radius_deg(radius_km: float, range_km: float) -> float:
    """Apparent angular radius of a disc (05 §5)."""
    return math.degrees(math.asin(radius_km / range_km))


def _body_sky(v: np.ndarray, frame: SiteFrame, radius_km: float) -> dict:
    az, el, rng = azel_from_vector(v - frame.p, frame.e, frame.n, frame.u)
    return {"az_deg": az, "el_deg": el, "range_km": rng, "radius_deg": angular_radius_deg(radius_km, rng)}


def sky_at(table: EphemerisTable, frame: SiteFrame, t: float) -> dict:
    """Sun and Earth seen from the site at Unix time ``t`` (05 §4.6)."""
    sun, earth = body_vectors_at(table, t)
    return {"sun": _body_sky(sun, frame, R_SUN_KM), "earth": _body_sky(earth, frame, R_EARTH_KM)}
