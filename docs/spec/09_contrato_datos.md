# 09 · Contrato de datos

Todos los ficheros que produce el pipeline y consume la web. **El contrato es ley**: solo I3 lo cambia, subiendo la versión, con esquema y ejemplo actualizados antes que el código (protocolo de cambios del plan).

- Versión del contrato de esta especificación: **`1.1.0`** (fichero `contract/VERSION`). 1.1.0 (D-95): el titular `A3` de `validation_report.json` se sustituye por `A1`; el resto no cambia y los ficheros 1.0.0 siguen siendo válidos (misma versión mayor). Los ejemplos JSON de este documento conservan `1.0.0`, que es ilustrativo.
- Esquemas: `contract/schemas/<nombre>.schema.json` (JSON Schema 2020-12). Ejemplos: `contract/examples/data/…`, con la misma estructura de rutas que los datos reales.
- Regla de versiones (SemVer): cambio incompatible → mayor; campo nuevo opcional → menor; corrección de documentación → parche. La web comprueba al cargar cada fichero que la versión mayor es `1`; si no, muestra `Data format not supported by this version of the app. Reload the page.`
- Convenios de `00_indice.md` §3 en todos los ficheros: grados, km o m indicados en el nombre de la clave, UTC ISO 8601 con `Z`, longitud este en (−180, 180], MOON_ME, radio 1.737,4 km.
- Todo binario es little-endian. Los ficheros `.gz` son gzip estándar de un único miembro; la web los descomprime con `DecompressionStream('gzip')`. Las cabeceras binarias empiezan por 8 caracteres ASCII de identificación.

## 1. Dos orígenes de datos

| Origen | Clave en `config.json` | Contenido | Tamaño | Cómo se publica |
| --- | --- | --- | --- | --- |
| **Ligero** | `data_base_url` (por defecto `data`) | `manifest.json`, efemérides, sitios, máscaras, perfiles, informe de validación | < 25 MB | Va en el repositorio (`web/public/data/`) y se despliega con cada integración |
| **Pesado** | `heavy_base_url` (por defecto `data`) | Malla, capas, cubo, máscaras compactas, fondo del mapa | 0,05–0,6 GB | No va en el repositorio. Lo sube I3 con `make deploy-heavy` |

`config.json` (raíz de la web, lo escribe el despliegue): `{"data_base_url": "data", "heavy_base_url": "https://<proyecto-de-datos>.pages.dev"}`. En la copia local sin conexión, las dos claves valen `data`. La web funciona sin el origen pesado: solo quedan desactivados el mapa y el sitio óptimo, con su mensaje.

## 2. Tabla general

| Ruta | Origen | Produce | Consume | Funcionalidades | Esquema o formato |
| --- | --- | --- | --- | --- | --- |
| `manifest.json` | Ligero | `pipeline/cli publish` (I1) | `web/core/loaders` | Todas | §3.1 |
| `ephemeris.bin`, `ephemeris.meta.json` | Ligero | `pipeline/ephem` (I1) | `web/core/ephemeris`, `pipeline/vis` | F2–F13, F32 | `05_efemerides.md` §4.3 y §3.2 de aquí |
| `sites.json` | Ligero | `contract/sites.catalog.json` (A2) + `pipeline/cli sites` (I1) | Todo | F1, F10 | §4 |
| `horizon/<site_id>.json` | Ligero | `pipeline/horizon` (I1) | `web/core/horizon`, `pipeline/vis` | F3–F12, F18 | §5 |
| `profile/<site_id>.bin.gz` | Ligero | `pipeline/horizon` (I1) | `web/ui/section` | F12 | §6 |
| `validation_report.json` | Ligero | `pipeline/cli report` (I1) a partir de las pruebas | `web/ui/validation` | F9 | §7 |
| `validation/a7b7_scatter.png`, `validation/a7b7_diff_map.png` | Ligero | `pipeline/cli compare-nasa` (I1) los escribe en `data/out/test_results/`; `pipeline/cli report` los copia | `web/ui/validation` (titular `A7B7`) | F9 | §7.1 |
| `stations.json` | Ligero | A2 | `web/core` (solo F14) | F14 (P2) | §12 |
| `map/grid.json` | Pesado | `pipeline/layers` (I1) | `web/ui/map`, `web/core/grid` | F11, F32 | §8.1 |
| `map/regions.json` | Pesado | `pipeline/cli regions` (I1) desde el catálogo | `web/ui/map`, trabajador de F32 | F11, F32 | §8.2 |
| `map/hillshade_250m.png`, `map/dem_500m.bin.gz` | Pesado | `pipeline/layers/hillshade` (I1) | `web/ui/map` | F11 | §8.3 |
| `layers/layers.json`, `layers/<period>.bin.gz` | Pesado | `pipeline/layers` (I1) | `web/ui/map`, F32 modo periodo | F11, F32, F26 | §9 |
| `layers/mean186_any.bin.gz` | Pesado | `pipeline/layers` (I1) | `pipeline/layers/compare_nasa` (B7); la web no lo lee | F9 (titular `A7B7`) | §9.2 |
| `cube/cube.json`, `cube/c_<RR>_<CC>.bin.gz` | Pesado | `pipeline/horizon/cube` (I1; lo opera I3) | `pipeline/layers`, `web/core/cube` | F11 (clic), F32 | §10 |
| `compact/regions.bin.gz`, `compact/overview.bin.gz` | Pesado | `pipeline/horizon/compact` (I1) | Trabajador de F32 | F32 | §11 |

