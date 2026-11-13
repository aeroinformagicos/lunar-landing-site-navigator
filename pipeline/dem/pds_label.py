# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Minimal reader of the detached PDS3 labels (.LBL) of the project rasters.

docs/spec/03_datos_y_fuentes.md §3 and §4.2 (decision D-06: no GDAL, no PDS library).
The .IMG files are headerless binary matrices; everything needed to read them is in
``KEY = VALUE`` lines of the label. Keys repeated inside ``OBJECT = IMAGE`` and
``OBJECT = IMAGE_MAP_PROJECTION`` are kept apart by their object name.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


class LabelError(ValueError):
    """The label is missing a required key or describes an unsupported product."""


_DTYPES = {("PC_REAL", 32): "<f4", ("LSB_INTEGER", 16): "<i2"}
_UNIT_TO_M = {"KILOMETER": 1000.0, "METER": 1.0}
_MAP_SCALE_TO_M = {"m/pix": 1.0, "km/pix": 1000.0}
_COMMENT = re.compile(r"/\*.*?\*/", re.S)
_WITH_UNIT = re.compile(r"^(.*?)\s*<([^>]*)>$")


@dataclass(frozen=True)
class PdsLabel:
    """The fields of a label that the project uses. Units are those of the label."""

    path: Path | None
    image_file: str  # name of the .IMG the label points to (^IMAGE)
    record_bytes: int
    file_records: int
    lines: int
    line_samples: int
    sample_type: str
    sample_bits: int
    unit: str
    scaling_factor: float
    offset: float
    minimum: float | None  # DERIVED_MINIMUM (DN) in LOLA products, MINIMUM (km) in SLDEM2015
    maximum: float | None
    map_projection_type: str
    map_resolution: float  # pixels per degree
    map_scale: float
    map_scale_unit: str  # 'm/pix' or 'km/pix'
    center_latitude: float
    center_longitude: float
    maximum_latitude: float | None
    minimum_latitude: float | None
    westernmost_longitude: float | None
    easternmost_longitude: float | None
    line_projection_offset: float
    sample_projection_offset: float
    coordinate_system_name: str
    a_axis_radius_km: float

    @property
    def dtype(self) -> str:
        """NumPy dtype string of one sample."""
        try:
            return _DTYPES[(self.sample_type, self.sample_bits)]
        except KeyError:
            raise LabelError(
                f"Unsupported sample type {self.sample_type} of {self.sample_bits} bits"
            ) from None

    @property
    def image_bytes(self) -> int:
        """Exact size of the .IMG file."""
        return self.lines * self.line_samples * (self.sample_bits // 8)

    @property
    def to_m(self) -> float:
        """Factor from raw sample to metres (heights): unit factor times SCALING_FACTOR.

        For products without a length unit (UNIT = NONE: illumination fractions) it is
        just SCALING_FACTOR, and ``offset`` has to be added by the caller.
        """
        return _UNIT_TO_M.get(self.unit, 1.0) * self.scaling_factor

    @property
    def map_scale_m(self) -> float:
        """MAP_SCALE in metres per pixel."""
        try:
            return self.map_scale * _MAP_SCALE_TO_M[self.map_scale_unit]
        except KeyError:
            raise LabelError(f"Unsupported MAP_SCALE unit <{self.map_scale_unit}>") from None


def parse_statements(text: str) -> dict[tuple[str, str], str]:
    """All ``KEY = VALUE`` statements of a label, keyed by (innermost OBJECT name, KEY).

    Statements outside any object have '' as object name. Values are returned raw
    (quotes and units included); multi-line quoted strings and sets are joined.
    """
    lines = _COMMENT.sub("", text).splitlines()
    out: dict[tuple[str, str], str] = {}
    stack: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1
        if line == "END":
            break
        if "=" not in line:
            continue
        key, value = (part.strip() for part in line.split("=", 1))
        while i < len(lines) and (value.count('"') % 2 == 1 or value.count("{") > value.count("}")):
            value += " " + lines[i].strip()
            i += 1
        if key == "OBJECT":
            stack.append(value)
        elif key == "END_OBJECT":
            if stack:
                stack.pop()
        else:
            out[(stack[-1] if stack else "", key)] = value
    return out


def _clean(value: str) -> tuple[str | None, str | None]:
    """(value without quotes and unit, unit or None). 'N/A' becomes None."""
    value = value.strip()
    unit = None
    m = _WITH_UNIT.match(value)
    if m:
        value, unit = m.group(1), m.group(2).strip()
    if value.startswith("(") and value.endswith(")"):  # ^IMAGE = ("FILE.IMG", 1)
        value = value[1:-1].split(",")[0].strip()
    value = value.strip("\"'").strip()
    return (None if value == "N/A" else value), unit


class _Reader:
    def __init__(self, statements: dict[tuple[str, str], str], source: str):
        self._st = statements
        self._source = source

    def raw(self, obj: str, key: str, required: bool = True) -> tuple[str | None, str | None]:
        if (obj, key) in self._st:
            return _clean(self._st[(obj, key)])
        if required:
            raise LabelError(f"{self._source}: missing {key} in OBJECT = {obj or '(file)'}")
        return None, None

    def text(self, obj: str, key: str) -> str:
        value, _ = self.raw(obj, key)
        if value is None:
            raise LabelError(f"{self._source}: {key} is N/A")
        return value

    def number(self, obj: str, key: str, required: bool = True) -> float | None:
        value, _ = self.raw(obj, key, required)
        if value is None:
            if required:
                raise LabelError(f"{self._source}: {key} is N/A")
            return None
        try:
            return float(value)
        except ValueError:
            raise LabelError(f"{self._source}: {key} = {value!r} is not a number") from None

    def integer(self, obj: str, key: str) -> int:
        value = self.number(obj, key)
        if value != int(value):
            raise LabelError(f"{self._source}: {key} = {value} is not an integer")
        return int(value)


def parse_label_text(text: str, path: Path | None = None) -> PdsLabel:
    """Parse the text of a label. ``path`` is only kept for messages and to find the .IMG."""
    source = path.name if path else "label"
    r = _Reader(parse_statements(text), source)
    file_obj = "UNCOMPRESSED_FILE" if ("UNCOMPRESSED_FILE", "^IMAGE") in r._st else ""
    img, proj = "IMAGE", "IMAGE_MAP_PROJECTION"
    has_derived = (img, "DERIVED_MINIMUM") in r._st
    _, map_scale_unit = r.raw(proj, "MAP_SCALE")
    label = PdsLabel(
        path=path,
        image_file=r.text(file_obj, "^IMAGE"),
        record_bytes=r.integer(file_obj, "RECORD_BYTES"),
        file_records=r.integer(file_obj, "FILE_RECORDS"),
        lines=r.integer(img, "LINES"),
        line_samples=r.integer(img, "LINE_SAMPLES"),
        sample_type=r.text(img, "SAMPLE_TYPE"),
        sample_bits=r.integer(img, "SAMPLE_BITS"),
        unit=r.text(img, "UNIT"),
        scaling_factor=r.number(img, "SCALING_FACTOR"),
        offset=r.number(img, "OFFSET"),
        minimum=r.number(img, "DERIVED_MINIMUM" if has_derived else "MINIMUM", required=False),
        maximum=r.number(img, "DERIVED_MAXIMUM" if has_derived else "MAXIMUM", required=False),
        map_projection_type=r.text(proj, "MAP_PROJECTION_TYPE"),
        map_resolution=r.number(proj, "MAP_RESOLUTION"),
        map_scale=r.number(proj, "MAP_SCALE"),
        map_scale_unit=map_scale_unit or "",
        center_latitude=r.number(proj, "CENTER_LATITUDE"),
        center_longitude=r.number(proj, "CENTER_LONGITUDE"),
        maximum_latitude=r.number(proj, "MAXIMUM_LATITUDE", required=False),
        minimum_latitude=r.number(proj, "MINIMUM_LATITUDE", required=False),
        westernmost_longitude=r.number(proj, "WESTERNMOST_LONGITUDE", required=False),
        easternmost_longitude=r.number(proj, "EASTERNMOST_LONGITUDE", required=False),
        line_projection_offset=r.number(proj, "LINE_PROJECTION_OFFSET"),
        sample_projection_offset=r.number(proj, "SAMPLE_PROJECTION_OFFSET"),
        coordinate_system_name=r.text(proj, "COORDINATE_SYSTEM_NAME"),
        a_axis_radius_km=r.number(proj, "A_AXIS_RADIUS"),
    )
    if label.file_records != label.lines:
        raise LabelError(f"{source}: FILE_RECORDS ({label.file_records}) != LINES ({label.lines})")
    if label.record_bytes != label.line_samples * (label.sample_bits // 8):
        raise LabelError(f"{source}: RECORD_BYTES ({label.record_bytes}) does not match one image row")
    return label


def parse_label(path: str | Path) -> PdsLabel:
    """Parse a .LBL file."""
    path = Path(path)
    return parse_label_text(path.read_text(encoding="latin-1"), path)
