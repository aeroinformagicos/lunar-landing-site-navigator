# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Contract schemas, example data and ``check-contract`` (T-02, docs/spec/09_contrato_datos.md)."""

from __future__ import annotations

import copy
import gzip
import importlib.util
import json
import shutil
from pathlib import Path

import numpy as np
import pytest

from pipeline.cli import contract_check
from pipeline.cli.__main__ import main as cli_main
from pipeline.horizon import cube
from pipeline.horizon.profile import (
    PROFILE_BYTES,
    PROFILE_NODATA,
    decode_profile,
    encode_profile,
    profile_bin_distance,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
EXAMPLES = REPO_ROOT / "contract" / "examples" / "data"
WEB_DATA = REPO_ROOT / "web" / "public" / "data"
MAKE_EXAMPLES = REPO_ROOT / "contract" / "examples" / "make_examples.py"


def load(rel: str):
    return json.loads((EXAMPLES / rel).read_text(encoding="utf-8"))


def gunzip(rel: str) -> bytes:
    return contract_check.gunzip_single_member((EXAMPLES / rel).read_bytes())


# --- Schemas --------------------------------------------------------------------------------


def test_ten_schemas_valid_with_common_rules():
    assert len(list((REPO_ROOT / "contract" / "schemas").glob("*.schema.json"))) == 10
    assert contract_check.check_schemas() == []


@pytest.mark.parametrize("root", [EXAMPLES, WEB_DATA], ids=["examples", "web"])
def test_every_example_validates(root):
    n, errors = contract_check.check_dir(root)
    assert errors == []
    assert n == sum(1 for p in root.rglob("*") if p.is_file())


def test_every_json_example_has_a_schema():
    jsons = [p.relative_to(EXAMPLES).as_posix() for p in EXAMPLES.rglob("*.json")]
    assert all(contract_check.schema_for(rel) for rel in jsons), jsons
    # Every schema except stations (F14, P2: no file until it enters) has an example.
    used = {contract_check.schema_for(rel) for rel in jsons}
    assert used == {name for _, name in contract_check.JSON_SCHEMAS} - {"stations"}


def test_stations_schema_accepts_the_spec_example():
    doc = {"contract_version": "1.0.0", "stations": [{
        "id": "madrid", "name": "Madrid Deep Space Communications Complex", "lat_deg": None,
        "lon_deg": None, "height_m": None, "min_elevation_deg": None, "source": {"label": "", "url": ""}}]}
    assert contract_check.schema_errors("stations", doc) == []


def test_mask_vector_of_719_is_rejected():
    doc = load("horizon/demo-a.json")
    assert contract_check.schema_errors("horizon", doc) == []
    bad = copy.deepcopy(doc)
    bad["masks"][0]["el_deg"] = bad["masks"][0]["el_deg"][:719]
    errors = contract_check.schema_errors("horizon", bad)
    assert errors and any("el_deg" in e for e in errors)


@pytest.mark.parametrize(
    ("name", "rel", "change"),
    [
        ("manifest", "manifest.json", lambda d: d["ephemeris"].update(bytes=5260175)),
        ("manifest", "manifest.json", lambda d: d.update(contract_version="2.0.0")),
        ("manifest", "manifest.json", lambda d: d.update(extra=1)),
        ("ephemeris_meta", "ephemeris.meta.json", lambda d: d.update(frame="IAU_MOON")),
        ("ephemeris_meta", "ephemeris.meta.json", lambda d: d.update(segments=[])),
        ("sites", "sites.json", lambda d: d["sites"][0].update(lon_deg=-180)),
        ("sites", "sites.json", lambda d: d["sites"][0].update(id="Demo_A")),
        ("sites", "sites.json", lambda d: d["sites"][0].update(relief="moon")),
        ("sites", "sites.json", lambda d: d["sites"][0].update(short_name="A name of nineteen c")),
        ("horizon", "horizon/demo-a.json", lambda d: d.update(n_az=360)),
        ("horizon", "horizon/demo-a.json", lambda d: d["masks"][0]["dist_m"].__setitem__(0, -1)),
        ("horizon", "horizon/demo-a.json", lambda d: d.update(masks=d["masks"] * 3)),
        ("validation_report", "validation_report.json", lambda d: d["cases"][0].update(id="C1")),
        ("validation_report", "validation_report.json", lambda d: d["cases"][0].update(status="ok")),
        ("validation_report", "validation_report.json", lambda d: d.update(headline=d["headline"] * 2)),
        ("grid", "map/grid.json", lambda d: d.update(nx=751)),
        ("regions", "map/regions.json", lambda d: d.update(regions=d["regions"][:8])),
        ("regions", "map/regions.json", lambda d: d["regions"][0].update(box_m=[0, 0, 1])),
        ("layers", "layers/layers.json", lambda d: d["periods"][1].update(id="2031-01")),
        ("layers", "layers/layers.json", lambda d: d.update(criterion="edge")),
        ("cube", "cube/cube.json", lambda d: d.update(el_scale_deg=0.02)),
        ("cube", "cube/cube.json", lambda d: d.update(law="slow")),
    ],
)
def test_schema_rejects(name, rel, change):
    doc = load(rel)
    change(doc)
    assert contract_check.schema_errors(name, doc)


# --- Exact binary sizes ---------------------------------------------------------------------


def test_exact_binary_sizes():
    assert (EXAMPLES / "ephemeris.bin").stat().st_size == 5_260_176
    assert len(gunzip("profile/demo-a.bin.gz")) == 737_312 == PROFILE_BYTES
    chunks = sorted((EXAMPLES / "cube").glob("c_*.bin.gz"))
    assert len(chunks) == 4
    assert all(len(contract_check.gunzip_single_member(p.read_bytes())) == 553_504 for p in chunks)
    assert len(gunzip("layers/mean186.bin.gz")) == 1_516_032
    assert len(gunzip("layers/2030-12.bin.gz")) == 1_516_032
    assert len(gunzip("layers/mean186_any.bin.gz")) == 1_010_688
    assert len(gunzip("map/dem_500m.bin.gz")) == 1_010_688
    assert len(gunzip("compact/regions.bin.gz")) == 32 + 368 * 64


def test_ephemeris_segments_and_synthetic_flag():
    meta = load("ephemeris.meta.json")
    assert [s["id"] for s in meta["segments"]] == ["main", "apollo"]
    assert meta["segments"][1]["byte_offset"] == 4_418_568
    assert meta["synthetic"] is True and load("manifest.json")["ephemeris"]["synthetic"] is True


def test_layers_have_mean_and_sixty_months():
    ids = [p["id"] for p in load("layers/layers.json")["periods"]]
    assert len(ids) == 61 and ids[0] == "mean186" and ids[1] == "2026-01" and ids[-1] == "2030-12"


def test_example_sites_and_masks_follow_section_13():
    sites = {s["id"]: s for s in load("sites.json")["sites"]}
    assert list(sites) == ["demo-a", "demo-b", "blue-ghost-1", "apollo-11"]
    assert (sites["demo-a"]["lat_deg"], sites["demo-a"]["lon_deg"]) == (-88.8, 123.4)
    assert (sites["demo-b"]["lat_deg"], sites["demo-b"]["lon_deg"]) == (-89.67, 129.78)
    assert sites["blue-ghost-1"]["relief"] == sites["apollo-11"]["relief"] == "smooth"
    az = np.arange(720) * 0.5
    a = np.array(load("horizon/demo-a.json")["masks"][0]["el_deg"])
    b = np.array(load("horizon/demo-b.json")["masks"][0]["el_deg"])
    np.testing.assert_allclose(a, 0.4 + 0.6 * np.sin(np.radians(3 * az)), atol=5e-5)
    np.testing.assert_allclose(b, 12.0 + 3.0 * np.sin(np.radians(2 * az)), atol=5e-5)


# --- Round trips ----------------------------------------------------------------------------


def test_cube_chunk_round_trip():
    rng = np.random.default_rng(2)
    el = rng.uniform(-5, 30, (256, 720))
    dist = rng.uniform(20, 300_000, (256, 720))
    height = rng.uniform(-8000, 8000, 256)
    computed = rng.random(256) > 0.1
    data = cube.encode_chunk(7, 31, "fast", height, el, dist, computed=computed)
    assert len(data) == 553_504
    back = cube.decode_chunk(contract_check.gunzip_single_member(cube.gzip_bytes(data)))
    assert (back.row, back.col, back.law, back.observer_height_m) == (7, 31, "fast", 2.0)
    np.testing.assert_array_equal(back.computed, computed)
    np.testing.assert_allclose(back.el_deg[computed], el[computed], atol=0.005 + 1e-9)
    np.testing.assert_allclose(back.dist_m[computed] / dist[computed], 1.0, atol=0.021)
    again = cube.encode_chunk(7, 31, "fast", back.height_m, back.el_deg, back.dist_m, computed=computed)
    assert again == data


def test_example_chunk_round_trip():
    raw = gunzip("cube/c_25_28.bin.gz")
    chunk = cube.decode_chunk(raw)
    again = cube.encode_chunk(chunk.row, chunk.col, chunk.law, chunk.height_m, chunk.el_deg, chunk.dist_m)
    assert again == raw


def test_profile_round_trip():
    rng = np.random.default_rng(3)
    h = rng.integers(-32767, 32768, (720, 512)).astype(np.int16)
    h[5, :10] = PROFILE_NODATA
    data = encode_profile("full", -3760.5, 2.0, h)
    assert len(data) == 737_312 and data[:8] == b"LLSNPRF1"
    back = decode_profile(contract_check.gunzip_single_member(cube.gzip_bytes(data)))
    header = (back.law, back.n_samples, back.site_height_m, back.observer_height_m)
    assert header == ("full", 3709, -3760.5, 2.0)
    np.testing.assert_array_equal(back.height_m, h)
    assert encode_profile(back.law, back.site_height_m, back.observer_height_m, back.height_m) == data
    with pytest.raises(ValueError):
        decode_profile(data[:-2])
    with pytest.raises(ValueError):
        decode_profile(b"LLSNPRF2" + data[8:])


def test_example_profile_peaks_at_the_mask_blocking_point():
    prof = decode_profile(gunzip("profile/demo-a.bin.gz"))
    mask = load("horizon/demo-a.json")["masks"][0]
    assert (prof.height_m != PROFILE_NODATA).all()
    # The profile of azimuth j reaches the height of the blocking point near dist_m.
    j = 60
    dist = np.array([profile_bin_distance("full", b) for b in range(512)])
    b = int(np.argmin(np.abs(dist - mask["dist_m"][j])))
    assert abs(int(prof.height_m[j, b]) - mask["blk_height_m"][j]) < 50


# --- check-contract on broken data ----------------------------------------------------------


@pytest.fixture
def broken(tmp_path):
    root = tmp_path / "data"
    shutil.copytree(EXAMPLES, root)
    return root


def _corrupt_truncate_chunk(root):
    p = next((root / "cube").glob("c_*.bin.gz"))
    p.write_bytes(cube.gzip_bytes(contract_check.gunzip_single_member(p.read_bytes())[:-1]))


def _corrupt_layer_value(root):
    data = bytearray(gzip.decompress((root / "layers" / "2026-01.bin.gz").read_bytes()))
    data[0] = 251
    (root / "layers" / "2026-01.bin.gz").write_bytes(cube.gzip_bytes(bytes(data)))


def _corrupt_two_gzip_members(root):
    p = root / "profile" / "demo-a.bin.gz"
    p.write_bytes(p.read_bytes() + cube.gzip_bytes(b"x"))


def _corrupt_ephemeris_size(root):
    p = root / "ephemeris.bin"
    p.write_bytes(p.read_bytes()[:-24])


def _corrupt_missing_mask(root):
    (root / "horizon" / "demo-b.json").unlink()


def _corrupt_unknown_file(root):
    (root / "notes.txt").write_text("x")


def _corrupt_done_without_chunk(root):
    next((root / "cube").glob("c_*.bin.gz")).unlink()


@pytest.mark.parametrize(
    "corrupt",
    [_corrupt_truncate_chunk, _corrupt_layer_value, _corrupt_two_gzip_members, _corrupt_ephemeris_size,
     _corrupt_missing_mask, _corrupt_unknown_file, _corrupt_done_without_chunk],
)
def test_check_contract_detects(broken, corrupt):
    corrupt(broken)
    _, errors = contract_check.check_dir(broken)
    assert errors


def test_cli_exit_codes(broken, capsys):
    assert cli_main(["check-contract", str(EXAMPLES)]) == 0
    _corrupt_truncate_chunk(broken)
    assert cli_main(["check-contract", str(broken)]) == 1
    assert "ERROR" in capsys.readouterr().out


# --- The committed examples are what the generator writes -----------------------------------


def _content(path: Path) -> bytes:
    """What a file holds, independent of the compressor build (zlib and Pillow differ by platform).

    PNG: mode, size and pixels. gzip: the uncompressed bytes. Anything else: the bytes as they are.
    """
    if path.suffix == ".png":
        from PIL import Image

        with Image.open(path) as im:
            return f"{im.mode} {im.size}".encode() + im.tobytes()
    if path.suffix == ".gz":
        return contract_check.gunzip_single_member(path.read_bytes())
    return path.read_bytes()


def _tree(root: Path) -> dict[str, bytes]:
    return {p.relative_to(root).as_posix(): _content(p) for p in sorted(root.rglob("*")) if p.is_file()}


def test_examples_are_up_to_date(tmp_path):
    out = tmp_path / "data"
    spec = importlib.util.spec_from_file_location("make_examples", MAKE_EXAMPLES)
    make_examples = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(make_examples)
    make_examples.make_all(out)
    fresh = _tree(out)
    assert fresh == _tree(EXAMPLES), "run `make examples` and commit the result"
    # Until the pipeline publishes real data there (T-21), web/public/data is the example copy.
    if json.loads((WEB_DATA / "manifest.json").read_text(encoding="utf-8"))["ephemeris"]["synthetic"]:
        assert fresh == _tree(WEB_DATA), "web/public/data is not a copy of the examples: run `make examples`"
    config = json.loads((REPO_ROOT / "web" / "public" / "config.json").read_text(encoding="utf-8"))
    # heavy_base_url is "data" until `make deploy-heavy` (T-25) writes the URL of the heavy origin.
    assert config["data_base_url"] == "data" and set(config) == {"data_base_url", "heavy_base_url"}
    assert config["heavy_base_url"] == "data" or config["heavy_base_url"].startswith("https://")


def test_examples_do_not_overwrite_real_data(tmp_path):
    """D-75: with ``ephemeris.synthetic = false`` in the manifest, the copy to web/public/data is refused."""
    spec = importlib.util.spec_from_file_location("make_examples", MAKE_EXAMPLES)
    make_examples = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(make_examples)
    assert not make_examples.holds_real_data(tmp_path)  # no manifest: the copy may go ahead
    manifest = {"ephemeris": {"file": "ephemeris.bin", "bytes": 5260176, "synthetic": True}}
    (tmp_path / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    assert not make_examples.holds_real_data(tmp_path)
    manifest["ephemeris"]["synthetic"] = False
    (tmp_path / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    assert make_examples.holds_real_data(tmp_path)
    # The published copy in the repository holds the real table since T-06.
    assert make_examples.holds_real_data(WEB_DATA)