Cada fichero tiene productor y consumidor. Ningún módulo lee ficheros que no estén en esta tabla.

## 3. Manifiesto y metadatos de efemérides

### 3.1 `manifest.json`

```json
{
  "contract_version": "1.0.0",
  "generated_utc": "<instante de generación>",
  "git_commit": "<hash corto>",
  "sites": 43,
  "ephemeris": { "file": "ephemeris.bin", "bytes": 5260176, "synthetic": false },
  "has_validation_report": true
}
```

Campos obligatorios: todos. `ephemeris.synthetic = true` solo en los datos de ejemplo.

### 3.2 `ephemeris.meta.json`

```json
{
  "contract_version": "1.0.0",
  "frame": "MOON_ME",
  "frame_spice": "MOON_ME_DE440_ME421",
  "center": "MOON",
  "abcorr": "LT+S",
  "units": "km",
  "dtype": "float32",
  "byte_order": "little",
  "record_fields": ["sun_x", "sun_y", "sun_z", "earth_x", "earth_y", "earth_z"],
  "record_bytes": 24,
  "step_s": 3600,
  "interpolation": "lagrange4",
  "segments": [
    { "id": "main",   "t0_utc": "2023-12-31T23:00:00Z", "t0_unix": 1704063600, "n": 184107, "byte_offset": 0,
      "valid_from_utc": "2024-01-01T00:00:00Z", "valid_to_utc": "2045-01-01T00:00:00Z" },
    { "id": "apollo", "t0_utc": "1968-12-31T23:00:00Z", "t0_unix": -31539600, "n": 35067, "byte_offset": 4418568,
      "valid_from_utc": "1969-01-01T00:00:00Z", "valid_to_utc": "1973-01-01T00:00:00Z" }
  ],
  "kernels": ["naif0012.tls", "de440.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"],
  "constants": { "r_moon_km": 1737.4, "r_sun_km": 695700.0, "r_earth_km": 6378.137 },
  "synthetic": false
}
```

Formato binario: `05_efemerides.md` §4.3. Tamaño: 5.260.176 B.

## 4. `sites.json`

```json
{
  "contract_version": "1.0.0",
  "defaults": {
    "demo_pair": ["demo-a", "demo-b"],
    "demo_landing_utc": "2027-08-01T00:00:00Z",
    "demo_mission_days": 14
  },
  "sites": [
    {
      "id": "blue-ghost-1",
      "name": "Blue Ghost Mission 1",
      "short_name": "Blue Ghost 1",
      "type": "landing",
      "lat_deg": 18.562,
      "lon_deg": 61.81,
      "height_m": -3760.5,
      "mission": "Blue Ghost Mission 1",
      "operator": "Firefly Aerospace (NASA CLPS)",
      "landing_utc": "2025-03-02T08:34:00Z",
      "landing_date": "2025-03-02",
      "relief": "sldem2015",
      "relief_label": "SLDEM2015 59 m",
      "has_mask": true,
      "has_profile": true,
      "observer_heights_m": [2, 10],
      "replan_candidate": false,
      "region_id": null,
      "source": { "label": "NSSDCA, Table of Anthropogenic Impacts and Spacecraft on the Moon",
                  "url": "https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html" },
      "note": ""
    }
  ]
}
```

