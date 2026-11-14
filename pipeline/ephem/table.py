# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Hourly ephemeris table ``ephemeris.bin`` and its metadata (05_efemerides.md §4.1-§4.4).

For every hour of each segment, the vectors Moon centre -> Sun and Moon centre -> Earth in MOON_ME,
km, with LT+S correction, as six little-endian float32 per record, no header. The layout of the
segments is fixed by 05 §4.2 and the metadata by 09_contrato_datos.md §3.2.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import spiceypy

from pipeline.common.constants import ABCORR, FRAME, R_EARTH_KM, R_MOON_KM, R_SUN_KM, STEP_S
from pipeline.common.timeutil import unix_to_et
from pipeline.ephem.kernels import KERNEL_FILES, load_kernels

CONTRACT_VERSION = "1.0.0"
RECORD_FIELDS = ("sun_x", "sun_y", "sun_z", "earth_x", "earth_y", "earth_z")
RECORD_FLOATS = 6
RECORD_BYTES = 24
# Total size of ephemeris.bin: (184107 + 35067) records x 24 B (05 §4.2).
EPHEMERIS_BYTES = 5_260_176
# SPICE name of the MOON_ME frame defined by moon_de440_250416.tf (09 §3.2).
FRAME_SPICE = "MOON_ME_DE440_ME421"


@dataclass(frozen=True)
class SegmentSpec:
    """One segment of 05 §4.2: sample k is at ``t0_unix + 3600 k``; one guard sample at each end."""

    id: str
    t0_utc: str
    t0_unix: int
    n: int
    byte_offset: int
    valid_from_utc: str
    valid_to_utc: str


# 05 §4.2, in file order.
SEGMENTS = (
    SegmentSpec("main", "2023-12-31T23:00:00Z", 1_704_063_600, 184_107, 0,
                "2024-01-01T00:00:00Z", "2045-01-01T00:00:00Z"),
    SegmentSpec("apollo", "1968-12-31T23:00:00Z", -31_539_600, 35_067, 4_418_568,
                "1969-01-01T00:00:00Z", "1973-01-01T00:00:00Z"),
)  # fmt: skip


def segment_times(seg: SegmentSpec) -> np.ndarray:
    """Unix seconds of every sample of a segment (int64, exact)."""
    return seg.t0_unix + STEP_S * np.arange(seg.n, dtype=np.int64)


def body_vectors_spice(et: float) -> np.ndarray:
    """The six components of one record at ephemeris time ``et``, float64 (05 §4.1)."""
    sun, _ = spiceypy.spkpos("SUN", et, FRAME, ABCORR, "MOON")
    earth, _ = spiceypy.spkpos("EARTH", et, FRAME, ABCORR, "MOON")
    return np.concatenate([np.asarray(sun, dtype=np.float64), np.asarray(earth, dtype=np.float64)])


def build_table(
    kernels_dir: Path | str | None = None, progress: Callable[[str], None] | None = None
) -> np.ndarray:
    """All records of every segment, shape [219174, 6], float64 before the float32 rounding."""
    load_kernels(kernels_dir)
    parts = []
    for seg in SEGMENTS:
        rows = np.empty((seg.n, RECORD_FLOATS), dtype=np.float64)
        for k, t in enumerate(segment_times(seg)):
            rows[k] = body_vectors_spice(unix_to_et(float(t)))
        parts.append(rows)
        if progress is not None:
            progress(f"segment {seg.id}: {seg.n} samples from {seg.t0_utc}")
    return np.concatenate(parts)


def table_bytes(records: np.ndarray) -> bytes:
    """Records -> the bytes of ephemeris.bin (float32 little-endian)."""
    data = np.ascontiguousarray(records, dtype="<f4").tobytes()
    if len(data) != EPHEMERIS_BYTES:
        raise ValueError(f"ephemeris.bin would be {len(data)} B, expected {EPHEMERIS_BYTES}")
    return data


