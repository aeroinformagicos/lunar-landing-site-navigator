<!-- AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos -->
# Constantes

Cada constante del código, con su valor, unidad, fuente y fichero donde se usa. Ninguna constante sin
fuente (CLAUDE.md §2).

| Constante | Valor | Unidad | Fuente | Dónde |
| --- | --- | --- | --- | --- |
| Tamaño de `naif0012.tls` | 5.257 | B | `03_datos_y_fuentes.md` §10.1, fila 1 | `pipeline/tests/conftest.py`, `ci.yml` |
| Tamaño de `de440.bsp` | 119.799.808 | B | `03_datos_y_fuentes.md` §10.1, fila 2 | Ídem |
| Tamaño de `moon_pa_de440_200625.bpc` | 12.863.488 | B | `03_datos_y_fuentes.md` §10.1, fila 3 | Ídem |
| Tamaño de `moon_de440_250416.tf` | 19.478 | B | `03_datos_y_fuentes.md` §10.1, fila 4 | Ídem |
| Límite por fichero versionado | 10 MB | B | `02_arquitectura.md` §5 | `pipeline/tests/test_repo_rules.py` |
| `R_MOON_KM`, `R_MOON_M` | 1737,4; 1.737.400 | km; m | `A_AXIS_RADIUS` de las etiquetas LOLA y SLDEM2015 (`00_indice.md` §3) | `pipeline/common/constants.py` |
| `VALID_HEIGHT_ABS_MAX_M` (filtro de valor inválido) | 20.000 | m | `03_datos_y_fuentes.md` §3.3 | `pipeline/dem/grids.py` |
| Tesela SLDEM2015: 512 ppd, 30° × 45°, 15.360 × 23.040 píxeles, 92.160 B por fila, 1.415.577.600 B | — | — | Etiquetas SLDEM2015 (`03` §5.1) | `pipeline/dem/crop.py` |
| `SLDEM_BASE_URL` | `https://imbrium.mit.edu/DATA/SLDEM2015/TILES/FLOAT_IMG` | — | `03` §10.1 (prefijo `SLDEM`) | `pipeline/dem/crop.py` |
| Ventana del recorte: `CROP_HALF_LAT_DEG`, `CROP_DELTA_DEG`, `CROP_LON_MARGIN_DEG` | 10,0; 9,893; 0,1 | ° | `03` §5.2 y §5.3 (δ = 300/1737,4 rad) | `pipeline/dem/crop.py` |
| Codificación del recorte: `CROP_UNITS_PER_KM`, `CROP_SCALING_M` | 2000; 0,5 | 1/km; m | `03` §5.3 | `pipeline/dem/crop.py` |
| `P1_HALF_SIDE_M`, `P2_HALF_SIDE_M` (medio lado N·S/2) | 304.000; 457.440 | m | `03` §3.1, tabla de cobertura | `pipeline/dem/stack.py` |
| `MAX_DIST_M` (alcance de los rayos, para decidir si entra P3) | 300.000 | m | `06_horizonte.md` §2 | `pipeline/dem/stack.py` |
| Shackleton, centro (pruebas) | −89,67; 129,78 | ° | Gazetteer of Planetary Nomenclature, ficha 5450 (`03` §4.4) | `pipeline/tests/test_dem_read.py`, `test_grids.py` |
| SLIM, sitio y cota publicada (prueba) | −13,3160; 25,2510; −912 | °; °; m | LROC, «JAXA SLIM Landing» (`03` §5.4) | `pipeline/tests/test_dem_read.py` |

## Valores medidos

Medidos al ejecutar cada tarjeta en el portátil de I1 (Windows 11, SSD) con los ficheros de `$LLSN_DATA_DIR`.

### T-07 · Lectura de los DEM (2026-11-13, `pytest -m data -s`)

| Qué | Valor medido | Esperado | Fuente del esperado |
| --- | --- | --- | --- |
| P1 `LDEM_80S_40M`: mínimo y máximo | −14593 / 14054 DN (−7.296,5 / +7.027,0 m) | Iguales | Etiqueta (`03` §4.1) |
| P2 `LDEM_75S_120M`: mínimo y máximo | −15526 / 14050 DN (−7.763,0 / +7.025,0 m) | Iguales | Etiqueta |
| P3 `LDEM_60S_120M`: mínimo y máximo | −18255 / 14050 DN (−9.127,5 / +7.025,0 m) | Iguales | Etiqueta |
| \|P1 − P2\| en 1.000 puntos al azar (\|x\|, \|y\| < 150 km, semilla 20261114) | Mediana 0,84 m; percentil 95: 3,11 m; máximo 13,4 m | Mediana < 5 m | `03` §4.3 |
| Shackleton: cota interpolada en el centro (P1) | −2.788,9 m | — | — |
| Shackleton: cota máxima a menos de 12 km del centro (borde) | +1.737,0 m | — | — |
| Shackleton: profundidad (borde máximo − centro) | 4.525,9 m | Entre 3.500 y 4.700 m | `03` §4.4; Zuber et al. (2012) dan 4,1 ± 0,05 km de media |
| Shackleton: punto espejo (−89,67°, −129,78°) | +672,2 m, 3.461 m por encima del centro | ≥ 2.000 m por encima | `03` §4.4 (orientación: el eje x no está invertido) |
| SLIM: cota interpolada en el recorte SLDEM2015 | −912,5 m | −912 m ± 50 m | LROC (`03` §5.4) |
| Blue Ghost 1: cota interpolada en el recorte | −3.652,4 m | — | La comprueba A2 en QGIS (`04` §7) |
| Blue Ghost 1: recorte | 10.241 × 10.796 píxeles, 221.123.672 B; mínimo −5.564,0 m, máximo +2.569,0 m | Dentro de −5.567 … +3.360 m | Etiqueta de la tesela (`03` §5.2) |
| Chandrayaan-3: cota interpolada en P3 | +528,4 m | — | — |
| Costura entre teselas SLDEM2015 (media del salto en valor absoluto) | 5,20 m en 45° E (`00N_30N_000_045` con `045_090`); 4,61 m en el ecuador (`00N_30N` con `30S_00S`, columna `000_045`) | < 20 m | `03` §5.4 |
| Construir un recorte desde la tesela local | 3,3–3,5 s | 10–20 s | `03` §12 |
| Abrir P1 + P2 con `memmap` | < 0,01 s | < 0,1 s | `03` §12 |
| Cargar P1 + P2 enteros en RAM | 0,2 s (con los ficheros ya en la caché del sistema) | 2–5 s | `03` §12 |
| Muestreo bilineal en NumPy (`bench-sampler`, 2·10⁶ muestras, un núcleo) | 9,0·10⁶ muestras/s solo la interpolación en memoria; 6,4·10⁶ muestras/s con la proyección y la pila P1 + P2 (rayos desde el polo) | ~2·10⁷ muestras/s | `03` §12 (estimación de diseño) |

El muestreo medido es un tercio de la estimación de diseño. Una máscara de sitio son 2,67·10⁶ muestras,
unos 0,4–0,5 s de muestreo: dentro de los 1–5 s previstos en `06_horizonte.md` §11.