| Campo | Tipo | Obligatorio | Valores |
| --- | --- | --- | --- |
| `id` | string | Sí | `^[a-z0-9]+(-[a-z0-9]+)*$`, único |
| `name`, `short_name` | string | Sí | `short_name` ≤ 18 caracteres |
| `type` | string | Sí | `landing`, `candidate_region`, `validation`, `demo` |
| `lat_deg`, `lon_deg` | number | Sí | [−90, 90], (−180, 180] |
| `height_m` | number \| null | Sí | Cota del DEM en el sitio; `null` si `relief = smooth`. La rellena el pipeline |
| `mission`, `operator` | string \| null | Sí | — |
| `landing_utc` | string \| null | Sí | Fecha y hora reales del alunizaje, si la hora tiene fuente |
| `landing_date` | string \| null | Sí | Fecha del alunizaje (`YYYY-MM-DD`) según la fuente; `null` si no es un alunizaje |
| `relief` | string | Sí | `lola_polar`, `lola_60s`, `sldem2015`, `smooth` |
| `relief_label` | string | Sí | Uno de los cinco textos de `03_datos_y_fuentes.md` §7 |
| `has_mask`, `has_profile` | boolean | Sí | Los rellena el pipeline |
| `observer_heights_m` | number[] | Sí | Subconjunto de `[2, 10]` |
| `replan_candidate` | boolean | Sí | Entra en el ranking de F10 |
| `region_id` | string \| null | Sí | Id de `map/regions.json` si el sitio representa una región |
| `source` | `{label, url}` | Sí | Fuente de las coordenadas |
| `note` | string | Sí | Texto libre en inglés (puede ser vacío) |

`defaults.demo_*` fija lo que muestra la primera pantalla. El valor de `demo_landing_utc` del ejemplo es provisional: lo confirma A1 en el caso A11 (`04_catalogo_sitios.md` §5).

El fichero de origen que mantiene A2 es `contract/sites.catalog.json` (mismos campos menos `height_m`, `relief_label`, `has_mask`, `has_profile`, que añade `python -m pipeline.cli sites`). El valor de `height_m` del ejemplo es ilustrativo.

## 5. `horizon/<site_id>.json`

```json
{
  "contract_version": "1.0.0",
  "site_id": "blue-ghost-1",
  "lat_deg": 18.562,
  "lon_deg": 61.81,
  "site_height_m": -3760.5,
  "relief": "sldem2015",
  "relief_label": "SLDEM2015 59 m",
  "dem_stack": ["SLDEM2015_512_00N_30N_045_090_FLOAT"],
  "az_step_deg": 0.5,
  "n_az": 720,
  "law": "full",
  "max_dist_m": 299878,
  "masks": [
    {
      "observer_height_m": 2,
      "el_deg":       [0.9012, 0.8977, "… 720 valores"],
      "dist_m":       [41230, 41230, "…"],
      "blk_lat_deg":  [19.92141, 19.92135, "…"],
      "blk_lon_deg":  [61.81, 61.82259, "…"],
      "blk_height_m": [-2710.4, -2712.9, "…"]
    },
    { "observer_height_m": 10, "el_deg": ["…"], "dist_m": ["…"], "blk_lat_deg": ["…"], "blk_lon_deg": ["…"], "blk_height_m": ["…"] }
  ],
  "smooth_el_deg": { "2": -0.0869, "10": -0.1944 },
  "stats": {
    "truncated_az": 0, "min_truncation_dist_m": null, "nodata_samples": 0, "empty_az": 0,
    "grid_usage": { "SLDEM2015_512_00N_30N_045_090_FLOAT": 1.0 },
    "min_el_deg": -0.21, "max_el_deg": 2.87, "warning": null
  },
  "profile": { "file": "profile/blue-ghost-1.bin.gz", "n_bins": 512, "observer_height_m": 2 }
}
```

