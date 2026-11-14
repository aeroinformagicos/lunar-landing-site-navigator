# AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
"""Our mean visibility maps against the NASA AVGVISIB maps (08_mapa_polar.md §8; case B7).

NASA products (03_datos_y_fuentes.md §6): N1 and N2 (60 m, ±151.74 km) and, for the cells outside
them, N3 and N4 (120 m). The value of a cell is the mean of DN × 0.00004 over the 3 × 3 pixels
centred on the pixel that contains the cell centre (08 §8.2). Ours is the layer ``mean186_any``
(«any part of the disc», the NASA criterion; decision D-21).

``python -m pipeline.cli compare-nasa`` writes the metrics as case B7
(``<out>/test_results/B7.json``) and the two figures of 09 §7.1 next to it.
"""

from __future__ import annotations

import io
import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from pipeline.dem.grids import PolarSouthGrid, read_pds_image
from pipeline.dem.pds_label import LabelError
from pipeline.horizon import cube
from pipeline.layers import layers as lay

REPO_ROOT = Path(__file__).resolve().parents[2]
TOLERANCES = REPO_ROOT / "tests" / "golden" / "tolerances.json"

# Products of 03 §6: body -> file stem.
N85 = {"sun": "AVGVISIB_85S_060M_201608", "earth": "AVGVISIB_85S_060M_201608_EARTH"}  # N1, N2
N75 = {"sun": "AVGVISIB_75S_120M_201608", "earth": "AVGVISIB_75S_120M_201608_EARTH"}  # N3, N4
BODIES = ("sun", "earth")
DN_SCALE = 0.00004  # SCALING_FACTOR of the four labels (03 §6); OFFSET 0
DN_MIN, DN_MAX = 0, 25_000  # DERIVED_MINIMUM / largest DERIVED_MAXIMUM of the labels (03 §6)
INNER_HALF_M = 151_500.0  # cells with |x|, |y| ≤ 151.5 km are read from N1/N2 (08 §8.2)
WINDOW = 3  # 3 × 3 pixels
WITHIN_PTS = 10.0  # share of cells with |ours − nasa| ≤ 10 points (08 §8.2)
SET_85S, SET_ALL = "85S", "all"

# Figures (09 §7.1). Colours of styles/tokens.css (Okabe and Ito palette, 10_interfaz.md §2).
SCATTER_PX = (1200, 600)
DIFF_PX = (cube.NX, cube.NY)  # 752 × 672: one pixel per cell
FIGURE_MAX_BYTES = 300_000
DIFF_RANGE_PTS = 30.0
DIFF_CLASS_PTS = 5.0
C_BG = (0x14, 0x1C, 0x2A)  # --c-surface
C_TEXT = (0xE6, 0xEB, 0xF2)  # --c-text
C_MUTED = (0xA3, 0xAF, 0xC0)  # --c-text-muted
C_GRID = (0x27, 0x32, 0x46)  # --c-border
C_BODY = {"sun": (0xE6, 0x9F, 0x00), "earth": (0x56, 0xB4, 0xE9)}  # --c-sun, --c-earth
# Diverging scale of the difference map: --c-earth (negative), --c-text (zero), --c-nogo (positive).
C_NEG, C_MID, C_POS = (0x56, 0xB4, 0xE9), (0xE6, 0xEB, 0xF2), (0xD5, 0x5E, 0x00)

PGDA = {"label": "NASA PGDA, south pole illumination products", "url": "https://pgda.gsfc.nasa.gov/products/69"}


class NasaDataMissing(FileNotFoundError):
    """An AVGVISIB product is not in ``<data>/raw/nasa_illum``."""


@dataclass(frozen=True)
class NasaProducts:
    inner: dict[str, PolarSouthGrid]  # body -> N1 / N2 (60 m)
    outer: dict[str, PolarSouthGrid]  # body -> N3 / N4 (120 m)


def _open(root: Path, stem: str) -> PolarSouthGrid:
    lbl = root / f"{stem}.LBL"
    if not lbl.is_file() or not lbl.with_suffix(".IMG").is_file():
        raise NasaDataMissing(f"Missing {stem}.IMG or its .LBL in {root}; run make data-fetch (group G3)")
    grid = read_pds_image(lbl)  # memory-mapped
    lab = grid.label
    if lab.scaling_factor != DN_SCALE or lab.offset != 0.0 or grid.data.dtype.str != "<i2":
        raise LabelError(f"{stem}: expected int16 with SCALING_FACTOR {DN_SCALE} and OFFSET 0")
    return grid