def meta_doc() -> dict:
    """``ephemeris.meta.json`` of the real table (09 §3.2)."""
    return {
        "contract_version": CONTRACT_VERSION,
        "frame": FRAME,
        "frame_spice": FRAME_SPICE,
        "center": "MOON",
        "abcorr": ABCORR,
        "units": "km",
        "dtype": "float32",
        "byte_order": "little",
        "record_fields": list(RECORD_FIELDS),
        "record_bytes": RECORD_BYTES,
        "step_s": STEP_S,
        "interpolation": "lagrange4",
        "segments": [
            {
                "id": s.id, "t0_utc": s.t0_utc, "t0_unix": s.t0_unix, "n": s.n,
                "byte_offset": s.byte_offset,
                "valid_from_utc": s.valid_from_utc, "valid_to_utc": s.valid_to_utc,
            }  # fmt: skip
            for s in SEGMENTS
        ],
        "kernels": list(KERNEL_FILES),
        "constants": {"r_moon_km": R_MOON_KM, "r_sun_km": R_SUN_KM, "r_earth_km": R_EARTH_KM},
        "synthetic": False,
    }


def _write_json(path: Path, doc) -> None:
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def write_table(out_dir: Path, records: np.ndarray) -> Path:
    """Write ephemeris.bin and ephemeris.meta.json into ``out_dir``; return the .bin path.

    If ``out_dir`` holds a ``manifest.json``, its ``ephemeris`` entry is updated to the real table
    (09 §3.1: ``synthetic: false``); the other manifest fields are left as they are.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    data = table_bytes(records)
    path = out_dir / "ephemeris.bin"
    path.write_bytes(data)
    _write_json(out_dir / "ephemeris.meta.json", meta_doc())
    if path.stat().st_size != EPHEMERIS_BYTES:
        raise OSError(f"{path} has {path.stat().st_size} B, expected {EPHEMERIS_BYTES}")
    manifest = out_dir / "manifest.json"
    if manifest.is_file():
        doc = json.loads(manifest.read_text(encoding="utf-8"))
        doc["ephemeris"] = {"file": "ephemeris.bin", "bytes": EPHEMERIS_BYTES, "synthetic": False}
        _write_json(manifest, doc)
    return path


# tests/golden/ephem_sample.json (11_validacion.md §3): 50 samples of the table with their spkpos value.
SAMPLE_COUNT = 50
SAMPLE_SEED = 6


def sample_indices() -> list[tuple[str, int]]:
    """The 50 (segment, k) of ephem_sample.json: both ends of each segment plus random samples."""
    rng = np.random.default_rng(SAMPLE_SEED)
    picks: list[tuple[str, int]] = []
    for seg in SEGMENTS:
        picks += [(seg.id, 0), (seg.id, 1), (seg.id, seg.n - 2), (seg.id, seg.n - 1)]
    per_seg = (SAMPLE_COUNT - len(picks)) // len(SEGMENTS)
    for i, seg in enumerate(SEGMENTS):
        count = SAMPLE_COUNT - len(picks) if i == len(SEGMENTS) - 1 else per_seg
        taken = {k for s, k in picks if s == seg.id}
        ks = [int(k) for k in rng.choice(np.arange(2, seg.n - 2), size=count + 4, replace=False)]
        picks += [(seg.id, k) for k in ks if k not in taken][:count]
    return picks


def sample_doc(kernels_dir: Path | str | None = None) -> list[dict]:
    """``ephem_sample.json``: ``{segment, k, values[6]}`` with ``values`` straight from spkpos (km)."""
    load_kernels(kernels_dir)
    by_id = {s.id: s for s in SEGMENTS}
    out = []
    for seg_id, k in sample_indices():
        t = by_id[seg_id].t0_unix + STEP_S * k
        values = body_vectors_spice(unix_to_et(float(t)))
        out.append({"segment": seg_id, "k": k, "values": [round(float(v), 6) for v in values]})
    return out


def write_sample(path: Path, kernels_dir: Path | str | None = None) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    _write_json(path, sample_doc(kernels_dir))
    return path