- El elemento `j` de cada vector corresponde al acimut `0,5·j` grados (j = 0 es el norte). Los cinco vectores tienen exactamente 720 números (los `"…"` del ejemplo no son válidos en un fichero real).
- Precisión escrita: `el_deg` 4 decimales, `dist_m` entero, latitud y longitud 5 decimales, `blk_height_m` 1 decimal.
- `masks[0]` es siempre la de 2 m. La de 10 m es opcional.
- `smooth_el_deg`: −acos(R/(R+h)) en grados para cada altura (2 m: −0,0869°; 10 m: acos(1.737.400/1.737.410) = 3,3929·10⁻³ rad = −0,1944°).
- Con `relief = smooth` el fichero puede no existir: la web genera la máscara lisa (`06_horizonte.md` §9).
- Tamaño: ~35 kB por altura de observador. Los valores numéricos del ejemplo son ilustrativos.

## 6. `profile/<site_id>.bin.gz`

Tras descomprimir, 737.312 B:

| Desplazamiento | Tamaño | Tipo | Campo | Valor |
| --- | --- | --- | --- | --- |
| 0 | 8 | ASCII | Identificación | `LLSNPRF1` |
| 8 | 2 | uint16 | Versión mayor del contrato | 1 |
| 10 | 2 | uint16 | Versión menor | 0 |
| 12 | 2 | uint16 | `n_az` | 720 |
| 14 | 2 | uint16 | `n_bins` | 512 |
| 16 | 2 | uint16 | `law_id` | 1 = `full`, 2 = `fast` |
| 18 | 2 | uint16 | `n_samples` de la ley | 3709 o 1855 |
| 20 | 4 | float32 | `site_height_m` | — |
| 24 | 4 | float32 | `observer_height_m` | 2.0 |
| 28 | 4 | — | Reservado | 0 |
| 32 | 737.280 | int16[720][512] | `height_m` por acimut e intervalo | −32768 = sin dato |

El valor `[j][b]` es la cota, en metros enteros, de la muestra de mayor elevación del intervalo `b` en el acimut `0,5·j`. La distancia de dibujo del intervalo es `profile_bin_distance(law, b)` (`06_horizonte.md` §8). Comprimido ocupa unos 0,2–0,4 MB.

## 7. `validation_report.json`

```json
{
  "contract_version": "1.0.0",
  "generated_utc": "<instante de generación>",
  "git_commit": "<hash corto>",
  "summary": { "total": 22, "passed": 15, "failed": 0, "manual": 4, "skipped": 3,
               "horizons_comparisons": 256, "horizons_max_abs_err_deg": 0.00004 },
  "headline": [
    {
      "id": "B3",
      "title": "Total solar eclipse seen by Blue Ghost 1 (14 March 2025)",
      "rows": [
        { "label": "Eclipse starts",  "predicted": "05:01 UTC", "observed": "05:00 UTC", "ok": true },
        { "label": "Totality starts", "predicted": "06:17 UTC", "observed": "06:18 UTC", "ok": true },
        { "label": "Totality ends",   "predicted": "08:34 UTC", "observed": "08:34 UTC", "ok": true },
        { "label": "Eclipse ends",    "predicted": "09:51 UTC", "observed": "09:52 UTC", "ok": true }
      ],
      "tolerance": "5 min",
      "source": { "label": "Firefly Aerospace, Blue Ghost Mission 1 updates", "url": "https://fireflyspace.com/?p=3379" },
      "note": "Firefly gives the times as CST; they match UTC-5 (CDT).",
      "status": "pass"
    }
  ],
  "cases": [
    {
      "id": "A1",
      "group": "A",
      "title": "Sun and Earth azimuth and elevation vs JPL Horizons",
      "status": "pass",
      "expected": "JPL Horizons, observer on the lunar surface",
      "obtained": "max |error| 0.00004 deg over 256 comparisons",
      "tolerance": "0.02 deg",
      "source": { "label": "JPL Horizons", "url": "https://ssd.jpl.nasa.gov/horizons/" },
      "details": [ { "label": "apollo-11 sun el 2025-03-14T06:00Z", "expected": 12.345678, "obtained": 12.345671, "abs_err": 0.000007, "unit": "deg", "ok": true } ],
      "note": ""
    }
  ]
}
```