def open_products(data_dir: str | Path) -> NasaProducts:
    root = Path(data_dir) / "raw" / "nasa_illum"
    return NasaProducts({b: _open(root, N85[b]) for b in BODIES}, {b: _open(root, N75[b]) for b in BODIES})


# ---------------------------------------------------------------------------------------------
# Resampling (08 §8.2)
# ---------------------------------------------------------------------------------------------


def mesh_xy() -> tuple[np.ndarray, np.ndarray]:
    """Centres of the 752 × 672 cells, metres of map, arrays [NY, NX]."""
    i, j = np.meshgrid(np.arange(cube.NX), np.arange(cube.NY))
    return cube.cell_centre_xy(i, j)


def pixel_index(grid: PolarSouthGrid, x, y) -> tuple[np.ndarray, np.ndarray]:
    """Pixel (s, l) that contains the map point (x, y) (08 §8.2).

    ``s = round(x/S + N/2 − 0.5)``, half up, is ``floor(x/S + N/2)``; ``l = floor(N/2 − y/S)``.
    """
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    return (np.floor(x / grid.S + grid.N / 2).astype(np.int64),
            np.floor(grid.N / 2 - y / grid.S).astype(np.int64))


def window_sums(grid: PolarSouthGrid, x, y) -> tuple[np.ndarray, np.ndarray]:
    """Sum of the DN of the 3 × 3 pixels centred on the pixel that contains (x, y), and validity.

    Valid if the window is inside the image and its nine values are within the range of the labels.
    """
    x = np.asarray(x, dtype=np.float64)
    s, l = pixel_index(grid, x, y)
    half = WINDOW // 2
    valid = (s >= half) & (s <= grid.N - 1 - half) & (l >= half) & (l <= grid.N - 1 - half)
    s0 = np.where(valid, s, half)
    l0 = np.where(valid, l, half)
    total = np.zeros(x.shape, dtype=np.int64)
    for dl in range(-half, half + 1):
        for ds in range(-half, half + 1):
            dn = np.asarray(grid.data[l0 + dl, s0 + ds], dtype=np.int64)
            valid &= (dn >= DN_MIN) & (dn <= DN_MAX)
            total += dn
    return np.where(valid, total, 0), valid


@dataclass(frozen=True)
class MeshNasa:
    """The NASA values on the mesh: sums of 3 × 3 DN [2, NY, NX] (sun, earth), validity, N1/N2 cells."""

    sums: np.ndarray
    valid: np.ndarray
    inner: np.ndarray  # bool [NY, NX]: read from N1/N2 (the «85S» set when compared)

    def pct(self) -> np.ndarray:
        """Percentage of time, float64 [2, NY, NX]; NaN where not valid."""
        p = self.sums * (100.0 * DN_SCALE / WINDOW**2)
        return np.where(self.valid, p, np.nan)


def mesh_dn_sums(products: NasaProducts, x=None, y=None) -> MeshNasa:
    """NASA values at the cell centres (or at the points ``x``, ``y``): N1/N2 inside ±151.5 km, else N3/N4."""
    if x is None:
        x, y = mesh_xy()
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    inner = (np.abs(x) <= INNER_HALF_M) & (np.abs(y) <= INNER_HALF_M)
    sums = np.zeros((len(BODIES), *x.shape), dtype=np.int64)
    valid = np.zeros((len(BODIES), *x.shape), dtype=bool)
    for k, body in enumerate(BODIES):
        for grid, where in ((products.inner[body], inner), (products.outer[body], ~inner)):
            if where.any():
                s, v = window_sums(grid, x[where], y[where])
                sums[k][where] = s
                valid[k][where] = v
    return MeshNasa(sums, valid, inner)


# ---------------------------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------------------------


def metrics(ours: np.ndarray, nasa: np.ndarray) -> dict:
    """n, Pearson r, bias = mean(ours − nasa), MAE, RMSE (points) and share with |diff| ≤ 10 points."""
    a = np.asarray(ours, dtype=np.float64).ravel()
    b = np.asarray(nasa, dtype=np.float64).ravel()
    n = int(a.size)
    if n == 0:
        return {"n": 0, "r": None, "bias_pts": None, "mae_pts": None, "rmse_pts": None, "within_10_pct": None}
    d = a - b
    sa, sb = a.std(), b.std()
    r = float(((a - a.mean()) * (b - b.mean())).mean() / (sa * sb)) if n > 1 and sa > 0 and sb > 0 else None
    return {
        "n": n,
        "r": r,
        "bias_pts": float(d.mean()),
        "mae_pts": float(np.abs(d).mean()),
        "rmse_pts": float(math.sqrt((d * d).mean())),
        "within_10_pct": float(100.0 * (np.abs(d) <= WITHIN_PTS).mean()),
    }


