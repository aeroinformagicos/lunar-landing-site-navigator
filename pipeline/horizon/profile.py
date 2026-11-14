# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Reduction of the terrain profile of each ray for the section drawing (F12).

docs/spec/06_horizonte.md §8. Each azimuth keeps 512 bins; every bin keeps the height of its
sample of greatest elevation (seen by the 2 m observer), so the drawn silhouette is the one
that fixes the horizon. The blocking point is not taken from here but from the mask.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

import numpy as np

from pipeline.common.constants import R_MOON_M
from pipeline.horizon.law import N_AZ, law_distance, law_n_samples, law_params

PROFILE_BINS = 512
PROFILE_NODATA = -32768  # int16 value of an empty bin
PROFILE_HEIGHT_MIN_M = -32767
PROFILE_HEIGHT_MAX_M = 32767

# File profile/<site_id>.bin.gz (09_contrato_datos.md §6), uncompressed layout.
PROFILE_MAGIC = b"LLSNPRF1"
PROFILE_CONTRACT_MAJOR = 1
PROFILE_CONTRACT_MINOR = 0
PROFILE_LAW_IDS = {"full": 1, "fast": 2}
PROFILE_HEADER = struct.Struct("<8s6Hff4x")  # 32 bytes
PROFILE_BYTES = PROFILE_HEADER.size + 2 * N_AZ * PROFILE_BINS  # 737 312


def profile_bin_edges(n_samples: int, n_bins: int = PROFILE_BINS) -> tuple[np.ndarray, np.ndarray]:
    """First and last sample index of every bin.

    ``i_lo = ceil(b·N_S/512)`` and ``i_hi = ceil((b+1)·N_S/512) − 1``.
    """
    if n_samples < n_bins:
        raise ValueError(f"A profile of {n_bins} bins needs at least {n_bins} samples, got {n_samples}")
    b = np.arange(n_bins + 1, dtype=np.int64)
    starts = -((-b * n_samples) // n_bins)  # integer ceil, no floating point
    return starts[:-1], starts[1:] - 1


def profile_bin_distance(law: str, b: int) -> float:
    """Drawing distance of bin ``b``, metres: the law distance of its middle sample."""
    if not 0 <= b < PROFILE_BINS:
        raise IndexError(f"Profile bin {b} outside 0..{PROFILE_BINS - 1}")
    i_lo, i_hi = profile_bin_edges(law_n_samples(law))
    return law_distance(law, int((i_lo[b] + i_hi[b]) // 2))


def reduce_profile(h, el, valid) -> np.ndarray:
    """Reduce ``h[..., N_S]`` (metres) to ``int16[..., 512]``.

    Each bin holds the rounded height of its valid sample of greatest elevation ``el`` (the
    nearest one on a tie), clamped to ±32767 m, or −32768 if the bin has no valid sample.
    """
    h = np.asarray(h, dtype=np.float64)
    valid = np.asarray(valid, dtype=bool)
    el = np.where(valid, np.asarray(el, dtype=np.float64), -np.inf)
    n_samples = h.shape[-1]
    i_lo, i_hi = profile_bin_edges(n_samples)
    counts = i_hi - i_lo + 1
    # Maximum elevation of each bin, spread back over its samples.
    bin_max = np.maximum.reduceat(el, i_lo, axis=-1)
    is_max = valid & (el == np.repeat(bin_max, counts, axis=-1))
    # First sample of each bin that reaches the maximum (n_samples = none).
    idx = np.where(is_max, np.arange(n_samples), n_samples)
    first = np.minimum.reduceat(idx, i_lo, axis=-1)
    empty = first == n_samples
    picked = np.take_along_axis(h, np.where(empty, 0, first), axis=-1)
    with np.errstate(invalid="ignore"):
        metres = np.clip(np.rint(picked), PROFILE_HEIGHT_MIN_M, PROFILE_HEIGHT_MAX_M)
    return np.where(empty, PROFILE_NODATA, metres).astype(np.int16)


def local_xy(d_m, h_m, h_site_m: float, h_obs_m: float):
    """Drawing coordinates in the local vertical plane of the observer, metres.

    ``x`` is horizontal and ``y`` vertical with respect to the eye: lines of sight are straight
    lines through the origin, ``y = x·tan(elevation)``.
    """
    d_m = np.asarray(d_m, dtype=np.float64)
    h_m = np.asarray(h_m, dtype=np.float64)
    theta = d_m / R_MOON_M
    r_t = R_MOON_M + h_m
    x = r_t * np.sin(theta)
    y = (h_m - h_site_m - h_obs_m) - 2.0 * r_t * np.sin(theta / 2.0) ** 2
    if x.ndim == 0:
        return float(x), float(y)
    return x, y


@dataclass
class DecodedProfile:
    law: str
    n_samples: int
    site_height_m: float
    observer_height_m: float
    height_m: np.ndarray  # int16 [720, 512]; -32768 = empty bin


def encode_profile(law: str, site_height_m: float, observer_height_m: float, height_m) -> bytes:
    """Uncompressed bytes of a profile file (737 312 B, 09 §6). ``height_m`` is int16 [720, 512]."""
    name = law_params(law).name
    h = np.asarray(height_m)
    if h.shape != (N_AZ, PROFILE_BINS):
        raise ValueError(f"Profile of shape {h.shape}, expected ({N_AZ}, {PROFILE_BINS})")
    header = PROFILE_HEADER.pack(
        PROFILE_MAGIC,
        PROFILE_CONTRACT_MAJOR,
        PROFILE_CONTRACT_MINOR,
        N_AZ,
        PROFILE_BINS,
        PROFILE_LAW_IDS[name],
        law_n_samples(name),
        float(site_height_m),
        float(observer_height_m),
    )
    data = header + h.astype("<i2").tobytes()
    assert len(data) == PROFILE_BYTES
    return data


def decode_profile(data: bytes) -> DecodedProfile:
    """Read the uncompressed bytes of a profile. Raises ValueError if they do not follow 09 §6."""
    if len(data) != PROFILE_BYTES:
        raise ValueError(f"Profile of {len(data)} B, expected {PROFILE_BYTES}")
    magic, major, _minor, n_az, n_bins, law_id, n_samples, site_h, obs_h = PROFILE_HEADER.unpack_from(data)
    laws = {v: k for k, v in PROFILE_LAW_IDS.items()}
    if (
        magic != PROFILE_MAGIC
        or major != PROFILE_CONTRACT_MAJOR
        or n_az != N_AZ
        or n_bins != PROFILE_BINS
        or law_id not in laws
        or n_samples != law_n_samples(laws[law_id])
        or data[28:32] != bytes(4)
    ):
        raise ValueError("Profile header does not follow the contract")
    h = np.frombuffer(data, dtype="<i2", offset=PROFILE_HEADER.size).reshape(N_AZ, PROFILE_BINS)
    return DecodedProfile(laws[law_id], n_samples, site_h, obs_h, h.copy())