- `status` ∈ `pass`, `fail`, `manual` (lo firma una persona), `skipped` (no ejecutado, con motivo en `note`).
- `headline` contiene, por este orden, `A1`, `B3` y `A7B7` (las tres comprobaciones frente a una fuente independiente que abren la página; D-95, que retira `A3`). `A1` tiene como filas las posiciones del Sol y de la Tierra en Blue Ghost 1 el 2025-03-14 a las 06:00 UTC (nuestro valor frente a Horizons) y en la nota el número de valores y la diferencia máxima. Un `headline` con `status = "skipped"` se muestra como `Pending`; el de `A7B7`, antes de la corrida de la noche, lleva la nota `Computed tonight: …`.
- Lo genera `python -m pipeline.cli report` a partir de `data/out/test_results/*.json`, que escriben las pruebas (`11_validacion.md` §7.1). No se edita a mano. Los valores numéricos del ejemplo son ilustrativos.

### 7.1 Figuras de la validación

Cada elemento de `headline` admite un campo opcional `"figures": [{"file": "validation/a7b7_scatter.png", "alt": "<texto alternativo en inglés>"}]`, con la ruta relativa a `data_base_url`. Solo el titular `A7B7` lo usa, con dos figuras:

| Ruta | Contenido | Formato |
| --- | --- | --- |
| `validation/a7b7_scatter.png` | Dispersión `ours_pct` frente a `nasa_pct` del conjunto «85S», un panel para el Sol y otro para la Tierra, con la recta 1:1 y r en el rótulo | PNG RGB, 1.200 × 600 px, ≤ 300 kB |
| `validation/a7b7_diff_map.png` | Mapa de `ours − nasa` (banda del Sol) sobre la malla, escala divergente de −30 a +30 puntos, celdas sin comparar transparentes | PNG RGBA, 752 × 672 px, ≤ 300 kB |

`compare-nasa` las escribe en `data/out/test_results/` (`08_mapa_polar.md` §8.2) y `report` las copia a `web/public/data/validation/` y las cita en el titular. Si no existen, el titular no lleva `figures` y la página omite las figuras. El esquema `validation_report.schema.json` declara `figures` como opcional (array de objetos con `file` y `alt` obligatorios).

## 8. Malla y fondo del mapa (origen pesado)

### 8.1 `map/grid.json`

```json
{
  "contract_version": "1.0.0",
  "projection": "polar_stereographic_south",
  "radius_m": 1737400,
  "cell_m": 500,
  "nx": 752, "ny": 672,
  "x_min_m": -200000, "y_max_m": 184000,
  "chunk": 16, "n_chunk_cols": 47, "n_chunk_rows": 42
}
```

Celda (i, j), i = 0…751 de izquierda a derecha, j = 0…671 de arriba abajo. Centro: `x = x_min_m + (i + 0,5)·cell_m`, `y = y_max_m − (j + 0,5)·cell_m`. Paso a latitud y longitud: `03_datos_y_fuentes.md` §3.1. Trozo de la celda: `chunk_col = floor(i/16)`, `chunk_row = floor(j/16)`; posición dentro del trozo: `c = i mod 16`, `r = j mod 16`.

### 8.2 `map/regions.json`

```json
{
  "contract_version": "1.0.0",
  "regions": [
    { "id": "haworth", "name": "Haworth", "lat_deg": -86.8, "lon_deg": -22.8,
      "x_m": -37610, "y_m": 89480, "size_km": 17,
      "box_m": [-46110, 80980, -29110, 97980],
      "site_id": "region-haworth", "status": "candidate_2024",
      "source": { "label": "NASA (2024); centre via USGS record 671a6fa8d34efed5620f89f8", "url": "https://www.nasanow.org/artemis" } }
  ]
}
```