@dataclass
class Comparison:
    metrics: dict  # body -> set -> metrics
    ours_pct: np.ndarray  # float64 [2, NY, NX], NaN where not compared
    nasa_pct: np.ndarray  # float64 [2, NY, NX], NaN where not compared
    compared: np.ndarray  # bool [2, NY, NX]
    inner: np.ndarray  # bool [NY, NX]


def read_any_layer(layers_dir: str | Path) -> np.ndarray:
    """``mean186_any`` of a computed run as uint8 [2, NY, NX]; refuses the NASA layers of plan B."""
    layers_dir = Path(layers_dir)
    doc_path = layers_dir / "layers.json"
    if not doc_path.is_file():
        raise FileNotFoundError(f"{doc_path} does not exist: run make layers first")
    doc = json.loads(doc_path.read_text(encoding="utf-8"))
    if doc.get("source") != lay.SOURCE_COMPUTED:
        raise ValueError(f"layers.json has source {doc.get('source')!r}: these are the NASA maps themselves "
                         "(plan B), there is nothing of ours to compare")
    return lay.read_layer(layers_dir / "mean186_any.bin.gz", len(lay.ANY_BANDS))


def compare(any_units: np.ndarray, nasa: MeshNasa) -> Comparison:
    """Metrics of 08 §8.2 for Sun and Earth over the «85S» set and over every compared cell."""
    ours_ok = any_units != lay.NODATA
    ours = any_units.astype(np.float64) * lay.PCT_PER_UNIT
    theirs = nasa.pct()
    compared = ours_ok & nasa.valid
    out = {}
    for k, body in enumerate(BODIES):
        out[body] = {
            SET_85S: metrics(ours[k][compared[k] & nasa.inner], theirs[k][compared[k] & nasa.inner]),
            SET_ALL: metrics(ours[k][compared[k]], theirs[k][compared[k]]),
        }
    return Comparison(out, np.where(compared, ours, np.nan), np.where(compared, theirs, np.nan), compared,
                      nasa.inner)


# ---------------------------------------------------------------------------------------------
# Case B7 (11_validacion.md §5)
# ---------------------------------------------------------------------------------------------


def r_min() -> float:
    return float(json.loads(TOLERANCES.read_text(encoding="utf-8"))["B7_r_min"])


def _fmt(v: float | None, digits: int, signed: bool = False) -> str:
    if v is None:
        return "n/a"
    return f"{v:+.{digits}f}" if signed else f"{v:.{digits}f}"


def case_b7(comp: Comparison) -> dict:
    """Arguments of ``write_case`` for B7: pass if r > 0.9 for Sun and Earth over the «85S» set."""
    threshold = r_min()
    details, parts = [], []
    oks = []
    for body in BODIES:
        m = comp.metrics[body][SET_85S]
        a = comp.metrics[body][SET_ALL]
        name = body.capitalize()
        ok = m["r"] is not None and m["r"] > threshold
        oks.append(ok if m["n"] else None)
        details.append({"label": f"{name}, Pearson r over the 85° S maps ({m['n']} cells)",
                        "expected": f"> {threshold:g}",
                        "obtained": None if m["r"] is None else round(m["r"], 4),
                        "abs_err": None, "unit": "", "ok": ok if m["n"] else None})
        details.append({"label": f"{name}, mean |ours - NASA| over the 85° S maps",
                        "expected": None,
                        "obtained": None if m["mae_pts"] is None else round(m["mae_pts"], 2),
                        "abs_err": None, "unit": "points", "ok": None})
        parts.append(f"{name}: r = {_fmt(m['r'], 3)} over {m['n']} cells of the 85° S maps "
                     f"(bias {_fmt(m['bias_pts'], 1, True)}, mean |diff| {_fmt(m['mae_pts'], 1)} points, "
                     f"{_fmt(m['within_10_pct'], 0)} % within 10 points); r = {_fmt(a['r'], 3)} over all "
                     f"{a['n']} compared cells")
    if any(o is None for o in oks):
        status = "skipped"
    else:
        status = "pass" if all(oks) else "fail"
    note = (
        "Our 18.6-year mean with the any-part-of-the-disc criterion (one hourly step in three from "
        "2026-01-01, observer 2 m above the terrain, LOLA 40 m + 120 m terrain with data to 2017) against "
        "NASA AVGVISIB (any part of the disc, hourly, 18.6 years, ground level, LOLA 60 m terrain with data "
        "to 2013). NASA values are 3 x 3 pixel means at each 500 m cell centre: the 60 m maps (85° S, up to "
        "151.7 km from the pole) and, beyond them, the 120 m maps. The 2 m observer makes our values "
        "slightly higher."
    )
    if status == "skipped":
        note = "No computed cell over the 85° S maps yet: run make layers after the cube. " + note
    return {
        "case_id": "B7",
        "status": status,
        "expected": "Same pattern as the NASA AVGVISIB maps (Sun and Earth)",
        "obtained": "; ".join(parts),
        "tolerance": f"r > {threshold:g}",
        "source": PGDA,
        "details": details,
        "note": note,
    }


