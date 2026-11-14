# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""``python -m pipeline.cli check-contract [dir …]``: validate a data directory against the contract.

docs/spec/09_contrato_datos.md. JSON files are validated against ``contract/schemas`` (JSON Schema
2020-12); binary files by size, header and value ranges; and the cross references between files
(manifest -> ephemeris, sites -> masks and profiles, layers.json -> period files, cube.json ->
chunks). Without arguments it checks ``contract/examples/data`` and ``web/public/data``.
"""

from __future__ import annotations

import fnmatch
import hashlib
import json
import re
import struct
import zlib
from functools import cache
from pathlib import Path

import numpy as np

from pipeline.horizon import cube
from pipeline.horizon.profile import decode_profile

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = REPO_ROOT / "contract" / "schemas"
DEFAULT_DIRS = (REPO_ROOT / "contract" / "examples" / "data", REPO_ROOT / "web" / "public" / "data")

# Path pattern (relative, "/" separated) -> schema name. Order matters: first match wins.
JSON_SCHEMAS = (
    ("manifest.json", "manifest"),
    ("ephemeris.meta.json", "ephemeris_meta"),
    ("sites.json", "sites"),
    ("horizon/*.json", "horizon"),
    ("validation_report.json", "validation_report"),
    ("stations.json", "stations"),
    ("map/grid.json", "grid"),
    ("map/regions.json", "regions"),
    ("layers/layers.json", "layers"),
    ("cube/cube.json", "cube"),
)
# Binary and image files allowed by 09 §2 (everything else in a data directory is an error).
OTHER_FILES = (
    "ephemeris.bin",
    "profile/*.bin.gz",
    "validation/*.png",
    "map/hillshade_250m.png",
    "map/dem_500m.bin.gz",
    "layers/*.bin.gz",
    "cube/done.bin",
    "cube/c_*.bin.gz",
    "compact/regions.bin.gz",
    "compact/overview.bin.gz",
)

EPHEMERIS_BYTES = 5_260_176
NX, NY = cube.NX, cube.NY
LAYER_BYTES = 3 * NX * NY  # 1 516 032
LAYER_ANY_BYTES = 2 * NX * NY  # 1 010 688
DEM_500M_BYTES = 2 * NX * NY  # 1 010 688
HILLSHADE_PX = (1504, 1344)
LAYER_MAX_VALUE = 250
LAYER_NODATA = 255
DEM_NODATA = -32768
COMPACT_HEADER = struct.Struct("<8s2HIHHfH6x")
COMPACT_MAGIC = b"LLSNCMP1"
COMPACT_N_AZ = 180
COMPACT_STEP_CDEG = 200
HEADLINE_ORDER = ("A1", "B3", "A7B7")  # 09 §7; A3 retired (decision D-95)
VERSION_RULE = {"type": "string", "pattern": r"^1\.\d+\.\d+$"}  # 09 §14
CHUNK_NAME = re.compile(r"^c_(\d{2})_(\d{2})\.bin\.gz$")
# Layer files are often identical (example data, months without change): each distinct content
# is decompressed and checked once. Key: (sha256 of the compressed file, expected size).
_LAYER_RESULTS: dict[tuple[str, int], str | None] = {}
# The same for schema validation of JSON files (the web copy repeats the examples).
_SCHEMA_RESULTS: dict[tuple[str, str], list[str]] = {}


@cache
def schema(name: str) -> dict:
    return json.loads((SCHEMA_DIR / f"{name}.schema.json").read_text(encoding="utf-8"))


@cache
def validator(name: str):
    from jsonschema import Draft202012Validator

    return Draft202012Validator(schema(name))


def schema_errors(name: str, doc) -> list[str]:
    """Messages of every schema violation (empty if the document is valid)."""
    errors = sorted(validator(name).iter_errors(doc), key=lambda e: list(e.absolute_path))
    return [f"{'/'.join(str(p) for p in e.absolute_path) or '<root>'}: {e.message[:200]}" for e in errors]


def _matches(rel: str, pattern: str) -> bool:
    """Glob match where ``*`` never crosses a directory."""
    return fnmatch.fnmatchcase(rel, pattern) and rel.count("/") == pattern.count("/")


def schema_for(rel: str) -> str | None:
    for pattern, name in JSON_SCHEMAS:
        if _matches(rel, pattern):
            return name
    return None


def gunzip_single_member(data: bytes) -> bytes:
    """Decompress a gzip file of exactly one member (09: «gzip estándar de un único miembro»)."""
    d = zlib.decompressobj(wbits=31)
    out = d.decompress(data) + d.flush()
    if not d.eof:
        raise ValueError("truncated gzip stream")
    if d.unused_data:
        raise ValueError("gzip file with more than one member or trailing bytes")
    return out


class Checker:
    def __init__(self, root: Path):
        self.root = root
        self.errors: list[str] = []
        self.docs: dict[str, object] = {}
        self.checked = 0

    def error(self, rel: str, msg: str) -> None:
        self.errors.append(f"{rel}: {msg}")

    def exists(self, rel: str) -> bool:
        return (self.root / rel).is_file()

    def read_gz(self, rel: str) -> bytes | None:
        try:
            return gunzip_single_member((self.root / rel).read_bytes())
        except (OSError, ValueError, zlib.error) as exc:
            self.error(rel, f"not a valid gzip file ({exc})")
            return None

    # --- per file -------------------------------------------------------------------------

    def check_json(self, rel: str, name: str) -> None:
        try:
            raw = (self.root / rel).read_bytes()
            doc = json.loads(raw.decode("utf-8"))
        except (OSError, ValueError) as exc:
            self.error(rel, f"not valid JSON ({exc})")
            return
        key = (name, hashlib.sha256(raw).hexdigest())
        if key not in _SCHEMA_RESULTS:
            _SCHEMA_RESULTS[key] = schema_errors(name, doc)
        for msg in _SCHEMA_RESULTS[key]:
            self.error(rel, msg)
        self.docs[rel] = doc

    def check_ephemeris(self, rel: str) -> None:
        data = (self.root / rel).read_bytes()
        if len(data) != EPHEMERIS_BYTES:
            self.error(rel, f"{len(data)} B, expected {EPHEMERIS_BYTES}")
            return
        rec = np.frombuffer(data, dtype="<f4").reshape(-1, 6).astype(np.float64)
        if not np.isfinite(rec).all():
            self.error(rel, "non-finite value")
            return
        sun = np.linalg.norm(rec[:, :3], axis=1)
        earth = np.linalg.norm(rec[:, 3:], axis=1)
        # Ranges of 05_efemerides.md §8.7.
        if sun.min() < 1.45e8 or sun.max() > 1.53e8:
            self.error(rel, f"|sun| outside 1.45e8-1.53e8 km ({sun.min():.4g}-{sun.max():.4g})")
        if earth.min() < 3.5e5 or earth.max() > 4.1e5:
            self.error(rel, f"|earth| outside 3.5e5-4.1e5 km ({earth.min():.4g}-{earth.max():.4g})")
        if np.degrees(np.arccos(np.clip(rec[:, 3] / earth, -1, 1))).max() >= 12.0:
            self.error(rel, "the Earth goes 12 deg or more away from +X of MOON_ME")

    def check_profile(self, rel: str) -> None:
        data = self.read_gz(rel)
        if data is None:
            return
        try:
            decode_profile(data)
        except ValueError as exc:
            self.error(rel, str(exc))

    def check_chunk(self, rel: str) -> None:
        m = CHUNK_NAME.match(rel.split("/")[-1])
        if not m:
            self.error(rel, "chunk file name is not c_RR_CC.bin.gz")
            return
        data = self.read_gz(rel)
        if data is None:
            return
        try:
            chunk = cube.decode_chunk(data)
        except ValueError as exc:
            self.error(rel, str(exc))
            return
        if (chunk.row, chunk.col) != (int(m[1]), int(m[2])):
            self.error(rel, f"header says chunk ({chunk.row}, {chunk.col})")

    def check_layer(self, rel: str) -> None:
        expected = LAYER_ANY_BYTES if rel == "layers/mean186_any.bin.gz" else LAYER_BYTES
        if rel.startswith("layers/night_"):
            expected = NX * NY  # optional longest-night layer (09 §9.1, P2): one band
        key = (hashlib.sha256((self.root / rel).read_bytes()).hexdigest(), expected)
        if key not in _LAYER_RESULTS:
            _LAYER_RESULTS[key] = self._layer_problem(rel, expected)
        if _LAYER_RESULTS[key] is not None:
            self.error(rel, _LAYER_RESULTS[key])

    def _layer_problem(self, rel: str, expected: int) -> str | None:
        try:
            data = gunzip_single_member((self.root / rel).read_bytes())
        except (OSError, ValueError, zlib.error) as exc:
            return f"not a valid gzip file ({exc})"
        if len(data) != expected:
            return f"{len(data)} B uncompressed, expected {expected}"
        v = np.frombuffer(data, dtype=np.uint8)
        if ((v > LAYER_MAX_VALUE) & (v != LAYER_NODATA)).any():
            return f"values above {LAYER_MAX_VALUE} that are not {LAYER_NODATA}"
        return None

    def check_dem(self, rel: str) -> None:
        data = self.read_gz(rel)
        if data is not None and len(data) != DEM_500M_BYTES:
            self.error(rel, f"{len(data)} B uncompressed, expected {DEM_500M_BYTES}")

    def check_png(self, rel: str) -> None:
        from PIL import Image

        try:
            with Image.open(self.root / rel) as im:
                size, mode, fmt = im.size, im.mode, im.format
        except OSError as exc:
            self.error(rel, f"not a readable image ({exc})")
            return
        if fmt != "PNG":
            self.error(rel, f"format {fmt}, expected PNG")
        if rel == "map/hillshade_250m.png" and (size != HILLSHADE_PX or mode != "L"):
            self.error(rel, f"{size[0]}x{size[1]} {mode}, expected 1504x1344 8-bit grey")

    def check_compact(self, rel: str) -> None:
        data = self.read_gz(rel)
        if data is None:
            return
        if len(data) < COMPACT_HEADER.size:
            self.error(rel, "shorter than its header")
            return
        magic, major, _minor, n, n_az, step, el_scale, law_id = COMPACT_HEADER.unpack_from(data)
        if (
            magic != COMPACT_MAGIC
            or major != 1
            or n_az != COMPACT_N_AZ
            or step != COMPACT_STEP_CDEG
            or abs(el_scale - cube.EL_SCALE_DEG) > 1e-6
            or law_id not in cube.LAW_IDS.values()
            or data[26:32] != bytes(6)
        ):
            self.error(rel, "header does not follow the contract")
            return
        if len(data) != 32 + 368 * n:
            self.error(rel, f"{len(data)} B for {n} points, expected {32 + 368 * n}")
            return
        i = np.frombuffer(data, "<u2", n, 32)
        j = np.frombuffer(data, "<u2", n, 32 + 2 * n)
        region = np.frombuffer(data, np.uint8, n, 32 + 6 * n)
        if (i >= NX).any() or (j >= NY).any():
            self.error(rel, "a point is outside the mesh")
        regions = self.docs.get("map/regions.json")
        n_regions = len(regions["regions"]) if isinstance(regions, dict) else 13
        if ((region >= n_regions) & (region != 255)).any():
            self.error(rel, "a region index is not in map/regions.json")
        if data[32 + 7 * n : 32 + 8 * n] != bytes(n):
            self.error(rel, "reserved bytes are not zero")

    # --- cross references -----------------------------------------------------------------

    def check_references(self) -> None:
        manifest = self.docs.get("manifest.json")
        sites = self.docs.get("sites.json")
        if isinstance(manifest, dict):
            eph = manifest.get("ephemeris", {})
            path = self.root / str(eph.get("file", ""))
            if not path.is_file():
                self.error("manifest.json", f"ephemeris file {eph.get('file')} missing")
            elif path.stat().st_size != eph.get("bytes"):
                self.error("manifest.json", f"ephemeris.bytes != size of {eph.get('file')}")
            if isinstance(sites, dict) and manifest.get("sites") != len(sites.get("sites", [])):
                self.error("manifest.json", "sites does not match the number of sites in sites.json")
            if manifest.get("has_validation_report") and not self.exists("validation_report.json"):
                self.error("manifest.json", "has_validation_report but validation_report.json missing")
        meta = self.docs.get("ephemeris.meta.json")
        if isinstance(meta, dict) and self.exists("ephemeris.bin"):
            offset = 0
            for seg in meta.get("segments", []):
                if seg.get("byte_offset") != offset:
                    self.error("ephemeris.meta.json", f"segment {seg.get('id')}: byte_offset != {offset}")
                offset += 24 * int(seg.get("n", 0))
            if offset != (self.root / "ephemeris.bin").stat().st_size:
                self.error("ephemeris.meta.json", "segments do not add up to the size of ephemeris.bin")
        if isinstance(sites, dict):
            ids = [s.get("id") for s in sites.get("sites", [])]
            if len(ids) != len(set(ids)):
                self.error("sites.json", "repeated site id")
            for pair_id in sites.get("defaults", {}).get("demo_pair", []):
                if pair_id not in ids:
                    self.error("sites.json", f"demo_pair names unknown site {pair_id}")
            for s in sites.get("sites", []):
                if s.get("has_mask") and not self.exists(f"horizon/{s.get('id')}.json"):
                    self.error("sites.json", f"{s.get('id')}: has_mask but its horizon file is missing")
                if s.get("has_profile") and not self.exists(f"profile/{s.get('id')}.bin.gz"):
                    self.error("sites.json", f"{s.get('id')}: has_profile but profile file missing")
        for rel, doc in self.docs.items():
            if rel.startswith("horizon/") and isinstance(doc, dict):
                if rel != f"horizon/{doc.get('site_id')}.json":
                    self.error(rel, "site_id does not match the file name")
                masks = doc.get("masks") or [{}]
                if masks[0].get("observer_height_m") != 2:
                    self.error(rel, "masks[0] must be the 2 m mask")
                prof = doc.get("profile")
                if isinstance(prof, dict) and not self.exists(str(prof.get("file"))):
                    self.error(rel, f"profile file {prof.get('file')} missing")
        report = self.docs.get("validation_report.json")
        if isinstance(report, dict):
            ids = [h.get("id") for h in report.get("headline", [])]
            if ids != [h for h in HEADLINE_ORDER if h in ids]:
                self.error("validation_report.json", f"headline order {ids}, expected {list(HEADLINE_ORDER)}")
            for h in report.get("headline", []):
                for fig in h.get("figures", []):
                    if not self.exists(str(fig.get("file"))):
                        self.error("validation_report.json", f"figure {fig.get('file')} missing")
        layers = self.docs.get("layers/layers.json")
        if isinstance(layers, dict):
            for p in layers.get("periods", []):
                if p.get("file") != f"layers/{p.get('id')}.bin.gz":
                    self.error("layers/layers.json", f"period {p.get('id')}: file name does not match")
                elif not self.exists(p["file"]):
                    self.error("layers/layers.json", f"period file {p['file']} missing")
            val = layers.get("validation", {}).get("file")
            if val and not self.exists(val):
                self.error("layers/layers.json", f"{val} missing")
        cube_doc = self.docs.get("cube/cube.json")
        if isinstance(cube_doc, dict):
            path = self.root / "cube" / "done.bin"
            if not path.is_file():
                self.error("cube/cube.json", "cube/done.bin missing")
                return
            done = np.fromfile(path, dtype=np.uint8)
            if done.size != cube.CHUNKS_TOTAL or (done > 1).any():
                self.error("cube/done.bin", f"must be {cube.CHUNKS_TOTAL} bytes of 0 or 1")
                return
            if int(done.sum()) != cube_doc.get("chunks_done"):
                self.error("cube/cube.json", "chunks_done does not match cube/done.bin")
            for k in np.flatnonzero(done):
                row, col = divmod(int(k), cube.N_CHUNK_COLS)
                if not self.exists(f"cube/{cube.chunk_file_name(row, col)}"):
                    self.error("cube/done.bin", f"chunk ({row}, {col}) marked done but its file is missing")

    # --- driver ---------------------------------------------------------------------------

    def run(self) -> None:
        files = sorted(p.relative_to(self.root).as_posix() for p in self.root.rglob("*") if p.is_file())
        # JSON first: the binary checks and the cross references read them.
        for rel in files:
            name = schema_for(rel)
            if name is not None:
                self.check_json(rel, name)
                self.checked += 1
        for rel in files:
            if schema_for(rel) is not None:
                continue
            if not any(_matches(rel, pat) for pat in OTHER_FILES):
                self.error(rel, "file not in the contract (09_contrato_datos.md §2)")
                continue
            self.checked += 1
            if rel == "ephemeris.bin":
                self.check_ephemeris(rel)
            elif rel.startswith("profile/"):
                self.check_profile(rel)
            elif rel.startswith("cube/c_"):
                self.check_chunk(rel)
            elif rel.startswith("layers/"):
                self.check_layer(rel)
            elif rel == "map/dem_500m.bin.gz":
                self.check_dem(rel)
            elif rel.endswith(".png"):
                self.check_png(rel)
            elif rel.startswith("compact/"):
                self.check_compact(rel)
        self.check_references()


def check_dir(root: Path) -> tuple[int, list[str]]:
    """(files checked, error messages) for one data directory."""
    if not root.is_dir():
        return 0, [f"{root}: not a directory"]
    checker = Checker(root)
    checker.run()
    return checker.checked, checker.errors


def check_schemas() -> list[str]:
    """Every schema is a valid 2020-12 schema with the common rules of 09 §14."""
    from jsonschema import Draft202012Validator
    from jsonschema.exceptions import SchemaError

    errors = []
    names = sorted({name for _, name in JSON_SCHEMAS})
    for name in names:
        try:
            s = schema(name)
            Draft202012Validator.check_schema(s)
        except (OSError, ValueError, SchemaError) as exc:
            errors.append(f"{name}.schema.json: {str(exc).splitlines()[0]}")
            continue
        if s.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
            errors.append(f"{name}.schema.json: $schema is not 2020-12")
        if s.get("additionalProperties") is not False:
            errors.append(f"{name}.schema.json: root additionalProperties is not false")
        if s.get("properties", {}).get("contract_version") != VERSION_RULE:
            errors.append(f"{name}.schema.json: contract_version rule missing")
    return errors


def main(dirs: list[Path]) -> int:
    errors = check_schemas()
    print(f"contract schemas: {len({n for _, n in JSON_SCHEMAS})} checked, {len(errors)} errors")
    targets = dirs or [d for d in DEFAULT_DIRS if d.is_dir()]
    if not targets:
        print("no data directory to check")
    for root in targets:
        n, errs = check_dir(root)
        print(f"{root}: {n} files checked, {len(errs)} errors")
        errors += errs
    for msg in errors[:50]:
        print(f"  ERROR {msg}")
    if len(errors) > 50:
        print(f"  ... and {len(errors) - 50} more")
    return 1 if errors else 0


__all__ = ["check_dir", "check_schemas", "gunzip_single_member", "main", "schema_errors"]