`box_m = [x0, y0, x1, y1]` con x0 < x1, y0 < y1, en metros del mapa. Tabla completa en `04_catalogo_sitios.md` §3.

### 8.3 Fondo

- `map/hillshade_250m.png`: PNG de 8 bits en gris, 1.504 × 1.344 px (250 m/px), que cubre exactamente la malla. Sombreado con luz desde arriba a la izquierda (acimut de mapa 315°, altura 30°, exageración vertical 2).
- `map/dem_500m.bin.gz`: `int16[672][752]`, cota en metros en el centro de cada celda (remuestreo bilineal de P2); −32768 = sin dato. Sin cabecera (1.010.688 B sin comprimir).

## 9. Capas (origen pesado)

### 9.1 `layers/layers.json`

```json
{
  "contract_version": "1.0.0",
  "source": "computed",
  "criterion": "center",
  "observer_height_m": 2,
  "time_step_s": 3600,
  "encoding": { "dtype": "uint8", "pct_per_unit": 0.4, "nodata": 255, "bands": ["sun", "earth", "both"], "layout": "band,row,col" },
  "periods": [
    { "id": "mean186", "label": "18.6-year mean", "start_utc": "2026-01-01T00:00:00Z", "end_utc": "2044-08-12T00:00:00Z",
      "n_steps": 163152, "file": "layers/mean186.bin.gz" },
    { "id": "2026-01", "label": "Jan 2026", "start_utc": "2026-01-01T00:00:00Z", "end_utc": "2026-02-01T00:00:00Z",
      "n_steps": 744, "file": "layers/2026-01.bin.gz" }
  ],
  "validation": { "file": "layers/mean186_any.bin.gz", "bands": ["sun_any", "earth_any"], "criterion": "any", "observer_height_m": 2 },
  "coverage": { "computed_points": 505344, "total_points": 505344 }
}
```

- `periods`: `mean186` y los 60 meses `2026-01` … `2030-12` (61 entradas).
- `source`: `computed` (nuestro cubo) o `nasa_avgvisib` (plan B: capas de la NASA remuestreadas a la malla; en ese caso solo existe `mean186`, sin banda `both`, que va toda a 255, y la interfaz lo rotula).
- Opcional (P2): `"longest_night": { "file_pattern": "layers/night_<period>.bin.gz", "hours_per_unit": 4 }`.

### 9.2 `layers/<period>.bin.gz`

Sin cabecera. Tras descomprimir: `uint8[3][672][752]` = 1.516.032 B, banda a banda en el orden de `encoding.bands`, cada banda fila a fila desde j = 0. Valor `v`: porcentaje de pasos del periodo que cumplen la condición = `v × 0,4` (v = 0…250); `255` = celda sin calcular. Codificación: `v = round(pct / 0,4)`.

`layers/mean186_any.bin.gz`: igual con 2 bandas (1.010.688 B).

## 10. Cubo de horizontes (origen pesado)

### 10.1 `cube/cube.json`

```json
{
  "contract_version": "1.0.0",
  "grid": "map/grid.json",
  "law": "full",
  "observer_height_m": 2,
  "dem_stack": ["LDEM_80S_40M", "LDEM_75S_120M"],
  "el_scale_deg": 0.01,
  "dist_code": { "base_m": 20, "ratio": 1.04 },
  "chunks_done": 1974,
  "chunks_total": 1974,
  "done": "cube/done.bin"
}
```

`cube/done.bin`: `uint8[42][47]`, 1 si el trozo está publicado. La web lo descarga una vez para saber si un clic tiene datos.

### 10.2 `cube/c_<RR>_<CC>.bin.gz`

`RR` = `chunk_row` y `CC` = `chunk_col` con dos dígitos (`c_07_31.bin.gz`). Tras descomprimir, 553.504 B:

