# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Time conversions (docs/spec/05_efemerides.md §2).

Files carry UTC as ISO 8601 with ``Z``; binaries and the core carry Unix seconds. Unix time has no
leap seconds (every day is 86,400 s). All calendar arithmetic goes through ``datetime`` in UTC,
never through hand-made day counts. A second 60 is not representable and is rejected, like
``isoToUnix`` in web/src/core/time.ts.
"""

from __future__ import annotations

import math
import re
from datetime import UTC, datetime, timedelta

import spiceypy

_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
# YYYY-MM-DDTHH:MM[:SS[.sss]]Z, the same pattern as web/src/core/time.ts.
_ISO_UTC = re.compile(r"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?Z$")


def _parse_iso(iso: str) -> tuple[datetime, str]:
    """Whole-second ``datetime`` and the fraction text ('' or '.sss') of a UTC instant."""
    m = _ISO_UTC.match(iso) if isinstance(iso, str) else None
    if m is None:
        raise ValueError(f"Invalid UTC instant: {iso}")
    year, month, day, hour, minute = (int(m.group(i)) for i in range(1, 6))
    second = int(m.group(6) or 0)
    try:
        whole = datetime(year, month, day, hour, minute, second, tzinfo=UTC)
    except ValueError:
        # Impossible date (2027-02-29) or second 60.
        raise ValueError(f"Invalid UTC instant: {iso}") from None
    return whole, m.group(7) or ""


def iso_to_unix(iso: str) -> float:
    """``YYYY-MM-DDTHH:MM[:SS[.sss]]Z`` -> Unix seconds."""
    whole, frac = _parse_iso(iso)
    seconds = (whole - _EPOCH) // timedelta(seconds=1)
    return float(seconds) + (float(frac) if frac else 0.0)


def unix_to_iso(t: float) -> str:
    """Unix seconds -> ``YYYY-MM-DDTHH:MM:SS.ffffffZ`` (rounded to the microsecond).

    Built as epoch + timedelta: ``datetime.fromtimestamp`` fails on Windows for negative times,
    and the ``apollo`` segment starts at t = -31539600 (05 §4.2).
    """
    if not math.isfinite(t):
        raise ValueError(f"Invalid Unix time: {t}")
    return (_EPOCH + timedelta(seconds=t)).strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"


def utc_iso_to_et(iso: str) -> float:
    """UTC instant -> ephemeris time (TDB seconds past J2000). Needs the leap-second kernel.

    SPICE reads the string without the ``Z`` as UTC.
    """
    _parse_iso(iso)
    return float(spiceypy.str2et(iso[:-1]))


def unix_to_et(t: float) -> float:
    """Unix seconds -> ephemeris time. Needs the leap-second kernel."""
    return utc_iso_to_et(unix_to_iso(t))
