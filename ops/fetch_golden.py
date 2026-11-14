# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Download the JPL Horizons reference values of cases A1 and A2 (docs/spec/11_validacion.md §2).

Usage (from the repository root): ``make golden`` or ``python ops/fetch_golden.py``.

Writes, in ``tests/golden/`` (or ``--out-dir``):

- ``horizons_azel.csv``: case A1, 8 sites x 2 targets x 8 instants = 128 rows (§2.3);
- ``horizons_sun_series.csv``: case A2, 1-minute series of the Sun around every sign change of its
  elevation in March 2025 at three sites (§2.4);
- ``raw/<case>_<site>_<target>[_...].txt``: every Horizons response, untouched (§2.2).

The values are data, not code: A1 reviews them before they are merged (§3). Standard library only,
so that the parser can be imported by the tests without network access.
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
GOLDEN_DIR = REPO_ROOT / "tests" / "golden"

API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
API_VERSION = "1.2"
# §2.2: lines the header must contain; if one is missing the response is rejected.
REQUIRED_HEADER = (
    "Center pole/equ : MEAN_ME",
    "Center radii    : 1737.4, 1737.4, 1737.4 km",
    "Atmos refraction: NO (AIRLESS)",
)
# §2.2: at most one query per second; wait 10 s after an HTTP error.
MIN_INTERVAL_S = 1.0
RETRY_WAIT_S = 10.0
MAX_ATTEMPTS = 4

# §2.1, common parameters (the values carry their single quotes; urlencode escapes them).
COMMON_PARAMS = {
    "format": "text",
    "OBJ_DATA": "'NO'",
    "MAKE_EPHEM": "'YES'",
    "EPHEM_TYPE": "'OBSERVER'",
    "CENTER": "'coord@301'",
    "COORD_TYPE": "'GEODETIC'",
    "QUANTITIES": "'4,13,20'",
    "ANG_FORMAT": "'DEG'",
    "APPARENT": "'AIRLESS'",
    "RANGE_UNITS": "'KM'",
    "TIME_DIGITS": "'SECONDS'",
    "EXTRA_PREC": "'YES'",
    "CSV_FORMAT": "'YES'",
}
TARGET_COMMANDS = {"sun": "10", "earth": "399"}


@dataclass(frozen=True)
class Site:
    site_id: str
    lat_deg: float
    lon_deg: float  # east positive, (-180, 180]
    alt_km: float = 0.0

    @property
    def site_coord(self) -> str:
        # §2.3: '<lon_east>,<lat>,<alt_km>', exactly as written in the specification.
        return f"{_num(self.lon_deg)},{_num(self.lat_deg)},{_num(self.alt_km)}"


def _num(x: float) -> str:
    return f"{x:.10f}".rstrip("0").rstrip(".") if x != int(x) else str(int(x))


# §2.3: the eight sites of case A1 (height 0 km).
A1_SITES = (
    Site("apollo-11", 0.67416, 23.47314),
    Site("blue-ghost-1", 18.562, 61.81),
    Site("chandrayaan-3", -69.3741, 32.32),
    Site("im-2", -84.7906, 29.1957),
    Site("change-7-candidate", -88.8, 123.4),
    Site("val-899s", -89.9, 0.0),
    Site("change-4", -45.4561, 177.5885),
    Site("change-6", -41.6385, -153.9852),
)
# §2.3: the eight instants (UTC), the same for every site, in one TLIST.
A1_INSTANTS = (
    "2025-03-14 06:00", "2025-09-07 18:00", "2026-06-15 12:00", "2027-01-01 00:00",
    "2027-10-20 03:30", "2028-02-29 12:00", "2029-06-26 03:00", "2030-12-31 23:00",
)
# §2.4: the three sites of case A2, the coarse interval and step.
A2_SITES = (
    Site("apollo-11", 0.67416, 23.47314),
    Site("blue-ghost-1", 18.562, 61.81),
    Site("change-3", 44.1214, -19.5117),
)
A2_START, A2_STOP, A2_COARSE_STEP = "2025-03-01 00:00", "2025-04-01 00:00", "1 h"
A2_FINE_HALF_WIDTH = timedelta(minutes=60)
A2_FINE_STEP = "1 m"