| Desplazamiento | Tamaño | Tipo | Campo |
| --- | --- | --- | --- |
| 0 | 8 | ASCII | `LLSNCUB1` |
| 8 | 2 | uint16 | Versión mayor del contrato (1) |
| 10 | 2 | uint16 | Versión menor (0) |
| 12 | 2 | uint16 | `chunk_row` |
| 14 | 2 | uint16 | `chunk_col` |
| 16 | 2 | uint16 | `n_side` = 16 |
| 18 | 2 | uint16 | `n_az` = 720 |
| 20 | 2 | uint16 | `law_id` (1 = `full`, 2 = `fast`) |
| 22 | 2 | uint16 | Altura del observador en cm (200) |
| 24 | 4 | float32 | `el_scale_deg` = 0,01 |
| 28 | 4 | uint32 | Número de puntos calculados (0…256) |
| 32 | 512 | int16[256] | `height_m`: cota del terreno en cada punto; −32768 = punto sin calcular |
| 544 | 368.640 | int16[256][720] | `el_delta`: elevación del horizonte en diferencias |
| 369.184 | 184.320 | uint8[256][720] | `dist_code`: distancia al punto que bloquea |

- Índice del punto dentro del trozo: `p = 16·r + c`.
- Elevación: `q[j] = clamp(round(el_deg[j] / 0,01), −32767, 32767)`. Se guarda `el_delta[0] = q[0]` y `el_delta[j] = q[j] − q[j−1]` con aritmética de `int16` (con desbordamiento cíclico). Decodificación: suma acumulada en `Int16Array`; `el_deg[j] = q[j] × 0,01`.
- Distancia: `code = clamp(round(ln(dist_m / 20) / ln 1,04), 0, 255)`; `dist_m = 20 × 1,04^code` (precisión ±2 %; 300 km → código 245).
- Un punto sin calcular tiene `height_m = −32768` y ceros en lo demás.
- Las coordenadas del punto que bloquea no se guardan: la web las obtiene avanzando `dist_m` desde el punto en el acimut `0,5·j` (`06_horizonte.md` §4.1).

## 11. Máscaras compactas (origen pesado)

`compact/regions.bin.gz` (puntos de la malla dentro de las cajas de las 9 regiones; 10.252 puntos con las cajas de `04_catalogo_sitios.md` §3) y, opcional, `compact/overview.bin.gz` (un punto de cada 4 en cada dirección: 188 × 168 = 31.584 puntos). Mismo formato:

| Desplazamiento | Tamaño | Tipo | Campo |
| --- | --- | --- | --- |
| 0 | 8 | ASCII | `LLSNCMP1` |
| 8 | 2 + 2 | uint16 ×2 | Versión mayor y menor del contrato |
| 12 | 4 | uint32 | `n_points` |
| 16 | 2 | uint16 | `n_az` = 180 |
| 18 | 2 | uint16 | Paso de acimut en centésimas de grado (200) |
| 20 | 4 | float32 | `el_scale_deg` = 0,01 |
| 24 | 2 | uint16 | `law_id` |
| 26 | 6 | — | Reservado (0) |
| 32 | 2·n | uint16[n] | `i` (columna de la malla) |
| 32 + 2n | 2·n | uint16[n] | `j` (fila de la malla) |
| 32 + 4n | 2·n | int16[n] | `height_m` |
| 32 + 6n | n | uint8[n] | Índice de región (posición en `map/regions.json`; 255 = ninguna) |
| 32 + 7n | n | uint8[n] | Reservado (0) |
| 32 + 8n | 360·n | int16[n][180] | `el_q` compacta, sin diferencias |

`el_q[b] = max(q[(4b + m) mod 720] para m = −2…2)`: el máximo de la máscara completa en la ventana de ±1° alrededor del acimut `2·b` grados. Es un horizonte **conservador** (nunca más bajo que el real). Tamaño de `regions`: 32 + 8·10.252 + 360·10.252 = 3.772.768 B sin comprimir.

## 12. `stations.json` (solo con F14, P2)

```json
{ "contract_version": "1.0.0",
  "stations": [ { "id": "madrid", "name": "Madrid Deep Space Communications Complex",
                  "lat_deg": null, "lon_deg": null, "height_m": null, "min_elevation_deg": null,
                  "source": { "label": "", "url": "" } } ] }
```