# ---------------------------------------------------------------------------------------------
# Figures (09 §7.1)
# ---------------------------------------------------------------------------------------------


def _font(size: int):
    from PIL import ImageFont

    try:
        return ImageFont.load_default(size=size)
    except (TypeError, OSError):  # Pillow without FreeType: the small bitmap font
        return ImageFont.load_default()


def _png(img, max_bytes: int = FIGURE_MAX_BYTES) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    data = buf.getvalue()
    if len(data) > max_bytes:
        raise ValueError(f"Figure of {len(data)} B, over the {max_bytes} B of 09 §7.1")
    return data


def _blend(c0, c1, t: np.ndarray) -> np.ndarray:
    """Colours [..., 3] uint8 between ``c0`` (t = 0) and ``c1`` (t = 1)."""
    t = np.clip(t, 0.0, 1.0)[..., None]
    return np.rint(np.asarray(c0, float) * (1 - t) + np.asarray(c1, float) * t).astype(np.uint8)


def scatter_png(comp: Comparison) -> bytes:
    """Two panels (Sun, Earth) of ours against NASA over the «85S» set, as a density of cells, 1:1 line."""
    from PIL import Image, ImageDraw

    w, h = SCATTER_PX
    img = Image.new("RGB", (w, h), C_BG)
    draw = ImageDraw.Draw(img)
    f_title, f_axis, f_tick = _font(20), _font(16), _font(14)
    # One bin per 0.4 % (the step of our layers), centred on the values: 251 bins of 2 px.
    n_bins = lay.UNITS_FULL + 1
    px = 2
    side = n_bins * px
    edge = [-lay.PCT_PER_UNIT / 2, 100 + lay.PCT_PER_UNIT / 2]
    for k, body in enumerate(BODIES):
        x0, y0 = k * (w // 2) + 80, 42  # top-left corner of the plot area
        sel = comp.compared[k] & comp.inner
        counts, _, _ = np.histogram2d(comp.ours_pct[k][sel], comp.nasa_pct[k][sel], bins=n_bins,
                                      range=[edge, edge])
        dens = np.zeros((n_bins, n_bins, 3), dtype=np.uint8)
        dens[:] = C_BG
        if counts.max() > 0:
            t = np.log1p(counts) / math.log1p(counts.max())
            col = _blend(tuple(c // 3 for c in C_BODY[body]), C_BODY[body], 0.25 + 0.75 * t)
            dens = np.where((counts > 0)[..., None], col, dens)
        dens = dens[::-1].repeat(px, axis=0).repeat(px, axis=1)  # 100 % at the top
        mask = (counts[::-1] > 0).repeat(px, axis=0).repeat(px, axis=1)
        for v in range(0, 101, 25):  # grid
            p = round(v / 100 * (side - 1))
            draw.line([(x0 + p, y0), (x0 + p, y0 + side - 1)], fill=C_GRID)
            draw.line([(x0, y0 + side - 1 - p), (x0 + side - 1, y0 + side - 1 - p)], fill=C_GRID)
        img.paste(Image.fromarray(dens, "RGB"), (x0, y0), Image.fromarray((mask * 255).astype(np.uint8)))
        draw.line([(x0, y0 + side - 1), (x0 + side - 1, y0)], fill=C_MUTED, width=1)  # 1:1
        draw.rectangle([x0 - 1, y0 - 1, x0 + side, y0 + side], outline=C_MUTED)
        for v in range(0, 101, 25):
            p = round(v / 100 * (side - 1))
            draw.text((x0 + p, y0 + side + 8), str(v), font=f_tick, fill=C_TEXT, anchor="mt")
            draw.text((x0 - 8, y0 + side - 1 - p), str(v), font=f_tick, fill=C_TEXT, anchor="rm")
        draw.text((x0 + side / 2, y0 + side + 30), f"NASA AVGVISIB{'' if body == 'sun' else ' Earth'} (%)",
                  font=f_axis, fill=C_TEXT, anchor="mt")
        label = Image.new("RGBA", (side, 24), (0, 0, 0, 0))
        ImageDraw.Draw(label).text((side / 2, 12), "Ours, any part of the disc (%)", font=f_axis, fill=C_TEXT,
                                   anchor="mm")
        img.paste(label.rotate(90, expand=True), (x0 - 66, y0), label.rotate(90, expand=True))
        m = comp.metrics[body][SET_85S]
        title = f"{body.capitalize()}: r = {_fmt(m['r'], 3)}, {m['n']} cells (85° S maps)"
        draw.text((x0 + side / 2, 10), title, font=f_title, fill=C_TEXT, anchor="mt")
        draw.text((x0 + 8, y0 + 8), "1:1 line", font=f_tick, fill=C_MUTED, anchor="lt")
    return _png(img)


def diff_colours(diff: np.ndarray) -> np.ndarray:
    """RGB [..., 3] of a difference in points, diverging from −30 (blue) through 0 to +30 (vermillion).

    In 13 classes of 5 points (the nearest multiple of 5, |diff| < 2.5 is the neutral class): easier to
    read than a continuous ramp, and the PNG stays within the 300 kB of 09 §7.1 (decision D-97).
    """
    step = np.floor(np.nan_to_num(diff) / DIFF_CLASS_PTS + 0.5) * DIFF_CLASS_PTS
    t = np.clip(step / DIFF_RANGE_PTS, -1.0, 1.0)
    return np.where((t < 0)[..., None], _blend(C_MID, C_NEG, -t), _blend(C_MID, C_POS, t))


def diff_map_png(comp: Comparison) -> bytes:
    """Map of ours − NASA (Sun) on the mesh, one pixel per cell; cells not compared are transparent."""
    from PIL import Image, ImageDraw

    diff = comp.ours_pct[0] - comp.nasa_pct[0]
    rgba = np.zeros((cube.NY, cube.NX, 4), dtype=np.uint8)
    rgba[..., :3] = diff_colours(diff)
    rgba[..., 3] = np.where(comp.compared[0], 255, 0)
    img = Image.fromarray(rgba, "RGBA")
    draw = ImageDraw.Draw(img)
    f = _font(13)
    # Legend in the bottom-right corner (far from the pole): ramp, ticks and the quantity.
    lx, ly, lw = cube.NX - 250, cube.NY - 62, 220
    draw.rectangle([lx - 12, ly - 26, cube.NX - 6, cube.NY - 6], fill=C_BG + (235,))
    ramp = diff_colours(np.linspace(-DIFF_RANGE_PTS, DIFF_RANGE_PTS, lw))[None, :, :].repeat(12, axis=0)
    img.paste(Image.fromarray(ramp, "RGB"), (lx, ly))
    draw.text((lx + lw / 2, ly - 20), "Sun: ours - NASA (points)", font=f, fill=C_TEXT + (255,), anchor="mt")
    for v, p in ((-30, 0), (0, lw // 2), (30, lw - 1)):
        draw.line([(lx + p, ly + 12), (lx + p, ly + 16)], fill=C_TEXT + (255,))
        draw.text((lx + p, ly + 18), f"{v:+d}" if v else "0", font=f, fill=C_TEXT + (255,), anchor="mt")
    return _png(img)


def write_figures(results_dir: str | Path, comp: Comparison) -> list[Path]:
    results_dir = Path(results_dir)
    results_dir.mkdir(parents=True, exist_ok=True)
    out = []
    for name, data in (("a7b7_scatter.png", scatter_png(comp)), ("a7b7_diff_map.png", diff_map_png(comp))):
        path = results_dir / name
        lay.write_atomic(path, data)
        out.append(path)
    return out


def summary_lines(comp: Comparison) -> list[str]:
    lines = []
    for body in BODIES:
        for name in (SET_85S, SET_ALL):
            m = comp.metrics[body][name]
            lines.append(f"{body:<5} {name:<3}: n {m['n']:>6}, r {_fmt(m['r'], 4)}, "
                         f"bias {_fmt(m['bias_pts'], 2, True)}, "
                         f"MAE {_fmt(m['mae_pts'], 2)}, RMSE {_fmt(m['rmse_pts'], 2)} points, "
                         f"{_fmt(m['within_10_pct'], 1)} % within 10 points")
    return lines