AZEL_COLUMNS = ["case", "site_id", "lat_deg", "lon_deg", "alt_km", "target", "utc", "az_deg", "el_deg",
                "ang_diam_arcsec", "range_km"]
SERIES_COLUMNS = ["case", "site_id", "lat_deg", "lon_deg", "alt_km", "event", "utc", "az_deg", "el_deg"]


class HorizonsError(RuntimeError):
    """The response is not what the specification expects."""


# ---------------------------------------------------------------------------- parsing (§2.2)

_MONTHS = {m: i for i, m in enumerate(
    ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"), start=1)}
# 2025-Mar-14 06:00:00.000, 2025-Mar-14 00:00:00 or 2025-Mar-16 18:15.
_DATE = re.compile(r"^(\d{4})-([A-Z][a-z]{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$")
_GEODETIC = re.compile(r"^Center geodetic : *([-+0-9.Ee]+), *([-+0-9.Ee]+), *([-+0-9.Ee]+)")


def parse_date(text: str) -> str:
    """Horizons calendar date (UT) -> ISO 8601 with ``Z``; the fraction is kept only if not zero."""
    m = _DATE.match(text.strip())
    if m is None or m.group(2) not in _MONTHS:
        raise HorizonsError(f"Unexpected Horizons date: {text!r}")
    year, mon = int(m.group(1)), _MONTHS[m.group(2)]
    day, hour, minute = (int(m.group(i)) for i in (3, 4, 5))
    second = int(m.group(6) or 0)
    try:
        datetime(year, mon, day, hour, minute, second)
    except ValueError:  # impossible date (2027-Feb-29)
        raise HorizonsError(f"Unexpected Horizons date: {text!r}") from None
    frac = (m.group(7) or "").rstrip("0")
    return f"{year:04d}-{mon:02d}-{day:02d}T{hour:02d}:{minute:02d}:{second:02d}{'.' + frac if frac else ''}Z"


def _decimal(text: str) -> str:
    """Number exactly as Horizons wrote it, in plain decimal notation ('1.49E+08' -> '149000000')."""
    text = text.strip()
    if not text or text == "n.a.":
        return ""
    return format(Decimal(text), "f")


def check_header(text: str, site: Site | None = None) -> list[str]:
    """Validate the header of a response (§2.2, §2.3). Returns warnings; raises on a wrong header.

    If ``site`` is given, ``Center geodetic`` must reproduce its longitude (modulo 360), latitude
    and height.
    """
    lines = text.splitlines()
    warnings = []
    first = lines[0].strip() if lines else ""
    if first != f"API VERSION: {API_VERSION}":
        if not first.startswith("API VERSION:"):
            raise HorizonsError(f"Unexpected Horizons header: {first}")
        warnings.append(f"Horizons API version changed: {first} (expected {API_VERSION})")
    head = lines[: next((i for i, l in enumerate(lines) if l.strip() == "$$SOE"), len(lines))]
    for required in REQUIRED_HEADER:
        if not any(l.startswith(required) for l in head):
            key = required.split(":")[0]
            found = next((l.rstrip() for l in head if l.startswith(key)), required)
            raise HorizonsError(f"Unexpected Horizons header: {found}")
    if site is not None:
        geo = next((l for l in head if l.startswith("Center geodetic")), None)
        m = _GEODETIC.match(geo or "")
        if m is None:
            raise HorizonsError(f"Unexpected Horizons header: {geo or 'Center geodetic missing'}")
        lon, lat, alt = (float(m.group(i)) for i in (1, 2, 3))
        dlon = (lon - site.lon_deg + 180.0) % 360.0 - 180.0
        if abs(dlon) > 1e-6 or abs(lat - site.lat_deg) > 1e-6 or abs(alt - site.alt_km) > 1e-6:
            raise HorizonsError(f"Unexpected Horizons header: {geo.rstrip()} (asked {site.site_coord})")
    return warnings


def parse_rows(text: str) -> list[dict[str, str]]:
    """Rows between ``$$SOE`` and ``$$EOE``: utc, az_deg, el_deg, ang_diam_arcsec, range_km.

    Fields: date, solar presence, interfering body, azimuth, elevation, angular diameter, range,
    range rate (§2.2). The solar-presence mark is ignored.
    """
    lines = text.splitlines()
    try:
        i0 = next(i for i, l in enumerate(lines) if l.strip() == "$$SOE")
        i1 = next(i for i, l in enumerate(lines) if l.strip() == "$$EOE")
    except StopIteration:
        raise HorizonsError("Horizons response without $$SOE/$$EOE: " + " ".join(lines[:3])) from None
    rows = []
    for line in lines[i0 + 1 : i1]:
        f = [x.strip() for x in line.split(",")]
        if len(f) < 8:
            raise HorizonsError(f"Unexpected Horizons row: {line!r}")
        rows.append({
            "utc": parse_date(f[0]),
            "az_deg": _decimal(f[3]),
            "el_deg": _decimal(f[4]),
            "ang_diam_arcsec": _decimal(f[5]),
            "range_km": _decimal(f[6]),
        })
    if not rows:
        raise HorizonsError("Horizons response with no rows")
    return rows


def sign_changes(rows: list[dict[str, str]]) -> list[tuple[int, str]]:
    """Indices ``i`` where the elevation changes sign between rows i and i+1, with the event name."""
    out = []
    for i in range(len(rows) - 1):
        a, b = float(rows[i]["el_deg"]), float(rows[i + 1]["el_deg"])
        if (a > 0) != (b > 0):
            out.append((i, "sunrise" if b > 0 else "sunset"))
    return out


def crossing_utc(rows: list[dict[str, str]], i: int) -> float:
    """Unix time of the 0° crossing by linear interpolation between rows i and i+1 (§2.4 step 3)."""
    t0, t1 = _unix(rows[i]["utc"]), _unix(rows[i + 1]["utc"])
    e0, e1 = float(rows[i]["el_deg"]), float(rows[i + 1]["el_deg"])
    return t0 + (t1 - t0) * e0 / (e0 - e1)


def _unix(iso: str) -> float:
    return datetime.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=UTC).timestamp() + (
        float("0" + iso[19:-1]) if len(iso) > 20 else 0.0)


def _cal(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M")


# ---------------------------------------------------------------------------- queries


class Client:
    """Horizons API client with the rate limit and retries of §2.2."""

    def __init__(self, url: str = API_URL):
        self.url = url
        self._last = 0.0

    def query(self, params: dict[str, str]) -> str:
        qs = urllib.parse.urlencode({**COMMON_PARAMS, **params}, quote_via=urllib.parse.quote)
        for attempt in range(1, MAX_ATTEMPTS + 1):
            wait = self._last + MIN_INTERVAL_S - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            try:
                with urllib.request.urlopen(f"{self.url}?{qs}", timeout=120) as resp:
                    return resp.read().decode("utf-8")
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as err:
                if attempt == MAX_ATTEMPTS:
                    raise
                print(f"  HTTP error ({err}); retrying in {RETRY_WAIT_S:.0f} s", file=sys.stderr)
                time.sleep(RETRY_WAIT_S)
        raise AssertionError("unreachable")


def _site_params(site: Site, target: str) -> dict[str, str]:
    return {"COMMAND": f"'{TARGET_COMMANDS[target]}'", "SITE_COORD": f"'{site.site_coord}'"}


def _fetch(client: Client, raw_dir: Path, name: str, site: Site, params: dict[str, str]) -> list[dict]:
    text = client.query(params)
    (raw_dir / f"{name}.txt").write_text(text, encoding="utf-8", newline="\n")
    for w in check_header(text, site):
        print(f"  WARNING: {w}", file=sys.stderr)
    rows = parse_rows(text)
    print(f"  {name}: {len(rows)} rows")
    return rows


def fetch_a1(client: Client, raw_dir: Path) -> list[dict]:
    out = []
    tlist = " ".join(f"'{t}'" for t in A1_INSTANTS)
    for site in A1_SITES:
        for target in ("sun", "earth"):
            params = {**_site_params(site, target), "TLIST": tlist, "TLIST_TYPE": "'CAL'", "TIME_TYPE": "'UT'"}
            rows = _fetch(client, raw_dir, f"A1_{site.site_id}_{target}", site, params)
            expected = [t.replace(" ", "T") + ":00Z" for t in A1_INSTANTS]
            if [r["utc"] for r in rows] != expected:
                raise HorizonsError(f"A1 {site.site_id} {target}: instants {[r['utc'] for r in rows]}")
            for r in rows:
                out.append({"case": "A1", "site_id": site.site_id, "lat_deg": _num(site.lat_deg),
                            "lon_deg": _num(site.lon_deg), "alt_km": _num(site.alt_km), "target": target, **r})
    return out


def fetch_a2(client: Client, raw_dir: Path) -> list[dict]:
    out = []
    for site in A2_SITES:
        params = {**_site_params(site, "sun"), "START_TIME": f"'{A2_START}'", "STOP_TIME": f"'{A2_STOP}'",
                  "STEP_SIZE": f"'{A2_COARSE_STEP}'"}
        coarse = _fetch(client, raw_dir, f"A2_{site.site_id}_sun_coarse", site, params)
        changes = sign_changes(coarse)
        print(f"  {site.site_id}: {len(changes)} sign changes "
              f"({', '.join(f'{ev} after {coarse[i]['utc']}' for i, ev in changes)})")
        for i, event in changes:
            hour = datetime.strptime(coarse[i]["utc"][:16], "%Y-%m-%dT%H:%M")
            params = {**_site_params(site, "sun"), "START_TIME": f"'{_cal(hour - A2_FINE_HALF_WIDTH)}'",
                      "STOP_TIME": f"'{_cal(hour + A2_FINE_HALF_WIDTH)}'", "STEP_SIZE": f"'{A2_FINE_STEP}'"}
            name = f"A2_{site.site_id}_sun_{event}_{hour:%Y%m%dT%H}"
            fine = _fetch(client, raw_dir, name, site, params)
            fine_changes = [j for j, ev in sign_changes(fine) if ev == event]
            if len(fine_changes) != 1:
                raise HorizonsError(f"{name}: expected one {event} in the 1-minute series, got {len(fine_changes)}")
            t = crossing_utc(fine, fine_changes[0])
            print(f"    {event}: {datetime.fromtimestamp(t, UTC):%Y-%m-%dT%H:%M:%S.%f}"[:-4] + "Z")
            for r in fine:
                out.append({"case": "A2", "site_id": site.site_id, "lat_deg": _num(site.lat_deg),
                            "lon_deg": _num(site.lon_deg), "alt_km": _num(site.alt_km), "event": event,
                            "utc": r["utc"], "az_deg": r["az_deg"], "el_deg": r["el_deg"]})
    return out


def write_csv(path: Path, columns: list[str], rows: list[dict]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out-dir", type=Path, default=GOLDEN_DIR)
    ap.add_argument("--only", choices=("A1", "A2"), help="fetch only one case")
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(line_buffering=True)
    raw_dir = args.out_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    client = Client()
    try:
        if args.only in (None, "A1"):
            print("A1: Sun and Earth at 8 sites and 8 instants (11_validacion.md sec. 2.3)")
            a1 = fetch_a1(client, raw_dir)
            write_csv(args.out_dir / "horizons_azel.csv", AZEL_COLUMNS, a1)
            print(f"  -> horizons_azel.csv: {len(a1)} rows")
        if args.only in (None, "A2"):
            print("A2: Sun rise and set, March 2025 (11_validacion.md sec. 2.4)")
            a2 = fetch_a2(client, raw_dir)
            write_csv(args.out_dir / "horizons_sun_series.csv", SERIES_COLUMNS, a2)
            print(f"  -> horizons_sun_series.csv: {len(a2)} rows")
    except HorizonsError as err:
        print(f"ERROR: {err}", file=sys.stderr)
        return 1
    print("Done. A1 reviews the files before they are merged (11_validacion.md sec. 3).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