Coordenadas y máscara de elevación de las estaciones: PENDIENTE DE VERIFICAR (A2). El fichero no existe hasta que F14 entre.

## 13. Datos de ejemplo para arrancar en paralelo

`contract/examples/data/` contiene un juego completo y pequeño que cumple el contrato, generado por la tarea T-02 sin SPICE ni DEM:

| Fichero | Contenido sintético |
| --- | --- |
| `ephemeris.bin` + meta | Mismo formato y tamaño. Sol: vector de 1,496·10⁸ km que gira en el plano XY con periodo de 29,53 días y una oscilación de ±1,54° en Z con periodo de 346,6 días. Tierra: 384.400 km en la dirección (lon, lat) = (7,9°·sin(2πt/27,55 d), 6,7°·sin(2πt/27,21 d)). `synthetic: true` |
| `sites.json` | Cuatro sitios: `demo-a` (−88,8°, 123,4°), `demo-b` (−89,67°, 129,78°), `blue-ghost-1`, `apollo-11` |
| `horizon/*.json` | Máscaras de fórmula: `demo-a`: 0,4° + 0,6°·sin(3·az); `demo-b`: 12° + 3°·sin(2·az); los otros dos: `smooth` |
| `profile/demo-a.bin.gz` | Perfil coherente con su máscara (terreno en rampa) |
| `validation_report.json` | Tres titulares y cuatro casos de muestra |
| `map/…`, `layers/…`, `cube/…`, `compact/…` | Malla real; capas con un degradado; 4 trozos del cubo con máscaras de fórmula; 64 puntos compactos |

Con ellos I2 construye toda la interfaz desde el primer minuto. Al llegar los datos reales solo cambian los ficheros, no el código. La web muestra una banda `Example data — not for use` cuando `manifest.ephemeris.synthetic` es `true`.

## 14. Esquemas JSON (resumen normativo)

Cada esquema declara `"$schema": "https://json-schema.org/draft/2020-12/schema"`, `"additionalProperties": false` en el objeto raíz y `"contract_version": {"type": "string", "pattern": "^1\\.\\d+\\.\\d+$"}`. Restricciones que deben figurar:

| Esquema | Restricciones clave |
| --- | --- |
| `manifest.schema.json` | Todos los campos del §3.1 obligatorios; `ephemeris.bytes` = 5260176 |
| `ephemeris_meta.schema.json` | `frame` const `MOON_ME`; `abcorr` const `LT+S`; `record_bytes` const 24; `step_s` const 3600; `segments` con `minItems: 1` y campos obligatorios `id`, `t0_unix`, `n`, `byte_offset` |
| `sites.schema.json` | Tabla del §4; `type` y `relief` como `enum`; `lat_deg` en [−90, 90]; `lon_deg` con `exclusiveMinimum: -180`, `maximum: 180`; `id` con `pattern` |
| `horizon.schema.json` | `n_az` const 720; `az_step_deg` const 0.5; cada vector con `minItems = maxItems = 720` e `items: number`; `masks` con `minItems: 1`, `maxItems: 2`; `el_deg` en [−90, 90]; `dist_m` ≥ 0 |
| `validation_report.schema.json` | `status` enum; `headline` con `maxItems: 3` y `figures` opcional (§7.1); `cases[].id` con `pattern: ^[AB][0-9]{1,2}$` |
| `grid.schema.json` | Constantes del §8.1 |
| `regions.schema.json` | `regions` con 9 a 13 elementos; `box_m` con 4 números |
| `layers.schema.json` | `source` y `criterion` enum; `periods[].id` con `pattern: ^(mean186|20(2[6-9]|30)-(0[1-9]|1[0-2]))$` |
| `cube.schema.json` | `law` enum; `el_scale_deg` const 0.01 |
| `stations.schema.json` | §12 |

Los binarios se validan con `python -m pipeline.cli check-contract <dir>` (tamaños, cabeceras e intervalos de valores) y, en la web, con comprobaciones de tamaño y de cabecera al cargar. `make test` valida todos los JSON de `contract/examples/data/` y de `web/public/data/` contra sus esquemas.
